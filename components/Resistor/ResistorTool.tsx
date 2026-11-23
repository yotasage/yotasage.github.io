import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { BibEntry } from '../../lib/bibtex';
import {
  DrawStyle,
  MAX_OHMS,
  MIN_OHMS,
  ParsedList,
  ReadAs,
  SERIES,
  SeriesId,
  StoredList,
  formatOhms,
  readInput,
  series,
  step,
  usualSeries,
} from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import useReplayHighlight from '../../lib/useReplayHighlight';
import styles from '../../styles/Resistor.module.css';
import theory from '../../styles/ResistorTheory.module.css';
import Bibliography from '../Bibliography';
import KatexSpan from '../KatexSpan';
import PillTabs, { PillTabItem } from '../UI/PillTabs';
import TeachingCallout from '../UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../UI/ToolHeader';
import Combinations from './Combinations';
import DesignSection from './DesignSection';
import DrawingSection from './DrawingSection';
import Lookup from './Lookup';
import Reference from './Reference';
import SmartInput from './SmartInput';
import Stage from './Stage';
import Theory from './Theory';
import ValueHero from './ValueHero';
import { Combo, DEFAULT_COMBO, comboFromParams, comboToParams } from './combo';
import { DEFAULT_DESIGN, Design as DesignState, designFromParams, designToParams } from './design';
import { Change, DEFAULT_VIEW, View, resolveView, viewFromParams, viewToParams } from './view';

type WorkspaceId = 'workbench' | 'examples' | 'theory';
type WorkbenchTabId = 'lookup' | 'drawing' | 'combinations' | 'design';
type TheoryTabId = 'theory' | 'reference' | 'references';

interface ExamplePreset {
  id: 'i2c' | 'led' | 'rf' | 'opamp' | 'smd3' | 'eia96';
  query: string;
  code: string;
  readAs?: ReadAs;
  tolerance?: number;
}

const EXAMPLE_PRESETS: readonly ExamplePreset[] = [
  { id: 'i2c', query: '4k7', code: '4k7', tolerance: 5 },
  { id: 'led', query: '330', code: '330 Ω', tolerance: 5 },
  { id: 'rf', query: '49.9', code: '49.9 Ω', tolerance: 1 },
  { id: 'opamp', query: '100k', code: '100 kΩ', tolerance: 1 },
  { id: 'smd3', query: '472', code: '472', readAs: 'marking', tolerance: 5 },
  { id: 'eia96', query: '01C', code: '01C', readAs: 'marking', tolerance: 1 },
];

// The sources cited above the Reference tables, in notes that come and go with the results of a search: by section,
// in the order of the page. They are given their numbers before the page is drawn, so that a note that appears a
// moment later (the searches run in workers) does not get a number out of order.
const CITED_BY_LOOKUP_VALUES = ['VishayBasics'];
const CITED_BY_LOOKUP = ['IEC60062', 'YageoRC'];
const CITED_BY_SEARCHES = ['TISNVA112', 'YageoRC', 'VishayCRCW'];

const STYLE_KEY = 'resistor.style';
const DEFAULT_TOLERANCE = 5;

// On the server there is no layout; in the browser this runs before the first paint, so a link shows its result at once.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// E24+E96 is e24e96 in a link.
const seriesParam = (id: SeriesId) => id.toLowerCase().replace('+', '');

interface HashRoute {
  workspace: WorkspaceId;
  wbTab?: WorkbenchTabId;
  theoryTab?: TheoryTabId;
  needsStandard?: boolean;
}

function routeForHash(rawHash: string): HashRoute | null {
  const id = decodeURIComponent(rawHash.replace(/^#/, ''));
  if (!id) return null;
  if (id === 'lookup' || id === 'lookup-title') {
    return { workspace: 'workbench', wbTab: 'lookup' };
  }
  if (id === 'drawing' || id === 'drawing-title') {
    return { workspace: 'workbench', wbTab: 'drawing' };
  }
  if (id === 'combinations' || id === 'combinations-title' || id === 'my-values') {
    return { workspace: 'workbench', wbTab: 'combinations', needsStandard: true };
  }
  if (id === 'design' || id === 'design-title') {
    return { workspace: 'workbench', wbTab: 'design', needsStandard: true };
  }
  if (id === 'reference' || id === 'reference-title') {
    return { workspace: 'theory', theoryTab: 'reference' };
  }
  if (id === 'references' || id === 'references-title' || id.startsWith('ref-')) {
    return { workspace: 'theory', theoryTab: 'references' };
  }
  if (id === 'theory' || id === 'theory-title' || id.startsWith('theory-')) {
    return { workspace: 'theory', theoryTab: 'theory' };
  }
  return null;
}

export default function ResistorTool({ references }: { references: BibEntry[] }) {
  useDesignSystemPage('#2563eb', '#5aa2f0');
  useReplayHighlight();
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = useState<WorkspaceId>('workbench');
  const [wbTab, setWbTab] = useState<WorkbenchTabId>('lookup');
  const [theoryTab, setTheoryTab] = useState<TheoryTabId>('theory');

  const [text, setText] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  const [tolerance, setTolerance] = useState(DEFAULT_TOLERANCE);
  const [seriesChoice, setSeriesChoice] = useState<SeriesId | null>(null);
  // What the drawing shows is part of the link; its style is a preference, kept in the browser.
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [drawStyle, setDrawStyle] = useState<DrawStyle>('realistic');
  // What the Combinations section searches with; part of the link.
  const [combo, setCombo] = useState<Combo>(DEFAULT_COMBO);
  const changeCombo = useCallback((patch: Partial<Combo>) => setCombo((c) => ({ ...c, ...patch })), []);
  // What the Design section works with; part of the link. The value lists are read by the Combinations section.
  const [design, setDesign] = useState<DesignState>(DEFAULT_DESIGN);
  const changeDesign = useCallback((patch: Partial<DesignState>) => setDesign((d) => ({ ...d, ...patch })), []);
  const [valueLists, setValueLists] = useState<{ list: StoredList; parsed: ParsedList }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // What a text that is a number and a marking (472) is first of all; part of the link.
  const [readAs, setReadAs] = useState<ReadAs>('value');

  const result = useMemo(() => readInput(text, readAs), [text, readAs]);
  const reading = result.readings.find((r) => r.id === pick) ?? result.readings[0];
  const ohms = reading?.ohms;
  // One list of sources for the whole page, numbered by first citation (components/Bibliography.tsx). The Lookup
  // cites only when there is a value, so the numbers are given again when the first value is typed.
  const hasValue = ohms !== undefined;
  const hasOhms = ohms > 0;
  const bib = useMemo(() => {
    const made = new Bibliography(references);
    const first = [...(hasOhms ? CITED_BY_LOOKUP_VALUES : []), ...(hasValue ? CITED_BY_LOOKUP : []), ...CITED_BY_SEARCHES];
    for (const key of first) made.number(key);
    return made;
  }, [references, hasValue, hasOhms]);
  const stepSeries = seriesChoice ?? usualSeries(tolerance);
  const resolved = useMemo(() => resolveView(view, reading, text, tolerance), [view, reading, text, tolerance]);

  // If the user switches to Quick mode while viewing Combinations or Design, fall back cleanly to Lookup.
  useEffect(() => {
    if (mode === 'quick' && (wbTab === 'combinations' || wbTab === 'design')) {
      setWbTab('lookup');
    }
  }, [mode, wbTab]);

  // The state comes from the link, and the drawing style from the browser, once the page is in the browser.
  useBrowserLayoutEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) setText(q);
    if (params.get('as')) setPick(params.get('as'));
    const tol = Number(params.get('tol'));
    const readMode: ReadAs = params.get('read') === 'marking' ? 'marking' : 'value';
    setReadAs(readMode);
    if (params.has('tol') && tol > 0 && tol <= 50) setTolerance(tol);
    else if (q) {
      const first = readInput(q, readMode).readings;
      const picked = first.find((r) => r.id === params.get('as')) ?? first[0];
      if (picked?.tolerance !== undefined) setTolerance(picked.tolerance);
    }
    const chosen = SERIES.find((s) => seriesParam(s.id) === params.get('e'));
    if (chosen) setSeriesChoice(chosen.id);
    setView(viewFromParams(params));
    setCombo(comboFromParams(params));
    setDesign(designFromParams(params));
    try {
      if (window.localStorage.getItem(STYLE_KEY) === 'flat') setDrawStyle('flat');
    } catch { /* Storage can be blocked; the preference holds for this visit. */ }
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
    if (readAs === 'marking') params.set('read', 'marking');
    viewToParams(view, params);
    comboToParams(combo, params);
    designToParams(design, params);
    const search = params.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [loaded, text, pick, tolerance, seriesChoice, reading, result, view, readAs, combo, design]);

  // Auto-route internal hash links (#lookup, #drawing, #combinations, #design, #reference, #theory, #theory-*, #references, #ref-*).
  useEffect(() => {
    function activateHash(rawHash: string) {
      const route = routeForHash(rawHash);
      if (!route) return;
      const targetId = decodeURIComponent(rawHash.replace(/^#/, ''));
      if (route.needsStandard && modeRef.current === 'quick') {
        setMode('standard');
      }
      setWorkspace(route.workspace);
      if (route.wbTab) setWbTab(route.wbTab);
      if (route.theoryTab) setTheoryTab(route.theoryTab);

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const target = document.getElementById(targetId);
          if (!target) return;
          if (target instanceof HTMLDetailsElement && !target.open) {
            target.open = true;
          }
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    }

    if (window.location.hash) {
      activateHash(window.location.hash);
    }

    function onHashChange() {
      activateHash(window.location.hash);
    }

    function onDocClick(event: MouseEvent) {
      const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
      const href = anchor?.getAttribute('href');
      if (!href) return;
      const route = routeForHash(href);
      if (!route) return;
      activateHash(href);
    }

    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('click', onDocClick);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      document.removeEventListener('click', onDocClick);
    };
  }, [setMode]);

  // A code that carries a tolerance sets it; a value typed without one leaves the choice as it is.
  const applyText = useCallback((next: string, pickId: string | null = null, nextMode: ReadAs = readAs) => {
    setText(next);
    setPick(pickId);
    setReadAs(nextMode);
    const readings = readInput(next, nextMode).readings;
    const picked = readings.find((r) => r.id === pickId) ?? readings[0];
    if (picked?.tolerance !== undefined) setTolerance(picked.tolerance);
  }, [readAs]);

  // An example that shows a value or a marking sets the choice beside the field, when the text would read
  // differently without it (472 does, 01C does not).
  const tryExample = useCallback((example: string, wanted?: ReadAs) => {
    const matters = wanted && readInput(example, wanted).readings[0]?.id !== readInput(example, readAs).readings[0]?.id;
    applyText(example, null, matters ? wanted : readAs);
  }, [applyText, readAs]);

  const takeValue = useCallback((value: number) => {
    setText(formatOhms(value));
    setPick(null);
  }, []);

  // A change made in the drawing or in a table: a value, a tolerance, what the drawing shows, or a text for the field.
  const change = useCallback((c: Change) => {
    if (c.text !== undefined) tryExample(c.text, c.readAs);
    if (c.ohms !== undefined) takeValue(c.ohms);
    if (c.tolerance !== undefined) setTolerance(c.tolerance);
    if (c.view) setView((v) => ({ ...v, ...c.view }));
  }, [tryExample, takeValue]);

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

  const openTheory = useCallback((targetTab: TheoryTabId = 'theory', targetId?: string) => {
    setWorkspace('theory');
    setTheoryTab(targetTab);
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (targetId) {
          const el = document.getElementById(targetId);
          if (el instanceof HTMLDetailsElement && !el.open) el.open = true;
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });
  }, []);

  const loadPreset = useCallback((preset: ExamplePreset) => {
    tryExample(preset.query, preset.readAs);
    if (preset.tolerance !== undefined) setTolerance(preset.tolerance);
    setWorkspace('workbench');
    setWbTab('lookup');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [tryExample]);

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = useMemo(
    () => [
      { id: 'workbench', label: t('resistor.workbench') },
      { id: 'examples', label: t('resistor.examples') },
      { id: 'theory', label: t('resistor.theory') },
    ],
    [t],
  );

  const workbenchTabs: readonly PillTabItem<WorkbenchTabId>[] = useMemo(() => {
    const base: PillTabItem<WorkbenchTabId>[] = [
      { id: 'lookup', label: t('resistor.tab.lookup') },
      { id: 'drawing', label: t('resistor.tab.drawing') },
    ];
    if (mode !== 'quick') {
      base.push(
        { id: 'combinations', label: t('resistor.tab.combinations') },
        { id: 'design', label: t('resistor.tab.design') },
      );
    }
    return base;
  }, [mode, t]);

  const theoryTabs: readonly PillTabItem<TheoryTabId>[] = useMemo(
    () => [
      { id: 'theory', label: t('resistor.theoryTab.theory') },
      { id: 'reference', label: t('resistor.theoryTab.reference') },
      { id: 'references', label: t('resistor.theoryTab.references') },
    ],
    [t],
  );

  return (
    <div className={styles.root} data-ds="v2">
      <ToolHeader<WorkspaceId>
        title={t('resistor.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        {/* ================================================================
            WORKSPACE 1: WORKBENCH (Hybrid Split + Non-Destructive Sub-Tabs)
           ================================================================ */}
        <div
          role="tabpanel"
          hidden={workspace !== 'workbench'}
          className={styles.workspacePanel}
        >
          <div className={styles.layout}>
            {/* Left sticky SaaS hero card: input, live clickable drawing, and primary value */}
            <div className={styles.hero}>
              <SmartInput
                text={text}
                result={result}
                reading={reading}
                inputRef={inputRef}
                readAs={readAs}
                onReadAs={(nextMode) => applyText(text, null, nextMode)}
                onText={(next) => applyText(next)}
                onExample={tryExample}
                onPick={(id) => applyText(text, id)}
                onStep={onStep}
                stepLabel={series(stepSeries).label}
              />
              <Stage resolved={resolved} drawStyle={drawStyle} onStyle={chooseStyle} onChange={change} />
              <ValueHero reading={reading} tolerance={tolerance} stepSeries={stepSeries} onTolerance={setTolerance} onValue={takeValue} />
              <TeachingCallout
                title={t('resistor.teaching.inputTitle')}
                onTheoryClick={() => openTheory('theory', 'theory-codes')}
                className={styles.heroCallout}
              >
                <p>{t('resistor.teaching.inputBody')}</p>
              </TeachingCallout>
            </div>

            {/* Right tabbed workspace column */}
            <div className={styles.panelColumn}>
              {mode === 'quick' && (
                <aside className={styles.quickBanner} aria-label={t('resistor.quick.badge')}>
                  <div className={styles.quickBannerText}>
                    <span className={styles.quickBadge}>{t('resistor.quick.badge')}</span>
                    <p>{t('resistor.quick.bannerText')}</p>
                  </div>
                  <div className={styles.quickBannerActions}>
                    <button
                      type="button"
                      className={styles.quickBtnPrimary}
                      onClick={() => setMode('standard')}
                    >
                      {t('resistor.quick.switchStandard')}
                    </button>
                    <button
                      type="button"
                      className={styles.quickBtnGhost}
                      onClick={() => setMode('teaching')}
                    >
                      {t('resistor.quick.switchTeaching')}
                    </button>
                  </div>
                </aside>
              )}

              <div className={styles.tabBarCard}>
                <PillTabs<WorkbenchTabId>
                  items={workbenchTabs}
                  value={wbTab}
                  onChange={setWbTab}
                  ariaLabel={t('resistor.tabsAria')}
                  idPrefix="resistor-wb"
                />
              </div>

              <div className={styles.results}>
                <section
                  id="lookup"
                  role="tabpanel"
                  aria-labelledby="lookup-title"
                  className={styles.panelCard}
                  hidden={wbTab !== 'lookup'}
                >
                  <h2 className={[styles.label, styles.sectionHead].join(' ')} id="lookup-title">
                    {t('resistor.tab.lookup')}
                  </h2>
                  <TeachingCallout
                    title={t('resistor.teaching.lookupTitle')}
                    formula={<KatexSpan text={'R_k = 10^{k / N}'} />}
                    onTheoryClick={() => openTheory('theory', 'theory-series')}
                    className={styles.panelCallout}
                  >
                    <p>{t('resistor.teaching.lookupBody')}</p>
                  </TeachingCallout>
                  <Lookup
                    ohms={ohms}
                    tcr={resolved.type === 'axial' && resolved.colours.length === 6 ? resolved.tcr : reading?.tcr}
                    tolerance={tolerance}
                    stepSeries={stepSeries}
                    seriesChosen={seriesChoice !== null}
                    onSeries={(id) => setSeriesChoice(seriesChoice === id ? null : id)}
                    onValue={takeValue}
                    onExample={(example, wanted) => {
                      tryExample(example, wanted);
                      setWorkspace('workbench');
                      setWbTab('lookup');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    bib={bib}
                  />
                </section>

                <section
                  id="drawing"
                  role="tabpanel"
                  aria-labelledby="drawing-title"
                  className={styles.panelCard}
                  hidden={wbTab !== 'drawing'}
                >
                  <h2 className={[styles.label, styles.sectionHead].join(' ')} id="drawing-title">
                    {t('resistor.tab.drawing')}
                  </h2>
                  <TeachingCallout
                    title={t('resistor.teaching.drawingTitle')}
                    onTheoryClick={() => openTheory('theory', 'theory-codes')}
                    className={styles.panelCallout}
                  >
                    <p>{t('resistor.teaching.drawingBody')}</p>
                  </TeachingCallout>
                  <DrawingSection resolved={resolved} drawStyle={drawStyle} onStyle={chooseStyle} onChange={change} />
                </section>

                <section
                  id="combinations"
                  role="tabpanel"
                  aria-labelledby="combinations-title"
                  className={styles.panelCard}
                  hidden={wbTab !== 'combinations'}
                >
                  <h2 className={[styles.label, styles.sectionHead].join(' ')} id="combinations-title">
                    {t('resistor.tab.combinations')}
                  </h2>
                  <TeachingCallout
                    title={t('resistor.teaching.combosTitle')}
                    formula={<KatexSpan text={'R_{\\text{ser}} = R_1 + R_2, \\qquad R_{\\text{par}} = \\frac{R_1 R_2}{R_1 + R_2}'} />}
                    onTheoryClick={() => openTheory('theory', 'theory-networks')}
                    className={styles.panelCallout}
                  >
                    <p>{t('resistor.teaching.combosBody')}</p>
                  </TeachingCallout>
                  <Combinations ohms={ohms} tolerance={tolerance} combo={combo} onCombo={changeCombo} onLists={setValueLists} bib={bib} />
                </section>

                <section
                  id="design"
                  role="tabpanel"
                  aria-labelledby="design-title"
                  className={styles.panelCard}
                  hidden={wbTab !== 'design'}
                >
                  <h2 className={[styles.label, styles.sectionHead].join(' ')} id="design-title">
                    {t('resistor.tab.design')}
                  </h2>
                  <TeachingCallout
                    title={t('resistor.teaching.designTitle')}
                    formula={<KatexSpan text={'\\varepsilon_{\\text{wc}} = \\sum |\\varepsilon_i|, \\qquad \\varepsilon_{\\text{rss}} = \\sqrt{\\sum \\varepsilon_i^2}'} />}
                    onTheoryClick={() => openTheory('theory', 'theory-tolerance')}
                    className={styles.panelCallout}
                  >
                    <p>{t('resistor.teaching.designBody')}</p>
                  </TeachingCallout>
                  <DesignSection design={design} onDesign={changeDesign} lists={valueLists} onValue={takeValue} bib={bib} />
                </section>
              </div>
            </div>
          </div>
        </div>

        {/* ================================================================
            WORKSPACE 2: EXAMPLES (Curated Practical EE Presets)
           ================================================================ */}
        <div
          role="tabpanel"
          hidden={workspace !== 'examples'}
          className={styles.workspacePanel}
        >
          <div className={styles.examplesContainer}>
            <div className={styles.examplesHeader}>
              <h2 className={styles.examplesTitle}>{t('resistor.examples.title')}</h2>
              <p className={styles.examplesLead}>{t('resistor.examples.subtitle')}</p>
            </div>

            <div className={styles.examplesGrid}>
              {EXAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={styles.exampleCard}
                  onClick={() => loadPreset(preset)}
                >
                  <div className={styles.exampleCardTop}>
                    <span className={styles.exampleTag}>{t(`resistor.examples.${preset.id}.tag`)}</span>
                    <span className={styles.exampleCode}>{preset.code}</span>
                  </div>
                  <h3 className={styles.exampleTitle}>{t(`resistor.examples.${preset.id}.title`)}</h3>
                  <p className={styles.exampleDesc}>{t(`resistor.examples.${preset.id}.desc`)}</p>
                  <span className={styles.exampleAction}>{t('resistor.examples.try')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ================================================================
            WORKSPACE 3: THEORY & REFERENCE (Deterministic Citation Order)
           ================================================================ */}
        <div
          role="tabpanel"
          hidden={workspace !== 'theory'}
          className={styles.workspacePanel}
        >
          <div className={styles.theoryContainer}>
            <div className={styles.tabBarCard}>
              <PillTabs<TheoryTabId>
                items={theoryTabs}
                value={theoryTab}
                onChange={setTheoryTab}
                ariaLabel={t('resistor.theoryTabsAria')}
                idPrefix="resistor-theory"
              />
            </div>

            {/* Mounted in original page order (Reference -> Theory -> References) so bib.list() stays 100% deterministic. */}
            <section
              id="reference"
              role="tabpanel"
              aria-labelledby="reference-title"
              className={styles.panelCard}
              hidden={theoryTab !== 'reference'}
            >
              <h2 className={[styles.label, styles.sectionHead].join(' ')} id="reference-title">
                {t('resistor.theoryTab.reference')}
              </h2>
              <Reference resolved={resolved} onChange={change} bib={bib} />
            </section>

            <section
              id="theory"
              role="tabpanel"
              aria-labelledby="theory-title"
              className={styles.panelCard}
              hidden={theoryTab !== 'theory'}
            >
              <h2 className={[styles.label, styles.sectionHead].join(' ')} id="theory-title">
                {t('resistor.theoryTab.theory')}
              </h2>
              <Theory bib={bib} resolved={resolved} onChange={change} />
            </section>

            {/* After the last citation: the list is numbered while the page above it is drawn. */}
            <section
              id="references"
              role="tabpanel"
              aria-labelledby="references-title"
              className={styles.panelCard}
              hidden={theoryTab !== 'references'}
            >
              <h2 className={[styles.label, styles.sectionHead].join(' ')} id="references-title">
                {t('resistor.theoryTab.references')}
              </h2>
              <div className={theory.refs} data-testid="references">
                <p className={theory.lead}>{t('resistor.referencesLead')}</p>
                {bib.list()}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
