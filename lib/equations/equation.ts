// What a registry entry of the shared equation engine is (the Smith chart's lib/smith/equations.ts and the EM
// simulation's lib/emsim/equations.ts each have their own registry and symbol table of these).

import { parse } from './parse';
import type { Node } from './parse';

/**
 * What a variable means: its meaning, its unit (lib/quantity.ts units, '' for none) and the object of the tool's
 * picture whose colour it takes (`K`: the tool's own kinds, e.g. the Smith chart's ChartObject).
 */
export interface SymbolInfo<K extends string = string> { meaning: string; unit: string; object: K }

export interface Source { key: string; at: string }

/**
 * One derivation step: an equation in the same text form and one sentence saying why it follows. Maths in the sentence
 * is written in the same text form between backticks (`z + 1`), never as plain text or TeX; `reason` holds it parsed:
 * the plain text at even indices, the trees at odd ones (printed with `tex`, as everything else).
 */
export interface Step { text: string; tree: Node; why: string; reason: readonly (string | Node)[] }

/** A reason split at its backticks, the maths parsed (throws, naming the reason, on an error or an odd backtick). */
export function parseReason(why: string): (string | Node)[] {
  const parts = why.split('`');
  if (parts.length % 2 === 0) throw new Error(`unpaired backtick in "${why}"`);
  return parts.map((s, k) => {
    if (k % 2 === 0) return s;
    try { return parse(s); } catch (e) { throw new Error(`${(e as Error).message} (in the reason "${why}")`); }
  });
}

export interface Equation<K extends string = string> {
  id: string;
  title: string;
  text: string;
  tree: Node;
  sources: readonly Source[];
  /** How the equation follows when no source prints it (facts.md "derived"). */
  derivation?: string;
  /** The item of the owner's notes (notes-M0.1.md, checked in facts.md §3) the equation corrects or completes. */
  owner?: string;
  assumptions: readonly string[];
  steps: readonly Step[];
  /** The engine function(s) the harness checks it against. */
  engine: string;
  /** Free variables of the equation and its steps, in order of first use. */
  variables: readonly string[];
  /** Meanings that differ from SYMBOLS in this entry (the ABCD entries' A, B, C, D). */
  symbols?: Readonly<Record<string, SymbolInfo<K>>>;
}
