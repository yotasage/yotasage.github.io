import Link from 'next/link';
import React from 'react';

import styles from '../styles/Licenses.module.css';

// Shown under every page by pages/_app.tsx.
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Link href="/licenses">Licenses</Link>
    </footer>
  );
}
