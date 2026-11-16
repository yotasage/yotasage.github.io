// The EM simulation page (M2.1a): the state (the `Setup` of lib/emsim/setup.ts), the link (the whole setup in the
// query string, read after mount, written back with history.replaceState), undo and redo, the preferences (theme,
// units, digits in localStorage, read after mount), the bar with the section nav, and the sections.
//
// For later page steps: `commit(next | (cur) => next, group)` is the one place a new setup arrives; edits with the same
// non-empty group within GROUP_MS are one undo step (a field's keystrokes). The shown unit is also in the link (`u`,
// not a setup parameter: stripped before decodeLink), so a shared link shows the same numbers.

import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BibEntry } from '../../lib/bibtex';
import type Bibliography from '../Bibliography';
import { decodeLink, encodeLink } from '../../lib/emsim/link';
import { defaultSetup, sameSetup } from '../../lib/emsim/setup';
import type { Setup } from '../../lib/emsim/setup';
import type { Decoded } from '../../lib/emsim/link';
import { issue } from '../../lib/emsim/stackup';
import type { Issue } from '../../lib/emsim/stackup';
import { UNIT_TEXT } from '../../lib/emsim/units';
import styles from '../../styles/EmSim.module.css';
import HomeIcon from '../icons/home';
import useReplayHighlight from '../../lib/useReplayHighlight';
import { DEFAULT_DIGITS, DIGIT_CHOICES, SHOWN_UNITS } from './format';
import { errorText, jlcLoaded, jlcResolve, loadJlc } from './jlcData';
import type { ShownUnit } from './format';
import StackupSection, { IssueList, NO_KICAD } from './StackupSection';
import type { Commit, KicadState } from './StackupSection';
import TraceSection from './TraceSection';

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'emsim.theme';
export const UNIT_KEY = 'emsim.units';
export const DIGITS_KEY = 'emsim.digits';
const UNIT_PARAM = 'u';
const HISTORY = 200;
const GROUP_MS = 1500;

// The sections that exist (plan.md: Stackup · Trace · Via · Waves · Theory · Examples · Report · Export · References).
const SECTIONS: readonly { id: string; label: string }[] = [{ id: 'stackup', label: 'Stackup' }, { id: 'trace', label: 'Trace' }, { id: 'theory', label: 'Theory' }, { id: 'references', label: 'References' }];

// M2.4c: the Theory and References (Theory.tsx with KaTeX and the equations) load when they come within LOAD_MARGIN of
// the window or a link points at an id outside the tool's sections; until then the sections are empty frames.
type TheoryMod = typeof import('./Theory');
const LOAD_MARGIN = '400px 0px';
const TOOL_IDS = new Set(['', 'stackup', 'trace']);

// The page's own parameters taken out of a query; the rest is the setup's.
function splitQuery(search: string): { setupPart: string; unit: ShownUnit | null; issues: Issue[] } {
  const q = search.startsWith('?') ? search.slice(1) : search;
  const keep: string[] = [];
  const issues: Issue[] = [];
  let unit: ShownUnit | null = null;
  for (const pair of q.split('&')) {
    if (!pair) continue;
    if (pair === UNIT_PARAM || pair.startsWith(`${UNIT_PARAM}=`)) {
      let u = '';
      try { u = decodeURIComponent(pair.slice(UNIT_PARAM.length + 1)); } catch { /* reported below */ }
      if ((SHOWN_UNITS as readonly string[]).includes(u)) unit = u as ShownUnit;
      else issues.push(issue('note', 'link', UNIT_PARAM, `The link's unit "${u}" is not one of ${SHOWN_UNITS.join(', ')}; the page shows your own choice.`));
    } else keep.push(pair);
  }
  return { setupPart: keep.join('&'), unit, issues };
}

const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg width={18} height={18} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const UndoIcon = () => <Svg><path d="M5.5 3.5L2.5 6.5l3 3" /><path d="M2.5 6.5h7a4 4 0 0 1 0 8h-2" /></Svg>;
const RedoIcon = () => <Svg><path d="M10.5 3.5l3 3-3 3" /><path d="M13.5 6.5h-7a4 4 0 0 0 0 8h2" /></Svg>;
const SunIcon = () => <Svg><circle cx={8} cy={8} r={2.8} /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" /></Svg>;
const MoonIcon = () => <Svg><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" /></Svg>;

export default function EmSimTool({ references, onTheme }: { references: BibEntry[]; onTheme?: (t: Theme | null) => void }) {
  // ---- the theory, loaded when needed; one Bibliography for the page, numbered in the order of its citations ----
  useReplayHighlight();
  const [th, setTh] = useState<TheoryMod | null>(null);
  const thBox = useRef<HTMLElement>(null), refBox = useRef<HTMLElement>(null);
  const jumpTo = useRef('');
  useEffect(() => {
    let asked = false;
    const load = () => {
      if (asked) return;
      asked = true;
      // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
      void import('./Theory').then((m: TheoryMod) => setTh(() => m), () => { asked = false; });
    };
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (TOOL_IDS.has(id)) return;
      if (!document.getElementById(id)) jumpTo.current = id;
      load();
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) load(); }, { rootMargin: LOAD_MARGIN });
    if (!io) load();
    for (const el of [thBox.current, refBox.current]) if (el && io) io.observe(el);
    return () => { window.removeEventListener('hashchange', fromHash); io?.disconnect(); };
  }, []);
  const bib = useMemo<Bibliography | null>(() => (th ? th.bibOf(references) : null), [th, references]);
  // A link into the theory that arrived before it was loaded: shown once it is there.
  useEffect(() => {
    const id = jumpTo.current;
    if (!th || !id) return;
    jumpTo.current = '';
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [th]);

  // ---- the setup and its history ----
  const [setup, setSetup] = useState<Setup>(defaultSetup);
  const now = useRef(setup);
  const hist = useRef({ past: [] as Setup[], future: [] as Setup[], group: '', at: 0 });
  const [, setHistTick] = useState(0);
  const commit: Commit = useCallback((next, group = '') => {
    const cur = now.current;
    const n = typeof next === 'function' ? next(cur) : next;
    if (!n || sameSetup(cur, n)) return;
    const h = hist.current, t = performance.now();
    if (!(group && group === h.group && t - h.at < GROUP_MS)) {
      h.past.push(cur);
      if (h.past.length > HISTORY) h.past.shift();
    }
    h.future = [];
    h.group = group;
    h.at = t;
    now.current = n;
    setSetup(n);
  }, []);
  const step = useCallback((dir: -1 | 1) => {
    const h = hist.current;
    const from = dir < 0 ? h.past : h.future, to = dir < 0 ? h.future : h.past;
    if (!from.length) return;
    to.push(now.current);
    const n = from.pop();
    h.group = '';
    now.current = n;
    setSetup(n);
    setHistTick((x) => x + 1);
  }, []);
  const canUndo = hist.current.past.length > 0, canRedo = hist.current.future.length > 0;

  // ---- preferences and the link, read after mount (the static page has the defaults) ----
  const [theme, setTheme] = useState<Theme | null>(null);
  const [unit, setUnit] = useState<ShownUnit>('mm');
  const [digits, setDigits] = useState(DEFAULT_DIGITS);
  const [linkIssues, setLinkIssues] = useState<Issue[]>([]);
  const [ready, setReady] = useState(false);
  const [kicad, setKicad] = useState<KicadState>(NO_KICAD);
  useEffect(() => {
    let storedTheme: string | null = null, storedUnit: string | null = null, storedDigits: string | null = null;
    try {
      storedTheme = window.localStorage.getItem(THEME_KEY);
      storedUnit = window.localStorage.getItem(UNIT_KEY);
      storedDigits = window.localStorage.getItem(DIGITS_KEY);
    } catch { /* Storage can be blocked; the defaults stand. */ }
    if (storedTheme === 'light' || storedTheme === 'dark') setTheme(storedTheme);
    const d = Number(storedDigits);
    if (DIGIT_CHOICES.includes(d)) setDigits(d);
    const q = splitQuery(window.location.search);
    setUnit(q.unit ?? ((SHOWN_UNITS as readonly string[]).includes(storedUnit) ? (storedUnit as ShownUnit) : 'mm'));
    const done = (r: Decoded | null) => {
      if (r?.linked) { now.current = r.setup; setSetup(r.setup); }
      setLinkIssues([...q.issues, ...(r?.issues ?? [])]);
      setReady(true);
    };
    if (!q.setupPart) { done(null); return; }
    // A JLCPCB list stackup in the link (its key) needs the list: loaded first, then the link is read again; when it
    // cannot be loaded, the stackup is the default with the reason as an issue.
    let asked = false;
    const r = decodeLink(q.setupPart, (key) => { asked = true; return jlcResolve(key); });
    if (!asked || jlcLoaded()) { done(r); return; }
    let live = true;
    loadJlc().then(
      () => { if (live) done(decodeLink(q.setupPart, jlcResolve)); },
      (e) => {
        const why = errorText(e);
        if (live) done(decodeLink(q.setupPart, () => { throw new Error(`JLCPCB’s stackup list could not be loaded: ${why}`); }));
      },
    );
    return () => { live = false; };
  }, []);
  useEffect(() => { onTheme?.(theme); }, [theme, onTheme]);

  // The setup goes back into the link without a new history entry; not before the router is ready (Next.js gives a
  // static page its query after hydration with a replaceState of the link as loaded, which would undo a first write).
  const router = useRouter();
  const search = useMemo(() => `${encodeLink(setup, jlcResolve)}${unit !== 'mm' ? `&${UNIT_PARAM}=${unit}` : ''}`, [setup, unit]);
  useEffect(() => {
    if (!ready || !router.isReady) return;
    const url = `${window.location.pathname}?${search}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, '', url);
  }, [ready, search, router.isReady]);

  // Undo and redo keys outside text fields (a field keeps the browser's own undo of its text).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); step(-1); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); step(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const save = (key: string, value: string | null) => {
    try {
      if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value);
    } catch { /* Kept for this visit. */ }
  };
  const toggleTheme = () => {
    const system: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const next: Theme = (theme ?? system) === 'dark' ? 'light' : 'dark';
    // Back on the system's theme, the page follows the system again.
    setTheme(next === system ? null : next);
    save(THEME_KEY, next === system ? null : next);
  };
  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
    navigator.clipboard?.writeText(window.location.href).then(done, () => { /* The address bar has the same link. */ });
  };

  return (
    <div className={styles.root} data-theme={theme ?? undefined} data-ready={ready}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Link href="/" className={styles.home} aria-label="Home" title="All tools"><HomeIcon width={17} height={19} color="currentColor" /></Link>
          <h1 className={styles.title}>EM simulation</h1>
          <nav className={styles.nav} aria-label="Sections">
            {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`}>{s.label}</a>)}
          </nav>
          <span className={styles.barSpace} />
          <button type="button" className={styles.iconButton} onClick={() => step(-1)} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" data-undo><UndoIcon /></button>
          <button type="button" className={styles.iconButton} onClick={() => step(1)} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)" data-redo><RedoIcon /></button>
          <button type="button" className={styles.iconButton} onClick={toggleTheme} aria-label="Switch between light and dark" title="Light or dark" data-theme-toggle>
            <span className={styles.moon}><MoonIcon /></span>
            <span className={styles.sun}><SunIcon /></span>
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <p className={styles.status} data-status>Work in progress: the stackup (with every JLCPCB stackup), the trace with its impedance, dragging in the drawing, the fields of the cross-section, Target, Sweep, Tolerance, Calculators and the theory are here so far; vias come next.</p>
        <div className={styles.prefs}>
          <div className={styles.pref} role="group" aria-label="Units">
            Units
            <span className={styles.seg}>
              {SHOWN_UNITS.map((u) => (
                <button key={u} type="button" aria-pressed={unit === u} data-unit={u} onClick={() => { setUnit(u); save(UNIT_KEY, u === 'mm' ? null : u); }}>{UNIT_TEXT[u]}</button>
              ))}
            </span>
          </div>
          <div className={styles.pref} role="group" aria-label="Significant digits">
            Digits
            <span className={styles.seg}>
              {DIGIT_CHOICES.map((d) => (
                <button key={d} type="button" aria-pressed={digits === d} data-digits={d} onClick={() => { setDigits(d); save(DIGITS_KEY, d === DEFAULT_DIGITS ? null : String(d)); }}>{d}</button>
              ))}
            </span>
          </div>
          <button type="button" className={styles.button} onClick={copyLink} data-copy-link>{copied ? 'Link copied' : 'Copy link'}</button>
        </div>
        {linkIssues.length > 0 && (
          <div className={styles.notice} data-link-issues>
            <h3 className={styles.h3}>The link</h3>
            <IssueList issues={linkIssues} />
          </div>
        )}
        <StackupSection setup={setup} commit={commit} unit={unit} digits={digits} kicad={kicad} setKicad={setKicad} />
        <TraceSection setup={setup} commit={commit} unit={unit} digits={digits} kicad={kicad} />
        <section id="theory" ref={thBox} className={styles.section} aria-labelledby="theory-h" data-loaded={th ? 'true' : 'false'}>
          <h2 id="theory-h" className={styles.h2}>Theory</h2>
          {th && bib ? <th.default bib={bib} unit={unit} digits={digits} /> : <p className={styles.lede}>The theory loads as you come near it.</p>}
        </section>
        <section id="references" ref={refBox} className={styles.section} aria-labelledby="references-h">
          <h2 id="references-h" className={styles.h2}>References</h2>
          {th && bib ? <th.References bib={bib} /> : <p className={styles.lede}>The sources the theory cites, listed once it has loaded.</p>}
        </section>
      </main>
    </div>
  );
}
