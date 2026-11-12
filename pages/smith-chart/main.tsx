import Head from 'next/head';
import Link from 'next/link';
import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import Bibliography from '../../components/Bibliography';
import HomeIcon from '../../components/icons/home';
import { MoonIcon, SunIcon } from '../../components/Resistor/parts';
import Chart from '../../components/Smith/Chart';
import Nodes from '../../components/Smith/Nodes';
import Strip from '../../components/Smith/Strip';
import Theory from '../../components/Smith/Theory';
import { Why } from '../../components/Smith/Why';
import type { ChartView } from '../../components/Smith/chartView';
import { writeLive } from '../../components/Smith/live';
import { PathLayer, SEL_NODE, SEL_NONE, SEL_PART } from '../../components/Smith/pathLayer';
import { BibEntry } from '../../lib/bibtex';
import { loadReferences } from '../../lib/references';
import { MODE_Y, MODE_Z, MODE_ZY } from '../../lib/smith/grid';
import { Circuit, KIND_SHORT, decodeCircuit, defaultCircuit, encodeCircuit, sameCircuit } from '../../lib/smith/state';
import useReplayHighlight from '../../lib/useReplayHighlight';
import styles from '../../styles/Smith.module.css';
import theoryCss from '../../styles/SmithTheory.module.css';

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
// From M3.3b `commit` keeps the history for undo and redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y and the buttons in the
// toolbar): every commit is a step, except that the keystrokes of one field (until the focus moves) and the arrow keys
// of one handle (less than GROUP_MS apart) make one; a drag and a draw commit once, so they are one step. The draw tool
// is armed by the strip's Draw button and shown in the toolbar until a draw ends or Escape.
// From M3.5b the Theory section (components/Smith/Theory.tsx) and the References section follow the tool, with a section
// nav in the bar (Tool · Theory · References). The theory follows the committed circuit; its citations are numbered by
// one Bibliography of references.bib, read in getStaticProps (at build time only), in the order of the page.

// The sources the page cites, read from references.bib when the site is built. An unknown key stops the build.
export async function getStaticProps() {
  return { props: { references: loadReferences() } };
}

/** The sections of the page, in the order of the nav. */
const SECTIONS = [{ id: 'tool', label: 'Tool' }, { id: 'theory', label: 'Theory' }, { id: 'references', label: 'References' }];

const MODES = [{ mode: MODE_Z, name: 'Z', title: 'Impedance grid: r and x circles' },
  { mode: MODE_Y, name: 'Y', title: 'Admittance grid: g and b circles' },
  { mode: MODE_ZY, name: 'ZY', title: 'Both grids' }];

type Theme = 'light' | 'dark';
const THEME_KEY = 'smith.theme';
// What lies outside the tool's own element in the two themes (page background and the site footer of _app.tsx).
/** Steps kept for undo, and the longest pause between a handle's arrow keys that still makes one step. */
const HISTORY = 200;
const GROUP_MS = 1000;
// `dropped`: the redo steps a group's first commit cleared, back if the group ends where it began (no step at all).
interface History { past: Circuit[]; future: Circuit[]; dropped: Circuit[]; group: string; t: number }

/** The start circuit (D16), to compare with; Start over commits a fresh copy. */
const START = defaultCircuit();

const LIGHT = { bg: '#f6f4ee', rule: '#e3dfd5', quiet: '#736f67', link: '#55524b', ink: '#1d1c19' };
const DARK = { bg: '#2b2b2b', rule: '#3a3a38', quiet: '#8f8c83', link: '#b7b4ab', ink: '#edebe5' };

export default function SmithChart({ references }: { references: BibEntry[] }) {
  // One list of sources for the whole page, numbered by first citation (components/Bibliography.tsx).
  const bib = useMemo(() => new Bibliography(references), [references]);
  useReplayHighlight();
  // The nav shows the section at the top of the window.
  const [section, setSection] = useState('tool');
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setSection(entry.target.id);
    }, { rootMargin: '-15% 0px -75% 0px' });
    for (const { id } of SECTIONS) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);
  const [mode, setMode] = useState(MODE_Z);
  const [circuit, setCircuit] = useState<Circuit>(defaultCircuit);
  // The theory (3,600 nodes) follows in a deferred, time-sliced render: the commit that ends a drag renders the tool
  // only, so releasing a handle costs one short frame (a sync render of both took 230 ms at 4× CPU in development).
  const theoryCircuit = useDeferredValue(circuit);
  // The circuit as last committed (ahead of React's state between a commit and the render) and the history.
  const now = useRef<Circuit>(circuit);
  const hist = useRef<History>({ past: [], future: [], dropped: [], group: '', t: 0 });
  const [revision, setRevision] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const [linked, setLinked] = useState(false);
  // The circuit comes from the link once the page is in the browser (never at build time).
  useEffect(() => {
    const read = decodeCircuit(window.location.search);
    if (read.linked) { now.current = read.circuit; setCircuit(read.circuit); }
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
  // The one place a new circuit arrives: fields, add, remove, move, the end of a drag or a draw, a handle's keys.
  // Only refs and state setters are used, so the closures handed out once (the path layer, listeners) stay right.
  const commit = (next: Circuit, group = '') => {
    const h = hist.current, before = now.current;
    if (next === before || sameCircuit(next, before)) return;
    const t = performance.now();
    if (group && group === h.group && (group.startsWith('field:') || t - h.t < GROUP_MS)) {
      // The same step goes on; back where it began, there is no step at all.
      if (h.past.length && sameCircuit(h.past[h.past.length - 1], next)) { h.past.pop(); group = ''; h.future = h.dropped; }
    } else {
      h.past.push(before);
      if (h.past.length > HISTORY) h.past.shift();
      h.dropped = h.future;
      h.future = [];
    }
    h.group = group; h.t = t;
    now.current = next;
    setCircuit(next);
  };
  const travel = (back: boolean) => {
    const h = hist.current, from = back ? h.past : h.future, to = back ? h.future : h.past;
    // Not in the middle of a drag or a draw: their circuit is not committed yet.
    if (!from.length || (path.current && path.current.dragPart >= 0)) return;
    to.push(now.current);
    const c = from.pop()!;
    h.group = '';
    now.current = c;
    setCircuit(c);
    setRevision((r) => r + 1);
  };
  // Back to the start circuit as one step, which Undo takes back.
  const startOver = () => {
    if (path.current && path.current.dragPart >= 0) return;
    commit(defaultCircuit());
    hist.current.group = '';
    setRevision((r) => r + 1);
    setPartSel(-1);
    setNodeSel(-1);
  };
  const [snap, setSnap] = useState(true);
  const [drawKind, setDrawKind] = useState(-1);
  const stopDraw = () => { path.current?.cancelDraw(); setDrawKind(-1); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || k === 'y')) {
        e.preventDefault();
        travel(!(k === 'y' || e.shiftKey));
      } else if (e.key === 'Escape') stopDraw();
    };
    // A field's step ends when the focus moves.
    const focus = () => { hist.current.group = ''; };
    window.addEventListener('keydown', key);
    document.addEventListener('focusin', focus);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('focusin', focus); };
  }, []);

  // The path on the chart and the selection shared by the strip, the node table and the chart.
  const path = useRef<PathLayer | null>(null);
  const tool = useRef<HTMLDivElement>(null);
  const [partSel, setPartSel] = useState(-1);
  const [nodeSel, setNodeSel] = useState(-1);
  const n = circuit.parts.length;
  const part = partSel >= 0 && partSel < n ? partSel : n - 1;
  const node = nodeSel <= n ? nodeSel : -1;
  const selectPart = (i: number) => { setPartSel(i); setNodeSel(-1); };
  const onView = (v: ChartView) => {
    const layer = new PathLayer(v);
    // A drag's pick renders in a transition: time-sliced, so the side panel's re-render (≈ 30 ms at 4× CPU in
    // development) does not drop the drag's first frames; the live frames rewrite the card once it is mounted.
    layer.onPick = (kind, i, drag) => {
      if (drag) startTransition(() => selectPart(i));
      else if (kind === SEL_PART) selectPart(i);
      else setNodeSel(i);
    };
    layer.onCommit = commit;
    layer.onDraw = (i) => { setDrawKind(-1); if (i >= 0) selectPart(i); };
    // Scoped to the tool: a query over the whole document would walk the theory's MathML every drag frame.
    layer.onLive = (c, i, half) => writeLive(tool.current ?? document, c, i, half);
    (v.box as HTMLElement & { smithPath?: PathLayer }).smithPath = layer;
    path.current = layer;
  };
  useEffect(() => { path.current?.setCircuit(circuit); }, [circuit]);
  useEffect(() => { if (path.current) path.current.snap = snap; }, [snap]);
  useEffect(() => { path.current?.arm(drawKind); }, [drawKind]);
  useEffect(() => {
    path.current?.select(node >= 0 ? SEL_NODE : part >= 0 ? SEL_PART : SEL_NONE, node >= 0 ? node : part);
  }, [node, part]);
  const side = (
    <>
      <Strip circuit={circuit} onChange={commit} issues={issues} selected={part} onSelect={selectPart}
        revision={revision} drawKind={drawKind} onDraw={setDrawKind}
        onHover={(i) => path.current?.hover(SEL_PART, i)} />
      <Nodes circuit={circuit} selected={node} onSelect={(k) => setNodeSel(k === node ? -1 : k)}
        onHover={(k) => path.current?.hover(SEL_NODE, k)} />
    </>
  );
  // The same element while the theory's circuit stays, so the page's renders during a drag (a pick, a selection) skip
  // the sections and the reference list entirely.
  const sections = useMemo(() => (
    <div className={theoryCss.sections}>
      <section id="theory" className={theoryCss.section} aria-labelledby="theory-title">
        <h2 className={theoryCss.sectionHead} id="theory-title">Theory</h2>
        <Theory bib={bib} circuit={theoryCircuit} />
      </section>
      {/* After the last citation: the list is numbered while the page above it is drawn. */}
      <section id="references" className={theoryCss.section} aria-labelledby="references-title">
        <h2 className={theoryCss.sectionHead} id="references-title">References</h2>
        <div className={theoryCss.refs} data-references="">
          <p className={theoryCss.lead}>The sources of the theory on this page, in the order they are first cited.</p>
          {bib.list()}
        </div>
      </section>
    </div>
  ), [bib, theoryCircuit]);
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
      <span className={styles.toolGroup}>
        <div className={styles.modes} role="radiogroup" aria-label="Grid">
          {MODES.map(({ mode: m, name, title }) => (
            <label key={name} title={title}>
              <input type="radio" name="smith-mode" value={name} checked={mode === m} onChange={() => setMode(m)} />
              {name}
            </label>
          ))}
        </div>
        <Why k="grid" />
      </span>
      <span className={styles.toolGroup}>
        <button type="button" className={`${styles.button} ${styles.toggle}`} aria-pressed={snap} data-snap-toggle=""
          onClick={() => setSnap(!snap)} title="Dragging a ring snaps to the grid's circles and to E24 values (Alt: not for this drag); arrow keys on a ring step by E24 values or whole degrees">Snap</button>
        <Why k="snap" />
      </span>
      <span className={styles.history}>
        <button type="button" className={styles.button} data-undo="" disabled={!hist.current.past.length} onClick={() => travel(true)} title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" className={styles.button} data-redo="" disabled={!hist.current.future.length} onClick={() => travel(false)} title="Redo (Ctrl+Shift+Z or Ctrl+Y)">Redo</button>
        <button type="button" className={styles.button} data-start-over="" disabled={sameCircuit(circuit, START)} onClick={startOver}
          title="Back to the start circuit (Z0 = 50 Ω, load 25 + j25 Ω, f0 = 100 MHz, two parts); Undo brings this circuit back">Start over</button>
        <Why k="history" />
      </span>
      {drawKind >= 0 && (
        <button type="button" className={`${styles.button} ${styles.toggle}`} aria-pressed="true" data-draw-stop="" onClick={stopDraw}
          title="Drag from the input (In) on the chart to add the part at the source end; this button or Escape stops">Drawing {KIND_SHORT[drawKind]} ×</button>
      )}
    </>
  );

  return (
    <div className={styles.root} data-theme={theme ?? undefined}>
      <Head>
        <title>Smith chart</title>
        <meta name="description" content="Build a matching circuit of series and shunt R, L and C, transmission lines, stubs and λ/4 transformers on a zoomable Smith chart with impedance, admittance or combined grids: type or drag the values with snapping, read z, Γ, VSWR and return loss at every node, undo and redo, and keep the circuit in the link." />
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
          <nav className={theoryCss.nav} aria-label="Sections">
            {SECTIONS.map(({ id, label }) => (
              <a key={id} href={`#${id}`} className={theoryCss.navLink} aria-current={section === id ? 'true' : undefined} onClick={() => setSection(id)}>{label}</a>
            ))}
          </nav>
          <span className={styles.barSpace} />
          <button type="button" className={styles.iconButton} onClick={toggleTheme} aria-label="Switch between the light and the dark theme" title="Light or dark">
            <span className={styles.moon}><MoonIcon /></span>
            <span className={styles.sun}><SunIcon /></span>
          </button>
        </div>
      </header>

      <main>
        <div id="tool" ref={tool} className={`${styles.layout} ${theoryCss.tool}`}>
          <Chart mode={mode} tools={modes} z0={circuit.z0} side={side} onView={onView} />
        </div>
        {sections}
      </main>
    </div>
  );
}
