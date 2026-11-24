import { evalInternalSignals } from './circuit';
import { evaluateBool, varToLatex } from './parse';
import type { BoolNode, InternalSignalDef, TruthTableData, TruthTableRow } from './types';

export const INPUT_NAME_POOL = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
] as const;

export const OUTPUT_NAME_POOL = ['X', 'Y', 'Z'] as const;

const RESERVED_SIGNAL_KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'XOR',
  'XNOR',
  'NAND',
  'NOR',
  'TRUE',
  'FALSE',
]);

export function generateDefaultSignalName(
  kind: 'input' | 'output',
  usedNames: ReadonlySet<string>,
): string {
  const pool = kind === 'input' ? INPUT_NAME_POOL : OUTPUT_NAME_POOL;
  for (let gen = 0; ; gen++) {
    const suffix = gen === 0 ? '' : String(gen);
    for (const letter of pool) {
      const candidate = `${letter}${suffix}`;
      if (!usedNames.has(candidate)) return candidate;
    }
  }
}

export function validateSignalName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Signal name cannot be empty.';
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed)) {
    return 'Use letters, digits, and underscores only, starting with a letter or underscore.';
  }
  if (RESERVED_SIGNAL_KEYWORDS.has(trimmed.toUpperCase())) {
    return `"${trimmed}" is a reserved Boolean operator keyword.`;
  }
  return null;
}

export function truthTableOutputToEquation(
  outputName: string,
  inputNames: readonly string[],
  values: readonly (0 | 1)[],
): string {
  const n = inputNames.length;
  const totalRows = 1 << n;
  const minterms: string[] = [];

  for (let row = 0; row < totalRows; row++) {
    if ((values[row] ?? 0) !== 1) continue;
    const literals: string[] = [];
    for (let b = 0; b < n; b++) {
      const bit = (row >> (n - 1 - b)) & 1;
      literals.push(bit === 1 ? inputNames[b] : `${inputNames[b]}'`);
    }
    minterms.push(literals.join('*'));
  }

  if (minterms.length === 0) return `${outputName} = 0`;
  if (minterms.length === totalRows) return `${outputName} = 1`;
  return `${outputName} = ${minterms.join(' + ')}`;
}

export function truthTableToEquations(
  inputNames: readonly string[],
  outputs: readonly { name: string; values: readonly (0 | 1)[] }[],
): string[] {
  return outputs.map((o) => truthTableOutputToEquation(o.name, inputNames, o.values));
}

const MAX_DISPLAY_ROWS = 64; // Up to 6 variables exhaustively; 7-8 vars truncated cleanly

export interface TruthTableOutputSpec {
  readonly outputName: string;
  readonly ast: BoolNode;
}

export function buildMultiTruthTable(
  outputs: readonly TruthTableOutputSpec[],
  variables: readonly string[],
  internals: readonly InternalSignalDef[],
): TruthTableData {
  const safeOutputs: readonly TruthTableOutputSpec[] =
    outputs.length > 0
      ? outputs
      : [{ outputName: 'Y', ast: { kind: 'const', value: 0 } }];

  const outputNames = safeOutputs.map((o) => o.outputName);
  const n = variables.length;
  const totalRows = 1 << n;
  const limit = Math.min(totalRows, MAX_DISPLAY_ROWS);
  const rows: TruthTableRow[] = [];

  for (let rowIdx = 0; rowIdx < limit; rowIdx++) {
    const inputs: Record<string, 0 | 1> = {};
    for (let i = 0; i < n; i++) {
      inputs[variables[i]] = ((rowIdx >> (n - 1 - i)) & 1) === 1 ? 1 : 0;
    }
    const outputMap: Record<string, 0 | 1> = {};
    for (const o of safeOutputs) {
      outputMap[o.outputName] = evaluateBool(o.ast, inputs);
    }
    const primaryOut = outputMap[outputNames[0]] ?? 0;
    const internalVals = evalInternalSignals(internals, inputs);
    rows.push({
      index: rowIdx,
      inputs,
      internals: internalVals,
      output: primaryOut,
      outputs: outputMap,
    });
  }

  return {
    outputName: outputNames[0] ?? 'Y',
    outputNames,
    variables,
    internals,
    rows,
    truncated: totalRows > MAX_DISPLAY_ROWS,
    totalRows,
  };
}

export function buildTruthTable(
  ast: BoolNode,
  variables: readonly string[],
  outputName: string,
  internals: readonly InternalSignalDef[],
): TruthTableData {
  return buildMultiTruthTable([{ outputName, ast }], variables, internals);
}

export function exportTruthTableCsv(
  table: TruthTableData,
  visibleCols: readonly { id: string; label: string; kind: 'input' | 'internal' | 'output' }[],
): string {
  const header = visibleCols.map((c) => c.label).join(',');
  const lines = [header];
  for (const row of table.rows) {
    const vals = visibleCols.map((col) => {
      if (col.kind === 'input') return row.inputs[col.id] ?? 0;
      if (col.kind === 'internal') return row.internals[col.id] ?? 0;
      return row.outputs[col.id] ?? row.output;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

export function exportTruthTableLatex(
  table: TruthTableData,
  visibleCols: readonly { id: string; label: string; kind: 'input' | 'internal' | 'output' }[],
): string {
  const spec = visibleCols
    .map((c, idx) => {
      const prev = idx > 0 ? visibleCols[idx - 1] : null;
      const sep = prev && prev.kind !== c.kind ? '|' : '';
      return `${sep}c`;
    })
    .join('');

  const header = visibleCols.map((c) => `$${varToLatex(c.label)}$`).join(' & ');
  const lines = [
    `\\begin{tabular}{${spec}}`,
    '  \\hline',
    `  ${header} \\\\`,
    '  \\hline',
  ];

  for (const row of table.rows) {
    const vals = visibleCols.map((col) => {
      if (col.kind === 'input') return row.inputs[col.id] ?? 0;
      if (col.kind === 'internal') return row.internals[col.id] ?? 0;
      return row.outputs[col.id] ?? row.output;
    });
    lines.push(`  ${vals.join(' & ')} \\\\`);
  }

  lines.push('  \\hline');
  lines.push('\\end{tabular}');
  return lines.join('\n');
}
