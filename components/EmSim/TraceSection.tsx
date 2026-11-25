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
import { EqLayout, useEqRequest } from './eqLinks';
import type { ToolName } from './TraceTools';
import type { RunState } from './TraceResults';
import ValField from './ValField';
import { feedTheory } from './theoryFeed';
import { feedExport } from './exportFeed';
import { KINDS, coppersOf, etchOf, isCoplanar, isPair, withKind, withSignalLayer } from './trace';
import type { GenSel } from './trace';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import { kindName } from './emText';
import { Why, Whys } from './Why';

// One client for the page, made when the first solve is asked for.
let clientP: Promise<StaticClient> | null = null;
export function getClient(): Promise<StaticClient> {
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
// M4.3a: the equation panel (KaTeX and the registry), loaded when a result number is first opened.
// @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
const EqPanel = lazy(() => import('./EqPanel'));
const TOOLS: ToolName[] = ['target', 'sweep', 'tolerance', 'calc'];

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
  const { t, locale } = useI18n();
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
    if (stackErr) return { sec: null, reason: t('em.tr.stackErr', { msg: stackErr.message }) };
    const bad = issues.find((i) => i.level === 'error');
    if (bad) return { sec: null, reason: bad.message };
    try {
      return { sec: section(s, st), reason: '' };
    } catch (e) {
      return { sec: null, reason: t('em.tr.drawErr', { msg: e instanceof Error ? e.message : String(e) }) };
    }
  }, [s, st, issues, stackErr, t]);

  // ---- the solve: the newest setup wins; the old result stays, marked stale, until the new one arrives ----
  const [res, setRes] = useState<SolveResult | null>(null);
  const eqReq = useEqRequest();
  const eqHere = eqReq?.section === 'trace' ? eqReq : null;
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
        setMessage(t('em.tr.solveErr', { msg: e instanceof Error ? e.message : String(e) }));
        setStale(false);
      });
    return () => { on = false; };
    // The via does not change the trace's solve.
  }, [s, st, sec, quick]);
  useEffect(() => { if (dragging) lastArrival.current = performance.now(); }, [dragging]);
  // M2.4c: the theory's live numbers: a full result for the shown setup, not during a drag (its frames stay cheap).
  useEffect(() => {
    if (res && res.ok && !stale && !quickShown && !dragging) feedTheory({ result: { setup: { stackup: s, trace: st, via: setup.via }, r: res } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [res, stale, quickShown, dragging]);
  // M8.2a: the line results for the Export section's data, only while they are the shown setup's full solve.
  useEffect(() => { feedExport({ trace: res && res.ok && !stale && !quickShown && !dragging ? res : null }); }, [res, stale, quickShown, dragging]);
  useEffect(() => () => feedExport({ trace: null }), []);
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
        <option value="">{t('em.tr.none')}</option>
        {coppers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );

  return (
    <section id="trace" className={base.section} aria-labelledby="trace-h">
      <h2 id="trace-h" className={base.h2}>{t('em.tr.title')}</h2>
      <p className={base.lede}>{t('em.tr.lede')}</p>

      <div className={css.tools}>
        <label className={css.ctl}>
          {t('em.tr.structure')}
          <select
            className={base.select}
            data-trace-kind
            value={st.kind}
            onChange={(e) => { const k = e.target.value as TraceKind; setTrace((t, cur) => (k === 'general' ? toGeneral(cur.stackup, t) : withKind(t, cur.stackup, k))); }}
          >
            {kinds.map((k) => <option key={k.kind} value={k.kind} disabled={!k.ok}>{kindName(k.kind, locale)}{k.ok ? '' : t('em.tr.needsCopper')}</option>)}
            <option value="general">{t('em.tr.generalOpt')}</option>
          </select>
        </label>
        {st.kind !== 'general' && (
          <button type="button" className={base.button} data-trace-to-general onClick={() => setTrace((t, cur) => toGeneral(cur.stackup, t))} title={t('em.tr.editAsGenTitle')}>
            {t('em.tr.editAsGen')}
          </button>
        )}
        <div className={css.classes} data-class-structures>
          {fromClasses.length > 0 ? (
            <>
              <span className={css.classesLabel}>{t('em.tr.netClassesOf', { file: kicad.project!.file })}</span>
              <div className={css.classButtons}>
                {fromClasses.flatMap(({ c, single, pair: p }) => [
                  single && (
                    <button key={`${c.name}:single`} type="button" className={base.button} data-class-structure={`${c.name}:single`} aria-pressed={sameStructure(st, single)} onClick={() => commit((cur) => { const x = structuresFromClass(cur.stackup, c).single; return x ? { ...cur, trace: x } : cur; })}>
                      {c.name} <span className={css.classDim}>{t('em.tr.ncTrace', { val: lenText(single.w.v, unit, digits) })}</span>
                    </button>
                  ),
                  p && (
                    <button key={`${c.name}:pair`} type="button" className={base.button} data-class-structure={`${c.name}:pair`} aria-pressed={sameStructure(st, p)} onClick={() => commit((cur) => { const x = structuresFromClass(cur.stackup, c).pair; return x ? { ...cur, trace: x } : cur; })}>
                      {c.name} <span className={css.classDim}>{t('em.tr.ncPair', { w: lenText(p.w.v, unit, digits), s: lenText(p.s.v, unit, digits) })}</span>
                    </button>
                  ),
                ].filter(Boolean))}
              </div>
            </>
          ) : (
            <span className={css.classesLabel}>{t('em.tr.ncEmpty')}</span>
          )}
        </div>
      </div>
      <Whys ks={st.kind !== 'general' ? 'structure to-general class-structure' : 'structure class-structure'} />

      <div className={css.layout}>
        <div className={css.drawArea}>
          <TraceDrawing s={s} st={st} sec={sec} reason={reason} unit={unit} digits={digits} widen={widen} edit={edit} sel={selNow} onSelect={setSel} fields={fieldSet} fieldEnv={fieldEnv} />
          <div className={stk.figTools}>
            <button type="button" className={base.button} aria-pressed={widen} data-trace-widen onClick={() => setWiden((w) => !w)}>{t('em.stk.widen')}</button>
          </div>
          <Whys ks="trace-view handles trace-reset trace-widen" />
          <FieldControls f={fieldSet} n={sec ? sec.signals : 1} set={setFieldSet} />
        </div>

        <div className={css.controls} data-trace-controls data-kind={st.kind}>
          <div className={css.selects}>
            {!general && (
              <label className={css.ctl}>
                {broadside ? t('em.tr.sigLayer1') : t('em.tr.sigLayer')}
                <select className={base.select} data-trace-layer value={st.layer} onChange={(e) => { const v = e.target.value; setTrace((t, cur) => withSignalLayer(t, cur.stackup, v)); }}>
                  {coppers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {broadside && (
              <label className={css.ctl}>
                {t('em.tr.sigLayer2')}
                <select className={base.select} data-trace-layer2 value={st.layer2} onChange={(e) => { const v = e.target.value; setTrace((t) => ({ ...t, layer2: v })); }}>
                  {coppers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {planeSelect('above', t('em.tr.planeAbove'))}
            {planeSelect('below', t('em.tr.planeBelow'))}
          </div>
          <Whys ks={`${general ? '' : 'layer '}${broadside ? 'layer2 ' : ''}plane`} />
          {st.kind !== 'general' ? (
            <div className={stk.fields}>
              <ValField name="trace.w" label={pair ? t('em.tr.widthEach') : t('em.tr.width')} x={st.w} unit={unit} digits={digits} onChange={onVal('w')} />
              {pair && <ValField name="trace.s" label={broadside ? t('em.tr.offset') : t('em.tr.gap')} x={st.s} unit={unit} digits={digits} zero={broadside} onChange={onVal('s')} />}
              {coplanar && <ValField name="trace.g" label={t('em.tr.gapToGnd')} x={st.g} unit={unit} digits={digits} onChange={onVal('g')} />}
              {coplanar && <ValField name="trace.gw" label={t('em.tr.gndWidth')} x={st.gw} unit={unit} digits={digits} nullable placeholder={t('em.tr.toEdge')} onChange={onVal('gw')} />}
            </div>
          ) : null}
          {st.kind !== 'general' ? (
            <Whys ks={`width${pair ? (broadside ? ' offset' : ' gap') : ''}${coplanar ? ' ground-gap ground-width' : ''}`} />
          ) : (
            <GeneralEditor s={s} st={st} unit={unit} digits={digits} coppers={coppers} sel={selNow} onSelect={setSel} setTrace={setTrace} />
          )}
          {outer && hasMask && (
            <label className={css.check}>
              <input type="checkbox" checked={st.masked} data-trace-masked onChange={(e) => { const m = e.target.checked; setTrace((t) => ({ ...t, masked: m })); }} />
              {t('em.tr.masked')}
            </label>
          )}
          {outer && hasMask && <Why k="masked" bare />}
          <p className={css.small} data-etch={etch ? etch.side : 0}>
            {etch && etch.side > 0
              ? t('em.tr.etchTrap', { val: lenText(2 * etch.side, unit, digits), src: etch.src ? ` (${sourceTag(etch.src.src, locale).text})` : '' })
              : t('em.tr.etchRect')}
            {pair && !broadside && t('em.tr.gapNote')}
            {coplanar && t('em.tr.cpwNote')}
          </p>
          {info && issues.length > 0 && (
            <div className={base.notice} data-trace-issues>
              <h3 className={base.h3}>{t('em.tr.about')}</h3>
              <Why k="structure-issues" bare />
              <IssueList issues={issues} />
            </div>
          )}
        </div>

        <div className={css.resultArea} data-solves={solves} data-quick={quickShown} data-dragging={dragging}>
          <EqLayout open={eqHere !== null}>
            <TraceResults r={res} state={state} stale={stale} quick={quickShown} message={message} where={where} unit={unit} />
            {eqHere && (
              <Suspense fallback={<p className={css.small}>{t('em.tr.loadingEq')}</p>}>
                <EqPanel req={eqHere} trace={res && res.ok ? res : null} stale={stale} digits={digits} />
              </Suspense>
            )}
          </EqLayout>
          <div className={tcss.toolsArea} data-tools>
            <div className={tcss.toolsHead}>
              <h3 className={base.h3}>{t('em.tr.toolsHeading')}</h3>
              <div className={tcss.toolTabs} role="group" aria-label={t('em.tr.toolsAria')}>
                {TOOLS.map((k) => (
                  <button key={k} type="button" className={base.button} aria-pressed={tool === k} data-tool-tab={k} onClick={() => { setToolsOpened(true); setTool((cur) => (cur === k ? null : k)); }}>{t(`em.tr.tab.${k}` as TranslationKey)}</button>
                ))}
              </div>
            </div>
            <Why k="tools" bare />
            {toolsOpened && (
              <Suspense fallback={<p className={css.small}>{t('em.tr.loadingTools')}</p>}>
                <TraceTools tool={tool} setup={setup} invalid={sec ? '' : reason} commit={commit} unit={unit} digits={digits} client={getClient} />
              </Suspense>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
