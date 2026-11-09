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
        View the Gerber and drill files or the KiCad, Altium, PADS or EAGLE board of a circuit board layer by layer, or
        as the board looks with its solder mask, finish, silkscreen and holes, from the top or the bottom, with the parts
        of a pick-and-place file marked on Gerber files. Click a pad, track or part to see its net and component,
        highlight a net or a component on every layer, measure between pads and holes, and save the view as PNG or SVG,
        the layers as a PDF at 1:1, the outline and holes or the layers as DXF, a board&apos;s BOM and pick-and-place
        file, or an Altium, PADS or EAGLE board as a KiCad board. Everything runs in your browser; the files never leave
        this page.
      </p>

      <PcbViewer />
    </div>
  );
}
