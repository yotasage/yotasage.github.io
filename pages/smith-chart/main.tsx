import Head from 'next/head';
import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

import HomeIcon from '../../components/icons/home';
import { MoonIcon, SunIcon } from '../../components/Resistor/parts';
import Chart from '../../components/Smith/Chart';
import Nodes from '../../components/Smith/Nodes';
import Strip from '../../components/Smith/Strip';
import type { ChartView } from '../../components/Smith/chartView';
import { writeLive } from '../../components/Smith/live';
import { PathLayer, SEL_NODE, SEL_NONE, SEL_PART } from '../../components/Smith/pathLayer';
import { MODE_Y, MODE_Z, MODE_ZY } from '../../lib/smith/grid';
import { Circuit, decodeCircuit, defaultCircuit, encodeCircuit } from '../../lib/smith/state';
import styles from '../../styles/Smith.module.css';

// The Smith chart (milestone M2): the interactive chart in the site's frame, after the resistor tool: a slim bar
// with the home link, the title and the theme switch, the chart as the hero with its tools above it and the readout
// beside it on wide screens (below it on phones). From M3.1 the circuit (lib/smith/state.ts) is the page's state: read
// from the link after mount (the static page has the start circuit), edited by the strip, and written back into the
// link with history.replaceState on every change. `commit` is the one place a new circuit arrives (M3.3: undo).
// From M3.2 the chart draws the circuit's path (components/Smith/pathLayer.ts, outside React) and the node table sits
// under the strip; the page holds the selection (a part, or a node that then takes the highlight) for the strip, the
// table and the chart, which picks arcs and markers by hover, click and tap.
// From M3.3a a ring at the end of every arc drags its part's value (pathLayer.ts): the chart and the side panel follow
// every frame outside React (live.ts) and the circuit arrives through `commit` once, on release. The Snap switch beside
// the grid switch turns snapping to grid circles and E24 values off (Alt does the same for a mouse drag).

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
  const [circuit, setCircuit] = useState<Circuit>(defaultCircuit);
  const [issues, setIssues] = useState<string[]>([]);
  const [linked, setLinked] = useState(false);
  // The circuit comes from the link once the page is in the browser (never at build time).
  useEffect(() => {
    const read = decodeCircuit(window.location.search);
    if (read.linked) setCircuit(read.circuit);
    setIssues(read.issues);
    setLinked(true);
  }, []);
  // The circuit goes back into the link, without a new entry in the history.
  useEffect(() => {
    if (!linked) return;
    const url = `${window.location.pathname}?${encodeCircuit(circuit)}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [linked, circuit]);
  // The one place a new circuit arrives: fields, add, remove, move, the link and the end of a drag (M3.3b: undo).
  const commit = (next: Circuit) => setCircuit(next);
  const [snap, setSnap] = useState(true);

  // The path on the chart and the selection shared by the strip, the node table and the chart.
  const path = useRef<PathLayer | null>(null);
  const [partSel, setPartSel] = useState(-1);
  const [nodeSel, setNodeSel] = useState(-1);
  const n = circuit.parts.length;
  const part = partSel >= 0 && partSel < n ? partSel : n - 1;
  const node = nodeSel <= n ? nodeSel : -1;
  const selectPart = (i: number) => { setPartSel(i); setNodeSel(-1); };
  const onView = (v: ChartView) => {
    const layer = new PathLayer(v);
    layer.onPick = (kind, i) => { if (kind === SEL_PART) selectPart(i); else setNodeSel(i); };
    layer.onCommit = commit;
    layer.onLive = (c, i, half) => writeLive(document, c, i, half);
    (v.box as HTMLElement & { smithPath?: PathLayer }).smithPath = layer;
    path.current = layer;
  };
  useEffect(() => { path.current?.setCircuit(circuit); }, [circuit]);
  useEffect(() => { if (path.current) path.current.snap = snap; }, [snap]);
  useEffect(() => {
    path.current?.select(node >= 0 ? SEL_NODE : part >= 0 ? SEL_PART : SEL_NONE, node >= 0 ? node : part);
  }, [node, part]);
  const side = (
    <>
      <Strip circuit={circuit} onChange={commit} issues={issues} selected={part} onSelect={selectPart}
        onHover={(i) => path.current?.hover(SEL_PART, i)} />
      <Nodes circuit={circuit} selected={node} onSelect={(k) => setNodeSel(k === node ? -1 : k)}
        onHover={(k) => path.current?.hover(SEL_NODE, k)} />
    </>
  );
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
    <>
      <div className={styles.modes} role="radiogroup" aria-label="Grid">
        {MODES.map(({ mode: m, name, title }) => (
          <label key={name} title={title}>
            <input type="radio" name="smith-mode" value={name} checked={mode === m} onChange={() => setMode(m)} />
            {name}
          </label>
        ))}
      </div>
      <button type="button" className={`${styles.button} ${styles.toggle}`} aria-pressed={snap} data-snap-toggle=""
        onClick={() => setSnap(!snap)} title="Dragging a ring snaps to the grid's circles and to E24 values (Alt: not for this drag)">Snap</button>
    </>
  );

  return (
    <div className={styles.root} data-theme={theme ?? undefined}>
      <Head>
        <title>Smith chart</title>
        <meta name="description" content="A Smith chart with a circuit of series and shunt parts, lines and stubs, impedance, admittance and combined grids and a readout of z, y, Γ, VSWR and return loss." />
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
        <Chart mode={mode} tools={modes} z0={circuit.z0} side={side} onView={onView} />
      </main>
    </div>
  );
}
