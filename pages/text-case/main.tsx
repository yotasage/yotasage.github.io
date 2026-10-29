import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import HomeIcon from '../../components/icons/home';
import CaseConverter from '../../components/TextCase/CaseConverter';
import styles from '../../styles/QrGen.module.css';

export default function TextCase() {
  return (
    <div className={styles.page}>
      <Head>
        <title>Text case converter</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #2b2b2b;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <header className={styles.header}>
        <Link href="/" className={styles.homeLink} aria-label="Home"><HomeIcon /></Link>
        <h1 className={styles.title}>Text case converter</h1>
      </header>
      <p className={styles.lead}>
        Change text to sentence case, lower case, UPPER CASE, Title Case and more, or turn it into names for code such as
        camelCase and snake_case. The result follows as you type, and your text stays as it is. Everything runs in your
        browser; the text never leaves this page.
      </p>

      <CaseConverter />
    </div>
  );
}
