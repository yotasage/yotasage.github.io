import { useEffect, useMemo, useState } from 'react';

import type { EvalResult } from '../../lib/calc/eval';
import type { UnitSpec } from '../../lib/calc/units';
import { formatValueLatex, formatValueText, vConvert } from '../../lib/calc/value';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Calculator.module.css';
import SafeKatex from './SafeKatex';

export interface ResultDisplayProps {
  result: EvalResult | null;
  error?: string | null;
  emptyPrompt?: string;
  showInputLatex?: boolean;
  extraBadge?: string | null;
  extraBadgeTone?: 'accent' | 'good';
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea');
    ta.value = text;
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

export default function ResultDisplay({
  result,
  error,
  emptyPrompt,
  showInputLatex = true,
  extraBadge,
  extraBadgeTone = 'accent',
}: ResultDisplayProps) {
  const { t } = useI18n();
  const [selectedUnit, setSelectedUnit] = useState<UnitSpec | null>(null);
  const [copiedKind, setCopiedKind] = useState<'text' | 'latex' | null>(null);

  useEffect(() => {
    setSelectedUnit(null);
  }, [result]);

  useEffect(() => {
    if (!copiedKind) return;
    const timer = window.setTimeout(() => setCopiedKind(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copiedKind]);

  const displayed = useMemo(() => {
    if (!result) return null;
    if (result.kind === 'symbolic') {
      return {
        text: result.text,
        latex: result.latex,
        baseSI: '',
      };
    }
    if (!selectedUnit) {
      return {
        text: result.text,
        latex: result.latex,
        baseSI: result.baseSI,
      };
    }
    try {
      const converted = vConvert(result.value, selectedUnit);
      return {
        text: formatValueText(converted),
        latex: formatValueLatex(converted),
        baseSI: result.baseSI,
      };
    } catch {
      return {
        text: result.text,
        latex: result.latex,
        baseSI: result.baseSI,
      };
    }
  }, [result, selectedUnit]);

  if (error) {
    return (
      <div className={`${styles.resultCard} ${styles.resultCardError}`} role="status" aria-live="polite">
        <p className={styles.errorText}>{error}</p>
      </div>
    );
  }

  if (!result || !displayed) {
    return (
      <div className={styles.resultCard} aria-live="polite">
        <p className={styles.emptyPrompt}>{emptyPrompt ?? t('calc.result.emptyPrompt')}</p>
      </div>
    );
  }

  const handleCopy = async (kind: 'text' | 'latex') => {
    const payload = kind === 'latex' ? displayed.latex : displayed.text;
    const ok = await copyText(payload);
    if (ok) setCopiedKind(kind);
  };

  const showBaseSi =
    result.kind === 'value' &&
    Boolean(displayed.baseSI) &&
    displayed.baseSI !== displayed.text;

  const conversions = result.kind === 'value' ? result.conversions : [];
  const hints = result.kind === 'value' ? result.hints : [];

  return (
    <div className={styles.resultCard} aria-live="polite">
      <div className={styles.resultTop}>
        <div className={styles.resultValueWrap}>
          <div className={styles.resultPrimary} data-testid="calc-result-primary">
            {displayed.text}
          </div>
          <div className={styles.resultMathPreview}>
            {showInputLatex && result.inputLatex && (
              <>
                <SafeKatex text={result.inputLatex} />
                <span aria-hidden="true">=</span>
              </>
            )}
            <SafeKatex text={displayed.latex} />
          </div>
        </div>

        <div className={styles.btnRow}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSmall}`}
            onClick={() => { void handleCopy('text'); }}
          >
            {copiedKind === 'text' ? t('calc.result.copied') : t('calc.result.copy')}
          </button>
          <button
            type="button"
            className={`${styles.btnGhost} ${styles.btnSmall}`}
            onClick={() => { void handleCopy('latex'); }}
          >
            {copiedKind === 'latex' ? t('calc.result.copied') : t('calc.result.copyLatex')}
          </button>
        </div>
      </div>

      <div className={styles.resultMetaRow}>
        {result.kind === 'symbolic' && (
          <span className={styles.badge}>{t('calc.result.symbolic')}</span>
        )}
        {result.kind === 'value' && result.methodNote && (
          <span className={styles.badge}>{result.methodNote}</span>
        )}
        {extraBadge && (
          <span className={`${styles.badge} ${extraBadgeTone === 'good' ? styles.badgeGood : ''}`}>
            {extraBadge}
          </span>
        )}
        {result.assignedName && (
          <span className={`${styles.badge} ${styles.badgeGood}`}>
            {t('calc.result.assigned')} {result.assignedName}
          </span>
        )}
        {showBaseSi && (
          <span>
            {t('calc.result.baseSi')}: <code>{displayed.baseSI}</code>
          </span>
        )}
      </div>

      {conversions.length > 0 && (
        <div className={styles.chipsRow} role="group" aria-label={t('calc.result.convertTo')}>
          <span className={styles.chipsLabel}>{t('calc.result.convertTo')}</span>
          <button
            type="button"
            className={`${styles.unitChip} ${selectedUnit === null ? styles.unitChipActive : ''}`}
            aria-pressed={selectedUnit === null}
            onClick={() => setSelectedUnit(null)}
          >
            {t('calc.result.auto')}
          </button>
          {conversions.map((unit) => {
            const active = selectedUnit?.symbol === unit.symbol;
            return (
              <button
                key={unit.symbol}
                type="button"
                className={`${styles.unitChip} ${active ? styles.unitChipActive : ''}`}
                aria-pressed={active}
                onClick={() => setSelectedUnit(active ? null : unit)}
              >
                {unit.symbol}
              </button>
            );
          })}
        </div>
      )}

      {hints.length > 0 && (
        <div className={styles.hintsRow}>
          {hints.map((hint) => (
            <div key={hint.label} className={styles.hintItem}>
              <span className={styles.hintLabel}>{hint.label}</span>
              <span className={styles.hintVal}>{hint.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
