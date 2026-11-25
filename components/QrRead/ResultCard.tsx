// One code that was read (or text that was typed): the content preview, the raw content and the symbol.

import React from 'react';

import { decodeAs } from '../../lib/qrread/bytes';
import { parseContent } from '../../lib/qrread/content';
import type { Detection } from '../../lib/qrread/zxing';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/QrRead.module.css';
import { formatName } from './bits';
import ContentView from './ContentView';
import RawView from './RawView';
import SymbolView from './SymbolView';

export interface Reading {
  text: string;
  bytes: Uint8Array;
  /** The code, or null for typed text and joined structured-append messages. */
  detection: Detection | null;
}

type Tab = 'content' | 'raw' | 'symbol';

export default function ResultCard({ reading, label, id, highlighted, what }: { reading: Reading; label: string; id: string; highlighted?: boolean; what?: string }) {
  const { t } = useI18n();
  const d = reading.detection;
  const [tab, setTab] = React.useState<Tab>('content');
  const [encoding, setEncoding] = React.useState('auto');
  const text = React.useMemo(() => {
    if (encoding === 'auto') return reading.text;
    try { return decodeAs(reading.bytes, encoding); } catch { return reading.text; }
  }, [reading, encoding]);
  const parsed = React.useMemo(() => parseContent({
    text,
    bytes: reading.bytes,
    binary: encoding === 'auto' && d?.contentType === 'Binary',
    gs1: d ? d.symbologyId === ']Q3' || d.symbologyId === ']Q4' || d.contentType === 'GS1' : false,
  }), [text, reading, d, encoding]);

  if (d && !d.valid) {
    return (
      <article id={id} className={[styles.result, styles.unreadable, highlighted ? styles.highlight : ''].join(' ')}>
        <header className={styles.resultHead}>
          <span className={styles.badge}>{label}</span>
          <span>{t('qrread.card.unreadableHead', { format: formatName(d.format) })}</span>
        </header>
        <p>
          {t('qrread.card.unreadableBodyPre')}
          {d.error ? <span className={styles.muted}> ({d.error.replace(/\s*@.*$/, '')})</span> : null}
          {t('qrread.card.unreadableBodyPost')}
        </p>
      </article>
    );
  }

  const facts = d
    ? [formatName(d.format), d.version && t('qrread.card.version', { v: d.version }), d.ecLevel && t('qrread.card.level', { l: d.ecLevel })].filter(Boolean).join(' · ')
    : (what ?? t('qrread.card.defaultWhat'));
  const tabs: [Tab, string][] = [
    ['content', t('qrread.card.tabContent')],
    ['raw', t('qrread.card.tabRaw')],
    ...(d ? [['symbol', t('qrread.card.tabSymbol')] as [Tab, string]] : []),
  ];

  return (
    <article id={id} className={[styles.result, highlighted ? styles.highlight : ''].join(' ')} data-kind={parsed.kind}>
      <header className={styles.resultHead}>
        <span className={styles.badge}>{label}</span>
        <span>{facts}</span>
      </header>
      <div className={styles.tabs} role="tablist" aria-label={t('qrread.card.viewsAria')}>
        {tabs.map(([tabId, name]) => (
          <button key={tabId} type="button" role="tab" aria-selected={tab === tabId} className={tab === tabId ? styles.tabOn : styles.tab} onClick={() => setTab(tabId)}>{name}</button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === 'content' && <ContentView p={parsed} />}
        {tab === 'raw' && (
          <RawView
            text={text}
            bytes={reading.bytes}
            bytesECI={d?.bytesECI}
            encoding={encoding}
            setEncoding={setEncoding}
            readerCharset={d ? (d.hasECI ? t('qrread.card.charsetEci') : t('qrread.card.charsetGuessed')) : 'UTF-8'}
          />
        )}
        {tab === 'symbol' && d && <SymbolView d={d} />}
      </div>
    </article>
  );
}
