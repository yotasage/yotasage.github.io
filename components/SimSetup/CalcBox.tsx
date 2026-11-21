import React from 'react';

import {
  BoxState,
  calculate,
  Check,
  CHECK_TONES,
  checkNcyc,
  checkNpts,
  InputKey,
  PARAMS,
  switchSolveFor,
  Tone,
  UNITS,
} from '../../lib/simsetup/calc';
import { DigitGrouping, formatQuantity, NumberFormat } from '../../lib/simsetup/numbers';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/SimSetup.module.css';

export const SYMBOLS: Record<InputKey, React.ReactNode> = {
  f0: <>f<sub>0</sub></>,
  fs: <>F<sub>S</sub></>,
  ncyc: <>N<sub>cyc</sub></>,
  npts: <>N<sub>pts</sub></>,
  tstart: <>t<sub>start</sub></>,
};

const TONE_CLASSES: Record<Tone, string> = {
  good: styles.badgeGood,
  ok: styles.badgeOk,
  bad: styles.badgeBad,
  info: styles.badgeInfo,
};

const TONE_MARKS: Record<Tone, string> = { good: '✓', ok: '•', bad: '✗', info: '–' };

/** A check result as an accessible semantic pill: colored with ✓, •, ✗ or – in front. */
export function CheckText({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={[styles.badge, TONE_CLASSES[tone]].join(' ')}>
      <span aria-hidden="true">{TONE_MARKS[tone]}</span>
      <span>{children}</span>
    </span>
  );
}

export function renderCheckLabel(
  check: Check,
  t: (key: string, vars?: Record<string, string | number>) => string,
): React.ReactNode {
  switch (check.kind) {
    case 'tooLarge':
      return t('simsetup.check.tooLarge');
    case 'notInteger':
      return t('simsetup.check.notInteger');
    case 'prime':
      return t('simsetup.check.prime');
    case 'odd':
      return t('simsetup.check.odd');
    case 'even':
      return t('simsetup.check.even');
    case 'coprime':
      return t('simsetup.check.coprime');
    case 'commonFactor':
      return t('simsetup.check.commonFactor', { factor: String(check.factor) });
    case 'powerOfTwo':
      return (
        <>
          {t('simsetup.check.powerOfTwo')} (2<sup>{check.exponent}</sup>)
        </>
      );
    case 'notPowerOfTwo':
      return t('simsetup.check.notPowerOfTwo');
  }
}

export function CheckList({ checks }: { checks: Check[] }) {
  const { t } = useI18n();
  if (checks.length === 0) return null;
  return (
    <ul className={styles.checks}>
      {checks.map((check) => (
        <li key={check.kind}>
          <CheckText tone={CHECK_TONES[check.kind]}>{renderCheckLabel(check, t)}</CheckText>
        </li>
      ))}
    </ul>
  );
}

export default function CalcBox({
  box,
  title,
  precision,
  format,
  grouping,
  canRemove,
  compact = false,
  onChange,
  onDuplicate,
  onRemove,
}: {
  box: BoxState;
  title: string;
  precision: number;
  format: NumberFormat;
  grouping: DigitGrouping;
  canRemove: boolean;
  compact?: boolean;
  onChange: (box: BoxState) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const id = React.useId();
  const { t } = useI18n();
  const result = calculate(box);
  const { values, errors } = result;
  const ncycChecks = checkNcyc(values.ncyc, values.npts);
  const nptsChecks = checkNpts(values.npts);

  function show(value: number | null | undefined, unit: string) {
    return formatQuantity(value ?? null, unit, precision, format, grouping);
  }

  function inputRow(key: InputKey) {
    const error = errors[key];
    return (
      <React.Fragment key={key}>
        <label htmlFor={`${id}-${key}`} className={styles.rowLabel}>
          {SYMBOLS[key]}
        </label>
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
          {UNITS[key] && <span className={styles.unit}>{UNITS[key]}</span>}
        </div>
        {error && (
          <p id={`${id}-${key}-error`} className={styles.fieldError}>
            {error}
          </p>
        )}
      </React.Fragment>
    );
  }

  function outputRow(key: string, symbol: React.ReactNode, text: string, calculated = false) {
    return (
      <React.Fragment key={key}>
        <label htmlFor={`${id}-${key}`} className={styles.rowLabel}>
          {symbol}
        </label>
        {/* aria-live off: values change on every key press and should not interrupt typing. */}
        <output
          id={`${id}-${key}`}
          aria-live="off"
          className={[styles.value, calculated ? styles.calculated : ''].filter(Boolean).join(' ')}
        >
          {text}
        </output>
      </React.Fragment>
    );
  }

  return (
    <section
      className={[styles.box, compact ? styles.boxCompact : ''].filter(Boolean).join(' ')}
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.boxHeader}>
        <h3 id={`${id}-title`} className={styles.boxTitle}>
          {title}
        </h3>
        {!compact && (
          <div className={styles.boxActions}>
            <button
              type="button"
              className={styles.buttonGhost}
              onClick={onDuplicate}
              aria-label={t('simsetup.calc.duplicateAria', { title })}
            >
              {t('simsetup.calc.duplicate')}
            </button>
            <button
              type="button"
              className={styles.buttonGhost}
              onClick={onRemove}
              disabled={!canRemove}
              aria-label={t('simsetup.calc.removeAria', { title })}
            >
              {t('simsetup.calc.remove')}
            </button>
          </div>
        )}
      </div>

      <div className={styles.solveFor} role="radiogroup" aria-labelledby={`${id}-solve`}>
        <span id={`${id}-solve`} className={styles.fieldLabel}>
          {t('simsetup.calc.calculate')}
        </span>
        <div className={styles.segmentTrack}>
          {PARAMS.map((p) => (
            <label key={p} className={styles.segment}>
              <input
                type="radio"
                name={`${id}-solve`}
                checked={box.solveFor === p}
                onChange={() => onChange(switchSolveFor(box, p, grouping))}
              />
              <span>{SYMBOLS[p]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.mainRows}>
        {PARAMS.map((p) => (
          <React.Fragment key={p}>
            {p === box.solveFor ? outputRow(p, SYMBOLS[p], show(values[p], UNITS[p]), true) : inputRow(p)}
            {p === 'ncyc' && <CheckList checks={ncycChecks} />}
            {p === 'npts' && <CheckList checks={nptsChecks} />}
          </React.Fragment>
        ))}
      </div>

      <div className={styles.divider} />

      {compact ? (
        <div className={styles.derivedCompact}>
          <div className={styles.rows}>
            {inputRow('tstart')}
            {outputRow('tstop', <>t<sub>stop</sub></>, show(result.tstop, 's'))}
          </div>
        </div>
      ) : (
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
      )}
    </section>
  );
}
