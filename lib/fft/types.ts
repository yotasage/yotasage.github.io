// Core types for the FFT / Spectrum Analyzer engine, plot specs, and exports.

export type WindowKind =
  | 'auto'
  | 'rectangular'
  | 'hann'
  | 'hamming'
  | 'blackman'
  | 'blackman-harris'
  | 'nuttall'
  | 'flattop'
  | 'kaiser'
  | 'chebyshev'
  | 'gaussian'
  | 'tukey'
  | 'bartlett'
  | 'welch';

export type ResolvedWindowKind = Exclude<WindowKind, 'auto'>;

export interface WindowParams {
  kaiserBeta: number;
  chebyshevDb: number;
  gaussianSigma: number;
  tukeyAlpha: number;
}

export interface WindowMetrics {
  kind: ResolvedWindowKind;
  coherentGain: number;
  enbwBins: number;
  s1: number;
  s2: number;
  highestSidelobeDb: number;
  scallopingLossDb: number;
  mainLobeHalfWidth: number;
  /** Downsampled time-domain window shape for plotting (0..1 normalized x). */
  shapeX: number[];
  shapeY: number[];
  /** Frequency response in dB over -16..+16 bins for the Window plot. */
  freqBins: number[];
  freqDb: number[];
}

export type EstimatorKind = 'dft' | 'welch' | 'czt';

export type SignalKind = 'single' | 'diff' | 'cm';

export type SignalUnit = 'V' | 'A' | 'code' | 'none';

export type YAxisUnit = 'dBFS' | 'dBV' | 'dBm' | 'asd' | 'nsd';

export type PlotTabId = 'spectrum' | 'time' | 'harmonics' | 'window' | 'intnoise';

export type PlotThemeId = 'mpl-default' | 'mpl-grid' | 'mpl-dark';

export interface ColumnInfo {
  index: number;
  name: string;
  unit?: string;
  kind: 'float' | 'int' | 'text';
  min: number;
  max: number;
  nonFiniteCount: number;
  isMonotonic: boolean;
}

export interface ParsedDataset {
  id: string;
  name: string;
  format: 'csv' | 'npy' | 'wav' | 'spice-raw' | 'preset';
  rows: number;
  columns: ColumnInfo[];
  data: Float64Array[];
  defaultTimeCol: number | null;
  defaultSigACol: number;
  defaultSigBCol: number | null;
  defaultKind: SignalKind;
  defaultFs: number | null;
  defaultFullScale: number | null;
  defaultBits: number | null;
  defaultBand: [number, number] | null;
  defaultInterleaveChannels?: number;
  defaultTwoTone?: boolean;
  delimiter?: string;
  notes?: string;
}

export interface SignalDef {
  kind: SignalKind;
  timeCol: number | null;
  colA: number;
  colB: number | null;
  gain: number;
  offset: number;
  unit: SignalUnit;
}

export interface TimeGrid {
  kind: 'uniform' | 'gaps' | 'nonuniform' | 'none';
  fs: number | null;
  dtMin: number;
  dtMax: number;
  dtMedian: number;
  relSpread: number;
  gapCount: number;
}

export interface ResampleReport {
  applied: boolean;
  method: 'linear' | 'cubic';
  targetFs: number;
  errorBoundRms: number;
  errorBoundDbBelowSig: number;
  originalSamples: number;
  resampledSamples: number;
}

export interface Conventions {
  harmonicsCount: number;
  snrExcludesHarmonics: boolean;
  thdNegativeDb: boolean;
  enobFsCorrection: boolean;
  noiseBinCompensation: boolean;
  coherenceTol: number;
  refImpedanceOhm: number;
  dcBinsOverride: number | null;
  signalBinsOverride: number | null;
}

export interface Setup {
  fs: number;
  start: number;
  n: number;
  window: WindowKind;
  windowParams: WindowParams;
  estimator: EstimatorKind;
  welchSegments: number;
  welchOverlap: number; // 0..0.9
  welchDetrend: 'none' | 'mean' | 'linear';
  cztF1: number | null;
  cztF2: number | null;
  cztPoints: number;
  fullScale: number | null;
  bits: number | null;
  f0Hint: number | null;
  band: [number, number] | null;
  inputGain: number; // for input-referred noise
  powerWatts: number | null; // for Walden / Schreier FoM
  interleaveChannels: number; // 1 = single channel, >1 = interleaved
  twoToneMode: boolean;
  resampleMethod: 'linear' | 'cubic';
  resampleFs: number | null;
  conventions: Conventions;
}

export interface ToneInfo {
  bin: number;
  freqHz: number;
  refinedFreqHz: number;
  cycles: number;
  isIntegerCycles: boolean;
  isCoprime: boolean;
  isCoherent: boolean;
  power: number;
  peakAmplitude: number;
  rmsAmplitude: number;
  dbfs: number | null;
  dbv: number;
  dbm: number;
  freqErrBins: number;
}

export interface HarmonicInfo {
  order: number;
  idealFreqHz: number;
  foldedFreqHz: number;
  nyquistZone: number;
  bin: number;
  power: number;
  dbc: number;
  dbfs: number | null;
  overlappedWith: string | null;
}

export interface SpurInfo {
  bin: number;
  freqHz: number;
  power: number;
  dbc: number;
  dbfs: number | null;
  isHarmonic: boolean;
  harmonicOrder: number | null;
  label: string;
}

export interface InterleaveSpur {
  kind: 'offset' | 'gain-timing';
  channelHarmonic: number;
  freqHz: number;
  bin: number;
  dbc: number;
  dbfs: number | null;
}

export interface ImToneInfo {
  label: string;
  order: 2 | 3;
  freqHz: number;
  bin: number;
  dbc: number;
}

export interface BinSets {
  dcEnd: number;
  signalBins: [number, number];
  bandStartBin: number;
  bandEndBin: number;
  harmonicBins: { order: number; start: number; end: number }[];
  noiseBinCount: number;
  totalBandBins: number;
}

export type MetricGroup = 'fundamental' | 'distortion' | 'noise' | 'combined' | 'spurs' | 'stats';

export interface MetricValue {
  id: string;
  group: MetricGroup;
  label: string;
  value: number | null;
  formatted: string;
  unit: string;
  convention: string;
  formulaTex: string;
  description: string;
  referenceKey?: string;
  secondary?: string;
}

export type CheckLevel = 'info' | 'warn' | 'error';

export interface CheckResult {
  id: string;
  level: CheckLevel;
  params: Record<string, number | string>;
}

export interface SpectrumView {
  freqs: Float64Array;
  power: Float64Array; // P[k] in unit^2 (rms)
  dbfs: Float64Array;
  dbv: Float64Array;
  dbm: Float64Array;
  asd: Float64Array; // unit / sqrt(Hz)
  nsdDbfsHz: Float64Array;
  cumulativeNoiseRms: Float64Array;
  df: number;
  nyquist: number;
  pfs: number | null;
  idealFloorDbfs: number | null;
  meanNoiseBinDbfs: number | null;
  meanNoiseBinDbv: number;
  logMeanBiasDb: number;
}

export interface SignalStats {
  count: number;
  mean: number;
  rms: number;
  acRms: number;
  min: number;
  max: number;
  peakToPeak: number;
  crestFactorDb: number;
  clippedCount: number;
  clippedPercent: number;
  nonFiniteCount: number;
  parsevalRelError: number;
}

export interface AnalysisResult {
  datasetName: string;
  signalLabel: string;
  unit: SignalUnit;
  setup: Setup;
  resolvedWindow: ResolvedWindowKind;
  windowMetrics: WindowMetrics;
  timeGrid: TimeGrid;
  resample: ResampleReport | null;
  tone: ToneInfo;
  secondTone: ToneInfo | null;
  bins: BinSets;
  harmonics: HarmonicInfo[];
  worstSpur: SpurInfo | null;
  worstNonHarmonicSpur: SpurInfo | null;
  topSpurs: SpurInfo[];
  imTones: ImToneInfo[];
  interleaveSpurs: InterleaveSpur[];
  stats: SignalStats;
  metrics: MetricValue[];
  checks: CheckResult[];
  spectrum: SpectrumView;
  /** Time-domain waveform excerpt for plotting (decimated if very large). */
  timePlot: {
    t: Float64Array;
    y: Float64Array;
    cm: Float64Array | null;
    activeStartT: number;
    activeEndT: number;
    fullCount: number;
  };
  /** Zoom FFT / CZT spectrum when estimator === 'czt'. */
  cztView?: {
    freqs: Float64Array;
    db: Float64Array;
  };
  computeMs: number;
}
