import Link from 'next/link';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { DrawStyle, MAX_OHMS, MIN_OHMS, SERIES, SeriesId, formatOhms, readInput, series, step, usualSeries } from '../../lib/resistor';
import styles from '../../styles/Resistor.module.css';
import HomeIcon from '../icons/home';
import DrawingSection from './DrawingSection';
import Lookup from './Lookup';
import Reference from './Reference';
import SmartInput from './SmartInput';
import Stage from './Stage';
import ValueHero from './ValueHero';
import { MoonIcon, SunIcon } from './parts';
import { Change, DEFAULT_VIEW, View, resolveView, viewFromParams, viewToParams } from './view';

// The sections of the page, in the order of the nav. Later steps add theirs here and render them in .results.
const SECTIONS: { id: string; label: string }[] = [
  { id: 'lookup', label: 'Lookup' },
  { id: 'drawing', label: 'Drawing' },
  { id: 'reference', label: 'Reference' },
];

// What lies outside the tool's own element in the two themes, the page background and the site footer:
// --bg, --rule, --ink-3, --ink-2 and --ink in styles/Resistor.module.css.
const LIGHT = { bg: '#f6f4ee', rule: '#e3dfd5', quiet: '#736f67', link: '#55524b', ink: '#1d1c19' };
const DARK = { bg: '#141513', rule: '#272825', quiet: '#8f8c83', link: '#b7b4ab', ink: '#edebe5' };


const THEME_KEY = 'resistor.theme';
const STYLE_KEY = 'resistor.style';
const DEFAULT_TOLERANCE = 5;

type Theme = 'light' | 'dark';

// On the server there is no layout; in the browser this runs before the first paint, so a link shows its result at once.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// E24+E96 is e24e96 in a link.
const seriesParam = (id: SeriesId) => id.toLowerCase().replace('+', '');

export default function ResistorTool() {
  const [text, setText] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);
  const [seriesChoice, setSeriesChoice] = useState<SeriesId | null>(null);
  // null follows the system.
  const [theme, setTheme] = useState<Theme | null>(null);
  // What the drawing shows is part of the link; its style is a preference, kept in the browser.
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [drawStyle, setDrawStyle] = useState<DrawStyle>('realistic');
  const [loaded, setLoaded] = useState(false);
  const [section, setSection] = useState(SECTIONS[0].id);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const result = useMemo(() => readInput(text), [text]);
  const reading = result.readings.find((r) => r.id === pick) ?? result.readings[0];
  const ohms = reading?.ohms;
  const stepSeries = seriesChoice ?? usualSeries(tolerance);
  const resolved = useMemo(() => resolveView(view, reading, text, tolerance), [view, reading, text, tolerance]);

  // The state comes from the link, and the theme from the browser, once the page is in the browser.
  useBrowserLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) setText(q);
    if (params.get('as')) setPick(params.get('as'));
    const tol = Number(params.get('tol'));
    if (params.has('tol') && tol > 0 && tol <= 50) setTolerance(tol);
    else if (q) {
      const first = readInput(q).readings;
      const picked = first.find((r) => r.id === params.get('as')) ?? first[0];
      if (picked?.tolerance !== undefined) setTolerance(picked.tolerance);
    }
    const chosen = SERIES.find((s) => seriesParam(s.id) === params.get('e'));
    if (chosen) setSeriesChoice(chosen.id);
    setView(viewFromParams(params));
    try {
      const stored = window.localStorage.getItem(THEME_KEY);
      if (stored === 'light' || stored === 'dark') setTheme(stored);
      if (window.localStorage.getItem(STYLE_KEY) === 'flat') setDrawStyle('flat');
    } catch { /* Storage can be blocked; the theme then follows the system. */ }
    setLoaded(true);
    // With a mouse and keyboard the field has focus from the start; on a phone that would open the keyboard.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true });
  }, []);

  // The state goes back into the link, without a new entry in the history.
  useEffect(() => {
    if (!loaded) return;
    const params = new URLSearchParams();
    if (text.trim()) params.set('q', text);
    if (pick && reading && reading.id === pick && result.readings[0].id !== pick) params.set('as', pick);
    if (tolerance !== (reading?.tolerance ?? DEFAULT_TOLERANCE)) params.set('tol', String(tolerance));
    if (seriesChoice) params.set('e', seriesParam(seriesChoice));
    viewToParams(view, params);
    const search = params.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [loaded, text, pick, tolerance, seriesChoice, reading, result, view]);

  // The nav shows the section at the top of the window.
  useEffect(() => {
    if (SECTIONS.length < 2) return undefined;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setSection(entry.target.id);
    }, { rootMargin: '-15% 0px -75% 0px' });
    for (const { id } of SECTIONS) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, []);

  // A code that carries a tolerance sets it; a value typed without one leaves the choice as it is.
  const applyText = useCallback((next: string, pickId: string | null = null) => {
    setText(next);
    setPick(pickId);
    const readings = readInput(next).readings;
    const picked = readings.find((r) => r.id === pickId) ?? readings[0];
    if (picked?.tolerance !== undefined) setTolerance(picked.tolerance);
  }, []);

  const takeValue = useCallback((value: number) => {
    setText(formatOhms(value));
    setPick(null);
  }, []);

  // A change made in the drawing or in a table: a value, a tolerance, what the drawing shows, or a text for the field.
  const change = useCallback((c: Change) => {
    if (c.text !== undefined) applyText(c.text);
    if (c.ohms !== undefined) takeValue(c.ohms);
    if (c.tolerance !== undefined) setTolerance(c.tolerance);
    if (c.view) setView((v) => ({ ...v, ...c.view }));
  }, [applyText, takeValue]);

  const chooseStyle = useCallback((next: DrawStyle) => {
    setDrawStyle(next);
    try {
      if (next === 'flat') window.localStorage.setItem(STYLE_KEY, next);
      else window.localStorage.removeItem(STYLE_KEY);
    } catch { /* The choice still holds for this visit. */ }
  }, []);

  const onStep = useCallback((dir: 1 | -1) => {
    if (ohms === undefined) { takeValue(1000); return; }
    const next = ohms === 0 ? (dir > 0 ? 1 : null) : step(ohms, stepSeries, dir);
    if (next !== null && next >= MIN_OHMS && next <= MAX_OHMS) takeValue(next);
  }, [ohms, stepSeries, takeValue]);

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

  // The colours outside the tool's element when the system is light and when it is dark. The site footer comes from
  // pages/_app.tsx in the dark look of the other tools; here it follows the theme. styled-jsx takes values only.
  const day = theme === 'dark' ? DARK : LIGHT;
  const night = theme === 'light' ? LIGHT : DARK;

  return (
    <div className={styles.root} data-theme={theme ?? undefined}>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
        }
        html,
        body {
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
          <h1 className={styles.title}>Resistor lookup</h1>
          <nav className={styles.nav} aria-label="Sections">
            {SECTIONS.map(({ id, label }) => (
              <a key={id} href={`#${id}`} className={styles.navLink} aria-current={section === id ? 'true' : undefined} onClick={() => setSection(id)}>{label}</a>
            ))}
          </nav>
          <span className={styles.barSpace} />
          <button type="button" className={styles.iconButton} onClick={toggleTheme} aria-label="Switch between the light and the dark theme" title="Light or dark">
            <span className={styles.moon}><MoonIcon /></span>
            <span className={styles.sun}><SunIcon /></span>
          </button>
        </div>
      </header>

      <main className={styles.layout}>
        {/* The hero: the field, the drawing and the value stay in view on a wide screen. */}
        <div className={styles.hero}>
          <SmartInput
            text={text}
            result={result}
            reading={reading}
            inputRef={inputRef}
            onText={(next) => applyText(next)}
            onPick={(id) => applyText(text, id)}
            onStep={onStep}
            stepLabel={series(stepSeries).label}
          />
          <Stage resolved={resolved} drawStyle={drawStyle} onStyle={chooseStyle} onChange={change} />
          <ValueHero reading={reading} tolerance={tolerance} stepSeries={stepSeries} onTolerance={setTolerance} onValue={takeValue} />
        </div>

        <div className={styles.results}>
          <section id="lookup" className={styles.section} aria-labelledby="lookup-title">
            <h2 className={[styles.label, styles.sectionHead].join(' ')} id="lookup-title">Lookup</h2>
            <Lookup
              ohms={ohms}
              tcr={resolved.type === 'axial' && resolved.colours.length === 6 ? resolved.tcr : reading?.tcr}
              tolerance={tolerance}
              stepSeries={stepSeries}
              seriesChosen={seriesChoice !== null}
              onSeries={(id) => setSeriesChoice(seriesChoice === id ? null : id)}
              onValue={takeValue}
              onExample={(example) => { applyText(example); window.scrollTo({ top: 0 }); }}
            />
          </section>

          <section id="drawing" className={styles.section} aria-labelledby="drawing-title">
            <h2 className={[styles.label, styles.sectionHead].join(' ')} id="drawing-title">Drawing</h2>
            <DrawingSection resolved={resolved} drawStyle={drawStyle} onStyle={chooseStyle} onChange={change} />
          </section>

          <section id="reference" className={styles.section} aria-labelledby="reference-title">
            <h2 className={[styles.label, styles.sectionHead].join(' ')} id="reference-title">Reference</h2>
            <Reference resolved={resolved} onChange={change} onText={(next) => applyText(next)} />
          </section>
        </div>
      </main>
    </div>
  );
}
