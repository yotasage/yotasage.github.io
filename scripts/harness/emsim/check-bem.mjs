// The 2D boundary-element solver (M1.2a): every exact case of facts-cases.md it can represent, with the error per
// level and the measured order; symmetry, invariance under translation and mirroring, homogeneous identities; the
// owner's C39 against the M0.3 spike; the weight of the mask side-wall convention; timing of the main cases.
// Prints one compact table per part as notes. Circles are inscribed polygons refined with the level (32·M and 64·M
// vertices); sheets (zero thickness) are single conductor edges.

import * as B0 from '../../../lib/emsim/bem2d.ts';
import * as P0 from '../../../lib/emsim/panels.ts';
import * as G0 from '../../../lib/emsim/geometry.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';

const B = B0.default ?? B0;
const P = P0.default ?? P0;
const G = G0.default ?? G0;
const SU = SU0.default ?? SU0;
const S = S0.default ?? S0;
const ST = ST0.default ?? ST0;

const c = B.C0;
const ETA0 = 1 / (B.EPS0 * c);
const LEVELS = [1, 2, 4, 8];
const zOf = (C, C0) => 1 / (c * Math.sqrt(C * C0));

// ---- boundaries of the exact cases ----
const D = P.MESH_DEFAULTS;
function bnd(kernel, signals, edges, h0) {
  return { kernel, signals, edges, h0, dNear: D.nearPerH0 * h0, mNear: D.mNear, rho: D.rho, X: 0, zShift: 0, flip: false };
}
function circle(out, cx, cz, r, n, cond, epsAt) {
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n, b = (2 * Math.PI * (k + 1)) / n;
    const ax = cx + r * Math.cos(a), az = cz + r * Math.sin(a), bx = cx + r * Math.cos(b), bz = cz + r * Math.sin(b);
    out.push(P.conductorEdge(ax, az, bx, bz, cond, epsAt((az + bz) / 2), P.GRADE_FIXED, 1));
  }
}
const coax = (a, b, d, er) => (M) => {
  const e = [];
  circle(e, d, 0, a, 32 * M, 1, () => er); circle(e, 0, 0, b, 64 * M, 0, () => er);
  return bnd({ kind: 'free' }, 1, e, 0.1);
};
const coaxHalf = (a, b, er) => (M) => {
  const e = [], at = (z) => (z < 0 ? er : 1);
  circle(e, 0, 0, a, 32 * M, 1, at); circle(e, 0, 0, b, 64 * M, 0, at);
  e.push(P.interfaceEdge(a, 0, b, 0, er, 1, P.GRADE_BOTH, P.bothCount(b - a, 0.1)));
  e.push(P.interfaceEdge(-b, 0, -a, 0, er, 1, P.GRADE_BOTH, P.bothCount(b - a, 0.1)));
  return bnd({ kind: 'free' }, 1, e, 0.1);
};
const wires = (a1, a2, Dc, er) => (M) => {
  const e = [];
  circle(e, -Dc / 2, 0, a1, 32 * M, 1, () => er); circle(e, Dc / 2, 0, a2, 32 * M, 0, () => er);
  return bnd({ kind: 'free' }, 1, e, 0.1);
};
const wirePlane = (a, h, er) => (M) => {
  const e = [];
  circle(e, 0, h, a, 32 * M, 1, () => er);
  return bnd({ kind: 'image' }, 1, e, 0.1);
};
const strips = (w, s, er, n) => {
  const h0 = 1 / 8, e = [];
  const k = Math.max(8, P.bothCount(w, h0));
  if (n === 1) e.push(P.conductorEdge(-w / 2, 0.5, w / 2, 0.5, 1, er, P.GRADE_BOTH, k));
  else {
    e.push(P.conductorEdge(-s / 2 - w, 0.5, -s / 2, 0.5, 1, er, P.GRADE_BOTH, k));
    e.push(P.conductorEdge(s / 2, 0.5, s / 2 + w, 0.5, 2, er, P.GRADE_BOTH, k));
  }
  return bnd({ kind: 'pp', b: 1 }, n, e, h0);
};
const cpw = (w, g, er) => {
  const h0 = Math.min(w, g) / 7, X = 100 * (w + 2 * g), es = (er + 1) / 2, e = [];
  e.push(P.conductorEdge(-w / 2, 0, w / 2, 0, 1, es, P.GRADE_BOTH, P.bothCount(w, h0)));
  e.push(P.conductorEdge(w / 2 + g, 0, X, 0, 0, es, P.GRADE_RAY));
  e.push(P.conductorEdge(-w / 2 - g, 0, -X, 0, 0, es, P.GRADE_RAY));
  if (er !== 1) {
    e.push(P.interfaceEdge(w / 2, 0, w / 2 + g, 0, er, 1, P.GRADE_BOTH, P.bothCount(g, h0)));
    e.push(P.interfaceEdge(-w / 2 - g, 0, -w / 2, 0, er, 1, P.GRADE_BOTH, P.bothCount(g, h0)));
  }
  return bnd({ kind: 'free' }, 1, e, h0);
};

const single = (r) => r.single.z0;
const even = (r) => { const C = r.C, C0 = r.C0; return zOf(C[0][0] + C[0][1], C0[0][0] + C0[0][1]); };
const odd = (r) => { const C = r.C, C0 = r.C0; return zOf(C[0][0] - C[0][1], C0[0][0] - C0[0][1]); };
const lvZ = (f) => (lv) => f({ C: [[lv.C[0], lv.C[1]], [lv.C[2], lv.C[3]]], C0: [[lv.C0[0], lv.C0[1]], [lv.C0[2], lv.C0[3]]], single: { z0: B.z0Of(lv) } });

const half = (ETA0 / (2 * Math.PI)) * Math.log(4) / Math.sqrt(2.65);
const CASES = [
  ['C01', 'coax', coax(0.5, 1.75, 0, 1), single, 75.11377791],
  ['C02', 'coax εr 2.1', coax(1.0, 2.3, 0, 2.1), single, 34.46185654],
  ['C03', 'coax via-like', coax(0.15, 0.5, 0, 4.3), single, 34.81233450],
  ['C05', 'eccentric coax', coax(0.5, 2.0, 0.75, 1), single, 73.24781427],
  ['C06', 'eccentric 0.3 gap', coax(0.5, 2.0, 1.2, 4.3), single, 25.21636182],
  ['C07', 'two wires', wires(0.5, 0.5, 2.0, 1), single, 157.9256180],
  ['C08', 'two wires εr 4.3', wires(0.1, 0.1, 1.0, 4.3), single, 132.5692703],
  ['C09', 'unequal wires', wires(0.15, 0.25, 1.0, 1), single, 191.4414216],
  ['C10', 'wire over plane', wirePlane(0.5, 1.0, 1), single, 78.96280899],
  ['C11', 'wire over plane 4.3', wirePlane(0.1, 0.5, 4.3), single, 66.28463517],
  ['C04b', 'coax half filled', coaxHalf(0.5, 2.0, 4.3), single, half],
  ['C14', 'Cohn w/b 0.1', strips(0.1, 0, 1, 1), single, 194.2262546],
  ['C15', 'Cohn w/b 0.5', strips(0.5, 0, 1, 1), single, 100.4324507],
  ['C15r', 'Cohn 0.5 εr 4.3', strips(0.5, 0, 4.3, 1), single, 48.43282847],
  ['C16', 'Cohn w/b 1', strips(1, 0, 1, 1), single, 65.35362510],
  ['C17', 'Cohn w/b 2', strips(2, 0, 1, 1), single, 38.57932255],
  ['C18', 'Cohn w/b 5', strips(5, 0, 1, 1), single, 17.30892927],
];
for (const [id, w, s, er, ze, zo] of [
  ['C19', 0.5, 0.1, 1, 122.8856652, 69.86609071], ['C21', 0.5, 0.5, 1, 107.1543785, 93.21719672],
  ['C22', 0.5, 1.0, 1, 101.8633803, 98.98059904], ['C23', 0.25, 0.25, 1, 166.5138396, 111.1743647],
  ['C24', 0.5, 5.0, 1, 100.4324557, 100.4324457], ['C28', 1.0, 0.2, 1, 72.16242989, 55.94039373],
  ['C29', 0.3, 0.3, 4.3, 71.93362543, 51.97862642],
]) {
  CASES.push([id, `Zeven w/b ${w} s/b ${s}`, strips(w, s, er, 2), even, ze]);
  CASES.push([id, `Zodd w/b ${w} s/b ${s}`, strips(w, s, er, 2), odd, zo]);
}
CASES.push(['C26', 'CPW on εr 4.3', cpw(0.3, 0.2, 4.3), single, 80.43498551]);
CASES.push(['C27', 'CPW in air', cpw(1.0, 0.5, 1), single, 120.4841532]);

const pct = (x) => (100 * x).toPrecision(2);

function exactCases(t) {
  const lines = ['Exact cases: error of the value (%) at levels 1, 2, 4, 8 (panels at 8), measured orders, estimate at M = 2:'];
  let worst = 0;
  for (const [id, what, build, pick, exact] of CASES) {
    const errs = [];
    let n8 = 0;
    for (const M of LEVELS) {
      const r = B.solveBoundary(build, { M, estimate: false });
      if (!t.ok(r.ok, `${id} ${what} solves at M=${M}: ${r.reason}`)) break;
      errs.push((pick(r) - exact) / exact);
      n8 = r.levels[0].panels;
    }
    if (errs.length < LEVELS.length) continue;
    const orders = errs.slice(1).map((e, i) => Math.log2(Math.abs(errs[i] / e)).toFixed(1));
    const last = Math.abs(errs[errs.length - 1]);
    worst = Math.max(worst, last);
    t.ok(last <= 5e-4, `${id} ${what}: error ${pct(last)} % at M=8 (bar 0.05 %)`);
    // the estimate at the default level against the true error
    const d = B.solveBoundary(build, { M: 2 });
    const zs = d.levels.map(lvZ(pick));
    const est = B.estimateOf(zs);
    const trueErr = Math.abs(zs[2] - exact);
    t.ok(est.e >= trueErr, `${id} ${what}: estimate ${est.e.toExponential(2)} below the true error ${trueErr.toExponential(2)} at M=2`);
    lines.push(`  ${id.padEnd(5)} ${what.padEnd(26)} ${errs.map(pct).join(' / ').padEnd(30)} n${String(n8).padStart(4)}  p ${orders.join(' ')}  est/err ${(est.e / trueErr).toFixed(1)} ${est.status}`);
  }
  lines.push(`  worst error at M = 8: ${pct(worst)} %`);
  t.note(lines.join('\n'));
}

// ---- sections ----
function c39Stackup(er = 4.1) {
  const st = S.cloneStackup(SU.defaultSetup().stackup);
  st.layers.find((l) => l.id === 'L1').etch = { kind: 'none' };
  const mk = st.layers[0];
  mk.onLaminate.v = 0.0305; mk.onCopper.v = 0.0152; mk.between.v = 0.0305;
  st.layers.find((l) => l.id === 'D1').er.v = er;
  return st;
}
const c39Section = (er) => G.section(c39Stackup(er), SU.defaultSetup().trace);

// The owner's microstrip with a mask side coat tms (the convention: tms = over-copper), drawn by hand.
function maskedMicrostrip(tms) {
  const E = 0.85, Z = 0.9, h = 0.092, t = 0.035, tml = 0.0305, tmc = 0.0152, x1 = -0.06885, x2 = 0.06885;
  const F = (a) => Float64Array.from(a);
  const regions = [{ mat: 2, open: 3, pts: F([-E, 0, E, 0, E, h, -E, h]) }];
  if (tms > 0) {
    regions.push({ mat: 1, open: 3, pts: F([-E, h, x1, h, x1, h + t, x2, h + t, x2, h, E, h, E, h + tml, x2 + tms, h + tml, x2 + tms, h + t + tmc, x1 - tms, h + t + tmc, x1 - tms, h + tml, -E, h + tml]) });
    regions.push({ mat: 0, open: 7, pts: F([-E, h + tml, x1 - tms, h + tml, x1 - tms, h + t + tmc, x2 + tms, h + t + tmc, x2 + tms, h + tml, E, h + tml, E, Z, -E, Z]) });
  } else {
    regions.push({ mat: 1, open: 1, pts: F([-E, h, x1, h, x1, h + tml, -E, h + tml]) });
    regions.push({ mat: 1, open: 2, pts: F([x2, h, E, h, E, h + tml, x2, h + tml]) });
    regions.push({ mat: 1, open: 0, pts: F([x1, h + t, x2, h + t, x2, h + t + tmc, x1, h + t + tmc]) });
    regions.push({ mat: 0, open: 7, pts: F([-E, h + tml, x1, h + tml, x1, h + t + tmc, x2, h + t + tmc, x2, h + tml, E, h + tml, E, Z, -E, Z]) });
  }
  return {
    ext: E, zLo: 0, zHi: Z, planeBelow: 0, planeAbove: null, wall: 0, signals: 1,
    materials: [{ kind: 'air', layer: -1, er: 1, tand: 0 }, { kind: 'mask', layer: 0, er: 3.8, tand: null }, { kind: 'dielectric', layer: 2, er: 4.1, tand: null }],
    conductors: [{ id: 1, layer: 1, open: 0, pts: F([x1, h, x2, h, x2, h + t, x1, h + t]) }], regions, skins: [],
  };
}

// Translate in u, mirror in u (mirror) or in z (flip: the planes swap).
function moved(sec, du, mirror, flip) {
  const K = sec.zLo + sec.zHi;
  const tr = (pts) => {
    const n = pts.length / 2, out = new Float64Array(pts.length);
    for (let i = 0; i < n; i++) {
      const j = mirror || flip ? n - 1 - i : i;
      out[2 * j] = (mirror ? -pts[2 * i] : pts[2 * i]) + du;
      out[2 * j + 1] = flip ? K - pts[2 * i + 1] : pts[2 * i + 1];
    }
    return out;
  };
  const op = (o) => (mirror ? ((o & 1) << 1) | ((o & 2) >> 1) | (o & 12) : flip ? (o & 3) | ((o & 4) << 1) | ((o & 8) >> 1) : o);
  return {
    ...sec,
    planeBelow: flip ? (sec.planeAbove == null ? null : K - sec.planeAbove) : sec.planeBelow,
    planeAbove: flip ? (sec.planeBelow == null ? null : K - sec.planeBelow) : sec.planeAbove,
    conductors: sec.conductors.map((k) => ({ ...k, pts: tr(k.pts), open: op(k.open) })),
    regions: sec.regions.map((r) => ({ ...r, pts: tr(r.pts), open: op(r.open) })),
  };
}

const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const maxRel = (A, Bm, perm = (i) => i) => {
  let w = 0;
  const s = Math.sqrt(Math.abs(Bm[0][0] * Bm[Bm.length - 1][Bm.length - 1]));
  for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) w = Math.max(w, Math.abs(A[perm(i)][perm(j)] - Bm[i][j]) / s);
  return w;
};
const symErr = (A) => { let w = 0; for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) w = Math.max(w, Math.abs(A[i][j] - A[j][i]) / Math.sqrt(Math.abs(A[i][i] * A[j][j]))); return w; };

function pairSection(masked = true) {
  const su = SU.defaultSetup();
  const st = ST.presetStructure('pair-cpw', su.stackup, 0.1);
  st.s.v = 0.15; st.g.v = 0.3; st.masked = masked;
  return G.section(su.stackup, st);
}

function invariance(t) {
  const lines = ['Symmetry, invariance, identities (relative differences):'];
  const ref = B.solveSection(c39Section(), { M: 2, estimate: false });
  const tol = 1e-11;
  for (const [what, sec] of [['C39 translated 0.3711', moved(c39Section(), 0.3711, false, false)], ['C39 mirrored in u', moved(c39Section(), 0, true, false)],
    ['C39 mirrored in z (plane above)', moved(c39Section(), 0, false, true)]]) {
    const r = B.solveSection(sec, { M: 2, estimate: false });
    const d = rel(r.single.z0, ref.single.z0);
    t.ok(d <= tol, `${what}: Z0 differs by ${d.toExponential(2)}`);
    lines.push(`  ${what.padEnd(34)} Z0 ${d.toExponential(1)}`);
  }
  const pr = B.solveSection(pairSection(), { M: 2, estimate: false });
  t.ok(pr.ok, `pair solves: ${pr.reason}`);
  const pm = B.solveSection(moved(pairSection(), 0.25, true, false), { M: 2, estimate: false });
  const dp = maxRel(pm.C, pr.C, (i) => 1 - i);
  t.ok(dp <= tol, `pair mirrored: C differs by ${dp.toExponential(2)} (conductors swapped)`);
  lines.push(`  ${'pair mirrored and translated'.padEnd(34)} C ${dp.toExponential(1)} (1 ↔ 2)`);
  // stripline off centre between planes, mirrored in z
  const so = (zc) => (M) => bnd({ kind: 'pp', b: 1 }, 1, [P.conductorEdge(-0.25, zc, 0.25, zc, 1, 1, P.GRADE_BOTH, 8)], 1 / 8);
  const a = B.solveBoundary(so(0.3), { M: 2, estimate: false }), b2 = B.solveBoundary(so(0.7), { M: 2, estimate: false });
  const dz = rel(a.single.z0, b2.single.z0);
  t.ok(dz <= tol, `strip at 0.3 b vs 0.7 b: ${dz.toExponential(2)}`);
  lines.push(`  ${'strip at z = 0.3b vs 0.7b'.padEnd(34)} Z0 ${dz.toExponential(1)}`);
  // symmetric matrices (after symmetrising) and the raw asymmetry of collocation
  const tri = B.solveBoundary(bnd({ kind: 'pp', b: 1 }, 3, [
    P.conductorEdge(-0.9, 0.5, -0.5, 0.5, 1, 4, P.GRADE_BOTH, 8), P.conductorEdge(-0.3, 0.4, 0.2, 0.4, 2, 4, P.GRADE_BOTH, 8),
    P.conductorEdge(0.35, 0.6, 1.1, 0.6, 3, 4, P.GRADE_BOTH, 8)], 1 / 8), { M: 2 });
  for (const [what, r] of [['pair + mask + ground', pr], ['three unequal strips', tri]]) {
    const s = Math.max(symErr(r.C), symErr(r.C0), symErr(r.L));
    t.ok(s <= 1e-12, `${what}: C, C0, L symmetric (${s})`);
    lines.push(`  ${what.padEnd(34)} C, C0, L symmetric to ${s.toExponential(1)}; collocation asymmetry removed ${r.levels[r.levels.length - 1].asym.toExponential(1)}`);
  }
  // homogeneous identities
  const su = SU.defaultSetup();
  const hs = S.cloneStackup(su.stackup);
  for (const l of hs.layers) if (l.kind === 'dielectric') l.er.v = 4.2;
  const strip = ST.presetStructure('stripline', hs, 0.12);
  const rs = B.solveSection(G.section(hs, strip), { M: 2, estimate: false });
  t.ok(rs.ok, `stripline solves: ${rs.reason}`);
  const de = rel(rs.single.eeff, 4.2);
  t.ok(de <= 1e-12, `stripline in one εr: εeff ${rs.single.eeff}`);
  lines.push(`  ${'stripline, all layers εr 4.2'.padEnd(34)} εeff − 4.2: ${de.toExponential(1)}`);
  const r2 = B.solveSection(c39Section(2.0), { M: 2, estimate: false });
  const dl = rel(r2.L[0][0], ref.L[0][0]);
  t.ok(dl <= 1e-12, `C39 L with εr 2.0 vs 4.1: ${dl}`);
  lines.push(`  ${'C39 L, laminate εr 2.0 vs 4.1'.padEnd(34)} ${dl.toExponential(1)}`);
  t.note(lines.join('\n'));
}

function owner(t) {
  const lines = ['C39 (owner\'s microstrip with mask, rectangle, spike geometry): Z0 by level, panels:'];
  const sec = c39Section();
  const row = [];
  for (const M of [1, 2, 4, 8]) {
    const r = B.solveSection(sec, { M, estimate: false });
    row.push(`${r.levels[0].panels}: ${r.single.z0.toFixed(5)}`);
  }
  lines.push(`  ${row.join('; ')}`);
  const d = B.solveSection(sec, { M: 2 });
  const e = d.single.z0Err;
  t.ok(Math.abs(d.single.z0 - 50.526) <= e.e, `C39 ${d.single.z0} vs spike 50.526 beyond the estimate ${e.e}`);
  t.ok(e.status === 'regular' || e.status === 'converged', `C39 estimate status ${e.status}`);
  lines.push(`  M = 2: Z0 ${d.single.z0.toFixed(4)} ± ${e.e.toFixed(4)} Ω (${e.status}, order ${e.order.toFixed(1)}), εeff ${d.single.eeff.toFixed(4)}, C ${(d.C[0][0] * 1e12).toFixed(2)} pF/m; spike 50.526`);
  // the hand-drawn section equals the geometry's
  const hand = B.solveSection(maskedMicrostrip(0.0152), { M: 2, estimate: false });
  const dh = rel(hand.single.z0, B.solveSection(sec, { M: 2, estimate: false }).single.z0);
  t.ok(dh <= 1e-11, `hand-drawn C39 section vs geometry.ts: ${dh}`);
  // mask side walls
  const sw = [0, 0.01524, 0.03048].map((tms) => B.solveSection(maskedMicrostrip(tms), { M: 4, estimate: false }).single.z0);
  lines.push(`  side-wall mask (M = 4): 0 → ${sw[0].toFixed(4)}, C2 15.24 µm → ${sw[1].toFixed(4)}, C1 30.48 µm → ${sw[2].toFixed(4)} Ω`);
  t.ok(sw[0] > sw[1] && sw[1] > sw[2], 'more side-wall mask lowers Z0');
  t.note(lines.join('\n'));
}

function timing(t) {
  const lines = ['Timing (ms, median of 3; per level: mesh / assembly / LU / LU vacuum / solves):'];
  const su = SU.defaultSetup();
  for (const [what, sec] of [['microstrip + mask (default setup)', G.section(su.stackup, su.trace)], ['pair + mask + coplanar ground', pairSection()]]) {
    const runs = [];
    for (let k = 0; k < 3; k++) runs.push(B.solveSection(sec, { M: 2 }));
    runs.sort((a, b) => a.ms - b.ms);
    const r = runs[1];
    t.ok(r.ok, `${what} solves`);
    const lv = r.levels.map((l) => `M${l.M} n${l.panels}: ${[l.ms.mesh, l.ms.assemble, l.ms.lu, l.ms.lu0, l.ms.solve].map((x) => x.toFixed(1)).join('/')}`);
    lines.push(`  ${what}: ${r.ms.toFixed(1)} ms with estimate; ${lv.join('; ')}`);
  }
  t.note(lines.join('\n'));
}

export function run(t) {
  exactCases(t);
  invariance(t);
  owner(t);
  timing(t);
}
