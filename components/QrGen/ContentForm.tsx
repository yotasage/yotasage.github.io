import React from 'react';

import { ContentType, FieldDef, Values } from '../../lib/qr/payloads';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Fields.module.css';
import { Checkbox, Field, Select } from '../UI/Fields';

function Control({
  def,
  options,
  value,
  onChange,
}: {
  def: FieldDef;
  options?: [string, string][];
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  switch (def.type) {
    case 'textarea':
      return <textarea className={styles.textarea} value={String(value)} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
    case 'select':
      return <Select value={String(value)} options={options ?? def.options} onChange={onChange} />;
    default:
      return (
        <input
          className={styles.input}
          type={def.type}
          value={String(value)}
          placeholder={def.placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export default function ContentForm({ type, values, onChange }: { type: ContentType; values: Values; onChange: (v: Values) => void }) {
  const { t } = useI18n();
  const set = (key: string, v: string | boolean) => onChange({ ...values, [key]: v });

  const tr = (key: string, fallback: string) => {
    const val = t(key);
    return val === key ? fallback : val;
  };

  return (
    <div className={styles.fieldGrid}>
      {type.fields.filter((f) => !f.showIf || f.showIf(values)).map((f) => {
        const label = tr(`qrgen.ct.${type.id}.f.${f.key}`, f.label);
        const help = f.help ? tr(`qrgen.ct.${type.id}.f.${f.key}.help`, f.help) : undefined;
        const options = f.options?.map(([optVal, optLabel]): [string, string] => [
          optVal,
          tr(`qrgen.ct.${type.id}.opt.${optVal || 'none'}`, optLabel),
        ]);
        return f.type === 'checkbox'
          ? <Checkbox key={f.key} wide label={label} checked={values[f.key] === true} onChange={(v) => set(f.key, v)} />
          : (
            <Field key={f.key} label={label} help={help} wide={f.type === 'textarea'}>
              <Control def={f} options={options} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
            </Field>
          );
      })}
    </div>
  );
}
