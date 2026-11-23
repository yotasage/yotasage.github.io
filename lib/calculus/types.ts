// Shared types for the Integral and Derivative Solvers.
// Framework-free; zero external dependencies.

export type StepLayoutMode = 'auto' | 'split' | 'interleaved' | 'same-side';

export type StepKind =
  | 'setup'
  | 'rewrite'
  | 'rule'
  | 'substep'
  | 'substitution'
  | 'simplify'
  | 'evaluate'
  | 'result';

export interface SolutionStep {
  readonly id: string;
  readonly kind: StepKind;
  /** Primary mathematical expression / transformation (shown on the left). */
  readonly workLatex: string;
  /** Optional short label above or beside the work math (e.g. "Step 1", "Order 2"). */
  readonly workLabel?: string;
  /** Concise name of the identity, rule, or simplification applied (shown on the right). */
  readonly ruleTitle: string;
  /** Optional ID referencing an entry in `MATH_IDENTITIES` for cross-linking. */
  readonly ruleId?: string;
  /** General formula for the rule or identity in LaTeX. */
  readonly ruleFormulaLatex?: string;
  /** Short specific note on how the rule applies to this expression. */
  readonly annotation?: string;
  /** Deeper conceptual explanation shown in Teaching mode. */
  readonly theory?: string;
  /** Marks minor simplification steps that Quick mode may condense. */
  readonly minor?: boolean;
}

export interface VerificationInfo {
  readonly status: 'verified' | 'numeric-only' | 'unverified';
  readonly maxError?: number;
  readonly samplesChecked?: number;
  readonly note?: string;
}

export interface DerivativePointEval {
  readonly pointRaw: string;
  readonly pointLatex: string;
  readonly pointValue: number;
  readonly fValue: number | null;
  readonly derivativeValue: number | null;
  readonly tangentLatex?: string;
}

export interface DerivativeSolveResult {
  readonly ok: true;
  readonly variable: string;
  readonly order: number;
  readonly inputLatex: string;
  readonly promptLatex: string;
  readonly resultLatex: string;
  readonly resultText: string;
  readonly steps: readonly SolutionStep[];
  readonly verification: VerificationInfo;
  readonly evaluation?: DerivativePointEval;
  readonly orderResults: readonly { order: number; latex: string; text: string }[];
}

export interface IntegralSolveResult {
  readonly ok: true;
  readonly variable: string;
  readonly isDefinite: boolean;
  readonly inputLatex: string;
  readonly promptLatex: string;
  readonly antiderivativeLatex?: string;
  readonly antiderivativeText?: string;
  readonly resultLatex: string;
  readonly resultText: string;
  readonly numericValue?: number;
  readonly numericError?: number;
  readonly lowerLatex?: string;
  readonly upperLatex?: string;
  readonly steps: readonly SolutionStep[];
  readonly verification: VerificationInfo;
}

export interface SolveErrorResult {
  readonly ok: false;
  readonly error: string;
  readonly hint?: string;
  readonly inputLatex?: string;
}

export type DerivativeOutput = DerivativeSolveResult | SolveErrorResult;
export type IntegralOutput = IntegralSolveResult | SolveErrorResult;

export type IdentityCategory =
  | 'derivatives'
  | 'integrals'
  | 'trig'
  | 'hyperbolic'
  | 'algebra';

export interface MathIdentity {
  readonly id: string;
  readonly category: IdentityCategory;
  readonly name: string;
  readonly formulaLatex: string;
  readonly condition?: string;
  readonly summary: string;
  readonly theory: string;
  readonly exampleExpr: string;
  readonly exampleSolver: 'derivative' | 'integral';
  readonly keywords: readonly string[];
}

export interface SolverExample {
  readonly id: string;
  readonly label: string;
  readonly expr: string;
  readonly variable?: string;
  readonly order?: number;
  readonly lower?: string;
  readonly upper?: string;
  readonly tag: string;
}
