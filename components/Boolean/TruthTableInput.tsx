import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { evaluateBool, parseBoolean, toLatex, varToLatex } from '../../lib/boolean/parse';
import {
  generateDefaultSignalName,
  truthTableToEquations,
  validateSignalName,
} from '../../lib/boolean/truthTable';
import type {
  NotationStyle,
  ParsedBoolean,
  SimplifyEffort,
  SimplifyMethod,
  TargetForm,
} from '../../lib/boolean/types';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';
import KatexSpan from '../KatexSpan';
import type { BooleanSubmitOverride } from './BooleanInput';
import { TableSelectionBar, useTableSelection } from './useTableSelection';

const MAX_INPUTS = 8;
const MAX_OUTPUTS = 16;
const MAX_FULL_PREVIEW_MINTERMS = 16;

interface InputSignalCol {
  readonly id: string;
  readonly name: string;
}

interface OutputSignalCol {
  readonly id: string;
  readonly name: string;
  readonly values: readonly (0 | 1)[];
}

const INITIAL_INPUTS: readonly InputSignalCol[] = [
  { id: 'in-0', name: 'A' },
  { id: 'in-1', name: 'B' },
  { id: 'in-2', name: 'C' },
];

// 3-input majority: X = A·B + A·C + B·C
const INITIAL_OUTPUTS: readonly OutputSignalCol[] = [
  { id: 'out-0', name: 'X', values: [0, 0, 0, 1, 0, 1, 1, 1] },
];

export interface TruthTableInputProps {
  readonly method: SimplifyMethod;
  readonly onMethodChange: (next: SimplifyMethod) => void;
  readonly effort: SimplifyEffort;
  readonly onEffortChange: (next: SimplifyEffort) => void;
  readonly targetForm: TargetForm;
  readonly onTargetFormChange: (next: TargetForm) => void;
  readonly notation: NotationStyle;
  readonly onNotationChange: (next: NotationStyle) => void;
  readonly explicitAnd: boolean;
  readonly onExplicitAndChange: (next: boolean) => void;
  readonly currentEquations: readonly string[];
  readonly onApplyEquations: (equations: string[], switchToExpression?: boolean) => void;
  readonly onOptionsSolve: (override: BooleanSubmitOverride) => void;
}

export default function TruthTableInput({
  method,
  onMethodChange,
  effort,
  onEffortChange,
  targetForm,
  onTargetFormChange,
  notation,
  onNotationChange,
  explicitAnd,
  onExplicitAndChange,
  currentEquations,
  onApplyEquations,
  onOptionsSolve,
}: TruthTableInputProps) {
  const { t } = useI18n();
  const { mode } = useExperienceMode();
  const isQuick = mode === 'quick';

  const [inputs, setInputs] = useState<readonly InputSignalCol[]>(INITIAL_INPUTS);
  const [outputs, setOutputs] = useState<readonly OutputSignalCol[]>(INITIAL_OUTPUTS);
  const [importedFlash, setImportedFlash] = useState(false);

  const nextIdRef = useRef(1);
  const importTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (importTimerRef.current !== null) window.clearTimeout(importTimerRef.current);
    };
  }, []);

  const numInputs = inputs.length;
  const totalRows = 1 << numInputs;

  const validation = useMemo(() => {
    const errorsById = new Map<string, string>();
    const counts = new Map<string, number>();

    for (const col of inputs) {
      const trimmed = col.name.trim();
      if (trimmed) counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }
    for (const col of outputs) {
      const trimmed = col.name.trim();
      if (trimmed) counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
    }

    const localizeSyntaxErr = (raw: string, name: string): string => {
      if (raw.includes('cannot be empty')) return t('boolean.ttInput.errEmpty');
      if (raw.includes('reserved Boolean operator')) {
        return t('boolean.ttInput.errReserved', { name: name.trim() });
      }
      if (raw.includes('Use letters, digits')) return t('boolean.ttInput.errFormat');
      return raw;
    };

    let firstError: string | null = null;
    const check = (id: string, name: string) => {
      const syntaxErr = validateSignalName(name);
      if (syntaxErr) {
        const localized = localizeSyntaxErr(syntaxErr, name);
        errorsById.set(id, localized);
        if (!firstError) firstError = localized;
        return;
      }
      const trimmed = name.trim();
      if ((counts.get(trimmed) ?? 0) > 1) {
        const dupErr = t('boolean.ttInput.duplicateName', { name: trimmed });
        errorsById.set(id, dupErr);
        if (!firstError) firstError = dupErr;
      }
    };

    for (const col of inputs) check(col.id, col.name);
    for (const col of outputs) check(col.id, col.name);

    return {
      errorsById,
      firstError,
      isValid: errorsById.size === 0,
    };
  }, [inputs, outputs, t]);

  const generatedEquations = useMemo(() => {
    if (!validation.isValid) return [];
    const trimmedInputs = inputs.map((i) => i.name.trim());
    const trimmedOutputs = outputs.map((o) => ({
      name: o.name.trim(),
      values: o.values,
    }));
    return truthTableToEquations(trimmedInputs, trimmedOutputs);
  }, [validation.isValid, inputs, outputs]);

  const previewLatexList = useMemo(() => {
    if (!validation.isValid) return [];
    return outputs.map((out, idx) => {
      const trimmedName = out.name.trim();
      const minterms: number[] = [];
      for (let r = 0; r < totalRows; r++) {
        if ((out.values[r] ?? 0) === 1) minterms.push(r);
      }

      if (minterms.length > MAX_FULL_PREVIEW_MINTERMS && minterms.length < totalRows) {
        const firstFew = minterms.slice(0, 6);
        const mintermsText = t('boolean.ttInput.mintermsCount', { count: minterms.length });
        return `${varToLatex(trimmedName)} = \\sum m(${firstFew.join(', ')}, \\dots)\\;\\text{(${mintermsText})}`;
      }

      const eq = generatedEquations[idx];
      if (!eq) return `${varToLatex(trimmedName)} = 0`;
      try {
        const parsed = parseBoolean(eq);
        return `${varToLatex(trimmedName)} = ${toLatex(parsed.ast, notation, explicitAnd)}`;
      } catch {
        return `${varToLatex(trimmedName)} = 0`;
      }
    });
  }, [validation.isValid, outputs, totalRows, generatedEquations, notation, explicitAnd, t]);

  const importCandidate = useMemo(() => {
    const nonEmpty = currentEquations.map((s) => s.trim()).filter(Boolean);
    if (nonEmpty.length === 0 || nonEmpty.length > MAX_OUTPUTS) {
      return { ok: false as const };
    }
    const parsedList: { readonly parsed: ParsedBoolean; readonly raw: string }[] = [];
    const varSet = new Set<string>();
    for (const raw of nonEmpty) {
      try {
        const parsed = parseBoolean(raw);
        parsedList.push({ parsed, raw });
        for (const v of parsed.variables) varSet.add(v);
      } catch {
        return { ok: false as const };
      }
    }
    const allVars = [...varSet].sort((a, b) => a.localeCompare(b, 'en'));
    if (allVars.length < 1 || allVars.length > MAX_INPUTS) {
      return { ok: false as const };
    }
    return { ok: true as const, allVars, parsedList };
  }, [currentEquations]);

  const tableGrid = useMemo<readonly (readonly string[])[]>(() => {
    const header = [
      '#',
      ...inputs.map((i) => i.name.trim() || i.name),
      ...outputs.map((o) => o.name.trim() || o.name),
    ];
    const rows: string[][] = [];
    for (let r = 0; r < totalRows; r++) {
      const cells: string[] = [String(r)];
      for (let b = 0; b < numInputs; b++) {
        cells.push(String((r >> (numInputs - 1 - b)) & 1));
      }
      for (const out of outputs) {
        cells.push(String(out.values[r] ?? 0));
      }
      rows.push(cells);
    }
    return [header, ...rows];
  }, [inputs, outputs, numInputs, totalRows]);

  const selection = useTableSelection(tableGrid);

  const getUsedNames = () => {
    const used = new Set<string>();
    for (const col of inputs) {
      const trimmed = col.name.trim();
      if (trimmed) used.add(trimmed);
    }
    for (const col of outputs) {
      const trimmed = col.name.trim();
      if (trimmed) used.add(trimmed);
    }
    return used;
  };

  const handleAddInput = () => {
    if (inputs.length >= MAX_INPUTS) return;
    const name = generateDefaultSignalName('input', getUsedNames());
    const id = `in-${++nextIdRef.current}`;
    setInputs((prev) => [...prev, { id, name }]);
    setOutputs((prev) =>
      prev.map((out) => {
        const doubled: (0 | 1)[] = new Array<0 | 1>(out.values.length * 2);
        for (let r = 0; r < out.values.length; r++) {
          const v = out.values[r] ?? 0;
          doubled[r * 2] = v;
          doubled[r * 2 + 1] = v;
        }
        return { ...out, values: doubled };
      }),
    );
  };

  const handleRemoveInput = (removeIdx: number) => {
    if (inputs.length <= 1 || removeIdx < 0 || removeIdx >= inputs.length) return;
    const bitPos = inputs.length - 1 - removeIdx;
    setInputs((prev) => prev.filter((_, idx) => idx !== removeIdx));
    setOutputs((prev) =>
      prev.map((out) => {
        const halved: (0 | 1)[] = [];
        for (let r = 0; r < out.values.length; r++) {
          if (((r >> bitPos) & 1) === 0) {
            halved.push(out.values[r] ?? 0);
          }
        }
        return { ...out, values: halved };
      }),
    );
  };

  const handleAddOutput = () => {
    if (outputs.length >= MAX_OUTPUTS) return;
    const name = generateDefaultSignalName('output', getUsedNames());
    const id = `out-${++nextIdRef.current}`;
    setOutputs((prev) => [
      ...prev,
      { id, name, values: new Array<0 | 1>(totalRows).fill(0) },
    ]);
  };

  const handleRemoveOutput = (removeIdx: number) => {
    if (outputs.length <= 1 || removeIdx < 0 || removeIdx >= outputs.length) return;
    setOutputs((prev) => prev.filter((_, idx) => idx !== removeIdx));
  };

  const handleRenameInput = (id: string, nextName: string) => {
    setInputs((prev) => prev.map((col) => (col.id === id ? { ...col, name: nextName } : col)));
  };

  const handleRenameOutput = (id: string, nextName: string) => {
    setOutputs((prev) => prev.map((col) => (col.id === id ? { ...col, name: nextName } : col)));
  };

  const handleToggleOutput = (outIdx: number, rowIdx: number) => {
    setOutputs((prev) =>
      prev.map((out, idx) => {
        if (idx !== outIdx) return out;
        const nextValues = [...out.values];
        nextValues[rowIdx] = (nextValues[rowIdx] ?? 0) === 1 ? 0 : 1;
        return { ...out, values: nextValues };
      }),
    );
  };

  const handleClearOutputs = () => {
    setOutputs((prev) =>
      prev.map((out) => ({
        ...out,
        values: new Array<0 | 1>(totalRows).fill(0),
      })),
    );
  };

  const handleInvertOutputs = () => {
    setOutputs((prev) =>
      prev.map((out) => ({
        ...out,
        values: out.values.map((v) => (v === 1 ? 0 : 1)),
      })),
    );
  };

  const handleImportFromExpression = () => {
    if (!importCandidate.ok) return;
    const { allVars, parsedList } = importCandidate;
    const n = allVars.length;
    const rowsCount = 1 << n;

    const usedNames = new Set<string>(allVars);
    const nextInputs: InputSignalCol[] = allVars.map((v) => ({
      id: `in-${++nextIdRef.current}`,
      name: v,
    }));

    const nextOutputs: OutputSignalCol[] = parsedList.map(({ parsed, raw }, idx) => {
      let outName = parsed.outputName;
      if (parsedList.length > 1 && !raw.includes('=')) {
        outName = `Y${idx + 1}`;
      }
      if (usedNames.has(outName) || validateSignalName(outName) !== null) {
        outName = generateDefaultSignalName('output', usedNames);
      }
      usedNames.add(outName);

      const values: (0 | 1)[] = new Array<0 | 1>(rowsCount);
      for (let r = 0; r < rowsCount; r++) {
        const env: Record<string, 0 | 1> = {};
        for (let b = 0; b < n; b++) {
          env[allVars[b]] = ((r >> (n - 1 - b)) & 1) === 1 ? 1 : 0;
        }
        values[r] = evaluateBool(parsed.ast, env);
      }
      return {
        id: `out-${++nextIdRef.current}`,
        name: outName,
        values,
      };
    });

    setInputs(nextInputs);
    setOutputs(nextOutputs);
    setImportedFlash(true);
    if (importTimerRef.current !== null) window.clearTimeout(importTimerRef.current);
    importTimerRef.current = window.setTimeout(() => {
      setImportedFlash(false);
      importTimerRef.current = null;
    }, 1600);
  };

  const handleOptionSolve = (override: BooleanSubmitOverride) => {
    if (!validation.isValid) return;
    onOptionsSolve({ equations: generatedEquations, ...override });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validation.isValid) return;
    onApplyEquations(generatedEquations, false);
  };

  const methodOptions: readonly { id: SimplifyMethod; label: string }[] = [
    { id: 'algebraic', label: t('boolean.opt.method.algebraic') },
    { id: 'qm', label: t('boolean.opt.method.qm') },
    { id: 'heuristic', label: t('boolean.opt.method.heuristic') },
  ];

  const effortOptions: readonly { id: SimplifyEffort; label: string }[] = [
    { id: 'low', label: t('boolean.opt.effort.low') },
    { id: 'medium', label: t('boolean.opt.effort.medium') },
    { id: 'high', label: t('boolean.opt.effort.high') },
  ];

  const formOptions: readonly { id: TargetForm; label: string }[] = [
    { id: 'auto', label: t('boolean.opt.form.auto') },
    { id: 'sop', label: t('boolean.opt.form.sop') },
    { id: 'pos', label: t('boolean.opt.form.pos') },
    { id: 'nand', label: t('boolean.opt.form.nand') },
    { id: 'nor', label: t('boolean.opt.form.nor') },
  ];

  return (
    <form className={dStyles.ttEditorForm} onSubmit={handleSubmit}>
      <div className={dStyles.ttEditorToolbar}>
        <div className={styles.btnRow}>
          <button
            type="button"
            className={[styles.btnGhost, styles.btnSmall].join(' ')}
            onClick={handleClearOutputs}
            data-testid="tt-clear-outputs"
          >
            {t('boolean.ttInput.clearOutputs')}
          </button>
          <button
            type="button"
            className={[styles.btnGhost, styles.btnSmall].join(' ')}
            onClick={handleInvertOutputs}
            data-testid="tt-invert-outputs"
          >
            {t('boolean.ttInput.invertOutputs')}
          </button>
          <button
            type="button"
            className={[styles.btn, styles.btnSmall].join(' ')}
            onClick={handleImportFromExpression}
            disabled={!importCandidate.ok}
            title={importCandidate.ok ? t('boolean.ttInput.importExpr') : t('boolean.ttInput.importDisabled')}
            data-testid="tt-import-expr"
          >
            {importedFlash ? t('boolean.ttInput.imported') : t('boolean.ttInput.importExpr')}
          </button>
          <button
            type="button"
            className={[styles.btnGhost, styles.btnSmall].join(' ')}
            onClick={() => {
              void selection.copyAll();
            }}
            data-testid="tt-copy-excel"
          >
            {selection.copiedState === 'all'
              ? t('boolean.table.copiedExcel')
              : t('boolean.table.copyExcel')}
          </button>
        </div>
        <span className={styles.metaInline}>
          {t('boolean.ttInput.rowsCount', { rows: totalRows })}
        </span>
      </div>

      {!validation.isValid && validation.firstError && (
        <div className={dStyles.ttErrorBanner} role="alert" data-testid="tt-validation-error">
          {validation.firstError}
        </div>
      )}

      <div
        ref={selection.containerRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) {
            return;
          }
          selection.onKeyDown(e);
        }}
        className={dStyles.selectableBox}
      >
        <div
          className={[
            dStyles.tableWrap,
            numInputs >= 5 ? dStyles.ttEditorTableScroll : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <table
            className={[dStyles.truthTable, dStyles.selectableTable, dStyles.ttEditorTable].join(' ')}
            data-testid="tt-editor-table"
          >
            <thead>
              <tr className={dStyles.ttGroupRow}>
                <th
                  rowSpan={2}
                  {...selection.getCellProps(0, 0)}
                  className={selection.getCellClassName(0, 0, dStyles.rowIdx)}
                >
                  #
                </th>
                <th colSpan={inputs.length}>
                  <div className={dStyles.ttGroupHeadInner}>
                    <span className={dStyles.ttGroupLabel}>{t('boolean.ttInput.inputs')}</span>
                    <span className={dStyles.ttGroupBadge}>{inputs.length}</span>
                    <span className={dStyles.ttGroupBtns}>
                      <button
                        type="button"
                        className={dStyles.ttGroupBtn}
                        onClick={() => handleRemoveInput(inputs.length - 1)}
                        disabled={inputs.length <= 1}
                        aria-label={t('boolean.ttInput.removeLastInput')}
                        title={t('boolean.ttInput.removeLastInput')}
                        data-testid="tt-input-remove-last"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className={dStyles.ttGroupBtn}
                        onClick={handleAddInput}
                        disabled={inputs.length >= MAX_INPUTS}
                        aria-label={t('boolean.ttInput.addInput')}
                        title={
                          inputs.length >= MAX_INPUTS
                            ? t('boolean.ttInput.addInputMax')
                            : t('boolean.ttInput.addInput')
                        }
                        data-testid="tt-input-add"
                      >
                        +
                      </button>
                    </span>
                  </div>
                </th>
                <th colSpan={outputs.length} className={dStyles.colSep}>
                  <div className={dStyles.ttGroupHeadInner}>
                    <span className={dStyles.ttGroupLabel}>{t('boolean.ttInput.outputs')}</span>
                    <span className={dStyles.ttGroupBadge}>{outputs.length}</span>
                    <span className={dStyles.ttGroupBtns}>
                      <button
                        type="button"
                        className={dStyles.ttGroupBtn}
                        onClick={() => handleRemoveOutput(outputs.length - 1)}
                        disabled={outputs.length <= 1}
                        aria-label={t('boolean.ttInput.removeLastOutput')}
                        title={t('boolean.ttInput.removeLastOutput')}
                        data-testid="tt-output-remove-last"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className={dStyles.ttGroupBtn}
                        onClick={handleAddOutput}
                        disabled={outputs.length >= MAX_OUTPUTS}
                        aria-label={t('boolean.ttInput.addOutput')}
                        title={
                          outputs.length >= MAX_OUTPUTS
                            ? t('boolean.ttInput.addOutputMax')
                            : t('boolean.ttInput.addOutput')
                        }
                        data-testid="tt-output-add"
                      >
                        +
                      </button>
                    </span>
                  </div>
                </th>
              </tr>

              <tr>
                {inputs.map((col, iIdx) => {
                  const err = validation.errorsById.get(col.id);
                  const colIdx = 1 + iIdx;
                  return (
                    <th
                      key={col.id}
                      {...selection.getCellProps(0, colIdx)}
                      className={selection.getCellClassName(0, colIdx, dStyles.ttColHead)}
                    >
                      <div className={dStyles.ttColHeadInner}>
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) => handleRenameInput(col.id, e.target.value)}
                          className={[
                            dStyles.ttNameInput,
                            err ? dStyles.ttNameInputInvalid : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-label={t('boolean.ttInput.inputNameAria', { index: iIdx + 1 })}
                          aria-invalid={err ? true : undefined}
                          title={err ?? col.name}
                          autoComplete="off"
                          spellCheck={false}
                          data-testid={`tt-input-name-${iIdx}`}
                        />
                        {inputs.length > 1 && (
                          <button
                            type="button"
                            className={dStyles.ttColRemoveBtn}
                            onClick={() => handleRemoveInput(iIdx)}
                            aria-label={t('boolean.ttInput.removeInput', { name: col.name || String(iIdx + 1) })}
                            title={t('boolean.ttInput.removeInput', { name: col.name || String(iIdx + 1) })}
                            data-testid={`tt-input-remove-${iIdx}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}

                {outputs.map((col, oIdx) => {
                  const err = validation.errorsById.get(col.id);
                  const colIdx = 1 + inputs.length + oIdx;
                  const baseCls = [
                    dStyles.ttColHead,
                    dStyles.thOutput,
                    oIdx === 0 ? dStyles.colSep : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <th
                      key={col.id}
                      {...selection.getCellProps(0, colIdx)}
                      className={selection.getCellClassName(0, colIdx, baseCls)}
                    >
                      <div className={dStyles.ttColHeadInner}>
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) => handleRenameOutput(col.id, e.target.value)}
                          className={[
                            dStyles.ttNameInput,
                            err ? dStyles.ttNameInputInvalid : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-label={t('boolean.ttInput.outputNameAria', { index: oIdx + 1 })}
                          aria-invalid={err ? true : undefined}
                          title={err ?? col.name}
                          autoComplete="off"
                          spellCheck={false}
                          data-testid={`tt-output-name-${oIdx}`}
                        />
                        {outputs.length > 1 && (
                          <button
                            type="button"
                            className={dStyles.ttColRemoveBtn}
                            onClick={() => handleRemoveOutput(oIdx)}
                            aria-label={t('boolean.ttInput.removeOutput', { name: col.name || String(oIdx + 1) })}
                            title={t('boolean.ttInput.removeOutput', { name: col.name || String(oIdx + 1) })}
                            data-testid={`tt-output-remove-${oIdx}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {Array.from({ length: totalRows }, (_, rowIdx) => {
                const gridRow = rowIdx + 1;
                return (
                  <tr key={rowIdx}>
                    <td
                      {...selection.getCellProps(gridRow, 0)}
                      className={selection.getCellClassName(gridRow, 0, dStyles.rowIdx)}
                    >
                      {rowIdx}
                    </td>

                    {inputs.map((col, iIdx) => {
                      const bit = ((rowIdx >> (numInputs - 1 - iIdx)) & 1) as 0 | 1;
                      const colIdx = 1 + iIdx;
                      const baseCls = bit === 1 ? dStyles.valOne : dStyles.valZero;
                      return (
                        <td
                          key={col.id}
                          {...selection.getCellProps(gridRow, colIdx)}
                          className={selection.getCellClassName(gridRow, colIdx, baseCls)}
                        >
                          {bit}
                        </td>
                      );
                    })}

                    {outputs.map((col, oIdx) => {
                      const val = col.values[rowIdx] ?? 0;
                      const colIdx = 1 + numInputs + oIdx;
                      const tdBase = [
                        dStyles.ttOutputCell,
                        oIdx === 0 ? dStyles.colSep : '',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      return (
                        <td
                          key={col.id}
                          {...selection.getCellProps(gridRow, colIdx)}
                          className={selection.getCellClassName(gridRow, colIdx, tdBase)}
                        >
                          <button
                            type="button"
                            data-sel-cell-btn="1"
                            aria-pressed={val === 1}
                            aria-label={t('boolean.ttInput.cellAria', {
                              name: col.name.trim() || t('boolean.ttInput.defaultOut', { index: oIdx + 1 }),
                              row: rowIdx,
                              val,
                            })}
                            className={[
                              dStyles.ttOutputCellBtn,
                              val === 1 ? dStyles.valOne : dStyles.valZero,
                              val === 1 ? dStyles.ttOutputCellOne : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => {
                              if (!selection.consumeDidDrag()) {
                                handleToggleOutput(oIdx, rowIdx);
                              }
                            }}
                            data-testid={`tt-cell-${oIdx}-${rowIdx}`}
                          >
                            {val}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <TableSelectionBar selection={selection} />
      </div>

      <p className={dStyles.hintText}>{t('boolean.ttInput.clickHint')}</p>

      {!isQuick && (
        <div className={styles.optionsBar} data-testid="tt-advanced-options">
          <div className={styles.optionGroup}>
            <span className={styles.fieldLabel}>{t('boolean.opt.method')}</span>
            <div className={styles.segmented} role="group" aria-label={t('boolean.opt.method')}>
              {methodOptions.map((opt) => {
                const active = method === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      onMethodChange(opt.id);
                      handleOptionSolve({ method: opt.id });
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.optionGroup}>
            <span className={styles.fieldLabel}>{t('boolean.opt.effort')}</span>
            <div className={styles.segmented} role="group" aria-label={t('boolean.opt.effort')}>
              {effortOptions.map((opt) => {
                const active = effort === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      onEffortChange(opt.id);
                      handleOptionSolve({ effort: opt.id });
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.optionGroup}>
            <span className={styles.fieldLabel}>{t('boolean.opt.form')}</span>
            <div className={styles.segmented} role="group" aria-label={t('boolean.opt.form')}>
              {formOptions.map((opt) => {
                const active = targetForm === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    aria-pressed={active}
                    className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => {
                      onTargetFormChange(opt.id);
                      handleOptionSolve({ targetForm: opt.id });
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.optionGroup}>
            <label htmlFor="tt-notation-select" className={styles.fieldLabel}>
              {t('boolean.opt.notation')}
            </label>
            <select
              id="tt-notation-select"
              value={notation}
              onChange={(e) => {
                const next = e.target.value as NotationStyle;
                onNotationChange(next);
                handleOptionSolve({ notation: next });
              }}
              className={styles.selectInput}
            >
              <option value="engineering">{t('boolean.opt.notation.engineering')}</option>
              <option value="logic">{t('boolean.opt.notation.logic')}</option>
              <option value="programming">{t('boolean.opt.notation.programming')}</option>
              <option value="verilog">{t('boolean.opt.notation.verilog')}</option>
            </select>
          </div>

          <div className={styles.optionGroup}>
            <span className={styles.fieldLabel}>{t('boolean.opt.andStyle')}</span>
            <div className={styles.segmented} role="group" aria-label={t('boolean.opt.andStyle')}>
              <button
                type="button"
                aria-pressed={explicitAnd}
                className={[styles.segBtn, explicitAnd ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  onExplicitAndChange(true);
                  handleOptionSolve({ explicitAnd: true });
                }}
              >
                {t('boolean.opt.andStyle.explicit')}
              </button>
              <button
                type="button"
                aria-pressed={!explicitAnd}
                className={[styles.segBtn, !explicitAnd ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  onExplicitAndChange(false);
                  handleOptionSolve({ explicitAnd: false });
                }}
              >
                {t('boolean.opt.andStyle.minimal')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.previewBar} aria-live="polite" data-testid="tt-live-preview">
        {!validation.isValid && validation.firstError ? (
          <span className={styles.previewErr}>{validation.firstError}</span>
        ) : (
          <div className={styles.previewMath}>
            {previewLatexList.map((latex, idx) => (
              <KatexSpan key={outputs[idx]?.id ?? idx} text={latex} />
            ))}
          </div>
        )}
        <span className={styles.previewCaption}>{t('boolean.input.preview')}</span>
      </div>

      <div className={dStyles.ttFooterActions}>
        <div className={styles.btnRow}>
          <button
            type="submit"
            className={[styles.btnPrimary, styles.solveBtn].join(' ')}
            disabled={!validation.isValid}
            data-testid="tt-simplify-btn"
          >
            {t('boolean.input.simplify')}
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={!validation.isValid}
            onClick={() => {
              if (!validation.isValid) return;
              onApplyEquations(generatedEquations, true);
            }}
            data-testid="tt-open-in-expr-btn"
          >
            {t('boolean.ttInput.editInExpr')}
          </button>
        </div>
      </div>
    </form>
  );
}
