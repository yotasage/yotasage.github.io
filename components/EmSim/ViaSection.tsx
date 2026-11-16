// The Via section (step M3.1a; a chunk of its own, loaded by EmSimTool when the section comes near): a single via or
// a differential pair typed in a form (lib/emsim/via.ts ViaStructure: barrel and signal layers, drill and plating, the
// pitch, per copper layer its pad and whether it is a plane with an antipad of a shape, return vias as rows,
// backdrill, feeds), drawn to scale from the side and from the top (ViaDrawing, geometry in lib/emsim/viaGeom.ts), and solved by
// the via model in the static worker on channel `via` (the newest edit wins; the old values stay dimmed until the new
// ones arrive). Edits go through viaEdit.ts and `commit`, one undo step each (typing in one field is one step); a via
// that makes no sense is kept as typed and viaIssues says why, as the Trace section does. The via is in the setup's
// plain form, so the link carries it.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { Setup } from '../../lib/emsim/setup';
import { layerIndex } from '../../lib/emsim/stackup';
import type { Val } from '../../lib/emsim/stackup';
import { VIA_PRESETS, presetVia, viaIssues } from '../../lib/emsim/via';
import type { ViaPreset, ViaStructure } from '../../lib/emsim/via';
import { VIA_TR, VIA_Z0 } from '../../lib/emsim/viamodel';
import type { ViaModelOptions, ViaModelResult } from '../../lib/emsim/viamodel';
import type { StaticJob } from '../../lib/emsim/jobs';
import { readPlain } from '../../lib/emsim/units';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import stk from '../../styles/EmSimStackup.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import type { Commit } from './StackupSection';
import { IssueList } from './StackupSection';
import { getClient } from './TraceSection';
import type { RunState } from './TraceResults';
import ValField, { NumInput } from './ValField';
import ViaDrawing, { LiveVia, useLive } from './ViaDrawing';
import type { ViaEdit } from './ViaDrawing';
import { addReturnAt, applyViaHandle } from './viaHandles';
import ViaPlots from './ViaPlots';
import ViaResults from './ViaResults';
import ViaTarget from './ViaTarget';
import {
  addFeed, addReturn, coppersOf, removeFeed, removeReturn, withAllAntipads, withAntipad, withBackdrill, withBarrel, withFeed, withPad, withPair,
  withPlane, withReturn, withSignal, withTraceLayer,
} from './viaEdit';
import { Why, Whys } from './Why';

/**
 * The job's options (M3.2a): the TDR at the rise time and the sweep of 401 points for the plots, every single-ended
 * port at z0. M3.1b: while a drag cannot keep up, the same model without its error estimates, its TDR and its sweep
 * (as the Trace section's fast path); the plots keep the last full solve meanwhile.
 */
export const viaOpt = (tr: number, z0: number, quick = false): ViaModelOptions => (quick ? { tr, z0, tdr: false, nf: 2, estimate: false } : { tr, z0, nf: 401 });
const QUICK_ABOVE_MS = 30;
const STARVED_MS = 100;
const PAUSE_MS = 200;

const PRESET_TEXT: Record<ViaPreset, string> = { single: 'Single via 0.6/0.3', pair: 'LVDS pair 0.5/0.22' };

interface Props { setup: Setup; commit: Commit; unit: LengthUnit; digits: number }

export default function ViaSection({ setup, commit, unit, digits }: Props) {
  const s = setup.stackup, v = setup.via, t = setup.trace;
  const cu = useMemo(() => s.layers.filter((l) => l.kind === 'copper'), [s]);
  const issues = useMemo(() => (v ? viaIssues(s, v) : []), [s, v]);
  const [refused, setRefused] = useState('');

  // ---- handle drags (M3.1b): a live via only the drawings and the results see, committed once at the end ----
  const store = useMemo(() => new LiveVia(), []);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const edit = useMemo<ViaEdit>(() => {
    const on = <T,>(f: (cur: Setup, via: ViaStructure) => { via: ViaStructure } | { reason: string }, then: (cur: Setup, via: ViaStructure) => T): T | string => {
      const cur = setupRef.current;
      if (!cur.via) return 'There is no via.';
      const r = f(cur, cur.via);
      return 'reason' in r ? r.reason : then(cur, r.via);
    };
    const why = (x: unknown) => (typeof x === 'string' ? x : null);
    return {
      begin: () => store.set(null, true),
      move: (key, a, b) => why(on((cur, via) => applyViaHandle(cur.stackup, via, key, a, b), (_c, n) => { store.set(n, true); return true; })),
      end: (cancelled) => {
        const n = store.snap.via;
        if (n && !cancelled) commit((cur) => ({ ...cur, via: n }));
        store.set(null, false);
      },
      key: (key, a, b) => why(on((cur, via) => applyViaHandle(cur.stackup, via, key, a, b), (cur, n) => { commit({ ...cur, via: n }, `handle.via.${key}`); return true; })),
      add: (x, y) => why(on((cur, via) => (Number.isFinite(x) ? addReturnAt(cur.stackup, via, x, y) : { via: addReturn(via) }), (cur, n) => { commit({ ...cur, via: n }); return true; })),
      remove: (k) => commit((cur) => (cur.via ? { ...cur, via: removeReturn(cur.via, k) } : cur)),
    };
  }, [commit, store]);

  // ---- edits ----
  const setVia = (f: (via: ViaStructure, cur: Setup) => ViaStructure, group = '') => {
    setRefused('');
    commit((cur) => (cur.via ? { ...cur, via: f(cur.via, cur) } : cur), group);
  };
  const onVal = (key: string, f: (via: ViaStructure, x: Val) => ViaStructure, allowNull = false) => (x: Val | null, part: 'v' | 'tol') => {
    if (!x && !allowNull) return;
    setVia((via) => f(via, x), `via.${key}.${part}`);
  };
  const preset = (k: ViaPreset) => commit((cur) => { const p = presetVia(k, cur.stackup); return p ? { ...cur, via: p } : cur; });

  if (!v) {
    return <p className={base.lede} data-via-none>A via needs at least two copper layers; pick a stackup with more.</p>;
  }
  const iS = layerIndex(s, v.start), iE = layerIndex(s, v.end);
  const pair = !!v.pitch;
  const ap0 = v.antipads[0]?.d ?? null;
  const allSame = ap0 && v.antipads.every((a) => a.d.v === ap0.v) ? ap0 : null;
  const sigs = [v.entry, v.exit];
  const traceW = t.kind === 'general' ? (t.signals?.[0]?.w?.v ?? 0.15) : t.w?.v ?? 0.15;
  const layerSelect = (label: string, attr: string, value: string, on: (id: string) => void, filter: (i: number) => boolean = () => true) => (
    <label className={css.ctl}>
      {label}
      <select className={base.select} {...{ [attr]: '' }} value={value} onChange={(e) => on(e.target.value)}>
        {cu.map((l) => <option key={l.id} value={l.id} disabled={!filter(layerIndex(s, l.id))}>{l.name || l.id}</option>)}
      </select>
    </label>
  );

  return (
    <>
      <p className={base.lede}>
        A via or a differential pair of vias through this stackup. Type its sizes, planes and return vias; the
        drawings are to scale and the results follow every change.
      </p>
      <div className={css.tools}>
        <div className={base.seg} role="group" aria-label="Single via or pair" data-via-kind={pair ? 'pair' : 'single'}>
          <button type="button" aria-pressed={!pair} onClick={() => setVia((via) => withPair(via, false))}>Single</button>
          <button type="button" aria-pressed={pair} onClick={() => setVia((via) => withPair(via, true))}>Pair</button>
        </div>
        {VIA_PRESETS.map((k) => (
          <button key={k} type="button" className={base.button} data-via-preset={k} onClick={() => preset(k)}>{PRESET_TEXT[k]}</button>
        ))}
        <button type="button" className={base.button} data-via-use-trace onClick={() => {
          const r = withTraceLayer(s, v, t);
          if ('reason' in r) setRefused(r.reason); else setVia(() => r.via);
        }}>Entry on the trace’s layer</button>
      </div>
      <Whys ks="via-kind via-preset via-use-trace" />

      <div className={css.layout}>
        <div className={css.drawArea}>
          <ViaDrawing s={s} v={v} traceW={traceW} unit={unit} digits={digits} edit={edit} store={store} />
        </div>

        <div className={css.controls} data-via-form>
          <div className={css.selects}>
            {layerSelect('Barrel from', 'data-via-start', v.start, (id) => setVia((via, cur) => withBarrel(cur.stackup, via, id, via.end)))}
            {layerSelect('Barrel to', 'data-via-end', v.end, (id) => setVia((via, cur) => withBarrel(cur.stackup, via, via.start, id)))}
            {layerSelect('Entry layer', 'data-via-entry', v.entry, (id) => setVia((via, cur) => withSignal(cur.stackup, via, 'entry', id)), (i) => i >= iS && i <= iE)}
            {layerSelect('Exit layer', 'data-via-exit', v.exit, (id) => setVia((via, cur) => withSignal(cur.stackup, via, 'exit', id)), (i) => i >= iS && i <= iE)}
          </div>
          <Whys ks="via-barrel via-signal" />
          <div className={stk.fields}>
            <ValField name="via.drill" label="Drill" x={v.drill} unit={unit} digits={digits} onChange={onVal('drill', (via, x) => ({ ...via, drill: x }))} />
            <ValField name="via.plating" label="Plating" x={v.plating} unit={unit} digits={digits} zero onChange={onVal('plating', (via, x) => ({ ...via, plating: x }))} />
            {pair && <ValField name="via.pitch" label="Pitch" x={v.pitch} unit={unit} digits={digits} onChange={onVal('pitch', (via, x) => ({ ...via, pitch: x }))} />}
          </div>
          <Whys ks={`via-drill via-plating${pair ? ' via-pitch' : ''}`} />

          <h3 className={base.h3}>Layers</h3>
          {v.antipads.length > 0 && (
            <div className={stk.fields}>
              <ValField name="via.antipad-all" label="All antipads" x={allSame} unit={unit} digits={digits} nullable placeholder="differ" onChange={onVal('antipad-all', (via, x) => withAllAntipads(via, x))} />
            </div>
          )}
          <ul className={vcss.rows} data-via-layers>
            {cu.map((l) => {
              const i = layerIndex(s, l.id);
              const inB = i >= iS && i <= iE;
              const pad = v.pads.find((p) => p.layer === l.id);
              const plane = v.planes.includes(l.id);
              const ap = v.antipads.find((a) => a.layer === l.id);
              const sig = l.id === v.entry ? 'in' : l.id === v.exit ? 'out' : '';
              return (
                <li key={l.id} className={vcss.row} data-via-layer={l.id} data-in-barrel={inB}>
                  <div className={vcss.rowHead}>
                    <b>{l.name || l.id}</b>
                    {sig && <span className={vcss.tag}>{sig === 'in' ? 'entry' : 'exit'}</span>}
                    {!inB && <span className={vcss.dim}>no barrel here</span>}
                    <label className={vcss.check}>
                      <input type="checkbox" checked={plane} disabled={sigs.includes(l.id)} data-via-plane={l.id} onChange={(e) => { const on = e.target.checked; setVia((via, cur) => withPlane(cur.stackup, via, l.id, on)); }} />
                      plane
                    </label>
                  </div>
                  {inB && (
                    <div className={stk.fields}>
                      <ValField name={`via.pad.${l.id}`} label="Pad" x={pad?.d ?? null} unit={unit} digits={digits} nullable placeholder="removed" onChange={onVal(`pad.${l.id}`, (via, x) => withPad(via, l.id, x), true)} />
                      {plane && ap && (
                        <>
                          <label className={css.ctl}>
                            Antipad
                            <select className={base.select} data-via-shape={l.id} value={ap.shape} onChange={(e) => { const shape = e.target.value as typeof ap.shape; setVia((via) => withAntipad(via, l.id, { shape })); }}>
                              <option value="round">round</option>
                              <option value="oblong" disabled={!pair}>oblong (pair)</option>
                              <option value="joined" disabled={!pair}>joined by a bridge (pair)</option>
                            </select>
                          </label>
                          <ValField name={`via.antipad.${l.id}`} label="Antipad Ø" x={ap.d} unit={unit} digits={digits} onChange={onVal(`antipad.${l.id}`, (via, x) => withAntipad(via, l.id, { d: x }))} />
                          {ap.shape === 'joined' && <ValField name={`via.bridge.${l.id}`} label="Bridge" x={ap.bridge} unit={unit} digits={digits} onChange={onVal(`bridge.${l.id}`, (via, x) => withAntipad(via, l.id, { bridge: x }))} />}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <Whys ks={`via-layer-table via-pad via-plane${v.antipads.length ? ' via-antipad via-shape via-antipad-all' : ''}`} />

          <h3 className={base.h3}>Return vias</h3>
          <ul className={vcss.rows} data-via-returns={v.returns.length}>
            {v.returns.map((r, k) => (
              <li key={k} className={vcss.row} data-via-ret={k + 1}>
                <div className={vcss.rowHead}>
                  <b>{k + 1}</b>
                  {v.planes.map((p) => (
                    <label key={p} className={vcss.check}>
                      <input type="checkbox" checked={r.planes.includes(p)} data-via-ret-plane={`${k + 1}:${p}`} onChange={(e) => { const on = e.target.checked; setVia((via) => withReturn(via, k, { planes: on ? v.planes.filter((q) => q === p || via.returns[k].planes.includes(q)) : via.returns[k].planes.filter((q) => q !== p) })); }} />
                      {p}
                    </label>
                  ))}
                  <button type="button" className={`${base.button} ${vcss.remove}`} data-via-ret-remove={k + 1} aria-label={`Remove return via ${k + 1}`} onClick={() => setVia((via) => removeReturn(via, k))}>Remove</button>
                </div>
                <div className={stk.fields}>
                  <ValField name={`via.ret.${k + 1}.x`} label="x" x={r.x} unit={unit} digits={digits} negative zero onChange={onVal(`ret.${k}.x`, (via, x) => withReturn(via, k, { x }))} />
                  <ValField name={`via.ret.${k + 1}.y`} label="y" x={r.y} unit={unit} digits={digits} negative zero onChange={onVal(`ret.${k}.y`, (via, x) => withReturn(via, k, { y: x }))} />
                  <ValField name={`via.ret.${k + 1}.drill`} label="Drill" x={r.drill} unit={unit} digits={digits} onChange={onVal(`ret.${k}.drill`, (via, x) => withReturn(via, k, { drill: x }))} />
                  <ValField name={`via.ret.${k + 1}.pad`} label="Pad" x={r.pad} unit={unit} digits={digits} nullable placeholder="none" onChange={onVal(`ret.${k}.pad`, (via, x) => withReturn(via, k, { pad: x }), true)} />
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className={base.button} data-via-ret-add onClick={() => setVia((via) => addReturn(via))}>Add return via</button>
          <Whys ks={`via-returns via-return-add${v.returns.length ? ' via-return-remove via-return-planes' : ''}`} />

          <h3 className={base.h3}>Backdrill and feeds</h3>
          <label className={vcss.check}>
            <input type="checkbox" checked={!!v.backdrill} data-via-backdrill-on onChange={(e) => {
              const r = withBackdrill(s, v, e.target.checked);
              if ('reason' in r) setRefused(r.reason); else setVia(() => r.via);
            }} />
            Backdrill
          </label>
          {v.backdrill && (
            <div className={stk.fields}>
              <label className={css.ctl}>
                From
                <select className={base.select} data-via-backdrill-side value={v.backdrill.side} onChange={(e) => { const side = e.target.value as 'top' | 'bottom'; setVia((via) => ({ ...via, backdrill: { ...via.backdrill, side } })); }}>
                  <option value="top">top</option>
                  <option value="bottom">bottom</option>
                </select>
              </label>
              <ValField name="via.bd.depth" label="Depth" x={v.backdrill.depth} unit={unit} digits={digits} onChange={onVal('bd.depth', (via, x) => ({ ...via, backdrill: { ...via.backdrill, depth: x } }))} />
              <ValField name="via.bd.d" label="Diameter" x={v.backdrill.d} unit={unit} digits={digits} onChange={onVal('bd.d', (via, x) => ({ ...via, backdrill: { ...via.backdrill, d: x } }))} />
            </div>
          )}
          {refused && <p className={css.refused} role="alert" data-via-refused>{refused}</p>}
          <Why k="via-backdrill" bare />
          <ul className={vcss.rows} data-via-feeds={v.feeds.length}>
            {v.feeds.map((f, k) => (
              <li key={k} className={vcss.row} data-via-feed-row={k + 1}>
                <div className={stk.fields}>
                  <label className={css.ctl}>
                    Feed on
                    <select className={base.select} data-via-feed-layer={k + 1} value={f.layer} onChange={(e) => { const layer = e.target.value; setVia((via) => withFeed(via, k, { layer })); }}>
                      {sigs.map((id) => <option key={id} value={id}>{id}{id === v.entry ? ' (entry)' : ' (exit)'}</option>)}
                    </select>
                  </label>
                  <ValField name={`via.feed.${k + 1}.length`} label="Length" x={f.length} unit={unit} digits={digits} onChange={onVal(`feed.${k}.length`, (via, x) => withFeed(via, k, { length: x }))} />
                  <AngleField k={k} angle={f.angle} onAngle={(a) => setVia((via) => withFeed(via, k, { angle: a }), `via.feed.${k}.angle`)} />
                  <button type="button" className={`${base.button} ${vcss.remove}`} data-via-feed-remove={k + 1} aria-label={`Remove feed ${k + 1}`} onClick={() => setVia((via) => removeFeed(via, k))}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
          {sigs.filter((id) => !v.feeds.some((f) => f.layer === id)).map((id) => (
            <button key={id} type="button" className={base.button} data-via-feed-add={id} onClick={() => setVia((via) => addFeed(via, id))}>Add feed on {id}</button>
          ))}
          <Why k="via-feeds" bare />
          {issues.length > 0 && (
            <div className={base.notice} data-via-issues={issues.length}>
              <h3 className={base.h3}>About this via</h3>
              <Why k="via-issues" bare />
              <IssueList issues={issues} />
            </div>
          )}
        </div>

        <ViaSolve s={s} t={t} v={v} store={store} unit={unit} digits={digits} />
        <ViaTarget s={s} v={v} commit={commit} unit={unit} digits={digits} />
      </div>
    </>
  );
}

function AngleField({ k, angle, onAngle }: { k: number; angle: number; onAngle: (a: number) => void }) {
  const [reason, setReason] = useState('');
  return (
    <div className={stk.field} data-field={`via.feed.${k + 1}.angle`}>
      <label className={stk.fieldLabel} htmlFor={`via-feed-angle-${k}`}>Direction</label>
      <div className={stk.valueRow}>
        <NumInput id={`via-feed-angle-${k}`} className={base.input} shown={String(angle)} aria-invalid={reason ? true : undefined} parse={(x) => readPlain(x, { min: -360, max: 360, what: 'The direction' })} onReason={setReason} onValue={onAngle} />
        <span className={stk.unit}>°</span>
      </div>
      {reason && <p className={stk.reason} role="alert">{reason}</p>}
    </div>
  );
}

// The via's solve and results (M3.1b: a component of its own, so a drag's live via re-renders only this and the
// drawings). Every edit starts the job on channel `via` (the newest wins). While dragging, when the last full solve's
// round trip took over QUICK_ABOVE_MS or no result came for STARVED_MS, the drag solves without error estimates and
// the panel says so; the full solve follows a pause of PAUSE_MS and the drag's end.
function ViaSolve({ s, t, v: v0, store, unit, digits }: { s: Setup['stackup']; t: Setup['trace']; v: ViaStructure; store: LiveVia; unit: LengthUnit; digits: number }) {
  const live = useLive(store);
  const v = live.via ?? v0;
  const dragging = live.dragging;
  const errors = useMemo(() => viaIssues(s, v).filter((x) => x.level === 'error'), [s, v]);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    setPaused(false);
    const id = window.setTimeout(() => setPaused(true), PAUSE_MS);
    return () => clearTimeout(id);
  }, [live.via, dragging]);
  const [res, setRes] = useState<{ r: ViaModelResult; v: ViaStructure } | null>(null);
  const [state, setState] = useState<RunState>('running');
  const [stale, setStale] = useState(true);
  const [message, setMessage] = useState('');
  const [rt, setRt] = useState(0);
  const [solves, setSolves] = useState(0);
  const [quickShown, setQuickShown] = useState(false);
  // M3.2a: the plots' settings and the last full solve they draw (during a drag only one that follows a pause).
  const [tr, setTr] = useState(VIA_TR);
  const [z0, setZ0] = useState(VIA_Z0);
  const [plotRes, setPlotRes] = useState<{ r: ViaModelResult; v: ViaStructure } | null>(null);
  const holdPlots = useRef(false);
  holdPlots.current = dragging && !paused;
  const fullMs = useRef(0);
  const lastArrival = useRef(0);
  const starved = useRef(false);
  if (!dragging) starved.current = false;
  const quick = dragging && !paused && (fullMs.current > QUICK_ABOVE_MS || starved.current);
  useEffect(() => {
    if (errors.length) {
      setState('invalid');
      setMessage(`Not solved: ${errors[0].message}`);
      setStale(false);
      void getClient().then((c) => c.cancel('via'));
      return;
    }
    let on = true;
    setStale(true);
    setState('running');
    const t0 = performance.now();
    if (dragging && !quick && lastArrival.current && t0 - lastArrival.current > STARVED_MS) starved.current = true;
    const job: StaticJob = { kind: 'via', setup: { stackup: s, trace: t, via: v }, opt: viaOpt(tr, z0, quick) };
    getClient()
      .then((c) => c.run<ViaModelResult>('via', job))
      .then((rr) => {
        if (!on || !rr) return;
        const t1 = performance.now();
        if (!quick && !rr.cached) fullMs.current = t1 - t0;
        lastArrival.current = t1;
        setRt(t1 - t0);
        setRes({ r: rr.result, v });
        if (!quick && rr.result.ok && rr.result.tdr && !holdPlots.current) setPlotRes({ r: rr.result, v });
        setQuickShown(quick);
        setSolves((n) => n + 1);
        setState('done');
        setStale(false);
      }, (e) => {
        if (!on) return;
        setState('error');
        setMessage(`The via model failed: ${e instanceof Error ? e.message : String(e)}`);
        setStale(false);
      });
    return () => { on = false; };
    // errors follow s and v.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, v, t, quick, tr, z0]);
  useEffect(() => { if (dragging) lastArrival.current = performance.now(); }, [dragging]);
  return (
    <div className={css.resultArea} data-via-solves={solves} data-quick={quickShown} data-dragging={dragging}>
      {/* The result with the via it was solved for: a drag frame without a new result does not draw the panel again. */}
      <ViaResults r={res ? res.r : null} s={s} v={res ? res.v : v} state={state} stale={stale} message={message} ms={rt} unit={unit} digits={digits} quick={quickShown} />
      {plotRes && (
        <ViaPlots r={plotRes.r} trace={t} tr={tr} onTr={setTr} z0={z0} onZ0={setZ0}
          stale={plotRes.v !== v || plotRes.r.tr !== tr || plotRes.r.z0 !== z0 || (stale && !quick) || state === 'invalid'} />
      )}
    </div>
  );
}
