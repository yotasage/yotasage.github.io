// The Export section (step M8.3a, plan.md D18): the chart as a figure for a report. The options of the figure model
// (lib/smith/figure.ts: whole chart or the chart's current view, width, detail preset and items, colour mode, text
// size), a preview at its true size in CSS millimetres (figureSvg.ts in a frame of the figure's width, its text at its
// pt size), and the files: TikZ to copy or save (figureTikz.ts: the picture or the standalone document), SVG, and PNG
// at 1× to 8× (the same SVG rasterised on a canvas). One `Figure` feeds the preview and every file, so they cannot
// disagree. Files are made on the device (a Blob and a download link); nothing is sent anywhere.
//
// Cost: nothing is built until the section comes near the screen (IntersectionObserver), and then only when an option,
// the circuit, the sweep or the solve changes; the circuit changes on a commit only, never in a drag's frames, and a
// build asked for during a drag waits for its release. "Current view" follows the chart's view while the section is on
// screen by reading five numbers every POLL_MS and building when the view has stood still for one tick. The options
// are kept in localStorage (`smith.export`, read after mount) and in the project file.
//
// M8.3b: the data files (CSV of the nodes, the trace or the markers in the page's digits or every digit; Touchstone
// .s1p of S11 over the sweep), the project file (save; open from a file picker here, or by a drop anywhere on the
// page, both read by the page with `onOpen`, on the device only) and Copy link. An opened project's export settings
// arrive as `opened` and become the options here (and the chart's view when it holds a window).

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_PT, DETAIL_NAMES, DETAIL_PRESETS, LINEWIDTH_MM, MAX_WIDTH, MIN_PT, MIN_WIDTH, PX_MM, SIZE_PRESETS,
  blankDetail, buildFigure, readWidth, resolveDetail,
} from '../../lib/smith/figure';
import type { Density, Detail, DetailPreset, Figure, FigureInput, FigureOptions, GridKind, SizePreset } from '../../lib/smith/figure';
import { COLOUR_MODES } from '../../lib/smith/figureStyle';
import type { ColourMode } from '../../lib/smith/figureStyle';
import { figureSvg } from '../../lib/smith/figureSvg';
import { figureTikz } from '../../lib/smith/figureTikz';
import type { GridWindow } from '../../lib/smith/grid';
import { CSV_DIGITS_MAX, markersCsv, nodesCsv, traceCsv } from '../../lib/smith/export/csv';
import type { CsvOptions, NumberForm } from '../../lib/smith/export/csv';
import { MAX_PT, PROJECT_EXTENSION, projectJson } from '../../lib/smith/export/project';
import type { ExportSettings } from '../../lib/smith/export/project';
import { TOUCHSTONE_FORMATS, touchstone } from '../../lib/smith/export/touchstone';
import type { TouchstoneFormat } from '../../lib/smith/export/touchstone';
import { sameCircuit } from '../../lib/smith/state';
import type { Circuit, SweepSetting } from '../../lib/smith/state';
import { Trace, markersAt, runSweep, sweepCircuit } from '../../lib/smith/sweep';
import type { MarkerPoint } from '../../lib/smith/sweep';
import type { ValueChoice } from '../../lib/smith/values';
import styles from '../../styles/Smith.module.css';
import css from '../../styles/SmithExport.module.css';
import type { ChartView } from './chartView';
import type { Outcome } from './SolvePanel';
import { shownDigits } from './readout';
import { Why } from './Why';

export const EXPORT_KEY = 'smith.export';
/** How often "Current view" reads the chart's view while the section is on screen (ms). */
export const POLL_MS = 400;
/** PNG scale factors offered. */
export const PNG_FACTORS = [1, 2, 3, 4, 6, 8] as const;
/** The largest PNG side and area the page makes (Chromium's canvas holds 16384 px a side; memory the rest). */
export const PNG_MAX_SIDE = 16384;
export const PNG_MAX_AREA = 120e6;
/** The preview's SVG id (its clip paths are named after it); the saved files use figureSvg's default. */
export const PREVIEW_ID = 'smith-export-preview';
const TEXT_SIZES = [6, 7, 8, 9, 10, 11, 12];

type Area = 'whole' | 'view';
type Size = SizePreset | 'other';
type Tex = 'picture' | 'document';

export interface ExportPrefs {
  area: Area;
  size: Size;
  /** The width typed under Other ("120 mm", "4.5 in", "\linewidth"). */
  other: string;
  detail: DetailPreset | Detail;
  colour: ColourMode;
  fontPt: number;
  tex: Tex;
  png: number;
  fit: boolean;
  /** CSV: every digit (else the digits the page shows), plain or engineering numbers. */
  csvAll: boolean;
  csvForm: NumberForm;
  /** Touchstone's number format. */
  ts: TouchstoneFormat;
}

export const DEFAULT_PREFS: Readonly<ExportPrefs> = {
  area: 'whole', size: 'column', other: '\\linewidth', detail: 'standard', colour: 'colour', fontPt: DEFAULT_PT, tex: 'picture', png: 2, fit: true,
  csvAll: false, csvForm: 'plain', ts: 'RI',
};

const SIZES: readonly { id: Size; label: string; title: string }[] = [
  { id: 'column', label: '88 mm', title: 'A column of a two-column paper' },
  { id: 'text', label: '160 mm', title: 'The text width of an A4 report' },
  { id: 'page', label: '180 mm', title: 'A page width with small margins' },
  { id: 'other', label: 'Other', title: 'Any width in mm, cm or in, or \\linewidth' },
];
const COLOUR_NAMES: Readonly<Record<ColourMode, string>> = { colour: 'Colour', grey: 'Greyscale', bw: 'Black and white' };
const DETAIL_LABELS: Readonly<Record<DetailPreset, string>> = { minimal: 'Minimal', standard: 'Standard', full: 'Full' };
const DENSITIES: readonly Density[] = ['coarse', 'normal', 'fine'];
const GRIDS: readonly { id: GridKind; label: string }[] = [{ id: 'z', label: 'Z' }, { id: 'y', label: 'Y' }, { id: 'zy', label: 'ZY' }];
/** The switchable items, in the order of the list. */
const ITEMS: readonly { k: keyof Detail; label: string }[] = [
  { k: 'gridLabels', label: 'Grid labels' }, { k: 'scales', label: 'Perimeter scales' }, { k: 'path', label: 'Path' },
  { k: 'nodes', label: 'Nodes' }, { k: 'nodeLabels', label: 'Node labels' }, { k: 'loci', label: 'Part arcs' },
  { k: 'goal', label: 'Goal' }, { k: 'construction', label: 'Construction circles' }, { k: 'solutions', label: 'Solutions' },
  { k: 'trace', label: 'Trace' }, { k: 'markers', label: 'Markers' }, { k: 'legend', label: 'Legend' },
];
const DETAIL_KEYS = Object.keys(DETAIL_PRESETS.standard) as (keyof Detail)[];

/** The preset a detail equals, or null. */
export function presetOf(d: Readonly<Detail>): DetailPreset | null {
  for (const p of DETAIL_NAMES) if (DETAIL_KEYS.every((k) => DETAIL_PRESETS[p][k] === d[k])) return p;
  return null;
}

/** Prefs read from storage, every field checked (anything unreadable keeps its default). */
export function readPrefs(text: string | null): ExportPrefs {
  const out: ExportPrefs = { ...DEFAULT_PREFS };
  let v: Record<string, unknown>;
  try { v = text ? JSON.parse(text) : null; } catch { return out; }
  if (!v || typeof v !== 'object') return out;
  if (v.area === 'whole' || v.area === 'view') out.area = v.area;
  if (SIZES.some((s) => s.id === v.size)) out.size = v.size as Size;
  if (typeof v.other === 'string' && v.other.length <= 40) out.other = v.other;
  if (typeof v.detail === 'string' && (DETAIL_NAMES as readonly string[]).includes(v.detail)) out.detail = v.detail as DetailPreset;
  else if (v.detail && typeof v.detail === 'object') {
    const d = { ...DETAIL_PRESETS.standard } as Detail, src = v.detail as Record<string, unknown>;
    for (const k of DETAIL_KEYS) {
      const x = src[k];
      if (k === 'density') { if (DENSITIES.includes(x as Density)) d.density = x as Density; } else if (k === 'grid') { if (GRIDS.some((g) => g.id === x)) d.grid = x as GridKind; } else if (typeof x === 'boolean') (d as unknown as Record<string, boolean>)[k] = x;
    }
    out.detail = presetOf(d) ?? d;
  }
  if (COLOUR_MODES.includes(v.colour as ColourMode)) out.colour = v.colour as ColourMode;
  // A project may set any size the figure takes; the list shows it as an extra choice.
  if (typeof v.fontPt === 'number' && v.fontPt >= MIN_PT && v.fontPt <= MAX_PT) out.fontPt = v.fontPt;
  if (v.tex === 'picture' || v.tex === 'document') out.tex = v.tex;
  if ((PNG_FACTORS as readonly number[]).includes(v.png as number)) out.png = v.png as number;
  if (typeof v.fit === 'boolean') out.fit = v.fit;
  if (typeof v.csvAll === 'boolean') out.csvAll = v.csvAll;
  if (v.csvForm === 'plain' || v.csvForm === 'eng') out.csvForm = v.csvForm;
  if (TOUCHSTONE_FORMATS.includes(v.ts as TouchstoneFormat)) out.ts = v.ts as TouchstoneFormat;
  return out;
}

/** The width the prefs ask for, or null when Other cannot be read. */
export function widthOf(p: Readonly<ExportPrefs>): { mm: number; linewidth: boolean } | null {
  return p.size === 'other' ? readWidth(p.other) : { mm: SIZE_PRESETS[p.size], linewidth: false };
}

/** The window in Γ (y up) the chart shows now. */
export function chartWindow(v: ChartView): GridWindow | null {
  if (!(v.k > 0 && v.w > 0 && v.h > 0)) return null;
  const hw = v.w / (2 * v.k), hh = v.h / (2 * v.k);
  return { x0: v.cx - hw, y0: v.cy - hh, x1: v.cx + hw, y1: v.cy + hh };
}

/** The project's export settings of the prefs (the figure's width, the chart's window for "current view"). */
export function settingsOf(p: Readonly<ExportPrefs>, view: GridWindow | null, digits: number): ExportSettings {
  const w = widthOf(p) ?? { mm: SIZE_PRESETS.column, linewidth: false };
  return {
    width: w.mm, linewidth: w.linewidth, view: p.area === 'view' ? view : null, detail: p.detail, colour: p.colour,
    fontPt: p.fontPt, digits: p.csvAll ? 0 : Math.min(CSV_DIGITS_MAX, Math.max(1, digits)), form: p.csvForm, touchstone: p.ts,
  };
}

/** The prefs an opened project's settings ask for (what the project does not hold stays as it is). */
export function prefsOf(e: Readonly<ExportSettings>, p: Readonly<ExportPrefs>): ExportPrefs {
  const preset = e.linewidth ? null : (Object.keys(SIZE_PRESETS) as SizePreset[]).find((k) => SIZE_PRESETS[k] === e.width);
  return {
    ...p, area: e.view ? 'view' : 'whole', size: preset ?? 'other', other: e.linewidth ? '\linewidth' : preset ? p.other : `${e.width} mm`,
    detail: typeof e.detail === 'string' ? e.detail : presetOf(e.detail) ?? e.detail, colour: e.colour, fontPt: e.fontPt,
    csvAll: e.digits === 0, csvForm: e.form, ts: e.touchstone,
  };
}

/** The PNG's size in px at a factor: the figure's mm at 96 dpi times the factor. */
export function pngSize(fig: Pick<Figure, 'width' | 'height'>, f: number): [number, number] {
  return [Math.round((fig.width / PX_MM) * f), Math.round((fig.height / PX_MM) * f)];
}
const pngFits = (w: number, h: number): boolean => w <= PNG_MAX_SIDE && h <= PNG_MAX_SIDE && w * h <= PNG_MAX_AREA;

/** Saves a Blob as a file on the device. */
function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** The SVG drawn on a canvas of w × h px, as a PNG Blob. */
function rasterise(svg: string, w: number, h: number): Promise<Blob> {
  return new Promise((done, fail) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const g = canvas.getContext('2d');
        g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? done(b) : fail(new Error('The canvas gave no PNG.'))), 'image/png');
      } catch (e) { URL.revokeObjectURL(url); fail(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('The SVG could not be drawn.')); };
    img.src = url;
  });
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* Try the old way. */ }
  const t = document.createElement('textarea');
  t.value = text;
  t.setAttribute('readonly', '');
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* Not allowed. */ }
  t.remove();
  return ok;
}

const kB = (n: number): string => `${n < 10240 ? (n / 1024).toFixed(1) : Math.round(n / 1024)} kB`;
const mmText = (mm: number): string => `${Math.round(mm * 10) / 10} mm`;

export interface ExportPanelProps {
  circuit: Circuit;
  sweep: SweepSetting | null;
  /** The Solve panel's outcome: its construction is drawn when it is for this circuit. */
  outcome: Outcome | null;
  chart: () => ChartView | null;
  /** Whether a handle is being dragged (a build waits for the release). */
  busy: () => boolean;
  /** The page's link (the query after "?"), for Copy link and the .s1p's comment. */
  search: string;
  /** The visitor's value lists, kept in the project. */
  lists: ValueChoice;
  /** The page's digits setting ("as shown" in the CSV). */
  digits: number;
  /** The export settings of the project opened last (a new `seq` applies them). */
  opened: { exports: ExportSettings; seq: number } | null;
  /** Opens a project file or a link saved as text (read by the page, on the device). */
  onOpen: (file: File) => void;
}

/** What the harness reads (`[data-export]`.smithExport). */
export interface ExportProbe {
  fig: Figure | null;
  options: FigureOptions | null;
  input: FigureInput | null;
  builds: number;
  buildMs: number;
}

interface Info { width: number; height: number; linewidth: boolean; whole: boolean; ms: number; dropped: number }

function ExportPanel({ circuit, sweep, outcome, chart, busy, search, lists, digits, opened, onOpen }: ExportPanelProps) {
  const root = useRef<HTMLElement>(null);
  const frameWrap = useRef<HTMLDivElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const [prefs, setPrefsState] = useState<ExportPrefs>(DEFAULT_PREFS);
  const [visible, setVisible] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [room, setRoom] = useState(0);
  const [note, setNote] = useState('');
  const probe = useRef<ExportProbe>({ fig: null, options: null, input: null, builds: 0, buildMs: 0 });
  const built = useRef<{ view: GridWindow | null }>({ view: null });
  // The trace of the sweep, kept while the circuit and the band stay (a 10,000-point sweep takes about 3 ms).
  const traceCache = useRef<{ circuit: Circuit | null; sweep: SweepSetting | null; input: FigureInput | null; trace: Trace | null; markers: MarkerPoint[] | null }>(
    { circuit: null, sweep: null, input: null, trace: null, markers: null });

  // Read after mount (the static page has the defaults).
  useEffect(() => {
    let text: string | null = null;
    try { text = window.localStorage.getItem(EXPORT_KEY); } catch { /* Storage can be blocked. */ }
    if (text) setPrefsState(readPrefs(text));
  }, []);
  const setPrefs = useCallback((change: Partial<ExportPrefs> | ((p: ExportPrefs) => ExportPrefs)) => {
    setPrefsState((p) => {
      const next = typeof change === 'function' ? change(p) : { ...p, ...change };
      try { window.localStorage.setItem(EXPORT_KEY, JSON.stringify(next)); } catch { /* Kept for this visit. */ }
      return next;
    });
  }, []);
  // An opened project's settings (after the stored ones above): the options, and the chart's view when it has a window.
  const openedSeq = useRef(0);
  useEffect(() => {
    if (!opened || opened.seq === openedSeq.current) return;
    openedSeq.current = opened.seq;
    const e = opened.exports;
    setPrefs((p) => prefsOf(e, p));
    const v = chart(), w = e.view;
    if (v && w && v.w > 0 && v.h > 0) v.setView((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, Math.min(v.w / (w.x1 - w.x0), v.h / (w.y1 - w.y0)));
  }, [opened, chart, setPrefs]);

  // Near the screen or not.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // The room the frame has, for "fit to screen" (only while near the screen).
  useEffect(() => {
    const el = frameWrap.current;
    if (!visible || !el) return undefined;
    const ro = new ResizeObserver(([e]) => setRoom(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [visible]);

  const width = widthOf(prefs);
  const detail = resolveDetail(prefs.detail);

  const inputFor = (): FigureInput => {
    const t = traceCache.current;
    const solve = outcome?.result && (outcome.circuit === circuit || sameCircuit(outcome.circuit, circuit)) ? outcome.result : null;
    if (t.circuit !== circuit || t.sweep !== sweep || !t.input) {
      let trace: Trace | null = null, markers: MarkerPoint[] | null = null;
      if (sweep) {
        const sc = sweepCircuit(circuit), tr = new Trace(1024);
        runSweep(tr, sweep.band, sc);
        trace = tr;
        markers = markersAt(sc, sweep.markers);
      }
      t.circuit = circuit;
      t.sweep = sweep;
      t.input = { circuit, solve: null, trace, markers };
      t.trace = trace;
      t.markers = markers;
    }
    return { ...t.input, solve };
  };

  // Builds the figure and writes the preview. Never in a drag: a build asked for then waits for the release.
  const buildRef = useRef<() => void>(null);
  buildRef.current = () => {
    if (!width || !preview.current) return;
    if (busy()) {
      const later = () => { window.removeEventListener('pointerup', later, true); setTimeout(() => buildRef.current(), 0); };
      window.addEventListener('pointerup', later, true);
      return;
    }
    const v = chart();
    const view = prefs.area === 'view' && v ? chartWindow(v) : null;
    const options: FigureOptions = { width: width.mm, linewidth: width.linewidth, view, detail: prefs.detail, colour: prefs.colour, fontPt: prefs.fontPt };
    const t0 = performance.now();
    const input = inputFor();
    const fig = buildFigure(input, options);
    preview.current.innerHTML = figureSvg(fig, { id: PREVIEW_ID });
    const ms = performance.now() - t0;
    const p = probe.current;
    p.fig = fig; p.options = options; p.input = input; p.builds++; p.buildMs = ms;
    built.current.view = view;
    setInfo({ width: fig.width, height: fig.height, linewidth: fig.linewidth, whole: fig.whole, ms, dropped: fig.dropped });
  };
  useEffect(() => {
    if (root.current) (root.current as HTMLElement & { smithExport?: ExportProbe }).smithExport = probe.current;
  }, []);
  // Built when near the screen and something it draws changed.
  useEffect(() => {
    if (visible) buildRef.current();
  }, [visible, circuit, sweep, outcome, prefs]);
  // "Current view": follow the chart's view while on screen, once it stands still.
  useEffect(() => {
    if (!visible || prefs.area !== 'view') return undefined;
    let last = '';
    const id = window.setInterval(() => {
      const v = chart();
      if (!v) return;
      const now = `${v.cx} ${v.cy} ${v.k} ${v.w} ${v.h}`;
      if (now !== last) { last = now; return; }
      const b = built.current.view, w = chartWindow(v);
      if (w && (!b || b.x0 !== w.x0 || b.x1 !== w.x1 || b.y0 !== w.y0 || b.y1 !== w.y1)) buildRef.current();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [visible, prefs.area, chart]);

  const fig = (): Figure | null => probe.current.fig;
  const stem = 'smith-chart';
  const link = (): string => `${window.location.origin}${window.location.pathname}?${search}`;
  const csvOptions = (): CsvOptions => ({ digits: prefs.csvAll ? 0 : shownDigits(), form: prefs.csvForm });
  const saveText = (text: string, type: string, name: string) => {
    save(new Blob([text], { type }), name);
    setNote(`Saved ${name} (${kB(new TextEncoder().encode(text).length)}).`);
  };
  const onNodes = () => saveText(nodesCsv(circuit, csvOptions()), 'text/csv;charset=utf-8', `${stem}-nodes.csv`);
  const onTrace = () => {
    const t = sweep && (inputFor(), traceCache.current.trace);
    if (t) saveText(traceCsv(t, circuit.z0, csvOptions()), 'text/csv;charset=utf-8', `${stem}-trace.csv`);
  };
  const onMarkers = () => {
    const m = sweep && (inputFor(), traceCache.current.markers);
    if (m && m.length) saveText(markersCsv(m, csvOptions()), 'text/csv;charset=utf-8', `${stem}-markers.csv`);
  };
  const onS1p = () => {
    const t = sweep && (inputFor(), traceCache.current.trace);
    if (t) saveText(touchstone({ freqs: t.freqs, gamma: t.gamma, n: t.n, z0: circuit.z0, link: link(), format: prefs.ts }), 'text/plain;charset=utf-8', `${stem}.s1p`);
  };
  const onProject = () => {
    const v = chart();
    const exports = settingsOf(prefs, prefs.area === 'view' && v ? chartWindow(v) : null, shownDigits());
    saveText(projectJson({ circuit, sweep, lists, exports }), 'application/json', `${stem}${PROJECT_EXTENSION}`);
  };
  const onCopyLink = async () => {
    const ok = await copyText(link());
    setNote(ok ? 'Copied the link: it opens this circuit, its lists and its sweep.' : 'The browser did not allow copying; copy the address bar instead.');
  };
  const onCopy = async () => {
    const f = fig();
    if (!f) return;
    const t = figureTikz(f);
    const text = prefs.tex === 'picture' ? t.picture : t.document;
    const ok = await copyText(text);
    setNote(ok ? `Copied the TikZ ${prefs.tex === 'picture' ? 'picture' : 'document'} (${kB(text.length)}).` : 'The browser did not allow copying; use Save .tex.');
  };
  const onTex = () => {
    const f = fig();
    if (!f) return;
    const t = figureTikz(f);
    const text = prefs.tex === 'picture' ? t.picture : t.document;
    save(new Blob([text], { type: 'application/x-tex' }), `${stem}.tex`);
    setNote(`Saved ${stem}.tex (${kB(text.length)}).`);
  };
  const onSvg = () => {
    const f = fig();
    if (!f) return;
    const text = figureSvg(f);
    save(new Blob([text], { type: 'image/svg+xml' }), `${stem}.svg`);
    setNote(`Saved ${stem}.svg (${kB(text.length)}).`);
  };
  const onPng = async () => {
    const f = fig();
    if (!f) return;
    const [w, h] = pngSize(f, prefs.png);
    if (!pngFits(w, h)) return;
    setNote('Drawing the PNG…');
    try {
      const b = await rasterise(figureSvg(f), w, h);
      save(b, `${stem}.png`);
      setNote(`Saved ${stem}.png (${w} × ${h} px, ${kB(b.size)}).`);
    } catch (e) {
      setNote(`No PNG: ${(e as Error).message}`);
    }
  };

  const trueW = info ? info.width / PX_MM : 0;
  const tooWide = !!info && room > 0 && trueW > room + 0.5;
  const fitted = tooWide && prefs.fit;
  const scale = fitted ? room / trueW : 1;
  const pngPx = info ? pngSize(info, prefs.png) : null;
  const preset = presetOf(detail);
  const sizeId = 'smith-export-size', otherId = 'smith-export-other';
  const toggle = (_on: boolean) => `${styles.button} ${styles.toggle} ${css.btn}`;

  const setItem = (k: keyof Detail, value: unknown) => {
    const d = { ...detail, [k]: value } as Detail;
    setPrefs({ detail: presetOf(d) ?? d });
  };

  return (
    <section id="export" ref={root} className={css.export} aria-labelledby="smith-export" data-export="">
      <h2 className={`${styles.panelTitle} ${css.title}`} id="smith-export">
        <span className={css.head}>Export <Why k="export" /></span>
        <span className={styles.panelNote}>figures, data and projects, made on this device</span>
      </h2>

      <div className={css.layout}>
        <div className={css.options}>
          <div className={css.group} role="group" aria-labelledby="smith-export-area">
            <span className={css.label} id="smith-export-area">Shows <Why k="export-area" /></span>
            <div className={css.pair}>
              {(['whole', 'view'] as const).map((a) => (
                <button key={a} type="button" className={toggle(prefs.area === a)} aria-pressed={prefs.area === a} data-export-area={a}
                  onClick={() => setPrefs({ area: a })}>{a === 'whole' ? 'Whole chart' : 'Current view'}</button>
              ))}
            </div>
          </div>

          <div className={css.group} role="group" aria-labelledby={sizeId}>
            <span className={css.label} id={sizeId}>Width <Why k="export-size" /></span>
            <div className={css.four}>
              {SIZES.map((s) => (
                <button key={s.id} type="button" className={toggle(prefs.size === s.id)} aria-pressed={prefs.size === s.id} data-export-size={s.id}
                  title={s.title} onClick={() => setPrefs({ size: s.id })}>{s.label}</button>
              ))}
            </div>
            {prefs.size === 'other' && (
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={otherId}>Width (mm, cm, in or \linewidth)</label>
                <input id={otherId} className={styles.input} data-export-other="" value={prefs.other} spellCheck={false} autoComplete="off"
                  aria-invalid={width ? undefined : true} aria-describedby={width ? undefined : `${otherId}-error`}
                  onChange={(e) => setPrefs({ other: e.currentTarget.value })} />
                {!width && <span className={styles.fieldError} id={`${otherId}-error`} data-export-error="">
                  Write a width from {MIN_WIDTH} to {MAX_WIDTH} mm, as 120 mm, 12 cm, 4.5 in, or \linewidth.</span>}
                {width?.linewidth && <span className={css.hint}>Fills the line where it is pasted; the grid and text are chosen for {LINEWIDTH_MM} mm.</span>}
              </div>
            )}
          </div>

          <div className={css.group} role="group" aria-labelledby="smith-export-detail">
            <span className={css.label} id="smith-export-detail">Detail <Why k="export-detail" /></span>
            <div className={css.three}>
              {DETAIL_NAMES.map((p) => (
                <button key={p} type="button" className={toggle(preset === p)} aria-pressed={preset === p} data-export-detail={p}
                  onClick={() => setPrefs({ detail: p })}>{DETAIL_LABELS[p]}</button>
              ))}
            </div>
            <details className={css.items} data-export-items="">
              <summary>Items{preset ? '' : ' (changed)'}</summary>
              <div className={css.selects}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Grid</span>
                  <select className={styles.select} data-export-item="grid" value={detail.grid} onChange={(e) => setItem('grid', e.currentTarget.value)}>
                    {GRIDS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Density</span>
                  <select className={styles.select} data-export-item="density" value={detail.density} onChange={(e) => setItem('density', e.currentTarget.value)}>
                    {DENSITIES.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
                  </select>
                </label>
              </div>
              <div className={css.checks}>
                {ITEMS.map(({ k, label }) => (
                  <label key={k} className={css.check}>
                    <input type="checkbox" data-export-item={k} checked={detail[k] as boolean} onChange={(e) => setItem(k, e.currentTarget.checked)} />
                    {label}
                  </label>
                ))}
              </div>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-blank="" onClick={() => {
                const d = blankDetail(detail);
                setPrefs({ detail: presetOf(d) ?? d });
              }}>Blank chart (circuit off)</button>
            </details>
          </div>

          <div className={css.group} role="group" aria-labelledby="smith-export-colour">
            <span className={css.label} id="smith-export-colour">Colour <Why k="export-colour" /></span>
            <div className={css.three}>
              {COLOUR_MODES.map((c) => (
                <button key={c} type="button" className={toggle(prefs.colour === c)} aria-pressed={prefs.colour === c} data-export-colour={c}
                  onClick={() => setPrefs({ colour: c })}>{COLOUR_NAMES[c]}</button>
              ))}
            </div>
          </div>

          <label className={`${styles.field} ${css.narrow}`}>
            <span className={styles.fieldLabel}>Text size (grid labels)</span>
            <select className={styles.select} data-export-pt="" value={prefs.fontPt} onChange={(e) => setPrefs({ fontPt: Number(e.currentTarget.value) })}>
              {(TEXT_SIZES.includes(prefs.fontPt) ? TEXT_SIZES : [...TEXT_SIZES, prefs.fontPt].sort((a, b) => a - b)).map((s) => <option key={s} value={s}>{s} pt{s === DEFAULT_PT ? ' (default)' : s === MIN_PT ? ' (least)' : ''}</option>)}
            </select>
          </label>

          <div className={css.out}>
            <h3 className={css.sub}>LaTeX <Why k="export-tikz" /></h3>
            <div className={css.pair} role="group" aria-label="TikZ form">
              {(['picture', 'document'] as const).map((t) => (
                <button key={t} type="button" className={toggle(prefs.tex === t)} aria-pressed={prefs.tex === t} data-export-tex={t}
                  title={t === 'picture' ? 'A tikzpicture to paste into a document with \\usepackage{tikz}' : 'A standalone document that compiles as it is'}
                  onClick={() => setPrefs({ tex: t })}>{t === 'picture' ? 'Picture' : 'Standalone document'}</button>
              ))}
            </div>
            <div className={css.row}>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-copy="" disabled={!info} onClick={onCopy}>Copy TikZ</button>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-tex-save="" disabled={!info} onClick={onTex}>Save .tex</button>
            </div>
            <h3 className={css.sub}>Image <Why k="export-image" /></h3>
            <div className={css.row}>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-svg="" disabled={!info} onClick={onSvg}>Save SVG</button>
              <label className={css.inline}>
                <select className={`${styles.select} ${css.factor}`} data-export-png-factor="" value={prefs.png} aria-label="PNG scale"
                  onChange={(e) => setPrefs({ png: Number(e.currentTarget.value) })}>
                  {PNG_FACTORS.map((f) => {
                    const px = info ? pngSize(info, f) : null;
                    return <option key={f} value={f} disabled={!!px && !pngFits(px[0], px[1])}>{f}×{px ? ` (${px[0]} × ${px[1]} px)` : ''}</option>;
                  })}
                </select>
              </label>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-png="" disabled={!info || !pngPx || !pngFits(pngPx[0], pngPx[1])} onClick={onPng}>Save PNG</button>
            </div>
            <h3 className={css.sub}>Data <Why k="export-data" /></h3>
            <div className={css.selects}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>CSV digits</span>
                <select className={styles.select} data-export-csv-digits="" value={prefs.csvAll ? 'all' : 'shown'} onChange={(e) => setPrefs({ csvAll: e.currentTarget.value === 'all' })}>
                  <option value="shown">As shown ({digits})</option>
                  <option value="all">Every digit</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Numbers</span>
                <select className={styles.select} data-export-csv-form="" value={prefs.csvForm} onChange={(e) => setPrefs({ csvForm: e.currentTarget.value as NumberForm })}>
                  <option value="plain">Plain (0.000031)</option>
                  <option value="eng">Engineering (31e-6)</option>
                </select>
              </label>
            </div>
            <div className={css.three} role="group" aria-label="Save CSV">
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-csv="nodes" onClick={onNodes} title="Every node at f0: z, y, Γ, VSWR, return loss, Q">Nodes CSV</button>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-csv="trace" disabled={!sweep} onClick={onTrace} title="Γ, return loss, VSWR and Z at every frequency of the sweep">Trace CSV</button>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-csv="markers" disabled={!sweep || !sweep.markers.length} onClick={onMarkers} title="The markers' rows of the marker table">Markers CSV</button>
            </div>
            <div className={css.row}>
              <label className={css.inline}>
                <select className={`${styles.select} ${css.factor}`} data-export-ts="" value={prefs.ts} aria-label="Touchstone numbers"
                  onChange={(e) => setPrefs({ ts: e.currentTarget.value as TouchstoneFormat })}>
                  <option value="RI">RI (re, im)</option>
                  <option value="MA">MA (|Γ|, angle)</option>
                  <option value="DB">DB (dB, angle)</option>
                </select>
              </label>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-s1p="" disabled={!sweep} onClick={onS1p}>Save .s1p</button>
              <Why k="export-s1p" />
            </div>
            {!sweep && <p className={css.hint} data-export-no-sweep="">The trace, markers and .s1p need a sweep: switch on Sweep in the tool.</p>}
            <h3 className={css.sub}>Project <Why k="export-project" /> and link <Why k="export-link" /></h3>
            <div className={css.three}>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-project="" onClick={onProject}
                title="The circuit, its unknowns and goal, the sweep, your value lists and these settings">Save project</button>
              <label className={`${styles.button} ${css.btn} ${css.file}`} title="Open a saved project (.smith.json) or a link saved as text">
                Open project
                <input type="file" className={css.fileInput} data-export-open="" accept=".json,.txt,application/json,text/plain"
                  onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; if (f) onOpen(f); }} />
              </label>
              <button type="button" className={`${styles.button} ${css.btn}`} data-export-link-copy="" onClick={onCopyLink}>Copy link</button>
            </div>
            <p className={css.hint}>Or drop a project file on the page. Files are read on this device; nothing is uploaded.</p>
            <p className={css.hint} aria-live="polite" data-export-note="">{note}</p>
          </div>
        </div>

        <div className={css.previewCol}>
          <h3 className={css.sub}>Preview <Why k="export-preview" /></h3>
          <p className={css.hint} data-export-size-note="">
            {info ? <>
              {mmText(info.width)} × {mmText(info.height)}{info.linewidth ? `, shown at the assumed ${mmText(info.width)}: in LaTeX it fills \\linewidth` : ''}
              {!info.whole ? ', the chart’s current view' : ''}{fitted ? `; scaled to ${Math.round(scale * 100)} % to fit the screen` : '; true size'}.
            </> : width ? 'Built when this section is on the screen.' : 'No figure until the width can be read.'}
          </p>
          {tooWide && (
            <label className={css.check}>
              <input type="checkbox" data-export-fit="" checked={prefs.fit} onChange={(e) => setPrefs({ fit: e.currentTarget.checked })} />
              Fit to screen (scaled)
            </label>
          )}
          <div ref={frameWrap} className={css.frameWrap} data-export-wrap="">
            <div className={css.frame} data-export-frame="" data-fitted={fitted ? '' : undefined}
              style={info ? { width: fitted ? `${room}px` : `${info.width}mm`, height: fitted ? `${(room * info.height) / info.width}px` : `${info.height}mm` } : undefined}>
              <div ref={preview} className={css.preview} data-export-preview="" role="img"
                aria-label={info ? `Preview of the figure, ${mmText(info.width)} wide` : 'Preview of the figure'}
                style={fitted ? { transform: `scale(${scale})` } : undefined} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default memo(ExportPanel);
