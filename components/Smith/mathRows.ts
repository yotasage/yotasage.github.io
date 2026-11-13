// The rows of the Smith chart's equation panel (step M5.1, docs/smith-chart/learning.md §3), framework-free: for the
// selected thing (a part, a node, the input, the readout's point) the registry's equations by id (lib/smith/equations.ts)
// with the engine's numbers (network.evaluateCircuit, parts.added, convert) as three kinds of line: the symbolic one
// (variables coloured like their object on the chart, through sentinel colours, learning.md §2), one line per member
// with the values put in (equations.ts `substitutions`, the Theory section's printer) and the result. Values at
// rounding level follow plan.md D20 (lib/quantity.ts): in the substituted lines a residual part is put in as 0, the
// result line says the bound ("|Γ| < 10⁻¹²", "RL > 240 dB") and the raw number stays beside it. Each row also gives
// the binding (every variable's raw value), so the harness (scripts/harness/smith/ui-math.mjs) can evaluate the
// registry's tree on it and compare with the engine. Nothing here allocates per point; a row set is built once per
// circuit, subject and digits, at most once per frame.

import { ROUNDING_FLOOR, RL_CEILING, belowFloor, formatAmount } from '../../lib/quantity';
import {
  admittanceFromGamma, gammaFromImpedance, gammaMag, impedanceFromGamma, returnLoss, vswr, yFromGamma, zFromGamma,
} from '../../lib/smith/convert';
import { EQUATION_BY_ID, TexPiece, substitutions, tex, valueTex } from '../../lib/smith/equations';
import {
  M_GI, M_GR, M_MAG, M_ML, M_RL, M_VSWR, M_YI, M_YR, M_ZI, M_ZR, METRIC_STRIDE, evaluateCircuit,
} from '../../lib/smith/network';
import type { Circuit } from '../../lib/smith/network';
import {
  LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT, added, turnsAt,
} from '../../lib/smith/parts';
import { goalNode, isCircleGoal } from '../../lib/smith/goal';
import { askOf } from '../../lib/smith/state';
import type { Circuit as StateCircuit } from '../../lib/smith/state';
import { complexText } from './readout';

const TAU = 2 * Math.PI;

/** What the panel shows the equations of: a part (index from the load), a node (0 the load … n the input), the readout's point. */
export type Subject = { t: 'part'; i: number } | { t: 'node'; k: number } | { t: 'point' };

/** The colours of the panel: the eight part colours of the chart (`--part-n`) and the readout's point (`--accent`). */
export const COLOUR_KEYS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'pt'] as const;
export type ColourKey = (typeof COLOUR_KEYS)[number];
/**
 * The sentinel colour of a variable in the TeX (`\textcolor`), replaced in the MathML by its colour's class and its
 * target (learning.md §2; M5.2): `#0a` + the colour (1 + its index in COLOUR_KEYS, 0 for none) + the variable's index
 * among its row's variables (`MathRow.targets`), two hex digits each.
 */
export const sentinel = (colour: number, variable: number): string =>
  `#0a${colour.toString(16).padStart(2, '0')}${variable.toString(16).padStart(2, '0')}`;

/**
 * What a variable stands for on the page (M5.2), as space-separated tokens: `p<i>` part i (its arc, handle, tile and
 * card), `n<k>` node k (its marker, its row of the node table, the circuit input when k is the input), `goal` the
 * goal's ring, mark and line (a variable of the goal's node that the goal is about), `r<field>` the readout's row of a
 * READOUT_FIELDS field (`rgamma` both Γ rows).
 */
const POINT_TARGETS: Readonly<Record<string, string>> = {
  z: 'rz', r: 'rz', x: 'rz', Z: 'rZ', y: 'ry', g: 'ry', b: 'ry', Y: 'rY', Gamma: 'rgamma', VSWR: 'rvswr', RL: 'rrl',
};
/** Constants: no target. */
const NO_TARGET = new Set(['Z_0', 'Y_0', 'omega', 'beta', 'lambda']);
/** A part's variables that are the node it starts at, and those of the node it ends at (with Γ, z and Z of `gamma-z`). */
const BEFORE = new Set(['z_L', 'y_L', 'Z_L', 'Gamma_c']);
const AFTER = new Set(['z_in', 'y_in', 'Z_in']);
/** The variables of the goal's node that a goal is about: a circle goal's |Γ| and its measures, a point target's z. */
const CIRCLE_GOAL = new Set(['Gamma', 'VSWR', 'RL', 'ML']);
const POINT_GOAL = new Set(['Gamma', 'z', 'Z']);

const partKey = (i: number): ColourKey => COLOUR_KEYS[i % 8];
/** A node takes the colour of the arc that ends at it (part k − 1); the load has none. */
const nodeKey = (k: number): ColourKey | undefined => (k > 0 ? partKey(k - 1) : undefined);

/** A variable's value: its raw (re, im) for the binding and how it is printed. */
export interface Var { re: number; im: number; unit: string; floor: number; tex?: (digits: number) => TexPiece }

/** The registry entry, its variables' values and colours (cheap to make; a row's TeX is made from it when it is drawn). */
export interface Spec {
  id: string; vars: Record<string, Var>; colours: Record<string, ColourKey | undefined>;
  /** What each variable stands for on the page (M5.2, POINT_TARGETS), set by specsOf. */
  targets?: Record<string, string>;
}

/** One row as the panel prints it. */
export interface MathRow {
  id: string;
  title: string;
  /** The symbolic left side and right side (all its members, joined by "="), with sentinel colours. */
  lhs: string;
  rhs: string;
  /** The members with the values put in, each printed after "= ". */
  lines: string[];
  /** The result: after "= " (`bound` false), or a whole statement such as `\left|\Gamma\right| < 10^{-12}` (D20). */
  result: string;
  bound: boolean;
  /** The raw result as text ("1.110e−16 − j2.220e−17") when what is shown is rounded to the floor of D20, else ''. */
  raw: string;
  /** Every variable with a finite value: (re, im), raw (for the harness). */
  binding: Record<string, [number, number]>;
  /** M5.2: the targets of the spec's variables in their order (the sentinels' second index; '' for none), and the left side's. */
  targets: string[];
  target: string;
}

const fin = (re: number, im: number): boolean => Number.isFinite(re) && Number.isFinite(im);
const fl = (v: number, floor: number): number => (floor > 0 && belowFloor(v, floor) ? 0 : v);

/** A unitless, ohm or siemens value with its floor of D20 (a part at rounding level of 1, of Z0 or of 1/Z0). */
const v = (re: number, im: number, unit: string, z0: number): Var => ({
  re, im, unit, floor: unit === 'Ω' ? ROUNDING_FLOOR * z0 : unit === 'S' ? ROUNDING_FLOOR / z0 : unit === '' || unit === 'dB' ? ROUNDING_FLOOR : 0,
});
/** A value with a printed form of its own (ω as 2π·f0, βℓ in wavelengths, Γ in polar form). */
const special = (re: number, tex: (digits: number) => TexPiece): Var => ({ re, im: 0, unit: '', floor: 0, tex });

// The printed forms of the specials. β is 2π per wavelength and ℓ a number of wavelengths, so βℓ = 2π·ℓ/λ is printed
// as such and bound as β = 2π, ℓ = turns, λ = 1 (the equation holds in wavelengths).
const omegaVar = (f0: number): Var => special(TAU * f0, (d) => {
  const f = valueTex(f0, 0, 'Hz', d);
  return { s: `2\\pi \\cdot ${f.s}`, p: 2, digit: true };
});
const BETA = special(TAU, () => ({ s: '\\frac{2\\pi}{\\lambda}', p: 5, tall: true }));
const LAMBDA = special(1, () => ({ s: '\\lambda', p: 5 }));
const ellVar = (turns: number): Var => special(turns, (d) => ({ s: `${valueTex(turns, 0, '', d).s}\\,\\lambda`, p: 2, digit: true }));
const thetaVar = (turns: number): Var => special(TAU * turns, (d) => ({ s: `${valueTex(TAU * turns, 0, '', d).s}\\,\\mathrm{rad}`, p: 2, digit: true }));
/** Γ in polar form (inside |…| of the VSWR and the losses); 0 and a residual under the floor are 0. */
const polarVar = (gr: number, gi: number): Var => ({
  re: gr, im: gi, unit: '', floor: 0,
  tex: (d) => { const m = gammaMag(gr, gi); return m === 0 || belowFloor(m) ? valueTex(0, 0, '', d) : valueTex(gr, gi, '', d, true); },
});

const scratch = new Float64Array(2);

/** The registry rows of the figures of one node (z, Γ, VSWR, return loss, mismatch loss), from its metrics at m. */
function nodeSpecs(metrics: Float64Array, m: number, z0: number, colour: ColourKey | undefined, out: Spec[]): void {
  const zr = metrics[m + M_ZR], zi = metrics[m + M_ZI], gr = metrics[m + M_GR], gi = metrics[m + M_GI];
  const all = (names: string[]) => Object.fromEntries(names.map((n) => [n, n === 'Z_0' ? undefined : colour]));
  const z = v(zr, zi, '', z0), Z = v(zr * z0, zi * z0, 'Ω', z0), Z0 = v(z0, 0, 'Ω', z0), G = v(gr, gi, '', z0), P = polarVar(gr, gi);
  out.push(
    { id: 'z-norm', vars: { z, Z, Z_0: Z0, r: v(zr, 0, '', z0), x: v(zi, 0, '', z0) }, colours: all(['z', 'Z', 'r', 'x']) },
    { id: 'gamma-z', vars: { Gamma: G, z, Z, Z_0: Z0 }, colours: all(['Gamma', 'z', 'Z']) },
    { id: 'vswr', vars: { VSWR: v(metrics[m + M_VSWR], 0, '', z0), Gamma: P }, colours: all(['VSWR', 'Gamma']) },
    { id: 'return-loss', vars: { RL: v(metrics[m + M_RL], 0, 'dB', z0), Gamma: P }, colours: all(['RL', 'Gamma']) },
    { id: 'mismatch-loss', vars: { ML: v(metrics[m + M_ML], 0, 'dB', z0), Gamma: P }, colours: all(['ML', 'Gamma']) },
  );
}

/** The rows of part i: what it adds (in its own equation), how that moves the node, and Γ where it ends. */
function partSpecs(c: Circuit, metrics: Float64Array, i: number, out: Spec[]): void {
  const p = c.parts[i], z0 = c.z0, f0 = c.f0;
  const a = i * METRIC_STRIDE, b = a + METRIC_STRIDE;
  const zc = p.kind === QUARTER ? p.value : p.zc ?? z0;
  const ad = added(p.kind, p.value, zc, f0, f0, z0);
  const P = partKey(i), before = nodeKey(i);
  const Z0 = v(z0, 0, 'Ω', z0);
  const zL = v(metrics[a + M_ZR], metrics[a + M_ZI], '', z0), zIn = v(metrics[b + M_ZR], metrics[b + M_ZI], '', z0);
  const yL = v(metrics[a + M_YR], metrics[a + M_YI], '', z0), yIn = v(metrics[b + M_YR], metrics[b + M_YI], '', z0);
  const ZL = v(zL.re * z0, zL.im * z0, 'Ω', z0), ZIn = v(zIn.re * z0, zIn.im * z0, 'Ω', z0);
  const series = (zs: Var): Spec => ({ id: 'series-adds-z', vars: { z_L: zL, z_s: zs, z_in: zIn }, colours: { z_L: before, z_s: P, z_in: P } });
  const shunt = (yp: Var): Spec => ({ id: 'shunt-adds-y', vars: { y_L: yL, y_p: yp, y_in: yIn }, colours: { y_L: before, y_p: P, y_in: P } });
  const w = omegaVar(f0);
  switch (p.kind) {
    case SERIES_R:
      out.push({ id: 'r-series', vars: { r: v(ad, 0, '', z0), R: v(p.value, 0, 'Ω', z0), Z_0: Z0 }, colours: { r: P, R: P } }, series(v(ad, 0, '', z0)));
      break;
    case SERIES_L: case SERIES_C: {
      const sym = p.kind === SERIES_L ? 'L' : 'C';
      out.push({
        id: p.kind === SERIES_L ? 'x-series-l' : 'x-series-c',
        vars: { x: v(ad, 0, '', z0), X: v(ad * z0, 0, 'Ω', z0), Z_0: Z0, omega: w, [sym]: v(p.value, 0, sym === 'L' ? 'H' : 'F', z0) },
        colours: { x: P, X: P, [sym]: P },
      }, series(v(0, ad, '', z0)));
      break;
    }
    case SHUNT_R:
      out.push({ id: 'g-shunt', vars: { g: v(ad, 0, '', z0), R: v(p.value, 0, 'Ω', z0), Z_0: Z0 }, colours: { g: P, R: P } }, shunt(v(ad, 0, '', z0)));
      break;
    case SHUNT_L: case SHUNT_C: {
      const sym = p.kind === SHUNT_L ? 'L' : 'C';
      out.push({
        id: p.kind === SHUNT_L ? 'b-shunt-l' : 'b-shunt-c',
        vars: { b: v(ad, 0, '', z0), B: v(ad / z0, 0, 'S', z0), Z_0: Z0, omega: w, [sym]: v(p.value, 0, sym === 'L' ? 'H' : 'F', z0) },
        colours: { b: P, B: P, [sym]: P },
      }, shunt(v(0, ad, '', z0)));
      break;
    }
    case STUB_OPEN: case STUB_SHORT: {
      const t = turnsAt(p.kind, p.value, f0, f0);
      out.push({
        id: p.kind === STUB_OPEN ? 'stub-open-b' : 'stub-short-b',
        vars: { b: v(ad, 0, '', z0), B: v(ad / z0, 0, 'S', z0), Z_0: Z0, Y_c: v(1 / zc, 0, 'S', z0), Z_c: v(zc, 0, 'Ω', z0), beta: BETA, ell: ellVar(t) },
        colours: { b: P, B: P, Y_c: P, Z_c: P, ell: P },
      }, shunt(v(0, ad, '', z0)));
      break;
    }
    case LINE: {
      const t = turnsAt(LINE, p.value, f0, f0);
      gammaFromImpedance(scratch, 0, ZL.re, ZL.im, zc);
      out.push(
        { id: 'line-theta', vars: { theta: thetaVar(t), beta: BETA, ell: ellVar(t), lambda: LAMBDA }, colours: { theta: P, ell: P } },
        {
          id: 'line-zin',
          vars: { Z_in: ZIn, Z_c: v(zc, 0, 'Ω', z0), Z_L: ZL, beta: BETA, ell: ellVar(t), Gamma_c: v(scratch[0], scratch[1], '', z0) },
          colours: { Z_in: P, Z_c: P, ell: P, Z_L: before, Gamma_c: before },
        },
      );
      break;
    }
    case QUARTER:
      out.push({ id: 'quarter-wave', vars: { Z_in: ZIn, Z_t: v(p.value, 0, 'Ω', z0), Z_L: ZL }, colours: { Z_in: P, Z_t: P, Z_L: before } });
      break;
    default: break;
  }
  // Where the part leaves the point: Γ at the node it ends at.
  out.push({
    id: 'gamma-z', vars: { Gamma: v(metrics[b + M_GR], metrics[b + M_GI], '', z0), z: zIn, Z: ZIn, Z_0: Z0 },
    colours: { Gamma: P, z: P, Z: P },
  });
}

/** The rows of the readout's point Γ = (gr, gi): z and Z from Γ, y and Y, VSWR and return loss. */
function pointSpecs(gr: number, gi: number, z0: number, out: Spec[]): void {
  zFromGamma(scratch, 0, gr, gi);
  const z = v(scratch[0], scratch[1], '', z0), r = v(scratch[0], 0, '', z0), x = v(scratch[1], 0, '', z0);
  impedanceFromGamma(scratch, 0, gr, gi, z0);
  const Z = v(scratch[0], scratch[1], 'Ω', z0);
  yFromGamma(scratch, 0, gr, gi);
  const y = v(scratch[0], scratch[1], '', z0), g = v(scratch[0], 0, '', z0), b = v(scratch[1], 0, '', z0);
  admittanceFromGamma(scratch, 0, gr, gi, z0);
  const Y = v(scratch[0], scratch[1], 'S', z0);
  const mag = gammaMag(gr, gi), G = v(gr, gi, '', z0), P = polarVar(gr, gi), Z0 = v(z0, 0, 'Ω', z0);
  const all = (names: string[]): Record<string, ColourKey> => Object.fromEntries(names.map((n) => [n, 'pt' as ColourKey]));
  out.push(
    { id: 'z-gamma', vars: { z, Gamma: G }, colours: all(['z', 'Gamma']) },
    { id: 'z-norm', vars: { z, Z, Z_0: Z0, r, x }, colours: all(['z', 'Z', 'r', 'x']) },
    { id: 'y-norm', vars: { y, Y, Y_0: v(1 / z0, 0, 'S', z0), Z_0: Z0, z, g, b }, colours: all(['y', 'Y', 'z', 'g', 'b']) },
    { id: 'vswr', vars: { VSWR: v(vswr(mag), 0, '', z0), Gamma: P }, colours: all(['VSWR', 'Gamma']) },
    { id: 'return-loss', vars: { RL: v(returnLoss(mag), 0, 'dB', z0), Gamma: P }, colours: all(['RL', 'Gamma']) },
  );
}

/** The registry ids the panel shows for a subject (the rows' order; React renders their frames from this). */
export function rowIds(c: Circuit, s: Subject): string[] {
  const out: Spec[] = [];
  specsOf(c, s, NaN, NaN, out, true);
  return out.map((r) => r.id);
}

/** The rows' specs for a subject (for the readout's point, Γ = (gr, gi)): one evaluation of the circuit. */
export function specsFor(c: Circuit, s: Subject, gr = NaN, gi = NaN): Spec[] {
  const out: Spec[] = [];
  specsOf(c, s, gr, gi, out);
  return out;
}

function specsOf(c: Circuit, s: Subject, gr: number, gi: number, out: Spec[], shapeOnly = false): void {
  if (s.t === 'point') { pointSpecs(shapeOnly ? 0 : gr, shapeOnly ? 0 : gi, c.z0, out); pointTargets(out); return; }
  const n = c.parts.length;
  // Only the shape is needed: a circuit's evaluation is cheap, but not needed for the ids.
  const metrics = shapeOnly ? new Float64Array((n + 1) * METRIC_STRIDE) : evaluateCircuit(c).metrics;
  if (s.t === 'part' && s.i >= 0 && s.i < n) partSpecs(c, metrics, s.i, out);
  else if (s.t === 'node') { const k = Math.max(0, Math.min(n, s.k)); nodeSpecs(metrics, k * METRIC_STRIDE, c.z0, nodeKey(k), out); }
  else return;
  // The targets: a node's every variable is the node; a part's are the part, or the node it starts or ends at.
  const goal = askOf(c as StateCircuit).goal;
  const gk = goalNode(goal, n), about = isCircleGoal(goal) ? CIRCLE_GOAL : POINT_GOAL;
  const pi = s.t === 'part' ? s.i : -1;
  for (const sp of out) {
    const t: Record<string, string> = {};
    const end = s.t === 'node' ? Math.max(0, Math.min(n, s.k)) : sp.id === 'gamma-z' ? pi + 1 : -1;
    for (const name in sp.vars) {
      if (NO_TARGET.has(name)) continue;
      let k = end;
      if (pi >= 0 && k < 0) k = BEFORE.has(name) ? pi : AFTER.has(name) ? pi + 1 : -1;
      t[name] = k < 0 ? `p${pi}` : k === gk && about.has(name) ? `n${k} goal` : `n${k}`;
    }
    sp.targets = t;
  }
}

/** The point's rows: each variable's readout row. */
function pointTargets(out: Spec[]): void {
  for (const sp of out) {
    const t: Record<string, string> = {};
    for (const name in sp.vars) if (POINT_TARGETS[name]) t[name] = POINT_TARGETS[name];
    sp.targets = t;
  }
}

/** The subject in words, for the panel's head ("Part 2: series L", "Node 1", "The input", "The readout's point"). */
export function subjectName(c: Circuit, s: Subject): string {
  const n = c.parts.length;
  if (s.t === 'point') return 'the readout’s point';
  if (s.t === 'part') return `part ${s.i + 1}`;
  return s.k === 0 ? (n === 0 ? 'the load (the input)' : 'the load') : s.k === n ? 'the input' : `node ${s.k}`;
}

const GAMMAS = new Set(['Gamma', 'Gamma_in', 'Gamma_L', 'Gamma_c']);

/** The TeX of a variable's value (D20: a part under its floor put in as 0); ±∞ alone as ∞, otherwise undefined when not finite. */
function texOf(x: Var, digits: number): TexPiece | undefined {
  if (!fin(x.re, x.im)) return x.im === 0 && Math.abs(x.re) === Infinity && !x.tex ? valueTex(x.re, 0, x.unit, digits) : undefined;
  return x.tex ? x.tex(digits) : valueTex(fl(x.re, x.floor), fl(x.im, x.floor), x.unit, digits);
}

/**
 * The rows for a subject on a circuit at the digits setting; for the readout's point, Γ = (gr, gi). `variable`
 * decorates the symbolic sides (the panel colours them with SENTINELS).
 */
export function mathRows(c: Circuit, s: Subject, digits: number, gr = NaN, gi = NaN): MathRow[] {
  return specsFor(c, s, gr, gi).map((sp) => rowOf(sp, digits));
}

/** One row's lines from its spec (≈ 0.05 ms): made only when the row is drawn. */
export function rowOf(sp: Spec, digits: number): MathRow {
  const eq = EQUATION_BY_ID.get(sp.id);
  if (!eq) throw new Error(`Unknown equation "${sp.id}" in the equation panel.`);
  const values: Record<string, TexPiece | undefined> = {};
  const binding: Record<string, [number, number]> = {};
  for (const name in sp.vars) {
    const x = sp.vars[name];
    values[name] = texOf(x, digits);
    if (fin(x.re, x.im)) binding[name] = [x.re, x.im];
  }
  // A variable with a colour or a target is wrapped in its sentinel (learning.md §2), which the panel turns into a class
  // and a target attribute.
  const names = Object.keys(sp.vars), tg = sp.targets ?? {};
  const targets = names.map((name) => tg[name] ?? '');
  const colour = (name: string, tex: string): string => {
    const k = sp.colours[name], j = names.indexOf(name);
    if (!k && !(j >= 0 && targets[j])) return tex;
    return `\\textcolor{${sentinel(k ? COLOUR_KEYS.indexOf(k) + 1 : 0, j >= 0 ? j : 255)}}{${tex}}`;
  };
  const lhsName = eq.tree.t === 'eq' && eq.tree.xs[0].t === 'id' ? eq.tree.xs[0].v : '';
  const target = tg[lhsName] ?? '';
  const sub = substitutions(eq.tree, values, colour);
  if (!sub) {
    // The left side has no finite value here (an open, a part at ∞): the symbolic line only.
    const sides = eq.tree.t === 'eq' ? eq.tree.xs : [eq.tree];
    const deco = { variable: colour };
    const rhs = sides.slice(1).map((x) => { const t = tex(x, deco); return t.startsWith('-') ? `{${t}}` : t; }).join(' = ');
    return { id: sp.id, title: eq.title, lhs: tex(sides[0], deco), rhs, lines: [], result: '\\text{not a finite number here}', bound: true, raw: '', binding, targets, target };
  }
  const shown = values[lhsName]!;
  const lines = sub.lines;
  const last = shown.s.startsWith('-') ? `{${shown.s}}` : shown.s;
  if (lines[lines.length - 1] === last) lines.pop();
  // The result by D20: Γ under the floor and a return loss over 240 dB as their bounds, a part rounded to its floor
  // as 0; the raw number beside it in either case.
  const x = sp.vars[lhsName];
  let result = last, bound = false, raw = '';
  if (GAMMAS.has(lhsName) && belowFloor(gammaMag(x.re, x.im))) {
    result = `\\left|${sub.lhs}\\right| < 10^{-12}`;
    bound = true;
  } else if (lhsName === 'RL' && x.re > RL_CEILING && x.re !== Infinity) {
    result = `${sub.lhs} > ${RL_CEILING}\\,\\mathrm{dB}`;
    bound = true;
  } else if (x.unit && x.unit !== 'Ω' && x.unit !== 'S' && belowFloor(x.re, x.floor)) {
    result = `${sub.lhs} < 10^{-12}\\,\\mathrm{${x.unit}}`;
    bound = true;
  }
  if (bound || (x.floor > 0 && (fl(x.re, x.floor) !== x.re || fl(x.im, x.floor) !== x.im))) {
    raw = x.im === 0 ? formatAmount(x.re, x.unit, digits, true) : complexText(x.re, x.im, x.unit, digits, 0);
  }
  return { id: sp.id, title: eq.title, lhs: sub.lhs, rhs: sub.rhs, lines, result, bound, raw, binding, targets, target };
}
