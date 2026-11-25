import React, { useMemo } from 'react';

import {
  CHIP_SIZES, Candidate, Circuit, SuggestOptions, analyseCircuit, chipSize, circuitDef, formatAmount, formatOhms, formatPct, networkValue,
} from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
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
  onValue?: (ohms: number) => void;
}

const pct3 = (value: number) => `${Number(Math.abs(value).toPrecision(3))} %`;
function chartHalf(extent: number): number {
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const scale = 10 ** Math.floor(Math.log10(extent));
  return (steps.find((s) => s * scale >= extent * 1.08) ?? 10) * scale;
}

const STATIC_Q_KEY: Record<string, string> = {
  outputResistance: 'res.dd.q.outputResistance',
  unloaded: 'res.dd.q.unloaded',
  loadCurrent: 'res.dd.q.loadCurrent',
  pinShift: 'res.dd.q.pinShift',
  vout: 'res.dd.q.vout',
  inputResistance: 'res.dd.q.inputResistance',
};

export default function DesignDetails({ circuit, candidate: c, target, options, onValue }: Props) {
  const { locale, t } = useI18n();
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

  const loadText = (pct: number) => (!Number.isFinite(pct) ? t('res.dd.noneLeft') : pct < 0.1 ? t('res.dd.under01') : `${Number(pct.toPrecision(pct < 10 ? 2 : 3))} %`);

  const quantityLabel = (qid: string, fallback: string) => {
    if (qid === 'volts') return circuit.id === 'shunt' ? t('res.dd.q.volts.shunt') : t('res.dd.q.volts');
    if (qid === 'power') {
      if (circuit.id === 'divider') return t('res.dd.q.power.divider');
      if (circuit.id === 'feedback' || circuit.id === 'noninverting' || circuit.id === 'inverting') return t('res.dd.q.power.feedback');
      return t('res.dd.q.power.single');
    }
    if (qid === 'current') {
      if (circuit.id === 'divider') return t('res.dd.q.current.divider');
      if (circuit.id === 'feedback') return t('res.dd.q.current.feedback');
      return t('res.dd.q.current.gain');
    }
    return STATIC_Q_KEY[qid] ? t(STATIC_Q_KEY[qid]) : fallback;
  };

  return (
    <div className={[combos.details, css.details].join(' ')}>
      <p className={combos.detailLine}>
        {t('res.dd.nominalPre')}<span className={styles.num}>{outputText(circuit.id, a.nominal, 5)}</span> (<span className={styles.num}>{errorText(a.errorPct)}</span>{t('res.dd.fromTarget')}
        {t('res.dd.wcAt')}<span className={styles.num}>{spanText(worst.minPct, worst.maxPct, locale)}</span>{t('res.dd.at')}<span className={styles.num}>{temperatureText(worst.temperature)}</span>:{' '}
        {a.passes
          ? <>{t('res.dd.insideSpare', { pct: formatPct(allowed) })}<span className={styles.num}>{pct3(a.margin)}</span>{t('res.dd.spareWord')}</>
          : <b className={css.out}>{t('res.dd.outsideBy', { pct: formatPct(allowed) })}<span className={styles.num}>{pct3(a.margin)}</span></b>}.
        {' '}{t('res.dd.byRss')}<span className={styles.num}>±{pct3(worst.rssPct)}</span>{t('res.dd.aroundNom')}
        {a.rssPasses ? t('res.d.insideWord') : <b className={css.out}>{t('res.dd.outsideByShort')}<span className={styles.num}>{pct3(a.rssMargin)}</span></b>}.
      </p>

      <div className={css.temps} role="table" aria-label={t('res.dd.tempsTableAria')}>
        <div className={css.tempsHead} role="row">
          <span className={styles.label} role="columnheader">{t('res.dd.colAt')}</span>
          <span className={[css.axis, styles.num].join(' ')} role="columnheader" aria-label={t('res.dd.axisAria', { pct: formatPct(allowed) })}>
            {share >= 0.3 ? (
              <>
                <i style={{ left: at(-allowed) }}>−{formatPct(allowed)}</i>
                {share >= 0.6 && <i style={{ left: '50%' }}>{t('res.dd.target')}</i>}
                <i style={{ left: at(allowed) }}>+{formatPct(allowed)}</i>
              </>
            ) : <i style={{ left: '50%' }}>±{formatPct(allowed)}</i>}
          </span>
          <span className={styles.label} role="columnheader">{t('res.dd.min')}</span>
          <span className={styles.label} role="columnheader">{t('res.dd.nom')}</span>
          <span className={styles.label} role="columnheader">{t('res.dd.max')}</span>
          <span className={styles.label} role="columnheader">RSS</span>
        </div>
        {a.points.map((p) => {
          const out = p.margin !== null && p.margin < 0;
          return (
            <div key={p.temperature} className={css.tempsRow} role="row" data-out={out || undefined} data-testid="design-temperature">
              <span role="rowheader" className={[styles.num, css.tempName].join(' ')}>{temperatureText(p.temperature)}{out && <em>{t('res.d.outsideWord')}</em>}</span>
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
        <span><i className={css.keyWindow} />{t('res.dd.legAllowed', { pct: formatPct(allowed) })}</span>
        <span><i className={css.keyWorst} />{t('res.dd.legWorst')}</span>
        <span><i className={css.keyRss} />RSS</span>
        <span><i className={css.keyNominal} />{t('res.dd.legNom')}</span>
        <span className={styles.num}>{t('res.dd.chartSpans', { pct: formatPct(half) })}</span>
      </p>

      {a.quantities.length > 0 && (
        <p className={css.quantities}>
          {a.quantities.map((q) => (
            <span key={q.id}>{quantityLabel(q.id, q.label)} <b className={styles.num}>{q.unit === 'Ω' ? formatOhms(q.value, 4) : formatAmount(q.value, q.unit, 3)}</b></span>
          ))}
        </p>
      )}

      <div className={styles.scroll}>
        <div className={css.loads} role="table" aria-label={t('res.dd.loadsAria')} style={{ gridTemplateColumns: `auto auto repeat(${3 + a.points.length}, minmax(max-content, 1fr)) auto` }}>
          <div className={css.loadsHead} role="row">
            <span className={styles.label} role="columnheader">{t('res.c.part')}</span>
            <span className={styles.label} role="columnheader">{t('res.c.value')}</span>
            <span className={styles.label} role="columnheader">{t('res.c.voltage')}</span>
            <span className={styles.label} role="columnheader">{t('res.c.current')}</span>
            <span className={styles.label} role="columnheader">{t('res.c.power')}</span>
            {a.points.map((p) => <span key={p.temperature} className={styles.label} role="columnheader" title={t('res.dd.chipAtTitle', { chip: a.chipSize, temp: temperatureText(p.temperature) })}>{a.chipSize}<br />{temperatureText(p.temperature)}</span>)}
            <span className={styles.label} role="columnheader" title={t('res.dd.smallestTitle', { temp: temperatureText(a.hottest) })}>{t('res.dd.smallest')}</span>
          </div>
          {a.parts.map((part) => (
            <div key={part.name} className={css.loadsRow} role="row">
              <span role="cell" className={styles.num} data-label={t('res.c.part')}>{part.name}</span>
              <span role="cell" data-label={t('res.c.value')}><Ohms ohms={part.ohms} /></span>
              <span role="cell" className={styles.num} data-label={t('res.c.voltage')}>{formatAmount(part.volts, 'V', 3)}</span>
              <span role="cell" className={styles.num} data-label={t('res.c.current')}>{formatAmount(part.amps, 'A', 3)}</span>
              <span role="cell" className={styles.num} data-label={t('res.c.power')}>{formatAmount(part.watts, 'W', 3)}</span>
              {part.rating.map((r) => (
                <span key={r.temperature} role="cell" className={styles.num} data-label={`${a.chipSize} ${temperatureText(r.temperature)}`} data-over={r.loadPct > 100 ? 'true' : undefined}>
                  <b>{formatAmount(r.watts, 'W', 3)}</b><i>{loadText(r.loadPct)}</i>
                </span>
              ))}
              <span role="cell" className={styles.num} data-label={t('res.dd.smallestChip')} data-over={part.smallest ? undefined : 'true'}><b>{part.smallest ?? t('res.dd.above2512')}</b></span>
            </div>
          ))}
        </div>
      </div>
      {over.length > 0 && (
        <p className={[styles.message, css.warning].join(' ')} role="alert" data-testid="design-over">
          <InfoIcon />
          <span>
            {over.map((part) => t('res.dd.dissipates', { name: part.name, watts: formatAmount(part.watts, 'W', 3) })).join(` ${t('res.and')} `)}
            {t('res.dd.overMoreThan', { chip: a.chipSize, temp: temperatureText(a.hottest), watts: formatAmount(over[0].rating[over[0].rating.length - 1]?.watts ?? 0, 'W', 3) })}
            {over.every((part) => part.smallest)
              ? t('res.dd.overUseSize', { size: CHIP_SIZES.filter((size) => over.some((part) => part.smallest === size.imperial)).pop()?.imperial ?? '' })
              : t('res.dd.overPowerRes')}
          </span>
        </p>
      )}
      <p className={combos.detailNote}>
        {t('res.dd.chipNote', { chip: a.chipSize, power: formatAmount(chip?.power ?? 0, 'W', 3), maxTemp: temperatureText(chip?.maxTemperature ?? 155) })}
      </p>
      {onValue && (
        <p className={css.use}>
          <button type="button" className={combos.button} onClick={() => onValue(ohms)}>{t('res.dd.useAsVal', { ohms: formatOhms(ohms) })}</button>
          <span>{t('res.dd.followNote')}</span>
        </p>
      )}
    </div>
  );
}
