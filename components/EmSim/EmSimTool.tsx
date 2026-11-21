// The EM simulation page (M2.1a, Design System v2): the state (`Setup` of lib/emsim/setup.ts), the link (whole setup in
// the query string, read after mount, written back with history.replaceState), undo and redo, preferences (units, digits
// in localStorage, read after mount), frosted ToolHeader with non-destructive workspaces (Workbench, Examples, Theory &
// References) and Workbench pill tabs (Stackup, Trace, Via, Waves, Export).
//
// `commit(next | (cur) => next, group)` is the one place a new setup arrives; edits with the same non-empty group within
// GROUP_MS are one undo step (a field's keystrokes). The shown unit is also in the link (`u`, not a setup parameter:
// stripped before decodeLink), so a shared link shows the same numbers.

import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BibEntry } from '../../lib/bibtex';
import type Bibliography from '../Bibliography';
import KatexSpan from '../KatexSpan';
import PillTabs, { PillTabItem } from '../UI/PillTabs';
import TeachingCallout from '../UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../UI/ToolHeader';
import { decodeLink, encodeLink } from '../../lib/emsim/link';
import type { Decoded } from '../../lib/emsim/link';
import { PROJECT_MAX_BYTES, openProject } from '../../lib/emsim/project';
import type { Opened } from '../../lib/emsim/project';
import { defaultSetup, sameSetup } from '../../lib/emsim/setup';
import type { Setup } from '../../lib/emsim/setup';
import { issue } from '../../lib/emsim/stackup';
import type { Issue } from '../../lib/emsim/stackup';
import { UNIT_TEXT } from '../../lib/emsim/units';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import useReplayHighlight from '../../lib/useReplayHighlight';
import styles from '../../styles/EmSim.module.css';
import { DEFAULT_DIGITS, DIGIT_CHOICES, SHOWN_UNITS } from './format';
import type { ShownUnit } from './format';
import { errorText, jlcLoaded, jlcResolve, loadJlc } from './jlcData';
import type { OpenText, OpenedNote } from './exportFeed';
import StackupSection, { IssueList, NO_KICAD } from './StackupSection';
import type { Commit, KicadState } from './StackupSection';
import { Status } from './Status';
import TraceSection from './TraceSection';
import { EqEnv } from './eqLinks';
import { Why, Whys } from './Why';

export const UNIT_KEY = 'emsim.units';
export const DIGITS_KEY = 'emsim.digits';
const UNIT_PARAM = 'u';
const HISTORY = 200;
const GROUP_MS = 1500;

type WorkspaceId = 'workbench' | 'examples' | 'theory';
type WorkbenchTabId = 'stackup' | 'trace' | 'via' | 'waves' | 'export';
type TheoryTabId = 'theory' | 'references';

// Lazy-loaded chunks triggered on demand when their workspace/tab or hash route becomes active.
type TheoryMod = typeof import('./Theory');
type ViaMod = typeof import('./ViaSection');
type ExportMod = typeof import('./ExportSection');
type WavesMod = typeof import('./WavesSection');
type ExamplesMod = typeof import('./Examples');

interface HashRoute {
  workspace: WorkspaceId;
  wbTab?: WorkbenchTabId;
  theoryTab?: TheoryTabId;
  needsStandard?: boolean;
}

function routeForHash(rawHash: string): HashRoute | null {
  let id = '';
  try {
    id = decodeURIComponent(rawHash.replace(/^#/, ''));
  } catch {
    id = rawHash.replace(/^#/, '');
  }
  if (!id) return null;
  if (id === 'stackup' || id === 'stackup-h') return { workspace: 'workbench', wbTab: 'stackup' };
  if (id === 'trace' || id === 'trace-h') return { workspace: 'workbench', wbTab: 'trace' };
  if (id === 'via' || id === 'via-h') return { workspace: 'workbench', wbTab: 'via', needsStandard: true };
  if (id === 'waves' || id === 'waves-h') return { workspace: 'workbench', wbTab: 'waves', needsStandard: true };
  if (id === 'export' || id === 'export-h') return { workspace: 'workbench', wbTab: 'export', needsStandard: true };
  if (id === 'examples' || id === 'examples-h' || id.startsWith('ex-')) return { workspace: 'examples' };
  if (id === 'references' || id === 'references-h' || id.startsWith('ref-')) {
    return { workspace: 'theory', theoryTab: 'references' };
  }
  return { workspace: 'theory', theoryTab: 'theory' };
}

/** Loads a section's chunk immediately on first activation (tab switch or hash navigation). */
function useLazyModule<M>(active: boolean, loadFn: () => Promise<M>): M | null {
  const [mod, setMod] = useState<M | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void loadFn().then(
      (m) => setMod(() => m),
      () => { started.current = false; },
    );
    // loadFn is a static dynamic import
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return mod;
}

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
  <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const UndoIcon = () => <Svg><path d="M5.5 3.5L2.5 6.5l3 3" /><path d="M2.5 6.5h7a4 4 0 0 1 0 8h-2" /></Svg>;
const RedoIcon = () => <Svg><path d="M10.5 3.5l3 3-3 3" /><path d="M13.5 6.5h-7a4 4 0 0 0 0 8h2" /></Svg>;

export default function EmSimTool({ references }: { references: BibEntry[] }) {
  useDesignSystemPage('#0d9488', '#2fb3a0');
  useReplayHighlight();

  const { t } = useI18n();
  const { mode: expMode, setMode: setExpMode } = useExperienceMode();
  const expModeRef = useRef(expMode);
  expModeRef.current = expMode;

  const [workspace, setWorkspace] = useState<WorkspaceId>('workbench');
  const [wbTab, setWbTab] = useState<WorkbenchTabId>('stackup');
  const [theoryTab, setTheoryTab] = useState<TheoryTabId>('theory');
  const jumpTo = useRef('');

  // Keep workbench sub-tab valid when switching into Quick mode.
  useEffect(() => {
    if (expMode === 'quick' && wbTab !== 'stackup' && wbTab !== 'trace') {
      setWbTab('stackup');
    }
  }, [expMode, wbTab]);

  // On-demand lazy loading for Via, Waves, Export, Examples, and Theory chunks.
  // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
  const vm = useLazyModule<ViaMod>(workspace === 'workbench' && wbTab === 'via', () => import('./ViaSection'));
  // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
  const wm = useLazyModule<WavesMod>(workspace === 'workbench' && wbTab === 'waves', () => import('./WavesSection'));
  // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
  const xm = useLazyModule<ExportMod>(workspace === 'workbench' && wbTab === 'export', () => import('./ExportSection'));
  // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
  const em = useLazyModule<ExamplesMod>(workspace === 'examples', () => import('./Examples'));
  // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
  const th = useLazyModule<TheoryMod>(workspace === 'theory', () => import('./Theory'));

  const bib = useMemo<Bibliography | null>(() => (th ? th.bibOf(references) : null), [th, references]);
  // M4.3a: what the equation panel cites from (eqLinks.tsx).
  const eqEnv = useMemo(() => ({ references, bib }), [references, bib]);

  const scrollTarget = useCallback((id: string) => {
    if (!id) return false;
    const el = document.getElementById(id);
    if (!el || el.closest('[hidden]')) return false;
    let currentHash = '';
    try { currentHash = decodeURIComponent(window.location.hash.slice(1)); } catch { currentHash = window.location.hash.slice(1); }
    if (currentHash === id) window.location.replace(`#${encodeURIComponent(id)}`);
    else el.scrollIntoView({ block: 'start' });
    return true;
  }, []);

  const applyHash = useCallback((rawHash: string) => {
    const route = routeForHash(rawHash);
    if (!route) return;
    if (route.needsStandard && expModeRef.current === 'quick') {
      setExpMode('standard');
    }
    setWorkspace(route.workspace);
    if (route.wbTab) setWbTab(route.wbTab);
    if (route.theoryTab) setTheoryTab(route.theoryTab);

    let id = '';
    try { id = decodeURIComponent(rawHash.replace(/^#/, '')); } catch { id = rawHash.replace(/^#/, ''); }
    if (!id) return;
    jumpTo.current = id;
    window.requestAnimationFrame(() => {
      if (jumpTo.current === id && scrollTarget(id)) {
        jumpTo.current = '';
      }
    });
  }, [scrollTarget, setExpMode]);

  useEffect(() => {
    if (window.location.hash) applyHash(window.location.hash);
    const onHash = () => applyHash(window.location.hash);
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (href && href.length > 1) applyHash(href);
    };
    window.addEventListener('hashchange', onHash);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('click', onClick);
    };
  }, [applyHash]);

  // Complete deferred scrolls once lazy-loaded chunks or active tabs finish rendering.
  useEffect(() => {
    const id = jumpTo.current;
    if (!id) return;
    const raf = window.requestAnimationFrame(() => {
      if (jumpTo.current === id && scrollTarget(id)) {
        jumpTo.current = '';
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [th, em, vm, wm, xm, workspace, wbTab, theoryTab, scrollTarget]);

  const openTheory = useCallback((topicId?: string) => {
    setWorkspace('theory');
    setTheoryTab('theory');
    if (topicId) {
      jumpTo.current = topicId;
      window.requestAnimationFrame(() => {
        if (jumpTo.current === topicId && scrollTarget(topicId)) {
          jumpTo.current = '';
        }
      });
    }
  }, [scrollTarget]);

  // M9.1b: a control that Tab moves the focus to, off screen or under the sticky bar, is scrolled into view a frame
  // later, for engines that do not do it themselves (Playwright's WebKit leaves the page where it was).
  useEffect(() => {
    let tabbing = false;
    const down = (e: KeyboardEvent) => { if (e.key === 'Tab') tabbing = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Tab') tabbing = false; };
    const on = (e: FocusEvent) => {
      if (!tabbing) return;
      tabbing = false;
      const target = e.target;
      const head = document.querySelector('header');
      if (!(target instanceof HTMLElement || target instanceof SVGElement) || head?.contains(target) || target.closest('dialog')) return;
      const y0 = window.scrollY;
      window.requestAnimationFrame(() => {
        if (document.activeElement !== target || Math.abs(window.scrollY - y0) > 1) return;
        const r = target.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const bar = head ? head.getBoundingClientRect().bottom : 0;
        if (r.bottom <= bar + 1 || r.top >= window.innerHeight - 1) target.scrollIntoView({ block: 'nearest' });
      });
    };
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    document.addEventListener('focusin', on);
    return () => { document.removeEventListener('keydown', down, true); document.removeEventListener('keyup', up, true); document.removeEventListener('focusin', on); };
  }, []);

  // ---- the setup and its history ----
  const [setup, setSetup] = useState<Setup>(defaultSetup);
  const now = useRef(setup);
  const hist = useRef({ past: [] as Setup[], future: [] as Setup[], group: '', at: 0 });
  const [, setHistTick] = useState(0);
  const commit: Commit = useCallback((next, group = '') => {
    const cur = now.current;
    const n = typeof next === 'function' ? next(cur) : next;
    if (!n || sameSetup(cur, n)) return;
    const h = hist.current, nowMs = performance.now();
    if (!(group && group === h.group && nowMs - h.at < GROUP_MS)) {
      h.past.push(cur);
      if (h.past.length > HISTORY) h.past.shift();
    }
    h.future = [];
    h.group = group;
    h.at = nowMs;
    now.current = n;
    setSetup(n);
  }, []);
  const step = useCallback((dir: -1 | 1) => {
    const h = hist.current;
    const from = dir < 0 ? h.past : h.future, to = dir < 0 ? h.future : h.past;
    if (!from.length) return;
    to.push(now.current);
    const n = from.pop();
    if (!n) return;
    h.group = '';
    now.current = n;
    setSetup(n);
    setHistTick((x) => x + 1);
  }, []);
  const canUndo = hist.current.past.length > 0, canRedo = hist.current.future.length > 0;

  // ---- preferences and the link, read after mount (the static page has the defaults) ----
  const [unit, setUnit] = useState<ShownUnit>('mm');
  const [digits, setDigits] = useState(DEFAULT_DIGITS);
  const [linkIssues, setLinkIssues] = useState<Issue[]>([]);
  const [ready, setReady] = useState(false);
  const [kicad, setKicad] = useState<KicadState>(NO_KICAD);
  useEffect(() => {
    let storedUnit: string | null = null, storedDigits: string | null = null;
    try {
      storedUnit = window.localStorage.getItem(UNIT_KEY);
      storedDigits = window.localStorage.getItem(DIGITS_KEY);
    } catch { /* Storage can be blocked; the defaults stand. */ }
    const d = Number(storedDigits);
    if (DIGIT_CHOICES.includes(d)) setDigits(d);
    const q = splitQuery(window.location.search);
    setUnit(q.unit ?? (storedUnit && (SHOWN_UNITS as readonly string[]).includes(storedUnit) ? (storedUnit as ShownUnit) : 'mm'));
    const done = (r: Decoded | null) => {
      if (r?.linked) { now.current = r.setup; setSetup(r.setup); }
      setLinkIssues([...q.issues, ...(r?.issues ?? [])]);
      setReady(true);
    };
    if (!q.setupPart) { done(null); return; }
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

  // The setup goes back into the link without a new history entry; not before the router is ready.
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

  // ---- M8.2a: a project file, opened by the Data group's picker or dropped anywhere on the page ----
  const [opened, setOpened] = useState<OpenedNote | null>(null);
  const showExportNote = useCallback(() => {
    if (expModeRef.current === 'quick') setExpMode('standard');
    setWorkspace('workbench');
    setWbTab('export');
    jumpTo.current = 'export';
    window.requestAnimationFrame(() => {
      const note = document.querySelector('[data-project-note]');
      if (note && !note.closest('[hidden]')) {
        jumpTo.current = '';
        note.scrollIntoView({ block: 'center' });
      }
    });
  }, [setExpMode]);

  const openText: OpenText = useCallback((text, name, dropped = false) => {
    const finish = (r: Opened) => {
      if (r.setup) commit(r.setup);
      setOpened({ name, ok: !!r.setup, message: r.message, issues: r.issues, at: Date.now() });
      if (dropped && (!r.setup || r.issues.length)) {
        showExportNote();
      }
    };
    let asked = false;
    const r = openProject(text, (key) => { asked = true; return jlcResolve(key); });
    if (!asked || jlcLoaded()) { finish(r); return; }
    loadJlc().then(
      () => finish(openProject(text, jlcResolve)),
      (e) => { const why = errorText(e); finish(openProject(text, () => { throw new Error(`JLCPCB’s stackup list could not be loaded: ${why}`); })); },
    );
  }, [commit, showExportNote]);

  // Once the Export chunk finishes loading after a dropped project note, scroll directly to [data-project-note].
  useEffect(() => {
    if (!xm || !opened || workspace !== 'workbench' || wbTab !== 'export') return;
    if (!opened.ok || opened.issues.length > 0) {
      const raf = window.requestAnimationFrame(() => {
        document.querySelector('[data-project-note]')?.scrollIntoView({ block: 'center' });
      });
      return () => window.cancelAnimationFrame(raf);
    }
  }, [xm, opened, workspace, wbTab]);

  // ---- M4.3b: an example's link applied in place, switching cleanly back to Workbench (Trace or Via) ----
  const applyLink = useCallback((query: string, then: () => void) => {
    const q = splitQuery(query);
    const targetTab: WorkbenchTabId = /(^|&)via=/.test(query) ? 'via' : 'trace';
    const finish = (r: Decoded) => {
      commit(r.setup);
      setLinkIssues([...q.issues, ...r.issues]);
      if (q.unit) setUnit(q.unit);
      if (targetTab === 'via' && expModeRef.current === 'quick') {
        setExpMode('standard');
      }
      setWorkspace('workbench');
      setWbTab(targetTab);
      jumpTo.current = targetTab;
      then();
    };
    let asked = false;
    const r = decodeLink(q.setupPart, (key) => { asked = true; return jlcResolve(key); });
    if (!asked || jlcLoaded()) { finish(r); return; }
    loadJlc().then(
      () => finish(decodeLink(q.setupPart, jlcResolve)),
      (e) => { const why = errorText(e); finish(decodeLink(q.setupPart, () => { throw new Error(`JLCPCB’s stackup list could not be loaded: ${why}`); })); },
    );
  }, [commit, setExpMode]);

  useEffect(() => {
    const files = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
    const over = (e: DragEvent) => { if (!e.defaultPrevented && files(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } };
    const drop = (e: DragEvent) => {
      if (e.defaultPrevented || !files(e)) return; // the stackup's KiCad drop zone takes its own
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (!f) return;
      const no = (message: string) => {
        setOpened({ name: f.name, ok: false, message, issues: [], at: Date.now() });
        showExportNote();
      };
      if (f.size > PROJECT_MAX_BYTES) { no('The file is too large to be a project of this tool.'); return; }
      f.text().then((txt) => openText(txt, f.name, true), () => no('The file could not be read.'));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  }, [openText, showExportNote]);

  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    const done = () => { setCopied(true); window.setTimeout(() => setCopied(false), 1600); };
    navigator.clipboard?.writeText(window.location.href).then(done, () => { /* The address bar has the same link. */ });
  };

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = useMemo(
    () => [
      { id: 'workbench', label: t('emsim.workbench') },
      { id: 'examples', label: t('emsim.examples') },
      { id: 'theory', label: t('emsim.theory') },
    ],
    [t],
  );

  const workbenchTabs: readonly PillTabItem<WorkbenchTabId>[] = useMemo(() => {
    const items: PillTabItem<WorkbenchTabId>[] = [
      { id: 'stackup', label: t('emsim.tab.stackup') },
      { id: 'trace', label: t('emsim.tab.trace') },
    ];
    if (expMode !== 'quick') {
      items.push(
        { id: 'via', label: t('emsim.tab.via') },
        { id: 'waves', label: t('emsim.tab.waves') },
        { id: 'export', label: t('emsim.tab.export') },
      );
    }
    return items;
  }, [expMode, t]);

  const theoryTabs: readonly PillTabItem<TheoryTabId>[] = useMemo(
    () => [
      { id: 'theory', label: t('emsim.theoryTab.theory') },
      { id: 'references', label: t('emsim.theoryTab.references') },
    ],
    [t],
  );

  const undoRedoActions = (
    <div className={styles.headerActions}>
      <button
        type="button"
        className={styles.headerActionBtn}
        onClick={() => step(-1)}
        disabled={!canUndo}
        aria-label={t('common.undo')}
        title={t('emsim.undoTitle')}
        data-undo=""
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className={styles.headerActionBtn}
        onClick={() => step(1)}
        disabled={!canRedo}
        aria-label={t('common.redo')}
        title={t('emsim.redoTitle')}
        data-redo=""
      >
        <RedoIcon />
      </button>
    </div>
  );

  return (
    <div
      className={styles.root}
      data-ds="v2"
      data-ready={ready}
      data-whys={expMode === 'teaching' ? 'on' : 'off'}
    >
      <ToolHeader<WorkspaceId>
        title={t('emsim.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        actions={undoRedoActions}
      />

      <EqEnv.Provider value={eqEnv}>
        <main className={styles.main}>
          {/* ================================================================
              WORKSPACE 1: WORKBENCH (Non-Destructive Sub-Tool Tabs)
             ================================================================ */}
          <div role="tabpanel" className={styles.workspacePanel} hidden={workspace !== 'workbench'}>
            <Status />
            <Whys ks="status home nav undo whys theme" />

            <div className={styles.prefsBar}>
              <div className={styles.prefs}>
                <div className={styles.pref} role="group" aria-label={t('emsim.prefs.unitsAria')}>
                  <span className={styles.prefLabel}>{t('emsim.prefs.units')}</span>
                  <span className={styles.seg}>
                    {SHOWN_UNITS.map((u) => (
                      <button
                        key={u}
                        type="button"
                        aria-pressed={unit === u}
                        data-unit={u}
                        onClick={() => { setUnit(u); save(UNIT_KEY, u === 'mm' ? null : u); }}
                      >
                        {UNIT_TEXT[u]}
                      </button>
                    ))}
                  </span>
                </div>
                <div className={styles.pref} role="group" aria-label={t('emsim.prefs.digitsAria')}>
                  <span className={styles.prefLabel}>{t('emsim.prefs.digits')}</span>
                  <span className={styles.seg}>
                    {DIGIT_CHOICES.map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={digits === d}
                        data-digits={d}
                        onClick={() => { setDigits(d); save(DIGITS_KEY, d === DEFAULT_DIGITS ? null : String(d)); }}
                      >
                        {d}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
              <button type="button" className={styles.button} onClick={copyLink} data-copy-link="">
                {copied ? t('emsim.prefs.linkCopied') : t('emsim.prefs.copyLink')}
              </button>
            </div>
            <Whys ks="units digits copy-link" />

            {linkIssues.length > 0 && (
              <div className={styles.notice} data-link-issues="">
                <h3 className={styles.h3}>The link</h3>
                <Why k="link-issues" bare />
                <IssueList issues={linkIssues} />
              </div>
            )}

            {expMode === 'quick' && (
              <aside className={styles.quickBanner} aria-label={t('emsim.quick.badge')}>
                <div className={styles.quickBannerText}>
                  <span className={styles.quickBadge}>{t('emsim.quick.badge')}</span>
                  <p>{t('emsim.quick.bannerText')}</p>
                </div>
                <div className={styles.quickBannerActions}>
                  <button
                    type="button"
                    className={styles.quickBtnPrimary}
                    onClick={() => setExpMode('standard')}
                  >
                    {t('emsim.quick.switchStandard')}
                  </button>
                  <button
                    type="button"
                    className={styles.quickBtnGhost}
                    onClick={() => setExpMode('teaching')}
                  >
                    {t('emsim.quick.switchTeaching')}
                  </button>
                </div>
              </aside>
            )}

            <div className={styles.tabBarCard}>
              <PillTabs<WorkbenchTabId>
                items={workbenchTabs}
                value={wbTab}
                onChange={setWbTab}
                ariaLabel={t('emsim.tabsAria')}
                idPrefix="emsim-wb"
              />
            </div>

            <div className={styles.tabStack}>
              <div
                role="tabpanel"
                id="emsim-wb-panel-stackup"
                aria-labelledby="emsim-wb-tab-stackup"
                className={styles.panelCard}
                hidden={wbTab !== 'stackup'}
              >
                <TeachingCallout
                  title={t('emsim.teaching.stackupTitle')}
                  formula={<KatexSpan text={'Z_0 \\approx \\frac{87}{\\sqrt{\\varepsilon_r + 1.41}}\\ln\\!\\left(\\frac{5.98\\,h}{0.8\\,w + t}\\right)'} />}
                  onTheoryClick={() => openTheory('structures')}
                  className={styles.panelCallout}
                >
                  <p>{t('emsim.teaching.stackupBody')}</p>
                </TeachingCallout>
                <StackupSection setup={setup} commit={commit} unit={unit} digits={digits} kicad={kicad} setKicad={setKicad} />
              </div>

              <div
                role="tabpanel"
                id="emsim-wb-panel-trace"
                aria-labelledby="emsim-wb-tab-trace"
                className={styles.panelCard}
                hidden={wbTab !== 'trace'}
              >
                <TeachingCallout
                  title={t('emsim.teaching.traceTitle')}
                  formula={<KatexSpan text={'Z_0 = \\sqrt{\\frac{L}{C}}, \\quad v_p = \\frac{1}{\\sqrt{LC}} = \\frac{c_0}{\\sqrt{\\varepsilon_{\\mathrm{eff}}}}'} />}
                  onTheoryClick={() => openTheory('transmission-lines')}
                  className={styles.panelCallout}
                >
                  <p>{t('emsim.teaching.traceBody')}</p>
                </TeachingCallout>
                <TraceSection setup={setup} commit={commit} unit={unit} digits={digits} kicad={kicad} />
              </div>

              <section
                id="via"
                role="tabpanel"
                aria-labelledby="via-h"
                className={styles.panelCard}
                hidden={wbTab !== 'via'}
                data-loaded={vm ? 'true' : 'false'}
              >
                <h2 id="via-h" className={styles.h2}>{t('emsim.tab.via')}</h2>
                <TeachingCallout
                  title={t('emsim.teaching.viaTitle')}
                  formula={<KatexSpan text={'Z_{\\mathrm{sec}} = \\sqrt{\\frac{L_{\\mathrm{sec}}}{C_{\\mathrm{sec}}}}, \\quad f_{\\mathrm{stub}} \\approx \\frac{c_0}{4\\,\\ell_{\\mathrm{stub}}\\,\\sqrt{\\varepsilon_r}}'} />}
                  onTheoryClick={() => openTheory('via-line')}
                  className={styles.panelCallout}
                >
                  <p>{t('emsim.teaching.viaBody')}</p>
                </TeachingCallout>
                {vm ? (
                  <vm.default setup={setup} commit={commit} unit={unit} digits={digits} />
                ) : (
                  <p className={styles.lede}>{t('emsim.loading.via')}</p>
                )}
              </section>

              <section
                id="waves"
                role="tabpanel"
                aria-labelledby="waves-h"
                className={styles.panelCard}
                hidden={wbTab !== 'waves'}
                data-loaded={wm ? 'true' : 'false'}
              >
                <h2 id="waves-h" className={styles.h2}>{t('emsim.tab.waves')}</h2>
                <TeachingCallout
                  title={t('emsim.teaching.wavesTitle')}
                  formula={<KatexSpan text={'\\nabla \\times \\mathbf{E} = -\\mu\\frac{\\partial \\mathbf{H}}{\\partial t}, \\quad \\nabla \\times \\mathbf{H} = \\varepsilon\\frac{\\partial \\mathbf{E}}{\\partial t} + \\sigma\\mathbf{E}'} />}
                  onTheoryClick={() => openTheory('full-wave')}
                  className={styles.panelCallout}
                >
                  <p>{t('emsim.teaching.wavesBody')}</p>
                </TeachingCallout>
                {wm ? (
                  <wm.default setup={setup} unit={unit} />
                ) : (
                  <p className={styles.lede}>{t('emsim.loading.waves')}</p>
                )}
              </section>

              <section
                id="export"
                role="tabpanel"
                aria-labelledby="export-h"
                className={styles.panelCard}
                hidden={wbTab !== 'export'}
                data-loaded={xm ? 'true' : 'false'}
              >
                <h2 id="export-h" className={styles.h2}>{t('emsim.tab.export')}</h2>
                {xm ? (
                  <xm.default setup={setup} unit={unit} digits={digits} opened={opened} openText={openText} />
                ) : (
                  <p className={styles.lede}>{t('emsim.loading.export')}</p>
                )}
              </section>
            </div>
          </div>

          {/* ================================================================
              WORKSPACE 2: EXAMPLES
             ================================================================ */}
          <div role="tabpanel" className={styles.workspacePanel} hidden={workspace !== 'examples'}>
            <section
              id="examples"
              className={styles.panelCard}
              aria-labelledby="examples-h"
              data-loaded={em ? 'true' : 'false'}
            >
              <h2 id="examples-h" className={styles.h2}>{t('emsim.examples')}</h2>
              {em ? (
                <em.default apply={applyLink} />
              ) : (
                <p className={styles.lede}>{t('emsim.loading.examples')}</p>
              )}
            </section>
          </div>

          {/* ================================================================
              WORKSPACE 3: THEORY & REFERENCES (Non-Destructive Tabs)
             ================================================================ */}
          <div role="tabpanel" className={styles.workspacePanel} hidden={workspace !== 'theory'}>
            <div className={styles.tabBarCard}>
              <PillTabs<TheoryTabId>
                items={theoryTabs}
                value={theoryTab}
                onChange={setTheoryTab}
                ariaLabel={t('emsim.theoryTabsAria')}
                idPrefix="emsim-theory"
              />
            </div>

            <div className={styles.tabStack}>
              <section
                id="theory"
                role="tabpanel"
                className={th ? `${styles.panelCard} ${styles.offscreen}` : styles.panelCard}
                aria-labelledby="theory-h"
                hidden={theoryTab !== 'theory'}
                data-loaded={th ? 'true' : 'false'}
              >
                <h2 id="theory-h" className={styles.h2}>{t('emsim.theoryTab.theory')}</h2>
                {th && bib ? (
                  <th.default bib={bib} unit={unit} digits={digits} />
                ) : (
                  <p className={styles.lede}>{t('emsim.loading.theory')}</p>
                )}
              </section>

              {/* Mounted right after Theory in the same render pass so Bibliography numbering stays deterministic. */}
              <section
                id="references"
                role="tabpanel"
                className={th ? `${styles.panelCard} ${styles.offscreen}` : styles.panelCard}
                aria-labelledby="references-h"
                hidden={theoryTab !== 'references'}
              >
                <h2 id="references-h" className={styles.h2}>{t('emsim.theoryTab.references')}</h2>
                {th && bib ? (
                  <th.References bib={bib} />
                ) : (
                  <p className={styles.lede}>{t('emsim.loading.references')}</p>
                )}
              </section>
            </div>
          </div>
        </main>
      </EqEnv.Provider>
    </div>
  );
}
