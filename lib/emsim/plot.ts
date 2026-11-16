// The EM simulation page's plots (step M2.3a; decision in notes-M0.5.md): framework-free axes, ticks, paths, bands and
// the cursor, drawn by components/EmSim/Plot.tsx as SVG. Smith's lib/smith/plot.ts stays as it is.
//
// Paths are in frame units: x and y in 0 … PLOT_U over the plot's area (y up, so 0 is the bottom), whole numbers, and
// clamped to −PLOT_U … 2·PLOT_U, so every coordinate stays far under 2^24 (Firefox's limit for SVG path numbers). The
// view places them with one transform (translate, scale) and draws strokes with `vector-effect: non-scaling-stroke`.
// M3.2 adds a time axis and dB scales on top of the same `Axis` (log is here already).

export const PLOT_U = 100000;
const LO = -PLOT_U, HI = 2 * PLOT_U;

export interface Axis { min: number; max: number; log?: boolean }

/** The 1-2-5 step that gives at most about `most` intervals over `span`. */
export function niceStep(span: number, most: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, most);
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5]) if (m * p >= raw * (1 - 1e-9)) return m * p;
  return 10 * p;
}

const clean = (v: number): number => { const r = Number(v.toPrecision(12)); return r === 0 ? 0 : r; };

/** Ticks at whole multiples of the 1-2-5 step within min … max. */
export function linTicks(min: number, max: number, most: number): number[] {
  const step = niceStep(max - min, most);
  const out: number[] = [];
  const i0 = Math.ceil(min / step - 1e-9), i1 = Math.floor(max / step + 1e-9);
  for (let i = i0; i <= i1 && out.length < 1000; i++) out.push(clean(i * step));
  return out;
}

/** Log ticks: 1, 2, 5 of each decade within min … max; only the decades when that is more than `most`. */
export function logTicks(min: number, max: number, most: number): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const d0 = Math.floor(Math.log10(min) + 1e-9), d1 = Math.ceil(Math.log10(max) - 1e-9);
  const pick = (ms: number[]) => {
    const out: number[] = [];
    for (let d = d0; d <= d1; d++) for (const m of ms) { const v = clean(m * 10 ** d); if (v >= min * (1 - 1e-9) && v <= max * (1 + 1e-9)) out.push(v); }
    return out;
  };
  const all = pick([1, 2, 5]);
  return all.length <= most + 1 ? all : pick([1]);
}

export function ticks(a: Axis, most: number): number[] {
  return a.log ? logTicks(a.min, a.max, most) : linTicks(a.min, a.max, most);
}

/** An axis over lo … hi, padded by `pad` of the span and widened to whole ticks (linear) or decades' 1-2-5 (log). */
export function niceAxis(lo: number, hi: number, most: number, opt: { pad?: number; log?: boolean } = {}): Axis {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, log: !!opt.log };
  if (lo > hi) [lo, hi] = [hi, lo];
  if (opt.log && lo > 0) {
    const a = Math.log10(lo), b = Math.log10(hi), w = Math.max(b - a, 1e-3) * (opt.pad ?? 0);
    return { min: 10 ** (a - w), max: 10 ** (b + w), log: true };
  }
  if (hi - lo <= Math.abs(hi) * 1e-12 || hi === lo) {
    const w = Math.max(Math.abs(lo) * 0.01, 1e-12);
    lo -= w; hi += w;
  }
  const pad = (hi - lo) * (opt.pad ?? 0.05);
  let a = lo - pad, b = hi + pad;
  // snap to the step, then again if the snapped span asks for another step (so the ends are ticks of linTicks)
  for (let k = 0; k < 4; k++) {
    const step = niceStep(b - a, most);
    const a2 = clean(Math.floor(a / step + 1e-9) * step), b2 = clean(Math.ceil(b / step - 1e-9) * step);
    if (a2 === a && b2 === b) break;
    a = a2; b = b2;
  }
  return { min: a, max: b };
}

/** Decimals that show every tick of a linear axis exactly. */
export function tickDecimals(t: number[]): number {
  if (t.length < 2) return t.length ? Math.max(0, -Math.floor(Math.log10(Math.abs(t[0]) || 1)) + 1) : 0;
  const step = Math.abs(t[1] - t[0]);
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

/** A tick's label (minus as U+2212). */
export function tickText(v: number, t: number[], log = false): string {
  const s = log ? String(clean(v)) : v.toFixed(tickDecimals(t));
  return s.replace('-', '−');
}

/** Where v lies along the axis, 0 … 1 (outside for values outside). */
export function frac(v: number, a: Axis): number {
  if (a.log) return (Math.log10(v) - Math.log10(a.min)) / (Math.log10(a.max) - Math.log10(a.min));
  return (v - a.min) / (a.max - a.min);
}

/** The value at a fraction of the axis (the inverse of frac). */
export function valueAt(f: number, a: Axis): number {
  if (a.log) return 10 ** (Math.log10(a.min) + f * (Math.log10(a.max) - Math.log10(a.min)));
  return a.min + f * (a.max - a.min);
}

const unit = (f: number): number => Math.round(Math.min(HI, Math.max(LO, f * PLOT_U)));
/** Frame x of a value (whole number). */
export const toX = (v: number, a: Axis): number => unit(frac(v, a));
/** Frame y of a value, measured from the top as SVG does (whole number). */
export const toY = (v: number, a: Axis): number => PLOT_U - unit(frac(v, a));

const ok = (x: number, y: number, ax: Axis, ay: Axis) => Number.isFinite(x) && Number.isFinite(y) && (!ax.log || x > 0) && (!ay.log || y > 0);

/** A polyline through the points; a point that is not finite breaks the line. Repeated frame points are left out. */
export function linePath(xs: ArrayLike<number>, ys: ArrayLike<number>, ax: Axis, ay: Axis): string {
  const parts: string[] = [];
  let pen = false, px = NaN, py = NaN;
  for (let i = 0; i < xs.length; i++) {
    if (!ok(xs[i], ys[i], ax, ay)) { pen = false; continue; }
    const x = toX(xs[i], ax), y = toY(ys[i], ay);
    if (pen && x === px && y === py) continue;
    parts.push(`${pen ? 'L' : 'M'}${x} ${y}`);
    pen = true; px = x; py = y;
  }
  return parts.join('');
}

/** The area between lo and hi as one closed polygon per run of finite points. */
export function bandPath(xs: ArrayLike<number>, lo: ArrayLike<number>, hi: ArrayLike<number>, ax: Axis, ay: Axis): string {
  const parts: string[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length) {
      const top = run.map((i, k) => `${k ? 'L' : 'M'}${toX(xs[i], ax)} ${toY(hi[i], ay)}`);
      const bottom = run.slice().reverse().map((i) => `L${toX(xs[i], ax)} ${toY(lo[i], ay)}`);
      parts.push(`${top.join('')}${bottom.join('')}Z`);
    }
    run = [];
  };
  for (let i = 0; i < xs.length; i++) {
    if (ok(xs[i], lo[i], ax, ay) && ok(xs[i], hi[i], ax, ay)) run.push(i); else flush();
  }
  flush();
  return parts.join('');
}

/** The index of the point nearest to x (−1 for no points). */
export function nearestIndex(xs: ArrayLike<number>, x: number): number {
  let best = -1, d = Infinity;
  for (let i = 0; i < xs.length; i++) { const e = Math.abs(xs[i] - x); if (e < d) { d = e; best = i; } }
  return best;
}

/**
 * The value at x by linear interpolation between the two neighbouring points (xs ascending or descending); the point's
 * own value at a point; NaN outside the points or next to a point that is not finite.
 */
export function readAt(xs: ArrayLike<number>, ys: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (!n || !Number.isFinite(x)) return NaN;
  const up = n < 2 || xs[n - 1] >= xs[0];
  for (let i = 0; i < n; i++) {
    if (xs[i] === x) return ys[i];
    if (i + 1 < n) {
      const a = xs[i], b = xs[i + 1];
      if (up ? a < x && x < b : b < x && x < a) {
        const t = (x - a) / (b - a);
        return ys[i] + t * (ys[i + 1] - ys[i]);
      }
    }
  }
  return NaN;
}

/** The x of the point `step` points away from the one nearest to x (stopping at the ends). */
export function stepCursor(xs: ArrayLike<number>, x: number, step: number): number {
  if (!xs.length) return NaN;
  const i = Number.isFinite(x) ? nearestIndex(xs, x) : step > 0 ? -1 : xs.length;
  return xs[Math.max(0, Math.min(xs.length - 1, i + step))];
}

/** The finite range of the values (and of the band's edges when given); [NaN, NaN] when there is none. */
export function extent(...arrays: (ArrayLike<number> | undefined)[]): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const a of arrays) if (a) for (let i = 0; i < a.length; i++) { const v = a[i]; if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
  return lo <= hi ? [lo, hi] : [NaN, NaN];
}

/** n evenly spaced values from a to b (both ends exact). */
export function linspace(a: number, b: number, n: number): number[] {
  if (n <= 1) return [a];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i === n - 1 ? b : a + ((b - a) * i) / (n - 1));
  return out;
}
