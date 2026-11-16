// Fields of the 2D quasi-static solution (step M1.5, engine.md §9, facts.md §7), from the panel charges the solver
// keeps (bem2d.ts `Level.q`, `q0`: the total charge density σ/ε0 on every panel of the whole boundary, also after a
// symmetric solve).
//
// - Electric: for conductor voltages V (any drive: one line, even, odd, a mode's Tv), φ and E = −∇φ from the total
//   charges in vacuum with the solver's own kernel (free space, image plane, parallel plates); D = ε0·εr·E with εr of
//   the point's medium; the free surface charge per conductor panel (bem2d.ts `freeCharges`: one medium, or a sheet).
// - Magnetic (quasi-TEM): the vacuum problem with charges Q0 = I/c0 gives E0 and the vacuum potentials V0 = C0⁻¹·Q0;
//   H = (1/η0)·v̂ × E0 (Hu = E0z/η0, Hz = −E0u/η0, wave along +v with (u, v, z) right-handed), Az = φ0/c0 (its
//   contours are the H lines), surface current J_s = c0·ρ_s,0.
//
// Evaluation (section coordinates in mm, fields in SI): panels by the closed-form integrals of kernels.ts; runs of
// collinear consecutive panels as binary trees (split at the middle of their length), a node far from the point by its
// multipole expansion (exact moments of the straight piece, P terms, used when the point is more than 4 half-lengths
// from its centre: truncation below 2 × 10⁻⁸ of Σ|q|·L/d), so a grid point costs O(runs · log panels). The parallel-plate kernel is summed panel by
// panel (panelPot/panelDn; slower, no budget is set for striplines' fields: BL86).
//
// Grids (`fieldGrid`): progressive. The coarsest lattice (every `coarse` points) is evaluated whole and given as the
// first picture; each halving of the spacing evaluates a new point directly when its parent cell holds a change of
// medium or copper (interfaces, copper faces: the kinks of E) or lies within NEAR parent spacings of a corner of the
// geometry (copper edges, triple points: E ~ r^(−1/3) crowding, interpolated with a relative error ≤ 1/(18·NEAR²) ≈
// 0.35 % beyond that), and otherwise interpolates it bilinearly from the parent lattice. Copper points take the
// conductor's potential and zero field. So the crowding at copper edges is sampled down to the finest grid step,
// without aliasing of the kinks, and the smooth field far away costs almost nothing.

import type { BemResult } from './bem2d';
import { C0, EPS0, freeCharges } from './bem2d';
import type { Section } from './geometry';
import type { Kernel, Panels } from './kernels';
import { panelDn, panelPot } from './kernels';
import { invert } from './linalg';
import type { LineResults } from './lines';

export const FIELDS_VERSION = 1;
export const MM = 1000; // section units per metre
const ETA0 = 1 / (EPS0 * C0);
const INV_2PI = 1 / (2 * Math.PI);
const P = 12; // multipole terms
const NEAR_RUN = 16; // (4 half-lengths)²
const PL = 30; // local expansion terms (forView)
export const NEAR = 4; // grids: parent spacings around a corner evaluated directly

// ---- Media: what is at a point ----

/** Class codes: ≥ 0 a material (εr = eps[code]), < 0 copper of conductor −1 − code (−1 ground, −2 signal 1 …). */
export interface Media {
  eps: Float64Array;
  vertices: Float64Array; // corners of the geometry (x, z pairs, section coordinates)
  /** Classes of the points x0 + i·dx (i < n) at height z into out[off …]. */
  row(z: number, x0: number, dx: number, n: number, out: Int16Array, off: number): void;
}

const ONE = new Int16Array(1);
export function classify(m: Media, x: number, z: number): number {
  m.row(z, x, 1, 1, ONE, 0);
  return ONE[0];
}

// Crossings of the polygon (pts: x, z pairs) with the line at height z, appended to xs.
function crossings(pts: Float64Array, z: number, xs: number[]): void {
  const n = pts.length / 2;
  for (let k = 0; k < n; k++) {
    const x1 = pts[2 * k], z1 = pts[2 * k + 1];
    const k2 = (k + 1) % n;
    const x2 = pts[2 * k2], z2 = pts[2 * k2 + 1];
    if ((z1 <= z) !== (z2 <= z)) xs.push(x1 + ((z - z1) * (x2 - x1)) / (z2 - z1));
  }
}

/** The media of a section (geometry.ts): regions by material, conductors over them, the planes as ground. */
export function sectionMedia(sec: Section): Media {
  const eps = Float64Array.from(sec.materials.map((m) => m.er));
  const ext = sec.ext;
  const verts: number[] = [];
  const polys: { pts: Float64Array; code: number }[] = [];
  for (const r of sec.regions) polys.push({ pts: r.pts, code: r.mat });
  for (const c of sec.conductors) polys.push({ pts: c.pts, code: -1 - c.id });
  for (const p of polys) {
    for (let k = 0; k < p.pts.length; k += 2) {
      const x = p.pts[k], z = p.pts[k + 1];
      if (Math.abs(x) < ext * (1 - 1e-9)) verts.push(x, z);
    }
  }
  const zIn = (z: number) => Math.min(sec.zHi - 1e-9 * (sec.zHi - sec.zLo), Math.max(sec.zLo + 1e-9 * (sec.zHi - sec.zLo), z));
  const xs: number[] = [];
  return {
    eps,
    vertices: Float64Array.from(verts),
    row(z, x0, dx, n, out, off) {
      if ((sec.planeBelow !== null && z < sec.planeBelow) || (sec.planeAbove !== null && z > sec.planeAbove)) {
        out.fill(-1, off, off + n);
        return;
      }
      out.fill(0, off, off + n);
      const zc = zIn(z);
      const xLo = -ext * (1 - 1e-12);
      const xHi = ext * (1 - 1e-12);
      for (const p of polys) {
        xs.length = 0;
        crossings(p.pts, zc, xs);
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          // [xs[k], xs[k+1]), the box's sides extended outwards
          const a = xs[k] <= xLo ? -Infinity : xs[k];
          const b = xs[k + 1] >= xHi ? Infinity : xs[k + 1];
          let i0 = Math.ceil((a - x0) / dx);
          let i1 = Math.ceil((b - x0) / dx) - 1;
          if (i0 < 0) i0 = 0;
          if (i1 > n - 1) i1 = n - 1;
          if (i1 >= i0) out.fill(p.code, off + i0, off + i1 + 1);
        }
      }
    },
  };
}

/** Media from a function (the harness's exact cases). */
export function functionMedia(eps: number[], at: (x: number, z: number) => number, vertices: number[] = []): Media {
  return {
    eps: Float64Array.from(eps),
    vertices: Float64Array.from(vertices),
    row(z, x0, dx, n, out, off) { for (let i = 0; i < n; i++) out[off + i] = at(x0 + i * dx, z); },
  };
}

// ---- The model and sources ----

export interface FieldModel {
  kernel: Kernel;
  mesh: Panels;
  signals: number;
  q: Float64Array; // total charges per signal (σ/ε0), whole boundary
  q0: Float64Array; // vacuum: conductor panels only
  free: Float64Array; // free charge / ε0 per conductor panel per signal
  Cv: Float64Array; // vacuum capacitance matrix (F/m), signals × signals
  zShift: number;
  flip: boolean;
  media: Media | null;
  M: number;
}

/** The model of one level of a solve (default the finest), with the media of its section when given. */
export function fieldModel(bem: BemResult, media: Media | Section | null = null, level = -1): FieldModel | string {
  if (!bem || !bem.ok || !bem.boundary || !bem.levels.length) return bem && bem.reason ? bem.reason : 'No solution to draw.';
  const lv = bem.levels[level < 0 ? bem.levels.length - 1 : level];
  if (!lv) return 'No such level.';
  const m = media && 'regions' in media ? sectionMedia(media) : (media as Media | null);
  return {
    kernel: bem.boundary.kernel, mesh: lv.mesh, signals: bem.signals, q: lv.q, q0: lv.q0,
    free: freeCharges(bem.boundary.kernel, lv.mesh, lv.q, bem.signals), Cv: lv.C0, zShift: bem.boundary.zShift,
    flip: bem.boundary.flip, media: m, M: lv.M,
  };
}

export type FieldKind = 'E' | 'H';

export interface Source {
  model: FieldModel;
  kind: FieldKind;
  drive: Float64Array; // E: conductor voltages per signal (V); H: currents (A)
  pot: Float64Array; // potential of each conductor id (0 ground …): V, or the vacuum potentials V0
  s: Float64Array; // total charge per panel (σ/ε0, V/mm)
  n: number; // panels used (all, or the conductor panels for H)
  V0: number; // the free kernel's constant
  // runs of collinear panels: start, end, centre, direction, (4R)², moments
  roots: Int32Array; roots1: Int32Array; lc: Int32Array; rc: Int32Array; // run trees: roots (panels, images), children or −1
  ra: Int32Array; rb: Int32Array; rx: Float64Array; rz: Float64Array; rtx: Float64Array; rtz: Float64Array; rr: Float64Array;
  mu: Float64Array; // (P + 1) per run: μ_k = Σ s·∫ t^k dl
  // a view's source (forView): the panels far from the view as one local expansion about (lx, lz) for |z − c| ≤ lR
  loc: Float64Array | null; // (re, im) of PL + 1 coefficients C_m in w = (z − c)/lR; loc[0] the real constant
  lx: number; lz: number; lR: number;
  full: Source | null; // the whole source, for points outside the view's disc
}

function buildRuns(src: Source, keep0: Uint8Array | null = null, keep1: Uint8Array | null = null): void {
  const p = src.model.mesh;
  const n = src.n;
  const s = src.s;
  // maximal runs of collinear contiguous panels (of the kept ones), for the panels (copy 0) and their images (copy 1)
  const runsOf = (keep: Uint8Array | null): number[] => {
  const runs: number[] = [];
  let j = 0;
  while (j < n) {
    if (keep && !keep[j]) { j++; continue; }
    let k = j + 1;
    while (k < n && (!keep || keep[k])) {
      const L = p.len[k - 1];
      const ex = p.ax[k - 1] + p.tx[k - 1] * L;
      const ez = p.az[k - 1] + p.tz[k - 1] * L;
      if (Math.abs(p.tx[k] - p.tx[j]) > 1e-12 || Math.abs(p.tz[k] - p.tz[j]) > 1e-12) break;
      if (Math.abs(p.ax[k] - ex) + Math.abs(p.az[k] - ez) > 1e-9 * (L + p.len[k])) break;
      k++;
    }
    runs.push(j, k);
    j = k;
  }
  return runs;
  };
  // a binary tree over each run, split at the panel boundary nearest the middle of its length
  const na: number[] = [], nb: number[] = [], lc: number[] = [], rc: number[] = [];
  const node = (j0: number, j1: number): number => {
    const id = na.length;
    na.push(j0); nb.push(j1); lc.push(-1); rc.push(-1);
    if (j1 - j0 > 1) {
      let len = 0;
      for (let q = j0; q < j1; q++) len += p.len[q];
      let acc = 0, m = j0 + 1, best = Infinity;
      for (let q = j0; q < j1 - 1; q++) {
        acc += p.len[q];
        const d = Math.abs(acc - len / 2);
        if (d < best) { best = d; m = q + 1; }
      }
      const l = node(j0, m);
      const g = node(m, j1);
      lc[id] = l;
      rc[id] = g;
    }
    return id;
  };
  const rootsOf = (runs: number[]) => { const out: number[] = []; for (let r = 0; r < runs.length; r += 2) out.push(node(runs[r], runs[r + 1])); return Int32Array.from(out); };
  src.roots = rootsOf(runsOf(keep0));
  src.roots1 = src.model.kernel.kind === 'image' ? rootsOf(runsOf(keep1)) : new Int32Array(0);
  const nn = na.length;
  src.ra = Int32Array.from(na); src.rb = Int32Array.from(nb); src.lc = Int32Array.from(lc); src.rc = Int32Array.from(rc);
  src.rx = new Float64Array(nn); src.rz = new Float64Array(nn); src.rtx = new Float64Array(nn); src.rtz = new Float64Array(nn);
  src.rr = new Float64Array(nn);
  src.mu = new Float64Array(nn * (P + 1));
  for (let r = 0; r < nn; r++) {
    const j0 = na[r], j1 = nb[r];
    const tx = p.tx[j0], tz = p.tz[j0];
    let len = 0;
    for (let q = j0; q < j1; q++) len += p.len[q];
    const h = len / 2;
    const cx = p.ax[j0] + tx * h, cz = p.az[j0] + tz * h;
    src.rx[r] = cx; src.rz[r] = cz; src.rtx[r] = tx; src.rtz[r] = tz;
    src.rr[r] = NEAR_RUN * h * h;
    let t0 = -h;
    for (let q = j0; q < j1; q++) {
      const t1 = t0 + p.len[q];
      let p0 = t0, p1 = t1;
      for (let k = 0; k <= P; k++) {
        src.mu[r * (P + 1) + k] += (s[q] * (p1 - p0)) / (k + 1);
        p0 *= t0; p1 *= t1;
      }
      t0 = t1;
    }
  }
}

function newSource(model: FieldModel, kind: FieldKind, drive: Float64Array, pot: Float64Array, s: Float64Array, n: number): Source {
  const src: Source = {
    model, kind, drive, pot, s, n, V0: 0,
    roots: null, roots1: null, lc: null, rc: null, loc: null, lx: 0, lz: 0, lR: 0, full: null, ra: null, rb: null, rx: null, rz: null, rtx: null, rtz: null, rr: null, mu: null,
  };
  if (model.kernel.kind !== 'pp') buildRuns(src);
  if (model.kernel.kind === 'free') {
    // the free constant: the potential at the first conductor panel's midpoint is that conductor's
    const p = model.mesh;
    const raw = rawPotential(src, p.mx[0], p.mz[0]);
    src.V0 = pot[p.cond[0]] - raw;
  }
  return src;
}

/** The electric source of conductor voltages V (per signal; ground 0 V). */
export function electric(model: FieldModel, V: ArrayLike<number>): Source {
  const p = model.mesh;
  const N = p.n;
  const ns = model.signals;
  const s = new Float64Array(N);
  for (let k = 0; k < ns; k++) {
    const v = V[k] ?? 0;
    if (v === 0) continue;
    for (let j = 0; j < N; j++) s[j] += v * model.q[k * N + j];
  }
  const pot = new Float64Array(ns + 1);
  for (let k = 0; k < ns; k++) pot[k + 1] = V[k] ?? 0;
  return newSource(model, 'E', Float64Array.from({ length: ns }, (_, k) => V[k] ?? 0), pot, s, N);
}

/** The magnetic (quasi-TEM) source of signal currents I (A, wave along +v; ground returns the sum). */
export function magnetic(model: FieldModel, I: ArrayLike<number>): Source | string {
  const ns = model.signals;
  const nc = model.mesh.nc;
  const inv = invert(Float64Array.from(model.Cv), ns);
  if (!inv) return 'The vacuum capacitance matrix is singular.';
  const pot = new Float64Array(ns + 1);
  for (let a = 0; a < ns; a++) {
    let v = 0;
    for (let b = 0; b < ns; b++) v += inv[a * ns + b] * ((I[b] ?? 0) / C0);
    pot[a + 1] = v;
  }
  const s = new Float64Array(nc);
  for (let k = 0; k < ns; k++) {
    const v = pot[k + 1];
    if (v === 0) continue;
    for (let j = 0; j < nc; j++) s[j] += v * model.q0[k * nc + j];
  }
  return newSource(model, 'H', Float64Array.from({ length: ns }, (_, k) => I[k] ?? 0), pot, s, nc);
}

// ---- Drives ----

export type DriveName = 'line' | 'even' | 'odd' | 'differential' | 'common';

/**
 * Conductor voltages (E) or currents (H) of a named drive: 'line' k (1 on signal k, others 0), 'even' (all 1),
 * 'odd' (+1, −1), 'differential' (+½, −½: 1 V or 1 A between the lines), 'common' (all 1: 1 V; for H, ½ A each, 1 A in
 * all). Pairs only for odd and differential.
 */
export function namedDrive(n: number, name: DriveName, k = 1, field: FieldKind = 'E'): number[] {
  const v = new Array<number>(n).fill(0);
  if (name === 'line') v[Math.min(n, Math.max(1, k)) - 1] = 1;
  else if (name === 'even') v.fill(1);
  else if (name === 'common') v.fill(field === 'H' ? 1 / n : 1);
  else if (n >= 2) { const a = name === 'odd' ? 1 : 0.5; v[0] = a; v[1] = -a; }
  return v;
}

/** A mode's drive from the line results: E → its voltages Tv (1 V scale), H → its currents Ti. */
export function modeDrive(r: LineResults, m: number, field: FieldKind = 'E'): number[] {
  const md = r.modes[m];
  if (!md) return new Array<number>(r.n).fill(0);
  return (field === 'E' ? md.Tv : md.Ti).slice();
}

// ---- Evaluation ----

// Σ over panels of the raw logarithmic potential (without V0) at solver coordinates, every panel by its closed form.
function rawPotential(src: Source, X: number, Z: number): number {
  const p = src.model.mesh;
  const k = src.model.kernel;
  if (k.kind === 'pp') {
    let v = 0;
    for (let j = 0; j < src.n; j++) if (src.s[j] !== 0) v += src.s[j] * panelPot(k, p, j, X, Z, false);
    return v;
  }
  const img = k.kind === 'image';
  let sum = 0;
  for (let j = 0; j < src.n; j++) {
    const s = src.s[j];
    if (s === 0) continue;
    sum += s * logInt(X, Z, p.ax[j], p.az[j], p.tx[j], p.tz[j], p.len[j]);
    if (img) sum -= s * logInt(X, Z, p.ax[j], -p.az[j], p.tx[j], -p.tz[j], p.len[j]);
  }
  return -INV_2PI * sum;
}

// ∫ ln|P − Q| dl over a panel (as kernels.ts).
function logInt(px: number, pz: number, ax: number, az: number, tx: number, tz: number, L: number): number {
  const rx = px - ax, rz = pz - az;
  const u = rx * tx + rz * tz;
  const v = rx * tz - rz * tx;
  const xb = L - u;
  const v2 = v * v;
  let I = -L;
  if (xb !== 0) I += 0.5 * xb * Math.log(xb * xb + v2);
  if (u !== 0) I += 0.5 * u * Math.log(u * u + v2);
  if (v !== 0) { const av = Math.abs(v); I += av * Math.atan2(L * av, v2 + u * u - u * L); }
  return I;
}

const OUT = new Float64Array(3);

// Solver coordinates: OUT = [Σ s·∫ln r (the log sum, sign by copy), ∂/∂X, ∂/∂Z of it] for free and image kernels:
// the run trees from their roots, a node by its multipole when the point is more than 4 half-lengths from its centre,
// else by its children, a single panel by its closed form.
const STACK = new Int32Array(256);
function sumLog(src: Source, X: number, Z: number): void {
  const p = src.model.mesh;
  const AX = p.ax, AZ = p.az, LEN = p.len;
  const S = src.s;
  const copies = src.model.kernel.kind === 'image' ? 2 : 1;
  const RA = src.ra, LC = src.lc, RC = src.rc, RX = src.rx, RZ = src.rz, RTX = src.rtx, RTZ = src.rtz, RR = src.rr, MU = src.mu;
  const st = STACK;
  let Ls = 0, Gx = 0, Gz = 0;
  for (let c = 0; c < copies; c++) {
    const sg = c === 0 ? 1 : -1;
    const ROOTS = c === 0 ? src.roots : src.roots1;
    for (let ri = 0; ri < ROOTS.length; ri++) {
      let sp = 0;
      st[sp++] = ROOTS[ri];
      while (sp > 0) {
        const r = st[--sp];
        const tx = RTX[r];
        const tz = c === 0 ? RTZ[r] : -RTZ[r];
        const dx = X - RX[r];
        const dz = Z - (c === 0 ? RZ[r] : -RZ[r]);
        const d2 = dx * dx + dz * dz;
        if (d2 > RR[r]) {
          // multipole: u = τ/(z − zc); Σ_k μ_k u^k (gradient) and Σ_k≥1 μ_k/k u^k (potential), Horner
          const ir = dx / d2, ii = -dz / d2;
          const ur = tx * ir - tz * ii, ui = tx * ii + tz * ir;
          const o = r * (P + 1);
          let gr = MU[o + P], gi = 0;
          let pr = MU[o + P] / P, pi = 0;
          for (let k = P - 1; k >= 1; k--) {
            const m = MU[o + k];
            const ngr = gr * ur - gi * ui + m;
            gi = gr * ui + gi * ur; gr = ngr;
            const npr = pr * ur - pi * ui + m / k;
            pi = pr * ui + pi * ur; pr = npr;
          }
          { const ngr = gr * ur - gi * ui + MU[o]; gi = gr * ui + gi * ur; gr = ngr; }
          const qr = pr * ur - pi * ui; // Re(u·Σ…)
          Ls += sg * (0.5 * MU[o] * Math.log(d2) - qr);
          const wr = gr * ir - gi * ii, wi = gr * ii + gi * ir; // ∫ s/(z − ζ): ∂/∂X = Re, ∂/∂Z = −Im
          Gx += sg * wr;
          Gz -= sg * wi;
          continue;
        }
        const l = LC[r];
        if (l >= 0) { st[sp++] = l; st[sp++] = RC[r]; continue; }
        const j = RA[r];
        const s = S[j];
        if (s === 0) continue;
        const L = LEN[j];
        const az = c === 0 ? AZ[j] : -AZ[j];
        const rx = X - AX[j], rz = Z - az;
        const u = rx * tx + rz * tz;
        const v = rx * tz - rz * tx;
        const xb = L - u;
        const v2 = v * v;
        const la = Math.log(u * u + v2 + 1e-300), lb = Math.log(xb * xb + v2 + 1e-300);
        let I = -L;
        if (xb !== 0) I += 0.5 * xb * lb;
        if (u !== 0) I += 0.5 * u * la;
        const dv = Math.atan2(L * v, v2 + u * u - u * L);
        if (v !== 0) I += Math.abs(v) * Math.abs(dv);
        const du = 0.5 * (la - lb);
        Ls += sg * s * I;
        Gx += sg * s * (du * tx + dv * tz);
        Gz += sg * s * (du * tz - dv * tx);
      }
    }
  }
  const loc = src.loc;
  if (loc) {
    // P(w) = Σ_{m≥1} C_m w^m and P'(w) = Σ m·C_m w^(m−1), w = (z − c)/R, by Horner
    const R = src.lR;
    const zr = (X - src.lx) / R, zi = (Z - src.lz) / R;
    let pr = loc[2 * PL], pi = loc[2 * PL + 1];
    let dr = PL * pr, di = PL * pi;
    for (let m = PL - 1; m >= 1; m--) {
      const cr = loc[2 * m], ci = loc[2 * m + 1];
      const npr = pr * zr - pi * zi + cr;
      pi = pr * zi + pi * zr + ci; pr = npr;
      const ndr = dr * zr - di * zi + m * cr;
      di = dr * zi + di * zr + m * ci; dr = ndr;
    }
    Ls += pr * zr - pi * zi + loc[0];
    Gx += dr / R;
    Gz -= di / R;
  }
  OUT[0] = Ls; OUT[1] = Gx; OUT[2] = Gz;
}

/**
 * A source for one view (a rectangle in section coordinates, mm): the panels (and images) whose nearest point is more
 * than twice the view's half diagonal R from its centre become one local (Taylor) expansion of PL terms about the
 * centre (exact integrals over each straight panel; for |z − c| ≤ R the ratio is at most ½, truncation below
 * 2 × 10⁻⁹ relative), and the trees are built over the other panels only. Points outside the disc use the whole
 * source. The far parts of the rays to ±X (graded panels up to 100 section sizes away) then cost one polynomial.
 */
export function forView(src: Source, rect: { x0: number; x1: number; z0: number; z1: number }): Source {
  const m = src.model;
  if (m.kernel.kind === 'pp') return src;
  const base = src.full ?? src;
  const p = m.mesh;
  const cx = (rect.x0 + rect.x1) / 2;
  const czs = (rect.z0 + rect.z1) / 2;
  const cz = m.flip ? m.zShift - czs : czs - m.zShift;
  const R = 0.5 * Math.hypot(rect.x1 - rect.x0, rect.z1 - rect.z0) * (1 + 1e-9) + 1e-12;
  const n = base.n;
  const loc = new Float64Array(2 * (PL + 1));
  const keep0 = new Uint8Array(n), keep1 = new Uint8Array(n);
  const copies = m.kernel.kind === 'image' ? 2 : 1;
  for (let c = 0; c < copies; c++) {
    const keep = c === 0 ? keep0 : keep1;
    const sg = c === 0 ? 1 : -1;
    for (let j = 0; j < n; j++) {
      const L = p.len[j];
      const ax = p.ax[j], az = c === 0 ? p.az[j] : -p.az[j];
      const tx = p.tx[j], tz = c === 0 ? p.tz[j] : -p.tz[j];
      const ux = cx - ax, uz = cz - az; // A = c − a
      const tt = Math.min(L, Math.max(0, ux * tx + uz * tz));
      const dd = Math.hypot(ux - tt * tx, uz - tt * tz);
      if (!(dd > 2 * R)) { keep[j] = 1; continue; }
      const s = base.s[j] * sg;
      if (s === 0) continue;
      // B = c − b. ∫ln(z − ζ) = ∫ln(c − ζ) + Σ_m (−1)^(m+1)/m·(z − c)^m·Jm, Jm = ∫(c − ζ)^(−m) dl:
      // J1 = ln(A/B)/τ, Jm = (B^(1−m) − A^(1−m))/((m − 1)·τ); in w: C_m = (−1)^(m+1)/m·Jm·R^m
      const Ar = ux, Ai = uz, Br = ux - L * tx, Bi = uz - L * tz;
      const a2 = Ar * Ar + Ai * Ai, b2 = Br * Br + Bi * Bi;
      loc[0] += s * logInt(cx, cz, ax, az, tx, tz, L);
      const lr = 0.5 * Math.log(a2 / b2), li = Math.atan2(Ai * Br - Ar * Bi, Ar * Br + Ai * Bi);
      loc[2] += s * R * (lr * tx + li * tz); loc[3] += s * R * (li * tx - lr * tz); // ÷τ = ×conj(τ)
      const ra0 = (R * Ar) / a2, ra1 = (-R * Ai) / a2; // R/A
      const rb0 = (R * Br) / b2, rb1 = (-R * Bi) / b2; // R/B
      let pa0 = 1, pa1 = 0, pb0 = 1, pb1 = 0;
      for (let k = 2; k <= PL; k++) {
        let t0 = pa0 * ra0 - pa1 * ra1; pa1 = pa0 * ra1 + pa1 * ra0; pa0 = t0;
        t0 = pb0 * rb0 - pb1 * rb1; pb1 = pb0 * rb1 + pb1 * rb0; pb0 = t0;
        const dr = ((pb0 - pa0) * R) / (k - 1), di = ((pb1 - pa1) * R) / (k - 1);
        const f = (k % 2 === 0 ? -1 : 1) / k;
        loc[2 * k] += s * f * (dr * tx + di * tz); loc[2 * k + 1] += s * f * (di * tx - dr * tz);
      }
    }
  }
  const out: Source = { ...base, roots: null, roots1: null, lc: null, rc: null, ra: null, rb: null, rx: null, rz: null, rtx: null, rtz: null, rr: null, mu: null, loc, lx: cx, lz: cz, lR: R, full: base };
  buildRuns(out, keep0, keep1);
  return out;
}

/**
 * The field at (x, z) in section coordinates (mm) into out: E source [φ (V), Ex, Ez (V/m)]; H source [Az (Wb/m), Hx, Hz
 * (A/m)]. Returns the point's class (Media), or 0 without media; copper points get the conductor's potential and zero
 * field.
 */
export function evalField(src: Source, x: number, z: number, out: Float64Array | number[], cls?: number): number {
  const m = src.model;
  const c = cls ?? (m.media ? classify(m.media, x, z) : 0);
  if (c < 0) {
    const pot = src.pot[-1 - c] ?? 0;
    out[0] = src.kind === 'E' ? pot : pot / C0;
    out[1] = 0; out[2] = 0;
    return c;
  }
  const X = x;
  const Z = m.flip ? m.zShift - z : z - m.zShift;
  let phi: number, ex: number, ez: number;
  if (m.kernel.kind === 'pp') {
    const p = m.mesh;
    let v = 0, gx = 0, gz = 0;
    for (let j = 0; j < src.n; j++) {
      const s = src.s[j];
      if (s === 0) continue;
      v += s * panelPot(m.kernel, p, j, X, Z, false);
      gx += s * panelDn(m.kernel, p, j, X, Z, 1, 0, false);
      gz += s * panelDn(m.kernel, p, j, X, Z, 0, 1, false);
    }
    phi = v; ex = -gx; ez = -gz;
  } else {
    const use = src.loc && (X - src.lx) ** 2 + (Z - src.lz) ** 2 > src.lR * src.lR ? src.full : src;
    sumLog(use, X, Z);
    phi = -INV_2PI * OUT[0] + src.V0;
    ex = INV_2PI * OUT[1];
    ez = INV_2PI * OUT[2];
  }
  if (m.flip) ez = -ez;
  ex *= MM; ez *= MM;
  if (src.kind === 'E') { out[0] = phi; out[1] = ex; out[2] = ez; }
  else { out[0] = phi / C0; out[1] = ez / ETA0; out[2] = -ex / ETA0; }
  return c;
}

export interface PointField {
  x: number; z: number;
  cls: number; // class (Media): < 0 copper
  eps: number; // εr there (NaN in copper)
  phi: number; // V (E) or Az (Wb/m, H)
  fx: number; fz: number; f: number; // E (V/m) or H (A/m) and its magnitude
  dx: number; dz: number; // D (C/m²) for E, B (T) for H
}

export function pointField(src: Source, x: number, z: number): PointField {
  const o = [0, 0, 0];
  const c = evalField(src, x, z, o);
  const media = src.model.media;
  const eps = c < 0 ? NaN : media ? media.eps[c] : 1;
  const k = src.kind === 'E' ? EPS0 * (eps === eps ? eps : 0) : 4e-7 * Math.PI * 1.00000000055;
  return { x, z, cls: c, eps, phi: o[0], fx: o[1], fz: o[2], f: Math.hypot(o[1], o[2]), dx: k * o[1], dz: k * o[2] };
}

export interface Surface {
  cond: Int32Array; // conductor id per panel
  x: Float64Array; z: Float64Array; len: Float64Array; // panel midpoints and lengths (section coordinates, mm)
  nx: Float64Array; nz: Float64Array; // panel normals (section frame)
  density: Float64Array; // E: free surface charge σ (C/m²); H: surface current J_s (A/m, along +v)
  total: Float64Array; // per conductor id: Σ density·length (C/m or A)
}

/** Free surface charge (E) or HF surface current density (H) on every conductor panel, and per conductor. */
export function surface(src: Source): Surface {
  const m = src.model;
  const p = m.mesh;
  const nc = p.nc;
  const out: Surface = {
    cond: p.cond.slice(0, nc), x: new Float64Array(nc), z: new Float64Array(nc), len: p.len.slice(0, nc),
    nx: new Float64Array(nc), nz: new Float64Array(nc), density: new Float64Array(nc), total: new Float64Array(m.signals + 1),
  };
  for (let j = 0; j < nc; j++) {
    out.x[j] = p.mx[j];
    out.z[j] = m.flip ? m.zShift - p.mz[j] : p.mz[j] + m.zShift;
    out.nx[j] = p.tz[j];
    out.nz[j] = m.flip ? p.tx[j] : -p.tx[j];
    let d: number;
    if (src.kind === 'E') {
      d = 0;
      for (let k = 0; k < m.signals; k++) d += src.drive[k] * m.free[k * nc + j];
      d *= EPS0 * MM;
    } else d = C0 * EPS0 * MM * src.s[j];
    out.density[j] = d;
    out.total[p.cond[j]] += d * p.len[j] / MM;
  }
  return out;
}

// ---- Grids ----

export interface View { x0: number; x1: number; z0: number; z1: number; nx: number; ny: number } // grid points at x0 + i·(x1 − x0)/(nx − 1)

export interface GridOptions { coarse?: number; near?: number }

export interface FieldGrid {
  kind: FieldKind;
  view: View;
  step: number; // the finest lattice evaluated so far (grid points); 1 when done
  done: boolean;
  phi: Float32Array; // φ (V) or Az (Wb/m)
  fx: Float32Array; // Ex, Ez (V/m) or Hx, Hz (A/m)
  fz: Float32Array;
  cls: Int16Array; // class per point (Media), copper < 0
  eps: Float64Array; // εr per material class
  evaluated: number; // points evaluated directly so far
  ms: number;
}

/** A grid's |E| or |H|, D magnitude (D: ε0·εr·|E|), or any per-point combination, as a new array. */
export function magnitude(g: FieldGrid, d = false): Float32Array {
  const n = g.phi.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = Math.hypot(g.fx[i], g.fz[i]);
    out[i] = d ? (g.cls[i] < 0 ? 0 : v * EPS0 * g.eps[g.cls[i]]) : v;
  }
  return out;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * The field on a view's grid, progressive: yields after the coarsest lattice (the first picture) and after each
 * halving of its spacing, every time a whole grid (points not evaluated yet interpolated from the lattice so far);
 * the return value is the final grid. opt.coarse: the first lattice's spacing in grid points (a power of two, default
 * 8); opt.near: NEAR.
 */
export function* fieldGrid(src: Source, view: View, opt: GridOptions = {}): Generator<FieldGrid, FieldGrid> {
  const t0 = now();
  const { nx, ny } = view;
  const n = nx * ny;
  const media = src.model.media;
  if (!media) throw new Error('A grid needs the media of the section.');
  src = forView(src, view);
  const dx = nx > 1 ? (view.x1 - view.x0) / (nx - 1) : 1;
  const dz = ny > 1 ? (view.z1 - view.z0) / (ny - 1) : 1;
  const cls = new Int16Array(n);
  for (let j = 0; j < ny; j++) media.row(view.z0 + j * dz, view.x0, dx, nx, cls, j * nx);
  // prefix sums of "the class changes to the right or above"
  const W = nx + 1;
  const S = new Int32Array(W * (ny + 1));
  for (let j = 0; j < ny; j++) {
    let acc = 0;
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const c = cls[k];
      if ((i + 1 < nx && cls[k + 1] !== c) || (j + 1 < ny && cls[k + nx] !== c)) acc++;
      S[(j + 1) * W + i + 1] = S[j * W + i + 1] + acc;
    }
  }
  const changes = (i0: number, i1: number, j0: number, j1: number) => S[(j1 + 1) * W + i1 + 1] - S[j0 * W + i1 + 1] - S[(j1 + 1) * W + i0] + S[j0 * W + i0];
  const phi = new Float32Array(n), fx = new Float32Array(n), fz = new Float32Array(n);
  const known = new Uint8Array(n);
  const near = opt.near ?? NEAR;
  let h = 1;
  while (h * 2 <= (opt.coarse ?? 8)) h *= 2;
  const o = [0, 0, 0];
  let evaluated = 0;
  const evalAt = (k: number, i: number, j: number) => {
    const c = cls[k];
    evalField(src, view.x0 + i * dx, view.z0 + j * dz, o, c);
    if (c >= 0) evaluated++;
    phi[k] = o[0]; fx[k] = o[1]; fz[k] = o[2]; known[k] = 1;
  };
  const onLattice = (i: number, H: number, last: number) => i % H === 0 || i === last;
  const interp = (k: number, i: number, j: number, H: number, P0: Float32Array, F0: Float32Array, F1: Float32Array, out0: Float32Array, out1: Float32Array, out2: Float32Array) => {
    const i0 = i - (i % H), j0 = j - (j % H);
    const i1 = Math.min(i0 + H, nx - 1), j1 = Math.min(j0 + H, ny - 1);
    const a = i1 > i0 ? (i - i0) / (i1 - i0) : 0, b = j1 > j0 ? (j - j0) / (j1 - j0) : 0;
    const k00 = j0 * nx + i0, k10 = j0 * nx + i1, k01 = j1 * nx + i0, k11 = j1 * nx + i1;
    const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
    out0[k] = w00 * P0[k00] + w10 * P0[k10] + w01 * P0[k01] + w11 * P0[k11];
    out1[k] = w00 * F0[k00] + w10 * F0[k10] + w01 * F0[k01] + w11 * F0[k11];
    out2[k] = w00 * F1[k00] + w10 * F1[k10] + w01 * F1[k01] + w11 * F1[k11];
  };
  // vertices in grid units
  const nv = media.vertices.length / 2;
  const vi = new Float64Array(nv), vj = new Float64Array(nv);
  for (let v = 0; v < nv; v++) { vi[v] = (media.vertices[2 * v] - view.x0) / dx; vj[v] = (media.vertices[2 * v + 1] - view.z0) / dz; }
  const mark = new Uint8Array(n);
  const snapshot = (H: number, done: boolean): FieldGrid => {
    let P0 = phi, F0 = fx, F1 = fz;
    if (!done) {
      P0 = phi.slice(); F0 = fx.slice(); F1 = fz.slice();
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (known[k]) continue;
        if (cls[k] < 0) { const pot = src.pot[-1 - cls[k]] ?? 0; P0[k] = src.kind === 'E' ? pot : pot / C0; F0[k] = 0; F1[k] = 0; continue; }
        interp(k, i, j, H, phi, fx, fz, P0, F0, F1);
      }
    }
    return { kind: src.kind, view, step: H, done, phi: P0, fx: F0, fz: F1, cls, eps: media.eps, evaluated, ms: now() - t0 };
  };
  // the coarsest lattice
  for (let j = 0; j < ny; j++) {
    if (!onLattice(j, h, ny - 1)) continue;
    for (let i = 0; i < nx; i++) if (onLattice(i, h, nx - 1)) evalAt(j * nx + i, i, j);
  }
  if (h === 1) return snapshot(1, true);
  yield snapshot(h, false);
  while (h > 1) {
    const H = h;
    h = H / 2;
    // corners: mark lattice-h points within near·H of a vertex
    const rad = near * H;
    for (let v = 0; v < nv; v++) {
      const ia = Math.max(0, Math.ceil(vi[v] - rad)), ib = Math.min(nx - 1, Math.floor(vi[v] + rad));
      const ja = Math.max(0, Math.ceil(vj[v] - rad)), jb = Math.min(ny - 1, Math.floor(vj[v] + rad));
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) mark[j * nx + i] = h;
    }
    for (let j = 0; j < ny; j++) {
      if (!onLattice(j, h, ny - 1)) continue;
      const j0 = j - (j % H), j1 = Math.min(j0 + H, ny - 1);
      for (let i = 0; i < nx; i++) {
        if (!onLattice(i, h, nx - 1)) continue;
        const k = j * nx + i;
        if (known[k]) continue;
        const c = cls[k];
        if (c < 0) { const pot = src.pot[-1 - c] ?? 0; phi[k] = src.kind === 'E' ? pot : pot / C0; fx[k] = 0; fz[k] = 0; known[k] = 1; continue; }
        const i0 = i - (i % H), i1 = Math.min(i0 + H, nx - 1);
        if (mark[k] === h || changes(i0, i1, j0, j1) > 0) evalAt(k, i, j);
        else { interp(k, i, j, H, phi, fx, fz, phi, fx, fz); known[k] = 1; }
      }
    }
    if (h > 1) yield snapshot(h, false);
  }
  return snapshot(1, true);
}

/** Runs a progressive grid to the end. */
export function fieldGridFull(src: Source, view: View, opt: GridOptions = {}): FieldGrid {
  const g = fieldGrid(src, view, opt);
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

/** A view of a section's whole box with nx points across (ny from the aspect). */
export function sectionView(sec: Section, nx: number, pad = 0): View {
  const x0 = -sec.ext - pad, x1 = sec.ext + pad, z0 = sec.zLo - pad, z1 = sec.zHi + pad;
  return { x0, x1, z0, z1, nx, ny: Math.max(2, Math.round(((nx - 1) * (z1 - z0)) / (x1 - x0)) + 1) };
}
