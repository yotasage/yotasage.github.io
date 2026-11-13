// The derivations of the Smith chart (step M5.3, docs/smith-chart/learning.md §4), framework-free: every registry entry
// with steps (lib/smith/equations.ts) is a derivation, shown one step at a time with its reason by Derivation.tsx. The
// steps are registry data, checked numerically by scripts/harness/smith/check-equations.mjs; here they are printed
// with the variables in the chart's colours and their targets on the page (mathRows.ts's sentinels, M5.2), and, where
// every quantity of a step has a value for the chosen subject, with the visitor's numbers put in and the value both
// sides share (the evaluator, as the registry's notes allow for intermediate steps; the values put in are the engine's).
//
// The subject is the equation panel's (a part, a node, the readout's point) when the derivation is opened there, and
// for the theory's "derive" links the place the theory itself uses (theorySubject): the load, the first part of the
// kind, the goal's node. Built once per opening (a few tenths of a millisecond); nothing runs while it stays open.

import { belowFloor, ROUNDING_FLOOR } from '../../lib/quantity';
import { gammaMag, mismatchLoss, returnLoss, vswr, yFromGamma, zFromGamma } from '../../lib/smith/convert';
import { EQUATION_BY_ID, EQUATIONS, evaluate, symbolOf, tex, valueTex, variablesOf } from '../../lib/smith/equations';
import type { Equation, Node, TexPiece } from '../../lib/smith/equations';
import { goalMismatch, goalNode, goalTarget } from '../../lib/smith/goal';
import type { Circuit } from '../../lib/smith/network';
import { LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT, added } from '../../lib/smith/parts';
import { askOf } from '../../lib/smith/state';
import type { Circuit as StateCircuit } from '../../lib/smith/state';
import { BETA, COLOUR_KEYS, ColourKey, Spec, Subject, Var, ellVar, sentinel, specsFor, subjectName, texOf, v } from './mathRows';

/** The registry ids that have a derivation, in the registry's order. */
export const DERIVATION_IDS: readonly string[] = EQUATIONS.filter((e) => e.steps.length > 0).map((e) => e.id);
const HAS = new Set(DERIVATION_IDS);
export const hasDerivation = (id: string): boolean => HAS.has(id);

/** One step as the dialog prints it. */
export interface DerivationStep {
  /** The symbolic step's sides, variables in their sentinel colours (the dialog puts "= " before every side but the first). */
  tex: string[];
  /** The reason: plain text at even indices, the TeX of its maths (coloured as the step) at odd ones. */
  why: string[];
  /** The step's sides with the numbers put in, empty when a quantity of it has no value here. */
  nums: string[];
  /** The value every side shares ("= …", or a bound of plan.md D20), '' when `nums` is empty. */
  value: string;
  /** Each side's value (re, im), for the harness; empty without numbers. */
  sides: [number, number][];
}

export interface Derivation {
  id: string;
  title: string;
  /** The equation derived, symbolic and coloured, side by side (as a step's `tex`). */
  tex: string[];
  assumptions: readonly string[];
  /** The item of the owner's notes it finishes, if any. */
  owner?: string;
  steps: DerivationStep[];
  /** The sentinels' targets by variable index (mathRows.ts, M5.2). */
  targets: string[];
  /** Whose numbers they are ("the load", "part 2", "the readout's point"), '' when there are none. */
  source: string;
  /** Every variable with a value (raw), for the harness. */
  binding: Record<string, [number, number]>;
}

const SERIES_KINDS = new Set([SERIES_R, SERIES_L, SERIES_C]);
const SHUNT_KINDS = new Set([SHUNT_R, SHUNT_L, SHUNT_C, STUB_OPEN, STUB_SHORT]);

/** Where the theory's "derive" takes its numbers from: the place the theory's own equations use; null for none. */
export function theorySubject(c: Circuit, id: string): Subject | null {
  const n = c.parts.length;
  const first = (test: (k: number, i: number) => boolean): Subject | null => {
    for (let i = 0; i < n; i++) if (test(c.parts[i].kind, i)) return { t: 'part', i };
    return null;
  };
  switch (id) {
    case 'series-adds-z': return first((k) => SERIES_KINDS.has(k));
    case 'shunt-adds-y': return first((k) => SHUNT_KINDS.has(k));
    case 'line-zin': return first((k) => k === LINE);
    case 'line-rotation': return first((k, i) => k === LINE && (c.parts[i].zc ?? c.z0) === c.z0);
    case 'quarter-wave': return first((k) => k === QUARTER);
    case 'mismatch-to-target': {
      const goal = askOf(c as StateCircuit).goal;
      return goal.kind === 'point' ? { t: 'node', k: goalNode(goal, n) } : null;
    }
    case 'abcd-zin': case 'mobius': case 'q-l-network': return null;
    default: return { t: 'node', k: 0 };
  }
}

const scratch = new Float64Array(2);

/** One spec with every value the subject gives: its rows merged (the first value of a name wins) and what follows from them. */
function mergedSpec(c: Circuit, id: string, s: Subject, gr: number, gi: number): Spec {
  const vars: Record<string, Var> = {}, colours: Record<string, ColourKey | undefined> = {}, targets: Record<string, string> = {};
  for (const sp of specsFor(c, s, gr, gi)) {
    for (const name in sp.vars) {
      if (name in vars) continue;
      vars[name] = sp.vars[name];
      colours[name] = sp.colours[name];
      if (sp.targets?.[name]) targets[name] = sp.targets[name];
    }
  }
  const z0 = c.z0;
  const put = (name: string, x: Var, like: string, target = targets[like]): void => {
    if (name in vars) return;
    vars[name] = x; colours[name] = colours[like];
    if (target) targets[name] = target;
  };
  const G = vars.Gamma;
  if (G && Number.isFinite(G.re) && Number.isFinite(G.im) && !G.tex) {
    put('Gamma_r', v(G.re, 0, '', z0), 'Gamma');
    put('Gamma_i', v(G.im, 0, '', z0), 'Gamma');
    if (!vars.z) { zFromGamma(scratch, 0, G.re, G.im); put('z', v(scratch[0], scratch[1], '', z0), 'Gamma'); }
    if (!vars.y) { yFromGamma(scratch, 0, G.re, G.im); put('y', v(scratch[0], scratch[1], '', z0), 'Gamma'); }
    const m = gammaMag(G.re, G.im);
    put('VSWR', v(vswr(m), 0, '', z0), 'Gamma', s.t === 'point' ? 'rvswr' : targets.Gamma);
    put('RL', v(returnLoss(m), 0, 'dB', z0), 'Gamma', s.t === 'point' ? 'rrl' : targets.Gamma);
    put('ML', v(mismatchLoss(m), 0, 'dB', z0), 'Gamma', s.t === 'point' ? '' : targets.Gamma);
  }
  const z = vars.z, y = vars.y;
  if (z) { put('r', v(z.re, 0, '', z0), 'z'); put('x', v(z.im, 0, '', z0), 'z'); }
  if (y) { put('g', v(y.re, 0, '', z0), 'y'); put('b', v(y.im, 0, '', z0), 'y'); }
  const n = c.parts.length;
  if (s.t === 'part' && s.i >= 0 && s.i < n) {
    const p = c.parts[s.i], P = `p${s.i}`;
    if (id === 'quarter-wave' && p.kind === QUARTER) {
      put('beta', BETA, 'Z_t', '');
      put('ell', ellVar(0.25), 'Z_t', P);
    }
    // A line of Z0: Γ_c is the chart's Γ at the node it starts at, Γ_in the one it ends at (the part's Γ).
    if (id === 'line-rotation' && p.kind === LINE && vars.Gamma_c && G) {
      put('Gamma_L', vars.Gamma_c, 'Gamma_c', targets.Gamma_c);
      put('Gamma_in', G, 'Gamma', targets.Gamma);
    }
  }
  if (s.t === 'node' && s.k === 0 && z && Number.isFinite(z.re) && Number.isFinite(z.im)) {
    if (id === 'quarter-wave-match' && Number.isFinite(c.loadR) && c.loadR > 0) {
      put('R_L', v(c.loadR, 0, 'Ω', z0), 'z');
      put('Z_t', v(Math.sqrt(z0 * c.loadR), 0, 'Ω', z0), 'Z_0', '');
    }
    // The two-part match of the load (series next to it), when r_L ≤ 1: the root of x_1 on the circuit's own route when
    // its first part is a series L or C (the sign of x after it), else with the sign of x_L (the smaller series part).
    if (id === 'match-two-parts' && z.re > 0 && z.re <= 1) {
      const rL = z.re, xL = z.im, p0 = c.parts[0];
      const after = p0 && (p0.kind === SERIES_L || p0.kind === SERIES_C) ? xL + added(p0.kind, p0.value, 0, c.f0, c.f0, z0) : xL;
      const x1 = (after < 0 ? -1 : 1) * Math.sqrt(rL * (1 - rL)), bp = x1 / rL, d = rL * rL + x1 * x1;
      put('r_L', v(rL, 0, '', z0), 'z'); put('x_L', v(xL, 0, '', z0), 'z'); put('z_L', z, 'z');
      put('x_1', v(x1, 0, '', z0), 'Z_0', ''); put('x_s', v(x1 - xL, 0, '', z0), 'Z_0', '');
      put('z_1', v(rL, x1, '', z0), 'Z_0', ''); put('y_1', v(rL / d, -x1 / d, '', z0), 'Z_0', '');
      put('b_p', v(bp, 0, '', z0), 'Z_0', ''); put('y_in', v(rL / d, -x1 / d + bp, '', z0), 'Z_0', '');
    }
  }
  if (id === 'mismatch-to-target' && s.t === 'node' && G) {
    const goal = askOf(c as StateCircuit).goal;
    if (goal.kind === 'point') {
      goalTarget(scratch, 0, goal, z0);
      const tr = scratch[0], ti = scratch[1];
      put('Gamma_t', v(tr, ti, '', z0), 'Gamma', 'goal');
      zFromGamma(scratch, 0, tr, ti);
      put('z_t', v(scratch[0], scratch[1], '', z0), 'Gamma', 'goal');
      put('m', v(goalMismatch(goal, G.re, G.im, z0), 0, '', z0), 'Gamma');
    }
  }
  return { id, vars, colours, targets };
}

const fin = (x: Var): boolean => Number.isFinite(x.re) && Number.isFinite(x.im);
const signed = (s: string): string => (s.startsWith('-') ? `{${s}}` : s);
/** The sides of an equality (a tree that is not one is its own single side). */
const sidesOf = (n: Node): readonly Node[] => (n.t === 'eq' ? n.xs : [n]);

/** The derivation of a registry entry, with the subject's numbers (none for a null subject); gr, gi the readout's point. */
export function derivation(c: Circuit, id: string, subject: Subject | null, digits: number, gr = NaN, gi = NaN): Derivation {
  const eq: Equation | undefined = EQUATION_BY_ID.get(id);
  if (!eq || !eq.steps.length) throw new Error(`No derivation "${id}" in the Smith chart's registry.`);
  const sp = subject && !(subject.t === 'point' && gr !== gr) ? mergedSpec(c, id, subject, gr, gi) : null;
  const names = sp ? Object.keys(sp.vars) : [];
  const tg = sp?.targets ?? {};
  const targets = names.map((name) => tg[name] ?? '');
  const colour = (name: string, t: string): string => {
    if (!sp) return t;
    const k = sp.colours[name], j = names.indexOf(name);
    if (j < 0 || (!k && !targets[j])) return t;
    return `\\textcolor{${sentinel(k ? COLOUR_KEYS.indexOf(k) + 1 : 0, j)}}{${t}}`;
  };
  const deco = { variable: colour };
  const values: Record<string, TexPiece | undefined> = {};
  const binding: Record<string, [number, number]> = {};
  if (sp) {
    for (const name of names) {
      const x = sp.vars[name];
      if (!fin(x)) continue;
      values[name] = texOf(x, digits);
      binding[name] = [x.re, x.im];
    }
  }
  const z0 = c.z0;
  const steps = eq.steps.map((st): DerivationStep => {
    const out: DerivationStep = {
      tex: sidesOf(st.tree).map((x) => tex(x, deco)),
      why: st.reason.map((r) => (typeof r === 'string' ? r : tex(r, deco))),
      nums: [], value: '', sides: [],
    };
    const used = variablesOf(st.tree);
    if (!sp || !used.length || !used.every((name) => name in binding)) return out;
    let res: Float64Array[];
    try { res = evaluate(st.tree, binding); } catch { return out; }
    const sides = res.map((a): [number, number] => [a[0], a[1]]);
    if (!sides.every(([re, im]) => Number.isFinite(re) && Number.isFinite(im))) return out;
    out.sides = sides;
    const xs = sidesOf(st.tree);
    const value = { value: (name: string) => values[name] };
    const printed = xs.map((x) => signed(tex(x, value)));
    out.nums = printed;
    // The shared value in the unit of a first side that is one symbol (Z_in in Ω); D20 below the floor.
    const first = xs[0];
    const unit = first.t === 'id' ? symbolOf(eq, first.v)?.unit ?? '' : '';
    const [re, im] = sides[0];
    const floor = unit === 'Ω' ? ROUNDING_FLOOR * z0 : unit === 'S' ? ROUNDING_FLOOR / z0 : ROUNDING_FLOOR;
    if (belowFloor(gammaMag(re, im), floor)) out.value = '\\left|\\,\\cdot\\,\\right| < 10^{-12}';
    else {
      const t = texOf(v(re, im, unit, z0), digits);
      if (t && !printed.includes(signed(t.s))) out.value = `{}= ${signed(t.s)}`;
    }
    return out;
  });
  return {
    id, title: eq.title, tex: sidesOf(eq.tree).map((x) => tex(x, deco)), assumptions: eq.assumptions, owner: eq.owner, steps, targets,
    source: sp && steps.some((s) => s.nums.length) ? subjectName(c, subject!) : '', binding,
  };
}

