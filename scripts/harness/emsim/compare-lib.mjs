// The analysis of the full-wave verification (step M6.4c, docs/em-sim/fullwave-verify.md), shared by
// compare-openems.mjs (runs our FDTD on the GPU and writes openems/compare.json) and check-compare.mjs (the check group,
// which re-computes the openEMS and quasi-static sides from the fixtures and the model and holds the stored FDTD numbers
// to the frozen limits). Every via result is brought to the fixtures' reference planes (3 mm from the via axis, 50 Ω):
// our FDTD's waves at its second measurement plane are moved to the axis with its own feed (Z and γ from both planes'
// V and I) and out again through the fixture's own feed (its stored Z and εeff); the quasi-static model's core (pad edge
// to pad edge, feeds 'none') gets the fixture's feed from the pad's edge. So all three differ only in the via itself.
import { readFileSync } from 'node:fs';
import * as Su0 from '../../../lib/emsim/setup.ts';
import * as St0 from '../../../lib/emsim/structure.ts';
import * as Sk0 from '../../../lib/emsim/stackup.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as VM0 from '../../../lib/emsim/viamodel.ts';
import * as Ru0 from '../../../lib/emsim/fdtd/run.ts';
import * as N0 from '../../../lib/emsim/nport.ts';
import * as TD0 from '../../../lib/emsim/tdr.ts';
import * as Li0 from '../../../lib/emsim/lines.ts';

const dm = (m) => m.default ?? m;
export const Su = dm(Su0), St = dm(St0), Sk = dm(Sk0), V = dm(V0), VM = dm(VM0), Ru = dm(Ru0), N = dm(N0), TD = dm(TD0), Li = dm(Li0);
export const C0 = 299792458;
export const FIX = new URL('./openems/fixtures/', import.meta.url);
export const OUT = new URL('./openems/compare.json', import.meta.url);
export const X_REF = 3; // mm, the fixtures' reference planes from the via axis
export const TR = 35e-12;
export const FREQS = [1, 5, 10, 20, 30, 40]; // GHz, the table's columns

// ---------- complex numbers as [re, im] ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const sc = (a, s) => [a[0] * s, a[1] * s];
const csqrt = (a) => { const r = Math.hypot(a[0], a[1]); const re = Math.sqrt(Math.max(0, (r + a[0]) / 2)), im = Math.sqrt(Math.max(0, (r - a[0]) / 2)); return [re, a[1] < 0 ? -im : im]; };
const clog = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
export const cabs = (a) => Math.hypot(a[0], a[1]);
export const db = (a) => 20 * Math.log10(cabs(a));
/** Re acos(z) = Re(−j·log(z + j·√(1 − z²))). */
const reAcos = (z) => { const w = add(z, mul([0, 1], csqrt(sub([1, 0], mul(z, z))))); return clog(w)[1]; };

/** A line's chain matrix [[ch, Z·sh], [sh/Z, ch]] for γ·ℓ = gl (complex), Z complex. */
function lineT(Z, gl) {
  const [a, b] = gl;
  const ch = [Math.cosh(a) * Math.cos(b), Math.sinh(a) * Math.sin(b)], sh = [Math.sinh(a) * Math.cos(b), Math.cosh(a) * Math.sin(b)];
  return [ch, mul(Z, sh), div(sh, Z), ch];
}
const applyT = (T, v, i) => [add(mul(T[0], v), mul(T[1], i)), add(mul(T[2], v), mul(T[3], i))];
const mulT = (P, Q) => [add(mul(P[0], Q[0]), mul(P[1], Q[2])), add(mul(P[0], Q[1]), mul(P[1], Q[3])), add(mul(P[2], Q[0]), mul(P[3], Q[2])), add(mul(P[2], Q[1]), mul(P[3], Q[3]))];
const invT = (T) => { const d = sub(mul(T[0], T[3]), mul(T[1], T[2])); return [div(T[3], d), div(sc(T[1], -1), d), div(sc(T[2], -1), d), div(T[0], d)]; };

/** A lossless feed (Z, εeff as functions of f in Hz): its chain matrix over ℓ mm at f. */
export const feedT = (feed, f, lenMm) => lineT([feed.z(f), 0], [0, (2 * Math.PI * f * Math.sqrt(feed.eeff(f)) / C0) * lenMm * 1e-3]);

/** S (P × P, [re, im]) from the waves of P excitations: a, b as [port][run]. */
function sFromWaves(a, b, P) {
  const A = new Float64Array(2 * P * P), B = new Float64Array(2 * P * P), Ai = new Float64Array(2 * P * P), S = new Float64Array(2 * P * P);
  for (let i = 0; i < P; i++) for (let q = 0; q < P; q++) { const z = 2 * (i * P + q); A[z] = a[i][q][0]; A[z + 1] = a[i][q][1]; B[z] = b[i][q][0]; B[z + 1] = b[i][q][1]; }
  if (!N.cInv(A, P, Ai)) return null;
  N.cMul(B, Ai, P, S);
  return Array.from({ length: P }, (_, i) => Array.from({ length: P }, (_, j) => [S[2 * (i * P + j)], S[2 * (i * P + j) + 1]]));
}
/** V, I (current into the network) at each port for each run → S at zRef. vi[port][run] = [V, I]. */
function sFromVI(vi, P, zRef) {
  const s = Math.sqrt(zRef);
  const a = vi.map((r) => r.map(([v, i]) => sc(add(v, sc(i, zRef)), 0.5 / s))), b = vi.map((r) => r.map(([v, i]) => sc(sub(v, sc(i, zRef)), 0.5 / s)));
  return sFromWaves(a, b, P);
}

// ---------- the fixtures ----------
export function readFixture(id) { return JSON.parse(readFileSync(new URL(`${id}.json`, FIX), 'utf8')); }
const lerp = (xs, ys, x) => {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + t * (ys[hi] - ys[lo]);
};
/** The fixture's own feed of port n (Z and εeff against f, stored every 0.5 GHz). */
export function fixtureFeed(fx, n) {
  const F = fx.results.feeds;
  return { z: (f) => lerp(F.f_Hz, F.z_ohm[n], f), eeff: (f) => lerp(F.f_Hz, F.eeff[n], f) };
}
/** The fixture's S on its grid: S[k][i][j] from the symmetry pattern. */
export function fixtureS(fx) {
  const sp = fx.results.sParameters, pat = sp.pattern, P = pat.length;
  const name = (p) => { for (let i = 0; i < P; i++) for (let j = 0; j < P; j++) if (pat[i][j] === p) { if (sp[`s${i + 1}${j + 1}`]) return `s${i + 1}${j + 1}`; if (sp[`s${j + 1}${i + 1}`]) return `s${j + 1}${i + 1}`; } return null; };
  const names = Array.from({ length: Math.max(...pat.flat()) + 1 }, (_, p) => name(p));
  return { f: sp.f_Hz, P, S: sp.f_Hz.map((_, k) => pat.map((row) => row.map((p) => [sp[names[p]].re[k], sp[names[p]].im[k]]))) };
}

// ---------- our FDTD ----------
export function unpackRecords(r) {
  return { ...r, runs: r.runs.map((x) => { const b = Buffer.from(x.rec, 'base64'); return { ...x, rec: new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }; }) };
}
/** Plane V and I of port p in run q at f index k: [[V1, I1], [V2, I2]]. */
const planeVI = (sp, P, k, p) => [0, 1].map((pl) => { const o = ((k * P + p) * 2 + pl) * 4; return [[sp[o], sp[o + 1]], [sp[o + 2], sp[o + 3]]]; });
/** A uniform line's Z and γ from V, I at two planes d mm apart (one excitation; any mix of waves). */
function lineFromPlanes([[V1, I1], [V2, I2]], dMm) {
  const A = div(add(mul(V1, I1), mul(V2, I2)), add(mul(V1, I2), mul(V2, I1)));
  const B = div(sub(V1, mul(A, V2)), I2), Cc = div(sub(I1, mul(A, I2)), V2);
  let Z = csqrt(div(B, Cc));
  if (Z[0] < 0) Z = sc(Z, -1);
  const g = sc(clog(add(A, div(B, Z))), 1 / (dMm * 1e-3));
  if (g[1] < 0) g[1] += (2 * Math.PI) / (dMm * 1e-3);
  return { Z, g };
}
/** Our FDTD's own feeds: Z (mean of Re over 1–10 GHz) and εeff (mean), from each port's driven run. */
export function fdtdFeeds(run) {
  const r = run.records, P = r.ports.length;
  const f = Float64Array.from({ length: 19 }, (_, k) => 1e9 + 0.5e9 * k);
  return r.ports.map((pm, p) => {
    const sp = Ru.spectra(r, p, f);
    let z = 0, e = 0;
    for (let k = 0; k < f.length; k++) {
      const { Z, g } = lineFromPlanes(planeVI(sp, P, k, p), pm.s[1] - pm.s[0]);
      z += Z[0]; e += (g[1] * C0 / (2 * Math.PI * f[k])) ** 2;
    }
    return { z: z / f.length, eeff: e / f.length, z2d: pm.z0, eeff2d: pm.eeff };
  });
}
/** Our FDTD's S at the fixture's planes (3 mm from the axis through `feeds[p]`, 50 Ω) on the frequencies f (Hz). */
export function fdtdAtPlanes(run, feeds, f, zRef = 50) {
  const r = run.records, P = r.ports.length, own = fdtdFeeds(run);
  const sps = r.runs.map((_, q) => Ru.spectra(r, q, Float64Array.from(f)));
  return f.map((fk, k) => {
    if (!(fk > 0)) return null;
    const vi = Array.from({ length: P }, (_, p) => {
      const pm = r.ports[p], pt = run.ports[p];
      const D2 = Math.abs(pt.pos + pt.dir * pm.s[1]); // plane 2 from the axis (the barrels sit at x = 0)
      const beta = (2 * Math.PI * fk * Math.sqrt(own[p].eeff)) / C0;
      const Tin = lineT([own[p].z, 0], [0, -beta * D2 * 1e-3]); // plane 2 → axis
      const Tout = feedT(feeds[p], fk, X_REF);
      return r.runs.map((_, q) => { const [[, ], [V2, I2]] = planeVI(sps[q], P, k, p); const [va, ia] = applyT(Tin, V2, I2); return applyT(Tout, va, ia); });
    });
    return sFromVI(vi, P, zRef);
  });
}

// ---------- the quasi-static model ----------
/** The model's core (feeds 'none', every port at 50 Ω) with `feeds[p]` from each pad's edge to the planes. With the
 *  setup's `trace` the core holds each feed's run over its antipad (the series inductance of step M6.5, BL90); without
 *  it, the model as M6.4c compared it. */
export function modelAtPlanes(st, via, f, feeds, trace = null, zRef = 50) {
  const m = VM.viaModel(st, via, trace, { f: Float64Array.from(f), feeds: 'none', tdr: false, z0: 50 });
  if (!m.ok) return { m, S: null };
  const P = m.nport.ports, layers = P === 2 ? [via.entry, via.exit] : [via.entry, via.entry, via.exit, via.exit];
  const padR = layers.map((id) => { const p = via.pads.find((x) => x.layer === id); return p && p.d ? p.d.v / 2 : via.drill.v / 2; });
  const s5 = Math.sqrt(50);
  const S = f.map((fk, k) => {
    if (!(fk > 0)) return null;
    const vi = Array.from({ length: P }, (_, p) => {
      const T = feedT(feeds[p], fk, X_REF - padR[p]);
      return Array.from({ length: P }, (_, q) => {
        const sq = N.sEntry(m.nport, k, p, q), a = p === q ? [1, 0] : [0, 0];
        return applyT(T, sc(add(a, sq), s5), sc(sub(a, sq), 1 / s5));
      });
    });
    return sFromVI(vi, P, zRef);
  });
  return { m, S };
}

// ---------- results of a 2-port at the planes ----------
/** The via section with the fixture's feeds taken off again (3 mm each): Z = √(B/C), delay, L, C over 1–10 GHz. */
export function section(S, f, feeds, zRef = 50) {
  let z = 0, t = 0, n = 0;
  f.forEach((fk, k) => {
    if (!(fk >= 1e9 && fk <= 10e9) || !S[k]) return;
    const [[s11, s12], [s21, s22]] = S[k];
    const d = sc(s21, 2), one = [1, 0];
    const A = div(add(mul(add(one, s11), sub(one, s22)), mul(s12, s21)), d);
    const B = sc(div(sub(mul(add(one, s11), add(one, s22)), mul(s12, s21)), d), zRef);
    const Cc = sc(div(sub(mul(sub(one, s11), sub(one, s22)), mul(s12, s21)), d), 1 / zRef);
    const Dd = div(add(mul(sub(one, s11), add(one, s22)), mul(s12, s21)), d);
    const v = mulT(mulT(invT(feedT(feeds[0], fk, X_REF)), [A, B, Cc, Dd]), invT(feedT(feeds[1], fk, X_REF)));
    let Z = csqrt(div(v[1], v[2]));
    if (Z[0] < 0) Z = sc(Z, -1);
    z += Z[0]; t += reAcos(sc(add(v[0], v[3]), 0.5)) / (2 * Math.PI * fk); n++;
  });
  z /= n; t /= n;
  return { z, delay: t, L: z * t, C: t / z };
}
/** A reflection or transmission (built by `pick(S[k])`) as a function of any f for tdr.ts: linear between the grid
 *  points, 0 above the grid (40 GHz, as every result here). */
function interp(f, S, pick) {
  const re = S.map((s) => (s ? pick(s)[0] : 0)), im = S.map((s) => (s ? pick(s)[1] : 0));
  const top = f[f.length - 1];
  return (fq) => { const o = new Float64Array(2 * fq.length); for (let k = 0; k < fq.length; k++) if (fq[k] <= top) { o[2 * k] = lerp(f, re, fq[k]); o[2 * k + 1] = lerp(f, im, fq[k]); } return o; };
}
/** TDR at 35 ps from a reflection (pick) on the grid, at zRef; t from −40 to 200 ps every ps. */
export function tdrOf(f, S, pick, zRef) {
  const ev = interp(f, S, pick);
  return TD.tdr((fq) => ({ s11: ev(fq), s21: null }), { tr: TR, zRef, span: 50e-12, t0: -40e-12, t1: 200e-12, dt: 1e-12 });
}
export const tdrAt = (r, t) => TD.tdrAt(r, r.z, t);
export function tdrStats(r, tFeed) {
  let lo = Infinity, hi = -Infinity;
  for (let t = tFeed - 30e-12; t <= tFeed + 40e-12; t += 1e-12) { const z = tdrAt(r, t); lo = Math.min(lo, z); hi = Math.max(hi, z); }
  return { zMin: lo, zMax: hi };
}
export function tdrDiff(a, b, t0 = 0, t1 = 100e-12) {
  let w = 0;
  for (let t = t0; t <= t1 + 1e-15; t += 1e-12) w = Math.max(w, Math.abs(tdrAt(a, t) - tdrAt(b, t)));
  return w;
}
export const at = (f, ghz) => f.findIndex((x) => Math.abs(x - ghz * 1e9) < 1);
/** Largest |Sa − Sb| of an entry over (f0, f1] Hz. */
export function sDiff(f, Sa, Sb, pick, f0 = 0, f1 = 40e9) {
  let w = 0;
  f.forEach((fk, k) => { if (fk > f0 && fk <= f1 + 1 && Sa[k] && Sb[k]) w = Math.max(w, cabs(sub(pick(Sa[k]), pick(Sb[k])))); });
  return w;
}
/** The deepest |S21| (pick) over [f0, f1]: { f, db }. */
export function dip(f, S, pick, f0 = 5e9, f1 = 40e9) {
  let best = { f: NaN, db: Infinity };
  f.forEach((fk, k) => { if (fk >= f0 && fk <= f1 + 1 && S[k]) { const v = db(pick(S[k])); if (v < best.db) best = { f: fk, db: v }; } });
  return best;
}
// mixed mode of the pair's 4-port in the order (A1, B1, A6, B6)
export const pk = {
  s11: (s) => s[0][0], s21: (s) => s[1][0],
  sdd11: (s) => sc(sub(add(s[0][0], s[1][1]), add(s[0][1], s[1][0])), 0.5),
  sdd21: (s) => sc(sub(add(s[2][0], s[3][1]), add(s[2][1], s[3][0])), 0.5),
  scc21: (s) => sc(add(add(s[2][0], s[3][1]), add(s[2][1], s[3][0])), 0.5),
  sdc21: (s) => sc(add(sub(s[2][0], s[3][1]), sub(s[3][0], s[2][1])), 0.5), // differential out for common in
};

/** Modal Z and εeff of the pair trace from run 0's end-1 planes (ports p, n): differential V_p − V_n, (I_p − I_n)/2;
 *  common (V_p + V_n)/2, I_p + I_n (as msl-c41). */
export function fdtdModal(run, p, n) {
  const r = run.records, P = r.ports.length;
  const f = Float64Array.from({ length: 19 }, (_, k) => 1e9 + 0.5e9 * k);
  const sp = Ru.spectra(r, 0, f), d = r.ports[p].s[1] - r.ports[p].s[0];
  const acc = { zd: 0, ed: 0, zc: 0, ec: 0 };
  for (let k = 0; k < f.length; k++) {
    const a = planeVI(sp, P, k, p), b = planeVI(sp, P, k, n);
    const dif = a.map(([v, i], q) => [sub(v, b[q][0]), sc(sub(i, b[q][1]), 0.5)]), com = a.map(([v, i], q) => [sc(add(v, b[q][0]), 0.5), add(i, b[q][1])]);
    const L1 = lineFromPlanes(dif, d), L2 = lineFromPlanes(com, d), w = 2 * Math.PI * f[k];
    acc.zd += L1.Z[0]; acc.ed += (L1.g[1] * C0 / w) ** 2; acc.zc += L2.Z[0]; acc.ec += (L2.g[1] * C0 / w) ** 2;
  }
  const n0 = f.length;
  return { zdiff: acc.zd / n0, eeffOdd: acc.ed / n0, zcm: acc.zc / n0, eeffEven: acc.ec / n0 };
}

// ---------- the setups ----------
export function setups() {
  const su = Su.defaultSetup(), st = su.stackup;
  const single = V.presetVia('single', st);
  const stub = { ...single, exit: 'L3', feeds: [{ ...single.feeds[0] }, { layer: 'L3', length: Sk.val(2), angle: 0 }] };
  const pair = V.presetVia('pair', st);
  const pairX = { ...pair, feeds: [{ ...pair.feeds[0], angle: 180 }, { ...pair.feeds[1], angle: 0 }] }; // as via-c45 (BL161)
  const lv = St.presetStructure('pair-microstrip', st, 0.11);
  lv.s = { ...lv.s, v: 0.2 };
  return {
    su, st, trace: su.trace,
    vias: {
      'via-c44': single,
      'via-c44-noret': { ...single, returns: [] },
      'via-c44-stub': stub,
      'via-c44-bd': { ...stub, backdrill: { side: 'bottom', depth: Sk.val(1.2), d: Sk.val(0.5) } },
      'via-c45': pairX,
    },
    lvds: { ...su, trace: lv },
  };
}
// ---------- the verdicts (compare-openems.mjs prints them, check-compare.mjs checks them) ----------
/** Every frozen limit against a compare.json object: [{ what, value, bar, ok }]. */
export function verdicts(o, lim = o.limits) {
  const out = [];
  const put = (what, value, bar) => out.push({ what, value, bar, ok: Number.isFinite(value) && Math.abs(value) <= bar });
  const rel = (a, b) => a / b - 1;
  for (const v of o.vias) {
    put(`${v.id}: TDR |Δz| over 0–100 ps (Ω)`, v.tdrDiff.fdtd, lim.tdr);
    put(`${v.id}: |ΔS11| to 10 GHz`, v.dS.fdtd.refl10, lim.s10);
    put(`${v.id}: |ΔS21| to 10 GHz`, v.dS.fdtd.trans10, lim.s10);
    put(`${v.id}: |ΔS11| to 20 GHz`, v.dS.fdtd.refl20, lim.s20);
    put(`${v.id}: |ΔS21| to 20 GHz`, v.dS.fdtd.trans20, lim.s20);
    if (v.section.openems && v.section.fdtd) {
      put(`${v.id}: section Z`, rel(v.section.fdtd.z, v.section.openems.z), lim.sectionZ);
      put(`${v.id}: section delay`, rel(v.section.fdtd.delay, v.section.openems.delay), lim.sectionDelay);
    }
    if (v.notch && v.id.endsWith('stub')) put(`${v.id}: notch frequency`, rel(v.notch.fdtd.f, v.notch.openems.f), lim.notch);
    if (v.dS.fdtdStair) {
      put(`${v.id} (staircase): TDR |Δz| (Ω)`, v.tdrDiff.fdtdStair, lim.stairTdr);
      put(`${v.id} (staircase): |ΔS| to 20 GHz`, Math.max(v.dS.fdtdStair.refl20, v.dS.fdtdStair.trans20), lim.stairS20);
      if (v.notch?.fdtdStair) put(`${v.id} (staircase): notch frequency`, rel(v.notch.fdtdStair.f, v.notch.openems.f), lim.stairNotch);
    }
  }
  const l = o.lvds;
  put('msl-c41: Zdiff', rel(l.fdtd.zdiff, l.openems.zdiff), lim.zdiff);
  put('msl-c41: Zcm', rel(l.fdtd.zcm, l.openems.zcm), lim.zcm);
  for (const m of ['eeffOdd', 'eeffEven']) {
    put(`msl-c41: ${m} against openEMS`, rel(l.fdtd[m], l.openems[m]), lim.eeffModeOpenems);
    put(`msl-c41: ${m} against the 2D solver`, rel(l.fdtd[m], l.twoD[m]), lim.eeffMode2D);
  }
  return out;
}
