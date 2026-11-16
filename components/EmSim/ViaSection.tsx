// The Via section (step M3.1a; a chunk of its own, loaded by EmSimTool when the section comes near): a single via or
// a differential pair typed in a form (lib/emsim/via.ts ViaStructure: barrel and signal layers, drill and plating, the
// pitch, per copper layer its pad and whether it is a plane with an antipad of a shape, return vias as rows,
// backdrill, feeds), drawn to scale from the side and from the top (ViaDrawing, geometry in viaGeom.ts), and solved by
// the via model in the static worker on channel `via` (the newest edit wins; the old values stay dimmed until the new
// ones arrive). Edits go through viaEdit.ts and `commit`, one undo step each (typing in one field is one step); a via
// that makes no sense is kept as typed and viaIssues says why, as the Trace section does. The via is in the setup's
// plain form, so the link carries it.

import React, { useEffect, useMemo, useState } from 'react';

import type { Setup } from '../../lib/emsim/setup';
import { layerIndex } from '../../lib/emsim/stackup';
import type { Val } from '../../lib/emsim/stackup';
import { VIA_PRESETS, presetVia, viaIssues } from '../../lib/emsim/via';
import type { ViaPreset, ViaStructure } from '../../lib/emsim/via';
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
import ViaDrawing from './ViaDrawing';
import ViaResults from './ViaResults';
import {
  addFeed, addReturn, coppersOf, removeFeed, removeReturn, withAllAntipads, withAntipad, withBackdrill, withBarrel, withFeed, withPad, withPair,
  withPlane, withReturn, withSignal, withTraceLayer,
} from './viaEdit';
import { Why, Whys } from './Why';

/** The job's options: no frequency sweep and no TDR until M3.2 draws them (the cascade's elements stay in the result). */
export const VIA_OPT: ViaModelOptions = { tdr: false, nf: 2 };

const PRESET_TEXT: Record<ViaPreset, string> = { single: 'Single via 0.6/0.3', pair: 'LVDS pair 0.5/0.22' };

interface Props { setup: Setup; commit: Commit; unit: LengthUnit; digits: number }

export default function ViaSection({ setup, commit, unit, digits }: Props) {
  const s = setup.stackup, v = setup.via, t = setup.trace;
  const cu = useMemo(() => s.layers.filter((l) => l.kind === 'copper'), [s]);
  const issues = useMemo(() => (v ? viaIssues(s, v) : []), [s, v]);
  const errors = issues.filter((x) => x.level === 'error');
  const [refused, setRefused] = useState('');

  // ---- the solve: the newest via wins ----
  const [res, setRes] = useState<ViaModelResult | null>(null);
  const [state, setState] = useState<RunState>('running');
  const [stale, setStale] = useState(true);
  const [message, setMessage] = useState('');
  const [rt, setRt] = useState(0);
  const [solves, setSolves] = useState(0);
  useEffect(() => {
    if (!v || errors.length) {
      setState('invalid');
      setMessage(!v ? 'The stackup has too few copper layers for a via.' : `Not solved: ${errors[0].message}`);
      setStale(false);
      void getClient().then((c) => c.cancel('via'));
      return;
    }
    let on = true;
    setStale(true);
    setState('running');
    const t0 = performance.now();
    const job: StaticJob = { kind: 'via', setup: { stackup: s, trace: t, via: v }, opt: VIA_OPT };
    getClient()
      .then((c) => c.run<ViaModelResult>('via', job))
      .then((rr) => {
        if (!on || !rr) return;
        setRt(performance.now() - t0);
        setRes(rr.result);
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
  }, [s, v, t]);

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
          <ViaDrawing s={s} v={v} traceW={traceW} unit={unit} digits={digits} />
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

        <div className={css.resultArea} data-via-solves={solves}>
          <ViaResults r={res} s={s} v={v} state={state} stale={stale} message={message} ms={rt} unit={unit} digits={digits} />
        </div>
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
