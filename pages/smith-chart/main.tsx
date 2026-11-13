import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import Bibliography from '../../components/Bibliography';
import HomeIcon from '../../components/icons/home';
import { MoonIcon, SunIcon } from '../../components/Resistor/parts';
import Chart from '../../components/Smith/Chart';
import Derivation from '../../components/Smith/Derivation';
import { ChallengePanel, NO_PROGRESS, PROGRESS_KEY, addProgress, readProgress } from '../../components/Smith/Challenge';
import type { Progress, ProgressEvent } from '../../components/Smith/Challenge';
import { Guide, LearnSection } from '../../components/Smith/Learn';
import { LessonBox, linkSearch } from '../../components/Smith/Lesson';
import type { Grid } from '../../components/Smith/Learn';
import MathPanel, { MathLive } from '../../components/Smith/MathPanel';
import { mathLink } from '../../components/Smith/mathLink';
import type { Subject } from '../../components/Smith/mathRows';
import { DIGIT_CHOICES, READOUT_DIGITS, setShownDigits } from '../../components/Smith/readout';
import Nodes from '../../components/Smith/Nodes';
import SolvePanel from '../../components/Smith/SolvePanel';
import { Status } from '../../components/Smith/Status';
import type { Outcome } from '../../components/Smith/SolvePanel';
import Strip from '../../components/Smith/Strip';
import type { StripLock } from '../../components/Smith/Strip';
import Theory from '../../components/Smith/Theory';
import { Why } from '../../components/Smith/Why';
import type { ChartView } from '../../components/Smith/chartView';
import { writeLive } from '../../components/Smith/live';
import { PathLayer, SEL_NODE, SEL_NONE, SEL_PART } from '../../components/Smith/pathLayer';
import { SolveLayer } from '../../components/Smith/solveLayer';
import type { CircleShape } from '../../components/Smith/solveLayer';
import { BibEntry } from '../../lib/bibtex';
import { loadReferences } from '../../lib/references';
import { makeChallenge } from '../../lib/smith/challenge';
import type { Challenge, ChallengeKind } from '../../lib/smith/challenge';
import { exampleById } from '../../lib/smith/examples';
import { keepLocks, valueLocked } from '../../lib/smith/lesson';
import type { Lesson, Lock } from '../../lib/smith/lesson';
import { MODE_Y, MODE_Z, MODE_ZY } from '../../lib/smith/grid';
import { Circuit, KIND_SHORT, decodeCircuit, defaultCircuit, sameCircuit, sameNetwork } from '../../lib/smith/state';
import { choiceFromText, choiceToText, defaultChoice } from '../../lib/smith/values';
import type { ValueChoice } from '../../lib/smith/values';
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
// the grid switch turns snapping to grid circles and to the values of each kind's list off (Alt does the same for a mouse drag).
// From M3.3b `commit` keeps the history for undo and redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y and the buttons in the
// toolbar): every commit is a step, except that the keystrokes of one field (until the focus moves) and the arrow keys
// of one handle (less than GROUP_MS apart) make one; a drag and a draw commit once, so they are one step. The draw tool
// is armed by the strip's Draw button and shown in the toolbar until a draw ends or Escape.
// From M3.5b the Theory section (components/Smith/Theory.tsx) and the References section follow the tool, with a section
// nav in the bar (Tool · Theory · References). The theory follows the committed circuit; its citations are numbered by
// one Bibliography of references.bib, read in getStaticProps (at build time only), in the order of the page.
// From M4.3a the Solve panel (components/Smith/SolvePanel.tsx) sits between the strip and the node table: the unknowns
// (marked on the cards and f0 there) and the goal are the circuit's `ask`, so marking, the goal and Apply are steps of
// the same history and part of the link. The theory follows the circuit without its ask (marking does not re-render it).

// The sources the page cites, read from references.bib when the site is built. An unknown key stops the build.
export async function getStaticProps() {
  return { props: { references: loadReferences() } };
}

/** The sections of the page, in the order of the nav. */
const SECTIONS = [{ id: 'tool', label: 'Tool' }, { id: 'learn', label: 'Learn' }, { id: 'theory', label: 'Theory' }, { id: 'references', label: 'References' }];

const MODES = [{ mode: MODE_Z, name: 'Z', title: 'Impedance grid: r and x circles' },
  { mode: MODE_Y, name: 'Y', title: 'Admittance grid: g and b circles' },
  { mode: MODE_ZY, name: 'ZY', title: 'Both grids' }];

type Theme = 'light' | 'dark';
const THEME_KEY = 'smith.theme';
/** The value lists per kind (D17), values.ts's text form; the link's vl wins over it. */
const LISTS_KEY = 'smith.lists';
/** The digits setting (M5.1), read after mount. */
const DIGITS_KEY = 'smith.digits';
// What lies outside the tool's own element in the two themes (page background and the site footer of _app.tsx).
/** Steps kept for undo, and the longest pause between a handle's arrow keys that still makes one step. */
const HISTORY = 200;
const GROUP_MS = 1000;
// `dropped`: the redo steps a group's first commit cleared, back if the group ends where it began (no step at all).
interface History { past: Circuit[]; future: Circuit[]; dropped: Circuit[]; group: string; t: number }

/** The start circuit (D16), to compare with; Start over commits a fresh copy. */
const START = defaultCircuit();

/** A running challenge and the locks it keeps (Z0, f0 and the load; for "read this point" the parts too). */
interface Running { ch: Challenge; seq: number; locks: Lesson }
const challengeLocks = (ch: Challenge): Lesson => ({ locks: ch.kind === 'read' ? ['z0', 'f0', 'zl', 'parts'] : ['z0', 'f0', 'zl'], hidden: [], text: '' });
/** A lesson from the link and the circuit its locks keep. */
interface LessonOn { lesson: Lesson; base: Circuit; seq: number }
const LESSON_WHY = 'locked by the lesson’s link (Leave the lesson unlocks it).';
const CHALLENGE_WHY = 'fixed by the challenge (Close it to change).';

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
  // The theory shows the network only: a change of what the solver is asked keeps the same circuit for it.
  const network = useRef(circuit);
  if (network.current !== circuit && !sameNetwork(network.current, circuit)) network.current = circuit;
  const theoryCircuit = useDeferredValue(network.current);
  // The circuit as last committed (ahead of React's state between a commit and the render) and the history.
  const now = useRef<Circuit>(circuit);
  const hist = useRef<History>({ past: [], future: [], dropped: [], group: '', t: 0 });
  const [revision, setRevision] = useState(0);
  const [issues, setIssues] = useState<string[]>([]);
  const [linked, setLinked] = useState(false);
  // The value lists of D17 (M4.3b): what dragging snaps to and the solutions' standard values. Not part of the circuit
  // (no undo step): kept in the link (vl) and in localStorage, the link first; both read after mount, as the theme is.
  const [lists, setListsState] = useState<ValueChoice>(defaultChoice);
  const listsText = useMemo(() => choiceToText(lists), [lists]);
  const setLists = (next: ValueChoice) => {
    setListsState(next);
    try {
      const text = choiceToText(next);
      if (text) window.localStorage.setItem(LISTS_KEY, text); else window.localStorage.removeItem(LISTS_KEY);
    } catch { /* Storage can be blocked; the link still keeps the lists. */ }
  };
  // M6.3b: the running challenge, the lesson of the link and the challenges' progress (localStorage, read after mount).
  // The refs are what `commit` reads (it is handed out once); they change together with the state.
  const seq = useRef(0);
  const [challenge, setChallenge] = useState<Running | null>(null);
  const running = useRef<Running | null>(null);
  const [lesson, setLesson] = useState<LessonOn | null>(null);
  const lessonOn = useRef<LessonOn | null>(null);
  const [progress, setProgress] = useState<Progress>(NO_PROGRESS);
  const saveProgress = (p: Progress) => {
    setProgress(p);
    try { window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch { /* Kept for this visit. */ }
  };
  const progressRef = useRef(progress);
  progressRef.current = progress;
  // The circuit comes from the link once the page is in the browser (never at build time).
  useEffect(() => {
    const read = decodeCircuit(window.location.search);
    // M6.3b: a challenge starts from its own problem unless the link also holds the visitor's circuit (a load).
    let c = read.circuit, ch: Challenge | null = null;
    if (read.challenge) {
      ch = makeChallenge(read.challenge.kind, read.challenge.seed);
      if (!new URLSearchParams(window.location.search).has('zl')) c = ch.circuit;
    }
    if (read.linked || ch) { now.current = c; setCircuit(c); }
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(PROGRESS_KEY); } catch { /* Storage can be blocked. */ }
    const prog = readProgress(stored);
    if (ch) {
      const run = { ch, seq: ++seq.current, locks: challengeLocks(ch) };
      running.current = run;
      setChallenge(run);
      saveProgress(addProgress(prog, ch.kind, { t: 'tried' }));
    } else setProgress(prog);
    if (read.lesson) {
      const on = { lesson: read.lesson, base: c, seq: ++seq.current };
      lessonOn.current = on;
      setLesson(on);
    }
    let text = read.lists;
    if (text === null) { try { text = window.localStorage.getItem(LISTS_KEY); } catch { /* Storage can be blocked. */ } }
    if (text) setListsState(choiceFromText(text));
    setIssues(read.issues);
    setLinked(true);
  }, []);
  // The circuit goes back into the link, without a new entry in the history. Not before the router is ready: Next.js
  // gives a statically optimised page its query after hydration with a replaceState of the link as it was loaded, which
  // would undo a first write (M4.3b: the value lists from localStorage).
  const router = useRouter();
  useEffect(() => {
    if (!linked || !router.isReady) return;
    const url = `${window.location.pathname}?${linkSearch(circuit, listsText, lesson?.lesson ?? null, challenge?.ch ?? null)}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [linked, circuit, listsText, router.isReady, lesson, challenge]);
  // The one place a new circuit arrives: fields, add, remove, move, the end of a drag or a draw, a handle's keys.
  // Only refs and state setters are used, so the closures handed out once (the path layer, listeners) stay right.
  const commit = (next: Circuit, group = '') => {
    const h = hist.current, before = now.current;
    // M6.3b: every locked value of a lesson or a challenge stays, whatever the path (lesson.ts keepLocks).
    const ls = lessonOn.current, run = running.current, asked = next;
    if (ls) next = keepLocks(ls.lesson, ls.base, next);
    if (run) next = keepLocks(run.locks, run.ch.circuit, next);
    if (next === before || sameCircuit(next, before)) {
      // A change the locks undid: the chart may show it already (a key step), so it gets the circuit back.
      if (next !== asked) path.current?.setCircuit(before);
      return;
    }
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
  // The Solve panel's outcome for the theory's solver topics (M4.3c): set in a transition and read deferred, so it
  // renders with the theory, time-sliced, never in a drag's frames.
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  /** Whether the outcome the theory has holds a result. */
  const theoryHas = useRef(false);
  const theoryOutcome = useDeferredValue(outcome);
  // The same functions for the life of the page (they use only refs and setters), so memoised panels skip renders.
  const [stable] = useState(() => ({
    commit: (next: Circuit, group?: string) => commitRef.current(next, group),
    busy: () => !!path.current && path.current.dragPart >= 0,
    result: (o: Outcome | null) => {
      solved.current = o;
      solveLayer.current?.setResult(o?.result ?? null, o?.circuit ?? null);
      // null while a slow problem waits: the theory keeps the last outcome until the next. Nothing marked before and
      // after (the usual edit) changes nothing the theory shows: no render of the page for it.
      if (o && (o.result || theoryHas.current)) {
        theoryHas.current = !!o.result;
        startTransition(() => setOutcome(o));
      }
    },
    preview: (c: Circuit | null, shape?: CircleShape | null, base?: Circuit | null) => solveLayer.current?.setPreview(c, shape, base),
    lists: (next: ValueChoice) => setListsRef.current(next),
    load: (id: string) => loadRef.current(id),
    closeGuide: () => setGuide(null),
    start: (kind: ChallengeKind) => startRef.current(kind),
    closeChallenge: () => {
      running.current = null;
      setChallenge(null);
      solveLayer.current?.setHint(null, null);
    },
    apply: (c: Circuit) => applyRef.current(c),
    circles: (shape: CircleShape | null, c: Circuit | null) => solveLayer.current?.setHint(shape, c),
    progress: (kind: ChallengeKind, e: ProgressEvent) => saveRef.current(addProgress(progressRef.current, kind, e)),
    leave: () => { lessonOn.current = null; setLesson(null); },
  }));
  const saveRef = useRef(saveProgress);
  saveRef.current = (p: Progress) => { progressRef.current = p; saveProgress(p); };
  const [stableRead] = useState(() => (gr: number, gi: number) => mathLive.point(gr, gi));
  const setListsRef = useRef(setLists);
  setListsRef.current = setLists;
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
  const commitRef = useRef(commit);
  commitRef.current = commit;
  // The last outcome of the Solve panel (M4.3b draws its circles and the family's slider from it).
  const solved = useRef<Outcome | null>(null);
  // Start over goes back to the lesson's circuit, else the challenge's problem, else the start circuit.
  const startCircuit = (): Circuit => lessonOn.current?.base ?? running.current?.ch.circuit ?? defaultCircuit();
  const startOver = () => {
    if (path.current && path.current.dragPart >= 0) return;
    commit(startCircuit());
    hist.current.group = '';
    setRevision((r) => r + 1);
    setPartSel(-1);
    setNodeSel(-1);
  };
  // The worked example the guide shows (M6.3a); `seq` gives the guide a new key, so every load starts at step 1.
  const [guide, setGuide] = useState<{ id: string; seq: number } | null>(null);
  // Its circuit as one step, which Undo takes back; the tool comes into view with the guide focused beside the chart.
  const loadExample = (id: string) => {
    const ex = exampleById(id);
    if (!ex || (path.current && path.current.dragPart >= 0)) return;
    stopDraw();
    if (running.current) stable.closeChallenge();
    commit(decodeCircuit(ex.link).circuit);
    hist.current.group = '';
    setRevision((r) => r + 1);
    setPartSel(-1);
    setNodeSel(-1);
    setGuide({ id, seq: ++seq.current });
    tool.current?.scrollIntoView({ block: 'start' });
  };
  const loadRef = useRef(loadExample);
  loadRef.current = loadExample;
  // M6.3b: a challenge of a kind with a new seed, as one undo step; its panel takes the guide's place.
  const startChallenge = (kind: ChallengeKind) => {
    if (path.current && path.current.dragPart >= 0) return;
    const ch = makeChallenge(kind, crypto.getRandomValues(new Uint32Array(1))[0]);
    stopDraw();
    solveLayer.current?.setHint(null, null);
    // The new problem's locks before its circuit arrives: the last problem's would keep the last load.
    const run = { ch, seq: ++seq.current, locks: challengeLocks(ch) };
    running.current = run;
    commit(ch.circuit);
    hist.current.group = '';
    setRevision((r) => r + 1);
    setPartSel(-1);
    setNodeSel(-1);
    setChallenge(run);
    setGuide(null);
    saveRef.current(addProgress(progressRef.current, kind, { t: 'tried' }));
    tool.current?.scrollIntoView({ block: 'start' });
  };
  const startRef = useRef(startChallenge);
  startRef.current = startChallenge;
  // A revealed circuit, as one undo step.
  const applyRef = useRef((c: Circuit) => {
    if (path.current && path.current.dragPart >= 0) return;
    commitRef.current(c);
    hist.current.group = '';
    setRevision((r) => r + 1);
  });
  const [snap, setSnap] = useState(true);
  const [drawKind, setDrawKind] = useState(-1);
  // The digits setting (M5.1): readout.ts holds it for the frame loops, this state re-renders what shows it. Kept in
  // localStorage, read after mount (the static page has the default).
  const [digits, setDigitsState] = useState(READOUT_DIGITS);
  const setDigits = (d: number) => {
    setShownDigits(d);
    setDigitsState(d);
    try {
      if (d === READOUT_DIGITS) window.localStorage.removeItem(DIGITS_KEY); else window.localStorage.setItem(DIGITS_KEY, String(d));
    } catch { /* The setting still holds for this visit. */ }
  };
  useEffect(() => {
    let d = NaN;
    try { d = Number(window.localStorage.getItem(DIGITS_KEY)); } catch { /* Storage can be blocked. */ }
    if (DIGIT_CHOICES.includes(d)) { setShownDigits(d); setDigitsState(d); }
  }, []);
  // The equation panel's lines with numbers, written outside React in the drag's and the readout's frames.
  const [mathLive] = useState(() => new MathLive());
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
  const solveLayer = useRef<SolveLayer | null>(null);
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
    // M5.2: the chart's hover lights the variables of its arc or node in the equation panel, and the panel's pointing
    // lights the arc, handle or node marker.
    layer.onHot = (kind, i) => mathLink.fromPage(kind, i);
    mathLink.path = layer;
    layer.onDraw = (i) => { setDrawKind(-1); if (i >= 0) selectPart(i); };
    // Scoped to the tool: a query over the whole document would walk the theory's MathML every drag frame.
    layer.onLive = (c, i, half) => { writeLive(tool.current ?? document, c, i, half); mathLive.live(c); };
    (v.box as HTMLElement & { smithPath?: PathLayer }).smithPath = layer;
    path.current = layer;
    // The solver's circles, the goal's ring and the preview of a solution (M4.3b), under the path.
    const solveL = new SolveLayer(v);
    (v.box as HTMLElement & { smithSolveLayer?: SolveLayer }).smithSolveLayer = solveL;
    solveLayer.current = solveL;
    layer.setLists(lists);
    layer.setFixed(fixedRef.current);
    solveL.setGoal(now.current);
    const o = solved.current;
    solveL.setResult(o?.result ?? null, o?.circuit ?? null);
  };
  useEffect(() => { path.current?.setCircuit(circuit); solveLayer.current?.setGoal(circuit); }, [circuit]);
  // "Show equation" (M5.2) sets the selection without the node table's toggle; the link's queries stay in the tool.
  useEffect(() => {
    mathLink.scope = tool.current;
    mathLink.select = (s) => {
      if (s.t === 'part') { setPartSel(s.i); setNodeSel(-1); } else if (s.t === 'node') setNodeSel(s.k);
    };
    return () => { mathLink.scope = null; mathLink.select = null; mathLink.path = null; };
  }, []);
  useEffect(() => { path.current?.setLists(lists); }, [lists]);
  useEffect(() => { if (path.current) path.current.snap = snap; }, [snap]);
  useEffect(() => { path.current?.arm(drawKind); }, [drawKind]);
  useEffect(() => {
    path.current?.select(node >= 0 ? SEL_NODE : part >= 0 ? SEL_PART : SEL_NONE, node >= 0 ? node : part);
  }, [node, part]);
  const grid: Grid = mode === MODE_Y ? 'Y' : mode === MODE_ZY ? 'ZY' : 'Z';
  // M6.3b: what the lesson hides and what a challenge hides while it runs (examples-challenges.md §1, §2).
  const hidden = lesson?.lesson.hidden ?? [];
  const noSolve = !!challenge || hidden.includes('solve');
  const noSuggest = hidden.includes('suggest');
  const noRead = challenge?.ch.kind === 'read';
  // The locks the strip and the chart obey: the lesson's and the challenge's together.
  const lock = useMemo<StripLock | null>(() => {
    if (!lesson && !challenge) return null;
    const locks: Lock[] = [...(lesson?.lesson.locks ?? []), ...(challenge?.locks.locks ?? [])];
    return { lesson: { locks, hidden: [], text: '' }, why: lesson?.lesson.locks.length ? LESSON_WHY : CHALLENGE_WHY };
  }, [lesson, challenge]);
  const fixedRef = useRef<boolean[]>([]);
  useEffect(() => {
    fixedRef.current = circuit.parts.map((_, i) => valueLocked(lock?.lesson ?? null, i));
    path.current?.setFixed(fixedRef.current);
  }, [lock, circuit]);
  // The solver's circles go with its panel.
  useEffect(() => {
    if (noSolve) { solved.current = null; solveLayer.current?.setResult(null, null); }
  }, [noSolve]);
  const side = (
    <>
      {lesson && <LessonBox key={lesson.seq} lesson={lesson.lesson} onLeave={stable.leave} />}
      {challenge
        ? <ChallengePanel key={challenge.seq} ch={challenge.ch} circuit={circuit} noReveal={hidden.includes('reveal')}
          fixed={!!lesson?.lesson.locks.length} onApply={stable.apply} onNew={stable.start} onClose={stable.closeChallenge}
          onCircles={stable.circles} onProgress={stable.progress} />
        : guide && <Guide key={guide.seq} id={guide.id} circuit={circuit} grid={grid} digits={digits} onLoad={stable.load} onClose={stable.closeGuide} />}
      <Strip circuit={circuit} onChange={commit} issues={issues} selected={part} onSelect={selectPart}
        revision={revision} drawKind={drawKind} onDraw={setDrawKind}
        onHover={(i) => { path.current?.hover(SEL_PART, i); mathLink.fromPage(SEL_PART, i); }} digits={digits} bib={bib}
        lock={lock} noSolve={noSolve} noRead={noRead} />
      {!noSolve && (
        <SolvePanel circuit={circuit} onChange={stable.commit} revision={revision} busy={stable.busy} onResult={stable.result}
          onPreview={stable.preview} lists={lists} onLists={stable.lists} noSuggest={noSuggest} />
      )}
      {!noRead && (
        <Nodes circuit={circuit} selected={node} onSelect={(k) => setNodeSel(k === node ? -1 : k)}
          onHover={(k) => { path.current?.hover(SEL_NODE, k); mathLink.fromPage(SEL_NODE, k); }} digits={digits} />
      )}
    </>
  );
  // The Learn section's props, the same objects between commits (the section is memoised).
  const blocked = lesson?.lesson.locks.length
    ? 'The lesson’s locks hold the circuit: Leave the lesson (above the circuit) to load an example or start a challenge.' : '';
  const challengesProps = useMemo(() => ({ running: challenge?.ch.kind ?? '', progress, onStart: stable.start, blocked }),
    [challenge, progress, stable, blocked]);
  const makerProps = useMemo(() => ({ circuit, lists: listsText, challenge: challenge ? { kind: challenge.ch.kind, seed: challenge.ch.seed } : null }),
    [circuit, listsText, challenge]);
  // The equation panel (M5.1) under the readout: the selected node, else the selected (or last) part, else the load.
  // The same object while the selection stays, so the memoised panel skips the page's other renders.
  const subject = useMemo<Subject>(() => (node >= 0 ? { t: 'node', k: node } : part >= 0 ? { t: 'part', i: part } : { t: 'node', k: 0 }), [node, part]);
  const math = <MathPanel circuit={circuit} subject={subject} digits={digits} live={mathLive} />;
  // The same element while the theory's circuit stays, so the page's renders during a drag (a pick, a selection) skip
  // the sections and the reference list entirely.
  const sections = useMemo(() => (
    <div className={theoryCss.sections}>
      <section id="theory" className={theoryCss.section} aria-labelledby="theory-title">
        <h2 className={theoryCss.sectionHead} id="theory-title">Theory</h2>
        <Theory bib={bib} circuit={noRead ? START : theoryCircuit} outcome={theoryOutcome} lists={lists} />
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
  ), [bib, theoryCircuit, theoryOutcome, lists, noRead]);
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
          onClick={() => setSnap(!snap)} title="Dragging a ring snaps to the grid's circles and to the values of the part's list (E24 for R, L and C unless changed under Standard values in the Solve panel; Alt: not for this drag); arrow keys on a ring step through the list or by whole degrees">Snap</button>
        <Why k="snap" />
      </span>
      <span className={styles.history}>
        <button type="button" className={styles.button} data-undo="" disabled={!hist.current.past.length} onClick={() => travel(true)} title="Undo (Ctrl+Z)">Undo</button>
        <button type="button" className={styles.button} data-redo="" disabled={!hist.current.future.length} onClick={() => travel(false)} title="Redo (Ctrl+Shift+Z or Ctrl+Y)">Redo</button>
        <button type="button" className={styles.button} data-start-over="" disabled={sameCircuit(circuit, lesson?.base ?? challenge?.ch.circuit ?? START)} onClick={startOver}
          title={lesson ? 'Back to the lesson’s circuit; Undo brings this circuit back' : challenge ? 'Back to the challenge’s problem; Undo brings this circuit back'
            : 'Back to the start circuit (Z0 = 50 Ω, load 25 + j25 Ω, f0 = 100 MHz, two parts); Undo brings this circuit back'}>Start over</button>
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
        <meta name="description" content="Build a matching circuit of series and shunt R, L and C, transmission lines, stubs and λ/4 transformers on a zoomable Smith chart with impedance, admittance or combined grids: type or drag the values with snapping, read z, Γ, VSWR and return loss at every node, follow 16 worked examples step by step, try challenges of five kinds with a ladder of hints, make lesson links with locked values, let the solver find one or two missing values for a match or a circle, undo and redo, and keep the circuit in the link." />
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
        <Status />
        <div id="tool" ref={tool} className={`${styles.layout} ${theoryCss.tool}`}>
          <Chart mode={mode} tools={modes} z0={circuit.z0} side={side} onView={onView} after={noRead ? null : math}
            onReadout={stableRead} digits={digits} onDigits={setDigits} noReadout={noRead} />
          {!noRead && <Derivation circuit={circuit} digits={digits} />}
        </div>
        <LearnSection open={guide?.id ?? ''} onLoad={stable.load} challenges={challengesProps} maker={makerProps} />
        {sections}
      </main>
    </div>
  );
}
