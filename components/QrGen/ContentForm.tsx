import React from 'react';

import { ContentType, FieldDef, Values } from '../../lib/qr/payloads';
import styles from '../../styles/QrGen.module.css';
import { Checkbox, Field, Select } from './fields';

function Control({ def, value, onChange }: { def: FieldDef; value: string | boolean; onChange: (v: string | boolean) => void }) {
  switch (def.type) {
    case 'textarea':
      return <textarea className={styles.textarea} value={String(value)} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
    case 'select':
      return <Select value={String(value)} options={def.options} onChange={onChange} />;
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
  const set = (key: string, v: string | boolean) => onChange({ ...values, [key]: v });

  return (
    <div className={styles.fieldGrid}>
      {type.fields.filter((f) => !f.showIf || f.showIf(values)).map((f) => (
        f.type === 'checkbox'
          ? <Checkbox key={f.key} wide label={f.label} checked={values[f.key] === true} onChange={(v) => set(f.key, v)} />
          : (
            <Field key={f.key} label={f.label} help={f.help} wide={f.type === 'textarea'}>
              <Control def={f} value={values[f.key] ?? ''} onChange={(v) => set(f.key, v)} />
            </Field>
          )
      ))}
    </div>
  );
}
