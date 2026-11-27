// Diagnostics C1-C12 panel, grouped Figures of Merit table with KaTeX info popover,
// Harmonics & Top Spurs tables, results exports, shareable settings link, and saved presets.
import { useState } from 'react';
import KatexSpan from '../KatexSpan';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import type { AnalysisResult, MetricValue } from '../../lib/fft/types';
import {
  exportResultsCsv,
  exportResultsJson,
  exportResultsLatex,
  exportResultsMarkdown,
} from '../../lib/fft/export/results';
import type { SavedUserPreset } from '../../lib/fft/state/settings';
import { formatSi } from '../../lib/fft/metrics/analyze';
import styles from '../../styles/Fft.module.css';

export interface ResultsAndChecksProps {
  result: AnalysisResult;
  savedPresets: SavedUserPreset[];
  onCopySettingsLink: () => Promise<boolean>;
  onSaveUserPreset: (name: string) => void;
  onLoadUserPreset: (preset: SavedUserPreset) => void;
  onDeleteUserPreset: (id: string) => void;
}

function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function ResultsAndChecks({
  result,
  savedPresets,
  onCopySettingsLink,
  onSaveUserPreset,
  onLoadUserPreset,
  onDeleteUserPreset,
}: ResultsAndChecksProps) {
  const { t } = useI18n();
  const [infoMetric, setInfoMetric] = useState<MetricValue | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [presetName, setPresetName] = useState('');

  const safeSlug = result.datasetName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'fft';

  const handleCopyLink = async () => {
    const ok = await onCopySettingsLink();
    if (ok) {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <>
      <section className={styles.card} aria-label={t('fft.checks.title')}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{t('fft.checks.title')}</h2>
          <span className={styles.datasetMeta}>
            {result.checks.length === 0 ? 'OK' : `${result.checks.length} item(s)`}
          </span>
        </div>

        {result.checks.length === 0 ? (
          <div className={`${styles.checkItem} ${styles.checkInfo}`}>
            <span className={`${styles.checkCode} ${styles.statusGood}`}>OK</span>
            <span>{t('fft.checks.allClear')}</span>
          </div>
        ) : (
          <div className={styles.checkList}>
            {result.checks.map((chk, idx) => {
              const key = `fft.checks.${chk.id}` as TranslationKey;
              const cls =
                chk.level === 'error'
                  ? styles.checkError
                  : chk.level === 'warn'
                    ? styles.checkWarn
                    : styles.checkInfo;
              const codeCls =
                chk.level === 'error'
                  ? styles.statusBad
                  : chk.level === 'warn'
                    ? styles.statusWarn
                    : '';
              return (
                <div key={`${chk.id}-${idx}`} className={`${styles.checkItem} ${cls}`}>
                  <span className={`${styles.checkCode} ${codeCls}`}>{chk.id}</span>
                  <span>{t(key, chk.params)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.card} aria-label={t('fft.results.title')}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('fft.results.title')}</h2>
            <p className={styles.cardSub}>
              {result.datasetName} · N = {result.setup.n.toLocaleString()} · fs ={' '}
              {formatSi(result.setup.fs, 'Hz', 4)} · {result.resolvedWindow} (ENBW{' '}
              {result.windowMetrics.enbwBins.toFixed(3)} bins)
            </p>
          </div>
          <div className={styles.exportRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              onClick={handleCopyLink}
            >
              {copiedLink ? t('fft.results.linkCopied') : t('fft.results.copyLink')}
            </button>
          </div>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('fft.results.metric')}</th>
                <th style={{ textAlign: 'right' }}>{t('fft.results.value')}</th>
                <th>{t('fft.results.convention')}</th>
              </tr>
            </thead>
            <tbody>
              {result.metrics.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.label}</strong>
                    <button
                      type="button"
                      className={styles.infoBtn}
                      aria-label={`Formula and convention for ${m.label}`}
                      onClick={() => setInfoMetric(m)}
                    >
                      i
                    </button>
                  </td>
                  <td className={styles.numCell}>
                    {m.formatted} {m.unit}
                    {m.secondary && (
                      <div className={styles.datasetMeta}>{m.secondary}</div>
                    )}
                  </td>
                  <td className={styles.convCell}>{m.convention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.plotFooter}>
          <div className={styles.exportRow}>
            <span className={styles.exportLabel}>{t('fft.results.exportLabel')}</span>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              onClick={() =>
                downloadText(exportResultsCsv(result), `${safeSlug}_results.csv`, 'text/csv;charset=utf-8')
              }
            >
              CSV
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              onClick={() =>
                downloadText(exportResultsJson(result), `${safeSlug}_results.json`, 'application/json;charset=utf-8')
              }
            >
              JSON
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              onClick={() =>
                downloadText(exportResultsLatex(result), `${safeSlug}_results.tex`, 'text/x-tex;charset=utf-8')
              }
            >
              LaTeX
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              onClick={() =>
                downloadText(exportResultsMarkdown(result), `${safeSlug}_results.md`, 'text/markdown;charset=utf-8')
              }
            >
              Markdown
            </button>
          </div>

          <div className={styles.exportRow}>
            <input
              type="text"
              className={styles.input}
              style={{ width: 150, padding: '3px 7px', fontSize: '0.74rem' }}
              placeholder="Setup name…"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              onClick={() => {
                onSaveUserPreset(presetName || `${result.datasetName} setup`);
                setPresetName('');
              }}
            >
              {t('fft.results.savePreset')}
            </button>
          </div>
        </div>

        {savedPresets.length > 0 && (
          <div className={styles.detailsBox}>
            <div className={styles.label}>{t('fft.results.savedPresets')}</div>
            <div className={styles.rowActions}>
              {savedPresets.map((p) => (
                <span key={p.id} className={styles.exportRow}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSmall}`}
                    onClick={() => onLoadUserPreset(p)}
                  >
                    {p.name}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSmall}`}
                    aria-label={`Delete ${p.name}`}
                    onClick={() => onDeleteUserPreset(p.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <details className={styles.detailsBox}>
          <summary className={styles.detailsSummary}>
            {t('fft.results.harmonicsTitle')} ({result.harmonics.length})
          </summary>
          <div className={styles.tableScroll} style={{ marginTop: 8 }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Ideal freq</th>
                  <th>Folded freq</th>
                  <th>Zone</th>
                  <th style={{ textAlign: 'right' }}>Level (dBc)</th>
                  <th>Overlap</th>
                </tr>
              </thead>
              <tbody>
                {result.harmonics.map((h) => (
                  <tr key={h.order}>
                    <td className={styles.mono}>H{h.order}</td>
                    <td className={styles.mono}>{formatSi(h.idealFreqHz, 'Hz', 4)}</td>
                    <td className={styles.mono}>{formatSi(h.foldedFreqHz, 'Hz', 4)}</td>
                    <td className={styles.mono}>NZ{h.nyquistZone}</td>
                    <td className={styles.numCell}>{h.dbc.toFixed(2)} dBc</td>
                    <td className={styles.convCell}>{h.overlappedWith ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {result.topSpurs.length > 0 && (
          <details className={styles.detailsBox}>
            <summary className={styles.detailsSummary}>
              {t('fft.results.spursTitle')} ({result.topSpurs.length})
            </summary>
            <div className={styles.tableScroll} style={{ marginTop: 8 }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Frequency</th>
                    <th>Bin</th>
                    <th style={{ textAlign: 'right' }}>Level (dBc)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.topSpurs.map((s) => (
                    <tr key={`${s.bin}-${s.label}`}>
                      <td className={styles.mono}>{s.label}</td>
                      <td className={styles.mono}>{formatSi(s.freqHz, 'Hz', 4)}</td>
                      <td className={styles.mono}>{s.bin}</td>
                      <td className={styles.numCell}>{s.dbc.toFixed(2)} dBc</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      {infoMetric && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={infoMetric.label}
          onClick={() => setInfoMetric(null)}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>{infoMetric.label}</h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSmall}`}
                onClick={() => setInfoMetric(null)}
              >
                {t('fft.results.infoClose')}
              </button>
            </div>
            <p className={styles.cardSub} style={{ fontSize: '0.84rem', color: 'var(--ds-ink)' }}>
              {infoMetric.description}
            </p>
            <div className={styles.formulaBox}>
              <KatexSpan text={infoMetric.formulaTex} displayMode />
            </div>
            <div className={styles.convCell}>
              <strong>{t('fft.results.convention')}:</strong> {infoMetric.convention}
            </div>
            {infoMetric.referenceKey && (
              <div className={styles.convCell} style={{ marginTop: 4 }}>
                <strong>{t('fft.results.reference')}:</strong> {infoMetric.referenceKey}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
