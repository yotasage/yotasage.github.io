// The sweep's plot (step M7.2b), framework-free: return loss or VSWR against frequency. The polyline is one `d` of whole
// numbers in a "plot frame" (x: the place in the band × PLOT_X, y: the value × PLOT_Y) that a group transform maps to the
// plot's pixels, so the worker can write the `d` of the refined trace (lib/smith/sweep.worker.ts) and neither a resize
// nor a new axis range rewrites it. Values are clipped to a range wide enough that every clipped point lies outside any
// axis the page draws (the plot's clip path cuts them off there).

import { returnLoss, vswr } from './convert';

/** Plot-frame units per band (x: 0 at the start, PLOT_X at the stop). */
export const PLOT_X = 1e6;
/** Plot-frame units per dB or per unit of VSWR. */
export const PLOT_Y = 1e6;
/** Return loss is drawn clipped to RL_MIN … RL_MAX dB (a perfect match is +∞ dB; |Γ| > 1 gives a negative return loss). */
export const RL_MIN = -100;
export const RL_MAX = 300;
/** VSWR is drawn clipped to 1 … VSWR_MAX (∞ from |Γ| = 1 on). */
export const VSWR_MAX = 1e4;

/** The value the plot draws for |Γ| = mag: return loss in dB, or VSWR, clipped as above. */
export function plotValue(mag: number, isVswr: boolean): number {
  if (isVswr) {
    const s = vswr(mag);
    return s > VSWR_MAX || s !== s ? VSWR_MAX : s;
  }
  const rl = returnLoss(mag);
  return rl > RL_MAX ? RL_MAX : rl < RL_MIN ? RL_MIN : rl;
}

/** The place of f in the band, 0 at the start and 1 at the stop (in log f for a log band). */
export const bandPos = (f: number, start: number, stop: number, log: boolean): number =>
  log ? Math.log(f / start) / Math.log(stop / start) : (f - start) / (stop - start);

/** The frequency at place u of the band (bandPos's inverse). */
export const bandFreq = (u: number, start: number, stop: number, log: boolean): number =>
  log ? start * (stop / start) ** u : start + (stop - start) * u;

/**
 * The plot's `d` of the first n points of a trace: "M x y x y …" in whole plot-frame units (x within 5e-7 of the band's
 * width, y within 5e-7 dB or 5e-7 of VSWR). A point that is not finite breaks the line.
 */
export function plotPath(freqs: ArrayLike<number>, gamma: ArrayLike<number>, n: number, start: number, stop: number, log: boolean, isVswr: boolean): string {
  let d = '', pen = false;
  // x = (f − start)·a, or ln(f)·a − b for a log band: one multiply per point.
  const a = log ? PLOT_X / Math.log(stop / start) : PLOT_X / (stop - start), b = log ? Math.log(start) * a : start * a;
  for (let i = 0, o = 0; i < n; i++, o += 2) {
    const gr = gamma[o], gi = gamma[o + 1], f = freqs[i];
    const x = log ? Math.log(f) * a - b : f * a - b;
    const y = plotValue(Math.sqrt(gr * gr + gi * gi), isVswr);
    if (x - x !== 0 || y - y !== 0) { pen = false; continue; }
    d += (pen ? ' ' : 'M') + Math.round(x) + ' ' + Math.round(y * PLOT_Y);
    pen = true;
  }
  return d;
}

/** The two paths the worker writes for a refined trace. */
export interface PlotPaths {
  rl: string;
  vswr: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Axes

/** The value axis: `top` drawn at the plot's top edge, `bottom` at its bottom edge, and the ticks between. */
export interface ValueAxis {
  top: number;
  bottom: number;
  ticks: number[];
}

const RL_STEPS = [20, 30, 40, 50, 60];
const VSWR_TOPS = [1.5, 2, 3, 5, 10];

/**
 * Return loss runs downward from 0 dB at the top (a match is a dip, as on a |Γ| or |S11| plot) to the first of 20, 30,
 * … 60 dB that holds the best return loss and the limit with room; beyond it the curve is cut at the bottom edge.
 */
export function rlAxis(bestRL: number, limitRL: number): ValueAxis {
  const want = Math.max(bestRL === bestRL ? bestRL : 0, limitRL === limitRL ? limitRL + 5 : 0);
  let bottom = RL_STEPS[RL_STEPS.length - 1];
  for (const s of RL_STEPS) if (s >= want) { bottom = s; break; }
  const step = bottom <= 30 ? 5 : 10, ticks: number[] = [];
  for (let v = 0; v <= bottom + 1e-9; v += step) ticks.push(v);
  return { top: 0, bottom, ticks };
}

/** VSWR runs upward from 1 at the bottom to the first of 1.5, 2, 3, 5 and 10 above the band's largest and the limit. */
export function vswrAxis(maxVswr: number, limitVswr: number): ValueAxis {
  const want = Math.max(maxVswr === maxVswr ? maxVswr : Infinity, limitVswr === limitVswr ? limitVswr * 1.15 : 0);
  let top = VSWR_TOPS[VSWR_TOPS.length - 1];
  for (const s of VSWR_TOPS) if (s >= want) { top = s; break; }
  const step = top <= 1.5 ? 0.1 : top <= 2 ? 0.2 : top <= 3 ? 0.5 : 1, ticks: number[] = [];
  for (let k = 0; ; k++) {
    const v = Math.round((1 + k * step) * 10) / 10;
    if (v > top + 1e-9) break;
    ticks.push(v);
  }
  return { top, bottom: 1, ticks };
}

/** Frequency ticks inside start … stop: at most `most` of them, at 1, 2 or 5 × 10^k steps (log: decades, then 1-2-5). */
export function freqTicks(start: number, stop: number, log: boolean, most: number): number[] {
  const out: number[] = [];
  if (!(stop > start) || most < 2) return out;
  if (log) {
    const d0 = Math.floor(Math.log10(start)), d1 = Math.ceil(Math.log10(stop)), decades = d1 - d0;
    for (const mult of decades * 3 <= most ? [[1, 2, 5]] : decades <= most ? [[1]] : []) {
      for (let d = d0; d <= d1; d++) for (const m of mult) {
        const f = m * 10 ** d;
        if (f >= start * (1 - 1e-12) && f <= stop * (1 + 1e-12)) out.push(f);
      }
    }
    if (out.length) return out;
    // More decades than ticks: every k-th decade.
    const every = Math.ceil(decades / most);
    for (let d = Math.ceil(d0 / every) * every; d <= d1; d += every) {
      const f = 10 ** d;
      if (f >= start && f <= stop) out.push(f);
    }
    return out;
  }
  const raw = (stop - start) / most, p = 10 ** Math.floor(Math.log10(raw)), r = raw / p;
  const step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * p;
  for (let k = Math.ceil(start / step - 1e-9); k * step <= stop * (1 + 1e-12) + step * 1e-9; k++) out.push(k * step);
  return out;
}
