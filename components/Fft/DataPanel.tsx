// Data loading (drop, file picker, paste, built-in presets) and Signal Builder panel.
import React, { useRef, useState } from 'react';
import { useI18n } from '../../lib/ui/i18n';
import type { ParsedDataset, SignalDef, SignalKind, SignalUnit } from '../../lib/fft/types';
import { BUILTIN_PRESETS, type BuiltinPresetId } from '../../lib/fft/data/presets';
import styles from '../../styles/Fft.module.css';

export interface DataPanelProps {
  datasets: ParsedDataset[];
  activeId: string;
  compareIds: string[];
  signal: SignalDef;
  activePresetId: BuiltinPresetId | null;
  parseError: string | null;
  onSelectDataset: (id: string) => void;
  onRemoveDataset: (id: string) => void;
  onToggleCompare: (id: string) => void;
  onUploadFiles: (files: FileList | File[]) => void;
  onPasteText: (text: string) => void;
  onLoadPreset: (id: BuiltinPresetId) => void;
  onChangeSignal: (next: SignalDef) => void;
}

export default function DataPanel({
  datasets,
  activeId,
  compareIds,
  signal,
  activePresetId,
  parseError,
  onSelectDataset,
  onRemoveDataset,
  onToggleCompare,
  onUploadFiles,
  onPasteText,
  onLoadPreset,
  onChangeSignal,
}: DataPanelProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const activeDs = datasets.find((d) => d.id === activeId) ?? datasets[0];
  const numericCols = activeDs ? activeDs.columns.filter((c) => c.kind !== 'text') : [];

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  const handleKindChange = (kind: SignalKind) => {
    let colB = signal.colB;
    if (kind !== 'single' && colB === null && numericCols.length >= 2) {
      const other = numericCols.find((c) => c.index !== signal.colA && c.index !== signal.timeCol);
      colB = other ? other.index : numericCols[numericCols.length - 1].index;
    }
    onChangeSignal({ ...signal, kind, colB });
  };

  return (
    <section className={styles.card} aria-label={t('fft.data.title')}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('fft.data.title')}</h2>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnSmall}`}
          onClick={() => setPasteOpen((v) => !v)}
        >
          {t('fft.data.pasteBtn')}
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {t('fft.data.dropHint')}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".csv,.tsv,.txt,.dat,.npy,.wav,.raw"
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onUploadFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {pasteOpen && (
        <div style={{ marginTop: 8 }}>
          <textarea
            className={styles.textarea}
            placeholder={t('fft.data.pastePlaceholder')}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            aria-label={t('fft.data.pastePlaceholder')}
          />
          <div className={styles.rowActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}
              onClick={() => {
                if (pasteText.trim()) {
                  onPasteText(pasteText);
                  setPasteText('');
                  setPasteOpen(false);
                }
              }}
            >
              {t('fft.data.pasteLoad')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              onClick={() => setPasteOpen(false)}
            >
              {t('fft.data.pasteCancel')}
            </button>
          </div>
        </div>
      )}

      {parseError && <div className={styles.errorBanner}>{parseError}</div>}

      <div style={{ marginTop: 10 }}>
        <div className={styles.label}>{t('fft.data.presetsLabel')}</div>
        <div className={styles.presetGrid}>
          {BUILTIN_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.summary}
              className={`${styles.presetBtn} ${activePresetId === p.id ? styles.presetBtnActive : ''}`}
              onClick={() => onLoadPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {datasets.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className={styles.label}>{t('fft.data.loadedFiles')}</div>
          <div className={styles.datasetList}>
            {datasets.map((ds) => {
              const isActive = ds.id === activeId;
              const inCmp = compareIds.includes(ds.id);
              return (
                <div
                  key={ds.id}
                  className={`${styles.datasetRow} ${isActive ? styles.datasetRowActive : ''}`}
                >
                  <button
                    type="button"
                    className={styles.datasetNameBtn}
                    title={ds.name}
                    onClick={() => onSelectDataset(ds.id)}
                  >
                    {ds.name}
                  </button>
                  <span className={styles.datasetMeta}>{ds.rows.toLocaleString()}</span>
                  <label className={styles.checkLabel} title={t('fft.data.addCompare')}>
                    <input
                      type="checkbox"
                      checked={inCmp}
                      onChange={() => onToggleCompare(ds.id)}
                    />
                  </label>
                  {datasets.length > 1 && (
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnSmall}`}
                      onClick={() => onRemoveDataset(ds.id)}
                      aria-label={`${t('fft.data.removeFile')} ${ds.name}`}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeDs && (
        <div className={styles.detailsBox}>
          <div className={styles.formGrid}>
            <div className={`${styles.formRow} ${styles.formRowFull}`}>
              <label className={styles.label} htmlFor="fft-sig-mode">
                <span>{t('fft.data.signalMode')}</span>
                {activeDs.defaultKind === 'diff' && signal.kind === 'diff' && (
                  <span className={styles.statusGood}>{t('fft.data.autoPaired')}</span>
                )}
              </label>
              <select
                id="fft-sig-mode"
                className={styles.select}
                value={signal.kind}
                onChange={(e) => handleKindChange(e.target.value as SignalKind)}
              >
                <option value="single">{t('fft.data.modeSingle')}</option>
                <option value="diff" disabled={numericCols.length < 2}>
                  {t('fft.data.modeDiff')}
                </option>
                <option value="cm" disabled={numericCols.length < 2}>
                  {t('fft.data.modeCm')}
                </option>
              </select>
            </div>

            <div className={`${styles.formRow} ${styles.formRowFull}`}>
              <label className={styles.label} htmlFor="fft-time-col">
                {t('fft.data.timeCol')}
              </label>
              <select
                id="fft-time-col"
                className={styles.select}
                value={signal.timeCol === null ? '' : String(signal.timeCol)}
                onChange={(e) =>
                  onChangeSignal({
                    ...signal,
                    timeCol: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">{t('fft.data.noTimeCol')}</option>
                {numericCols.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-col-a">
                {t('fft.data.colA')}
              </label>
              <select
                id="fft-col-a"
                className={styles.select}
                value={signal.colA}
                onChange={(e) => onChangeSignal({ ...signal, colA: Number(e.target.value) })}
              >
                {numericCols.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {signal.kind !== 'single' ? (
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="fft-col-b">
                  {t('fft.data.colB')}
                </label>
                <select
                  id="fft-col-b"
                  className={styles.select}
                  value={signal.colB ?? ''}
                  onChange={(e) => onChangeSignal({ ...signal, colB: Number(e.target.value) })}
                >
                  {numericCols.map((c) => (
                    <option key={c.index} value={c.index}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className={styles.formRow}>
                <label className={styles.label} htmlFor="fft-unit">
                  {t('fft.data.unit')}
                </label>
                <select
                  id="fft-unit"
                  className={styles.select}
                  value={signal.unit}
                  onChange={(e) =>
                    onChangeSignal({ ...signal, unit: e.target.value as SignalUnit })
                  }
                >
                  <option value="V">V</option>
                  <option value="A">A</option>
                  <option value="code">code</option>
                  <option value="none">unitless</option>
                </select>
              </div>
            )}

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-gain">
                {t('fft.data.gain')}
              </label>
              <input
                id="fft-gain"
                type="number"
                step="any"
                className={styles.input}
                value={signal.gain}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v !== 0) onChangeSignal({ ...signal, gain: v });
                }}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-offset">
                {t('fft.data.offset')}
              </label>
              <input
                id="fft-offset"
                type="number"
                step="any"
                className={styles.input}
                value={signal.offset}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) onChangeSignal({ ...signal, offset: v });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
