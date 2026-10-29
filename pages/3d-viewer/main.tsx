import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import HomeIcon from '../../components/icons/home';
import Viewer3D from '../../components/Viewer3D/Viewer3D';
import styles from '../../styles/QrGen.module.css';

export default function Viewer3DPage() {
  return (
    <div className={styles.page}>
      <Head>
        <title>3D viewer</title>
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
        <h1 className={styles.title}>3D viewer</h1>
      </header>
      <p className={styles.lead}>
        View STEP, STL, OBJ, glTF and other 3D files: turn and zoom, cut through the model, measure distances, check
        its size and volume, and save it as STL, OBJ, PLY or GLB. Everything runs in your browser; the files never leave
        this page.
      </p>

      <Viewer3D />
    </div>
  );
}
