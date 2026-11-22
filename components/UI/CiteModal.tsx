import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CitationFormatId,
  CitationOptions,
  CitationScope,
  formatCitation,
  formatInTextCitation,
  formatPlainText,
  getFormatDownloadMeta,
  PageCitationMeta,
  PlainTextStyle,
  ProjectCitationMeta,
  resolveCitationTarget,
} from '../../lib/citation';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/SiteFooter.module.css';
import PillTabs, { PillTabItem } from './PillTabs';

export interface CiteModalProps {
  open: boolean;
  onClose: () => void;
  page: PageCitationMeta;
  project: ProjectCitationMeta;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}

const FORMAT_IDS: readonly CitationFormatId[] = [
  'biblatex',
  'bibtex',
  'ris',
  'word',
  'csl',
  'cff',
  'text',
];

const PLAIN_TEXT_STYLES: readonly PlainTextStyle[] = ['ieee', 'apa', 'harvard', 'chicago', 'mla'];

function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function copyText(text: string, container?: HTMLElement | null): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for restricted clipboard contexts.
    }
  }
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  const host = container ?? document.body;
  host.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  host.removeChild(textarea);
  return copied;
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CiteModal({
  open,
  onClose,
  page,
  project,
  triggerRef,
}: CiteModalProps) {
  const { locale, t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const wasOpenRef = useRef(false);
  const lastRouteRef = useRef(page.route);
  const copyTimerRef = useRef<number | null>(null);

  const [scope, setScope] = useState<CitationScope>(page.kind === 'project' ? 'project' : 'tool');
  const [format, setFormat] = useState<CitationFormatId>('biblatex');
  const [includeAccessedDate, setIncludeAccessedDate] = useState(true);
  const [includeHash, setIncludeHash] = useState(true);
  const [includePageState, setIncludePageState] = useState(false);

  const [accessedDate, setAccessedDate] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [hasPageState, setHasPageState] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setAccessedDate(formatLocalIsoDate(new Date()));
      setCurrentUrl(window.location.href);
      const urlHasState = Boolean(window.location.search || window.location.hash);
      setHasPageState(urlHasState);

      if (page.kind === 'project') {
        setScope('project');
        setIncludePageState(false);
      } else if (lastRouteRef.current !== page.route) {
        setScope('tool');
        setIncludePageState(false);
      }
      lastRouteRef.current = page.route;

      if (!dialog.open) {
        dialog.showModal();
      }
      wasOpenRef.current = true;
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        const trigger = triggerRef?.current;
        if (trigger && trigger.isConnected) {
          trigger.focus();
        }
      }
    }
  }, [open, page.kind, page.route, triggerRef]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async (id: string, text: string) => {
    const ok = await copyText(text, dialogRef.current);
    if (!ok) return;
    setCopiedId(id);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedId((current) => (current === id ? null : current));
      copyTimerRef.current = null;
    }, 2000);
  }, []);

  const handleDialogClose = useCallback(() => {
    if (open) {
      onClose();
    }
  }, [open, onClose]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === dialogRef.current) {
        onClose();
      }
    },
    [onClose],
  );

  const citationOptions = useMemo<CitationOptions>(
    () => ({
      scope: page.kind === 'project' ? 'project' : scope,
      accessedDate: accessedDate || undefined,
      includeAccessedDate,
      includeHash,
      currentUrl: currentUrl || undefined,
      includePageState: hasPageState && includePageState,
      locale,
    }),
    [page.kind, scope, accessedDate, includeAccessedDate, includeHash, currentUrl, hasPageState, includePageState, locale],
  );

  const target = useMemo(
    () => resolveCitationTarget(page, project, citationOptions),
    [page, project, citationOptions],
  );

  const scopeItems = useMemo<readonly PillTabItem<CitationScope>[]>(
    () => [
      {
        id: 'tool',
        label: page.kind === 'tool' ? t('cite.scopeTool') : t('cite.scopePage'),
      },
      {
        id: 'project',
        label: t('cite.scopeProject'),
      },
    ],
    [page.kind, t],
  );

  const formatItems = useMemo<readonly PillTabItem<CitationFormatId>[]>(
    () =>
      FORMAT_IDS.map((id) => ({
        id,
        label: t(`cite.format.${id}`),
      })),
    [t],
  );

  const formattedEntry = useMemo(() => {
    if (!open || format === 'text') return '';
    return formatCitation(format, target, citationOptions);
  }, [open, format, target, citationOptions]);

  const downloadMeta = useMemo(() => {
    if (!open) return null;
    return getFormatDownloadMeta(format, target);
  }, [open, format, target]);

  const plainEntries = useMemo(() => {
    if (!open || format !== 'text') return [];
    return PLAIN_TEXT_STYLES.map((style) => ({
      style,
      label: t(`cite.style.${style}`),
      text: formatPlainText(target, style, citationOptions),
      inText: formatInTextCitation(target, style, locale),
    }));
  }, [open, format, target, citationOptions, locale, t]);

  const modalTitle = page.kind === 'tool' ? t('cite.modalTitleTool') : t('cite.modalTitlePage');
  const displayAccessedDate = accessedDate || target.lastChanged;

  return (
    <dialog
      ref={dialogRef}
      data-ds="v2"
      className={styles.dialog}
      aria-labelledby="cite-modal-title"
      onClose={handleDialogClose}
      onClick={handleBackdropClick}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {open && (
        <div className={styles.modalSurface}>
          <header className={styles.modalHeader}>
            <div className={styles.modalHeadingGroup}>
              <h2 id="cite-modal-title" className={styles.modalTitle}>
                {modalTitle}
              </h2>
              <p className={styles.modalSubtitle}>{t('cite.modalSubtitle')}</p>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </header>

          <div className={styles.modalBody}>
            <section className={styles.metaCard} aria-label={t('cite.meta.heading')}>
              <h3 className={styles.metaCardTitle}>{t('cite.meta.heading')}</h3>
              <dl className={styles.metaGrid}>
                <div className={styles.metaRow}>
                  <dt className={styles.metaLabel}>{t('cite.meta.lastChanged')}</dt>
                  <dd className={styles.metaValue}>
                    <span>{target.lastChanged}</span>
                    {!target.isProject && page.fileCount > 0 && (
                      <span className={styles.metaBadge}>
                        {t('cite.meta.filesTracked', { count: page.fileCount })}
                      </span>
                    )}
                  </dd>
                </div>

                <div className={styles.metaRow}>
                  <dt className={styles.metaLabel}>{t('cite.meta.commit')}</dt>
                  <dd className={styles.metaValue}>
                    {target.commit ? (
                      <a
                        className={styles.metaMonoLink}
                        href={target.commitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={target.commit}
                      >
                        {target.commitShort}
                      </a>
                    ) : (
                      <code className={styles.metaCode}>{target.commitShort || '—'}</code>
                    )}
                  </dd>
                </div>

                <div className={styles.metaRow}>
                  <dt className={styles.metaLabel}>{t('cite.meta.contentHash')}</dt>
                  <dd className={styles.metaValue}>
                    <span className={styles.metaInline}>
                      <code className={styles.metaCode} title={target.contentHashFull}>
                        sha256:{target.contentHash}
                      </code>
                      <button
                        type="button"
                        className={styles.miniCopyBtn}
                        onClick={() => void handleCopy('hash', `sha256:${target.contentHashFull}`)}
                      >
                        {copiedId === 'hash' ? t('common.copied') : t('common.copy')}
                      </button>
                    </span>
                  </dd>
                </div>

                <div className={styles.metaRow}>
                  <dt className={styles.metaLabel}>{t('cite.meta.license')}</dt>
                  <dd className={styles.metaValue}>
                    <Link href="/licenses" className={styles.metaLink} onClick={onClose}>
                      {target.license}
                    </Link>
                  </dd>
                </div>

                <div className={styles.metaRow}>
                  <dt className={styles.metaLabel}>{t('cite.meta.source')}</dt>
                  <dd className={styles.metaValue}>
                    <a
                      className={styles.metaMonoLink}
                      href={target.sourceBlobUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={target.sourcePath || 'yotasage/yotasage.github.io'}
                    >
                      {target.sourcePath || 'yotasage/yotasage.github.io'}
                    </a>
                  </dd>
                </div>

                <div className={styles.metaRow}>
                  <dt className={styles.metaLabel}>{t('cite.meta.url')}</dt>
                  <dd className={styles.metaValue}>
                    <span className={styles.metaInline}>
                      <a
                        className={styles.metaUrlLink}
                        href={target.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={target.url}
                      >
                        {target.url}
                      </a>
                      <button
                        type="button"
                        className={styles.miniCopyBtn}
                        onClick={() => void handleCopy('url', target.url)}
                      >
                        {copiedId === 'url' ? t('common.copied') : t('common.copy')}
                      </button>
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            <div className={styles.controlsRow}>
              {page.kind !== 'project' && (
                <PillTabs<CitationScope>
                  items={scopeItems}
                  value={scope}
                  onChange={setScope}
                  ariaLabel={t('cite.scopeAria')}
                  size="sm"
                  idPrefix="cite-scope"
                />
              )}

              <div className={styles.optionsGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={includeAccessedDate}
                    onChange={(event) => setIncludeAccessedDate(event.target.checked)}
                  />
                  <span>{t('cite.opt.accessDate', { date: displayAccessedDate })}</span>
                </label>

                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={includeHash}
                    onChange={(event) => setIncludeHash(event.target.checked)}
                  />
                  <span>{t('cite.opt.hash')}</span>
                </label>

                {!target.isProject && hasPageState && (
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={includePageState}
                      onChange={(event) => setIncludePageState(event.target.checked)}
                    />
                    <span>{t('cite.opt.pageState')}</span>
                  </label>
                )}
              </div>
            </div>

            <div className={styles.formatBar}>
              <PillTabs<CitationFormatId>
                items={formatItems}
                value={format}
                onChange={setFormat}
                ariaLabel={t('cite.formatAria')}
                size="sm"
                idPrefix="cite-format"
              />
            </div>

            <div
              role="tabpanel"
              id={`cite-format-panel-${format}`}
              aria-labelledby={`cite-format-tab-${format}`}
              className={styles.outputPanel}
            >
              {format !== 'text' ? (
                <>
                  <pre className={styles.codeBlock}>
                    <code>{formattedEntry}</code>
                  </pre>
                  <p className={styles.hint}>{t(`cite.hint.${format}`)}</p>
                  <div className={styles.actionBar}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void handleCopy('entry', formattedEntry)}
                    >
                      {copiedId === 'entry' ? (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                        </svg>
                      )}
                      <span>{copiedId === 'entry' ? t('common.copied') : t('cite.copyEntry')}</span>
                    </button>

                    {downloadMeta && (
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={() =>
                          triggerDownload(formattedEntry, downloadMeta.filename, downloadMeta.mimeType)
                        }
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" x2="12" y1="15" y2="3" />
                        </svg>
                        <span className={styles.downloadLong}>
                          {t('cite.download', { filename: downloadMeta.filename })}
                        </span>
                        <span className={styles.downloadShort}>{t('cite.downloadShort')}</span>
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className={styles.hint}>{t('cite.hint.text')}</p>
                  <div className={styles.plainList}>
                    {plainEntries.map(({ style, label, text, inText }) => (
                      <div key={style} className={styles.plainCard}>
                        <div className={styles.plainCardHead}>
                          <span className={styles.styleBadge}>{label}</span>
                          <button
                            type="button"
                            className={styles.plainCopyBtn}
                            aria-label={t('cite.copyStyle', { style: label })}
                            onClick={() => void handleCopy(style, text)}
                          >
                            {copiedId === style ? t('common.copied') : t('common.copy')}
                          </button>
                        </div>
                        <p className={styles.plainText}>{text}</p>
                        <p className={styles.inTextHint}>{t('cite.inText', { text: inText })}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
