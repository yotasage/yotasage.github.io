import Link from 'next/link';
import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import { useWideView } from '../../lib/ui/layout';
import { ExperienceMode, useExperienceMode } from '../../lib/ui/mode';
import { ResolvedTheme, useTheme } from '../../lib/ui/theme';
import styles from '../../styles/DesignSystem.module.css';
import HomeIcon from '../icons/home';
import PillTabs, { PillTabItem } from './PillTabs';

export interface WorkspaceTab<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number;
}

export interface ToolHeaderProps<T extends string = string> {
  title: string;
  isHome?: boolean;
  brandIcon?: React.ReactNode;
  workspaces?: readonly WorkspaceTab<T>[];
  activeWorkspace?: T;
  onWorkspaceChange?: (id: T) => void;
  actions?: React.ReactNode;
  showExperienceMode?: boolean;
  allowWideView?: boolean;
  className?: string;
}

function SunIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function WideViewIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      {active ? (
        <>
          <path d="m10 9-3 3 3 3" />
          <path d="m14 9 3 3-3 3" />
        </>
      ) : (
        <>
          <path d="m8 9-3 3 3 3" />
          <path d="m16 9 3 3-3 3" />
          <path d="M5 12h14" />
        </>
      )}
    </svg>
  );
}

const EXPERIENCE_MODES: readonly ExperienceMode[] = ['quick', 'standard', 'teaching'];

export default function ToolHeader<T extends string = string>({
  title,
  isHome = false,
  brandIcon,
  workspaces,
  activeWorkspace,
  onWorkspaceChange,
  actions,
  showExperienceMode = false,
  allowWideView = false,
  className,
}: ToolHeaderProps<T>) {
  const { theme, setTheme, mounted: themeMounted } = useTheme();
  const { mode, setMode } = useExperienceMode();
  const { locale, toggleLocale, t } = useI18n();
  const { wide, mounted: wideMounted, toggleWide } = useWideView();

  const workspaceItems: readonly PillTabItem<T>[] | undefined = workspaces;
  const activeTheme: ResolvedTheme = themeMounted ? theme : 'light';
  const wideActive = allowWideView && wideMounted && wide;

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (wideActive) {
      root.setAttribute('data-ds-wide', 'true');
    } else {
      root.removeAttribute('data-ds-wide');
    }
    return () => {
      root.removeAttribute('data-ds-wide');
    };
  }, [wideActive]);

  return (
    <header className={[styles.header, 'ds-no-print', className ?? ''].filter(Boolean).join(' ')}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          {isHome ? (
            brandIcon ? (
              <span className={styles.brandMark} aria-hidden="true">
                {brandIcon}
              </span>
            ) : (
              <span className={styles.accentDot} aria-hidden="true" />
            )
          ) : (
            <>
              <Link href="/" className={styles.homePill} aria-label={t('header.homeAria')}>
                <HomeIcon width={14} height={15} color="currentColor" />
                <span className={styles.homeLabel}>{t('common.tools')}</span>
              </Link>
              <span className={styles.separator} aria-hidden="true">/</span>
            </>
          )}

          <div className={styles.titleGroup}>
            {!isHome && <span className={styles.accentDot} aria-hidden="true" />}
            <h1 className={styles.title}>{title}</h1>
          </div>
        </div>

        {workspaceItems && workspaceItems.length > 0 && activeWorkspace !== undefined && onWorkspaceChange && (
          <div className={styles.headerCenter}>
            <PillTabs
              items={workspaceItems}
              value={activeWorkspace}
              onChange={onWorkspaceChange}
              ariaLabel={t('header.workspaceNav')}
            />
          </div>
        )}

        <div className={styles.headerRight}>
          {actions && <div className={styles.actionsSlot}>{actions}</div>}

          {showExperienceMode && (
            <div className={styles.segmented} role="group" aria-label={t('header.experienceMode')}>
              {EXPERIENCE_MODES.map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    title={t(`mode.${m}Desc`)}
                    className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setMode(m)}
                  >
                    {t(`mode.${m}`)}
                  </button>
                );
              })}
            </div>
          )}

          {allowWideView && (
            <button
              type="button"
              className={[styles.wideBtn, wideActive ? styles.wideBtnActive : ''].filter(Boolean).join(' ')}
              aria-pressed={wideActive}
              aria-label={wideActive ? t('header.wideViewDisable') : t('header.wideViewEnable')}
              title={wideActive ? t('header.wideViewDisable') : t('header.wideViewEnable')}
              onClick={toggleWide}
              data-wide-toggle=""
            >
              <WideViewIcon active={wideActive} />
              <span className={styles.wideLabel}>{t('header.wideView')}</span>
            </button>
          )}

          <div className={styles.segmented} role="group" aria-label={t('header.themeSelector')}>
            <button
              type="button"
              aria-label={t('theme.light')}
              aria-pressed={themeMounted && activeTheme === 'light'}
              title={t('theme.light')}
              className={[
                styles.segBtn,
                styles.segBtnIcon,
                themeMounted && activeTheme === 'light' ? styles.segBtnActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTheme('light')}
            >
              <SunIcon />
            </button>
            <button
              type="button"
              aria-label={t('theme.dark')}
              aria-pressed={themeMounted && activeTheme === 'dark'}
              title={t('theme.dark')}
              className={[
                styles.segBtn,
                styles.segBtnIcon,
                themeMounted && activeTheme === 'dark' ? styles.segBtnActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTheme('dark')}
            >
              <MoonIcon />
            </button>
            <button
              type="button"
              aria-label={t('theme.hc')}
              aria-pressed={themeMounted && activeTheme === 'hc'}
              title={t('theme.hc')}
              className={[
                styles.segBtn,
                styles.segBtnIcon,
                themeMounted && activeTheme === 'hc' ? styles.segBtnActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setTheme('hc')}
            >
              <span className={styles.hcLabel}>HC</span>
            </button>
          </div>

          <button
            type="button"
            className={styles.langBtn}
            onClick={toggleLocale}
            aria-label={locale === 'en' ? t('header.switchToNb') : t('header.switchToEn')}
            title={locale === 'en' ? t('header.switchToNb') : t('header.switchToEn')}
          >
            <span className={[styles.langItem, locale === 'en' ? styles.langActive : ''].filter(Boolean).join(' ')}>
              <img src="/flags/gb.svg" alt="" width={16} height={12} className={styles.langFlag} aria-hidden="true" />
              <span>EN</span>
            </span>
            <span className={styles.langSep} aria-hidden="true">/</span>
            <span className={[styles.langItem, locale === 'nb' ? styles.langActive : ''].filter(Boolean).join(' ')}>
              <img src="/flags/no.svg" alt="" width={16} height={12} className={styles.langFlag} aria-hidden="true" />
              <span>NB</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
