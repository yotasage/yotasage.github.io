import Link from 'next/link';
import React from 'react';

import { useI18n } from '../lib/ui/i18n';
import styles from '../styles/Licenses.module.css';

// Shown under every page by pages/_app.tsx. `fixed` keeps it at the bottom of the screen (the main page).
export default function SiteFooter({ fixed = false }: { fixed?: boolean }) {
  const { t } = useI18n();
  return (
    <footer className={fixed ? [styles.footer, styles.fixed].join(' ') : styles.footer}>
      <Link href="/licenses">{t('footer.licenses')}</Link>
      <span aria-hidden="true">·</span>
      {/* A new tab, so the state of the tool on the page is not lost. */}
      <a href="https://github.com/yotasage/yotasage.github.io" target="_blank" rel="noopener noreferrer">
        {t('footer.github')}
      </a>
      <span aria-hidden="true">·</span>
      <a href="https://github.com/yotasage/yotasage.github.io/issues" target="_blank" rel="noopener noreferrer">
        {t('footer.reportIssue')}
      </a>
    </footer>
  );
}
