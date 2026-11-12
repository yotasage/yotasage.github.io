// Independent validation of the solver (step M4.2, docs/smith-chart/solver.md "Validation"): random problems of every
// kind the solver handles, each checked against a brute force that does not use solve.ts, geometry.ts, goal.ts or
// network.ts. Circuits are evaluated by plain impedance arithmetic in ohms (Z = N/D kept as a pair, so the open and
// the short need no special case), goals measured in Γ from their textbook circles, and the unknowns scanned on
// angle-mapped bounded coordinates (atan of the normalised r, x, g, b or (Zt/Z0)², atan(Zc/Z0), a length in λ,
// ln(f/f0)) with every near-solution refined (Newton in two unknowns, bisection, golden section in one).
// Counted per kind: problems, statuses, solutions, brute-force finds, misses (found by the brute force, not by the
// solver), false solutions (the solver's, not one by the independent evaluation) and the worst residual.

import * as importedSolve from '../../../lib/smith/solve.ts';
import * as importedParts from '../../../lib/smith/parts.ts';

const S = importedSolve.default ?? importedSolve;
const P = importedParts.default ?? importedParts;
const { solve } = S;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER, PART_KINDS } = P;

const TAU = 2 * Math.PI;
const HALF_PI = Math.PI / 2;
const EXACT = 1e-9;      // the bar for a solution of an exact kind, by the independent evaluation
const MATCH = 1e-6;      // two solutions are the same when every coordinate is this close
// The fallback groups also run on streams of their own (BL56), with this many problems each (one unknown: 20 of each
// kind; two: 8 of each). The brute force of the full groups (200 and 280) takes 7 s a stream, which npm run check's
// budget does not allow; they were run once in full (notes-M4.2.md "BL56 fix").
const FALLBACK_SEEDS = [0x3a7c5, 0x6e1f9, 0xc42d3];
const FALLBACK_ONE = 100, FALLBACK_TWO = 56;
const isLC = (k) => k === SERIES_L || k === SERIES_C || k === SHUNT_L || k === SHUNT_C;

// ---- the independent evaluation -------------------------------------------------------------------------------
// A circuit here: { z0, f0, w0, f, loadR, loadX, parts: [{ kind, value, zc }] }. Lumped values are physical (H, F, Ω)
// and lengths are in λ at f0, as the editor holds them; f is the frequency it is evaluated at.
const G = [0, 0];
const ND = [0, 0, 0, 0]; // the last gammaAt's Z = N/D
function gammaAt(c, n) {
  let nr, ni, dr, di;
  if (!Number.isFinite(c.loadR) || !Number.isFinite(c.loadX)) { nr = 1; ni = 0; dr = 0; di = 0; }
  else { nr = c.loadR; ni = c.loadX; dr = 1; di = 0; }
  const ratio = c.f / c.f0, w = TAU * c.f, parts = c.parts;
  for (let k = 0; k < n; k++) {
    const p = parts[k], v = p.value, kind = p.kind;
    if (kind <= SERIES_C) {
      const zr = kind === SERIES_R ? v : 0;
      const zi = kind === SERIES_L ? w * v : kind === SERIES_C ? -1 / (w * v) : 0;
      if (!Number.isFinite(zr) || !Number.isFinite(zi)) { nr = 1; ni = 0; dr = 0; di = 0; }
      else { nr += zr * dr - zi * di; ni += zr * di + zi * dr; }
    } else if (kind <= SHUNT_C) {
      const yr = kind === SHUNT_R ? 1 / v : 0;
      const yi = kind === SHUNT_L ? -1 / (w * v) : kind === SHUNT_C ? w * v : 0;
      if (!Number.isFinite(yr) || !Number.isFinite(yi)) { nr = 0; ni = 0; dr = 1; di = 0; }
      else { dr += yr * nr - yi * ni; di += yr * ni + yi * nr; }
    } else if (kind === LINE || kind === QUARTER) {
      const zc = kind === QUARTER ? v : p.zc, th = TAU * (kind === QUARTER ? 0.25 : v) * ratio;
      const cs = Math.cos(th), sn = Math.sin(th), a = zc * sn, b = sn / zc;
      // N' = N cos θ + j Zc sin θ · D, D' = D cos θ + j (sin θ / Zc) · N
      const nr2 = nr * cs - a * di, ni2 = ni * cs + a * dr;
      const dr2 = dr * cs - b * ni, di2 = di * cs + b * nr;
      nr = nr2; ni = ni2; dr = dr2; di = di2;
    } else {
      const th = TAU * v * ratio, cs = Math.cos(th), sn = Math.sin(th);
      if (!(p.zc > 0 && p.zc < Infinity)) {
        // A stub of Zc 0 is a short across the node, of Zc ∞ nothing (except where it is a multiple of λ/4 long).
        if (p.zc === 0) { nr = 0; ni = 0; dr = 1; di = 0; }
      } else if (kind === STUB_OPEN) {
        // Y = j tan θ / Zc, both sides times cos θ
        const b = sn / p.zc;
        const dr2 = dr * cs - b * ni, di2 = di * cs + b * nr;
        nr *= cs; ni *= cs; dr = dr2; di = di2;
      } else {
        // Y = −j cot θ / Zc, both sides times sin θ
        const b = cs / p.zc;
        const dr2 = dr * sn + b * ni, di2 = di * sn - b * nr;
        nr *= sn; ni *= sn; dr = dr2; di = di2;
      }
    }
    const m = Math.max(Math.abs(nr), Math.abs(ni), Math.abs(dr), Math.abs(di));
    // A stub of a multiple of λ/4 scaled the pair by 0: only a short (across a short) gives 0/0, and it stays a short.
    if (m === 0) { nr = 0; ni = 0; dr = 1; di = 0; }
    else if (m > 1e100 || m < 1e-100) { nr /= m; ni /= m; dr /= m; di /= m; }
  }
  ND[0] = nr; ND[1] = ni; ND[2] = dr; ND[3] = di;
  // Γ = (N − Z0 D)/(N + Z0 D)
  const ar = nr - c.z0 * dr, ai = ni - c.z0 * di, br = nr + c.z0 * dr, bi = ni + c.z0 * di;
  const d = br * br + bi * bi;
  G[0] = (ar * br + ai * bi) / d; G[1] = (ai * br - ar * bi) / d;
}

// ---- goals, measured in Γ from their circles ------------------------------------------------------------------
function targetOf(goal, z0) {
  const R = goal.targetR ?? z0, X = goal.targetX ?? 0;
  if (R === Infinity) return [1, 0];
  const ar = R - z0, br = R + z0, d = br * br + X * X;
  return [(ar * br + X * X) / d, (X * br - ar * X) / d];
}
function magOf(goal) {
  const v = goal.value;
  if (goal.kind === 'mag') return v ?? 0;
  if (goal.kind === 'vswr') return v === Infinity ? 1 : ((v ?? 1) - 1) / ((v ?? 1) + 1);
  if (goal.kind === 'rl') return 10 ** (-(v ?? Infinity) / 20);
  return NaN;
}
// The goal as { m } (|Γ| = m), { cx, cy, r } (a circle) or { line: true } (the real axis: x = 0 or b = 0).
function measureOf(goal, z0) {
  if (goal.kind === 'point') { const [tr, ti] = targetOf(goal, z0); return { point: true, tr, ti, rim: Math.hypot(tr, ti) >= 1 - 1e-9 }; }
  const m = magOf(goal);
  if (m === m) return { m, pole: 0 };
  const v = goal.value ?? (goal.kind === 'r' || goal.kind === 'g' ? 1 : 0);
  // pole: the point every circle of the kind passes through, where r, x (the open) or g, b (the short) mean nothing.
  const q = { kind: goal.kind, v, z0 };
  switch (goal.kind) {
    case 'r': return { cx: v / (1 + v), cy: 0, r: 1 / (1 + v), pole: 1, q };
    case 'g': return { cx: -v / (1 + v), cy: 0, r: 1 / (1 + v), pole: -1, q };
    case 'x': return v === 0 ? { line: true, pole: 1, q } : { cx: 1, cy: 1 / v, r: 1 / Math.abs(v), pole: 1, q };
    case 'b': return v === 0 ? { line: true, pole: -1, q } : { cx: -1, cy: -1 / v, r: 1 / Math.abs(v), pole: -1, q };
  }
  throw new Error(goal.kind);
}
// Signed distance from the goal's circle (inside the |Γ| circles negative), or |Γ − Γt| for a point.
function signed(ms, gr, gi) {
  if (ms.point) return Math.hypot(gr - ms.tr, gi - ms.ti);
  if (ms.m !== undefined) return Math.hypot(gr, gi) - ms.m;
  if (ms.line) return gi;
  return Math.hypot(gr - ms.cx, gi - ms.cy) - ms.r;
}
const residualOf = (ms, gr, gi) => Math.abs(signed(ms, gr, gi));
// An r, g, x or b goal's own quantity of the last gammaAt, from Z = N/D (not through Γ).
function quantityOf(q) {
  const [nr, ni, dr, di] = ND;
  if (q.kind === 'r' || q.kind === 'x') { const d = dr * dr + di * di; return (q.kind === 'r' ? nr * dr + ni * di : ni * dr - nr * di) / d / q.z0; }
  const d = nr * nr + ni * ni;
  return ((q.kind === 'g' ? dr * nr + di * ni : di * nr - dr * ni) / d) * q.z0;
}
// A point target's mismatch |Γ − Γt|/|1 − Γt*Γ| (|Γ − Γt| at the rim).
function mismatchOf(ms, gr, gi) {
  const d = Math.hypot(gr - ms.tr, gi - ms.ti);
  if (ms.rim) return d;
  return d / Math.hypot(1 - (ms.tr * gr + ms.ti * gi), ms.tr * gi - ms.ti * gr);
}

// ---- unknowns as bounded coordinates --------------------------------------------------------------------------
// type: x (series L/C), b (shunt L/C), r (series R), g (shunt R), zt (λ/4), len (line, stub), zc, f.
function slotOf(c, u) {
  if (u.param === 'f0') return { part: -1, param: 'f0', type: 'f', lo: Math.log(0.1), hi: Math.log(10), per: 0 };
  if (u.param === 'zc') return { part: u.part, param: 'zc', type: 'zc', lo: 0, hi: HALF_PI, per: 0 };
  const kind = c.parts[u.part].kind;
  const type = kind === SERIES_R ? 'r' : kind === SHUNT_R ? 'g' : kind === QUARTER ? 'zt'
    : kind === SERIES_L || kind === SERIES_C ? 'x' : kind === SHUNT_L || kind === SHUNT_C ? 'b' : 'len';
  if (type === 'x' || type === 'b') return { part: u.part, param: 'value', type, lo: -HALF_PI, hi: HALF_PI, per: Math.PI };
  if (type === 'len') return { part: u.part, param: 'value', type, lo: 0, hi: 0.5, per: 0.5 };
  return { part: u.part, param: 'value', type, lo: 0, hi: HALF_PI, per: 0 };
}
// Put the unknown at coordinate u into the circuit.
function setSlot(c, s, u) {
  if (s.type === 'f') { c.f = c.f0 * Math.exp(u); return; }
  const p = c.parts[s.part];
  switch (s.type) {
    case 'x': { const x = Math.tan(u); if (x >= 0) { p.kind = SERIES_L; p.value = (x * c.z0) / c.w0; } else { p.kind = SERIES_C; p.value = -1 / (c.w0 * x * c.z0); } break; }
    case 'b': { const b = Math.tan(u); if (b >= 0) { p.kind = SHUNT_C; p.value = b / (c.w0 * c.z0); } else { p.kind = SHUNT_L; p.value = -c.z0 / (c.w0 * b); } break; }
    case 'r': p.value = c.z0 * Math.tan(u); break;
    case 'g': p.value = c.z0 / Math.tan(u); break;
    case 'zt': p.value = c.z0 * Math.sqrt(Math.tan(u)); break;
    case 'len': p.value = u; break;
    case 'zc': p.zc = c.z0 * Math.tan(u); break;
  }
}
// The coordinate of a value of the solver's (its kind and value in its unit); raw keeps a length as it is (range ends).
function coordOf(c, s, kind, value, raw = false) {
  if (s.type === 'f') return Math.log(value / c.f0);
  if (s.type === 'zc') return Math.atan(value / c.z0);
  const z0 = c.z0, w0 = c.w0;
  switch (kind) {
    case SERIES_R: return Math.atan(value / z0);
    case SHUNT_R: return Math.atan(z0 / value);
    case SERIES_L: return Math.atan((w0 * value) / z0);
    case SERIES_C: return Math.atan(-1 / (w0 * value * z0));
    case SHUNT_C: return Math.atan(w0 * value * z0);
    case SHUNT_L: return Math.atan(-z0 / (w0 * value));
    case QUARTER: return Math.atan((value / z0) ** 2);
    default: return raw ? value : value - 0.5 * Math.floor(value / 0.5);
  }
}
// Which kinds a coordinate type may come back as.
const KINDS_OF = { x: [SERIES_L, SERIES_C], b: [SHUNT_L, SHUNT_C], r: [SERIES_R], g: [SHUNT_R], zt: [QUARTER], len: [LINE, STUB_OPEN, STUB_SHORT] };
function distance(s, a, b) {
  let d = Math.abs(a - b);
  if (s.per) { d %= s.per; d = Math.min(d, s.per - d); }
  return d;
}
// The solver's coordinate (its Domain) of my coordinate u: the same atan for r, x, g, b, (Zt/Z0)², Zc and a line's
// length; a stub's is atan of its b, unrolled ([0, π] open, (−π/2, π/2) short).
function solverT(c, s, u) {
  if (s.type !== 'len' && s.type !== 'zc') return u;
  const kind = c.parts[s.part].kind;
  if (kind === LINE) return u;
  if (s.type === 'zc') {
    const tn = Math.tan(TAU * c.parts[s.part].value), zcn = Math.tan(u);
    return Math.atan(kind === STUB_OPEN ? tn / zcn : -1 / (tn * zcn));
  }
  const th = TAU * u, zcn = c.parts[s.part].zc / c.z0;
  return kind === STUB_OPEN ? Math.atan2(Math.sin(th), zcn * Math.cos(th)) : Math.atan2(-Math.cos(th), zcn * Math.sin(th));
}
// The period of the solver's coordinate: π for a stub's unrolled b.
const tPeriod = (c, s) => (s.type === 'len' && c.parts[s.part].kind !== LINE ? Math.PI : s.per);
// Clamp or wrap a coordinate into its domain (open ends kept 1e-13 inside for Zt and Zc, which are 0 or ∞ there).
function inDomain(s, u) {
  if (s.per) return u - s.per * Math.floor((u - s.lo) / s.per);
  const e = s.type === 'zt' || s.type === 'zc' ? 1e-13 : 0;
  return Math.min(s.hi - e, Math.max(s.lo + e, u));
}

// A copy of the circuit for the brute force, at f0.
const working = (circuit) => ({ ...circuit, w0: TAU * circuit.f0, f: circuit.f0, parts: circuit.parts.map((p) => ({ kind: p.kind, value: p.value, zc: p.zc ?? 0 })) });
// The circuit with a solution of the solver's put in.
function withSolution(circuit, result, sol) {
  const c = working(circuit);
  sol.values.forEach((v, i) => {
    const u = result.unknowns[i];
    if (u.param === 'f0') c.f = v.value;
    else if (u.param === 'zc') c.parts[u.part].zc = v.value;
    else c.parts[u.part] = { kind: v.kind, value: v.value, zc: v.zc ?? c.parts[u.part].zc };
  });
  return c;
}

// ---- brute force: one unknown -----------------------------------------------------------------------------------
// fn(c) is evaluated after gammaAt; the grid has M cells, sampled at their centres.
function scan1(c, s, n, fn, M) {
  const v = new Float64Array(M), h = (s.hi - s.lo) / M;
  for (let i = 0; i < M; i++) { setSlot(c, s, s.lo + (i + 0.5) * h); gammaAt(c, n); v[i] = fn(); }
  return v;
}
function at1(c, s, n, fn, u) { setSlot(c, s, u); gammaAt(c, n); return fn(); }
function golden(f, a, b, iters = 80) {
  const r = (Math.sqrt(5) - 1) / 2;
  let x1 = b - r * (b - a), x2 = a + r * (b - a), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < iters && b - a > 1e-16 * (1 + Math.abs(a)); i++) {
    if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - r * (b - a); f1 = f(x1); }
    else { a = x1; x1 = x2; f1 = f2; x2 = a + r * (b - a); f2 = f(x2); }
  }
  return f1 < f2 ? [x1, f1] : [x2, f2];
}
// Roots of the signed distance in one unknown: sign changes bisected, and touching zeros (local minima of |s|).
function roots1(c, s, n, ms, M) {
  const fn = () => signed(ms, G[0], G[1]);
  const v = scan1(c, s, n, fn, M), h = (s.hi - s.lo) / M, roots = [];
  const uAt = (i) => s.lo + (i + 0.5) * h;
  const last = s.per ? M : M - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % M, a = v[i], b = v[j];
    if (!(a * b <= 0)) continue;
    let lo = uAt(i), hi = lo + h, flo = a;
    if (a === 0) { roots.push(inDomain(s, lo)); continue; }
    if (b === 0) continue;
    for (let k = 0; k < 200 && hi - lo > 1e-16 * (1 + Math.abs(lo)); k++) {
      const mid = 0.5 * (lo + hi), fm = at1(c, s, n, fn, inDomain(s, mid));
      if (fm === 0) { lo = hi = mid; break; }
      if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    const u = inDomain(s, 0.5 * (lo + hi));
    if (Math.abs(at1(c, s, n, fn, u)) < 1e-10) roots.push(u);
  }
  // Touching: a local minimum of |s| that is no sign change.
  const absAt = (u) => Math.abs(at1(c, s, n, fn, inDomain(s, u)));
  for (let i = 0; i < M; i++) {
    const a = Math.abs(v[i]);
    if (!(a < 1e-2)) continue;
    const ip = i > 0 ? i - 1 : s.per ? M - 1 : -1, iq = i < M - 1 ? i + 1 : s.per ? 0 : -1;
    if ((ip >= 0 && Math.abs(v[ip]) < a) || (iq >= 0 && Math.abs(v[iq]) < a)) continue;
    if ((ip >= 0 && v[ip] * v[i] <= 0) || (iq >= 0 && v[iq] * v[i] <= 0)) continue;
    const [u, f] = golden(absAt, uAt(i) - h, uAt(i) + h);
    if (f < 1e-10) roots.push(inDomain(s, u));
  }
  // Roots at the goal's pole (an open or short made by the unknown) are not answers. 1e-6 rather than the solver's
  // 1e-7: near the pole every circle of the kind is within (distance)² of the goal's, so bisection there stops short.
  if (!ms.q) return dedupe1(s, roots);
  const out = [];
  for (const u0 of roots) {
    setSlot(c, s, u0); gammaAt(c, n);
    const u = Math.hypot(G[0] - ms.pole, G[1]) < POLE_NEAR ? nearPole(c, s, n, ms, u0, h) : u0;
    if (!(u === u)) continue;
    setSlot(c, s, u); gammaAt(c, n);
    if (!(Math.hypot(G[0] - ms.pole, G[1]) < 1e-6)) out.push(u);
  }
  return dedupe1(s, out);
}
// Within POLE_NEAR of the pole, circles of the goal's kind that differ by Δq are only d²·Δq/2 apart in Γ (d the
// distance from the pole), so the rounding of Γ can make sign changes of the signed distance where the goal's
// quantity never meets the goal (a shunt stub that nearly shorts the input keeps g, yet seemed to meet a g circle at
// 1.6e-6 from the short; BL55). Such a root is found again on the goal's own quantity from Z = N/D, which keeps its
// precision there: the sign change of q − v nearest it within one cell either way, bisected, or a touching minimum of
// |q − v|; none: no root (NaN).
const POLE_NEAR = 1e-3;
function nearPole(c, s, n, ms, u0, h) {
  const v = ms.q.v;
  const q = (u) => { setSlot(c, s, inDomain(s, u)); gammaAt(c, n); return quantityOf(ms.q) - v; };
  let a = u0 - h, b = u0 + h;
  if (!s.per) { a = Math.max(s.lo, a); b = Math.min(s.hi, b); }
  const K = 64, step = (b - a) / K;
  let best = NaN, xa = a, fa = q(a), minAt = a, minF = Math.abs(fa);
  for (let k = 1; k <= K; k++) {
    const xb = a + k * step, fb = q(xb);
    if (Math.abs(fb) < minF) { minF = Math.abs(fb); minAt = xb; }
    if (fa * fb <= 0) {
      let lo = xa, hi = xb, flo = fa;
      for (let it = 0; it < 200 && hi - lo > 1e-16 * (1 + Math.abs(lo)); it++) {
        const mid = 0.5 * (lo + hi), fm = q(mid);
        if (fm === 0) { lo = hi = mid; break; }
        if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      // q is finite off the pole, so a sign change through q = ±∞ ends at the pole, which the caller drops; q can be
      // too steep at a root for any bar on q itself, so the root is the usual one on the goal's circle in Γ.
      const r = 0.5 * (lo + hi);
      q(r);
      if (residualOf(ms, G[0], G[1]) < 1e-10 && !(Math.abs(r - u0) >= Math.abs(best - u0))) best = r;
    }
    xa = xb; fa = fb;
  }
  if (best === best) return inDomain(s, best);
  const [r, f] = golden((u) => Math.abs(q(u)), Math.max(a, minAt - step), Math.min(b, minAt + step));
  return f <= 1e-9 * Math.max(1, Math.abs(v)) ? inDomain(s, r) : NaN;
}
function dedupe1(s, roots) {
  roots.sort((a, b) => a - b);
  const out = [];
  for (const u of roots) if (!out.some((w) => distance(s, w, u) < 1e-7)) out.push(u);
  return out;
}

// ---- brute force: two unknowns, a point target ------------------------------------------------------------------
const FV = [0, 0];
function F2(c, s1, s2, n, ms, u1, u2) {
  setSlot(c, s1, u1); setSlot(c, s2, u2); gammaAt(c, n);
  FV[0] = G[0] - ms.tr; FV[1] = G[1] - ms.ti;
  return Math.hypot(FV[0], FV[1]);
}
function newton2(c, s1, s2, n, ms, u) {
  let e = F2(c, s1, s2, n, ms, u[0], u[1]);
  for (let it = 0; it < 60 && e > 1e-15; it++) {
    const f0 = FV[0], f1 = FV[1], h = 1e-7;
    F2(c, s1, s2, n, ms, u[0] + h, u[1]); const ar = FV[0], ai = FV[1];
    F2(c, s1, s2, n, ms, u[0] - h, u[1]); const a11 = (ar - FV[0]) / (2 * h), a21 = (ai - FV[1]) / (2 * h);
    F2(c, s1, s2, n, ms, u[0], u[1] + h); const br = FV[0], bi = FV[1];
    F2(c, s1, s2, n, ms, u[0], u[1] - h); const a12 = (br - FV[0]) / (2 * h), a22 = (bi - FV[1]) / (2 * h);
    const det = a11 * a22 - a12 * a21;
    if (!(Math.abs(det) > 0)) break;
    let d1 = -(a22 * f0 - a12 * f1) / det, d2 = -(-a21 * f0 + a11 * f1) / det;
    const big = Math.hypot(d1, d2);
    if (big > 0.2) { d1 *= 0.2 / big; d2 *= 0.2 / big; }
    let lam = 1, moved = false;
    for (; lam > 1e-6; lam *= 0.5) {
      const v1 = inDomain(s1, u[0] + lam * d1), v2 = inDomain(s2, u[1] + lam * d2);
      const en = F2(c, s1, s2, n, ms, v1, v2);
      if (en < e) { u[0] = v1; u[1] = v2; e = en; moved = true; break; }
    }
    if (!moved || lam * Math.hypot(d1, d2) < 1e-17) break;
  }
  return F2(c, s1, s2, n, ms, u[0], u[1]);
}
// Every root on an NA × NB grid of the two coordinates: Newton from every local minimum of |Γ − Γt| below 0.3.
function roots2(c, s1, s2, n, ms, NA, NB) {
  const v = new Float64Array(NA * NB), h1 = (s1.hi - s1.lo) / NA, h2 = (s2.hi - s2.lo) / NB;
  for (let i = 0; i < NA; i++) {
    setSlot(c, s1, s1.lo + (i + 0.5) * h1);
    for (let j = 0; j < NB; j++) {
      setSlot(c, s2, s2.lo + (j + 0.5) * h2); gammaAt(c, n);
      const e = Math.hypot(G[0] - ms.tr, G[1] - ms.ti);
      v[i * NB + j] = e === e ? e : Infinity;
    }
  }
  const starts = [];
  for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) {
    const e = v[i * NB + j];
    if (!(e < 0.3)) continue;
    let min = true;
    for (let di = -1; di <= 1 && min; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      let a = i + di, b = j + dj;
      if (a < 0 || a >= NA) { if (!s1.per) continue; a = (a + NA) % NA; }
      if (b < 0 || b >= NB) { if (!s2.per) continue; b = (b + NB) % NB; }
      if (v[a * NB + b] < e) { min = false; break; }
    }
    if (min) starts.push([e, i, j]);
  }
  starts.sort((a, b) => a[0] - b[0]);
  const roots = [];
  for (const [, i, j] of starts.slice(0, 400)) {
    const u = [s1.lo + (i + 0.5) * h1, s2.lo + (j + 0.5) * h2];
    const e = newton2(c, s1, s2, n, ms, u);
    if (e < 1e-11 && !roots.some((r) => distance(s1, r[0], u[0]) < 1e-7 && distance(s2, r[1], u[1]) < 1e-7)) roots.push(u);
  }
  return roots;
}

// ---- problems ---------------------------------------------------------------------------------------------------
// A seeded generator of its own (the same as check.mjs's), for streams beside the shared one.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function runValidateChecks({ section, ok, random: sharedRandom }) {
  let random = sharedRandom;
  const logU = (lo, hi) => 10 ** (lo + (hi - lo) * random());
  const pick = (a) => a[Math.floor(random() * a.length)];
  const Z0S = [50, 75, 1, 300, 0.01, 1e4];
  const LOSSLESS = [SERIES_L, SERIES_C, SHUNT_L, SHUNT_C, LINE, STUB_OPEN, STUB_SHORT, QUARTER];

  // A load anywhere in the chart, a third of them within 0.1 of the rim (down to 1e-6).
  function randomLoad(z0) {
    const mag = random() < 0.3 ? 1 - 10 ** (-1 - 5 * random()) : Math.sqrt(random()) * 0.97, ang = TAU * random();
    const gr = mag * Math.cos(ang), gi = mag * Math.sin(ang), dr = 1 - gr, di = -gi, d = dr * dr + di * di;
    return [(((1 + gr) * dr + gi * di) / d) * z0, ((gi * dr - (1 + gr) * di) / d) * z0];
  }
  function randomPart(kind, z0, w0, maxLen = 0.5) {
    const a = logU(-1.5, 1.5);
    switch (kind) {
      case SERIES_R: return { kind, value: a * z0 };
      case SERIES_L: return { kind, value: (a * z0) / w0 };
      case SERIES_C: return { kind, value: 1 / (w0 * a * z0) };
      case SHUNT_R: return { kind, value: z0 / a };
      case SHUNT_L: return { kind, value: z0 / (w0 * a) };
      case SHUNT_C: return { kind, value: a / (w0 * z0) };
      case QUARTER: return { kind, value: z0 * logU(-0.5, 0.5) };
      default: {
        // A stub's length kept off multiples of λ/4 (where its Zc does nothing).
        const len = kind === LINE ? maxLen * random() : 0.01 + 0.23 * random() + (maxLen > 0.25 && random() < 0.5 ? 0.25 : 0);
        return { kind, value: len, zc: z0 * logU(-0.5, 0.5) };
      }
    }
  }
  // specs: part kinds (their value unknown), 'zcLine', 'zcStub', 'zcLen' (one line's Zc and length), 'f0'.
  // Fixed parts: 0 to maxFixed before, between and after the unknowns; f0 problems get shorter lines.
  function randomProblem(specs, { maxFixed = 2, f0 = false } = {}) {
    const z0 = pick(Z0S), fz = logU(5, 10), w0 = TAU * fz, maxLen = f0 ? 0.25 : 0.5;
    const [loadR, loadX] = randomLoad(z0);
    const parts = [], unknowns = [];
    const fixed = () => parts.push(randomPart(random() < 0.9 ? pick(LOSSLESS) : pick([SERIES_R, SHUNT_R]), z0, w0, maxLen));
    for (let k = Math.floor(random() * (maxFixed + 1)); k > 0; k--) fixed();
    for (const spec of specs) {
      if (spec === 'f0') continue;
      if (spec === 'zcLine' || spec === 'zcLen') {
        if (spec === 'zcLen') unknowns.push({ part: parts.length });
        unknowns.push({ part: parts.length, param: 'zc' });
        parts.push(randomPart(LINE, z0, w0, maxLen));
      } else if (spec === 'zcStub') {
        unknowns.push({ part: parts.length, param: 'zc' });
        parts.push(randomPart(random() < 0.5 ? STUB_OPEN : STUB_SHORT, z0, w0, maxLen));
      } else {
        unknowns.push({ part: parts.length, free: isLC(spec) && random() < 0.4 });
        parts.push(randomPart(spec, z0, w0, maxLen));
      }
      for (let k = Math.floor(random() * (maxFixed + 1)); k > 0; k--) fixed();
    }
    if (specs.includes('f0')) unknowns.push({ part: 0, param: 'f0' });
    return { circuit: { z0, f0: fz, loadR, loadX, parts }, unknowns };
  }
  // The goal at the input, or (a fifth) at a node between the last unknown part and the input.
  function placeGoal(goal, circuit, unknowns) {
    const lastPart = Math.max(-1, ...unknowns.filter((u) => u.param !== 'f0').map((u) => u.part));
    const count = circuit.parts.length;
    if (random() < 0.2 && count > lastPart + 1) goal.node = lastPart + 1 + Math.floor(random() * (count - lastPart));
    return goal;
  }
  function pointGoal(z0) {
    const goal = { kind: 'point' };
    if (random() < 0.5) {
      const mag = Math.sqrt(random()) * 0.9, ang = TAU * random();
      const gr = mag * Math.cos(ang), gi = mag * Math.sin(ang), dr = 1 - gr, di = -gi, d = dr * dr + di * di;
      goal.targetR = (((1 + gr) * dr + gi * di) / d) * z0; goal.targetX = ((gi * dr - (1 + gr) * di) / d) * z0;
    }
    return goal;
  }
  function circleGoal() {
    const kind = pick(['mag', 'vswr', 'rl', 'r', 'g', 'x', 'b']);
    const sign = random() < 0.5 ? -1 : 1;
    switch (kind) {
      case 'mag': return { kind, value: 0.05 + 0.85 * random() };
      case 'vswr': return { kind, value: 1 + logU(-1, 1) };
      case 'rl': return { kind, value: 1 + 29 * random() };
      case 'r': case 'g': return { kind, value: logU(-1, 1) };
      default: return { kind, value: random() < 0.1 ? 0 : sign * logU(-1, 1) };
    }
  }
  function withinGoal() {
    const kind = pick(['mag', 'vswr', 'rl']);
    const value = kind === 'mag' ? 0.1 + 0.7 * random() : kind === 'vswr' ? 1.2 + 4 * random() : 3 + 17 * random();
    return { kind, value, within: true };
  }

  // ---- counters and determinism -------------------------------------------------------------------------------------
  const stats = new Map();
  function tally(kind) {
    if (!stats.has(kind)) stats.set(kind, { problems: 0, statuses: {}, solutions: 0, brute: 0, misses: 0, false: 0, solverOnly: 0, worst: 0, extra: '' });
    return stats.get(kind);
  }
  const replay = [];
  const essence = (r) => JSON.stringify([r.status, r.reason, r.solutions, r.ranges, Array.from(r.circles), r.circleNode, r.unknowns]);
  function run(kind, circuit, unknowns, goal) {
    const res = solve(circuit, unknowns, goal);
    const t = tally(kind);
    t.problems++;
    t.statuses[res.status] = (t.statuses[res.status] ?? 0) + 1;
    if (t.problems <= 40) replay.push([circuit, unknowns, goal, essence(res)]);
    return res;
  }
  const describe = (circuit, unknowns, goal) => JSON.stringify({ circuit, unknowns, goal });
  const failOnce = new Map();
  function check(kind, condition, what, problem) {
    if (condition) { ok(true, what); return; }
    const n = (failOnce.get(kind) ?? 0) + 1;
    failOnce.set(kind, n);
    ok(false, n <= 5 ? `${what} in ${problem}` : what);
  }
  // Every solution of the solver re-evaluated independently; returns my coordinates of each.
  function reEvaluate(kind, circuit, res, sol, slots, ms, n, problem, exact = true) {
    const t = tally(kind);
    const c = withSolution(circuit, res, sol);
    gammaAt(c, n);
    const r = residualOf(ms, G[0], G[1]);
    if (exact) {
      t.worst = Math.max(t.worst, r);
      // Above 1e-9 only by what a few ulps of the values move Γ (a near-rim load seen through a nearly shorting stub):
      // that is the rounding of the values as doubles, not the solver's.
      const k = r < EXACT ? 0 : conditioning(c, res, n);
      if (k) { t.conditioned = (t.conditioned ?? 0) + 1; t.worstK = Math.max(t.worstK ?? 0, r); }
      check(kind, r < EXACT + k, `${kind}: a solution re-evaluates to residual ${r} (rounding of its values moves Γ by ${k})`, problem);
      if (!(r < EXACT + k)) t.false++;
      gammaAt(c, n);
    }
    const coords = sol.values.map((v, i) => {
      const s = slots[i];
      if (s.type !== 'f' && s.type !== 'zc') check(kind, KINDS_OF[s.type].includes(v.kind), `${kind}: kind ${v.kind} for a ${s.type} unknown`, problem);
      const u = coordOf(c, s, v.kind, v.value);
      if (s.type === 'f') check(kind, u >= s.lo - 1e-12 && u <= s.hi + 1e-12, `${kind}: f0 ${v.value} outside its search range`, problem);
      check(kind, distance({ per: tPeriod(c, s) }, solverT(c, s, u), v.coord) < 1e-9,
        `${kind}: the solver's coord ${v.coord} is its value's (${solverT(c, s, u)})`, problem);
      return u;
    });
    return { coords, residual: r };
  }
  // How far Γ moves when any value of the circuit (each part's value and Zc, the load, the frequency; the unknowns
  // among them) moves by 1e-15 relative (about 4 ulps) either way: the floor of any residual. Not only the unknowns'
  // (BL56): at a high-Q resonance Γ moved 9e-8 per 1e-15 of f or of a fixed line's length, and network.ts and this
  // evaluation, each exact to rounding, gave a residual of 4.7e-9 for a solution the unknowns alone bound at 2e-9.
function conditioning(c, res, n) {
  gammaAt(c, n);
  const g0 = G[0], g1 = G[1];
  let k = 0;
  const nudge = (obj, key) => {
    const old = obj[key];
    if (!(old !== 0 && Math.abs(old) < Infinity)) return;
    for (const e of [1e-15, -1e-15]) {
      obj[key] = old * (1 + e); gammaAt(c, n); obj[key] = old;
      k = Math.max(k, Math.hypot(G[0] - g0, G[1] - g1));
    }
  };
  for (let i = 0; i < n; i++) { const p = c.parts[i]; nudge(p, 'value'); if (p.kind >= LINE && p.kind !== QUARTER) nudge(p, 'zc'); }
  nudge(c, 'loadR'); nudge(c, 'loadX'); nudge(c, 'f');
  return k;
}
const slotsFor = (circuit, res) => res.unknowns.map((u) => slotOf(circuit, u));
  const nodeOf = (goal, circuit) => goal.node ?? circuit.parts.length;
  // Compare brute-force roots with the solver's solutions (in my coordinates).
  function compare(kind, slots, brute, mine, problem) {
    const t = tally(kind);
    t.brute += brute.length; t.solutions += mine.length;
    const same = (a, b) => a.every((x, i) => distance(slots[i], x, b[i]) < MATCH);
    for (const b of brute) {
      const found = mine.some((m) => same(m, b));
      if (!found) t.misses++;
      check(kind, found, `${kind}: the brute force's solution ${b.map((x) => x.toPrecision(12))} is not the solver's (${mine.map((m) => m.map((x) => x.toPrecision(8)).join('/')).join(', ')})`, problem);
    }
    for (const m of mine) if (!brute.some((b) => same(m, b))) t.solverOnly++;
  }
  // A hard end of a non-periodic coordinate (Zt or Zc of 0 or ∞, the ends of the f0 range): not a solution.
  const atEnd = (s, u) => !s.per && (s.type === 'zt' || s.type === 'zc' || s.type === 'f') && (u - s.lo < 1e-9 || s.hi - u < 1e-9);

  // ==============================================================================================================
  section('validate two unknowns, point target');
  for (let p = 0; p < 240; p++) {
    const kinds = p < 100 ? [p % PART_KINDS, Math.floor(p / PART_KINDS) % PART_KINDS] : [Math.floor(random() * PART_KINDS), Math.floor(random() * PART_KINDS)];
    const { circuit, unknowns } = randomProblem(kinds);
    const goal = placeGoal(pointGoal(circuit.z0), circuit, unknowns);
    validateTwoPoint('two unknowns, point target', circuit, unknowns, goal, 240, 240);
  }
  function validateTwoPoint(kind, circuit, unknowns, goal, NA, NB) {
    const res = run(kind, circuit, unknowns, goal), problem = describe(circuit, unknowns, goal);
    const ms = measureOf(goal, circuit.z0), n = nodeOf(goal, circuit), slots = slotsFor(circuit, res);
    if (res.status === 'rejected') { check(kind, false, `${kind}: rejected (${res.reason})`, problem); return; }
    if (res.status === 'degenerate' || res.status === 'coincident') return;
    const mine = res.solutions.map((s) => reEvaluate(kind, circuit, res, s, slots, ms, n, problem).coords);
    const c = working(circuit);
    const brute = roots2(c, slots[0], slots[1], n, ms, NA, NB).filter((u) => !atEnd(slots[0], u[0]) && !atEnd(slots[1], u[1]));
    compare(kind, slots, brute, mine, problem);
  }

  // ==============================================================================================================
  section('validate one unknown, circle goal');
  for (let p = 0; p < 240; p++) {
    const { circuit, unknowns } = randomProblem([p < 100 ? p % PART_KINDS : Math.floor(random() * PART_KINDS)]);
    validateOneCircle('one unknown, circle goal', circuit, unknowns, placeGoal(circleGoal(), circuit, unknowns), 20000);
  }
  function validateOneCircle(kind, circuit, unknowns, goal, M) {
    const res = run(kind, circuit, unknowns, goal), problem = describe(circuit, unknowns, goal);
    const ms = measureOf(goal, circuit.z0), n = nodeOf(goal, circuit), slots = slotsFor(circuit, res);
    if (res.status === 'rejected') { check(kind, false, `${kind}: rejected (${res.reason})`, problem); return; }
    const c = working(circuit);
    if (res.status === 'coincident') {
      const v = scan1(c, slots[0], n, () => residualOf(ms, G[0], G[1]), 200);
      check(kind, v.every((x) => x < EXACT), `${kind}: coincident, but some value misses the goal`, problem);
      return;
    }
    const mine = res.solutions.map((s) => reEvaluate(kind, circuit, res, s, slots, ms, n, problem).coords);
    const brute = roots1(c, slots[0], n, ms, M).filter((u) => !atEnd(slots[0], u)).map((u) => [u]);
    compare(kind, slots, brute, mine, problem);
  }

  // ==============================================================================================================
  section('validate one unknown, best value');
  for (let p = 0; p < 240; p++) {
    const { circuit, unknowns } = randomProblem([p < 100 ? p % PART_KINDS : Math.floor(random() * PART_KINDS)]);
    validateBest('one unknown, best value', circuit, unknowns, placeGoal(pointGoal(circuit.z0), circuit, unknowns), 20000);
  }
  function validateBest(kind, circuit, unknowns, goal, M) {
    const res = run(kind, circuit, unknowns, goal), problem = describe(circuit, unknowns, goal);
    const ms = measureOf(goal, circuit.z0), n = nodeOf(goal, circuit), slots = slotsFor(circuit, res), s = slots[0];
    const t = tally(kind);
    if (res.status !== 'best' && res.status !== 'solved') { check(kind, res.status === 'degenerate', `${kind}: status ${res.status} (${res.reason})`, problem); return; }
    const c = working(circuit);
    const fn = () => mismatchOf(ms, G[0], G[1]);
    const v = scan1(c, s, n, fn, M), h = (s.hi - s.lo) / M;
    // The scan's best, overall and (for an L or C that is not free) among values of the part's own kind.
    const part = circuit.parts[s.part], own = s.param === 'value' && isLC(part.kind) && !unknowns[0].free;
    const sideOk = (u) => !own || ((part.kind === SERIES_L || part.kind === SHUNT_C) ? u >= 0 : u <= 0);
    const at = (u) => { const x = at1(c, s, n, fn, u); return x === x ? x : Infinity; };
    let best = Infinity, bestOwn = Infinity;
    const consider = (u, x) => { if (atEnd(s, u)) return; if (x < best) best = x; if (sideOk(u) && x < bestOwn) bestOwn = x; };
    for (const u of [s.lo, s.hi, 0]) if (u >= s.lo && u <= s.hi) consider(inDomain(s, u), at(inDomain(s, u)));
    for (let i = 0; i < M; i++) {
      const x = v[i];
      const ip = i > 0 ? i - 1 : s.per ? M - 1 : -1, iq = i < M - 1 ? i + 1 : s.per ? 0 : -1;
      if ((ip >= 0 && v[ip] < x) || (iq >= 0 && v[iq] < x)) continue;
      const u = s.lo + (i + 0.5) * h;
      let a = u - h, b = u + h;
      if (!s.per) { a = Math.max(s.lo, a); b = Math.min(s.hi, b); }
      const [um, xm] = golden((y) => at(inDomain(s, y)), a, b);
      consider(inDomain(s, um), xm);
      if (own) { const [uo, xo] = golden((y) => (sideOk(inDomain(s, y)) ? at(inDomain(s, y)) : Infinity), a, b); consider(inDomain(s, uo), xo); }
    }
    t.brute++;
    const sols = res.solutions.map((sol) => {
      const cc = withSolution(circuit, res, sol);
      gammaAt(cc, n);
      const mm = mismatchOf(ms, G[0], G[1]);
      check(kind, Math.abs(mm - sol.mismatch) < 1e-9, `${kind}: reported mismatch ${sol.mismatch}, re-evaluated ${mm}`, problem);
      reEvaluate(kind, circuit, res, sol, slots, ms, n, problem, false);
      return { mm, sol };
    });
    t.solutions += sols.length;
    if (!sols.length) { check(kind, false, `${kind}: no solution`, problem); return; }
    if (res.status === 'solved') {
      const r = Math.min(...sols.map((x) => { const cc = withSolution(circuit, res, x.sol); gammaAt(cc, n); return residualOf(ms, G[0], G[1]); }));
      t.worst = Math.max(t.worst, r);
      check(kind, r < EXACT, `${kind}: an exact hit re-evaluates to ${r}`, problem);
      return;
    }
    // The nearest value overall, and (when the overall best is swapped) the nearest realisable one.
    const gap = Math.min(...sols.map((x) => x.mm)) - best;
    t.worstGap = Math.max(t.worstGap ?? -Infinity, gap);
    if (!(gap <= 1e-12)) t.misses++;
    check(kind, gap <= 1e-12, `${kind}: the scan beats the best value by ${gap} (${Math.min(...sols.map((x) => x.mm))} vs ${best})`, problem);
    const real = sols.filter((x) => x.sol.realisable);
    check(kind, real.length > 0 || bestOwn === Infinity, `${kind}: no realisable solution`, problem);
    check(kind, res.solutions[0].realisable || !real.length, `${kind}: the realisable solution first`, problem);
    if (real.length && own) {
      const g2 = Math.min(...real.map((x) => x.mm)) - bestOwn;
      t.worstGap = Math.max(t.worstGap, g2);
      if (!(g2 <= 1e-12)) t.misses++;
      check(kind, g2 <= 1e-12, `${kind}: the scan beats the best realisable value by ${g2}`, problem);
    }
  }

  // ==============================================================================================================
  section('validate one unknown, ranges');
  for (let p = 0; p < 240; p++) {
    const { circuit, unknowns } = randomProblem([p < 100 ? p % PART_KINDS : Math.floor(random() * PART_KINDS)]);
    validateRanges('one unknown, ranges', circuit, unknowns, placeGoal(withinGoal(), circuit, unknowns), 20000);
  }
  function validateRanges(kind, circuit, unknowns, goal, M) {
    const res = run(kind, circuit, unknowns, goal), problem = describe(circuit, unknowns, goal);
    const ms = measureOf(goal, circuit.z0), n = nodeOf(goal, circuit), slots = slotsFor(circuit, res), s = slots[0];
    const t = tally(kind);
    if (res.status !== 'range' && res.status !== 'none') { check(kind, false, `${kind}: status ${res.status} (${res.reason})`, problem); return; }
    const c = working(circuit);
    // Ranges in my coordinate.
    const spans = res.ranges.map((r) => {
      const a = coordOf(c, s, r.kind, r.from, true), b = coordOf(c, s, r.kind, r.to, true);
      return [Math.min(a, b), Math.max(a, b), r];
    });
    t.solutions += spans.length;
    // Each edge inside the domain (not an end, not the L/C cut at 0) is on the goal's circle.
    for (const [a, b, r] of spans) {
      for (const [u, value] of [[a, r.from], [b, r.to]]) {
        const cc = working(circuit);
        // A Zt or Zc of 0 or ∞ is no value: its end is taken just inside.
        if (s.type === 'zt' || s.type === 'zc') setSlot(cc, s, inDomain(s, u));
        else if (s.type === 'f') cc.f = value; else { cc.parts[s.part].kind = r.kind; cc.parts[s.part].value = value; }
        gammaAt(cc, n);
        const d = signed(ms, G[0], G[1]);
        const edge = Math.abs(u - s.lo) > 1e-12 && Math.abs(u - s.hi) > 1e-12 && !((s.type === 'x' || s.type === 'b') && Math.abs(u) < 1e-12);
        if (edge) { t.worst = Math.max(t.worst, Math.abs(d)); check(kind, Math.abs(d) < EXACT, `${kind}: a range edge is ${d} off the goal's circle`, problem); }
        else check(kind, d < EXACT, `${kind}: a range end at the domain's end or cut misses the goal by ${d}`, problem);
      }
    }
    // Every scanned value: inside the goal exactly when inside a range (values within 1e-7 of an edge skipped).
    const v = scan1(c, s, n, () => signed(ms, G[0], G[1]), M), h = (s.hi - s.lo) / M;
    let wrong = 0, inside = 0;
    for (let i = 0; i < M; i++) {
      const u = s.lo + (i + 0.5) * h;
      if (spans.some(([a, b]) => Math.abs(u - a) < 1e-7 || Math.abs(u - b) < 1e-7)) continue;
      const keeps = v[i] <= 0, inRange = spans.some(([a, b]) => u > a && u < b);
      if (keeps) inside++;
      if (keeps !== inRange) wrong++;
    }
    t.brute += inside;
    if (wrong) t.misses++;
    check(kind, wrong === 0, `${kind}: ${wrong} of ${M} scanned values disagree with the ranges`, problem);
  }

  // ==============================================================================================================
  section('validate two unknowns, family');
  const familyProblems = (kind) => {
    for (let p = 0; p < 220; p++) {
      const kinds = p < 100 ? [p % PART_KINDS, Math.floor(p / PART_KINDS) % PART_KINDS] : [Math.floor(random() * PART_KINDS), Math.floor(random() * PART_KINDS)];
      const { circuit, unknowns } = randomProblem(kinds);
      validateFamily(kind, circuit, unknowns, placeGoal(circleGoal(), circuit, unknowns), 120, 1500);
    }
  };
  familyProblems('two unknowns, family');
  // The same on streams of their own (BL55: another stream found members the solver lacked), the shared one untouched.
  {
    const shared = random;
    for (const s of [0x2f6b1, 0x9e3d7, 0x51c4a]) {
      random = seeded(s);
      familyProblems(`two unknowns, family (seed ${s.toString(16)})`);
    }
    random = shared;
  }
  // BL55, as fixed cases. A line's |Γ| circle through a node a hair inside the rim crosses a K′ that touches the rim
  // within 1e-6 of that point, for every value of a short stub: the solver took the crossing for a touching (members
  // missed). Then a shunt stub before the input, which keeps g: the brute force took rounding near the short for roots.
  validateFamily('two unknowns, family (BL55)',
    { z0: 1, f0: 132264808.36650285, loadR: 0.00007185043044411145, loadX: 2.774505980209877, parts: [{ kind: STUB_OPEN, value: 0.13164, zc: 0.3205 }, { kind: SERIES_C, value: 4.5536e-11 }, { kind: STUB_SHORT, value: 0.164438, zc: 0.87699 }, { kind: SHUNT_C, value: 7.9659e-9 }, { kind: QUARTER, value: 0.88275 }, { kind: LINE, value: 0.210257, zc: 0.53621 }, { kind: SHUNT_L, value: 1.68087e-8 }] },
    [{ part: 2 }, { part: 5 }], { kind: 'g', value: 6.798966401818079 }, 120, 1500);
  validateFamily('two unknowns, family (BL55)',
    { z0: 75, f0: 5734371.20889579, loadR: 259.49852216344755, loadX: -154.89638350056447, parts: [{ kind: QUARTER, value: 50.0556 }, { kind: SERIES_R, value: 2.7425 }, { kind: SERIES_L, value: 7.9025e-6 }, { kind: STUB_SHORT, value: 0.0967, zc: 33.277 }, { kind: STUB_SHORT, value: 0.27835, zc: 84.588 }] },
    [{ part: 1 }, { part: 4 }], { kind: 'g', value: 0.11768843102733577 }, 120, 1500);
  validateFamily('two unknowns, family (BL55)',
    { z0: 1, f0: 18499221.86466119, loadR: 0.000014129134096097427, loadX: 0.5926040285741043, parts: [{ kind: SHUNT_C, value: 2.981543268285181e-8 }, { kind: QUARTER, value: 1.2090975166482885 }, { kind: SERIES_R, value: 0.0325795231506815 }, { kind: STUB_SHORT, value: 0.4697346456698142, zc: 0.740690008874131 }, { kind: STUB_OPEN, value: 0.11418702571652829, zc: 0.6714768973162805 }, { kind: STUB_SHORT, value: 0.06986530898604543, zc: 2.3169192246947525 }] },
    [{ part: 2 }, { part: 5 }], { kind: 'g', value: 0.1080963210837452 }, 120, 1500);
  // BL57, as fixed cases. A goal circle that is itself one of b's loci (x = 0 for a shunt R, b = 0 for a series R):
  // every other locus meets it only at their common point, a shunt R of 0 Ω shorting the node (on x = 0) or a series R
  // of ∞ opening it (on b = 0), so every value of a has that member; the solver said none. On b = 0 the short of a
  // shunt R is the goal's pole: none, as before.
  validateFamily('two unknowns, family (BL57)',
    { z0: 0.01, f0: 347640.8933728079, loadR: 0.00035465564922237464, loadX: -0.00822924286978905, parts: [{ kind: STUB_SHORT, value: 0.30427571006119253, zc: 0.016679042058429527 }, { kind: SHUNT_C, value: 0.00014943687403592176 }, { kind: SHUNT_R, value: 0.0007411742279090949 }] },
    [{ part: 1 }, { part: 2 }], { kind: 'x', value: 0 }, 120, 1500);
  validateFamily('two unknowns, family (BL57)',
    { z0: 50, f0: 1e8, loadR: 20, loadX: 35, parts: [{ kind: SERIES_L, value: 4e-8 }, { kind: SERIES_R, value: 10 }] },
    [{ part: 0 }, { part: 1 }], { kind: 'b', value: 0 }, 120, 1500);
  validateFamily('two unknowns, family (BL57)',
    { z0: 50, f0: 1e8, loadR: 20, loadX: 35, parts: [{ kind: SHUNT_C, value: 2e-11 }, { kind: SERIES_L, value: 3e-8 }, { kind: SHUNT_R, value: 80 }] },
    [{ part: 0 }, { part: 2 }], { kind: 'x', value: 0 }, 120, 1500);
  {
    const res = solve({ z0: 50, f0: 1e8, loadR: 20, loadX: 35, parts: [{ kind: SERIES_L, value: 4e-8 }, { kind: SHUNT_R, value: 80 }] }, [{ part: 0 }, { part: 1 }], { kind: 'b', value: 0 });
    ok(res.status === 'none' && res.ranges.length === 0, `two unknowns, family (BL57): a shunt R's short on b = 0 is the goal's pole, so none (${res.status})`);
    const r2 = solve({ z0: 0.01, f0: 347640.8933728079, loadR: 0.00035465564922237464, loadX: -0.00822924286978905, parts: [{ kind: STUB_SHORT, value: 0.30427571006119253, zc: 0.016679042058429527 }, { kind: SHUNT_C, value: 0.00014943687403592176 }, { kind: SHUNT_R, value: 0.0007411742279090949 }] }, [{ part: 1 }, { part: 2 }], { kind: 'x', value: 0 });
    const whole = r2.status === 'family' && r2.ranges.length > 0 && r2.family.ends.every((s) => s.values[1].value === 0 && s.residual <= 1e-9);
    ok(whole, `two unknowns, family (BL57): every member is a shunt R of 0 Ω (${r2.status}, ${r2.ranges.length} ranges)`);
  }
  function validateFamily(kind, circuit, unknowns, goal, NA, NB) {
    const res = run(kind, circuit, unknowns, goal), problem = describe(circuit, unknowns, goal);
    const ms = measureOf(goal, circuit.z0), n = nodeOf(goal, circuit), slots = slotsFor(circuit, res), [s1, s2] = slots;
    const t = tally(kind);
    if (res.status === 'rejected') { check(kind, false, `${kind}: rejected (${res.reason})`, problem); return; }
    if (res.status === 'coincident' || res.status === 'degenerate') return;
    check(kind, res.status === 'family' || res.status === 'none', `${kind}: status ${res.status}`, problem);
    const c = working(circuit);
    const spans = res.ranges.map((r) => { const a = coordOf(c, s1, r.kind, r.from, true), b = coordOf(c, s1, r.kind, r.to, true); return [Math.min(a, b), Math.max(a, b)]; });
    for (const sol of res.family?.ends ?? []) reEvaluate(kind, circuit, res, sol, slots, ms, n, problem);
    const h = (s1.hi - s1.lo) / NA;
    for (let i = 0; i < NA; i++) {
      const u1 = s1.lo + (i + 0.5) * h;
      if (spans.some(([a, b]) => Math.abs(u1 - a) < 1e-4 || Math.abs(u1 - b) < 1e-4)) continue;
      setSlot(c, s1, u1);
      const brute = roots1(c, s2, n, ms, NB).filter((u) => !atEnd(s2, u)).map((u) => [u1, u]);
      const inRange = spans.some(([a, b]) => u1 > a && u1 < b);
      let mine = [];
      if (inRange && res.family) mine = res.family.at(solverT(c, s1, u1)).map((sol) => reEvaluate(kind, circuit, res, sol, slots, ms, n, problem).coords);
      compare(kind, slots, brute, mine, problem);
    }
  }

  // ==============================================================================================================
  section('validate fallback, one unknown');
  const fallbackOne = (kind, count) => {
    for (let p = 0; p < count; p++) {
      const sub = p % 5;
      const spec = sub === 1 ? 'zcStub' : sub === 0 || sub === 3 ? 'zcLine' : 'f0';
      const { circuit, unknowns } = randomProblem([spec], { f0: spec === 'f0', maxFixed: spec === 'f0' ? 1 : 2 });
      // f0 problems: a lumped part or a line as the circuit when nothing else is there.
      if (spec === 'f0' && !circuit.parts.length) circuit.parts.push(randomPart(pick([SERIES_L, SHUNT_C, LINE, STUB_SHORT]), circuit.z0, TAU * circuit.f0, 0.25));
      if (sub === 3) validateBest(kind, circuit, unknowns, placeGoal(pointGoal(circuit.z0), circuit, unknowns), 20000);
      else if (sub === 4) validateRanges(kind, circuit, unknowns, placeGoal(withinGoal(), circuit, unknowns), 100000);
      else validateOneCircle(kind, circuit, unknowns, placeGoal(circleGoal(), circuit, unknowns), spec === 'f0' ? 100000 : 20000);
    }
  };
  fallbackOne('fallback, one unknown', 200);
  // BL56 (1): a stub's Zc of 0 (b = −∞ for an open stub with tan θ < 0) read coord +π/2, outside its domain [−π/2, 0].
  validateOneCircle('fallback, one unknown (BL56)',
    { z0: 0.01, f0: 23038359.38250798, loadR: 0.00045312498546138633, loadX: 0.006211644672110538, parts: [{ kind: STUB_SHORT, value: 0.33214704575017096, zc: 0.00380777566860613 }, { kind: STUB_OPEN, value: 0.37031287051271644, zc: 0.010659093826941132 }] },
    [{ part: 1, param: 'zc' }], { kind: 'x', value: 0 }, 20000);

  section('validate fallback, two unknowns');
  const fallbackTwo = (kind, count) => {
    const subs = [
      ['zcLen'], ['f0', 'lumped'], ['zcLine', 'lumped'],                     // searchMixed
      ['zcLen', 'f0'], ['zcLine', 'zcLine'], ['f0', QUARTER], ['f0', 'zcStub'], // searchGrid
    ];
    const lumped = () => pick([SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C]);
    for (let p = 0; p < count; p++) {
      const sub = subs[p % subs.length];
      const specs = sub.map((x) => (x === 'lumped' ? lumped() : x));
      const f0 = specs.includes('f0');
      let { circuit, unknowns } = randomProblem(specs, { f0, maxFixed: f0 ? 1 : 2 });
      // Zc and f0 of one line: drop the line's length unknown.
      if (sub[0] === 'zcLen' && f0) unknowns = unknowns.filter((u) => u.param !== undefined);
      const goal = placeGoal(pointGoal(circuit.z0), circuit, unknowns);
      // f0 is the solver's last unknown; it gets the fine side of the grid.
      const [NA, NB] = f0 ? [160, 1600] : [320, 320];
      validateTwoPoint(kind, circuit, unknowns, goal, NA, NB);
    }
  };
  fallbackTwo('fallback, two unknowns', 280);
  // The same on streams of their own (BL56: other streams found answers the solver lacked), the shared one untouched.
  {
    const shared = random;
    for (const s of FALLBACK_SEEDS) {
      random = seeded(s);
      fallbackOne(`fallback, one unknown (seed ${s.toString(16)})`, FALLBACK_ONE);
      fallbackTwo(`fallback, two unknowns (seed ${s.toString(16)})`, FALLBACK_TWO);
    }
    random = shared;
  }
  // BL56 (2) and the extra streams' misses: answers in a band of f far narrower than the grid, where a Zt or Zc far
  // from Z0 meets a resonance (the node before it passing the short or open), and a λ/4 of Zt = 307·Z0 near 8·f0 past
  // the grid's last column. Then a solution at a high-Q resonance that rounding of the fixed values moves by 9e-8.
  validateTwoPoint('fallback, two unknowns (BL56)',
    { z0: 300, f0: 4202204495.6798077, loadR: 5.745485383608313, loadX: -93.01015563139133, parts: [{ kind: LINE, value: 0.2284483519033529, zc: 335.4255064140361 }, { kind: QUARTER, value: 95.78701555557096 }] },
    [{ part: 1 }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 99.395, targetX: 235.654 }, 160, 1600);
  validateTwoPoint('fallback, two unknowns (BL56)',
    { z0: 50, f0: 10412845.688968714, loadR: 0.00022087030992080846, loadX: 15.901485025339118, parts: [{ kind: SERIES_L, value: 0.000005255127872477878 }, { kind: LINE, value: 0.26568010600749403, zc: 69.59470565356887 }, { kind: LINE, value: 0.47148665005806834, zc: 28.866402420936677 }, { kind: STUB_SHORT, value: 0.33182412987807763, zc: 108.23198475555864 }, { kind: SERIES_L, value: 0.0000014309825266000554 }] },
    [{ part: 1, param: 'zc' }, { part: 4 }], { kind: 'point', targetR: 83.44083535207986, targetX: -73.46542292398598 }, 320, 320);
  // BL58 (the shared stream shifted by BL57): answers on the ridge of a line whose Zc is far from Z0 (0.00028·Z0) where
  // the node before it passes the short (a curved band narrower than the grid in both Zc and f), and a series C's r
  // circles sweeping the chart where the node before it passes 0.019 from the open, in a band of f under a grid step.
  validateTwoPoint('fallback, two unknowns (BL58)',
    { z0: 1, f0: 8913207.766235983, loadR: 0.00047307988087246633, loadX: -12.11502651481781, parts: [{ kind: QUARTER, value: 1.0887863588446869 }, { kind: LINE, value: 0.01671707077184692, zc: 2.975106482096673 }] },
    [{ part: 1, param: 'zc' }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 0.07450623924821066, targetX: -0.023757635509562374 }, 160, 1600);
  validateTwoPoint('fallback, two unknowns (BL58)',
    { z0: 300, f0: 7647348.479657103, loadR: 1.3434231695059358, loadX: -900.5908485675504, parts: [{ kind: QUARTER, value: 529.8307855517733 }, { kind: SERIES_C, value: 3.67710435036924e-11 }, { kind: SERIES_L, value: 0.000006101824553740407 }] },
    [{ part: 1 }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 1219.4964578057186, targetX: 39.38605048877043, node: 2 }, 160, 1600);

  // ==============================================================================================================
  section('validate closed-form cases');
  {
    const kind = 'closed-form cases';
    const C = (z0, f0, loadR, loadX, parts, unknowns, goal, expect) => {
      const circuit = { z0, f0, loadR, loadX, parts };
      const res = run(kind, circuit, unknowns, goal), problem = describe(circuit, unknowns, goal);
      const ms = measureOf(goal, z0), slots = slotsFor(circuit, res);
      check(kind, res.status === 'solved', `${kind}: status ${res.status}`, problem);
      for (const sol of res.solutions) reEvaluate(kind, circuit, res, sol, slots, ms, nodeOf(goal, circuit), problem);
      tally(kind).solutions += res.solutions.length;
      check(kind, res.solutions.some((sol) => expect.every((e, i) => Math.abs(e(sol.values[i])) < 1e-9)), `${kind}: the source's values among the solutions`, problem);
    };
    const rel = (want) => (v) => (v.value - want) / want;
    const addedIs = (want) => (v) => (v.added - want) / want;
    // C14: λ/4 300 → 50 Ω.
    C(50, 10e9, 300, 0, [{ kind: QUARTER, value: 50 }], [{ part: 0 }], { kind: 'point' }, [rel(122.4744871391589)]);
    // C20: line + open or short shunt stub, load 33.9 + j17.6 Ω, all lines 50 Ω.
    for (const [stub, len] of [[STUB_OPEN, 0.08357481879], [STUB_SHORT, 0.3335748188]]) {
      C(50, 1e9, 33.9, 17.6, [{ kind: LINE, value: 0.1, zc: 50 }, { kind: stub, value: 0.1, zc: 50 }], [{ part: 0 }, { part: 1 }], { kind: 'point' },
        [(v) => (v.value - 0.02006726246) / 0.02, (v) => (v.value - len) / len].map((f) => (v) => (Math.abs(f(v)) < 1e-9 ? 0 : 1)));
    }
    // C23: 1700 → 100 Ω at 900 MHz, shunt C then series L.
    C(100, 900e6, 1700, 0, [{ kind: SHUNT_C, value: 0 }, { kind: SERIES_L, value: 0 }], [{ part: 0 }, { part: 1 }], { kind: 'point' },
      [rel(0.4160913545e-12), rel(70.73553026e-9)].map((f) => (v) => (Math.abs(f(v)) < 1e-9 ? 0 : 1)));
    // C24: 75 → 50 Ω, free susceptance and reactance: |X_P| = 106.0660172, |X_S| = 35.35533906.
    C(50, 1e8, 75, 0, [{ kind: SHUNT_C, value: 0 }, { kind: SERIES_L, value: 0 }], [{ part: 0, free: true }, { part: 1, free: true }], { kind: 'point' },
      [(v) => (Math.abs(Math.abs(50 / v.added) - 106.0660172) < 1.1e-7 ? 0 : 1), (v) => (Math.abs(Math.abs(50 * v.added) - 35.35533906) < 1e-7 ? 0 : 1)]);
    // C25: 200 → 25 Ω on Z0 = 50: b_P = 0.6614378278, x_S = √1.75.
    C(50, 1e8, 200, 0, [{ kind: SHUNT_C, value: 0 }, { kind: SERIES_L, value: 0 }], [{ part: 0, free: true }, { part: 1, free: true }], { kind: 'point', targetR: 25, targetX: 0 },
      [addedIs(0.6614378278), addedIs(Math.sqrt(1.75))].map((f) => (v) => (Math.abs(f(v)) < 1e-9 ? 0 : 1)));
    // C26: 50 − j50 → 12.5 − j12.5 Ω: b_P = 0.8228756555, x_S = 0.4114378278.
    C(50, 1e8, 50, -50, [{ kind: SHUNT_C, value: 0 }, { kind: SERIES_L, value: 0 }], [{ part: 0 }, { part: 1 }], { kind: 'point', targetR: 12.5, targetX: -12.5 },
      [addedIs(0.8228756555), addedIs(0.4114378278)].map((f) => (v) => (Math.abs(f(v)) < 1e-9 ? 0 : 1)));
  }

  // ==============================================================================================================
  // Bugs this validation found (M4.2), kept as fixed cases.
  section('validate regressions');
  {
    const kind = 'regressions';
    const has = (circuit, unknowns, goal, want, what) => {
      const res = run(kind, circuit, unknowns, goal), problem = describe(circuit, unknowns, goal);
      const ms = measureOf(goal, circuit.z0), slots = slotsFor(circuit, res);
      const mine = res.solutions.map((sol) => reEvaluate(kind, circuit, res, sol, slots, ms, nodeOf(goal, circuit), problem).coords);
      tally(kind).solutions += mine.length;
      check(kind, mine.some((m) => m.every((x, i) => distance(slots[i], x, want[i]) < MATCH)), `${kind}: ${what}`, problem);
      return res;
    };
    // f0 with a shunt C whose answer is a shunt L (swapped): its b at f0 was scaled as a C's (atF0), so it was lost.
    has({ z0: 75, f0: 6201621.149959056, loadR: 11.482062681524472, loadX: -25.037589738454088, parts: [{ kind: LINE, value: 0.21024158544605598, zc: 58.916668519173335 }, { kind: SHUNT_C, value: 3.041203674036661e-10 }, { kind: SERIES_L, value: 3.02123343182316e-7 }] },
      [{ part: 1 }, { part: 0, param: 'f0' }], { kind: 'point' }, [-1.34079726085, 2.21188356703], 'f0 with a swapped lumped part');
    // A line's Zc near ∞ against f0, and a λ/4's Zt against f0: answers in bands narrower than the first grid.
    has({ z0: 300, f0: 123438896.25353573, loadR: 103.0526351639587, loadX: -101.03130421505149, parts: [{ kind: SERIES_L, value: 0.000008611923917352487 }, { kind: LINE, value: 0.20658544544130564, zc: 672.2006084301081 }, { kind: LINE, value: 0.037509126763325185, zc: 113.89357217320936 }] },
      [{ part: 1, param: 'zc' }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 41.10459770107097, targetX: -124.43662036188451, node: 3 }, [1.56966309039, 1.55807608760], 'Zc near ∞ with f0');
    const r = has({ z0: 75, f0: 11895654.05238855, loadR: 38.37943910751585, loadX: 51.47472468312, parts: [{ kind: STUB_SHORT, value: 0.20066178364213558, zc: 144.06455588658605 }, { kind: QUARTER, value: 226.82412072377812 }, { kind: SERIES_L, value: 0.000010522837026664877 }] },
      [{ part: 1 }, { part: 0, param: 'f0' }], { kind: 'point' }, [1.56339904878, 1.63354926689], 'Zt with f0');
    // That problem's Newton steps once left the f0 range (an answer at 0.06·f0 for a range from 0.1·f0).
    check(kind, r.solutions.every((sol) => sol.values[1].value >= 11895654.05238855 / 10 * (1 - 1e-12)), `${kind}: no f0 below the range`, '');
    // BL56: a λ/4 of Zt = 307·Z0 at 8.01·f0 (past the grid's last column), and answers in bands of f narrower than the
    // grid where a Zt or Zc far from Z0 meets a resonance before it (found on the extra streams).
    has({ z0: 300, f0: 4202204495.6798077, loadR: 5.745485383608313, loadX: -93.01015563139133, parts: [{ kind: LINE, value: 0.2284483519033529, zc: 335.4255064140361 }, { kind: QUARTER, value: 95.78701555557096 }] },
      [{ part: 1 }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 99.395, targetX: 235.654 }, [1.57078566545, 2.08086164076], 'Zt near ∞ with f0 (BL56)');
    has({ z0: 10000, f0: 675181.6869349823, loadR: 0.16665231638267025, loadX: -3367.800205392138, parts: [{ kind: QUARTER, value: 25430.627570621422 }, { kind: LINE, value: 0.2038056884193793, zc: 8444.410136600009 }] },
      [{ part: 1, param: 'zc' }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 1327.2028315375712, targetX: -3043.3801691217477 }, [0.0032232397065, 1.40692299563], 'small Zc with f0 at a resonance (BL56)');
    has({ z0: 0.01, f0: 6377837.221285648, loadR: 6.42282952098162e-7, loadX: 0.004093406939205376, parts: [{ kind: STUB_OPEN, value: 0.04584984336048365, zc: 0.0154059101345973 }, { kind: LINE, value: 0.14803260972257704, zc: 0.007591890731764352 }, { kind: SERIES_L, value: 2.2260370744538225e-11 }] },
      [{ part: 1, param: 'zc' }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 0.0011679310875754882, targetX: -0.0032823576771299967, node: 3 }, [1.51881039336, 1.51721409384], 'large Zc with f0 at a resonance (BL56)');
    has({ z0: 10000, f0: 990860.4935362092, loadR: 36358.522744376336, loadX: -34870.43986291888, parts: [{ kind: STUB_OPEN, value: 0.2150716417329386, zc: 5957.858925959073 }, { kind: LINE, value: 0.01617549394723028, zc: 16099.299079898205 }, { kind: STUB_OPEN, value: 0.14134038879536093, zc: 11009.454953671286 }] },
      [{ part: 1, param: 'zc' }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 1568.862596187903, targetX: -12357.428894033981 }, [0.00703202221109, 1.76224729111], 'small Zc with f0 in a curved valley (BL56)');
    has({ z0: 10000, f0: 7034444916.871903, loadR: 15315.32260632734, loadX: -10812.492577890602, parts: [{ kind: QUARTER, value: 17947.703206850005 }, { kind: QUARTER, value: 3732.331720894017 }, { kind: LINE, value: 0.14000273449346423, zc: 21912.318647715267 }] },
      [{ part: 1 }, { part: 0, param: 'f0' }], { kind: 'point' }, [0.00336625016363, 2.30020714732], 'small Zt with f0 at a resonance (BL56)');
    // BL58: a small Zc on the ridge where the node before the line passes the short, and a series C (swapped to an L)
    // whose r circles sweep the chart where the node before it passes the open.
    has({ z0: 1, f0: 8913207.766235983, loadR: 0.00047307988087246633, loadX: -12.11502651481781, parts: [{ kind: QUARTER, value: 1.0887863588446869 }, { kind: LINE, value: 0.01671707077184692, zc: 2.975106482096673 }] },
      [{ part: 1, param: 'zc' }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 0.07450623924821066, targetX: -0.023757635509562374 }, [0.000276256097139, 1.59801757242], 'small Zc with f0 on a ridge (BL58)');
    has({ z0: 300, f0: 7647348.479657103, loadR: 1.3434231695059358, loadX: -900.5908485675504, parts: [{ kind: QUARTER, value: 529.8307855517733 }, { kind: SERIES_C, value: 3.67710435036924e-11 }, { kind: SERIES_L, value: 0.000006101824553740407 }] },
      [{ part: 1 }, { part: 0, param: 'f0' }], { kind: 'point', targetR: 1219.4964578057186, targetX: 39.38605048877043, node: 2 }, [1.47891823645, 2.26925203461], 'series C with f0 by the open (BL58)');
    // A stub's Zc of 0 shorts its node, which a λ/4 makes the open, where every r circle passes: no answer.
    {
      const circuit = { z0: 75, f0: 5608805560.350074, loadR: 0.04937582480809154, loadX: -1187.2909644886386, parts: [{ kind: STUB_SHORT, value: 0.4683808324951679, zc: 121.06637416262154 }, { kind: QUARTER, value: 70.02502612039825 }] };
      const res = run(kind, circuit, [{ part: 0, param: 'zc' }], { kind: 'r', value: 1.4360683635608864 });
      check(kind, res.solutions.every((sol) => sol.values[0].value > 0 && sol.values[0].value < Infinity), `${kind}: no stub Zc of 0 or ∞ for an r goal (status ${res.status})`, '');
    }
    // A series R of ∞ opens the node, which a λ/4 makes the short, where every b circle passes: no answer (the
    // brute force found one at every value of the stub until it learnt the pole; the solver never gave it).
    {
      const circuit = { z0: 1, f0: 31085485.83032549, loadR: 2.17907647017067, loadX: 0.2774033903135051, parts: [{ kind: LINE, value: 0.40717604581732303, zc: 2.951975456927982 }, { kind: STUB_SHORT, value: 0.3950393147137947, zc: 1.431379055511825 }, { kind: SERIES_R, value: 13.511706565370108 }, { kind: QUARTER, value: 0.3179778312459485 }] };
      const res = run(kind, circuit, [{ part: 1 }, { part: 2 }], { kind: 'b', value: 0.32014973947721115 });
      const members = res.family ? [0.05, 0.2, 0.4].flatMap((t) => res.family.at(solverT(working(circuit), slotOf(circuit, { part: 1 }), t))) : [];
      check(kind, members.every((sol) => sol.values[1].value < Infinity), `${kind}: no family member with R = ∞ for a b goal`, '');
    }
    // A short stub's range over its whole domain runs from length 0 to λ/2 (both ends read as λ/2 before).
    {
      const circuit = { z0: 10000, f0: 1742780.800499053, loadR: 23.704782479869426, loadX: -19061.750700574103, parts: [{ kind: STUB_SHORT, value: 0.12971331643173473, zc: 15013.246861033935 }, { kind: STUB_OPEN, value: 0.2973347367555834, zc: 8474.456194454813 }, { kind: SHUNT_C, value: 6.52869281643829e-11 }] };
      const res = run(kind, circuit, [{ part: 0 }, { part: 2 }], { kind: 'b', value: 0 });
      const rg = res.ranges[0];
      check(kind, res.status === 'family' && res.ranges.length === 1 && rg.from === 0 && rg.to === 0.5, `${kind}: a whole short-stub range from 0 to λ/2 (${rg?.from} to ${rg?.to})`, '');
    }
  }

  // ==============================================================================================================
  section('validate determinism');
  {
    let same = 0;
    for (let i = replay.length - 1; i >= 0; i--) {
      const [circuit, unknowns, goal, first] = replay[i];
      const again = essence(solve(circuit, unknowns.slice().reverse(), goal));
      if (again === first) same++;
      ok(again === first, `the same result on a second run (in reverse order, unknowns reversed): ${describe(circuit, unknowns, goal)}`);
    }
    tally('determinism').problems = replay.length;
    tally('determinism').extra = `${same} of ${replay.length} results identical on a second run`;
  }

  // AC check against ngspice: not on this PC (`where ngspice` finds nothing), so skipped.
  for (const [kind, t] of stats) {
    const st = Object.entries(t.statuses).map(([k, v]) => `${k} ${v}`).join(', ');
    if (t.extra) { console.log(`validate ${kind}: ${t.extra}`); continue; }
    const gap = t.worstGap !== undefined ? `, solver − scan ${t.worstGap.toExponential(1)} at most` : '';
    const cond = t.conditioned ? ` (${t.conditioned} above 1e-9 by the rounding of their values, at most ${t.worstK.toExponential(1)})` : '';
    console.log(`validate ${kind}: ${t.problems} problems (${st}), ${t.solutions} solutions, ${t.brute} brute-force finds, ${t.misses} missed, ${t.false} false, ${t.solverOnly} found by the solver only, worst residual ${t.worst.toExponential(1)}${cond}${gap}`);
  }
}
