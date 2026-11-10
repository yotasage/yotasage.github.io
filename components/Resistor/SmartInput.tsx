import React from 'react';

import { ReadResult, Reading, formatTolerance } from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import { CloseIcon, DownIcon, InfoIcon, Ohms, UpIcon } from './parts';

// Shown under the field; each is typed in when clicked.
export const EXAMPLES = ['4k7', '4,7 kΩ', '472', '01C', '101', 'yel vio red gold'];

interface Props {
  text: string;
  result: ReadResult;
  reading: Reading | undefined;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onText: (text: string) => void;
  onPick: (id: string) => void;
  onStep: (dir: 1 | -1) => void;
  stepLabel: string;
}

// The one field of the tool, with the ways its text can be read.
export default function SmartInput({ text, result, reading, inputRef, onText, onPick, onStep, stepLabel }: Props) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onStep(event.key === 'ArrowUp' ? 1 : -1);
    } else if (event.key === 'Escape' && text) {
      event.preventDefault();
      onText('');
    }
  };

  const { readings, message } = result;

  return (
    <div>
      <label className={[styles.label, styles.inputLabel].join(' ')} htmlFor="resistor-input">Value, marking or band colours</label>
      <div className={styles.field}>
        <input
          id="resistor-input"
          ref={inputRef}
          className={styles.input}
          type="text"
          inputMode="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="4k7"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby="resistor-readings"
        />
        {text && (
          <button type="button" className={styles.clear} onClick={() => { onText(''); inputRef.current?.focus(); }} aria-label="Clear" title="Clear (Esc)">
            <CloseIcon />
          </button>
        )}
        <div className={styles.stepper}>
          <button type="button" className={styles.stepButton} onClick={() => onStep(1)} aria-label={`Next ${stepLabel} value up`} title={`Next ${stepLabel} value up (↑)`}><UpIcon /></button>
          <button type="button" className={styles.stepButton} onClick={() => onStep(-1)} aria-label={`Next ${stepLabel} value down`} title={`Next ${stepLabel} value down (↓)`}><DownIcon /></button>
        </div>
      </div>

      <div className={styles.examples}>
        <span>Try</span>
        {EXAMPLES.map((example) => (
          <button key={example} type="button" className={styles.chip} onClick={() => { onText(example); inputRef.current?.focus(); }}>{example}</button>
        ))}
      </div>

      <div className={styles.readings} id="resistor-readings" aria-live="polite">
        {message && (
          <p className={styles.message}><InfoIcon /><span>{message}</span></p>
        )}
        {readings.length === 1 && (
          <div className={[styles.reading, styles.readingOnly].join(' ')}>
            <span className={styles.readingHow}>
              <b>{readings[0].label}</b> · {readings[0].how}
            </span>
          </div>
        )}
        {readings.length > 1 && (
          <div role="radiogroup" aria-label="How to read it">
            <div className={styles.readingsHead}>This reads {readings.length === 2 ? 'two' : readings.length} ways. Pick one:</div>
            {readings.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={r.id === reading?.id} className={styles.reading} onClick={() => onPick(r.id)}>
                <span className={styles.radio} />
                <span className={styles.readingKind}>
                  {r.label}
                  {r.standard && readings.some((other) => !other.standard) && <span className={styles.tag}>standard value</span>}
                </span>
                <span className={styles.readingValue}>
                  <Ohms ohms={r.ohms} />
                  {r.tolerance !== undefined && <span className={[styles.num, styles.unit].join(' ')}> {formatTolerance(r.tolerance)}</span>}
                </span>
                <span className={styles.readingHow}>{r.how}</span>
              </button>
            ))}
          </div>
        )}
        {reading?.note && <p className={styles.readingNote}>{reading.note}</p>}
      </div>
    </div>
  );
}
