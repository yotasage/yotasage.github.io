import React from 'react';

import {
  Reading, SeriesId, errorPct, formatError, formatOhms, formatPct, formatRkm, formatTolerance, neighbours, ohmsParts, series,
  seriesContaining,
} from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import { CheckIcon, CopyButton, LinkIcon, Ohms, ValueButton } from './parts';

// The tolerances offered. A tolerance typed after a value (4k7 3%) is added while it is in use.
export const TOLERANCES = [20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];

interface Props {
  reading: Reading | undefined;
  tolerance: number;
  stepSeries: SeriesId;
  onTolerance: (pct: number) => void;
  onValue: (ohms: number) => void;
}

// The current value, very large, and what follows from it at once: whether it is standard, its range, copies.
export default function ValueHero({ reading, tolerance, stepSeries, onTolerance, onValue }: Props) {
  const ohms = reading?.ohms;
  const has = ohms !== undefined;
  // Before anything is typed, the value of the field's placeholder (4k7) stands here in the placeholder's colour.
  const [number, unit] = has ? ohmsParts(ohms) : ['4.7', 'kΩ'];
  const size = number.length <= 4 ? 'l' : number.length <= 6 ? 'm' : 's';
  const member = has && ohms > 0 ? seriesContaining(ohms) : [];
  const near = has && ohms > 0 && member.length === 0 ? neighbours(ohms, stepSeries) : null;
  const tolerances = TOLERANCES.includes(tolerance) ? TOLERANCES : [...TOLERANCES, tolerance].sort((a, b) => b - a);

  return (
    <div className={styles.valueBlock}>
      <span className={styles.label} id="resistor-value-label">Resistance</span>
      <output className={[styles.value, has ? '' : styles.valueEmpty].join(' ')} data-size={size} data-empty={!has} htmlFor="resistor-input" aria-labelledby="resistor-value-label" aria-hidden={!has}>
        {number}<span className={styles.unit}>{unit}</span>
      </output>

      <dl className={styles.facts}>
        <dt className={styles.label}>Standard</dt>
        <dd>
          {!has && <span className={styles.quiet}>–</span>}
          {has && ohms === 0 && <span>A 0 Ω link (jumper), in no series</span>}
          {member.length > 0 && (
            <>
              <span className={styles.okMark}><CheckIcon size={15} /></span>
              {member.map((id) => <span key={id} className={styles.seriesTag}>{id}</span>)}
            </>
          )}
          {near && (
            <>
              <span>No. Nearest in {series(stepSeries).label}:</span>
              <ValueButton ohms={near.nearest} onPick={onValue} />
              <span className={[styles.num, styles.quiet].join(' ')}>{formatError(errorPct(near.nearest, ohms))}</span>
            </>
          )}
        </dd>

        <dt className={styles.label}>Tolerance</dt>
        <dd role="radiogroup" aria-label="Tolerance in percent">
          {tolerances.map((pct) => (
            <button key={pct} type="button" role="radio" aria-checked={pct === tolerance} className={styles.tol} onClick={() => onTolerance(pct)} title={formatTolerance(pct)} aria-label={formatTolerance(pct)}>
              {formatPct(pct).replace(' %', '')}
            </button>
          ))}
          <span className={styles.quiet}>%</span>
        </dd>

        <dt className={styles.label}>Range</dt>
        <dd>
          {has && ohms > 0 ? (
            <>
              <Ohms ohms={ohms * (1 - tolerance / 100)} digits={5} />
              <span className={styles.quiet}>to</span>
              <Ohms ohms={ohms * (1 + tolerance / 100)} digits={5} />
              {reading.tcr !== undefined && <span className={styles.quiet}>· <span className={styles.num}>{reading.tcr} ppm/K</span></span>}
            </>
          ) : <span className={styles.quiet}>–</span>}
        </dd>

        <dt className={styles.label}>Copy</dt>
        <dd>
          {has ? (
            <>
              <CopyButton text={formatOhms(ohms)} label={<span className={styles.num}>{formatOhms(ohms)}</span>} title={`Copy ${formatOhms(ohms)}`} />
              <CopyButton text={formatRkm(ohms)} label={<span className={styles.num}>{formatRkm(ohms)}</span>} title={`Copy ${formatRkm(ohms)}`} />
              <CopyButton text={() => window.location.href} label="Link" title="Copy a link to this result" icon={<LinkIcon />} />
            </>
          ) : <span className={styles.quiet}>–</span>}
        </dd>
      </dl>
    </div>
  );
}
