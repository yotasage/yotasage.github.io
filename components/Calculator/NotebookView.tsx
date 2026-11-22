import { useMemo, useState } from 'react';

import { evaluateNotebook } from '../../lib/calc/eval';
import { DEFAULT_NOTEBOOK_TEXT } from '../../lib/calc/storage';
import type { CalcValue } from '../../lib/calc/value';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Calculator.module.css';

export interface NotebookViewProps {
  text: string;
  onChange: (next: string) => void;
  sharedVars: Readonly<Record<string, CalcValue>>;
  onClear: () => void;
}

const SAMPLE_PHASOR = `# Complex Impedance & RF Power
R_s = 50 Ohm
X_L = j * 2 * pi * 10 MHz * 470 nH
Z_load = R_s + X_L
Z_par = Z_load || 100 Ohm

# dBm to Watts and Back
P_tx = 30 dBm in W
P_rx = 50 mW in dBm`;

const SAMPLE_CALCULUS = `# Symbolic Derivatives & Integrals
diff(x^3 + 2*sin(x), x)
d/dx(exp(-2*x) * cos(3*x))
int(3*x^2 + 1/x, x)

# Definite Integrals (FTC + Gauss-Kronrod)
int(sin(x), x, 0, pi)
int(exp(-x^2), x, 0, 1)`;

export default function NotebookView({
  text,
  onChange,
  sharedVars,
  onClear,
}: NotebookViewProps) {
  const { t } = useI18n();
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const [copiedSheet, setCopiedSheet] = useState(false);

  const evaluation = useMemo(() => evaluateNotebook(text, sharedVars), [text, sharedVars]);

  const handleCopyLine = async (lineNumber: number, valueText: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(valueText);
        setCopiedLine(lineNumber);
        window.setTimeout(() => setCopiedLine((cur) => (cur === lineNumber ? null : cur)), 1300);
      } catch {
        // ignore clipboard failure
      }
    }
  };

  const handleCopyTsv = async () => {
    const rows = evaluation.lines
      .filter((line) => line.kind !== 'empty')
      .map((line) => {
        const res =
          line.result?.text ??
          (line.kind === 'error' ? `ERROR: ${line.error ?? ''}` : '');
        const base = line.result?.kind === 'value' ? line.result.baseSI : '';
        return `${line.lineNumber}\t${line.raw}\t${res}\t${base}`;
      });
    const payload = ['Line\tExpression\tResult\tBase SI', ...rows].join('\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(payload);
        setCopiedSheet(true);
        window.setTimeout(() => setCopiedSheet(false), 1600);
      } catch {
        // ignore
      }
    }
  };

  return (
    <section className={styles.card} aria-labelledby="calc-notebook-heading">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="calc-notebook-heading" className={styles.cardTitle}>
            {t('calc.notebook.title')}
          </h2>
          <p className={styles.cardSubtitle}>{t('calc.notebook.subtitle')}</p>
        </div>

        <div className={styles.btnRow}>
          <span className={styles.chipsLabel}>{t('calc.notebook.samples')}</span>
          <button
            type="button"
            className={`${styles.btnGhost} ${styles.btnSmall}`}
            onClick={() => onChange(DEFAULT_NOTEBOOK_TEXT)}
          >
            {t('calc.notebook.sampleRc')}
          </button>
          <button
            type="button"
            className={`${styles.btnGhost} ${styles.btnSmall}`}
            onClick={() => onChange(SAMPLE_PHASOR)}
          >
            {t('calc.notebook.samplePhasor')}
          </button>
          <button
            type="button"
            className={`${styles.btnGhost} ${styles.btnSmall}`}
            onClick={() => onChange(SAMPLE_CALCULUS)}
          >
            {t('calc.notebook.sampleCalc')}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSmall}`}
            onClick={() => { void handleCopyTsv(); }}
          >
            {copiedSheet ? t('calc.vars.copiedExcel') : t('calc.notebook.copyTsv')}
          </button>
          <button
            type="button"
            className={`${styles.btnDanger} ${styles.btnSmall}`}
            onClick={onClear}
          >
            {t('calc.notebook.clear')}
          </button>
        </div>
      </div>

      <div className={styles.notebookSplit}>
        <textarea
          className={styles.notebookTextarea}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t('calc.notebook.aria')}
          rows={Math.max(12, evaluation.lines.length + 2)}
          spellCheck={false}
        />

        <div className={styles.notebookGutter} aria-live="polite">
          {evaluation.lines.map((line) => (
            <div key={line.lineNumber} className={styles.notebookRow}>
              <span className={styles.notebookLineNum}>{line.lineNumber}</span>
              {line.kind === 'comment' && (
                <span className={styles.notebookComment}>#</span>
              )}
              {(line.kind === 'value' || line.kind === 'symbolic') && line.result && (
                <button
                  type="button"
                  className={styles.notebookValBtn}
                  title={t('calc.notebook.clickToCopy')}
                  onClick={() => { void handleCopyLine(line.lineNumber, line.result!.text); }}
                >
                  {copiedLine === line.lineNumber ? t('calc.result.copied') : `= ${line.result.text}`}
                </button>
              )}
              {line.kind === 'error' && (
                <span className={styles.notebookErr} title={line.error}>
                  {line.error}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
