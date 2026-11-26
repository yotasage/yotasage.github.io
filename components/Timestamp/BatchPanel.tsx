import React from 'react';

import { parseBatchInput, serializeBatchRows } from '../../lib/timestamp/math';
import { getParseErrorCode } from '../../lib/timestamp/types';
import type { EpochUnit } from '../../lib/timestamp/types';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Timestamp.module.css';

interface BatchPanelProps {
  selectedZone: string;
  onOpenInConverter: (epochNs: bigint) => void;
}

const SAMPLE_BATCH = [
  '1700000000',
  '1700000000123',
  '2026-11-26T19:39:25Z',
  '0x7fffffff',
  '018bd064-dc00-7000-8000-000000000000',
  '6553f100aabbccddeeff0011',
].join('\n');

const UNITS: readonly EpochUnit[] = ['auto', 's', 'ms', 'us', 'ns'];

export default function BatchPanel({ selectedZone, onOpenInConverter }: BatchPanelProps) {
  const { t } = useI18n();
  const [rawText, setRawText] = React.useState(SAMPLE_BATCH);
  const [unitOverride, setUnitOverride] = React.useState<EpochUnit>('auto');
  const [copiedMode, setCopiedMode] = React.useState<'tsv' | 'csv' | null>(null);

  const rows = React.useMemo(
    () => parseBatchInput(rawText, unitOverride, selectedZone),
    [rawText, unitOverride, selectedZone],
  );

  const okCount = rows.filter((r) => r.result.ok).length;
  const errCount = rows.length - okCount;

  const handleCopy = async (mode: 'tsv' | 'csv') => {
    const content = serializeBatchRows(rows, mode === 'csv' ? ',' : '\t', selectedZone);
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMode(mode);
      window.setTimeout(() => setCopiedMode((p) => (p === mode ? null : p)), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleDownloadCsv = () => {
    const content = serializeBatchRows(rows, ',', selectedZone);
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timestamps.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <section className={styles.card} aria-labelledby="ts-batch-heading">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="ts-batch-heading" className={styles.cardTitle}>
            {t('ts.batch.title')}
          </h2>
          <p className={styles.cardSub}>{t('ts.batch.sub')}</p>
        </div>

        <div className={styles.segmented} role="group" aria-label={t('ts.input.unitAria')}>
          {UNITS.map((u) => {
            const active = unitOverride === u;
            return (
              <button
                key={u}
                type="button"
                className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                aria-pressed={active}
                onClick={() => setUnitOverride(u)}
              >
                {t(`ts.input.unit.${u}` as TranslationKey)}
              </button>
            );
          })}
        </div>
      </div>

      <label htmlFor="ts-batch-textarea" className={styles.fieldLabel}>
        {t('ts.batch.inputLabel')}
      </label>
      <textarea
        id="ts-batch-textarea"
        className={styles.batchTextarea}
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder={t('ts.batch.placeholder')}
        spellCheck={false}
      />

      <div className={styles.batchToolbar}>
        <span className={styles.batchSummary} data-testid="batch-summary">
          {t('ts.batch.summary', { ok: okCount, err: errCount, total: rows.length })}
        </span>

        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => setRawText(SAMPLE_BATCH)}
          >
            {t('ts.batch.loadSample')}
          </button>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => setRawText('')}
            disabled={rawText.length === 0}
          >
            {t('ts.batch.clear')}
          </button>
          <button
            type="button"
            className={[styles.copyBtn, copiedMode === 'tsv' ? styles.copyBtnCopied : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleCopy('tsv')}
            disabled={rows.length === 0}
          >
            {copiedMode === 'tsv' ? t('ts.formats.copied') : t('ts.batch.copyTsv')}
          </button>
          <button
            type="button"
            className={[styles.copyBtn, copiedMode === 'csv' ? styles.copyBtnCopied : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleCopy('csv')}
            disabled={rows.length === 0}
          >
            {copiedMode === 'csv' ? t('ts.formats.copied') : t('ts.batch.copyCsv')}
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleDownloadCsv}
            disabled={rows.length === 0}
          >
            {t('ts.batch.downloadCsv')}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.emptyState}>{t('ts.batch.emptyState')}</div>
      ) : (
        <div className={`${styles.tableWrap} ${styles.tableSpacer}`}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>{t('ts.batch.colLine')}</th>
                <th>{t('ts.batch.colInput')}</th>
                <th>{t('ts.batch.colDetected')}</th>
                <th>{t('ts.batch.colUtc')}</th>
                {selectedZone !== 'UTC' && (
                  <th>{t('ts.batch.colZoned', { tz: selectedZone })}</th>
                )}
                <th>{t('ts.batch.colUnixS')}</th>
                <th>{t('ts.batch.colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.lineNumber}-${row.raw}`}>
                  <td className={styles.monoCell}>{row.lineNumber}</td>
                  <td className={styles.monoCell}>{row.raw}</td>
                  {row.result.ok ? (
                    <>
                      <td>{t(`ts.kind.${row.result.detectedKind}` as TranslationKey)}</td>
                      <td className={styles.monoCell}>{row.isoUtc}</td>
                      {selectedZone !== 'UTC' && (
                        <td className={styles.monoCell}>{row.isoZoned}</td>
                      )}
                      <td className={styles.monoCell}>{row.seconds}</td>
                      <td>
                        <button
                          type="button"
                          className={styles.buttonSmall}
                          onClick={() => {
                            if (row.result.ok) onOpenInConverter(row.result.epochNs);
                          }}
                        >
                          {t('ts.batch.openRow')}
                        </button>
                      </td>
                    </>
                  ) : (
                    <td
                      colSpan={selectedZone !== 'UTC' ? 5 : 4}
                      className={styles.errorCell}
                    >
                      {t(`ts.error.${getParseErrorCode(row.result) ?? 'unrecognized'}` as TranslationKey)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
