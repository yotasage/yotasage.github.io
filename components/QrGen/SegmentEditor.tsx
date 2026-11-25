import React from 'react';

import { ManualSegment } from '../../lib/qr/encoder';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/QrGen.module.css';
import { Select } from '../UI/Fields';

export default function SegmentEditor({ segments, onChange, onFill }: {
  segments: ManualSegment[];
  onChange: (s: ManualSegment[]) => void;
  onFill: () => void;
}) {
  const { t } = useI18n();
  const segmentModes: [ManualSegment['mode'], string][] = [
    ['numeric', t('qrgen.seg.numeric')],
    ['alphanumeric', t('qrgen.seg.alphanumeric')],
    ['byte', t('qrgen.seg.byte')],
    ['kanji', t('qrgen.seg.kanji')],
    ['eci', t('qrgen.seg.eci')],
  ];
  const update = (i: number, patch: Partial<ManualSegment>) => onChange(segments.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className={styles.fieldWide}>
      <p className={styles.help}>{t('qrgen.seg.help')}</p>
      {segments.map((s, i) => (
        <div key={i} className={styles.segmentRow}>
          <Select value={s.mode} options={segmentModes} onChange={(mode) => update(i, { mode })} />
          <input
            className={styles.input}
            value={s.text}
            spellCheck={false}
            placeholder={s.mode === 'eci' ? '26' : t('qrgen.seg.placeholder')}
            onChange={(e) => update(i, { text: e.target.value })}
          />
          <button type="button" className={styles.buttonSmall} onClick={() => onChange(segments.filter((_, j) => j !== i))} aria-label={t('qrgen.seg.removeAria')}>
            {t('qrgen.seg.remove')}
          </button>
        </div>
      ))}
      <div className={styles.buttonRow}>
        <button type="button" className={styles.buttonSmall} onClick={() => onChange([...segments, { mode: 'byte', text: '' }])}>{t('qrgen.seg.add')}</button>
        <button type="button" className={styles.buttonSmall} onClick={onFill}>{t('qrgen.seg.startFromContent')}</button>
      </div>
    </div>
  );
}
