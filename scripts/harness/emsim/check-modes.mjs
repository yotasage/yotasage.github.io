// Checks of the modal decomposition and the line results (step M1.3): modes.ts on random and homogeneous matrices
// (Zc·C·Zc = L, Tvᵀ·Ti = 1, L·C·Tv = Tv·Λ, Zc·Yc = 1, Zc = C⁻¹/v), Cohn's coupled stripline exact through the modal
// path (facts-cases.md C19–C29, C25 with touching strips), the symmetric-pair identities against facts.md §5's
// formulas, an asymmetric pair's definitions A, B, Z_TDR, Zdc and C against each other and facts.md §5's estimate,
// a homogeneous three-line stripline, and refusals that never throw.

import * as B0 from '../../../lib/emsim/bem2d.ts';
import * as P0 from '../../../lib/emsim/panels.ts';
import * as MD0 from '../../../lib/emsim/modes.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import { mulberry32 } from './check-geometry.mjs';

const B = B0.default ?? B0;
const P = P0.default ?? P0;
const MD = MD0.default ?? MD0;
const LN = LN0.default ?? LN0;
const SU = SU0.default ?? SU0;
const S = S0.default ?? S0;
const ST = ST0.default ?? ST0;

const c0 = B.C0;
const MU0EPS0 = 1 / (c0 * c0);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const pct = (x) => (100 * x).toPrecision(2);

// ---- matrices ----
const mul = (A, Bm, n) => { const X = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let s = 0; for (let k = 0; k < n; k++) s += A[i * n + k] * Bm[k * n + j]; X[i * n + j] = s; } return X; };
const tr = (A, n) => { const X = new Float64Array(n * n); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) X[j * n + i] = A[i * n + j]; return X; };
const fro = (A) => Math.sqrt(A.reduce((s, x) => s + x * x, 0));
const diffN = (A, Bm) => { let s = 0; for (let i = 0; i < A.length; i++) s += (A[i] - Bm[i]) ** 2; return Math.sqrt(s) / fro(Bm); };
const eye = (n) => { const X = new Float64Array(n * n); for (let i = 0; i < n; i++) X[i * n + i] = 1; return X; };
function inv(A, n) { // Gauss–Jordan for the checks
  const M = Float64Array.from(A), X = eye(n);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[p * n + c])) p = r;
    for (let k = 0; k < n; k++) { [M[c * n + k], M[p * n + k]] = [M[p * n + k], M[c * n + k]]; [X[c * n + k], X[p * n + k]] = [X[p * n + k], X[c * n + k]]; }
    const d = M[c * n + c];
    for (let k = 0; k < n; k++) { M[c * n + k] /= d; X[c * n + k] /= d; }
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r * n + c]; for (let k = 0; k < n; k++) { M[r * n + k] -= f * M[c * n + k]; X[r * n + k] -= f * X[c * n + k]; } }
  }
  return X;
}
// A Maxwell C (diagonally dominant, negative off-diagonal) of n lines, F/m scale
function maxwell(rnd, n) {
  const C = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const c = -(5 + 40 * rnd()) * 1e-12 * Math.exp(-2 * rnd() * Math.abs(i - j)); C[i * n + j] = c; C[j * n + i] = c; }
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) if (j !== i) s -= C[i * n + j]; C[i * n + i] = s + (40 + 100 * rnd()) * 1e-12; }
  return C;
}

function matrices(t) {
  const rnd = mulberry32(20261116);
  let worst = { res: 0, bi: 0, eig: 0, zy: 0, homog: 0 };
  let sweeps = 0;
  for (let trial = 0; trial < 300; trial++) {
    const n = 1 + (trial % 6);
    const C = maxwell(rnd, n);
    const C0m = maxwell(rnd, n); // an independent vacuum matrix: any symmetric positive definite C0 will do for the algebra
    const L = inv(C0m, n).map((x) => x * MU0EPS0);
    const m = MD.modesOf(C, L, n);
    if (!t.ok(m.ok, `random n=${n}: ${m.reason}`)) continue;
    sweeps = Math.max(sweeps, m.sweeps);
    worst.res = Math.max(worst.res, m.residual);
    worst.bi = Math.max(worst.bi, diffN(mul(tr(m.Tv, n), m.Ti, n), eye(n)));
    const LC = mul(L, C, n), TvL = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) TvL[i * n + j] = m.Tv[i * n + j] * m.lambda[j];
    worst.eig = Math.max(worst.eig, diffN(mul(LC, m.Tv, n), TvL));
    worst.zy = Math.max(worst.zy, diffN(mul(m.Zc, m.Yc, n), eye(n)));
    for (let k = 1; k < n; k++) t.ok(m.lambda[k] >= m.lambda[k - 1], `random n=${n}: modes ascending`);
    // homogeneous: L = μ0ε0εr·C⁻¹
    const er = 1 + 4 * rnd();
    const Lh = inv(C, n).map((x) => x * MU0EPS0 * er);
    const h = MD.modesOf(C, Lh, n);
    t.ok(h.ok && (n === 1 || (h.clusters.length === 1 && h.clusters[0].length === n)), `homogeneous n=${n}: one cluster of ${n}`);
    const v = c0 / Math.sqrt(er);
    worst.homog = Math.max(worst.homog, diffN(h.Zc, inv(C, n).map((x) => x / v)), ...Array.from(h.eeff, (e) => rel(e, er)));
  }
  t.ok(worst.res <= 1e-12, `Zc·C·Zc = L: ${worst.res}`);
  t.ok(worst.bi <= 1e-12, `Tvᵀ·Ti = 1: ${worst.bi}`);
  t.ok(worst.eig <= 1e-12, `L·C·Tv = Tv·Λ: ${worst.eig}`);
  t.ok(worst.zy <= 1e-12, `Zc·Yc = 1: ${worst.zy}`);
  t.ok(worst.homog <= 1e-12, `homogeneous Zc = C⁻¹/v and εeff = εr: ${worst.homog}`);
  t.ok(sweeps <= 8, `Jacobi sweeps ${sweeps}`);
  // refusals
  const bad = MD.modesOf(new Float64Array([1, 2, 2, 1]), new Float64Array([1, 0, 0, 1]), 2);
  t.ok(!bad.ok && /positive definite/.test(bad.reason), `indefinite C refused: ${bad.reason}`);
  const nan = MD.modesOf(new Float64Array([NaN]), new Float64Array([1]), 1);
  t.ok(!nan.ok, 'NaN refused');
  t.note(`modes.ts on 300 random and 300 homogeneous Maxwell matrices (n = 1…6): Zc·C·Zc = L ${worst.res.toExponential(1)}, Tvᵀ·Ti = 1 ${worst.bi.toExponential(1)}, L·C·Tv = Tv·Λ ${worst.eig.toExponential(1)}, Zc·Yc = 1 ${worst.zy.toExponential(1)}, homogeneous ${worst.homog.toExponential(1)}; Jacobi ≤ ${sweeps} sweeps`);
}

// ---- Cohn's coupled stripline through the modal path ----
const D = P.MESH_DEFAULTS;
const bnd = (kernel, signals, edges, h0) => ({ kernel, signals, edges, h0, dNear: D.nearPerH0 * h0, mNear: D.mNear, rho: D.rho, X: 0, zShift: 0, flip: false });
const strips = (w, s, er, n = 2) => () => {
  const h0 = 1 / 8, e = [];
  const k = Math.max(8, P.bothCount(w, h0));
  const x0 = -(n * w + (n - 1) * s) / 2;
  for (let i = 0; i < n; i++) e.push(P.conductorEdge(x0 + i * (w + s), 0.5, x0 + i * (w + s) + w, 0.5, i + 1, er, P.GRADE_BOTH, k));
  return bnd({ kind: 'pp', b: 1 }, n, e, h0);
};
const COHN = [
  ['C19', 0.5, 0.1, 1, 122.8856652, 69.86609071], ['C21', 0.5, 0.5, 1, 107.1543785, 93.21719672],
  ['C22', 0.5, 1.0, 1, 101.8633803, 98.98059904], ['C23', 0.25, 0.25, 1, 166.5138396, 111.1743647],
  ['C24', 0.5, 5.0, 1, 100.4324557, 100.4324457], ['C28', 1.0, 0.2, 1, 72.16242989, 55.94039373],
  ['C29', 0.3, 0.3, 4.3, 71.93362543, 51.97862642],
];

function cohn(t) {
  const lines = ['Cohn coupled stripline through the modal path (error % at M = 8; estimate/true error at M = 2):'];
  let worst = 0;
  for (const [id, w, s, er, ze, zo] of COHN) {
    const r = LN.linesOf(B.solveBoundary(strips(w, s, er), { M: 8, estimate: false }));
    if (!t.ok(r.ok, `${id}: ${r.reason}`)) continue;
    const p = r.pair;
    const eE = rel(p.zeven.v, ze), eO = rel(p.zodd.v, zo), eD = rel(p.zdiff.v, 2 * zo), eC = rel(p.zcm.v, ze / 2);
    worst = Math.max(worst, eE, eO, eD, eC);
    t.ok(Math.max(eE, eO, eD, eC) <= 5e-4, `${id}: Zeven ${pct(eE)} %, Zodd ${pct(eO)} %, Zdiff ${pct(eD)} %, Zcm ${pct(eC)} % (bar 0.05 %)`);
    // homogeneous: degenerate, even and odd by the cluster rule, FEXT zero, k = (Ze − Zo)/(Ze + Zo) = 2·kb
    t.ok(r.clusters.length === 1 && r.modes[0].label === 'odd' && r.modes[1].label === 'even', `${id}: cluster gives odd then even: ${r.modes.map((m) => m.label)}`);
    // inside the cluster the rotation is fixed by Pᵀ·C⁻¹·P, whose eigenvalues are only Cm/C apart: C24 (5·10⁻⁸) is ±2·10⁻⁹
    t.ok(Math.abs(r.modes[0].ratio + 1) <= 1e-6 && Math.abs(r.modes[1].ratio - 1) <= 1e-6, `${id}: mode ratios ${r.modes.map((m) => m.ratio)}`);
    t.ok(r.modes.every((m) => rel(m.eeff.v, er) <= 1e-12), `${id}: εeff = εr`);
    t.ok(p.kf.status === 'converged' && Math.abs(p.kf.v) <= 1e-10 * Math.abs(p.kb.v) / c0, `${id}: kf ${p.kf.v} in one dielectric`);
    const k = (p.zeven.v - p.zodd.v) / (p.zeven.v + p.zodd.v);
    t.ok(Math.abs(2 * p.kb.v - k) <= 1e-12, `${id}: 2·kb ${2 * p.kb.v} vs (Ze − Zo)/(Ze + Zo) ${k}`);
    t.ok(p.symmetric && p.zdc.status === 'converged' && Math.abs(p.zdc.v) <= 1e-10 * p.zdiff.v, `${id}: Zdc ${p.zdc.v} (${p.zdc.status})`);
    if (id === 'C19') t.ok(rel(k, 0.2750666224) <= 1e-3, `C20 coupling factor ${k} vs 0.2750666224`);
    const d = LN.linesOf(B.solveBoundary(strips(w, s, er), { M: 2 }));
    const tE = Math.abs(d.pair.zeven.v - ze), tO = Math.abs(d.pair.zodd.v - zo);
    t.ok(d.pair.zeven.e >= tE && d.pair.zodd.e >= tO, `${id}: estimate below the true error at M = 2 (${d.pair.zeven.e} < ${tE} or ${d.pair.zodd.e} < ${tO})`);
    t.ok(d.pair.zdiff.e >= 2 * tO && d.pair.zcm.e >= tE / 2, `${id}: Zdiff/Zcm estimate below the true error`);
    lines.push(`  ${id} ${String(w).padEnd(4)} ${String(s).padEnd(4)} Zeven ${pct(eE).padStart(7)}  Zodd ${pct(eO).padStart(7)}  est/err ${(d.pair.zeven.e / tE).toFixed(1)} ${(d.pair.zodd.e / tO).toFixed(1)}  ${d.status}`);
  }
  lines.push(`  worst ${pct(worst)} % (C20: k from C19 within 0.1 %)`);
  // C25: strips touching. Zodd → 0 (log divergence), Zeven = 2 × C16 at every level's convergence
  const z25 = [1, 2, 4, 8].map((M) => LN.linesOf(B.solveBoundary(strips(0.5, 0, 1), { M, estimate: false })));
  if (t.ok(z25.every((r) => r.ok), 'C25 solves at levels 1–8')) {
    const ev = z25.map((r) => r.pair.zeven.v), od = z25.map((r) => r.pair.zodd.v);
    const eE = rel(ev[3], 130.7072502);
    t.ok(eE <= 5e-4, `C25 Zeven ${ev[3]} vs 130.7072502: ${pct(eE)} %`);
    t.ok(od.every((z, i) => i === 0 || z < od[i - 1]) && od[3] < 0.7 * od[0], `C25 Zodd falls towards 0: ${od.map((z) => z.toFixed(2))}`);
    t.ok(z25.every((r) => Number.isFinite(r.pair.zdiff.v) && r.check.residual <= 1e-12), 'C25 everything finite, Zc·C·Zc = L');
    lines.push(`  C25 (touching) Zeven ${pct(eE)} % at M = 8; Zodd by level ${od.map((z) => z.toFixed(2)).join(' → ')} Ω (exact 0, logarithmic)`);
  }
  // three strips in one dielectric: a cluster of three, everything finite and right
  const r3 = LN.linesOf(B.solveBoundary(strips(0.3, 0.2, 4.3, 3), { M: 2 }));
  if (t.ok(r3.ok, `three strips: ${r3.reason}`)) {
    const C = r3.bem.levels[2].C, Cv = new Float64Array(9);
    const Ci = inv(C, 3);
    for (let i = 0; i < 9; i++) Cv[i] = Ci[i] * Math.sqrt(4.3) / c0;
    t.ok(r3.clusters.length === 1 && r3.clusters[0].length === 3, 'three strips: one cluster of three');
    t.ok(diffN(new Float64Array(r3.Zc.flat()), Cv) <= 1e-12, 'three strips: Zc = C⁻¹/v');
    t.ok(r3.modes.every((m) => rel(m.eeff.v, 4.3) <= 1e-12 && m.Tv.every(Number.isFinite) && m.z.every((z) => Number.isFinite(z.v))), 'three strips: modes finite, εeff = εr');
    t.ok(rel(r3.lines[0].z0.v, r3.lines[2].z0.v) <= 1e-12, 'three strips: outer lines alike');
    lines.push(`  three strips εr 4.3: modes ${r3.modes.map((m) => `[${m.Tv.map((x) => (x / Math.max(...m.Tv.map(Math.abs))).toFixed(3)).join(' ')}]`).join(' ')}, Z0 ${r3.lines.map((l) => l.z0.v.toFixed(2)).join('/')} Ω`);
  }
  t.note(lines.join('\n'));
}

// ---- pairs on the default stackup ----
function pairSetup(kind, w, s, g) {
  const su = SU.defaultSetup();
  const st = ST.presetStructure(kind, su.stackup, w);
  st.s.v = s;
  if (g) st.g.v = g;
  return { ...su, trace: st };
}
export function asymSetup(w1 = 0.11, w2 = 0.2, s = 0.2, opt = {}) {
  const su = SU.defaultSetup();
  const stack = S.cloneStackup(su.stackup);
  if (opt.facts) { // facts.md §5's example: h 0.0925, t 0.035, εr 4.3, no mask, rectangles
    stack.layers.find((l) => l.id === 'D1').t.v = 0.0925;
    stack.layers.find((l) => l.id === 'D1').er.v = 4.3;
    stack.layers.find((l) => l.id === 'L1').etch = { kind: 'none' };
  }
  const c = (w1 + s + w2) / 2;
  const tr = {
    ...su.trace, kind: 'general', masked: !opt.facts,
    signals: [{ layer: 'L1', w: S.val(w1), u: S.val(-c + w1 / 2) }, { layer: 'L1', w: S.val(w2), u: S.val(c - w2 / 2) }],
    grounds: opt.g ? [{ layer: 'L1', a: null, b: S.val(-c - opt.g) }, { layer: 'L1', a: S.val(c + opt.g), b: null }] : [],
  };
  return { ...su, stackup: stack, trace: tr };
}

function pairs(t) {
  const lines = ['Pairs (M = 2):'];
  for (const [what, set] of [['C41 LVDS pair 0.11/0.2', pairSetup('pair-microstrip', 0.11, 0.2)], ['pair + coplanar ground 0.1/0.15/0.3', pairSetup('pair-cpw', 0.1, 0.15, 0.3)],
    ['pair stripline (L3)', (() => { const su = SU.defaultSetup(); const st = ST.presetStructure('pair-stripline', su.stackup, 0.1); return st ? { ...su, trace: st } : null; })()]]) {
    if (!t.ok(!!set, `${what}: preset`)) continue;
    const r = LN.solveSetup(set);
    if (!t.ok(r.ok, `${what}: ${r.reason}`)) continue;
    const p = r.pair, lv = r.bem.levels[2], C = lv.C, L = lv.L;
    const zo = Math.sqrt((L[0] - L[1]) / (C[0] - C[1])), ze = Math.sqrt((L[0] + L[1]) / (C[0] + C[1]));
    // facts.md §5: in a symmetric pair the modes are exactly even and odd, Zdiff = 2·Zodd, Zcm = Zeven/2
    t.ok(p.symmetric, `${what}: symmetric`);
    t.ok(rel(p.zdiff.v, 2 * zo) <= 1e-12 && rel(p.zcm.v, ze / 2) <= 1e-12, `${what}: Zdiff ${p.zdiff.v} vs 2·Zodd ${2 * zo}, Zcm ${p.zcm.v} vs Zeven/2 ${ze / 2}`);
    t.ok(rel(p.zdiffB.v, p.zdiff.v) <= 1e-12 && rel(p.ztdr.v, p.zdiff.v) <= 1e-12 && rel(p.zcmB.v, p.zcm.v) <= 1e-12, `${what}: A = B = Z_TDR`);
    t.ok(Math.abs(p.zdc.v) <= 1e-12 * p.zdiff.v, `${what}: Zdc ${p.zdc.v}`);
    t.ok(r.modes[0].label === 'odd' && Math.abs(r.modes[0].ratio + 1) <= 1e-9 && Math.abs(r.modes[1].ratio - 1) <= 1e-9, `${what}: modes odd/even ${r.modes.map((m) => m.ratio)}`);
    // modal impedances (definition C) of a symmetric pair are Zodd and Zeven
    t.ok(rel(r.modes[0].z[0].v, zo) <= 1e-11 && rel(r.modes[1].z[1].v, ze) <= 1e-11, `${what}: modal impedances ${r.modes[0].z[0].v} ${r.modes[1].z[1].v}`);
    t.ok(r.check.residual <= 1e-12, `${what}: Zc·C·Zc = L ${r.check.residual}`);
    const mixed = r.modes[0].eeff.v !== r.modes[1].eeff.v;
    t.ok(!mixed || p.kf.v < 0 || set.trace.kind === 'pair-stripline', `${what}: FEXT negative on a microstrip (${p.kf.v})`);
    lines.push(`  ${what.padEnd(38)} Zdiff ${p.zdiff.v.toFixed(3)} ± ${p.zdiff.e.toFixed(3)} (${p.zdiff.status}), Zcm ${p.zcm.v.toFixed(3)}, εeff odd/even ${r.modes[0].eeff.v.toFixed(4)}/${r.modes[1].eeff.v.toFixed(4)}, kb ${p.kb.v.toFixed(4)}, kf·v ${(p.kf.v * c0 / Math.sqrt(r.lines[0].eeff.v)).toFixed(4)}`);
  }
  // asymmetric pairs: facts.md §5's example and the owner's stackup with mask and coplanar ground
  for (const [what, set, ref] of [['facts.md §5 0.11/0.2/0.2, εr 4.3, no mask', asymSetup(0.11, 0.2, 0.2, { facts: true }), [94.1, 92.0]],
    ['0.1/0.12/0.15 + mask + coplanar ground', asymSetup(0.1, 0.12, 0.15, { g: 0.3 }), null]]) {
    const r = LN.solveSetup(set);
    if (!t.ok(r.ok, `${what}: ${r.reason}`)) continue;
    const p = r.pair;
    const zdd = p.zdiff.v, zcc = p.zcm.v, zdc = p.zdc.v;
    t.ok(!p.symmetric && Math.abs(zdc) > 1e-3 * zdd, `${what}: asymmetric, Zdc ${zdc}`);
    t.ok(rel(p.zdiffB.v, zdd - zdc * zdc / zcc) <= 1e-11, `${what}: B = Zdd − Zdc²/Zcc (${p.zdiffB.v} vs ${zdd - zdc * zdc / zcc})`);
    t.ok(rel(p.zcmB.v, zcc - zdc * zdc / zdd) <= 1e-11, `${what}: Zcm_B = Zcc − Zdc²/Zdd`);
    t.ok(p.zdiffB.v < p.ztdr.v && p.ztdr.v < zdd, `${what}: B ${p.zdiffB.v} < Z_TDR ${p.ztdr.v} < A ${zdd}`);
    t.ok(rel(p.zodd.v, zdd / 2) <= 1e-15 && rel(p.zeven.v, 2 * zcc) <= 1e-15, `${what}: Zodd = Zdd/2, Zeven = 2·Zcc`);
    t.ok(r.modes[0].label === 'π' && r.modes[1].label === 'c' && r.modes[0].ratio < 0 && r.modes[1].ratio > 0, `${what}: π and c modes ${r.modes.map((m) => m.label)}`);
    // Tripathi: the impedance of each conductor is the same ratio in both modes (Zc1/Zc2 = Zπ1/Zπ2)
    const rc = r.modes[1].z[0].v / r.modes[1].z[1].v, rp = r.modes[0].z[0].v / r.modes[0].z[1].v;
    t.ok(rel(rc, rp) <= 1e-9, `${what}: Zc1/Zc2 ${rc} vs Zπ1/Zπ2 ${rp}`);
    t.ok(rel(-rc * r.modes[1].ratio * r.modes[0].ratio, 1) <= 1e-9, `${what}: Z1/Z2 = −1/(Rc·Rπ)`);
    if (ref) t.ok(rel(zdd, ref[0]) <= 0.03 && rel(p.zdiffB.v, ref[1]) <= 0.03 && (zdd - p.zdiffB.v) / zdd > 0.01, `${what}: A ${zdd} and B ${p.zdiffB.v} vs facts.md's rough ${ref[0]} and ${ref[1]}`);
    lines.push(`  ${what}: A ${zdd.toFixed(2)} ± ${p.zdiff.e.toFixed(2)}, Z_TDR ${p.ztdr.v.toFixed(2)}, B ${p.zdiffB.v.toFixed(2)} Ω; Zcm A ${zcc.toFixed(2)}, B ${p.zcmB.v.toFixed(2)}; Zdc ${zdc.toFixed(2)}; C: π ${r.modes[0].z.map((z) => z.v.toFixed(1)).join('/')} (R ${r.modes[0].ratio.toFixed(3)}), c ${r.modes[1].z.map((z) => z.v.toFixed(1)).join('/')} (R ${r.modes[1].ratio.toFixed(3)}); Z0 ${r.lines.map((l) => l.z0.v.toFixed(2)).join('/')}; ${r.status}${ref ? `; facts.md §5 (finite differences): A ${ref[0]}, B ${ref[1]}` : ''}`);
  }
  // a single line: Z0 from Zc is √(L/C) of the solver
  const one = LN.solveSetup(SU.defaultSetup());
  t.ok(one.ok && rel(one.lines[0].z0.v, one.bem.single.z0) <= 1e-14 && rel(one.lines[0].z0.e, Math.max(one.bem.single.z0Err.e, one.bem.levels[2].asym * one.bem.single.z0, 0.5 * (one.bem.errC[0][0] / one.bem.C[0][0] + one.bem.errC0[0][0] / one.bem.C0[0][0]) * one.bem.single.z0)) <= 1e-12, `single line: Z0 from Zc ${one.lines[0].z0.v} vs ${one.bem.single.z0}`);
  lines.push(`  C39 default setup: Z0 ${one.lines[0].z0.v.toFixed(3)} ± ${one.lines[0].z0.e.toFixed(3)} Ω (${one.status}), εeff ${one.lines[0].eeff.v.toFixed(4)}, delay ${(one.lines[0].delay.v * 1e9).toFixed(3)} ps/mm`);
  // refusals never throw
  const broken = SU.defaultSetup();
  broken.trace.w.v = -1;
  const rb = LN.solveSetup(broken);
  t.ok(!rb.ok && rb.reason.length > 0, `negative width refused: ${rb.reason}`);
  t.note(lines.join('\n'));
}

export function run(t) {
  matrices(t);
  cohn(t);
  pairs(t);
}
