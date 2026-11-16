// SPIKE (M0.3), not product code.
//
// Measures the spike solver of bem2d.mts: error against exact cases (facts-cases.md C15, C04, C11), convergence
// order, a refined case (microstrip with solder mask on the owner's geometry, C39), interface truncation, near/far
// quadrature, solve time against panel count, dense LU time in JavaScript and the cost of K and E by the AGM.
// Run: npm run spike (in scripts/harness/emsim). Prints short tables; numbers go to docs/em-sim/solver.md.

import { C0, type Kernel, type Panel, type Problem, panel, polyline, solve, luFactor, ellipKE } from './bem2d.mts';

interface Mesh { h0: number; mMin: number; q: number; dnear: number; mNear: number; rho0: number; X: number; eta: number }
const BASE: Mesh = { h0: 0.02, mMin: 2, q: 2, dnear: 0.15, mNear: 4, rho0: 1.6, X: 20, eta: Infinity };

function graded(a: number[], b: number[], m: number, q: number, mode: 'both' | 'start' | 'none'): number[][] {
  const pts: number[][] = [];
  for (let k = 0; k <= m; k++) {
    const t = k / m;
    let g = t;
    if (mode === 'both') { const x = t ** q, y = (1 - t) ** q; g = x / (x + y); } else if (mode === 'start') g = t ** q;
    pts.push([a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g]);
  }
  return pts;
}
function edge(out: Panel[], a: number[], b: number[], M: number, me: Mesh, cond: number): void {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  polyline(out, graded(a, b, M * Math.max(me.mMin, Math.ceil(len / me.h0)), me.q, 'both'), cond);
}
// Horizontal ray at height z from x0 to x = dir·X: graded towards x0 over dnear, then geometric.
function rayPts(x0: number, z: number, dir: number, M: number, me: Mesh): number[][] {
  const Lr = Math.abs(dir * me.X - x0), pts: number[][] = [];
  const mn = M * me.mNear;
  for (let k = 0; k < mn; k++) pts.push([x0 + dir * me.dnear * (k / mn) ** me.q, z]);
  const kf = M * Math.ceil(Math.log(Lr / me.dnear) / Math.log(me.rho0));
  for (let i = 0; i <= kf; i++) pts.push([x0 + dir * me.dnear * (Lr / me.dnear) ** (i / kf), z]);
  return pts;
}
function circle(out: Panel[], cx: number, cz: number, R: number, m: number, ccw: boolean, cond: number): void {
  const pts: number[][] = [];
  for (let k = 0; k <= m; k++) { const th = (ccw ? 1 : -1) * 2 * Math.PI * k / m; pts.push([cx + R * Math.cos(th), cz + R * Math.sin(th)]); }
  polyline(out, pts, cond);
}
type EpsAt = (x: number, z: number) => number;
function finish(kernel: Kernel, ps: Panel[], nSig: number, epsAt: EpsAt, vac: boolean): Problem {
  let qs = vac ? ps.filter((p) => p.cond >= 0) : ps;
  for (const p of qs) {
    const d = 0.1 * p.L, e1 = vac ? 1 : epsAt(p.mx + d * p.nx, p.mz + d * p.nz);
    if (p.cond >= 0) p.epsC = e1; else { p.epsP = e1; p.epsM = epsAt(p.mx - d * p.nx, p.mz - d * p.nz); }
  }
  qs = qs.filter((p) => p.cond >= 0 || p.epsP !== p.epsM);
  return { kernel, panels: qs, nSig };
}

// ---- structures ------------------------------------------------------------------------------------------------
interface Surf {
  h: number; er: number; t: number; mask: null | { em: number; tml: number; tmc: number; tms: number };
  conds: { x1: number; x2: number; cond: number }[]; nSig: number;
}
// Conductors on the top of a laminate of height h over a plane at z = 0 (image kernel), conformal mask.
function buildSurf(s: Surf, M: number, me: Mesh, vac: boolean): Problem {
  const out: Panel[] = [], X = me.X, h = s.h, t = s.t;
  const cs = [...s.conds].sort((a, b) => a.x1 - b.x1);
  const rev = (p: number[][]) => p.slice().reverse();
  for (const c of cs) {
    if (isFinite(c.x1) && isFinite(c.x2)) {
      edge(out, [c.x1, h], [c.x2, h], M, me, c.cond); edge(out, [c.x2, h], [c.x2, h + t], M, me, c.cond);
      edge(out, [c.x2, h + t], [c.x1, h + t], M, me, c.cond); edge(out, [c.x1, h + t], [c.x1, h], M, me, c.cond);
    } else if (!isFinite(c.x2)) {
      polyline(out, rayPts(c.x1, h, 1, M, me), c.cond); out.push(panel(X, h, X, h + t, c.cond));
      polyline(out, rev(rayPts(c.x1, h + t, 1, M, me)), c.cond); edge(out, [c.x1, h + t], [c.x1, h], M, me, c.cond);
    } else {
      polyline(out, rev(rayPts(c.x2, h, -1, M, me)), c.cond); edge(out, [c.x2, h], [c.x2, h + t], M, me, c.cond);
      polyline(out, rayPts(c.x2, h + t, -1, M, me), c.cond); out.push(panel(-X, h + t, -X, h, c.cond));
    }
  }
  if (isFinite(cs[0].x1)) polyline(out, rayPts(cs[0].x1, h, -1, M, me), -1);
  for (let i = 0; i + 1 < cs.length; i++) edge(out, [cs[i].x2, h], [cs[i + 1].x1, h], M, me, -1);
  const last = cs[cs.length - 1];
  if (isFinite(last.x2)) polyline(out, rayPts(last.x2, h, 1, M, me), -1);
  const mk = s.mask;
  const raised = mk ? cs.map((c) => [c.x1 - mk.tms, c.x2 + mk.tms]) : [];
  const zl = mk ? h + mk.tml : 0, zt = mk ? h + t + mk.tmc : 0;
  if (mk) {
    if (isFinite(raised[0][0])) polyline(out, rev(rayPts(raised[0][0], zl, -1, M, me)), -1);
    raised.forEach((R, i) => {
      if (isFinite(R[0])) edge(out, [R[0], zl], [R[0], zt], M, me, -1);
      if (isFinite(R[0]) && isFinite(R[1])) edge(out, [R[0], zt], [R[1], zt], M, me, -1);
      else if (!isFinite(R[1])) polyline(out, rayPts(R[0], zt, 1, M, me), -1);
      else polyline(out, rev(rayPts(R[1], zt, -1, M, me)), -1);
      if (isFinite(R[1])) {
        edge(out, [R[1], zt], [R[1], zl], M, me, -1);
        if (i + 1 < raised.length) edge(out, [R[1], zl], [raised[i + 1][0], zl], M, me, -1);
        else polyline(out, rayPts(R[1], zl, 1, M, me), -1);
      }
    });
  }
  const epsAt: EpsAt = (x, z) => {
    if (z < h) return s.er;
    if (!mk) return 1;
    if (z < zl) return mk.em;
    for (const R of raised) if (x > R[0] && x < R[1] && z < zt) return mk.em;
    return 1;
  };
  return finish({ kind: 'image' }, out, s.nSig, epsAt, vac);
}

// Owner's microstrip C39: w 0.1377, t 0.035, h 0.092 (3313, εr 4.1), JLCPCB mask 3.8: 0.0305 / 0.0152 / sides 0.0152.
const MASK = { em: 3.8, tml: 0.0305, tmc: 0.0152, tms: 0.0152 };
const msMask: Surf = { h: 0.092, er: 4.1, t: 0.035, mask: MASK, conds: [{ x1: -0.06885, x2: 0.06885, cond: 0 }], nSig: 1 };
const msBare: Surf = { ...msMask, mask: null };
// Coupled pair with mask and coplanar ground to the edge (timing and convergence of the 40 ms budget row).
const pairCPW: Surf = {
  h: 0.092, er: 4.1, t: 0.035, mask: MASK, nSig: 2,
  conds: [{ x1: -0.175, x2: -0.075, cond: 0 }, { x1: 0.075, x2: 0.175, cond: 1 },
    { x1: -Infinity, x2: -0.475, cond: 2 }, { x1: 0.475, x2: Infinity, cond: 3 }],
};

function cohn(M: number, me: Mesh, q: number): Problem {
  const out: Panel[] = [];
  polyline(out, graded([-0.25, 0.5], [0.25, 0.5], 8 * M, q, q === 1 ? 'none' : 'both'), 0);
  return finish({ kind: 'pp', b: 1 }, out, 1, () => 1, false);
}
function coax2(M: number, vac: boolean): Problem {
  const out: Panel[] = [];
  circle(out, 0, 0, 0.5, 16 * M, true, 0); circle(out, 0, 0, 1.0, 24 * M, true, -1); circle(out, 0, 0, 2.0, 32 * M, false, 1);
  for (const p of out) if (p.cond < 0) p.kappa = 1 / 1.0;
  return finish({ kind: 'free' }, out, 1, (x, z) => (Math.hypot(x, z) < 1 ? 4.3 : 1), vac);
}
function wire(M: number, vac: boolean): Problem {
  const out: Panel[] = [];
  circle(out, 0, 0.5, 0.1, 16 * M, true, 0);
  return finish({ kind: 'image' }, out, 1, () => 4.3, vac);
}
// Stripline in two dielectrics (pp kernel with an interface): planes 0.3 apart, core εr 4.6 below z = 0.2, prepreg
// 4.1 above; trace 0.15 × 0.03 on the core. No exact value: refinement only.
function strip2(M: number, me: Mesh, vac: boolean): Problem {
  const out: Panel[] = [], x1 = -0.075, x2 = 0.075, z = 0.2, t = 0.03;
  edge(out, [x1, z], [x2, z], M, me, 0); edge(out, [x2, z], [x2, z + t], M, me, 0);
  edge(out, [x2, z + t], [x1, z + t], M, me, 0); edge(out, [x1, z + t], [x1, z], M, me, 0);
  polyline(out, rayPts(x2, z, 1, M, me), -1); polyline(out, rayPts(x1, z, -1, M, me), -1);
  return finish({ kind: 'pp', b: 0.3 }, out, 1, (_x, zz) => (zz < z ? 4.6 : 4.1), vac);
}

// Coax half filled (εr 4.3 for z < 0): the interfaces lie along field lines, so exact C = π ε0 (εr + 1) / ln(b/a).
function coaxHalf(M: number, vac: boolean): Problem {
  const out: Panel[] = [], me = { ...BASE, h0: 0.1 };
  circle(out, 0, 0, 0.5, 16 * M, true, 0); circle(out, 0, 0, 2.0, 32 * M, false, 1);
  edge(out, [0.5, 0], [2, 0], M, me, -1); edge(out, [-2, 0], [-0.5, 0], M, me, -1);
  return finish({ kind: "free" }, out, 1, (_x, z) => (z < 0 ? 4.3 : 1), vac);
}

// ---- measurements ----------------------------------------------------------------------------------------------
const z0 = (Cd: number, Cv: number) => 1 / (C0 * Math.sqrt(Cd * Cv));
interface Row { M: number; n: number; v: number; ms: number }
function z0Of(build: (M: number, vac: boolean) => Problem, M: number, eta = Infinity): Row {
  const a = solve(build(M, false), eta), b = solve(build(M, true), eta);
  return { M, n: a.n, v: z0(a.C[0][0], b.C[0][0]), ms: a.tAll + b.tAll };
}
function zdiffOf(M: number, me: Mesh): Row {
  const a = solve(buildSurf(pairCPW, M, me, false), me.eta), b = solve(buildSurf(pairCPW, M, me, true), me.eta);
  const Co = a.C[0][0] - a.C[0][1], C0o = b.C[0][0] - b.C[0][1];
  return { M, n: a.n, v: 2 * z0(Co, C0o), ms: a.tAll + b.tAll };
}
const f = (x: number, d = 7) => x.toPrecision(d);
const pct = (x: number) => (100 * x).toExponential(2) + ' %';

function table(title: string, rows: Row[], exact?: number): void {
  console.log(`\n### ${title}${exact !== undefined ? ` (exact ${exact})` : ' (reference: Richardson of the two finest)'}`);
  let ref = exact;
  let pRef = 2;
  if (ref === undefined) {
    const k = rows.length - 1;
    pRef = Math.log2(Math.abs(rows[k - 1].v - rows[k - 2].v) / Math.abs(rows[k].v - rows[k - 1].v));
    ref = rows[k].v + (rows[k].v - rows[k - 1].v) / (2 ** pRef - 1);
    console.log(`reference ${f(ref, 10)} (order used ${pRef.toFixed(2)})`);
  }
  console.log('| M | panels | value | rel. error | order | estimate p=2 | est/err | ms (C + C0) |');
  console.log('|---|---|---|---|---|---|---|---|');
  rows.forEach((r, i) => {
    const err = Math.abs(r.v - ref!) / ref!;
    const ord = i > 0 ? Math.log2(Math.abs(rows[i - 1].v - ref!) / Math.abs(r.v - ref!)).toFixed(2) : '';
    const est = i > 0 ? Math.abs(r.v - rows[i - 1].v) / 3 / ref! : NaN;
    console.log(`| ${r.M} | ${r.n} | ${f(r.v)} | ${pct(err)} | ${ord} | ${i > 0 ? pct(est) : ''} | ${i > 0 ? (est / err).toFixed(2) : ''} | ${r.ms.toFixed(1)} |`);
  });
}

const which = process.argv[2] ?? 'all';
const run = (k: string) => which === 'all' || which === k;

if (run('exact')) {
  for (const q of [1, 2, 3]) {
    table(`C15 Cohn stripline w/b 0.5, εr 1, Z0 Ω, pp kernel, grading q=${q}`,
      [1, 2, 4, 8, 16].map((M) => { const s = solve(cohn(M, BASE, q)); return { M, n: s.n, v: 1 / (C0 * s.C[0][0]), ms: s.tAll }; }), 100.4324507);
  }
  table('C04 two-layer coax, Z0 Ω, free kernel + interface', [1, 2, 4, 8].map((M) => z0Of(coax2, M)), 65.25215579);
  table('C04b coax half filled, Z0 Ω, free kernel + straight interfaces', [1, 2, 4, 8].map((M) => z0Of(coaxHalf, M)),
    (376.730313412 / (2 * Math.PI)) * Math.log(4) / Math.sqrt(5.3 / 2));
  table('C11 wire over plane, εr 4.3, Z0 Ω, image kernel', [1, 2, 4, 8].map((M) => z0Of(wire, M)), 66.28463517);
}
if (run('refined')) {
  table('C39 microstrip with mask (εr 4.1 / 3.8), Z0 Ω', [1, 2, 4, 8, 16].map((M) => z0Of((m, v) => buildSurf(msMask, m, BASE, v), M)));
  table('C39 microstrip without mask (H–J 54.0558 Ω), Z0 Ω', [1, 2, 4, 8, 16].map((M) => z0Of((m, v) => buildSurf(msBare, m, BASE, v), M)));
  table('Two-layer stripline (pp + interface), Z0 Ω', [1, 2, 4, 8, 16].map((M) => z0Of((m, v) => strip2(m, BASE, v), M)));
  table('Pair + mask + coplanar ground, Zdiff Ω', [1, 2, 4, 8].map((M) => zdiffOf(M, BASE)));
  const e = solve(buildSurf(msMask, 8, BASE, false)), v = solve(buildSurf(msMask, 8, BASE, true));
  console.log(`\nC39 with mask at M=8: εeff ${f(e.C[0][0] / v.C[0][0])}, C ${f(e.C[0][0] * 1e12)} pF/m`);
}
if (run('trunc')) {
  console.log('\n### Interface truncation, C39 with mask, M=4: Z0 against X (relative to X = 2000 mm)');
  const at = (X: number) => z0Of((m, v) => buildSurf(msMask, m, { ...BASE, X }, v), 4);
  const ref = at(2000);
  console.log('| X mm | X/h | panels | rel. change |');
  console.log('|---|---|---|---|');
  for (const X of [0.3, 0.5, 1, 2, 5, 10, 20, 50, 200]) { const r = at(X); console.log(`| ${X} | ${(X / 0.092).toFixed(0)} | ${r.n} | ${pct((r.v - ref.v) / ref.v)} |`); }
  console.log('\n### Stripline truncation (two-layer), M=4, relative to X = 30 mm');
  const sat = (X: number) => z0Of((m, v) => strip2(m, { ...BASE, X }, v), 4);
  const sref = sat(30);
  for (const X of [0.3, 0.6, 1, 2, 3]) { const r = sat(X); console.log(`| ${X} | X/b ${(X / 0.3).toFixed(1)} | ${r.n} | ${pct((r.v - sref.v) / sref.v)} |`); }
}
if (run('eta')) {
  console.log('\n### Near/far split, C39 with mask, M=4 (eta = Infinity: closed form everywhere)');
  const ref = z0Of((m, v) => buildSurf(msMask, m, BASE, v), 4, Infinity);
  for (const eta of [Infinity, 10, 6, 3, 2]) {
    for (let w = 0; w < 3; w++) z0Of((m, v) => buildSurf(msMask, m, BASE, v), 4, eta);
    const r = z0Of((m, v) => buildSurf(msMask, m, BASE, v), 4, eta);
    console.log(`| eta ${eta} | Z0 ${f(r.v, 9)} | rel. change ${pct((r.v - ref.v) / ref.v)} | ${r.ms.toFixed(1)} ms |`);
  }
}
if (run('time')) {
  console.log('\n### Solve time (median of 7 after 3 warm-ups): one dielectric solve, breakdown');
  console.log('| case | M | panels | assembly ms | LU ms | total ms |');
  console.log('|---|---|---|---|---|---|');
  const cases: [string, (M: number, vac: boolean) => Problem][] = [
    ['microstrip+mask', (m, v) => buildSurf(msMask, m, BASE, v)],
    ['pair+mask+CPW', (m, v) => buildSurf(pairCPW, m, BASE, v)],
  ];
  for (const [name, build] of cases) {
    for (const M of [1, 2, 4, 8]) {
      const runs: { a: number; l: number; t: number; n: number }[] = [];
      for (let k = 0; k < 10; k++) { const s = solve(build(M, false)); if (k >= 3) runs.push({ a: s.tAsm, l: s.tLU, t: s.tAll, n: s.n }); }
      runs.sort((x, y) => x.t - y.t);
      const m = runs[3];
      console.log(`| ${name} | ${M} | ${m.n} | ${m.a.toFixed(2)} | ${m.l.toFixed(2)} | ${m.t.toFixed(2)} |`);
    }
  }
  console.log('\n### Full solve with error estimate = dielectric + vacuum at M and at M/2 (median of 7)');
  for (const [name, build] of cases) {
    for (const M of [2, 4]) {
      const ts: number[] = [];
      for (let k = 0; k < 10; k++) {
        const t0 = performance.now();
        solve(build(M, false)); solve(build(M, true)); solve(build(M / 2, false)); solve(build(M / 2, true));
        if (k >= 3) ts.push(performance.now() - t0);
      }
      ts.sort((x, y) => x - y);
      console.log(`| ${name} | M=${M} with M/2 | ${ts[3].toFixed(1)} ms (min ${ts[0].toFixed(1)}) |`);
    }
  }
}
if (run('lu')) {
  console.log('\n### Dense LU with partial pivoting, Float64Array, plain JS (median of 3 after 1 warm-up)');
  console.log('| n | ms | GFlop/s |');
  console.log('|---|---|---|');
  for (const n of [100, 200, 300, 500, 1000, 2000]) {
    const ts: number[] = [];
    for (let k = 0; k < 4; k++) {
      let seed = 12345;
      const A = new Float64Array(n * n);
      for (let i = 0; i < n * n; i++) { seed = (seed * 1103515245 + 12345) >>> 0; A[i] = seed / 4294967296 - 0.5; }
      for (let i = 0; i < n; i++) A[i * n + i] += n / 4;
      const t0 = performance.now(); luFactor(A, n, new Int32Array(n)); if (k > 0) ts.push(performance.now() - t0);
    }
    ts.sort((x, y) => x - y);
    console.log(`| ${n} | ${ts[1].toFixed(1)} | ${((2 / 3) * n ** 3 / ts[1] / 1e6).toFixed(2)} |`);
  }
}
if (run('agm')) {
  const r = new Float64Array(2), N = 1_000_000;
  ellipKE(0.5, r);
  console.log(`\nK(0.5) ${f(r[0], 10)} (C30: 1.685750355), E(0.5) ${f(r[1], 10)} (1.467462209)`);
  let s = 0;
  for (let w = 0; w < 2; w++) {
    const t0 = performance.now();
    for (let i = 0; i < N; i++) { ellipKE(0.999999 * ((i % 1000) + 0.5) / 1000, r); s += r[0] + r[1]; }
    if (w) console.log(`K and E by the AGM: ${((performance.now() - t0) * 1e6 / N).toFixed(0)} ns per pair (checksum ${s.toFixed(0)})`);
  }
}
