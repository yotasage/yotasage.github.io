// Examples tab of the Python Playground: a card per built-in example (lib/python/examples/).
// "Load in workbench" only copies the example's files into its own folder and opens the entry
// file; running it is always a separate click on Run (click-to-run).
import { useCallback, useEffect, useMemo, useState } from 'react';

import { getPythonExampleTagKey, PYTHON_EXAMPLES } from '../../lib/python/examples';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PythonExamples.module.css';

export type PlaygroundView = 'workbench' | 'examples';

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
 * mode lives in its query), and a `#examples` link opens the Examples tab.
 */
export function usePlaygroundView(): [PlaygroundView, (view: PlaygroundView) => void] {
  const [view, setView] = useState<PlaygroundView>('workbench');
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === '#examples') setView('examples');
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

  const cards = useMemo(
    () =>
      PYTHON_EXAMPLES.map((ex) => ({
        id: ex.id,
        tag: ex.tag,
        title: t(ex.titleKey),
        description: t(ex.descriptionKey),
        tagLabel: t(getPythonExampleTagKey(ex.tag)),
        files: Object.keys(ex.files).join(', '),
      })),
    [t],
  );

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

      <ul className={styles.grid} aria-label={t('python.examplesTabGridAria')}>
        {cards.map((card) => (
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
