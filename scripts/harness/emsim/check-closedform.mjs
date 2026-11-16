// Closed forms against the field solver (step M1.4b): every formula of lib/emsim/closedform.ts first against the
// published numbers it must reproduce (facts-formulas.md, facts-cases.md), then sampled over its stated range and
// compared with the boundary-element solver, like with like:
// - formulas with thickness (IPC, Wheeler, Hammerstad–Jensen with t, Cohn's thick stripline): `solveSetup` on a
//   rectangle (no etch) without mask, the dielectric of the formula on both sides where it has one;
// - zero-thickness formulas (Hammerstad–Jensen, Kirschning–Jansen, Cohn's coupled stripline, CPW, CPWG): sheets on
//   the solver's own boundary (panels.ts edges, normalised h = 1). A sheet in the plane of a dielectric surface faces
//   air above and the substrate below; the solver sums its free charge as epsC·σ, which needs one medium, so here the
//   free charge of each sheet panel is σ·(εu + εd)/2 + (εu − εd)·ε0·Ez, Ez the normal field at its midpoint from
//   every other charge (collinear panels add none, so only the images in the plane and the substrate's bottom face).
// Bar: inside the stated range |closed form − solver| ≤ published accuracy × value + the solver's estimate; formulas
// without a published accuracy are reported only. Then the owner's cases C39–C43 (facts-cases.md validation table)
// with each cause switched on and off. Prints one table per part as notes.

import * as CF0 from '../../../lib/emsim/closedform.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as B0 from '../../../lib/emsim/bem2d.ts';
import * as P0 from '../../../lib/emsim/panels.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import * as IV0 from '../../../lib/emsim/inverse.ts';

const CF = CF0.default ?? CF0;
const LN = LN0.default ?? LN0;
const B = B0.default ?? B0;
const P = P0.default ?? P0;
const SU = SU0.default ?? SU0;
const S = S0.default ?? S0;
const ST = ST0.default ?? ST0;
const IV = IV0.default ?? IV0;

const D = P.MESH_DEFAULTS;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const pc = (x, d = 2) => (100 * x).toFixed(d);

// ---- published numbers ----
function published(t) {
  const n = (got, want, tol, what) => t.ok(rel(got, want) <= tol, `${what}: ${got} instead of ${want}`);
  n(CF.hammerstadJensen(0.1375, 0.0925, 0.035, 4.3).values.z0, 53.18045893, 1e-9, 'H–J C37 (facts.md §9)');
  const c39 = CF.hammerstadJensen(0.1377, 0.092, 0.035, 4.1).values;
  n(c39.z0, 54.0558, 2e-6, 'H–J C39 εr 4.1'); n(c39.eeff, 2.8632, 2e-5, 'H–J C39 εeff');
  n(CF.hammerstadJensen(0.1377, 0.092, 1.6 * 0.0254, 4.1).values.z0, 53.5169, 2e-6, 'H–J C39 t 1.6 mil');
  n(CF.hammerstadJensen(0.1377, 0.092, 0.035, 4.3).values.z0, 52.9811, 2e-6, 'H–J C39 εr 4.3');
  n(CF.wheeler1977(0.1375, 0.0925, 0.035, 4.3).values.z0, 53.44, 1e-4, 'Wheeler C37');
  n(CF.ipcMicrostrip(0.1375, 0.0925, 0.035, 4.3).values.z0, 48.75, 1e-4, 'IPC C37');
  n(CF.hjZero(1, 4.3).z0, 71.751, 1e-5, 'K–J ZL(0) at u = 1');
  for (const [g, ee, eo, ze, zo] of [[1, 3.3126, 2.8312, 81.742, 61.141], [10, 3.1232, 3.0948, 71.983, 71.392], [100, 3.1047, 3.1045, 71.752, 71.749]]) {
    const v = CF.kirschningJansen(1, g, 1, 4.3).values;
    n(v.eeffEven, ee, 2e-5, `K–J g ${g} εeff,e`); n(v.eeffOdd, eo, 2e-5, `K–J g ${g} εeff,o`);
    n(v.zeven, ze, 1e-5, `K–J g ${g} Zeven`); n(v.zodd, zo, 1e-5, `K–J g ${g} Zodd`);
  }
  for (const [u, er] of [[0.5, 9.7], [3, 2.35]]) { // g → ∞: the single line
    const v = CF.kirschningJansen(u, 300, 1, er).values, z = CF.hjZero(u, er);
    n(v.zeven, z.z0, 1e-4, `K–J u ${u} g → ∞ even`); n(v.zodd, z.z0, 1e-4, `K–J u ${u} g → ∞ odd`);
  }
  for (const [id, w, s, er, ze, zo] of [['C19', 0.5, 0.1, 1, 122.8856652, 69.86609071], ['C23', 0.25, 0.25, 1, 166.5138396, 111.1743647], ['C29', 0.3, 0.3, 4.3, 71.93362543, 51.97862642]]) {
    const v = CF.cohnCoupled(w, s, 1, er).values;
    n(v.zeven, ze, 1e-9, `${id} Zeven`); n(v.zodd, zo, 1e-9, `${id} Zodd`);
  }
  for (const [id, w, z] of [['C14', 0.1, 194.2262546], ['C15', 0.5, 100.4324507], ['C18', 5, 17.30892927]]) n(CF.cohnExact(w, 1, 1).values.z0, z, 1e-9, id);
  n(CF.cpw(0.3, 0.2, Infinity, 4.3).values.z0, 80.43498551, 1e-9, 'C26 CPW half space');
  n(CF.cpw(1, 0.5, Infinity, 1).values.z0, 120.4841532, 1e-9, 'C27 CPW in air');
  n(CF.cpwg(0.3, 0.2, 1e4, 4.3).values.z0, 80.43498551, 1e-8, 'CPWG with a far plane = C26');
  n(CF.cpw(0.3, 0.2, 1e4, 4.3).values.z0, 80.43498551, 1e-6, 'CPW on a thick substrate = C26');
  // Cohn's thick formulas at t = 0 against the exact line: −1.24 % at the crossover, the stated bound
  for (const w of [0.05, 0.2, 0.35, 0.5, 1, 2]) {
    const e = (CF.cohnStripline(w, 1, 0, 1).values.z0 - CF.cohnExact(w, 1, 1).values.z0) / CF.cohnExact(w, 1, 1).values.z0;
    t.ok(Math.abs(e) <= 0.0125, `Cohn t = 0, w/b ${w}: ${pc(e)} % from the exact line (stated −1.24 % at most)`);
  }
}

// ---- sheets on a substrate, solved with the free charge of each sheet ----
export function sheetBoundary(conds, er, plane, sub = true) {
  const h = 1;
  const sizes = [h];
  for (const c of conds) if (Number.isFinite(c.a) && Number.isFinite(c.b)) sizes.push(c.b - c.a);
  for (let k = 1; k < conds.length; k++) sizes.push(conds[k].a - conds[k - 1].b);
  const h0 = Math.min(...sizes) * D.h0PerSize;
  const finite = conds.flatMap((c) => [c.a, c.b]).filter(Number.isFinite);
  const X = 100 * Math.max(h, Math.max(...finite) - Math.min(...finite));
  const es = (er + 1) / 2, e = [];
  for (const c of conds) {
    if (!Number.isFinite(c.a)) e.push(P.conductorEdge(c.b, h, -X, h, c.id, es, P.GRADE_RAY));
    else if (!Number.isFinite(c.b)) e.push(P.conductorEdge(c.a, h, X, h, c.id, es, P.GRADE_RAY));
    else e.push(P.conductorEdge(c.a, h, c.b, h, c.id, es, P.GRADE_BOTH, Math.max(8, P.bothCount(c.b - c.a, h0))));
  }
  if (er !== 1) {
    for (let k = 1; k < conds.length; k++) e.push(P.interfaceEdge(conds[k - 1].b, h, conds[k].a, h, er, 1, P.GRADE_BOTH, Math.max(8, P.bothCount(conds[k].a - conds[k - 1].b, h0))));
    if (Number.isFinite(conds[0].a)) e.push(P.interfaceEdge(conds[0].a, h, -X, h, 1, er, P.GRADE_RAY));
    const l = conds[conds.length - 1];
    if (Number.isFinite(l.b)) e.push(P.interfaceEdge(l.b, h, X, h, er, 1, P.GRADE_RAY));
    if (!plane && sub) { e.push(P.interfaceEdge(0, 0, X, 0, 1, er, P.GRADE_RAY)); e.push(P.interfaceEdge(0, 0, -X, 0, er, 1, P.GRADE_RAY)); }
  }
  const signals = Math.max(...conds.map((c) => c.id));
  return { kernel: plane ? { kind: 'image' } : { kind: 'free' }, signals, edges: e, h0, dNear: D.nearPerH0 * h0, mNear: D.mNear, rho: D.rho, X, zShift: 0, flip: false };
}

// C of one level with each signal sheet's free charge (sheets at z = 1, air above, εr below).
export function sheetC(lv, n, er, image) {
  const m = lv.mesh, N = m.n, C = new Float64Array(n * n);
  for (let s = 0; s < n; s++) {
    const q = lv.q.subarray(s * N, s * N + N);
    for (let j = 0; j < m.nc; j++) {
      const c = m.cond[j];
      if (c < 1) continue;
      const x = m.mx[j], z = m.mz[j];
      let ez = 0;
      if (er !== 1) {
        for (let k = 0; k < N; k++) {
          const x1 = m.ax[k], x2 = x1 + m.tx[k] * m.len[k], lo = Math.min(x1, x2), hi = Math.max(x1, x2), zk = m.mz[k];
          const d = z - zk;
          if (Math.abs(d) > 1e-12) ez += q[k] * (Math.atan((hi - x) / d) - Math.atan((lo - x) / d));
          if (image) { const d2 = z + zk; ez -= q[k] * (Math.atan((hi - x) / d2) - Math.atan((lo - x) / d2)); }
        }
        ez /= 2 * Math.PI;
      }
      C[(c - 1) * n + s] += B.EPS0 * (q[j] * (1 + er) / 2 + (1 - er) * ez) * m.len[j];
    }
  }
  for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) { const a = (C[i * n + k] + C[k * n + i]) / 2; C[i * n + k] = a; C[k * n + i] = a; }
  return C;
}
const zOf = (C, C0) => 1 / (B.C0 * Math.sqrt(C * C0));
function sheetSolve(conds, er, plane, M = 2) {
  const bd = sheetBoundary(conds, er, plane);
  const r = B.solveBoundary(bd, { M });
  if (!r.ok) return { ok: false, reason: r.reason };
  const n = bd.signals;
  const per = r.levels.map((lv) => {
    const C = sheetC(lv, n, er, plane), C0 = lv.C0;
    if (n === 1) return { z0: zOf(C[0], C0[0]), eeff: C[0] / C0[0] };
    const ce = C[0] + C[1], co = C[0] - C[1], c0e = C0[0] + C0[1], c0o = C0[0] - C0[1];
    return { zeven: zOf(ce, c0e), zodd: zOf(co, c0o), eeffEven: ce / c0e, eeffOdd: co / c0o };
  });
  const v = {}, e = {};
  for (const k of Object.keys(per[0])) { const xs = per.map((p) => p[k]); v[k] = xs[xs.length - 1]; e[k] = B.estimateOf(xs).e; }
  return { ok: true, v, e, panels: r.levels[r.levels.length - 1].panels };
}

// ---- setups for the formulas with thickness (rectangles, no mask) ----
const LAYER = (st, id) => st.layers.find((l) => l.id === id);
function bare(w, kind, edit) {
  const su = SU.defaultSetup();
  const st = S.cloneStackup(su.stackup);
  for (const l of st.layers) if (l.kind === 'copper') { l.etch = { kind: 'none' }; l.base = null; l.plating = null; }
  edit(st);
  const tr = ST.presetStructure(kind, st, w);
  tr.masked = false;
  return { ...su, stackup: st, trace: tr };
}
const microSetup = (w, h, t, er) => bare(w, 'microstrip', (st) => { LAYER(st, 'L1').t.v = t; Object.assign(LAYER(st, 'D1'), { t: S.val(h), er: S.val(er) }); });
const stripSetup = (w, ha, hb, t, er) => bare(w, 'stripline', (st) => {
  LAYER(st, 'L2').t.v = t; Object.assign(LAYER(st, 'D1'), { t: S.val(ha), er: S.val(er) }); Object.assign(LAYER(st, 'D2'), { t: S.val(hb), er: S.val(er) });
});
const embSetup = (w, h, cover, t, er) => bare(w, 'embedded', (st) => {
  LAYER(st, 'L2').t.v = t; Object.assign(LAYER(st, 'D2'), { t: S.val(h), er: S.val(er) }); Object.assign(LAYER(st, 'D1'), { t: S.val(cover), er: S.val(er) });
});

// ---- the comparison table ----
const rows = new Map();
function compare(name, cfRes, ref, keys, where) {
  if (!rows.has(name)) rows.set(name, { name, n: 0, inside: 0, maxIn: 0, keyIn: '', maxOut: 0, acc: null, exceed: [], worst: '' });
  const row = rows.get(name);
  const acc = cfRes.validity.acc;
  row.n += 1;
  if (cfRes.validity.inside) row.inside += 1;
  for (const k of keys) {
    const ref1 = ref.v[k], err = (cfRes.values[k] - ref1) / ref1, allow = acc && acc[k] !== undefined ? acc[k] + ref.e[k] / Math.abs(ref1) : null;
    if (acc && acc[k] !== undefined) row.acc = Math.max(row.acc ?? 0, acc[k]);
    if (cfRes.validity.inside) {
      if (Math.abs(err) > Math.abs(row.maxIn)) { row.maxIn = err; row.keyIn = k; row.worst = `${k} at ${where}`; }
      if (allow !== null && Math.abs(err) > allow) row.exceed.push(`${k} ${pc(err)} % (allowed ${pc(allow)}) at ${where}`);
    } else if (Math.abs(err) > Math.abs(row.maxOut)) row.maxOut = err;
  }
}

function zeroThickness(t) {
  // Hammerstad–Jensen, single sheet over a plane
  for (const u of [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]) for (const er of [1, 2.2, 4.3, 9.8, 30]) {
    const r = sheetSolve([{ a: -u / 2, b: u / 2, id: 1 }], er, true);
    if (!t.ok(r.ok, `sheet u ${u} εr ${er}: ${r.reason}`)) continue;
    compare('Hammerstad–Jensen, t = 0', CF.hammerstadJensen(u, 1, 0, er), r, er === 1 ? ['z0'] : ['z0', 'eeff'], `w/h ${u}, εr ${er}`);
  }
  // Kirschning–Jansen, two sheets
  for (const u of [0.1, 0.3, 1, 3, 10]) for (const g of [0.1, 0.3, 1, 3, 10]) for (const er of [2.35, 4.3, 9.7, 18]) {
    const r = sheetSolve([{ a: -g / 2 - u, b: -g / 2, id: 1 }, { a: g / 2, b: g / 2 + u, id: 2 }], er, true);
    if (!t.ok(r.ok, `pair u ${u} g ${g}: ${r.reason}`)) continue;
    compare('Kirschning–Jansen, t = 0', CF.kirschningJansen(u, g, 1, er), r, ['zeven', 'zodd', 'eeffEven', 'eeffOdd'], `w/h ${u}, s/h ${g}, εr ${er}`);
  }
  for (const [u, g, er] of [[0.05, 1, 4.3], [20, 1, 4.3], [1, 0.05, 4.3], [1, 20, 4.3], [1, 1, 30]]) {
    const r = sheetSolve([{ a: -g / 2 - u, b: -g / 2, id: 1 }, { a: g / 2, b: g / 2 + u, id: 2 }], er, true);
    if (r.ok) compare('Kirschning–Jansen, t = 0', CF.kirschningJansen(u, g, 1, er), r, ['zeven', 'zodd', 'eeffEven', 'eeffOdd'], `w/h ${u}, s/h ${g}, εr ${er}`);
  }
  // Cohn's coupled stripline (exact), homogeneous: the solver's own C
  for (const [w, s] of [[0.2, 0.1], [0.5, 0.3], [1, 0.2], [0.3, 1], [2, 0.5], [0.1, 0.05]]) {
    const b = 1, h0 = Math.min(w, s) / 7, e = [];
    const k = Math.max(8, P.bothCount(w, h0));
    e.push(P.conductorEdge(-s / 2 - w, 0.5, -s / 2, 0.5, 1, 4.3, P.GRADE_BOTH, k), P.conductorEdge(s / 2, 0.5, s / 2 + w, 0.5, 2, 4.3, P.GRADE_BOTH, k));
    const bem = B.solveBoundary({ kernel: { kind: 'pp', b }, signals: 2, edges: e, h0, dNear: D.nearPerH0 * h0, mNear: D.mNear, rho: D.rho, X: 0, zShift: 0, flip: false }, { M: 2 });
    const r = LN.linesOf(bem);
    if (!t.ok(r.ok, `Cohn pair ${w}/${s}: ${r.reason}`)) continue;
    compare('Cohn coupled stripline, t = 0', CF.cohnCoupled(w, s, b, 4.3), { v: { zeven: r.pair.zeven.v, zodd: r.pair.zodd.v }, e: { zeven: r.pair.zeven.e, zodd: r.pair.zodd.e } }, ['zeven', 'zodd'], `w/b ${w}, s/b ${s}`);
  }
  // CPW on a finite substrate (no plane) and grounded CPW
  for (const w of [0.2, 0.5, 1, 2]) for (const g of [0.1, 0.3, 1]) for (const er of [4.3, 9.8]) {
    const conds = [{ a: -Infinity, b: -w / 2 - g, id: 0 }, { a: -w / 2, b: w / 2, id: 1 }, { a: w / 2 + g, b: Infinity, id: 0 }];
    const r1 = sheetSolve(conds, er, false), r2 = sheetSolve(conds, er, true);
    if (t.ok(r1.ok && r2.ok, `CPW ${w}/${g}: ${r1.reason ?? ''} ${r2.reason ?? ''}`)) {
      compare('CPW, t = 0', CF.cpw(w, g, 1, er), r1, ['z0', 'eeff'], `w/h ${w}, g/h ${g}, εr ${er}`);
      compare('CPWG, t = 0', CF.cpwg(w, g, 1, er), r2, ['z0', 'eeff'], `w/h ${w}, g/h ${g}, εr ${er}`);
    }
  }
}

function withThickness(t) {
  const h = 0.1;
  const q = (r, k = 0) => ({ v: { z0: r.lines[k].z0.v, eeff: r.lines[k].eeff.v }, e: { z0: r.lines[k].z0.e, eeff: r.lines[k].eeff.e } });
  for (const u of [0.1, 0.25, 0.5, 1, 2, 3, 5]) for (const T of [0.05, 0.1, 0.2, 0.4]) for (const er of [2.2, 4.3, 9.8]) {
    const r = LN.solveSetup(microSetup(u * h, h, T * h, er), { M: 2 });
    if (!t.ok(r.ok, `microstrip u ${u} t/h ${T}: ${r.reason}`)) continue;
    const at = `w/h ${u}, t/h ${T}, εr ${er}`;
    compare('Hammerstad–Jensen with t', CF.hammerstadJensen(u * h, h, T * h, er), q(r), ['z0', 'eeff'], at);
    compare('Wheeler 1977', CF.wheeler1977(u * h, h, T * h, er), q(r), ['z0'], at);
    compare('IPC-2141 microstrip', CF.ipcMicrostrip(u * h, h, T * h, er), q(r), ['z0'], at);
  }
  // symmetric stripline: b = 2h + t
  for (const x of [0.1, 0.2, 0.35, 0.5, 1, 2, 4]) for (const T of [0.005, 0.02, 0.05, 0.1, 0.2, 0.25]) {
    if (T === 0.005 && x > 0.35) continue;
    const b = 0.3, tt = T * b, hh = (b - tt) / 2, w = x * (b - tt);
    const r = LN.solveSetup(stripSetup(w, hh, hh, tt, 4.3), { M: 2 });
    if (!t.ok(r.ok, `stripline ${x}/${T}: ${r.reason}`)) continue;
    const at = `w/(b − t) ${x}, t/b ${T}`;
    compare('Cohn thick stripline', CF.cohnStripline(w, b, tt, 4.3), q(r), ['z0'], at);
    compare('IPC-2141 stripline', CF.ipcStripline(w, hh, tt, 4.3), q(r), ['z0'], at);
  }
  // dual (asymmetric) stripline
  for (const ratio of [1.5, 2, 3]) for (const u of [0.2, 0.5, 1]) {
    const h1 = 0.1, h2 = ratio * h1, tt = 0.1 * h1;
    const r = LN.solveSetup(stripSetup(u * h1, h1, h2, tt, 4.3), { M: 2 });
    if (t.ok(r.ok, `dual stripline: ${r.reason}`)) compare('IPC-2141 dual stripline', CF.ipcDualStripline(u * h1, h1, tt, 4.3, h2), q(r), ['z0'], `w/h ${u}, far/h ${ratio}`);
  }
  // embedded microstrip, both signs of εr′
  for (const c of [0.1, 0.5, 1, 2]) for (const u of [0.5, 1, 2]) {
    const tt = 0.035, r = LN.solveSetup(embSetup(u * h, h, c * h, tt, 4.3), { M: 2 });
    if (!t.ok(r.ok, `embedded: ${r.reason}`)) continue;
    const at = `w/h ${u}, cover/h ${c}`;
    compare('IPC-2141 embedded (sign corrected)', CF.ipcEmbedded(u * h, h, tt, 4.3, h + tt + c * h, 'corrected'), q(r), ['z0'], at);
    compare('IPC-2141 embedded (as printed)', CF.ipcEmbedded(u * h, h, tt, 4.3, h + tt + c * h, 'printed'), q(r), ['z0'], at);
  }
}

// Exceedances that are understood (notes-M1.4b.md): formula, value key and a predicate on the place.
const KNOWN = [
  // Kirschning–Jansen at the narrowest gap of its range: the formula's own error (the solver converges to the same
  // value at M = 2, 4 and 8), up to 1.35 % (Zodd at w/h 10, εr 2.35); at s/h 0.3 only the widest strips, by 0.02 %.
  (name, x) => name.startsWith('Kirschning') && (x.includes('s/h 0.1,') || x.includes('w/h 10, s/h 0.3,')),
  // Wheeler with t = 4w: the thickness correction assumes t ≪ w.
  (name, x) => name === 'Wheeler 1977' && x.includes('w/h 0.1, t/h 0.4'),
];

function table(t) {
  const lines = ['Closed forms vs the field solver (error = closed form / solver − 1; bar: published accuracy + the solver\'s estimate):',
    `  ${'formula'.padEnd(36)} points inside  max err inside (%)          published  over  max err outside`];
  for (const r of rows.values()) {
    const known = r.exceed.filter((x) => KNOWN.some((k) => k(r.name, x)));
    const bad = r.exceed.filter((x) => !known.includes(x));
    t.ok(bad.length === 0, () => `${r.name}: ${bad.length} beyond the published accuracy, e.g. ${bad.slice(0, 3).join('; ')}`);
    lines.push(`  ${r.name.padEnd(36)} ${String(r.n).padStart(6)} ${String(r.inside).padStart(6)}  ${(pc(r.maxIn) + ' ' + r.worst).padEnd(27).slice(0, 27)}  ${(r.acc === null ? '—' : pc(r.acc, 2)).padStart(9)}  ${String(r.exceed.length).padStart(4)}  ${r.n > r.inside ? pc(r.maxOut) : '—'}`);
    for (const x of r.exceed.slice(0, 4)) lines.push(`      over: ${x}${known.includes(x) ? ' (known)' : ''}`);
  }
  t.note(lines.join('\n'));
}

// ---- the owner's cases (facts-cases.md C39–C43) ----
function owner(t) {
  const preset = () => SU.defaultSetup();
  const edit = (base, f) => { const s = { ...base, stackup: S.cloneStackup(base.stackup), trace: { ...base.trace } }; f(s.stackup, s.trace); return s; };
  const noMask = (s) => edit(s, (st, tr) => { tr.masked = false; });
  const rect = (s) => edit(s, (st) => { for (const l of st.layers) if (l.kind === 'copper') l.etch = { kind: 'none' }; });
  const erAll = (s, er) => edit(s, (st) => { for (const l of st.layers) if (l.kind === 'dielectric') l.er = S.val(er); });
  const calcT = (s) => edit(s, (st) => { for (const l of st.layers) if (l.kind === 'copper' && l.calc && (l.id === 'L1' || l.id === 'L6')) l.t = S.val(l.calc.v); });
  const kicad = (s) => edit(rect(erAll(s, 4.3)), (st) => { for (const l of [st.layers[0], st.layers[st.layers.length - 1]]) if (l.kind === 'mask') { l.er = S.val(3.3); l.onLaminate = S.val(0.01); l.onCopper = S.val(0.01); l.between = S.val(0.01); } });
  const bottom = (s) => edit(s, (st, tr) => { tr.layer = 'L6'; tr.below = ''; tr.above = 'L5'; });
  const pair = (w, sp) => edit(preset(), (st, tr) => { Object.assign(tr, ST.presetStructure('pair-microstrip', st, w)); tr.s = S.val(sp); });
  const key = (s) => (s.trace.kind === 'microstrip' ? 'z0' : 'zdiff');
  const val = (s) => {
    const r = LN.solveSetup(s, { M: 2 });
    if (!r.ok) return { v: NaN, e: NaN, s: r.reason };
    const q = key(s) === 'z0' ? r.lines[0].z0 : r.pair.zdiff;
    return { v: q.v, e: q.e, x: key(s) === 'z0' ? r.lines[0].eeff.v : r.pair.zcm.v };
  };
  const f = (q) => `${q.v.toFixed(2)} ± ${q.e.toFixed(2)}`;
  const lines = ['Owner\'s cases (M = 2; JLC061611-3313A preset: εr 4.1, mask 1.2/0.6/1.2 mil εr 3.8, etch 0.35 mil per side, t 0.035):'];
  const cases = [['C39 50R_SE 0.1377 L1/L2', preset()], ['C41 LVDS 0.11/0.2 L1/L2', pair(0.11, 0.2)], ['C41 sheet 4.36/8 mil', pair(4.36 * 0.0254, 8 * 0.0254)], ['C43 default pair 0.2/0.25', pair(0.2, 0.25)]];
  const out = {};
  for (const [name, s] of cases) {
    const base = val(s);
    const v = {
      preset: base, 'no mask': val(noMask(s)), rectangle: val(rect(s)), 'bare (no mask, rectangle)': val(noMask(rect(s))),
      'εr 4.3 everywhere': val(erAll(s, 4.3)), 't 1.6 mil (calculator)': val(calcT(s)), 'KiCad as read': val(kicad(s)), 'KiCad as read, no mask': val(noMask(kicad(s))),
      mirror: val(bottom(s)),
    };
    out[name] = v;
    t.ok(Math.abs(v.mirror.v - base.v) <= base.e + v.mirror.e, `${name}: the bottom-side copy ${v.mirror.v} differs from ${base.v}`);
    lines.push(`  ${name}: ${key(s)} ${f(base)} Ω (${key(s) === 'z0' ? 'εeff' : 'Zcm'} ${base.x.toFixed(key(s) === 'z0' ? 4 : 2)}); mirrored ${f(v.mirror)}`);
    lines.push(`    ${Object.entries(v).filter(([k]) => k !== 'preset' && k !== 'mirror').map(([k, q]) => `${k} ${q.v.toFixed(2)} (${q.v - base.v >= 0 ? '+' : ''}${(q.v - base.v).toFixed(2)})`).join('; ')}`);
    const cf = CF.closedForms(s), cfb = CF.closedForms(noMask(rect(s)));
    const show = (c) => c.results.map((r) => `${r.name} ${r.values[key(s)].toFixed(2)}${r.validity.inside ? '' : ' (outside: ' + r.validity.outside.map((o) => o.input).join(', ') + ')'}`).join('; ');
    lines.push(`    closed forms on the preset (mean width ${cf.reduced.w.toFixed(4)}, mask left out): ${show(cf)}`);
    lines.push(`    closed forms on the bare rectangle (width ${cfb.reduced.w.toFixed(4)}): ${show(cfb)}`);
    // zero thickness (sheets) at the bare rectangle's width: what the copper thickness adds, and the formula's own error
    const hD = LAYER(s.stackup, 'D1').t.v, erD = LAYER(s.stackup, 'D1').er.v, u = s.trace.w.v / hD, g = s.trace.s.v / hD;
    const sh = s.trace.kind === 'microstrip' ? sheetSolve([{ a: -u / 2, b: u / 2, id: 1 }], erD, true) : sheetSolve([{ a: -g / 2 - u, b: -g / 2, id: 1 }, { a: g / 2, b: g / 2 + u, id: 2 }], erD, true);
    if (t.ok(sh.ok, `${name}: sheets`)) {
      const z = key(s) === 'z0' ? sh.v.z0 : 2 * sh.v.zodd, zf = key(s) === 'z0' ? CF.hjZero(u, erD).z0 : CF.kirschningJansen(u, g, 1, erD).values.zdiff;
      lines.push(`    zero thickness (sheets, no mask, εr ${erD}): ${z.toFixed(2)} Ω (bare t ${s.stackup.layers[1].t.v} adds ${(v['bare (no mask, rectangle)'].v - z).toFixed(2)}); ${key(s) === 'z0' ? 'H–J' : 'K–J'} at t = 0 ${zf.toFixed(2)} (${pc(zf / z - 1)} %)`);
    }
    const iv = IV.inverse(s, key(s), key(s) === 'z0' ? 50 : 100, 'w', { M: 2 });
    lines.push(`    width for ${key(s) === 'z0' ? 50 : 100} Ω by this tool (preset, gap kept): ${iv.reached ? `${iv.w.toFixed(4)} mm = ${(iv.w / 0.0254).toFixed(2)} mil` : iv.reason}`);
  }
  t.note(lines.join('\n'));
  return out;
}

// closedForms on every preset kind of the default stackup: which formulas, and none for the kinds without one
function mapping(t) {
  const su = SU.defaultSetup();
  const want = { microstrip: ['ipc-microstrip', 'wheeler', 'hj'], embedded: [], stripline: ['ipc-stripline', 'cohn-stripline'], stripline2: ['ipc-stripline', 'cohn-stripline'],
    cpw: ['cpw'], cpwg: ['cpwg'], 'pair-microstrip': ['kj'], 'pair-stripline': ['cohn-coupled'], 'pair-cpw': [], broadside: [], general: [] };
  const lines = ['closedForms on JLC061611-3313A, every kind (formula: inside the range?):'];
  for (const [kind, ids] of Object.entries(want)) {
    const tr = ST.presetStructure(kind, su.stackup, 0.15);
    const c = CF.closedForms({ ...su, trace: tr });
    t.ok(c.results.map((r) => r.id).join() === ids.join(), `${kind}: formulas ${c.results.map((r) => r.id)} instead of ${ids}`);
    t.ok(c.results.every((r) => Object.values(r.values).every(Number.isFinite)), `${kind}: finite values`);
    t.ok(ids.length > 0 || c.notes.length > 0, `${kind}: a note says why no formula`);
    lines.push(`  ${kind}: ${c.results.map((r) => `${r.id} ${r.validity.inside ? 'in' : 'out (' + r.validity.outside.map((o) => o.input).join(', ') + ')'} [${r.neglects.join(', ')}]`).join('; ') || c.notes[c.notes.length - 1].slice(0, 90)}`);
  }
  t.note(lines.join('\n'));
}

export function run(t) {
  const t0 = performance.now();
  published(t);
  mapping(t);
  zeroThickness(t);
  const t1 = performance.now();
  withThickness(t);
  const t2 = performance.now();
  table(t);
  owner(t);
  t.note(`Closed forms: sheets ${((t1 - t0) / 1000).toFixed(1)} s, setups ${((t2 - t1) / 1000).toFixed(1)} s, owner's cases ${((performance.now() - t2) / 1000).toFixed(1)} s`);
}
