// Spectrum normalization (decision D5), Welch/Bartlett periodogram averaging,
// and unit conversions (dBFS, dBV, dBm, ASD, NSD).

import type { ResolvedWindowKind, SpectrumView, WindowMetrics, WindowParams } from '../types';
import { fftReal } from './fft';
import { computeWindowMetrics, generateWindow } from './windows';

const EPS_POWER = 1e-300;

export interface RawSpectrum {
  freqs: Float64Array;
  power: Float64Array; // P[k] in unit^2 (rms), one-sided
  df: number;
  nyquist: number;
  timeDomainMeanSq: number;
  parsevalRelError: number;
  windowMetrics: WindowMetrics;
  segmentsUsed: number;
}

/**
 * Computes the one-sided per-bin power spectrum P[k]:
 *   P[k] = 2 |X[k]|^2 / (N * S2)   for 0 < k < N/2
 *   P[0] = |X[0]|^2 / (N * S2)
 *   P[N/2] = |X[N/2]|^2 / (N * S2) (when N is even)
 * where S2 = sum(w[n]^2).
 */
export function computeWindowedSpectrum(
  samples: Float64Array,
  fs: number,
  windowKind: ResolvedWindowKind,
  windowParams: WindowParams,
): RawSpectrum {
  const n = samples.length;
  const w = generateWindow(windowKind, n, windowParams);
  const windowMetrics = computeWindowMetrics(windowKind, n, windowParams, w);

  const windowed = new Float64Array(n);
  let weightedSumSq = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i] * w[i];
    windowed[i] = v;
    weightedSumSq += v * v;
  }

  const { re, im } = fftReal(windowed);
  const bins = re.length;
  const freqs = new Float64Array(bins);
  const power = new Float64Array(bins);
  const df = fs / n;
  const denom = n * (windowMetrics.s2 || 1);
  const isEven = n % 2 === 0;

  let powerSum = 0;
  for (let k = 0; k < bins; k++) {
    freqs[k] = k * df;
    const magSq = re[k] * re[k] + im[k] * im[k];
    const factor = k === 0 || (isEven && k === bins - 1) ? 1 : 2;
    const pk = (factor * magSq) / denom;
    power[k] = pk;
    powerSum += pk;
  }

  // Exact Parseval check: sum(P[k]) == sum((x[n]*w[n])^2) / S2
  const expectedSum = windowMetrics.s2 > 0 ? weightedSumSq / windowMetrics.s2 : 0;
  const parsevalRelError =
    expectedSum > 1e-30 ? Math.abs(powerSum - expectedSum) / expectedSum : 0;

  return {
    freqs,
    power,
    df,
    nyquist: fs / 2,
    timeDomainMeanSq: expectedSum,
    parsevalRelError,
    windowMetrics,
    segmentsUsed: 1,
  };
}

/**
 * Welch / Bartlett averaged periodogram estimator.
 * Splits record into overlapping segments, optionally detrends each segment,
 * computes per-bin P[k] with identical D5 normalization, and averages power linearly.
 */
export function computeWelchSpectrum(
  samples: Float64Array,
  fs: number,
  windowKind: ResolvedWindowKind,
  windowParams: WindowParams,
  numSegments: number,
  overlapFraction: number,
  detrend: 'none' | 'mean' | 'linear',
): RawSpectrum {
  const nTotal = samples.length;
  const segCount = Math.max(1, Math.min(64, Math.floor(numSegments)));
  const overlap = Math.max(0, Math.min(0.85, overlapFraction));
  // Solve for segment length L such that segCount segments with overlap cover nTotal:
  // L + (segCount - 1) * L * (1 - overlap) <= nTotal
  const rawSegLen = Math.floor(nTotal / (1 + (segCount - 1) * (1 - overlap)));
  const segLen = Math.max(16, Math.min(nTotal, rawSegLen));
  const hop = Math.max(1, Math.round(segLen * (1 - overlap)));

  const w = generateWindow(windowKind, segLen, windowParams);
  const windowMetrics = computeWindowMetrics(windowKind, segLen, windowParams, w);

  const bins = Math.floor(segLen / 2) + 1;
  const avgPower = new Float64Array(bins);
  const segBuf = new Float64Array(segLen);
  const denom = segLen * (windowMetrics.s2 || 1);
  const isEven = segLen % 2 === 0;

  let actualSegments = 0;
  let expectedSumAvg = 0;

  for (let start = 0; start + segLen <= nTotal; start += hop) {
    if (detrend === 'mean') {
      let mean = 0;
      for (let i = 0; i < segLen; i++) mean += samples[start + i];
      mean /= segLen;
      for (let i = 0; i < segLen; i++) segBuf[i] = (samples[start + i] - mean) * w[i];
    } else if (detrend === 'linear') {
      let sumX = 0;
      let sumY = 0;
      let sumXX = 0;
      let sumXY = 0;
      for (let i = 0; i < segLen; i++) {
        const y = samples[start + i];
        sumX += i;
        sumY += y;
        sumXX += i * i;
        sumXY += i * y;
      }
      const d = segLen * sumXX - sumX * sumX;
      const slope = d !== 0 ? (segLen * sumXY - sumX * sumY) / d : 0;
      const intercept = (sumY - slope * sumX) / segLen;
      for (let i = 0; i < segLen; i++) {
        segBuf[i] = (samples[start + i] - (intercept + slope * i)) * w[i];
      }
    } else {
      for (let i = 0; i < segLen; i++) segBuf[i] = samples[start + i] * w[i];
    }

    let wSq = 0;
    for (let i = 0; i < segLen; i++) wSq += segBuf[i] * segBuf[i];
    expectedSumAvg += windowMetrics.s2 > 0 ? wSq / windowMetrics.s2 : 0;

    const { re, im } = fftReal(segBuf);
    for (let k = 0; k < bins; k++) {
      const magSq = re[k] * re[k] + im[k] * im[k];
      const factor = k === 0 || (isEven && k === bins - 1) ? 1 : 2;
      avgPower[k] += (factor * magSq) / denom;
    }
    actualSegments++;
  }

  if (actualSegments > 0) {
    const inv = 1 / actualSegments;
    expectedSumAvg *= inv;
    for (let k = 0; k < bins; k++) avgPower[k] *= inv;
  }

  const freqs = new Float64Array(bins);
  const df = fs / segLen;
  let powerSum = 0;
  for (let k = 0; k < bins; k++) {
    freqs[k] = k * df;
    powerSum += avgPower[k];
  }

  const parsevalRelError =
    expectedSumAvg > 1e-30 ? Math.abs(powerSum - expectedSumAvg) / expectedSumAvg : 0;

  return {
    freqs,
    power: avgPower,
    df,
    nyquist: fs / 2,
    timeDomainMeanSq: expectedSumAvg,
    parsevalRelError,
    windowMetrics,
    segmentsUsed: actualSegments,
  };
}

/**
 * Converts per-bin power P[k] into all display scales (dBFS, dBV, dBm, ASD, NSD)
 * and computes the cumulative integrated noise curve (excluding DC/signal/harmonics).
 */
export function buildSpectrumView(
  raw: RawSpectrum,
  fullScale: number | null,
  bits: number | null,
  refImpedanceOhm: number,
  noiseMask: Uint8Array,
  inputGain: number,
): SpectrumView {
  const { freqs, power, df, nyquist } = raw;
  const bins = power.length;
  const pfs = fullScale !== null && fullScale > 0 ? (fullScale * fullScale) / 8 : null;
  const rRef = refImpedanceOhm > 0 ? refImpedanceOhm : 50;
  const gainSq = inputGain > 0 ? inputGain * inputGain : 1;

  const dbfs = new Float64Array(bins);
  const dbv = new Float64Array(bins);
  const dbm = new Float64Array(bins);
  const asd = new Float64Array(bins);
  const nsdDbfsHz = new Float64Array(bins);
  const cumulativeNoiseRms = new Float64Array(bins);

  let noisePowerSum = 0;
  let noiseLogSum = 0;
  let noiseCount = 0;
  let runningNoisePow = 0;

  for (let k = 0; k < bins; k++) {
    const p = Math.max(EPS_POWER, power[k]);
    const pDb = 10 * Math.log10(p);
    dbv[k] = pDb;
    dbfs[k] = pfs !== null ? 10 * Math.log10(p / pfs) : pDb;
    // dBm: 10*log10((V_rms^2 / R) / 1mW) = 10*log10(P / R) + 30
    dbm[k] = 10 * Math.log10(p / rRef) + 30;
    asd[k] = Math.sqrt(p / Math.max(1e-30, df)) / Math.sqrt(gainSq);
    nsdDbfsHz[k] = dbfs[k] - 10 * Math.log10(Math.max(1e-30, df));

    if (noiseMask[k] === 1) {
      noisePowerSum += power[k];
      noiseLogSum += 10 * Math.log10(p);
      noiseCount++;
      runningNoisePow += power[k] / gainSq;
    }
    cumulativeNoiseRms[k] = Math.sqrt(Math.max(0, runningNoisePow));
  }

  const meanNoisePow = noiseCount > 0 ? Math.max(EPS_POWER, noisePowerSum / noiseCount) : EPS_POWER;
  const meanNoiseBinDbv = 10 * Math.log10(meanNoisePow);
  const meanNoiseBinDbfs = pfs !== null ? 10 * Math.log10(meanNoisePow / pfs) : null;
  const meanOfLogDb = noiseCount > 0 ? noiseLogSum / noiseCount : meanNoiseBinDbv;
  const logMeanBiasDb = meanNoiseBinDbv - meanOfLogDb;

  // Ideal N-bit quantiser floor per FFT bin: -(6.02*bits + 1.76) - 10*log10(N/2)
  const nBinsEff = Math.max(2, bins - 1);
  const idealFloorDbfs =
    bits !== null && bits > 0
      ? -(6.020599913279624 * bits + 1.7609125905568124) - 10 * Math.log10(nBinsEff)
      : null;

  return {
    freqs,
    power,
    dbfs,
    dbv,
    dbm,
    asd,
    nsdDbfsHz,
    cumulativeNoiseRms,
    df,
    nyquist,
    pfs,
    idealFloorDbfs,
    meanNoiseBinDbfs,
    meanNoiseBinDbv,
    logMeanBiasDb,
  };
}
