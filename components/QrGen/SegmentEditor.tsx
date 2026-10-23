import React from 'react';

import { ManualSegment } from '../../lib/qr/encoder';
import styles from '../../styles/QrGen.module.css';
import { Select } from './fields';

const SEGMENT_MODES: [ManualSegment['mode'], string][] = [
  ['numeric', 'Numeric'],
  ['alphanumeric', 'Alphanumeric'],
  ['byte', 'Byte'],
  ['kanji', 'Kanji'],
  ['eci', 'ECI designator'],
];

export default function SegmentEditor({ segments, onChange, onFill }: {
  segments: ManualSegment[];
  onChange: (s: ManualSegment[]) => void;
  onFill: () => void;
}) {
  const update = (i: number, patch: Partial<ManualSegment>) => onChange(segments.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className={styles.fieldWide}>
      <p className={styles.help}>
        Segments are written in this order. The content form above is ignored while manual segments are used.
        An ECI row takes an assignment number, for example 26 for UTF-8.
      </p>
      {segments.map((s, i) => (
        <div key={i} className={styles.segmentRow}>
          <Select value={s.mode} options={SEGMENT_MODES} onChange={(mode) => update(i, { mode })} />
          <input
            className={styles.input}
            value={s.text}
            spellCheck={false}
            placeholder={s.mode === 'eci' ? '26' : 'Segment data'}
            onChange={(e) => update(i, { text: e.target.value })}
          />
          <button type="button" className={styles.buttonSmall} onClick={() => onChange(segments.filter((_, j) => j !== i))} aria-label="Remove segment">
            Remove
          </button>
        </div>
      ))}
      <div className={styles.buttonRow}>
        <button type="button" className={styles.buttonSmall} onClick={() => onChange([...segments, { mode: 'byte', text: '' }])}>Add segment</button>
        <button type="button" className={styles.buttonSmall} onClick={onFill}>Start from content</button>
      </div>
    </div>
  );
}
