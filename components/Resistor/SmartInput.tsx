import React from 'react';

import { ReadAs, ReadResult, Reading, formatTolerance } from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
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
  const { t } = useI18n();
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
  const caveat = (r: Reading) => (r.doubt ? ` ${r.likely === 'unlikely' ? t('res.in.unlikely') : t('res.in.unusual')}: ${r.doubt}.` : '');
  const likelyLabel = (likely: Reading['likely']) => (likely === 'more likely' ? t('res.in.moreLikely') : likely === 'unlikely' ? t('res.in.unlikelyTag') : likely);

  return (
    <div>
      <div className={styles.inputHead}>
        <label className={styles.label} htmlFor="resistor-input">{t('res.in.label')}</label>
        <div className={styles.readAs} title={t('res.in.readAsTitle')}>
          <span className={styles.readAsLabel} id="resistor-read-as">{t('res.in.readAs')}</span>
          <Segmented<ReadAs>
            label={t('res.in.readDigitsAria')}
            value={readAs}
            options={[
              { value: 'value', label: t('res.in.value'), title: t('res.in.valueTitle') },
              { value: 'marking', label: t('res.in.marking'), title: t('res.in.markingTitle') },
            ]}
            onChange={onReadAs}
          />
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
          <button type="button" className={styles.clear} onClick={() => { onText(''); inputRef.current?.focus(); }} aria-label={t('res.in.clear')} title={t('res.in.clearTitle')}>
            <CloseIcon />
          </button>
        )}
        <div className={styles.stepper}>
          <button type="button" className={styles.stepButton} onClick={() => onStep(1)} aria-label={t('res.in.nextUp', { series: stepLabel })} title={t('res.in.nextUpTitle', { series: stepLabel })}><UpIcon /></button>
          <button type="button" className={styles.stepButton} onClick={() => onStep(-1)} aria-label={t('res.in.nextDown', { series: stepLabel })} title={t('res.in.nextDownTitle', { series: stepLabel })}><DownIcon /></button>
        </div>
      </div>

      <div className={styles.examples}>
        <span>{t('res.in.try')}</span>
        {EXAMPLES.map((example) => (
          <button key={example.text} type="button" className={styles.chip} onClick={() => { onExample(example.text, example.as); inputRef.current?.focus(); }} title={example.as === 'marking' ? t('res.in.readMarkingTitle', { text: example.text }) : undefined}>
            {example.text}{example.as === 'marking' && <span className={styles.chipAs}>{t('res.in.asMarking')}</span>}
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
              <b>{readings[0].label}</b> · {readings[0].how}{readings[0].doubt ? `. ${t('res.in.unusual')}: ${readings[0].doubt}.` : ''}
            </span>
          </div>
        )}
        {readings.length > 1 && (
          <div role="radiogroup" aria-label={t('res.in.howToReadAria')}>
            <div className={styles.readingsHead}>{readings.length === 2 ? t('res.in.readsTwo') : t('res.in.readsMany', { count: readings.length })}</div>
            {readings.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={r.id === reading?.id} className={styles.reading} onClick={() => onPick(r.id)}>
                <span className={styles.radio} />
                <span className={styles.readingKind}>
                  {r.label}
                  {r.likely && <span className={styles.tag} data-doubt={r.likely === 'unlikely' || undefined}>{likelyLabel(r.likely)}</span>}
                  {r.standard && !r.doubt && readings.some((other) => !other.standard) && <span className={styles.tag}>{t('res.in.standardValue')}</span>}
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
