// Checks of the full-wave CPU time loop (step M6.2a): lib/emsim/fdtd/cpu.ts on boxes built here by hand (their own
// mesh, materials and conformal fractions, independent of materials.ts) and on problems of buildProblem.
// (a) energy W = Σ εr·f·V·Eⁿ·Eⁿ⁺¹ + Σ V·H̃² constant without sources over the C44 via's run length (7 645 steps), and
//     the fields bounded (|f·E|, |H̃|), in PEC boxes: vacuum, layered dielectric on a graded mesh, and that with a round
//     barrel (conformal edges); the loop against ref.ts step for step and the real C44 via (closed) over 300 steps
//     (EMSIM_FDTD_LONG=1: 7 645 steps);
// (b) the resonances of a PEC cavity (vacuum on cubes, then εr 4.3 on a graded mesh) from a pulse, by a windowed DFT
//     of a probe: against the Yee scheme's own dispersion relation (uniform mesh) and the exact frequencies within the
//     mesh's dispersion bound (k·h)²/24;
// (c) the CPML: a pulse in free space, a 20-cell box against a 100-cell one over the time the large box is clean;
// (d) f32 against f64, the stop and stability rules, and the time of one step per million cells.

import { performance } from 'node:perf_hooks';
import * as Su0 from '../../../lib/emsim/setup.ts';
import * as Pr0 from '../../../lib/emsim/fdtd/problem.ts';
import * as R0 from '../../../lib/emsim/fdtd/ref.ts';
import * as C0m from '../../../lib/emsim/fdtd/cpu.ts';
import * as Cp0 from '../../../lib/emsim/fdtd/cpml.ts';
import * as Me0 from '../../../lib/emsim/fdtd/mesh.ts';
import * as E0 from '../../../lib/emsim/fdtd/estimate.ts';
import { mulberry32 } from './check-geometry.mjs';

const d = (m) => m.default ?? m;
const Su = d(Su0), Pr = d(Pr0), R = d(R0), C = d(C0m), Cp = d(Cp0), Me = d(Me0), Es = d(E0);
const C0 = 299792458e3; // mm/s
const LONG = process.env.EMSIM_FDTD_LONG === '1';
const C44_STEPS = 7645; // the C44 via's run (notes-M6.1.md)

// ---------------------------------------------------------------- hand-made boxes

/** A box: interior cell sizes per axis (mm), CPML cells per side, εr layers in z ([z0, z1, er], air elsewhere), a
 *  round PEC barrel through the whole height ({ x, y, r } from the box's corner), the precision. */
function box({ dx, dy, dz, cpml = [0, 0, 0], layers = [], er = 1, cyl = null, precision = 'f64', courant = 1 }) {
  const A = precision === 'f64' ? Float64Array : Float32Array;
  const axis = (h, m) => {
    const cells = [...Array(m).fill(h[0]), ...h, ...Array(m).fill(h[h.length - 1])];
    const lines = new Float64Array(cells.length + 1);
    lines[0] = -m * h[0];
    for (let i = 0; i < cells.length; i++) lines[i + 1] = lines[i] + cells[i];
    return { lines, cpml: m };
  };
  const mesh = { x: axis(dx, cpml[0]), y: axis(dy, cpml[1]), z: axis(dz, cpml[2]) };
  const gx = Me.gridOf(mesh.x), gy = Me.gridOf(mesh.y), gz = Me.gridOf(mesh.z);
  const nx = gx.length, ny = gy.length, nz = gz.length, N = nx * ny * nz;
  const dt = courant * Es.courantDt(Math.min(...dx), Math.min(...dy), Math.min(...dz));
  const erZ = (z) => { for (const [a, b, e] of layers) if (z >= a && z < b) return e; return er; };
  const cpmlS = Cp.cpmlOf(mesh, dt, A, erZ);
  const lines = new A(2 * (nx + ny + nz));
  let o = 0;
  for (const [g, kap] of [[gx, cpmlS.x.kapE], [gy, cpmlS.y.kapE], [gz, cpmlS.z.kapE]]) {
    const n = g.length;
    for (let i = 0; i < n; i++) lines[o + i] = (C0 * dt) / ((i >= 1 && i <= n - 2 ? (g[i + 1] - g[i - 1]) / 2 : g[1] - g[0]) * kap[i]);
    o += n;
  }
  for (const [g, kap] of [[gx, cpmlS.x.kapH], [gy, cpmlS.y.kapH], [gz, cpmlS.z.kapH]]) {
    const n = g.length;
    for (let i = 0; i < n; i++) lines[o + i] = (C0 * dt) / ((i <= n - 2 ? g[i + 1] - g[i] : g[n - 1] - g[n - 2]) * kap[i]);
    o += n;
  }
  // εr: tangential edges on node plane k the thickness-weighted mean over the dual interval, z edges the harmonic mean
  const meanZ = (a, b, harm) => {
    const cuts = [a, b, ...layers.flatMap(([z0, z1]) => [z0, z1]).filter((z) => z > a && z < b)].sort((p, q) => p - q);
    let s = 0;
    for (let q = 0; q + 1 < cuts.length; q++) { const e = erZ((cuts[q] + cuts[q + 1]) / 2), w = cuts[q + 1] - cuts[q]; s += harm ? w / e : w * e; }
    return harm ? (b - a) / s : s / (b - a);
  };
  const ca = new A(3 * N), cb = new A(3 * N), cut = [], frac = [];
  const chord = (o, c, r, a, b) => { const h2 = r * r - (o - c) ** 2; if (h2 <= 0) return 0; const h = Math.sqrt(h2); return Math.max(0, Math.min(b, c + h) - Math.max(a, c - h)); };
  for (let k = 1; k < nz; k++) for (let j = 1; j < ny; j++) for (let i = 1; i < nx; i++) {
    const c = i + nx * (j + ny * k);
    const eT = k <= nz - 2 && k >= 2 ? meanZ((gz[k - 1] + gz[k]) / 2, (gz[k] + gz[k + 1]) / 2, false) : 1;
    const put = (e, val, f) => {
      if (f < 1e-9) return;
      ca[e] = 1; cb[e] = 1 / val;
      if (f < 1 - 1e-9) { cut.push(e); frac.push(f); }
    };
    if (i <= nx - 2 && j >= 2 && j <= ny - 2 && k >= 2 && k <= nz - 2) put(c, eT, cyl ? 1 - chord(gy[j], cyl.y, cyl.r, gx[i], gx[i + 1]) / (gx[i + 1] - gx[i]) : 1);
    if (i >= 2 && i <= nx - 2 && j <= ny - 2 && k >= 2 && k <= nz - 2) put(N + c, eT, cyl ? 1 - chord(gx[i], cyl.x, cyl.r, gy[j], gy[j + 1]) / (gy[j + 1] - gy[j]) : 1);
    if (i >= 2 && i <= nx - 2 && j >= 2 && j <= ny - 2 && k <= nz - 2) {
      const inside = cyl && Math.hypot(gx[i] - cyl.x, gy[j] - cyl.y) <= cyl.r;
      put(2 * N + c, meanZ(gz[k], gz[k + 1], true), inside ? 0 : 1);
    }
  }
  return {
    nx, ny, nz, N, gx, gy, gz, dt, lines, mesh,
    mat: { ca, cb, cut: Int32Array.from(cut), frac: Float64Array.from(frac), hcut: new Int32Array(0), harea: new Float64Array(0) },
    cpml: cpmlS, E: new A(3 * N), H: new A(3 * N),
  };
}
const idx = (b, comp, i, j, k) => comp * b.N + i + b.nx * (j + b.ny * k);
const randomE = (b, seed) => { const r = mulberry32(seed); for (let e = 0; e < b.E.length; e++) if (b.mat.cb[e] > 0) b.E[e] = r() - 0.5; };
const maxAbs = (a) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i])); return m; };
/** The largest |f·E| (f the conformal fraction, 1 on whole edges: the edge's voltage over its cell length) and |H̃|.
 *  E itself on a short edge is the field in a narrow gap and may be several times larger. */
const maxField = (b) => {
  let m = Math.max(maxAbs(b.H), 0);
  const f = new Float64Array(b.E.length).fill(1);
  b.mat.cut.forEach((e, q) => (f[e] = b.mat.frac[q]));
  for (let e = 0; e < b.E.length; e++) m = Math.max(m, Math.abs(f[e] * b.E[e]));
  return m;
};
const graded = (h0, h1, n) => { const out = []; for (let i = 0; i < n; i++) out.push(h0 + (h1 - h0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n))); return out; };

// ---------------------------------------------------------------- (a) energy

function energyRun(t, name, b, steps, stats) {
  randomE(b, 4711);
  const e0 = maxField(b);
  const L = new C.CpuLoop(b, { monitorEvery: 0 });
  const w0 = L.measure();
  let drift = 0;
  const every = Math.ceil(steps / 20);
  for (let s = 1; s < steps; s += every) { L.run(Math.min(every - 1, steps - 1 - s)); drift = Math.max(drift, Math.abs(L.measure() - w0) / w0); }
  const grow = maxField(b) / e0;
  t.ok(w0 > 0 && drift < 1e-11, () => `energy, ${name} (${b.mat.cut.length} conformal edges): drift ${drift} over ${L.step} steps`);
  t.ok(Number.isFinite(grow) && grow < 10, () => `energy, ${name}: max |f·E|, |H̃| ${grow}× the initial after ${L.step} steps`);
  stats.energy.push(`${name} ${drift.toExponential(1)} (${L.step} steps, ${b.mat.cut.length} cut edges, max |f·E|, |H̃| ×${grow.toFixed(2)})`);
}

function checkEnergy(t, stats) {
  const u = Array(22).fill(0.1);
  energyRun(t, 'vacuum box', box({ dx: u, dy: Array(18).fill(0.1), dz: Array(12).fill(0.1) }), C44_STEPS, stats);
  const zg = graded(0.03, 0.09, 14);
  const zt = zg.reduce((a, b) => a + b, 0);
  const layers = [[0, 0.3 * zt, 4.3], [0.3 * zt, 0.55 * zt, 3.6]];
  energyRun(t, 'layered εr 4.3/3.6, graded z', box({ dx: graded(0.06, 0.12, 22), dy: graded(0.07, 0.11, 18), dz: zg, layers }), C44_STEPS, stats);
  // a barrel of 0.3 mm on a 0.05 mm block (d/6), off the grid's symmetry
  const cyl = { x: 0.553, y: 0.517, r: 0.15 };
  const b3 = box({ dx: Array(22).fill(0.05), dy: Array(20).fill(0.05), dz: zg, layers, cyl });
  const fmin = Math.min(...b3.mat.frac);
  t.ok(b3.mat.cut.length > 20 && fmin < 0.1, () => `the barrel box has short conformal edges (${b3.mat.cut.length}, least f ${fmin})`);
  energyRun(t, 'layered with a barrel', b3, C44_STEPS, stats);
  // the loop against ref.ts on the real C44 via (closed): the same fields step for step
  const su = Su.defaultSetup();
  const opt = { closed: true, precision: 'f64', loads: false, trMin: 300e-12, z0: [50, 50, 50, 50], eeff: [3, 3, 3, 3] };
  const p1 = Pr.buildProblem(su, 'via', opt).problem, p2 = Pr.buildProblem(su, 'via', opt).problem;
  randomE(p1, 99); randomE(p2, 99);
  const rk = new R.RefKernel(p1, false), L = new C.CpuLoop(p2, { monitorEvery: 0 });
  rk.run(30); L.run(29);
  const wl = L.measure(), wr = rk.energy();
  let dmax = 0;
  for (let e = 0; e < p1.E.length; e++) dmax = Math.max(dmax, Math.abs(p1.E[e] - p2.E[e]));
  for (let e = 0; e < p1.H.length; e++) dmax = Math.max(dmax, Math.abs(p1.H[e] - p2.H[e]));
  t.eq(dmax, 0, 'the CPU loop and ref.ts give the same fields on the closed C44 via after 30 steps');
  t.ok(Math.abs(wl - wr) <= 1e-12 * wr, () => `the loop's energy sum equals ref.ts's (${wl} vs ${wr})`);
  energyRun(t, 'C44 via (closed)', p2, LONG ? C44_STEPS : 300, stats);
}

// ---------------------------------------------------------------- (b) cavity resonances

/** |windowed DTFT|² of a record (sample s at s·dt) at f. */
function power(x, w, dt, f) {
  let re = 0, im = 0;
  const a = 2 * Math.PI * f * dt, cr = Math.cos(a), sr = Math.sin(a);
  let c = 1, s = 0;
  for (let n = 0; n < x.length; n++) { const v = x[n] * w[n]; re += v * c; im -= v * s; const c1 = c * cr - s * sr; s = s * cr + c * sr; c = c1; }
  return re * re + im * im;
}
function peakNear(x, w, dt, f0, span) {
  let best = f0, bp = -1;
  for (let q = -40; q <= 40; q++) { const f = f0 * (1 + (span * q) / 40), p = power(x, w, dt, f); if (p > bp) { bp = p; best = f; } }
  let lo = best * (1 - span / 40), hi = best * (1 + span / 40);
  const g = (Math.sqrt(5) - 1) / 2;
  let a = hi - g * (hi - lo), b2 = lo + g * (hi - lo), pa = power(x, w, dt, a), pb = power(x, w, dt, b2);
  for (let it = 0; it < 40; it++) {
    if (pa > pb) { hi = b2; b2 = a; pb = pa; a = hi - g * (hi - lo); pa = power(x, w, dt, a); }
    else { lo = a; a = b2; pa = pb; b2 = lo + g * (hi - lo); pb = power(x, w, dt, b2); }
  }
  return (lo + hi) / 2;
}
const dgauss = (t0, sg) => (t) => { const u = (t - t0) / sg; return -u * Math.exp(-0.5 * u * u); };

/** Rings a PEC cavity from an Ez pulse and checks its TM modes (to z): Ez ∝ sin(mπx/a)·sin(nπy/b)·cos(pπz/d). */
function cavity(t, name, b, er, steps, fTop, uniform, stats, src, prb) {
  const a = b.gx[b.nx - 1] - b.gx[1], bb = b.gy[b.ny - 1] - b.gy[1], dd = b.gz[b.nz - 1] - b.gz[1];
  const pos = ([i, j, k]) => [b.gx[i] - b.gx[1], b.gy[j] - b.gy[1], (b.gz[k] + b.gz[k + 1]) / 2 - b.gz[1]];
  const sg = 3.717 / (2 * Math.PI * 1.6 * fTop);
  const L = new C.CpuLoop(b, { monitorEvery: 0, sources: [{ idx: Int32Array.of(idx(b, 2, ...src)), w: Float64Array.of(1), wave: dgauss(5 * sg, sg) }] });
  const pe = idx(b, 2, ...prb), rec = new Float64Array(steps);
  for (let s = 0; s < steps; s++) { L.run(1); rec[s] = b.E[pe]; }
  const win = Float64Array.from(rec, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (steps - 1)));
  const [xs, ys, zs] = pos(src), [xp, yp, zp] = pos(prb);
  const h = (g) => { let m = 0; for (let i = 1; i < g.length - 1; i++) m = Math.max(m, g[i + 1] - g[i]); return m; };
  const hmax = Math.max(h(b.gx), h(b.gy), h(b.gz));
  const modes = [];
  for (let m = 1; m < 8; m++) for (let n = 1; n < 8; n++) for (let p = 0; p < 8; p++) {
    const fx = (m / a) ** 2 + (n / bb) ** 2 + (p / dd) ** 2, f = (C0 / (2 * Math.sqrt(er))) * Math.sqrt(fx);
    if (f > fTop) continue;
    const amp = Math.sin((m * Math.PI * xs) / a) * Math.sin((n * Math.PI * ys) / bb) * Math.cos((p * Math.PI * zs) / dd) * Math.sin((m * Math.PI * xp) / a) * Math.sin((n * Math.PI * yp) / bb) * Math.cos((p * Math.PI * zp) / dd);
    let fd = NaN;
    if (uniform) { // Yee's cavity: (sin(ωΔt/2)/(vΔt))² = Σ (sin(k_a·h_a/2)/h_a)²
      const hx = b.gx[2] - b.gx[1], hy = b.gy[2] - b.gy[1], hz = b.gz[2] - b.gz[1], v = C0 / Math.sqrt(er);
      const S = Math.sin((m * Math.PI * hx) / (2 * a)) ** 2 / hx ** 2 + Math.sin((n * Math.PI * hy) / (2 * bb)) ** 2 / hy ** 2 + Math.sin((p * Math.PI * hz) / (2 * dd)) ** 2 / hz ** 2;
      fd = Math.asin(v * b.dt * Math.sqrt(S)) / (Math.PI * b.dt);
    }
    modes.push({ m, n, p, f, fd, amp: Math.abs(amp) });
  }
  const T = steps * b.dt;
  let worstD = 0, worstE = 0, used = 0;
  for (const md of modes) {
    if (md.amp < 0.05) continue; // weakly seen from the source and probe
    if (modes.some((o) => o !== md && o.amp > 0.1 * md.amp && Math.abs(o.f - md.f) < (uniform ? 5 : 3) / T)) continue; // not isolated
    const f0 = uniform ? md.fd : md.f;
    const fm = peakNear(rec, win, b.dt, f0, 2 / (T * f0));
    const k = (2 * Math.PI * md.f * Math.sqrt(er)) / C0, bar = (k * hmax) ** 2 / 24;
    const eE = Math.abs(fm - md.f) / md.f;
    used++;
    worstE = Math.max(worstE, eE / bar);
    t.ok(eE <= bar, () => `${name}: TM${md.m}${md.n}${md.p} at ${(fm / 1e9).toFixed(4)} GHz, exact ${(md.f / 1e9).toFixed(4)}: ${(eE * 100).toFixed(3)} % over (kh)²/24 = ${(bar * 100).toFixed(3)} %`);
    if (uniform) {
      const eD = Math.abs(fm - md.fd) / md.fd;
      worstD = Math.max(worstD, eD);
      t.ok(eD < 2e-5, () => `${name}: TM${md.m}${md.n}${md.p} at ${(fm / 1e9).toFixed(5)} GHz, Yee's relation ${(md.fd / 1e9).toFixed(5)}: ${eD.toExponential(2)}`);
    }
  }
  t.ok(used >= 6, () => `${name}: ${used} isolated modes found`);
  stats.cavity.push(`${name}: ${used} modes, error/((kh)²/24) worst ${worstE.toFixed(2)}${uniform ? `, against Yee's relation ${worstD.toExponential(1)}` : ''}`);
}

function checkCavities(t, stats) {
  // 11.5 × 8.5 × 5.5 mm on 0.5 mm cubes, vacuum (sides without a common factor: few degenerate modes)
  const b1 = box({ dx: Array(23).fill(0.5), dy: Array(17).fill(0.5), dz: Array(11).fill(0.5) });
  cavity(t, 'vacuum cavity 11.5 × 8.5 × 5.5 mm, 0.5 mm cubes', b1, 1, 16384, 50e9, true, stats, [6, 5, 3], [17, 12, 8]);
  // 6 × 4.5 × 1.2 mm filled with εr 4.3 on a graded mesh (ratio ≤ 1.3), a parallel-plate cavity
  const b2 = box({ dx: graded(0.12, 0.3, 44), dy: graded(0.1, 0.25, 34), dz: graded(0.08, 0.16, 10), er: 4.3 });
  cavity(t, 'εr 4.3 parallel-plate cavity, graded mesh', b2, 4.3, 16384, 60e9, false, stats, [7, 6, 3], [31, 23, 7]);
}

// ---------------------------------------------------------------- (c) CPML

function checkCpml(t, stats) {
  const h = 0.5, m = 8, fHi = C0 / (15 * h); // the cell is λ/15 at f_hi
  const sg = 3.717 / (2 * Math.PI * fHi), t0 = 5 * sg;
  const run = (I, steps) => {
    const b = box({ dx: Array(I).fill(h), dy: Array(I).fill(h), dz: Array(I).fill(h), cpml: [m, m, m], precision: 'f32' });
    const c = 1 + m + I / 2;
    const L = new C.CpuLoop(b, { monitorEvery: 0, sources: [{ idx: Int32Array.of(idx(b, 2, c, c, c)), w: Float64Array.of(1), wave: dgauss(t0, sg) }] });
    const probes = [[c + 5, c, c], [c + 5, c + 5, c], [c + 5, c + 5, c + 5]].map((p) => idx(b, 2, ...p));
    const rec = probes.map(() => new Float64Array(steps));
    for (let s = 0; s < steps; s++) { L.run(1); probes.forEach((p, q) => (rec[q][s] = b.E[p])); }
    return { b, rec };
  };
  const Iref = 100, R0c = Iref / 2, smax = 5 * Math.sqrt(3);
  const dt = Es.courantDt(h, h, h);
  const steps = Math.floor((((2 * R0c - smax) * h) / C0 + t0 - 4.5 * sg) / dt); // the large box is clean until then
  const small = run(20, steps), ref = run(Iref, steps);
  const names = ['5 cells in front (normal)', 'edge (45°)', 'corner'];
  const out = [];
  for (let q = 0; q < 3; q++) {
    let peak = 0, diff = 0;
    for (let s = 0; s < steps; s++) { peak = Math.max(peak, Math.abs(ref.rec[q][s])); diff = Math.max(diff, Math.abs(small.rec[q][s] - ref.rec[q][s])); }
    const db = 20 * Math.log10(diff / peak);
    t.ok(db < -40, () => `CPML: reflection at the probe ${names[q]} ${db.toFixed(1)} dB, over −40 dB`);
    out.push(`${names[q]} ${db.toFixed(1)} dB`);
  }
  stats.cpml = `CPML (8 cells, free space, f_hi at λ/15, ${steps} steps): ${out.join(', ')}`;
}

// ---------------------------------------------------------------- (d) f32, rules, timing

function checkPrecisionAndRules(t, stats) {
  // the vacuum cavity, 10 000 steps in f32 and f64: the probe trace
  const rec = {};
  for (const precision of ['f32', 'f64']) {
    const b = box({ dx: Array(24).fill(0.5), dy: Array(18).fill(0.5), dz: Array(12).fill(0.5), precision });
    const L = new C.CpuLoop(b, { monitorEvery: 0, sources: [{ idx: Int32Array.of(idx(b, 2, 6, 5, 3)), w: Float64Array.of(1), wave: dgauss(5 * 1.5e-12, 1.5e-12) }] });
    const pe = idx(b, 2, 17, 12, 8), r = new Float64Array(10000);
    for (let s = 0; s < r.length; s++) { L.run(1); r[s] = b.E[pe]; }
    rec[precision] = r;
  }
  let pk = 0, df = 0;
  for (let s = 0; s < 10000; s++) { pk = Math.max(pk, Math.abs(rec.f64[s])); df = Math.max(df, Math.abs(rec.f32[s] - rec.f64[s])); }
  // a lossless cavity is the worst case: f32's rounding of the 1D factors (~10⁻⁷) moves its resonances and the
  // phase error grows with the steps; the realistic case (ports, loads, CPML) is the microstrip below
  t.ok(df / pk < 1e-3, () => `f32 vs f64, cavity probe over 10 000 steps: ${(df / pk).toExponential(2)} of the peak`);
  const cav = df / pk;
  // a driven microstrip with its ports' resistors and the CPML, in both precisions, run until the stop rule
  const su = Su.defaultSetup();
  const opt = { loads: true, trMin: 35e-12, length: 1.0, z0: [50, 50, 50, 50], eeff: [3, 3, 3, 3] };
  const tr = {};
  let settled = null;
  for (const precision of ['f32', 'f64']) {
    const p = Pr.buildProblem(su, 'trace', { ...opt, precision }).problem;
    const L = new C.CpuLoop(p, { sources: C.portSources(p), sourceEnd: C.pulseEnd(p), maxSteps: 20000 });
    const pr = p.ports[1].v[0], r = [];
    while (L.status === 'running') { L.run(1); let v = 0; for (let q = 0; q < pr.idx.length; q++) v += pr.coef[q] * p.E[pr.idx[q]]; r.push(v); }
    tr[precision] = r;
    t.eq(L.status, 'settled', `driven microstrip (${precision}, ${p.N} cells): stops by the −50 dB rule`);
    if (precision === 'f64') settled = { steps: L.step, cells: p.N, w: L.energy.length };
  }
  const n = Math.min(tr.f32.length, tr.f64.length);
  pk = 0; df = 0;
  for (let s = 0; s < n; s++) { pk = Math.max(pk, Math.abs(tr.f64[s])); df = Math.max(df, Math.abs(tr.f32[s] - tr.f64[s])); }
  t.ok(pk > 0 && df / pk < 1e-5, () => `f32 vs f64, the far port's voltage probe on a driven microstrip: ${(df / pk).toExponential(2)} of the peak`);
  // the stability rule: Δt 5 % over the Courant limit with a source
  const bu = box({ dx: Array(10).fill(0.1), dy: Array(10).fill(0.1), dz: Array(10).fill(0.1), courant: 1.1 / 0.95 });
  const Lu = new C.CpuLoop(bu, { monitorEvery: 20, sourceEnd: 30 * bu.dt, sources: [{ idx: Int32Array.of(idx(bu, 2, 5, 5, 5)), w: Float64Array.of(1), wave: dgauss(10 * bu.dt, 3 * bu.dt) }] });
  Lu.run(5000);
  t.eq(Lu.status, 'unstable', `Δt over the Courant limit is caught as unstable (after ${Lu.step} steps)`);
  stats.rules = `f32 vs f64 (of the peak): cavity probe ${cav.toExponential(1)} over 10 000 steps, the microstrip's far port ${(df / pk).toExponential(1)}; microstrip settled (−50 dB) after ${settled?.steps} steps on ${settled?.cells} cells; Δt × 1.16 unstable after ${Lu.step} steps`;
}

function timing(t, stats) {
  const su = Su.defaultSetup();
  const out = [];
  for (const precision of ['f32', 'f64']) {
    const p = Pr.buildProblem(su, 'via', { precision, loads: true }).problem;
    const L = new C.CpuLoop(p, { sources: C.portSources(p), sourceEnd: C.pulseEnd(p) });
    L.run(10); // warm-up (the kernels' first calls are compiled then)
    let ms = Infinity;
    for (let r = 0; r < 3; r++) { const t0 = performance.now(); L.run(10); ms = Math.min(ms, (performance.now() - t0) / 10); } // best of three
    t.ok(Number.isFinite(L.energy.length ? L.energy[0][1] : 0), 'timing run finite');
    out.push(`${precision} ${(ms / (p.N / 1e6)).toFixed(1)} ms per step per M cells (${((p.N / ms) / 1e3).toFixed(1)}·10⁶ cells/s)`);
    stats.cells = p.N;
  }
  stats.timing = `C44 via with CPML and ports (${stats.cells} cells): ${out.join(', ')}`;
}

export async function run(t) {
  const stats = { energy: [], cavity: [], cpml: '', rules: '', timing: '' };
  checkEnergy(t, stats);
  checkCavities(t, stats);
  checkCpml(t, stats);
  checkPrecisionAndRules(t, stats);
  timing(t, stats);
  t.note(`FDTD CPU: energy drift without sources: ${stats.energy.join('; ')}${LONG ? '' : ' (EMSIM_FDTD_LONG=1: the C44 via over 7 645 steps)'}`);
  t.note(`FDTD CPU: cavities: ${stats.cavity.join('; ')}`);
  t.note(`FDTD CPU: ${stats.cpml}`);
  t.note(`FDTD CPU: ${stats.rules}`);
  t.note(`FDTD CPU: ${stats.timing}`);
}
