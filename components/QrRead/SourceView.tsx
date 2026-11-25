// One thing that was read (an image, a PDF page, a camera frame or typed text): its picture with the codes found
// outlined and numbered, and a card for each code.

import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/QrRead.module.css';
import ResultCard, { Reading } from './ResultCard';

export interface Source {
  id: number;
  name: string;
  kind: 'image' | 'pdf' | 'camera' | 'text' | 'example';
  status: 'reading' | 'done' | 'error';
  error?: string;
  previewUrl?: string;
  width?: number;
  height?: number;
  readings: Reading[];
}

export const cardId = (source: number, i: number) => `code-${source}-${i}`;

export default function SourceView({ source, onRemove }: { source: Source; onRemove: () => void }) {
  const { t } = useI18n();
  const [highlight, setHighlight] = React.useState(-1);
  const goTo = (i: number) => {
    document.getElementById(cardId(source.id, i))?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setHighlight(i);
    setTimeout(() => setHighlight(-1), 1200);
  };
  const valid = source.readings.filter((r) => !r.detection || r.detection.valid).length;
  const found = source.readings.length;
  const w = source.width ?? 1;
  const label = Math.max(14, w / 30);

  return (
    <section className={styles.source} aria-label={source.name} data-status={source.status}>
      <header className={styles.sourceHead}>
        <h3>{source.name}</h3>
        <span className={styles.muted}>
          {source.status === 'reading' ? t('qrread.source.reading')
            : source.status === 'error' ? ''
            : source.kind === 'text' ? ''
            : found === 0 ? t('qrread.source.noneFound')
            : `${valid === 1 ? t('qrread.source.readOne') : t('qrread.source.readMany', { n: valid })}${found > valid ? t('qrread.source.unreadableSuffix', { n: found - valid }) : ''}`}
        </span>
        <button type="button" className={styles.linkButton} onClick={onRemove} aria-label={t('qrread.source.removeAria', { name: source.name })}>{t('qrread.source.remove')}</button>
      </header>
      {source.error && <p className={styles.bad} role="alert">{source.error}</p>}
      {source.previewUrl && source.width && (
        <div className={styles.preview}>
          <img src={source.previewUrl} alt={source.name} />
          <svg viewBox={`0 0 ${source.width} ${source.height}`} preserveAspectRatio="none">
            {source.readings.map((r, i) => r.detection && (
              <g key={i} className={styles.mark} onClick={() => goTo(i)}>
                <polygon
                  points={r.detection.corners.map(([x, y]) => `${x},${y}`).join(' ')}
                  className={r.detection.valid ? styles.outlineGood : styles.outlineBad}
                  style={{ strokeWidth: Math.max(2, w / 300) }}
                />
                <circle cx={r.detection.corners[0][0]} cy={r.detection.corners[0][1]} r={label * 0.8} className={styles.markDot} />
                <text x={r.detection.corners[0][0]} y={r.detection.corners[0][1]} fontSize={label} className={styles.markText}>{i + 1}</text>
              </g>
            ))}
          </svg>
        </div>
      )}
      {source.status === 'done' && found === 0 && source.kind !== 'text' && (
        <p className={styles.muted}>
          {t('qrread.source.noneHint')}{' '}
          {source.kind !== 'camera' && t('qrread.source.noneOtherHint')}
        </p>
      )}
      <div className={styles.results}>
        {source.readings.map((r, i) => (
          <ResultCard key={i} reading={r} label={source.kind === 'text' ? t('qrread.src.text') : String(i + 1)} id={cardId(source.id, i)} highlighted={highlight === i} />
        ))}
      </div>
    </section>
  );
}
