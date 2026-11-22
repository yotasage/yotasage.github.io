import React, { useEffect, useState } from 'react';

import type { StoredVariable } from '../../lib/calc/storage';
import type { CalcValue } from '../../lib/calc/value';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Calculator.module.css';

export interface EvaluatedVariableInfo {
  value?: CalcValue;
  numericPart: string;
  unitPart: string;
  displayText: string;
  baseSI: string;
  error?: string;
}

export interface VariablesPanelProps {
  variables: readonly StoredVariable[];
  evaluated: Readonly<Record<string, EvaluatedVariableInfo>>;
  onAdd: (name: string, expr: string) => void;
  onUpdateExpr: (name: string, expr: string) => void;
  onDelete: (name: string) => void;
  onClear: () => void;
  onInsertName: (name: string) => void;
}

async function copyTsv(tsv: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea');
    ta.value = tsv;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
  return false;
}

const VALID_VAR_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export default function VariablesPanel({
  variables,
  evaluated,
  onAdd,
  onUpdateExpr,
  onDelete,
  onClear,
  onInsertName,
}: VariablesPanelProps) {
  const { t } = useI18n();
  const [newName, setNewName] = useState('');
  const [newExpr, setNewExpr] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [copiedExcel, setCopiedExcel] = useState(false);

  useEffect(() => {
    if (!copiedExcel) return;
    const timer = window.setTimeout(() => setCopiedExcel(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copiedExcel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    const cleanExpr = newExpr.trim();
    if (!VALID_VAR_RE.test(cleanName)) {
      setAddError('Use letters, digits, and _ (start with a letter).');
      return;
    }
    if (!cleanExpr) {
      setAddError('Enter a value or expression.');
      return;
    }
    setAddError(null);
    onAdd(cleanName, cleanExpr);
    setNewName('');
    setNewExpr('');
  };

  const handleCopyExcel = async () => {
    const header = [
      t('calc.vars.colName'),
      t('calc.vars.colExpr'),
      t('calc.vars.colValue'),
      t('calc.vars.colUnit'),
      t('calc.vars.colBaseSi'),
    ].join('\t');

    const rows = variables.map((v) => {
      const info = evaluated[v.name];
      if (!info || info.error) {
        return [v.name, v.expr, info?.error ?? '', '', ''].join('\t');
      }
      return [v.name, v.expr, info.numericPart, info.unitPart, info.baseSI].join('\t');
    });

    const ok = await copyTsv([header, ...rows].join('\n'));
    if (ok) setCopiedExcel(true);
  };

  return (
    <section className={styles.card} aria-labelledby="calc-vars-heading">
      <div className={styles.cardHeader}>
        <h2 id="calc-vars-heading" className={styles.cardTitle}>
          {t('calc.vars.title')}
        </h2>
        <div className={styles.btnRow}>
          {variables.length > 0 && (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSmall}`}
                onClick={() => { void handleCopyExcel(); }}
              >
                {copiedExcel ? t('calc.vars.copiedExcel') : t('calc.vars.copyExcel')}
              </button>
              <button
                type="button"
                className={`${styles.btnDanger} ${styles.btnSmall}`}
                onClick={onClear}
              >
                {t('calc.vars.clear')}
              </button>
            </>
          )}
        </div>
      </div>

      {variables.length === 0 ? (
        <p className={styles.emptyPrompt}>{t('calc.vars.empty')}</p>
      ) : (
        <div className={styles.varTableWrap}>
          <table className={styles.varTable}>
            <thead>
              <tr>
                <th>{t('calc.vars.colName')}</th>
                <th>{t('calc.vars.colExpr')}</th>
                <th>{t('calc.vars.colValue')}</th>
                <th>{t('calc.vars.colUnit')}</th>
                <th>{t('calc.vars.colBaseSi')}</th>
                <th aria-label={t('calc.vars.delete')} />
              </tr>
            </thead>
            <tbody>
              {variables.map((v) => {
                const info = evaluated[v.name];
                return (
                  <tr key={v.name}>
                    <td>
                      <button
                        type="button"
                        className={styles.varNameBtn}
                        title={t('calc.vars.insert')}
                        onClick={() => onInsertName(v.name)}
                      >
                        {v.name}
                      </button>
                    </td>
                    <td>
                      <input
                        type="text"
                        className={styles.varInlineInput}
                        value={v.expr}
                        aria-label={`${v.name} ${t('calc.vars.colExpr')}`}
                        onChange={(e) => onUpdateExpr(v.name, e.target.value)}
                      />
                    </td>
                    {info?.error ? (
                      <td colSpan={3} className={styles.varErrCell}>
                        {info.error}
                      </td>
                    ) : (
                      <>
                        <td className={styles.varValCell}>{info?.numericPart ?? '—'}</td>
                        <td className={styles.varValCell}>{info?.unitPart || '—'}</td>
                        <td>
                          <code>{info?.baseSI ?? '—'}</code>
                        </td>
                      </>
                    )}
                    <td>
                      <button
                        type="button"
                        className={`${styles.btnGhost} ${styles.btnSmall}`}
                        aria-label={`${t('calc.vars.delete')} ${v.name}`}
                        title={t('calc.vars.delete')}
                        onClick={() => onDelete(v.name)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form className={styles.varAddForm} onSubmit={handleSubmit}>
        <input
          type="text"
          className={styles.varInput}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={t('calc.vars.namePlaceholder')}
          aria-label={t('calc.vars.colName')}
          autoComplete="off"
          spellCheck={false}
        />
        <input
          type="text"
          className={styles.varInput}
          value={newExpr}
          onChange={(e) => setNewExpr(e.target.value)}
          placeholder={t('calc.vars.exprPlaceholder')}
          aria-label={t('calc.vars.colExpr')}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className={`${styles.btnPrimary} ${styles.btnSmall}`}>
          {t('calc.vars.add')}
        </button>
      </form>
      {addError && <p className={styles.errorText}>{addError}</p>}
    </section>
  );
}
