// A field for one number of the setup (a `Val`): the value in the shown unit, its tolerance and its source (plan.md D8).
// Every keystroke that reads is committed at once (results update while typing); text that cannot be read stays as
// typed with the reader's reason under it, and nothing is clamped. Escape puts back the value the setup holds.

import React, { useEffect, useId, useRef, useState } from 'react';

import { TYPED } from '../../lib/emsim/stackup';
import type { Tol, Val } from '../../lib/emsim/stackup';
import { UNIT_TEXT, readLength, readPlain, readTolerance } from '../../lib/emsim/units';
import type { LengthUnit, Read } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimStackup.module.css';
import { fieldText, sourceTag, tolField } from './format';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>;

// A text input that holds what is typed while it has the focus and shows `shown` otherwise.
export function NumInput<T>({ shown, parse, onValue, onReason, ...rest }: InputProps & {
  shown: string;
  parse: (text: string) => Read<T>;
  onValue: (v: T) => void;
  onReason: (reason: string) => void;
}) {
  const [text, setText] = useState(shown);
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current) return;
    setText(shown);
    onReason('');
    // onReason is a state setter of the field: only `shown` matters.
  }, [shown]);
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={text}
      onFocus={() => { focused.current = true; }}
      onBlur={() => {
        focused.current = false;
        if (parse(text).ok) { setText(shown); onReason(''); }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { setText(shown); onReason(''); }
        else if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const r = parse(t);
        if (r.ok === true) { onReason(''); onValue(r.value); }
        else onReason(r.reason);
      }}
    />
  );
}

export interface ValFieldProps {
  name: string; // data-field: "<layer id>.<key>"
  label: string;
  x: Val | null;
  unit: LengthUnit | null; // null: a plain number (εr, tanδ)
  digits: number;
  onChange: (next: Val | null, part: 'v' | 'tol') => void; // part: which input changed (separate undo steps)
  nullable?: boolean; // empty means "not stated"
  zero?: boolean; // a length of 0 is allowed
  negative?: boolean; // a negative length is allowed (a position across)
  min?: number;
  max?: number;
  onFocus?: () => void;
  placeholder?: string; // shown when empty (nullable): default "not stated"
}

export default function ValField({ name, label, x, unit, digits, onChange, nullable, zero, negative, min, max, onFocus, placeholder }: ValFieldProps) {
  const id = useId();
  const [reason, setReason] = useState('');
  const [tolReason, setTolReason] = useState('');
  const parse = (t: string): Read<number | null> => {
    if (nullable && !t.trim()) return { ok: true, value: null };
    return unit ? readLength(t, unit, { zero, negative }) : readPlain(t, { min, max, what: label });
  };
  const parseTol = (t: string): Read<Tol> => (t.trim() ? readTolerance(t, unit ?? 'mm', !unit) : { ok: true, value: null });
  const tag = x ? sourceTag(x.src) : null;
  return (
    <div className={css.field} data-field={name} onFocus={onFocus}>
      <label htmlFor={id} className={css.fieldLabel}>{label}</label>
      <div className={css.valueRow}>
        <NumInput
          id={id}
          className={base.input}
          shown={x ? fieldText(x.v, unit, digits) : ''}
          placeholder={nullable ? (placeholder ?? 'not stated') : undefined}
          aria-invalid={reason ? true : undefined}
          parse={parse}
          onReason={setReason}
          onValue={(v) => onChange(v === null ? null : x && v === x.v ? x : { v, tol: x?.tol ?? null, src: TYPED }, 'v')}
        />
        {unit && <span className={css.unit}>{UNIT_TEXT[unit]}</span>}
      </div>
      <div className={css.meta}>
        <NumInput
          className={css.tol}
          shown={x ? tolField(x.tol, unit, digits) : ''}
          placeholder="± none"
          aria-label={`Tolerance of ${label}`}
          aria-invalid={tolReason ? true : undefined}
          disabled={!x}
          parse={parseTol}
          onReason={setTolReason}
          onValue={(tol) => { if (x) onChange({ ...x, tol }, 'tol'); }}
        />
        {tag && <span className={css.src} data-kind={tag.kind}>{tag.text}</span>}
      </div>
      {(reason || tolReason) && <p className={css.reason} role="alert">{reason || `Tolerance: ${tolReason}`}</p>}
    </div>
  );
}
