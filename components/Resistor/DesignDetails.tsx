import React, { useMemo } from 'react';

import {
  CHIP_SIZES, Candidate, Circuit, SuggestOptions, analyseCircuit, chipSize, circuitDef, formatAmount,  formatOhms, formatPct, networkValue,
} from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import combos from '../../styles/ResistorCombos.module.css';
import css from '../../styles/ResistorDesign.module.css';
import { errorText, outputText, spanText, temperatureText } from './design';
import { InfoIcon, Ohms } from './parts';

interface Props {
  circuit: Circuit;
  candidate: Candidate;
  target: number;
  options: SuggestOptions;
  // For a circuit with one resistance: makes the value the tool's current value.
  onValue?: (ohms: number) => void;
}

const pct3 = (value: number) => `${Number(Math.abs(value).toPrecision(3))} %`;
// The half width of the chart in percent of the target: a round number just above what must fit.
function chartHalf(extent: number): number {
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const scale = 10 ** Math.floor(Math.log10(extent));
  return (steps.find((s) => s * scale >= extent * 1.08) ?? 10) * scale;
}
const loadText = (pct: number) => (!Number.isFinite(pct) ? 'none left' : pct < 0.1 ? 'under 0.1 %' : `${Number(pct.toPrecision(pct < 10 ? 2 : 3))} %`);

// An opened candidate: the output at each temperature with its range chart, and what each part carries.
export default function DesignDetails({ circuit, candidate: c, target, options, onValue }: Props) {
  const a = useMemo(() => analyseCircuit(circuit, c.legs, target, options), [circuit, c, target, options]);
  const def = circuitDef(circuit.id);
  const unit = def.output.unit;
  const allowed = options.allowedPct;
  const half = chartHalf(Math.max(allowed, ...a.points.map((p) => Math.max(Math.abs(p.minPct), Math.abs(p.maxPct), Math.abs(a.errorPct) + p.rssPct))));
  const at = (pct: number) => `${Math.min(100, Math.max(0, 50 + (pct / half) * 50))}%`;
  const span = (low: number, high: number) => ({ left: at(low), right: `${100 - parseFloat(at(high))}%` });
  const share = allowed / half;
  const worst = a.points[a.worst];
  const chip = chipSize(a.chipSize);
  const over = a.parts.filter((part) => !part.carries);
  const ohms = networkValue(c.legs[0]);

  return (
    <div className={[combos.details, css.details].join(' ')}>
      <p className={combos.detailLine}>
        Nominal <span className={styles.num}>{outputText(circuit.id, a.nominal, 5)}</span> (<span className={styles.num}>{errorText(a.errorPct)}</span> from the target).
        {' '}Worst case <span className={styles.num}>{spanText(worst.minPct, worst.maxPct)}</span> at <span className={styles.num}>{temperatureText(worst.temperature)}</span>:{' '}
        {a.passes ? <>inside ±{formatPct(allowed)} with <span className={styles.num}>{pct3(a.margin)}</span> to spare</> : <b className={css.out}>outside ±{formatPct(allowed)} by <span className={styles.num}>{pct3(a.margin)}</span></b>}.
        {' '}By RSS <span className={styles.num}>±{pct3(worst.rssPct)}</span> around the nominal: {a.rssPasses ? 'inside' : <b className={css.out}>outside by <span className={styles.num}>{pct3(a.rssMargin)}</span></b>}.
      </p>

      <div className={css.temps} role="table" aria-label="The output at each temperature">
        <div className={css.tempsHead} role="row">
          <span className={styles.label} role="columnheader">At</span>
          <span className={[css.axis, styles.num].join(' ')} role="columnheader" aria-label={`Range, in percent of the target; the band is the allowed ±${formatPct(allowed)}`}>
            {share >= 0.3 ? (
              <>
                <i style={{ left: at(-allowed) }}>−{formatPct(allowed)}</i>
                {share >= 0.6 && <i style={{ left: '50%' }}>target</i>}
                <i style={{ left: at(allowed) }}>+{formatPct(allowed)}</i>
              </>
            ) : <i style={{ left: '50%' }}>±{formatPct(allowed)}</i>}
          </span>
          <span className={styles.label} role="columnheader">Minimum</span>
          <span className={styles.label} role="columnheader">Nominal</span>
          <span className={styles.label} role="columnheader">Maximum</span>
          <span className={styles.label} role="columnheader">RSS</span>
        </div>
        {a.points.map((p) => {
          const out = p.margin !== null && p.margin < 0;
          return (
            <div key={p.temperature} className={css.tempsRow} role="row" data-out={out || undefined} data-testid="design-temperature">
              <span role="rowheader" className={[styles.num, css.tempName].join(' ')}>{temperatureText(p.temperature)}{out && <em>outside</em>}</span>
              <span role="cell" className={css.chart} aria-hidden>
                <span className={css.window} style={span(-allowed, allowed)} />
                <span className={css.zero} />
                <span className={css.worstSpan} style={span(p.minPct, p.maxPct)} />
                <span className={css.rssSpan} style={span(a.errorPct - p.rssPct, a.errorPct + p.rssPct)} />
                <span className={css.nominal} style={{ left: at(a.errorPct) }} />
              </span>
              <span role="cell" className={styles.num}><b>{outputText(circuit.id, p.min, 5)}</b><i>{errorText(p.minPct)}</i></span>
              <span role="cell" className={styles.num}><b>{outputText(circuit.id, a.nominal, 5)}</b><i>{errorText(a.errorPct)}</i></span>
              <span role="cell" className={styles.num}><b>{outputText(circuit.id, p.max, 5)}</b><i>{errorText(p.maxPct)}</i></span>
              <span role="cell" className={styles.num}><b>±{formatAmount(p.rss, unit, 3)}</b><i>±{pct3(p.rssPct)}</i></span>
            </div>
          );
        })}
      </div>
      <p className={css.legend}>
        <span><i className={css.keyWindow} />allowed ±{formatPct(allowed)}</span>
        <span><i className={css.keyWorst} />worst case</span>
        <span><i className={css.keyRss} />RSS</span>
        <span><i className={css.keyNominal} />nominal</span>
        <span className={styles.num}>the chart spans ±{formatPct(half)} of the target</span>
      </p>

      {a.quantities.length > 0 && (
        <p className={css.quantities}>
          {a.quantities.map((q) => (
            <span key={q.id}>{q.label} <b className={styles.num}>{q.unit === 'Ω' ? formatOhms(q.value, 4) : formatAmount(q.value, q.unit, 3)}</b></span>
          ))}
        </p>
      )}

      <div className={styles.scroll}>
        <div className={css.loads} role="table" aria-label="What each resistor carries" style={{ gridTemplateColumns: `auto auto repeat(${3 + a.points.length}, minmax(max-content, 1fr)) auto` }}>
          <div className={css.loadsHead} role="row">
            <span className={styles.label} role="columnheader">Part</span>
            <span className={styles.label} role="columnheader">Value</span>
            <span className={styles.label} role="columnheader">Voltage</span>
            <span className={styles.label} role="columnheader">Current</span>
            <span className={styles.label} role="columnheader">Power</span>
            {a.points.map((p) => <span key={p.temperature} className={styles.label} role="columnheader" title={`What a typical ${a.chipSize} still carries at ${temperatureText(p.temperature)}, and how much of it the part uses`}>{a.chipSize}<br />{temperatureText(p.temperature)}</span>)}
            <span className={styles.label} role="columnheader" title={`The smallest chip size whose typical rating carries the power at ${temperatureText(a.hottest)}`}>Smallest</span>
          </div>
          {a.parts.map((part) => (
            <div key={part.name} className={css.loadsRow} role="row">
              <span role="cell" className={styles.num} data-label="Part">{part.name}</span>
              <span role="cell" data-label="Value"><Ohms ohms={part.ohms} /></span>
              <span role="cell" className={styles.num} data-label="Voltage">{formatAmount(part.volts, 'V', 3)}</span>
              <span role="cell" className={styles.num} data-label="Current">{formatAmount(part.amps, 'A', 3)}</span>
              <span role="cell" className={styles.num} data-label="Power">{formatAmount(part.watts, 'W', 3)}</span>
              {part.rating.map((r) => (
                <span key={r.temperature} role="cell" className={styles.num} data-label={`${a.chipSize} at ${temperatureText(r.temperature)}`} data-over={r.loadPct > 100 ? 'true' : undefined}>
                  <b>{formatAmount(r.watts, 'W', 3)}</b><i>{loadText(r.loadPct)}</i>
                </span>
              ))}
              <span role="cell" className={styles.num} data-label="Smallest chip" data-over={part.smallest ? undefined : 'true'}><b>{part.smallest ?? 'above 2512'}</b></span>
            </div>
          ))}
        </div>
      </div>
      {over.length > 0 && (
        <p className={[styles.message, css.warning].join(' ')} role="alert" data-testid="design-over">
          <InfoIcon />
          <span>
            {over.map((part) => `${part.name} dissipates ${formatAmount(part.watts, 'W', 3)}`).join(' and ')}: more than a typical {a.chipSize} carries at {temperatureText(a.hottest)}
            {' '}({formatAmount(over[0].rating[over[0].rating.length - 1]?.watts ?? 0, 'W', 3)}).{' '}
            {over.every((part) => part.smallest) ? `Use ${CHIP_SIZES.filter((size) => over.some((part) => part.smallest === size.imperial)).pop()?.imperial} or larger, or split the power over more resistors.` : 'No chip size of the table carries it: use a power resistor, or split the power over more resistors.'}
          </span>
        </p>
      )}
      <p className={combos.detailNote}>
        The columns under {a.chipSize} give what a typical {a.chipSize} chip ({formatAmount(chip?.power ?? 0, 'W', 3)} up to 70 °C, then less in a straight line to nothing at {temperatureText(chip?.maxTemperature ?? 155)}) still carries at that temperature, and how much of it the part uses. Power is at the nominal values.
      </p>
      {onValue && (
        <p className={css.use}>
          <button type="button" className={combos.button} onClick={() => onValue(ohms)}>Use {formatOhms(ohms)} as the value</button>
          <span>the drawing, the lookup and the combinations follow</span>
        </p>
      )}
    </div>
  );
}
