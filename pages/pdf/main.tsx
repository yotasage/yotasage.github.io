import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import ToolIcon from '../../components/PdfTools/ToolIcon';
import { PdfPage } from '../../components/PdfTools/ToolPage';
import PillTabs, { PillTabItem } from '../../components/UI/PillTabs';
import TeachingCallout from '../../components/UI/TeachingCallout';
import { PdfTool, TOOL_CATEGORIES } from '../../lib/pdf/tools';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  View: 'pdf.cat.view',
  Organize: 'pdf.cat.organize',
  Optimize: 'pdf.cat.optimize',
  'Edit & annotate': 'pdf.cat.edit',
  'Convert to PDF': 'pdf.cat.toPdf',
  'Convert from PDF': 'pdf.cat.fromPdf',
  Security: 'pdf.cat.security',
};

interface IndexedPdfTool {
  tool: PdfTool;
  categoryTitle: string;
}

const ALL_INDEXED_TOOLS: readonly IndexedPdfTool[] = TOOL_CATEGORIES.flatMap((category) =>
  category.tools.map((tool) => ({ tool, categoryTitle: category.title })),
);

function SearchIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export default function PdfTools() {
  const { t } = useI18n();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const getCategoryLabel = (title: string): string => {
    const key = CATEGORY_LABEL_KEYS[title];
    return key ? t(key) : title;
  };

  const categoryTabs = useMemo<readonly PillTabItem<string>[]>(
    () => [
      { id: 'all', label: t('pdf.cat.all'), badge: ALL_INDEXED_TOOLS.length },
      ...TOOL_CATEGORIES.map((category) => ({
        id: category.title,
        label: getCategoryLabel(category.title),
        badge: category.tools.length,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredTools = useMemo(() => {
    return ALL_INDEXED_TOOLS.filter(({ tool, categoryTitle }) => {
      if (activeCategory !== 'all' && categoryTitle !== activeCategory) return false;
      if (!normalizedQuery) return true;
      const localizedCat = getCategoryLabel(categoryTitle);
      const haystack = `${tool.title} ${tool.description} ${tool.id} ${categoryTitle} ${localizedCat}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, normalizedQuery, t]);

  const resetFilters = () => {
    setActiveCategory('all');
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  return (
    <PdfPage title={t('pdf.title')} lead={t('pdf.lead')}>
      <div className={styles.hubHeroMeta}>
        <span className={styles.hubEyebrow}>
          <span className={styles.hubEyebrowDot} aria-hidden="true" />
          <span>{t('pdf.eyebrow', { count: ALL_INDEXED_TOOLS.length })}</span>
        </span>
      </div>

      <TeachingCallout
        title={t('pdf.teaching.privacyTitle')}
        className={styles.hubTeaching}
      >
        {t('pdf.teaching.privacyBody')}
      </TeachingCallout>

      <div className={styles.hubDiscovery}>
        <div className={styles.hubFilterWrap}>
          <PillTabs<string>
            items={categoryTabs}
            value={activeCategory}
            onChange={(id) => setActiveCategory(id)}
            ariaLabel={t('pdf.filterAria')}
            size="sm"
          />
        </div>

        <div className={styles.hubSearchWrap}>
          <span className={styles.hubSearchIcon}>
            <SearchIcon />
          </span>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (searchQuery) {
                  setSearchQuery('');
                } else {
                  searchInputRef.current?.blur();
                }
              }
            }}
            placeholder={t('pdf.searchPlaceholder', { count: ALL_INDEXED_TOOLS.length })}
            aria-label={t('pdf.searchAria')}
            className={styles.hubSearchInput}
            autoComplete="off"
            spellCheck={false}
          />
          {searchQuery ? (
            <button
              type="button"
              className={styles.hubSearchClear}
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              aria-label={t('pdf.searchClear')}
              title={t('pdf.searchClear')}
            >
              <ClearIcon />
            </button>
          ) : (
            !searchFocused && (
              <kbd className={styles.hubKbdHint} aria-hidden="true">
                /
              </kbd>
            )
          )}
        </div>
      </div>

      {(normalizedQuery || activeCategory !== 'all') && filteredTools.length > 0 && (
        <p className={styles.hubResultsStatus} role="status" aria-live="polite">
          {t('pdf.resultsCount', { count: filteredTools.length, total: ALL_INDEXED_TOOLS.length })}
        </p>
      )}

      {filteredTools.length > 0 ? (
        <div className={styles.toolGrid}>
          {filteredTools.map(({ tool, categoryTitle }) => (
            <Link
              key={tool.id}
              href={tool.href}
              className={styles.toolTile}
              style={{ '--accent': tool.color } as React.CSSProperties}
            >
              <div className={styles.toolTileTop}>
                <span className={styles.toolIconChip}>
                  <ToolIcon name={tool.icon} color={tool.color} size={26} />
                </span>
                <span className={styles.toolCategory}>{getCategoryLabel(categoryTitle)}</span>
              </div>
              <h3 className={styles.toolTileTitle}>
                <span>{tool.title}</span>
                <span className={styles.toolArrow} aria-hidden="true">
                  &rarr;
                </span>
              </h3>
              <p>{tool.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.hubEmptyState} role="status" aria-live="polite">
          <p className={styles.hubEmptyTitle}>
            {t('pdf.noResults', { query: searchQuery.trim() })}
          </p>
          <p className={styles.hubEmptyHint}>{t('pdf.noResultsHint')}</p>
          <button type="button" className={styles.hubResetBtn} onClick={resetFilters}>
            {t('pdf.resetFilters')}
          </button>
        </div>
      )}

      <p className={styles.note}>
        {t('pdf.roadmapPrefix')}
        <a
          className={styles.textLink}
          href="https://github.com/yotasage/yotasage.github.io/blob/main/docs/pdf-tools-plan.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('pdf.roadmapLink')}
        </a>
        .
      </p>
    </PdfPage>
  );
}
