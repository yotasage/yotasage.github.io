// The Trace section's tools (step M2.3a), the parts without React: the placeholder tolerances the band uses where no
// tolerance is typed (BL81: the harness's own ±10 %, εr ±0.2, mask ±30 % until JLCPCB's or the owner's figures are
// entered), the outputs a sweep can plot, a sweep's default range, the target's choices and the reading of a target.
// Loaded with the tools (TraceTools.tsx, by import() when a tool is first opened); the harness imports it in Node.

import type { InverseKey, InverseVary } from '../../lib/emsim/inverse';
import type { Setup } from '../../lib/emsim/setup';
import type { Tol, Val } from '../../lib/emsim/stackup';
import { KIND_INFO } from '../../lib/emsim/structure';
import { inputsOf } from '../../lib/emsim/vary';
import type { Input } from '../../lib/emsim/vary';

export const PLACEHOLDER = { rel: 0.1, er: 0.2, mask: 0.3 } as const;

/**
 * A copy of the setup in which every value that the band can vary and that has no tolerance gets the placeholder:
 * widths, gaps, thicknesses ±10 %, εr ±0.2, the mask's thicknesses ±30 %. Typed tolerances stay. `filled` holds the
 * ids (as inputsOf gives them) that got a placeholder.
 */
export function withPlaceholders(setup: Setup): { setup: Setup; filled: Set<string> } {
  const c: Setup = structuredClone(setup);
  const set = (x: Val | null | undefined, t: Tol) => { if (x && !x.tol) x.tol = t; };
  const rel = { rel: PLACEHOLDER.rel }, er = { abs: PLACEHOLDER.er }, mask = { rel: PLACEHOLDER.mask };
  const tr = c.trace;
  if (tr.kind === 'general') for (const g of tr.signals) set(g.w, rel);
  else { set(tr.w, rel); set(tr.s, rel); set(tr.g, rel); }
  for (const l of c.stackup.layers as any[]) {
    if (l.kind === 'dielectric') { set(l.t, rel); set(l.er, er); }
    else if (l.kind === 'copper') set(l.t, rel);
    else if (l.kind === 'mask') { set(l.onCopper, mask); set(l.onLaminate, mask); set(l.between, mask); set(l.er, er); }
  }
  const had = new Set(inputsOf(setup).map((i) => i.id));
  return { setup: c, filled: new Set(inputsOf(c).map((i) => i.id).filter((id) => !had.has(id))) };
}

/** The number of lines of a setup's structure. */
export function linesOf(setup: Setup): number {
  const st = setup.trace;
  return st.kind === 'general' ? st.signals.length : KIND_INFO[st.kind]?.signals ?? 1;
}

export type Quantity = 'ohm' | 'ratio' | 'delay';
export interface Output { id: string; label: string; q: Quantity; keys: string[]; names: string[] }

/** What a sweep can plot for n lines; the first is the main quantity. */
export function outputsOf(n: number): Output[] {
  if (n === 1) {
    return [
      { id: 'z0', label: 'Z0', q: 'ohm', keys: ['z0'], names: ['Z0'] },
      { id: 'eeff', label: 'εeff', q: 'ratio', keys: ['eeff'], names: ['εeff'] },
      { id: 'delay', label: 'Delay', q: 'delay', keys: ['delay'], names: ['Delay'] },
    ];
  }
  const modes = Array.from({ length: n }, (_, i) => i + 1);
  const lines = modes;
  const out: Output[] = n === 2
    ? [
        { id: 'zdiff', label: 'Zdiff', q: 'ohm', keys: ['zdiff'], names: ['Zdiff'] },
        { id: 'zcm', label: 'Zcm', q: 'ohm', keys: ['zcm'], names: ['Zcm'] },
      ]
    : [{ id: 'z0', label: 'Z0 of each line', q: 'ohm', keys: lines.map((i) => `z0.${i}`), names: lines.map((i) => `line ${i}`) }];
  out.push(
    { id: 'eeff', label: 'εeff of the modes', q: 'ratio', keys: modes.map((i) => `mode${i}.eeff`), names: modes.map((i) => `mode ${i}`) },
    { id: 'delay', label: 'Delay of the modes', q: 'delay', keys: modes.map((i) => `mode${i}.delay`), names: modes.map((i) => `mode ${i}`) },
  );
  return out;
}

/** The main key of a band (as vary.ts's corners take it). */
export const mainKeyOf = (n: number): string => (n === 1 ? 'z0' : n === 2 ? 'zdiff' : 'z0.1');

export const SWEEP_POINTS = 51;
export const SWEEP_MAX = 200;

/** A sweep's default range for an input (in its own unit: mm or εr). */
export function defaultRange(inp: Input): [number, number] {
  const v = inp.v;
  if (inp.kind === 'er') return [Math.max(1, round3(v - 0.5)), round3(v + 0.5)];
  const position = /\.(u|a|b)$/.test(inp.id) || inp.id === 'wall';
  if (position || v <= 0) { const w = Math.max(0.2, Math.abs(v) * 0.5); return [round3(v - w), round3(v + w)]; }
  return [round3(v * 0.5), round3(v * 1.5)];
}
const round3 = (x: number) => { const p = 10 ** (Math.floor(Math.log10(Math.abs(x) || 1)) - 2); return Number((Math.round(x / p) * p).toPrecision(12)); };

export interface TargetChoice { key: InverseKey; label: string }
export interface VaryChoice { vary: InverseVary; label: string; use: string }

/** What the target can solve for: the quantities and what is varied (empty with a reason when it cannot). */
export function targetChoices(setup: Setup): { keys: TargetChoice[]; varies: VaryChoice[]; reason: string } {
  const st = setup.trace;
  const info = KIND_INFO[st.kind];
  if (st.kind === 'general' || !info) return { keys: [], varies: [], reason: 'The target is solved for the preset structures; a general arrangement has no single width to solve for.' };
  if (info.signals === 1) return { keys: [{ key: 'z0', label: 'Z0' }], varies: [{ vary: 'w', label: 'width', use: 'Use this width' }], reason: '' };
  const keys: TargetChoice[] = [{ key: 'zdiff', label: 'Zdiff' }, { key: 'zcm', label: 'Zcm' }];
  if (st.kind === 'broadside') return { keys, varies: [{ vary: 'w', label: 'width', use: 'Use this width' }], reason: '' };
  return {
    keys,
    varies: [
      { vary: 'w', label: 'width, gap fixed', use: 'Use this width' },
      { vary: 's', label: 'gap, width fixed', use: 'Use this gap' },
      { vary: 'ws', label: 'width and gap, ratio fixed', use: 'Use this width and gap' },
    ],
    reason: '',
  };
}

export const TARGET_DEFAULT: Record<InverseKey, number> = { z0: 50, zdiff: 100, zcm: 30 };

/** A typed target in Ω ("50", "50 Ω", "50ohm", "100,5"); null when it is not a positive number. */
export function readTarget(text: string): number | null {
  const t = text.trim().replace(/\s*(Ω|ω|ohms?)\s*$/i, '').replace(',', '.');
  if (!/^[0-9]*\.?[0-9]+(e[+-]?[0-9]+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) && v > 0 && v < 1e4 ? v : null;
}

/** Each input's share of the variance by its sensitivity (d²/Σd²); the linear model's view of the ranking. */
export function shares(d: number[]): number[] {
  const s = d.reduce((a, x) => a + x * x, 0);
  return d.map((x) => (s > 0 ? (x * x) / s : 0));
}
