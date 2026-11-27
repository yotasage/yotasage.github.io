import {
  evaluateBool,
  makeConst,
  makeGate,
  makeNot,
  makeVar,
  measureComplexity,
  parseBoolean,
  toLatex,
  toPlainText,
  varToLatex,
} from './parse';
import { minimizeQM } from './qm';
import { truthTableOutputToEquation, validateSignalName } from './truthTable';
import type { BoolNode, ComplexityMetrics, NotationStyle } from './types';

export type TruthCellValue = 0 | 1 | 'X';

export interface CompareExpressionSource {
  readonly kind: 'expression';
  readonly expr: string;
  readonly label?: string;
}

export interface CompareTruthTableSource {
  readonly kind: 'truth-table';
  readonly variables: readonly string[];
  readonly values: readonly TruthCellValue[];
  readonly outputName?: string;
  readonly label?: string;
}

export type CompareSource = CompareExpressionSource | CompareTruthTableSource;

export type CompareRelation =
  | 'equivalent'
  | 'complement'
  | 'a-implies-b'
  | 'b-implies-a'
  | 'different';

export type CompareRowStatus = 'match' | 'dont-care' | 'missing' | 'extra';

export interface CompareRow {
  readonly index: number;
  readonly inputs: Readonly<Record<string, 0 | 1>>;
  readonly valA: TruthCellValue;
  readonly valB: TruthCellValue;
  readonly status: CompareRowStatus;
}

export interface FormulaSummary {
  readonly latex: string;
  readonly text: string;
  readonly minterms: readonly number[];
}

export interface DiffKMapData {
  readonly variables: readonly string[];
  readonly rowVars: readonly string[];
  readonly colVars: readonly string[];
  readonly rowGray: readonly number[];
  readonly colGray: readonly number[];
  readonly rowLabels: readonly string[];
  readonly colLabels: readonly string[];
  readonly cells: readonly CompareRow[]; // indexed by minterm
}

export interface SourceSummary {
  readonly kind: 'expression' | 'truth-table';
  readonly label: string;
  readonly outputName: string;
  readonly variables: readonly string[];
  readonly latex: string;
  readonly text: string;
  readonly metrics?: ComplexityMetrics;
  readonly trueCount: number;
  readonly falseCount: number;
  readonly dontCareCount: number;
}

export interface CompareSuccess {
  readonly ok: true;
  readonly equivalent: boolean;
  readonly relation: CompareRelation;
  readonly variables: readonly string[];
  readonly onlyInA: readonly string[];
  readonly onlyInB: readonly string[];
  readonly dependMismatch: boolean;
  readonly sourceA: SourceSummary;
  readonly sourceB: SourceSummary;
  readonly rows: readonly CompareRow[];
  readonly totalRows: number;
  readonly checkedRows: number;
  readonly dontCareRows: number;
  readonly matchCount: number;
  readonly mismatchCount: number;
  readonly missingCount: number; // A=1, B=0
  readonly extraCount: number; // A=0, B=1
  readonly agreementPercent: number;
  readonly firstCounterexample: CompareRow | null;
  readonly diffFormula: FormulaSummary | null;
  readonly missingFormula: FormulaSummary | null;
  readonly extraFormula: FormulaSummary | null;
  readonly minimalReference: {
    readonly latex: string;
    readonly text: string;
    readonly metrics: ComplexityMetrics;
  } | null;
  readonly diffKMap: DiffKMapData | null;
}

export interface CompareFailure {
  readonly ok: false;
  readonly side: 'A' | 'B' | 'both';
  readonly error: string;
}

export type CompareResult = CompareSuccess | CompareFailure;

export interface CompareOptions {
  readonly notation?: NotationStyle;
  readonly explicitAnd?: boolean;
}

export type DerivationStepStatus =
  | 'valid'
  | 'first-error'
  | 'step-error'
  | 'cascaded'
  | 'recovered'
  | 'syntax-error'
  | 'empty';

export interface DerivationStepCheck {
  readonly index: number;
  readonly raw: string;
  readonly status: DerivationStepStatus;
  readonly latex?: string;
  readonly text?: string;
  readonly metrics?: ComplexityMetrics;
  readonly error?: string;
  readonly vsOriginal?: CompareSuccess;
  readonly vsPrev?: CompareSuccess;
  readonly prevStepIndex: number | null; // null means compared against initial source
}

export interface DerivationChainResult {
  readonly ok: boolean;
  readonly initialError?: string;
  readonly initialSummary?: SourceSummary;
  readonly steps: readonly DerivationStepCheck[];
  readonly allValid: boolean;
  readonly firstErrorIndex: number | null;
  readonly checkedStepCount: number;
  readonly validStepCount: number;
  readonly errorStepCount: number;
}

export interface ComparePreset {
  readonly id: string;
  readonly mode: 'pair' | 'chain';
  readonly titleKey: string;
  readonly descKey: string;
  readonly tagKey: string;
  readonly sourceA: CompareSource;
  readonly sourceB?: CompareSource;
  readonly chainSteps?: readonly string[];
}

const MAX_COMPARE_VARS = 8;

interface ResolvedSource {
  readonly kind: 'expression' | 'truth-table';
  readonly label: string;
  readonly outputName: string;
  readonly variables: readonly string[];
  readonly ast?: BoolNode;
  readonly ttValues?: readonly TruthCellValue[];
  readonly latex: string;
  readonly text: string;
  readonly metrics?: ComplexityMetrics;
}

function resolveSource(
  source: CompareSource,
  defaultLabel: string,
  notation: NotationStyle,
  explicitAnd: boolean,
): { readonly ok: true; readonly data: ResolvedSource } | { readonly ok: false; readonly error: string } {
  if (source.kind === 'expression') {
    const trimmed = source.expr.trim();
    if (!trimmed) {
      return { ok: false, error: 'Enter a Boolean expression to compare.' };
    }
    try {
      const parsed = parseBoolean(trimmed);
      const latex = toLatex(parsed.ast, notation, explicitAnd);
      const text = toPlainText(parsed.ast, notation, explicitAnd);
      const metrics = measureComplexity(parsed.ast);
      return {
        ok: true,
        data: {
          kind: 'expression',
          label: source.label ?? defaultLabel,
          outputName: parsed.outputName,
          variables: parsed.variables,
          ast: parsed.ast,
          latex,
          text,
          metrics,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Invalid Boolean expression.',
      };
    }
  }

  // Truth-table source
  const vars = source.variables.map((v) => v.trim());
  if (vars.length === 0) {
    return { ok: false, error: 'Truth table must have at least 1 input variable.' };
  }
  if (vars.length > MAX_COMPARE_VARS) {
    return { ok: false, error: `Truth table supports at most ${MAX_COMPARE_VARS} input variables.` };
  }
  const seen = new Set<string>();
  for (const v of vars) {
    const err = validateSignalName(v);
    if (err) return { ok: false, error: err };
    if (seen.has(v)) return { ok: false, error: `Duplicate variable "${v}" in truth table.` };
    seen.add(v);
  }
  const expectedRows = 1 << vars.length;
  const normalized: TruthCellValue[] = new Array<TruthCellValue>(expectedRows);
  for (let i = 0; i < expectedRows; i++) {
    const cell = source.values[i];
    normalized[i] = cell === 1 || cell === 'X' ? cell : 0;
  }

  const outputName = source.outputName?.trim() || 'Y';
  const minterms: number[] = [];
  const dontCares: number[] = [];
  for (let i = 0; i < expectedRows; i++) {
    if (normalized[i] === 1) minterms.push(i);
    else if (normalized[i] === 'X') dontCares.push(i);
  }

  let latex: string;
  let text: string;
  if (dontCares.length === 0 && minterms.length <= 8) {
    const eq = truthTableOutputToEquation(
      outputName,
      vars,
      normalized.map((v) => (v === 1 ? 1 : 0)),
    );
    try {
      const parsed = parseBoolean(eq);
      latex = toLatex(parsed.ast, notation, explicitAnd);
      text = toPlainText(parsed.ast, notation, explicitAnd);
    } catch {
      latex = `\\sum m(${minterms.join(', ')})`;
      text = `Σm(${minterms.join(', ')})`;
    }
  } else {
    const mPart =
      minterms.length === 0
        ? '0'
        : minterms.length <= 12
          ? `\\sum m(${minterms.join(', ')})`
          : `\\sum m(${minterms.slice(0, 8).join(', ')}, \\dots)`;
    const dPart =
      dontCares.length === 0
        ? ''
        : dontCares.length <= 8
          ? ` + \\sum d(${dontCares.join(', ')})`
          : ` + \\sum d(${dontCares.slice(0, 6).join(', ')}, \\dots)`;
    latex = `${mPart}${dPart}`;
    text =
      dontCares.length === 0
        ? `Σm(${minterms.join(', ')})`
        : `Σm(${minterms.join(', ')}) + Σd(${dontCares.join(', ')})`;
  }

  return {
    ok: true,
    data: {
      kind: 'truth-table',
      label: source.label ?? defaultLabel,
      outputName,
      variables: vars,
      ttValues: normalized,
      latex,
      text,
    },
  };
}

function evaluateResolved(
  src: ResolvedSource,
  env: Readonly<Record<string, 0 | 1>>,
): TruthCellValue {
  if (src.kind === 'expression' && src.ast) {
    return evaluateBool(src.ast, env);
  }
  const vars = src.variables;
  let idx = 0;
  for (let i = 0; i < vars.length; i++) {
    idx = (idx << 1) | (env[vars[i]] ?? 0);
  }
  return src.ttValues?.[idx] ?? 0;
}

function buildFormulaForMinterms(
  minterms: readonly number[],
  variables: readonly string[],
  notation: NotationStyle,
  explicitAnd: boolean,
): FormulaSummary | null {
  if (minterms.length === 0) return null;
  const total = 1 << variables.length;
  if (variables.length === 0) {
    return { latex: '1', text: '1', minterms };
  }
  if (minterms.length === total) {
    return { latex: '1', text: '1', minterms };
  }
  const vec: (0 | 1)[] = new Array<0 | 1>(total).fill(0);
  for (const m of minterms) vec[m] = 1;

  if (variables.length <= 6) {
    const qm = minimizeQM(vec, variables, 'sop', 'medium');
    return {
      latex: toLatex(qm.ast, notation, explicitAnd),
      text: toPlainText(qm.ast, notation, explicitAnd),
      minterms,
    };
  }

  // Fallback for 7–8 variables: build direct SOP for up to 8 minterms, or Σm notation
  if (minterms.length <= 8) {
    const terms: BoolNode[] = minterms.map((m) => {
      const lits: BoolNode[] = variables.map((v, i) => {
        const bit = (m >> (variables.length - 1 - i)) & 1;
        return bit === 1 ? makeVar(v) : makeNot(makeVar(v));
      });
      return lits.length === 1 ? lits[0] : makeGate('AND', lits);
    });
    const ast = terms.length === 1 ? terms[0] : makeGate('OR', terms);
    return {
      latex: toLatex(ast, notation, explicitAnd),
      text: toPlainText(ast, notation, explicitAnd),
      minterms,
    };
  }

  const head = minterms.slice(0, 8).join(', ');
  return {
    latex: `\\sum m(${head}, \\dots)\\;(${minterms.length})`,
    text: `Σm(${head}, ...) (${minterms.length})`,
    minterms,
  };
}

function functionDependsOnVar(
  values: readonly TruthCellValue[],
  varIndex: number,
  varCount: number,
): boolean {
  const bitMask = 1 << (varCount - 1 - varIndex);
  const total = 1 << varCount;
  for (let i = 0; i < total; i++) {
    if ((i & bitMask) !== 0) continue;
    const v0 = values[i];
    const v1 = values[i | bitMask];
    if (v0 !== 'X' && v1 !== 'X' && v0 !== v1) {
      return true;
    }
  }
  return false;
}

function buildDiffKMap(
  variables: readonly string[],
  rows: readonly CompareRow[],
): DiffKMapData | null {
  const n = variables.length;
  if (n < 2 || n > 4) return null;

  const rowVars = n === 2 ? [variables[0]] : n === 3 ? [variables[0]] : [variables[0], variables[1]];
  const colVars = n === 2 ? [variables[1]] : n === 3 ? [variables[1], variables[2]] : [variables[2], variables[3]];
  const rowGray = rowVars.length === 1 ? [0, 1] : [0, 1, 3, 2];
  const colGray = colVars.length === 1 ? [0, 1] : [0, 1, 3, 2];
  const rowLabels = rowVars.length === 1 ? ['0', '1'] : ['00', '01', '11', '10'];
  const colLabels = colVars.length === 1 ? ['0', '1'] : ['00', '01', '11', '10'];

  return {
    variables,
    rowVars,
    colVars,
    rowGray,
    colGray,
    rowLabels,
    colLabels,
    cells: rows,
  };
}

export function compareBooleanSources(
  sourceA: CompareSource,
  sourceB: CompareSource,
  options: CompareOptions = {},
): CompareResult {
  const notation: NotationStyle = options.notation ?? 'engineering';
  const explicitAnd = options.explicitAnd ?? true;

  const resA = resolveSource(sourceA, 'A', notation, explicitAnd);
  const resB = resolveSource(sourceB, 'B', notation, explicitAnd);

  if ('error' in resA && 'error' in resB) {
    return { ok: false, side: 'both', error: `Reference: ${resA.error} | Candidate: ${resB.error}` };
  }
  if ('error' in resA) {
    return { ok: false, side: 'A', error: resA.error };
  }
  if ('error' in resB) {
    return { ok: false, side: 'B', error: resB.error };
  }

  const a = resA.data;
  const b = resB.data;

  const varSet = new Set<string>([...a.variables, ...b.variables]);
  const variables = [...varSet].sort((x, y) => x.localeCompare(y, 'en'));
  if (variables.length > MAX_COMPARE_VARS) {
    return {
      ok: false,
      side: 'both',
      error: `Combined expressions use ${variables.length} distinct variables (${variables.join(', ')}). Maximum supported is ${MAX_COMPARE_VARS}.`,
    };
  }

  const aVarSet = new Set(a.variables);
  const bVarSet = new Set(b.variables);
  const onlyInA = variables.filter((v) => aVarSet.has(v) && !bVarSet.has(v));
  const onlyInB = variables.filter((v) => bVarSet.has(v) && !aVarSet.has(v));

  const n = variables.length;
  const totalRows = 1 << n;
  const rows: CompareRow[] = new Array<CompareRow>(totalRows);
  const valsA: TruthCellValue[] = new Array<TruthCellValue>(totalRows);
  const valsB: TruthCellValue[] = new Array<TruthCellValue>(totalRows);

  let aTrue = 0;
  let aFalse = 0;
  let aDC = 0;
  let bTrue = 0;
  let bFalse = 0;
  let bDC = 0;

  let checkedRows = 0;
  let dontCareRows = 0;
  let matchCount = 0;
  let missingCount = 0;
  let extraCount = 0;
  let firstCounterexample: CompareRow | null = null;

  const diffMinterms: number[] = [];
  const missingMinterms: number[] = [];
  const extraMinterms: number[] = [];

  for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
    const inputs: Record<string, 0 | 1> = {};
    for (let i = 0; i < n; i++) {
      inputs[variables[i]] = ((rowIdx >> (n - 1 - i)) & 1) === 1 ? 1 : 0;
    }

    const va = evaluateResolved(a, inputs);
    const vb = evaluateResolved(b, inputs);
    valsA[rowIdx] = va;
    valsB[rowIdx] = vb;

    if (va === 1) aTrue++;
    else if (va === 0) aFalse++;
    else aDC++;

    if (vb === 1) bTrue++;
    else if (vb === 0) bFalse++;
    else bDC++;

    let status: CompareRowStatus;
    if (va === 'X' || vb === 'X') {
      status = 'dont-care';
      dontCareRows++;
    } else {
      checkedRows++;
      if (va === vb) {
        status = 'match';
        matchCount++;
      } else if (va === 1 && vb === 0) {
        status = 'missing';
        missingCount++;
        diffMinterms.push(rowIdx);
        missingMinterms.push(rowIdx);
      } else {
        status = 'extra';
        extraCount++;
        diffMinterms.push(rowIdx);
        extraMinterms.push(rowIdx);
      }
    }

    const row: CompareRow = { index: rowIdx, inputs, valA: va, valB: vb, status };
    rows[rowIdx] = row;
    if (!firstCounterexample && (status === 'missing' || status === 'extra')) {
      firstCounterexample = row;
    }
  }

  const mismatchCount = missingCount + extraCount;
  const equivalent = mismatchCount === 0;
  const agreementPercent = checkedRows === 0 ? 100 : Math.round((matchCount / checkedRows) * 1000) / 10;

  let relation: CompareRelation;
  if (equivalent) {
    relation = 'equivalent';
  } else if (checkedRows > 0 && matchCount === 0) {
    relation = 'complement';
  } else if (missingCount === 0 && extraCount > 0) {
    relation = 'a-implies-b';
  } else if (extraCount === 0 && missingCount > 0) {
    relation = 'b-implies-a';
  } else {
    relation = 'different';
  }

  // Check if any asymmetric variable actually influences the side that uses it
  let dependMismatch = false;
  for (const v of onlyInA) {
    const idx = variables.indexOf(v);
    if (idx >= 0 && functionDependsOnVar(valsA, idx, n)) {
      dependMismatch = true;
      break;
    }
  }
  if (!dependMismatch) {
    for (const v of onlyInB) {
      const idx = variables.indexOf(v);
      if (idx >= 0 && functionDependsOnVar(valsB, idx, n)) {
        dependMismatch = true;
        break;
      }
    }
  }

  const diffFormula = buildFormulaForMinterms(diffMinterms, variables, notation, explicitAnd);
  const missingFormula = buildFormulaForMinterms(missingMinterms, variables, notation, explicitAnd);
  const extraFormula = buildFormulaForMinterms(extraMinterms, variables, notation, explicitAnd);

  // Compute minimal SOP reference when <= 6 variables and no don't-cares on A (or evaluate clean vector)
  let minimalReference: CompareSuccess['minimalReference'] = null;
  if (n <= 6 && aDC === 0) {
    if (n === 0) {
      const cNode = makeConst(valsA[0] === 1 ? 1 : 0);
      minimalReference = {
        latex: toLatex(cNode, notation, explicitAnd),
        text: toPlainText(cNode, notation, explicitAnd),
        metrics: measureComplexity(cNode),
      };
    } else {
      const vecA = valsA.map((v) => (v === 1 ? 1 : 0));
      const qmSop = minimizeQM(vecA, variables, 'sop', 'medium');
      const qmPos = minimizeQM(vecA, variables, 'pos', 'medium');
      const sopM = measureComplexity(qmSop.ast);
      const posM = measureComplexity(qmPos.ast);
      const pick =
        posM.literals < sopM.literals || (posM.literals === sopM.literals && posM.gates < sopM.gates)
          ? { ast: qmPos.ast, metrics: posM }
          : { ast: qmSop.ast, metrics: sopM };
      minimalReference = {
        latex: toLatex(pick.ast, notation, explicitAnd),
        text: toPlainText(pick.ast, notation, explicitAnd),
        metrics: pick.metrics,
      };
    }
  }

  return {
    ok: true,
    equivalent,
    relation,
    variables,
    onlyInA,
    onlyInB,
    dependMismatch,
    sourceA: {
      kind: a.kind,
      label: a.label,
      outputName: a.outputName,
      variables: a.variables,
      latex: a.latex,
      text: a.text,
      metrics: a.metrics,
      trueCount: aTrue,
      falseCount: aFalse,
      dontCareCount: aDC,
    },
    sourceB: {
      kind: b.kind,
      label: b.label,
      outputName: b.outputName,
      variables: b.variables,
      latex: b.latex,
      text: b.text,
      metrics: b.metrics,
      trueCount: bTrue,
      falseCount: bFalse,
      dontCareCount: bDC,
    },
    rows,
    totalRows,
    checkedRows,
    dontCareRows,
    matchCount,
    mismatchCount,
    missingCount,
    extraCount,
    agreementPercent,
    firstCounterexample,
    diffFormula,
    missingFormula,
    extraFormula,
    minimalReference,
    diffKMap: buildDiffKMap(variables, rows),
  };
}

export function checkDerivationChain(
  initialSource: CompareSource,
  stepExpressions: readonly string[],
  options: CompareOptions = {},
): DerivationChainResult {
  const notation: NotationStyle = options.notation ?? 'engineering';
  const explicitAnd = options.explicitAnd ?? true;

  const initRes = resolveSource(initialSource, 'Start', notation, explicitAnd);
  if ('error' in initRes) {
    return {
      ok: false,
      initialError: initRes.error,
      steps: [],
      allValid: false,
      firstErrorIndex: null,
      checkedStepCount: 0,
      validStepCount: 0,
      errorStepCount: 0,
    };
  }

  // Evaluate initial summary cleanly via self-comparison
  const selfCheck = compareBooleanSources(initialSource, initialSource, options);
  const initialSummary = selfCheck.ok ? selfCheck.sourceA : undefined;

  const checks: DerivationStepCheck[] = [];
  let lastValidSource: CompareSource = initialSource;
  let lastValidStepIdx: number | null = null;
  let firstErrorIndex: number | null = null;
  let checkedStepCount = 0;
  let validStepCount = 0;
  let errorStepCount = 0;

  for (let i = 0; i < stepExpressions.length; i++) {
    const raw = stepExpressions[i];
    const trimmed = raw.trim();
    if (!trimmed) {
      checks.push({
        index: i,
        raw,
        status: 'empty',
        prevStepIndex: lastValidStepIdx,
      });
      continue;
    }

    checkedStepCount++;
    const stepSource: CompareExpressionSource = {
      kind: 'expression',
      expr: trimmed,
      label: `Step ${i + 1}`,
    };
    const parsedStep = resolveSource(stepSource, `Step ${i + 1}`, notation, explicitAnd);
    if ('error' in parsedStep) {
      errorStepCount++;
      if (firstErrorIndex === null) firstErrorIndex = i;
      checks.push({
        index: i,
        raw,
        status: 'syntax-error',
        error: parsedStep.error,
        prevStepIndex: lastValidStepIdx,
      });
      continue;
    }

    const vsOrigRes = compareBooleanSources(initialSource, stepSource, options);
    const vsPrevRes = compareBooleanSources(lastValidSource, stepSource, options);

    if ('error' in vsOrigRes || 'error' in vsPrevRes) {
      const errMsg =
        'error' in vsOrigRes
          ? vsOrigRes.error
          : 'error' in vsPrevRes
            ? vsPrevRes.error
            : 'Comparison error';
      errorStepCount++;
      if (firstErrorIndex === null) firstErrorIndex = i;
      checks.push({
        index: i,
        raw,
        status: 'syntax-error',
        latex: parsedStep.data.latex,
        text: parsedStep.data.text,
        metrics: parsedStep.data.metrics,
        error: errMsg,
        prevStepIndex: lastValidStepIdx,
      });
      continue;
    }

    let status: DerivationStepStatus;
    if (vsOrigRes.equivalent && vsPrevRes.equivalent) {
      status = 'valid';
      validStepCount++;
    } else if (!vsOrigRes.equivalent && !vsPrevRes.equivalent) {
      if (firstErrorIndex === null) {
        status = 'first-error';
        firstErrorIndex = i;
      } else {
        status = 'step-error';
      }
      errorStepCount++;
    } else if (!vsOrigRes.equivalent && vsPrevRes.equivalent) {
      status = 'cascaded';
      errorStepCount++;
    } else {
      status = 'recovered';
      validStepCount++;
    }

    checks.push({
      index: i,
      raw,
      status,
      latex: parsedStep.data.latex,
      text: parsedStep.data.text,
      metrics: parsedStep.data.metrics,
      vsOriginal: vsOrigRes,
      vsPrev: vsPrevRes,
      prevStepIndex: lastValidStepIdx,
    });

    lastValidSource = stepSource;
    lastValidStepIdx = i;
  }

  return {
    ok: true,
    initialSummary,
    steps: checks,
    allValid: checkedStepCount > 0 && errorStepCount === 0,
    firstErrorIndex,
    checkedStepCount,
    validStepCount,
    errorStepCount,
  };
}

/**
 * Parse a compact bitstring or delimited vector into truth-table cells.
 * Accepts "00010111", "0, 1, X, 1", "0 1 - 1", or "F T T F".
 */
export function parseTruthTableVector(
  raw: string,
  expectedLength: number,
): { readonly ok: true; readonly values: readonly TruthCellValue[] } | { readonly ok: false; readonly error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste a bitstring such as 00010111 or comma-separated values.' };
  }

  // Decide whether input is delimited tokens or compact single-character stream
  const hasSeparators = /[\s,;|]/.test(trimmed);
  const rawTokens = hasSeparators
    ? trimmed.split(/[\s,;|]+/).filter(Boolean)
    : trimmed.split('');

  const values: TruthCellValue[] = [];
  for (const tok of rawTokens) {
    const up = tok.toUpperCase();
    if (up === '0' || up === 'F' || up === 'FALSE' || up === 'L') {
      values.push(0);
    } else if (up === '1' || up === 'T' || up === 'TRUE' || up === 'H') {
      values.push(1);
    } else if (up === 'X' || up === '-' || up === '?' || up === 'DC' || up === 'D') {
      values.push('X');
    } else {
      return { ok: false, error: `Unrecognized value "${tok}". Use 0, 1, or X.` };
    }
  }

  if (values.length !== expectedLength) {
    return {
      ok: false,
      error: `Expected ${expectedLength} values for this table, got ${values.length}.`,
    };
  }

  return { ok: true, values };
}

export function exportCompareCsv(result: CompareSuccess): string {
  const header = ['#', ...result.variables, result.sourceA.label, result.sourceB.label, 'Status'];
  const lines = [header.join(',')];
  for (const row of result.rows) {
    const vals = [
      String(row.index),
      ...result.variables.map((v) => String(row.inputs[v] ?? 0)),
      String(row.valA),
      String(row.valB),
      row.status,
    ];
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

export function formatCounterexampleText(row: CompareRow, variables: readonly string[]): string {
  if (variables.length === 0) return '(constant)';
  return variables.map((v) => `${v}=${row.inputs[v] ?? 0}`).join(', ');
}

export function formatSourceAssignmentLatex(summary: SourceSummary): string {
  return `${varToLatex(summary.outputName)} = ${summary.latex}`;
}

export const COMPARE_PRESETS: readonly ComparePreset[] = [
  {
    id: 'consensus-valid',
    mode: 'pair',
    titleKey: 'boolean.compare.preset.consensusValid',
    descKey: 'boolean.compare.presetDesc.consensusValid',
    tagKey: 'boolean.compare.preset.tagEquivalent',
    sourceA: { kind: 'expression', expr: "Y = A*B + A'*C + B*C" },
    sourceB: { kind: 'expression', expr: "Y = A*B + A'*C" },
  },
  {
    id: 'demorgan-mistake',
    mode: 'pair',
    titleKey: 'boolean.compare.preset.demorganMistake',
    descKey: 'boolean.compare.presetDesc.demorganMistake',
    tagKey: 'boolean.compare.preset.tagMistake',
    sourceA: { kind: 'expression', expr: "Y = !(A*B + C)" },
    sourceB: { kind: 'expression', expr: "Y = A'*B' + C'" },
  },
  {
    id: 'complement-trap',
    mode: 'pair',
    titleKey: 'boolean.compare.preset.complementTrap',
    descKey: 'boolean.compare.presetDesc.complementTrap',
    tagKey: 'boolean.compare.preset.tagInverse',
    sourceA: { kind: 'expression', expr: "Y = A ^ B" },
    sourceB: { kind: 'expression', expr: "Y = A*B + A'*B'" },
  },
  {
    id: 'majority-table',
    mode: 'pair',
    titleKey: 'boolean.compare.preset.majorityTable',
    descKey: 'boolean.compare.presetDesc.majorityTable',
    tagKey: 'boolean.compare.preset.tagTable',
    sourceA: {
      kind: 'truth-table',
      variables: ['A', 'B', 'C'],
      values: [0, 0, 0, 1, 0, 1, 1, 1],
      outputName: 'M',
    },
    sourceB: { kind: 'expression', expr: 'M = A*B + B*C + A*C' },
  },
  {
    id: 'chain-sign-bug',
    mode: 'chain',
    titleKey: 'boolean.compare.preset.chainSignBug',
    descKey: 'boolean.compare.presetDesc.chainSignBug',
    tagKey: 'boolean.compare.preset.tagSteps',
    sourceA: { kind: 'expression', expr: "Y = !(A + B*C) + A'*C" },
    chainSteps: [
      "A'*(B*C)' + A'*C",
      "A'*(B' * C') + A'*C",
      "A'*B'*C' + A'*C",
    ],
  },
  {
    id: 'chain-valid',
    mode: 'chain',
    titleKey: 'boolean.compare.preset.chainValid',
    descKey: 'boolean.compare.presetDesc.chainValid',
    tagKey: 'boolean.compare.preset.tagValidSteps',
    sourceA: { kind: 'expression', expr: "(A + B)*(A + C)" },
    chainSteps: [
      "A*A + A*C + B*A + B*C",
      "A + A*C + A*B + B*C",
      "A*(1 + C + B) + B*C",
      "A + B*C",
    ],
  },
];
