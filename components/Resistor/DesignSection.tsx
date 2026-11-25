import React, { useEffect, useMemo, useState } from 'react';

import {
  CHIP_SIZES, Circuit as EngineCircuit, CircuitId, DESIGN_TEMPERATURES, ParsedList, SERIES, SeriesId, StoredList, SuggestOptions, Suggestions,
  TECHNOLOGIES, analyseCircuit, cancelSuggest, circuitDef, formatAmount, formatCount, formatOhms, formatPct, formatRange, networkKey, readAmount,
  sameValues, series, seriesList, startSuggest, stopSuggestWorker, suggestPlace, technology, usualSeries,
} from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Resistor.module.css';
import Bibliography from '../Bibliography';
import combos from '../../styles/ResistorCombos.module.css';
import css from '../../styles/ResistorDesign.module.css';
import Circuit from './Circuit';
import { RangeField } from './Combinations';
import DesignDetails from './DesignDetails';
import Schematic from './Schematic';
import {
  Design as DesignState, FAMILIES, Field, MAX_TEMPERATURES, PAIR_LEG_LIMIT, TEMPERATURE_LIMITS, answerText, candidateText, unbroken,
  cleanTemperatures, designFields, errorText, designOptions, designRange, fieldText, isTwoLegs, legsText, outputText, parseDesign, spanText, specText,
  technologyFor, temperatureText, temperaturesText,
} from './design';
import { CheckIcon, CloseIcon, CopyButton, DownIcon, InfoIcon, Segmented, UpIcon } from './parts';

interface Props {
  design: DesignState;
  onDesign: (patch: Partial<DesignState>) => void;
  lists: { list: StoredList; parsed: ParsedList }[];
  onValue: (ohms: number) => void;
  bib: Bibliography;
}

interface Shown {
  found: Suggestions;
  circuit: EngineCircuit;
  target: number;
  options: SuggestOptions;
  source: string;
}

const FIRST = 6;
const MORE = 10;
const pct3 = (value: number) => `${Number(Math.abs(value).toPrecision(3))} %`;
const WHY_KEY: Record<string, string> = {
  needed: 'res.d.why.needed',
  'not a number': 'res.d.why.notNumber',
  'not zero': 'res.d.why.notZero',
  'not negative': 'res.d.why.notNeg',
  'too small': 'res.d.why.tooSmall',
  'too large': 'res.d.why.tooLarge',
  'below the smallest': 'res.d.why.belowSmallest',
};

function Quantity({ field, text, error, onText, wide }: { field: Field; text: string; error?: string; onText: (text: string) => void; wide?: boolean }) {
  const { t } = useI18n();
  const unitName = field.unit === 'V' ? t('res.d.unit.V') : field.unit === 'A' ? t('res.d.unit.A') : t('res.d.unit.ohm');
  const errLabel = error ? (WHY_KEY[error] ? t(WHY_KEY[error]) : error) : '';
  return (
    <>
      <input
        className={[styles.numberInput, wide ? css.wideInput : css.input].join(' ')}
        aria-label={`${field.label}${field.unit ? `, ${unitName}` : ''}`}
        aria-invalid={error ? true : undefined}
        value={text}
        placeholder={field.placeholder}
        inputMode="text"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onText(event.target.value)}
      />
      {field.unit && <span className={css.unit}>{field.unit}</span>}
      <span className={css.hint} data-bad={error ? 'true' : undefined}>{error ? errLabel : field.hint}</span>
    </>
  );
}

export default function DesignSection({ design, onDesign, lists, onValue, bib }: Props) {
  const { locale, t } = useI18n();
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState<'worker' | 'page' | null>(null);
  const [failed, setFailed] = useState('');
  const [count, setCount] = useState(FIRST);
  const [open, setOpen] = useState<string | null>(null);
  const [newTemp, setNewTemp] = useState('');

  const numLocale = locale === 'nb' ? 'nb-NO' : 'en-US';
  const resistors = (n: number) => (n === 1 ? t('res.c.resistor1') : t('res.c.resistorsN', { n }));
  const whyText = (code?: string) => (code ? (WHY_KEY[code] ? t(WHY_KEY[code]) : code) : '');

  useEffect(() => () => stopSuggestWorker(), []);

  useEffect(() => {
    if (!design.list) return;
    if (design.listId) {
      const item = lists.find((entry) => entry.list.id === design.listId);
      if (!item) onDesign({ listId: null });
      else if (item.list.name !== design.list.name || !sameValues(item.parsed.values, design.list.values)) onDesign({ list: { name: item.list.name, values: item.parsed.values } });
    } else {
      const match = lists.find((entry) => entry.list.name === design.list.name && sameValues(entry.parsed.values, design.list.values));
      if (match) onDesign({ listId: match.list.id });
    }
  }, [lists, design.list, design.listId, onDesign]);

  const def = circuitDef(design.circuit);
  const family = FAMILIES.find((entry) => entry.circuits.includes(design.circuit));
  const two = isTwoLegs(design.circuit);
  const fields = designFields(design.circuit, locale);
  const parsed = parseDesign(design, locale);
  const tech = technology(design.tech);

  const usual = usualSeries(parsed.spec.tolerancePct > 0 ? parsed.spec.tolerancePct : 1);
  const seriesId: SeriesId = design.series ?? usual;
  const [min, max] = designRange(design);
  const listValues = design.list?.values;
  const values = useMemo(() => listValues ?? seriesList(seriesId, min, max), [listValues, seriesId, min, max]);
  const source = design.list ? t('res.c.theList', { name: design.list.name }) : `${series(seriesId).label} (${formatRange(min, max)})`;
  const pairsAllowed = values.length <= PAIR_LEG_LIMIT;

  const options = designOptions(design, parsed, values.length);
  const runnable = !parsed.problem && values.length > 0;
  const key = runnable ? JSON.stringify([parsed.circuit, parsed.target, options, source]) : '';
  useEffect(() => {
    if (!key) {
      cancelSuggest();
      setShown(null);
      setBusy(false);
      return undefined;
    }
    const [circuit, target, opts, from] = JSON.parse(key) as [EngineCircuit, number, SuggestOptions, string];
    let stale = false;
    setBusy(true);
    startSuggest({ circuit, target, values, options: opts })
      .then((found) => {
        if (stale || !found) return;
        setShown({ found, circuit, target, options: opts, source: from });
        setBusy(false);
        setFailed('');
        setPlace(suggestPlace());
      })
      .catch((error) => {
        if (stale) return;
        setBusy(false);
        setFailed(String(error?.message ?? error));
      });
    return () => { stale = true; };
  }, [key, values]);

  const setText = (id: string, text: string) => onDesign({ texts: { ...design.texts, [`${design.circuit}.${id}`]: text } });
  const choose = (circuit: CircuitId) => {
    const patch: Partial<DesignState> = { circuit };
    if ((circuit === 'shunt') !== (design.circuit === 'shunt')) Object.assign(patch, { min: null, max: null });
    onDesign(patch);
    setOpen(null);
    setCount(FIRST);
  };
  const chooseValues = (choice: string) => {
    if (choice === 'shared') return;
    if (choice.startsWith('list:')) {
      const item = lists.find((entry) => entry.list.id === choice.slice(5));
      if (item) onDesign({ listId: item.list.id, list: { name: item.list.name, values: item.parsed.values } });
    } else onDesign({ listId: null, list: null, series: choice === 'auto' ? null : (choice as SeriesId) });
  };
  const addTemperature = () => {
    const value = readAmount(newTemp);
    if (value === null) return;
    const next = cleanTemperatures([...design.temps, value]);
    if (next.length > design.temps.length) onDesign({ temps: next });
    setNewTemp('');
  };
  const typedTemp = readAmount(newTemp);
  const tempProblem = !newTemp.trim() ? '' : typedTemp === null ? t('res.d.why.notNumber')
    : typedTemp < TEMPERATURE_LIMITS[0] || typedTemp > TEMPERATURE_LIMITS[1] ? t('res.d.tempRange', { low: TEMPERATURE_LIMITS[0], high: TEMPERATURE_LIMITS[1] })
      : design.temps.length >= MAX_TEMPERATURES ? t('res.d.tempMax', { max: MAX_TEMPERATURES }) : '';
  const defaultTemps = design.temps.length === DESIGN_TEMPERATURES.length && design.temps.every((temp, i) => temp === DESIGN_TEMPERATURES[i]);

  const q: Record<string, string> = {};
  for (const field of fields.inputs) {
    const value = parsed.circuit.inputs[field.id];
    q[field.id] = value === undefined ? '' : field.unit === 'Ω' ? formatOhms(value, 4) : formatAmount(value, field.unit, 4);
  }
  q.target = Number.isFinite(parsed.target) ? outputText(design.circuit, parsed.target) : '';

  const outsideTech = tech && !parsed.errors.tol && !parsed.errors.tcr
    && (parsed.spec.tolerancePct < tech.tolerances[0] || parsed.spec.tolerancePct > tech.tolerances[1] || parsed.spec.tcrPpm < tech.tcrs[0] || parsed.spec.tcrPpm > tech.tcrs[1]);

  const found = shown?.found;
  const id = shown?.circuit.id;
  const answer = shown ? answerText(id, found, shown.options, shown.source, locale) : null;
  const applySpec = () => {
    if (!answer?.apply) return;
    onDesign({
      tol: String(answer.apply.tolerancePct), tcr: String(answer.apply.tcrPpm), tech: technologyFor(answer.apply, design.tech),
      ...(design.list ? {} : { series: seriesId }),
    });
  };
  const rows = found?.candidates ?? [];
  const visible = rows.slice(0, count);
  const tooHot = useMemo(
    () => (shown ? shown.found.candidates.slice(0, count).map((c) => analyseCircuit(shown.circuit, c.legs, shown.target, shown.options).parts.some((part) => !part.carries)) : []),
    [shown, count],
  );
  const selected = design.list ? (design.listId ? `list:${design.listId}` : 'shared') : design.series ?? 'auto';
  const currentOf = design.circuit === 'divider' ? t('res.d.curOfDiv') : design.circuit === 'feedback' ? t('res.d.curOfFb') : t('res.d.curOfGain');
  const valCountText = values.length === 1
    ? t('res.c.value1', { n: values.length.toLocaleString(numLocale) })
    : t('res.c.valuesN', { n: values.length.toLocaleString(numLocale) });

  const applyTechId = answer?.apply ? technologyFor(answer.apply, design.tech) : design.tech;
  const applyTechSuffix = applyTechId !== design.tech ? ` (${t(`res.d.tech.${applyTechId}`).toLowerCase()})` : '';

  return (
    <>
      <div className={[styles.block, combos.combos, css.design].join(' ')}>
        <div className={styles.blockHead}>
          <h3>{t('res.d.head1')}</h3>
          <span className={styles.blockMeta}>{t('res.d.meta1')}</span>
        </div>
        <div className={css.row} data-stack>
          <span className={styles.label}>{t('res.d.circuit')}</span>
          <div className={combos.control}>
            <Segmented label={t('res.d.kindCircuitAria')} value={family.id} onChange={(next) => { if (next !== family.id) choose(FAMILIES.find((entry) => entry.id === next).circuits[0]); }}
              options={FAMILIES.map((entry) => ({ value: entry.id, label: t(`res.d.fam.${entry.id}`), title: t(`res.d.fam.${entry.id}Title`) }))} />
            {family.circuits.length > 1 && (
              <Segmented label={t('res.d.circuitAria')} value={design.circuit} onChange={choose} options={family.circuits.map((circuit) => ({ value: circuit, label: t(`res.d.var.${circuit}`), title: t(`res.d.circ.${circuit}`) }))} />
            )}
          </div>
        </div>
        <div className={css.figure}>
          <Schematic circuit={design.circuit} q={q} />
          <div className={css.about}>
            <b>{t(`res.d.circ.${design.circuit}`)}</b>
            <span className={styles.num}>{def.formula.replace('volts', 'V').replace('drop', 'Vdrop').replace('amps', 'I').replace(/vin/g, 'Vin').replace(/load/g, 'Rload').replace('vref', 'Vref').replace('ifb', 'Ifb')}</span>
            {def.legs.map((leg) => <span key={leg.id}><i className={styles.num}>{leg.id}</i> {t(`res.d.leg.${design.circuit}.${leg.id}`)}</span>)}
          </div>
        </div>
        {fields.inputs.map((field) => (
          <div key={field.id} className={css.row}>
            <span className={styles.label}>{field.label}</span>
            <div className={combos.control}><Quantity field={field} text={fieldText(design, field.id)} error={parsed.errors[field.id]} onText={(text) => setText(field.id, text)} /></div>
          </div>
        ))}
        <div className={css.row} data-target>
          <span className={styles.label}>{t('res.d.fld.target')}</span>
          <div className={combos.control}><Quantity field={fields.target} text={fieldText(design, 'target')} error={parsed.errors.target} onText={(text) => setText('target', text)} /></div>
        </div>
        <div className={css.row}>
          <span className={styles.label}>{t('res.d.allowed')}</span>
          <div className={combos.control}>
            <span className={css.unit}>±</span>
            <input className={[styles.numberInput, css.input].join(' ')} aria-label={t('res.d.allowedAria')} aria-invalid={parsed.errors.allowed ? true : undefined}
              value={design.allowed} inputMode="decimal" spellCheck={false} onChange={(event) => onDesign({ allowed: event.target.value })} />
            <span className={css.unit}>%</span>
            <span className={css.hint} data-bad={parsed.errors.allowed ? 'true' : undefined}>{parsed.errors.allowed ? whyText(parsed.errors.allowed) : t('res.d.allowedHint')}</span>
          </div>
        </div>
      </div>

      <div className={[styles.block, combos.combos, css.design].join(' ')}>
        <div className={styles.blockHead}>
          <h3>{t('res.d.head2')}</h3>
          <span className={[styles.blockMeta, styles.num].join(' ')}>{!parsed.errors.tol && !parsed.errors.tcr ? specText(parsed.spec) : ''}</span>
        </div>
        <div className={css.row}>
          <span className={styles.label}>{t('res.d.parts')}</span>
          <div className={combos.control}>
            <select className={styles.select} aria-label={t('res.d.parts')} value={design.tech}
              onChange={(event) => { const next = technology(event.target.value); onDesign({ tech: next.id, tol: String(next.tolerancePct), tcr: String(next.tcrPpm) }); }}>
              {TECHNOLOGIES.map((entry) => <option key={entry.id} value={entry.id}>{t(`res.d.tech.${entry.id}`)}</option>)}
            </select>
            <span className={css.pair}>
              <span className={css.unit}>±</span>
              <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label={t('res.d.tolAria')} aria-invalid={parsed.errors.tol ? true : undefined}
                value={design.tol} inputMode="decimal" spellCheck={false} onChange={(event) => onDesign({ tol: event.target.value })} />
              <span className={css.unit}>%</span>
            </span>
            <span className={css.pair}>
              <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label={t('res.d.tcrAria')} aria-invalid={parsed.errors.tcr ? true : undefined}
                value={design.tcr} inputMode="decimal" spellCheck={false} onChange={(event) => onDesign({ tcr: event.target.value })} />
              <span className={css.unit}>ppm/K</span>
            </span>
            <span className={css.hint} data-wide>
              {t('res.d.techUsual', { note: t(`res.d.tech.${tech.id}.note`), t0: formatPct(tech.tolerances[0]), t1: formatPct(tech.tolerances[1]), c0: tech.tcrs[0], c1: tech.tcrs[1] })}
              {outsideTech && <b>{t('res.d.outsideTech')}</b>}
            </span>
          </div>
        </div>
        <div className={css.row}>
          <span className={styles.label}>{t('res.d.temperatures')}</span>
          <div className={combos.control}>
            <ul className={css.chips} aria-label={t('res.d.tempsAria')}>
              {design.temps.map((temp) => (
                <li key={temp} className={css.chip}>
                  <span className={styles.num}>{temperatureText(temp)}</span>
                  <button type="button" disabled={design.temps.length === 1} aria-label={t('res.vl.removeAria', { text: temperatureText(temp) })} title={design.temps.length === 1 ? t('res.d.oneTempMustStay') : t('res.vl.removeAria', { text: temperatureText(temp) })}
                    onClick={() => onDesign({ temps: design.temps.filter((entry) => entry !== temp) })}><CloseIcon /></button>
                </li>
              ))}
            </ul>
            <span className={css.pair}>
              <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label={t('res.d.addTempAria')} aria-invalid={tempProblem ? true : undefined} value={newTemp} placeholder={t('res.d.addPlaceholder')}
                inputMode="text" spellCheck={false} onChange={(event) => setNewTemp(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !tempProblem) addTemperature(); }} />
              <span className={css.unit}>°C</span>
              <button type="button" className={combos.button} disabled={!newTemp.trim() || !!tempProblem} onClick={addTemperature}>{t('res.d.add')}</button>
            </span>
            {tempProblem && <span className={css.hint} data-bad="true">{tempProblem}</span>}
            {!defaultTemps && <button type="button" className={combos.linkButton} onClick={() => onDesign({ temps: DESIGN_TEMPERATURES })}>{t('res.d.resetTemps')}</button>}
          </div>
        </div>
        <div className={css.row}>
          <span className={styles.label}>{t('res.d.drift')}</span>
          <div className={combos.control}>
            <Segmented label={t('res.d.driftAria')} value={design.drift} onChange={(drift) => onDesign({ drift })}
              options={[
                { value: 'independent', label: t('res.d.independent'), title: t('res.d.independentTitle') },
                { value: 'tracking', label: t('res.d.tracking'), title: t('res.d.trackingTitle') },
              ]} />
            {design.drift === 'tracking' && (
              <span className={css.pair}>
                <span className={css.hint}>{t('res.d.apartBy')}</span>
                <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label={t('res.d.spreadAria')} aria-invalid={parsed.errors.spread ? true : undefined}
                  value={design.spread} placeholder="0" inputMode="decimal" spellCheck={false} onChange={(event) => onDesign({ spread: event.target.value })} />
                <span className={css.unit}>ppm/K</span>
              </span>
            )}
          </div>
        </div>
        <div className={css.row}>
          <span className={styles.label}>{t('res.c.values')}</span>
          <div className={combos.control}>
            <select className={styles.select} aria-label={t('res.d.chooseValsAria')} value={selected} onChange={(event) => chooseValues(event.target.value)}>
              <option value="auto">{t('res.c.autoOpt', { series: series(usual).label, tol: `±${formatPct(parsed.spec.tolerancePct > 0 ? parsed.spec.tolerancePct : 1)}` })}</option>
              {SERIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              {(lists.length > 0 || (design.list && !design.listId)) && (
                <optgroup label={t('res.c.myValues')}>
                  {design.list && !design.listId && <option value="shared">{t('res.c.fromLink', { name: design.list.name })}</option>}
                  {lists.map(({ list, parsed: read }) => <option key={list.id} value={`list:${list.id}`} disabled={!read.values.length}>{list.name || t('res.c.unnamed')}</option>)}
                </optgroup>
              )}
            </select>
            {!design.list && (
              <span className={combos.range}>
                <RangeField label={t('res.c.smallestVal')} ohms={min} onCommit={(value) => value < max && (onDesign({ min: value, max }), true)} />
                <span>{t('res.to')}</span>
                <RangeField label={t('res.c.largestVal')} ohms={max} onCommit={(value) => value > min && (onDesign({ min, max: value }), true)} />
              </span>
            )}
            <span className={[styles.num, combos.count].join(' ')} data-testid="design-count">{valCountText}</span>
            <button type="button" className={combos.linkButton} onClick={() => document.getElementById('my-values')?.scrollIntoView({ block: 'start' })}>{t('res.c.myValues')}</button>
          </div>
        </div>
        {two ? (
          <>
            <div className={css.row}>
              <span className={styles.label}>{t('res.d.eachResistance')}</span>
              <div className={combos.control}>
                {pairsAllowed ? (
                  <Segmented label={t('res.d.legPartsAria')} value={design.legParts} onChange={(legParts) => { onDesign({ legParts }); setCount(FIRST); }}
                    options={[
                      { value: 1, label: t('res.d.oneValue'), title: t('res.d.oneValueTitle') },
                      { value: 2, label: t('res.d.upToTwo'), title: t('res.d.upToTwoTitle') },
                    ]} />
                ) : (
                  <span className={css.hint} data-wide>
                    {t('res.d.pairLimitNote', { limit: PAIR_LEG_LIMIT, count: values.length.toLocaleString(numLocale) })}
                  </span>
                )}
              </div>
            </div>
            <div className={css.row}>
              <span className={styles.label}>R1 + R2</span>
              <div className={combos.control}>
                <span className={combos.range}>
                  <RangeField label={t('res.d.sumMinAria')} ohms={design.totalMin} onCommit={(value) => value < design.totalMax && (onDesign({ totalMin: value }), true)} />
                  <span>{t('res.to')}</span>
                  <RangeField label={t('res.d.sumMaxAria')} ohms={design.totalMax} onCommit={(value) => value > design.totalMin && (onDesign({ totalMax: value }), true)} />
                </span>
                <span className={css.hint}>{t('res.d.sumHintPre')}<span className={styles.num}>{formatOhms(Math.sqrt(design.totalMin * design.totalMax), 2)}</span>{t('res.d.sumHintPost')}</span>
              </div>
            </div>
            <div className={css.row}>
              <span className={styles.label}>{t('res.d.fld.amps')}</span>
              <div className={combos.control}>
                <span className={combos.range}>
                  <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label={t('res.d.curMinAria')} aria-invalid={parsed.errors.currentMin ? true : undefined}
                    value={design.currentMin} placeholder={t('res.d.any')} spellCheck={false} onChange={(event) => onDesign({ currentMin: event.target.value })} />
                  <span>{t('res.to')}</span>
                  <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label={t('res.d.curMaxAria')} aria-invalid={parsed.errors.currentMax ? true : undefined}
                    value={design.currentMax} placeholder={t('res.d.any')} spellCheck={false} onChange={(event) => onDesign({ currentMax: event.target.value })} />
                  <span className={css.unit}>A</span>
                </span>
                <span className={css.hint} data-bad={parsed.errors.currentMin || parsed.errors.currentMax ? 'true' : undefined}>
                  {whyText(parsed.errors.currentMin ?? parsed.errors.currentMax) || t('res.d.curHint', { of: currentOf })}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className={css.row}>
            <span className={styles.label}>{t('res.c.resistors')}</span>
            <div className={combos.control}>
              <Segmented label={t('res.d.maxResAria')} value={design.maxParts} onChange={(maxParts) => { onDesign({ maxParts }); setCount(FIRST); }}
                options={[1, 2, 3].map((n) => ({ value: n, label: n === 1 ? '1' : t('res.c.upToN', { n }), title: n === 1 ? t('res.d.oneResTitle') : t('res.d.upToNResTitle', { n }) }))} />
              <span className={css.hint}>{t('res.d.fewerFirstHint')}</span>
            </div>
          </div>
        )}
        <div className={css.row}>
          <span className={styles.label}>{t('res.d.chipSize')}</span>
          <div className={combos.control}>
            <select className={styles.select} aria-label={t('res.d.chipSizeAria')} value={design.chip} onChange={(event) => onDesign({ chip: event.target.value })}>
              {CHIP_SIZES.map((size) => <option key={size.imperial} value={size.imperial}>{size.imperial} ({size.metric} {t('res.metric')}), {formatAmount(size.power, 'W', 3)}</option>)}
            </select>
            <span className={css.hint}>{t('res.d.chipSizeHint')}</span>
          </div>
        </div>
      </div>

      <div className={[styles.block, combos.combos, css.design].join(' ')}>
        <div className={styles.blockHead}>
          <h3>{t('res.d.suggestions')}</h3>
          <span className={[styles.blockMeta, styles.num].join(' ')}>{found?.candidates.length ? t('res.d.passingMeta', { passing: found.passing, total: found.candidates.length, pct: formatPct(shown.options.allowedPct) }) : ''}</span>
        </div>
        {parsed.problem && <p className={[styles.message, css.problem].join(' ')} data-testid="design-problem"><InfoIcon /><span>{parsed.problem}</span></p>}
        {!parsed.problem && !values.length && (
          <p className={[styles.message, css.problem].join(' ')}><InfoIcon /><span>{design.list ? t('res.c.emptyList') : t('res.c.emptyRange', { series: series(seriesId).label, range: formatRange(min, max) })}</span></p>
        )}
        <div className={css.found} data-busy={busy || undefined}>
          {answer && (
            <div className={css.answer} data-kind={answer.kind} data-testid="design-answer">
              {answer.kind === 'pass' ? <CheckIcon size={18} /> : <InfoIcon />}
              <p>{unbroken(answer.text)}</p>
              {answer.apply && (
                <button type="button" className={combos.button} data-primary onClick={applySpec} data-testid="design-apply">
                  {t('res.d.usePartsBtn', { spec: specText(answer.apply), tech: applyTechSuffix })}
                </button>
              )}
            </div>
          )}
          {runnable && (
            <p className={combos.status} data-testid="design-status" data-place={place ?? ''} data-busy={busy || !shown} aria-live="polite">
              {failed ? t('res.d.failed', { err: failed })
                : !shown ? t('res.d.looking')
                  : <>
                    {t('res.d.compared', {
                      count: formatCount(found.considered),
                      what: found.ideal === null ? t('res.d.pairsRes') : (found.considered === 1 ? t('res.c.net1') : t('res.c.nets')),
                      vals: found.values === 1 ? t('res.c.value1', { n: found.values.toLocaleString(numLocale) }) : t('res.c.valuesN', { n: found.values.toLocaleString(numLocale) }),
                      source: shown.source,
                      ms: found.ms < 1 ? t('res.c.under1') : Math.round(found.ms).toLocaleString(numLocale),
                      onPage: place === 'page' ? t('res.c.onPage') : '',
                    })}
                    {found.ideal !== null && Number.isFinite(found.ideal) && <>{t('res.d.exactWouldBe')}<span className={styles.num}>{formatOhms(found.ideal, 5)}</span>.</>}
                    {found.note && found.candidates.length > 0 ? ` ${found.note}` : ''}
                  </>}
            </p>
          )}
          {shown && rows.length > 0 && (
            <>
              <ol className={combos.results} aria-label={t('res.d.listAria')} data-testid="design-list">
                {visible.map((c, i) => {
                  const itemKey = c.legs.map(networkKey).join('|');
                  const isOpen = open === itemKey;
                  const text = legsText(id, c.legs, locale);
                  return (
                    <li key={itemKey} className={combos.result} data-open={isOpen} data-pass={c.passes}>
                      <div className={css.main}>
                        <span className={[styles.num, combos.rank].join(' ')}>{i + 1}</span>
                        <div className={css.legs}>
                          {c.legs.map((leg, k) => (
                            <div key={k} className={css.leg}>
                              {c.legs.length > 1 && <span className={styles.num}>R{k + 1}</span>}
                              <Circuit network={leg} />
                            </div>
                          ))}
                        </div>
                        <div className={combos.what}>
                          <div className={[styles.num, combos.formula].join(' ')} data-testid="design-formula">{text}</div>
                          <div className={combos.sub}>
                            {resistors(c.parts)}
                            {c.legs.length > 1 && <> · {t('res.d.sum')} <span className={styles.num}>{formatOhms(c.total, 4)}</span></>}
                            {c.legs.length > 1 && c.current !== null && <> · <span className={styles.num}>{formatAmount(c.current, 'A', 3)}</span></>}
                            {c.legs.length === 1 && c.parts > 1 && <> · <span className={styles.num}>{formatOhms(c.ohms[0], 5)}</span></>}
                            {' '}· RSS <span className={styles.num}>±{pct3(c.rssPct)}</span>
                            {tooHot[i] && <> · <b className={css.out} title={t('res.d.tooHotTitle')}>{t('res.d.tooHot', { chip: shown.options.chipSize })}</b></>}
                          </div>
                        </div>
                        <div className={css.numbers}>
                          <span className={[styles.num, css.gives].join(' ')}>{outputText(id, c.output)}</span>
                          <span className={[styles.num, styles.error].join(' ')}>{errorText(c.errorPct)}</span>
                          <span className={[styles.num, css.worst].join(' ')} title={t('res.d.worstTitle', { temp: temperatureText(c.temperature) })}>{spanText(c.minPct, c.maxPct, locale)}</span>
                        </div>
                        <div className={css.verdict} data-pass={c.passes}>
                          <b>{c.passes && <CheckIcon size={13} />}{c.passes ? t('res.d.insideWord') : t('res.d.outsideWord')}</b>
                          <span className={styles.num}>{c.passes ? t('res.d.toSpare', { pct: pct3(c.margin) }) : t('res.d.byPct', { pct: pct3(c.margin) })}</span>
                        </div>
                        <div className={combos.actions}>
                          <CopyButton text={() => candidateText(id, c, shown.options.allowedPct, shown.options.temperatures, locale)} label="" title={t('res.c.copyTextTitle', { text })} />
                          <button type="button" className={combos.toggle} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : itemKey)} title={t('res.d.openDetailsTitle')} aria-label={t('res.c.detailsAria', { formula: text })}>
                            {isOpen ? <UpIcon /> : <DownIcon />}
                          </button>
                        </div>
                      </div>
                      {isOpen && <DesignDetails circuit={shown.circuit} candidate={c} target={shown.target} options={shown.options} onValue={c.legs.length === 1 ? onValue : undefined} />}
                    </li>
                  );
                })}
              </ol>
              {rows.length > count && (
                <button type="button" className={combos.more} onClick={() => setCount(count + MORE)}>{t('res.c.showMore')} <span className={styles.num}>{t('res.c.ofCount', { shown: count, total: rows.length })}</span></button>
              )}
              <p className={styles.caption}>
                {t('res.d.cap1', { pct: formatPct(shown.options.allowedPct), temps: temperaturesText(shown.options.temperatures, locale), twoNote: id && isTwoLegs(id) ? t('res.d.cap1Two') : '' })}
              </p>
              <p className={styles.caption}>
                <b>{t('res.d.cap2a')}</b>{t('res.d.cap2b')}
                <b>RSS</b>{t('res.d.cap2c')}{bib.cite('TISNVA112')}.
              </p>
              <p className={styles.caption}>
                <b>{t('res.d.tracking')}</b>{t('res.d.cap3a')}{bib.cite('YageoRC')} {bib.cite('VishayCRCW')}.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
