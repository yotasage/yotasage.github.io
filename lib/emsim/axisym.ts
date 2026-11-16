// The axisymmetric (r, z) boundary-element solver (engine.md §5, solver.md §4, step M1.6): bodies of revolution about
// a via's axis (barrel, pads, plane annuli with their antipads, dielectric layer boundaries, a grounded coaxial wall
// at R_w between the planes), solved for the free charge of the via, and from it the excess capacitance of every
// plane and pad crossing (z windows); the solution is kept for the side view's field (`axiField`, `axiGrid`).
//
// Formulation: piecewise constant total charge density s = σ/ε0 on straight panels of the generating lines,
// collocation at the panel midpoints. Conductor rows: φ = V. Interface rows (normal n into εP): s − λ·∂nφ_pv = 0 with
// λ = 2(εP − εM)/(εP + εM), scaled to a unit diagonal. Kernel: a ring of total charge q at (r′, z′) gives
// φ = q·K(k)/(2π²ε0·R₊), so a panel gives φ = (1/π)·∫ s·r′·K(k)/R₊ dl′ (lengths in mm, s in V/mm). Self panel: the
// log part c·ln|s| integrated in closed form and the rest by 8-point Gauss on s = h·u² (each half); panels nearer
// than 1.5 lengths: bisected until every piece is 1.5 piece lengths away, 8-point Gauss per piece; 4-point Gauss to
// 6 lengths, 2-point beyond (measured against 8 points everywhere by the harness). No Node APIs.

import { EPS0, worse } from './bem2d';
import type { Estimate, Status } from './bem2d';
import { luFactor, luSolve } from './linalg';
import { fillSide, layerIndex, neighbour, stackZ } from './stackup';
import type { DielectricLayer, Stackup } from './stackup';
import type { ViaStructure } from './via';

export const AXI_VERSION = 1;
export const AXI_LEVEL = 1; // default level (the via's mesh rules give about 300 panels for a 6-layer via at level 1)
export const AXI_RW_FACTOR = 4; // R_w = largest antipad + 4 × the thickest dielectric between the planes

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const INV_PI = 1 / Math.PI;

// ---------- complete elliptic integrals ----------

// K(k) and E(k) by the AGM (facts.md §8) from k′ formed directly and k² (both from the geometry, never 1 − k²).
// Leaves K in KV and the series Σ 2^{n−1}·c_n² in SV, so that E = K·(1 − SV) and E − K = −K·SV without cancellation.
let KV = 0;
let SV = 0;
function ke(kp: number, k2: number): void {
  let a = 1;
  let g = kp;
  let p = 0.5;
  let sum = 0.5 * k2;
  for (let it = 0; it < 40; it++) {
    const c = 0.5 * (a - g);
    if (Math.abs(c) <= 4e-16 * a) break;
    const an = 0.5 * (a + g);
    g = Math.sqrt(a * g);
    a = an;
    p *= 2;
    sum += p * c * c;
  }
  KV = Math.PI / (2 * a);
  SV = sum;
}

// [K, E] of modulus k given k′ = √(1 − k²) and k² separately.
export function ellipKE(kp: number, k2: number = 1 - kp * kp): [number, number] {
  ke(kp, k2);
  return [KV, KV * (1 - SV)];
}

// The ring kernel K(k)/R₊ at (r, z) of a ring at (rp, zp), and its derivatives by r and z (mm⁻¹, mm⁻²): the
// potential of a ring of total charge q is q/(2π²ε0)·K/R₊. Into out[0..2].
export function ringKernel(r: number, z: number, rp: number, zp: number, out: Float64Array | number[]): void {
  const dr = r - rp;
  const dz = z - zp;
  const sr = r + rp;
  const Rp2 = sr * sr + dz * dz;
  const Rm2 = dr * dr + dz * dz;
  const Rp = Math.sqrt(Rp2);
  ke(Math.sqrt(Rm2 / Rp2), (4 * r * rp) / Rp2);
  const E = KV * (1 - SV);
  out[0] = KV / Rp;
  out[1] = (-dr * E) / (Rp * Rm2) + (r > 0 ? (-KV * SV) / (2 * r * Rp) : 0);
  out[2] = (-dz * E) / (Rp * Rm2);
}

// ---------- geometry and mesh ----------

// A straight piece of a generating line: conductor (cond ≥ 0; 0 ground, 1 the via) facing εC, or an interface
// between εP (on the side of the normal (tz, −tr)) and εM. n: panels at level 1; qa, qb: grading exponents at the
// ends (1 uniform, 2 quadratic towards that end).
export interface AxiEdge { ar: number; az: number; br: number; bz: number; cond: number; epsC: number; epsP: number; epsM: number; n: number; qa: number; qb: number }

export function axiConductor(ar: number, az: number, br: number, bz: number, cond: number, epsC: number, n = 2, qa = 2, qb = 2): AxiEdge {
  return { ar, az, br, bz, cond, epsC, epsP: epsC, epsM: epsC, n, qa, qb };
}
export function axiInterface(ar: number, az: number, br: number, bz: number, epsP: number, epsM: number, n = 2, qa = 2, qb = 2): AxiEdge {
  return { ar, az, br, bz, cond: -1, epsC: 0, epsP, epsM, n, qa, qb };
}

// Panels as a structure of arrays; g2/g4: precomputed 2- and 4-point Gauss nodes (r, z, weight·r′·len/2/π).
export interface AxiPanels {
  n: number;
  ar: Float64Array; az: Float64Array; br: Float64Array; bz: Float64Array;
  mr: Float64Array; mz: Float64Array; len: Float64Array; tr: Float64Array; tz: Float64Array;
  cond: Int32Array; epsC: Float64Array; lam: Float64Array; area: Float64Array; edge: Int32Array;
  g2: Float64Array; g4: Float64Array; g8: Float64Array;
}

const X2 = [-0.5773502691896257, 0.5773502691896257];
const W2 = [1, 1];
const X4 = [-0.8611363115940526, -0.3399810435848563, 0.3399810435848563, 0.8611363115940526];
const W4 = [0.3478548451374538, 0.6521451548625461, 0.6521451548625461, 0.3478548451374538];
const X8 = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const W8 = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
// The same 8 points on [0, 1] (the self panel's u).
const U8 = X8.map((x) => 0.5 * (1 + x));
const V8 = W8.map((w) => 0.5 * w);

function grade(u: number, qa: number, qb: number): number {
  return u < 0.5 ? 0.5 * Math.pow(2 * u, qa) : 1 - 0.5 * Math.pow(2 * (1 - u), qb);
}

export function meshAxi(edges: AxiEdge[], M: number): AxiPanels {
  const seg: number[][] = [];
  for (let e = 0; e < edges.length; e++) {
    const E = edges[e];
    const m = Math.max(1, Math.round(E.n * M));
    let t0 = 0;
    for (let k = 1; k <= m; k++) {
      const t1 = k === m ? 1 : grade(k / m, E.qa, E.qb);
      seg.push([e, t0, t1]);
      t0 = t1;
    }
  }
  const n = seg.length;
  const F = () => new Float64Array(n);
  const p: AxiPanels = {
    n, ar: F(), az: F(), br: F(), bz: F(), mr: F(), mz: F(), len: F(), tr: F(), tz: F(), cond: new Int32Array(n), epsC: F(), lam: F(), area: F(), edge: new Int32Array(n),
    g2: new Float64Array(6 * n), g4: new Float64Array(12 * n), g8: new Float64Array(24 * n),
  };
  for (let i = 0; i < n; i++) {
    const [e, t0, t1] = seg[i];
    const E = edges[e];
    const dr = E.br - E.ar;
    const dz = E.bz - E.az;
    const ar = E.ar + t0 * dr, az = E.az + t0 * dz, br = E.ar + t1 * dr, bz = E.az + t1 * dz;
    const L = Math.hypot(br - ar, bz - az);
    p.ar[i] = ar; p.az[i] = az; p.br[i] = br; p.bz[i] = bz;
    p.mr[i] = 0.5 * (ar + br); p.mz[i] = 0.5 * (az + bz); p.len[i] = L;
    p.tr[i] = (br - ar) / L; p.tz[i] = (bz - az) / L;
    p.cond[i] = E.cond; p.epsC[i] = E.epsC; p.edge[i] = e;
    p.lam[i] = E.cond < 0 ? (2 * (E.epsP - E.epsM)) / (E.epsP + E.epsM) : 0;
    p.area[i] = 2 * Math.PI * L * p.mr[i];
    const put = (g: Float64Array, X: number[], W: number[]) => {
      for (let k = 0; k < X.length; k++) {
        const t = 0.5 * (1 + X[k]);
        const rp = ar + t * (br - ar);
        const o = 3 * (i * X.length + k);
        g[o] = rp; g[o + 1] = az + t * (bz - az); g[o + 2] = W[k] * 0.5 * L * rp * INV_PI;
      }
    };
    put(p.g2, X2, W2); put(p.g4, X4, W4); put(p.g8, X8, W8);
  }
  return p;
}

// ---------- panel integrals ----------

const FAR2 = 36; // (6 panel lengths)²: 2-point Gauss beyond
const NEAR2 = 2.25; // (1.5 lengths)²: bisected below
let ACC0 = 0, ACC1 = 0, ACC2 = 0;

// Adds w·K/R₊ (and its gradient when grad) at (r, z) from a ring at (rp, zp).
function addPoint(r: number, z: number, rp: number, zp: number, w: number, grad: boolean): void {
  const dr = r - rp;
  const dz = z - zp;
  const sr = r + rp;
  const Rp2 = sr * sr + dz * dz;
  const Rm2 = dr * dr + dz * dz;
  if (Rm2 <= 1e-28 * Rp2) return; // a quadrature node on the field point (field grids only)
  const Rp = Math.sqrt(Rp2);
  ke(Math.sqrt(Rm2 / Rp2), (4 * r * rp) / Rp2);
  ACC0 += (w * KV) / Rp;
  if (grad) {
    const t = (KV * (1 - SV)) / (Rp * Rm2);
    ACC1 += w * (-dr * t + (r > 0 ? (-KV * SV) / (2 * r * Rp) : 0));
    ACC2 += w * (-dz * t);
  }
}

function addRule(g: Float64Array, o: number, m: number, r: number, z: number, grad: boolean): void {
  for (let k = 0; k < m; k++, o += 3) addPoint(r, z, g[o], g[o + 1], g[o + 2], grad);
}

function nearPiece(p: AxiPanels, j: number, r: number, z: number, t0: number, t1: number, grad: boolean, depth: number): void {
  const ar = p.ar[j], az = p.az[j];
  const dr = p.br[j] - ar, dz = p.bz[j] - az;
  const tm = 0.5 * (t0 + t1);
  const pl = p.len[j] * (t1 - t0);
  const er = r - (ar + tm * dr), ez = z - (az + tm * dz);
  if (er * er + ez * ez >= NEAR2 * pl * pl || depth >= 40) {
    const h = 0.5 * (t1 - t0);
    for (let k = 0; k < 8; k++) {
      const t = tm + h * X8[k];
      const rp = ar + t * dr;
      addPoint(r, z, rp, az + t * dz, W8[k] * 0.5 * pl * rp * INV_PI, grad);
    }
    return;
  }
  nearPiece(p, j, r, z, t0, tm, grad, depth + 1);
  nearPiece(p, j, r, z, tm, t1, grad, depth + 1);
}

// Panel j's (1/π)∫r′K/R₊ dl′ and gradient at (r, z) (not on panel j's midpoint), added to ACC0..2. g8: 8 points
// wherever the piece is not bisected (the harness's reference rule).
function panelAt(p: AxiPanels, j: number, r: number, z: number, grad: boolean, g8: boolean): void {
  const er = r - p.mr[j], ez = z - p.mz[j];
  const d2 = er * er + ez * ez;
  const L2 = p.len[j] * p.len[j];
  if (d2 > NEAR2 * L2) {
    if (g8) addRule(p.g8, 24 * j, 8, r, z, grad);
    else if (d2 > FAR2 * L2) addRule(p.g2, 6 * j, 2, r, z, grad);
    else addRule(p.g4, 12 * j, 4, r, z, grad);
  } else nearPiece(p, j, r, z, 0, 1, grad, 0);
}

// The self panel at its midpoint: P = (1/π)∫r′K/R₊ dl′ and the principal value of its normal derivative D (the
// n·Δ term vanishes on the panel's own line). Each half of length h: c·(h ln h − h) + ∫(f − c ln s) ds, s = h·u².
function selfPD(p: AxiPanels, i: number, out: Float64Array): void {
  const r = p.mr[i], z = p.mz[i];
  const tr = p.tr[i], tz = p.tz[i];
  const nr = tz;
  const h = 0.5 * p.len[i];
  const cP = -0.5 * INV_PI;
  const cD = nr / (4 * Math.PI * r);
  const logPart = h * Math.log(h) - h;
  let P = 2 * cP * logPart;
  let D = 2 * cD * logPart;
  for (let side = -1; side <= 1; side += 2) {
    for (let k = 0; k < 8; k++) {
      const u = U8[k];
      const s = h * u * u;
      const ds = V8[k] * 2 * h * u;
      const rp = r + side * s * tr;
      const zp = z + side * s * tz;
      const dr = r - rp, dz = z - zp, sr = r + rp;
      const Rp2 = sr * sr + dz * dz;
      const Rp = Math.sqrt(Rp2);
      ke(Math.sqrt((dr * dr + dz * dz) / Rp2), (4 * r * rp) / Rp2);
      const ls = Math.log(s);
      P += ds * ((rp * KV) / (Math.PI * Rp) - cP * ls);
      D += ds * ((-rp * nr * KV * SV) / (2 * Math.PI * r * Rp) - cD * ls);
    }
  }
  out[0] = P;
  out[1] = D;
}

// ---------- solve ----------

export interface AxiLevel {
  M: number;
  mesh: AxiPanels;
  s: Float64Array; // total charge density σ/ε0 (V/mm) per panel for V = 1 on conductor `signal`, 0 on the others
  signal: number;
  pivot: number;
  ms: { mesh: number; assemble: number; lu: number; total: number };
}

export interface AxiSolveOptions { signal?: number; gauss8?: boolean }

export function solveAxiLevel(edges: AxiEdge[], M: number, opt: AxiSolveOptions = {}): AxiLevel | string {
  const t0 = now();
  const p = meshAxi(edges, M);
  const t1 = now();
  const n = p.n;
  const sig = opt.signal ?? 1;
  const g8 = !!opt.gauss8;
  const A = new Float64Array(n * n);
  const b = new Float64Array(n);
  const sd = new Float64Array(2);
  for (let i = 0; i < n; i++) {
    const r = p.mr[i], z = p.mz[i];
    const row = i * n;
    if (p.cond[i] >= 0) {
      for (let j = 0; j < n; j++) {
        if (j === i) { selfPD(p, i, sd); A[row + j] = sd[0]; continue; }
        ACC0 = 0;
        panelAt(p, j, r, z, false, g8);
        A[row + j] = ACC0;
      }
      b[i] = p.cond[i] === sig ? 1 : 0;
    } else {
      const lam = p.lam[i], nr = p.tz[i], nz = -p.tr[i];
      for (let j = 0; j < n; j++) {
        if (j === i) { selfPD(p, i, sd); A[row + j] = 1 - lam * sd[1]; continue; }
        ACC0 = 0; ACC1 = 0; ACC2 = 0;
        panelAt(p, j, r, z, true, g8);
        A[row + j] = -lam * (nr * ACC1 + nz * ACC2);
      }
    }
  }
  const t2 = now();
  const piv = new Int32Array(n);
  const pivot = luFactor(A, n, piv);
  if (!(pivot > 1e-14)) return `The axisymmetric matrix is singular (pivot ratio ${pivot}).`;
  luSolve(A, n, piv, b, 1);
  const t3 = now();
  return { M, mesh: p, s: b, signal: sig, pivot, ms: { mesh: t1 - t0, assemble: t2 - t1, lu: t3 - t2, total: t3 - t0 } };
}

// Free charge per panel (F, for 1 V) of the panels of conductor `cond`: ε0·εC·s·area (mm → m).
export function freeChargesAxi(lv: AxiLevel, cond = lv.signal): Float64Array {
  const p = lv.mesh;
  const q = new Float64Array(p.n);
  for (let j = 0; j < p.n; j++) if (p.cond[j] === cond) q[j] = EPS0 * 1e-3 * p.epsC[j] * lv.s[j] * p.area[j];
  return q;
}

// The capacitance (F) of conductor `cond` (the sum of its free charge for 1 V on the signal).
export function axiCharge(lv: AxiLevel, cond = lv.signal): number {
  const q = freeChargesAxi(lv, cond);
  let Q = 0;
  for (let j = 0; j < q.length; j++) Q += q[j];
  return Q;
}

// ---------- fields (side view, M3.2) ----------

// φ (V for 1 V on the via) and E (V/m) at (r, z) in mm, into out[0..2] = [φ, Er, Ez]. On the axis Er = 0.
export function axiField(lv: AxiLevel, r: number, z: number, out: Float64Array | number[]): void {
  const p = lv.mesh;
  let phi = 0, gr = 0, gz = 0;
  for (let j = 0; j < p.n; j++) {
    ACC0 = 0; ACC1 = 0; ACC2 = 0;
    panelAt(p, j, r, z, true, false);
    const s = lv.s[j];
    phi += ACC0 * s; gr += ACC1 * s; gz += ACC2 * s;
  }
  out[0] = phi;
  out[1] = r > 0 ? -gr * 1e3 : 0;
  out[2] = -gz * 1e3;
}

export interface AxiView { r0: number; r1: number; z0: number; z1: number }
export interface AxiGrid { nr: number; nz: number; view: AxiView; phi: Float32Array; er: Float32Array; ez: Float32Array }

// φ and E on nr × nz points (row-major from z0, r0), cell centres of the view. Direct sums over all panels
// (about 2 μs per point and 100 panels; M3.2 may add the multipole trees of fields.ts).
export function axiGrid(lv: AxiLevel, view: AxiView, nr: number, nz: number): AxiGrid {
  const phi = new Float32Array(nr * nz), er = new Float32Array(nr * nz), ez = new Float32Array(nr * nz);
  const o = [0, 0, 0];
  for (let jz = 0; jz < nz; jz++) {
    const z = view.z0 + ((jz + 0.5) * (view.z1 - view.z0)) / nz;
    for (let ir = 0; ir < nr; ir++) {
      const r = view.r0 + ((ir + 0.5) * (view.r1 - view.r0)) / nr;
      axiField(lv, r, z, o);
      const k = jz * nr + ir;
      phi[k] = o[0]; er[k] = o[1]; ez[k] = o[2];
    }
  }
  return { nr, nz, view, phi, er, ez };
}

// ---------- the via in (r, z) ----------

export interface ViaSlab { zLo: number; zHi: number; er: number }
// One crossing: a copper layer the barrel passes with a pad (radius > barrel) or a plane (antipad radius ≥ 0).
export interface ViaCrossingGeom { layer: string; zLo: number; zHi: number; pad: number; antipad: number }
export interface ViaPlane { layer: string; zLo: number; zHi: number; r0: number }
export interface ViaLayout {
  ok: boolean;
  reason: string;
  a: number; // barrel radius (drill / 2: plating grows inwards)
  zTop: number; zBot: number; // the barrel's ends after backdrilling (mm, stackZ's frame)
  crossings: ViaCrossingGeom[]; // top to bottom
  planes: ViaPlane[]; // top to bottom; r0 = antipad radius (0: no opening, a plane the barrel does not reach)
  slabs: ViaSlab[]; // bottom to top, equal εr merged; copper layers take the εr of the material filling their gaps
}

// εr along z: dielectrics their own, copper the fill side's dielectric (air on an outer layer), masks air (the
// axisymmetric solve leaves the mask out: notes-M1.6.md).
export function viaSlabs(s: Stackup): ViaSlab[] {
  const z = stackZ(s);
  const out: ViaSlab[] = [];
  for (let i = s.layers.length - 1; i >= 0; i--) {
    const l = s.layers[i];
    let er = 1;
    if (l.kind === 'dielectric') er = l.er.v;
    else if (l.kind === 'copper') {
      const j = neighbour(s, i, fillSide(s, i) === 'up' ? -1 : 1);
      er = j >= 0 ? (s.layers[j] as DielectricLayer).er.v : 1;
    }
    const lo = z[i + 1], hi = z[i];
    if (!(hi > lo)) continue;
    const last = out[out.length - 1];
    if (last && last.er === er) last.zHi = hi;
    else out.push({ zLo: lo, zHi: hi, er });
  }
  return out;
}

function erAt(slabs: ViaSlab[], z: number): number {
  for (const s of slabs) if (z >= s.zLo && z < s.zHi) return s.er;
  return 1;
}

const TOL = 1e-9;

export function viaLayout(s: Stackup, v: ViaStructure): ViaLayout {
  const bad = (reason: string): ViaLayout => ({ ok: false, reason, a: 0, zTop: 0, zBot: 0, crossings: [], planes: [], slabs: [] });
  const z = stackZ(s);
  const iS = layerIndex(s, v.start), iE = layerIndex(s, v.end);
  if (iS < 0 || iE < 0 || iE < iS) return bad('The via\'s start and end layers are not in the stackup, top to bottom.');
  const a = v.drill.v / 2;
  if (!(a > 0)) return bad('The drill diameter must be above 0.');
  let zTop = z[iS], zBot = z[iE + 1];
  if (v.backdrill) {
    if (v.backdrill.side === 'top') zTop = Math.min(zTop, z[0] - v.backdrill.depth.v);
    else zBot = Math.max(zBot, v.backdrill.depth.v);
  }
  if (!(zTop - zBot > TOL)) return bad('Nothing of the barrel is left after backdrilling.');
  const apOf = (id: string): number => {
    const ap = v.antipads.find((x) => x.layer === id);
    return ap ? ap.d.v / 2 : NaN;
  };
  const crossings: ViaCrossingGeom[] = [];
  const planes: ViaPlane[] = [];
  for (let i = 0; i < s.layers.length; i++) {
    const l = s.layers[i];
    if (l.kind !== 'copper') continue;
    const zLo = z[i + 1], zHi = z[i];
    const isPlane = v.planes.includes(l.id);
    const crossed = i >= iS && i <= iE && zLo >= zBot - TOL && zHi <= zTop + TOL;
    if (isPlane) {
      const r0 = apOf(l.id);
      if (crossed && !(r0 > a)) return bad(`The plane ${l.id} needs an antipad larger than the drill.`);
      planes.push({ layer: l.id, zLo, zHi, r0: r0 > 0 ? r0 : 0 });
    }
    if (!crossed) continue;
    const pd = v.pads.find((x) => x.layer === l.id);
    const pad = pd && pd.d && pd.d.v / 2 > a + TOL ? pd.d.v / 2 : 0;
    if (isPlane && pad > 0 && pad >= apOf(l.id) - TOL) return bad(`The pad on ${l.id} reaches its antipad.`);
    if (pad > 0 || isPlane) crossings.push({ layer: l.id, zLo, zHi, pad, antipad: isPlane ? apOf(l.id) : -1 });
  }
  if (!planes.length) return bad('The via has no reference plane: the axisymmetric solve needs one.');
  if (!crossings.length) return bad('The barrel passes no pad or plane.');
  return { ok: true, reason: '', a, zTop, zBot, crossings, planes, slabs: viaSlabs(s) };
}

// R_w and the mesh's base length h0 for a layout.
export function viaWall(L: ViaLayout, factor = AXI_RW_FACTOR): { Rw: number; h0: number } {
  let rMax = L.a;
  for (const c of L.crossings) rMax = Math.max(rMax, c.pad, c.antipad);
  for (const p of L.planes) rMax = Math.max(rMax, p.r0);
  const zLo = Math.min(...L.planes.map((p) => p.zLo));
  const zHi = Math.max(...L.planes.map((p) => p.zHi));
  // The thickest dielectric gap between copper faces within the planes' span (one plane: the slabs next to it).
  let hmax = 0;
  let gmin = Infinity;
  const faces: number[] = [];
  for (const p of L.planes) faces.push(p.zLo, p.zHi);
  for (const c of L.crossings) faces.push(c.zLo, c.zHi);
  faces.sort((x, y) => x - y);
  for (let k = 1; k < faces.length; k++) {
    const g = faces[k] - faces[k - 1];
    if (g < 1e-6) continue;
    const mid = 0.5 * (faces[k] + faces[k - 1]);
    const inCopper = L.planes.some((p) => mid > p.zLo && mid < p.zHi) || L.crossings.some((c) => mid > c.zLo && mid < c.zHi);
    if (inCopper) continue;
    gmin = Math.min(gmin, g);
    if ((mid > zLo && mid < zHi) || L.planes.length === 1) hmax = Math.max(hmax, g);
  }
  if (!(hmax > 0)) hmax = Math.max(L.zTop - L.zBot, 0.1);
  if (!isFinite(gmin)) gmin = hmax;
  let rmin = L.a;
  for (const c of L.crossings) {
    if (c.pad > 0) rmin = Math.min(rmin, c.pad - L.a);
    if (c.antipad > 0) rmin = Math.min(rmin, c.antipad - Math.max(c.pad, L.a));
  }
  return { Rw: rMax + factor * hmax, h0: 0.5 * Math.min(rmin, gmin) };
}

// Panels at level 1 on an edge of length len: 2·⌈√(len/h0)⌉ (graded edges keep their end panels small).
// AXI_MESH: q the grading exponent at copper edges and triple points, scale the panel count factor (tuned in M1.6).
export const AXI_MESH = { q: 3, scale: 1 };
const count = (len: number, h0: number): number => 2 * Math.max(1, Math.ceil(AXI_MESH.scale * Math.sqrt(len / h0)));

// The edges of a via's (r, z) problem, and the window cuts (z between consecutive crossings).
export function viaEdges(L: ViaLayout, Rw: number, h0: number): { edges: AxiEdge[]; cuts: number[] } {
  const { a, zTop, zBot, slabs } = L;
  const Q = AXI_MESH.q;
  const E: AxiEdge[] = [];
  const bounds = slabs.slice(1).map((s) => s.zLo);
  const cr = L.crossings;
  const cuts: number[] = [];
  for (let k = 0; k + 1 < cr.length; k++) cuts.push(0.5 * (cr[k].zLo + cr[k + 1].zHi));
  const erUp = (z: number) => erAt(slabs, z + 1e-7);
  const erDn = (z: number) => erAt(slabs, z - 1e-7);
  // A vertical face from z0 to z1 (either order) at r, split at slab boundaries (and the cuts on the barrel).
  const vert = (r: number, z0: number, z1: number, cond: number, extra: number[] = [], nMin = 0) => {
    const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
    const pts = [lo, ...bounds.filter((b) => b > lo + TOL && b < hi - TOL), ...extra.filter((b) => b > lo + TOL && b < hi - TOL), hi].sort((x, y) => x - y);
    for (let k = 0; k + 1 < pts.length; k++) {
      const za = pts[k], zb = pts[k + 1];
      const isCut = (x: number) => extra.some((c) => Math.abs(c - x) < TOL) && !bounds.some((c) => Math.abs(c - x) < TOL);
      const n = Math.max(nMin, count(zb - za, h0));
      E.push(axiConductor(r, za, r, zb, cond, erAt(slabs, 0.5 * (za + zb)), n, isCut(za) ? 1 : Q, isCut(zb) ? 1 : Q));
    }
  };
  const horiz = (r0: number, r1: number, z: number, up: boolean, cond: number, axisEnd = false) => {
    const lo = Math.min(r0, r1), hi = Math.max(r0, r1);
    E.push(axiConductor(lo, z, hi, z, cond, up ? erUp(z) : erDn(z), count(hi - lo, h0), axisEnd && lo === 0 ? 1 : Q, Q));
  };
  // The via: barrel and pads.
  const pads = cr.filter((c) => c.pad > 0);
  let zc = zTop;
  let onBarrel = true;
  let k0 = 0;
  if (pads.length && Math.abs(pads[0].zHi - zTop) < TOL) { horiz(0, pads[0].pad, zTop, true, 1, true); onBarrel = false; }
  else horiz(0, a, zTop, true, 1, true);
  let closed = false;
  for (let k = k0; k < pads.length; k++) {
    const p = pads[k];
    if (onBarrel) {
      if (zc - p.zHi > TOL) vert(a, zc, p.zHi, 1, cuts);
      horiz(a, p.pad, p.zHi, true, 1);
    }
    vert(p.pad, p.zHi, p.zLo, 1);
    if (p.zLo - zBot > TOL) { horiz(p.pad, a, p.zLo, false, 1); onBarrel = true; zc = p.zLo; }
    else { horiz(0, p.pad, zBot, false, 1, true); closed = true; break; }
  }
  if (!closed) {
    if (zc - zBot > TOL) vert(a, zc, zBot, 1, cuts);
    horiz(0, a, zBot, false, 1, true);
  }
  // Planes, the wall between consecutive planes, the planes' end faces at R_w.
  const P = L.planes;
  for (const p of P) {
    if (p.r0 > 0) vert(p.r0, p.zHi, p.zLo, 0);
    horiz(p.r0, Rw, p.zHi, true, 0, true);
    horiz(p.r0, Rw, p.zLo, false, 0, true);
    E.push(axiConductor(Rw, p.zLo, Rw, p.zHi, 0, 1, 2, 1, 1));
  }
  for (let k = 0; k + 1 < P.length; k++) {
    const lo = P[k + 1].zHi, hi = P[k].zLo;
    if (hi - lo <= TOL) continue;
    const pts = [lo, ...bounds.filter((b) => b > lo + TOL && b < hi - TOL), hi];
    for (let j = 0; j + 1 < pts.length; j++) E.push(axiConductor(Rw, pts[j], Rw, pts[j + 1], 0, erAt(slabs, 0.5 * (pts[j] + pts[j + 1])), 2, 1, 1));
  }
  // Dielectric boundaries: horizontal interfaces over [0, R_w] minus the copper at that z (normal down: εP below).
  const walledLo = P[P.length - 1].zLo, walledHi = P[0].zHi;
  for (const zb of bounds) {
    const occ: [number, number][] = [];
    if (zb >= zBot - TOL && zb <= zTop + TOL) occ.push([0, a]);
    for (const c of pads) if (zb >= c.zLo - TOL && zb <= c.zHi + TOL) occ.push([0, c.pad]);
    for (const p of P) if (zb >= p.zLo - TOL && zb <= p.zHi + TOL) occ.push([p.r0, Rw]);
    occ.sort((x, y) => x[0] - y[0]);
    let r = 0;
    const free: [number, number][] = [];
    for (const [o0, o1] of occ) { if (o0 > r + TOL) free.push([r, o0]); r = Math.max(r, o1); }
    if (Rw > r + TOL) free.push([r, Rw]);
    const eB = erDn(zb), eA = erUp(zb);
    for (const [r0, r1] of free) E.push(axiInterface(r0, zb, r1, zb, eB, eA, count(r1 - r0, h0), r0 === 0 ? 1 : Q, Q));
  }
  // Outside the walled span the dielectric ends at R_w: vertical interfaces (normal outwards: εP = air).
  for (const s of slabs) {
    if (s.er === 1) continue;
    const parts: [number, number][] = [];
    if (s.zHi > walledHi + TOL) parts.push([Math.max(s.zLo, walledHi), s.zHi]);
    if (s.zLo < walledLo - TOL) parts.push([s.zLo, Math.min(s.zHi, walledLo)]);
    for (const [z0, z1] of parts) {
      // Skip the z of planes outside the span (none by construction: the span covers every plane).
      E.push(axiInterface(Rw, z0, Rw, z1, 1, s.er, count(z1 - z0, h0), Q, Q));
    }
  }
  return { edges: E, cuts };
}

// ---------- excess capacitance per crossing ----------

export interface ViaCrossing {
  layer: string;
  kind: 'plane' | 'pad' | 'plane+pad';
  z: number; // the copper's middle (mm)
  zLo: number; zHi: number; // the window (mm)
  q: number; // free charge of the via in the window for 1 V (F)
  line: number; // the line part: Σ 2πε0εr/ln(R_w/a)·Δz over the window's slabs (F)
  dC: number; // q − line (F): the crossing's shunt capacitance
  err: Estimate; // of dC
}

// Rw: an explicit wall radius instead of rwFactor's rule (M1.7: the coaxial equivalent of the return vias,
// `equivalentRadius` of viacut.ts, so that the line part is the cut's own C′; notes-M1.6.md).
export interface ViaAxiOptions { M?: number; estimate?: boolean; rwFactor?: number; Rw?: number; gauss8?: boolean; cache?: boolean }

export interface ViaAxiResult {
  ok: boolean;
  reason: string;
  a: number;
  Rw: number;
  h0: number;
  M: number;
  crossings: ViaCrossing[];
  total: number; // the via's whole capacitance to ground (F)
  totalErr: Estimate;
  lineC: { zLo: number; zHi: number; er: number; c: number }[]; // C′ (F/m) of the wall per slab of the barrel
  status: Status;
  levels: AxiLevel[]; // coarse to fine; the last is the result (and the side view's solution)
  edges: AxiEdge[];
  cuts: number[];
  panels: number;
  ms: number;
  cached: boolean;
  key: string;
}

// The error of the finer of two levels: half their difference (order 2 with a safety factor 1.5; the harness
// measures orders 2–3 for the whole charge from level 1/2 on and checks the estimate against level 4), and for a
// window at least the whole charge's half difference shared by the window's charge (a window's own difference can
// vanish by chance when the errors of its parts cancel), at least 10⁻⁵ of `scale`. One level: the floor, unchecked.
function estimate2(vals: number[], scale: number, share = 0): Estimate {
  const fl = 1e-5 * Math.abs(scale);
  if (vals.length < 2) return { e: fl, order: NaN, status: 'unchecked' };
  const d = Math.abs(vals[vals.length - 1] - vals[vals.length - 2]);
  return { e: Math.max(0.5 * d, share, fl), order: NaN, status: d <= fl && share <= fl ? 'converged' : 'regular' };
}

const CACHE = new Map<string, ViaAxiResult>();
const CACHE_SIZE = 24;

export function clearAxiCache(): void { CACHE.clear(); }

function axiFailed(reason: string, key = ''): ViaAxiResult {
  return { ok: false, reason, a: 0, Rw: 0, h0: 0, M: 0, crossings: [], total: 0, totalErr: { e: 0, order: NaN, status: 'unchecked' }, lineC: [], status: 'unchecked', levels: [], edges: [], cuts: [], panels: 0, ms: 0, cached: false, key };
}

// The axisymmetric solve of one via (a pair's each via alone, solver.md §5.2): every crossing's ΔC with its
// estimate (levels M/2 and M), cached by the geometry (drill, pads, antipads, stackup z and εr, options).
export function viaAxisym(s: Stackup, v: ViaStructure, opt: ViaAxiOptions = {}): ViaAxiResult {
  const t0 = now();
  const L = viaLayout(s, v);
  if (!L.ok) return axiFailed(L.reason);
  const M = opt.M ?? AXI_LEVEL;
  const est = opt.estimate !== false;
  const factor = opt.rwFactor ?? AXI_RW_FACTOR;
  const key = JSON.stringify([AXI_VERSION, L.a, L.zTop, L.zBot, L.crossings, L.planes, L.slabs, M, est, factor, opt.Rw ?? 0, !!opt.gauss8, AXI_MESH.q, AXI_MESH.scale]);
  if (opt.cache !== false) {
    const hit = CACHE.get(key);
    if (hit) {
      CACHE.delete(key);
      CACHE.set(key, hit);
      return { ...hit, cached: true, ms: now() - t0 };
    }
  }
  const wall = viaWall(L, factor);
  const h0 = wall.h0;
  let Rw = wall.Rw;
  if (opt.Rw !== undefined) {
    let rMax = L.a;
    for (const c of L.crossings) rMax = Math.max(rMax, c.pad, c.antipad);
    for (const p of L.planes) rMax = Math.max(rMax, p.r0);
    if (!(opt.Rw > rMax + h0)) return axiFailed(`The wall (r ${opt.Rw.toFixed(3)} mm) must lie outside every pad and antipad (${rMax.toFixed(3)} mm).`, key);
    Rw = opt.Rw;
  }
  const { edges, cuts } = viaEdges(L, Rw, h0);
  // Levels M/2 and M: M/4 is too coarse for the via's mesh (single panels per edge) to give an order.
  const Ms = est ? [M / 2, M] : [M];
  const levels: AxiLevel[] = [];
  for (const m of Ms) {
    const lv = solveAxiLevel(edges, m, { gauss8: opt.gauss8 });
    if (typeof lv === 'string') return axiFailed(lv, key);
    levels.push(lv);
  }
  // Windows: crossing k from cuts[k] (below) to cuts[k − 1] (above), the barrel's ends outside.
  const cr = L.crossings;
  const nC = cr.length;
  const wLo = (k: number) => (k === nC - 1 ? L.zBot : cuts[k]);
  const wHi = (k: number) => (k === 0 ? L.zTop : cuts[k - 1]);
  const lnR = Math.log(Rw / L.a);
  const lineC = L.slabs.filter((sl) => sl.zHi > L.zBot + TOL && sl.zLo < L.zTop - TOL)
    .map((sl) => ({ zLo: Math.max(sl.zLo, L.zBot), zHi: Math.min(sl.zHi, L.zTop), er: sl.er, c: (2 * Math.PI * EPS0 * sl.er) / lnR }));
  const lineOf = (lo: number, hi: number) => {
    let c = 0;
    for (const sl of lineC) c += sl.c * Math.max(0, Math.min(hi, sl.zHi) - Math.max(lo, sl.zLo)) * 1e-3;
    return c;
  };
  const perLevel = levels.map((lv) => {
    const q = freeChargesAxi(lv, 1);
    const w = new Float64Array(nC);
    let tot = 0;
    const p = lv.mesh;
    for (let j = 0; j < p.n; j++) {
      if (p.cond[j] !== 1) continue;
      tot += q[j];
      let k = 0;
      while (k < nC - 1 && p.mz[j] < cuts[k]) k++;
      w[k] += q[j];
    }
    return { w, tot };
  });
  let status: Status = 'converged';
  const crossings: ViaCrossing[] = cr.map((c, k) => {
    const lo = wLo(k), hi = wHi(k);
    const line = lineOf(lo, hi);
    const vals = perLevel.map((x) => x.w[k] - line);
    // The floor is relative to the window's charge, not to ΔC (which can be near 0).
    const fin = perLevel[perLevel.length - 1];
    const dTot = perLevel.length > 1 ? Math.abs(fin.tot - perLevel[perLevel.length - 2].tot) : 0;
    const e = estimate2(vals, fin.w[k], (0.5 * dTot * Math.abs(fin.w[k])) / Math.abs(fin.tot));
    status = worse(status, e.status);
    const kind = c.antipad >= 0 ? (c.pad > 0 ? 'plane+pad' : 'plane') : 'pad';
    return { layer: c.layer, kind, z: 0.5 * (c.zLo + c.zHi), zLo: lo, zHi: hi, q: perLevel[perLevel.length - 1].w[k], line, dC: vals[vals.length - 1], err: e } as ViaCrossing;
  });
  const totalErr = estimate2(perLevel.map((x) => x.tot), perLevel[perLevel.length - 1].tot);
  status = worse(status, totalErr.status);
  const res: ViaAxiResult = {
    ok: true, reason: '', a: L.a, Rw, h0, M, crossings, total: perLevel[perLevel.length - 1].tot, totalErr, lineC, status, levels, edges, cuts,
    panels: levels[levels.length - 1].mesh.n, ms: now() - t0, cached: false, key,
  };
  if (opt.cache !== false) {
    CACHE.set(key, res);
    while (CACHE.size > CACHE_SIZE) CACHE.delete(CACHE.keys().next().value);
  }
  return res;
}
