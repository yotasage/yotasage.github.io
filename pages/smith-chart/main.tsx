import Head from 'next/head';
import Link from 'next/link';
import React, { useState } from 'react';

import HomeIcon from '../../components/icons/home';
import Chart from '../../components/Smith/Chart';
import { MODE_Y, MODE_Z, MODE_ZY } from '../../lib/smith/grid';
import styles from '../../styles/Smith.module.css';

// The chart on its own (steps M2.1b and M2.2): the Z/Y/ZY switch, the interactive chart (wheel, pinch, drag, keys)
// and the cursor readout. The design pass comes with M2.3, the circuit with M3.

const MODES = [{ mode: MODE_Z, name: 'Z' }, { mode: MODE_Y, name: 'Y' }, { mode: MODE_ZY, name: 'ZY' }];

export default function SmithChart() {
  const [mode, setMode] = useState(MODE_Z);

  return (
    <div className={styles.root}>
      <Head>
        <title>Smith chart</title>
        <meta name="description" content="A Smith chart to zoom and pan, with impedance, admittance and combined grids and a readout of z, y, Γ, VSWR and return loss." />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #f6f4ee;
        }
        @media (prefers-color-scheme: dark) {
          html,
          body {
            background: #2b2b2b;
          }
        }
      `}</style>

      <header className={styles.bar}>
        <Link href="/" className={styles.home} aria-label="Home" title="All tools"><HomeIcon width={17} height={19} color="currentColor" /></Link>
        <h1 className={styles.title}>Smith chart</h1>
      </header>

      <div className={styles.controls}>
        <div className={styles.modes} role="radiogroup" aria-label="Grid">
          {MODES.map(({ mode: m, name }) => (
            <label key={name}>
              <input type="radio" name="smith-mode" value={name} checked={mode === m} onChange={() => setMode(m)} />
              {name}
            </label>
          ))}
        </div>
      </div>

      <Chart mode={mode} />
    </div>
  );
}
