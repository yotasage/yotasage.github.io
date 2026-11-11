import React, { useEffect, useMemo, useState } from 'react';

import {
  CHIP_SIZES, Circuit as EngineCircuit, CircuitId, DESIGN_TEMPERATURES, ParsedList, SERIES, SeriesId, StoredList, SuggestOptions, Suggestions,
  TECHNOLOGIES, analyseCircuit, cancelSuggest, circuitDef, formatAmount, formatCount,  formatOhms, formatPct, formatRange, networkKey, readAmount,
  sameValues, series, seriesList, startSuggest, stopSuggestWorker, suggestPlace, technology, usualSeries,
} from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import Bibliography from '../Bibliography';
import combos from '../../styles/ResistorCombos.module.css';
import css from '../../styles/ResistorDesign.module.css';
import Circuit from './Circuit';
import { RangeField } from './Combinations';
import DesignDetails from './DesignDetails';
import Schematic from './Schematic';
import {
  Design as DesignState, FAMILIES, Field, MAX_TEMPERATURES, PAIR_LEG_LIMIT, TEMPERATURE_LIMITS, VARIANTS, answerText, candidateText, unbroken,
  cleanTemperatures, designFields, errorText, designOptions, designRange, fieldText, isTwoLegs, legsText, outputText, parseDesign, spanText, specText,
  technologyFor, temperatureText, temperaturesText,
} from './design';
import { CheckIcon, CloseIcon, CopyButton, DownIcon, InfoIcon, Ohms, Segmented, UpIcon } from './parts';

interface Props {
  design: DesignState;
  onDesign: (patch: Partial<DesignState>) => void;
  // The visitor's own value lists, as the Combinations section reads them from the browser.
  lists: { list: StoredList; parsed: ParsedList }[];
  // Makes a resistance the tool's current value.
  onValue: (ohms: number) => void;
  bib: Bibliography;
}

// What the results on the page were found for; they stay, dimmed, while newer ones are on the way.
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
const resistors = (n: number) => `${n} resistor${n === 1 ? '' : 's'}`;
const WHY: Record<string, string> = {
  needed: 'needed', 'not a number': 'not a number', 'not zero': 'must not be zero', 'not negative': 'must not be negative', 'too small': 'too small',
  'too large': 'too large', 'below the smallest': 'must be above the smallest',
};

// A quantity as typed, with its unit and a quiet word on what it is or why it cannot be read.
function Quantity({ field, text, error, onText, wide }: { field: Field; text: string; error?: string; onText: (text: string) => void; wide?: boolean }) {
  return (
    <>
      <input
        className={[styles.numberInput, wide ? css.wideInput : css.input].join(' ')}
        aria-label={`${field.label}${field.unit ? `, in ${field.unit === 'V' ? 'volts' : field.unit === 'A' ? 'amperes' : 'ohms'}` : ''}`}
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
      <span className={css.hint} data-bad={error ? 'true' : undefined}>{error ? WHY[error] ?? error : field.hint}</span>
    </>
  );
}

// The Design section: which resistors give a circuit its target, and whether it holds over tolerance and temperature.
export default function DesignSection({ design, onDesign, lists, onValue, bib }: Props) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState<'worker' | 'page' | null>(null);
  const [failed, setFailed] = useState('');
  const [count, setCount] = useState(FIRST);
  const [open, setOpen] = useState<string | null>(null);
  const [newTemp, setNewTemp] = useState('');

  useEffect(() => () => stopSuggestWorker(), []);

  // A list in use follows its text in "My values"; a list from a link is found among the lists kept here.
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
  const fields = designFields(design.circuit);
  const parsed = parseDesign(design);
  const tech = technology(design.tech);

  const usual = usualSeries(parsed.spec.tolerancePct > 0 ? parsed.spec.tolerancePct : 1);
  const seriesId: SeriesId = design.series ?? usual;
  const [min, max] = designRange(design);
  const listValues = design.list?.values;
  const values = useMemo(() => listValues ?? seriesList(seriesId, min, max), [listValues, seriesId, min, max]);
  const source = design.list ? `the list “${design.list.name}”` : `${series(seriesId).label} (${formatRange(min, max)})`;
  const pairsAllowed = values.length <= PAIR_LEG_LIMIT;

  const options = designOptions(design, parsed, values.length);
  const runnable = !parsed.problem && values.length > 0;
  // The request as a text: the effect below runs when what is asked for changes, not on every render.
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
    // A shunt is milliohms: a range set for the other circuits does not follow it there, nor back.
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
  const tempProblem = !newTemp.trim() ? '' : typedTemp === null ? 'not a number'
    : typedTemp < TEMPERATURE_LIMITS[0] || typedTemp > TEMPERATURE_LIMITS[1] ? `from ${TEMPERATURE_LIMITS[0]} to ${TEMPERATURE_LIMITS[1]} °C`
      : design.temps.length >= MAX_TEMPERATURES ? `at most ${MAX_TEMPERATURES}` : '';
  const defaultTemps = design.temps.length === DESIGN_TEMPERATURES.length && design.temps.every((t, i) => t === DESIGN_TEMPERATURES[i]);

  // The quantities beside the schematic, as the engine reads them.
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
  const answer = shown ? answerText(id, found, shown.options, shown.source) : null;
  const applySpec = () => {
    if (!answer?.apply) return;
    // The series stays the one that was searched, so the candidate that the sentence names is still there.
    onDesign({
      tol: String(answer.apply.tolerancePct), tcr: String(answer.apply.tcrPpm), tech: technologyFor(answer.apply, design.tech),
      ...(design.list ? {} : { series: seriesId }),
    });
  };
  const rows = found?.candidates ?? [];
  const visible = rows.slice(0, count);
  // Whether a resistor of a visible suggestion dissipates more than the chosen chip size carries when hottest.
  const tooHot = useMemo(
    () => (shown ? shown.found.candidates.slice(0, count).map((c) => analyseCircuit(shown.circuit, c.legs, shown.target, shown.options).parts.some((part) => !part.carries)) : []),
    [shown, count],
  );
  const selected = design.list ? (design.listId ? `list:${design.listId}` : 'shared') : design.series ?? 'auto';
  const currentOf = design.circuit === 'divider' ? 'drawn from the input' : design.circuit === 'feedback' ? 'through R2' : 'through R1 and R2; it needs a signal voltage';

  return (
    <>
      <div className={[styles.block, combos.combos, css.design].join(' ')}>
        <div className={styles.blockHead}>
          <h3>The circuit and its target</h3>
          <span className={styles.blockMeta}>which resistors, and does it hold over temperature</span>
        </div>
        <div className={css.row} data-stack>
          <span className={styles.label}>Circuit</span>
          <div className={combos.control}>
            <Segmented label="The kind of circuit" value={family.id} onChange={(next) => { if (next !== family.id) choose(FAMILIES.find((entry) => entry.id === next).circuits[0]); }}
              options={FAMILIES.map((entry) => ({ value: entry.id, label: entry.label, title: entry.title }))} />
            {family.circuits.length > 1 && (
              <Segmented label="The circuit" value={design.circuit} onChange={choose} options={family.circuits.map((circuit) => ({ value: circuit, label: VARIANTS[circuit], title: circuitDef(circuit).label }))} />
            )}
          </div>
        </div>
        <div className={css.figure}>
          <Schematic circuit={design.circuit} q={q} />
          <div className={css.about}>
            <b>{def.label}</b>
            <span className={styles.num}>{def.formula.replace('volts', 'V').replace('drop', 'Vdrop').replace('amps', 'I').replace(/vin/g, 'Vin').replace(/load/g, 'Rload').replace('vref', 'Vref').replace('ifb', 'Ifb')}</span>
            {def.legs.map((leg) => <span key={leg.id}><i className={styles.num}>{leg.id}</i> {leg.role}</span>)}
          </div>
        </div>
        {fields.inputs.map((field) => (
          <div key={field.id} className={css.row}>
            <span className={styles.label}>{field.label}</span>
            <div className={combos.control}><Quantity field={field} text={fieldText(design, field.id)} error={parsed.errors[field.id]} onText={(text) => setText(field.id, text)} /></div>
          </div>
        ))}
        <div className={css.row} data-target>
          <span className={styles.label}>Target</span>
          <div className={combos.control}><Quantity field={fields.target} text={fieldText(design, 'target')} error={parsed.errors.target} onText={(text) => setText('target', text)} /></div>
        </div>
        <div className={css.row}>
          <span className={styles.label}>Allowed</span>
          <div className={combos.control}>
            <span className={css.unit}>±</span>
            <input className={[styles.numberInput, css.input].join(' ')} aria-label="Allowed deviation of the output, in percent of the target" aria-invalid={parsed.errors.allowed ? true : undefined}
              value={design.allowed} inputMode="decimal" spellCheck={false} onChange={(event) => onDesign({ allowed: event.target.value })} />
            <span className={css.unit}>%</span>
            <span className={css.hint} data-bad={parsed.errors.allowed ? 'true' : undefined}>{parsed.errors.allowed ? WHY[parsed.errors.allowed] : 'how far the output may be from the target, at every temperature'}</span>
          </div>
        </div>
      </div>

      <div className={[styles.block, combos.combos, css.design].join(' ')}>
        <div className={styles.blockHead}>
          <h3>Parts and conditions</h3>
          <span className={[styles.blockMeta, styles.num].join(' ')}>{!parsed.errors.tol && !parsed.errors.tcr ? specText(parsed.spec) : ''}</span>
        </div>
        <div className={css.row}>
          <span className={styles.label}>Parts</span>
          <div className={combos.control}>
            <select className={styles.select} aria-label="The kind of resistor" value={design.tech}
              onChange={(event) => { const next = technology(event.target.value); onDesign({ tech: next.id, tol: String(next.tolerancePct), tcr: String(next.tcrPpm) }); }}>
              {TECHNOLOGIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
            <span className={css.pair}>
              <span className={css.unit}>±</span>
              <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label="Tolerance of the resistors, in percent" aria-invalid={parsed.errors.tol ? true : undefined}
                value={design.tol} inputMode="decimal" spellCheck={false} onChange={(event) => onDesign({ tol: event.target.value })} />
              <span className={css.unit}>%</span>
            </span>
            <span className={css.pair}>
              <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label="Temperature coefficient of the resistors, in ppm per kelvin" aria-invalid={parsed.errors.tcr ? true : undefined}
                value={design.tcr} inputMode="decimal" spellCheck={false} onChange={(event) => onDesign({ tcr: event.target.value })} />
              <span className={css.unit}>ppm/K</span>
            </span>
            <span className={css.hint} data-wide>
              {tech.note}: usually ±{formatPct(tech.tolerances[0])} to ±{formatPct(tech.tolerances[1])}, {tech.tcrs[0]} to {tech.tcrs[1]} ppm/K.
              {outsideTech && <b> These parts are outside that.</b>}
            </span>
          </div>
        </div>
        <div className={css.row}>
          <span className={styles.label}>Temperatures</span>
          <div className={combos.control}>
            <ul className={css.chips} aria-label="The temperatures the circuit is checked at">
              {design.temps.map((t) => (
                <li key={t} className={css.chip}>
                  <span className={styles.num}>{temperatureText(t)}</span>
                  <button type="button" disabled={design.temps.length === 1} aria-label={`Remove ${temperatureText(t)}`} title={design.temps.length === 1 ? 'One temperature must stay' : `Remove ${temperatureText(t)}`}
                    onClick={() => onDesign({ temps: design.temps.filter((entry) => entry !== t) })}><CloseIcon /></button>
                </li>
              ))}
            </ul>
            <span className={css.pair}>
              <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label="A temperature to add, in °C" aria-invalid={tempProblem ? true : undefined} value={newTemp} placeholder="add"
                inputMode="text" spellCheck={false} onChange={(event) => setNewTemp(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !tempProblem) addTemperature(); }} />
              <span className={css.unit}>°C</span>
              <button type="button" className={combos.button} disabled={!newTemp.trim() || !!tempProblem} onClick={addTemperature}>Add</button>
            </span>
            {tempProblem && <span className={css.hint} data-bad="true">{tempProblem}</span>}
            {!defaultTemps && <button type="button" className={combos.linkButton} onClick={() => onDesign({ temps: DESIGN_TEMPERATURES })}>Back to −40, 25, 85, 125 °C</button>}
          </div>
        </div>
        <div className={css.row}>
          <span className={styles.label}>Drift</span>
          <div className={combos.control}>
            <Segmented label="How the resistors drift with temperature" value={design.drift} onChange={(drift) => onDesign({ drift })}
              options={[
                { value: 'independent', label: 'Each on its own', title: 'Every resistor anywhere within its TCR, also in opposite directions' },
                { value: 'tracking', label: 'Parts track', title: 'All resistors drift alike: same kind, same lot, same temperature' },
              ]} />
            {design.drift === 'tracking' && (
              <span className={css.pair}>
                <span className={css.hint}>apart by at most</span>
                <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label="How far apart the TCRs of two parts can be, in ppm per kelvin" aria-invalid={parsed.errors.spread ? true : undefined}
                  value={design.spread} placeholder="0" inputMode="decimal" spellCheck={false} onChange={(event) => onDesign({ spread: event.target.value })} />
                <span className={css.unit}>ppm/K</span>
              </span>
            )}
          </div>
        </div>
        <div className={css.row}>
          <span className={styles.label}>Values</span>
          <div className={combos.control}>
            <select className={styles.select} aria-label="The values to choose from" value={selected} onChange={(event) => chooseValues(event.target.value)}>
              <option value="auto">{series(usual).label}, usual for ±{formatPct(parsed.spec.tolerancePct > 0 ? parsed.spec.tolerancePct : 1)}</option>
              {SERIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              {(lists.length > 0 || (design.list && !design.listId)) && (
                <optgroup label="My values">
                  {design.list && !design.listId && <option value="shared">{design.list.name} (from the link)</option>}
                  {lists.map(({ list, parsed: read }) => <option key={list.id} value={`list:${list.id}`} disabled={!read.values.length}>{list.name || 'Unnamed'}</option>)}
                </optgroup>
              )}
            </select>
            {!design.list && (
              <span className={combos.range}>
                <RangeField label="Smallest value" ohms={min} onCommit={(value) => value < max && (onDesign({ min: value, max }), true)} />
                <span>to</span>
                <RangeField label="Largest value" ohms={max} onCommit={(value) => value > min && (onDesign({ min, max: value }), true)} />
              </span>
            )}
            <span className={[styles.num, combos.count].join(' ')} data-testid="design-count">{values.length.toLocaleString('en-US')} value{values.length === 1 ? '' : 's'}</span>
            <button type="button" className={combos.linkButton} onClick={() => document.getElementById('my-values')?.scrollIntoView({ block: 'start' })}>My values</button>
          </div>
        </div>
        {two ? (
          <>
            <div className={css.row}>
              <span className={styles.label}>Each resistance</span>
              <div className={combos.control}>
                {pairsAllowed ? (
                  <Segmented label="How many values each resistance may be made of" value={design.legParts} onChange={(legParts) => { onDesign({ legParts }); setCount(FIRST); }}
                    options={[
                      { value: 1, label: 'One value', title: 'R1 and R2 are one resistor each' },
                      { value: 2, label: 'Up to two values', title: 'R1 and R2 may each be two resistors in series or in parallel' },
                    ]} />
                ) : (
                  <span className={css.hint} data-wide>
                    One value each. Two values in series or parallel are offered up to {PAIR_LEG_LIMIT} values to choose from, and there are {values.length.toLocaleString('en-US')}: comparing every pair of two-value resistances would take over a second. Narrow the range or take a coarser series.
                  </span>
                )}
              </div>
            </div>
            <div className={css.row}>
              <span className={styles.label}>R1 + R2</span>
              <div className={combos.control}>
                <span className={combos.range}>
                  <RangeField label="Smallest sum of R1 and R2" ohms={design.totalMin} onCommit={(value) => value < design.totalMax && (onDesign({ totalMin: value }), true)} />
                  <span>to</span>
                  <RangeField label="Largest sum of R1 and R2" ohms={design.totalMax} onCommit={(value) => value > design.totalMin && (onDesign({ totalMax: value }), true)} />
                </span>
                <span className={css.hint}>the sum of the two; of equal choices, the one nearest <span className={styles.num}>{formatOhms(Math.sqrt(design.totalMin * design.totalMax), 2)}</span> is first</span>
              </div>
            </div>
            <div className={css.row}>
              <span className={styles.label}>Current</span>
              <div className={combos.control}>
                <span className={combos.range}>
                  <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label="Smallest current, in amperes" aria-invalid={parsed.errors.currentMin ? true : undefined}
                    value={design.currentMin} placeholder="any" spellCheck={false} onChange={(event) => onDesign({ currentMin: event.target.value })} />
                  <span>to</span>
                  <input className={[styles.numberInput, css.smallInput].join(' ')} aria-label="Largest current, in amperes" aria-invalid={parsed.errors.currentMax ? true : undefined}
                    value={design.currentMax} placeholder="any" spellCheck={false} onChange={(event) => onDesign({ currentMax: event.target.value })} />
                  <span className={css.unit}>A</span>
                </span>
                <span className={css.hint} data-bad={parsed.errors.currentMin || parsed.errors.currentMax ? 'true' : undefined}>
                  {WHY[parsed.errors.currentMin ?? parsed.errors.currentMax] ?? `optional limits of the current ${currentOf}`}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className={css.row}>
            <span className={styles.label}>Resistors</span>
            <div className={combos.control}>
              <Segmented label="The largest number of resistors that make the resistance" value={design.maxParts} onChange={(maxParts) => { onDesign({ maxParts }); setCount(FIRST); }}
                options={[1, 2, 3].map((n) => ({ value: n, label: n === 1 ? '1' : `up to ${n}`, title: n === 1 ? 'One resistor' : `Up to ${n} resistors in series, in parallel or both` }))} />
              <span className={css.hint}>fewer resistors come first when they also stay inside</span>
            </div>
          </div>
        )}
        <div className={css.row}>
          <span className={styles.label}>Chip size</span>
          <div className={combos.control}>
            <select className={styles.select} aria-label="The chip size the power is checked against" value={design.chip} onChange={(event) => onDesign({ chip: event.target.value })}>
              {CHIP_SIZES.map((size) => <option key={size.imperial} value={size.imperial}>{size.imperial} ({size.metric} metric), {formatAmount(size.power, 'W', 3)}</option>)}
            </select>
            <span className={css.hint}>for the power check in an opened suggestion</span>
          </div>
        </div>
      </div>

      <div className={[styles.block, combos.combos, css.design].join(' ')}>
        <div className={styles.blockHead}>
          <h3>Suggestions</h3>
          <span className={[styles.blockMeta, styles.num].join(' ')}>{found?.candidates.length ? `${found.passing} of ${found.candidates.length} stay within ±${formatPct(shown.options.allowedPct)}` : ''}</span>
        </div>
        {parsed.problem && <p className={[styles.message, css.problem].join(' ')} data-testid="design-problem"><InfoIcon /><span>{parsed.problem}</span></p>}
        {!parsed.problem && !values.length && (
          <p className={[styles.message, css.problem].join(' ')}><InfoIcon /><span>{design.list ? 'The list in use has no value that can be read.' : `${series(seriesId).label} has no value from ${formatRange(min, max)}.`}</span></p>
        )}
        <div className={css.found} data-busy={busy || undefined}>
          {answer && (
            <div className={css.answer} data-kind={answer.kind} data-testid="design-answer">
              {answer.kind === 'pass' ? <CheckIcon size={18} /> : <InfoIcon />}
              <p>{unbroken(answer.text)}</p>
              {answer.apply && (
                <button type="button" className={combos.button} data-primary onClick={applySpec} data-testid="design-apply">
                  Use {specText(answer.apply)} parts{technologyFor(answer.apply, design.tech) !== design.tech ? ` (${technology(technologyFor(answer.apply, design.tech)).label.toLowerCase()})` : ''}
                </button>
              )}
            </div>
          )}
          {runnable && (
            <p className={combos.status} data-testid="design-status" data-place={place ?? ''} data-busy={busy || !shown} aria-live="polite">
              {failed ? `The suggestions failed: ${failed}`
                : !shown ? 'Looking for values…'
                  : <>
                    Compared {formatCount(found.considered)} {found.ideal === null ? 'pairs of resistances' : `network${found.considered === 1 ? '' : 's'}`} from {found.values.toLocaleString('en-US')} value{found.values === 1 ? '' : 's'} ({shown.source}) in {found.ms < 1 ? 'under 1' : Math.round(found.ms).toLocaleString('en-US')} ms{place === 'page' ? ', on the page itself' : ''}.
                    {found.ideal !== null && Number.isFinite(found.ideal) && <> The exact resistance would be <span className={styles.num}>{formatOhms(found.ideal, 5)}</span>.</>}
                    {found.note && found.candidates.length > 0 ? ` ${found.note}` : ''}
                  </>}
            </p>
          )}
          {shown && rows.length > 0 && (
            <>
              <ol className={combos.results} aria-label="Suggestions, those that stay inside first" data-testid="design-list">
                {visible.map((c, i) => {
                  const itemKey = c.legs.map(networkKey).join('|');
                  const isOpen = open === itemKey;
                  const text = legsText(id, c.legs);
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
                            {c.legs.length > 1 && <> · sum <span className={styles.num}>{formatOhms(c.total, 4)}</span></>}
                            {c.legs.length > 1 && c.current !== null && <> · <span className={styles.num}>{formatAmount(c.current, 'A', 3)}</span></>}
                            {c.legs.length === 1 && c.parts > 1 && <> · <span className={styles.num}>{formatOhms(c.ohms[0], 5)}</span></>}
                            {' '}· RSS <span className={styles.num}>±{pct3(c.rssPct)}</span>
                            {tooHot[i] && <> · <b className={css.out} title="Open the suggestion for the power in each resistor">too much power for a {shown.options.chipSize}</b></>}
                          </div>
                        </div>
                        <div className={css.numbers}>
                          <span className={[styles.num, css.gives].join(' ')}>{outputText(id, c.output)}</span>
                          <span className={[styles.num, styles.error].join(' ')}>{errorText(c.errorPct)}</span>
                          <span className={[styles.num, css.worst].join(' ')} title={`The worst case, at ${temperatureText(c.temperature)}`}>{spanText(c.minPct, c.maxPct)}</span>
                        </div>
                        <div className={css.verdict} data-pass={c.passes}>
                          <b>{c.passes && <CheckIcon size={13} />}{c.passes ? 'inside' : 'outside'}</b>
                          <span className={styles.num}>{c.passes ? `${pct3(c.margin)} to spare` : `by ${pct3(c.margin)}`}</span>
                        </div>
                        <div className={combos.actions}>
                          <CopyButton text={() => candidateText(id, c, shown.options.allowedPct, shown.options.temperatures)} label="" title={`Copy as text: ${text}`} />
                          <button type="button" className={combos.toggle} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : itemKey)} title="The output at each temperature, and what each resistor carries" aria-label={`Details of ${text}`}>
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
                <button type="button" className={combos.more} onClick={() => setCount(count + MORE)}>Show more <span className={styles.num}>({count} of {rows.length})</span></button>
              )}
              <p className={styles.caption}>
                Those that stay inside ±{formatPct(shown.options.allowedPct)} {temperaturesText(shown.options.temperatures)} come first: fewer resistors, then the smaller nominal error{id && isTwoLegs(id) ? ', then the sum nearest the middle of its limits' : ''}; then the others, the least outside first.
                Each row has the nominal output with its error, and the worst-case range at the worst temperature, all in percent of the target.
              </p>
              <p className={styles.caption}>
                <b>Worst case</b>: every resistor at the edge of its tolerance and of its TCR at once, each in the direction that moves the output furthest; nothing lies beyond it, and it alone decides inside or outside.{' '}
                <b>RSS</b>, the root of the sum of the squares of each effect alone: the spread to expect when the parts deviate independently and normally {bib.cite('TISNVA112')}.
              </p>
              <p className={styles.caption}>
                <b>Parts track</b> assumes that all resistors drift alike (same kind and lot, same temperature), which cancels in a divider and a gain; “apart by” is what is left between them.
                The voltages and currents of the circuit are taken as exact. Power ratings are typical for a chip size and differ by maker {bib.cite('YageoRC')} {bib.cite('VishayCRCW')}.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
