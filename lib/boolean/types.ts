export type BoolOp = 'AND' | 'OR' | 'XOR' | 'XNOR' | 'NAND' | 'NOR';

export type BoolNode =
  | { readonly kind: 'const'; readonly value: 0 | 1 }
  | { readonly kind: 'var'; readonly name: string }
  | { readonly kind: 'not'; readonly operand: BoolNode }
  | { readonly kind: 'gate'; readonly op: BoolOp; readonly args: readonly BoolNode[] };

export type NotationStyle = 'engineering' | 'logic' | 'programming' | 'verilog';

export type SimplifyMethod = 'algebraic' | 'qm' | 'heuristic';

export type SimplifyEffort = 'low' | 'medium' | 'high';

export type TargetForm = 'auto' | 'sop' | 'pos' | 'nand' | 'nor';

export type StepLayoutMode = 'auto' | 'split' | 'interleaved' | 'same-side';

export type CircuitSymbolStyle = 'ieee' | 'iec';

export type GateInputMode = 'multi' | '2-input' | '2-input-nand' | '2-input-nor';

export type WorkspaceLayoutMode = 'tabs' | 'workbench' | 'all';

export type AnalysisTabId = 'solver' | 'truth-table' | 'circuit' | 'timing' | 'kmap';

export type GateType = 'NOT' | BoolOp;

export interface ParsedBoolean {
  readonly outputName: string;
  readonly ast: BoolNode;
  readonly variables: readonly string[];
}

export interface BooleanStep {
  readonly id: string;
  readonly ast: BoolNode;
  readonly workLatex: string;
  readonly workText: string;
  readonly workLabel?: string;
  readonly ruleId?: string;
  readonly ruleTitle: string;
  readonly ruleFormulaLatex?: string;
  readonly annotation?: string;
  readonly theory?: string;
  readonly kind?: 'input' | 'step' | 'result';
  readonly minor?: boolean;
  readonly gateCount: number;
  readonly literalCount: number;
  readonly depth: number;
}

export interface SimplifyOptions {
  readonly method: SimplifyMethod;
  readonly effort: SimplifyEffort;
  readonly targetForm: TargetForm;
  readonly notation: NotationStyle;
  readonly explicitAnd?: boolean;
}

export interface ComplexityMetrics {
  readonly gates: number;
  readonly literals: number;
  readonly depth: number;
  readonly twoInputGateEquiv: number;
}

export interface CanonicalForms {
  readonly minterms: readonly number[];
  readonly maxterms: readonly number[];
  readonly canonicalSopLatex: string;
  readonly canonicalPosLatex: string;
  readonly canonicalSopText: string;
  readonly canonicalPosText: string;
  readonly truncated: boolean;
}

export interface SimplifySuccess {
  readonly ok: true;
  readonly outputName: string;
  readonly variables: readonly string[];
  readonly originalAst: BoolNode;
  readonly simplifiedAst: BoolNode;
  readonly originalLatex: string;
  readonly simplifiedLatex: string;
  readonly originalText: string;
  readonly simplifiedText: string;
  readonly steps: readonly BooleanStep[];
  readonly originalMetrics: ComplexityMetrics;
  readonly simplifiedMetrics: ComplexityMetrics;
  readonly equivalent: boolean;
  readonly rowsChecked: number;
  readonly candidatesEvaluated: number;
  readonly canonical: CanonicalForms;
  readonly qmSopAst?: BoolNode;
  readonly qmPosAst?: BoolNode;
  readonly kmap: KMapData | null;
}

export interface SimplifyFailure {
  readonly ok: false;
  readonly error: string;
  readonly hint?: string;
}

export type SimplifyResult = SimplifySuccess | SimplifyFailure;

export interface BooleanLaw {
  readonly id: string;
  readonly category: 'basic' | 'distributive' | 'demorgan' | 'advanced';
  readonly name: string;
  readonly formulaLatex: string;
  readonly dualFormulaLatex?: string;
  readonly summary: string;
  readonly theory: string;
  readonly exampleExpr: string;
  readonly keywords: readonly string[];
}

export interface BooleanExample {
  readonly id: string;
  readonly label: string;
  readonly tag: string;
  readonly expr: string;
}

export interface CuratedExamplePreset {
  readonly id: string;
  readonly title: string;
  readonly category: 'methods' | 'effort' | 'universal' | 'circuits' | 'timing';
  readonly equations: readonly string[];
  readonly summary: string;
  readonly whatToNotice: string;
  readonly comparisonNotes?: readonly {
    readonly label: string;
    readonly outcome: string;
    readonly method?: SimplifyMethod;
    readonly effort?: SimplifyEffort;
    readonly targetForm?: TargetForm;
    readonly gateInputMode?: GateInputMode;
  }[];
  readonly defaultMethod?: SimplifyMethod;
  readonly defaultEffort?: SimplifyEffort;
  readonly defaultTargetForm?: TargetForm;
  readonly defaultGateInputMode?: GateInputMode;
  readonly openTab?: AnalysisTabId;
}

export interface InternalSignalDef {
  readonly id: string; // e.g. 'n1'
  readonly gateId: string; // e.g. 'U1'
  readonly gateType: GateType;
  readonly label: string; // human-readable expression
  readonly ast: BoolNode;
}

export interface TruthTableRow {
  readonly index: number;
  readonly inputs: Readonly<Record<string, 0 | 1>>;
  readonly internals: Readonly<Record<string, 0 | 1>>;
  readonly output: 0 | 1;
  readonly outputs: Readonly<Record<string, 0 | 1>>;
}

export interface TruthTableData {
  readonly outputName: string;
  readonly outputNames: readonly string[];
  readonly variables: readonly string[];
  readonly internals: readonly InternalSignalDef[];
  readonly rows: readonly TruthTableRow[];
  readonly truncated: boolean;
  readonly totalRows: number;
}

export interface WirePoint {
  readonly x: number;
  readonly y: number;
}

export interface CircuitNode {
  readonly id: string; // 'IN_A', 'CONST_1', 'U1', ..., 'OUT_Y'
  readonly kind: 'input' | 'const' | 'gate' | 'output';
  readonly label: string;
  readonly gateType?: GateType;
  readonly netName: string; // 'A', 'n1', 'Y'
  readonly exprText: string;
  readonly inputs: readonly string[]; // source node IDs
  readonly level: number;
  readonly x: number;
  readonly y: number;
}

export interface CircuitEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly toPinIndex: number;
  readonly toPinCount: number;
  readonly netName: string;
  readonly points: readonly WirePoint[];
  readonly branchPoint?: WirePoint;
}

export interface CircuitGraph {
  readonly outputName: string;
  readonly outputNames: readonly string[];
  readonly variables: readonly string[];
  readonly nodes: readonly CircuitNode[];
  readonly edges: readonly CircuitEdge[];
  readonly internals: readonly InternalSignalDef[];
  readonly width: number;
  readonly height: number;
  readonly maxLevel: number;
}

export type GateDelayMap = Readonly<Record<GateType, number>>;

export type InstanceDelayMap = Readonly<Record<string, number>>;

export interface WaveformSegment {
  readonly startNs: number;
  readonly endNs: number;
  readonly value: 0 | 1 | 'x';
  readonly isGlitch?: boolean;
}

export interface SignalTrace {
  readonly id: string;
  readonly label: string;
  readonly role: 'clock' | 'input' | 'reg-input' | 'internal' | 'output' | 'reg-output';
  readonly exprText?: string;
  readonly segments: readonly WaveformSegment[];
  readonly glitchCount: number;
}

export interface DffConfig {
  readonly enabled: boolean;
  readonly clockPeriodNs: number;
  readonly tClkToQNs: number;
  readonly tSetupNs: number;
}

export interface TimingSimulationResult {
  readonly totalDurationNs: number;
  readonly stepDurationNs: number;
  readonly sampleGridNs: number;
  readonly vectorCount: number;
  readonly criticalPathNs: number;
  readonly criticalPathNodes: readonly string[];
  readonly traces: readonly SignalTrace[];
  readonly totalGlitches: number;
  readonly dffAnalysis: {
    readonly enabled: boolean;
    readonly clockPeriodNs: number;
    readonly minClockPeriodNs: number;
    readonly slackNs: number;
    readonly fMaxMHz: number;
    readonly setupViolation: boolean;
  };
  readonly waveDromJson: WaveDromDocument;
}

export interface WaveDromSignal {
  readonly name: string;
  readonly wave: string;
  readonly data?: readonly string[];
}

export interface WaveDromDocument {
  readonly signal: readonly (WaveDromSignal | readonly (string | WaveDromSignal)[])[];
  readonly head?: { readonly text?: string; readonly tick?: number };
  readonly foot?: { readonly text?: string };
  readonly config?: { readonly hscale?: number };
}

export interface KMapGroup {
  readonly id: string;
  readonly termLatex: string;
  readonly termText: string;
  readonly cells: readonly number[]; // minterm indices
  readonly colorIndex: number;
}

export interface KMapData {
  readonly variables: readonly string[];
  readonly rowVars: readonly string[];
  readonly colVars: readonly string[];
  readonly rowGray: readonly number[];
  readonly colGray: readonly number[];
  readonly rowLabels: readonly string[];
  readonly colLabels: readonly string[];
  readonly values: readonly (0 | 1)[]; // indexed by minterm
  readonly groups: readonly KMapGroup[];
}
