import React from 'react';

import { decryptText, ENCRYPTED_PREFIX } from '../../lib/qr/payloads';
import styles from '../../styles/QrGen.module.css';
import { Field } from './fields';

export default function DecryptBox() {
  const [cipher, setCipher] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function decrypt() {
    const line = cipher.split(/\r?\n/).find((l) => l.trim().startsWith(ENCRYPTED_PREFIX));
    if (!line) {
      setResult({ ok: false, text: `No line starting with ${ENCRYPTED_PREFIX} was found.` });
      return;
    }
    try {
      setResult({ ok: true, text: await decryptText(line, password) });
    } catch {
      setResult({ ok: false, text: 'Decryption failed: wrong password or damaged data.' });
    }
  }

  return (
    <section className={styles.card}>
      <h2>Decrypt password-protected text</h2>
      <p>Paste what a reader shows for a symbol made with the "Password-protected text" content type.</p>
      <div className={styles.fieldGrid}>
        <Field label="Scanned text" wide>
          <textarea className={styles.textarea} value={cipher} onChange={(e) => setCipher(e.target.value)} spellCheck={false} />
        </Field>
        <Field label="Password">
          <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.button} onClick={decrypt}>Decrypt</button>
      </div>
      {result && (result.ok ? <pre className={[styles.payload, styles.mono].join(' ')}>{result.text}</pre> : <p className={styles.warning}>{result.text}</p>)}
    </section>
  );
}
