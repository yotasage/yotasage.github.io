// The Trace section of the EM simulation page (M2.1b): the structure presets (lib/emsim/structure.ts) on the current
// stackup, the KiCad project's net classes as structures, the typed dimensions and layers, the cross-section drawn to
// scale from the solver's own polygons, and the results through the static worker (lib/emsim/staticClient.ts, loaded
// by import() so the solver stays out of the page's first load; the newest job wins, results cached by hash).
//
// M2.1c: a handle drag (TraceDrawing) edits a live copy of the setup that only this section sees; every frame's edit
// starts a solve on the same channel, and the drag is committed once at its end (one undo step). When the full solve
// with its error estimate cannot keep up (its last round trip took more than QUICK_ABOVE_MS, or no result came for
// STARVED_MS while dragging) the drag solves one coarse level without an estimate (QUICK) and the full solve follows
// when the drag pauses for PAUSE_MS or ends; the panel says so instead of showing an error.
//
// M2.1d: the general arrangement, offered in the kind select and by "Edit as general" (`toGeneral`), edited by
// GeneralEditor.tsx; the selected trace or ground (`GenSel`) is shared with the drawing.

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';

import { section } from '../../lib/emsim/geometry';
import type { SolveResult, StaticJob } from '../../lib/emsim/jobs';
import type { Setup } from '../../lib/emsim/setup';
import { isOuter, layerIndex, stackupIssues } from '../../lib/emsim/stackup';
import type { Val } from '../../lib/emsim/stackup';
import type { StaticClient } from '../../lib/emsim/staticClient';
import { KIND_INFO, presetStructure, sameStructure, structureIssues, structuresFromClass, toGeneral } from '../../lib/emsim/structure';
import type { Structure, TraceKind } from '../../lib/emsim/structure';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import stk from '../../styles/EmSimStackup.module.css';
import css from '../../styles/EmSimTrace.module.css';
import tcss from '../../styles/EmSimTools.module.css';
import { lenText, sourceTag } from './format';
import GeneralEditor from './GeneralEditor';
import type { Commit, KicadState } from './StackupSection';
import { IssueList } from './StackupSection';
import FieldControls from './FieldControls';
import { FIELD_DEFAULT } from './fieldTypes';
import type { FieldSettings } from './fieldTypes';
import TraceDrawing from './TraceDrawing';
import type { HandleEdit } from './TraceDrawing';
import { applyHandle } from './traceGeom';
import TraceResults from './TraceResults';
import type { ToolName } from './TraceTools';
import type { RunState } from './TraceResults';
import ValField from './ValField';
import { KINDS, coppersOf, etchOf, isCoplanar, isPair, withKind, withSignalLayer } from './trace';
import type { GenSel } from './trace';

// One client for the page, made when the first solve is asked for.
let clientP: Promise<StaticClient> | null = null;
function getClient(): Promise<StaticClient> {
  if (!clientP) {
    clientP = (async () => {
      // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
      const m = (await import('../../lib/emsim/staticClient')) as typeof import('../../lib/emsim/staticClient');
      return new m.StaticClient();
    })();
  }
  return clientP;
}

// M2.3a: the target, sweeps and the tolerance band, loaded when a tool is first opened.
// @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
const TraceTools = lazy(() => import('./TraceTools'));
const TOOLS: [ToolName, string][] = [['target', 'Target'], ['sweep', 'Sweep'], ['tolerance', 'Tolerance']];

const QUICK_ABOVE_MS = 30; // a full solve slower than about two frames: the drag uses the fast path
const STARVED_MS = 100;
const PAUSE_MS = 200;
const QUICK = { M: 1, estimate: false } as const;

interface Props {
  setup: Setup;
  commit: Commit;
  unit: LengthUnit;
  digits: number;
  kicad: KicadState;
}

export default function TraceSection({ setup, commit, unit, digits, kicad }: Props) {
  // ---- a handle drag's live setup ----
  const [live, setLive] = useState<Setup | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paused, setPaused] = useState(false);
  const liveRef = useRef<Setup | null>(null);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const eff = live ?? setup;
  const s = eff.stackup, st = eff.trace;
  useEffect(() => {
    if (!dragging) return;
    setPaused(false);
    const id = window.setTimeout(() => setPaused(true), PAUSE_MS);
    return () => clearTimeout(id);
  }, [live, dragging]);
  // Stable, so the drawing (React.memo) is not drawn again when a result arrives.
  const edit = useMemo<HandleEdit>(() => ({
    begin: () => { liveRef.current = null; setDragging(true); setPaused(false); },
    move: (key, v) => {
      const r = applyHandle(setupRef.current, key, v);
      if ('reason' in r) return r.reason;
      liveRef.current = r.setup;
      setLive(r.setup);
      return null;
    },
    end: (cancelled) => {
      const n = liveRef.current;
      liveRef.current = null;
      if (n && !cancelled) commit(n);
      setLive(null);
      setDragging(false);
    },
    key: (key, v) => {
      const r = applyHandle(setupRef.current, key, v);
      if ('reason' in r) return r.reason;
      commit(r.setup, `handle.${key}`);
      return null;
    },
  }), [commit]);
  const [widen, setWiden] = useState(false);
  const [sel, setSel] = useState<GenSel | null>(null);
  const [fieldSet, setFieldSet] = useState<FieldSettings>(FIELD_DEFAULT);
  const [tool, setTool] = useState<ToolName | null>(null);
  const [toolsOpened, setToolsOpened] = useState(false);
  const coppers = useMemo(() => coppersOf(s), [s]);
  const stackErr = useMemo(() => stackupIssues(s).find((i) => i.level === 'error') ?? null, [s]);
  const issues = useMemo(() => structureIssues(s, st), [s, st]);
  const { sec, reason } = useMemo(() => {
    if (stackErr) return { sec: null, reason: `The stackup has an error to fix first: ${stackErr.message}` };
    const bad = issues.find((i) => i.level === 'error');
    if (bad) return { sec: null, reason: bad.message };
    try {
      return { sec: section(s, st), reason: '' };
    } catch (e) {
      return { sec: null, reason: `The cross-section could not be drawn: ${e instanceof Error ? e.message : String(e)}` };
    }
  }, [s, st, issues, stackErr]);

  // ---- the solve: the newest setup wins; the old result stays, marked stale, until the new one arrives ----
  const [res, setRes] = useState<SolveResult | null>(null);
  const [state, setState] = useState<RunState>('running');
  const [stale, setStale] = useState(true);
  const [message, setMessage] = useState('');
  const [where, setWhere] = useState('');
  const [quickShown, setQuickShown] = useState(false);
  const [solves, setSolves] = useState(0);
  const fullMs = useRef(0); // the last full solve's round trip
  const lastArrival = useRef(0);
  const starved = useRef(false);
  if (!dragging) starved.current = false;
  const quick = dragging && !paused && (fullMs.current > QUICK_ABOVE_MS || starved.current);
  useEffect(() => {
    if (!sec) {
      setState('invalid');
      setMessage(reason);
      setStale(false);
      if (clientP) void clientP.then((c) => c.cancel('solve'));
      return;
    }
    let on = true;
    setStale(true);
    setState('running');
    const t0 = performance.now();
    if (dragging && !quick && lastArrival.current && t0 - lastArrival.current > STARVED_MS) starved.current = true;
    const job: StaticJob = quick ? { kind: 'solve', setup: { stackup: s, trace: st, via: setup.via }, opt: QUICK } : { kind: 'solve', setup: { stackup: s, trace: st, via: setup.via } };
    getClient()
      .then((c) => c.run<SolveResult>('solve', job))
      .then((rr) => {
        if (!on || !rr) return;
        const t1 = performance.now();
        if (!quick && !rr.cached) fullMs.current = t1 - t0;
        lastArrival.current = t1;
        setRes(rr.result);
        setQuickShown(quick);
        setSolves((n) => n + 1);
        setWhere(rr.where);
        setState('done');
        setStale(false);
      }, (e) => {
        if (!on) return;
        setState('error');
        setMessage(`The solve failed: ${e instanceof Error ? e.message : String(e)}`);
        setStale(false);
      });
    return () => { on = false; };
    // The via does not change the trace's solve.
  }, [s, st, sec, quick]);
  useEffect(() => { if (dragging) lastArrival.current = performance.now(); }, [dragging]);
  // M2.2: the field jobs use the solve's options (the fast path too), so the worker's solve cache serves them.
  const fieldEnv = useMemo(() => ({ client: getClient, via: setup.via, ...(quick ? { opt: QUICK } : {}) }), [setup.via, quick]);

  // ---- edits ----
  const setTrace = (f: (t: Structure, cur: Setup) => Structure | null, group = '') =>
    commit((cur) => { const t = f(cur.trace, cur); return t ? { ...cur, trace: t } : cur; }, group);
  const onVal = (key: 'w' | 's' | 'g' | 'gw') => (x: Val | null, part: 'v' | 'tol') => {
    if (!x && key !== 'gw') return;
    setTrace((t) => ({ ...t, [key]: x }), `trace.${key}.${part}`);
  };
  const kinds = useMemo(() => KINDS.map((k) => ({ ...k, ok: !!presetStructure(k.kind, s) })), [s]);
  const classes = kicad.project && !kicad.project.reason ? kicad.project.classes : [];
  const fromClasses = useMemo(() => classes.map((c) => ({ c, ...structuresFromClass(s, c) })), [classes, s]);
  const general = st.kind === 'general';
  const sigIndex = layerIndex(s, st.layer);
  const outer = general
    ? [...st.signals, ...st.grounds].some((g) => { const i = layerIndex(s, g.layer); return i >= 0 && isOuter(s, i); })
    : sigIndex >= 0 && isOuter(s, sigIndex);
  // The general editor's selection (a row, or a conductor tapped in the drawing); gone when its feature is.
  const selNow: GenSel | null = general && sel && (sel.startsWith('sig') ? st.signals : st.grounds)[Number(sel.slice(4))] ? sel : null;
  const hasMask = s.layers.some((l) => l.kind === 'mask');
  const etch = etchOf(s, st.layer);
  const pair = isPair(st), coplanar = isCoplanar(st), broadside = st.kind === 'broadside';
  const info = KIND_INFO[st.kind];

  const planeSelect = (which: 'below' | 'above', label: string) => (
    <label className={css.ctl}>
      {label}
      <select className={base.select} data-trace-plane={which} value={st[which]} onChange={(e) => { const v = e.target.value; setTrace((t) => ({ ...t, [which]: v })); }}>
        <option value="">none</option>
        {coppers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );

  return (
    <section id="trace" className={base.section} aria-labelledby="trace-h">
      <h2 id="trace-h" className={base.h2}>Trace</h2>
      <p className={base.lede}>
        The line's cross-section on this stackup. Pick a kind of structure or one of your KiCad net classes, then type
        the widths and gaps; the drawing is what the solver sees, and the results follow every change.
      </p>

      <div className={css.tools}>
        <label className={css.ctl}>
          Structure
          <select
            className={base.select}
            data-trace-kind
            value={st.kind}
            onChange={(e) => { const k = e.target.value as TraceKind; setTrace((t, cur) => (k === 'general' ? toGeneral(cur.stackup, t) : withKind(t, cur.stackup, k))); }}
          >
            {kinds.map((k) => <option key={k.kind} value={k.kind} disabled={!k.ok}>{k.name}{k.ok ? '' : ' (needs more copper layers)'}</option>)}
            <option value="general">General arrangement (traces and grounds placed freely)</option>
          </select>
        </label>
        {st.kind !== 'general' && (
          <button type="button" className={base.button} data-trace-to-general onClick={() => setTrace((t, cur) => toGeneral(cur.stackup, t))} title="The same structure as traces and grounds you can add to, remove and move">
            Edit as general
          </button>
        )}
        <div className={css.classes} data-class-structures>
          {fromClasses.length > 0 ? (
            <>
              <span className={css.classesLabel}>Net classes of {kicad.project.file}</span>
              <div className={css.classButtons}>
                {fromClasses.flatMap(({ c, single, pair: p }) => [
                  single && (
                    <button key={`${c.name}:single`} type="button" className={base.button} data-class-structure={`${c.name}:single`} aria-pressed={sameStructure(st, single)} onClick={() => commit((cur) => { const x = structuresFromClass(cur.stackup, c).single; return x ? { ...cur, trace: x } : cur; })}>
                      {c.name} <span className={css.classDim}>trace {lenText(single.w.v, unit, digits)}</span>
                    </button>
                  ),
                  p && (
                    <button key={`${c.name}:pair`} type="button" className={base.button} data-class-structure={`${c.name}:pair`} aria-pressed={sameStructure(st, p)} onClick={() => commit((cur) => { const x = structuresFromClass(cur.stackup, c).pair; return x ? { ...cur, trace: x } : cur; })}>
                      {c.name} <span className={css.classDim}>pair {lenText(p.w.v, unit, digits)} / {lenText(p.s.v, unit, digits)}</span>
                    </button>
                  ),
                ].filter(Boolean))}
              </div>
            </>
          ) : (
            <span className={css.classesLabel}>Open a KiCad project (.kicad_pro) in the Stackup section to make its net classes into structures here.</span>
          )}
        </div>
      </div>

      <div className={css.layout}>
        <div className={css.drawArea}>
          <TraceDrawing s={s} st={st} sec={sec} reason={reason} unit={unit} digits={digits} widen={widen} edit={edit} sel={selNow} onSelect={setSel} fields={fieldSet} fieldEnv={fieldEnv} />
          <div className={stk.figTools}>
            <button type="button" className={base.button} aria-pressed={widen} data-trace-widen onClick={() => setWiden((w) => !w)}>Widen thin layers</button>
          </div>
          <FieldControls f={fieldSet} n={sec ? sec.signals : 1} set={setFieldSet} />
        </div>

        <div className={css.controls} data-trace-controls data-kind={st.kind}>
          <div className={css.selects}>
            {!general && (
              <label className={css.ctl}>
                {broadside ? 'Signal layer 1' : 'Signal layer'}
                <select className={base.select} data-trace-layer value={st.layer} onChange={(e) => { const v = e.target.value; setTrace((t, cur) => withSignalLayer(t, cur.stackup, v)); }}>
                  {coppers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {broadside && (
              <label className={css.ctl}>
                Signal layer 2
                <select className={base.select} data-trace-layer2 value={st.layer2} onChange={(e) => { const v = e.target.value; setTrace((t) => ({ ...t, layer2: v })); }}>
                  {coppers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {planeSelect('above', 'Plane above')}
            {planeSelect('below', 'Plane below')}
          </div>
          {st.kind !== 'general' ? (
            <div className={stk.fields}>
              <ValField name="trace.w" label={pair ? 'Width (each)' : 'Width'} x={st.w} unit={unit} digits={digits} onChange={onVal('w')} />
              {pair && <ValField name="trace.s" label={broadside ? 'Offset across' : 'Gap'} x={st.s} unit={unit} digits={digits} zero={broadside} onChange={onVal('s')} />}
              {coplanar && <ValField name="trace.g" label="Gap to ground" x={st.g} unit={unit} digits={digits} onChange={onVal('g')} />}
              {coplanar && <ValField name="trace.gw" label="Ground width" x={st.gw} unit={unit} digits={digits} nullable placeholder="to the edge" onChange={onVal('gw')} />}
            </div>
          ) : (
            <GeneralEditor s={s} st={st} unit={unit} digits={digits} coppers={coppers} sel={selNow} onSelect={setSel} setTrace={setTrace} />
          )}
          {outer && hasMask && (
            <label className={css.check}>
              <input type="checkbox" checked={st.masked} data-trace-masked onChange={(e) => { const m = e.target.checked; setTrace((t) => ({ ...t, masked: m })); }} />
              Solder mask over the trace
            </label>
          )}
          <p className={css.small} data-etch={etch ? etch.side : 0}>
            {etch && etch.side > 0
              ? <>Trapezoid from the stackup's etch: the top is {lenText(2 * etch.side, unit, digits)} narrower than the base{etch.src ? <> ({sourceTag(etch.src.src).text})</> : null}. Widths are at the base.</>
              : <>No etch in the stackup: the copper is a rectangle.</>}
            {pair && !broadside && ' The gap is edge to edge at the base.'}
            {coplanar && ' Grounds are on the signal layer, connected to the planes.'}
          </p>
          {info && issues.length > 0 && (
            <div className={base.notice} data-trace-issues>
              <h3 className={base.h3}>About this structure</h3>
              <IssueList issues={issues} />
            </div>
          )}
        </div>

        <div className={css.resultArea} data-solves={solves} data-quick={quickShown} data-dragging={dragging}>
          <TraceResults r={res} state={state} stale={stale} quick={quickShown} message={message} where={where} unit={unit} />
          <div className={tcss.toolsArea} data-tools>
            <div className={tcss.toolsHead}>
              <h3 className={base.h3}>Target · Sweep · Tolerance</h3>
              <div className={tcss.toolTabs} role="group" aria-label="Tools">
                {TOOLS.map(([k, label]) => (
                  <button key={k} type="button" className={base.button} aria-pressed={tool === k} data-tool-tab={k} onClick={() => { setToolsOpened(true); setTool((t) => (t === k ? null : k)); }}>{label}</button>
                ))}
              </div>
            </div>
            {toolsOpened && (
              <Suspense fallback={<p className={css.small}>Loading the tools…</p>}>
                <TraceTools tool={tool} setup={setup} invalid={sec ? '' : reason} commit={commit} unit={unit} digits={digits} client={getClient} />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
