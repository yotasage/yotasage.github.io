// Diagnostic checks (C1–C12), grouped Figures of Merit builder, and SI formatter.
// Extracted from analyze.ts to keep every module cleanly modular and under 25 KiB.

import type {
  CheckResult,
  Conventions,
  HarmonicInfo,
  InterleaveSpur,
  MetricValue,
  ResampleReport,
  ResolvedWindowKind,
  Setup,
  SignalUnit,
  SpectrumView,
  SpurInfo,
  TimeGrid,
  ToneInfo,
  WindowMetrics,
} from '../types';

/** Formats a frequency or physical quantity cleanly with SI prefix. */
export function formatSi(value: number, unit: string, digits = 3): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs === 0) return `0 ${unit}`.trim();
  const prefixes: Array<[number, string]> = [
    [1e12, 'T'],
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
    [1e-15, 'f'],
  ];
  for (const [scale, sym] of prefixes) {
    if (abs >= scale) {
      const scaled = value / scale;
      const fixed =
        Math.abs(scaled) >= 100
          ? scaled.toFixed(Math.max(0, digits - 2))
          : Math.abs(scaled) >= 10
            ? scaled.toFixed(Math.max(1, digits - 1))
            : scaled.toFixed(digits);
      return `${fixed} ${sym}${unit}`.trim();
    }
  }
  return `${value.toExponential(2)} ${unit}`.trim();
}

export interface ChecksInput {
  tone: ToneInfo;
  resolvedWindow: ResolvedWindowKind;
  windowMetrics: WindowMetrics;
  sigStart: number;
  sigEnd: number;
  dcEnd: number;
  binsLen: number;
  k0: number;
  clippedPercent: number;
  clippedCount: number;
  fsHalf: number | null;
  max: number;
  min: number;
  mean: number;
  peakAmp: number;
  unit: SignalUnit;
  resampleReport: ResampleReport | null;
  sndrDb: number;
  fs: number;
  harmonicOverlapCount: number;
  harmonicsCount: number;
  sigHalf: number;
  parsevalRelError: number;
  spectrum: SpectrumView;
  setup: Setup;
  worstSpur: SpurInfo | null;
  fsCorrectionDb: number;
  nonFiniteCount: number;
  timeGrid: TimeGrid;
}

/** Evaluates diagnostics C1–C12 without ever hiding metrics. */
export function buildDiagnosticsChecks(p: ChecksInput): CheckResult[] {
  const checks: CheckResult[] = [];

  if (!p.tone.isCoherent) {
    checks.push({
      id: 'C1',
      level: p.resolvedWindow === 'rectangular' ? 'warn' : 'info',
      params: {
        cycles: Number(p.tone.cycles.toFixed(3)),
        window: p.resolvedWindow,
      },
    });
  }

  if (p.sigStart <= p.dcEnd + 1 || p.sigEnd >= p.binsLen - 2) {
    checks.push({
      id: 'C2',
      level: 'warn',
      params: { bin: p.k0, nyquistBin: p.binsLen - 1 },
    });
  }

  if (
    p.clippedPercent >= 0.1 ||
    (p.fsHalf !== null &&
      Math.max(Math.abs(p.max - p.mean), Math.abs(p.min - p.mean)) > p.fsHalf * 1.001)
  ) {
    checks.push({
      id: 'C3',
      level: 'warn',
      params: { pct: Number(p.clippedPercent.toFixed(2)), count: p.clippedCount },
    });
  }

  if (p.resampleReport?.applied) {
    const margin = -p.resampleReport.errorBoundDbBelowSig - p.sndrDb;
    checks.push({
      id: 'C4',
      level: margin < 20 ? 'warn' : 'info',
      params: {
        method: p.resampleReport.method,
        errDb: Number(p.resampleReport.errorBoundDbBelowSig.toFixed(1)),
        fs: formatSi(p.fs, 'Hz', 3),
      },
    });
  }

  if (
    p.harmonicOverlapCount > 0 ||
    p.harmonicsCount * p.tone.freqErrBins > Math.max(1, p.sigHalf) * 0.5
  ) {
    checks.push({
      id: 'C5',
      level: 'warn',
      params: {
        overlaps: p.harmonicOverlapCount,
        driftBins: Number((p.harmonicsCount * p.tone.freqErrBins).toFixed(2)),
      },
    });
  }

  if (Math.abs(p.mean) > p.peakAmp && p.peakAmp > 0) {
    checks.push({
      id: 'C6',
      level: 'info',
      params: {
        dc: formatSi(p.mean, p.unit === 'none' ? '' : p.unit, 3),
        amp: formatSi(p.peakAmp, p.unit === 'none' ? '' : p.unit, 3),
      },
    });
  }

  if (p.parsevalRelError > 1e-9) {
    checks.push({
      id: 'C7',
      level: 'error',
      params: { relErr: p.parsevalRelError.toExponential(2) },
    });
  }

  const peakAboveFloorDb = p.tone.dbv - p.spectrum.meanNoiseBinDbv;
  const secondSpurClose =
    !p.setup.twoToneMode && p.worstSpur !== null && p.worstSpur.dbc > -3;
  if (peakAboveFloorDb < 10 || secondSpurClose) {
    checks.push({
      id: 'C8',
      level: 'warn',
      params: {
        marginDb: Number(peakAboveFloorDb.toFixed(1)),
        reason: secondSpurClose ? 'multitone' : 'weak',
      },
    });
  }

  if (p.setup.fullScale === null || Math.abs(p.fsCorrectionDb) > 6) {
    checks.push({
      id: 'C9',
      level: p.setup.fullScale === null ? 'info' : 'warn',
      params: {
        corrDb: Number(p.fsCorrectionDb.toFixed(2)),
        missingFs: p.setup.fullScale === null ? 1 : 0,
      },
    });
  }

  if (!p.tone.isCoherent) {
    const leakageFloorDb =
      p.windowMetrics.highestSidelobeDb + p.windowMetrics.scallopingLossDb;
    const measuredFloorDbc = p.spectrum.meanNoiseBinDbv - p.tone.dbv;
    if (leakageFloorDb > measuredFloorDbc + 6) {
      const level =
        p.resolvedWindow === 'rectangular'
          ? 'error'
          : p.windowMetrics.highestSidelobeDb <= -70
            ? 'info'
            : 'warn';
      checks.push({
        id: 'C10',
        level,
        params: {
          window: p.resolvedWindow,
          sidelobeDb: Number(p.windowMetrics.highestSidelobeDb.toFixed(1)),
          floorDbc: Number(measuredFloorDbc.toFixed(1)),
        },
      });
    }
  }

  if (p.sndrDb > 100) {
    checks.push({
      id: 'C11',
      level: 'info',
      params: { sndr: Number(p.sndrDb.toFixed(1)) },
    });
  }

  if (p.nonFiniteCount > 0 || p.timeGrid.kind === 'gaps') {
    checks.push({
      id: 'C12',
      level: p.nonFiniteCount > 0 ? 'error' : 'warn',
      params: { nonFinite: p.nonFiniteCount, gaps: p.timeGrid.gapCount },
    });
  }

  return checks;
}

export interface MetricsListInput {
  unit: SignalUnit;
  setup: Setup;
  conv: Conventions;
  tone: ToneInfo;
  secondTone: ToneInfo | null;
  k0: number;
  sigHalf: number;
  bwHz: number;
  osr: number;
  n: number;
  df: number;
  noiseBinCount: number;
  sndrDb: number;
  enob: number;
  fsCorrectionDb: number;
  snrDb: number;
  thdnDb: number;
  pNoisePlusDist: number;
  pSig: number;
  harmonicsCount: number;
  thdDb: number;
  thdPercent: number;
  harmonics: HarmonicInfo[];
  sfdrDbc: number;
  sfdrDbfs: number | null;
  worstSpur: SpurInfo | null;
  worstNonHarmonicSpur: SpurInfo | null;
  spectrum: SpectrumView;
  nsdDbfsHz: number | null;
  meanAsd: number;
  intNoiseRms: number;
  equivJitterSec: number | null;
  mean: number;
  peakToPeak: number;
  acRms: number;
  clippedPercent: number;
  imd3Dbc: number | null;
  imd2Dbc: number | null;
  oip3Dbm: number | null;
  iip3Dbm: number | null;
  rRef: number;
  mCh: number;
  interleaveSpurs: InterleaveSpur[];
  fomWalden: number | null;
  fomSchreier: number | null;
  pW: number | null;
}

/** Assembles grouped MetricValue[] with KaTeX formulas, conventions, and citation keys. */
export function buildMetricsList(p: MetricsListInput): MetricValue[] {
  const unitSym = p.unit === 'none' ? '' : p.unit;
  const fmtDb = (v: number | null) => (v !== null && Number.isFinite(v) ? v.toFixed(2) : '—');
  const metrics: MetricValue[] = [
    {
      id: 'M-FUND',
      group: 'fundamental',
      label: 'Fundamental (f₀)',
      value: p.tone.refinedFreqHz,
      formatted: formatSi(p.tone.refinedFreqHz, 'Hz', 4),
      unit: '',
      convention: `bin:${p.k0}±${p.sigHalf}`,
      formulaTex:
        'P_{\\text{sig}} = \\sum_{k=k_0-m}^{k_0+m} P[k],\\quad A_{\\text{pk}} = \\sqrt{2 P_{\\text{sig}}}',
      description:
        'Fundamental frequency (quadratic log-magnitude refined) and total bin-summed signal power.',
      referenceKey: 'IEEE1241',
      secondary:
        p.tone.dbfs !== null
          ? `${p.tone.dbfs.toFixed(2)} dBFS · ${formatSi(p.tone.peakAmplitude, unitSym ? `${unitSym}pk` : 'pk', 3)}`
          : `${p.tone.dbv.toFixed(2)} dBV · ${formatSi(p.tone.peakAmplitude, unitSym ? `${unitSym}pk` : 'pk', 3)}`,
    },
    {
      id: 'M-CYCLES',
      group: 'fundamental',
      label: 'Cycles in record (M)',
      value: p.tone.cycles,
      formatted: p.tone.cycles.toFixed(4),
      unit: p.tone.isCoherent ? 'coherent' : 'non-coherent',
      convention: `tol:${p.conv.coherenceTol}`,
      formulaTex: 'M = \\frac{f_0 N}{f_s},\\quad \\gcd(M, N) = 1',
      description:
        'Number of fundamental periods captured in the N-sample record and prime/coprime coherence status.',
      referenceKey: 'AD',
    },
    {
      id: 'M-SNDR',
      group: 'combined',
      label: 'SNDR / SINAD',
      value: p.sndrDb,
      formatted: fmtDb(p.sndrDb),
      unit: 'dB',
      convention: `band:${formatSi(p.bwHz, 'Hz', 2)}`,
      formulaTex:
        '\\text{SNDR} = 10\\log_{10}\\!\\left(\\frac{P_{\\text{sig}}}{P_{\\text{noise}} + P_{\\text{THD}}}\\right)',
      description:
        'Signal-to-Noise-and-Distortion ratio over all active band bins excluding DC and fundamental.',
      referenceKey: 'IEEE1241',
      secondary:
        p.setup.bits !== null
          ? `Ideal ${p.setup.bits}-bit: ${(6.0206 * p.setup.bits + 1.7609).toFixed(2)} dB`
          : undefined,
    },
    {
      id: 'M-ENOB',
      group: 'combined',
      label: 'ENOB',
      value: p.enob,
      formatted: Number.isFinite(p.enob) ? p.enob.toFixed(2) : '—',
      unit: 'bits',
      convention:
        p.conv.enobFsCorrection && p.setup.fullScale ? 'enob:fs-corr' : 'enob:no-fs-corr',
      formulaTex:
        p.conv.enobFsCorrection && p.setup.fullScale
          ? '\\text{ENOB} = \\frac{\\text{SNDR} - 1.76 + 20\\log_{10}\\!\\left(\\frac{\\text{FS}}{2 A_{\\text{pk}}}\\right)}{6.02}'
          : '\\text{ENOB} = \\frac{\\text{SNDR} - 1.76}{6.02}',
      description:
        'Effective Number of Bits derived from SNDR, optionally corrected for input drive below full scale.',
      referenceKey: 'KesterMT003',
      secondary:
        p.setup.bits !== null
          ? `Deficit: ${(p.setup.bits - p.enob).toFixed(2)} bits`
          : p.fsCorrectionDb !== 0
            ? `FS corr: ${p.fsCorrectionDb >= 0 ? '+' : ''}${p.fsCorrectionDb.toFixed(2)} dB`
            : undefined,
    },
    {
      id: 'M-SNR',
      group: 'combined',
      label: 'SNR',
      value: p.snrDb,
      formatted: fmtDb(p.snrDb),
      unit: 'dB',
      convention: p.conv.snrExcludesHarmonics
        ? `snr:excl-H2..H${p.harmonicsCount}`
        : 'snr:incl-harm',
      formulaTex:
        '\\text{SNR} = 10\\log_{10}\\!\\left(\\frac{P_{\\text{sig}}}{P_{\\text{noise}}}\\right)',
      description:
        'Signal-to-Noise Ratio excluding DC, fundamental, and (by default) harmonic bins H2..Hn.',
      referenceKey: 'IEEE1241',
      secondary: p.osr > 1.05 ? `OSR = ${p.osr.toFixed(1)}×` : undefined,
    },
    {
      id: 'M-THDN',
      group: 'combined',
      label: 'THD+N',
      value: p.thdnDb,
      formatted: fmtDb(p.thdnDb),
      unit: 'dB',
      convention: 'thdn:-SNDR',
      formulaTex:
        '\\text{THD+N} = 10\\log_{10}\\!\\left(\\frac{P_{\\text{noise}} + P_{\\text{THD}}}{P_{\\text{sig}}}\\right)',
      description: 'Total Harmonic Distortion plus Noise relative to the fundamental tone.',
      referenceKey: 'KesterMT003',
      secondary: `${(100 * Math.sqrt(p.pNoisePlusDist / p.pSig)).toFixed(4)} %`,
    },
    {
      id: 'M-THD',
      group: 'distortion',
      label: `THD (H2–H${p.harmonicsCount})`,
      value: p.thdDb,
      formatted: fmtDb(p.thdDb),
      unit: p.conv.thdNegativeDb ? 'dBc' : 'dB',
      convention: `thd:H2..H${p.harmonicsCount}:${p.conv.thdNegativeDb ? 'neg' : 'pos'}`,
      formulaTex:
        '\\text{THD} = 10\\log_{10}\\!\\left(\\frac{\\sum_{h=2}^{H} P_h}{P_{\\text{sig}}}\\right)',
      description:
        'Total Harmonic Distortion summed across folded harmonics H2 through Hn inside the active band.',
      referenceKey: 'IEEE1241',
      secondary: `${p.thdPercent.toFixed(4)} %`,
    },
    {
      id: 'M-HD2',
      group: 'distortion',
      label: 'HD2 / HD3',
      value: p.harmonics[0]?.dbc ?? null,
      formatted:
        p.harmonics[0] && p.harmonics[1]
          ? `${p.harmonics[0].dbc.toFixed(1)} / ${p.harmonics[1].dbc.toFixed(1)}`
          : '—',
      unit: 'dBc',
      convention: 'folded-bins',
      formulaTex:
        '\\text{HD}_h = 10\\log_{10}\\!\\left(\\frac{P_h}{P_{\\text{sig}}}\\right)',
      description:
        '2nd and 3rd harmonic distortion levels relative to the fundamental (including Nyquist folding).',
      referenceKey: 'IEEE1241',
    },
    {
      id: 'M-SFDR',
      group: 'spurs',
      label: 'SFDR',
      value: p.sfdrDbc,
      formatted: fmtDb(p.sfdrDbc),
      unit: 'dBc',
      convention: p.worstSpur?.isHarmonic ? `worst:${p.worstSpur.label}` : 'worst:non-harm',
      formulaTex:
        '\\text{SFDR} = 10\\log_{10}\\!\\left(\\frac{P_{\\text{sig}}}{\\max P_{\\text{spur}}}\\right)',
      description:
        'Spurious-Free Dynamic Range from fundamental to the largest spur (harmonic or non-harmonic).',
      referenceKey: 'IEEE1241',
      secondary: [
        p.sfdrDbfs !== null ? `${p.sfdrDbfs.toFixed(2)} dBFS` : null,
        p.worstSpur ? `@ ${formatSi(p.worstSpur.freqHz, 'Hz', 3)} (${p.worstSpur.label})` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      id: 'M-SFDR-NH',
      group: 'spurs',
      label: 'Worst non-harmonic spur',
      value: p.worstNonHarmonicSpur ? -p.worstNonHarmonicSpur.dbc : null,
      formatted: p.worstNonHarmonicSpur ? (-p.worstNonHarmonicSpur.dbc).toFixed(2) : '—',
      unit: 'dBc',
      convention: 'excl-H2..Hn',
      formulaTex:
        '\\text{SFDR}_{\\text{nh}} = 10\\log_{10}\\!\\left(\\frac{P_{\\text{sig}}}{\\max_{k\\notin H} P_k}\\right)',
      description:
        'Dynamic range to the strongest non-harmonic spur outside DC, signal, and H2..Hn.',
      secondary: p.worstNonHarmonicSpur
        ? `@ ${formatSi(p.worstNonHarmonicSpur.freqHz, 'Hz', 3)}`
        : undefined,
    },
    {
      id: 'M-NF',
      group: 'noise',
      label: 'Mean noise bin / NSD',
      value: p.spectrum.meanNoiseBinDbfs ?? p.spectrum.meanNoiseBinDbv,
      formatted:
        p.spectrum.meanNoiseBinDbfs !== null
          ? `${p.spectrum.meanNoiseBinDbfs.toFixed(2)} dBFS`
          : `${p.spectrum.meanNoiseBinDbv.toFixed(2)} dBV`,
      unit: 'per bin',
      convention: 'log-of-mean-power',
      formulaTex:
        '\\text{NSD} = 10\\log_{10}\\!\\left(\\frac{\\overline{P_{\\text{noise}}}}{\\Delta f \\cdot P_{\\text{FS}}}\\right)',
      description:
        'Linear mean of noise-bin power converted to dB (avoids the ~2.5 dB chi-square log-average bias).',
      referenceKey: 'Harris1978',
      secondary:
        p.nsdDbfsHz !== null
          ? `NSD: ${p.nsdDbfsHz.toFixed(1)} dBFS/Hz · ASD: ${formatSi(p.meanAsd, `${unitSym || 'V'}/√Hz`, 2)}`
          : `ASD: ${formatSi(p.meanAsd, `${unitSym || 'V'}/√Hz`, 2)}`,
    },
    {
      id: 'M-NINT',
      group: 'noise',
      label: p.setup.inputGain !== 1 ? 'Input-referred noise' : 'Integrated noise',
      value: p.intNoiseRms,
      formatted: formatSi(p.intNoiseRms, unitSym ? `${unitSym}rms` : 'rms', 3),
      unit: '',
      convention: `band:${formatSi(p.bwHz, 'Hz', 2)}`,
      formulaTex: 'v_{n,\\text{rms}} = \\frac{1}{G}\\sqrt{\\sum_{k\\in\\text{noise}} P[k]}',
      description:
        'Total integrated RMS noise over the active frequency band, divided by input gain G.',
      secondary: `df = ${formatSi(p.df, 'Hz', 2)} · ${p.noiseBinCount} noise bins`,
    },
    {
      id: 'M-JIT',
      group: 'noise',
      label: 'Equiv. jitter (upper bound)',
      value: p.equivJitterSec,
      formatted: p.equivJitterSec !== null ? formatSi(p.equivJitterSec, 's', 3) : '—',
      unit: 'rms',
      convention: 'all-noise-as-jitter',
      formulaTex: '\\sigma_t \\le \\frac{10^{-\\text{SNR}/20}}{2\\pi f_0}',
      description:
        'Upper-bound RMS aperture/clock jitter assuming 100% of measured noise originated from jitter.',
      referenceKey: 'Walden1999',
    },
    {
      id: 'M-STAT',
      group: 'stats',
      label: 'DC offset / Peak-to-peak',
      value: p.mean,
      formatted: `${formatSi(p.mean, unitSym, 3)} / ${formatSi(p.peakToPeak, unitSym, 3)}`,
      unit: '',
      convention: `N=${p.n}`,
      formulaTex: '\\mu = \\frac{1}{N}\\sum x[n],\\quad V_{\\text{pp}} = \\max x - \\min x',
      description: 'Record mean (DC offset), peak-to-peak swing, AC RMS, and clipped sample fraction.',
      secondary: `AC RMS: ${formatSi(p.acRms, unitSym, 3)} · Clipped: ${p.clippedPercent.toFixed(2)}%`,
    },
  ];

  if (p.setup.twoToneMode && p.secondTone) {
    metrics.push({
      id: 'M-IMD',
      group: 'spurs',
      label: 'IMD3 / IMD2',
      value: p.imd3Dbc,
      formatted: `${fmtDb(p.imd3Dbc)} / ${fmtDb(p.imd2Dbc)}`,
      unit: 'dBc',
      convention: 'ref:weaker-tone',
      formulaTex:
        '\\text{IMD}_3 = 10\\log_{10}\\!\\left(\\frac{\\max(P_{2f_1-f_2}, P_{2f_2-f_1})}{\\min(P_{f_1}, P_{f_2})}\\right)',
      description:
        'Worst 3rd-order and 2nd-order intermodulation products relative to the weaker fundamental tone.',
      secondary: `f2 = ${formatSi(p.secondTone.refinedFreqHz, 'Hz', 4)}`,
    });
    metrics.push({
      id: 'M-IP3',
      group: 'spurs',
      label: 'OIP3 / IIP3',
      value: p.oip3Dbm,
      formatted: `${fmtDb(p.oip3Dbm)} / ${fmtDb(p.iip3Dbm)}`,
      unit: 'dBm',
      convention: `R=${p.rRef}Ω`,
      formulaTex:
        '\\text{OIP}_3 = P_{\\text{tone}} + \\frac{P_{\\text{tone}} - P_{\\text{IM3}}}{2}',
      description:
        'Output and input third-order intercept points computed from tone power and worst IM3 product.',
    });
  }

  if (p.mCh > 1 && p.interleaveSpurs.length > 0) {
    const worstIlv = p.interleaveSpurs[0];
    metrics.push({
      id: 'M-ILV',
      group: 'spurs',
      label: `Worst ${p.mCh}-ch interleaving spur`,
      value: worstIlv.dbc,
      formatted: `${worstIlv.dbc.toFixed(2)}`,
      unit: 'dBc',
      convention: `${worstIlv.kind}:k=${worstIlv.channelHarmonic}`,
      formulaTex:
        'f_{\\text{off}} = \\frac{k f_s}{M},\\quad f_{\\text{g/t}} = \\left|\\frac{k f_s}{M} \\pm f_{\\text{in}}\\right|',
      description:
        'Strongest offset or gain/timing-skew interleaving image spur across M channels.',
      secondary: `@ ${formatSi(worstIlv.freqHz, 'Hz', 3)}`,
    });
  }

  if (p.fomWalden !== null && p.fomSchreier !== null) {
    metrics.push({
      id: 'M-FOMW',
      group: 'combined',
      label: 'Walden FoM',
      value: p.fomWalden,
      formatted: formatSi(p.fomWalden, 'J/step', 3),
      unit: '',
      convention: `P=${formatSi(p.pW ?? 0, 'W', 2)}`,
      formulaTex: '\\text{FoM}_W = \\frac{P}{2^{\\text{ENOB}} \\cdot 2\\,\\text{BW}}',
      description: 'Energy per conversion step (Walden Figure of Merit). Lower is better.',
      referenceKey: 'Walden1999',
    });
    metrics.push({
      id: 'M-FOMS',
      group: 'combined',
      label: 'Schreier FoM',
      value: p.fomSchreier,
      formatted: p.fomSchreier.toFixed(2),
      unit: 'dB',
      convention: `BW=${formatSi(p.bwHz, 'Hz', 2)}`,
      formulaTex:
        '\\text{FoM}_S = \\text{SNDR} + 10\\log_{10}\\!\\left(\\frac{\\text{BW}}{P}\\right)',
      description:
        'Schreier Figure of Merit combining SNDR, signal bandwidth, and power dissipation. Higher is better.',
      referenceKey: 'SchreierTemes2005',
    });
  }

  return metrics;
}
