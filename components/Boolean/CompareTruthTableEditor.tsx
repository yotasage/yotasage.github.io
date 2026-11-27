import { useState } from 'react';

import {
  parseTruthTableVector,
  type CompareTruthTableSource,
  type TruthCellValue,
} from '../../lib/boolean/compare';
import { evaluateBool, parseBoolean } from '../../lib/boolean/parse';
import { generateDefaultSignalName, validateSignalName } from '../../lib/boolean/truthTable';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import cStyles from '../../styles/BooleanCompare.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';

const MAX_TT_VARS = 6;

export interface CompareTruthTableEditorProps {
  readonly sideId: 'A' | 'B' | 'start';
  readonly value: CompareTruthTableSource;
  readonly onChange: (next: CompareTruthTableSource) => void;
  readonly otherExpression?: string;
}

export default function CompareTruthTableEditor({
  sideId,
  value,
  onChange,
  otherExpression,
}: CompareTruthTableEditorProps) {
  const { t } = useI18n();
  const [allowDontCare, setAllowDontCare] = useState<boolean>(() =>
    value.values.includes('X'),
  );
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);

  const vars = value.variables;
  const n = vars.length;
  const totalRows = 1 << n;

  const varErrors = vars.map((v, idx) => {
    const syntax = validateSignalName(v);
    if (syntax) return syntax;
    const trimmed = v.trim();
    if (vars.some((other, j) => j !== idx && other.trim() === trimmed)) {
      return t('boolean.ttInput.duplicateName', { name: trimmed });
    }
    return null;
  });

  const handleRenameVar = (idx: number, nextName: string) => {
    const nextVars = vars.map((v, i) => (i === idx ? nextName : v));
    onChange({ ...value, variables: nextVars });
  };

  const handleAddVar = () => {
    if (vars.length >= MAX_TT_VARS) return;
    const used = new Set(vars.map((v) => v.trim()).filter(Boolean));
    const nextVar = generateDefaultSignalName('input', used);
    const doubled: TruthCellValue[] = new Array<TruthCellValue>(totalRows * 2);
    for (let r = 0; r < totalRows; r++) {
      const cell = value.values[r] ?? 0;
      doubled[r * 2] = cell;
      doubled[r * 2 + 1] = cell;
    }
    onChange({
      ...value,
      variables: [...vars, nextVar],
      values: doubled,
    });
  };

  const handleRemoveVar = () => {
    if (vars.length <= 1) return;
    const halved: TruthCellValue[] = [];
    for (let r = 0; r < totalRows; r += 2) {
      halved.push(value.values[r] ?? 0);
    }
    onChange({
      ...value,
      variables: vars.slice(0, -1),
      values: halved,
    });
  };

  const handleCycleCell = (rowIdx: number) => {
    const nextVals = [...value.values];
    while (nextVals.length < totalRows) nextVals.push(0);
    const curr = nextVals[rowIdx] ?? 0;
    if (allowDontCare) {
      nextVals[rowIdx] = curr === 0 ? 1 : curr === 1 ? 'X' : 0;
    } else {
      nextVals[rowIdx] = curr === 1 ? 0 : 1;
    }
    onChange({ ...value, values: nextVals });
  };

  const handleFillAll = (val: 0 | 1) => {
    onChange({ ...value, values: new Array<TruthCellValue>(totalRows).fill(val) });
  };

  const handleInvert = () => {
    const nextVals: TruthCellValue[] = Array.from({ length: totalRows }, (_, i) => {
      const v = value.values[i] ?? 0;
      return v === 'X' ? 'X' : v === 1 ? 0 : 1;
    });
    onChange({ ...value, values: nextVals });
  };

  const handleApplyPaste = () => {
    const parsed = parseTruthTableVector(pasteText, totalRows);
    if ('error' in parsed) {
      setPasteError(parsed.error);
      return;
    }
    setPasteError(null);
    if (parsed.values.includes('X')) setAllowDontCare(true);
    onChange({ ...value, values: parsed.values });
    setPasteText('');
  };

  const handleImportFromOther = () => {
    if (!otherExpression?.trim()) return;
    try {
      const parsed = parseBoolean(otherExpression);
      const importVars =
        parsed.variables.length >= 1 && parsed.variables.length <= MAX_TT_VARS
          ? [...parsed.variables]
          : vars;
      const rows = 1 << importVars.length;
      const nextVals: TruthCellValue[] = new Array<TruthCellValue>(rows);
      for (let r = 0; r < rows; r++) {
        const env: Record<string, 0 | 1> = {};
        for (let b = 0; b < importVars.length; b++) {
          env[importVars[b]] = ((r >> (importVars.length - 1 - b)) & 1) === 1 ? 1 : 0;
        }
        nextVals[r] = evaluateBool(parsed.ast, env);
      }
      onChange({
        ...value,
        variables: importVars,
        values: nextVals,
        outputName: parsed.outputName,
      });
      setPasteError(null);
    } catch {
      // Ignore invalid expression on other side
    }
  };

  const canImportOther = Boolean(otherExpression?.trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: 0 }}>
      <div className={cStyles.ttControls}>
        <div className={cStyles.ttVarChips}>
          <span className={styles.metaInline}>{t('boolean.compare.tt.varsLabel')}:</span>
          {vars.map((v, idx) => (
            <input
              key={idx}
              type="text"
              value={v}
              onChange={(e) => handleRenameVar(idx, e.target.value)}
              className={[
                cStyles.ttVarInput,
                varErrors[idx] ? cStyles.ttVarInputInvalid : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${t('boolean.ttInput.inputNameAria', { index: idx + 1 })} (${sideId})`}
              autoComplete="off"
              spellCheck={false}
              data-testid={`compare-tt-${sideId}-var-${idx}`}
            />
          ))}
          <button
            type="button"
            className={[styles.btnGhost, styles.btnSmall].join(' ')}
            onClick={handleRemoveVar}
            disabled={vars.length <= 1}
            aria-label={t('boolean.compare.tt.removeVar')}
            title={t('boolean.compare.tt.removeVar')}
            data-testid={`compare-tt-${sideId}-remove-var`}
          >
            −
          </button>
          <button
            type="button"
            className={[styles.btnGhost, styles.btnSmall].join(' ')}
            onClick={handleAddVar}
            disabled={vars.length >= MAX_TT_VARS}
            aria-label={t('boolean.compare.tt.addVar')}
            title={t('boolean.compare.tt.addVar')}
            data-testid={`compare-tt-${sideId}-add-var`}
          >
            +
          </button>
        </div>

        <label className={cStyles.checkboxLabel}>
          <input
            type="checkbox"
            checked={allowDontCare}
            onChange={(e) => setAllowDontCare(e.target.checked)}
            data-testid={`compare-tt-${sideId}-allow-dc`}
          />
          <span>{t('boolean.compare.tt.allowDontCare')}</span>
        </label>
      </div>

      <div className={styles.btnRow}>
        <button
          type="button"
          className={[styles.btnGhost, styles.btnSmall].join(' ')}
          onClick={() => handleFillAll(0)}
        >
          {t('boolean.compare.tt.fill0')}
        </button>
        <button
          type="button"
          className={[styles.btnGhost, styles.btnSmall].join(' ')}
          onClick={() => handleFillAll(1)}
        >
          {t('boolean.compare.tt.fill1')}
        </button>
        <button
          type="button"
          className={[styles.btnGhost, styles.btnSmall].join(' ')}
          onClick={handleInvert}
        >
          {t('boolean.compare.tt.invert')}
        </button>
        {canImportOther && (
          <button
            type="button"
            className={[styles.btn, styles.btnSmall].join(' ')}
            onClick={handleImportFromOther}
            data-testid={`compare-tt-${sideId}-import`}
          >
            {t('boolean.compare.tt.importFromOther')}
          </button>
        )}
      </div>

      <div className={cStyles.ttPasteRow}>
        <input
          type="text"
          value={pasteText}
          onChange={(e) => {
            setPasteText(e.target.value);
            if (pasteError) setPasteError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleApplyPaste();
            }
          }}
          placeholder={t('boolean.compare.tt.pastePlaceholder')}
          className={cStyles.ttPasteInput}
          aria-label={t('boolean.compare.tt.pastePlaceholder')}
          data-testid={`compare-tt-${sideId}-paste`}
        />
        <button
          type="button"
          className={[styles.btn, styles.btnSmall].join(' ')}
          onClick={handleApplyPaste}
          disabled={!pasteText.trim()}
          data-testid={`compare-tt-${sideId}-paste-apply`}
        >
          {t('boolean.compare.tt.pasteApply')}
        </button>
      </div>
      {pasteError && (
        <span className={styles.previewErr} role="alert">
          {pasteError}
        </span>
      )}

      <div className={cStyles.ttScrollBox}>
        <table className={dStyles.truthTable} data-testid={`compare-tt-${sideId}-table`}>
          <thead>
            <tr>
              <th className={dStyles.rowIdx}>#</th>
              {vars.map((v, idx) => (
                <th key={idx}>{v || `V${idx + 1}`}</th>
              ))}
              <th className={[dStyles.colSep, dStyles.thOutput].join(' ')}>
                {value.outputName || t('boolean.compare.tt.outLabel')}
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: totalRows }, (_, rowIdx) => {
              const cell = value.values[rowIdx] ?? 0;
              return (
                <tr key={rowIdx}>
                  <td className={dStyles.rowIdx}>{rowIdx}</td>
                  {vars.map((_, bIdx) => {
                    const bit = (rowIdx >> (n - 1 - bIdx)) & 1;
                    return (
                      <td key={bIdx} className={bit === 1 ? dStyles.valOne : dStyles.valZero}>
                        {bit}
                      </td>
                    );
                  })}
                  <td className={dStyles.colSep} style={{ padding: '0.18rem 0.35rem' }}>
                    <button
                      type="button"
                      className={[
                        cStyles.ttCellBtn,
                        cell === 1
                          ? cStyles.ttCellOne
                          : cell === 'X'
                            ? cStyles.ttCellDC
                            : cStyles.ttCellZero,
                      ].join(' ')}
                      onClick={() => handleCycleCell(rowIdx)}
                      aria-label={t('boolean.compare.tt.cellAria', { row: rowIdx, val: String(cell) })}
                      data-testid={`compare-tt-${sideId}-cell-${rowIdx}`}
                    >
                      {cell}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <span className={styles.metaInline}>{t('boolean.compare.tt.cycleHint')}</span>
    </div>
  );
}
