// Boundaries and panels of the 2D boundary-element solver (solver.md §2.4, §2.5): a cross-section (geometry.ts
// `Section`) becomes straight edges (conductor surfaces and the interfaces between different εr), each edge becomes
// panels at a refinement level M.
//
// - Grading: an edge of n panels at level 1 (n even, at least 2, ⌈length/h0⌉) gets n·M panels with nodes at
//   g(k/m), g(s) = s²/(s² + (1 − s)²), towards both ends; every node set is nested in the next level's. Per corner
//   (M1.2c, solver.md §2.5): the exponent ν of every vertex (cornerExponent) sets the grading of the edge ends there,
//   h(t) = t^q·(1 + (q − 2)(1 − t)) with q = 2/ν for interfaces and for copper faces at triple points (copper and two
//   dielectrics, ν < 0.66), at most 5; copper faces at triple points get at least 4 panels at level 1, and a ray
//   starting at such a corner twice the near panels.
// - Rays: an interface or conductor face that runs to infinity starts at its inner end, is graded with s² over
//   dNear (mNear·M panels), then grows geometrically (ratio ρ^(1/M)) to the truncation X. Rays of one side whose
//   starts lie within dNear/4 of each other share one node set from the earliest start (the mask's rays take the
//   copper's nodes: notes-M0.3.md), so thin films are panelled face to face.
// - h0 = (the smallest of conductor width, gap between conductors of a layer, 4 × copper thickness)/7; dNear = 7.5·h0;
//   X = max(100·S, 20 mm) from the centre of the copper (S the larger of its span and its height over the plane),
//   or 4b beyond the copper between two planes.
// - The planes are not edges: the kernel accounts for them (kernels.ts). The coordinates are shifted so that the
//   plane below is z = 0 (or mirrored when there is only a plane above).

import type { Section } from './geometry';
import { allocPanels } from './kernels';
import type { Kernel, Panels } from './kernels';

export const GRADE_BOTH = 0; // graded towards both ends, n·M panels
export const GRADE_RAY = 1; // a ray from a (see head)
export const GRADE_FIXED = 2; // n equal panels at every level (the caller refines the geometry itself)

export interface Edge {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cond: number; // ≥ 0: conductor id (0 ground, 1…n signals); −1: interface
  epsC: number; // conductor: εr of the medium it faces
  epsP: number; // interface: εr on the right of a → b (the normal's side)
  epsM: number; // and on the left
  grade: number;
  n: number; // GRADE_BOTH: panels at level 1 (even); GRADE_FIXED: panels at every level
  off: number; // GRADE_RAY: distance from the start of the ray's node set to a
  qa?: number; // grading exponent at a (GRADE_BOTH, and the start of a ray); 2 when absent
  qb?: number; // and at b (GRADE_BOTH)
}

export interface Boundary {
  kernel: Kernel;
  signals: number;
  edges: Edge[];
  h0: number;
  dNear: number;
  mNear: number;
  rho: number;
  X: number; // the rays' end, from the centre (information)
  zShift: number; // z of the solver's frame = (flip ? zShift − z : z − zShift)
  flip: boolean;
}

// Corner grading (M1.2c): q = kInterface/ν at interface ends, kConductor/ν at copper ends with ν < nuSing (triple
// points), at most qMax, else 2; nearTriple: the factor on the near panels of a ray that starts at a graded corner;
// nSing: the least level-1 panel count of a copper face that ends at a triple point (notes-M1.2c.md).
export const MESH_DEFAULTS = { mNear: 4, rho: 1.6, nearPerH0: 7.5, h0PerSize: 1 / 7, xFactor: 100, xMin: 20, ppBeyond: 4, kInterface: 2, qMax: 5, qCuTriple: 4, dielCorners: false, nearTriple: 2, nSing: 4 };

export function conductorEdge(ax: number, az: number, bx: number, bz: number, cond: number, epsC: number, grade = GRADE_BOTH, n = 2, off = 0): Edge {
  return { ax, az, bx, bz, cond, epsC, epsP: 1, epsM: 1, grade, n, off };
}

// A zero-thickness conductor (a sheet) between two media: epsP on the normal's side, epsM on the other. The solver
// takes each sheet panel's free charge as σ·(εP + εM)/2 + (εP − εM)·ε0·En (En the principal-value normal field at its
// midpoint), right on a dielectric surface; a conductor edge with epsP = epsM (conductorEdge) faces one medium, epsC.
export function sheetEdge(ax: number, az: number, bx: number, bz: number, cond: number, epsP: number, epsM: number, grade = GRADE_BOTH, n = 2, off = 0): Edge {
  return { ax, az, bx, bz, cond, epsC: (epsP + epsM) / 2, epsP, epsM, grade, n, off };
}

export function interfaceEdge(ax: number, az: number, bx: number, bz: number, epsP: number, epsM: number, grade = GRADE_BOTH, n = 2, off = 0): Edge {
  return { ax, az, bx, bz, cond: -1, epsC: 1, epsP, epsM, grade, n, off };
}

// Levels: 1/2, 1, 2, 4, … 64.
export function validLevel(M: number): boolean {
  for (let m = 0.5; m <= 64; m *= 2) if (m === M) return true;
  return false;
}

// Panel count of level 1 for an edge graded towards both ends.
export function bothCount(len: number, h0: number): number {
  const m = Math.max(2, Math.ceil(len / h0 - 1e-9));
  return m + (m & 1);
}

// Grading towards a corner with exponent q: nodes ~ s^q near it. q = 2 is the original s²/(s² + (1 − s)²) towards
// both ends and s² on a ray; for q ≠ 2, h(t) = t^q·(1 + (q − 2)(1 − t)) keeps the slope 2 where it meets the rest
// (the middle of an edge, the end of a ray's near part), so only the panels near the corner change.
const hq = (t: number, q: number): number => Math.pow(t, q) * (1 + (q - 2) * (1 - t));
// The half of an edge graded towards both ends: s in [0, 1/2] → [0, 1/2].
function half(s: number, q: number): number {
  if (q === 2) { const x = s * s; const y = (1 - s) * (1 - s); return x / (x + y); }
  return 0.5 * hq(2 * s, q);
}
const rayNear = (s: number, q: number): number => (q === 2 ? s * s : hq(s, q));

// Node distances from a along the edge (0 first, len last).
function nodes(e: Edge, len: number, M: number, b: Boundary, out: number[]): void {
  out.length = 0;
  if (e.grade === GRADE_FIXED) {
    for (let k = 0; k <= e.n; k++) out.push((len * k) / e.n);
    return;
  }
  if (e.grade === GRADE_BOTH) {
    const m = Math.round(e.n * M);
    const qa = e.qa || 2;
    const qb = e.qb || 2;
    for (let k = 0; k <= m; k++) {
      // from the nearer end, so that a reversed edge gets the same nodes bit for bit
      if (2 * k <= m) out.push(len * half(k / m, qa)); else out.push(len - len * half((m - k) / m, qb));
    }
    out[m] = len;
    return;
  }
  // ray: graded from its own start over dNear (its start is a corner: copper, or the mask's edge), then the
  // geometric nodes of the group, which start `off` before a
  const d = b.dNear;
  const qr = e.qa || 2;
  const mn = Math.round(b.mNear * M * (qr > 2 ? MESH_DEFAULTS.nearTriple : 1));
  if (len <= 2 * d) {
    for (let k = 0; k <= mn; k++) out.push(len * rayNear(k / mn, qr));
    out[mn] = len;
    return;
  }
  for (let k = 0; k <= mn; k++) out.push(d * rayNear(k / mn, qr));
  const lam = e.off + len;
  const k0 = Math.ceil(Math.log(lam / d) / Math.log(b.rho) - 1e-9);
  const kf = Math.round((k0 + (k0 & 1)) * M);
  let prev = d;
  let first = true;
  for (let i = 1; i <= kf; i++) {
    const p = i === kf ? len : d * Math.pow(lam / d, i / kf) - e.off;
    if (!(p > d)) continue;
    // the first shared node right after the near part: dropped when it would make a sliver
    if (first && i < kf) {
      first = false;
      const pn = d * Math.pow(lam / d, (i + 1) / kf) - e.off;
      if (p - prev < 0.25 * (pn - p)) continue;
    }
    first = false;
    out.push(p);
    prev = p;
  }
}

// The panels of a boundary at level M: conductors first, interfaces with εP = εM dropped. vacuum: conductors only.
export function meshBoundary(b: Boundary, M: number, vacuum = false): Panels {
  const tmp: number[] = [];
  const ax: number[] = [];
  const az: number[] = [];
  const bx: number[] = [];
  const bz: number[] = [];
  const cond: number[] = [];
  const eC: number[] = [];
  const eP: number[] = [];
  const eM: number[] = [];
  let nc = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (const e of b.edges) {
      if ((pass === 0) !== (e.cond >= 0)) continue;
      if (pass === 1 && (vacuum || e.epsP === e.epsM)) continue;
      const dx = e.bx - e.ax;
      const dz = e.bz - e.az;
      const len = Math.hypot(dx, dz);
      if (!(len > 0)) continue;
      const tx = dx / len;
      const tz = dz / len;
      nodes(e, len, M, b, tmp);
      for (let k = 0; k + 1 < tmp.length; k++) {
        const s0 = tmp[k];
        const s1 = tmp[k + 1];
        ax.push(e.ax + s0 * tx); az.push(e.az + s0 * tz);
        bx.push(k + 2 === tmp.length ? e.bx : e.ax + s1 * tx); bz.push(k + 2 === tmp.length ? e.bz : e.az + s1 * tz);
        cond.push(e.cond); eC.push(vacuum ? 1 : e.epsC); eP.push(e.epsP); eM.push(e.epsM);
      }
    }
    if (pass === 0) nc = ax.length;
  }
  const N = ax.length;
  const p = allocPanels(N);
  p.nc = nc;
  for (let i = 0; i < N; i++) {
    const dx = bx[i] - ax[i];
    const dz = bz[i] - az[i];
    const L = Math.hypot(dx, dz);
    p.ax[i] = ax[i]; p.az[i] = az[i]; p.len[i] = L; p.tx[i] = dx / L; p.tz[i] = dz / L;
    p.mx[i] = (ax[i] + bx[i]) / 2; p.mz[i] = (az[i] + bz[i]) / 2;
    p.cond[i] = cond[i]; p.epsC[i] = eC[i]; p.epsP[i] = eP[i]; p.epsM[i] = eM[i];
  }
  return p;
}

// --- From a Section ---

interface Atom { a: number; b: number; poly: number }
interface Kept { a: number; b: number; cond: number; epsC: number; epsP: number; epsM: number; far: boolean }

export interface SectionBoundary { boundary: Boundary | null; reason: string }

/**
 * A key of a section as `sectionBoundary` reads it (BL197): its frame (z from the plane; a lone plane above flipped
 * below; between two planes or with none, the lesser key of the section and its mirror image), the kernel, the side
 * walls, the signals, every polygon as a ring from its least vertex with coordinates to 1e-12 mm (conductors with id,
 * sideways openness and the rank of their layer, regions with εr), sorted. Two sections with the same key are the same
 * problem (a trace and its mirror image through a symmetric stackup), solved alike to rounding; sections that differ
 * by more than 1e-12 mm never share one.
 */
export function sectionKey(sec: Section): string {
  if (sec.planeBelow != null && sec.planeAbove != null) {
    // Between two planes, and with none, a section and its mirror image are the same problem: the lesser key of both.
    const a = keyIn(sec, sec.planeBelow, false, `pp${Math.round((sec.planeAbove - sec.planeBelow) * 1e12)}`);
    const b = keyIn(sec, sec.planeAbove, true, `pp${Math.round((sec.planeAbove - sec.planeBelow) * 1e12)}`);
    return a < b ? a : b;
  }
  if (sec.planeBelow != null) return keyIn(sec, sec.planeBelow, false, 'image');
  if (sec.planeAbove != null) return keyIn(sec, sec.planeAbove, true, 'image');
  const a = keyIn(sec, 0, false, 'free'), b = keyIn(sec, 0, true, 'free');
  return a < b ? a : b;
}

function keyIn(sec: Section, zShift: number, flip: boolean, kernel: string): string {
  const ring = (pts: Float64Array): string => {
    const m = pts.length >> 1;
    const U = new Array<number>(m), Z = new Array<number>(m);
    for (let i = 0; i < m; i++) {
      const k = flip ? m - 1 - i : i; // flipped, the order is reversed to stay counter-clockwise
      U[i] = Math.round(pts[2 * k] * 1e12);
      Z[i] = Math.round((flip ? zShift - pts[2 * k + 1] : pts[2 * k + 1] - zShift) * 1e12);
    }
    let s0 = 0;
    for (let i = 1; i < m; i++) if (U[i] < U[s0] || (U[i] === U[s0] && Z[i] < Z[s0])) s0 = i;
    let out = '';
    for (let i = 0; i < m; i++) { const k = (s0 + i) % m; out += `${U[k]} ${Z[k]},`; }
    return out;
  };
  const open = (o: number): number => (flip ? (o & 3) | ((o & 4) << 1) | ((o & 8) >> 1) : o);
  const layers = [...new Set(sec.conductors.map((c) => (flip ? -c.layer : c.layer)))].sort((a, b) => a - b);
  const cs = sec.conductors.map((c) => `c${c.id}|${open(c.open)}|${layers.indexOf(flip ? -c.layer : c.layer)}|${ring(c.pts)}`).sort();
  const rs = sec.regions.map((r) => `r${sec.materials[r.mat].er}|${open(r.open)}|${ring(r.pts)}`).sort();
  return `${kernel};${sec.wall > 0 ? 1 : 0};${sec.signals};${cs.join(';')};${rs.join(';')}`;
}

export function sectionBoundary(sec: Section): SectionBoundary {
  const fail = (reason: string): SectionBoundary => ({ boundary: null, reason });
  if (sec.signals < 1) return fail('The structure has no signal conductor.');
  let kernel: Kernel;
  let zShift = 0;
  let flip = false;
  if (sec.planeBelow != null) {
    zShift = sec.planeBelow;
    kernel = sec.planeAbove != null ? { kind: 'pp', b: sec.planeAbove - sec.planeBelow } : { kind: 'image' };
  } else if (sec.planeAbove != null) {
    zShift = sec.planeAbove;
    flip = true;
    kernel = { kind: 'image' };
  } else {
    kernel = { kind: 'free' };
    if (!sec.conductors.some((c) => c.id === 0)) return fail('Without a reference plane the structure needs a ground conductor.');
  }
  const Z = (z: number) => (flip ? zShift - z : z - zShift);

  // polygons in the solver's frame, counter-clockwise
  const polys: { u: number[]; z: number[]; cond: number; er: number }[] = [];
  const add = (pts: Float64Array, cond: number, er: number) => {
    const u: number[] = [];
    const z: number[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) { u.push(pts[i]); z.push(Z(pts[i + 1])); }
    if (flip) { u.reverse(); z.reverse(); }
    polys.push({ u, z, cond, er });
  };
  for (const c of sec.conductors) add(c.pts, c.id, NaN);
  for (const r of sec.regions) add(r.pts, -1, sec.materials[r.mat].er);

  // canonical vertices
  let umin = Infinity, umax = -Infinity, zmin = Infinity, zmax = -Infinity;
  for (const p of polys) for (let i = 0; i < p.u.length; i++) {
    umin = Math.min(umin, p.u[i]); umax = Math.max(umax, p.u[i]); zmin = Math.min(zmin, p.z[i]); zmax = Math.max(zmax, p.z[i]);
  }
  const tol = 1e-10 * Math.max(umax - umin, zmax - zmin, Math.abs(umin), Math.abs(umax), 1e-3);
  const VU: number[] = [];
  const VZ: number[] = [];
  const idx: number[][] = polys.map((p) => {
    const out: number[] = [];
    for (let i = 0; i < p.u.length; i++) {
      let k = 0;
      while (k < VU.length && (Math.abs(VU[k] - p.u[i]) > tol || Math.abs(VZ[k] - p.z[i]) > tol)) k++;
      if (k === VU.length) { VU.push(p.u[i]); VZ.push(p.z[i]); }
      if (out[out.length - 1] !== k) out.push(k);
    }
    while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    return out;
  });
  const V = VU.length;

  // atomic edges: every polygon edge split at the vertices lying on it
  const atoms: Atom[] = [];
  const owner = new Map<number, number>();
  const degree = new Int32Array(V);
  const seen = new Set<number>();
  idx.forEach((ids, pi) => {
    for (let s = 0; s < ids.length; s++) {
      const i = ids[s];
      const j = ids[(s + 1) % ids.length];
      const dx = VU[j] - VU[i];
      const dz = VZ[j] - VZ[i];
      const l2 = dx * dx + dz * dz;
      const on: { t: number; k: number }[] = [];
      for (let k = 0; k < V; k++) {
        if (k === i || k === j) continue;
        const t = ((VU[k] - VU[i]) * dx + (VZ[k] - VZ[i]) * dz) / l2;
        if (t <= 0 || t >= 1) continue;
        const cross = Math.abs((VU[k] - VU[i]) * dz - (VZ[k] - VZ[i]) * dx) / Math.sqrt(l2);
        if (cross < tol) on.push({ t, k });
      }
      on.sort((x, y) => x.t - y.t);
      let a = i;
      for (const o of [...on.map((x) => x.k), j]) {
        atoms.push({ a, b: o, poly: pi });
        owner.set(a * V + o, pi);
        const key = Math.min(a, o) * V + Math.max(a, o);
        if (!seen.has(key)) { seen.add(key); degree[a]++; degree[o]++; }
        a = o;
      }
    }
  });

  const pp = kernel.kind === 'pp' ? kernel.b : NaN;
  const onFace = (z: number) => kernel.kind !== 'free' && (Math.abs(z) < tol || Math.abs(z - pp) < tol);
  const wall = sec.wall > 0;
  const kept: Kept[] = [];
  for (const at of atoms) {
    const P = polys[at.poly];
    const q = owner.get(at.b * V + at.a);
    const Q = q === undefined ? null : polys[q];
    const ua = VU[at.a], ub = VU[at.b], za = VZ[at.a], zb = VZ[at.b];
    const horizontal = Math.abs(za - zb) < tol;
    const side = Math.abs(ua - ub) < tol && (Math.abs(ua - umin) < tol || Math.abs(ua - umax) < tol);
    const face = horizontal && onFace(za);
    const base = { a: at.a, b: at.b, cond: -1, epsC: 1, epsP: 1, epsM: 1, far: false };
    if (P.cond >= 0) {
      if (Q) {
        if (Q.cond >= 0) {
          if (Q.cond !== P.cond && (Q.cond > 0 || P.cond > 0)) return fail('Two conductors touch.');
          continue;
        }
        kept.push({ ...base, cond: P.cond, epsC: Q.er });
      } else if (face) {
        if (P.cond > 0) return fail('A signal conductor touches a reference plane.');
      } else if (side) {
        if (wall) { if (P.cond > 0) return fail('A signal conductor touches a side wall.'); } else kept.push({ ...base, cond: P.cond, far: true });
      } else kept.push({ ...base, cond: P.cond, epsC: 1 });
    } else if (Q) {
      if (Q.cond >= 0 || at.poly > q!) continue;
      if (P.er !== Q.er) kept.push({ ...base, epsP: Q.er, epsM: P.er });
    } else if (face) {
      continue;
    } else if (side) {
      if (wall) kept.push({ ...base, cond: 0, epsC: P.er });
    } else if (P.er !== 1) kept.push({ ...base, epsP: 1, epsM: P.er });
  }

  // merge collinear runs through vertices where nothing else meets
  const sig = (k: Kept) => `${k.cond}|${k.epsC}|${k.epsP}|${k.epsM}|${k.far}`;
  const byStart = new Map<number, number[]>();
  kept.forEach((k, i) => { const l = byStart.get(k.a); if (l) l.push(i); else byStart.set(k.a, [i]); });
  const next = new Int32Array(kept.length).fill(-1);
  const hasPrev = new Uint8Array(kept.length);
  kept.forEach((k, i) => {
    if (degree[k.b] !== 2) return;
    const cand = (byStart.get(k.b) ?? []).filter((j) => sig(kept[j]) === sig(k));
    if (cand.length !== 1) return;
    const f = kept[cand[0]];
    const c = (VU[k.b] - VU[k.a]) * (VZ[f.b] - VZ[f.a]) - (VZ[k.b] - VZ[k.a]) * (VU[f.b] - VU[f.a]);
    const d = (VU[k.b] - VU[k.a]) * (VU[f.b] - VU[f.a]) + (VZ[k.b] - VZ[k.a]) * (VZ[f.b] - VZ[f.a]);
    const la = Math.hypot(VU[k.b] - VU[k.a], VZ[k.b] - VZ[k.a]);
    const lb = Math.hypot(VU[f.b] - VU[f.a], VZ[f.b] - VZ[f.a]);
    if (d > 0 && Math.abs(c) < 1e-12 * la * lb) { next[i] = cand[0]; hasPrev[cand[0]] = 1; }
  });
  const runs: Kept[] = [];
  kept.forEach((k, i) => {
    if (hasPrev[i]) return;
    let j = i;
    let guard = kept.length;
    while (next[j] >= 0 && guard-- > 0) j = next[j];
    runs.push({ ...k, b: kept[j].b });
  });

  // sizes: h0 from the copper, X from its span and height
  let cuMin = Infinity, cuMax = -Infinity, czMin = Infinity, czMax = -Infinity;
  let size = Infinity;
  const finite: { lo: number; hi: number; zlo: number; zhi: number; layer: number }[] = [];
  sec.conductors.forEach((c, ci) => {
    const p = polys[ci];
    let lo = Infinity, hi = -Infinity, zlo = Infinity, zhi = -Infinity;
    for (let i = 0; i < p.u.length; i++) {
      zlo = Math.min(zlo, p.z[i]); zhi = Math.max(zhi, p.z[i]);
      if (!wall && (Math.abs(p.u[i] - umin) < tol || Math.abs(p.u[i] - umax) < tol)) continue;
      lo = Math.min(lo, p.u[i]); hi = Math.max(hi, p.u[i]);
    }
    const open = (c.open & 3) !== 0 && !wall;
    if (!open && hi > lo) size = Math.min(size, hi - lo);
    if (zhi > zlo) size = Math.min(size, 4 * (zhi - zlo));
    if (hi >= lo) { cuMin = Math.min(cuMin, lo); cuMax = Math.max(cuMax, hi); }
    czMin = Math.min(czMin, zlo); czMax = Math.max(czMax, zhi);
    finite.push({ lo: (c.open & 1) && !wall ? -Infinity : lo, hi: (c.open & 2) && !wall ? Infinity : hi, zlo, zhi, layer: c.layer });
  });
  for (let i = 0; i < finite.length; i++) for (let j = i + 1; j < finite.length; j++) {
    const A = finite[i], B = finite[j];
    if (A.layer !== B.layer) continue;
    const gap = Math.max(B.lo - A.hi, A.lo - B.hi);
    if (gap > 0 && isFinite(gap)) size = Math.min(size, gap);
  }
  if (!isFinite(size) || !(size > 0)) size = Math.max(cuMax - cuMin, czMax - czMin, 1e-3);
  const h0 = size * MESH_DEFAULTS.h0PerSize;
  const dNear = MESH_DEFAULTS.nearPerH0 * h0;
  const centre = (cuMin + cuMax) / 2;
  const span = cuMax - cuMin;
  let X: number;
  if (kernel.kind === 'pp') X = span / 2 + MESH_DEFAULTS.ppBeyond * kernel.b;
  else {
    const height = kernel.kind === 'image' ? czMax : czMax - czMin;
    X = Math.max(MESH_DEFAULTS.xFactor * Math.max(span, height), MESH_DEFAULTS.xMin);
  }
  const endR = Math.max(umax, centre + X);
  const endL = Math.min(umin, centre - X);

  // edges, rays to ±X
  const edges: Edge[] = [];
  const rays: Edge[] = [];
  const atSide = (u: number) => !wall && (Math.abs(u - umax) < tol || Math.abs(u - umin) < tol);
  const end = (u: number) => (Math.abs(u - umax) < tol ? endR : endL);
  for (const r of runs) {
    let ax = VU[r.a], az = VZ[r.a], bx = VU[r.b], bz = VZ[r.b];
    let epsP = r.epsP, epsM = r.epsM;
    if (r.far) {
      const e = end(ax);
      edges.push(conductorEdge(e, az, e, bz, r.cond, 0, GRADE_BOTH, 2));
      continue;
    }
    const sa = atSide(ax), sb = atSide(bx);
    if (Math.abs(az - bz) < tol && (sa || sb)) {
      if (sa && sb) {
        // a line across the whole box: two rays from the centre
        const mk = (x0: number, x1: number, eP: number, eM: number) => {
          const e: Edge = { ax: x0, az, bx: x1, bz: az, cond: r.cond, epsC: r.epsC, epsP: eP, epsM: eM, grade: GRADE_RAY, n: 0, off: 0 };
          rays.push(e); edges.push(e);
        };
        const right = bx > ax;
        mk(centre, right ? endR : endL, epsP, epsM);
        mk(centre, right ? endL : endR, epsM, epsP);
        continue;
      }
      if (sa) { [ax, az, bx, bz] = [bx, bz, ax, az]; [epsP, epsM] = [epsM, epsP]; }
      bx = end(bx);
      const e: Edge = { ax, az, bx, bz, cond: r.cond, epsC: r.epsC, epsP, epsM, grade: GRADE_RAY, n: 0, off: 0 };
      rays.push(e); edges.push(e);
      continue;
    }
    edges.push({ ax, az, bx, bz, cond: r.cond, epsC: r.epsC, epsP, epsM, grade: GRADE_BOTH, n: bothCount(Math.hypot(bx - ax, bz - az), h0), off: 0 });
  }
  // far ends of conductors to the edge face the medium of their faces
  for (const e of edges) if (e.cond >= 0 && e.epsC === 0) {
    const nb = edges.find((f) => f !== e && f.cond === e.cond && f.grade === GRADE_RAY && f.bx === e.ax);
    e.epsC = nb ? nb.epsC : 1;
  }
  // ray groups: one node set per side for starts within dNear/4 of the earliest
  for (const dir of [1, -1]) {
    const own = rays.filter((e) => Math.sign(e.bx - e.ax) === dir).sort((p, q) => dir * (p.ax - q.ax));
    let origin = NaN;
    for (const e of own) {
      const d = dir * (e.ax - origin);
      if (!(d < dNear / 4)) { origin = e.ax; e.off = 0; } else e.off = d;
    }
  }
  // corner grading (BL79, solver.md §2.5): every vertex gets the exponent ν of its strongest wedge (cornerExponent),
  // and each edge end there the grading q = κ/ν (at least 2, at most qMax): the interfaces' second-kind equation
  // converges at order q·ν, so κ = 2 gives order 2; copper only at triple points (ν < nuSing), where the short side
  // faces also get at least nSing panels (their charge is large and was the largest error left, notes-M1.2c.md)
  const V2 = VU.length;
  const sectors: { s: number; w: number; er: number }[][] = Array.from({ length: V2 }, () => []);
  const angle = (k: number, j: number) => Math.atan2(VZ[j] - VZ[k], VU[j] - VU[k]);
  const outOf = new Map<number, number>();
  for (const at of atoms) outOf.set(at.poly * V2 + at.a, at.b);
  for (const at of atoms) {
    const nx = outOf.get(at.poly * V2 + at.b);
    if (nx === undefined) continue;
    const k = at.b;
    const s = angle(k, nx);
    let w = angle(k, at.a) - s;
    while (w <= 0) w += 2 * Math.PI;
    const P = polys[at.poly];
    sectors[k].push({ s, w, er: P.cond >= 0 ? 0 : P.er });
  }
  const nuAt = new Float64Array(V2).fill(1);
  const kindAt = new Int8Array(V2); // 1: copper in one dielectric, 2: triple point, 3: dielectrics alone
  for (let k = 0; k < V2; k++) {
    const sc = sectors[k];
    if (sc.length < 2) continue;
    const ers = new Set(sc.filter((x) => x.er > 0).map((x) => x.er));
    let cover = 0;
    for (const x of sc) cover += x.w;
    if (cover < 2 * Math.PI - 1e-9) {
      // the rest is a reference plane (when the vertex lies on one), else the vertex is on the truncation: skipped
      if (!onFace(VZ[k]) || Math.abs(cover - Math.PI) > 1e-9) continue;
      const below = Math.abs(VZ[k]) < tol;
      sc.push({ s: below ? Math.PI : 0, w: Math.PI, er: 0 });
    }
    nuAt[k] = cornerExponent(sc);
    kindAt[k] = sc.some((x) => x.er === 0) ? (ers.size > 1 ? 2 : 1) : 3;
  }
  const vid = new Map<string, number>();
  for (let k = 0; k < V2; k++) vid.set(`${VU[k]},${VZ[k]}`, k);
  const at = (u: number, z: number): number => { const k = vid.get(`${u},${z}`); return k === undefined ? -1 : k; };
  // copper: a fixed q at triple points (the limit 2/ν → 4 of a right-angled corner at a high contrast), so that the
  // conductor panels, and with them C0 and L, do not depend on the dielectrics (L is the same for any laminate εr)
  const qOf = (k: number, cond: boolean): number => {
    if (k < 0) return 2;
    if (cond) return kindAt[k] === 2 ? MESH_DEFAULTS.qCuTriple : 2;
    if (kindAt[k] === 3 && !MESH_DEFAULTS.dielCorners) return 2;
    const q = MESH_DEFAULTS.kInterface / nuAt[k];
    return q > 2 + 1e-9 ? Math.min(q, MESH_DEFAULTS.qMax) : 2;
  };
  for (const e of edges) {
    const c = e.cond >= 0;
    const ka = at(e.ax, e.az);
    const qa = qOf(ka, c);
    if (qa > 2) e.qa = qa;
    if (e.grade !== GRADE_BOTH) continue;
    const kb = at(e.bx, e.bz);
    const qb = qOf(kb, c);
    if (qb > 2) e.qb = qb;
    if (c && (kindAt[ka] === 2 || kindAt[kb] === 2) && e.n < MESH_DEFAULTS.nSing) e.n = MESH_DEFAULTS.nSing;
  }
  return { boundary: { kernel, signals: sec.signals, edges, h0, dNear, mNear: MESH_DEFAULTS.mNear, rho: MESH_DEFAULTS.rho, X, zShift, flip }, reason: '' };
}

// The exponent ν of the potential r^ν·f(θ) at a vertex (the charge density goes as r^(ν − 1)), from the sectors around
// it (start angle, width, εr; εr 0 is copper): between two copper faces f = 0 at both, across a dielectric interface
// f and εr·∂f/∂θ are continuous. Through a sector of width α, (f, εr·f′/ν) is multiplied by [[cos να, sin να/εr],
// [−εr·sin να, cos να]]; a wedge between copper faces needs the product's upper right entry to vanish, a corner of
// dielectrics alone a periodic f (trace 2). Returns the smallest root below 1, or 1 (no singularity).
export function cornerExponent(sectors: { s: number; w: number; er: number }[]): number {
  const sc = [...sectors].sort((a, b) => a.s - b.s);
  const m: { w: number; er: number }[] = [];
  for (const x of sc) {
    const l = m[m.length - 1];
    if (l && l.er === x.er) l.w += x.w; else m.push({ w: x.w, er: x.er });
  }
  if (m.length > 1 && m[0].er === m[m.length - 1].er) { m[0].w += m[m.length - 1].w; m.pop(); }
  const prod = (run: { w: number; er: number }[], nu: number): number[] => {
    let a = 1, b = 0, c = 0, d = 1;
    for (const x of run) {
      const cs = Math.cos(nu * x.w), sn = Math.sin(nu * x.w);
      const p = cs, q = sn / x.er, r = -x.er * sn, t = cs;
      [a, b, c, d] = [p * a + q * c, p * b + q * d, r * a + t * c, r * b + t * d];
    }
    return [a, b, c, d];
  };
  const root = (F: (nu: number) => number): number => {
    let lo = 0.02;
    let flo = F(lo);
    for (let hi = 0.04; hi <= 1.0001; hi += 0.02) {
      const fhi = F(hi);
      if (flo * fhi < 0) {
        let x0 = lo, x1 = hi, f0 = flo;
        for (let it = 0; it < 60; it++) { const xm = 0.5 * (x0 + x1); const fm = F(xm); if (f0 * fm <= 0) x1 = xm; else { x0 = xm; f0 = fm; } }
        return Math.min(1, 0.5 * (x0 + x1));
      }
      lo = hi; flo = fhi;
    }
    return 1;
  };
  const ci = m.findIndex((x) => x.er === 0);
  if (ci < 0) {
    if (m.length < 2) return 1;
    return root((nu) => { const [a, , , d] = prod(m, nu); return a + d - 2; });
  }
  let nu = 1;
  const rot = [...m.slice(ci), ...m.slice(0, ci)];
  let run: { w: number; er: number }[] = [];
  for (const x of [...rot.slice(1), rot[0]]) {
    if (x.er !== 0) { run.push(x); continue; }
    if (run.length) nu = Math.min(nu, root((v) => prod(run, v)[1]));
    run = [];
  }
  return nu;
}
