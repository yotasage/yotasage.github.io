// Checks of step M1.5: fields from the stored solution (lib/emsim/fields.ts, fieldlines.ts), the colour maps
// (colormap.ts), zero-thickness copper (bem2d.ts `freeCharges`, panels.ts `sheetEdge`), and the field-map budgets.
//
// - Exact fields: coax and two wires (free kernel, polygons of circles at M = 8) against φ and E of the true circles,
//   at points more than two panel lengths from the copper; the quasi-TEM H of the coax against I/(2πr).
// - Gauss: the flux of D = ε0·εr·E through a contour around each conductor (composite Gauss–Legendre, split where
//   the medium changes and graded towards those points) against the conductor's free charge and the solver's
//   estimate; Ampère: the clockwise line integral of H around each conductor against its current.
// - φ inside each conductor (copper not masked) against the conductor's potential.
// - Runs by multipole against every panel by kernels.ts's own panelPot/panelDn; grids against direct evaluation.
// - Equipotentials lie on their level, field lines run downhill in φ from copper to copper or the view's edge.

import * as F0 from '../../../lib/emsim/fields.ts';
import * as FL0 from '../../../lib/emsim/fieldlines.ts';
import * as CM0 from '../../../lib/emsim/colormap.ts';
import * as B0 from '../../../lib/emsim/bem2d.ts';
import * as P0 from '../../../lib/emsim/panels.ts';
import * as K0 from '../../../lib/emsim/kernels.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as ST0 from '../../../lib/emsim/structure.ts';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as CF0 from '../../../lib/emsim/closedform.ts';
import { generate, linearToOklab, fromSrgb } from './colormap-gen.mjs';
import { sheetBoundary, sheetC } from './check-closedform.mjs';

const F = F0.default ?? F0, FL = FL0.default ?? FL0, CM = CM0.default ?? CM0, B = B0.default ?? B0, P = P0.default ?? P0;
const K = K0.default ?? K0, LN = LN0.default ?? LN0, SU = SU0.default ?? SU0, ST = ST0.default ?? ST0, S = S0.default ?? S0;
const CF = CF0.default ?? CF0;

const now = () => performance.now();
const D = P.MESH_DEFAULTS;
const EPS0 = B.EPS0, C0 = B.C0;
const bnd = (kernel, signals, edges, h0) => ({ kernel, signals, edges, h0, dNear: D.nearPerH0 * h0, mNear: D.mNear, rho: D.rho, X: 0, zShift: 0, flip: false });
function circle(out, cx, cz, r, n, cond, er) {
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n, b = (2 * Math.PI * (k + 1)) / n;
    out.push(P.conductorEdge(cx + r * Math.cos(a), cz + r * Math.sin(a), cx + r * Math.cos(b), cz + r * Math.sin(b), cond, er, P.GRADE_FIXED, 1));
  }
}
const coax = (a, b, er) => (M) => { const e = []; circle(e, 0, 0, a, 32 * M, 1, er); circle(e, 0, 0, b, 64 * M, 0, er); return bnd({ kind: 'free' }, 1, e, 0.1); };
const coaxHalf = (a, b, er) => (M) => {
  const e = [];
  for (const [r, n, c] of [[a, 32 * M, 1], [b, 64 * M, 0]]) for (let k = 0; k < n; k++) {
    const t0 = (2 * Math.PI * k) / n, t1 = (2 * Math.PI * (k + 1)) / n;
    e.push(P.conductorEdge(r * Math.cos(t0), r * Math.sin(t0), r * Math.cos(t1), r * Math.sin(t1), c, Math.sin((t0 + t1) / 2) < 0 ? er : 1, P.GRADE_FIXED, 1));
  }
  e.push(P.interfaceEdge(a, 0, b, 0, er, 1, P.GRADE_BOTH, P.bothCount(b - a, 0.1)));
  e.push(P.interfaceEdge(-b, 0, -a, 0, er, 1, P.GRADE_BOTH, P.bothCount(b - a, 0.1)));
  return bnd({ kind: 'free' }, 1, e, 0.1);
};
const wires = (a, Dc) => (M) => { const e = []; circle(e, -Dc / 2, 0, a, 32 * M, 1, 1); circle(e, Dc / 2, 0, a, 32 * M, 0, 1); return bnd({ kind: 'free' }, 1, e, 0.1); };

// ---- contour integrals ----
const GL8 = [[-0.9602898564975363, 0.1012285362903763], [-0.7966664774136267, 0.2223810344533745], [-0.5255324099163290, 0.3137066458778873], [-0.1834346424956498, 0.3626837833783620],
  [0.1834346424956498, 0.3626837833783620], [0.5255324099163290, 0.3137066458778873], [0.7966664774136267, 0.2223810344533745], [0.9602898564975363, 0.1012285362903763]];
// ∮ f over a closed CCW polygon; f(x, z, nx, nz, tx, tz, o, cls) with o = [φ, Fx, Fz]; dl in metres.
function contour(src, poly, f) {
  const media = src.model.media, o = [0, 0, 0];
  let sum = 0;
  for (let k = 0; k < poly.length; k++) {
    const [ax, az] = poly[k], [bx, bz] = poly[(k + 1) % poly.length];
    const L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, nx = tz, nz = -tx;
    const at = (s) => F.classify(media, ax + s * tx, az + s * tz);
    const brk = [0];
    const NS = poly.length > 16 ? 16 : 400;
    for (let i = 0; i < NS; i++) {
      let s0 = (L * i) / NS, s1 = (L * (i + 1)) / NS;
      if (at(s0) === at(s1)) continue;
      const c0 = at(s0);
      for (let b = 0; b < 60; b++) { const m = (s0 + s1) / 2; if (at(m) === c0) s0 = m; else s1 = m; }
      brk.push((s0 + s1) / 2);
    }
    brk.push(L);
    for (let q = 0; q + 1 < brk.length; q++) {
      const s0 = brk[q], s1 = brk[q + 1], w = s1 - s0;
      // graded towards a change of medium (D·n has a kink there), else four equal pieces
      const ga = q > 0, gb = q + 2 < brk.length;
      const head = [0];
      if (ga) for (let g = 14; g >= 1; g--) head.push(0.5 * 0.4 ** g);
      head.push(ga || gb ? 0.5 : 0.25);
      if (!ga && !gb) head.push(0.5, 0.75);
      const tail = gb ? head.slice(0, -1).reverse().map((x) => 1 - x) : !ga ? [1] : [0.75, 1];
      const cuts = ga || gb ? head.concat(gb ? tail : [0.75, 1]) : head.concat(tail);
      for (let c = 0; c + 1 < cuts.length; c++) {
        const u0 = s0 + w * cuts[c], u1 = s0 + w * cuts[c + 1], hw = (u1 - u0) / 2;
        for (const [x, wt] of GL8) {
          const s = u0 + hw * (x + 1), px = ax + s * tx, pz = az + s * tz;
          const cl = F.evalField(src, px, pz, o);
          sum += wt * hw * f(px, pz, nx, nz, tx, tz, o, cl) / 1000;
        }
      }
    }
  }
  return sum;
}
const box = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const ring = (r, n = 256) => Array.from({ length: n }, (_, k) => [r * Math.cos((2 * Math.PI * k) / n), r * Math.sin((2 * Math.PI * k) / n)]);
const gauss = (src) => (x, z, nx, nz, tx, tz, o, c) => (c < 0 ? NaN : EPS0 * src.model.media.eps[c] * (o[1] * nx + o[2] * nz));
const ampere = (x, z, nx, nz, tx, tz, o) => -(o[1] * tx + o[2] * tz); // clockwise

function pairSetup(kind, w, s, g) {
  const su = SU.defaultSetup();
  const st = ST.presetStructure(kind, su.stackup, w);
  st.s.v = s;
  if (g) st.g.v = g;
  return { ...su, trace: st };
}
function setupModel(setup) {
  const sec = LN.setupSection(setup);
  const r = LN.solveSetup(setup, { M: 2 });
  return { sec, r, model: F.fieldModel(r.bem, sec) };
}
const bboxOf = (pts) => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (let k = 0; k < pts.length; k += 2) { x0 = Math.min(x0, pts[k]); x1 = Math.max(x1, pts[k]); z0 = Math.min(z0, pts[k + 1]); z1 = Math.max(z1, pts[k + 1]); } return { x0, x1, z0, z1 }; };

export async function run(t) {
  const rows = [];
  const T = [];
  const row = (what, value, bar) => rows.push(`${what.padEnd(58)} ${value.padStart(12)}   ${bar}`);

  T.push(['exact', now()]);
  // ---- exact coax and two wires ----
  {
    const a = 0.5, b = 1.75, M = 8;
    const res = B.solveBoundary(coax(a, b, 2.2), { M });
    const media = F.functionMedia([1, 2.2], (x, z) => { const r = Math.hypot(x, z); return r < a ? -2 : r > b ? -1 : 1; });
    const model = F.fieldModel(res, media);
    const src = F.electric(model, [1]);
    const hsrc = F.magnetic(model, [1]);
    const away = 2 * Math.max((2 * Math.PI * a) / (32 * M), (2 * Math.PI * b) / (64 * M));
    let ePhi = 0, eE = 0, eH = 0;
    const o = [0, 0, 0], h = [0, 0, 0];
    for (let k = 0; k < 400; k++) {
      const r = a + away + ((b - a - 2 * away) * (k % 20 + 0.5)) / 20, th = 0.1 + (2 * Math.PI * Math.floor(k / 20)) / 20;
      const x = r * Math.cos(th), z = r * Math.sin(th);
      F.evalField(src, x, z, o);
      F.evalField(hsrc, x, z, h);
      const lnba = Math.log(b / a), Er = 1000 / (r * lnba);
      ePhi = Math.max(ePhi, Math.abs(o[0] - Math.log(b / r) / lnba));
      eE = Math.max(eE, Math.hypot(o[1] - Er * Math.cos(th), o[2] - Er * Math.sin(th)) / Er);
      const H = 1000 / (2 * Math.PI * r); // I = 1 A, clockwise
      eH = Math.max(eH, Math.hypot(h[1] - H * Math.sin(th), h[2] + H * Math.cos(th)) / H);
    }
    t.ok(ePhi < 1e-4 && eE < 1e-4 && eH < 1e-4, `coax: φ ${ePhi}, E ${eE}, H ${eH} (bar 1e-4)`);
    row('coax M=8 φ, E, H vs exact (>2 panels from copper)', `${ePhi.toExponential(1)} ${eE.toExponential(1)} ${eH.toExponential(1)}`, '1e-4');
    // Gauss and Ampère on circles between the conductors
    const Q = res.C[0][0];
    const flux = contour(src, ring((a + b) / 2), gauss(src));
    const amp = contour(hsrc, ring((a + b) / 2), ampere);
    t.ok(Math.abs(flux / Q - 1) < 1e-6 && Math.abs(amp - 1) < 1e-6, `coax Gauss ${flux / Q - 1}, Ampère ${amp - 1}`);
    row('coax Gauss (flux/Q − 1), Ampère (∮H/I − 1)', `${(flux / Q - 1).toExponential(1)} ${(amp - 1).toExponential(1)}`, '1e-6');
  }
  {
    const a = 0.5, Dc = 2.5, M = 8;
    const res = B.solveBoundary(wires(a, Dc), { M });
    const media = F.functionMedia([1], (x, z) => (Math.hypot(x + Dc / 2, z) < a ? -2 : Math.hypot(x - Dc / 2, z) < a ? -1 : 0));
    const src = F.electric(F.fieldModel(res, media), [1]);
    const d = Math.sqrt((Dc / 2) ** 2 - a * a);
    const lr = (x, z) => 0.5 * Math.log(((x - d) ** 2 + z * z) / ((x + d) ** 2 + z * z));
    const A = 0.5 / lr(-Dc / 2 + a, 0);
    const away = 2 * (2 * Math.PI * a) / (32 * M);
    let ePhi = 0, eE = 0;
    const o = [0, 0, 0];
    for (let i = 0; i < 41; i++) for (let j = 0; j < 21; j++) {
      const x = -2.5 + (5 * i) / 40, z = -1.5 + (3 * j) / 20;
      if (Math.hypot(x + Dc / 2, z) < a + away || Math.hypot(x - Dc / 2, z) < a + away) continue;
      F.evalField(src, x, z, o);
      const r1 = (x + d) ** 2 + z * z, r2 = (x - d) ** 2 + z * z;
      const ex = -1000 * A * ((x - d) / r2 - (x + d) / r1), ez = -1000 * A * (z / r2 - z / r1);
      ePhi = Math.max(ePhi, Math.abs(o[0] - (0.5 + A * lr(x, z))));
      eE = Math.max(eE, Math.hypot(o[1] - ex, o[2] - ez) / Math.hypot(ex, ez));
    }
    t.ok(ePhi < 1e-4 && eE < 1e-4, `two wires: φ ${ePhi}, E ${eE}`);
    row('two wires M=8 φ, E vs exact (>2 panels from copper)', `${ePhi.toExponential(1)} ${eE.toExponential(1)}`, '1e-4');
  }
  {
    // half-filled coax: Gauss across the interface against the exact C = 2π·ε0·(εr + 1)/2/ln(b/a)
    const a = 0.5, b = 2, er = 4.3;
    const res = B.solveBoundary(coaxHalf(a, b, er), { M: 4 });
    const media = F.functionMedia([1, er], (x, z) => { const r = Math.hypot(x, z); return r < a ? -2 : r > b ? -1 : z < 0 ? 1 : 0; });
    const src = F.electric(F.fieldModel(res, media), [1]);
    const flux = contour(src, ring(1.2), gauss(src));
    const exact = (2 * Math.PI * EPS0 * (er + 1)) / 2 / Math.log(b / a);
    const rel = Math.abs(flux / res.C[0][0] - 1), est = res.errC[0][0] / res.C[0][0];
    t.ok(rel <= Math.max(est, 1e-6), `half-filled coax Gauss ${rel} (estimate ${est})`);
    row('half-filled coax Gauss vs Q (solver est.), vs exact C', `${rel.toExponential(1)} ${Math.abs(flux / exact - 1).toExponential(1)}`, `est ${est.toExponential(1)}`);
  }

  T.push(['setups', now()]);
  // ---- multipole runs against kernels.ts panel by panel; Gauss, Ampère, φ in copper on the budget setups ----
  const C39 = SU.defaultSetup();
  const CPW = pairSetup('pair-cpw', 0.1, 0.15, 0.3);
  for (const [name, setup, drives] of [['C39 microstrip + mask', C39, [[1]]], ['pair + mask + coplanar ground', CPW, [[1, -1], [1, 1], [1, 0]]]]) {
    const { sec, r, model } = setupModel(setup);
    if (!t.ok(typeof model !== 'string', `${name}: ${model}`)) continue;
    const n = model.signals;
    for (const V of drives) {
      const src = F.electric(model, V);
      // multipole against direct sums
      const p = model.mesh;
      let worst = 0;
      const o = [0, 0, 0];
      const v = F.sectionView(sec, 41);
      for (let i = 0; i < v.nx; i += 2) for (let j = 0; j < v.ny; j++) {
        const x = v.x0 + ((v.x1 - v.x0) * i) / (v.nx - 1), z = v.z0 + ((v.z1 - v.z0) * j) / (v.ny - 1);
        if (F.classify(model.media, x, z) < 0) continue;
        F.evalField(src, x, z, o, 0);
        const Z = model.flip ? model.zShift - z : z - model.zShift;
        let ph = 0, gx = 0, gz = 0;
        for (let k = 0; k < p.n; k++) {
          ph += src.s[k] * K.panelPot(model.kernel, p, k, x, Z, false);
          gx += src.s[k] * K.panelDn(model.kernel, p, k, x, Z, 1, 0, false);
          gz += src.s[k] * K.panelDn(model.kernel, p, k, x, Z, 0, 1, false);
        }
        const ex = -1000 * gx, ez = -1000 * gz * (model.flip ? -1 : 1);
        worst = Math.max(worst, Math.abs(o[0] - ph - src.V0), Math.hypot(o[1] - ex, o[2] - ez) / Math.max(Math.hypot(ex, ez), 1));
      }
      t.ok(worst < 1e-6, `${name} V ${V}: multipole vs direct ${worst}`);
      if (V === drives[0]) row(`${name}: runs by multipole vs every panel (max)`, worst.toExponential(1), '1e-6');
      // Gauss around each signal conductor; φ inside it
      const Cm = r.bem.C, eC = r.bem.errC;
      for (const c of sec.conductors.filter((c) => c.id > 0)) {
        const bb = bboxOf(c.pts), m = name.startsWith('C39') ? 0.04 : 0.05;
        const flux = contour(src, box(bb.x0 - m, bb.z0 - m, bb.x1 + m, bb.z1 + m), gauss(src));
        let Q = 0, eq = 0;
        for (let s = 0; s < n; s++) { Q += Cm[c.id - 1][s] * V[s]; eq += eC[c.id - 1][s] * Math.abs(V[s]); }
        const rel = Math.abs(flux - Q) / Math.abs(Q), est = eq / Math.abs(Q);
        t.ok(rel <= Math.max(est, 1e-5), `${name} V ${V} line ${c.id}: Gauss ${rel} (estimate ${est})`);
        if (V === drives[0]) row(`${name}: Gauss line ${c.id} |flux − Q|/Q (solver est.)`, rel.toExponential(1), `est ${est.toExponential(1)}`);
        // φ inside the copper (not masked) against its potential
        let dphi = 0;
        for (const [fx, fz] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
          F.evalField(src, bb.x0 + fx * (bb.x1 - bb.x0), bb.z0 + fz * (bb.z1 - bb.z0), o, 0);
          dphi = Math.max(dphi, Math.abs(o[0] - V[c.id - 1]));
        }
        const scale = Math.max(...V.map(Math.abs));
        t.ok(dphi <= Math.max(est, 1e-5) * scale, `${name} V ${V} line ${c.id}: φ in copper off by ${dphi} (estimate ${est})`);
        if (V === drives[0]) row(`${name}: φ inside line ${c.id} − V (solver est.)`, dphi.toExponential(1), `est ${est.toExponential(1)}`);
      }
    }
    // Ampère for each line's current
    for (let k = 1; k <= n; k++) {
      const I = Array.from({ length: n }, (_, i) => (i === k - 1 ? 1 : 0));
      const hs = F.magnetic(model, I);
      const c = sec.conductors.find((c) => c.id === k), bb = bboxOf(c.pts), m = name.startsWith('C39') ? 0.04 : 0.05;
      const amp = contour(hs, box(bb.x0 - m, bb.z0 - m, bb.x1 + m, bb.z1 + m), ampere);
      const asym = r.bem.levels[r.bem.levels.length - 1].asym;
      t.ok(Math.abs(amp - 1) <= Math.max(2 * asym, 1e-6), `${name} line ${k}: Ampère ${amp - 1} (asym ${asym})`);
      if (k === 1) row(`${name}: Ampère ∮H/I − 1 (C0's asymmetry)`, (amp - 1).toExponential(1), `${Math.max(2 * asym, 1e-6).toExponential(1)}`);
      // surface current sums to the current
      const sf = F.surface(hs);
      t.ok(Math.abs(sf.total[k] - 1) <= Math.max(2 * asym, 1e-9), `${name} line ${k}: Σ J_s·dl = ${sf.total[k]}`);
    }
    // free surface charge sums to C·V
    const sf = F.surface(F.electric(model, drives[0]));
    for (let k = 1; k <= n; k++) {
      let Q = 0;
      for (let s = 0; s < n; s++) Q += r.bem.levels[r.bem.levels.length - 1].C[(k - 1) * n + s] * drives[0][s];
      t.ok(Math.abs(sf.total[k] - Q) <= 1e-6 * Math.abs(Q), `${name}: Σ σ·dl on line ${k} ${sf.total[k]} vs ${Q}`);
    }
  }

  T.push(['budgets', now()]);
  // ---- budgets: grids for a 1440 px wide view, equipotentials, field lines ----
  const budget = [];
  for (const [name, setup, V] of [['microstrip + mask (C39)', C39, [1]], ['pair + mask + coplanar ground, odd', CPW, [1, -1]]]) {
    const { sec, model } = setupModel(setup);
    for (const nx of [721, 1441]) {
      const view = F.sectionView(sec, nx);
      const reps = nx === 721 ? 5 : 2;
      let first = Infinity, full = Infinity, cont = Infinity, lines = Infinity, g, nl = 0, evals = 0;
      for (let rep = 0; rep < reps; rep++) {
        const t0 = now();
        const src = F.electric(model, V);
        const gen = F.fieldGrid(src, view);
        gen.next();
        const t1 = now();
        let s;
        do s = gen.next(); while (!s.done);
        g = s.value;
        const t2 = now();
        const cs = FL.contours(g, FL.levelsBetween(Math.min(0, ...V), Math.max(...V), 10));
        const t3 = now();
        const fl = FL.fieldLines(src, { view, count: 24 });
        const t4 = now();
        first = Math.min(first, t1 - t0); full = Math.min(full, t2 - t0); cont = Math.min(cont, t3 - t2); lines = Math.min(lines, t4 - t3);
        nl = fl.lines.length; evals = g.evaluated;
        void cs;
      }
      budget.push({ name, nx, ny: view.ny, first, full, cont, lines, nl, evals, panels: model.mesh.n });
      if (nx === 721) {
        t.ok(first <= 50, `${name}: first picture ${first.toFixed(1)} ms (budget 50)`);
        t.ok(full + cont + lines <= 300, `${name}: full map ${(full + cont + lines).toFixed(1)} ms (budget 300)`);
        // the grid against direct evaluation; equipotentials on their level; field lines downhill
        const src = F.electric(model, V);
        const o = [0, 0, 0];
        const mag = F.magnitude(g);
        const top = CM.scaleOf(mag, 'linear', { cls: g.cls }).hi;
        let worstTop = 0, n1 = 0, nBad = 0;
        for (let k = 0; k < g.phi.length; k += 7) {
          if (g.cls[k] < 0) continue;
          const i = k % view.nx, j = Math.floor(k / view.nx);
          F.evalField(src, view.x0 + i * (view.x1 - view.x0) / (view.nx - 1), view.z0 + j * (view.z1 - view.z0) / (view.ny - 1), o, g.cls[k]);
          const e = Math.hypot(o[1] - g.fx[k], o[2] - g.fz[k]) / top;
          worstTop = Math.max(worstTop, e);
          n1++;
          if (e > 1 / 256) nBad++;
        }
        t.ok(nBad <= 1e-3 * n1, `${name}: grid points off by more than one colour step: ${nBad} of ${n1}`);
        row(`${name}: grid vs direct, max |ΔE|/scale top; > 1/256`, `${worstTop.toExponential(1)} ${nBad}/${n1}`, '≤ 0.1 %');
        const levels = FL.levelsBetween(Math.min(0, ...V), Math.max(...V), 10);
        let worstC = 0;
        for (const c of FL.contours(g, levels)) for (let k = 0; k < c.segs.length; k += 4 * 13) {
          const cl = F.evalField(src, (c.segs[k] + c.segs[k + 2]) / 2, (c.segs[k + 1] + c.segs[k + 3]) / 2, o);
          if (cl >= 0) worstC = Math.max(worstC, Math.abs(o[0] - c.level));
        }
        t.ok(worstC < 5e-3, `${name}: equipotential off its level by ${worstC} V`);
        row(`${name}: equipotentials, max |φ − level| (V)`, worstC.toExponential(1), '5e-3');
        const fl = FL.fieldLines(src, { view, count: 24 });
        let up = 0, ends = 0;
        for (const ln of fl.lines) {
          let prev = Infinity;
          for (let k = 2; k < ln.length; k += 2) {
            const cl = F.evalField(src, ln[k], ln[k + 1], o);
            if (cl < 0) break;
            if (o[0] > prev + 1e-6) up++;
            prev = o[0];
          }
          const ex = ln[ln.length - 2], ez = ln[ln.length - 1];
          const tol = 1e-6 * (view.x1 - view.x0), edge = Math.abs(ex - view.x0) < tol || Math.abs(ex - view.x1) < tol || Math.abs(ez - view.z0) < tol || Math.abs(ez - view.z1) < tol;
          const cu = F.classify(model.media, ex + 1e-7 * 0, ez) < 0 || F.classify(model.media, ex, ez - 1e-6) < 0 || F.classify(model.media, ex, ez + 1e-6) < 0 || F.classify(model.media, ex - 1e-6, ez) < 0 || F.classify(model.media, ex + 1e-6, ez) < 0;
          if (edge || cu) ends++;
        }
        t.ok(up === 0, `${name}: field lines going uphill at ${up} points`);
        t.ok(ends === fl.lines.length && fl.lines.length >= 20, `${name}: ${ends} of ${fl.lines.length} field lines end on copper or the view's edge`);
        row(`${name}: field lines (count, uphill steps, ended)`, `${fl.lines.length} ${up} ${ends}`, 'downhill');
      }
    }
  }

  T.push(['colours', now()]);
  // ---- H grid and the worker's partial path are in check-worker.mjs; colour maps ----
  {
    const gen = generate();
    const seq = CM.mapTable('sequential'), div = CM.mapTable('diverging');
    t.ok(gen.inGamut, 'colour maps: the OKLab lines stay in sRGB');
    t.ok(seq.every((v, i) => v === gen.sequential[i]) && div.every((v, i) => v === gen.diverging[i]), 'colour maps: the stored tables equal the generator');
    const lab = (tab, k, M = null) => {
      let rgb = [0, 1, 2].map((c) => fromSrgb(tab[3 * k + c] / 255));
      if (M) rgb = M.map((r) => Math.min(1, Math.max(0, r[0] * rgb[0] + r[1] * rgb[1] + r[2] * rgb[2])));
      return linearToOklab(...rgb);
    };
    const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    // uniformity: OKLab distance over every 32 entries against the mean (the bytes' rounding moves a step by up to ~3 %)
    const steps = [];
    for (let k = 0; k + 32 < 256; k += 32) steps.push(dE(lab(seq, k), lab(seq, k + 32)));
    const mean = steps.reduce((a, b) => a + b) / steps.length;
    const spread = Math.max(...steps.map((s) => Math.abs(s / mean - 1)));
    t.ok(spread < 0.04, `sequential map: OKLab steps (over 32 entries; 8-bit rounding included) vary by ${spread}`);
    // lightness monotone under normal vision and the three dichromacies (Machado et al. 2009, severity 1)
    const CVD = {
      none: null,
      protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
      deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
      tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
    };
    let mono = true, divOk = true, sym = 0, minPair = Infinity;
    for (const [, M] of Object.entries(CVD)) {
      for (let k = 0; k + 8 < 256; k += 8) if (!(lab(seq, k + 8, M)[0] > lab(seq, k, M)[0])) mono = false;
      for (let k = 0; k < 96; k++) minPair = Math.min(minPair, dE(lab(div, k, M), lab(div, 255 - k, M)));
      for (let k = 0; k < 128; k += 8) if (!(lab(div, k + 8 > 127 ? 127 : k + 8, M)[0] >= lab(div, k, M)[0] - 1e-9)) divOk = false;
    }
    for (let k = 0; k < 128; k++) sym = Math.max(sym, Math.abs(lab(div, k)[0] - lab(div, 255 - k)[0]));
    t.ok(mono, 'sequential map: lightness rises under normal vision and every dichromacy');
    t.ok(divOk && sym < 0.01 && minPair > 0.04, `diverging map: lightness to the centre ${divOk}, ±x lightness differ ≤ ${sym}, ±x apart ≥ ${minPair} (OKLab) for |x| ≥ 0.25 under every vision`);
    row('colour maps: OKLab step spread; diverging ±x min ΔE (all CVD)', `${spread.toExponential(1)} ${minPair.toFixed(3)}`, '0.04 / 0.04');
    // toRGBA: a ramp lands on the table, copper is transparent, rows flipped
    const vals = Float32Array.from({ length: 512 }, (_, i) => (i % 256) / 255);
    const cls = new Int16Array(512); cls[0] = -1;
    const rgba = CM.toRGBA(vals, 256, 2, CM.scaleOf(vals, 'linear', { clip: 1 }), { cls });
    t.ok(rgba[(256 + 0) * 4 + 3] === 0 && rgba[(256 + 255) * 4] === seq[255 * 3] && rgba[4 * 128 + 1] === seq[128 * 3 + 1], 'toRGBA: table entries, copper transparent, bottom row last');
  }

  T.push(['sheets', now()]);
  // ---- zero-thickness copper ----
  {
    const iss = S.stackupIssues((() => { const s = S.cloneStackup(SU.defaultSetup().stackup); s.layers.find((l) => l.kind === 'copper').t.v = 0; return s; })());
    const bad = iss.find((i) => i.level === 'error');
    t.ok(bad && /copper thickness/i.test(bad.message), `a setup with copper thickness 0 is refused with a reason: ${bad && bad.message}`);
    let worstH = 0, worstJ = 0;
    for (const [u, er] of [[0.5, 4.3], [1, 4.3], [2, 9.8], [5, 2.2], [1, 30]]) {
      const bd = sheetBoundary([{ a: -u / 2, b: u / 2, id: 1 }], er, true);
      const sheet = { ...bd, edges: bd.edges.map((e) => (e.cond < 0 ? e : P.sheetEdge(e.ax, e.az, e.bx, e.bz, e.cond, (e.bx - e.ax) > 0 ? er : 1, (e.bx - e.ax) > 0 ? 1 : er, e.grade, e.n, e.off))) };
      const rs = B.solveBoundary(sheet, { M: 2 }), rh = B.solveBoundary(bd, { M: 2 });
      const lv = rh.levels[rh.levels.length - 1];
      const Ch = sheetC(lv, 1, er, true)[0];
      worstH = Math.max(worstH, Math.abs(rs.C[0][0] / Ch - 1));
      const hj = CF.hjZero(u, er);
      worstJ = Math.max(worstJ, Math.abs(rs.single.z0 / hj.z0 - 1));
      // the fields see the sheet's free charge too
      const media = F.functionMedia([1, er], (x, z) => (z < 0 ? -1 : z < 1 ? 1 : 0));
      const sf = F.surface(F.electric(F.fieldModel(rs, media), [1]));
      t.ok(Math.abs(sf.total[1] / rs.C[0][0] - 1) < 1e-6, `sheet u ${u} εr ${er}: Σ σ·dl ${sf.total[1]} vs C ${rs.C[0][0]}`);
    }
    t.ok(worstH < 1e-9, `sheets: the solver's free charge against the harness's correction ${worstH}`);
    t.ok(worstJ < 0.003, `sheets: Z0 against Hammerstad–Jensen at t = 0 ${worstJ} (published 0.13 % + the estimate)`);
    row('sheets: solver vs harness correction; Z0 vs H–J t = 0', `${worstH.toExponential(1)} ${(100 * worstJ).toFixed(2)} %`, '1e-9 / 0.3 %');
  }

  T.push(['end', now()]);
  t.note(`Fields times (s): ${T.slice(0, -1).map(([n, v], i) => `${n} ${((T[i + 1][1] - v) / 1000).toFixed(1)}`).join(', ')}`);
  t.note(`Fields (M1.5):\n    ${'Check'.padEnd(58)} ${'value'.padStart(12)}   bar\n    ${rows.join('\n    ')}`);
  const fmt = (b) => `${b.name.padEnd(36)} ${String(b.nx).padStart(5)}×${String(b.ny).padEnd(4)} ${String(b.panels).padStart(6)} ${String(b.evals).padStart(7)} ${b.first.toFixed(1).padStart(7)} ${b.full.toFixed(1).padStart(7)} ${b.cont.toFixed(1).padStart(6)} ${b.lines.toFixed(1).padStart(6)} (${b.nl})`;
  t.note(`Field-map budgets (Node, best of 5 / 2; a 1440 px wide view at 2 px and 1 px per point; budget first ≤ 50 ms, full ≤ 300 ms at 2 px):\n    ${'Case'.padEnd(36)} ${'grid'.padStart(10)} ${'panels'.padStart(6)} ${'evals'.padStart(7)} ${'first'.padStart(7)} ${'grid'.padStart(7)} ${'equi'.padStart(6)} ${'lines'.padStart(6)}\n    ${budget.map(fmt).join('\n    ')}`);
}
