import React from 'react';

import { decryptText, ENCRYPTED_PREFIX } from '../../lib/qr/payloads';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/QrGen.module.css';
import { Field } from '../UI/Fields';

export default function DecryptBox() {
  const { t } = useI18n();
  const [cipher, setCipher] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [result, setResult] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function decrypt() {
    const line = cipher.split(/\r?\n/).find((l) => l.trim().startsWith(ENCRYPTED_PREFIX));
    if (!line) {
      setResult({ ok: false, text: t('qrgen.dec.notFound', { prefix: ENCRYPTED_PREFIX }) });
      return;
    }
    try {
      setResult({ ok: true, text: await decryptText(line, password) });
    } catch {
      setResult({ ok: false, text: t('qrgen.dec.failed') });
    }
  }

  return (
    <section className={styles.card}>
      <h2>{t('qrgen.dec.title')}</h2>
      <p>{t('qrgen.dec.lead')}</p>
      <div className={styles.fieldGrid}>
        <Field label={t('qrgen.dec.scannedLabel')} wide>
          <textarea className={styles.textarea} value={cipher} onChange={(e) => setCipher(e.target.value)} spellCheck={false} />
        </Field>
        <Field label={t('qrgen.dec.passwordLabel')}>
          <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <div className={styles.buttonRow}>
        <button type="button" className={styles.button} onClick={decrypt}>{t('qrgen.dec.button')}</button>
      </div>
      {result && (result.ok ? <pre className={[styles.payload, styles.mono].join(' ')}>{result.text}</pre> : <p className={styles.warning}>{result.text}</p>)}
    </section>
  );
}
