// Backend-neutral Matplotlib-look Plot Engine for the FFT / Spectrum Analyzer.
// Builds a declarative PlotSpec -> Layout -> DrawList rendered identically to
// Canvas 2D, SVG, Vector PDF, TikZ/pgfplots, and Matplotlib Python scripts.

import type { AnalysisResult, PlotTabId, PlotThemeId, YAxisUnit } from '../types';
import { formatSi } from '../metrics/analyze';

export interface PlotTheme {
  id: PlotThemeId;
  bg: string;
  axesBg: string;
  fg: string;
  spine: string;
  grid: string;
  showGrid: boolean;
  palette: string[];
  accentFundamental: string;
  accentHarmonic: string;
  accentSpur: string;
  accentFloor: string;
  accentIdeal: string;
  bandFill: string;
}

export const TAB10 = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
];

export const PLOT_THEMES: Record<PlotThemeId, PlotTheme> = {
  'mpl-default': {
    id: 'mpl-default',
    bg: '#ffffff',
    axesBg: '#ffffff',
    fg: '#111111',
    spine: '#222222',
    grid: '#d9d9d9',
    showGrid: false,
    palette: TAB10,
    accentFundamental: '#2ca02c',
    accentHarmonic: '#d62728',
    accentSpur: '#ff7f0e',
    accentFloor: '#7f7f7f',
    accentIdeal: '#9467bd',
    bandFill: 'rgba(31, 119, 180, 0.08)',
  },
  'mpl-grid': {
    id: 'mpl-grid',
    bg: '#ffffff',
    axesBg: '#ffffff',
    fg: '#111111',
    spine: '#222222',
    grid: '#cccccc',
    showGrid: true,
    palette: TAB10,
    accentFundamental: '#2ca02c',
    accentHarmonic: '#d62728',
    accentSpur: '#ff7f0e',
    accentFloor: '#666666',
    accentIdeal: '#9467bd',
    bandFill: 'rgba(31, 119, 180, 0.09)',
  },
  'mpl-dark': {
    id: 'mpl-dark',
    bg: '#111418',
    axesBg: '#161a20',
    fg: '#e8edf2',
    spine: '#9aa5b1',
    grid: '#2b323b',
    showGrid: true,
    palette: [
      '#58a6ff',
      '#ffa657',
      '#56d364',
      '#ff7b72',
      '#d2a8ff',
      '#d4a373',
      '#f778ba',
      '#8b949e',
      '#e3b341',
      '#39c5cf',
    ],
    accentFundamental: '#56d364',
    accentHarmonic: '#ff7b72',
    accentSpur: '#ffa657',
    accentFloor: '#8b949e',
    accentIdeal: '#d2a8ff',
    bandFill: 'rgba(88, 166, 255, 0.12)',
  },
};

export interface PlotSeries {
  id: string;
  label: string;
  x: number[] | Float64Array;
  y: number[] | Float64Array;
  color: string;
  lineWidth?: number;
  dash?: number[];
  kind?: 'line' | 'bar';
  barWidth?: number;
}

export interface PlotMarker {
  x: number;
  y: number;
  label: string;
  color: string;
  shape: 'circle' | 'triangle' | 'diamond';
}

export interface PlotHLine {
  y: number;
  label: string;
  color: string;
  dash?: number[];
}

export interface PlotSpan {
  x0: number;
  x1: number;
  color: string;
  label?: string;
}

export interface PlotSpec {
  kind: PlotTabId;
  title: string;
  xLabel: string;
  yLabel: string;
  xUnit?: string;
  yUnit?: string;
  xScale: 'linear' | 'log';
  yScale: 'linear';
  xLim: [number, number];
  yLim: [number, number];
  themeId: PlotThemeId;
  series: PlotSeries[];
  markers: PlotMarker[];
  hLines: PlotHLine[];
  vSpans: PlotSpan[];
  xTickFormatter?: 'si-hz' | 'si-s' | 'number' | 'harmonic';
  yTickFormatter?: 'number' | 'si';
  showLegend: boolean;
}

export interface AxisTick {
  value: number;
  label: string;
  pos: number; // pixel coordinate
}

export interface PlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlotLayout {
  width: number;
  height: number;
  axes: PlotRect;
  theme: PlotTheme;
  spec: PlotSpec;
  xTicks: AxisTick[];
  yTicks: AxisTick[];
  xToPx: (v: number) => number;
  yToPx: (v: number) => number;
  pxToX: (px: number) => number;
  pxToY: (py: number) => number;
  decimatedSeries: {
    id: string;
    label: string;
    color: string;
    lineWidth: number;
    dash: number[];
    kind: 'line' | 'bar';
    barWidthPx: number;
    points: [number, number][];
    bars: { x: number; y: number; w: number; h: number }[];
  }[];
}

export interface SpectrumPlotOptions {
  yUnit: YAxisUnit;
  xScale: 'linear' | 'log';
  themeId: PlotThemeId;
  showMarkers: boolean;
  showIdealFloor: boolean;
  showNoiseFloor: boolean;
  compareResults?: AnalysisResult[];
}

/** Matplotlib-like MaxNLocator choosing nice 1, 2, 2.5, 5, 10 steps. */
export function maxNTicks(min: number, max: number, maxTicks = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const range = max - min;
  const rawStep = range / Math.max(2, maxTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const steps = [1, 2, 2.5, 5, 10];
  let step = 10 * mag;
  for (const s of steps) {
    if (norm <= s) {
      step = s * mag;
      break;
    }
  }
  const start = Math.ceil((min - 1e-12 * range) / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + 1e-12 * range; v += step) {
    const clean = Math.abs(v) < step * 1e-9 ? 0 : v;
    ticks.push(clean);
    if (ticks.length > 30) break;
  }
  return ticks;
}

/** Matplotlib-like LogLocator producing decade ticks (10^k). */
export function logTicks(min: number, max: number): number[] {
  const safeMin = Math.max(min, 1e-15);
  const safeMax = Math.max(max, safeMin * 10);
  const lo = Math.ceil(Math.log10(safeMin) - 1e-9);
  const hi = Math.floor(Math.log10(safeMax) + 1e-9);
  const ticks: number[] = [];
  const stride = hi - lo > 7 ? 2 : 1;
  for (let p = lo; p <= hi; p += stride) {
    ticks.push(Math.pow(10, p));
  }
  if (ticks.length < 2) {
    ticks.length = 0;
    const p0 = Math.floor(Math.log10(safeMin));
    const p1 = Math.ceil(Math.log10(safeMax));
    for (let p = p0; p <= p1; p++) {
      const val = Math.pow(10, p);
      if (val >= safeMin && val <= safeMax) ticks.push(val);
    }
  }
  return ticks;
}

export function formatTickLabel(
  v: number,
  formatter: PlotSpec['xTickFormatter'] | PlotSpec['yTickFormatter'],
): string {
  if (formatter === 'si-hz') {
    return formatSi(v, 'Hz', 3);
  }
  if (formatter === 'si-s') {
    return formatSi(v, 's', 3);
  }
  if (formatter === 'harmonic') {
    return `H${Math.round(v)}`;
  }
  if (formatter === 'si') {
    return formatSi(v, '', 2).trim();
  }
  if (Math.abs(v) >= 1e5 || (Math.abs(v) > 0 && Math.abs(v) < 1e-3)) {
    return v.toExponential(1);
  }
  const rounded = Math.round(v * 1e6) / 1e6;
  return String(rounded);
}

/** Min/max pixel-column envelope decimation so narrow spectral peaks never vanish. */
export function decimateSeriesMinMax(
  x: number[] | Float64Array,
  y: number[] | Float64Array,
  xLim: [number, number],
  xToPx: (v: number) => number,
  yToPx: (v: number) => number,
  axesX: number,
  axesW: number,
  isLogX: boolean,
): [number, number][] {
  const n = Math.min(x.length, y.length);
  if (n === 0) return [];
  const buckets = Math.max(200, Math.floor(axesW));
  if (n <= buckets * 2) {
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const xi = x[i];
      const yi = y[i];
      if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
      if (isLogX && xi <= 0) continue;
      if (xi < xLim[0] - (xLim[1] - xLim[0]) * 0.05 || xi > xLim[1] + (xLim[1] - xLim[0]) * 0.05) {
        continue;
      }
      pts.push([xToPx(xi), yToPx(yi)]);
    }
    return pts;
  }

  // Per pixel column track first, min-y, max-y, last
  const minY = new Float64Array(buckets).fill(Infinity);
  const maxY = new Float64Array(buckets).fill(-Infinity);
  const minX = new Float64Array(buckets);
  const maxX = new Float64Array(buckets);
  const has = new Uint8Array(buckets);

  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    if (isLogX && xi <= 0) continue;
    if (xi < xLim[0] || xi > xLim[1]) continue;
    const px = xToPx(xi);
    const col = Math.min(buckets - 1, Math.max(0, Math.floor(((px - axesX) / axesW) * buckets)));
    has[col] = 1;
    if (yi < minY[col]) {
      minY[col] = yi;
      minX[col] = px;
    }
    if (yi > maxY[col]) {
      maxY[col] = yi;
      maxX[col] = px;
    }
  }

  const out: [number, number][] = [];
  for (let c = 0; c < buckets; c++) {
    if (!has[c]) continue;
    const pyMin = yToPx(minY[c]);
    const pyMax = yToPx(maxY[c]);
    if (minX[c] <= maxX[c]) {
      out.push([minX[c], pyMin]);
      if (Math.abs(pyMax - pyMin) > 0.25) out.push([maxX[c], pyMax]);
    } else {
      out.push([maxX[c], pyMax]);
      if (Math.abs(pyMax - pyMin) > 0.25) out.push([minX[c], pyMin]);
    }
  }
  return out;
}

/** Build a backend-neutral PlotSpec for the active plot tab. */
export function buildPlotSpec(
  result: AnalysisResult,
  tab: PlotTabId,
  opts: SpectrumPlotOptions,
): PlotSpec {
  const theme = PLOT_THEMES[opts.themeId] ?? PLOT_THEMES['mpl-default'];

  if (tab === 'spectrum') {
    const sp = result.spectrum;
    const useCzt = result.setup.estimator === 'czt' && result.cztView;
    const freqs = useCzt ? result.cztView!.freqs : sp.freqs;

    let yData: Float64Array;
    let yLabel = 'Magnitude (dBFS)';
    let yUnitStr = 'dBFS';
    if (useCzt) {
      yData = result.cztView!.db;
      yLabel = 'Zoom FFT magnitude (dBFS)';
    } else {
      switch (opts.yUnit) {
        case 'dBFS':
          yData = sp.dbfs;
          yLabel = result.setup.fullScale ? 'Magnitude (dBFS)' : 'Magnitude (dB rel. peak)';
          yUnitStr = result.setup.fullScale ? 'dBFS' : 'dB';
          break;
        case 'dBV':
          yData = sp.dbv;
          yLabel = result.unit === 'V' ? 'Magnitude (dBV)' : `Magnitude (dB${result.unit})`;
          yUnitStr = result.unit === 'V' ? 'dBV' : 'dB';
          break;
        case 'dBm':
          yData = sp.dbm;
          yLabel = `Power (dBm, ${result.setup.conventions.refImpedanceOhm} Ω)`;
          yUnitStr = 'dBm';
          break;
        case 'nsd':
          yData = sp.nsdDbfsHz;
          yLabel = 'NSD (dBFS/Hz)';
          yUnitStr = 'dBFS/Hz';
          break;
        case 'asd': {
          // Display ASD in dB or log? Standard dB(V/sqrt(Hz))
          const out = new Float64Array(sp.asd.length);
          for (let i = 0; i < sp.asd.length; i++) {
            out[i] = 20 * Math.log10(Math.max(sp.asd[i], 1e-18));
          }
          yData = out;
          yLabel = `ASD (dB ${result.unit}/√Hz)`;
          yUnitStr = `dB ${result.unit}/√Hz`;
          break;
        }
      }
    }

    let yMax = -Infinity;
    let yMin = Infinity;
    for (let i = 1; i < yData.length; i++) {
      const v = yData[i];
      if (!Number.isFinite(v)) continue;
      if (v > yMax) yMax = v;
      if (v < yMin) yMin = v;
    }
    if (!Number.isFinite(yMax)) {
      yMax = 0;
      yMin = -140;
    }
    const topLim = Math.ceil((yMax + 8) / 10) * 10;
    const botLim = Math.max(topLim - 160, Math.floor((yMin - 10) / 10) * 10);

    const xMin =
      opts.xScale === 'log'
        ? Math.max(freqs[1] ?? sp.df, sp.df)
        : freqs[0] ?? 0;
    const xMax = freqs[freqs.length - 1] ?? sp.nyquist;

    const series: PlotSeries[] = [
      {
        id: 'primary',
        label: result.datasetName,
        x: freqs,
        y: yData,
        color: theme.palette[0],
        lineWidth: 1.25,
      },
    ];

    let xMaxAll = xMax;
    if (opts.compareResults && opts.compareResults.length > 0 && !useCzt) {
      opts.compareResults.forEach((other, idx) => {
        const yOther =
          opts.yUnit === 'dBV'
            ? other.spectrum.dbv
            : opts.yUnit === 'dBm'
              ? other.spectrum.dbm
              : opts.yUnit === 'nsd'
                ? other.spectrum.nsdDbfsHz
                : other.spectrum.dbfs;
        const otherMax = other.spectrum.freqs[other.spectrum.freqs.length - 1] ?? other.spectrum.nyquist;
        if (otherMax > xMaxAll) xMaxAll = otherMax;
        series.push({
          id: `cmp-${idx}`,
          label: other.datasetName,
          x: other.spectrum.freqs,
          y: yOther,
          color: theme.palette[(idx + 1) % theme.palette.length],
          lineWidth: 1.1,
        });
      });
    }

    const markers: PlotMarker[] = [];
    if (opts.showMarkers && !useCzt && opts.yUnit !== 'asd' && opts.yUnit !== 'nsd') {
      const pickY = (bin: number) => yData[Math.min(yData.length - 1, Math.max(0, bin))];
      markers.push({
        x: result.tone.freqHz,
        y: pickY(result.tone.bin),
        label: 'f0',
        color: theme.accentFundamental,
        shape: 'circle',
      });
      if (result.secondTone) {
        markers.push({
          x: result.secondTone.freqHz,
          y: pickY(result.secondTone.bin),
          label: 'f1',
          color: theme.accentFundamental,
          shape: 'circle',
        });
      }
      for (const h of result.harmonics.slice(0, 7)) {
        markers.push({
          x: h.foldedFreqHz,
          y: pickY(h.bin),
          label: `H${h.order}`,
          color: theme.accentHarmonic,
          shape: 'triangle',
        });
      }
      if (result.worstNonHarmonicSpur) {
        markers.push({
          x: result.worstNonHarmonicSpur.freqHz,
          y: pickY(result.worstNonHarmonicSpur.bin),
          label: 'Spur',
          color: theme.accentSpur,
          shape: 'diamond',
        });
      }
    }

    const hLines: PlotHLine[] = [];
    if (!useCzt && opts.yUnit === 'dBFS') {
      if (opts.showNoiseFloor && sp.meanNoiseBinDbfs !== null) {
        hLines.push({
          y: sp.meanNoiseBinDbfs,
          label: `Mean bin floor (${sp.meanNoiseBinDbfs.toFixed(1)} dBFS)`,
          color: theme.accentFloor,
          dash: [5, 4],
        });
      }
      if (opts.showIdealFloor && sp.idealFloorDbfs !== null && result.setup.bits) {
        hLines.push({
          y: sp.idealFloorDbfs,
          label: `Ideal ${result.setup.bits}-bit floor (${sp.idealFloorDbfs.toFixed(1)} dBFS)`,
          color: theme.accentIdeal,
          dash: [2, 3],
        });
      }
    }

    const vSpans: PlotSpan[] = [];
    if (result.setup.band) {
      vSpans.push({
        x0: Math.max(xMin, result.setup.band[0]),
        x1: Math.min(xMax, result.setup.band[1]),
        color: theme.bandFill,
        label: 'Analysis band',
      });
    }

    const isCompare = Boolean(opts.compareResults && opts.compareResults.length > 0);
    return {
      kind: 'spectrum',
      title: isCompare
        ? `Spectrum comparison (${series.length} datasets)`
        : `${result.datasetName} — ${result.resolvedWindow} (N = ${result.setup.n.toLocaleString()})`,
      xLabel: 'Frequency (Hz)',
      yLabel,
      xUnit: 'Hz',
      yUnit: yUnitStr,
      xScale: opts.xScale,
      yScale: 'linear',
      xLim: [xMin, xMaxAll],
      yLim: [botLim, topLim],
      themeId: opts.themeId,
      series,
      markers,
      hLines,
      vSpans,
      xTickFormatter: 'si-hz',
      yTickFormatter: 'number',
      showLegend: series.length > 1 || hLines.length > 0,
    };
  }

  if (tab === 'time') {
    const tp = result.timePlot;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let i = 0; i < tp.y.length; i++) {
      if (tp.y[i] < yMin) yMin = tp.y[i];
      if (tp.y[i] > yMax) yMax = tp.y[i];
    }
    const pad = Math.max((yMax - yMin) * 0.1, 1e-9);
    const series: PlotSeries[] = [
      {
        id: 'signal',
        label: result.signalLabel,
        x: tp.t,
        y: tp.y,
        color: theme.palette[0],
        lineWidth: 1.25,
      },
    ];
    if (tp.cm) {
      series.push({
        id: 'cm',
        label: 'Common-mode',
        x: tp.t,
        y: tp.cm,
        color: theme.palette[1],
        lineWidth: 1.1,
        dash: [4, 3],
      });
    }
    const x0 = tp.t[0] ?? 0;
    const x1 = tp.t[tp.t.length - 1] ?? 1;
    return {
      kind: 'time',
      title: `Time domain — ${result.signalLabel}`,
      xLabel: 'Time (s)',
      yLabel: `Amplitude (${result.unit})`,
      xUnit: 's',
      yUnit: result.unit,
      xScale: 'linear',
      yScale: 'linear',
      xLim: [x0, x1 > x0 ? x1 : x0 + 1],
      yLim: [yMin - pad, yMax + pad],
      themeId: opts.themeId,
      series,
      markers: [],
      hLines: [],
      vSpans: [
        {
          x0: tp.activeStartT,
          x1: tp.activeEndT,
          color: theme.bandFill,
          label: 'FFT window',
        },
      ],
      xTickFormatter: 'si-s',
      yTickFormatter: 'number',
      showLegend: series.length > 1,
    };
  }

  if (tab === 'harmonics') {
    const hs = result.harmonics;
    const xs = hs.map((h) => h.order);
    const ys = hs.map((h) => h.dbc);
    let yMin = -120;
    for (const v of ys) {
      if (Number.isFinite(v) && v - 10 < yMin) yMin = Math.floor((v - 10) / 10) * 10;
    }
    return {
      kind: 'harmonics',
      title: `Harmonic distortion (${hs.length} harmonics, dBc)`,
      xLabel: 'Harmonic order',
      yLabel: 'Level (dBc)',
      xUnit: '',
      yUnit: 'dBc',
      xScale: 'linear',
      yScale: 'linear',
      xLim: [1.5, Math.max(5.5, (xs[xs.length - 1] ?? 10) + 0.5)],
      yLim: [Math.max(-180, yMin), 0],
      themeId: opts.themeId,
      series: [
        {
          id: 'harmonics',
          label: 'Harmonics (dBc)',
          x: xs,
          y: ys,
          color: theme.accentHarmonic,
          kind: 'bar',
          barWidth: 0.6,
        },
      ],
      markers: [],
      hLines: [],
      vSpans: [],
      xTickFormatter: 'harmonic',
      yTickFormatter: 'number',
      showLegend: false,
    };
  }

  if (tab === 'window') {
    const wm = result.windowMetrics;
    return {
      kind: 'window',
      title: `Window frequency response — ${wm.kind} (ENBW = ${wm.enbwBins.toFixed(3)} bins, sidelobe ${wm.highestSidelobeDb.toFixed(1)} dB)`,
      xLabel: 'Offset from carrier (bins)',
      yLabel: 'Normalized response (dB)',
      xUnit: 'bins',
      yUnit: 'dB',
      xScale: 'linear',
      yScale: 'linear',
      xLim: [-16, 16],
      yLim: [-140, 5],
      themeId: opts.themeId,
      series: [
        {
          id: 'win-freq',
          label: `${wm.kind} |W(f)|`,
          x: wm.freqBins,
          y: wm.freqDb,
          color: theme.palette[0],
          lineWidth: 1.5,
        },
      ],
      markers: [],
      hLines: [
        {
          y: wm.highestSidelobeDb,
          label: `Highest sidelobe (${wm.highestSidelobeDb.toFixed(1)} dB)`,
          color: theme.accentHarmonic,
          dash: [5, 4],
        },
      ],
      vSpans: [],
      xTickFormatter: 'number',
      yTickFormatter: 'number',
      showLegend: true,
    };
  }

  // Integrated noise curve (tab === 'intnoise')
  const sp = result.spectrum;
  let yMax = 0;
  for (let i = 0; i < sp.cumulativeNoiseRms.length; i++) {
    if (sp.cumulativeNoiseRms[i] > yMax) yMax = sp.cumulativeNoiseRms[i];
  }
  const xMin = opts.xScale === 'log' ? Math.max(sp.freqs[1] ?? sp.df, sp.df) : 0;
  return {
    kind: 'intnoise',
    title: `Cumulative integrated RMS noise (${result.unit}rms)`,
    xLabel: 'Frequency (Hz)',
    yLabel: `Cumulative RMS noise (${result.unit}rms)`,
    xUnit: 'Hz',
    yUnit: `${result.unit}rms`,
    xScale: opts.xScale,
    yScale: 'linear',
    xLim: [xMin, sp.nyquist],
    yLim: [0, Math.max(yMax * 1.12, 1e-12)],
    themeId: opts.themeId,
    series: [
      {
        id: 'intnoise',
        label: 'Cumulative noise',
        x: sp.freqs,
        y: sp.cumulativeNoiseRms,
        color: theme.palette[4],
        lineWidth: 1.6,
      },
    ],
    markers: [],
    hLines: [],
    vSpans: result.setup.band
      ? [
          {
            x0: Math.max(xMin, result.setup.band[0]),
            x1: Math.min(sp.nyquist, result.setup.band[1]),
            color: theme.bandFill,
          },
        ]
      : [],
    xTickFormatter: 'si-hz',
    yTickFormatter: 'si',
    showLegend: false,
  };
}

/** Compute matplotlib-proportioned PlotLayout for a target pixel rectangle. */
export function layoutPlot(spec: PlotSpec, width: number, height: number): PlotLayout {
  const theme = PLOT_THEMES[spec.themeId] ?? PLOT_THEMES['mpl-default'];
  // Matplotlib default figure subplot margins (6.4 x 4.8): left 0.125, right 0.90, bottom 0.11, top 0.88
  const padLeft = Math.max(66, Math.round(width * 0.115));
  const padRight = Math.max(24, Math.round(width * 0.04));
  const padTop = Math.max(36, Math.round(height * 0.095));
  const padBottom = Math.max(46, Math.round(height * 0.125));

  const axes: PlotRect = {
    x: padLeft,
    y: padTop,
    w: Math.max(60, width - padLeft - padRight),
    h: Math.max(60, height - padTop - padBottom),
  };

  const [x0, x1] = spec.xLim;
  const [y0, y1] = spec.yLim;
  const isLogX = spec.xScale === 'log';
  const logX0 = Math.log10(Math.max(x0, 1e-15));
  const logX1 = Math.log10(Math.max(x1, Math.max(x0, 1e-15) * 1.01));

  const xToPx = (v: number): number => {
    if (isLogX) {
      const lv = Math.log10(Math.max(v, 1e-15));
      return axes.x + ((lv - logX0) / (logX1 - logX0)) * axes.w;
    }
    const denom = x1 - x0 || 1;
    return axes.x + ((v - x0) / denom) * axes.w;
  };

  const yToPx = (v: number): number => {
    const denom = y1 - y0 || 1;
    return axes.y + axes.h - ((v - y0) / denom) * axes.h;
  };

  const pxToX = (px: number): number => {
    const t = (px - axes.x) / axes.w;
    if (isLogX) {
      return Math.pow(10, logX0 + t * (logX1 - logX0));
    }
    return x0 + t * (x1 - x0);
  };

  const pxToY = (py: number): number => {
    const t = (axes.y + axes.h - py) / axes.h;
    return y0 + t * (y1 - y0);
  };

  const rawXTicks = isLogX ? logTicks(x0, x1) : maxNTicks(x0, x1, Math.min(7, Math.max(4, Math.floor(axes.w / 105))));
  const rawYTicks = maxNTicks(y0, y1, Math.min(7, Math.max(4, Math.floor(axes.h / 55))));

  const xTicks: AxisTick[] = rawXTicks.map((value) => ({
    value,
    label: formatTickLabel(value, spec.xTickFormatter),
    pos: xToPx(value),
  }));

  const yTicks: AxisTick[] = rawYTicks.map((value) => ({
    value,
    label: formatTickLabel(value, spec.yTickFormatter),
    pos: yToPx(value),
  }));

  const decimatedSeries = spec.series.map((s) => {
    if (s.kind === 'bar') {
      const bwData = s.barWidth ?? 0.6;
      const bars: { x: number; y: number; w: number; h: number }[] = [];
      const basePy = yToPx(y0);
      const n = Math.min(s.x.length, s.y.length);
      for (let i = 0; i < n; i++) {
        const pxL = xToPx(s.x[i] - bwData / 2);
        const pxR = xToPx(s.x[i] + bwData / 2);
        const pyTop = Math.min(axes.y + axes.h, Math.max(axes.y, yToPx(s.y[i])));
        bars.push({
          x: pxL,
          y: Math.min(pyTop, basePy),
          w: Math.max(2, pxR - pxL),
          h: Math.abs(basePy - pyTop),
        });
      }
      return {
        id: s.id,
        label: s.label,
        color: s.color,
        lineWidth: s.lineWidth ?? 1.25,
        dash: s.dash ?? [],
        kind: 'bar' as const,
        barWidthPx: bars[0]?.w ?? 10,
        points: [],
        bars,
      };
    }
    const points = decimateSeriesMinMax(s.x, s.y, spec.xLim, xToPx, yToPx, axes.x, axes.w, isLogX);
    return {
      id: s.id,
      label: s.label,
      color: s.color,
      lineWidth: s.lineWidth ?? 1.25,
      dash: s.dash ?? [],
      kind: 'line' as const,
      barWidthPx: 0,
      points,
      bars: [],
    };
  });

  return {
    width,
    height,
    axes,
    theme,
    spec,
    xTicks,
    yTicks,
    xToPx,
    yToPx,
    pxToX,
    pxToY,
    decimatedSeries,
  };
}

export interface HoverReadout {
  px: number;
  py: number;
  dataX: number;
  dataY: number;
  snappedX: number;
  snappedY: number;
}

/** Render a PlotLayout to a Canvas 2D context (HiDPI safe). */
export function renderPlotToCanvas(
  ctx: CanvasRenderingContext2D,
  layout: PlotLayout,
  dpr = 1,
  options?: { transparentBg?: boolean; hover?: HoverReadout | null },
): void {
  const { width, height, axes, theme, spec, xTicks, yTicks } = layout;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  if (!options?.transparentBg) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = theme.axesBg;
    ctx.fillRect(axes.x, axes.y, axes.w, axes.h);
  }

  // Vertical shaded spans (clipped to axes)
  ctx.save();
  ctx.beginPath();
  ctx.rect(axes.x, axes.y, axes.w, axes.h);
  ctx.clip();

  for (const span of spec.vSpans) {
    const sx0 = Math.max(axes.x, layout.xToPx(span.x0));
    const sx1 = Math.min(axes.x + axes.w, layout.xToPx(span.x1));
    if (sx1 > sx0) {
      ctx.fillStyle = span.color;
      ctx.fillRect(sx0, axes.y, sx1 - sx0, axes.h);
    }
  }

  // Grid lines
  if (theme.showGrid) {
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([]);
    for (const t of xTicks) {
      if (t.pos < axes.x || t.pos > axes.x + axes.w) continue;
      ctx.beginPath();
      ctx.moveTo(t.pos, axes.y);
      ctx.lineTo(t.pos, axes.y + axes.h);
      ctx.stroke();
    }
    for (const t of yTicks) {
      if (t.pos < axes.y || t.pos > axes.y + axes.h) continue;
      ctx.beginPath();
      ctx.moveTo(axes.x, t.pos);
      ctx.lineTo(axes.x + axes.w, t.pos);
      ctx.stroke();
    }
  }

  // Horizontal reference lines
  for (const hl of spec.hLines) {
    const py = layout.yToPx(hl.y);
    if (py < axes.y || py > axes.y + axes.h) continue;
    ctx.strokeStyle = hl.color;
    ctx.lineWidth = 1.1;
    ctx.setLineDash(hl.dash ?? [5, 4]);
    ctx.beginPath();
    ctx.moveTo(axes.x, py);
    ctx.lineTo(axes.x + axes.w, py);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Series
  for (const s of layout.decimatedSeries) {
    if (s.kind === 'bar') {
      ctx.fillStyle = s.color;
      for (const b of s.bars) {
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
    } else if (s.points.length > 0) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.lineWidth;
      ctx.setLineDash(s.dash);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(s.points[0][0], s.points[0][1]);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i][0], s.points[i][1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Markers
  const placedLabels: { x: number; y: number; w: number; h: number }[] = [];
  ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
  for (const m of spec.markers) {
    if (spec.xScale === 'log' && m.x <= 0) continue;
    const px = layout.xToPx(m.x);
    const py = layout.yToPx(m.y);
    if (px < axes.x || px > axes.x + axes.w || py < axes.y - 2 || py > axes.y + axes.h + 2) {
      continue;
    }
    ctx.fillStyle = m.color;
    ctx.strokeStyle = theme.axesBg;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (m.shape === 'circle') {
      ctx.arc(px, py, 4, 0, Math.PI * 2);
    } else if (m.shape === 'triangle') {
      ctx.moveTo(px, py - 4.5);
      ctx.lineTo(px + 4, py + 3.5);
      ctx.lineTo(px - 4, py + 3.5);
      ctx.closePath();
    } else {
      ctx.moveTo(px, py - 4.5);
      ctx.lineTo(px + 4.2, py);
      ctx.lineTo(px, py + 4.5);
      ctx.lineTo(px - 4.2, py);
      ctx.closePath();
    }
    ctx.fill();
    ctx.stroke();

    // Non-overlapping label placement with generous padding so adjacent harmonics never collide
    const tw = ctx.measureText(m.label).width + 6;
    const lx = Math.min(axes.x + axes.w - tw, Math.max(axes.x + 2, px - tw / 2));
    const ly = Math.max(axes.y + 12, py - 8);
    const overlaps = placedLabels.some(
      (b) => Math.abs(b.x - lx) < (b.w + tw) * 0.5 + 8 && Math.abs(b.y - ly) < 15,
    );
    if (!overlaps) {
      ctx.fillStyle = m.color;
      ctx.fillText(m.label, lx, ly);
      placedLabels.push({ x: lx, y: ly, w: tw, h: 12 });
    }
  }

  // Hover crosshair
  if (options?.hover) {
    const { px, py } = options.hover;
    if (px >= axes.x && px <= axes.x + axes.w && py >= axes.y && py <= axes.y + axes.h) {
      ctx.strokeStyle = theme.spine;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(px, axes.y);
      ctx.lineTo(px, axes.y + axes.h);
      ctx.moveTo(axes.x, py);
      ctx.lineTo(axes.x + axes.w, py);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.palette[0];
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore(); // end clip

  // Four matplotlib spines
  ctx.strokeStyle = theme.spine;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(axes.x + 0.5, axes.y + 0.5, axes.w, axes.h);

  // Outward ticks & labels
  ctx.fillStyle = theme.fg;
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of xTicks) {
    if (t.pos < axes.x - 1 || t.pos > axes.x + axes.w + 1) continue;
    ctx.beginPath();
    ctx.moveTo(t.pos, axes.y + axes.h);
    ctx.lineTo(t.pos, axes.y + axes.h + 4);
    ctx.stroke();
    ctx.fillText(t.label, t.pos, axes.y + axes.h + 7);
  }

  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of yTicks) {
    if (t.pos < axes.y - 1 || t.pos > axes.y + axes.h + 1) continue;
    ctx.beginPath();
    ctx.moveTo(axes.x, t.pos);
    ctx.lineTo(axes.x - 4, t.pos);
    ctx.stroke();
    ctx.fillText(t.label, axes.x - 7, t.pos);
  }

  // Title
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = '600 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(spec.title, axes.x + axes.w / 2, axes.y - 10);

  // X label
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(spec.xLabel, axes.x + axes.w / 2, height - 6);

  // Y label (rotated)
  ctx.save();
  ctx.translate(15, axes.y + axes.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(spec.yLabel, 0, 0);
  ctx.restore();

  // Legend (top-right inside axes, matplotlib frame style)
  if (spec.showLegend) {
    const items: { label: string; color: string; dash: number[] }[] = [
      ...spec.series.map((s) => ({ label: s.label, color: s.color, dash: s.dash ?? [] })),
      ...spec.hLines.map((h) => ({ label: h.label, color: h.color, dash: h.dash ?? [5, 4] })),
    ];
    if (items.length > 0) {
      ctx.font = '10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      let maxW = 0;
      for (const it of items) {
        const w = ctx.measureText(it.label).width;
        if (w > maxW) maxW = w;
      }
      const boxW = Math.min(axes.w * 0.55, maxW + 34);
      const rowH = 15;
      const boxH = items.length * rowH + 10;
      const bx = axes.x + axes.w - boxW - 8;
      const by = axes.y + 8;

      ctx.save();
      ctx.fillStyle = theme.axesBg;
      ctx.globalAlpha = 0.88;
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 0.8;
      ctx.strokeRect(bx, by, boxW, boxH);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      items.forEach((it, idx) => {
        const ry = by + 5 + rowH * (idx + 0.5);
        ctx.strokeStyle = it.color;
        ctx.lineWidth = 1.6;
        ctx.setLineDash(it.dash);
        ctx.beginPath();
        ctx.moveTo(bx + 7, ry);
        ctx.lineTo(bx + 21, ry);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = theme.fg;
        ctx.fillText(it.label, bx + 26, ry, boxW - 32);
      });
      ctx.restore();
    }
  }

  ctx.restore();
}

/** Snap pointer coordinates inside the axes box to the nearest point on the primary series. */
export function snapHoverPoint(layout: PlotLayout, px: number, py: number): HoverReadout | null {
  const { axes, spec } = layout;
  if (px < axes.x || px > axes.x + axes.w || py < axes.y || py > axes.y + axes.h) {
    return null;
  }
  const dataX = layout.pxToX(px);
  const dataY = layout.pxToY(py);
  const primary = spec.series[0];
  if (!primary || primary.x.length === 0) {
    return { px, py, dataX, dataY, snappedX: dataX, snappedY: dataY };
  }
  // Binary search (x is monotonic ascending across all plot types)
  const xs = primary.x;
  const ys = primary.y;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < dataX) lo = mid + 1;
    else hi = mid;
  }
  let best = lo;
  if (lo > 0 && Math.abs(xs[lo - 1] - dataX) < Math.abs(xs[lo] - dataX)) {
    best = lo - 1;
  }
  const sx = xs[best];
  const sy = ys[best];
  return {
    px: layout.xToPx(sx),
    py: layout.yToPx(sy),
    dataX,
    dataY,
    snappedX: sx,
    snappedY: sy,
  };
}
