// Examples tab of the Python Playground: a card per built-in example (lib/python/examples/).
// "Load in workbench" only copies the example's files into its own folder and opens the entry
// file; running it is always a separate click on Run (click-to-run). A search box and tag chips
// filter the cards (U1); that state is plain React state, never the URL (which carries ?net=).
import { useCallback, useEffect, useId, useMemo, useState } from 'react';

import { getPythonExampleTagKey, PYTHON_EXAMPLE_TAGS, PYTHON_EXAMPLES } from '../../lib/python/examples';
import type { PythonExampleTag } from '../../lib/python/examples';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PythonExamples.module.css';

export type PlaygroundView = 'workbench' | 'examples' | 'packages';

/** Prefix of the header tab ids (`python-ws-tab-<view>`) and their panels (`python-ws-panel-<view>`). */
export const PLAYGROUND_VIEW_ID_PREFIX = 'python-ws';

export function playgroundTabId(view: PlaygroundView): string {
  return `${PLAYGROUND_VIEW_ID_PREFIX}-tab-${view}`;
}

export function playgroundPanelId(view: PlaygroundView): string {
  return `${PLAYGROUND_VIEW_ID_PREFIX}-panel-${view}`;
}

/**
 * Which header tab is shown. Plain React state: a tab change never touches the URL (the network
 * mode lives in its query), and a `#examples` or `#packages` link opens that tab.
 */
export function usePlaygroundView(): [PlaygroundView, (view: PlaygroundView) => void] {
  const [view, setView] = useState<PlaygroundView>('workbench');
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === '#examples') setView('examples');
      else if (window.location.hash === '#packages') setView('packages');
      else if (window.location.hash === '#workbench') setView('workbench');
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  return [view, setView];
}

/**
 * Keeps `--python-header-h` on <html> equal to the sticky ToolHeader's height, so the playground's
 * sticky phone toolbar (Run, Stop) sits just below the header however many rows the header wraps to.
 */
export function useHeaderHeightVar(): void {
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const sync = () => root.style.setProperty('--python-header-h', `${Math.round(header.getBoundingClientRect().height)}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--python-header-h');
    };
  }, []);
}

const FOLD: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', đ: 'd', ł: 'l', ı: 'i' };

/** Lower case without accents (å → a, é → e, ø → o), for case- and accent-insensitive search. */
export function foldSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[øæœßđłı]/g, (c) => FOLD[c] ?? c);
}

/** Tags that at least one example has, in PYTHON_EXAMPLE_TAGS order. */
const USED_TAGS: readonly PythonExampleTag[] = PYTHON_EXAMPLE_TAGS.filter((tag) => PYTHON_EXAMPLES.some((ex) => ex.tag === tag));

export interface ExamplesGalleryProps {
  hidden: boolean;
  /** Why loading is not possible right now (another tab holds the workspace, still loading), or null. */
  disabledReason: string | null;
  /** Copies the example into the workspace and switches to the workbench; resolves false on failure. */
  onLoad: (exampleId: string) => Promise<boolean>;
}

export default function ExamplesGallery({ hidden, disabledReason, onLoad }: ExamplesGalleryProps) {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  const ids = useId();
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<PythonExampleTag | null>(null);

  const cards = useMemo(
    () =>
      PYTHON_EXAMPLES.map((ex) => {
        const title = t(ex.titleKey);
        const description = t(ex.descriptionKey);
        const tagLabel = t(getPythonExampleTagKey(ex.tag));
        const files = Object.keys(ex.files).join(', ');
        return {
          id: ex.id,
          tag: ex.tag,
          packages: ex.packages,
          title,
          description,
          tagLabel,
          files,
          haystack: foldSearchText([title, description, tagLabel, files, ex.packages.join(' ')].join('\n')),
        };
      }),
    [t],
  );

  // Every word of the query must appear somewhere in the card's text, in any order.
  const words = useMemo(() => foldSearchText(query).split(/\s+/).filter(Boolean), [query]);
  const shown = useMemo(
    () => cards.filter((c) => (tagFilter === null || c.tag === tagFilter) && words.every((w) => c.haystack.includes(w))),
    [cards, tagFilter, words],
  );
  const filtered = words.length > 0 || tagFilter !== null;
  const clearFilters = useCallback(() => {
    setQuery('');
    setTagFilter(null);
  }, []);

  const handleLoad = useCallback(
    async (id: string) => {
      if (busyId || disabledReason) return;
      setBusyId(id);
      setFailedId(null);
      try {
        const ok = await onLoad(id);
        if (!ok) setFailedId(id);
      } catch {
        setFailedId(id);
      } finally {
        setBusyId(null);
      }
    },
    [busyId, disabledReason, onLoad],
  );

  const disabled = disabledReason !== null || busyId !== null;

  return (
    <section
      role="tabpanel"
      id={playgroundPanelId('examples')}
      aria-labelledby={playgroundTabId('examples')}
      hidden={hidden}
      className={styles.panel}
      data-testid="python-examples-gallery"
    >
      <div className={styles.intro}>
        <h2 className={styles.title}>{t('python.examplesTabTitle')}</h2>
        <p className={styles.lead}>{t('python.examplesTabIntro')}</p>
        <p className={styles.note}>{t('python.examplesTabOverwrite')}</p>
        {disabledReason && (
          <p className={styles.disabledReason} role="status" data-testid="python-examples-disabled-reason">
            {disabledReason}
          </p>
        )}
      </div>

      <div className={styles.filters} data-testid="python-examples-filters">
        <div className={styles.searchRow}>
          <label htmlFor={`${ids}-search`} className={styles.searchLabel}>
            {t('python.examplesSearchLabel')}
          </label>
          <input
            id={`${ids}-search`}
            type="search"
            className={styles.search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('python.examplesSearchPlaceholder')}
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            data-testid="python-examples-search"
          />
        </div>
        <div className={styles.chips} role="group" aria-label={t('python.examplesTagGroupAria')}>
          <button
            type="button"
            className={styles.chip}
            aria-pressed={tagFilter === null}
            onClick={() => setTagFilter(null)}
            data-testid="python-examples-chip-all"
          >
            {t('python.examplesTagAll')}
          </button>
          {USED_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={styles.chip}
              data-tag={tag}
              aria-pressed={tagFilter === tag}
              onClick={() => setTagFilter((cur) => (cur === tag ? null : tag))}
              data-testid={`python-examples-chip-${tag}`}
            >
              {t(getPythonExampleTagKey(tag))}
            </button>
          ))}
        </div>
        <p className={styles.count} role="status" aria-live="polite" data-testid="python-examples-count">
          {filtered
            ? t('python.examplesCountFiltered', { count: shown.length, total: cards.length })
            : t('python.examplesCountAll', { total: cards.length })}
        </p>
      </div>

      {shown.length === 0 && (
        <div className={styles.empty} data-testid="python-examples-empty">
          <p className={styles.emptyText}>{t('python.examplesNoMatch')}</p>
          <button type="button" className={styles.clearBtn} onClick={clearFilters} data-testid="python-examples-clear">
            {t('python.examplesClear')}
          </button>
        </div>
      )}

      <ul className={styles.grid} aria-label={t('python.examplesTabGridAria')} hidden={shown.length === 0}>
        {shown.map((card) => (
          <li key={card.id} className={styles.card} data-testid={`python-example-card-${card.id}`}>
            <span className={styles.tag} data-tag={card.tag} data-testid={`python-example-tag-${card.id}`}>
              {card.tagLabel}
            </span>
            <h3
              id={`python-example-title-${card.id}`}
              className={styles.cardTitle}
              data-testid={`python-example-title-${card.id}`}
            >
              {card.title}
            </h3>
            <p className={styles.cardDesc} data-testid={`python-example-desc-${card.id}`}>
              {card.description}
            </p>
            <p className={styles.files}>
              <span className={styles.filesLabel}>{t('python.examplesTabFiles')}</span>{' '}
              <span className={styles.filesList}>{card.files}</span>
            </p>
            {card.packages.length > 0 && (
              <ul className={styles.packages} aria-label={t('python.examplesPackagesAria')} data-testid={`python-example-packages-${card.id}`}>
                {card.packages.map((name) => (
                  <li key={name} className={styles.packageItem}>
                    <button
                      type="button"
                      className={styles.pkgPill}
                      title={t('python.examplesPackageSearch', { name })}
                      onClick={() => setQuery(name)}
                      data-testid={`python-example-package-${card.id}-${name}`}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {failedId === card.id && (
              <p className={styles.failed} role="alert">
                {t('python.examplesTabFailed')}
              </p>
            )}
            <button
              type="button"
              className={styles.loadBtn}
              disabled={disabled}
              title={disabledReason ?? undefined}
              aria-describedby={`python-example-title-${card.id}`}
              onClick={() => {
                void handleLoad(card.id);
              }}
              data-testid={`python-example-load-${card.id}`}
            >
              {busyId === card.id ? t('python.examplesTabLoading') : t('python.examplesTabLoad')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
