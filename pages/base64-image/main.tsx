import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import Decoder from '../../components/Base64Image/Decoder';
import Encoder from '../../components/Base64Image/Encoder';
import HomeIcon from '../../components/icons/home';
import styles from '../../styles/QrGen.module.css';

export default function Base64Image() {
  return (
    <div className={styles.page}>
      <Head>
        <title>Base64 image converter</title>
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
        <h1 className={styles.title}>Base64 image converter</h1>
      </header>
      <p className={styles.lead}>
        Turn an image into Base64, a data URL or a ready-made HTML, CSS or Markdown snippet, and turn Base64 back into an
        image you can see, download and copy. Everything runs in your browser; images and text never leave this page.
      </p>

      <div className={styles.layout}>
        <Encoder />
        <Decoder />
      </div>
    </div>
  );
}
