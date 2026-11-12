import React, { useEffect, useMemo, useRef, useState } from 'react';

import { formatAmount, readAmount } from '../../lib/quantity';
import {
  Circuit, f0Problem, Form, formsOf, formValue, insertPart, KIND_CODES, KIND_NAMES, KIND_ORDER, KIND_SHORT,
  circuitInputGamma, loadRProblem, loadXProblem, MAX_PARTS, movePart, newPart, Part, PartKind, readForm, removePart, withForm,
  withPart, z0Problem,
} from '../../lib/smith/state';
import {
  LINE, QUARTER, SERIES_C, SERIES_L, SERIES_R, SHUNT_C, SHUNT_L, SHUNT_R, STUB_OPEN, STUB_SHORT,
} from '../../lib/smith/parts';
import styles from '../../styles/Smith.module.css';
import { readoutTexts } from './readout';

// The circuit panel (step M3.1): the parameters (Z0, f0, the load R + jX), the schematic strip with the parts drawn
// source left, load right, the card of the selected part with its value in every form of engine.md §2, the controls
// to add, remove and reorder parts (buttons and keys), and the readout of the circuit's input at f0. It edits the
// circuit only through `onChange` (the page's single commit point, where M3.3's undo hooks in).

export interface StripProps {
  circuit: Circuit;
  onChange: (next: Circuit) => void;
  /** What was wrong with the link the page was opened with (decodeCircuit's issues). */
  issues?: readonly string[];
}

/** The colour of the part at an index (counted from the load): the eight `--part-n` of notes-M2.3.md in turn. */
export const partColour = (index: number): string => `var(--part-${(index % 8) + 1})`;

const DIGITS = 4;

/** A form's value as a field shows it (four significant digits, prefixes, ∞ for an open). */
export function formText(form: Form, v: number): string {
  if (form.unit === 'λ') return `${formatAmount(v, '', DIGITS)} λ`;
  if (form.unit === '°') return `${formatAmount(v, '', DIGITS)}°`;
  return formatAmount(v, form.unit, DIGITS);
}

// ---------------------------------------------------------------------------------------------------------------
// The symbols, 40 × 32, in currentColor: series parts on the line at y = 16, shunt parts hang from y = 6 to ground.

const GROUND = 'M13 25H27M16 28H24M19 31H21';
const SYMBOL: Record<number, string> = {
  [SERIES_R]: 'M0 16H10l2-4l4 8l4-8l4 8l4-8l2 4H40',
  [SERIES_L]: 'M0 16H8a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0H40',
  [SERIES_C]: 'M0 16H17M17 8V24M23 8V24M23 16H40',
  [SHUNT_R]: `M0 6H40M20 6V9l-4 2l8 3l-8 3l8 3l-4 2V25${GROUND}`,
  [SHUNT_L]: `M0 6H40M20 6V9a2.5 2.5 0 0 1 0 5a2.5 2.5 0 0 1 0 5a2.5 2.5 0 0 1 0 5V25${GROUND}`,
  [SHUNT_C]: `M0 6H40M20 6V14M13 14H27M13 18H27M20 18V25${GROUND}`,
  [LINE]: 'M0 16H6M34 16H40M6 11H34V21H6Z',
  [STUB_OPEN]: 'M0 6H40M20 6V10M16 10H24V28H16Z',
  [STUB_SHORT]: `M0 6H40M20 6V9M16 9H24V22H16ZM20 22V25${GROUND}`,
  [QUARTER]: 'M0 16H6M34 16H40M6 9H34V23H6Z',
};

export function PartSymbol({ kind }: { kind: number }) {
  return (
    <svg className={styles.symbol} viewBox="0 0 40 32" width="40" height="32" aria-hidden="true">
      <path d={SYMBOL[kind]} />
      {kind === QUARTER && <text x="20" y="19.5" textAnchor="middle">λ/4</text>}
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// A number field: shows the circuit's value until typed in; a typed text is read on every key and, when it can be
// used, goes to the circuit at once (no submit); when it cannot, the field is marked and says why. Escape goes back.

interface FieldProps {
  label: string;
  hint?: string;
  /** The text of the circuit's current value. */
  shown: string;
  /** Takes a typed text: '' when it was used, else why not. */
  edit: (text: string) => string;
  name: string;
}

function Field({ label, hint, shown, edit, name }: FieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const id = `smith-f-${name}`;
  return (
    <label className={styles.field} data-name={name}>
      <span className={styles.fieldLabel}>{label}{hint && <span className={styles.readHint}> {hint}</span>}</span>
      <input
        className={styles.input}
        value={draft ?? shown}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-e` : undefined}
        onChange={(e) => { const t = e.target.value; setDraft(t); setError(edit(t)); }}
        onBlur={() => { if (!error) setDraft(null); }}
        onKeyDown={(e) => { if (e.key === 'Escape' && draft !== null) { setDraft(null); setError(''); } }}
      />
      {error && <span className={styles.fieldError} id={`${id}-e`} role="status">{error}</span>}
    </label>
  );
}

const reason = (text: string, v: number | null, unit: string, problem: string): string =>
  v === null ? (text.trim() ? `cannot read “${text.trim()}”${unit ? ` as ${unit}` : ' as a number'}` : 'empty') : problem;

const UNIT_WORD: Record<string, string> = { Ω: 'ohms', S: 'siemens', H: 'henries', F: 'farads', Hz: 'hertz', λ: 'wavelengths', '°': 'degrees' };

// ---------------------------------------------------------------------------------------------------------------

const INPUT_SHOWN = [[0, 'z', 'normalised'], [1, 'Z', 'in Ω'], [4, 'Γ', 'polar'], [6, 'VSWR', ''], [7, 'Return loss', '']] as const;
const INPUT_KEYS = ['z', 'Z', 'y', 'Y', 'gamma', 'gammaRect', 'vswr', 'rl', 'note'];

export default function Strip({ circuit, onChange, issues }: StripProps) {
  const c = circuit;
  const n = c.parts.length;
  // Stable keys for the parts across reorders (the circuit itself has no ids).
  const ids = useRef<number[]>([]);
  const nextId = useRef(1);
  if (ids.current.length !== n) ids.current = c.parts.map(() => nextId.current++);
  const [sel, setSel] = useState(n ? n - 1 : -1);
  const selected = sel >= 0 && sel < n ? sel : n - 1;
  const [addKind, setAddKind] = useState<PartKind>(SERIES_L);
  const [addAt, setAddAt] = useState(-1);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const focusTile = useRef(-1);
  const addSelect = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const i = focusTile.current;
    if (i < 0) return;
    focusTile.current = -1;
    if (i < n) tiles.current[i]?.focus();
    else addSelect.current?.focus();
  });

  const add = () => {
    const at = addAt < 0 || addAt > n ? n : addAt;
    ids.current.splice(at, 0, nextId.current++);
    onChange(insertPart(c, at, newPart(addKind, c)));
    setSel(at);
    focusTile.current = at;
  };
  const remove = (i: number) => {
    ids.current.splice(i, 1);
    onChange(removePart(c, i));
    const next = Math.min(i, n - 2);
    setSel(next);
    focusTile.current = next < 0 ? n : next;
    if (addAt >= n - 1) setAddAt(-1);
  };
  const move = (i: number, to: number) => {
    if (to < 0 || to >= n || to === i) return;
    const [id] = ids.current.splice(i, 1);
    ids.current.splice(to, 0, id);
    onChange(movePart(c, i, to));
    setSel(to);
    focusTile.current = to;
  };
  const tileKey = (i: number) => (e: React.KeyboardEvent) => {
    // Visual order: the source on the left, so the left arrow goes towards the source (a higher index).
    const towardsSource = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (towardsSource && (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)) move(i, i + towardsSource);
    else if (towardsSource) { const j = i + towardsSource; if (j >= 0 && j < n) { setSel(j); tiles.current[j]?.focus(); } }
    else if (e.key === 'Home' || e.key === 'End') { const j = e.key === 'Home' ? n - 1 : 0; setSel(j); tiles.current[j]?.focus(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') remove(i);
    else return;
    e.preventDefault();
  };

  // The circuit's input at f0, in the readout's own texts.
  const inputTexts = useMemo(() => {
    const g = [0, 0], out: string[] = [];
    circuitInputGamma(g, 0, c);
    readoutTexts(g[0], g[1], c.z0, out);
    return out;
  }, [c]);

  const param = (name: string, label: string, unit: string, value: number, problem: (v: number) => string, set: (v: number) => Circuit, infinite = false, hint = '') => (
    <Field name={name} label={label} hint={hint} shown={formatAmount(value, unit, DIGITS)} edit={(t) => {
      const v = readAmount(t, unit, infinite);
      const why = reason(t, v, UNIT_WORD[unit] ?? unit, v === null ? '' : problem(v));
      if (!why) onChange(set(v));
      return why;
    }} />
  );

  const part = selected >= 0 ? c.parts[selected] : null;
  const partField = (p: Part, i: number, form: Form) => (
    <Field key={form.id} name={`p${i + 1}-${form.id}`} label={form.label} hint={form.hint} shown={formText(form, formValue(form.id, p, c))}
      edit={(t) => {
        const v = readForm(form, t);
        if (v === null) return reason(t, v, UNIT_WORD[form.unit] ?? '', '');
        const next = withForm(form.id, p, v, c);
        if (typeof next === 'string') return next;
        onChange(withPart(c, i, next));
        return '';
      }} />
  );
  const positions: { at: number; text: string }[] = [{ at: -1, text: 'at the source end' }];
  if (n > 0) positions.push({ at: 0, text: 'at the load end' });
  for (let i = 1; i < n; i++) positions.push({ at: i, text: `between ${i} and ${i + 1}` });

  return (
    <section className={styles.panel} aria-labelledby="smith-circuit" data-circuit="">
      <h2 className={styles.panelTitle} id="smith-circuit">Circuit <span className={styles.panelNote}>ideal parts, lossless lines</span></h2>
      {issues && issues.length > 0 && (
        <div className={styles.linkIssues} role="status">
          <strong>The link could not be read in full:</strong>
          <ul>{issues.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      <div className={styles.params}>
        {param('z0', 'Z0', 'Ω', c.z0, z0Problem, (v) => ({ ...c, z0: v }))}
        {param('f0', 'f0', 'Hz', c.f0, f0Problem, (v) => ({ ...c, f0: v }))}
        {param('loadR', 'Load R', 'Ω', c.loadR, loadRProblem, (v) => ({ ...c, loadR: v, loadX: v === Infinity ? 0 : c.loadX }), true)}
        {param('loadX', 'Load X', 'Ω', c.loadX, loadXProblem, (v) => ({ ...c, loadX: v }))}
      </div>

      <div className={styles.strip} role="toolbar" aria-label="Parts from the source (left) to the load (right); arrows choose, Alt+arrows move, Delete removes" data-strip="">
        <span className={styles.stripEnd}>Source</span>
        <span className={styles.stripArrow} aria-hidden="true" title="The chart's path runs from the load to the source">←</span>
        {n === 0 && <span className={styles.stripEmpty}>no parts</span>}
        {c.parts.map((_, k) => {
          const i = n - 1 - k, p = c.parts[i], main = formsOf(p.kind)[0];
          const value = formText(main, formValue(main.id, p, c));
          return (
            <button key={ids.current[i]} type="button" className={styles.tile} data-tile={i} data-kind={KIND_CODES[p.kind]}
              ref={(el) => { tiles.current[i] = el; }} style={{ color: partColour(i) }} aria-pressed={i === selected}
              tabIndex={i === selected ? 0 : -1} aria-label={`Part ${i + 1}: ${KIND_NAMES[p.kind]}, ${value}`}
              onClick={() => setSel(i)} onKeyDown={tileKey(i)}>
              <PartSymbol kind={p.kind} />
              <span className={styles.tileName}>{i + 1} {KIND_SHORT[p.kind]}</span>
              <span className={styles.tileValue}>{value}</span>
            </button>
          );
        })}
        <span className={styles.stripEnd}>Load</span>
      </div>

      {part && (
        <div className={styles.card} key={ids.current[selected]} data-card={selected} style={{ '--card': partColour(selected) } as React.CSSProperties}>
          <div className={styles.cardHead}>
            <span className={styles.cardName}>{selected + 1} · {KIND_NAMES[part.kind]}</span>
            <span className={styles.cardActions}>
              <button type="button" className={styles.button} data-move="source" disabled={selected === n - 1} onClick={() => move(selected, selected + 1)} title="Move towards the source (Alt+←)" aria-label="Move towards the source">←</button>
              <button type="button" className={styles.button} data-move="load" disabled={selected === 0} onClick={() => move(selected, selected - 1)} title="Move towards the load (Alt+→)" aria-label="Move towards the load">→</button>
              <button type="button" className={styles.button} data-remove="" onClick={() => remove(selected)} title="Remove (Delete)">Remove</button>
            </span>
          </div>
          <div className={styles.forms}>{formsOf(part.kind).map((form) => partField(part, selected, form))}</div>
        </div>
      )}

      <div className={styles.addRow}>
        <select ref={addSelect} className={styles.select} data-add-kind="" aria-label="Kind of part to add" value={addKind} onChange={(e) => setAddKind(Number(e.target.value) as PartKind)}>
          {KIND_ORDER.map((k) => <option key={k} value={k}>{KIND_NAMES[k]}</option>)}
        </select>
        <select className={styles.select} data-add-at="" aria-label="Where to add it" value={addAt > n - 1 ? -1 : addAt} onChange={(e) => setAddAt(Number(e.target.value))}>
          {positions.map(({ at, text }) => <option key={at} value={at}>{text}</option>)}
        </select>
        <button type="button" className={styles.button} data-add="" onClick={add} disabled={n >= MAX_PARTS}>Add</button>
      </div>

      <h3 className={styles.subTitle}>Circuit input <span className={styles.panelNote}>at f0</span></h3>
      <dl className={styles.readout}>
        {INPUT_SHOWN.map(([k, label, hint]) => (
          <div key={k} className={styles.readRow}>
            <dt>{label}{hint && <span className={styles.readHint}> {hint}</span>}</dt>
            <dd data-input={INPUT_KEYS[k]}>{inputTexts[k]}</dd>
          </div>
        ))}
      </dl>
      {inputTexts[8] && <p className={styles.readNote}>{inputTexts[8]}</p>}
    </section>
  );
}
