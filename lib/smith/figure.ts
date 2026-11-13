// The figure model of the export (step M8.1a, plan.md D18, milestones.md M8): one list of primitives (circles, arcs,
// lines, polylines, marks, text) with roles, built from the circuit, the solve and the sweep for the chosen options
// (what is shown, size, detail, colour mode). The standalone SVG (figureSvg.ts), the TikZ (M8.1b), the PNG and the
// page's preview (M8.3a) all draw this list, so they cannot disagree. Framework-free.
//
// Coordinates: millimetres on paper, origin at the chart's centre (Γ = 0), x to the right, Y UP (Γ's own sense, as
// TikZ). A point Γ is at (scale·Γr, scale·Γi); the disk's radius is `scale`. Angles are in radians anticlockwise from
// +x; text rotation in degrees anticlockwise (TikZ's `rotate`). The SVG writer negates y. `box` is the figure's
// extent in these coordinates (the legend, when shown, below the chart).
//
// Grid: lib/smith/grid.ts built at exactly the paper's k (k = scale / PX_MM "px" per unit Γ, 1 px = 1/96 in, so the
// grid's px are CSS px on paper), with its minimum line spacing set in mm by the density: lines are at least
// DENSITY_MM apart on paper, so a column-width figure is thinned, not crowded. Labels and scales come from grid.ts's
// placement at that k (boxes in px × PX_MM), text in points (never under MIN_PT); node and marker labels are placed
// here around their points, never over another label (a grid label in the way gives way to them).
//
// Arcs are exact: centre, radius, start angle and signed sweep (full turns of long lines included), and the ends as
// the engine gives them (writers start and end on them exactly). Lines to the disk's clip (`clip`) use the circle of
// radius `clipR` (the disk plus CLIP_PAD, so a stroke along the rim is not halved).

import { formatAmount } from '../quantity';
import {
  ARC_CX, ARC_CY, ARC_EX, ARC_EY, ARC_R, ARC_STRIDE, ARC_SWEEP, ARC_SX, ARC_SY, ARC_TURNS, circleIntersect, partArcs,
} from './geometry';
import type { GridWindow } from './grid';
import {
  CHAR_EM, CLS_MAJOR, FAM_AXIS, FAM_B, FAM_R, FAM_RIM, FAM_RING, FAM_X, LBL_ANGLE, LBL_B, LBL_G, LBL_WTG,
  LBL_WTL, MODE_Y, MODE_Z, MODE_ZY, buildGrid, levelK, scaleLayout, textWidth,
} from './grid';
import type { Grid } from './grid';
import { diskArc, goalMark, goalRing } from './goalView';
import { NODE_STRIDE, evaluate, nodeGamma } from './network';
import { LINE, STUB_OPEN, STUB_SHORT, packParts } from './parts';
import type { Unknown } from './solve';
import { KIND_NAMES, askOf } from './state';
import type { Circuit } from './state';
import {
  MARK_SIZE, ROLE_CONSTRUCTION, ROLE_GOAL, ROLE_GRID, ROLE_LEGEND, ROLE_MARKER, ROLE_NODE, ROLE_PART, ROLE_SCALE,
  ROLE_SOLUTION, ROLE_TRACE, SUB_AXIS, SUB_LOCUS, SUB_PATH, SUB_RING, SUB_TARGET, SUB_Y_MAJOR, SUB_Y_MINOR,
  SUB_Z_MAJOR, SUB_Z_MINOR,
} from './figureStyle';
import type { ColourMode, MarkShape } from './figureStyle';

// ---------------------------------------------------------------------------------------------------------------
// Units and options

/** One grid px on paper: a CSS px, 1/96 in. */
export const PX_MM = 25.4 / 96;
export const PT_MM = 25.4 / 72;
/** No text under this size (pt). */
export const MIN_PT = 6;
export const DEFAULT_PT = 7;
/** Preset widths (mm): a column, a text width, a page width. */
export const SIZE_PRESETS = { column: 88, text: 160, page: 180 } as const;
export type SizePreset = keyof typeof SIZE_PRESETS;
/** The assumed width (mm) of `\linewidth` unless one is stated. */
export const LINEWIDTH_MM = SIZE_PRESETS.text;
/** The narrowest figure (mm). */
export const MIN_WIDTH = 30;
/** The widest figure (mm). */
export const MAX_WIDTH = 2000;
/** Least distance (mm) between neighbouring grid lines on paper, per density. */
export const DENSITY_MM = { coarse: 2.4, normal: 1.6, fine: 1.0 } as const;
export type Density = keyof typeof DENSITY_MM;
export type GridKind = 'z' | 'y' | 'zy';
/** Least gap between grid label boxes (mm) and between perimeter ticks (mm). */
export const LABEL_GAP_MM = 1;
export const TICK_MIN_MM = 1.2;
/** Space kept round the chart's outermost ink (mm). */
export const EDGE_MM = 0.6;
/** The clip circle's radius over the disk's (mm). */
export const CLIP_PAD = 0.4;

export interface Detail {
  density: Density;
  grid: GridKind;
  gridLabels: boolean;
  scales: boolean;      // the perimeter scales (angle of Γ, wavelengths)
  path: boolean;        // each part's arc from node to node
  nodes: boolean;
  nodeLabels: boolean;
  loci: boolean;        // "part arcs": each part's whole circle inside the disk
  goal: boolean;
  construction: boolean;
  solutions: boolean;
  trace: boolean;
  markers: boolean;
  legend: boolean;
}
export type DetailPreset = 'minimal' | 'standard' | 'full';
export const DETAIL_NAMES: readonly DetailPreset[] = ['minimal', 'standard', 'full'];
export const DETAIL_PRESETS: Readonly<Record<DetailPreset, Readonly<Detail>>> = {
  minimal: {
    density: 'coarse', grid: 'z', gridLabels: true, scales: false, path: true, nodes: true, nodeLabels: true, loci: false,
    goal: false, construction: false, solutions: false, trace: true, markers: false, legend: false,
  },
  standard: {
    density: 'normal', grid: 'z', gridLabels: true, scales: true, path: true, nodes: true, nodeLabels: true, loci: false,
    goal: true, construction: false, solutions: true, trace: true, markers: true, legend: false,
  },
  full: {
    density: 'fine', grid: 'zy', gridLabels: true, scales: true, path: true, nodes: true, nodeLabels: true, loci: true,
    goal: true, construction: true, solutions: true, trace: true, markers: true, legend: true,
  },
};
/** The items that draw the circuit: all off is a blank chart (BL47). */
export const CIRCUIT_ITEMS: readonly (keyof Detail)[] = ['path', 'nodes', 'nodeLabels', 'loci', 'goal', 'construction', 'solutions', 'trace', 'markers'];

/** A detail with the circuit switched off: the blank chart (grid, labels, scales as chosen). */
export function blankDetail(d: Readonly<Detail>): Detail {
  const out = { ...d };
  for (const k of CIRCUIT_ITEMS) (out as Record<string, unknown>)[k] = false;
  out.legend = false;
  return out;
}

export interface FigureOptions {
  /** Width in mm (the assumed width when `linewidth`). Default the column, 88 mm. */
  width?: number;
  /** The width is TikZ's `\linewidth`; `width` is the width the density and text are chosen for. */
  linewidth?: boolean;
  /** A window in Γ (y up) to show; null or absent: the whole chart. */
  view?: GridWindow | null;
  /** A preset, or a detail (missing items from `preset`, default standard). */
  detail?: DetailPreset | (Partial<Detail> & { preset?: DetailPreset });
  colour?: ColourMode;
  /** Text size of grid labels (pt, at least MIN_PT); node labels and the legend one point larger. */
  fontPt?: number;
}

/** The construction to draw: a SolveResult or a suggestion's (solveLayer.ts CircleShape). */
export interface FigureSolve {
  circleNode: number;
  circles: ArrayLike<number>;
  unknowns: readonly Unknown[];
  status: string;
}

export interface FigureInput {
  /** The circuit; null or absent: a blank chart. */
  circuit?: Circuit | null;
  solve?: FigureSolve | null;
  /** A sweep's trace (sweep.ts Trace: gamma interleaved re, im; n points). */
  trace?: { gamma: ArrayLike<number>; n: number } | null;
  /** Markers on the trace (sweep.ts MarkerPoint), labelled 1, 2, … in order. */
  markers?: readonly { gr: number; gi: number }[] | null;
}

/** Reads a width: "88", "88mm", "8.8 cm", "3.5in", "\linewidth" (LINEWIDTH_MM assumed). Null when unreadable. */
export function readWidth(text: string): { mm: number; linewidth: boolean } | null {
  const t = text.trim().replace(',', '.');
  if (/^\\(line|text|column)width$/.test(t)) return { mm: LINEWIDTH_MM, linewidth: t === '\\linewidth' };
  const m = /^(\d+(?:\.\d*)?|\.\d+)\s*(mm|cm|in|pt)?$/i.exec(t);
  if (!m) return null;
  const v = Number(m[1]) * ({ mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72.27 } as Record<string, number>)[(m[2] ?? 'mm').toLowerCase()];
  return v >= MIN_WIDTH && v <= MAX_WIDTH ? { mm: v, linewidth: false } : null;
}

/** The detail an options value stands for. */
export function resolveDetail(detail?: FigureOptions['detail']): Detail {
  if (!detail) return { ...DETAIL_PRESETS.standard };
  if (typeof detail === 'string') return { ...DETAIL_PRESETS[detail] };
  const { preset, ...rest } = detail;
  const out = { ...DETAIL_PRESETS[preset ?? 'standard'] } as Detail;
  for (const k of Object.keys(rest) as (keyof Detail)[]) if (rest[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = rest[k];
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Primitives

interface Base {
  role: number;     // ROLE_*
  sub: number;      // SUB_* of the role
  /** A part's index; for construction circles the unknown's part (−1 none, −2 the goal carried back); else −1. */
  index: number;
  /** Cut to the disk (radius `clipR`). */
  clip: boolean;
  /** A sample in the legend (drawn in the role's style, not part of the chart). */
  key: boolean;
}
export interface CirclePrim extends Base { type: 'circle'; cx: number; cy: number; r: number }
export interface ArcPrim extends Base {
  type: 'arc';
  cx: number; cy: number; r: number;
  /** Angle of the start about the centre, and the signed sweep (> 0 anticlockwise), full turns included. */
  start: number; sweep: number;
  x0: number; y0: number; x1: number; y1: number;
}
export interface LinePrim extends Base { type: 'line'; x0: number; y0: number; x1: number; y1: number }
export interface PolyPrim extends Base { type: 'poly'; pts: Float64Array; n: number }
export interface MarkPrim extends Base { type: 'mark'; x: number; y: number; shape: MarkShape; size: number }
export interface TextPrim extends Base {
  type: 'text';
  /** The anchor: the box's centre ('middle') or the middle of its left edge ('start'), before rotation. */
  x: number; y: number;
  anchor: 'middle' | 'start';
  text: string;
  pt: number;
  rotate: number;   // degrees, anticlockwise, about (x, y)
  w: number; h: number; // the estimated box (mm): characters × CHAR_EM em + 2 px, one em high
}
export type Prim = CirclePrim | ArcPrim | LinePrim | PolyPrim | MarkPrim | TextPrim;

/** A grid line's family and values (grid.ts): r, x, g or b, and the other family's value at its ends. */
export interface GridLine { prim: number; fam: number; value: number; lo: number; hi: number }

export interface Figure {
  width: number; height: number;
  box: { x0: number; y0: number; x1: number; y1: number };
  /** mm per unit Γ: the disk's radius. */
  scale: number;
  clipR: number;
  whole: boolean;
  view: GridWindow;
  linewidth: boolean;
  colour: ColourMode;
  detail: Detail;
  fontPt: number;
  /** Least distance between neighbouring grid lines (mm). */
  minMm: number;
  prims: Prim[];
  /** Every grid r, x, g and b line with its prim (for checks and data). */
  lines: GridLine[];
  grid: Grid;
  /** Labels left out: node or marker labels with no free place. */
  dropped: number;
  buildMs: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Label boxes: oriented rectangles (centre, half sizes, unit axis) and their overlap by separating axes.

interface Box { cx: number; cy: number; hw: number; hh: number; c: number; s: number; owner: number }

function boxOf(t: TextPrim, owner: number): Box {
  const a = (t.rotate * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const dx = t.anchor === 'start' ? t.w / 2 : 0;
  return { cx: t.x + c * dx, cy: t.y + s * dx, hw: t.w / 2, hh: t.h / 2, c, s, owner };
}

function project(b: Box, ax: number, ay: number): number {
  return b.hw * Math.abs(b.c * ax + b.s * ay) + b.hh * Math.abs(-b.s * ax + b.c * ay);
}

/** Whether two boxes come within `gap` of each other (oriented rectangles). */
export function boxesOverlap(p: Box, q: Box, gap = 0): boolean {
  const dx = q.cx - p.cx, dy = q.cy - p.cy;
  const axes = [p.c, p.s, -p.s, p.c, q.c, q.s, -q.s, q.c];
  for (let i = 0; i < 8; i += 2) {
    const ax = axes[i], ay = axes[i + 1];
    if (Math.abs(dx * ax + dy * ay) >= project(p, ax, ay) + project(q, ax, ay) + gap) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Building

const TAU = 2 * Math.PI;
const UNIT = ['Ω', 'H', 'F', 'Ω', 'H', 'F', 'λ', 'λ', 'λ', 'Ω'];
const nodeText = (k: number, n: number): string => (k === 0 ? 'L' : k === n ? 'In' : String(k));
const base = (role: number, sub = 0, index = -1, clip = false, key = false): Base => ({ role, sub, index, clip, key });

/** The value of a part as the legend writes it. */
function partValue(kind: number, value: number): string {
  if (kind === LINE || kind === STUB_OPEN || kind === STUB_SHORT) return `${Number(value.toPrecision(4))} λ`;
  return formatAmount(value, UNIT[kind] ?? '', 4);
}

const scratchArcs = { a: new Float64Array(ARC_STRIDE * 2) };
const circ = new Float64Array(8);
const pts = new Float64Array(4);
const markOut = new Float64Array(6);

/** An arc in geometry.ts's layout (Γ) as a primitive (mm), or a line, a circle, or null for a point. */
function arcPrim(arcs: Float64Array, a: number, s: number, b: Base): Prim | null {
  const sx = arcs[a + ARC_SX], sy = arcs[a + ARC_SY], ex = arcs[a + ARC_EX], ey = arcs[a + ARC_EY];
  if (!(Math.abs(sx) < Infinity && Math.abs(sy) < Infinity && Math.abs(ex) < Infinity && Math.abs(ey) < Infinity)) return null;
  const R = arcs[a + ARC_R], sweep = arcs[a + ARC_SWEEP], turns = arcs[a + ARC_TURNS];
  if (!(R > 0) || (sweep === 0 && turns === 0)) {
    return sx !== ex || sy !== ey ? { ...b, type: 'line', x0: sx * s, y0: sy * s, x1: ex * s, y1: ey * s } : null;
  }
  if (R === Infinity) return { ...b, type: 'line', x0: sx * s, y0: sy * s, x1: ex * s, y1: ey * s };
  const cx = arcs[a + ARC_CX], cy = arcs[a + ARC_CY];
  if (sweep === 0 && sx === ex && sy === ey && turns === 1 && b.role !== ROLE_PART) return { ...b, type: 'circle', cx: cx * s, cy: cy * s, r: R * s };
  const total = sweep + (sweep < 0 || (sweep === 0 && turns > 0) ? -TAU : TAU) * turns;
  return {
    ...b, type: 'arc', cx: cx * s, cy: cy * s, r: R * s, start: Math.atan2(sy - cy, sx - cx), sweep: total,
    x0: sx * s, y0: sy * s, x1: ex * s, y1: ey * s,
  };
}

/** Builds the figure. Never throws for finite options; a missing circuit gives the blank chart. */
export function buildFigure(input: FigureInput, options: FigureOptions = {}): Figure {
  const t0 = performance.now();
  const detail = resolveDetail(options.detail);
  const colour: ColourMode = options.colour ?? 'colour';
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, options.width > 0 ? options.width : SIZE_PRESETS.column));
  const fontPt = Math.max(MIN_PT, options.fontPt > 0 ? options.fontPt : DEFAULT_PT);
  const markPt = fontPt + 1;
  const fontPx = (fontPt * PT_MM) / PX_MM;
  const c = input.circuit ?? null;
  const v = options.view;
  const whole = !(v && v.x1 > v.x0 && v.y1 > v.y0 && Number.isFinite(v.x0 + v.x1 + v.y0 + v.y1));
  const view: GridWindow = whole ? { x0: -1, y0: -1, x1: 1, y1: 1 } : { x0: v.x0, y0: v.y0, x1: v.x1, y1: v.y1 };

  let scale: number, box: Figure['box'];
  if (whole) {
    const margin = (detail.scales ? scaleLayout(fontPx).outer * PX_MM : 0) + EDGE_MM;
    scale = Math.max(1, width / 2 - margin);
    box = { x0: -width / 2, y0: -width / 2, x1: width / 2, y1: width / 2 };
  } else {
    scale = width / (view.x1 - view.x0);
    box = { x0: view.x0 * scale, y0: view.y0 * scale, x1: view.x1 * scale, y1: view.y1 * scale };
  }
  const clipR = scale + CLIP_PAD;

  // The grid at exactly this k: a level with levelK(level) = k.
  const k = scale / PX_MM;
  const level = 4 * Math.log2(k / levelK(0));
  const minMm = DENSITY_MM[detail.density];
  const grid = buildGrid(view, level, {
    mode: detail.grid === 'z' ? MODE_Z : detail.grid === 'y' ? MODE_Y : MODE_ZY,
    minPx: minMm / PX_MM, fontPx, labelGapPx: LABEL_GAP_MM / PX_MM, tickMinPx: TICK_MIN_MM / PX_MM,
    scales: detail.scales && whole, pad: 0, inner: false,
  });

  const prims: Prim[] = [];
  const lines: GridLine[] = [];
  // grid: minor lines first, then major, then the axis and rim
  const order = [SUB_Y_MINOR, SUB_Z_MINOR, SUB_Y_MAJOR, SUB_Z_MAJOR, SUB_AXIS];
  const subOf = new Uint8Array(grid.count);
  for (let a = 0; a < grid.count; a++) {
    const f = grid.family[a];
    subOf[a] = f === FAM_RIM || f === FAM_AXIS ? SUB_AXIS : f === FAM_RING ? 255
      : f === FAM_R || f === FAM_X ? (grid.cls[a] === CLS_MAJOR ? SUB_Z_MAJOR : SUB_Z_MINOR)
      : grid.cls[a] === CLS_MAJOR ? SUB_Y_MAJOR : SUB_Y_MINOR;
  }
  for (const sub of order) {
    for (let a = 0; a < grid.count; a++) {
      if (subOf[a] !== sub) continue;
      const p = arcPrim(grid.arcs, a * ARC_STRIDE, scale, base(ROLE_GRID, sub, -1, grid.family[a] !== FAM_RIM));
      if (!p) continue;
      const f = grid.family[a];
      if (f <= FAM_B) lines.push({ prim: prims.length, fam: f, value: grid.value[a], lo: grid.ends[2 * a], hi: grid.ends[2 * a + 1] });
      prims.push(p);
    }
  }
  if (grid.settings.scales) {
    for (let a = 0; a < grid.count; a++) {
      if (subOf[a] !== 255) continue;
      const p = arcPrim(grid.arcs, a * ARC_STRIDE, scale, base(ROLE_SCALE));
      if (p) prims.push(p);
    }
    const t = grid.ticks;
    for (let i = 0; i < grid.tickCount; i++) {
      prims.push({ ...base(ROLE_SCALE), type: 'line', x0: t[4 * i] * scale, y0: t[4 * i + 1] * scale, x1: t[4 * i + 2] * scale, y1: t[4 * i + 3] * scale });
    }
  }

  // the circuit
  const texts: TextPrim[] = [];
  const fixed: Box[] = [];           // marks: labels keep off them
  const placed: { at: [number, number]; text: string; role: number }[] = [];
  const legend: { role: number; sub: number; index: number; text: string; line: boolean; shape: MarkShape }[] = [];
  const n = c ? c.parts.length : 0;
  const shown = (key: keyof Detail): boolean => !!c && detail[key] as boolean;
  if (c && (detail.path || detail.nodes || detail.nodeLabels || detail.loci || detail.goal || detail.construction || detail.solutions)) {
    const parts = packParts(c.parts);
    const nodes = new Float64Array((n + 1) * NODE_STRIDE);
    evaluate(nodes, parts, n, c.loadR, c.loadX, c.z0, c.f0, c.f0);
    const gamma = new Float64Array(2 * (n + 1));
    for (let j = 0; j <= n; j++) nodeGamma(gamma, 2 * j, nodes, j * NODE_STRIDE);
    const arcs = new Float64Array(Math.max(1, n) * ARC_STRIDE);
    partArcs(arcs, nodes, parts, n, c.z0, c.f0, c.f0);
    if (detail.loci) {
      // Each part's whole circle (the circle its arc is on), inside the disk.
      for (let j = 0; j < n; j++) {
        const a = j * ARC_STRIDE, R = arcs[a + ARC_R], sx = arcs[a + ARC_SX], sy = arcs[a + ARC_SY];
        if (!(R > 0) || (arcs[a + ARC_SWEEP] === 0 && arcs[a + ARC_TURNS] === 0)) continue;
        if (R === Infinity) {
          const dr = sy - arcs[a + ARC_EY], di = arcs[a + ARC_EX] - sx;
          circ[0] = 0; circ[1] = dr; circ[2] = di; circ[3] = 2 * (dr * sx + di * sy);
        } else {
          const cx = arcs[a + ARC_CX], cy = arcs[a + ARC_CY];
          circ[0] = 1; circ[1] = cx; circ[2] = cy; circ[3] = cx * cx + cy * cy - R * R;
        }
        if (!diskArc(scratchArcs.a, 0, circ, 0)) continue;
        const p = arcPrim(scratchArcs.a, 0, scale, base(ROLE_PART, SUB_LOCUS, j, true));
        if (p) prims.push(p);
      }
      if (n > 0) legend.push({ role: ROLE_PART, sub: SUB_LOCUS, index: 0, text: 'Part arcs (each part’s circle)', line: true, shape: '' });
    }
    if (detail.goal) {
      const goal = askOf(c).goal;
      goalRing(circ, 0, goal, c.z0);
      if (diskArc(scratchArcs.a, 0, circ, 0)) {
        const p = arcPrim(scratchArcs.a, 0, scale, base(ROLE_GOAL, SUB_RING, -1, true));
        if (p) prims.push(p);
      }
      if (goalMark(markOut, goal, c.z0) && Math.hypot(markOut[0], markOut[1]) <= 1 + 1e-9) {
        prims.push({ ...base(ROLE_GOAL, SUB_TARGET), type: 'mark', x: markOut[0] * scale, y: markOut[1] * scale, shape: 'target', size: MARK_SIZE[ROLE_GOAL] });
      }
      legend.push({ role: ROLE_GOAL, sub: SUB_RING, index: -1, text: 'Goal', line: true, shape: '' });
    }
    const sv = input.solve;
    let crossings = 0;
    if (sv && sv.circleNode >= 0 && (detail.construction || detail.solutions)) {
      for (let j = 0; j < 8; j++) circ[j] = sv.circles[j];
      let shownCircles = 0;
      const u = sv.unknowns, first = u[0]?.part ?? -1;
      const second = u.length === 2 && sv.status !== 'family' && askOf(c).goal.kind === 'point' ? u[1].part : -2;
      for (let j = 0; j < 2; j++) {
        if (!diskArc(scratchArcs.a, j * ARC_STRIDE, circ, 4 * j)) continue;
        shownCircles |= 1 << j;
        if (!detail.construction) continue;
        const p = arcPrim(scratchArcs.a, j * ARC_STRIDE, scale, base(ROLE_CONSTRUCTION, 0, j === 0 ? first : second, true));
        if (p) prims.push(p);
      }
      if (detail.construction && shownCircles) legend.push({ role: ROLE_CONSTRUCTION, sub: 0, index: -1, text: 'Construction circles', line: true, shape: '' });
      if (detail.solutions && sv.status === 'solved' && shownCircles === 3) {
        const m = circleIntersect(pts, 0, circ, 0, circ, 4);
        for (let j = 0; j < m; j++) {
          const x = pts[2 * j], y = pts[2 * j + 1];
          if (!(Math.hypot(x, y) <= 1 + 1e-9)) continue;
          prims.push({ ...base(ROLE_SOLUTION), type: 'mark', x: x * scale, y: y * scale, shape: 'cross', size: MARK_SIZE[ROLE_SOLUTION] });
          crossings++;
        }
        if (crossings) legend.push({ role: ROLE_SOLUTION, sub: 0, index: -1, text: 'Solutions', line: false, shape: 'cross' });
      }
    }
    if (detail.trace && input.trace && input.trace.n > 0) pushTrace(prims, legend, input.trace, scale);
    if (detail.path) {
      for (let j = 0; j < n; j++) {
        const p = arcPrim(arcs, j * ARC_STRIDE, scale, base(ROLE_PART, SUB_PATH, j, true));
        if (p) prims.push(p);
        const part = c.parts[j];
        legend.push({ role: ROLE_PART, sub: SUB_PATH, index: j, text: `${j + 1}: ${KIND_NAMES[part.kind]} ${partValue(part.kind, part.value)}`, line: true, shape: '' });
      }
    }
    if (detail.nodes || detail.nodeLabels) {
      // Coincident nodes share one label ("1, 2").
      const groups: number[][] = [];
      for (let j = 0; j <= n; j++) {
        const x = gamma[2 * j], y = gamma[2 * j + 1];
        if (!(Math.abs(x) < Infinity && Math.abs(y) < Infinity)) continue;
        if (detail.nodes) {
          const size = MARK_SIZE[ROLE_NODE];
          prims.push({ ...base(ROLE_NODE, 0, j), type: 'mark', x: x * scale, y: y * scale, shape: 'dot', size });
          fixed.push({ cx: x * scale, cy: y * scale, hw: size / 2, hh: size / 2, c: 1, s: 0, owner: -1 });
        }
        const g = groups.find((gr) => Math.hypot(gamma[2 * gr[0]] - x, gamma[2 * gr[0] + 1] - y) * scale < 0.3);
        if (g) g.push(j); else groups.push([j]);
      }
      if (detail.nodeLabels) for (const g of groups) placed.push({ at: [gamma[2 * g[0]] * scale, gamma[2 * g[0] + 1] * scale], text: g.map((j) => nodeText(j, n)).join(', '), role: ROLE_NODE });
      if (detail.nodes) legend.push({ role: ROLE_NODE, sub: 0, index: -1, text: 'Nodes (L: load, In: input)', line: false, shape: 'dot' });
    }
  } else if (c && detail.trace && input.trace && input.trace.n > 0) pushTrace(prims, legend, input.trace, scale);
  if (shown('markers') && input.markers && input.markers.length) {
    const size = MARK_SIZE[ROLE_MARKER];
    input.markers.forEach((m, j) => {
      if (!(Math.abs(m.gr) < Infinity && Math.abs(m.gi) < Infinity)) return;
      prims.push({ ...base(ROLE_MARKER, 0, j), type: 'mark', x: m.gr * scale, y: m.gi * scale, shape: 'triangle', size });
      fixed.push({ cx: m.gr * scale, cy: m.gi * scale, hw: size / 2, hh: size / 2, c: 1, s: 0, owner: -1 });
      placed.push({ at: [m.gr * scale, m.gi * scale], text: `M${j + 1}`, role: ROLE_MARKER });
    });
    legend.push({ role: ROLE_MARKER, sub: 0, index: -1, text: 'Markers', line: false, shape: 'triangle' });
  }

  // grid labels (removable by node and marker labels)
  const boxes: Box[] = [];
  if (detail.gridLabels || grid.settings.scales) {
    for (const l of grid.labels) {
      const isScale = l.kind === LBL_ANGLE || l.kind === LBL_WTG || l.kind === LBL_WTL;
      if (isScale ? !grid.settings.scales : !detail.gridLabels) continue;
      const y = l.kind === LBL_G || l.kind === LBL_B;
      const t: TextPrim = {
        ...base(isScale ? ROLE_SCALE : ROLE_GRID, y ? SUB_Y_MAJOR : SUB_Z_MAJOR), type: 'text', x: l.x * scale, y: l.y * scale,
        anchor: 'middle', text: l.text, pt: fontPt, rotate: l.rotate === 0 ? 0 : -l.rotate, w: l.w * PX_MM, h: l.h * PX_MM,
      };
      boxes.push(boxOf(t, texts.length));
      texts.push(t);
    }
  }
  // node and marker labels: free places round the point, nearest first; a grid label in the way gives way
  let dropped = 0;
  const removed = new Set<number>();
  const inside = (b: Box): boolean => b.cx - b.hw >= box.x0 && b.cx + b.hw <= box.x1 && b.cy - b.hh >= box.y0 && b.cy + b.hh <= box.y1;
  for (const pl of placed) {
    const h = markPt * PT_MM, w = textWidth(pl.text, (markPt * PT_MM) / PX_MM) * PX_MM;
    const r0 = Math.max(MARK_SIZE[pl.role], 1.4) / 2 + 0.35;
    let best: TextPrim | null = null, bestHits: number[] | null = null;
    search: for (const ring of [0, 0.8, 1.8, 3]) {
      for (let d = 0; d < 16; d++) {
        const ang = (d * TAU) / 16 + Math.PI / 4;
        const ux = Math.cos(ang), uy = Math.sin(ang);
        // the box clear of a circle of r0 + ring about the point, along (ux, uy)
        const ex = (w / 2) * Math.abs(ux) + (h / 2) * Math.abs(uy);
        const dist = r0 + ring + ex;
        const t: TextPrim = { ...base(pl.role === ROLE_NODE ? ROLE_NODE : ROLE_MARKER), type: 'text', x: pl.at[0] + ux * dist, y: pl.at[1] + uy * dist, anchor: 'middle', text: pl.text, pt: markPt, rotate: 0, w, h };
        const b = boxOf(t, texts.length);
        if (!inside(b)) continue;
        if (fixed.some((f) => boxesOverlap(b, f, 0.15))) continue;
        const hits: number[] = [];
        let blocked = false;
        for (const o of boxes) {
          if (removed.has(o.owner) || !boxesOverlap(b, o, 0.2)) continue;
          if (texts[o.owner].role === ROLE_GRID || texts[o.owner].role === ROLE_SCALE) hits.push(o.owner); else { blocked = true; break; }
        }
        if (blocked) continue;
        if (hits.length === 0) { best = t; bestHits = hits; break search; }
        if (!best || hits.length < bestHits.length) { best = t; bestHits = hits; }
      }
    }
    if (!best) { dropped++; continue; }
    for (const o of bestHits) removed.add(o);
    boxes.push(boxOf(best, texts.length));
    texts.push(best);
  }

  // the legend: equal columns under the chart, as many as the width holds
  if (detail.legend && legend.length) {
    // parts, nodes, part arcs, goal, construction, solutions, trace, markers
    const prio = (e: { role: number; sub: number }): number => (e.role === ROLE_PART ? (e.sub === SUB_PATH ? 0 : 2) : e.role === ROLE_NODE ? 1 : 3 + e.role);
    legend.sort((a, b) => prio(a) - prio(b));
    const pt = fontPt, h = pt * PT_MM, row = Math.max(h * 1.5, 3), sample = 6, gap = 1.5, colGap = 3;
    const usable = box.x1 - box.x0 - 2 * EDGE_MM;
    const tws = legend.map((e) => e.text.length * CHAR_EM * h + 2 * PX_MM);
    const colW = sample + gap + Math.max(...tws) + colGap;
    const cols = Math.max(1, Math.floor((usable + colGap) / colW));
    const rows = Math.ceil(legend.length / cols);
    const top = box.y0 - 1 - row / 2;
    legend.forEach((e, j) => {
      const col = Math.floor(j / rows), x = box.x0 + EDGE_MM + col * colW, y = top - (j % rows) * row;
      const b = base(e.role, e.sub, e.index, false, true);
      if (e.line) prims.push({ ...b, type: 'line', x0: x, y0: y, x1: x + sample, y1: y });
      else prims.push({ ...b, type: 'mark', x: x + sample / 2, y, shape: e.shape, size: MARK_SIZE[e.role] });
      const t: TextPrim = { ...base(ROLE_LEGEND), type: 'text', x: x + sample + gap, y, anchor: 'start', text: e.text, pt, rotate: 0, w: tws[j], h };
      boxes.push(boxOf(t, texts.length));
      texts.push(t);
    });
    box.y0 = top - (rows - 1) * row - row / 2 - EDGE_MM;
  }
  for (let j = 0; j < texts.length; j++) if (!removed.has(j)) prims.push(texts[j]);

  return {
    width, height: box.y1 - box.y0, box, scale, clipR, whole, view, linewidth: !!options.linewidth, colour, detail,
    fontPt, minMm, prims, lines, grid, dropped, buildMs: performance.now() - t0,
  };
}

function pushTrace(prims: Prim[], legend: { role: number; sub: number; index: number; text: string; line: boolean; shape: MarkShape }[], trace: { gamma: ArrayLike<number>; n: number }, scale: number): void {
  const n = trace.n, g = trace.gamma, out = new Float64Array(2 * n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const x = g[2 * i], y = g[2 * i + 1];
    if (!(Math.abs(x) < Infinity && Math.abs(y) < Infinity)) continue;
    out[2 * m] = x * scale; out[2 * m + 1] = y * scale; m++;
  }
  if (m < 2) return;
  prims.push({ ...base(ROLE_TRACE, 0, -1, true), type: 'poly', pts: m === n ? out : out.slice(0, 2 * m), n: m });
  legend.push({ role: ROLE_TRACE, sub: 0, index: -1, text: 'Frequency trace', line: true, shape: '' });
}

/** The roles a figure shows, as distinct (role, sub, index) styles: the set the palette checks compare. */
export function shownStyles(fig: Figure): { role: number; sub: number; index: number }[] {
  const seen = new Map<string, { role: number; sub: number; index: number }>();
  for (const p of fig.prims) {
    if (p.type === 'text' || p.role === ROLE_LEGEND) continue;
    const sub = p.role === ROLE_GRID ? (p.sub === SUB_Y_MAJOR || p.sub === SUB_Y_MINOR ? SUB_Y_MAJOR : p.sub === SUB_AXIS ? SUB_AXIS : SUB_Z_MAJOR) : p.sub;
    const index = p.role === ROLE_PART ? p.index % 8 : p.role === ROLE_CONSTRUCTION && fig.colour === 'colour' ? p.index : -1;
    const key = `${p.role} ${sub} ${index}`;
    if (!seen.has(key)) seen.set(key, { role: p.role, sub, index });
  }
  return [...seen.values()];
}
