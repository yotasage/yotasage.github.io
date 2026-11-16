// Inputs that can vary, sweeps, corners, sensitivity and Monte Carlo (engine.md §4 "Inverse and tolerance").
//
// Speed (notes-M1.3.md): a sample is solved at the coarse level Mc = M/2 alone and corrected by the fine nominal,
//   value(x) = fine(x0) + coarse(x) − coarse(x0),
// where fine(x0) is the nominal solve with its estimate (levels M/4, M/2, M), whose level M/2 is coarse(x0) for free.
// The coarse level's own error largely cancels in the difference; the harness measures what is left against fine
// solves (a few 10⁻³ of the tolerance spread). Sweeps span more, so they take three fine anchors (first, middle, last
// point) and interpolate fine − coarse linearly in the swept value; their error is the anchors' interpolated estimate
// plus the curvature of that correction (the middle anchor against the line through the ends). `fast: false` solves
// every point at level M instead.
//
// The work is done by generators that yield progress (points done) and return the result, so a worker can stop
// between solves: `runAll(gen)` runs one to the end.

import { DEFAULT_LEVEL } from './bem2d';
import { levelValues, mainKey, quickValues, solveSetup, valuesOf } from './lines';
import type { LineResults } from './lines';
import type { Setup } from './setup';
import { cloneStackup, stackupVals, tolAbs } from './stackup';
import type { Val } from './stackup';
import { KIND_INFO, arrangement } from './structure';
import type { Structure } from './structure';

export const VARY_VERSION = 1;
export const MC_SEED = 20261116;
export const MC_SAMPLES = 1000;
export const MC_P = [0.00135, 0.025, 0.5, 0.975, 0.99865]; // the percentiles reported: ±3σ, ±2σ (95 %) and the median

export interface Input {
  id: string; // 'w', 's', 'g', 'gw', 'wall', 'sig1.w', 'sig1.u', 'gnd1.a', or '<layer id>.<field>' of the stackup
  label: string;
  kind: 'length' | 'er';
  v: number; // nominal
  lim: number; // half-width of the tolerance band (0 without one)
  get(s: Setup): Val; // the value in a setup of the same shape
}

export interface EvalOptions { M?: number; mirror?: boolean; fast?: boolean }

// ---- setups ----

export function cloneTrace(t: Structure): Structure {
  const c = (x: Val | null): Val | null => (x ? { v: x.v, tol: x.tol, src: x.src } : null);
  return {
    ...t, w: c(t.w), s: c(t.s), g: c(t.g), gw: c(t.gw), wall: c(t.wall),
    signals: t.signals.map((g) => ({ layer: g.layer, w: c(g.w), u: c(g.u) })),
    grounds: t.grounds.map((g) => ({ layer: g.layer, a: c(g.a), b: c(g.b) })),
  };
}

export function cloneSetup(s: Setup): Setup { return { stackup: cloneStackup(s.stackup), trace: cloneTrace(s.trace), via: s.via }; }

// The inputs that change the trace's cross-section: the structure's numbers and the stackup's layers between its
// planes (the mask only when the trace is masked). `all` = also those without a tolerance (for sweeps).
export function inputsOf(setup: Setup, all = false): Input[] {
  const out: Input[] = [];
  const add = (id: string, label: string, kind: Input['kind'], get: (s: Setup) => Val | null) => {
    const x = get(setup);
    if (!x || !Number.isFinite(x.v)) return;
    const lim = tolAbs(x);
    if (all || lim > 0) out.push({ id, label, kind, v: x.v, lim, get: get as (s: Setup) => Val });
  };
  const st = setup.trace;
  const info = KIND_INFO[st.kind] ?? KIND_INFO.microstrip;
  if (st.kind === 'general') {
    st.signals.forEach((_, i) => {
      add(`sig${i + 1}.w`, `signal ${i + 1} width`, 'length', (s) => s.trace.signals[i].w);
      add(`sig${i + 1}.u`, `signal ${i + 1} position`, 'length', (s) => s.trace.signals[i].u);
    });
    st.grounds.forEach((_, i) => {
      add(`gnd${i + 1}.a`, `ground ${i + 1} left edge`, 'length', (s) => s.trace.grounds[i].a);
      add(`gnd${i + 1}.b`, `ground ${i + 1} right edge`, 'length', (s) => s.trace.grounds[i].b);
    });
  } else {
    add('w', 'trace width', 'length', (s) => s.trace.w);
    if (info.signals === 2) add('s', st.kind === 'broadside' ? 'offset' : 'gap', 'length', (s) => s.trace.s);
    if (info.coplanar) {
      add('g', 'gap to ground', 'length', (s) => s.trace.g);
      add('gw', 'ground width', 'length', (s) => s.trace.gw);
    }
  }
  add('wall', 'wall position', 'length', (s) => s.trace.wall);
  let lo = 0, hi = setup.stackup.layers.length - 1;
  try {
    const arr = arrangement(setup.stackup, st);
    if (arr.above >= 0) lo = arr.above + 1;
    if (arr.below >= 0) hi = arr.below - 1;
  } catch { /* the solve will say why */ }
  const byWhere = new Map(stackupVals(setup.stackup).map((e) => [e.where, e.x]));
  for (let i = lo; i <= hi; i++) {
    const l = setup.stackup.layers[i];
    const id = l.id;
    const fields: [string, string, Input['kind']][] =
      l.kind === 'mask' ? (st.masked ? [['er', 'εr', 'er'], ['onLaminate', 'on laminate', 'length'], ['onCopper', 'over copper', 'length'], ['between', 'between traces', 'length']] : [])
        : l.kind === 'copper' ? [['t', 'thickness', 'length'], ['etch', 'etch', 'length']]
          : [['t', 'thickness', 'length'], ['er', 'εr', 'er']];
    for (const [f, what, kind] of fields) {
      if (!byWhere.has(`${id}.${f}`)) continue;
      const k = i;
      const get = (s: Setup): Val | null => {
        const L = s.stackup.layers[k] as any;
        if (f !== 'etch') return L[f] ?? null;
        return L.etch.kind === 'offset' ? L.etch.side : L.etch.kind === 'factor' ? L.etch.f : null;
      };
      add(`${id}.${f}`, `${id} ${what}`, kind, get);
    }
  }
  return out;
}

// A copy of the setup with the inputs set to the values.
export function withValues(setup: Setup, inputs: Input[], values: ArrayLike<number>): Setup {
  const c = cloneSetup(setup);
  for (let i = 0; i < inputs.length; i++) inputs[i].get(c).v = values[i];
  return c;
}

// The keys of a band or a ranking: the useful ones for n lines.
export function bandKeys(n: number): string[] {
  if (n === 1) return ['z0', 'eeff', 'delay'];
  const k = ['zdiff', 'zcm', 'zdc', 'ztdr', 'zodd', 'zeven', 'kb', 'kf'];
  const per: string[] = [];
  for (let i = 1; i <= n; i++) per.push(`z0.${i}`, `eeff.${i}`);
  for (let m = 1; m <= n; m++) per.push(`mode${m}.eeff`);
  return n === 2 ? [...k, ...per] : per;
}

export function runAll<T>(g: Generator<unknown, T>): T {
  for (;;) { const s = g.next(); if (s.done) return s.value; }
}

// ---- the corrected fast path ----

export interface Anchor {
  ok: boolean;
  reason: string;
  result: LineResults | null; // fine with its estimate
  fine: Record<string, number>;
  err: Record<string, number>;
  coarse: Record<string, number> | null; // level M/2 of the same solve (null when not fast)
  M: number;
  Mc: number;
  mirror: boolean;
}

export function anchorOf(setup: Setup, opt: EvalOptions = {}): Anchor {
  const M = opt.M ?? DEFAULT_LEVEL;
  const mirror = opt.mirror !== false;
  const fast = opt.fast !== false && M / 2 >= 0.5;
  const r = solveSetup(setup, { M, mirror });
  if (!r.ok) return { ok: false, reason: r.reason, result: r, fine: {}, err: {}, coarse: null, M, Mc: M, mirror };
  const { values, errors } = valuesOf(r);
  let coarse: Record<string, number> | null = null;
  if (fast && r.bem && r.bem.levels.length >= 2) {
    const lv = r.bem.levels[r.bem.levels.length - 2];
    coarse = levelValues(lv.C, lv.C0, lv.L, r.n).values;
  }
  return { ok: true, reason: '', result: r, fine: values, err: errors, coarse, M, Mc: coarse ? M / 2 : M, mirror };
}

// fine(x0) + coarse(x) − coarse(x0) for every key of the anchor; a string says why not.
export function fastValues(a: Anchor, setup: Setup): Record<string, number> | string {
  const q = quickValues(setup, a.Mc, a.mirror);
  if (typeof q === 'string') return q;
  if (!a.coarse) return q;
  const out: Record<string, number> = {};
  for (const k in a.fine) out[k] = a.fine[k] + (q[k] - a.coarse[k]);
  return out;
}

// ---- sweeps ----

export interface SweepPoint { x: number; ok: boolean; reason: string; values: Record<string, number>; err: Record<string, number>; anchor: boolean }
export interface SweepResult { ok: boolean; reason: string; input: string; points: SweepPoint[]; solves: { fine: number; coarse: number }; ms: number }

// A sweep of one input (inputsOf(setup, true)'s id) over the values xs. Yields after each point.
export function* sweep(setup: Setup, id: string, xs: number[], opt: EvalOptions = {}): Generator<number, SweepResult> {
  const t0 = performance.now();
  const input = inputsOf(setup, true).find((i) => i.id === id);
  const res: SweepResult = { ok: false, reason: '', input: id, points: [], solves: { fine: 0, coarse: 0 }, ms: 0 };
  if (!input) { res.reason = `No input "${id}" in this setup.`; return res; }
  const at = (x: number) => withValues(setup, [input], [x]);
  const N = xs.length;
  const fast = opt.fast !== false && N > 3;
  const aIdx = fast ? [...new Set([0, N >> 1, N - 1])] : [];
  const anchors = new Map<number, Anchor>();
  for (const i of aIdx) {
    const a = anchorOf(at(xs[i]), opt);
    res.solves.fine++;
    if (a.ok && a.coarse) anchors.set(i, a);
  }
  const good = aIdx.filter((i) => anchors.has(i)).sort((p, q) => xs[p] - xs[q]);
  // correction δ = fine − coarse per key at each anchor, interpolated linearly in x; curvature from the middle anchor
  const delta = (i: number, k: string) => anchors.get(i)!.fine[k] - anchors.get(i)!.coarse![k];
  const interp = (x: number, f: (i: number) => number): number => {
    if (good.length === 1) return f(good[0]);
    let j = 0;
    while (j < good.length - 2 && x > xs[good[j + 1]]) j++;
    const p = good[j], q = good[j + 1];
    const t = xs[q] === xs[p] ? 0 : (x - xs[p]) / (xs[q] - xs[p]);
    return f(p) + (Math.max(0, Math.min(1, t)) * (f(q) - f(p)));
  };
  const curv: Record<string, number> = {};
  if (good.length === 3) {
    const [p, m, q] = good;
    for (const k in anchors.get(m)!.fine) {
      const t = (xs[m] - xs[p]) / (xs[q] - xs[p]);
      curv[k] = Math.abs(delta(m, k) - (delta(p, k) + t * (delta(q, k) - delta(p, k))));
    }
  }
  for (let i = 0; i < N; i++) {
    const x = xs[i];
    const a = anchors.get(i);
    let pt: SweepPoint;
    if (a) pt = { x, ok: true, reason: '', values: a.fine, err: a.err, anchor: true };
    else if (fast && good.length) {
      const M = anchors.get(good[0])!.Mc;
      const q = quickValues(at(x), M, opt.mirror !== false);
      res.solves.coarse++;
      if (typeof q === 'string') pt = { x, ok: false, reason: q, values: {}, err: {}, anchor: false };
      else {
        const values: Record<string, number> = {};
        const err: Record<string, number> = {};
        for (const k in anchors.get(good[0])!.fine) {
          values[k] = q[k] + interp(x, (j) => delta(j, k));
          err[k] = interp(x, (j) => anchors.get(j)!.err[k]) + (curv[k] ?? 0);
        }
        pt = { x, ok: true, reason: '', values, err, anchor: false };
      }
    } else {
      const r = solveSetup(at(x), { M: opt.M ?? DEFAULT_LEVEL, mirror: opt.mirror, estimate: false });
      res.solves.fine++;
      const { values, errors } = valuesOf(r);
      pt = { x, ok: r.ok, reason: r.reason, values, err: errors, anchor: false };
    }
    res.points.push(pt);
    yield i + 1;
  }
  res.ok = res.points.some((p) => p.ok);
  if (!res.ok) res.reason = res.points[0]?.reason || 'No point could be solved.';
  res.ms = performance.now() - t0;
  return res;
}

// Any list of setups, each solved at level M (with the estimate when `estimate`). Yields after each.
export function* sweepSetups(setups: Setup[], opt: EvalOptions & { estimate?: boolean } = {}): Generator<number, LineResults[]> {
  const out: LineResults[] = [];
  for (let i = 0; i < setups.length; i++) {
    out.push(solveSetup(setups[i], { M: opt.M ?? DEFAULT_LEVEL, mirror: opt.mirror, estimate: opt.estimate ?? false }));
    yield i + 1;
  }
  return out;
}

// ---- corners and sensitivity ----

export interface Sensitivity {
  id: string; label: string; v: number; lim: number;
  lo: Record<string, number>; hi: Record<string, number>; // at v − lim and v + lim
  d: Record<string, number>; // (hi − lo)/2: the change of each key per tolerance
}
export interface Corner { key: string; lo: number; hi: number; linLo: number; linHi: number }
export interface CornersResult {
  ok: boolean; reason: string; key: string;
  nominal: Record<string, number>; nominalErr: Record<string, number>;
  inputs: Sensitivity[]; // ranked by |d[key]|, largest first
  corners: Corner[]; // worst-case corners: every input at the limit that moves the key up (hi) or down (lo)
  solves: number; ms: number;
}

// One input at a time at ±its limit (the sensitivity), then for each key the two worst-case corners.
export function* corners(setup: Setup, opt: EvalOptions & { keys?: string[] } = {}): Generator<number, CornersResult> {
  const t0 = performance.now();
  const a = anchorOf(setup, opt);
  const res: CornersResult = { ok: false, reason: a.reason, key: '', nominal: a.fine, nominalErr: a.err, inputs: [], corners: [], solves: 1, ms: 0 };
  if (!a.ok) return res;
  const n = a.result!.n;
  res.key = mainKey(n);
  const inputs = inputsOf(setup);
  const keys = opt.keys ?? [res.key];
  const nominal = inputs.map((i) => i.v);
  let done = 0;
  for (let k = 0; k < inputs.length; k++) {
    const inp = inputs[k];
    const side = (s: number) => { const v = nominal.slice(); v[k] += s * inp.lim; return fastValues(a, withValues(setup, inputs, v)); };
    const hi = side(1);
    const lo = side(-1);
    res.solves += 2;
    if (typeof hi === 'string' || typeof lo === 'string') { res.reason = `${inp.label} at its limit: ${typeof hi === 'string' ? hi : lo}`; return res; }
    const d: Record<string, number> = {};
    for (const key in a.fine) d[key] = (hi[key] - lo[key]) / 2;
    res.inputs.push({ id: inp.id, label: inp.label, v: inp.v, lim: inp.lim, lo, hi, d });
    yield ++done;
  }
  for (const key of keys) {
    if (!(key in a.fine)) continue;
    const sgn = res.inputs.map((s) => Math.sign(s.d[key]) || 1);
    const at = (dir: number) => fastValues(a, withValues(setup, inputs, nominal.map((v, i) => v + dir * sgn[i] * inputs[i].lim)));
    const hi = at(1), lo = at(-1);
    res.solves += 2;
    if (typeof hi === 'string' || typeof lo === 'string') { res.reason = `A corner: ${typeof hi === 'string' ? hi : lo}`; return res; }
    const lin = res.inputs.reduce((s, x) => s + Math.abs(x.d[key]), 0);
    res.corners.push({ key, lo: lo[key], hi: hi[key], linLo: a.fine[key] - lin, linHi: a.fine[key] + lin });
    yield ++done;
  }
  const kk = res.key;
  res.inputs.sort((p, q) => Math.abs(q.d[kk]) - Math.abs(p.d[kk]));
  res.ok = true;
  res.ms = performance.now() - t0;
  return res;
}

// ---- Monte Carlo ----

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Stat { mean: number; sd: number; min: number; max: number; p: number[] } // p at MC_P
export interface McOptions extends EvalOptions { samples?: number; seed?: number; dist?: 'normal' | 'uniform'; keys?: string[]; chunk?: number }
export interface McResult {
  ok: boolean; reason: string; samples: number; failed: number; seed: number; dist: 'normal' | 'uniform';
  inputs: { id: string; label: string; v: number; lim: number }[];
  nominal: Record<string, number>; nominalErr: Record<string, number>;
  stats: Record<string, Stat>;
  ms: number;
}

// Each toleranced input drawn independently: 'normal' (default) with σ = limit/3, redrawn beyond the limit;
// 'uniform' over ±limit. The draws come from mulberry32(seed) in a fixed order, so a seed gives the same samples
// and the same statistics bit for bit (in one JavaScript engine). Yields the samples done after each chunk.
export function* monteCarlo(setup: Setup, opt: McOptions = {}): Generator<number, McResult> {
  const t0 = performance.now();
  const samples = opt.samples ?? MC_SAMPLES;
  const seed = opt.seed ?? MC_SEED;
  const dist = opt.dist ?? 'normal';
  const chunk = opt.chunk ?? 25;
  const a = anchorOf(setup, opt);
  const inputs = inputsOf(setup);
  const res: McResult = {
    ok: false, reason: a.reason, samples: 0, failed: 0, seed, dist, inputs: inputs.map(({ id, label, v, lim }) => ({ id, label, v, lim })),
    nominal: a.fine, nominalErr: a.err, stats: {}, ms: 0,
  };
  if (!a.ok) return res;
  const keys = (opt.keys ?? bandKeys(a.result!.n)).filter((k) => k in a.fine);
  const rnd = mulberry32(seed);
  const gauss = (): number => {
    for (;;) { // polar method: no trigonometry
      const u = 2 * rnd() - 1, v = 2 * rnd() - 1;
      const s = u * u + v * v;
      if (s > 0 && s < 1) return u * Math.sqrt((-2 * Math.log(s)) / s);
    }
  };
  const draw = (): number => {
    if (dist === 'uniform') return 2 * rnd() - 1;
    for (;;) { const g = gauss() / 3; if (Math.abs(g) <= 1) return g; }
  };
  const cols = keys.map(() => new Float64Array(samples));
  const vals = new Float64Array(inputs.length);
  let ok = 0;
  for (let s = 0; s < samples; s++) {
    for (let i = 0; i < inputs.length; i++) vals[i] = inputs[i].v + draw() * inputs[i].lim;
    const r = inputs.length ? fastValues(a, withValues(setup, inputs, vals)) : a.fine;
    if (typeof r === 'string') res.failed++;
    else { for (let k = 0; k < keys.length; k++) cols[k][ok] = r[keys[k]]; ok++; }
    if ((s + 1) % chunk === 0 || s + 1 === samples) yield s + 1;
  }
  res.samples = ok;
  if (!ok) { res.reason = 'No sample could be solved.'; return res; }
  keys.forEach((k, j) => {
    const x = cols[j].subarray(0, ok);
    let sum = 0;
    for (let i = 0; i < ok; i++) sum += x[i];
    const mean = sum / ok;
    let ss = 0;
    for (let i = 0; i < ok; i++) ss += (x[i] - mean) * (x[i] - mean);
    const sorted = Float64Array.from(x).sort();
    const pct = (p: number) => { // linear between order statistics
      const h = (ok - 1) * p, lo = Math.floor(h);
      return lo + 1 < ok ? sorted[lo] + (h - lo) * (sorted[lo + 1] - sorted[lo]) : sorted[ok - 1];
    };
    res.stats[k] = { mean, sd: ok > 1 ? Math.sqrt(ss / (ok - 1)) : 0, min: sorted[0], max: sorted[ok - 1], p: MC_P.map(pct) };
  });
  res.ok = true;
  res.ms = performance.now() - t0;
  return res;
}
