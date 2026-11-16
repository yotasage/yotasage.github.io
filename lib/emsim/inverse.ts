// The inverse solve (engine.md §4): the width (or the gap, or width and gap scaled together) that gives a target
// Z0, Zdiff or Zcm.
//
//   1. Bracket on the coarse level M/2 alone: from the present value, steps of ×1.25 then doubling towards the target,
//      within [x0/50, 50·x0] and the input's physical limits; no sign change → out of reach, with the range reached.
//   2. Brent on the coarse level to 10⁻⁹ of the target.
//   3. The fine level M: Newton with the coarse slope from the coarse root, then secant steps (safeguarded by the
//      fine bracket when one is known) until |Z − target| ≤ tol·target (10⁻⁷). The fine function is the coarse one
//      plus a smooth correction of about 0.1 %, so this takes two or three fine solves.
//   4. The final point solved with its estimate (levels M/4, M/2, M: level M is the same computation, so the forward
//      solve of the returned setup gives the same value).
// A mesh whose panel counts change with x makes Z jump by a few 10⁻⁶ at most (harness); a target inside such a step
// ends with `reached: false` and the nearest value.

import { DEFAULT_LEVEL } from './bem2d';
import { quickValues, solveSetup } from './lines';
import type { LineResults } from './lines';
import type { Setup } from './setup';
import { KIND_INFO } from './structure';
import { cloneSetup } from './vary';

export type InverseKey = 'z0' | 'zdiff' | 'zcm';
export type InverseVary = 'w' | 's' | 'ws';

export interface InverseOptions { M?: number; mirror?: boolean; tol?: number; estimate?: boolean }
export interface InverseResult {
  ok: boolean; // a setup was found (reached or not)
  reached: boolean; // |Z − target| ≤ tol·target
  reason: string; // why not reached
  key: InverseKey; target: number; vary: InverseVary;
  x: number; // the width, the gap, or the scale of both
  w: number; s: number; // the resulting width and gap
  value: number; // Z at x (level M)
  setup: Setup | null;
  result: LineResults | null;
  range: [number, number, number, number] | null; // out of reach: x and Z at both ends searched
  solves: { coarse: number; fine: number };
  ms: number;
}

const XMIN = 0.002; // mm: no trace or gap narrower is searched
const SPAN = 50;

export function inverse(setup: Setup, key: InverseKey, target: number, vary: InverseVary = 'w', opt: InverseOptions = {}): InverseResult {
  const t0 = performance.now();
  const M = opt.M ?? DEFAULT_LEVEL;
  const Mc = M / 2 >= 0.5 ? M / 2 : M;
  const mirror = opt.mirror !== false;
  const tol = opt.tol ?? 1e-7;
  const st = setup.trace;
  const info = KIND_INFO[st.kind];
  const res: InverseResult = {
    ok: false, reached: false, reason: '', key, target, vary, x: NaN, w: st.w.v, s: st.s.v, value: NaN, setup: null, result: null, range: null,
    solves: { coarse: 0, fine: 0 }, ms: 0,
  };
  const done = (reason: string) => { res.reason = reason; res.ms = performance.now() - t0; return res; };
  if (!info || st.kind === 'general') return done('The target is solved for the preset structures (not the general arrangement).');
  if (key === 'z0' && info.signals !== 1) return done('Z0 is the target of a single trace; a pair takes Zdiff or Zcm.');
  if (key !== 'z0' && info.signals !== 2) return done('Zdiff and Zcm are targets of a pair.');
  if (vary !== 'w' && (info.signals !== 2 || st.kind === 'broadside')) return done('Only the width can be varied for this structure.');
  if (!(target > 0) || !Number.isFinite(target)) return done('The target must be a positive number of ohms.');
  const w0 = st.w.v, s0 = st.s.v;
  const x0 = vary === 's' ? s0 : vary === 'w' ? w0 : 1;
  const lo = vary === 'ws' ? Math.max(1 / SPAN, XMIN / Math.min(w0, s0)) : Math.max(x0 / SPAN, XMIN);
  const hi = x0 * SPAN;
  const make = (x: number): Setup => {
    const c = cloneSetup(setup);
    if (vary === 'w') c.trace.w.v = x;
    else if (vary === 's') c.trace.s.v = x;
    else { c.trace.w.v = w0 * x; c.trace.s.v = s0 * x; }
    return c;
  };
  const coarseCache = new Map<number, number>();
  let why = ''; // the last reason a coarse solve gave
  const fc = (x: number): number => { // NaN when the section cannot be solved
    const h = coarseCache.get(x);
    if (h !== undefined) return h;
    const q = quickValues(make(x), Mc, mirror);
    res.solves.coarse++;
    if (typeof q === 'string') why = q;
    const z = typeof q === 'string' ? NaN : q[key] - target;
    coarseCache.set(x, z);
    return z;
  };
  const ff = (x: number): number => {
    const q = quickValues(make(x), M, mirror);
    res.solves.fine++;
    return typeof q === 'string' ? NaN : q[key] - target;
  };

  // 1. bracket on the coarse level
  let a = x0, fa = fc(a);
  if (!Number.isFinite(fa)) return done(`The present structure cannot be solved: ${why}`);
  let b = Math.min(hi, Math.max(lo, x0 * 1.25)), fb = fc(b);
  if (!Number.isFinite(fb)) { b = Math.max(lo, x0 / 1.25); fb = fc(b); }
  if (!Number.isFinite(fb)) return done('The structure cannot be solved next to its present size.');
  // walk towards the root: the direction in which |f| falls
  let ends: [number, number, number, number] = [a, fa, b, fb];
  if (Math.sign(fa) !== Math.sign(fb) || fa === 0 || fb === 0) { /* bracketed */ } else {
    const up = Math.abs(fb) < Math.abs(fa) ? b > a : b < a;
    let xp = Math.abs(fb) < Math.abs(fa) ? b : a, fp = Math.abs(fb) < Math.abs(fa) ? fb : fa;
    let found = false;
    let edge = xp, fedge = fp;
    for (let k = 0; k < 16; k++) {
      const xn = up ? Math.min(hi, xp * 2) : Math.max(lo, xp / 2);
      if (xn === xp) break;
      const fn = fc(xn);
      if (!Number.isFinite(fn)) {
        // the structure stops being valid in this step (a trace narrower than its etch): close in on that limit
        let good = xp, fg = fp, bad = xn;
        for (let k2 = 0; k2 < 12; k2++) {
          const mid = 0.5 * (good + bad), fm = fc(mid);
          if (!Number.isFinite(fm)) { bad = mid; continue; }
          good = mid; fg = fm;
          if (Math.sign(fm) !== Math.sign(fp) || fm === 0) break;
        }
        if (good !== xp) {
          edge = good; fedge = fg;
          if (Math.sign(fg) !== Math.sign(fp) || fg === 0) { a = xp; fa = fp; b = good; fb = fg; found = true; }
        }
        break;
      }
      edge = xn; fedge = fn;
      if (Math.sign(fn) !== Math.sign(fp) || fn === 0) { a = xp; fa = fp; b = xn; fb = fn; found = true; break; }
      xp = xn; fp = fn;
    }
    if (!found) {
      const other = up ? Math.min(a, b) : Math.max(a, b);
      const fo = other === a ? fa : fb;
      ends = up ? [other, fo + target, edge, fedge + target] : [edge, fedge + target, other, fo + target];
      res.range = ends;
      const name = key === 'z0' ? 'Z0' : key === 'zdiff' ? 'Zdiff' : 'Zcm';
      const what = vary === 'w' ? 'width' : vary === 's' ? 'gap' : 'scale of width and gap';
      return done(`${name} goes from ${ends[1].toFixed(2)} to ${ends[3].toFixed(2)} Ω for the ${what} from ${ends[0].toPrecision(4)} to ${ends[2].toPrecision(4)}${vary === 'ws' ? '' : ' mm'}; ${target} Ω is out of reach${(up ? hi : lo) === edge ? ' within the range searched' : ` (beyond it: ${why})`}.`);
    }
  }

  // 2. Brent on the coarse level
  const brent = (f: (x: number) => number, a0: number, fa0: number, b0: number, fb0: number, ftol: number, xtol: number, maxIt: number): [number, number] => {
    let A = a0, FA = fa0, Bx = b0, FB = fb0;
    if (Math.abs(FA) < Math.abs(FB)) { [A, Bx] = [Bx, A]; [FA, FB] = [FB, FA]; }
    let Cx = A, FC = FA, mflag = true, D = 0;
    for (let it = 0; it < maxIt && Math.abs(FB) > ftol && Math.abs(Bx - A) > xtol; it++) {
      let s: number;
      if (FA !== FC && FB !== FC) s = (A * FB * FC) / ((FA - FB) * (FA - FC)) + (Bx * FA * FC) / ((FB - FA) * (FB - FC)) + (Cx * FA * FB) / ((FC - FA) * (FC - FB));
      else s = Bx - (FB * (Bx - A)) / (FB - FA);
      const q = (3 * A + Bx) / 4;
      if (!((s > Math.min(q, Bx) && s < Math.max(q, Bx))) || (mflag && Math.abs(s - Bx) >= Math.abs(Bx - Cx) / 2) || (!mflag && Math.abs(s - Bx) >= Math.abs(Cx - D) / 2)
        || (mflag && Math.abs(Bx - Cx) < xtol) || (!mflag && Math.abs(Cx - D) < xtol)) { s = (A + Bx) / 2; mflag = true; } else mflag = false;
      let FS = f(s);
      if (!Number.isFinite(FS)) { s = (A + Bx) / 2; FS = f(s); mflag = true; }
      D = Cx; Cx = Bx; FC = FB;
      if (Math.sign(FA) !== Math.sign(FS)) { Bx = s; FB = FS; } else { A = s; FA = FS; }
      if (Math.abs(FA) < Math.abs(FB)) { [A, Bx] = [Bx, A]; [FA, FB] = [FB, FA]; }
    }
    return [Bx, FB];
  };
  const [xc] = brent(fc, a, fa, b, fb, 1e-9 * target, 1e-12 * Math.max(a, b), 60);
  const h = 1e-3 * xc;
  const slope = (fc(xc + h) - fc(xc)) / h;

  // 3. fine level: Newton with the coarse slope, then safeguarded secant
  let x1 = xc, f1 = ff(x1);
  let best = x1, fbest = f1;
  let la = NaN, lfa = NaN, lb = NaN, lfb = NaN; // fine bracket
  const note = (x: number, f: number) => {
    if (Math.abs(f) < Math.abs(fbest)) { best = x; fbest = f; }
    if (f < 0) { if (!(Math.abs(f) >= Math.abs(lfa))) { la = x; lfa = f; } } else if (!(Math.abs(f) >= Math.abs(lfb))) { lb = x; lfb = f; }
  };
  note(x1, f1);
  let x2 = Number.isFinite(slope) && slope !== 0 ? x1 - f1 / slope : x1 * (1 + 1e-3);
  for (let it = 0; it < 10 && Math.abs(fbest) > tol * target; it++) {
    if (!(x2 >= lo && x2 <= hi * 1.0001) || !Number.isFinite(x2)) x2 = Number.isFinite(la) && Number.isFinite(lb) ? (la + lb) / 2 : x1 * (1 + 1e-4);
    if (Number.isFinite(la) && Number.isFinite(lb) && !(x2 > Math.min(la, lb) && x2 < Math.max(la, lb))) x2 = (la + lb) / 2;
    const f2 = ff(x2);
    if (!Number.isFinite(f2)) break;
    note(x2, f2);
    const xn = f2 !== f1 ? x2 - (f2 * (x2 - x1)) / (f2 - f1) : x2;
    x1 = x2; f1 = f2; x2 = xn;
    if (Number.isFinite(la) && Number.isFinite(lb) && Math.abs(la - lb) <= 1e-13 * Math.abs(la)) break;
  }

  // 4. the final point with its estimate
  const S = make(best);
  const r = solveSetup(S, { M, mirror, estimate: opt.estimate !== false });
  res.solves.fine++;
  res.ok = r.ok;
  res.result = r;
  res.setup = S;
  res.x = best;
  res.w = S.trace.w.v;
  res.s = S.trace.s.v;
  res.value = fbest + target;
  res.reached = r.ok && Math.abs(fbest) <= tol * target;
  if (!r.ok) return done(r.reason);
  if (!res.reached) return done(`The nearest value is ${res.value} Ω (${(Math.abs(fbest) / target).toExponential(1)} of the target): the solver's value steps there as the mesh changes.`);
  res.ms = performance.now() - t0;
  return res;
}
