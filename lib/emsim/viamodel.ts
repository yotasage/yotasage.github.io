// The quasi-static via model (engine.md §6, solver.md §5, step M1.7). The barrel is cut at every slab boundary and at
// every crossing's middle (viacut.ts); each piece is a lossless line of its dielectric (one per layer, never an
// averaged εr) with the cut's vacuum capacitance matrix C0 times εr and the speed c0/√εr. Every pad and plane crossing
// adds a shunt capacitance at its middle: ΔC = the axisymmetric window charge − the cut's own C′ over the window
// (axisym.ts with the wall at the return vias' coaxial equivalent radius, so the axisymmetric line part is the cut's
// C′ and nothing is counted twice; notes-M1.7.md). A pair has each via's ΔC on the diagonal and −k12·ΔC between them
// (k12 = −C12/C11 of the cut, flagged as an estimate). The barrel beyond the signal layers is an open stub (backdrill
// shortens it), the feed traces are lines from the 2D solver (lines.ts) ending at the pad's edge (their length is
// given to the via's axis).
// The cascade is in the frequency domain with 2n × 2n chain matrices of complex numbers: S of the 2-port (single) or the
// 4-port (pair: ports A entry, B entry, A exit, B exit) with every port at z0 (50 Ω), and the mixed-mode 4-port (D1,
// D2 at 2·z0, C1, C2 at z0/2). TDR and TDT from tdr.ts. Validity flags with their numbers. No Node APIs.

import { C0 as CLIGHT, DEFAULT_LEVEL, solveSection, vacuumLevel } from './bem2d';
import { AXI_LEVEL, viaAxisym, viaLayout, viaWall } from './axisym';
import type { ViaAxiResult, ViaLayout } from './axisym';
import { equivalentRadius, viaCut } from './viacut';
import { linesOf, setupSection } from './lines';
import type { Flag, LineResults } from './lines';
import { sectionBoundary, sectionKey } from './panels';
import { toRows } from './linalg';
import { copperIds, layerIndex, stackZ } from './stackup';
import type { Stackup } from './stackup';
import type { Structure } from './structure';
import type { ViaStructure } from './via';
import { abcdToS, cIdentity, cInv, cMul, mixedS, NPORT_VERSION } from './nport';
import type { NPort } from './nport';
import { edgeF3, edgeFrequency, tdr } from './tdr';
import type { TdrResult } from './tdr';

export const VIAMODEL_VERSION = 2; // 2: the feed over its antipad (BL90) and the band from the plane cavity (BL165), step M6.5
export const VIA_TR = 35e-12; // default 10–90 % rise time (the openEMS fixtures' TDR)
export const VIA_Z0 = 50;
// Provisional: no published number (literature V2 has curves only); M6.4's full-wave runs set it.
// M6.4c (fullwave-verify.md §4): FDTD against the model on the C44 via with a 0.8 antipad: the section's Z is off by
// −1.2 / +2.5 / +5.5 / +8.2 % and the model stays within |ΔS| 0.1 to 15.4 / 13.0 / 9.2 / 6.7 GHz with the returns at
// 0.8 / 1.2 / 2.0 / 3.0 mm; at 1.5 mm about 4 % and 11.6 GHz, above the 35 ps edge's f3 (9.7 GHz).
export const RETURN_NEAR_MM = 1.5;
export const SHARED_ANTIPAD_HZ = 40e9; // Duan2014: a pair's shared antipad matters above about 40 GHz
export const LUMPED_FRACTION = 8; // Cartier2007: a lumped part of length ℓ holds to c0/(8·ℓ·√εr)
export const CAVITY_DS = 0.1; // the band ends where the plane cavity's radial wave moves any S entry by this much (M6.4c's measure of where the model leaves the full-wave results)
export const OVER_CHECKED_MM = 0.6; // the longest feed over its antipad checked against openEMS (C44): beyond it `feed-over-antipad` warns
export const BAND_LEVEL = 0.1; // the band of the stub and shared-antipad flags: the edge spectrum down to −20 dB (2.58·f3)

const MU0 = 4e-7 * Math.PI;
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
  | { kind: 'series'; name: string; L: Mat; z?: (f: number) => Float64Array } // H, series inductance; z: a further complex n × n impedance at f (Ω)
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
  if (e.kind === 'series') {
    const w = 2 * Math.PI * f, z = e.z ? e.z(f) : null;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const o = 2 * (i * m + n + j);
      out[o + 1] = w * e.L[i][j];
      if (z) { out[o] += z[2 * (i * n + j)]; out[o + 1] += z[2 * (i * n + j) + 1]; }
    }
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

export interface FeedLine { ok: boolean; reason: string; spec: LineSpec | null; L: Mat | null; z0: number; eeff: number; cached: boolean; ms: number } // L: H/m, n × n
/** A solve the caller already holds (the worker's SolveCache: the trace's own section), or null (BL197). */
export type SolvedLookup = (stackup: Stackup, trace: Structure) => LineResults | null;
const FEEDS = new Map<string, FeedLine>(); // by the input
const FEED_SECTIONS = new Map<string, FeedLine>(); // by the section as the solver sees it (panels.ts sectionKey)
const FEED_CACHE = 16;
export function clearFeedCache(): void { FEEDS.clear(); FEED_SECTIONS.clear(); }
const remember = (m: Map<string, FeedLine>, key: string, x: FeedLine): void => {
  m.delete(key); // newest last
  m.set(key, x);
  while (m.size > FEED_CACHE) m.delete(m.keys().next().value);
};

const PAIR_KIND: Partial<Record<Structure['kind'], Structure['kind']>> = { microstrip: 'pair-microstrip', stripline: 'pair-stripline', cpw: 'pair-cpw', cpwg: 'pair-cpw' };

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
// BL197: a feed whose section the solver sees as one solved before (the exit feed, mirrored through a symmetric
// stackup, is the entry's; the run over the antipad likewise) is taken from it, and a section the caller has solved
// (`solved`: the worker's own solve of the trace) is not solved again. lOnly: only `L` is wanted (the trace over the
// next plane beyond an antipad): the vacuum problem alone at the solver's level (bem2d `vacuumLevel`, the same L′ as
// the full solve's), `spec` null and z0, eeff NaN, unless a full solve of the section is at hand.
export function feedLine(s: Stackup, st: Structure, n: number, via: ViaStructure, solved?: SolvedLookup, lOnly = false): FeedLine {
  const t0 = now();
  const key = JSON.stringify([s, st, n]);
  const hk = FEEDS.has(key) ? key : `L;${key}`;
  const hit = hk === key || lOnly ? FEEDS.get(hk) : undefined;
  if (hit) { remember(FEEDS, hk, hit); return { ...hit, cached: true, ms: now() - t0 }; }
  const sec = setupSection({ stackup: s, trace: st, via });
  if (typeof sec === 'string') return { ok: false, reason: sec, spec: null, L: null, z0: NaN, eeff: NaN, cached: false, ms: now() - t0 };
  const sk = `${n};${sectionKey(sec)}`;
  const sk2 = FEED_SECTIONS.has(sk) ? sk : `L;${sk}`;
  const same = sk2 === sk || lOnly ? FEED_SECTIONS.get(sk2) : undefined;
  if (same) {
    remember(FEED_SECTIONS, sk2, same);
    remember(FEEDS, sk2 === sk ? key : `L;${key}`, same);
    return { ...same, cached: true, ms: now() - t0 };
  }
  const fail = (reason: string): FeedLine => ({ ok: false, reason, spec: null, L: null, z0: NaN, eeff: NaN, cached: false, ms: 0 });
  const held = solved ? solved(s, st) : null;
  let out: FeedLine;
  if (lOnly && !held) {
    const sb = sectionBoundary(sec);
    const vl = sb.boundary ? vacuumLevel(sb.boundary, DEFAULT_LEVEL) : sb.reason;
    const ns = sb.boundary ? sb.boundary.signals : 0;
    if (typeof vl === 'string') out = fail(vl);
    else if (ns !== 1 && ns !== n) out = fail(`The feed has ${ns} signals and the via ${n}.`);
    else {
      const Lr = toRows(vl.L, ns);
      out = { ok: true, reason: '', spec: null, L: ns === 1 && n === 2 ? [[Lr[0][0], 0], [0, Lr[0][0]]] : Lr, z0: NaN, eeff: NaN, cached: false, ms: 0 };
    }
  } else {
    const r = held || linesOf(solveSection(sec));
    if (!r.ok) out = fail(r.reason);
    else if (r.n !== 1 && r.n !== n) out = fail(`The feed has ${r.n} signals and the via ${n}.`);
    else {
      let spec = lineFromCL(r.bem.C, r.bem.L);
      let Lm: Mat = r.bem.L.map((row) => [...row]);
      if (r.n === 1 && n === 2) { spec = { n: 2, C: [[spec.C[0][0], 0], [0, spec.C[0][0]]], T: rEye(2), v: [spec.v[0], spec.v[0]] }; Lm = [[Lm[0][0], 0], [0, Lm[0][0]]]; }
      out = { ok: true, reason: '', spec, L: Lm, z0: r.n === 1 ? r.lines[0].z0.v : r.pair.zdiff.v, eeff: r.lines[0].eeff.v, cached: false, ms: 0 };
    }
  }
  out.ms = now() - t0;
  const full = !lOnly || !!held;
  remember(FEEDS, full ? key : `L;${key}`, out);
  remember(FEED_SECTIONS, full ? sk : `L;${sk}`, out);
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
  solved?: SolvedLookup; // the caller's solves of feed sections (the worker's SolveCache; not cloneable: never sent)
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
// A feed's run over its reference plane's antipad (BL90): planes cut and the next ones beyond, its length (mm, from the
// pad's edge) and the series inductance it adds (H, one trace). (zNext, the impedance of the trace over the next plane,
// was never shown or used: only its L′ is, solved alone since BL197.)
export interface ViaOver { side: 'entry' | 'exit'; layer: string; ref: string; next: string; length: number; dL: number }
// The plane cavity between two of the via's planes (BL165): height (mm), its εr in series, the return vias that join
// both planes, the barrel's share of its height, and the frequency (Hz) where its radial wave moves S by CAVITY_DS.
export interface ViaCavity {
  top: string; bottom: string; h: number; er: number; returns: number; share: number; fMax: number;
  at: number; posts: number[][]; // its ΔZ enters the cascade before element `at`; posts [x, y, r] (mm): the n barrels, then the returns
}
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
  overs: ViaOver[];
  cavities: ViaCavity[];
  lumped: ViaLumped | null;
  // Hz: the model's band, the lower of the lumped parts' λ/8 limit (`lumped`, of the `window` (mm) with εr `er`) and the
  // plane cavity's (`cavity`, viaModel only: buildVia leaves it NaN), and why.
  valid: { fMax: number; reason: string; window: number; er: number; lumped: number; cavity: number };
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
    overs: [], cavities: [], lumped: null, valid: null, axiTotal: NaN, axiTotalErr: NaN, elements: [], span: 0, nport: null, mixed: null, tdr: null, tdrCommon: null, flags, assumptions: [], axiCached: false,
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
  if (dMin > RETURN_NEAR_MM) flags.push({ level: 'warning', code: 'return-far', message: `The nearest return via is ${dMin.toFixed(2)} mm from the barrel, more than ${RETURN_NEAR_MM} mm: the return current may flow through the plane cavity rather than along the barrel. Full-wave runs put the model's impedance more than 4 % off there, and its range under about 11 GHz.`, numbers: [dMin, RETURN_NEAR_MM] });
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

// ---------- the plane cavity (BL165) ----------
// Between two planes the barrels and the return vias are posts in a parallel-plate guide. Its TEM radial mode (Ez and
// Hφ uniform in z, no cutoff; the next mode starts at c0/(2h√εr), 54 GHz on C44) is what the quasi-static model leaves
// out: the barrel's current launches it, the shorted returns cancel most of it, and what is left carries power away
// between the planes. Thin posts: a z-current I at the origin gives Ez = −(ωμ0/4)·I·H0⁽²⁾(kρ) (the 2D Green's function
// of the Helmholtz equation), so the plane-pair impedance between posts i and j is Zij = (ωμ0h/4)·H0⁽²⁾(kρij), ρii the
// post's radius, with k = ω√(μ0ε0εr) and εr the layers' series value (Ez crosses them). With the returns shorted
// (Vr = 0) the barrels see Zeff = Zbb − Zbr·Zrr⁻¹·Zrb; its low-frequency part jωL0 is the barrel's inductance between
// the planes (the model's lines hold it), the rest ΔZ = Zeff − jωL0 is the cavity's radiation and dispersion. A barrel
// that carries the signal over only a share w of the height couples to the mode by w twice (ΔZ·w²).

// J0 and Y0: the power series below 8, Hankel's asymptotic expansion from 8 (both to about 1e-12 of their scale).
function bessel0(x: number): [number, number] {
  if (x < 8) {
    const q = (x * x) / 4;
    let j = 1, sum = 0, t = 1, H = 0;
    for (let m = 1; m < 80; m++) {
      t *= -q / (m * m);
      H += 1 / m;
      j += t;
      sum -= H * t;
      if (Math.abs(t) * (1 + H) < 1e-17) break;
    }
    return [j, (2 / Math.PI) * ((Math.log(x / 2) + 0.5772156649015329) * j + sum)];
  }
  // J0 = √(2/πx)(P cos χ − Q sin χ), Y0 = √(2/πx)(P sin χ + Q cos χ), χ = x − π/4; the series' terms are
  // a_k = Π_{i≤k} (2i−1)²/(i·8x) with signs + − − + + − − …: P takes the even k, Q the odd k (Q starts −1/(8x)).
  let P = 1, Q = 0, t = 1;
  for (let k = 1; k <= 30; k++) {
    const tn = (t * (2 * k - 1) ** 2) / (k * 8 * x);
    if (tn > t) break; // asymptotic: stop at the smallest term
    t = tn;
    if (k % 2) Q += (k % 4 === 1 ? -1 : 1) * t;
    else P += (k % 4 === 2 ? -1 : 1) * t;
    if (t < 1e-17) break;
  }
  const chi = x - Math.PI / 4, s = Math.sqrt(2 / (Math.PI * x));
  return [s * (P * Math.cos(chi) - Q * Math.sin(chi)), s * (P * Math.sin(chi) + Q * Math.cos(chi))];
}

// The cavities between consecutive planes the barrel passes (an opening on both), with the through section's share.
function planeCavities(L: ViaLayout, v: ViaStructure, zEn: number, zEx: number, offset: number, throughZ: { at: number; z: number }[]): ViaCavity[] {
  const out: ViaCavity[] = [];
  const pl = L.planes.filter((p) => p.r0 > 0).sort((p, q) => q.zLo - p.zLo);
  const barrels = barrelsOf(v);
  const zHi = Math.max(zEn, zEx), zLo = Math.min(zEn, zEx);
  for (let i = 0; i + 1 < pl.length; i++) {
    const upper = pl[i], lower = pl[i + 1];
    const zTop = upper.zLo, zBot = lower.zHi, h = zTop - zBot; // the upper plane's lower face to the lower plane's upper face
    if (!(h > 0)) continue;
    let inv = 0;
    for (const sl of L.slabs) { const t = Math.min(sl.zHi, zTop) - Math.max(sl.zLo, zBot); if (t > 0) inv += t / sl.er; }
    const share = Math.max(0, Math.min(zHi, zTop) - Math.max(zLo, zBot)) / h;
    const mid = 0.5 * (zTop + zBot);
    let best: { at: number; z: number } = null, bd = Infinity;
    for (const t of throughZ) { const d = Math.abs(t.z - mid); if (d < bd) { bd = d; best = t; } }
    if (!best || !(share > 0)) continue;
    const rets = v.returns.filter((r) => r.planes.includes(upper.layer) && r.planes.includes(lower.layer));
    out.push({
      top: upper.layer, bottom: lower.layer, h, er: h / inv, returns: rets.length, share, fMax: NaN, at: offset + best.at,
      posts: [...barrels.map(([x, y]) => [x, y, L.a]), ...rets.map((r) => [r.x.v, r.y.v, r.drill.v / 2])],
    });
  }
  return out;
}

// Zeff of the barrels (n × n complex, Ω) at f with the returns shorted.
function cavityZeff(c: ViaCavity, n: number, f: number): Float64Array {
  const k = (2 * Math.PI * f * Math.sqrt(c.er)) / CLIGHT, A = (2 * Math.PI * f * MU0 * c.h * 1e-3) / 4;
  const N = c.posts.length, m = N - n;
  const z = (i: number, j: number): [number, number] => {
    const rho = i === j ? c.posts[i][2] : Math.hypot(c.posts[i][0] - c.posts[j][0], c.posts[i][1] - c.posts[j][1]);
    const [J, Y] = bessel0(k * rho * 1e-3);
    return [A * J, -A * Y];
  };
  const out = new Float64Array(2 * n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const [a, b] = z(i, j); out[2 * (i * n + j)] = a; out[2 * (i * n + j) + 1] = b; }
  if (!m) return out;
  const Zrr = new Float64Array(2 * m * m);
  for (let p = 0; p < m; p++) for (let q = 0; q < m; q++) { const [a, b] = z(n + p, n + q); Zrr[2 * (p * m + q)] = a; Zrr[2 * (p * m + q) + 1] = b; }
  const Ri = cInv(Zrr, m);
  if (!Ri) return out;
  // Zrr⁻¹·Zrb column by column, then Zbr times it.
  for (let j = 0; j < n; j++) {
    const x = new Float64Array(2 * m);
    for (let p = 0; p < m; p++) {
      let re = 0, im = 0;
      for (let q = 0; q < m; q++) {
        const [a, b] = z(n + q, j), r = Ri[2 * (p * m + q)], s = Ri[2 * (p * m + q) + 1];
        re += r * a - s * b; im += r * b + s * a;
      }
      x[2 * p] = re; x[2 * p + 1] = im;
    }
    for (let i = 0; i < n; i++) {
      let re = 0, im = 0;
      for (let p = 0; p < m; p++) { const [a, b] = z(i, n + p); re += a * x[2 * p] - b * x[2 * p + 1]; im += a * x[2 * p + 1] + b * x[2 * p]; }
      out[2 * (i * n + j)] -= re; out[2 * (i * n + j) + 1] -= im;
    }
  }
  return out;
}

// ΔZ (n × n complex, Ω) of a cavity at f: Zeff less its static inductance (from 1 MHz), times share².
export function cavityImpedance(c: ViaCavity, n: number, f: number): Float64Array {
  const f0 = 1e6, Z0 = cavityZeff(c, n, f0), Z = cavityZeff(c, n, f), w2 = c.share * c.share;
  for (let i = 0; i < n * n; i++) { Z[2 * i] *= w2; Z[2 * i + 1] = (Z[2 * i + 1] - (Z0[2 * i + 1] * f) / f0) * w2; }
  return Z;
}

// The band of each cavity and of all together: the lowest f where the cascade with the cavities' ΔZ differs from the
// model's by CAVITY_DS in any S entry (a scan of 0.25 GHz steps to fUp, then bisection). Infinity when none below fUp.
function cavityBand(r: ViaModelResult, fUp: number): number {
  const n = r.n, P = 2 * n;
  const withCav = (cs: ViaCavity[]): Element[] => {
    const els = [...r.elements];
    for (const c of [...cs].sort((a, b) => b.at - a.at)) els.splice(c.at, 0, { kind: 'series', name: `cavity ${c.top}–${c.bottom}`, L: rScale(rEye(n), 0), z: (f) => cavityImpedance(c, n, f) });
    return els;
  };
  const first = (cs: ViaCavity[]): number => {
    const els = withCav(cs);
    const dS = (f: number): number => {
      const a = cascadeS(r.elements, n, [f], r.z0), b = cascadeS(els, n, [f], r.z0);
      let d = 0;
      for (let i = 0; i < P * P; i++) d = Math.max(d, Math.hypot(a[2 * i] - b[2 * i], a[2 * i + 1] - b[2 * i + 1]));
      return d;
    };
    let lo = 0;
    for (let f = 0.25e9; f <= fUp; f += 0.25e9) {
      if (dS(f) > CAVITY_DS) {
        let a = lo, b = f;
        for (let it = 0; it < 30 && b - a > 1e6; it++) { const m = 0.5 * (a + b); if (dS(m) > CAVITY_DS) b = m; else a = m; }
        return 0.5 * (a + b);
      }
      lo = f;
    }
    return Infinity;
  };
  for (const c of r.cavities) c.fMax = first([c]);
  return r.cavities.length ? first(r.cavities) : Infinity;
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
  const throughZ: { at: number; z: number }[] = []; // after which element of `through` each through line ends, its middle (mm)
  for (let k = iEn; k < iEx; k++) { through.push(segEl(k)); throughZ.push({ at: through.length, z: 0.5 * (segs[k].zTop + segs[k].zBot) }); piece(k, 'through'); through.push(...shuntEl(k + 1)); }
  stubOf(Array.from({ length: segs.length - iEx }, (_, j) => iEx + j), (k) => k + 1, 'exit');
  // 4. Feeds, and each feed's run over its reference plane's antipad (BL90): there the trace has no plane under it, so
  // its return current runs in the next plane beyond the opening and its inductance per length is the same trace's
  // over that plane (the 2D solver with the cut plane replaced); its charge stays (the opening's rim and the pad take
  // the line's C′ there: M6.4c, the model's C within 1 % of openEMS on C44). So the run is a series inductance
  // ΔL = (L′ over the next plane − L′ of the feed)·ℓ at the pad's edge, and the feed line still runs to the pad.
  const tf = now();
  const feeds: ViaFeed[] = [];
  const overs: ViaOver[] = [];
  const overL: Mat[] = [];
  const before: Element[] = [], after: Element[] = [];
  const fo = opt.feeds ?? (trace ? 'setup' : 'none');
  const ids = copperIds(s);
  for (const side of ['entry', 'exit'] as const) {
    const layer = side === 'entry' ? v.entry : v.exit;
    const fd = v.feeds.find((x) => x.layer === layer);
    if (!fd || !(fd.length.v > 0)) continue;
    // The trace joins the pad at its edge: the pad's own capacitance is in its ΔC (assumption 'feeds-to-pad-edge').
    const pd = v.pads.find((x) => x.layer === layer);
    const padR = pd && pd.d && pd.d.v / 2 > L.a ? pd.d.v / 2 : L.a;
    const len = Math.max(0, fd.length.v - padR);
    let st: Structure = null, fl: FeedLine = null;
    if (trace) {
      const fs = feedStructure(s, trace, layer);
      if (typeof fs === 'string') { if (fo === 'setup') return failed(fs, flags); } else st = fs;
    }
    if (st) {
      fl = feedLine(s, st, n, v, opt.solved);
      if (!fl.ok) { if (fo === 'setup') return failed(`The ${side} feed: ${fl.reason}`, flags); fl = null; }
    }
    // The run over the antipad: per cut reference plane, its length and the next plane beyond it.
    if (st && fl) {
      const cuts: { ref: string; next: string; over: number; key: 'below' | 'above' }[] = [];
      for (const key of ['below', 'above'] as const) {
        const ref = st[key];
        const ap = ref ? v.antipads.find((x) => x.layer === ref) : null;
        if (!ap || !(ap.d.v / 2 > padR) || !(len > 0)) continue;
        const iRef = ids.indexOf(ref), dir = key === 'below' ? 1 : -1;
        let next = '';
        for (let i = iRef + dir; i >= 0 && i < ids.length; i += dir) if (v.planes.includes(ids[i])) { next = ids[i]; break; }
        cuts.push({ ref, next, over: Math.min(len, ap.d.v / 2 - padR), key });
      }
      cuts.sort((x, y) => x.over - y.over);
      // A pair fed by single traces: over the opening the two traces (at the pitch) close their loop through each other
      // as much as through the next plane, so both inductances come from the coupled pair of the same traces.
      let base: Structure = st, baseL = fl.L, baseSpec = fl.spec;
      const pk = PAIR_KIND[st.kind];
      if (n === 2 && pk && v.pitch && cuts.length && v.pitch.v - st.w.v > 0) {
        const ps: Structure = { ...st, kind: pk, s: { ...st.s, v: v.pitch.v - st.w.v } };
        const fp = feedLine(s, ps, 2, v, opt.solved);
        if (fp.ok) { base = ps; baseL = fp.L; baseSpec = fp.spec; }
      }
      let dL: Mat = rScale(rEye(n), 0), ok = cuts.length > 0, prev = 0;
      const segs: { L: Mat; len: number }[] = []; // from the pad outwards
      for (let i = 0; i < cuts.length && ok; i++) {
        const seg = cuts[i].over - prev;
        prev = cuts[i].over;
        if (!(seg > 0)) continue;
        if (cuts.slice(i).some((c) => !c.next)) { ok = false; break; }
        const alt: Structure = { ...base };
        for (const c of cuts.slice(i)) alt[c.key] = c.next;
        const fn = feedLine(s, alt, n, v, opt.solved, true);
        if (!fn.ok) { ok = false; break; }
        dL = rAdd(dL, rScale(rAdd(fn.L, rScale(baseL, -1)), seg * 1e-3));
        segs.push({ L: fn.L, len: seg });
      }
      for (const c of cuts) {
        const why = !ok ? (c.next ? 'its line over the next plane could not be solved' : 'there is no further plane beyond it') : '';
        const level: ViaFlag['level'] = !ok || c.over > OVER_CHECKED_MM + 1e-9 ? 'warning' : 'info';
        const message = ok
          ? `The ${side} feed runs ${c.over.toFixed(3)} mm over the antipad of its reference plane ${c.ref}: there its return current runs in ${c.next}, a series inductance of ${(dL[0][0] * 1e9).toFixed(3)} nH at the pad${c.over > OVER_CHECKED_MM + 1e-9 ? `; checked against openEMS only to ${OVER_CHECKED_MM} mm` : ''} (BL90).`
          : `The ${side} feed runs ${c.over.toFixed(3)} mm over the antipad of its reference plane ${c.ref}: there it has no plane under it and is more inductive than its line, not modelled because ${why} (BL90).`;
        flags.push({ level, code: 'feed-over-antipad', message, numbers: [c.over, ok ? dL[0][0] : NaN] });
      }
      if (ok) {
        // As a line: the run's part of the feed taken off again (a line of negative length, its exact inverse) and the
        // run itself (the feed's C′, the inductance over the next plane) put in; ΔL is its low-frequency sum. Distributed,
        // so the run does not ring with the pad's ΔC as a lumped ΔL would (near 28 GHz on C44).
        const total = cuts[cuts.length - 1].over;
        const run: Element[] = [{ kind: 'line', name: `${side} feed's run over the antipad taken off`, len: -total * 1e-3, spec: baseSpec }];
        for (const g of [...segs].reverse()) run.push({ kind: 'line', name: `${side} feed over the antipad, ${g.len.toFixed(3)} mm`, len: g.len * 1e-3, spec: lineFromCL(baseSpec.C, g.L) });
        if (side === 'entry') before.push(...run); else after.push(...run.reverse());
        overL.push(dL);
        overs.push({ side, layer, ref: cuts.map((c) => c.ref).join(', '), next: cuts.map((c) => c.next).join(', '), length: cuts[cuts.length - 1].over, dL: dL[0][0] });
      }
    }
    if (fo === 'none') continue;
    let spec: LineSpec = null, zf = NaN, ef = NaN;
    if (fo === 'setup') {
      if (!trace) return failed('Feeds from the setup need a trace.', flags);
      spec = fl.spec; zf = fl.z0; ef = fl.eeff;
    } else {
      spec = fo[side];
      if (!spec) continue;
      zf = 1 / (spec.v[0] * spec.C[0][0]); ef = (CLIGHT / spec.v[0]) ** 2;
    }
    const el: Element = { kind: 'line', name: `${side} feed on ${layer}`, len: len * 1e-3, spec };
    if (side === 'entry') before.unshift(el); else after.push(el);
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
  let Lsum = rScale(rInv(C0), lenThrough / (CLIGHT * CLIGHT));
  for (const x of overL) Lsum = rAdd(Lsum, x);
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
    if (f8 < fValid) { fValid = f8; validWin = len; validEr = er; validWhy = `the lumped parts: λ/${LUMPED_FRACTION} of the ${len.toFixed(3)} mm window of ${c.layer} (εr ${er}), Cartier2007`; }
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
    nodes, pieces, stubs, feeds, overs, cavities: planeCavities(L, v, zEn, zEx, before.length, throughZ), lumped, valid: { fMax: fValid, reason: validWhy, window: validWin, er: validEr, lumped: fValid, cavity: NaN }, axiTotal: axi.total, axiTotalErr: axi.totalErr.e,
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
  const fCav = cavityBand(r, r.valid.lumped);
  r.valid.cavity = fCav;
  if (fCav < r.valid.fMax) {
    const c = r.cavities.reduce((a, b) => (b.fMax < a.fMax ? b : a), r.cavities[0]);
    r.valid.fMax = fCav;
    r.valid.reason = `the plane cavity ${c.top}–${c.bottom}: the radial wave the barrel launches between the planes past its ${c.returns} return via${c.returns === 1 ? '' : 's'} moves S by ${CAVITY_DS} (lumped parts to ${(r.valid.lumped / 1e9).toFixed(1)} GHz)`;
  }
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
    const m = buildVia(s, make(x), trace, { ...opt, feeds: 'none', estimate: false }); // the trace for each feed's run over the antipad (lumped holds it)
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
