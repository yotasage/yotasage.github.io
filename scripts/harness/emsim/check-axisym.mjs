// The axisymmetric solver (M1.6): K and E, the ring kernel's derivatives against central differences, the exact
// cases (sphere 4πε0a, isolated disk 8ε0a, the coax's C′ from a z window), a via crossing in a closed can against an
// independent finite-difference solution in (r, z), and on the default via (C44) and the pair preset: the error
// estimate against level 4, the quadrature rule against 8 points everywhere, R_w doubled, the wall at the return
// vias' coaxial equivalent, thinner copper, Johnson & Graham's estimate, the side-view field, and the budget table.

import { performance } from 'node:perf_hooks';
import * as A0 from '../../../lib/emsim/axisym.ts';
import * as VC0 from '../../../lib/emsim/viacut.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';

const A = A0.default ?? A0, VC = VC0.default ?? VC0, SU = SU0.default ?? SU0, V = V0.default ?? V0, S = S0.default ?? S0;
const EPS0 = 8.8541878188e-12;
const fmt = (x, d = 2) => x.toExponential(d);
const order = (e1, e2) => Math.log2(Math.abs(e1 / e2));

// ---- exact cases ----
function sphere(M) {
  const e = [], n = Math.round(16 * M), R = 2 / (1 + Math.cos(Math.PI / (2 * n)));
  for (let k = 0; k < n; k++) {
    const t0 = -Math.PI / 2 + (Math.PI * k) / n, t1 = -Math.PI / 2 + (Math.PI * (k + 1)) / n;
    e.push(A.axiConductor(R * Math.cos(t0), R * Math.sin(t0), R * Math.cos(t1), R * Math.sin(t1), 1, 1, 1, 1, 1));
  }
  return e;
}
const disk = () => [A.axiConductor(0, 0, 1, 0, 1, 1, 8, 1, 2)];
// Coax a, b in a closed can of height 2H, inner conductor from g to 2H − g, window |z − H| < w.
function coax(a, b, er, H, g, w) {
  return [
    A.axiConductor(0, 0, b, 0, 0, er, 8, 1, 2), A.axiConductor(0, 2 * H, b, 2 * H, 0, er, 8, 1, 2), A.axiConductor(b, 0, b, 2 * H, 0, er, 24, 2, 2),
    A.axiConductor(0, g, a, g, 1, er, 4, 1, 2), A.axiConductor(0, 2 * H - g, a, 2 * H - g, 1, er, 4, 1, 2),
    A.axiConductor(a, g, a, H - w, 1, er, 12, 2, 1), A.axiConductor(a, H - w, a, H + w, 1, er, 4, 1, 1), A.axiConductor(a, H + w, a, 2 * H - g, 1, er, 12, 1, 2),
  ];
}

// ---- the crossing in a can: BEM edges and an independent FD solution ----
// Can r ≤ 1, 0 ≤ z ≤ 2 (ground); via r ≤ 0.2, 0.4 ≤ z ≤ 1.6 with a pad r ≤ 0.3 at 0.9 ≤ z ≤ 1.1; a plane with an
// antipad of radius 0.5 at the same z; εr 4 below z = 1, 1 above. C of the via (F).
function canEdges() {
  const q = 3, c = (ar, az, br, bz, cond, e, n, qa = q, qb = q) => A.axiConductor(ar, az, br, bz, cond, e, n, qa, qb);
  return [
    c(0, 0, 1, 0, 0, 4, 10, 1), c(0, 2, 1, 2, 0, 1, 10, 1), c(1, 0, 1, 0.9, 0, 4, 6), c(1, 1.1, 1, 2, 0, 1, 6),
    c(0.5, 0.9, 1, 0.9, 0, 4, 6), c(0.5, 0.9, 0.5, 1, 0, 4, 4), c(0.5, 1, 0.5, 1.1, 0, 1, 4), c(0.5, 1.1, 1, 1.1, 0, 1, 6),
    c(0, 0.4, 0.2, 0.4, 1, 4, 4, 1), c(0.2, 0.4, 0.2, 0.9, 1, 4, 6), c(0.2, 0.9, 0.3, 0.9, 1, 4, 4), c(0.3, 0.9, 0.3, 1, 1, 4, 4),
    c(0.3, 1, 0.3, 1.1, 1, 1, 4), c(0.2, 1.1, 0.3, 1.1, 1, 1, 4), c(0.2, 1.1, 0.2, 1.6, 1, 1, 6), c(0, 1.6, 0.2, 1.6, 1, 1, 4, 1),
    A.axiInterface(0.3, 1, 0.5, 1, 4, 1, 6, q, q),
  ];
}
function fdCan(m) {
  const h = 0.1 / m, NR = 10 * m, NZ = 20 * m, W = NR + 1;
  const fix = new Int8Array(W * (NZ + 1)), phi = new Float64Array(W * (NZ + 1));
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NR; i++) {
    const k = j * W + i;
    if (i === NR || j === 0 || j === NZ || (i >= 5 * m && j >= 9 * m && j <= 11 * m)) fix[k] = 2;
    else if ((i <= 2 * m && j >= 4 * m && j <= 16 * m) || (i <= 3 * m && j >= 9 * m && j <= 11 * m)) { fix[k] = 1; phi[k] = 1; }
  }
  const eps = (j) => ((j + 0.5) * h < 1 ? 4 : 1); // cell between rows j and j + 1
  const aE = new Float64Array(W * (NZ + 1)), aW = new Float64Array(W * (NZ + 1)), aN = new Float64Array(W * (NZ + 1)), aS = new Float64Array(W * (NZ + 1));
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NR; i++) {
    const k = j * W + i, eh = 0.5 * ((j > 0 ? eps(j - 1) : 0) + (j < NZ ? eps(j) : 0)), r = i * h;
    aE[k] = (r + h / 2) * eh; aW[k] = i > 0 ? (r - h / 2) * eh : 0;
    const rv = i > 0 ? r : h / 8;
    aN[k] = j < NZ ? rv * eps(j) : 0; aS[k] = j > 0 ? rv * eps(j - 1) : 0;
  }
  const w = 2 / (1 + Math.sin((Math.PI * h) / 2));
  for (let it = 0; it < 60000; it++) {
    let dmax = 0;
    for (let j = 1; j < NZ; j++) for (let i = 0; i < NR; i++) {
      const k = j * W + i;
      if (fix[k]) continue;
      const s = aE[k] * phi[k + 1] + (i > 0 ? aW[k] * phi[k - 1] : 0) + aN[k] * phi[k + W] + aS[k] * phi[k - W];
      const nv = s / (aE[k] + aW[k] + aN[k] + aS[k]);
      const d = w * (nv - phi[k]);
      phi[k] += d;
      if (Math.abs(d) > dmax) dmax = Math.abs(d);
    }
    if (dmax < 1e-13) break;
  }
  let Q = 0;
  for (let j = 1; j < NZ; j++) for (let i = 0; i < NR; i++) {
    const k = j * W + i;
    if (fix[k] !== 1) continue;
    if (!fix[k + 1]) Q += aE[k] * (1 - phi[k + 1]);
    if (i > 0 && !fix[k - 1]) Q += aW[k] * (1 - phi[k - 1]);
    if (!fix[k + W]) Q += aN[k] * (1 - phi[k + W]);
    if (!fix[k - W]) Q += aS[k] * (1 - phi[k - W]);
  }
  return 2 * Math.PI * EPS0 * 1e-3 * Q;
}

export async function run(t) {
  // K, E
  const [K5, E5] = A.ellipKE(Math.SQRT1_2, 0.5);
  t.near(K5, 1.854074677301372, 'K(m = 0.5)', 2e-15);
  t.near(E5, 1.350643881047675, 'E(m = 0.5)', 2e-15);
  const [Kt, Et] = A.ellipKE(1e-9, 1 - 1e-18);
  t.near(Kt, Math.log(4e9), 'K(k′ = 1e-9) = ln(4/k′)', 1e-15);
  t.near(Et, 1, 'E(k′ = 1e-9) = 1', 1e-15);
  // Ring kernel derivatives against central differences.
  let dmax = 0;
  const g = [0, 0, 0], gp = [0, 0, 0], gm = [0, 0, 0];
  for (const [r, z, rp, zp] of [[0.3, 0.1, 0.2, 0], [1, 0.5, 0.2, -0.3], [0.05, 0, 0.5, 0.01], [0.21, 0.4, 0.2, 0.41], [2, -1, 0.15, 0.3]]) {
    A.ringKernel(r, z, rp, zp, g);
    const hh = 1e-5 * Math.max(Math.hypot(r - rp, z - zp), 1e-3);
    A.ringKernel(r + hh, z, rp, zp, gp); A.ringKernel(r - hh, z, rp, zp, gm);
    const dr = (gp[0] - gm[0]) / (2 * hh);
    A.ringKernel(r, z + hh, rp, zp, gp); A.ringKernel(r, z - hh, rp, zp, gm);
    const dz = (gp[0] - gm[0]) / (2 * hh);
    const sc = Math.hypot(g[1], g[2]);
    dmax = Math.max(dmax, Math.abs(dr - g[1]) / sc, Math.abs(dz - g[2]) / sc);
  }
  t.ok(dmax < 1e-7, `ring kernel gradient vs central differences: ${fmt(dmax)}`);

  // Exact cases.
  const rows = [];
  const series = (name, mk, exact, Ms) => {
    const errs = Ms.map((M) => { const lv = A.solveAxiLevel(mk(M), M); return A.axiCharge(lv) / exact - 1; });
    const o = order(errs[errs.length - 2], errs[errs.length - 1]);
    rows.push(`${name}: ${errs.map((e) => fmt(e)).join(' ')} (M ${Ms.join(', ')}), order ${o.toFixed(2)}`);
    return { errs, o };
  };
  const sp = series('sphere 4πε0a', (M) => sphere(M), 4 * Math.PI * EPS0 * 1e-3, [1, 2, 4, 8]);
  t.ok(Math.abs(sp.errs[3]) < 5e-5 && sp.o > 1.8 && sp.o < 2.3, `sphere: ${fmt(sp.errs[3])}, order ${sp.o.toFixed(2)}`);
  const dk = series('disk 8ε0a', () => disk(), 8 * EPS0 * 1e-3, [1, 2, 4, 8]);
  t.ok(Math.abs(dk.errs[3]) < 2e-4 && dk.o > 1.8 && dk.o < 2.3, `disk: ${fmt(dk.errs[3])}, order ${dk.o.toFixed(2)}`);
  const cx = [1, 2, 4].map((M) => {
    const H = 3, w = 0.25, lv = A.solveAxiLevel(coax(0.15, 0.5, 4.3, H, 0.5, w), M), q = A.freeChargesAxi(lv);
    let Q = 0;
    for (let j = 0; j < lv.mesh.n; j++) if (lv.mesh.cond[j] === 1 && Math.abs(lv.mesh.mz[j] - H) < w) Q += q[j];
    return Q / (2 * w * 1e-3) / 198.691998e-12 - 1;
  });
  rows.push(`coax C03 C′ from a 0.5 mm window: ${cx.map((e) => fmt(e)).join(' ')} (M 1, 2, 4)`);
  t.ok(Math.max(...cx.map(Math.abs)) < 2e-6, `coax window C′: ${cx.map((e) => fmt(e)).join(' ')}`);
  // Field of the sphere: φ = a/R, |E| = a/R² outside.
  const lvS = A.solveAxiLevel(sphere(8), 8);
  let fe = 0;
  const o = [0, 0, 0];
  for (const [r, z] of [[1.5, 0], [0.3, 1.2], [0, 2], [2, -2], [1.02, 0.1]]) {
    A.axiField(lvS, r, z, o);
    const R = Math.hypot(r, z), C = A.axiCharge(lvS) / (4 * Math.PI * EPS0 * 1e-3);
    fe = Math.max(fe, Math.abs(o[0] - C / R), Math.abs(Math.hypot(o[1], o[2]) * 1e-3 - C / (R * R)) * R);
  }
  rows.push(`sphere field φ, E vs a/R, a/R² (5 points to 1.02a): ${fmt(fe)}`);
  t.ok(fe < 1e-4, `sphere field: ${fmt(fe)}`);

  // The crossing in a can: BEM vs FD (Richardson).
  const bemCan = [1, 2, 4, 8].map((M) => A.axiCharge(A.solveAxiLevel(canEdges(), M)));
  const fd = [2, 4, 8, 16].map(fdCan);
  const rich = (a, b, c) => { const p = Math.log2((b - a) / (c - b)); return { p, x: c + (c - b) / (2 ** p - 1) }; };
  const r1 = rich(fd[0], fd[1], fd[2]), r2 = rich(fd[1], fd[2], fd[3]);
  const fdUnc = Math.abs(r2.x - r1.x);
  const bemF = bemCan[3], bemE = Math.abs(bemCan[3] - bemCan[2]);
  rows.push(`can with a pad, plane, antipad and interface: BEM ${bemCan.map((x) => (x * 1e15).toFixed(4)).join(' ')} fF (M 1–8, order ${order(bemCan[1] - bemCan[0], bemCan[2] - bemCan[1]).toFixed(2)}, ${order(bemCan[2] - bemCan[1], bemCan[3] - bemCan[2]).toFixed(2)}); FD h 0.05–0.00625 ${fd.map((x) => (x * 1e15).toFixed(3)).join(' ')} fF, Richardson ${(r2.x * 1e15).toFixed(4)} (p ${r2.p.toFixed(2)}, ±${(fdUnc * 1e15).toFixed(4)}); BEM − FD ${fmt((bemF - r2.x) / r2.x)}`);
  t.ok(Math.abs(bemF - r2.x) <= Math.max(2 * fdUnc, 2 * bemE, 1e-4 * r2.x), `can: BEM ${bemF} vs FD ${r2.x} ± ${fdUnc}`);

  // ---- the default via (C44) and the pair preset ----
  const su = SU.defaultSetup();
  const st = su.stackup, via = su.via;
  const pair = V.presetVia('pair', st);
  const ref = (v) => A.viaAxisym(st, v, { M: 4, estimate: false, cache: false });
  const tab = [];
  for (const [name, v] of [['C44 via', via], ['pair preset', pair]]) {
    const r = A.viaAxisym(st, v, { cache: false });
    const R = ref(v);
    t.ok(r.ok && R.ok, `${name}: ${r.reason || R.reason}`);
    if (!r.ok || !R.ok) continue;
    let worst = 0;
    r.crossings.forEach((c, k) => {
      const tr = Math.abs(c.dC - R.crossings[k].dC);
      worst = Math.max(worst, tr / c.err.e);
      tab.push(`${name} ${c.layer} ${c.kind}: ΔC ${(c.dC * 1e15).toFixed(2)} ± ${(c.err.e * 1e15).toFixed(2)} fF (level 4: ${(R.crossings[k].dC * 1e15).toFixed(2)}), window ${(c.q * 1e15).toFixed(2)} fF`);
    });
    const trT = Math.abs(r.total - R.total);
    t.ok(worst <= 1 && trT <= r.totalErr.e, `${name}: estimate / true error of ΔC up to ${(1 / worst).toFixed(2)}; total ${fmt(trT)} vs ${fmt(r.totalErr.e)}`);
    tab.push(`${name}: total ${(r.total * 1e15).toFixed(2)} ± ${(r.totalErr.e * 1e15).toFixed(2)} fF (level 4: ${(R.total * 1e15).toFixed(2)}); least estimate / true error ${(1 / worst).toFixed(2)}; ${r.panels} panels, R_w ${r.Rw.toFixed(3)} mm`);
    let sum = 0;
    for (const c of r.crossings) sum += c.dC + c.line;
    t.near(sum, r.total, `${name}: Σ(ΔC + line) = total`, 1e-12);
  }
  // Quadrature rule against 8 points everywhere; R_w doubled; the wall at the cut's equivalent radius; thin copper.
  const b1 = A.viaAxisym(st, via, { estimate: false, cache: false });
  const b8 = A.viaAxisym(st, via, { estimate: false, cache: false, gauss8: true });
  const dq = Math.max(Math.abs(b1.total / b8.total - 1), ...b1.crossings.map((c, k) => Math.abs(c.dC - b8.crossings[k].dC) / c.q));
  t.ok(dq < 1e-5, `quadrature rule vs 8 points: ${fmt(dq)}`);
  // R_w doubled at level 2 (level 1's mesh error, about 2 × 10⁻³ of a window, would hide the wall's effect).
  const b2a = A.viaAxisym(st, via, { M: 2, estimate: false, cache: false });
  const b2 = A.viaAxisym(st, via, { M: 2, estimate: false, cache: false, rwFactor: 8 });
  const dWs = b2a.crossings.map((c, k) => (b2.crossings[k].q - c.q) / c.q);
  const dW = Math.max(...dWs.map(Math.abs));
  t.ok(dW < 1e-3, `R_w doubled: window charges change ${dWs.map((x) => fmt(x)).join(' ')}`);
  const cut = VC.viaCut(st, via);
  const req = VC.equivalentRadius(cut, b1.a);
  const bq = A.viaAxisym(st, via, { estimate: false, cache: false, Rw: req });
  const thin = S.cloneStackup(st);
  for (const l of thin.layers) if (l.kind === 'copper') l.t = { ...l.t, v: l.t.v / 4 };
  const bt = A.viaAxisym(thin, via, { estimate: false, cache: false });
  const row = (r) => r.crossings.map((c) => (c.dC * 1e15).toFixed(2)).join(' ');
  tab.push(`C44 ΔC per crossing L1–L6 (fF): R_w ${b1.Rw.toFixed(2)}: ${row(b1)}; R_w ${b2.Rw.toFixed(2)}: ${row(b2)} (level 2; windows change ${dWs.map((x) => fmt(x, 1)).join(' ')}); wall at the 2 returns' equivalent ${req.toFixed(3)} mm: ${row(bq)} (total ${(bq.total * 1e15).toFixed(1)}); copper t/4: ${row(bt)}`);
  t.ok(bq.ok, `wall at the equivalent radius: ${bq.reason}`);
  // Johnson & Graham: C ≈ 1.41·εr·T·D1/(D2 − D1) pF, inches, T the board thickness.
  const T = S.totalThickness(st) / 25.4, D1 = 0.6 / 25.4, D2 = 1.8 / 25.4;
  const jg = (er) => 1.41 * er * T * D1 / (D2 - D1) * 1e-12;
  tab.push(`Johnson & Graham for C44 (T ${(T * 25.4).toFixed(3)} mm, εr 4.1–4.4): ${(jg(4.1) * 1e15).toFixed(0)}–${(jg(4.4) * 1e15).toFixed(0)} fF; this solve: total ${(b1.total * 1e15).toFixed(0)} fF, ΣΔC ${(b1.crossings.reduce((s, c) => s + c.dC, 0) * 1e15).toFixed(0)} fF (R_w rule), ${(bq.crossings.reduce((s, c) => s + c.dC, 0) * 1e15).toFixed(0)} fF (equivalent wall)`);

  // Budget table.
  const time = (f, n = 3) => { let best = Infinity; for (let i = 0; i < n; i++) { const t0 = performance.now(); f(); best = Math.min(best, performance.now() - t0); } return best; };
  A.clearAxiCache();
  const tFull = time(() => A.viaAxisym(st, via, { cache: false }));
  const tOne = time(() => A.viaAxisym(st, via, { estimate: false, cache: false }));
  const tHalf = time(() => A.viaAxisym(st, via, { M: 0.5, estimate: false, cache: false }));
  A.viaAxisym(st, via);
  const tHit = time(() => A.viaAxisym(st, via), 20);
  const nC = b1.crossings.length;
  tab.push(`budget (C44, ${nC} crossings, ${b1.panels} panels at level 1): uncached with estimate ${tFull.toFixed(1)} ms (${(tFull / nC).toFixed(1)} per crossing), level 1 alone ${tOne.toFixed(1)} ms, level 1/2 alone ${tHalf.toFixed(1)} ms, cached ${tHit.toFixed(3)} ms; ${b1.levels[0].ms.assemble.toFixed(1)} assembly + ${b1.levels[0].ms.lu.toFixed(1)} LU`);
  t.ok(tHit < 1, `cached lookup ${tHit.toFixed(3)} ms`);
  t.ok(tFull < 150, `uncached axisymmetric solve ${tFull.toFixed(1)} ms`);
  // The side view's grid (M3.2): 64 × 64 points over the via.
  const tg = time(() => A.axiGrid(b1.levels[0], { r0: 0, r1: 2, z0: 0, z1: 1.6 }, 64, 64), 1);
  tab.push(`side-view grid 64 × 64 by direct sums: ${tg.toFixed(0)} ms`);
  for (const r of [...rows, ...tab]) t.note(r);
}
