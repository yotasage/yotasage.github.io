// The raw content of a code: the text with control and invisible characters named, the bytes as a hex dump, and
// the bytes read in another character set.

import React from 'react';

import { ENCODINGS, formatSize, hex, hexDump, visiblePieces } from '../../lib/qrread/bytes';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/QrRead.module.css';
import { CopyButton, save } from './bits';

export function VisibleText({ text }: { text: string }) {
  const { t } = useI18n();
  const pieces = React.useMemo(() => visiblePieces(text), [text]);
  return (
    <pre className={styles.raw}>
      {pieces.map((p, i) => (p.name
        ? <React.Fragment key={i}><abbr className={styles.ctrl} title={p.name}>{p.name}</abbr>{p.text === '\n' ? '\n' : ''}</React.Fragment>
        : <React.Fragment key={i}>{p.text}</React.Fragment>))}
      {text === '' && <span className={styles.muted}>{t('qrread.raw.empty')}</span>}
    </pre>
  );
}

export default function RawView({ text, bytes, bytesECI, encoding, setEncoding, readerCharset }: {
  text: string;
  bytes: Uint8Array;
  bytesECI?: Uint8Array | null;
  encoding: string;
  setEncoding: (e: string) => void;
  /** What the reader based its text on, e.g. "ECI" or "guessed". */
  readerCharset: string;
}) {
  const { t } = useI18n();
  const dump = React.useMemo(() => hexDump(bytes), [bytes]);
  const named = React.useMemo(() => visiblePieces(text).filter((p) => p.name && p.name !== 'LF' && p.name !== 'CR LF').length, [text]);
  return (
    <div className={styles.rawView}>
      <div className={styles.rawHead}>
        <h4>{t('qrread.raw.textTitle')}</h4>
        <label className={styles.inline}>
          <span>{t('qrread.raw.readAs')}</span>
          <select className={styles.select} value={encoding} onChange={(e) => setEncoding(e.target.value)}>
            <option value="auto">{t('qrread.raw.readerChoice', { charset: readerCharset })}</option>
            {ENCODINGS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
      </div>
      <VisibleText text={text} />
      <p className={styles.muted}>
        {t('qrread.raw.stats', { chars: [...text].length, size: formatSize(bytes.length) })}
        {named > 0 && (named === 1 ? t('qrread.raw.namedOne') : t('qrread.raw.namedMany', { n: named }))}
      </p>
      <div className={styles.actions}>
        <CopyButton text={text} label={t('qrread.raw.copyText')} />
        <CopyButton text={hex(bytes)} label={t('qrread.raw.copyHex')} />
        <button type="button" className={styles.button} onClick={() => save({ name: 'code-content.bin', mime: 'application/octet-stream', data: bytes })}>{t('qrread.raw.saveBytes')}</button>
      </div>
      <h4>{t('qrread.raw.bytesTitle')}</h4>
      <pre className={[styles.raw, styles.hexDump].join(' ')}>{dump || t('qrread.raw.noBytes')}</pre>
      {bytesECI && bytesECI.length > 0 && !sameBytes(bytesECI, bytes) && (
        <details className={styles.details}>
          <summary>{t('qrread.raw.eciSummary')}</summary>
          <p className={styles.muted}>{t('qrread.raw.eciNote')}</p>
          <pre className={[styles.raw, styles.hexDump].join(' ')}>{hexDump(bytesECI)}</pre>
        </details>
      )}
    </div>
  );
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
