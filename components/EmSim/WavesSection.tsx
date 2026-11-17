// The Waves section (step M7.1a; its own chunk, loaded like the Via section when it comes near or by #waves): a
// full-wave (FDTD) run of the current via with its feeds, or of the current trace as a section of a chosen length,
// through FdtdClient (lib/emsim/fdtdClient.ts: the worker, WebGPU or the CPU). Before the run the estimate
// (lib/emsim/fullwave.ts preview: backend and why, cells, memory, steps × excitations, time from the rate this device
// measured on an earlier run, else the table; §11.4's warnings and refusals), during it a bar with the step, the time
// left and the energy, Cancel (the worker frees the GPU buffers), and a new Run cancels the running one. The result:
// TDR/TDT at the chosen rise time and |S11|, |S21| (Sdd11, Sdd21 for a pair) beside the quasi-static model's (the via
// model on the 'waves' channel of the static worker, or the lossless line of the 2D solver for a trace), the run's
// notes and what the engine was checked against; it stays, marked stale, until the next run. The snapshot frames
// the worker sends are kept for the player of M7.1b (framesRef, data-waves-frames).

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { FdtdClient } from '../../lib/emsim/fdtdClient';
import type { BackendInfo, FdtdInfo, FdtdProgress, FdtdResult } from '../../lib/emsim/fdtd/job';
import type { Frame } from '../../lib/emsim/fdtd/snapshots';
import type { Verdict, Offer } from '../../lib/emsim/fdtd/estimate';
import type { Note } from '../../lib/emsim/fdtd/model';
import { measured, preview, probeDevice, wavesJob, wavesView, WAVES_LENGTH, WAVES_Z0 } from '../../lib/emsim/fullwave';
import type { DeviceInfo, Preview, WaveKind, WavesSpec, WavesView } from '../../lib/emsim/fullwave';
import { DB_FLOOR, readAt, timeScale } from '../../lib/emsim/plot';
import type { Setup } from '../../lib/emsim/setup';
import { readPlain } from '../../lib/emsim/units';
import type { ViaModelResult } from '../../lib/emsim/viamodel';
import type { StaticJob } from '../../lib/emsim/jobs';
import base from '../../styles/EmSim.module.css';
import stk from '../../styles/EmSimStackup.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import wcss from '../../styles/EmSimWaves.module.css';
import Plot from './Plot';
import type { PlotSeries } from './Plot';
import { getClient } from './TraceSection';
import { NumInput } from './ValField';
import { takeWavesAsk, WAVES_EVENT } from './wavesSuggest';
import type { WavesKindAsk } from './wavesSuggest';
import { Why } from './Why';

const TRS = [15e-12, 35e-12, 100e-12];
const NO_CURSOR = 'Move over a plot, tap it or use the arrow keys on it for a reading.';
/** fullwave-verify.md §3: the frozen limits of the FDTD against openEMS (M6.4c). */
const CHECKED = 'The full-wave engine was checked against openEMS on six vias and an LVDS pair line: TDR within 2.5 Ω, |S| within 0.10 to 10 GHz and 0.15 to 20 GHz, a via’s impedance and delay within 12 %, a stub’s notch within 8 %.';

type Phase = 'idle' | 'running' | 'done' | 'refused' | 'error' | 'cancelled';
interface Done { res: FdtdResult; view: WavesView; setup: Setup; spec: WavesSpec; elapsed: number; estimate: number; backend: string; where: string }

const sText = (s: number) => (s < 60 ? `${s < 10 ? s.toFixed(1) : s.toFixed(0)} s` : s < 3600 ? `${(s / 60).toFixed(1)} min` : `${(s / 3600).toFixed(1)} h`);
const big = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n));
const sameSpec = (a: WavesSpec, b: WavesSpec) => a.kind === b.kind && a.tr === b.tr && (a.kind === 'via' || a.length === b.length) && a.backend === b.backend;

interface Props { setup: Setup }

export default function WavesSection({ setup }: Props) {
  const [kind, setKind] = useState<WaveKind>(() => takeWavesAsk() ?? 'via');
  const [tr, setTr] = useState(35e-12);
  const [length, setLength] = useState(WAVES_LENGTH);
  const [lenReason, setLenReason] = useState('');
  const [backend, setBackend] = useState<'auto' | 'js'>('auto');
  const spec = useMemo<WavesSpec>(() => ({ kind, tr, length, backend }), [kind, tr, length, backend]);
  const [dev, setDev] = useState<DeviceInfo | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [calib, setCalib] = useState(0); // a run measured this device: the estimate again
  const [phase, setPhase] = useState<Phase>('idle');
  const [bk, setBk] = useState<BackendInfo | null>(null);
  const [info, setInfo] = useState<FdtdInfo | null>(null);
  const [prog, setProg] = useState<FdtdProgress | null>(null);
  const [refusal, setRefusal] = useState<{ verdicts: Verdict[]; offer: Offer | null; notes: Note[] } | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const framesRef = useRef<Frame[]>([]);
  const [frames, setFrames] = useState(0);
  const client = useMemo(() => (typeof window === 'undefined' ? null : new FdtdClient()), []);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => () => client?.stop(), [client]);
  useEffect(() => { let on = true; void probeDevice().then((d) => { if (on) setDev(d); }); return () => { on = false; }; }, []);
  // The Via section's link: the via, and the section in view.
  useEffect(() => {
    const on = (e: Event) => { const k = (e as CustomEvent<WavesKindAsk>).detail; if (k) setKind(k); takeWavesAsk(); };
    window.addEventListener(WAVES_EVENT, on);
    return () => window.removeEventListener(WAVES_EVENT, on);
  }, []);
  useEffect(() => {
    if (!dev || (kind === 'trace' && lenReason)) return;
    let on = true;
    const id = window.setTimeout(() => { if (on) setPv(preview(setup, spec, dev)); }, 30);
    return () => { on = false; clearTimeout(id); };
  }, [setup, spec, dev, calib, kind, lenReason]);

  const run = async () => {
    if (!client || !dev || !pv) return;
    const s = setup, sp = spec, p = pv;
    framesRef.current = []; setFrames(0);
    setPhase('running'); setBk(null); setInfo(null); setProg(null); setRefusal(null); setError('');
    const t0 = performance.now();
    let est = NaN, backendName = '';
    let out;
    try {
      out = await client.run(wavesJob(s, sp, p, dev), {
        backend: (b) => {
          setBk(b); backendName = b.backend;
          if (b.restart === 0) { framesRef.current = []; setFrames(0); } // the first excitation's frames start again
        },
        started: (i) => {
          setInfo(i); est = i.seconds * i.runs;
          if (i.calibrated) { measured[i.backend] = { rate: i.rate, cells: i.cells }; setCalib((n) => n + 1); }
        },
        progress: (q) => {
          setProg(q);
          if (q.frames.length) { framesRef.current.push(...q.frames); setFrames(framesRef.current.length); }
        },
      });
    } catch (e) {
      setPhase('error'); setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (out === null) { setPhase((ph) => (ph === 'running' ? 'cancelled' : ph)); return; }
    if (out.kind === 'refused') { setRefusal(out); setPhase('refused'); return; }
    const elapsed = (performance.now() - t0) / 1000;
    let q: ViaModelResult | null = null;
    if (sp.kind === 'via') {
      const job: StaticJob = { kind: 'via', setup: s, opt: { tr: sp.tr, z0: WAVES_Z0, nf: 401 } };
      const rr = await getClient().then((c) => c.run<ViaModelResult>('waves', job)).catch(() => null);
      q = rr ? rr.result : null;
    }
    const view = wavesView(out.result, p, s, sp, q);
    if (typeof window !== 'undefined') (window as unknown as { __emsimWaves?: unknown }).__emsimWaves = { result: out.result, view, spec: sp, preview: p };
    setDone({ res: out.result, view, setup: s, spec: sp, elapsed, estimate: est, backend: backendName, where: out.where });
    setPhase('done');
  };
  const cancel = () => { client?.cancel(); setPhase('cancelled'); };

  const stale = !!done && (done.setup !== setup || !sameSpec(done.spec, spec));
  const runs = pv ? pv.ports.length : 0;
  const total = pv?.est ? pv.est.seconds * runs : NaN;
  const refuse = pv ? pv.verdicts.filter((v) => v.level === 'refuse') : [];
  const frac = prog ? Math.min(1, (prog.run + prog.step / Math.max(1, prog.steps)) / Math.max(1, prog.runs)) : 0;

  return (
    <div ref={box} className={wcss.waves} data-waves data-waves-phase={phase} data-waves-frames={frames} data-waves-held={info ? `${info.held.buffers}/${info.held.bytes}` : ''}>
      <p className={base.lede}>
        A full-wave run steps Maxwell’s equations in time on a 3D grid (FDTD), on your graphics card with WebGPU or on
        the CPU. It shows what the quasi-static model leaves out: the plane cavity, the feeds over antipads, far return vias.
      </p>
      <div className={css.tools}>
        <div className={base.seg} role="group" aria-label="What to run" data-waves-kind={kind}>
          <button type="button" aria-pressed={kind === 'via'} onClick={() => setKind('via')} data-waves-kind-set="via">The via</button>
          <button type="button" aria-pressed={kind === 'trace'} onClick={() => setKind('trace')} data-waves-kind-set="trace">The trace</button>
        </div>
        {kind === 'trace' && (
          <div className={stk.field} data-field="waves.length">
            <label className={stk.fieldLabel} htmlFor="waves-length">Length between the planes</label>
            <div className={stk.valueRow}>
              <NumInput id="waves-length" className={base.input} shown={String(length)} aria-invalid={lenReason ? true : undefined} data-waves-length
                parse={(x) => readPlain(x, { min: 0.5, max: 1000, what: 'The length' })} onReason={setLenReason} onValue={setLength} />
              <span className={stk.unit}>mm</span>
            </div>
            {lenReason && <p className={stk.reason} role="alert">{lenReason}</p>}
          </div>
        )}
        <div className={vcss.presets} role="group" aria-label="Rise time" data-waves-tr={Math.round(tr * 1e12)}>
          {TRS.map((t) => <button key={t} type="button" className={base.button} aria-pressed={t === tr} onClick={() => setTr(t)} data-waves-tr-set={Math.round(t * 1e12)}>{Math.round(t * 1e12)} ps</button>)}
        </div>
        <div className={base.seg} role="group" aria-label="Where it runs" data-waves-backend-choice={backend}>
          <button type="button" aria-pressed={backend === 'auto'} onClick={() => setBackend('auto')} data-waves-backend-set="auto">GPU if it can</button>
          <button type="button" aria-pressed={backend === 'js'} onClick={() => setBackend('js')} data-waves-backend-set="js">CPU</button>
        </div>
      </div>
      <div className={vcss.whyRow}>
        <Why k="waves-kind" />
        {kind === 'trace' && <Why k="waves-length" />}
        <Why k="waves-tr" />
        <Why k="waves-backend" />
      </div>

      <div className={wcss.estimate} data-waves-estimate={pv ? (pv.est ? 'ready' : 'none') : 'pending'} data-backend={pv?.backend} data-cells={pv?.est?.cells}
        data-steps={pv?.est?.steps} data-mem={pv?.est?.memory.total} data-runs={runs} data-seconds={total} data-rate-from={pv?.rateFrom} data-refused={refuse.length > 0}>
        {!pv ? <p className={css.small}>Working out the estimate…</p> : (
          <>
            <p className={css.small} data-waves-backend={pv.backend}>{pv.backend === 'webgpu' ? `Runs on the GPU: ${pv.reason}` : `Runs on the CPU. ${pv.reason}`}</p>
            {pv.est && (
              <p className={css.small}>
                {big(pv.est.cells)} cells, {(pv.est.memory.total / 1048576).toFixed(0)} MiB, up to {pv.est.steps.toLocaleString('en-GB')} steps for each of {runs} excitation{runs === 1 ? '' : 's'}:
                about <b>{sText(total)}</b> {pv.rateFrom === 'measured' ? 'on this device (measured by the last run).' : '(from a typical rate; the run measures this device first).'}
              </p>
            )}
            {pv.verdicts.length > 0 && (
              <ul className={base.issues} data-waves-verdicts={pv.verdicts.length}>
                {pv.verdicts.map((v, i) => <li key={i} data-waves-verdict={v.code}><span className={base.level} data-level={v.level === 'refuse' ? 'error' : 'warn'}>{v.level === 'refuse' ? 'too big' : 'note'}</span>{v.message}</li>)}
              </ul>
            )}
            {pv.offer && <p className={css.small} data-waves-offer={pv.offer.s}>A mesh {pv.offer.s.toFixed(2)}× coarser would take about {sText(pv.offer.seconds * runs)}{pv.offer.limitedBy ? ` (as coarse as the ${pv.offer.limitedBy === 'barrel' ? 'barrel' : 'thinnest dielectric'} allows)` : ''}.</p>}
            {pv.notes.filter((n) => n.level === 'error' || n.code === 'feed-over-return').map((n, i) => <p key={i} className={n.level === 'error' ? stk.reason : css.small} data-waves-note={n.code}>{n.message}</p>)}
          </>
        )}
      </div>
      <Why k="waves-estimate" bare />

      <div className={wcss.runRow}>
        <button type="button" className={`${base.button} ${wcss.run}`} onClick={() => void run()} disabled={!pv || !pv.est || refuse.length > 0 || !!(kind === 'trace' && lenReason)} data-waves-run>
          {phase === 'running' || done ? 'Run again' : 'Run'}
        </button>
        {phase === 'running' && <button type="button" className={base.button} onClick={cancel} data-waves-cancel>Cancel</button>}
      </div>
      <div className={wcss.progress} data-waves-progress={phase === 'running' ? frac : phase}>
        {phase === 'running' ? (
          <>
            <progress max={1} value={frac} aria-label="Run progress" />
            <p className={css.small} aria-live="polite">
              {bk ? (bk.backend === 'webgpu' ? 'On the GPU. ' : `On the CPU: ${bk.reason} `) : 'Preparing the run… '}
              {prog ? `Excitation ${prog.run + 1} of ${prog.runs}, step ${prog.step.toLocaleString('en-GB')} of ${prog.steps.toLocaleString('en-GB')}${Number.isFinite(prog.eta) ? `, about ${sText(prog.eta / 1000)} left` : ''}, energy ${Number.isFinite(prog.energyDb) ? `${prog.energyDb.toFixed(0)} dB` : '–'}.` : info ? `Started: ${big(info.cells)} cells, about ${sText(info.seconds * info.runs)}.` : 'Measuring this device…'}
            </p>
          </>
        ) : (
          <p className={css.small}>
            {phase === 'cancelled' ? 'Cancelled.' : phase === 'error' ? `The run failed: ${error}` : phase === 'refused' ? 'The run was refused:' : done ? `Done in ${sText(done.elapsed)} on the ${done.backend === 'webgpu' ? 'GPU' : 'CPU'}${Number.isFinite(done.estimate) ? ` (estimated ${sText(done.estimate)})` : ''}.` : 'Not run yet.'}
          </p>
        )}
        {phase === 'refused' && refusal && (
          <ul className={base.issues} data-waves-refused={refusal.verdicts.length}>
            {refusal.verdicts.map((v, i) => <li key={i} data-waves-verdict={v.code}><span className={base.level} data-level="error">{v.level}</span>{v.message}</li>)}
            {refusal.notes.filter((n) => n.level === 'error').map((n, i) => <li key={`n${i}`}><span className={base.level} data-level="error">error</span>{n.message}</li>)}
          </ul>
        )}
      </div>
      <Why k="waves-run" bare />
      <Why k="waves-progress" bare />

      {done && <WavesResults d={done} stale={stale} />}
      <p className={css.small} data-waves-checked>{CHECKED}</p>
      <Why k="waves-checked" bare />
    </div>
  );
}

const NOTE_LEVEL: Record<string, string> = { error: 'error', warning: 'warn', info: 'note' };

function WavesResults({ d, stale }: { d: Done; stale: boolean }) {
  const v = d.view, T = v.fw.tdr, Q = v.qs;
  const [tCur, setTCur] = useState(NaN);
  const [fCur, setFCur] = useState(NaN);
  const ts = useMemo(() => Array.from(T.t), [T]);
  const tDomain = useMemo(() => [ts[0], ts[ts.length - 1]] as [number, number], [ts]);
  const tScale = useMemo(() => timeScale({ min: tDomain[0], max: tDomain[1] }), [tDomain]);
  const qName = d.spec.kind === 'via' ? 'Via model' : 'Line (2D solver)';
  const two = (fw: ArrayLike<number>, qs: ArrayLike<number> | null | undefined): PlotSeries[] => [{ name: 'Full-wave', ys: Array.from(fw) }, ...(qs ? [{ name: qName, ys: Array.from(qs) }] : [])];
  const zS = useMemo(() => two(T.z, Q?.tdr?.z), [T, Q]); // eslint-disable-line react-hooks/exhaustive-deps
  const tdtS = useMemo(() => (T.tdt ? two(T.tdt, Q?.tdr?.tdt) : null), [T, Q]); // eslint-disable-line react-hooks/exhaustive-deps
  const s11 = useMemo(() => two(v.fw.db[0], Q?.db[0]), [v, Q]); // eslint-disable-line react-hooks/exhaustive-deps
  const s21 = useMemo(() => two(v.fw.db[1], Q?.db[1]), [v, Q]); // eslint-disable-line react-hooks/exhaustive-deps
  const fDomain = useMemo(() => [0, v.f[v.f.length - 1]] as [number, number], [v]);
  const tAt = (t: number) => `${Number((t * tScale.k).toFixed(tScale.unit === 'ps' ? 1 : 4))} ${tScale.unit}`;
  const read = (xs: number[], ss: PlotSeries[], x: number, fmt: (y: number) => string) => ss.map((s) => { const y = readAt(xs, s.ys, x); return `${s.name} ${Number.isFinite(y) ? fmt(y) : '–'}`; }).join(', ');
  const zName = v.pair ? 'Zdiff' : 'Z';
  const zRead = (t: number) => (Number.isFinite(t) ? `${tAt(t)}: ${zName} ${read(ts, zS, t, (y) => `${y.toFixed(2)} Ω`)}` : NO_CURSOR);
  const tdtRead = (t: number) => (Number.isFinite(t) && tdtS ? `${tAt(t)}: ${read(ts, tdtS, t, (y) => y.toFixed(4))}` : NO_CURSOR);
  const sRead = (q: 0 | 1, ss: PlotSeries[]) => (f: number) => (Number.isFinite(f) ? `${f.toFixed(2)} GHz: ${v.names[q]} ${read(v.f, ss, f, (y) => (y <= DB_FLOOR ? `below ${DB_FLOOR} dB` : `${y.toFixed(2)} dB`))}`.replace(/-/g, '−') : NO_CURSOR);
  const lines = useMemo(() => [{ y: v.zRef, name: `Port ${v.zRef.toFixed(0)} Ω` }], [v]);
  const notSettled = d.res.status.some((s) => s === 'done'), unstable = d.res.status.some((s) => s === 'unstable');
  const eeffOff = d.res.eeff.filter((e) => e.flag);
  // the run's warnings once each (the mesh's notes repeat per feed edge; its info lines say what the notes above say)
  const notes = d.res.notes.filter((n, i, a) => n.level === 'warning' && a.findIndex((m) => m.message === n.message) === i);
  const shifted = v.shift.some((x) => Math.abs(x) > 1e-6);
  return (
    <div className={vcss.plots} data-waves-results data-stale={stale} data-pair={v.pair} data-elapsed={d.elapsed} data-run-s={d.res.ms / 1000} data-estimate={d.estimate} data-backend={d.backend} data-where={d.where}>
      {stale && <p className={css.small} data-waves-stale>The setup changed since this run; the result is for the earlier one. Run again for this one.</p>}
      <h4 className={vcss.h4}>TDR and TDT</h4>
      <Why k="waves-plots" bare />
      <Plot name="waves-tdr" title={`Impedance${v.pair ? ' (differential)' : ''} (Ω)`} xs={ts} series={zS} xDomain={tDomain} xScale={tScale}
        xLabel={`Time (${tScale.unit}), there and back from the port`} cursor={tCur} onCursor={setTCur} readout={zRead} lines={lines} stale={stale} />
      {tdtS && <Plot name="waves-tdt" title={`Step through${v.pair ? ' (differential)' : ''}`} xs={ts} series={tdtS} xDomain={tDomain} xScale={tScale}
        xLabel={`Time (${tScale.unit}) from the step at the port`} cursor={tCur} onCursor={setTCur} readout={tdtRead} stale={stale} />}
      <h4 className={vcss.h4}>S-parameters</h4>
      <Plot name="waves-s11" title={`|${v.names[0]}| (dB)`} xs={v.f} series={s11} xDomain={fDomain} xLabel="Frequency (GHz)" cursor={fCur} onCursor={setFCur} readout={sRead(0, s11)} stale={stale} />
      <Plot name="waves-s21" title={`|${v.names[1]}| (dB)`} xs={v.f} series={s21} xDomain={fDomain} xLabel="Frequency (GHz)" cursor={fCur} onCursor={setFCur} readout={sRead(1, s21)} stale={stale} />
      <p className={css.small} data-waves-about>
        A {Math.round(d.spec.tr * 1e12)} ps edge, ports at {WAVES_Z0} Ω{v.pair ? ' (100 Ω differential)' : ''}, the run’s S to {v.fS.toFixed(1)} GHz.
        {shifted && ` The run’s ports were moved along their feeds to the model’s feed ends (${v.shift.map((x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`).join(', ')} mm).`}
        {Q && Number.isFinite(Q.fValid) && Q.fValid < v.fS && ` The via model holds to ${Q.fValid.toFixed(1)} GHz.`}
        {!Q && (d.spec.kind === 'via' ? ' The via model has no result for this via.' : ' No quasi-static curve for coupled traces yet.')}
        {v.pair && ' Every port of the pair is driven in turn and Sdd is formed from that 4-port; its feeds are de-embedded with one wave speed each, so the coupled feeds’ terms are a little rough.'}
      </p>
      <div data-waves-notes={notes.length + eeffOff.length + (notSettled ? 1 : 0) + (unstable ? 1 : 0)}>
        {notSettled || unstable || eeffOff.length || notes.length ? (
          <ul className={base.issues}>
            {unstable && <li data-waves-run-note="unstable"><span className={base.level} data-level="error">error</span>The run went unstable; its result is not to be trusted.</li>}
            {notSettled && <li data-waves-run-note="not-settled"><span className={base.level} data-level="warn">note</span>The fields had not died down when the run reached its last step; the lowest frequencies are less sure.</li>}
            {eeffOff.map((e, i) => <li key={`e${i}`} data-waves-run-note="eeff"><span className={base.level} data-level="warn">note</span>A feed’s εeff from the run is {(e.diff * 100).toFixed(1)} % off the 2D solver’s ({e.eeff.toFixed(3)} against {e.eeff2d.toFixed(3)}).</li>)}
            {notes.map((n, i) => <li key={`n${i}`} data-waves-run-note={n.code}><span className={base.level} data-level={NOTE_LEVEL[n.level] ?? 'note'}>{n.level === 'warning' ? 'note' : n.level}</span>{n.message}</li>)}
          </ul>
        ) : <p className={css.small}>No notes: the run settled and its feeds agree with the 2D solver.</p>}
      </div>
      <Why k="waves-notes" bare />
    </div>
  );
}
