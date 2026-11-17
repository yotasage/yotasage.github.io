// The written form of one EM equation before equations.ts parses it (step M4.2: shared by equationsLines.ts, the 33
// trace entries, and equationsVia.ts, the 28 entries of vias, the TDR, S-parameters and the target).

import type { Source, SymbolInfo } from '../equations/equation';

// What a symbol takes its colour from on the page.
export type EmObject =
  | 'line' | 'pair' | 'mode' | 'stackup' | 'solver' | 'drive' | 'formula' | 'calculator' | 'tolerance' | 'constant'
  | 'via' | 'piece' | 'node' | 'stub' | 'feed' | 'port' | 'derivation';

export const sym = (meaning: string, unit: string, object: EmObject): SymbolInfo<EmObject> => ({ meaning, unit, object });
export const src = (key: string, at: string): Source => ({ key, at });
export const QUASI_TEM = 'quasi-TEM: the static C and L of the cross-section';
export const SYM_PAIR = 'symmetric pair (Zc₁₁ = Zc₂₂)';

export interface Def {
  id: string; title: string; topic: string; text: string; where?: string[]; extra?: string;
  applies?: 'line' | 'pair' | 'any'; live?: boolean;
  /** What the entry's numbers come from: the trace's solve (eqvalues.emBinding), the via model (eqvaluesVia.viaBinding)
   *  or the Waves section (eqvaluesWaves.wavesBinding, M7.2d). */
  on?: 'trace' | 'via' | 'waves';
  sources?: Source[]; derivation?: string; assumptions?: string[]; engine: string;
  /** Derivation steps: [equation in the text form, reason with maths between backticks]. */
  steps?: [string, string][];
  /** Meanings that differ from EM_SYMBOLS in this entry. */
  symbols?: Record<string, SymbolInfo<EmObject>>;
}
