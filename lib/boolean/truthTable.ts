import { evalInternalSignals } from './circuit';
import { evaluateBool } from './parse';
import type { BoolNode, InternalSignalDef, TruthTableData, TruthTableRow } from './types';

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

  const header = visibleCols.map((c) => `$${c.label}$`).join(' & ');
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
