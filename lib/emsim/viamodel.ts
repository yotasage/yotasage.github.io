// The quasi-static via model (engine.md §6, solver.md §5, step M1.7). The barrel is cut at every slab boundary and at
// every crossing's middle (viacut.ts); each piece is a lossless line of its dielectric (one per layer, never an
// averaged εr) with the cut's vacuum capacitance matrix C0 times εr and the speed c0/√εr. Every pad and plane crossing
// adds a shunt capacitance at its middle: ΔC = the axisymmetric window charge − the cut's own C′ over the window
// (axisym.ts with the wall at the return vias' coaxial equivalent radius, so the axisymmetric line part is the cut's
// C′ and nothing is counted twice; notes-M1.7.md). A pair has each via's ΔC on the diagonal and −k12·ΔC between them
// (k12 = −C12/C11 of the cut, flagged until M6.4). The barrel beyond the signal layers is an open stub (backdrill
// shortens it), the feed traces are lines from the 2D solver (lines.ts) ending at the pad's edge (their length is
// given to the via's axis).
// The cascade is in the frequency domain with 2n × 2n chain matrices of complex numbers: S of the 2-port (single) or the
// 4-port (pair: ports A entry, B entry, A exit, B exit) with every port at z0 (50 Ω), and the mixed-mode 4-port (D1,
// D2 at 2·z0, C1, C2 at z0/2). TDR and TDT from tdr.ts. Validity flags with their numbers. No Node APIs.

import { C0 as CLIGHT } from './bem2d';
import { AXI_LEVEL, viaAxisym, viaLayout, viaWall } from './axisym';
import type { ViaAxiResult } from './axisym';
import { equivalentRadius, viaCut } from './viacut';
import { solveSetup } from './lines';
import type { Flag } from './lines';
import { copperIds, layerIndex, stackZ } from './stackup';
import type { Stackup } from './stackup';
import type { Structure } from './structure';
import type { ViaStructure } from './via';
import { abcdToS, cIdentity, cInv, cMul, mixedS, NPORT_VERSION } from './nport';
import type { NPort } from './nport';
import { edgeF3, edgeFrequency, tdr } from './tdr';
import type { TdrResult } from './tdr';

export const VIAMODEL_VERSION = 1;
export const VIA_TR = 35e-12; // default 10–90 % rise time (the openEMS fixtures' TDR)
export const VIA_Z0 = 50;
// Provisional: no published number (literature V2 has curves only); M6.4's full-wave runs set it.
export const RETURN_NEAR_MM = 2.0;
export const SHARED_ANTIPAD_HZ = 40e9; // Duan2014: a pair's shared antipad matters above about 40 GHz
export const LUMPED_FRACTION = 8; // Cartier2007: a lumped part of length ℓ holds to c0/(8·ℓ·√εr)
export const BAND_LEVEL = 0.1; // the band of the stub and shared-antipad flags: the edge spectrum down to −20 dB (2.58·f3)

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// ---------- real n × n matrices (n ≤ 2) ----------

type Mat = number[][];
const rInv = (A: Mat): Mat => {
  if (A.length === 1) return [[1 / A[0][0]]];
  const d = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  return [[A[1][1] / d, -A[0][1] / d], [-A[1][0] / d, A[0][0] / d]];
};
const rMul = (A: Mat, B: Mat): Mat => A.map((row, i) => B[0].map((_, j) => row.reduce((acc, a, k) => acc + a * B[k][j], 0)));
const rScale = (A: Mat, x: number): Mat => A.map((r) => r.map((a) => a * x));
const rAdd = (A: Mat, B: Mat): Mat => A.map((r, i) => r.map((a, j) => a + B[i][j]));
const rEye = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
const flat = (A: Mat): Float64Array => Float64Array.from(A.flat());

// ---------- lines and elements ----------

// A lossless multiconductor line: per-unit-length Maxwell capacitance C (F/m), modal voltage vectors T (columns) and
// the modes' speeds v (m/s). The mode currents are C·T·diag(v); the chain matrix of length ℓ is
// [T cosΘ T⁻¹, j T sinΘ Tᵢ⁻¹; j Tᵢ sinΘ T⁻¹, Tᵢ cosΘ Tᵢ⁻¹] with Θ = diag(2πfℓ/vₖ).
export interface LineSpec { n: number; C: Mat; T: Mat; v: number[] }
interface LinePre { T: Float64Array; Tinv: Float64Array; Ti: Float64Array; Tiinv: Float64Array; v: Float64Array }

export type Element =
  | { kind: 'line'; name: string; len: number; spec: LineSpec; pre?: LinePre } // len in m
  | { kind: 'shunt'; name: string; C: Mat } // F, Maxwell matrix to ground
  | { kind: 'stub'; name: string; elements: Element[] }; // a chain open at its far end, shunt at this node

function prepare(spec: LineSpec): LinePre {
  const Ti = rMul(spec.C, spec.T).map((r) => r.map((x, k) => x * spec.v[k]));
  return { T: flat(spec.T), Tinv: flat(rInv(spec.T)), Ti: flat(Ti), Tiinv: flat(rInv(Ti)), v: Float64Array.from(spec.v) };
}

// Homogeneous line (barrel pieces, uncoupled feeds): every mode at c0/√εr.
export function homogeneousLine(C0: Mat, er: number): LineSpec {
  const n = C0.length;
  return { n, C: rScale(C0, er), T: rEye(n), v: Array(n).fill(CLIGHT / Math.sqrt(er)) };
}

// A line from its per-unit-length C and L (n ≤ 2), the modes from the eigenvectors of L·C (eigenvalues 1/v²).
export function lineFromCL(C: Mat, L: Mat): LineSpec {
  const n = C.length;
  if (n === 1) return { n, C, T: [[1]], v: [1 / Math.sqrt(L[0][0] * C[0][0])] };
  const P = rMul(L, C);
  const p = P[0][0], q = P[0][1], r = P[1][0], s = P[1][1];
  const m = 0.5 * (p + s), d = Math.sqrt(Math.max(0, (0.5 * (p - s)) ** 2 + q * r));
  if (d <= 1e-13 * Math.abs(m) || (q === 0 && r === 0)) {
    const l0 = d <= 1e-13 * Math.abs(m) ? m : p, l1 = d <= 1e-13 * Math.abs(m) ? m : s;
    return { n, C, T: rEye(2), v: [1 / Math.sqrt(l0), 1 / Math.sqrt(l1)] };
  }
  const lam = [m + d, m - d];
  const cols = lam.map((l) => {
    const u = Math.abs(q) >= Math.abs(r) ? [q, l - p] : [l - s, r];
    const nn = Math.hypot(u[0], u[1]);
    const sg = u[0] + u[1] < 0 ? -1 : 1;
    return [(sg * u[0]) / nn, (sg * u[1]) / nn];
  });
  return { n, C, T: [[cols[0][0], cols[1][0]], [cols[0][1], cols[1][1]]], v: lam.map((l) => 1 / Math.sqrt(l)) };
}

// The chain matrix of one element at f into out (complex 2n × 2n).
function elementAbcd(e: Element, f: number, n: number, out: Float64Array): void {
  const m = 2 * n;
  cIdentity(m, out);
  if (e.kind === 'shunt') {
    const w = 2 * Math.PI * f;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[2 * ((n + i) * m + j) + 1] = w * e.C[i][j];
    return;
  }
  if (e.kind === 'stub') {
    const M = chainAbcd(e.elements, f, n);
    const A = new Float64Array(2 * n * n), C = new Float64Array(2 * n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let p = 0; p < 2; p++) {
      A[2 * (i * n + j) + p] = M[2 * (i * m + j) + p];
      C[2 * (i * n + j) + p] = M[2 * ((n + i) * m + j) + p];
    }
    const Ai = cInv(A, n);
    const Y = Ai ? cMul(C, Ai, n) : null; // Y = C·A⁻¹ of the open chain
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let p = 0; p < 2; p++) {
      out[2 * ((n + i) * m + j) + p] = Y ? Y[2 * (i * n + j) + p] : i === j && p === 1 ? 1e30 : 0;
    }
    return;
  }
  const pr = e.pre ?? (e.pre = prepare(e.spec));
  const cs = new Float64Array(n), sn = new Float64Array(n);
  for (let k = 0; k < n; k++) { const th = (2 * Math.PI * f * e.len) / pr.v[k]; cs[k] = Math.cos(th); sn[k] = Math.sin(th); }
  out.fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let a = 0, b = 0, c = 0, d = 0;
      for (let k = 0; k < n; k++) {
        a += pr.T[i * n + k] * cs[k] * pr.Tinv[k * n + j];
        b += pr.T[i * n + k] * sn[k] * pr.Tiinv[k * n + j];
        c += pr.Ti[i * n + k] * sn[k] * pr.Tinv[k * n + j];
        d += pr.Ti[i * n + k] * cs[k] * pr.Tiinv[k * n + j];
      }
      out[2 * (i * m + j)] = a;
      out[2 * (i * m + n + j) + 1] = b;
      out[2 * ((n + i) * m + j) + 1] = c;
      out[2 * ((n + i) * m + n + j)] = d;
    }
  }
}

// The chain matrix of a list of elements at f (complex 2n × 2n).
export function chainAbcd(elements: Element[], f: number, n: number): Float64Array {
  const m = 2 * n;
  let M: Float64Array = cIdentity(m), T: Float64Array = new Float64Array(2 * m * m);
  const E = new Float64Array(2 * m * m);
  for (const e of elements) {
    elementAbcd(e, f, n, E);
    cMul(M, E, m, T);
    const x = M; M = T; T = x;
  }
  return M;
}

// S of the chain at every frequency (2n ports at z0): nf × (2n)² complex.
export function cascadeS(elements: Element[], n: number, f: ArrayLike<number>, z0: number): Float64Array {
  const P = 2 * n, out = new Float64Array(2 * P * P * f.length);
  for (let k = 0; k < f.length; k++) abcdToS(chainAbcd(elements, f[k], n), n, z0, out, 2 * P * P * k);
  return out;
}

// An open stub's first series resonance (where its input admittance has a pole, det A = 0) below fUp (Hz), by a scan
// of 64 steps and bisection; NaN when none.
export function stubResonance(elements: Element[], n: number, fUp: number): number {
  const m = 2 * n;
  const det = (f: number): number => {
    const M = chainAbcd(elements, f, n);
    if (n === 1) return M[0];
    return M[0] * M[2 * (m + 1)] - M[1] * M[2 * (m + 1) + 1] - (M[2] * M[2 * m] - M[3] * M[2 * m + 1]);
  };
  let a = 0, da = 1;
  for (let i = 1; i <= 64; i++) {
    const b = (fUp * i) / 64, db = det(b);
    if (Math.sign(db) !== Math.sign(da)) {
      let lo = a, hi = b, dlo = da;
      for (let it = 0; it < 80 && hi - lo > 1e-13 * hi; it++) {
        const mid = 0.5 * (lo + hi), dm = det(mid);
        if (Math.sign(dm) === Math.sign(dlo)) { lo = mid; dlo = dm; } else hi = mid;
      }
      return 0.5 * (lo + hi);
    }
    a = b; da = db;
  }
  return NaN;
}

// facts-formulas.md §7: an open stub of length ℓ (mm) in εeff resonates at c0/(4ℓ√εeff).
export const stubFormula = (lenMm: number, eeff: number): number => CLIGHT / (4 * lenMm * 1e-3 * Math.sqrt(eeff));

// ---------- feeds ----------

export interface FeedLine { ok: boolean; reason: string; spec: LineSpec | null; z0: number; eeff: number; cached: boolean; ms: number }
const FEEDS = new Map<string, FeedLine>();
const FEED_CACHE = 8;
export function clearFeedCache(): void { FEEDS.clear(); }

// The setup's trace on a feed layer: itself, or mirrored through the stackup (L1 over L2 → L6 under L5).
export function feedStructure(s: Stackup, trace: Structure, layer: string): Structure | string {
  if (trace.layer === layer) return trace;
  const ids = copperIds(s);
  const i = ids.indexOf(trace.layer), j = ids.indexOf(layer);
  if (i < 0 || j < 0) return `The feed's layer ${layer} or the trace's ${trace.layer} is not a copper layer.`;
  if (j !== ids.length - 1 - i) return `No feed line on ${layer}: the trace is on ${trace.layer}, which does not mirror to it.`;
  const mir = (id: string): string => (id ? ids[ids.length - 1 - ids.indexOf(id)] ?? '' : '');
  return {
    ...trace, layer, layer2: mir(trace.layer2), above: mir(trace.below), below: mir(trace.above),
    signals: trace.signals.map((g) => ({ ...g, layer: mir(g.layer) })), grounds: trace.grounds.map((g) => ({ ...g, layer: mir(g.layer) })),
  };
}

// The feed line of a structure (n = the via's barrels: a single trace feeds each via of a pair alone, uncoupled).
export function feedLine(s: Stackup, st: Structure, n: number, via: ViaStructure): FeedLine {
  const t0 = now();
  const key = JSON.stringify([s, st, n]);
  const hit = FEEDS.get(key);
  if (hit) { FEEDS.delete(key); FEEDS.set(key, hit); return { ...hit, cached: true, ms: now() - t0 }; }
  const r = solveSetup({ stackup: s, trace: st, via });
  let out: FeedLine;
  if (!r.ok) out = { ok: false, reason: r.reason, spec: null, z0: NaN, eeff: NaN, cached: false, ms: 0 };
  else if (r.n !== 1 && r.n !== n) out = { ok: false, reason: `The feed has ${r.n} signals and the via ${n}.`, spec: null, z0: NaN, eeff: NaN, cached: false, ms: 0 };
  else {
    let spec = lineFromCL(r.bem.C, r.bem.L);
    if (r.n === 1 && n === 2) spec = { n: 2, C: [[spec.C[0][0], 0], [0, spec.C[0][0]]], T: rEye(2), v: [spec.v[0], spec.v[0]] };
    out = { ok: true, reason: '', spec, z0: r.n === 1 ? r.lines[0].z0.v : r.pair.zdiff.v, eeff: r.lines[0].eeff.v, cached: false, ms: 0 };
  }
  out.ms = now() - t0;
  FEEDS.set(key, out);
  while (FEEDS.size > FEED_CACHE) FEEDS.delete(FEEDS.keys().next().value);
  return out;
}

// ---------- the model ----------

export interface ViaModelOptions {
  tr?: number; // s, the TDR's 10–90 % rise time and the flags' band (default 35 ps)
  z0?: number; // Ω, every single-ended port (default 50)
  M?: number; // axisymmetric level (default 1)
  estimate?: boolean; // axisymmetric and cut estimates (default true)
  cutM?: number; // the cut's level (default the 2D solver's)
  feeds?: 'setup' | 'none' | { entry?: LineSpec | null; exit?: LineSpec | null }; // default 'setup' when a trace is given
  f?: ArrayLike<number>; // Hz; default 0 … the edge spectrum's −60 dB in `nf` points
  nf?: number; // default 401
  tdr?: boolean; // default true
  tdrOpt?: { half?: number; t0?: number; t1?: number; dt?: number };
}
export interface ViaFlag extends Flag { level: 'error' | 'warning' | 'info' }
export interface ViaNode { z: number; layer: string; dC: number; dCErr: number } // mm (stackZ's frame); F
export interface ViaPiece { zTop: number; zBot: number; er: number; z0: number; zdiff: number; zcm: number; delay: number; part: 'through' | 'entry stub' | 'exit stub' }
export interface ViaStub { side: 'entry' | 'exit'; length: number; delay: number; fFormula: number; fRes: number } // mm, s, Hz
export interface ViaFeed { side: 'entry' | 'exit'; layer: string; length: number; z0: number; eeff: number } // mm (to the pad's edge), Ω
// The through section (entry node to exit node, stubs' capacitance included) as one lumped element.
export interface ViaLumped { L: Mat; C: Mat; z: number; zdiff: number; zcm: number; delay: number; dCsum: number; lineC: number }
export interface ViaModelResult {
  ok: boolean;
  reason: string;
  version: number;
  n: number;
  tr: number; f3: number; band: number; z0: number;
  wall: { kind: 'equivalent' | 'rule'; Req: number; Rw: number };
  barrel: { zVac: number; zVacErr: number; zdiffVac: number; zcmVac: number; zdiffVacErr: number; zcmVacErr: number; k12: number; C0: Mat }; // C0: the cut's vacuum C′ (F/m)
  nodes: ViaNode[];
  pieces: ViaPiece[];
  stubs: ViaStub[];
  feeds: ViaFeed[];
  lumped: ViaLumped | null;
  valid: { fMax: number; reason: string; window: number; er: number }; // Hz: the lowest λ/8 limit of the lumped parts, its window (mm) and εr
  axiTotal: number; axiTotalErr: number; // F, the axisymmetric whole-via capacitance (one via)
  elements: Element[];
  span: number; // s, one-way delay of feeds and through section
  nport: NPort | null; // single-ended (2 or 4 ports)
  mixed: NPort | null; // pair: D1, D2, C1, C2
  tdr: TdrResult | null; // single: port 1; pair: differential (Sdd11, Sdd21)
  tdrCommon: TdrResult | null; // pair: common (Scc11, Scc21)
  flags: ViaFlag[];
  assumptions: string[];
  axiCached: boolean;
  ms: number;
  parts: { axi: number; cut: number; feeds: number; cascade: number; tdr: number };
}

function failed(reason: string, flags: ViaFlag[] = []): ViaModelResult {
  return {
    ok: false, reason, version: VIAMODEL_VERSION, n: 0, tr: 0, f3: 0, band: 0, z0: 0, wall: null, barrel: null, nodes: [], pieces: [], stubs: [], feeds: [],
    lumped: null, valid: null, axiTotal: NaN, axiTotalErr: NaN, elements: [], span: 0, nport: null, mixed: null, tdr: null, tdrCommon: null, flags, assumptions: [], axiCached: false,
    ms: 0, parts: { axi: 0, cut: 0, feeds: 0, cascade: 0, tdr: 0 },
  };
}

const zMid = (s: Stackup, id: string): number => {
  const z = stackZ(s), i = layerIndex(s, id);
  return i < 0 ? NaN : 0.5 * (z[i] + z[i + 1]);
};

// Geometry flags (no solve needed): returns, overlaps, shared antipads.
function geometryFlags(v: ViaStructure, a: number, band: number): ViaFlag[] {
  const flags: ViaFlag[] = [];
  const barrels: [number, number][] = v.pitch ? [[0, 0], [0, v.pitch.v]] : [[0, 0]];
  if (!v.returns.length) {
    flags.push({ level: 'error', code: 'no-return', message: 'No return via: between the planes the return current spreads through the plane cavity, which is not a line; the quasi-static model does not hold (use full-wave).', numbers: [] });
    return flags;
  }
  let dMin = Infinity;
  for (const r of v.returns) for (const [x, y] of barrels) dMin = Math.min(dMin, Math.hypot(r.x.v - x, r.y.v - y));
  if (dMin > RETURN_NEAR_MM) flags.push({ level: 'warning', code: 'return-far', message: `The nearest return via is ${dMin.toFixed(2)} mm from the barrel, more than ${RETURN_NEAR_MM} mm (a provisional limit until M6.4): the return current may flow through the plane cavity rather than along the barrel.`, numbers: [dMin, RETURN_NEAR_MM] });
  // Antipads that cut into return vias (engine.md §6.7).
  for (const ap of v.antipads) {
    for (const r of v.returns) {
      if (!r.planes.includes(ap.layer)) continue;
      const rr = r.drill.v / 2;
      let gap: number;
      if (v.pitch && ap.shape === 'oblong') {
        const t = Math.max(0, Math.min(v.pitch.v, r.y.v));
        gap = Math.hypot(r.x.v, r.y.v - t) - rr - ap.d.v / 2;
      } else gap = Math.min(...barrels.map(([x, y]) => Math.hypot(r.x.v - x, r.y.v - y))) - rr - ap.d.v / 2;
      if (gap < 0) {
        flags.push({ level: 'warning', code: 'return-in-antipad', message: `The antipad on ${ap.layer} (Ø${ap.d.v}) cuts into the return via at (${r.x.v}, ${r.y.v}) by ${(-gap).toFixed(3)} mm: the return is not joined to that plane all round; the cut takes it as a full circle.`, numbers: [-gap, ap.d.v] });
        break;
      }
    }
  }
  if (v.pitch) {
    const p = v.pitch.v;
    const padMax = Math.max(0, ...v.pads.map((x) => (x.d ? x.d.v : 0)));
    if (padMax >= p) flags.push({ level: 'warning', code: 'pad-overlap', message: `The pair's pads (Ø${padMax}) overlap at the pitch ${p} mm.`, numbers: [padMax, p] });
    let shared = false;
    for (const ap of v.antipads) {
      if (ap.shape !== 'round') shared = true;
      else if (ap.d.v > p) {
        shared = true;
        flags.push({ level: 'warning', code: 'antipad-overlap', message: `The round antipads on ${ap.layer} (Ø${ap.d.v}) overlap at the pitch ${p} mm (Miller2004): they are one opening, solved as two round ones.`, numbers: [ap.d.v, p] });
      }
    }
    if (shared && band > SHARED_ANTIPAD_HZ) flags.push({ level: 'warning', code: 'shared-antipad', message: `The pair shares its antipad and the edge's band reaches ${(band / 1e9).toFixed(1)} GHz, above about ${SHARED_ANTIPAD_HZ / 1e9} GHz where a shared antipad starts to matter (Duan2014).`, numbers: [band, SHARED_ANTIPAD_HZ] });
  }
  if (!(a > 0)) flags.push({ level: 'error', code: 'drill', message: 'The drill must be above 0.', numbers: [] });
  return flags;
}

// Everything but the frequency sweep and the TDR (the target's inner loop).
export function buildVia(s: Stackup, v: ViaStructure, trace: Structure | null, opt: ViaModelOptions = {}): ViaModelResult {
  const t0 = now();
  const n = v.pitch ? 2 : 1;
  const tr = opt.tr ?? VIA_TR, z0 = opt.z0 ?? VIA_Z0;
  const f3 = edgeF3(tr), band = edgeFrequency(tr, BAND_LEVEL);
  const L = viaLayout(s, v);
  if (!L.ok) return failed(L.reason);
  const flags = geometryFlags(v, L.a, band);
  if (flags.some((x) => x.level === 'error')) return failed(flags.find((x) => x.level === 'error').message, flags);
  // 1. The cut and its coaxial equivalent radius.
  const tc = now();
  const cut = viaCut(s, v, { M: opt.cutM, estimate: opt.estimate });
  if (!cut.ok) return failed(cut.reason, flags);
  const msCut = now() - tc;
  const Req = equivalentRadius(cut, L.a);
  // 2. The axisymmetric crossings with the wall at Req; when Req lies inside an opening, the rule wall and ΔC against
  // the cut's C′ (q − line·ln(R_w/a)/ln(R_eq/a)), flagged.
  const ta = now();
  const { h0 } = viaWall(L);
  let rMax = 0;
  for (const c of L.crossings) rMax = Math.max(rMax, c.pad, c.antipad);
  for (const p of L.planes) rMax = Math.max(rMax, p.r0);
  let axi: ViaAxiResult = null;
  let wallKind: 'equivalent' | 'rule' = 'equivalent';
  const axOpt = { M: opt.M ?? AXI_LEVEL, estimate: opt.estimate };
  if (Req > rMax + h0) axi = viaAxisym(s, v, { ...axOpt, Rw: Req });
  if (!axi || !axi.ok) {
    wallKind = 'rule';
    axi = viaAxisym(s, v, axOpt);
    flags.push({ level: 'info', code: 'wall-rule', message: `The return vias' coaxial equivalent radius ${Req.toFixed(3)} mm lies inside an opening (${rMax.toFixed(3)} mm): the pads were solved with the wall at ${axi.Rw.toFixed(3)} mm and referred to the cut's C′.`, numbers: [Req, rMax, axi.Rw] });
  }
  if (!axi.ok) return failed(axi.reason, flags);
  const msAxi = now() - ta;
  const lnRatio = Math.log(axi.Rw / L.a) / Math.log(Req / L.a);
  // 3. Nodes and pieces.
  const zEn = zMid(s, v.entry), zEx = zMid(s, v.exit);
  if (!(zEn <= L.zTop + 1e-9 && zEn >= L.zBot - 1e-9) || !(zEx <= L.zTop + 1e-9 && zEx >= L.zBot - 1e-9)) return failed('A signal layer lies outside the barrel left after backdrilling.', flags);
  if (Math.abs(zEn - zEx) < 1e-9) return failed('The entry and exit layers are the same.', flags);
  const segs = cut.segments.map((x) => ({ zTop: x.zTop, zBot: x.zBot, er: x.er }));
  for (const zm of [zEn, zEx]) {
    const k = segs.findIndex((x) => zm < x.zTop - 1e-9 && zm > x.zBot + 1e-9);
    if (k >= 0) { const x = segs[k]; segs.splice(k, 1, { zTop: x.zTop, zBot: zm, er: x.er }, { zTop: zm, zBot: x.zBot, er: x.er }); }
  }
  let nodes: ViaNode[] = [segs[0].zTop, ...segs.map((x) => x.zBot)].map((z) => ({ z, layer: '', dC: 0, dCErr: 0 }));
  for (const c of axi.crossings) {
    let best = -1, bd = Infinity;
    nodes.forEach((nd, k) => { const d = Math.abs(nd.z - c.z); if (d < bd) { bd = d; best = k; } });
    if (bd > 1e-6) return failed(`No barrel node at the crossing ${c.layer}.`, flags);
    nodes[best].layer = c.layer;
    nodes[best].dC = c.q - c.line * lnRatio;
    nodes[best].dCErr = c.err.e;
  }
  let iEn = nodes.findIndex((x) => Math.abs(x.z - zEn) < 1e-7), iEx = nodes.findIndex((x) => Math.abs(x.z - zEx) < 1e-7);
  if (iEn > iEx) { nodes = nodes.reverse(); segs.reverse(); iEn = nodes.length - 1 - iEn; iEx = nodes.length - 1 - iEx; }
  const C0 = cut.C0, k12 = n === 2 ? cut.vac.k12 : 0;
  const segEl = (k: number): Element => {
    const x = segs[k];
    return { kind: 'line', name: `barrel ${x.zTop.toFixed(4)}–${x.zBot.toFixed(4)} mm, εr ${x.er}`, len: Math.abs(x.zTop - x.zBot) * 1e-3, spec: homogeneousLine(C0, x.er) };
  };
  const shuntEl = (k: number): Element[] => {
    const d = nodes[k].dC;
    if (!d) return [];
    return [{ kind: 'shunt', name: `ΔC ${nodes[k].layer}`, C: n === 1 ? [[d]] : [[d, -k12 * d], [-k12 * d, d]] }];
  };
  const pieces: ViaPiece[] = [];
  const piece = (k: number, part: ViaPiece['part']): void => {
    const x = segs[k], f = 1 / Math.sqrt(x.er), V = cut.vac;
    pieces.push({ zTop: Math.max(x.zTop, x.zBot), zBot: Math.min(x.zTop, x.zBot), er: x.er, z0: V.z * f, zdiff: V.zdiff * f, zcm: V.zcm * f, delay: (Math.abs(x.zTop - x.zBot) * 1e-3 * Math.sqrt(x.er)) / CLIGHT, part });
  };
  const through: Element[] = [...shuntEl(iEn)];
  const stubs: ViaStub[] = [];
  const stubOf = (ks: number[], nodeOf: (k: number) => number, side: 'entry' | 'exit'): void => {
    if (!ks.length) return;
    const els: Element[] = [];
    let len = 0, tau = 0;
    for (const k of ks) {
      els.push(segEl(k), ...shuntEl(nodeOf(k)));
      piece(k, side === 'entry' ? 'entry stub' : 'exit stub');
      len += Math.abs(segs[k].zTop - segs[k].zBot);
      tau += (Math.abs(segs[k].zTop - segs[k].zBot) * 1e-3 * Math.sqrt(segs[k].er)) / CLIGHT;
    }
    through.push({ kind: 'stub', name: `${side} stub ${len.toFixed(4)} mm`, elements: els });
    const fF = 1 / (4 * tau);
    let fR = stubResonance(els, n, fF * (1 + 1e-9));
    if (!(fR > 0)) fR = stubResonance(els, n, 2 * fF);
    stubs.push({ side, length: len, delay: tau, fFormula: fF, fRes: fR });
  };
  stubOf(Array.from({ length: iEn }, (_, j) => iEn - 1 - j), (k) => k, 'entry');
  for (let k = iEn; k < iEx; k++) { through.push(segEl(k)); piece(k, 'through'); through.push(...shuntEl(k + 1)); }
  stubOf(Array.from({ length: segs.length - iEx }, (_, j) => iEx + j), (k) => k + 1, 'exit');
  // 4. Feeds.
  const tf = now();
  const feeds: ViaFeed[] = [];
  const before: Element[] = [], after: Element[] = [];
  const fo = opt.feeds ?? (trace ? 'setup' : 'none');
  for (const side of ['entry', 'exit'] as const) {
    const layer = side === 'entry' ? v.entry : v.exit;
    const fd = v.feeds.find((x) => x.layer === layer);
    if (!fd || !(fd.length.v > 0) || fo === 'none') continue;
    let spec: LineSpec = null, zf = NaN, ef = NaN;
    // The trace joins the pad at its edge: the pad's own capacitance is in its ΔC (assumption 'feeds-to-pad-edge').
    const pd = v.pads.find((x) => x.layer === layer);
    const padR = pd && pd.d && pd.d.v / 2 > L.a ? pd.d.v / 2 : L.a;
    const len = Math.max(0, fd.length.v - padR);
    if (fo === 'setup') {
      if (!trace) return failed('Feeds from the setup need a trace.', flags);
      const st = feedStructure(s, trace, layer);
      if (typeof st === 'string') return failed(st, flags);
      for (const ref of [st.below, st.above]) {
        const ap = ref ? v.antipads.find((x) => x.layer === ref) : null;
        if (ap && ap.d.v / 2 > padR) {
          const over = Math.min(len, ap.d.v / 2 - padR);
          flags.push({ level: 'warning', code: 'feed-over-antipad', message: `The ${side} feed runs ${over.toFixed(3)} mm over the antipad of its reference plane ${ref}: there it has no plane under it and is more inductive than the line it is modelled as (BL90).`, numbers: [over, ap.d.v] });
        }
      }
      const fl = feedLine(s, st, n, v);
      if (!fl.ok) return failed(`The ${side} feed: ${fl.reason}`, flags);
      spec = fl.spec; zf = fl.z0; ef = fl.eeff;
    } else {
      spec = fo[side];
      if (!spec) continue;
      zf = 1 / (spec.v[0] * spec.C[0][0]); ef = (CLIGHT / spec.v[0]) ** 2;
    }
    const el: Element = { kind: 'line', name: `${side} feed on ${layer}`, len: len * 1e-3, spec };
    if (side === 'entry') before.push(el); else after.push(el);
    feeds.push({ side, layer, length: len, z0: zf, eeff: ef });
  }
  const msFeeds = now() - tf;
  // 5. The through section as one lumped element.
  let lenThrough = 0, tauThrough = 0;
  let Csum: Mat = rScale(rEye(n), 0);
  let lineC = 0, dCsum = 0;
  for (const p of pieces) {
    const len = (p.zTop - p.zBot) * 1e-3;
    Csum = rAdd(Csum, rScale(C0, p.er * len));
    lineC += p.er * len * C0[0][0];
    if (p.part === 'through') { lenThrough += len; tauThrough += p.delay; }
  }
  for (const nd of nodes) if (nd.dC) { Csum = rAdd(Csum, n === 1 ? [[nd.dC]] : [[nd.dC, -k12 * nd.dC], [-k12 * nd.dC, nd.dC]]); dCsum += nd.dC; }
  const Lsum = rScale(rInv(C0), lenThrough / (CLIGHT * CLIGHT));
  let lumped: ViaLumped;
  if (n === 1) lumped = { L: Lsum, C: Csum, z: Math.sqrt(Lsum[0][0] / Csum[0][0]), zdiff: NaN, zcm: NaN, delay: Math.sqrt(Lsum[0][0] * Csum[0][0]), dCsum, lineC };
  else {
    const l = 0.5 * (Lsum[0][0] + Lsum[1][1]), lm = 0.5 * (Lsum[0][1] + Lsum[1][0]), c = 0.5 * (Csum[0][0] + Csum[1][1]), cm = 0.5 * (Csum[0][1] + Csum[1][0]);
    lumped = { L: Lsum, C: Csum, z: Math.sqrt(l / c), zdiff: 2 * Math.sqrt((l - lm) / (c - cm)), zcm: 0.5 * Math.sqrt((l + lm) / (c + cm)), delay: Math.sqrt((l - lm) * (c - cm)), dCsum, lineC };
  }
  // 6. Validity flags that need the solve.
  const slabEr = (zLo: number, zHi: number): number => Math.max(1, ...L.slabs.filter((x) => x.zHi > zLo && x.zLo < zHi).map((x) => x.er));
  let fValid = Infinity, validWhy = '', validWin = NaN, validEr = NaN;
  for (const c of axi.crossings) {
    const len = c.zHi - c.zLo, er = slabEr(c.zLo, c.zHi);
    const f8 = CLIGHT / (LUMPED_FRACTION * len * 1e-3 * Math.sqrt(er));
    if (f8 < fValid) { fValid = f8; validWin = len; validEr = er; validWhy = `λ/${LUMPED_FRACTION} of the ${len.toFixed(3)} mm window of ${c.layer} (εr ${er}), Cartier2007`; }
    if (f8 < f3) flags.push({ level: 'warning', code: 'lumped-long', message: `The ${c.layer} crossing's ΔC spans a ${len.toFixed(3)} mm window (εr ${er}), lumped only to ${(f8 / 1e9).toFixed(1)} GHz (λ/${LUMPED_FRACTION}), below the edge's f3 ${(f3 / 1e9).toFixed(1)} GHz (rise time ${(tr * 1e12).toFixed(1)} ps).`, numbers: [len, er, f8, f3] });
  }
  const f8via = 1 / (LUMPED_FRACTION * tauThrough);
  if (f8via < f3) flags.push({ level: 'info', code: 'via-lumped', message: `The via's delay ${(tauThrough * 1e12).toFixed(2)} ps is long for the rise time ${(tr * 1e12).toFixed(1)} ps: as one lumped element (√(L/C)) it holds only to ${(f8via / 1e9).toFixed(1)} GHz < f3 ${(f3 / 1e9).toFixed(1)} GHz; the cascade itself still holds.`, numbers: [tauThrough, tr, f8via, f3] });
  for (const st of stubs) {
    if (st.fRes < band) flags.push({ level: 'warning', code: 'stub-resonance', message: `The ${st.side} stub (${st.length.toFixed(3)} mm) resonates at ${(st.fRes / 1e9).toFixed(2)} GHz (${(st.fFormula / 1e9).toFixed(2)} GHz without its pads), inside the edge's band to ${(band / 1e9).toFixed(1)} GHz: transmission drops there; backdrill or move the layer.`, numbers: [st.fRes, st.fFormula, band, st.length] });
  }
  const assumptions = ['quasi-static', 'lossless', 'returns-whole-barrel', 'solid-barrel', 'mask-as-air', 'feeds-to-pad-edge'];
  if (n === 2) assumptions.push('pad-coupling-estimate');
  if (v.antipads.some((x) => x.shape !== 'round')) assumptions.push('antipad-as-round');
  let span = tauThrough;
  for (const el of [...before, ...after]) if (el.kind === 'line') span += el.len / Math.min(...el.spec.v);
  const r: ViaModelResult = {
    ok: true, reason: '', version: VIAMODEL_VERSION, n, tr, f3, band, z0,
    wall: { kind: wallKind, Req, Rw: axi.Rw },
    barrel: { zVac: cut.vac.z, zVacErr: cut.err.z.e, zdiffVac: cut.vac.zdiff, zcmVac: cut.vac.zcm, zdiffVacErr: cut.err.zdiff.e, zcmVacErr: cut.err.zcm.e, k12, C0 },
    nodes, pieces, stubs, feeds, lumped, valid: { fMax: fValid, reason: validWhy, window: validWin, er: validEr }, axiTotal: axi.total, axiTotalErr: axi.totalErr.e,
    elements: [...before, ...through, ...after], span,
    nport: null, mixed: null, tdr: null, tdrCommon: null, flags, assumptions, axiCached: axi.cached,
    ms: 0, parts: { axi: msAxi, cut: msCut, feeds: msFeeds, cascade: 0, tdr: 0 },
  };
  r.ms = now() - t0;
  return r;
}

const portNames = (n: number): string[] => (n === 1 ? ['entry', 'exit'] : ['A entry', 'B entry', 'A exit', 'B exit']);

// The via model: build, S over the frequencies, the mixed-mode S of a pair, TDR/TDT. Never throws.
export function viaModel(s: Stackup, v: ViaStructure, trace: Structure | null, opt: ViaModelOptions = {}): ViaModelResult {
  const t0 = now();
  let r: ViaModelResult;
  try {
    r = buildVia(s, v, trace, opt);
  } catch (e) {
    return failed(`The via model failed: ${e && (e as Error).message ? (e as Error).message : e}`);
  }
  if (!r.ok) return r;
  const n = r.n, P = 2 * n;
  const tc = now();
  const fmax = edgeFrequency(r.tr, 1e-3);
  const nf = opt.nf ?? 401;
  const f = opt.f ? Float64Array.from(opt.f) : Float64Array.from({ length: nf }, (_, k) => (fmax * k) / (nf - 1));
  const valid = { fMin: 0, fMax: r.valid.fMax, reason: r.valid.reason };
  const producer = { name: 'via model (quasi-static cascade)', version: VIAMODEL_VERSION };
  const sArr = cascadeS(r.elements, n, f, r.z0);
  r.nport = { version: NPORT_VERSION, ports: P, names: portNames(n), f, s: sArr, z0: Array(P).fill(r.z0), producer, valid, mixed: false };
  if (n === 2) r.mixed = { ...r.nport, s: mixedS(sArr, 4, f.length, [[0, 1], [2, 3]]), z0: [2 * r.z0, 2 * r.z0, r.z0 / 2, r.z0 / 2], names: ['D1', 'D2', 'C1', 'C2'], mixed: true };
  r.parts.cascade = now() - tc;
  if (opt.tdr !== false) {
    const tt = now();
    const pick = (S: Float64Array, nf2: number, Pp: number, i: number, j: number): Float64Array => {
      const out = new Float64Array(2 * nf2);
      for (let k = 0; k < nf2; k++) { const o = 2 * ((k * Pp + i) * Pp + j); out[2 * k] = S[o]; out[2 * k + 1] = S[o + 1]; }
      return out;
    };
    const base = { tr: r.tr, span: r.span, ...(opt.tdrOpt ?? {}) };
    if (n === 1) {
      r.tdr = tdr((ff) => { const S = cascadeS(r.elements, 1, ff, r.z0); return { s11: pick(S, ff.length, 2, 0, 0), s21: pick(S, ff.length, 2, 1, 0) }; }, { ...base, zRef: r.z0 });
    } else {
      let cacheF: Float64Array = null, cacheS: Float64Array = null;
      const mm = (ff: Float64Array): Float64Array => {
        if (cacheF !== ff) { cacheF = ff; cacheS = mixedS(cascadeS(r.elements, 2, ff, r.z0), 4, ff.length, [[0, 1], [2, 3]]); }
        return cacheS;
      };
      r.tdr = tdr((ff) => { const S = mm(ff); return { s11: pick(S, ff.length, 4, 0, 0), s21: pick(S, ff.length, 4, 1, 0) }; }, { ...base, zRef: 2 * r.z0 });
      r.tdrCommon = tdr((ff) => { const S = mm(ff); return { s11: pick(S, ff.length, 4, 2, 2), s21: pick(S, ff.length, 4, 3, 2) }; }, { ...base, zRef: r.z0 / 2 });
    }
    r.parts.tdr = now() - tt;
  }
  r.ms = now() - t0;
  return r;
}

// ---------- the target ----------

export type ViaTargetKey = 'z' | 'zdiff' | 'zcm';
export type ViaTargetVary = 'antipad' | 'returns';
export interface ViaTargetResult {
  reached: boolean;
  reason: string;
  key: ViaTargetKey; vary: ViaTargetVary; target: number;
  x: number; // mm: the antipad diameter, or the nearest return via's distance from the barrel
  value: number; // Ω, the lumped section's value at x
  range: [number, number]; values: [number, number]; // the x range searched and the values at its ends
  via: ViaStructure | null;
  model: ViaModelResult | null;
  solves: number;
  ms: number;
}

// Every antipad set to diameter d (mm).
export function withAntipad(v: ViaStructure, d: number): ViaStructure {
  return { ...v, antipads: v.antipads.map((ap) => ({ ...ap, d: { ...ap.d, v: d } })) };
}

const barrelsOf = (v: ViaStructure): [number, number][] => (v.pitch ? [[0, 0], [0, v.pitch.v]] : [[0, 0]]);
export function nearestReturn(v: ViaStructure): number {
  let d = Infinity;
  for (const r of v.returns) for (const [x, y] of barrelsOf(v)) d = Math.min(d, Math.hypot(r.x.v - x, r.y.v - y));
  return d;
}

// The return vias moved radially from the pair's (or via's) centre so that the nearest is d (mm) from a barrel.
export function withReturnDistance(v: ViaStructure, d: number): ViaStructure {
  const cy = v.pitch ? v.pitch.v / 2 : 0;
  const d0 = nearestReturn(v);
  // The distance to the nearest barrel is not linear in a radial scale for a pair: solve the scale by bisection.
  const at = (k: number): ViaStructure => ({ ...v, returns: v.returns.map((r) => ({ ...r, x: { ...r.x, v: r.x.v * k }, y: { ...r.y, v: cy + (r.y.v - cy) * k } })) });
  if (!v.pitch) return at(d / d0);
  let lo = 0, hi = 1;
  while (nearestReturn(at(hi)) < d && hi < 1e6) hi *= 2;
  for (let i = 0; i < 100; i++) { const m = 0.5 * (lo + hi); if (nearestReturn(at(m)) < d) lo = m; else hi = m; }
  return at(0.5 * (lo + hi));
}

// The antipad diameter or the return-via distance for a target value of the via section (`lumped`: z for a single via,
// zdiff or zcm for a pair), by bracketing and the Illinois method on the level M model without estimates (both
// grow with x), then the full model at the root. tol relative (default 10⁻⁷).
export function viaTarget(s: Stackup, v: ViaStructure, trace: Structure | null, key: ViaTargetKey, target: number, vary: ViaTargetVary, opt: ViaModelOptions & { tol?: number } = {}): ViaTargetResult {
  const t0 = now();
  const res = (reached: boolean, reason: string, x: number, value: number, range: [number, number], values: [number, number], via: ViaStructure, model: ViaModelResult, solves: number): ViaTargetResult =>
    ({ reached, reason, key, vary, target, x, value, range, values, via, model, solves, ms: now() - t0 });
  if (!(target > 0)) return res(false, 'The target must be above 0.', NaN, NaN, null, null, null, null, 0);
  if ((key === 'z') !== !v.pitch) return res(false, key === 'z' ? 'A pair takes zdiff or zcm.' : 'A single via takes z.', NaN, NaN, null, null, null, null, 0);
  const tol = opt.tol ?? 1e-7;
  const make = (x: number): ViaStructure => (vary === 'antipad' ? withAntipad(v, x) : withReturnDistance(v, x));
  let solves = 0;
  const g = (x: number): number => {
    solves++;
    const m = buildVia(s, make(x), null, { ...opt, feeds: 'none', estimate: false });
    return m.ok ? m.lumped[key] - target : NaN;
  };
  const a0 = v.drill.v / 2;
  let lo: number, hi: number;
  if (vary === 'antipad') {
    const planePads = v.pads.filter((p) => v.planes.includes(p.layer) && p.d).map((p) => p.d.v);
    lo = Math.max(v.drill.v, ...planePads) + 0.05;
    hi = lo + 3;
  } else {
    if (!v.returns.length) return res(false, 'The via has no return vias to move.', NaN, NaN, null, null, null, null, 0);
    const rr = Math.max(...v.returns.map((r) => r.drill.v / 2));
    lo = a0 + rr + 0.05;
    hi = 5;
  }
  let fa = g(lo), fb = g(hi);
  const range: [number, number] = [lo, hi], values: [number, number] = [fa + target, fb + target];
  if (!isFinite(fa) || !isFinite(fb)) return res(false, 'The model fails at an end of the range.', NaN, NaN, range, values, null, null, solves);
  if (Math.sign(fa) === Math.sign(fb)) return res(false, `The target ${target} Ω is outside ${Math.min(values[0], values[1]).toFixed(2)}–${Math.max(values[0], values[1]).toFixed(2)} Ω over ${lo.toFixed(3)}–${hi.toFixed(3)} mm.`, NaN, NaN, range, values, null, null, solves);
  let a = lo, b = hi, x = NaN, fx = NaN, side = 0;
  for (let it = 0; it < 80; it++) {
    x = b - (fb * (b - a)) / (fb - fa);
    if (!(x > a && x < b)) x = 0.5 * (a + b);
    fx = g(x);
    if (!isFinite(fx)) { x = 0.5 * (a + b); fx = g(x); if (!isFinite(fx)) break; }
    if (Math.abs(fx) <= tol * target || b - a < 1e-10) break;
    if (Math.sign(fx) === Math.sign(fb)) { b = x; fb = fx; if (side === 1) fa *= 0.5; side = 1; } else { a = x; fa = fx; if (side === -1) fb *= 0.5; side = -1; }
  }
  const via = make(x);
  const model = viaModel(s, via, trace, opt);
  const value = model.ok ? model.lumped[key] : NaN;
  const ok = isFinite(fx) && Math.abs(fx) <= Math.max(tol * target, 1e-6);
  return res(ok, ok ? '' : `Stopped at ${(fx + target).toFixed(4)} Ω (the model may jump where the pads' wall changes).`, x, value, range, values, via, model, solves);
}
