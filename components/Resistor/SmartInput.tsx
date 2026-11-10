import React from 'react';

import { ReadAs, ReadResult, Reading, formatTolerance } from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import { CloseIcon, DownIcon, InfoIcon, Ohms, Segmented, UpIcon } from './parts';

// Shown under the field; each is typed in when clicked. One that is there to show a marking says so, and sets the
// choice beside the field.
export const EXAMPLES: { text: string; as?: ReadAs }[] = [
  { text: '4k7' }, { text: '4,7 kΩ' }, { text: '472', as: 'marking' }, { text: '01C' }, { text: '101' }, { text: 'yel vio red gold' },
];

interface Props {
  text: string;
  result: ReadResult;
  reading: Reading | undefined;
  inputRef: React.RefObject<HTMLInputElement | null>;
  // What a text that is a number and a marking is first of all.
  readAs: ReadAs;
  onReadAs: (readAs: ReadAs) => void;
  onText: (text: string) => void;
  onExample: (text: string, as?: ReadAs) => void;
  onPick: (id: string) => void;
  onStep: (dir: 1 | -1) => void;
  stepLabel: string;
}

// The one field of the tool, with the ways its text can be read.
export default function SmartInput({ text, result, reading, inputRef, readAs, onReadAs, onText, onExample, onPick, onStep, stepLabel }: Props) {
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
  // Colours read from the other end: which of the two directions is the unusual one, and why.
  const caveat = (r: Reading) => (r.doubt ? ` ${r.likely === 'unlikely' ? 'Unlikely' : 'Unusual'}: ${r.doubt}.` : '');

  return (
    <div>
      <div className={styles.inputHead}>
        <label className={styles.label} htmlFor="resistor-input">Value, marking or band colours</label>
        <div className={styles.readAs} title="What a text such as 472 is first of all: 472 Ω, or the marking of 4.7 kΩ. A text that can only be one of the two is read as that.">
          <span className={styles.readAsLabel} id="resistor-read-as">Read as</span>
          <Segmented<ReadAs> label="Read digits as" value={readAs} options={[{ value: 'value', label: 'Value', title: '472 is 472 Ω; the marking is offered below' }, { value: 'marking', label: 'Marking', title: '472 is the marking of 4.7 kΩ; what is no marking is still read as a value' }]} onChange={onReadAs} />
        </div>
      </div>
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
          <button key={example.text} type="button" className={styles.chip} onClick={() => { onExample(example.text, example.as); inputRef.current?.focus(); }} title={example.as === 'marking' ? `Read ${example.text} as a marking` : undefined}>
            {example.text}{example.as === 'marking' && <span className={styles.chipAs}> as a marking</span>}
          </button>
        ))}
      </div>

      <div className={styles.readings} id="resistor-readings" aria-live="polite">
        {message && (
          <p className={styles.message}><InfoIcon /><span>{message}</span></p>
        )}
        {readings.length === 1 && (
          <div className={[styles.reading, styles.readingOnly].join(' ')}>
            <span className={styles.readingHow}>
              <b>{readings[0].label}</b> · {readings[0].how}{readings[0].doubt ? `. Unusual: ${readings[0].doubt}.` : ''}
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
                  {r.likely && <span className={styles.tag} data-doubt={r.likely === 'unlikely' || undefined}>{r.likely}</span>}
                  {r.standard && !r.doubt && readings.some((other) => !other.standard) && <span className={styles.tag}>standard value</span>}
                </span>
                <span className={styles.readingValue}>
                  <Ohms ohms={r.ohms} />
                  {r.tolerance !== undefined && <span className={[styles.num, styles.unit].join(' ')}> {formatTolerance(r.tolerance)}</span>}
                </span>
                <span className={styles.readingHow}>{r.how}{r.doubt ? '.' : ''}{r.doubt && <span className={styles.readingDoubt}>{caveat(r)}</span>}</span>
              </button>
            ))}
          </div>
        )}
        {reading?.note && <p className={styles.readingNote}>{reading.note}</p>}
      </div>
    </div>
  );
}
