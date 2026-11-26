import React from 'react';

import { copyText } from '../../lib/base64image/clipboard';
import { countWords, getFormatFileExtension, getFormatMimeType } from '../../lib/lorem/generate';
import type { LoremFormat, LoremMode, LoremResult } from '../../lib/lorem/types';
import { download, errorMessage } from '../../lib/pdf/files';
import { groupDigits } from '../../lib/simsetup/numbers';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Lorem.module.css';

interface OutputPanelProps {
  result: LoremResult;
  mode: LoremMode;
  format: LoremFormat;
  onRegenerate: () => void;
}

type DisplayView = 'formatted' | 'raw';

export default function OutputPanel({
  result,
  mode,
  format,
  onRegenerate,
}: OutputPanelProps) {
  const { t } = useI18n();
  const [view, setView] = React.useState<DisplayView>('formatted');
  const [copied, setCopied] = React.useState(false);
  const [copiedBlockIndex, setCopiedBlockIndex] = React.useState<number | null>(null);
  const [copyError, setCopyError] = React.useState<string | null>(null);

  // Automatically show raw markup when switching to a code format, and formatted view for plain text.
  React.useEffect(() => {
    setView(format === 'plain' ? 'formatted' : 'raw');
  }, [format]);

  React.useEffect(() => {
    setCopied(false);
    setCopiedBlockIndex(null);
    setCopyError(null);
  }, [result.output]);

  const handleCopyAll = async () => {
    try {
      await copyText(result.output);
      setCopied(true);
      setCopyError(null);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setCopyError(errorMessage(err));
    }
  };

  const handleCopyBlock = async (index: number, text: string) => {
    try {
      await copyText(text);
      setCopiedBlockIndex(index);
      setCopyError(null);
      window.setTimeout(() => {
        setCopiedBlockIndex((cur) => (cur === index ? null : cur));
      }, 1500);
    } catch (err) {
      setCopyError(errorMessage(err));
    }
  };

  const handleDownload = () => {
    const ext = getFormatFileExtension(format);
    const mime = getFormatMimeType(format);
    const blob = new Blob([result.output], { type: mime });
    download(blob, `lorem-ipsum${ext}`);
  };

  const fmtCount = (n: number, one: string, many: string) =>
    `${groupDigits(String(n), 'space')} ${n === 1 ? one : many}`;

  const { stats } = result;
  const readTime =
    stats.readingSeconds < 60
      ? t('lorem.stats.readSec', { sec: stats.readingSeconds })
      : t('lorem.stats.readMin', { min: Math.max(1, Math.round(stats.readingSeconds / 60)) });

  const blockLabelOne = mode === 'list' ? t('lorem.stats.itemOne') : t('lorem.stats.paraOne');
  const blockLabelMany = mode === 'list' ? t('lorem.stats.itemMany') : t('lorem.stats.paraMany');

  return (
    <section className={styles.card} aria-label={t('lorem.output.title')}>
      <div className={styles.outputHeader}>
        <div className={styles.outputTitleGroup}>
          <h2 className={styles.cardTitle}>{t('lorem.output.title')}</h2>
          <div className={styles.segmented} role="group" aria-label={t('lorem.output.viewAria')}>
            <button
              type="button"
              aria-pressed={view === 'formatted'}
              className={[styles.segBtn, view === 'formatted' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setView('formatted')}
            >
              {t('lorem.output.viewFormatted')}
            </button>
            <button
              type="button"
              aria-pressed={view === 'raw'}
              className={[styles.segBtn, view === 'raw' ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setView('raw')}
            >
              {t('lorem.output.viewRaw')}
            </button>
          </div>
        </div>

        <div className={styles.outputActions}>
          <button type="button" className={styles.button} onClick={onRegenerate}>
            {t('lorem.output.regenerate')}
          </button>
          <button type="button" className={styles.button} onClick={handleDownload}>
            {t('lorem.output.download')} {getFormatFileExtension(format)}
          </button>
          <button
            type="button"
            className={copied ? styles.copiedButton : styles.primaryButton}
            onClick={handleCopyAll}
          >
            {copied ? t('lorem.output.copied') : t('lorem.output.copy')}
          </button>
        </div>
      </div>

      {/* Live metrics bar (unboxed tabular numerals) */}
      <div className={styles.statsBar} role="status" aria-live="polite" data-testid="lorem-stats">
        <span className={styles.statStrong}>
          {fmtCount(stats.words, t('lorem.stats.wordOne'), t('lorem.stats.wordMany'))}
        </span>
        <span className={styles.statSep} aria-hidden="true">·</span>
        <span>{fmtCount(stats.paragraphs, blockLabelOne, blockLabelMany)}</span>
        <span className={styles.statSep} aria-hidden="true">·</span>
        <span>{fmtCount(stats.sentences, t('lorem.stats.sentOne'), t('lorem.stats.sentMany'))}</span>
        <span className={styles.statSep} aria-hidden="true">·</span>
        <span>{fmtCount(stats.characters, t('lorem.stats.charOne'), t('lorem.stats.charMany'))}</span>
        <span className={styles.statSep} aria-hidden="true">·</span>
        <span>{readTime}</span>
      </div>

      {view === 'formatted' ? (
        <div className={styles.proseSheet} data-testid="lorem-formatted-output">
          <div className={styles.proseInner}>
            {mode === 'list' ? (
              <ul className={styles.proseList}>
                {result.blocks.map((block, index) => (
                  <li key={index}>{block.text}</li>
                ))}
              </ul>
            ) : (
              result.blocks.map((block, index) => {
                const blockWords = countWords(block.text);
                const copyTextValue = block.heading ? `${block.heading}\n${block.text}` : block.text;
                const isCopied = copiedBlockIndex === index;
                return (
                  <article key={index} className={styles.proseBlock}>
                    {block.heading && <h3 className={styles.proseHeading}>{block.heading}</h3>}
                    <p className={styles.proseText}>{block.text}</p>
                    {result.blocks.length > 1 && (
                      <div className={styles.blockFooter}>
                        <span className={styles.blockWordMeta}>
                          {t('lorem.output.wordCountHint', { count: blockWords })}
                        </span>
                        <button
                          type="button"
                          className={styles.blockCopyBtn}
                          aria-label={t('lorem.output.copyBlockAria', { index: index + 1 })}
                          onClick={() => handleCopyBlock(index, copyTextValue)}
                        >
                          {isCopied ? t('lorem.output.copiedShort') : t('lorem.output.copyBlock')}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <textarea
          className={styles.rawTextarea}
          readOnly
          spellCheck={false}
          value={result.output}
          aria-label={t('lorem.output.rawAria')}
          data-testid="lorem-raw-output"
        />
      )}

      {copyError && <p className={styles.copyError}>{copyError}</p>}
    </section>
  );
}
