// The full-wave solver's mesh, materials, ports, CPML and estimator (step M6.1, lib/emsim/fdtd/) against
// docs/em-sim/fullwave.md §2–§6, §11: on every trace kind of the default stackup, the C44 via, the C45 pair, a
// backdrilled via, JLCPCB stackups of 4 and 8 layers and seeded random cases. Per case: neighbour ratio ≤ 1.3, the
// smallest cell ≥ 20 µm and none above λ/15; every copper edge, face and sheet and every dielectric interface on a
// mesh line (or, an interface closer than 20 µm to copper, averaged); the count rules (4 across a trace or the
// dielectric under it, 3 across a gap, 2 across other layers) or proof that the ratio and the smallest cell forbid
// them; the barrel block's uniform d/6 cells; Δt by the Courant formula; the CPML's 8 cells and profile; ports and
// feeds; edge εr by direct integration of the model's columns; PEC and conformal fractions by sampling the copper;
// the estimator's memory within 10 % of the allocated bytes; the refusal rules; the f64 reference kernel's energy.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as S0 from '../../../lib/emsim/stackup.ts';
import * as P0 from '../../../lib/emsim/presets.ts';
import * as T0 from '../../../lib/emsim/structure.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as J0 from '../../../lib/emsim/jlcpcb.ts';
import * as Su0 from '../../../lib/emsim/setup.ts';
import * as M0 from '../../../lib/emsim/fdtd/model.ts';
import * as Me0 from '../../../lib/emsim/fdtd/mesh.ts';
import * as Pr0 from '../../../lib/emsim/fdtd/problem.ts';
import * as E0 from '../../../lib/emsim/fdtd/estimate.ts';
import * as R0 from '../../../lib/emsim/fdtd/ref.ts';
import { mulberry32 } from './check-geometry.mjs';

const d = (m) => m.default ?? m;
const S = d(S0), P = d(P0), T = d(T0), V = d(V0), J = d(J0), Su = d(Su0), M = d(M0), Me = d(Me0), Pr = d(Pr0), Es = d(E0), R = d(R0);
const LIB = join(dirname(fileURLToPath(import.meta.url)), '../../../lib/emsim');
const clone = (x) => JSON.parse(JSON.stringify(x));
const C0 = 299792458e3, ETA0 = 376.730313412, EPS0 = 1 / (ETA0 * 299792458);
const onLine = (L, c, tol = 1e-9) => { let lo = 0, hi = L.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= c) lo = m; else hi = m; } return Math.min(Math.abs(L[lo] - c), Math.abs(L[hi] - c)) <= tol; };
/** The thirds-rule lines of a trace x0…x1 when the model placed them (model.ts thirdsOf), else null. */
// a trace's true edges (a port's across) or its copper, inset by EDGE_INSET·h on each side (M6.4b)
const thirdsIn = (m, x0, x1) => {
  const hit = (th) => th && m.fixed.x.some((f) => f.why === 'trace edge (thirds rule)' && Math.abs(f.c - th.lines[1]) < 1e-12) ? th : null;
  const s = M.EDGE_INSET / (M.TRACE_CELLS + 2 / 3), w = (x1 - x0) / (1 - 2 * s), d = s * w;
  return hit(M.thirdsOf(x0, x1)) ?? hit(M.thirdsOf(x0 - d, x1 + d));
};
const grid = (L) => { const g = new Float64Array(L.length + 1); g.set(L, 1); g[0] = 2 * L[0] - L[1]; return g; };

// ---- independent material integration: a column's pieces, air between ----
function zInt(pieces, za, zb) {
  let er = 0, inv = 0, cov = 0;
  for (const p of pieces) { const o = Math.min(zb, p.z1) - Math.max(za, p.z0); if (o > 0) { er += o * p.er; inv += o / p.er; cov += o; } }
  const air = zb - za - cov;
  return { mean: (er + air) / (zb - za), harm: (zb - za) / (inv + air) };
}

function checkAxis(t, name, a, k, hmax) {
  const L = a.lines;
  let worst = 1, mn = Infinity, mx = 0;
  for (let i = 1; i < L.length; i++) {
    const c = L[i] - L[i - 1];
    mn = Math.min(mn, c); mx = Math.max(mx, c);
    if (i + 1 < L.length) { const c1 = L[i + 1] - L[i]; worst = Math.max(worst, c / c1, c1 / c); }
  }
  t.ok(worst <= M.RATIO + 1e-9, () => `${name} ${k}: neighbour ratio ${worst.toFixed(4)} over ${M.RATIO}`);
  t.ok(mn >= M.HMIN - 1e-9, () => `${name} ${k}: smallest cell ${mn} under ${M.HMIN}`);
  t.ok(mx <= hmax * (1 + 1e-9), () => `${name} ${k}: largest cell ${mx} over λ/15 = ${hmax}`);
  t.eq(a.moved.length, 0, `${name} ${k}: no copper line moved`);
  return { worst, mn };
}

/** Whether n cells in [HMIN, cap], each within RATIO of its neighbours and of the end cells cL, cR, can fill G: the
 *  least and largest sequences are the chains from the ends and the bounds (a cell's interval [lo, hi] narrowed by its
 *  neighbours' until nothing changes). */
function feasible(n, cL, cR, G, cap) {
  const r = M.RATIO, lo = new Array(n).fill(M.HMIN), hi = new Array(n).fill(cap);
  for (let it = 0; it < 4 * n + 4; it++) for (let j = 0; j < n; j++) {
    const nb = [j === 0 ? cL : null, j === n - 1 ? cR : null];
    const left = j > 0 ? [lo[j - 1], hi[j - 1]] : nb[0] ? [nb[0], nb[0]] : null, right = j < n - 1 ? [lo[j + 1], hi[j + 1]] : nb[1] ? [nb[1], nb[1]] : null;
    for (const q of [left, right]) if (q) { lo[j] = Math.max(lo[j], q[0] / r); hi[j] = Math.min(hi[j], q[1] * r); }
  }
  const smin = lo.reduce((a, x) => a + x, 0), smax = hi.reduce((a, x) => a + x, 0);
  return lo.every((x, j) => x <= hi[j] * (1 + 1e-12)) && smin <= G * (1 + 1e-12) && smax >= G * (1 - 1e-12);
}

function checkCase(t, name, setup, kind, opt, stats) {
  const b = Pr.buildProblem(setup, kind, opt);
  const errs = b.notes.filter((n) => n.level === 'error');
  if (!t.ok(b.ok && errs.length === 0 && b.mesh, () => `${name}: built (${b.notes.map((n) => n.message).join(' | ')})`)) return null;
  const { model: m, mesh, est } = b;
  const ax = { x: mesh.x, y: mesh.y, z: mesh.z };
  for (const k of ['x', 'y', 'z']) checkAxis(t, name, ax[k], k, m.hmax);
  t.near(m.hmax, C0 / ((0.877 / m.trMin) * Math.sqrt(m.erMax)) / 15, `${name}: λ/15 at f_hi = 0.877/tr_min in εr ${m.erMax}`, 1e-12);
  // copper on lines
  let edges = 0;
  for (const c of m.cu) {
    for (const sh of c.shapes) if (sh.k === 'rect') {
      // a trace's edges by the thirds rule (M6.2b): its lines h/3 inside and 2h/3 outside instead of the edge
      const th = thirdsIn(m, sh.x0, sh.x1);
      for (const [k, v] of [['x', sh.x0], ['x', sh.x1], ['y', sh.y0], ['y', sh.y1]]) {
        if (!Number.isFinite(v) || v < m.extent[k][0] || v > m.extent[k][1]) continue;
        edges++;
        if (th && k === 'x') t.ok(th.lines.every((x) => onLine(ax.x.lines, x)), () => `${name}: ${c.id} trace edge ${v}: thirds-rule lines ${th.lines.map((x) => x.toFixed(4))} on mesh lines`);
        else t.ok(onLine(ax[k].lines, v), () => `${name}: ${c.id} copper edge ${k} = ${v} on a mesh line`);
      }
    }
    const has = c.plane || c.shapes.length || m.cyl.some((y) => y.z0 <= c.zb + 1e-9 && y.z1 >= c.zt - 1e-9);
    if (!has) continue;
    if (c.sheet) t.ok(onLine(mesh.z.lines, c.z), `${name}: ${c.id} sheet on a z line`);
    else t.ok(onLine(mesh.z.lines, c.zb) && onLine(mesh.z.lines, c.zt), `${name}: ${c.id} faces on z lines`);
  }
  for (const y of m.cyl) t.ok(onLine(mesh.z.lines, y.z0) && onLine(mesh.z.lines, y.z1), `${name}: ${y.name} ends on z lines`);
  const zFixed = mesh.z.fixed;
  void zFixed;
  for (const dl of m.dielectric) for (const zz of [dl.z0, dl.z1]) {
    const sheet = m.cu.find((c) => c.sheet && (Math.abs(zz - c.zb) < 1e-12 || Math.abs(zz - c.zt) < 1e-12));
    const ze = sheet ? sheet.z : zz; // a sheet's halves take the neighbours' εr: the interface is its plane
    const ok = onLine(mesh.z.lines, ze) || [...zFixed].some((f) => Math.abs(f - ze) < M.HMIN);
    t.ok(ok, () => `${name}: ${dl.id} interface ${ze} on a line or averaged (within ${M.HMIN} mm of a fixed line)`);
  }
  // count rules
  for (const k of ['x', 'y', 'z']) for (const sp of m.spans[k]) {
    const L = ax[k].lines;
    let n = 0;
    for (let i = 1; i < L.length; i++) if (L[i - 1] >= sp.a - 1e-9 && L[i] <= sp.b + 1e-9) n++;
    if (n >= sp.n) { t.ok(true, ''); continue; }
    const relaxed = ax[k].gaps.filter((g) => g.a >= sp.a - 1e-9 && g.b <= sp.b + 1e-9 && g.relaxed);
    let proven = relaxed.length > 0;
    for (const g of relaxed) {
      const i0 = L.findIndex((x) => Math.abs(x - g.a) < 1e-9), i1 = L.findIndex((x) => Math.abs(x - g.b) < 1e-9);
      const cL = L[i0] - L[i0 - 1], cR = L[i1 + 1] - L[i1];
      if (feasible(g.nmin, cL, cR, g.b - g.a, g.cap)) proven = false;
    }
    t.ok(proven && b.notes.some((q) => q.code === 'cells'), () => `${name} ${k}: ${n} cells ${sp.why} (${sp.a.toFixed(4)}…${sp.b.toFixed(4)}), wanted ${sp.n}, not proven impossible`);
    stats.relaxed.add(`${name}: ${n} cells ${sp.why} of ${(sp.b - sp.a).toFixed(4)} mm`);
  }
  // barrel blocks
  for (const k of ['x', 'y']) for (const bl of m.blocks[k]) {
    t.ok(bl.h <= m.drill / M.BARREL_CELLS + 1e-12 || bl.h === M.HMIN, `${name}: block cell ≤ d/6`);
    const L = ax[k].lines;
    let ok = true;
    for (let i = 1; i < L.length; i++) if (L[i - 1] >= bl.lo - 1e-9 && L[i] <= bl.hi + 1e-9 && Math.abs(L[i] - L[i - 1] - bl.h) > 1e-9) ok = false;
    t.ok(ok, `${name} ${k}: the barrel block's cells all ${bl.h.toFixed(4)} mm`);
    t.ok(onLine(L, bl.lo) && onLine(L, bl.hi), `${name} ${k}: block ends on lines`);
  }
  // Courant
  const mins = ['x', 'y', 'z'].map((k) => { const L = ax[k].lines; let c = Infinity; for (let i = 1; i < L.length; i++) c = Math.min(c, L[i] - L[i - 1]); return c; });
  t.near(est.dt, 0.95 / (C0 * Math.sqrt(mins.reduce((a, c) => a + 1 / (c * c), 0))), `${name}: Δt by the Courant formula`, 1e-12);
  // CPML cells and the ports' distance to it
  for (const k of ['x', 'y', 'z']) {
    const a = ax[k], L = a.lines;
    if (!m.open[k]) { t.eq(a.cpml, 0, `${name} ${k}: closed`); continue; }
    t.eq(a.cpml, 8, `${name} ${k}: 8 CPML cells`);
    const c0 = L[9] - L[8], c1 = L[L.length - 9] - L[L.length - 10];
    let ok = true;
    for (let i = 1; i <= 8; i++) if (Math.abs(L[i] - L[i - 1] - c0) > 1e-9 || Math.abs(L[L.length - i] - L[L.length - i - 1] - c1) > 1e-9) ok = false;
    t.ok(ok, `${name} ${k}: CPML cells continue the last cell`);
  }
  // steps
  const tau = (2 * m.path.reduce((a, p) => a + p.len * Math.sqrt(p.er), 0)) / C0;
  const sigma = 3.717 / (2 * Math.PI * (1.52 / m.trMin));
  t.eq(est.steps, Math.ceil((10 * sigma + 3 * tau) / est.dt), `${name}: steps = (10σ + 3τrt)/Δt`);
  // ports
  for (const p of m.ports) {
    const along = p.axis === 'y' ? mesh.y.lines : mesh.x.lines, across = p.axis === 'y' ? mesh.x.lines : mesh.y.lines;
    const th = p.axis === 'y' ? thirdsIn(m, p.across[0], p.across[1]) : null;
    t.ok(onLine(along, p.pos) && (th ? th.lines.every((x) => onLine(across, x)) : onLine(across, p.across[0]) && onLine(across, p.across[1])), `${name} ${p.name}: port end and trace edges (or their thirds-rule lines) on lines`);
    t.ok(onLine(mesh.z.lines, p.zSig) && (p.ref.kind !== 'plane' || onLine(mesh.z.lines, p.ref.z)), `${name} ${p.name}: trace face and plane face on z lines`);
    for (const pl of p.planes) t.ok(onLine(along, pl), `${name} ${p.name}: measurement plane ${pl.toFixed(4)} on a line`);
    const h = p.ref.kind === 'plane' ? Math.abs(p.zSig - p.ref.z) : 0;
    if (kind === 'via') t.ok(p.feed >= Math.max(1.5, 10 * h, 5 * setup.trace.w.v) - 1e-12, `${name} ${p.name}: L ≥ max(1.5 mm, 10h, 5w)`);
    t.near(Math.abs(p.planes[0] - p.pos), p.feed / 3, `${name} ${p.name}: first plane L/3 from the port`, 1e-9);
    t.near(Math.abs(p.planes[1] - p.pos), (2 * p.feed) / 3, `${name} ${p.name}: second plane 2L/3 from the port`, 1e-9);
    if (m.open[p.axis]) {
      const a = p.axis === 'y' ? mesh.y : mesh.x, L = a.lines;
      const nLo = L.filter((x) => x > L[8] + 1e-12 && x <= p.pos + 1e-12).length, nHi = L.filter((x) => x >= p.pos - 1e-12 && x < L[L.length - 9] - 1e-12).length;
      t.ok(Math.min(nLo, nHi) >= 5, () => `${name} ${p.name}: ${Math.min(nLo, nHi)} cells to the CPML`);
    }
  }
  // memory and allocation
  const pb = b.problem;
  if (pb) {
    const alloc = Pr.allocatedBytes(pb);
    const ratio = est.memory.total / alloc;
    t.ok(Math.abs(ratio - 1) <= 0.1, () => `${name}: estimated ${est.memory.total} B vs allocated ${alloc} B`);
    stats.worstRatio = Math.max(stats.worstRatio, Math.abs(ratio - 1));
    checkPorts(t, name, pb);
    checkCpml(t, name, pb);
    checkMaterials(t, name, pb, stats);
    return { b, ratio };
  }
  return { b, ratio: NaN };
}

function checkPorts(t, name, pb) {
  const { N } = pb;
  const dt = pb.dt;
  for (const q of pb.ports) {
    t.near(q.R, q.spec.z0 * q.paths, `${name} ${q.spec.name}: R = Z0 · paths`, 1e-12);
    const h = q.spec.ref.kind === 'plane' ? Math.abs(q.spec.zSig - q.spec.ref.z) : NaN;
    if (q.spec.ref.kind === 'plane') t.near(q.len, h, `${name} ${q.spec.name}: path from the plane to the trace`, 1e-9);
    // every edge the coefficients a lumped source gives (εr from CB with the source's a taken out)
    let worst = 0;
    for (let e = 0; e < q.edges.length; e++) {
      const idx = q.edges[e], a = q.aR[e];
      const aT = (1 - pb.mat.ca[idx]) / (1 + pb.mat.ca[idx]);
      const er = 1 / (pb.mat.cb[idx] * (1 + aT));
      const comp = Math.floor(idx / N), c = idx % N, i = c % pb.nx, j = Math.floor(c / pb.nx) % pb.ny, k = Math.floor(c / (pb.nx * pb.ny));
      const dd = (g, n) => (g[n + 1] - g[n - 1]) / 2;
      const dA = comp === 2 ? dd(pb.gx, i) * dd(pb.gy, j) : comp === 0 ? dd(pb.gy, j) * dd(pb.gz, k) : dd(pb.gx, i) * dd(pb.gz, k);
      const want = (dt * q.len * 1e-3) / (2 * EPS0 * er * q.R * dA * 1e-6);
      worst = Math.max(worst, Math.abs(a - want) / want);
    }
    t.ok(worst < 1e-5, () => `${name} ${q.spec.name}: a_R = Δt·ℓ/(2ε0εr·R·dA), worst ${worst}`);
    t.eq(q.v.length, 4, `${name} ${q.spec.name}: v at two lines of each plane`);
    t.ok(q.i.every((pr) => pr.idx.length >= 4), `${name} ${q.spec.name}: a current loop per plane`);
  }
}

function checkCpml(t, name, pb) {
  const c = pb.cpml;
  for (const k of ['x', 'y', 'z']) {
    const a = c[k];
    if (!a.cells) continue;
    const g = k === 'x' ? pb.gx : k === 'y' ? pb.gy : pb.gz, n = g.length;
    let worst = 0;
    for (let i = 1; i < n; i++) {
      for (const [pos, rho, sig, kap, alp] of [[g[i], a.depthE[i], a.sig0E[i], a.kapE[i], a.alpE[i]], [i < n - 1 ? (g[i] + g[i + 1]) / 2 : NaN, a.depthH[i], a.sig0H[i], a.kapH[i], a.alpH[i]]]) {
        if (!Number.isFinite(pos)) continue;
        const inLo = pos < g[9] - 1e-12, inHi = pos > g[n - 9] + 1e-12;
        if (!inLo && !inHi) { if (rho !== -1 || kap !== 1 || sig !== 0) worst = Infinity; continue; }
        const r = inLo ? (g[9] - pos) / (g[9] - g[1]) : (pos - g[n - 9]) / (g[n - 1] - g[n - 9]);
        const D = (inLo ? g[2] - g[1] : g[n - 1] - g[n - 2]) * 1e-3;
        const smax = (0.8 * 4) / (ETA0 * D);
        worst = Math.max(worst, Math.abs(rho - r), Math.abs(sig - smax * r ** 3) / smax, Math.abs(kap - (1 + 3 * r ** 3)), Math.abs(alp - 0.05 * (1 - r)) / 0.05);
      }
    }
    t.ok(worst < 1e-9, () => `${name} ${k}: CPML profile σ = σmax ρ³, κ = 1 + 3ρ³, α = 0.05(1 − ρ), worst ${worst}`);
  }
  // one b, c entry per side table recomputed (x slab, E at a z node)
  if (c.x.cells) {
    const i = 3, kz = Math.floor(pb.nz / 2), er = c.erNode[kz];
    const sig = c.x.sig0E[i] / Math.sqrt(er), kap = c.x.kapE[i], alp = c.x.alpE[i];
    const bb = Math.exp(-(sig / kap + alp) * (pb.dt / EPS0)), cc = (sig * (bb - 1)) / (sig * kap + kap * kap * alp);
    t.near(c.coef[0][i + pb.nx * kz], bb, `${name}: CPML b with σmax/√εr of the layer`, 1e-6);
    t.near(c.coef[1][i + pb.nx * kz], cc, `${name}: CPML c`, 1e-5);
  }
}

function checkMaterials(t, name, pb, stats) {
  const m = pb.model, { nx, ny, nz, N, gx, gy, gz } = pb;
  const rnd = mulberry32(nx * 7 + ny * 13 + nz);
  const cols = new Map();
  let seen = new Set();
  const colOf = (v) => { seen.add(v); return cols.get(v) ?? cols.set(v, M.column(m, v)).get(v); };
  const portEdges = new Set(pb.ports.flatMap((q) => [...q.edges]));
  const cutAt = new Map(); pb.mat.cut.forEach((e, q) => cutAt.set(e, pb.mat.frac[q]));
  const copperAt = (x, y, z) => {
    for (const c of m.cu) if ((c.sheet ? Math.abs(z - c.z) < 1e-9 : z >= c.zb - 1e-9 && z <= c.zt + 1e-9) && M.inLayer(c, x, y, z)) return true;
    for (const c of m.cyl) if (z >= c.z0 - 1e-9 && z <= c.z1 + 1e-9 && Math.hypot(x - c.x, y - c.y) <= c.r + 1e-9) return true;
    return false;
  };
  let tight = 0, loose = 0, worstT = 0, worstL = 0, pecOk = 0, fracWorst = 0;
  const F = 16;
  for (let s = 0; s < 400; s++) {
    const comp = Math.floor(rnd() * 3);
    const i = 2 + Math.floor(rnd() * (nx - 4)), j = 2 + Math.floor(rnd() * (ny - 4)), k = 2 + Math.floor(rnd() * (nz - 4));
    const c = i + nx * (j + ny * k), idx = comp * N + c;
    // the edge's ends
    const p0 = [gx[i], gy[j], gz[k]], p1 = [...p0]; p1[comp] = [gx, gy, gz][comp][[i, j, k][comp] + 1];
    let inside = 0;
    const NS = 200;
    for (let q = 0; q < NS; q++) { const u = (q + 0.5) / NS; if (copperAt(p0[0] + u * (p1[0] - p0[0]), p0[1] + u * (p1[1] - p0[1]), p0[2] + u * (p1[2] - p0[2]))) inside++; }
    const isPec = pb.mat.cb[idx] === 0;
    const fCut = cutAt.get(idx);
    if (inside === NS) { t.ok(isPec || (fCut !== undefined && fCut < 1 / NS), () => `${name}: edge ${comp} (${i},${j},${k}) inside copper is PEC`); pecOk++; continue; }
    if (comp < 2 && inside > 0) {
      const f = cutAt.get(idx) ?? (isPec ? 0 : 1);
      fracWorst = Math.max(fracWorst, Math.abs(f - (1 - inside / NS)));
      t.ok(Math.abs(f - (1 - inside / NS)) < 0.01, () => `${name}: conformal fraction ${f} vs sampled ${1 - inside / NS}`);
      if (isPec) continue;
    }
    if (inside === 0) t.ok(!isPec && (fCut === undefined || fCut > 1 - 1 / NS), () => `${name}: edge ${comp} (${i},${j},${k}) outside copper is not PEC`);
    if (isPec || portEdges.has(idx)) continue;
    // εr by direct integration: dual face across, the edge along
    const dual = (g, n) => [(g[n - 1] + g[n]) / 2, (g[n] + g[n + 1]) / 2];
    let want;
    seen = new Set();
    if (comp === 2) {
      const [x0, x1] = dual(gx, i), [y0, y1] = dual(gy, j);
      let sum = 0;
      for (let a = 0; a < F; a++) for (let bq = 0; bq < F; bq++) sum += zInt(colOf(M.variantAt(m, x0 + ((a + 0.5) * (x1 - x0)) / F, y0 + ((bq + 0.5) * (y1 - y0)) / F)), gz[k], gz[k + 1]).harm;
      want = sum / (F * F);
    } else {
      const [z0, z1] = dual(gz, k);
      const ga = comp === 0 ? gx : gy, gb = comp === 0 ? gy : gx, na = comp === 0 ? i : j, nb = comp === 0 ? j : i;
      const [b0, b1] = dual(gb, nb);
      let sum = 0;
      for (let bq = 0; bq < F; bq++) {
        let inv = 0;
        for (let a = 0; a < F; a++) {
          const u = ga[na] + ((a + 0.5) * (ga[na + 1] - ga[na])) / F, w = b0 + ((bq + 0.5) * (b1 - b0)) / F;
          inv += 1 / zInt(colOf(comp === 0 ? M.variantAt(m, u, w) : M.variantAt(m, w, u)), z0, z1).mean;
        }
        sum += F / inv;
      }
      want = sum / F;
    }
    const aT = (1 - pb.mat.ca[idx]) / (1 + pb.mat.ca[idx]);
    const got = 1 / (pb.mat.cb[idx] * (1 + aT));
    const rel = Math.abs(got - want) / want;
    // uniform faces (one column variant over the face) must agree to f32; mixed ones to the 4 × 4 rule's sampling
    if (seen.size === 1) { tight++; worstT = Math.max(worstT, rel); t.ok(rel < 2e-6, () => `${name}: edge ${comp} (${i},${j},${k}) εr ${got} vs integrated ${want}`); }
    else { loose++; worstL = Math.max(worstL, rel); t.ok(rel < 0.03, () => `${name}: mixed edge ${comp} (${i},${j},${k}) εr ${got} vs integrated ${want}`); }
  }
  stats.epsTight = Math.max(stats.epsTight, worstT); stats.epsMixed = Math.max(stats.epsMixed, worstL); stats.frac = Math.max(stats.frac, fracWorst);
  stats.edges += tight + loose; stats.pec += pecOk;
}

function checkRefusals(t, base) {
  const e = base.est;
  const m = base.model;
  const lim = { drill: m.drill, hBarrel: m.blocks.x[0].h, thinnest: 0.06, hZ: 0.02 };
  let r = Es.verdicts(e, { backend: 'webgpu', maxBufferSize: 1024 }, lim);
  t.ok(r.verdicts.some((v) => v.level === 'refuse' && v.code === 'buffer' && /largest buffer/.test(v.message)), 'refused: a buffer over maxBufferSize, with its reason');
  r = Es.verdicts(e, { backend: 'webgpu', maxStorageBufferBindingSize: 1024 }, lim);
  t.ok(r.verdicts.some((v) => v.level === 'refuse' && v.code === 'binding'), 'refused: a binding over maxStorageBufferBindingSize');
  const big = { ...e, memory: { ...e.memory, total: 300 * Es.MiB } };
  t.ok(Es.verdicts(big, { backend: 'webgpu', mobile: true }, lim).verdicts.some((v) => v.code === 'memory'), 'refused: over 256 MiB on a phone (WebGPU)');
  t.ok(!Es.verdicts(big, { backend: 'webgpu' }, lim).verdicts.some((v) => v.code === 'memory'), 'not refused: 300 MiB under 1 GiB on a desktop GPU');
  t.ok(Es.verdicts({ ...e, memory: { ...e.memory, total: 310e6 } }, { backend: 'js', deviceMemory: 4 }, lim).verdicts.some((v) => v.code === 'memory'), 'refused: JavaScript over 300 MB with deviceMemory 4');
  t.ok(Es.verdicts({ ...e, memory: { ...e.memory, total: 1100 * Es.MiB } }, { backend: 'js' }, lim).verdicts.some((v) => v.code === 'memory'), 'refused: JavaScript over 1 GiB');
  const slow = { ...e, seconds: 600 };
  r = Es.verdicts(slow, { backend: 'js' }, lim);
  t.ok(r.verdicts.some((v) => v.level === 'warn' && v.code === 'time') && !r.verdicts.some((v) => v.level === 'refuse'), 'warned: 10 min');
  t.ok(r.offer && Math.abs(r.offer.seconds - 300) < 1e-6 && r.offer.limitedBy === '', () => `the offer reaches 5 min (${JSON.stringify(r.offer)})`);
  r = Es.verdicts({ ...e, seconds: 4000 }, { backend: 'js' }, lim);
  t.ok(r.verdicts.some((v) => v.level === 'refuse' && v.code === 'time'), 'refused: over 60 min');
  r = Es.verdicts({ ...e, seconds: 1e7 }, { backend: 'js' }, lim);
  t.ok(r.offer && r.offer.limitedBy !== '' && r.offer.s <= lim.drill / 4 / lim.hBarrel + 1e-12, () => `the offer stops at 4 cells per drill or 2 per dielectric (${JSON.stringify(r.offer)})`);
  t.ok(Es.verdicts(e, { backend: 'webgpu' }, lim).verdicts.length === 0, 'the C44 via passes on WebGPU');
  // an oversized case end to end: nothing allocated
  const su = Su.defaultSetup();
  const bb = Pr.buildProblem(su, 'via', { trMin: 3e-12, env: { backend: 'js', mobile: true }, rate: 1e7 }); // a phone at the × 4 throttle, §10
  t.ok(!bb.ok && bb.problem === null && ['memory', 'time'].every((c) => bb.verdicts.some((v) => v.level === 'refuse' && v.code === c)), () => `a 3 ps via in JavaScript on a phone is refused on memory and time before allocation (${bb.est?.cells} cells, ${(bb.est?.memory.total / 1e6).toFixed(0)} MB, ${(bb.est?.seconds / 60).toFixed(0)} min)`);
  return bb;
}

function checkRef(t, stats) {
  const su = Su.defaultSetup();
  const opt = { closed: true, precision: 'f64', loads: false, trMin: 300e-12, z0: [50, 50, 50, 50], eeff: [3, 3, 3, 3] };
  for (const [kind, len, tol] of [['trace', 1.0, 1e-10], ['via', undefined, 1e-10]]) { // conformal edges weighted by f (M6.2a, BL147)
    const b = Pr.buildProblem(su, kind, { ...opt, length: len });
    const p = b.problem;
    const k = new R.RefKernel(p, false);
    const rnd = mulberry32(99);
    let lossy = 0;
    for (let e = 0; e < p.E.length; e++) if (p.mat.cb[e] > 0) { if (p.mat.ca[e] !== 1) lossy++; p.E[e] = rnd() - 0.5; }
    t.eq(lossy, 0, `reference kernel, ${kind}: lossless`);
    k.run(1);
    const w0 = k.energy();
    let drift = 0;
    for (let s = 0; s < 10; s++) { k.run(30); drift = Math.max(drift, Math.abs(k.energy() - w0) / w0); }
    t.ok(Number.isFinite(drift) && drift < tol, () => `reference kernel, ${kind} (${p.mat.cut.length} conformal edges): energy drift ${drift} over 300 steps`);
    stats.energy[kind] = drift;
  }
  // with the source and the ports' resistors: finite, and the energy goes in
  const b = Pr.buildProblem(su, 'trace', { ...opt, loads: true, trMin: 100e-12, length: 1.0 });
  const k = new R.RefKernel(b.problem, true);
  k.run(300);
  const w = k.energy();
  t.ok(Number.isFinite(w) && w > 0, `reference kernel with a driven port: finite (${w.toExponential(3)})`);
}

export async function run(t) {
  const stats = { worstRatio: 0, epsTight: 0, epsMixed: 0, frac: 0, edges: 0, pec: 0, relaxed: new Set(), energy: {} };
  const rows = [];
  const add = (name, setup, kind, opt = {}) => {
    const r = checkCase(t, name, setup, kind, opt, stats);
    if (r && r.b.est) rows.push({ name, cells: r.b.est.cells, steps: r.b.est.steps, mb: r.b.est.memory.total / 1e6, ratio: r.ratio });
    return r;
  };
  const s0 = P.presetStackup(P.DEFAULT_PRESET);
  const base = Su.defaultSetup();
  for (const k of T.TRACE_KINDS) {
    const st = T.presetStructure(k.kind, s0, k.kind.startsWith('pair') ? 0.12 : 0.15);
    if (!st) continue;
    add(`trace ${k.kind}`, { ...base, trace: st }, 'trace');
  }
  const c44 = add('via C44', base, 'via');
  add('via C45 pair', { ...base, via: V.presetVia('pair', s0) }, 'via');
  const bd = clone(base.via);
  bd.exit = 'L3'; bd.feeds[1].layer = 'L3';
  bd.backdrill = { side: 'bottom', depth: S.val(0.3), d: S.val(0.5) };
  t.ok(V.viaIssues(s0, bd).filter((i) => i.level === 'error').length === 0, 'the backdrilled via is valid');
  add('via backdrilled', { ...base, via: bd }, 'via');
  // JLCPCB stackups: a 4-layer preset and an 8-layer entry of the list
  const s4 = P.presetStackup('JLC04161H-7628');
  const su4 = { stackup: s4, trace: T.presetStructure('microstrip', s4, 0.15), via: V.presetVia('single', s4) };
  add('JLC04161H-7628 microstrip', su4, 'trace');
  add('JLC04161H-7628 via', su4, 'via');
  const data = JSON.parse(readFileSync(join(LIB, 'jlcpcbStackups.json'), 'utf8'));
  const e8 = data.stackups.find((e) => e.layers === 8);
  if (t.ok(!!e8, 'an 8-layer JLCPCB stackup')) {
    const s8 = J.jlcStackup(e8, data);
    const su8 = { stackup: s8, trace: T.presetStructure('microstrip', s8, 0.12), via: V.presetVia('single', s8) };
    add(`${J.jlcKey(e8)} stripline`, { ...su8, trace: T.presetStructure('stripline', s8, 0.1) }, 'trace');
    add(`${J.jlcKey(e8)} via`, su8, 'via');
  }
  // seeded random cases (mesh, ports and estimate; R given so the 2D solver is not run)
  const rnd = mulberry32(6101);
  const z0 = { z0: [50, 50, 50, 50], eeff: [3, 3, 3, 3] };
  for (let n = 0; n < 14; n++) {
    const s = P.presetStackup(P.PRESET_IDS[Math.floor(rnd() * P.PRESET_IDS.length)]);
    const w = 0.08 + 0.3 * rnd();
    const tr = 20e-12 + 80e-12 * rnd();
    if (n % 2 === 0) {
      const kinds = T.TRACE_KINDS.map((k) => k.kind);
      const st = T.presetStructure(kinds[Math.floor(rnd() * kinds.length)], s, w);
      if (!st) continue;
      checkCase(t, `random trace ${n} (${st.kind}, ${s.id})`, { stackup: s, trace: st, via: V.presetVia('single', s) }, 'trace', { ...z0, trMin: tr, allocate: n < 6, length: 1 + 4 * rnd() }, stats);
    } else {
      const v = V.presetVia(rnd() < 0.5 ? 'single' : 'pair', s);
      if (!v || !v.planes.length) continue;
      v.drill = S.val(0.2 + 0.2 * rnd());
      for (const p of v.pads) if (p.d) p.d = S.val(v.drill.v + 0.15 + 0.2 * rnd());
      for (const a of v.antipads) a.d = S.val(Math.max(...v.pads.map((p) => p.d?.v ?? 0)) + 0.2 + 0.6 * rnd());
      if (V.viaIssues(s, v).some((i) => i.level === 'error')) continue;
      checkCase(t, `random via ${n} (${v.pitch ? 'pair' : 'single'}, ${s.id})`, { stackup: s, trace: T.presetStructure('microstrip', s, w), via: v }, 'via', { ...z0, trMin: tr, allocate: n < 6 }, stats);
    }
  }
  const big = checkRefusals(t, c44.b);
  checkRef(t, stats);
  t.note(`FDTD mesh: ${rows.length} presets; estimate/allocated worst ${(stats.worstRatio * 100).toFixed(3)} %; εr of ${stats.edges} sampled edges vs direct integration: uniform faces ${stats.epsTight.toExponential(1)}, mixed ${(stats.epsMixed * 100).toFixed(2)} %; conformal fractions vs sampling ${stats.frac.toFixed(4)}; ${stats.pec} edges inside copper PEC`);
  t.note(`FDTD mesh: reference kernel energy drift over 300 steps: trace ${stats.energy.trace?.toExponential(1)}, via with conformal edges (weighted by f) ${stats.energy.via?.toExponential(1)}; refused case (3 ps via, JavaScript, phone) ${big.est?.cells} cells, ${(big.est?.memory.total / 1e6).toFixed(0)} MB, ${(big.est?.seconds / 3600).toFixed(1)} h`);
  for (const r of stats.relaxed) t.note(`FDTD mesh: count rule yields to ratio and 20 µm: ${r}`);
  t.note('FDTD mesh presets (cells, steps, MB, estimate/allocated):\n' + rows.map((r) => `    ${r.name.padEnd(42)} ${String(r.cells).padStart(9)} ${String(r.steps).padStart(6)} ${r.mb.toFixed(1).padStart(7)} ${Number.isFinite(r.ratio) ? r.ratio.toFixed(4) : '-'}`).join('\n'));
}
