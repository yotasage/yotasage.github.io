// The numbers of the via entries of the EM registry (step M4.2; equationsVia.ts): every symbol in SI units from one
// via model result (viamodel.viaModel), the piece, node, stub, feed, frequency and TDR time the page points at, and a
// via target's result. Complex values (chain matrices, S-parameters) are (re, im) pairs, as the shared engine's
// `Value`. The harness (scripts/harness/emsim/check-teach.mjs) evaluates every via entry on these against the engine.


import { C0 as CLIGHT, EPS0 } from './bem2d';
import { BAND_LEVEL, chainAbcd, nearestReturn } from './viamodel';
import type { Element, ViaModelResult, ViaTargetResult } from './viamodel';
import { EDGE_Z90, edgeSigma } from './tdr';
import type { NPort } from './nport';
import type { ViaStructure } from './via';
import type { Value } from '../equations/compile';

export const MU0_VIA = 1 / (EPS0 * CLIGHT * CLIGHT);
/** The level of the edge's spectrum where the via model's sweep ends (−60 dB). */
export const SWEEP_LEVEL = 1e-3;

export interface ViaContext {
  model: ViaModelResult;
  via: ViaStructure;
  /** Index into model.pieces (default: the first piece between the signal layers). */
  piece?: number;
  /** Index into model.nodes (default: the first node with a ΔC). */
  node?: number;
  stub?: number; feed?: number;
  /** Index into nport.f (default: the point nearest 10 GHz). */
  fIndex?: number;
  /** Index into tdr.t (default: the TDR's lowest impedance). */
  tIndex?: number;
  /** A via target's result: bound only when reached. */
  target?: ViaTargetResult | null;
}

/** The thin-wire estimate of a barrel of radius a among N return vias of radius b at R (m), in εr (via-quasi-coax). */
export function quasiCoax(a: number, b: number, R: number, N: number, er: number): number {
  const eta0 = 1 / (EPS0 * CLIGHT);
  return (eta0 * (Math.log(R / a) + Math.log(R / (N * b)) / N)) / (2 * Math.PI * Math.sqrt(er));
}

/** S_ij (0-based) at frequency index k as (re, im). */
export function sAt(np: NPort, k: number, i: number, j: number): [number, number] {
  const P = np.ports, q = 2 * ((k * P + i) * P + j);
  return [np.s[q], np.s[q + 1]];
}

/** The index of the value in an ascending array nearest to x. */
export function nearestIndex(xs: ArrayLike<number>, x: number): number {
  let best = 0;
  for (let k = 1; k < xs.length; k++) if (Math.abs(xs[k] - x) < Math.abs(xs[best] - x)) best = k;
  return best;
}

/** Every element of the chain, stubs' elements included, in order. */
function allElements(els: Element[], out: Element[] = []): Element[] {
  for (const e of els) { out.push(e); if (e.kind === 'stub') allElements(e.elements, out); }
  return out;
}

const cx = (M: Float64Array, k: number): [number, number] => [M[2 * k], M[2 * k + 1]];

/** Every symbol of the via entries that the context gives a number. */
export function viaBinding(ctx: ViaContext): Record<string, Value> {
  const r = ctx.model, v = ctx.via;
  const b: Record<string, Value> = {
    c_0: CLIGHT, mu_0: MU0_VIA, varepsilon_0: EPS0, eta_0: 1 / (EPS0 * CLIGHT), z_90: EDGE_Z90, L_e: SWEEP_LEVEL, L_b: BAND_LEVEL,
  };
  if (!r || !r.ok) return b;
  const n = r.n;
  b.t_r = r.tr; b.f_3 = r.f3; b.f_band = r.band; b.sigma_e = edgeSigma(r.tr);
  b.Z_vac = r.barrel.zVac; b.C_0p = r.barrel.C0[0][0];
  b.d = v.drill.v * 1e-3; b.a = v.drill.v * 0.5e-3; b.R_eq = r.wall.Req * 1e-3; b.D = 2 * r.wall.Req * 1e-3;
  const els = allElements(r.elements);
  // the piece
  const pi = ctx.piece ?? Math.max(0, r.pieces.findIndex((p) => p.part === 'through'));
  const p = r.pieces[pi];
  if (p) {
    b.varepsilon_ri = p.er; b.Z_i = p.z0; b.tau_i = p.delay; b.ell_i = (p.zTop - p.zBot) * 1e-3;
    // the quasi-coax estimate: one via, every return via at one distance with one drill
    const R = nearestReturn(v);
    const same = v.returns.length > 0 && v.returns.every((x) => Math.abs(Math.hypot(x.x.v, x.y.v) - R) <= 1e-9 * R && x.drill.v === v.returns[0].drill.v);
    if (n === 1 && same) {
      b.R = R * 1e-3; b.N = v.returns.length; b.b = v.returns[0].drill.v * 0.5e-3;
      b.Z_qc = quasiCoax(b.a as number, b.b as number, b.R as number, b.N as number, p.er);
    }
  }
  // the through section
  let ell = 0;
  for (const x of r.pieces) if (x.part === 'through') ell += (x.zTop - x.zBot) * 1e-3;
  b.ell_th = ell;
  const L = r.lumped;
  if (L) {
    b.L_over = r.overs.reduce((a, o) => a + o.dL, 0);
    b.L_sec = L.L[0][0]; b.C_sec = L.C[0][0]; b.C_line = L.lineC; b.Delta_Csum = L.dCsum; b.Z_sec = L.z; b.tau_sec = L.delay;
    if (n === 1 && r.wall.kind === 'equivalent') b.C_axi = r.axiTotal;
    if (n === 2) {
      b.L_s11 = L.L[0][0]; b.L_s12 = L.L[0][1]; b.C_s11 = L.C[0][0]; b.C_s12 = L.C[0][1]; b.Z_diffsec = L.zdiff; b.Z_cmsec = L.zcm;
      b.k_12 = r.barrel.k12; b.C_0p12 = r.barrel.C0[0][1];
    }
  }
  // the frequency
  const np = r.nport;
  const k = np ? (ctx.fIndex ?? nearestIndex(np.f, 10e9)) : -1;
  const f = np ? np.f[k] : 10e9;
  b.f = f;
  if (np) b.f_end = np.f[np.f.length - 1];
  // the node
  const nk = ctx.node ?? r.nodes.findIndex((x) => x.dC !== 0);
  const nd = r.nodes[nk];
  if (nd && nd.dC) {
    b.Delta_C = nd.dC;
    const sh = els.find((e) => e.kind === 'shunt' && e.name === `ΔC ${nd.layer}`);
    if (sh && sh.kind === 'shunt') {
      if (n === 1) b.C_sh = cx(chainAbcd([sh], f, 1), 2);
      else b.Delta_C12 = sh.C[0][1];
    }
  }
  // the stub: its first piece as a line open at its far end
  const st = r.stubs[ctx.stub ?? 0];
  if (st) {
    b.tau_stub = st.delay; b.f_stub = st.fFormula;
    const sp = r.pieces.find((x) => x.part === `${st.side} stub`);
    const se = r.elements.find((e) => e.kind === 'stub' && e.name.startsWith(st.side));
    const first = se && se.kind === 'stub' ? se.elements[0] : null;
    if (n === 1 && sp && first && first.kind === 'line') {
      const M = chainAbcd([first], f, 1), A = cx(M, 0), C = cx(M, 2), dd = C[0] * C[0] + C[1] * C[1];
      b.Z_in = [(A[0] * C[0] + A[1] * C[1]) / dd, (A[1] * C[0] - A[0] * C[1]) / dd];
      b.Z_s = sp.z0; b.tau_s = sp.delay; b.theta_s = 2 * Math.PI * f * sp.delay;
    }
  }
  // the model's limit
  if (Number.isFinite(r.valid.lumped) && Number.isFinite(r.valid.window)) {
    b.f_valid = r.valid.lumped; b.ell_w = r.valid.window * 1e-3; b.varepsilon_rw = r.valid.er;
  }
  // the feed
  const fd = r.feeds[ctx.feed ?? 0];
  if (fd && n === 1) {
    const fe = r.elements.find((e) => e.kind === 'line' && e.name === `${fd.side} feed on ${fd.layer}`);
    if (fe && fe.kind === 'line') { b.ell_f = fd.length * 1e-3; b.varepsilon_efff = fd.eeff; b.t_rt = (2 * fe.len) / fe.spec.v[0]; }
  }
  // the TDR
  const td = r.tdr;
  if (td) {
    let tk = ctx.tIndex ?? 0;
    if (ctx.tIndex === undefined) for (let i = 1; i < td.z.length; i++) if (td.z[i] < td.z[tk]) tk = i;
    b.Z_ref = td.zRef; b.rho = td.rho[tk]; b.Z_t = td.z[tk];
  }
  // a piece's chain matrix, the whole chain's and the S-parameters (single via); the mixed mode (pair)
  if (np && n === 1) {
    const pe = p ? r.elements.find((e) => e.kind === 'line' && e.name.startsWith('barrel') && Math.abs(e.len - (p.zTop - p.zBot) * 1e-3) <= 1e-15 && Math.abs((CLIGHT / e.spec.v[0]) ** 2 - p.er) <= 1e-12 * p.er) : null;
    if (pe) {
      const M = chainAbcd([pe], f, 1);
      b.A_l = cx(M, 0); b.B_l = cx(M, 1); b.C_l = cx(M, 2); b.theta_i = 2 * Math.PI * f * p.delay;
    }
    const W = chainAbcd(r.elements, f, 1);
    b.A_c = cx(W, 0); b.B_c = cx(W, 1); b.C_c = cx(W, 2); b.D_c = cx(W, 3);
    b.Z_ref = np.z0[0];
    b.S_11 = sAt(np, k, 0, 0); b.S_21 = sAt(np, k, 1, 0);
    const s21 = b.S_21 as [number, number];
    b.S_dB = 20 * Math.log10(Math.hypot(s21[0], s21[1]));
  }
  if (np && n === 2 && r.mixed) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) b[`S_${i + 1}${j + 1}`] = sAt(np, k, i, j);
    b.S_dd11 = sAt(r.mixed, k, 0, 0); b.S_dd21 = sAt(r.mixed, k, 1, 0); b.S_cc11 = sAt(r.mixed, k, 2, 2); b.S_cd21 = sAt(r.mixed, k, 3, 0);
  }
  // a target
  const tg = ctx.target;
  if (tg && tg.reached) { b.Z_secx = tg.value; b.Z_target = tg.target; }
  return b;
}
