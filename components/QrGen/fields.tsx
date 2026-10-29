import React from 'react';

import styles from '../../styles/QrGen.module.css';

export function Field({ label, help, wide, children }: { label: string; help?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={[styles.field, wide ? styles.fieldWide : ''].join(' ')}>
      <span>{label}</span>
      {children}
      {help && <small className={styles.help}>{help}</small>}
    </label>
  );
}

// The option type is inferred from `value` alone, so literal option lists are checked against it.
export function Select<T extends string>({ value, onChange, options, disabled }: {
  value: T;
  onChange: (v: NoInfer<T>) => void;
  options: [NoInfer<T>, string][];
  disabled?: boolean;
}) {
  return (
    <select className={styles.select} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}

export function Checkbox({ label, checked, onChange, disabled, wide }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={[styles.checkbox, wide ? styles.fieldWide : ''].join(' ')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// Number input that keeps whatever the user is typing, and reports clamped numbers upwards.
export function NumberInput({ value, onChange, min, max, step }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  // 'any' accepts decimals of any length without the browser marking them as invalid.
  step?: number | 'any';
}) {
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => {
    if (Number(text) !== value) setText(String(value));
  }, [value]);

  return (
    <input
      className={styles.input}
      type="number"
      min={min}
      max={max}
      step={step ?? 1}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
