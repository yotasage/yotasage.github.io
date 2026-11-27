// Complete figures-of-merit metrics & diagnostics engine (metrics.md §1–§5).
// Computes tone detection, folded harmonics, bin sets, SNR, SNDR, THD, THD+N, SFDR,
// ENOB, noise floor/NSD/ASD, integrated noise, in-band/OSR, IMD2/IMD3/OIP3/IIP3,
// interleaving spurs, jitter upper bound, Walden/Schreier FoMs, and diagnostics C1–C12.

import { zoomFftCzt } from '../dsp/fft';
import {
  buildSpectrumView,
  computeWelchSpectrum,
  computeWindowedSpectrum,
  type RawSpectrum,
} from '../dsp/spectrum';
import { DEFAULT_WINDOW_PARAMS, generateWindow } from '../dsp/windows';
import { analyseTimeGrid, resampleSignal } from '../data/timegrid';
import { buildSignalSamples } from '../data/parsers';
import { buildDiagnosticsChecks, buildMetricsList, formatSi } from './report';
import type {
  AnalysisResult,
  BinSets,
  Conventions,
  HarmonicInfo,
  ImToneInfo,
  InterleaveSpur,
  ParsedDataset,
  ResampleReport,
  ResolvedWindowKind,
  Setup,
  SignalDef,
  SignalStats,
  SignalUnit,
  SpurInfo,
  ToneInfo,
} from '../types';

export { formatSi };

const EPS_POWER = 1e-300;
const TWO_PI = 2 * Math.PI;

export const DEFAULT_CONVENTIONS: Conventions = {
  harmonicsCount: 10,
  snrExcludesHarmonics: true,
  thdNegativeDb: true,
  enobFsCorrection: true,
  noiseBinCompensation: false,
  coherenceTol: 1e-3,
  refImpedanceOhm: 50,
  dcBinsOverride: null,
  signalBinsOverride: null,
};

export function createDefaultSetup(overrides?: Partial<Setup>): Setup {
  return {
    fs: 100e6,
    start: 0,
    n: 8192,
    window: 'auto',
    windowParams: { ...DEFAULT_WINDOW_PARAMS },
    estimator: 'dft',
    welchSegments: 4,
    welchOverlap: 0.5,
    welchDetrend: 'mean',
    cztF1: null,
    cztF2: null,
    cztPoints: 512,
    fullScale: 2.0,
    bits: 12,
    f0Hint: null,
    band: null,
    inputGain: 1,
    powerWatts: null,
    interleaveChannels: 1,
    twoToneMode: false,
    resampleMethod: 'cubic',
    resampleFs: null,
    conventions: { ...DEFAULT_CONVENTIONS },
    ...overrides,
  };
}

/** Greatest common divisor of two positive integers. */
export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Folds a frequency f into [0, fs/2] and returns its Nyquist zone (1-based). */
export function foldFrequency(f: number, fs: number): { folded: number; zone: number } {
  if (fs <= 0) return { folded: 0, zone: 1 };
  const af = Math.abs(f);
  const nyq = fs / 2;
  const zone = Math.floor(af / nyq) + 1;
  const rem = af % fs;
  const folded = rem <= nyq ? rem : fs - rem;
  return { folded, zone };
}

/** Computes quadratic log-magnitude peak refinement around bin k for general windows. */
function refinePeakBin(power: Float64Array, k: number): number {
  if (k <= 1 || k >= power.length - 2) return k;
  const y0 = Math.log(Math.max(EPS_POWER, power[k - 1]));
  const y1 = Math.log(Math.max(EPS_POWER, power[k]));
  const y2 = Math.log(Math.max(EPS_POWER, power[k + 1]));
  const denom = y0 - 2 * y1 + y2;
  if (Math.abs(denom) < 1e-15) return k;
  const delta = 0.5 * ((y0 - y2) / denom);
  if (!Number.isFinite(delta) || Math.abs(delta) > 0.55) return k;
  return k + delta;
}

/** Exact Grandke (1983) 2-bin amplitude interpolation for the periodic Hann window. */
function refinePeakBinHann(power: Float64Array, k: number): number {
  if (k <= 1 || k >= power.length - 2) return k;
  const m0 = Math.sqrt(Math.max(EPS_POWER, power[k]));
  const mPrev = Math.sqrt(Math.max(EPS_POWER, power[k - 1]));
  const mNext = Math.sqrt(Math.max(EPS_POWER, power[k + 1]));
  if (m0 <= 0) return k;
  const delta =
    mNext >= mPrev
      ? (2 * (mNext / m0) - 1) / (mNext / m0 + 1)
      : -(2 * (mPrev / m0) - 1) / (mPrev / m0 + 1);
  if (!Number.isFinite(delta) || Math.abs(delta) > 0.55) return k;
  return k + delta;
}

/** Computes integer-cycle coherence for a tone at refinedBin over n samples. */
function checkCoherence(refinedBin: number, n: number, tol: number) {
  const mRounded = Math.round(refinedBin);
  const isIntegerCycles = mRounded >= 1 && Math.abs(refinedBin - mRounded) <= tol;
  const isCoprime = mRounded >= 1 && gcd(mRounded, n) === 1;
  return {
    cycles: refinedBin,
    isIntegerCycles,
    isCoprime,
    isCoherent: isIntegerCycles && isCoprime,
  };
}

/** Sums power[k] over [start, end] clipped to valid bins. */
function sumPowerRange(power: Float64Array, start: number, end: number): number {
  const lo = Math.max(0, start);
  const hi = Math.min(power.length - 1, end);
  let acc = 0;
  for (let k = lo; k <= hi; k++) acc += power[k];
  return acc;
}

/**
 * Decimates a time-domain signal to at most ~2000 points for responsive plotting.
 */
function buildTimePlotData(
  fullT: Float64Array,
  fullY: Float64Array,
  fullCm: Float64Array | null,
  startIdx: number,
  n: number,
) {
  const len = fullY.length;
  const activeStartT = fullT[Math.min(len - 1, Math.max(0, startIdx))] ?? 0;
  const activeEndT = fullT[Math.min(len - 1, Math.max(0, startIdx + n - 1))] ?? 0;

  const maxPts = 1800;
  if (len <= maxPts) {
    return {
      t: fullT,
      y: fullY,
      cm: fullCm,
      activeStartT,
      activeEndT,
      fullCount: len,
    };
  }

  // Min-max envelope decimation across buckets so high-frequency waveform shape stays accurate
  const buckets = Math.floor(maxPts / 2);
  const outT = new Float64Array(buckets * 2);
  const outY = new Float64Array(buckets * 2);
  const outCm = fullCm ? new Float64Array(buckets * 2) : null;
  for (let b = 0; b < buckets; b++) {
    const lo = Math.floor((b * len) / buckets);
    const hi = Math.max(lo + 1, Math.floor(((b + 1) * len) / buckets));
    let minIdx = lo;
    let maxIdx = lo;
    for (let i = lo + 1; i < hi; i++) {
      if (fullY[i] < fullY[minIdx]) minIdx = i;
      if (fullY[i] > fullY[maxIdx]) maxIdx = i;
    }
    const first = Math.min(minIdx, maxIdx);
    const second = Math.max(minIdx, maxIdx);
    outT[2 * b] = fullT[first];
    outY[2 * b] = fullY[first];
    outT[2 * b + 1] = fullT[second];
    outY[2 * b + 1] = fullY[second];
    if (outCm && fullCm) {
      outCm[2 * b] = fullCm[first];
      outCm[2 * b + 1] = fullCm[second];
    }
  }

  return { t: outT, y: outY, cm: outCm, activeStartT, activeEndT, fullCount: len };
}

/**
 * Main entry point: runs time-grid check, optional resampling, window auto-selection,
 * FFT/Welch/CZT spectrum estimation, full figures-of-merit calculation, and diagnostics C1–C12.
 */
export function runAnalysis(input: {
  datasetName: string;
  signalLabel: string;
  unit: SignalUnit;
  time: Float64Array | null;
  samples: Float64Array;
  cmMonitor: Float64Array | null;
  setup: Setup;
}): AnalysisResult {
  const tStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const { datasetName, signalLabel, unit, setup } = input;
  const conv = setup.conventions;

  // 1. Time grid & optional resampling
  const timeGrid = analyseTimeGrid(input.time);
  let activeSamplesFull = input.samples;
  let activeTimeFull = input.time;
  let activeCmFull = input.cmMonitor;
  let fs = setup.fs > 0 ? setup.fs : (timeGrid.fs ?? 1);
  let resampleReport: ResampleReport | null = null;

  if (timeGrid.kind === 'nonuniform' && input.time) {
    const targetFs =
      setup.resampleFs && setup.resampleFs > 0 ? setup.resampleFs : (timeGrid.fs ?? fs);
    const res = resampleSignal(input.time, input.samples, setup.resampleMethod, targetFs);
    activeTimeFull = res.tUniform;
    activeSamplesFull = res.yUniform;
    resampleReport = res.report;
    fs = targetFs;
    if (input.cmMonitor) {
      activeCmFull = resampleSignal(
        input.time,
        input.cmMonitor,
        setup.resampleMethod,
        targetFs,
      ).yUniform;
    }
  } else if (!activeTimeFull) {
    const synthT = new Float64Array(activeSamplesFull.length);
    for (let i = 0; i < synthT.length; i++) synthT[i] = i / fs;
    activeTimeFull = synthT;
  }

  // 2. Slice record [start, start + n)
  const totalAvailable = activeSamplesFull.length;
  const start = Math.max(0, Math.min(Math.max(0, totalAvailable - 2), Math.floor(setup.start)));
  const n = Math.max(4, Math.min(totalAvailable - start, Math.floor(setup.n)));
  const record = activeSamplesFull.subarray(start, start + n);

  // 3. Time-domain statistics & NaN/Inf scan (C12)
  let nonFiniteCount = 0;
  let sum = 0;
  let sumSq = 0;
  let min = Infinity;
  let max = -Infinity;
  const cleanRecord = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const v = record[i];
    if (!Number.isFinite(v)) {
      nonFiniteCount++;
      cleanRecord[i] = 0;
      continue;
    }
    cleanRecord[i] = v;
    sum += v;
    sumSq += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const validCount = Math.max(1, n - nonFiniteCount);
  const mean = sum / validCount;
  const rms = Math.sqrt(sumSq / validCount);
  const acRms = Math.sqrt(Math.max(0, sumSq / validCount - mean * mean));
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;
  const peakToPeak = max - min;

  // Clipping check: when fullScale is known, flag samples at/above the full-scale rail;
  // otherwise flag consecutive flat-topped samples stuck at the record min/max extreme.
  const railEps = Math.max(1e-12, peakToPeak * 1e-6);
  let clippedCount = 0;
  const fsHalf = setup.fullScale && setup.fullScale > 0 ? setup.fullScale / 2 : null;
  for (let i = 0; i < n; i++) {
    const v = cleanRecord[i];
    if (fsHalf !== null) {
      if (Math.abs(v - mean) >= fsHalf * (1 - 1e-4)) clippedCount++;
    } else if (peakToPeak > 0 && i > 0) {
      const prev = cleanRecord[i - 1];
      const bothMax = Math.abs(v - max) <= railEps && Math.abs(prev - max) <= railEps;
      const bothMin = Math.abs(v - min) <= railEps && Math.abs(prev - min) <= railEps;
      if (bothMax || bothMin) clippedCount++;
    }
  }
  const clippedPercent = (100 * clippedCount) / n;

  // 4. Auto window selection: probe with Hann to detect fundamental coherence if setup.window === 'auto'
  // Also retain Hann probe when resolvedWindow is rectangular so sub-bin refinement is immune to noise-floor asymmetry.
  let resolvedWindow: ResolvedWindowKind;
  let hannProbe: RawSpectrum | null = null;
  if (setup.window === 'auto') {
    hannProbe = computeWindowedSpectrum(cleanRecord, fs, 'hann', setup.windowParams);
    let probePeakBin = 3;
    let probePeakVal = -1;
    const probeEnd = hannProbe.power.length - 2;
    if (setup.f0Hint && setup.f0Hint > 0 && setup.f0Hint < fs / 2) {
      probePeakBin = Math.max(1, Math.min(probeEnd, Math.round((setup.f0Hint * n) / fs)));
    } else {
      for (let k = 3; k <= probeEnd; k++) {
        if (hannProbe.power[k] > probePeakVal) {
          probePeakVal = hannProbe.power[k];
          probePeakBin = k;
        }
      }
    }
    const probeRefined = refinePeakBinHann(hannProbe.power, probePeakBin);
    const probeCoh = checkCoherence(probeRefined, n, conv.coherenceTol);
    resolvedWindow = probeCoh.isCoherent && setup.estimator === 'dft' ? 'rectangular' : 'blackman-harris';
  } else {
    resolvedWindow = setup.window;
  }

  // 5. Compute spectrum (DFT or Welch)
  let raw: RawSpectrum;
  if (setup.estimator === 'welch') {
    raw = computeWelchSpectrum(
      cleanRecord,
      fs,
      resolvedWindow,
      setup.windowParams,
      setup.welchSegments,
      setup.welchOverlap,
      setup.welchDetrend,
    );
  } else {
    raw = computeWindowedSpectrum(cleanRecord, fs, resolvedWindow, setup.windowParams);
  }

  const binsLen = raw.power.length;
  const effN = Math.round(fs / raw.df);
  const pfs = setup.fullScale !== null && setup.fullScale > 0 ? (setup.fullScale * setup.fullScale) / 8 : null;

  // 6. Determine band bounds and DC / signal half-widths
  const bandStartBin =
    setup.band && setup.band[0] > 0
      ? Math.max(0, Math.min(binsLen - 1, Math.floor(setup.band[0] / raw.df)))
      : 0;
  const bandEndBin =
    setup.band && setup.band[1] > 0
      ? Math.max(bandStartBin + 1, Math.min(binsLen - 1, Math.ceil(setup.band[1] / raw.df)))
      : binsLen - 1;

  const nominalHalf = raw.windowMetrics.mainLobeHalfWidth;
  // Initial DC exclusion for peak search
  const searchDcEnd = conv.dcBinsOverride ?? nominalHalf;

  // 7. Fundamental tone detection
  let k0 = Math.max(searchDcEnd + 1, bandStartBin + 1);
  if (setup.f0Hint && setup.f0Hint > 0 && setup.f0Hint < fs / 2) {
    const hintBin = Math.round(setup.f0Hint / raw.df);
    // Search within ±2 bins of hint to lock onto the actual peak
    let bestBin = Math.max(1, Math.min(binsLen - 1, hintBin));
    let bestVal = raw.power[bestBin];
    for (let k = Math.max(1, hintBin - 2); k <= Math.min(binsLen - 1, hintBin + 2); k++) {
      if (raw.power[k] > bestVal) {
        bestVal = raw.power[k];
        bestBin = k;
      }
    }
    k0 = bestBin;
  } else {
    let bestVal = -1;
    const searchStart = Math.max(searchDcEnd + 1, bandStartBin);
    for (let k = searchStart; k <= bandEndBin; k++) {
      if (raw.power[k] > bestVal) {
        bestVal = raw.power[k];
        k0 = k;
      }
    }
  }

  // For rectangular window, refine peak via exact Grandke Hann interpolation so random noise bins next to a coherent peak cannot invent fake frequency drift.
  let refinedBin: number;
  if (resolvedWindow === 'hann') {
    refinedBin = refinePeakBinHann(raw.power, k0);
  } else if (resolvedWindow === 'rectangular' && setup.estimator !== 'welch') {
    const hp = hannProbe ?? computeWindowedSpectrum(cleanRecord, fs, 'hann', setup.windowParams);
    refinedBin = refinePeakBinHann(hp.power, k0);
  } else {
    refinedBin = refinePeakBin(raw.power, k0);
  }
  const coh = checkCoherence(refinedBin, effN, conv.coherenceTol);
  const sigHalf =
    conv.signalBinsOverride !== null
      ? conv.signalBinsOverride
      : resolvedWindow === 'rectangular' && coh.isCoherent
        ? 0
        : nominalHalf;
  const dcEnd =
    conv.dcBinsOverride !== null
      ? conv.dcBinsOverride
      : resolvedWindow === 'rectangular' && coh.isCoherent
        ? 0
        : nominalHalf;

  const sigStart = Math.max(1, k0 - sigHalf);
  const sigEnd = Math.min(binsLen - 1, k0 + sigHalf);
  const pSig = Math.max(EPS_POWER, sumPowerRange(raw.power, sigStart, sigEnd));
  const peakAmp = Math.sqrt(2 * pSig);
  const rmsAmp = Math.sqrt(pSig);
  const rRef = conv.refImpedanceOhm > 0 ? conv.refImpedanceOhm : 50;

  const tone: ToneInfo = {
    bin: k0,
    freqHz: k0 * raw.df,
    refinedFreqHz: setup.f0Hint && setup.f0Hint > 0 ? setup.f0Hint : refinedBin * raw.df,
    cycles: coh.cycles,
    isIntegerCycles: coh.isIntegerCycles,
    isCoprime: coh.isCoprime,
    isCoherent: coh.isCoherent,
    power: pSig,
    peakAmplitude: peakAmp,
    rmsAmplitude: rmsAmp,
    dbfs: pfs !== null ? 10 * Math.log10(pSig / pfs) : null,
    dbv: 10 * Math.log10(pSig),
    dbm: 10 * Math.log10(pSig / rRef) + 30,
    freqErrBins: Math.abs(refinedBin - k0),
  };

  // 8. Bin ownership map: 0 = excluded/out-of-band, 1 = noise, 2 = DC, 3 = signal, 4 = harmonic, 5 = second tone
  const binClass = new Uint8Array(binsLen);
  for (let k = bandStartBin; k <= bandEndBin; k++) binClass[k] = 1;
  for (let k = 0; k <= Math.min(dcEnd, binsLen - 1); k++) binClass[k] = 2;
  for (let k = sigStart; k <= sigEnd; k++) binClass[k] = 3;

  // Optional second tone detection (for two-tone IMD mode)
  let secondTone: ToneInfo | null = null;
  if (setup.twoToneMode) {
    let k2 = -1;
    let best2 = -1;
    for (let k = Math.max(dcEnd + 1, bandStartBin); k <= bandEndBin; k++) {
      if (binClass[k] !== 1) continue;
      if (raw.power[k] > best2) {
        best2 = raw.power[k];
        k2 = k;
      }
    }
    if (k2 > 0) {
      const s2Start = Math.max(1, k2 - sigHalf);
      const s2End = Math.min(binsLen - 1, k2 + sigHalf);
      const pSig2 = Math.max(EPS_POWER, sumPowerRange(raw.power, s2Start, s2End));
      const ref2 = refinePeakBin(raw.power, k2);
      const coh2 = checkCoherence(ref2, effN, conv.coherenceTol);
      secondTone = {
        bin: k2,
        freqHz: k2 * raw.df,
        refinedFreqHz: ref2 * raw.df,
        cycles: coh2.cycles,
        isIntegerCycles: coh2.isIntegerCycles,
        isCoprime: coh2.isCoprime,
        isCoherent: coh2.isCoherent,
        power: pSig2,
        peakAmplitude: Math.sqrt(2 * pSig2),
        rmsAmplitude: Math.sqrt(pSig2),
        dbfs: pfs !== null ? 10 * Math.log10(pSig2 / pfs) : null,
        dbv: 10 * Math.log10(pSig2),
        dbm: 10 * Math.log10(pSig2 / rRef) + 30,
        freqErrBins: Math.abs(ref2 - k2),
      };
      for (let k = s2Start; k <= s2End; k++) binClass[k] = 5;
    }
  }

  // 9. Harmonics 2..H with exact Nyquist folding & overlap tracking (C5)
  const harmonicsCount = Math.max(2, Math.min(50, Math.floor(conv.harmonicsCount)));
  const harmonics: HarmonicInfo[] = [];
  const harmonicBins: { order: number; start: number; end: number }[] = [];
  let pThd = 0;
  let harmonicOverlapCount = 0;
  const f0ForHarm = tone.refinedFreqHz;

  for (let h = 2; h <= harmonicsCount; h++) {
    const idealFreqHz = h * f0ForHarm;
    const { folded, zone } = foldFrequency(idealFreqHz, fs);
    const hb = Math.max(0, Math.min(binsLen - 1, Math.round(folded / raw.df)));
    const hStart = Math.max(0, hb - sigHalf);
    const hEnd = Math.min(binsLen - 1, hb + sigHalf);

    // Only count harmonics inside the active analysis band (metrics.md M-INB)
    const inBand = hb >= bandStartBin && hb <= bandEndBin;

    let overlappedWith: string | null = null;
    let hPow = 0;
    for (let k = hStart; k <= hEnd; k++) {
      if (binClass[k] === 2) {
        overlappedWith = overlappedWith ?? 'DC';
      } else if (binClass[k] === 3) {
        overlappedWith = overlappedWith ?? 'Fundamental';
      } else if (binClass[k] === 4) {
        overlappedWith = overlappedWith ?? 'Earlier harmonic';
      } else if (binClass[k] === 5) {
        overlappedWith = overlappedWith ?? 'Tone 2';
      } else if (inBand && binClass[k] === 1) {
        hPow += raw.power[k];
        binClass[k] = 4;
      }
    }

    if (overlappedWith) harmonicOverlapCount++;
    if (inBand) {
      pThd += hPow;
      harmonicBins.push({ order: h, start: hStart, end: hEnd });
    }

    const hPowSafe = Math.max(EPS_POWER, hPow);
    harmonics.push({
      order: h,
      idealFreqHz,
      foldedFreqHz: folded,
      nyquistZone: zone,
      bin: hb,
      power: hPow,
      dbc: 10 * Math.log10(hPowSafe / pSig),
      dbfs: pfs !== null ? 10 * Math.log10(hPowSafe / pfs) : null,
      overlappedWith,
    });
  }

  // 10. Noise power & SNDR / SNR / THD / ENOB accounting
  let pNoiseRaw = 0;
  let noiseBinCount = 0;
  const totalBandBins = Math.max(1, bandEndBin - Math.max(bandStartBin, dcEnd + 1) + 1);
  const noiseMask = new Uint8Array(binsLen);

  for (let k = bandStartBin; k <= bandEndBin; k++) {
    if (binClass[k] === 1) {
      pNoiseRaw += raw.power[k];
      noiseBinCount++;
      noiseMask[k] = 1;
    }
  }

  // Optional noise-bin compensation scales excluded-bin noise proportionally
  const noiseScale =
    conv.noiseBinCompensation && noiseBinCount > 0 ? totalBandBins / noiseBinCount : 1;
  const pNoiseExclHarm = Math.max(EPS_POWER, pNoiseRaw * noiseScale);
  const pNoisePlusDist = Math.max(EPS_POWER, pNoiseExclHarm + pThd);
  const pNoiseForSnr = conv.snrExcludesHarmonics ? pNoiseExclHarm : pNoisePlusDist;

  const snrDb = 10 * Math.log10(pSig / pNoiseForSnr);
  const sndrDb = 10 * Math.log10(pSig / pNoisePlusDist);
  const thdRawDb = 10 * Math.log10(Math.max(EPS_POWER, pThd) / pSig);
  const thdDb = conv.thdNegativeDb ? thdRawDb : -thdRawDb;
  const thdPercent = 100 * Math.sqrt(Math.max(0, pThd) / pSig);
  const thdnDb = 10 * Math.log10(pNoisePlusDist / pSig);

  const fsCorrectionDb =
    conv.enobFsCorrection && setup.fullScale !== null && setup.fullScale > 0 && peakAmp > 0
      ? 20 * Math.log10(setup.fullScale / (2 * peakAmp))
      : 0;
  const enob = (sndrDb - 1.7609125905568124 + fsCorrectionDb) / 6.020599913279624;

  // 11. Build SpectrumView now that noiseMask is finalized
  const spectrum = buildSpectrumView(
    raw,
    setup.fullScale,
    setup.bits,
    conv.refImpedanceOhm,
    noiseMask,
    setup.inputGain,
  );

  // 12. Spur finder (local maxima outside DC & fundamental, summed over ±sigHalf)
  const harmonicByBin = new Map<number, number>();
  for (const h of harmonics) {
    for (let k = Math.max(0, h.bin - sigHalf); k <= Math.min(binsLen - 1, h.bin + sigHalf); k++) {
      if (!harmonicByBin.has(k)) harmonicByBin.set(k, h.order);
    }
  }

  const spurs: SpurInfo[] = [];
  for (let k = Math.max(dcEnd + 1, bandStartBin + 1); k <= Math.min(binsLen - 2, bandEndBin - 1); k++) {
    if (binClass[k] === 2 || binClass[k] === 3 || binClass[k] === 5) continue;
    if (raw.power[k] >= raw.power[k - 1] && raw.power[k] >= raw.power[k + 1]) {
      // Sum ±sigHalf avoiding DC/signal
      let spPow = 0;
      for (let j = Math.max(dcEnd + 1, k - sigHalf); j <= Math.min(binsLen - 1, k + sigHalf); j++) {
        if (binClass[j] !== 2 && binClass[j] !== 3 && binClass[j] !== 5) spPow += raw.power[j];
      }
      const hOrder = harmonicByBin.get(k) ?? null;
      const spSafe = Math.max(EPS_POWER, spPow);
      spurs.push({
        bin: k,
        freqHz: k * raw.df,
        power: spPow,
        dbc: 10 * Math.log10(spSafe / pSig),
        dbfs: pfs !== null ? 10 * Math.log10(spSafe / pfs) : null,
        isHarmonic: hOrder !== null,
        harmonicOrder: hOrder,
        label: hOrder !== null ? `H${hOrder}` : 'Spur',
      });
    }
  }

  spurs.sort((a, b) => b.power - a.power);
  // Deduplicate adjacent spurs within 2*sigHalf+1
  const topSpurs: SpurInfo[] = [];
  for (const sp of spurs) {
    if (topSpurs.some((kept) => Math.abs(kept.bin - sp.bin) <= Math.max(2, sigHalf * 2))) continue;
    topSpurs.push(sp);
    if (topSpurs.length >= 12) break;
  }

  const worstSpur = topSpurs[0] ?? null;
  const worstNonHarmonicSpur = topSpurs.find((s) => !s.isHarmonic) ?? null;
  const sfdrDbc = worstSpur ? 10 * Math.log10(pSig / Math.max(EPS_POWER, worstSpur.power)) : 0;
  const sfdrDbfs =
    worstSpur && pfs !== null ? 10 * Math.log10(pfs / Math.max(EPS_POWER, worstSpur.power)) : null;

  // 13. Two-tone IMD2 / IMD3 / OIP3 / IIP3
  const imTones: ImToneInfo[] = [];
  let imd3Dbc: number | null = null;
  let imd2Dbc: number | null = null;
  let oip3Dbm: number | null = null;
  let iip3Dbm: number | null = null;

  if (setup.twoToneMode && secondTone) {
    const f1 = Math.min(tone.refinedFreqHz, secondTone.refinedFreqHz);
    const f2 = Math.max(tone.refinedFreqHz, secondTone.refinedFreqHz);
    const refTonePow = Math.min(tone.power, secondTone.power);
    const refToneDbm = 10 * Math.log10(refTonePow / rRef) + 30;
    const imSpecs: Array<{ label: string; order: 2 | 3; f: number }> = [
      { label: 'f2 − f1', order: 2, f: f2 - f1 },
      { label: 'f1 + f2', order: 2, f: f1 + f2 },
      { label: '2f1 − f2', order: 3, f: 2 * f1 - f2 },
      { label: '2f2 − f1', order: 3, f: 2 * f2 - f1 },
    ];
    let worstIm2 = -Infinity;
    let worstIm3 = -Infinity;

    for (const spec of imSpecs) {
      const { folded } = foldFrequency(spec.f, fs);
      const bin = Math.max(1, Math.min(binsLen - 1, Math.round(folded / raw.df)));
      const p = Math.max(EPS_POWER, sumPowerRange(raw.power, bin - sigHalf, bin + sigHalf));
      const dbc = 10 * Math.log10(p / refTonePow);
      imTones.push({ label: spec.label, order: spec.order, freqHz: folded, bin, dbc });
      if (spec.order === 2 && dbc > worstIm2) worstIm2 = dbc;
      if (spec.order === 3 && dbc > worstIm3) worstIm3 = dbc;
    }

    if (Number.isFinite(worstIm2)) imd2Dbc = worstIm2;
    if (Number.isFinite(worstIm3)) {
      imd3Dbc = worstIm3;
      oip3Dbm = refToneDbm + -worstIm3 / 2;
      const gainDb = setup.inputGain > 0 ? 20 * Math.log10(setup.inputGain) : 0;
      iip3Dbm = oip3Dbm - gainDb;
    }
  }

  // 14. Interleaving spurs (for M_ch > 1)
  const interleaveSpurs: InterleaveSpur[] = [];
  const mCh = Math.max(1, Math.min(32, Math.floor(setup.interleaveChannels)));
  if (mCh > 1) {
    const seenBins = new Set<number>();
    for (let k = 1; k < mCh; k++) {
      const fOff = (k * fs) / mCh;
      const candidates: Array<{ kind: 'offset' | 'gain-timing'; f: number }> = [
        { kind: 'offset', f: fOff },
        { kind: 'gain-timing', f: Math.abs(fOff - tone.refinedFreqHz) },
        { kind: 'gain-timing', f: fOff + tone.refinedFreqHz },
      ];
      for (const cand of candidates) {
        const { folded } = foldFrequency(cand.f, fs);
        const bin = Math.max(1, Math.min(binsLen - 1, Math.round(folded / raw.df)));
        if (bin <= dcEnd || Math.abs(bin - k0) <= sigHalf || seenBins.has(bin)) continue;
        seenBins.add(bin);
        const p = Math.max(EPS_POWER, sumPowerRange(raw.power, bin - sigHalf, bin + sigHalf));
        interleaveSpurs.push({
          kind: cand.kind,
          channelHarmonic: k,
          freqHz: folded,
          bin,
          dbc: 10 * Math.log10(p / pSig),
          dbfs: pfs !== null ? 10 * Math.log10(p / pfs) : null,
        });
      }
    }
    interleaveSpurs.sort((a, b) => b.dbc - a.dbc);
  }

  // 15. Noise floor, NSD, ASD, Integrated Noise, OSR, Jitter, Walden & Schreier FoM
  const bwHz =
    setup.band && setup.band[1] > setup.band[0] ? setup.band[1] - setup.band[0] : fs / 2;
  const osr = bwHz > 0 ? fs / (2 * bwHz) : 1;
  const intNoiseRms = Math.sqrt(pNoiseExclHarm) / (setup.inputGain > 0 ? setup.inputGain : 1);
  const meanNoiseDensityV2Hz =
    noiseBinCount > 0 ? pNoiseRaw / (noiseBinCount * Math.max(1e-30, raw.df)) : EPS_POWER;
  const meanAsd = Math.sqrt(meanNoiseDensityV2Hz) / (setup.inputGain > 0 ? setup.inputGain : 1);
  const nsdDbfsHz =
    spectrum.meanNoiseBinDbfs !== null
      ? spectrum.meanNoiseBinDbfs - 10 * Math.log10(Math.max(1e-30, raw.df))
      : null;

  // Equivalent upper-bound RMS jitter if all noise were sampling clock jitter:
  // SNR = -20 log10(2*pi*f0*sigma_t) => sigma_t = 10^(-SNR/20) / (2*pi*f0)
  const equivJitterSec =
    tone.refinedFreqHz > 0 ? Math.pow(10, -snrDb / 20) / (TWO_PI * tone.refinedFreqHz) : null;

  // Walden & Schreier FoM (when powerWatts is provided)
  const pW = setup.powerWatts && setup.powerWatts > 0 ? setup.powerWatts : null;
  const fomWalden =
    pW !== null && bwHz > 0 ? pW / (Math.pow(2, enob) * (2 * bwHz)) : null;
  const fomSchreier =
    pW !== null && bwHz > 0 ? sndrDb + 10 * Math.log10(bwHz / pW) : null;

  // 16. Diagnostics C1–C12 (metrics.md §5)
  const checks = buildDiagnosticsChecks({
    tone,
    resolvedWindow,
    windowMetrics: raw.windowMetrics,
    sigStart,
    sigEnd,
    dcEnd,
    binsLen,
    k0,
    clippedPercent,
    clippedCount,
    fsHalf,
    max,
    min,
    mean,
    peakAmp,
    unit,
    resampleReport,
    sndrDb,
    fs,
    harmonicOverlapCount,
    harmonicsCount,
    sigHalf,
    parsevalRelError: raw.parsevalRelError,
    spectrum,
    setup,
    worstSpur,
    fsCorrectionDb,
    nonFiniteCount,
    timeGrid,
  });

  // 17. Assemble grouped MetricValue[] with formulas, conventions, and citation keys
  const metrics = buildMetricsList({
    unit,
    setup,
    conv,
    tone,
    secondTone,
    k0,
    sigHalf,
    bwHz,
    osr,
    n,
    df: raw.df,
    noiseBinCount,
    sndrDb,
    enob,
    fsCorrectionDb,
    snrDb,
    thdnDb,
    pNoisePlusDist,
    pSig,
    harmonicsCount,
    thdDb,
    thdPercent,
    harmonics,
    sfdrDbc,
    sfdrDbfs,
    worstSpur,
    worstNonHarmonicSpur,
    spectrum,
    nsdDbfsHz,
    meanAsd,
    intNoiseRms,
    equivJitterSec,
    mean,
    peakToPeak,
    acRms,
    clippedPercent,
    imd3Dbc,
    imd2Dbc,
    oip3Dbm,
    iip3Dbm,
    rRef,
    mCh,
    interleaveSpurs,
    fomWalden,
    fomSchreier,
    pW,
  });

  // 18. Optional Zoom FFT (CZT) view around fundamental or user range
  let cztView: { freqs: Float64Array; db: Float64Array } | undefined;
  if (setup.estimator === 'czt') {
    const f1 =
      setup.cztF1 !== null && setup.cztF1 >= 0
        ? setup.cztF1
        : Math.max(0, tone.refinedFreqHz - 25 * raw.df);
    const f2 =
      setup.cztF2 !== null && setup.cztF2 > f1
        ? Math.min(fs / 2, setup.cztF2)
        : Math.min(fs / 2, tone.refinedFreqHz + 25 * raw.df);
    const w = generateWindow(resolvedWindow, n, setup.windowParams);
    const windowed = new Float64Array(n);
    for (let i = 0; i < n; i++) windowed[i] = cleanRecord[i] * w[i];
    const czt = zoomFftCzt(windowed, fs, f1, f2, setup.cztPoints);
    const denom = n * (raw.windowMetrics.s2 || 1);
    const db = new Float64Array(czt.freqs.length);
    for (let i = 0; i < czt.freqs.length; i++) {
      const magSq = czt.re[i] * czt.re[i] + czt.im[i] * czt.im[i];
      const pk = Math.max(EPS_POWER, (2 * magSq) / denom);
      db[i] = pfs !== null ? 10 * Math.log10(pk / pfs) : 10 * Math.log10(pk);
    }
    cztView = { freqs: czt.freqs, db };
  }

  const stats: SignalStats = {
    count: n,
    mean,
    rms,
    acRms,
    min,
    max,
    peakToPeak,
    crestFactorDb: acRms > 0 ? 20 * Math.log10(Math.max(Math.abs(max - mean), Math.abs(min - mean)) / acRms) : 0,
    clippedCount,
    clippedPercent,
    nonFiniteCount,
    parsevalRelError: raw.parsevalRelError,
  };

  const bins: BinSets = {
    dcEnd,
    signalBins: [sigStart, sigEnd],
    bandStartBin,
    bandEndBin,
    harmonicBins,
    noiseBinCount,
    totalBandBins,
  };

  const timePlot = buildTimePlotData(activeTimeFull, activeSamplesFull, activeCmFull, start, n);
  const tEndMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    datasetName,
    signalLabel,
    unit,
    setup: { ...setup, fs, start, n },
    resolvedWindow,
    windowMetrics: raw.windowMetrics,
    timeGrid,
    resample: resampleReport,
    tone,
    secondTone,
    bins,
    harmonics,
    worstSpur,
    worstNonHarmonicSpur,
    topSpurs,
    imTones,
    interleaveSpurs,
    stats,
    metrics,
    checks,
    spectrum,
    timePlot,
    cztView,
    computeMs: Math.max(0.1, tEndMs - tStartMs),
  };
}

/** Convenience wrapper that extracts the active signal from a ParsedDataset and runs analysis. */
export function analyzeDataset(
  dataset: ParsedDataset,
  signal: SignalDef,
  setup: Setup,
): AnalysisResult {
  const built = buildSignalSamples(dataset, signal);
  return runAnalysis({
    datasetName: dataset.name,
    signalLabel: built.label,
    unit: signal.unit,
    time: built.time,
    samples: built.samples,
    cmMonitor: built.cmMonitor,
    setup,
  });
}
