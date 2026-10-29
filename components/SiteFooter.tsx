import Link from 'next/link';
import React from 'react';

import styles from '../styles/Licenses.module.css';

// Shown under every page by pages/_app.tsx.
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Link href="/licenses">Licenses</Link>
      <span aria-hidden="true"> · </span>
      {/* A new tab, so the state of the tool on the page is not lost. */}
      <a href="https://github.com/yotasage/yotasage.github.io" target="_blank" rel="noopener noreferrer">GitHub</a>
    </footer>
  );
}
