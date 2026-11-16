// The numbers the EM theory's equations (lib/emsim/equations.ts) are evaluated and printed with (step M2.4b): one flat
// map from symbol name to SI value, taken from the solver's results and the tools' results, plus the few values the
// engine did not expose: each level's main value (the error and the observed order), Getsinger's dispersion and the
// frequency at which it reaches the solver's error, and the calculator's inputs by parts. Framework-free; nothing here
// changes an engine number.

import { C0, EPS0 } from './bem2d';
import { levelValues, mainKey, solveSetup, valuesOf, TDR_COMMON_OHM } from './lines';
import type { LineResults } from './lines';
import type { Reduced } from './closedform';
import { asJlcpcbCalculator, jlcAllBut, JLC_PARTS } from './jlcCalc';
import type { JlcPart } from './jlcCalc';
import type { Setup } from './setup';
import type { TraceKind } from './structure';
import type { CornersResult, McResult } from './vary';
import type { InverseResult } from './inverse';

/** µ₀ as the engine has it (L = µ₀ε₀·C0⁻¹ with µ₀ε₀ = 1/c0²). */
export const MU0 = 1 / (EPS0 * C0 * C0);

/** The main value (mainKey: z0, zdiff or z0.1) at each level the solver returned, coarse to fine. */
export function levelSeries(r: LineResults, key = mainKey(r.n)): number[] {
  if (!r.ok || !r.bem) return [];
  return r.bem.levels.map((lv) => levelValues(lv.C, lv.C0, lv.L, r.n).values[key]);
}

export interface Getsinger { eeffF: number; fp: number; G: number; rise: number }

/** Getsinger's εeff(f) of a microstrip (h in metres, Z0 in Ω): fp = Z0/(2µ₀h), G = 0.6 + 0.009·Z0; `rise` is relative. */
export function getsinger(z0: number, eeff: number, er: number, h: number, f: number): Getsinger {
  const fp = z0 / (2 * MU0 * h);
  const G = 0.6 + 0.009 * z0;
  const eeffF = er - (er - eeff) / (1 + G * (f / fp) ** 2);
  return { eeffF, fp, G, rise: (eeffF - eeff) / eeff };
}

/** The frequency at which Getsinger's relative rise equals δ = e/εeff; NaN when it never does (εr − εeff ≤ δ·εeff). */
export function getsingerLimit(z0: number, eeff: number, er: number, h: number, e: number): number {
  const delta = e / eeff;
  const G = 0.6 + 0.009 * z0;
  const den = G * (er - eeff - delta * eeff);
  if (!(den > 0)) return NaN;
  return (z0 / (2 * MU0 * h)) * Math.sqrt((delta * eeff) / den);
}

/** The calculator's inputs by parts (parts-sum): main values of the stackup, the calculator and each part alone. */
export interface CalcParts { stackup: number; calculator: number; parts: Record<JlcPart, number> }

/** Solves the setup, the setup "as JLCPCB's calculator" and each part as the stackup has it (jlcAllBut); a reason on failure. */
export function calculatorParts(setup: Setup, M = 2): CalcParts | string {
  const main = (s: Setup): number | string => {
    const r = solveSetup(s, { M });
    return r.ok ? valuesOf(r).values[mainKey(r.n)] : r.reason;
  };
  const stackup = main(setup);
  const calculator = main(asJlcpcbCalculator(setup).setup);
  if (typeof stackup === 'string') return stackup;
  if (typeof calculator === 'string') return calculator;
  const parts = {} as Record<JlcPart, number>;
  for (const p of JLC_PARTS) {
    const z = main(jlcAllBut(setup, p));
    if (typeof z === 'string') return z;
    parts[p] = z - calculator;
  }
  return { stackup, calculator, parts };
}

export interface EmContext {
  result: LineResults;
  /** The structure's kind (setup.trace.kind): Getsinger is bound for 'microstrip' and 'embedded' only. */
  kind?: TraceKind;
  /** closedForms(setup).reduced: h and εr under the trace for Getsinger. */
  reduced?: Reduced | null;
  /** Frequency for λ and Getsinger (default 10 GHz). */
  f?: number;
  /** Coupled length for the skew and FEXT (default 100 mm), the step's height and rise time (1 V in 100 ps). */
  ell?: number; step?: { v: number; t: number };
  /** The mode m of eeff-mode (default 0, the fastest). */
  mode?: number;
  /** A closed form's value against the field value (pct-diff). */
  formula?: { value: number; field: number };
  calc?: CalcParts | null;
  /** The Tolerance tool's results; `input` the ranked input i (default 0). */
  corners?: CornersResult | null; input?: number;
  mc?: McResult | null;
  /** A Target result (Tools): bound when reached (`target`, step M4.2). */
  inverse?: InverseResult | null;
}

/** Every symbol of EM_SYMBOLS that the context gives a number, in SI units (lengths in metres). */
export function emBinding(ctx: EmContext): Record<string, number> {
  const r = ctx.result;
  const b: Record<string, number> = { c_0: C0, mu_0: MU0, varepsilon_0: EPS0, R_TDR: TDR_COMMON_OHM };
  const f = ctx.f ?? 10e9;
  b.f = f; b.lambda_0 = C0 / f;
  b.ell = ctx.ell ?? 0.1; b.V_r = ctx.step?.v ?? 1; b.t_r = ctx.step?.t ?? 100e-12;
  if (!r.ok || !r.bem) return b;
  const n = r.n, C = r.bem.C, L = r.bem.L, Cv = r.bem.C0;
  const line = r.lines[0];
  b.C = C[0][0]; b.C_0 = Cv[0][0]; b.L = L[0][0];
  b.varepsilon_eff = line.eeff.v; b.tau = line.delay.v; b.v = 1 / line.delay.v; b.lambda = 1 / (line.delay.v * f);
  if (n === 1) { b.Z_0 = line.z0.v; b.Z_ohm = line.z0.v; }
  // the main value's levels: error and order
  const key = mainKey(n);
  const main = n === 2 && r.pair ? r.pair.zdiff : line.z0;
  b.e = main.e;
  const xs = levelSeries(r, key);
  if (xs.length >= 2) { b.X_M = xs[xs.length - 1]; b.X_M2 = xs[xs.length - 2]; }
  if (xs.length >= 3) {
    b.X_M4 = xs[xs.length - 3];
    const d1 = b.X_M - b.X_M2, d2 = b.X_M2 - b.X_M4;
    b.p = Math.log2(Math.abs(d2) / Math.abs(d1));
    // error-shown is bound only where the shown error is its rule (differences shrinking at least twofold, no floor)
    const dx = Math.max(Math.abs(d1), Math.abs(d2) / 4);
    if (d2 / d1 >= 2 && Math.abs(main.e - 1.5 * dx) <= 1e-9 * main.e) b.D_X = dx;
  }
  // Getsinger (one line of the microstrip kinds, where closedForms reduced the stackup)
  const red = ctx.reduced;
  if (n === 1 && red && (ctx.kind === 'microstrip' || ctx.kind === 'embedded')) {
    const h = red.h * 1e-3, er = red.er;
    const g = getsinger(line.z0.v, line.eeff.v, er, h, f);
    b.h = h; b.varepsilon_r = er; b.f_p = g.fp; b.G = g.G; b.varepsilon_f = g.eeffF;
    b.e_eff = line.eeff.e; b.delta = line.eeff.e / line.eeff.v;
    b.f_lim = getsingerLimit(line.z0.v, line.eeff.v, er, h, line.eeff.e);
    b.x = (b.f_lim / g.fp) ** 2;
  }
  // a pair
  if (n === 2 && r.pair) {
    const p = r.pair;
    b.L_11 = L[0][0]; b.L_12 = L[0][1]; b.C_11 = C[0][0]; b.C_12 = C[0][1];
    b.Z_odd = p.zodd.v; b.Z_even = p.zeven.v; b.Z_diff = p.zdiff.v; b.Z_cm = p.zcm.v; b.Z_dd = p.zdiff.v; b.Z_cc = p.zcm.v;
    b.Z_dc = p.zdc.v; b.Z_diffB = p.zdiffB.v; b.Z_cmB = p.zcmB.v; b.Z_TDR = p.ztdr.v;
    b.Z_c11 = r.Zc[0][0]; b.Z_c22 = r.Zc[1][1]; b.Z_c12 = r.Zc[0][1];
    b.Y_c11 = r.Yc[0][0]; b.Y_c22 = r.Yc[1][1]; b.Y_c12 = r.Yc[0][1];
    b.k_b = p.kb.v; b.k_f = p.kf.v; b.C_m = -C[0][1]; b.L_m = L[0][1]; b.v_c = 1 / Math.sqrt(L[0][0] * C[0][0]);
    b.V_FEXT = p.kf.v * b.ell * b.V_r / b.t_r;
    const m = r.modes[ctx.mode ?? 0];
    if (m) { b.varepsilon_effm = m.eeff.v; b.v_m = m.v; }
    const odd = r.modes.find((x) => x.label === 'odd' || x.label === 'π');
    const even = r.modes.find((x) => x.label === 'even' || x.label === 'c');
    if (odd && even) { b.tau_odd = odd.delay.v; b.tau_even = even.delay.v; b.Delta_tau = (even.delay.v - odd.delay.v) * b.ell; }
  }
  if (ctx.formula) { b.X_formula = ctx.formula.value; b.X_field = ctx.formula.field; b.Delta = (ctx.formula.value - ctx.formula.field) / ctx.formula.field; }
  if (ctx.calc) {
    const c = ctx.calc;
    b.Z_stackup = c.stackup; b.Z_calc = c.calculator; b.Delta_Z = c.stackup - c.calculator;
    b.Delta_er = c.parts.er; b.Delta_cu = c.parts.copper; b.Delta_etch = c.parts.etch; b.Delta_mask = c.parts.mask;
    b.Delta_sum = c.parts.er + c.parts.copper + c.parts.etch + c.parts.mask;
  }
  const co = ctx.corners;
  if (co && co.ok && co.inputs.length) {
    const k = co.key;
    const inp = co.inputs[Math.min(ctx.input ?? 0, co.inputs.length - 1)];
    b.Z_plus = inp.hi[k]; b.Z_minus = inp.lo[k]; b.d_i = inp.d[k]; b.t_i = inp.lim; b.sigma_i = inp.lim / 3;
    b.S_d = co.inputs.reduce((a, x) => a + x.d[k] * x.d[k], 0);
    b.s_i = b.S_d > 0 ? (b.d_i * b.d_i) / b.S_d : 0;
    b.sigma = Math.sqrt(b.S_d) / 3;
    const c = co.corners.find((x) => x.key === k);
    if (c) { b.Z_hi = c.hi; b.Z_lo = c.lo; b.Z_hiat = c.hi; b.Z_loat = c.lo; }
  }
  const inv = ctx.inverse;
  if (inv && inv.ok && inv.reached) { b.Z_x = inv.value; b.Z_target = inv.target; }
  return b;
}
