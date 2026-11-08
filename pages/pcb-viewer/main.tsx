import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import HomeIcon from '../../components/icons/home';
import PcbViewer from '../../components/PcbViewer/PcbViewer';
import styles from '../../styles/QrGen.module.css';

export default function PcbViewerPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>PCB viewer</title>
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
        <h1 className={styles.title}>PCB viewer</h1>
      </header>
      <p className={styles.lead}>
        View the Gerber files of a circuit board layer by layer: the layers are recognised by their X2 attributes, the job
        file or their names, and each can be shown, hidden, recoloured and seen from the bottom. Everything runs in your
        browser; the files never leave this page.
      </p>

      <PcbViewer />
    </div>
  );
}
