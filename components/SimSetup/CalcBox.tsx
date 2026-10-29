import React from 'react';

import { BoxState, calculate, Check, CHECK_TONES, checkNcyc, checkNpts, InputKey, PARAMS, switchSolveFor, Tone, UNITS } from '../../lib/simsetup/calc';
import { formatQuantity, NumberFormat } from '../../lib/simsetup/numbers';
import styles from '../../styles/SimSetup.module.css';

export const SYMBOLS: Record<InputKey, React.ReactNode> = {
  f0: <>f<sub>0</sub></>,
  fs: <>F<sub>S</sub></>,
  ncyc: <>N<sub>cyc</sub></>,
  npts: <>N<sub>pts</sub></>,
  tstart: <>t<sub>start</sub></>,
};

const TONE_CLASSES: Record<Tone, string> = { good: styles.good, ok: styles.ok, bad: styles.bad, info: styles.info };

const TONE_MARKS: Record<Tone, string> = { good: '✓', ok: '•', bad: '✗', info: '–' };

function checkLabel(check: Check): React.ReactNode {
  switch (check.kind) {
    case 'tooLarge': return 'Too large to check';
    case 'notInteger': return 'Not an integer';
    case 'prime': return 'Prime';
    case 'odd': return 'Odd, not prime';
    case 'even': return 'Even';
    case 'coprime': return <>No common factor with N<sub>pts</sub></>;
    case 'commonFactor': return <>Common factor {String(check.factor)} with N<sub>pts</sub></>;
    case 'powerOfTwo': return <>Power of 2 (2<sup>{check.exponent}</sup>)</>;
    case 'notPowerOfTwo': return 'Not a power of 2';
  }
}

function Checks({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className={styles.checks}>
      {checks.map((check) => {
        const tone = CHECK_TONES[check.kind];
        return (
          <li key={check.kind} className={TONE_CLASSES[tone]}>
            <span aria-hidden="true">{TONE_MARKS[tone]}</span> {checkLabel(check)}
          </li>
        );
      })}
    </ul>
  );
}

export default function CalcBox({ box, title, precision, format, canRemove, onChange, onDuplicate, onRemove }: {
  box: BoxState;
  title: string;
  precision: number;
  format: NumberFormat;
  canRemove: boolean;
  onChange: (box: BoxState) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const id = React.useId();
  const result = calculate(box);
  const { values, errors } = result;

  function show(value: number | null | undefined, unit: string) {
    return formatQuantity(value ?? null, unit, precision, format);
  }

  function inputRow(key: InputKey) {
    const error = errors[key];
    return (
      <React.Fragment key={key}>
        <label htmlFor={`${id}-${key}`} className={styles.rowLabel}>{SYMBOLS[key]}</label>
        <div className={styles.fieldWithUnit}>
          <input
            id={`${id}-${key}`}
            className={styles.input}
            value={box.text[key]}
            onChange={(e) => onChange({ ...box, text: { ...box.text, [key]: e.target.value } })}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-${key}-error` : undefined}
          />
          <span className={styles.unit}>{UNITS[key]}</span>
        </div>
        {error && <p id={`${id}-${key}-error`} className={styles.fieldError}>{error}</p>}
      </React.Fragment>
    );
  }

  function outputRow(key: string, symbol: React.ReactNode, text: string, calculated = false) {
    return (
      <React.Fragment key={key}>
        <label htmlFor={`${id}-${key}`} className={styles.rowLabel}>{symbol}</label>
        {/* aria-live off: the values change on every key press and should not be read out each time. */}
        <output id={`${id}-${key}`} aria-live="off" className={[styles.value, calculated ? styles.calculated : ''].join(' ')}>
          {text}
        </output>
      </React.Fragment>
    );
  }

  return (
    <section className={styles.box} aria-labelledby={`${id}-title`}>
      <div className={styles.boxHeader}>
        <h3 id={`${id}-title`}>{title}</h3>
        <div className={styles.boxActions}>
          <button type="button" className={styles.buttonSmall} onClick={onDuplicate} aria-label={`Duplicate ${title}`}>Duplicate</button>
          <button type="button" className={styles.buttonSmall} onClick={onRemove} disabled={!canRemove} aria-label={`Remove ${title}`}>Remove</button>
        </div>
      </div>

      <div className={styles.solveFor} role="radiogroup" aria-labelledby={`${id}-solve`}>
        <span id={`${id}-solve`} className={styles.fieldLabel}>Calculate</span>
        {PARAMS.map((p) => (
          <label key={p} className={styles.segment}>
            <input type="radio" name={`${id}-solve`} checked={box.solveFor === p} onChange={() => onChange(switchSolveFor(box, p))} />
            <span>{SYMBOLS[p]}</span>
          </label>
        ))}
      </div>

      {/* The checks sit to the right of N_cyc and N_pts, in line with the right-hand column below. */}
      <div className={styles.mainRows}>
        {PARAMS.map((p) => (
          <React.Fragment key={p}>
            {p === box.solveFor ? outputRow(p, SYMBOLS[p], show(values[p], UNITS[p]), true) : inputRow(p)}
            {p === 'ncyc' && <Checks checks={checkNcyc(values.ncyc, values.npts)} />}
            {p === 'npts' && <Checks checks={checkNpts(values.npts)} />}
          </React.Fragment>
        ))}
      </div>

      <div className={styles.divider} />

      <div className={styles.derived}>
        <div className={styles.rows}>
          {outputRow('T0', <>T<sub>0</sub></>, show(result.T0, 's'))}
          {outputRow('Ts', <>T<sub>S</sub></>, show(result.Ts, 's'))}
          {outputRow('fres', <>f<sub>res</sub></>, show(result.fres, 'Hz'))}
          {outputRow('npts0', <>N<sub>pts0</sub></>, show(result.npts0, ''))}
        </div>
        <div className={styles.rows}>
          {inputRow('tstart')}
          {outputRow('tstop', <>t<sub>stop</sub></>, show(result.tstop, 's'))}
          {outputRow('fmin', <>f<sub>min</sub></>, show(result.fmin, 'Hz'))}
          {outputRow('fmax', <>f<sub>max</sub></>, show(result.fmax, 'Hz'))}
        </div>
      </div>
    </section>
  );
}
