import Head from 'next/head';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import HomeIcon from '../../components/icons/home';
import { MoonIcon, SunIcon } from '../../components/Resistor/parts';
import Chart from '../../components/Smith/Chart';
import { MODE_Y, MODE_Z, MODE_ZY } from '../../lib/smith/grid';
import styles from '../../styles/Smith.module.css';

// The Smith chart (milestone M2): the interactive chart in the site's frame, after the resistor tool: a slim bar
// with the home link, the title and the theme switch, the chart as the hero with its tools above it and the readout
// beside it on wide screens (below it on phones). The circuit comes with M3.

const MODES = [{ mode: MODE_Z, name: 'Z', title: 'Impedance grid: r and x circles' },
  { mode: MODE_Y, name: 'Y', title: 'Admittance grid: g and b circles' },
  { mode: MODE_ZY, name: 'ZY', title: 'Both grids' }];

type Theme = 'light' | 'dark';
const THEME_KEY = 'smith.theme';
// What lies outside the tool's own element in the two themes (page background and the site footer of _app.tsx).
const LIGHT = { bg: '#f6f4ee', rule: '#e3dfd5', quiet: '#736f67', link: '#55524b', ink: '#1d1c19' };
const DARK = { bg: '#2b2b2b', rule: '#3a3a38', quiet: '#8f8c83', link: '#b7b4ab', ink: '#edebe5' };

export default function SmithChart() {
  const [mode, setMode] = useState(MODE_Z);
  // null: follow the system. Read after mount, so the static page and the first render agree.
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') setTheme(stored);
    } catch { /* Storage can be blocked; the theme then follows the system. */ }
  }, []);
  const toggleTheme = () => {
    const system: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const next: Theme = (theme ?? system) === 'dark' ? 'light' : 'dark';
    // Back on the system's theme, the page follows the system again.
    setTheme(next === system ? null : next);
    try {
      if (next === system) window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, next);
    } catch { /* The switch still works for this visit. */ }
  };
  const day = theme === 'dark' ? DARK : LIGHT;
  const night = theme === 'light' ? LIGHT : DARK;

  const modes = (
    <div className={styles.modes} role="radiogroup" aria-label="Grid">
      {MODES.map(({ mode: m, name, title }) => (
        <label key={name} title={title}>
          <input type="radio" name="smith-mode" value={name} checked={mode === m} onChange={() => setMode(m)} />
          {name}
        </label>
      ))}
    </div>
  );

  return (
    <div className={styles.root} data-theme={theme ?? undefined}>
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
          background: ${day.bg};
        }
        #__next > footer {
          background: ${day.bg};
          border-top-color: ${day.rule};
          color: ${day.quiet};
        }
        #__next > footer a {
          color: ${day.link};
        }
        #__next > footer a:hover,
        #__next > footer a:focus {
          color: ${day.ink};
        }
        @media (prefers-color-scheme: dark) {
          html,
          body {
            background: ${night.bg};
          }
          #__next > footer {
            background: ${night.bg};
            border-top-color: ${night.rule};
            color: ${night.quiet};
          }
          #__next > footer a {
            color: ${night.link};
          }
          #__next > footer a:hover,
          #__next > footer a:focus {
            color: ${night.ink};
          }
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/" className={styles.home} aria-label="Home" title="All tools"><HomeIcon width={17} height={19} color="currentColor" /></Link>
          <h1 className={styles.title}>Smith chart</h1>
          <span className={styles.barSpace} />
          <button type="button" className={styles.iconButton} onClick={toggleTheme} aria-label="Switch between the light and the dark theme" title="Light or dark">
            <span className={styles.moon}><MoonIcon /></span>
            <span className={styles.sun}><SunIcon /></span>
          </button>
        </div>
      </header>

      <main className={styles.layout}>
        <Chart mode={mode} tools={modes} />
      </main>
    </div>
  );
}
