import Link from 'next/link';
import React, { useMemo, useState } from 'react';

import { Reference } from '../components/Bibliography';
import PageHead from '../components/PageHead';
import ToolHeader from '../components/UI/ToolHeader';
import {
  EntryTypeFilter,
  filterAndSortReferences,
  formatBibtexEntry,
  IndexedReference,
  SortMode,
  ToolFilter,
  ToolRefInfo,
} from '../lib/referencesCatalog';
import { loadIndexedReferences } from '../lib/referencesIndex';
import { TranslationKey, useI18n } from '../lib/ui/i18n';
import { useDesignSystemPage } from '../lib/ui/theme';
import useReplayHighlight from '../lib/useReplayHighlight';
import styles from '../styles/References.module.css';

interface ReferencesPageProps {
  items: IndexedReference[];
  tools: ToolRefInfo[];
}

const KNOWN_TYPE_KEYS: Record<string, TranslationKey> = {
  article: 'references.type.article',
  inproceedings: 'references.type.inproceedings',
  techreport: 'references.type.techreport',
  online: 'references.type.online',
  book: 'references.type.book',
  patent: 'references.type.patent',
};

const TYPE_ORDER = ['article', 'inproceedings', 'techreport', 'online', 'book', 'patent'];

// Reads references.bib and discovers citing tools at build time (static export safe).
export async function getStaticProps() {
  const { items, tools } = loadIndexedReferences();
  return { props: { items, tools } };
}

export default function ReferencesPage({ items, tools }: ReferencesPageProps) {
  useDesignSystemPage('#2563eb', '#60a5fa');
  const { t } = useI18n();
  useReplayHighlight();

  const [query, setQuery] = useState('');
  const [toolFilter, setToolFilter] = useState<ToolFilter>('all');
  const [entryType, setEntryType] = useState<EntryTypeFilter>('all');
  const [sort, setSort] = useState<SortMode>('bib');
  const [openBibtex, setOpenBibtex] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const toolLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of tools) {
      const label = tool.titleKey ? t(tool.titleKey as TranslationKey) : tool.fallbackTitle;
      map.set(tool.route, label);
    }
    return map;
  }, [tools, t]);

  const citedCount = useMemo(() => items.filter((item) => item.citedBy.length > 0).length, [items]);
  const uncitedCount = items.length - citedCount;

  const availableTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.entry.type, (counts.get(item.entry.type) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a[0]);
      const ib = TYPE_ORDER.indexOf(b[0]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a[0].localeCompare(b[0], 'en');
    });
  }, [items]);

  const visibleItems = useMemo(
    () =>
      filterAndSortReferences(
        items,
        { query, tool: toolFilter, entryType, sort },
        toolLabels,
      ),
    [items, query, toolFilter, entryType, sort, toolLabels],
  );

  const formatTypeLabel = (type: string): string => {
    const key = KNOWN_TYPE_KEYS[type];
    return key ? t(key) : `@${type}`;
  };

  const toggleBibtex = (key: string) => {
    setOpenBibtex((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const copyBibtex = (item: IndexedReference) => {
    const text = formatBibtexEntry(item.entry);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedKey(item.entry.key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === item.entry.key ? null : current));
    }, 1800);
  };

  const resetFilters = () => {
    setQuery('');
    setToolFilter('all');
    setEntryType('all');
    setSort('bib');
  };

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('references.pageTitle')}
        description="Complete bibliography of standards, papers, datasheets, textbooks, and online references from references.bib used across the engineering tools on yotasage.github.io."
        path="/references"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader title={t('references.title')} showExperienceMode={false} />

      <main className={styles.main}>
        <div className={styles.content}>
          <section className={styles.introCard} aria-label={t('references.title')}>
            <p className={styles.lead}>
              {t('references.leadPrefix')}
              <a
                href="https://github.com/yotasage/yotasage.github.io/blob/main/references.bib"
                target="_blank"
                rel="noopener noreferrer"
              >
                <code>references.bib</code>
              </a>
              {t('references.leadSuffix')}
            </p>
            <div className={styles.summaryRow}>
              <span className={styles.summaryStrong}>
                {t('references.summary.total', { count: items.length })}
              </span>
              <span className={styles.sep} aria-hidden="true">·</span>
              <span>
                {t('references.summary.cited', { count: citedCount, tools: tools.length })}
              </span>
              <span className={styles.sep} aria-hidden="true">·</span>
              <span>{t('references.summary.uncited', { count: uncitedCount })}</span>
            </div>
          </section>

          <section className={styles.controlsCard} aria-label={t('references.searchLabel')}>
            <div className={styles.searchRow}>
              <div className={styles.searchWrap}>
                <svg
                  className={styles.searchIcon}
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="search"
                  className={styles.searchInput}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('references.searchPlaceholder')}
                  aria-label={t('references.searchLabel')}
                />
                {query && (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => setQuery('')}
                    aria-label={t('references.searchClear')}
                    title={t('references.searchClear')}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className={styles.toolFilterBar} role="group" aria-label={t('references.filterToolAria')}>
              <button
                type="button"
                aria-pressed={toolFilter === 'all'}
                className={`${styles.toolTab} ${toolFilter === 'all' ? styles.toolTabActive : ''}`}
                onClick={() => setToolFilter('all')}
              >
                <span>{t('references.filter.all')}</span>
                <span className={styles.tabCount}>{items.length}</span>
              </button>
              <button
                type="button"
                aria-pressed={toolFilter === 'cited'}
                className={`${styles.toolTab} ${toolFilter === 'cited' ? styles.toolTabActive : ''}`}
                onClick={() => setToolFilter('cited')}
              >
                <span>{t('references.filter.cited')}</span>
                <span className={styles.tabCount}>{citedCount}</span>
              </button>
              {tools.map((tool) => {
                const active = toolFilter === tool.route;
                const label = toolLabels.get(tool.route) ?? tool.fallbackTitle;
                return (
                  <button
                    key={tool.route}
                    type="button"
                    aria-pressed={active}
                    className={`${styles.toolTab} ${active ? styles.toolTabActive : ''}`}
                    onClick={() => setToolFilter(tool.route)}
                  >
                    <span>{label}</span>
                    <span className={styles.tabCount}>{tool.count}</span>
                  </button>
                );
              })}
              {uncitedCount > 0 && (
                <button
                  type="button"
                  aria-pressed={toolFilter === 'uncited'}
                  className={`${styles.toolTab} ${toolFilter === 'uncited' ? styles.toolTabActive : ''}`}
                  onClick={() => setToolFilter('uncited')}
                >
                  <span>{t('references.filter.uncited')}</span>
                  <span className={styles.tabCount}>{uncitedCount}</span>
                </button>
              )}
            </div>

            <div className={styles.selectsRow}>
              <div className={styles.selectGroup}>
                <label className={styles.selectField}>
                  <span>{t('references.typeLabel')}</span>
                  <select
                    className={styles.select}
                    value={entryType}
                    onChange={(e) => setEntryType(e.target.value)}
                  >
                    <option value="all">{t('references.type.all')}</option>
                    {availableTypes.map(([type, count]) => (
                      <option key={type} value={type}>
                        {formatTypeLabel(type)} ({count})
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.selectField}>
                  <span>{t('references.sortLabel')}</span>
                  <select
                    className={styles.select}
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortMode)}
                  >
                    <option value="bib">{t('references.sort.bib')}</option>
                    <option value="key">{t('references.sort.key')}</option>
                    <option value="year-desc">{t('references.sort.yearDesc')}</option>
                    <option value="year-asc">{t('references.sort.yearAsc')}</option>
                    <option value="citations">{t('references.sort.citations')}</option>
                  </select>
                </label>
              </div>

              <p className={styles.resultsCount} aria-live="polite">
                {t('references.resultsCount', { count: visibleItems.length, total: items.length })}
              </p>
            </div>
          </section>

          <section className={styles.listCard} aria-label={t('references.title')}>
            {visibleItems.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>{t('references.emptyTitle')}</p>
                <p className={styles.emptyHint}>{t('references.emptyHint')}</p>
                <button type="button" className={styles.resetBtn} onClick={resetFilters}>
                  {t('references.resetFilters')}
                </button>
              </div>
            ) : (
              <ol className={styles.list} data-testid="references-list">
                {visibleItems.map((item, idx) => {
                  const key = item.entry.key;
                  const bibOpen = Boolean(openBibtex[key]);
                  const isCopied = copiedKey === key;

                  return (
                    <li key={key} id={`ref-${key}`} className={styles.item}>
                      <span className={styles.number}>[{idx + 1}]</span>
                      <div className={styles.body}>
                        <p className={styles.citationText}>
                          <Reference entry={item.entry} />
                        </p>

                        <div className={styles.metaRow}>
                          <div className={styles.metaLeft}>
                            <span className={styles.bibKey}>{key}</span>
                            <span className={styles.sep} aria-hidden="true">·</span>
                            <span className={styles.entryType}>@{item.entry.type}</span>
                            <span className={styles.sep} aria-hidden="true">·</span>
                            {item.citedBy.length > 0 ? (
                              <span className={styles.citedIn}>
                                <span className={styles.citedInLabel}>{t('references.citedIn')}</span>
                                {item.citedBy.map((route, i) => (
                                  <React.Fragment key={route}>
                                    {i > 0 && <span aria-hidden="true">, </span>}
                                    <Link href={`${route}#ref-${key}`} className={styles.toolLink}>
                                      {toolLabels.get(route) ?? route}
                                    </Link>
                                  </React.Fragment>
                                ))}
                              </span>
                            ) : (
                              <span className={styles.uncitedNote}>{t('references.notCited')}</span>
                            )}
                          </div>

                          <div className={styles.actions}>
                            <button
                              type="button"
                              aria-expanded={bibOpen}
                              aria-label={`${bibOpen ? t('references.hideBibtex') : t('references.showBibtex')} ${key}`}
                              className={`${styles.actionBtn} ${bibOpen ? styles.actionBtnActive : ''}`}
                              onClick={() => toggleBibtex(key)}
                            >
                              {bibOpen ? t('references.hideBibtex') : t('references.showBibtex')}
                            </button>
                            <button
                              type="button"
                              aria-label={`${t('references.copyBibtex')} ${key}`}
                              className={styles.actionBtn}
                              onClick={() => copyBibtex(item)}
                            >
                              {isCopied ? t('common.copied') : t('references.copyBibtex')}
                            </button>
                          </div>
                        </div>

                        {bibOpen && (
                          <pre className={styles.bibtexBlock}>
                            <code>{formatBibtexEntry(item.entry)}</code>
                          </pre>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
