// The grid of the Smith chart (step M2.1a): every circle, label and perimeter tick the grid layer draws, as plain data
// in Γ coordinates (Γi up, engine.md §1), so the SVG layer only maps it to elements. Z mode draws the r and x
// circles, Y mode the g and b circles on the same Γ plane (D13: the Y grid is the Z grid turned by π about Γ = 0,
// points never move), ZY both.
//
// Density. Lines are the edges of square cells of a nested 1-5-10 ladder of steps Δ (…, 0.05, 0.1, 0.5, 1, 5, 10, …)
// in the z plane (r, x) (or the y plane). A cell [a, a+Δ] × [b, b+Δ] is *fine* when the shortest on-screen distance
// between its opposite edges is at least minPx; since |Γ(z1) − Γ(z2)| = 2|z1 − z2|/(|1+z1||1+z2|), that minimum is
// 2Δ·k / (|1+a+Δ+j(b+Δ)| · max(|1+a+j(b+Δ)|, |1+a+Δ+jb|)) (b ≥ 0; the lower half by symmetry). Fineness falls with
// a and |b|, so the fine cells of a level form a staircase. The grid draws the edges of the cells whose outward
// neighbours (right, up, and right-up) are fine as well: an r line v of step Δ is drawn in the rows where the cell to
// its right, one row further out, is fine (|x| ≤ X_Δ(v)), an x line w for the columns where the cell above it, one
// column further out, is fine (0 ≤ r ≤ R_Δ(w)); a line keeps the largest extent over the steps that divide it.
// Consequences (checked by the harness): two neighbouring lines of a family are never closer than minPx on screen at
// the level's k (each drawn line has a fine cell on its outer side), every line ends on a drawn line of the other
// family (or the rim, or outside the window), and the set depends only on the level, not on the window, which only
// limits which lines are listed (panning never changes a line). Drawing the edges of all fine cells instead fills
// more of the chart near Γ = 1 but lets a last fine line come up to 17 % closer than minPx to a coarser one.
// Blocks (M2.3): where a step's fine region reaches at least `blocks` (4) blocks of the next step along both axes,
// it is cut back to whole blocks (5 × 5 cells from 1·10ⁿ, 2 × 2 from 5·10ⁿ), so its outline runs along whole circles
// of the next step instead of a staircase of single cells; shallower regions (the last cells of each step near Γ = 1
// and the coarse steps of a level) keep the cell rule, as whole blocks would empty them.
//
// Levels. The level is ⌊4·log2 k⌋ (k in px per unit of Γ) with a hysteresis of 1.06× each way, so zooming to and fro
// by 1.05× never flips it; a level is built at its smallest k (`levelK`), so the spacing is ≥ minPx at any k shown.
//
// Labels: r (g) labels along the real axis, beside their crossing, x (b) labels inside the rim beside theirs, and the
// perimeter scales outside the rim: angle of Γ in degrees, wavelengths towards the generator (0 at Γ = −1,
// clockwise: θ = π − 4πd/λ) and towards the load (θ = π + 4πd/λ). Every label is a box centred on (x, y), turned by
// `rotate` (degrees, SVG's y-down sense), w × h px at the level's k, for `text-anchor: middle` and
// `dominant-baseline: central`. Width estimate: 0.6 em per character + 2 px. No two boxes overlap: labels are placed
// greedily (scales, then the roundest values) with labelGapPx between boxes.
//
// Arcs use geometry.ts's layout (ARC_STRIDE, ARC_SX …, `arcFlags`, which already includes the y flip): straight
// segments have ARC_R = ∞, full circles ARC_TURNS = 1 with S = E. Built only when the level or the window changes;
// `gridFor` reuses the previous grid while the window stays inside the area it covers.

import { gammaFromZ } from './convert';
import {
  arcFlags, ARC_SX, ARC_SY, ARC_EX, ARC_EY, ARC_MX, ARC_MY, ARC_CX, ARC_CY, ARC_R, ARC_SWEEP, ARC_TURNS, ARC_STRIDE,
} from './geometry';

export const MODE_Z = 1;
export const MODE_Y = 2;
export const MODE_ZY = 3;

// Families of arcs.
export const FAM_R = 0;
export const FAM_X = 1;
export const FAM_G = 2;
export const FAM_B = 3;
export const FAM_RIM = 4;  // r = 0 and g = 0: the unit circle
export const FAM_AXIS = 5; // x = 0 and b = 0: the real axis, a straight segment
export const FAM_RING = 6; // the base circle of the wavelength scales

// Classes (semantic, for styling).
export const CLS_AXIS = 0;
export const CLS_MAJOR = 1; // a line that carries a label
export const CLS_MINOR = 2;
export const CLS_SCALE = 3;

// Label kinds.
export const LBL_R = 0;
export const LBL_X = 1;
export const LBL_G = 2;
export const LBL_B = 3;
export const LBL_ANGLE = 4;
export const LBL_WTG = 5;
export const LBL_WTL = 6;

// Scales of ticks.
export const SCALE_ANGLE = 0;
export const SCALE_WAVE = 1;

export const LEVELS_PER_OCTAVE = 4;
export const HYSTERESIS = 1.06;
const HYST_LEVELS = LEVELS_PER_OCTAVE * Math.log2(HYSTERESIS);
/** Largest k at which a level is shown, over the k it is built at. */
export const K_SPAN = 2 ** ((1 + 2 * HYST_LEVELS) / LEVELS_PER_OCTAVE);

export const CHAR_EM = 0.6;
export const TICK_MINOR_PX = 4;
export const TICK_MAJOR_PX = 7;

export interface GridWindow { x0: number; y0: number; x1: number; y1: number }

export interface GridOptions {
  mode?: number;       // MODE_Z, MODE_Y or MODE_ZY
  minPx?: number;      // least distance between neighbouring lines on screen
  fontPx?: number;     // label font size
  labelGapPx?: number; // least gap between label boxes
  tickMinPx?: number;  // least distance between perimeter ticks
  scales?: boolean;    // perimeter scales
  pad?: number;        // the grid covers the window grown by this share of its size on each side
  blocks?: number;     // a step's region is cut to whole blocks when it is this many blocks deep (Infinity: single cells)
  inner?: boolean;     // also label lines inside the field, along them, wherever their other labels are far away
  repeatPx?: number;   // least distance between two labels of one line (inner labels)
}

export interface GridSettings { mode: number; minPx: number; fontPx: number; labelGapPx: number; tickMinPx: number; scales: boolean; pad: number; blocks: number; inner: boolean; repeatPx: number }

export const GRID_DEFAULTS: GridSettings = { mode: MODE_Z, minPx: 8, fontPx: 11, labelGapPx: 6, tickMinPx: 6, scales: true, pad: 0.25, blocks: 4, inner: false, repeatPx: 280 };

export interface GridLabel {
  x: number; y: number;  // centre, Γ
  rotate: number;        // degrees, SVG sense (clockwise on screen), in [−90, 90)
  w: number; h: number;  // px at the grid's k
  text: string;
  kind: number;          // LBL_*
  value: number;         // r, x, g, b, degrees or wavelengths
  arc: number;           // index of the arc it labels, −1 for scales
  inner: boolean;        // a label in the field, centred on its line and turned along it
}

export interface Grid {
  level: number;
  k: number;             // px per unit Γ the grid was built for (levelK(level))
  settings: GridSettings;
  view: GridWindow;      // the window asked for
  covers: GridWindow;    // the window grown by `pad`: what the grid holds
  count: number;
  arcs: Float64Array;    // count × ARC_STRIDE
  flags: Uint8Array;     // arcFlags of each arc
  family: Uint8Array;    // FAM_*
  cls: Uint8Array;       // CLS_*
  value: Float64Array;   // r, x, g or b (0 for rim, axis, ring)
  ends: Float64Array;    // 2 per arc: the value of the other family at S and at E (x for an r line, r for an x line), NaN otherwise
  labels: GridLabel[];
  tickCount: number;
  ticks: Float64Array;   // 4 per tick: x1, y1 (inner end), x2, y2
  tickScale: Uint8Array; // SCALE_*
  tickMajor: Uint8Array; // 1 where the tick is labelled
  tickValue: Float64Array; // degrees in (−180, 180], or wavelengths towards the generator in [0, 0.5)
  ringPx: number;        // offset of the wavelength ring outside the rim
  outerPx: number;       // how far the scales reach outside the rim
  buildMs: number;
}

const TAU = 2 * Math.PI;
const POW10: number[] = [];
for (let i = 0; i <= 22; i++) POW10.push(10 ** i);
const scaled = (m: number, p: number): number => (p >= 0 ? m * POW10[p] : m / POW10[-p]);
// Step i of the nested ladder: …, −2: 0.1, −1: 0.5, 0: 1, 1: 5, 2: 10, …; n·Δ exactly rounded.
const ladder = (n: number, i: number): number => scaled(n * ((i & 1) ? 5 : 1), Math.floor(i / 2));

export function densityLevel(k: number, prev = NaN): number {
  const raw = LEVELS_PER_OCTAVE * Math.log2(k);
  if (prev === prev && raw >= prev - HYST_LEVELS && raw < prev + 1 + HYST_LEVELS) return prev;
  return Math.floor(raw);
}

export function levelK(level: number): number {
  return 2 ** ((level - HYST_LEVELS) / LEVELS_PER_OCTAVE);
}

export const textWidth = (text: string, fontPx: number): number => text.length * CHAR_EM * fontPx + 2;

/** Offsets (px outside the rim) of the scale rings and label rows. */
export function scaleLayout(fontPx: number) {
  const angleLabel = TICK_MAJOR_PX + 2 + fontPx / 2;
  const ring = TICK_MAJOR_PX + 2 + fontPx + 3;
  const wtl = ring + TICK_MAJOR_PX + 2 + fontPx / 2;
  const wtg = wtl + fontPx + 2;
  return { angleLabel, ring, wtl, wtg, outer: wtg + fontPx / 2 + 2 };
}

const fmt = (v: number): string => (v < 0 ? '−' + String(-v) : String(v));

// ---------------------------------------------------------------------------------------------------------------
// Range of r and x over the window ∩ unit disc. r and x are harmonic away from Γ = 1, so their extremes lie on the
// boundary: the window's edges clipped to the disc (endpoints and the critical points of r and x along each edge) and
// rim arcs (r = 0; x monotone along the rim). With Γ = 1 in the window, r and |x| are unbounded.

let zrMin = 0, zrMax = 0, zxMin = 0, zxMax = 0, zAny = false, zRim = false;

function visit(u: number, t: number): void {
  const du = 1 - u, d = du * du + t * t;
  if (d === 0) return;
  zAny = true;
  let r = (1 - u * u - t * t) / d;
  if (r < 0) r = 0;
  const x = 2 * t / d;
  if (r < zrMin) zrMin = r;
  if (r > zrMax) zrMax = r;
  if (x < zxMin) zxMin = x;
  if (x > zxMax) zxMax = x;
}

function edgeV(u: number, lo: number, hi: number): void {
  if (!(u >= -1 && u <= 1)) return;
  const h = Math.sqrt(1 - u * u);
  const a = lo > -h ? lo : -h, b = hi < h ? hi : h;
  if (a > b) return;
  if (lo <= -h || hi >= h) zRim = true;
  visit(u, a); visit(u, b);
  const c = 1 - u;
  if (a < 0 && 0 < b) visit(u, 0);
  if (a < c && c < b) visit(u, c);
  if (a < -c && -c < b) visit(u, -c);
}

function edgeH(t: number, lo: number, hi: number): void {
  if (!(t >= -1 && t <= 1)) return;
  const h = Math.sqrt(1 - t * t);
  const a = lo > -h ? lo : -h, b = hi < h ? hi : h;
  if (a > b) return;
  if (lo <= -h || hi >= h) zRim = true;
  visit(a, t); visit(b, t);
  if (a < 1 - t && 1 - t < b) visit(1 - t, t);
  if (a < 1 + t && 1 + t < b) visit(1 + t, t);
  if (a < 1 && 1 < b) visit(1, t);
}

function zRange(x0: number, y0: number, x1: number, y1: number): boolean {
  zrMin = Infinity; zrMax = -Infinity; zxMin = Infinity; zxMax = -Infinity; zAny = false; zRim = false;
  if (x0 <= -1 && x1 >= 1 && y0 <= -1 && y1 >= 1) {
    zrMin = 0; zrMax = Infinity; zxMin = -Infinity; zxMax = Infinity;
    return true;
  }
  edgeV(x0, y0, y1); edgeV(x1, y0, y1); edgeH(y0, x0, x1); edgeH(y1, x0, x1);
  const one = x0 <= 1 && 1 <= x1 && y0 <= 0 && 0 <= y1;
  if (!zAny && !one) return false;
  if (zRim) zrMin = 0;
  if (one) { zrMax = Infinity; zxMin = -Infinity; zxMax = Infinity; if (!zAny) zrMin = 0; }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Fine cells. r line v (c = 1 + v) at step d: the largest m with the left cell of row m (top at t = m·d) fine;
// x line w (|w|) at step d: the largest m with the cell below it in column m (right edge u = 1 + m·d) fine.

function rRowFine(c: number, d: number, t: number, K2: number): boolean {
  const tt = t * t, a1 = c * c + tt, a2 = (c - d) * (c - d) + tt, tb = t - d, a3 = c * c + tb * tb;
  return a1 * (a2 > a3 ? a2 : a3) <= K2;
}

function rRows(c: number, d: number, K: number, K2: number): number {
  const s = K - c * c;
  let m = s > 0 ? Math.floor(Math.sqrt(s) / d) : 0; // A1 ≤ K is enough: a lower bound
  while (m > 0 && !rRowFine(c, d, m * d, K2)) m--;
  // gallop up, then bisect: fineness falls with m
  let step = 1;
  while (rRowFine(c, d, (m + step) * d, K2)) { m += step; step *= 2; }
  while (step > 1) { step >>= 1; if (rRowFine(c, d, (m + step) * d, K2)) m += step; }
  return m;
}

function xColFine(w: number, d: number, u: number, K2: number): boolean {
  const ww = w * w, a1 = u * u + ww, ud = u - d, a2 = ud * ud + ww, wd = w - d, a3 = u * u + wd * wd;
  return a1 * (a2 > a3 ? a2 : a3) <= K2;
}

function xCols(w: number, d: number, K: number, K2: number): number {
  const s = K - w * w;
  let m = s > 1 ? Math.floor((Math.sqrt(s) - 1) / d) : 0;
  while (m > 0 && !xColFine(w, d, 1 + m * d, K2)) m--;
  let step = 1;
  while (xColFine(w, d, 1 + (m + step) * d, K2)) { m += step; step *= 2; }
  while (step > 1) { step >>= 1; if (xColFine(w, d, 1 + (m + step) * d, K2)) m += step; }
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Output buffers (module scratch, copied out per build).

let cap = 512;
let bArcs = new Float64Array(cap * ARC_STRIDE);
let bFam = new Uint8Array(cap);
let bVal = new Float64Array(cap);
let bEnds = new Float64Array(cap * 2);
let n = 0;
const g2 = new Float64Array(4);

function grow(): void {
  cap *= 2;
  const a = new Float64Array(cap * ARC_STRIDE); a.set(bArcs); bArcs = a;
  const f = new Uint8Array(cap); f.set(bFam); bFam = f;
  const v = new Float64Array(cap); v.set(bVal); bVal = v;
  const e = new Float64Array(cap * 2); e.set(bEnds); bEnds = e;
}

// Whether an arc (S to E about C, radius R, sweep s) meets the window the grid covers: an end inside, or a crossing
// of an edge within the sweep. The z-range of the window is a bounding box, so lines listed from it may miss it.
let wx0 = 0, wy0 = 0, wx1 = 0, wy1 = 0;

function onSweep(sx: number, sy: number, cx: number, cy: number, s: number, px: number, py: number): boolean {
  const ax = sx - cx, ay = sy - cy, bx = px - cx, by = py - cy;
  let p = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  if (s < 0) p = -p;
  if (p < 0) p += TAU;
  return p <= Math.abs(s);
}

function arcInWindow(sx: number, sy: number, ex: number, ey: number, cx: number, cy: number, R: number, s: number): boolean {
  if ((sx >= wx0 && sx <= wx1 && sy >= wy0 && sy <= wy1) || (ex >= wx0 && ex <= wx1 && ey >= wy0 && ey <= wy1)) return true;
  const R2 = R * R;
  for (let e = 0; e < 4; e++) {
    const vertical = e < 2, c = e === 0 ? wx0 : e === 1 ? wx1 : e === 2 ? wy0 : wy1;
    const d = c - (vertical ? cx : cy), q = R2 - d * d;
    if (q < 0) continue;
    const r = Math.sqrt(q);
    for (let k = -1; k <= 1; k += 2) {
      const px = vertical ? c : cx + k * r, py = vertical ? cy + k * r : c;
      if ((vertical ? py >= wy0 && py <= wy1 : px >= wx0 && px <= wx1) && onSweep(sx, sy, cx, cy, s, px, py)) return true;
    }
  }
  return false;
}

// An arc from S to E about C, turning anticlockwise (ccw) or clockwise; `sign` −1 turns everything by π (Y mode).
function pushArc(fam: number, value: number, sx: number, sy: number, ex: number, ey: number, cx: number, cy: number,
  R: number, ccw: boolean, e0: number, e1: number, sign: number): void {
  if (n === cap) grow();
  const ax = sx - cx, ay = sy - cy, bx = ex - cx, by = ey - cy;
  let s = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  if (ccw) { if (s < 0) s += TAU; } else if (s > 0) s -= TAU;
  if (!arcInWindow(sign * sx, sign * sy, sign * ex, sign * ey, sign * cx, sign * cy, R, s)) return;
  const h = 0.5 * s, ch = Math.cos(h), sh = Math.sin(h);
  const o = n * ARC_STRIDE;
  bArcs[o + ARC_SX] = sign * sx; bArcs[o + ARC_SY] = sign * sy;
  bArcs[o + ARC_EX] = sign * ex; bArcs[o + ARC_EY] = sign * ey;
  bArcs[o + ARC_MX] = sign * (cx + ax * ch - ay * sh); bArcs[o + ARC_MY] = sign * (cy + ax * sh + ay * ch);
  bArcs[o + ARC_CX] = sign * cx; bArcs[o + ARC_CY] = sign * cy;
  bArcs[o + ARC_R] = R; bArcs[o + ARC_SWEEP] = s; bArcs[o + ARC_TURNS] = 0;
  bFam[n] = fam; bVal[n] = value; bEnds[2 * n] = e0; bEnds[2 * n + 1] = e1;
  n++;
}

function pushSpecial(fam: number, sx: number, sy: number, ex: number, ey: number, R: number, turns: number, mx: number, my: number): void {
  if (n === cap) grow();
  const o = n * ARC_STRIDE;
  bArcs[o + ARC_SX] = sx; bArcs[o + ARC_SY] = sy; bArcs[o + ARC_EX] = ex; bArcs[o + ARC_EY] = ey;
  bArcs[o + ARC_MX] = mx; bArcs[o + ARC_MY] = my; bArcs[o + ARC_CX] = 0; bArcs[o + ARC_CY] = 0;
  bArcs[o + ARC_R] = R; bArcs[o + ARC_SWEEP] = 0; bArcs[o + ARC_TURNS] = turns;
  bFam[n] = fam; bVal[n] = 0; bEnds[2 * n] = NaN; bEnds[2 * n + 1] = NaN;
  n++;
}

const rExt = new Map<number, number>();
const xExt = new Map<number, number>();

// Blocks. The fine region of step d is cut back to whole blocks of the next step D = f·d (f = 5 from 1·10ⁿ, 2 from
// 5·10ⁿ), so its outline runs along whole circles of value n·D, as on a printed chart, instead of a staircase of
// single cells. Block (a, b) is [a·D, (a+1)·D] × [b·D, (b+1)·D] in (r, |x|); it is kept when its outermost line in each
// direction is drawn across it by the cell rule above (the cell rule's guarantees hold inside it). Fineness falls
// with r and |x|, so the kept blocks form a staircase of whole blocks: the r lines of column a reach |x| = colTop(a),
// the x lines of row b reach r = rowEnd(b) (in cells of d; the line between two columns or rows takes the larger,
// the inner one). Every line then ends on a line of value n·D that is drawn across the block.
let stepI = 0, stepD = 1, stepF = 5, stepK = 1, stepK2 = 1;
const colRaw = new Map<number, number>();
const colFin = new Map<number, number>();
const rowRaw = new Map<number, number>();
const rowFin = new Map<number, number>();

function colRawOf(a: number): number {
  let t = colRaw.get(a);
  if (t === undefined) {
    const m = a < 0 ? 0 : rRows(1 + ladder((a + 1) * stepF, stepI), stepD, stepK, stepK2) - 1;
    t = m > 0 ? m - m % stepF : 0;
    colRaw.set(a, t);
  }
  return t;
}

function rowRawOf(b: number): number {
  let t = rowRaw.get(b);
  if (t === undefined) {
    const m = b < 0 ? 0 : xCols(ladder((b + 1) * stepF, stepI), stepD, stepK, stepK2) - 1;
    t = m > 0 ? m - m % stepF : 0;
    rowRaw.set(b, t);
  }
  return t;
}

// The extent of the kept blocks of column a (rows b with both rowRaw(b) and colRaw(a) covering the block); rowRaw is
// non-increasing in b, so the last such row is found by bisection.
function colTop(a: number): number {
  let t = colFin.get(a);
  if (t !== undefined) return t;
  const raw = colRawOf(a), need = (a + 1) * stepF;
  let hi = raw / stepF - 1;
  if (hi < 0 || rowRawOf(0) < need) t = 0;
  else if (rowRawOf(hi) >= need) t = raw;
  else {
    let lo = 0;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rowRawOf(mid) >= need) lo = mid; else hi = mid; }
    t = (lo + 1) * stepF;
  }
  colFin.set(a, t);
  return t;
}

function rowEnd(b: number): number {
  let t = rowFin.get(b);
  if (t !== undefined) return t;
  const raw = rowRawOf(b), need = (b + 1) * stepF;
  let hi = raw / stepF - 1;
  if (hi < 0 || colRawOf(0) < need) t = 0;
  else if (colRawOf(hi) >= need) t = raw;
  else {
    let lo = 0;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (colRawOf(mid) >= need) lo = mid; else hi = mid; }
    t = (lo + 1) * stepF;
  }
  rowFin.set(b, t);
  return t;
}

// One family pair (r, x) over the window in its own plane; sign −1 for g and b (the window is passed turned by π).
function pass(famR: number, famX: number, sign: number, x0: number, y0: number, x1: number, y1: number, kq: number, minPx: number, blocksMin: number): void {
  if (!zRange(x0, y0, x1, y1)) return;
  const rmin = zrMin, rmax = zrMax, xmin = zxMin, xmax = zxMax;
  const xn = xmin > 0 ? xmin : xmax < 0 ? -xmax : 0, xn2 = xn * xn;
  // |w| range of the visible x lines
  let wlo = Infinity, whi = -Infinity;
  if (xmax > 0) { wlo = Math.min(wlo, xmin > 0 ? xmin : 0); whi = Math.max(whi, xmax); }
  if (xmin < 0) { wlo = Math.min(wlo, xmax < 0 ? -xmax : 0); whi = Math.max(whi, -xmin); }
  const q = (1 + rmin) * (1 + rmin);
  // |1 + z| = 2/|1 − Γ| ≥ wMin over the window (its farthest corner from Γ = 1 bounds |1 − Γ|)
  let far = 0;
  for (const [cx, cy] of [[x0, y0], [x0, y1], [x1, y0], [x1, y1]]) far = Math.max(far, Math.hypot(1 - cx, cy));
  const wMin = Math.max(2 / Math.min(far, 2), Math.sqrt(q + xn2));
  rExt.clear(); xExt.clear();
  const dNeed = minPx * wMin * (1 + rmin) / (2 * kq);
  const dMax = 1.5 * kq / minPx;
  let i = 2 * Math.floor(Math.log10(dNeed)) - 1;
  while (ladder(1, i) < dNeed) i++;
  for (; ; i++) {
    const d = ladder(1, i);
    if (d > dMax) break;
    const K = 2 * d * kq / minPx, K2 = K * K;
    stepI = i; stepD = d; stepF = (i & 1) ? 2 : 5; stepK = K; stepK2 = K2;
    colRaw.clear(); colFin.clear(); rowRaw.clear(); rowFin.clear();
    // Whole blocks where the step's region reaches at least `blocksMin` blocks along both axes (the region of a step
    // that is only a few cells deep would lose most of its lines to whole blocks); single cells otherwise.
    const reach = blocksMin * stepF;
    const blocks = rRows(1 + d, d, K, K2) - 1 >= reach && xCols(d, d, K, K2) - 1 >= reach;
    if (rmax >= d) {
      const s = 0.5 * (-xn2 + Math.sqrt(xn2 * xn2 + 4 * K2));
      const vB = Math.min(rmax, Math.sqrt(s) - 1, K / wMin - 1); // A1·A3 ≥ wMin²·(1 + v)²
      const nHi = Math.floor(vB / d);
      for (let k = Math.max(1, Math.ceil(rmin / d)); k <= nHi; k++) {
        const v = ladder(k, i);
        const m = blocks ? colTop(k % stepF ? Math.floor(k / stepF) : k / stepF - 1) : rRows(1 + v + d, d, K, K2) - 1;
        if (m > 0) {
          const X = ladder(m, i), p = rExt.get(v);
          if (p === undefined || X > p) rExt.set(v, X);
        }
      }
    }
    if (whi >= d && K2 >= q * q) {
      const wB = Math.min(whi, Math.sqrt(0.5 * (-q + Math.sqrt(q * q + 4 * K2))), K / wMin); // A1·A2 ≥ (q + w²)·w², ≥ wMin²·w²
      const nHi = Math.floor(wB / d);
      for (let k = Math.max(1, Math.ceil(wlo / d)); k <= nHi; k++) {
        const w = ladder(k, i);
        const m = blocks ? rowEnd(k % stepF ? Math.floor(k / stepF) : k / stepF - 1) : xCols(w + d, d, K, K2) - 1;
        if (m > 0) {
          const R = ladder(m, i), p = xExt.get(w);
          if (p === undefined || R > p) xExt.set(w, R);
        }
      }
    }
  }
  for (const [v, X] of rExt) {
    const lo = xmin > -X ? xmin : -X, hi = xmax < X ? xmax : X;
    if (!(lo < hi)) continue;
    gammaFromZ(g2, 0, v, lo); gammaFromZ(g2, 2, v, hi);
    pushArc(famR, v, g2[0], g2[1], g2[2], g2[3], v / (1 + v), 0, 1 / (1 + v), false, lo, hi, sign);
  }
  for (const [aw, R] of xExt) {
    const lo = rmin, hi = rmax < R ? rmax : R;
    if (!(lo < hi)) continue;
    for (let sgn = 1; sgn >= -1; sgn -= 2) {
      const w = sgn * aw;
      if (w < xmin || w > xmax) continue;
      gammaFromZ(g2, 0, lo, w); gammaFromZ(g2, 2, hi, w);
      pushArc(famX, w, g2[0], g2[1], g2[2], g2[3], 1, 1 / w, 1 / aw, w > 0, lo, hi, sign);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Labels: oriented boxes in screen px (y down), placed greedily.

let boxes = new Float64Array(6 * 64); // cx, cy, ux, uy, hw, hh
let nBoxes = 0;
// A uniform hash of the boxes (cells of BOX_CELL px): each box is listed in every cell its bounding square meets, so
// two boxes that overlap share a cell; a query visits each box once (by stamp).
const BOX_CELL = 48;
const bucket = new Map<number, number[]>();
let stamp = new Uint32Array(64);
let stampId = 0;
const cellKey = (ix: number, iy: number): number => ix * 4194304 + iy;

function resetBoxes(): void { nBoxes = 0; bucket.clear(); }

function fits(cx: number, cy: number, ux: number, uy: number, hw: number, hh: number): boolean {
  const rA = Math.hypot(hw, hh);
  const ix0 = Math.floor((cx - rA) / BOX_CELL), ix1 = Math.floor((cx + rA) / BOX_CELL);
  const iy0 = Math.floor((cy - rA) / BOX_CELL), iy1 = Math.floor((cy + rA) / BOX_CELL);
  if (++stampId === 0xffffffff) { stamp.fill(0); stampId = 1; }
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      const list = bucket.get(cellKey(ix, iy));
      if (list === undefined) continue;
      for (let q = 0; q < list.length; q++) {
        const b = list[q];
        if (stamp[b] === stampId) continue;
        stamp[b] = stampId;
        const o = 6 * b;
        const dx = boxes[o] - cx, dy = boxes[o + 1] - cy;
        const vx = boxes[o + 2], vy = boxes[o + 3], bw = boxes[o + 4], bh = boxes[o + 5];
        const rB = Math.hypot(bw, bh);
        if (dx * dx + dy * dy > (rA + rB) * (rA + rB)) continue;
        // separating axes: A's u, A's v, B's u, B's v
        let sep = false;
        for (let a = 0; a < 4 && !sep; a++) {
          const nx = a === 0 ? ux : a === 1 ? -uy : a === 2 ? vx : -vy;
          const ny = a === 0 ? uy : a === 1 ? ux : a === 2 ? vy : vx;
          const ra = hw * Math.abs(ux * nx + uy * ny) + hh * Math.abs(-uy * nx + ux * ny);
          const rb = bw * Math.abs(vx * nx + vy * ny) + bh * Math.abs(-vy * nx + vx * ny);
          if (Math.abs(dx * nx + dy * ny) > ra + rb) sep = true;
        }
        if (!sep) return false;
      }
    }
  }
  return true;
}

function addBox(cx: number, cy: number, ux: number, uy: number, hw: number, hh: number): void {
  if (6 * (nBoxes + 1) > boxes.length) { const b = new Float64Array(boxes.length * 2); b.set(boxes); boxes = b; }
  if (nBoxes >= stamp.length) { const t = new Uint32Array(stamp.length * 2); t.set(stamp); stamp = t; }
  const id = nBoxes++, o = 6 * id;
  boxes[o] = cx; boxes[o + 1] = cy; boxes[o + 2] = ux; boxes[o + 3] = uy; boxes[o + 4] = hw; boxes[o + 5] = hh;
  const r = Math.hypot(hw, hh);
  const ix0 = Math.floor((cx - r) / BOX_CELL), ix1 = Math.floor((cx + r) / BOX_CELL);
  const iy0 = Math.floor((cy - r) / BOX_CELL), iy1 = Math.floor((cy + r) / BOX_CELL);
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iy = iy0; iy <= iy1; iy++) {
      const key = cellKey(ix, iy), list = bucket.get(key);
      if (list === undefined) bucket.set(key, [id]); else list.push(id);
    }
  }
}

function place(out: GridLabel[], lab: GridLabel, kq: number, gap: number, win: GridWindow): boolean {
  if (!(lab.x >= win.x0 && lab.x <= win.x1 && lab.y >= win.y0 && lab.y <= win.y1)) return false;
  const a = lab.rotate * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
  const cx = lab.x * kq, cy = -lab.y * kq, hw = 0.5 * (lab.w + gap), hh = 0.5 * (lab.h + gap);
  if (!fits(cx, cy, ux, uy, hw, hh)) return false;
  addBox(cx, cy, ux, uy, hw, hh);
  out.push(lab);
  return true;
}

const normRot = (deg: number): number => { while (deg >= 90) deg -= 180; while (deg < -90) deg += 180; return deg; };

// The roundest step of the 1-2-5 ladder that divides v (> 0): 5 for 5, 2 for 0.2 and 2, 0.1 for 0.3.
function roundness(v: number): number {
  const top = Math.floor(Math.log10(v));
  for (let p = top; p > top - 16; p--) {
    for (const m of [5, 2, 1]) {
      const s = scaled(m, p), r = v / s;
      if (Math.abs(r - Math.round(r)) <= 1e-9 * r) return s;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// Perimeter scales.

// Angle intervals [a, b) (a in [−π, π), b > a) where the circle of radius R lies in the window; returns the count.
const angles: number[] = [];
function ringIntervals(R: number, w: GridWindow, out: number[]): number {
  out.length = 0; angles.length = 0;
  const inside = (t: number) => { const x = R * Math.cos(t), y = R * Math.sin(t); return x >= w.x0 && x <= w.x1 && y >= w.y0 && y <= w.y1; };
  for (const c of [w.x0, w.x1]) if (Math.abs(c) < R) { const p = Math.acos(c / R); angles.push(p, -p); }
  for (const c of [w.y0, w.y1]) if (Math.abs(c) < R) { const p = Math.asin(c / R); angles.push(p, p >= 0 ? Math.PI - p : -Math.PI - p); }
  if (angles.length === 0) { if (inside(0)) out.push(-Math.PI, Math.PI); return out.length / 2; }
  for (let j = 0; j < angles.length; j++) { let t = angles[j]; if (t >= Math.PI) t -= TAU; if (t < -Math.PI) t += TAU; angles[j] = t; }
  angles.sort((a, b) => a - b);
  for (let j = 0; j < angles.length; j++) {
    const a = angles[j], b = j + 1 < angles.length ? angles[j + 1] : angles[0] + TAU;
    if (b - a > 1e-15 && inside(0.5 * (a + b))) {
      if (out.length && Math.abs(out[out.length - 1] - a) < 1e-15) out[out.length - 1] = b; else out.push(a, b);
    }
  }
  // merge the last interval with the first across −π
  if (out.length >= 4 && Math.abs(out[out.length - 1] - TAU - out[0]) < 1e-15) { out[0] = out[out.length - 2] - TAU; out.length -= 2; }
  return out.length / 2;
}

// Steps as (mantissa, power of ten).
const ANGLE_MINOR: [number, number][] = [];
const ANGLE_MAJOR: [number, number][] = [];
const WAVE_STEPS: [number, number][] = [];
const WAVE_MAJOR: [number, number][] = [];
for (let p = -6; p < 0; p++) for (const m of [1, 2, 5]) { ANGLE_MINOR.push([m, p]); ANGLE_MAJOR.push([m, p]); WAVE_STEPS.push([m, p]); }
for (let p = -7; p < 0; p++) for (const m of [10, 20, 25, 50]) WAVE_MAJOR.push([m, p]);
for (const m of [1, 2, 5, 10, 30, 90]) ANGLE_MINOR.push([m, 0]);
for (const m of [1, 2, 5, 10, 15, 30, 45, 90]) ANGLE_MAJOR.push([m, 0]);
WAVE_STEPS.push([1, 0]);
const stepOf = (s: [number, number]): number => scaled(s[0], s[1]);
const divides = (a: number, b: number): boolean => { const r = b / a; return Math.abs(r - Math.round(r)) < 1e-9 * Math.max(1, r); };
// decimals to print a multiple of the step (mantissa 10, 20, 25, 50 with one power less)
const decimals = (s: [number, number]): number => { let [m, p] = s; while (m % 10 === 0 && m) { m /= 10; p++; } return p < 0 ? -p : 0; };

let tCap = 256;
let bTicks = new Float64Array(tCap * 4);
let bTScale = new Uint8Array(tCap);
let bTMajor = new Uint8Array(tCap);
let bTValue = new Float64Array(tCap);
let nt = 0;

function pushTick(scale: number, major: boolean, theta: number, r0: number, r1: number, value: number): void {
  if (nt === tCap) {
    tCap *= 2;
    const t = new Float64Array(tCap * 4); t.set(bTicks); bTicks = t;
    const s = new Uint8Array(tCap); s.set(bTScale); bTScale = s;
    const m = new Uint8Array(tCap); m.set(bTMajor); bTMajor = m;
    const v = new Float64Array(tCap); v.set(bTValue); bTValue = v;
  }
  const c = Math.cos(theta), s = Math.sin(theta), o = 4 * nt;
  bTicks[o] = r0 * c; bTicks[o + 1] = r0 * s; bTicks[o + 2] = r1 * c; bTicks[o + 3] = r1 * s;
  bTScale[nt] = scale; bTMajor[nt] = major ? 1 : 0; bTValue[nt] = value;
  nt++;
}

const intervals: number[] = [];

function scales(kq: number, st: GridSettings, covers: GridWindow, labels: GridLabel[]): void {
  const L = scaleLayout(st.fontPx), f = st.fontPx, gap = st.labelGapPx;
  const half = 0.5 * L.outer / kq;
  const band: GridWindow = { x0: covers.x0 - half, y0: covers.y0 - half, x1: covers.x1 + half, y1: covers.y1 + half };
  if (ringIntervals(1 + half, band, intervals) === 0) return;
  const ringR = 1 + L.ring / kq;
  pushSpecial(FAM_RING, -ringR, 0, -ringR, 0, ringR, 1, ringR, 0);

  // angle of Γ: minor ticks ≥ tickMinPx apart on the rim, labels ≥ their width + gap apart
  let minor = ANGLE_MINOR[ANGLE_MINOR.length - 1];
  for (const s of ANGLE_MINOR) if (stepOf(s) * Math.PI / 180 * kq >= st.tickMinPx) { minor = s; break; }
  const rLab = 1 + L.angleLabel / kq;
  let major = ANGLE_MAJOR[ANGLE_MAJOR.length - 1];
  for (const s of ANGLE_MAJOR) {
    if (stepOf(s) < stepOf(minor) || !divides(stepOf(minor), stepOf(s))) continue;
    const dec = decimals(s), tw = textWidth('−180' + (dec ? '.' + '0'.repeat(dec) : ''), f);
    if (stepOf(s) * Math.PI / 180 * kq * rLab >= tw + gap) { major = s; break; }
  }
  const [mm, mp] = minor, stepDeg = stepOf(minor), majDeg = stepOf(major), dec = decimals(major);
  // angle 15 with a minor 2 does not divide: the list is searched for multiples of the minor step
  for (let j = 0; j < intervals.length; j += 2) {
    const a = intervals[j] * 180 / Math.PI, b = intervals[j + 1] * 180 / Math.PI;
    for (let k = Math.ceil(a / stepDeg); k * stepDeg < b; k++) {
      const deg = scaled(k * mm, mp);
      let v = deg;
      while (v > 180) v -= 360;
      while (v <= -180) v += 360;
      const isMajor = divides(majDeg, deg);
      const th = deg * Math.PI / 180;
      pushTick(SCALE_ANGLE, isMajor, th, 1, 1 + (isMajor ? TICK_MAJOR_PX : TICK_MINOR_PX) / kq, v);
      if (isMajor) {
        const text = v < 0 ? '−' + (-v).toFixed(dec) : v.toFixed(dec);
        labels.push({ x: rLab * Math.cos(th), y: rLab * Math.sin(th), rotate: normRot(90 - th * 180 / Math.PI), w: textWidth(text, f), h: f, text, kind: LBL_ANGLE, value: v, arc: -1, inner: false });
      }
    }
  }

  // wavelengths: θ = π − 4πd towards the generator, θ = π + 4πd towards the load
  const pxPerLambda = 4 * Math.PI * kq * ringR;
  let wm = WAVE_STEPS[WAVE_STEPS.length - 1];
  for (const s of WAVE_STEPS) if (stepOf(s) * pxPerLambda >= st.tickMinPx) { wm = s; break; }
  const rWtl = 1 + L.wtl / kq, rWtg = 1 + L.wtg / kq;
  let wM: [number, number] = [25, -2];
  for (const s of WAVE_MAJOR) {
    if (stepOf(s) < stepOf(wm) || !divides(stepOf(wm), stepOf(s)) || !divides(stepOf(s), 0.25)) continue;
    const tw = textWidth('0.' + '0'.repeat(Math.max(1, decimals(s))), f);
    if (stepOf(s) * 4 * Math.PI * kq * rWtl >= tw + gap) { wM = s; break; }
  }
  const [wmm, wmp] = wm, wStep = stepOf(wm), wMaj = stepOf(wM), wDec = Math.max(1, decimals(wM));
  for (let j = 0; j < intervals.length; j += 2) {
    const dLo = (Math.PI - intervals[j + 1]) / (4 * Math.PI), dHi = (Math.PI - intervals[j]) / (4 * Math.PI);
    for (let k = Math.floor(dLo / wStep) + 1; k * wStep <= dHi; k++) {
      const dv = scaled(k * wmm, wmp);
      let g = dv;
      while (g >= 0.5) g -= 0.5;
      while (g < 0) g += 0.5;
      if (g > 0.5 - 1e-12) g = 0;
      const isMajor = divides(wMaj, dv);
      const th = Math.PI - 4 * Math.PI * dv;
      pushTick(SCALE_WAVE, isMajor, th, ringR, ringR + (isMajor ? TICK_MAJOR_PX : TICK_MINOR_PX) / kq, g);
      if (isMajor) {
        const rot = normRot(90 - th * 180 / Math.PI), c = Math.cos(th), s = Math.sin(th);
        let l = 0.5 - g; if (l >= 0.5 - 1e-12) l = 0;
        const tg = g.toFixed(wDec), tl = l.toFixed(wDec);
        labels.push({ x: rWtl * c, y: rWtl * s, rotate: rot, w: textWidth(tl, f), h: f, text: tl, kind: LBL_WTL, value: l, arc: -1, inner: false });
        labels.push({ x: rWtg * c, y: rWtg * s, rotate: rot, w: textWidth(tg, f), h: f, text: tg, kind: LBL_WTG, value: g, arc: -1, inner: false });
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------

// Labels in the field (BL48). Zoomed in, the labels on the real axis and inside the rim are out of view, so lines
// are labelled again on themselves: the text is centred on the line and turned along it (the layer gives it a halo
// in the background colour, which cuts the line under it, as on a contour map). Only lines at least twice as round
// as their spacing to the neighbouring drawn value of their family get them (every other line where the step is
// 0.1, the integers where it is 0.5), so the field stays readable. Candidates sit at fixed angles about each
// circle's centre, counted from its point on the rim (Γ = ±1), every repeatPx/2 of arc at the level's k, so they
// depend on the level only and keep their place while panning; one is placed when no label of the same line is
// within repeatPx and its box fits (inside the disc, with twice the label gap), roundest lines first.
const innerVals: number[][] = [[], [], [], []];

function innerLabels(labels: GridLabel[], cls: Uint8Array, kq: number, st: GridSettings, win: GridWindow): void {
  const f = st.fontPx, gap = 2 * st.labelGapPx, rep = st.repeatPx, rep2 = (rep / kq) * (rep / kq);
  // drawn values per family (|x|, |b| on one side), with the rim and the axis (0) as neighbours
  for (let q = 0; q < 4; q++) { innerVals[q].length = 0; innerVals[q].push(0); }
  for (let a = 0; a < n; a++) if (bFam[a] <= FAM_B) innerVals[bFam[a]].push(Math.abs(bVal[a]));
  for (let q = 0; q < 4; q++) innerVals[q].sort((p, r) => p - r);
  // the labels each arc already has (Γ), from the axis and rim pass
  const own = new Map<number, number[]>();
  for (const l of labels) if (l.arc >= 0) { const o = own.get(l.arc); if (o) o.push(l.x, l.y); else own.set(l.arc, [l.x, l.y]); }
  const cand: number[] = []; // arc, angle, roundness
  for (let a = 0; a < n; a++) {
    const fam = bFam[a];
    if (fam > FAM_B) continue;
    const v = Math.abs(bVal[a]), vals = innerVals[fam];
    // spacing to the neighbouring drawn values (vals[0] = 0 < v)
    let lo = 0, hi = vals.length;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (vals[mid] < v) lo = mid; else hi = mid; }
    let j = lo + 1; while (j < vals.length && vals[j] <= v) j++;
    const gapV = Math.min(v - vals[lo], j < vals.length ? vals[j] - v : Infinity);
    const round = roundness(v);
    if (!(round >= 2 * gapV * (1 - 1e-9))) continue;
    const o = a * ARC_STRIDE, Cx = bArcs[o + ARC_CX], Cy = bArcs[o + ARC_CY], Rr = bArcs[o + ARC_R], sw = bArcs[o + ARC_SWEEP];
    if (!(Rr < Infinity) || Rr * kq < 2 * rep / Math.PI) continue; // circles under 4·repeatPx round: axis and rim labels do
    const tip = fam >= FAM_G ? -1 : 1; // the circle's point on the rim
    const a0 = Math.atan2(-Cy, tip - Cx), aS = Math.atan2(bArcs[o + ARC_SY] - Cy, bArcs[o + ARC_SX] - Cx);
    let t0 = aS - a0; t0 -= TAU * Math.round(t0 / TAU);
    const t1 = t0 + sw, tlo = Math.min(t0, t1), thi = Math.max(t0, t1);
    const dA = 0.5 * rep / (Rr * kq);
    for (let m = Math.ceil(tlo / dA), mEnd = Math.floor(thi / dA); m <= mEnd; m++) if (m !== 0) cand.push(a, a0 + m * dA, round);
  }
  const nc = cand.length / 3;
  const order = new Int32Array(nc);
  for (let c = 0; c < nc; c++) order[c] = c;
  order.sort((p, q) => (cand[3 * q + 2] - cand[3 * p + 2]) || (cand[3 * p] - cand[3 * q]) || (cand[3 * p + 1] - cand[3 * q + 1]));
  const rimIn = 1 - (f + 2) / kq;
  for (let c = 0; c < nc; c++) {
    const k3 = 3 * order[c], a = cand[k3], ang = cand[k3 + 1];
    const o = a * ARC_STRIDE, Rr = bArcs[o + ARC_R];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const x = bArcs[o + ARC_CX] + Rr * ca, y = bArcs[o + ARC_CY] + Rr * sa;
    if (x * x + y * y > rimIn * rimIn || x < win.x0 || x > win.x1 || y < win.y0 || y > win.y1) continue;
    const mine = own.get(a);
    let near = false;
    if (mine) for (let p = 0; p < mine.length && !near; p += 2) { const dx = mine[p] - x, dy = mine[p + 1] - y; near = dx * dx + dy * dy < rep2; }
    if (near) continue;
    const v = bVal[a], text = fmt(v);
    const lab: GridLabel = { x, y, rotate: normRot(Math.atan2(-ca, -sa) * 180 / Math.PI), w: textWidth(text, f), h: f, text, kind: bFam[a], value: v, arc: a, inner: true };
    if (!place(labels, lab, kq, gap, win)) continue;
    if (mine) mine.push(x, y); else own.set(a, [x, y]);
    cls[a] = CLS_MAJOR;
  }
}

export function resolveOptions(options?: GridOptions): GridSettings {
  return { ...GRID_DEFAULTS, ...(options ?? {}) } as GridSettings;
}

/** The grid of a density level over a window (Γ coordinates, y up; any aspect ratio). */
export function buildGrid(view: GridWindow, level: number, options?: GridOptions): Grid {
  const t0 = performance.now();
  const st = resolveOptions(options);
  const kq = levelK(level);
  const pw = st.pad * (view.x1 - view.x0), ph = st.pad * (view.y1 - view.y0);
  const covers: GridWindow = { x0: view.x0 - pw, y0: view.y0 - ph, x1: view.x1 + pw, y1: view.y1 + ph };
  const { x0, y0, x1, y1 } = covers;
  n = 0; nt = 0; wx0 = x0; wy0 = y0; wx1 = x1; wy1 = y1;

  // rim and real axis, shared by Z and Y
  if (zRange(x0, y0, x1, y1) && zrMin === 0) pushSpecial(FAM_RIM, -1, 0, -1, 0, 1, 1, 1, 0);
  if (y0 <= 0 && 0 <= y1) {
    const a = Math.max(-1, x0), b = Math.min(1, x1);
    if (a < b) pushSpecial(FAM_AXIS, a, 0, b, 0, Infinity, 0, 0.5 * (a + b), 0);
  }
  if (st.mode & MODE_Z) pass(FAM_R, FAM_X, 1, x0, y0, x1, y1, kq, st.minPx, st.blocks);
  if (st.mode & MODE_Y) pass(FAM_G, FAM_B, -1, -x1, -y1, -x0, -y0, kq, st.minPx, st.blocks);

  // labels: the scales first, then the lines by roundness
  const labels: GridLabel[] = [];
  const pending: GridLabel[] = [];
  if (st.scales) scales(kq, st, covers, pending);
  resetBoxes();
  for (const l of pending) place(labels, l, kq, 1, { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity });
  const f = st.fontPx;
  const cands: GridLabel[] = [];
  const score: number[] = [];
  for (let a = 0; a < n; a++) {
    const fam = bFam[a];
    if (fam > FAM_B) continue;
    const v = bVal[a], sign = fam >= FAM_G ? -1 : 1, text = fmt(v), w = textWidth(text, f);
    let gx: number, gy: number, rot: number;
    if (fam === FAM_R || fam === FAM_G) {
      if (!(bEnds[2 * a] <= 0 && 0 <= bEnds[2 * a + 1])) continue;
      gx = (v - 1) / (v + 1) + (f / 2 + 1) / kq; gy = (w / 2 + 2) / kq; rot = -90;
    } else {
      if (bEnds[2 * a] !== 0) continue;
      const v2 = v * v, px = (v2 - 1) / (v2 + 1), py = 2 * v / (v2 + 1), th = Math.atan2(py, px);
      const inR = 1 - (f / 2 + 2) / kq, side = (v > 0 ? 1 : -1) * (w / 2 + 1) / kq;
      gx = px * inR - Math.sin(th) * side; gy = py * inR + Math.cos(th) * side;
      rot = normRot(90 - th * 180 / Math.PI);
    }
    cands.push({ x: sign * gx, y: sign * gy, rotate: rot, w, h: f, text, kind: fam, value: v, arc: a, inner: false });
    score.push(roundness(Math.abs(v)));
  }
  const order = cands.map((_, j) => j);
  order.sort((p, q) => (score[q] - score[p]) || (Math.abs(Math.log(Math.abs(cands[p].value))) - Math.abs(Math.log(Math.abs(cands[q].value))))
    || (cands[p].kind - cands[q].kind) || (cands[q].value - cands[p].value));
  const cls = new Uint8Array(n);
  for (let a = 0; a < n; a++) cls[a] = bFam[a] === FAM_RING ? CLS_SCALE : bFam[a] > FAM_B ? CLS_AXIS : CLS_MINOR;
  // x and b labels go in pairs (+v with −v) so the chart stays symmetric: both or neither
  const partner = new Map<string, number>();
  for (let j = 0; j < cands.length; j++) if (cands[j].kind === LBL_X || cands[j].kind === LBL_B) partner.set(cands[j].kind + ' ' + cands[j].value, j);
  for (const j of order) {
    const c = cands[j], paired = c.kind === LBL_X || c.kind === LBL_B;
    const p = paired ? partner.get(c.kind + ' ' + -c.value) : undefined;
    if (p !== undefined && c.value < 0) continue; // placed with its positive partner
    const before = labels.length, boxesBefore = nBoxes;
    if (!place(labels, c, kq, st.labelGapPx, covers)) continue;
    if (p !== undefined && !place(labels, cands[p], kq, st.labelGapPx, covers)) { labels.length = before; nBoxes = boxesBefore; continue; }
    cls[c.arc] = CLS_MAJOR;
    if (p !== undefined) cls[cands[p].arc] = CLS_MAJOR;
  }
  if (st.inner) innerLabels(labels, cls, kq, st, covers);

  const flags = new Uint8Array(n);
  const arcs = bArcs.slice(0, n * ARC_STRIDE);
  for (let a = 0; a < n; a++) flags[a] = arcs[a * ARC_STRIDE + ARC_TURNS] ? 0 : arcFlags(arcs, a * ARC_STRIDE);
  const L = scaleLayout(f);
  return {
    level, k: kq, settings: st, view: { ...view }, covers, count: n, arcs, flags,
    family: bFam.slice(0, n), cls, value: bVal.slice(0, n), ends: bEnds.slice(0, 2 * n), labels,
    tickCount: nt, ticks: bTicks.slice(0, 4 * nt), tickScale: bTScale.slice(0, nt), tickMajor: bTMajor.slice(0, nt),
    tickValue: bTValue.slice(0, nt), ringPx: L.ring, outerPx: st.scales ? L.outer : 0, buildMs: performance.now() - t0,
  };
}

const sameSettings = (a: GridSettings, b: GridSettings): boolean =>
  a.mode === b.mode && a.minPx === b.minPx && a.fontPx === b.fontPx && a.labelGapPx === b.labelGapPx &&
  a.tickMinPx === b.tickMinPx && a.scales === b.scales && a.pad === b.pad && a.blocks === b.blocks &&
  a.inner === b.inner && a.repeatPx === b.repeatPx;

/** Whether `grid` can be shown for this window at this level (same level, window inside what it covers). */
export function gridCovers(grid: Grid, view: GridWindow, level: number): boolean {
  const c = grid.covers;
  return grid.level === level && view.x0 >= c.x0 && view.x1 <= c.x1 && view.y0 >= c.y0 && view.y1 <= c.y1;
}

/** The grid for a window at k px per unit Γ: `prev` again while it still serves, else a new one. */
export function gridFor(view: GridWindow, k: number, prev?: Grid | null, options?: GridOptions): Grid {
  const level = densityLevel(k, prev ? prev.level : NaN);
  if (prev && gridCovers(prev, view, level) && sameSettings(prev.settings, resolveOptions(options))) return prev;
  return buildGrid(view, level, options);
}
