// The preview of a code's content: what it is, its fields, warnings and notes, and what can be done with it
// (open, copy, save, decrypt). Built from a Parsed (lib/qrread/types.ts).

import React from 'react';

import { codeNow } from '../../lib/qrread/otp';
import type { Action, Field, OtpAccount, Parsed } from '../../lib/qrread/types';
import styles from '../../styles/QrRead.module.css';
import { CopyButton, onIos, save, Secret } from './bits';

function Value({ f }: { f: Field }) {
  if (f.secret) return <Secret value={f.value} mono={f.mono} />;
  const cls = [f.mono ? styles.mono : '', styles.value].join(' ');
  if (f.href) {
    const web = /^https?:/i.test(f.href);
    return <a className={cls} href={f.href} {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{f.value}</a>;
  }
  return <span className={cls}>{f.value}</span>;
}

export function Fields({ fields }: { fields: Field[] }) {
  if (!fields.length) return null;
  return (
    <dl className={styles.fields}>
      {fields.map((f, i) => (
        <div key={`${f.label}-${i}`} className={styles.fieldRow}>
          <dt>{f.label}</dt>
          <dd>
            <Value f={f} />
            {f.note && <span className={[styles.fieldNote, f.tone === 'good' ? styles.good : f.tone === 'bad' ? styles.bad : ''].join(' ')}>{f.tone === 'good' ? '✓ ' : f.tone === 'bad' ? '✗ ' : ''}{f.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ActionButton({ a }: { a: Action }) {
  let button: React.ReactNode = null;
  if (a.copy !== undefined) button = <CopyButton text={a.copy} label={a.label} />;
  else if (a.download) button = <button type="button" className={styles.button} onClick={() => save(a.download)}>{a.label}</button>;
  else if (a.href) {
    const web = /^https?:/i.test(a.href);
    button = <a className={styles.button} href={a.href} {...(web ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{a.label}</a>;
  }
  return (
    <span className={styles.action}>
      {button}
      {a.hint && <small>{a.hint}</small>}
    </span>
  );
}

function ImagePreview({ bytes, mime }: { bytes: Uint8Array; mime: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [size, setSize] = React.useState<string>('');
  React.useEffect(() => {
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes, mime]);
  if (!url) return null;
  return (
    <figure className={styles.imagePreview}>
      <img src={url} alt="The image stored in the code" onLoad={(e) => setSize(`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} pixels`)} onError={() => setSize('This browser cannot show this image.')} />
      {size && <figcaption>{size}</figcaption>}
    </figure>
  );
}

function OtpCodes({ accounts }: { accounts: OtpAccount[] }) {
  const [codes, setCodes] = React.useState<{ code: string | null; left: number }[]>([]);
  const [counters, setCounters] = React.useState(() => accounts.map((a) => a.counter));
  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      const next = await Promise.all(accounts.map((a, i) => codeNow({ ...a, counter: counters[i] })));
      if (alive) setCodes(next);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [accounts, counters]);
  return (
    <div className={styles.otpList}>
      {accounts.map((a, i) => {
        const c = codes[i];
        const code = c?.code;
        return (
          <div key={i} className={styles.otp}>
            <span className={styles.otpName}>{[a.issuer, a.account].filter(Boolean).join(' · ') || 'Account'}</span>
            <span className={styles.otpCode} aria-label="Current code">{code ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}` : code === null && c ? `${a.algorithm} is not available here` : '…'}</span>
            {a.type === 'totp' && c && (
              <span className={styles.otpTimer}>
                <span className={styles.otpBar} style={{ width: `${(100 * c.left) / a.period}%` }} />
                <span>{c.left} s</span>
              </span>
            )}
            {a.type === 'hotp' && (
              <span className={styles.otpTimer}>
                counter {counters[i]}{' '}
                <button type="button" className={styles.linkButton} onClick={() => setCounters(counters.map((n, j) => (j === i ? n + 1 : n)))}>next</button>
              </span>
            )}
            {code && <CopyButton text={code} small />}
          </div>
        );
      })}
    </div>
  );
}

function Decrypt({ line, onPlain }: { line: string; onPlain: (text: string) => void }) {
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // The decryption of the site's generator, so the two always agree.
      // @ts-expect-error TypeScript wants a .js extension here, which the bundler does not resolve.
      const { decryptText } = await import('../../lib/qr/payloads');
      onPlain(await decryptText(line, password));
    } catch {
      setError('Wrong password, or the code is damaged.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.decrypt} onSubmit={go}>
      <label>
        <span>Password</span>
        <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
      </label>
      <button type="submit" className={styles.button} disabled={busy}>{busy ? 'Decrypting…' : 'Decrypt'}</button>
      {error && <p className={styles.bad}>{error}</p>}
    </form>
  );
}

export default function ContentView({ p, nested }: { p: Parsed; nested?: boolean }) {
  const [plain, setPlain] = React.useState<string | null>(null);
  const ios = React.useMemo(onIos, []);
  const actions = p.actions.filter((a) => a.only !== 'ios' || ios);
  return (
    <div className={nested ? styles.nested : undefined} data-kind={p.kind}>
      <div className={styles.kindLine}>
        <span className={styles.kind}>{p.title}</span>
        {p.subtitle && <span className={styles.subtitle}>{p.subtitle}</span>}
      </div>
      {p.warnings.length > 0 && (
        <ul className={styles.warnings}>{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      {p.otp && p.otp.length > 0 && <OtpCodes accounts={p.otp} />}
      {p.image && <ImagePreview bytes={p.image.bytes} mime={p.image.mime} />}
      <Fields fields={p.fields} />
      {p.groups?.map((g) => (
        <section key={g.title} className={styles.group}>
          <h4>{g.title}</h4>
          <Fields fields={g.fields} />
        </section>
      ))}
      {p.body !== undefined && p.body !== '' && <pre className={styles.body}>{p.body}</pre>}
      {p.encrypted && (plain === null ? <Decrypt line={p.encrypted.line} onPlain={setPlain} /> : (
        <>
          <h4>Decrypted text</h4>
          <pre className={styles.body}>{plain}</pre>
          <CopyButton text={plain} label="Copy decrypted text" />
        </>
      ))}
      {actions.length > 0 && <div className={styles.actions}>{actions.map((a) => <ActionButton key={a.label} a={a} />)}</div>}
      {p.notes.length > 0 && <ul className={styles.notes}>{p.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      {p.inner && (
        <section className={styles.innerSection}>
          <h4>Inside</h4>
          <ContentView p={p.inner} nested />
        </section>
      )}
    </div>
  );
}
