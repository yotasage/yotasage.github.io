import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRef, useState } from 'react';

import { getPageMeta, getProjectMeta } from '../lib/citation';
import { useI18n } from '../lib/ui/i18n';
import { useShareModal } from '../lib/ui/shareModal';
import styles from '../styles/SiteFooter.module.css';
import CiteModal from './UI/CiteModal';

// Shown under every page by pages/_app.tsx. `fixed` keeps it at the bottom of the screen (the main page).
export default function SiteFooter({ fixed = false }: { fixed?: boolean }) {
  const { pathname } = useRouter();
  const { t } = useI18n();
  const { open: shareOpen, openShareModal } = useShareModal();
  const [citeOpen, setCiteOpen] = useState(false);
  const citeBtnRef = useRef<HTMLButtonElement | null>(null);
  const shareBtnRef = useRef<HTMLButtonElement | null>(null);

  const page = getPageMeta(pathname);
  const project = getProjectMeta();
  const commitUrl = page.commit ? `${project.repository}/commit/${page.commit}` : '';
  const hardExit = pathname.startsWith('/python');

  return (
    <>
      <footer className={fixed ? `${styles.footer} ${styles.fixed}` : styles.footer}>
        <div className={styles.inner}>
          <div className={styles.linksGroup}>
            <button
              type="button"
              ref={shareBtnRef}
              className={styles.shareBtn}
              onClick={() => openShareModal(shareBtnRef.current)}
              aria-label={t('footer.shareAria')}
              aria-haspopup="dialog"
              aria-expanded={shareOpen}
            >
              <svg
                className={styles.citeIcon}
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M14 14h3v3h-3z" />
                <path d="M20 14v3h-1" />
                <path d="M14 20h3" />
                <path d="M20 20h1" />
              </svg>
              <span>{t('footer.share')}</span>
            </button>
            <button
              type="button"
              ref={citeBtnRef}
              className={styles.citeBtn}
              onClick={() => setCiteOpen(true)}
            >
              <svg
                className={styles.citeIcon}
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
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
                <path d="M8 7h6" />
                <path d="M8 11h8" />
              </svg>
              <span>{page.kind === 'tool' ? t('footer.citeTool') : t('footer.citePage')}</span>
            </button>
            <span className={styles.dot} aria-hidden="true">·</span>
            {hardExit ? (
              <a href="/references">{t('footer.references')}</a>
            ) : (
              <Link href="/references">{t('footer.references')}</Link>
            )}
            <span className={styles.dot} aria-hidden="true">·</span>
            {hardExit ? (
              <a href="/licenses">{t('footer.licenses')}</a>
            ) : (
              <Link href="/licenses">{t('footer.licenses')}</Link>
            )}
            <span className={styles.dot} aria-hidden="true">·</span>
            {/* A new tab, so the state of the tool on the page is not lost. */}
            <a href="https://github.com/yotasage/yotasage.github.io" target="_blank" rel="noopener noreferrer">
              {t('footer.github')}
            </a>
            <span className={styles.dot} aria-hidden="true">·</span>
            <a href="https://github.com/yotasage/yotasage.github.io/issues" target="_blank" rel="noopener noreferrer">
              {t('footer.reportIssue')}
            </a>
          </div>

          <span className={styles.groupSep} aria-hidden="true">|</span>

          <div className={styles.metaGroup}>
            {page.lastChanged && (
              <span>{t('footer.updated', { date: page.lastChanged })}</span>
            )}
            {commitUrl && (
              <>
                <span className={styles.dot} aria-hidden="true">·</span>
                <a
                  className={styles.monoLink}
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t('footer.commitTitle', { hash: page.commit })}
                >
                  {page.commitShort}
                </a>
              </>
            )}
            {page.contentHash && (
              <>
                <span className={styles.dot} aria-hidden="true">·</span>
                <button
                  type="button"
                  className={styles.hashBtn}
                  onClick={() => setCiteOpen(true)}
                  title={t('footer.hashTitle', { hash: page.contentHashFull })}
                >
                  sha256:{page.contentHash.slice(0, 8)}
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      <CiteModal
        open={citeOpen}
        onClose={() => setCiteOpen(false)}
        page={page}
        project={project}
        triggerRef={citeBtnRef}
      />
    </>
  );
}
