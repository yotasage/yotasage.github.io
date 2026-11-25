// The Waves section (step M7.1a; its own chunk, loaded like the Via section when it comes near or by #waves): a
// full-wave (FDTD) run of the current via with its feeds, or of the current trace as a section of a chosen length,
// through FdtdClient (lib/emsim/fdtdClient.ts: the worker, WebGPU or the CPU). Before the run the estimate
// (lib/emsim/fullwave.ts preview: backend and why, cells, memory, steps × excitations, time from the rate this device
// measured on an earlier run, else the table; §11.4's warnings and refusals), during it a bar with the step, the time
// left and the energy, Cancel (the worker frees the GPU buffers), and a new Run cancels the running one. The result:
// TDR/TDT at the chosen rise time and |S11|, |S21| (Sdd11, Sdd21 for a pair) beside the quasi-static model's (the via
// model on the 'waves' channel of the static worker, or the lossless line of the 2D solver for a trace), the run's
// notes and what the engine was checked against; it stays, marked stale, until the next run. The snapshot frames
// the worker sends (framesRef while running, data-waves-frames the count held) go with the result to the player
// (WavesPlayer.tsx, M7.1b) in a FrameStore, emptied on a new run, a cancel or when the setup makes the result stale.
// For a pair the frames of entry A's and entry B's excitations are kept (pairRef: `started` says which runs, a
// progress message's frames are of its run), so the player can show the differential and common drive (M7.2a).

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
import type { LengthUnit } from '../../lib/emsim/units';
import type { ViaModelResult } from '../../lib/emsim/viamodel';
import type { StaticJob } from '../../lib/emsim/jobs';
import base from '../../styles/EmSim.module.css';
import stk from '../../styles/EmSimStackup.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import wcss from '../../styles/EmSimWaves.module.css';
import Calm, { lineOf } from './Calm';
import Plot from './Plot';
import type { PlotSeries } from './Plot';
import { getClient } from './TraceSection';
import { NumInput } from './ValField';
import { takeWavesAsk, WAVES_EVENT } from './wavesSuggest';
import type { WavesKindAsk } from './wavesSuggest';
import { feedTheory } from './theoryFeed';
import { Why } from './Why';
import { useI18n } from '../../lib/ui/i18n';
import type { TFunc } from '../../lib/ui/i18n';
import WavesPlayer from './WavesPlayer';
import { freeFrames, heldFrames } from './WavesPlayer';
import type { FrameStore } from './WavesPlayer';

const TRS = [15e-12, 35e-12, 100e-12];

type Phase = 'idle' | 'running' | 'done' | 'refused' | 'error' | 'cancelled';
interface Done { res: FdtdResult; view: WavesView; setup: Setup; spec: WavesSpec; pv: Preview; elapsed: number; estimate: number; backend: string; where: string; store: FrameStore | null }

const sText = (s: number) => (s < 60 ? `${s < 10 ? s.toFixed(1) : s.toFixed(0)} s` : s < 3600 ? `${(s / 60).toFixed(1)} min` : `${(s / 3600).toFixed(1)} h`);
/** M9.1b: why a run is on the CPU when the visitor did not ask for it (no WebGPU, no adapter, a software adapter), in
 * the visitor's words; null when the GPU is there or the CPU was chosen. */
function cpuWhy(dev: DeviceInfo | null, backend: 'auto' | 'js', tr: TFunc): { code: string; long: string; short: string } | null {
  if (!dev || dev.gpu.ok || backend === 'js') return null;
  const r = (dev.gpu as { reason: string }).reason;
  if (/no WebGPU/.test(r)) return { code: 'none', short: tr('em.wav.cpu.noneShort'), long: tr('em.wav.cpu.noneLong') };
  if (/no GPU adapter/.test(r)) return { code: 'noadapter', short: tr('em.wav.cpu.noAdapterShort'), long: tr('em.wav.cpu.noAdapterLong') };
  return { code: 'software', short: tr('em.wav.cpu.softShort'), long: tr('em.wav.cpu.softLong') };
}

const big = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)} k` : String(n));
const sameSpec = (a: WavesSpec, b: WavesSpec) => a.kind === b.kind && a.tr === b.tr && (a.kind === 'via' || a.length === b.length) && a.backend === b.backend;

interface Props { setup: Setup; unit?: LengthUnit }

export default function WavesSection({ setup, unit = 'mm' }: Props) {
  const { t: trFn, locale } = useI18n();
  const [kind, setKind] = useState<WaveKind>(() => takeWavesAsk() ?? 'via');
  const [tr, setTr] = useState(35e-12);
  const [length, setLength] = useState(WAVES_LENGTH);
  const [lenReason, setLenReason] = useState('');
  const [backend, setBackend] = useState<'auto' | 'js'>('auto');
  const spec = useMemo<WavesSpec>(() => ({ kind, tr, length, backend }), [kind, tr, length, backend]);
  const [dev, setDev] = useState<DeviceInfo | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const pvFor = useRef<{ setup: Setup; spec: WavesSpec } | null>(null); // what `pv` was made for (the theory's numbers)
  const [calib, setCalib] = useState(0); // a run measured this device: the estimate again
  const [phase, setPhase] = useState<Phase>('idle');
  const [bk, setBk] = useState<BackendInfo | null>(null);
  const [info, setInfo] = useState<FdtdInfo | null>(null);
  const [prog, setProg] = useState<FdtdProgress | null>(null);
  const [refusal, setRefusal] = useState<{ verdicts: Verdict[]; offer: Offer | null; notes: Note[] } | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Done | null>(null);
  const framesRef = useRef<Frame[]>([]); // entry A's (the first recorded run's)
  const pairRef = useRef<Frame[]>([]); // entry B's for a pair
  const runsRef = useRef<number[]>([0]); // the recorded runs (started info)
  const [frames, setFrames] = useState(0);
  const dropFrames = () => { framesRef.current = []; pairRef.current = []; setFrames(0); };
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
    const id = window.setTimeout(() => { if (on) { pvFor.current = { setup, spec }; setPv(preview(setup, spec, dev)); } }, 30);
    return () => { on = false; clearTimeout(id); };
  }, [setup, spec, dev, calib, kind, lenReason]);

  const run = async () => {
    if (!client || !dev || !pv) return;
    const s = setup, sp = spec, p = pv;
    dropFrames(); runsRef.current = [0];
    if (done?.store) { freeFrames(done.store); setDone((d) => (d && d.store ? { ...d, store: null } : d)); } // the last run's frames go now
    setPhase('running'); setBk(null); setInfo(null); setProg(null); setRefusal(null); setError('');
    const t0 = performance.now();
    let est = NaN, backendName = '';
    let out;
    try {
      out = await client.run(wavesJob(s, sp, p, dev), {
        backend: (b) => {
          setBk(b); backendName = b.backend;
          // a recorded excitation restarted on the CPU: its frames start again
          if (b.restart !== undefined && b.restart === runsRef.current[0]) framesRef.current = [];
          else if (b.restart !== undefined && b.restart === runsRef.current[1]) pairRef.current = [];
          setFrames(framesRef.current.length + pairRef.current.length);
        },
        started: (i) => {
          setInfo(i); est = i.seconds * i.runs; runsRef.current = i.snapRuns.length ? i.snapRuns : [0];
          if (i.calibrated) { measured[i.backend] = { rate: i.rate, cells: i.cells }; setCalib((n) => n + 1); }
        },
        progress: (q) => {
          setProg({ ...q, frames: [] }); // the frames live in framesRef only
          if (q.frames.length) {
            const to = q.run === runsRef.current[0] ? framesRef.current : q.run === runsRef.current[1] ? pairRef.current : null;
            if (to) { for (const f of q.frames) to.push(f); setFrames(framesRef.current.length + pairRef.current.length); }
          }
        },
      });
    } catch (e) {
      setPhase('error'); setError(e instanceof Error ? e.message : String(e));
      return;
    }
    if (out === null) { setPhase((ph) => (ph === 'running' ? 'cancelled' : ph)); return; }
    if (out.kind === 'refused') { dropFrames(); setRefusal(out); setPhase('refused'); return; }
    const elapsed = (performance.now() - t0) / 1000;
    let q: ViaModelResult | null = null;
    if (sp.kind === 'via') {
      const job: StaticJob = { kind: 'via', setup: s, opt: { tr: sp.tr, z0: WAVES_Z0, nf: 401 } };
      const rr = await getClient().then((c) => c.run<ViaModelResult>('waves', job)).catch(() => null);
      q = rr ? rr.result : null;
    }
    const view = wavesView(out.result, p, s, sp, q);
    if (typeof window !== 'undefined') (window as unknown as { __emsimWaves?: unknown }).__emsimWaves = { result: out.result, view, spec: sp, preview: p };
    const store: FrameStore | null = out.result.snap && framesRef.current.length ? { frames: framesRef.current, pair: pairRef.current, track: null } : null;
    framesRef.current = []; pairRef.current = [];
    setFrames(heldFrames(store));
    setDone({ res: out.result, view, setup: s, spec: sp, pv: p, elapsed, estimate: est, backend: backendName, where: out.where, store });
    setPhase('done');
  };
  // M9.1a: Cancel is shown only while a run runs; when it goes (cancelled or the run ended) with the focus on it, the
  // focus goes to Run instead of being lost to the page's body.
  const runBtn = useRef<HTMLButtonElement>(null);
  const onCancel = useRef(false);
  const cancel = () => { client?.cancel(); setPhase('cancelled'); dropFrames(); runBtn.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (phase === 'running' || !onCancel.current) return;
    onCancel.current = false;
    const a = document.activeElement;
    if (!a || a === document.body) runBtn.current?.focus({ preventScroll: true });
  }, [phase]);

  const stale = !!done && (done.setup !== setup || !sameSpec(done.spec, spec));
  // a stale result keeps its plots, but its frames (up to SNAP_BUDGET) go
  useEffect(() => {
    if (!stale || !done?.store) return;
    freeFrames(done.store);
    if (phase !== 'running') setFrames(0);
    setDone({ ...done, store: null });
  }, [stale, done, phase]);
  // M7.2d: the theory's full-wave topic prints this estimate's numbers, and the run's while it is for the same setup
  useEffect(() => {
    const f = pvFor.current;
    if (!pv || !f) return;
    const res = done && done.setup === f.setup && sameSpec(done.spec, f.spec) ? done.res : null;
    feedTheory({ waves: { setup: f.setup, spec: f.spec, pv, res } });
  }, [pv, done]);
  const runs = pv ? pv.ports.length : 0;
  const total = pv?.est ? pv.est.seconds * runs : NaN;
  const why = cpuWhy(dev, backend, trFn);
  const refuse = pv ? pv.verdicts.filter((v) => v.level === 'refuse') : [];
  const frac = prog ? Math.min(1, (prog.run + prog.step / Math.max(1, prog.steps)) / Math.max(1, prog.runs)) : 0;
  const numLoc = locale === 'nb' ? 'nb-NO' : 'en-GB';

  return (
    <div ref={box} className={wcss.waves} data-waves data-waves-phase={phase} data-waves-frames={frames} data-waves-held={info ? `${info.held.buffers}/${info.held.bytes}` : ''}>
      <p className={base.lede}>{trFn('em.wav.lede')}</p>
      <div className={css.tools}>
        <div className={base.seg} role="group" aria-label={trFn('em.wav.whatAria')} data-waves-kind={kind}>
          <button type="button" aria-pressed={kind === 'via'} onClick={() => setKind('via')} data-waves-kind-set="via">{trFn('em.wav.theVia')}</button>
          <button type="button" aria-pressed={kind === 'trace'} onClick={() => setKind('trace')} data-waves-kind-set="trace">{trFn('em.wav.theTrace')}</button>
        </div>
        {kind === 'trace' && (
          <div className={stk.field} data-field="waves.length">
            <label className={stk.fieldLabel} htmlFor="waves-length">{trFn('em.wav.lengthLabel')}</label>
            <div className={stk.valueRow}>
              <NumInput id="waves-length" className={base.input} shown={String(length)} aria-invalid={lenReason ? true : undefined} data-waves-length
                parse={(x) => readPlain(x, { min: 0.5, max: 1000, what: trFn('em.wav.lengthWhat') })} onReason={setLenReason} onValue={setLength} />
              <span className={stk.unit}>mm</span>
            </div>
            {lenReason && <p className={stk.reason} role="alert">{lenReason}</p>}
          </div>
        )}
        <div className={vcss.presets} role="group" aria-label={trFn('em.wav.riseAria')} data-waves-tr={Math.round(tr * 1e12)}>
          {TRS.map((t) => <button key={t} type="button" className={base.button} aria-pressed={t === tr} onClick={() => setTr(t)} data-waves-tr-set={Math.round(t * 1e12)}>{Math.round(t * 1e12)} ps</button>)}
        </div>
        <div className={base.seg} role="group" aria-label={trFn('em.wav.whereAria')} data-waves-backend-choice={backend}>
          <button type="button" aria-pressed={backend === 'auto'} onClick={() => setBackend('auto')} data-waves-backend-set="auto">{trFn('em.wav.gpuIfCan')}</button>
          <button type="button" aria-pressed={backend === 'js'} onClick={() => setBackend('js')} data-waves-backend-set="js">{trFn('em.wav.cpu')}</button>
        </div>
      </div>
      <div className={vcss.whyRow}>
        <Why k="waves-kind" />
        {kind === 'trace' && <Why k="waves-length" />}
        <Why k="waves-tr" />
        <Why k="waves-backend" />
      </div>

      <div className={wcss.estimate} data-waves-estimate={pv ? (pv.est ? 'ready' : 'none') : 'pending'} data-backend={pv?.backend} data-cells={pv?.est?.cells}
        data-steps={pv?.est?.steps} data-mem={pv?.est?.memory.total} data-snap-mem={pv?.snapBytes} data-pair={pv?.pair} data-runs={runs} data-seconds={total} data-rate-from={pv?.rateFrom} data-refused={refuse.length > 0}>
        {!pv ? <p className={css.small}>{trFn('em.wav.estWorking')}</p> : (
          <>
            {why && pv.backend === 'js' ? (
              <p className={css.small} data-waves-backend={pv.backend} data-waves-fallback={why.code}>
                {why.long} {trFn('em.wav.cpuFallbackTail')}{pv.est ? <>{trFn('em.wav.cpuFallbackTime')} <b>{sText(total)}</b></> : ''}.
                {' '}{trFn('em.wav.cpuFallbackHint')}
              </p>
            ) : <p className={css.small} data-waves-backend={pv.backend}>{pv.backend === 'webgpu' ? trFn('em.wav.runsGpu', { reason: pv.reason }) : trFn('em.wav.runsCpu', { reason: pv.reason })}</p>}
            {pv.est && (
              <p className={css.small}>
                {trFn('em.wav.estLine1', {
                  cells: big(pv.est.cells),
                  mem: (pv.est.memory.total / 1048576).toFixed(0),
                  steps: pv.est.steps.toLocaleString(numLoc),
                  runs,
                  exc: runs === 1 ? trFn('em.wav.excOne') : trFn('em.wav.excMany'),
                })}{' '}
                <b>{sText(total)}</b> {pv.rateFrom === 'measured' ? trFn('em.wav.rateMeasured') : trFn('em.wav.rateTypical')}
                {pv.snapBytes > 0 && <> {trFn('em.wav.snapLine', { mem: (pv.snapBytes / 1048576).toFixed(0), pair: pv.pair ? trFn('em.wav.snapPair') : '' })}</>}
              </p>
            )}
            {pv.verdicts.length > 0 && (
              <ul className={base.issues} data-waves-verdicts={pv.verdicts.length}>
                {pv.verdicts.map((v, i) => <li key={i} data-waves-verdict={v.code}><span className={base.level} data-level={v.level === 'refuse' ? 'error' : 'warn'}>{v.level === 'refuse' ? trFn('em.wav.tooBig') : trFn('em.wav.note')}</span>{v.message}</li>)}
              </ul>
            )}
            {pv.offer && <p className={css.small} data-waves-offer={pv.offer.s}>{trFn('em.wav.offer', { s: pv.offer.s.toFixed(2), time: sText(pv.offer.seconds * runs), lim: pv.offer.limitedBy ? trFn('em.wav.offerLim', { what: pv.offer.limitedBy === 'barrel' ? trFn('em.wav.offerBarrel') : trFn('em.wav.offerDiel') }) : '' })}</p>}
            {pv.notes.filter((n) => n.level === 'error' || n.code === 'feed-over-return').map((n, i) => <p key={i} className={n.level === 'error' ? stk.reason : css.small} data-waves-note={n.code}>{n.message}</p>)}
          </>
        )}
      </div>
      <Why k="waves-estimate" bare />

      <div className={wcss.runRow}>
        <button ref={runBtn} type="button" className={`${base.button} ${wcss.run}`} onClick={() => void run()} disabled={!pv || !pv.est || refuse.length > 0 || !!(kind === 'trace' && lenReason)} data-waves-run>
          {phase === 'running' || done ? trFn('em.wav.runAgain') : trFn('em.wav.run')}
        </button>
        {phase === 'running' && <button type="button" className={base.button} onClick={cancel} onFocus={() => { onCancel.current = true; }} onBlur={(e) => { if (e.relatedTarget) onCancel.current = false; }} data-waves-cancel>{trFn('em.wav.cancel')}</button>}
      </div>
      <div className={wcss.progress} data-waves-progress={phase === 'running' ? frac : phase}>
        <Calm name="waves" read={() => (phase === 'running' ? (bk ? trFn('em.wav.calmRunning', { hw: bk.backend === 'webgpu' ? 'GPU' : 'CPU' }) : trFn('em.wav.calmPreparing')) : lineOf(document.querySelector('[data-waves-progress] > p')))} />
        {phase === 'running' ? (
          <>
            <progress max={1} value={frac} aria-label={trFn('em.wav.progressAria')} />
            <p className={css.small}>
              {bk ? (bk.backend === 'webgpu' ? trFn('em.wav.onGpu') : why ? trFn('em.wav.onCpuWhy', { short: why.short }) : trFn('em.wav.onCpuReason', { reason: bk.reason })) : trFn('em.wav.preparing')}
              {prog ? trFn('em.wav.progLine', {
                run: prog.run + 1,
                runs: prog.runs,
                step: prog.step.toLocaleString(numLoc),
                steps: prog.steps.toLocaleString(numLoc),
                eta: Number.isFinite(prog.eta) ? trFn('em.wav.progEta', { time: sText(prog.eta / 1000) }) : '',
                energy: Number.isFinite(prog.energyDb) ? `${prog.energyDb.toFixed(0)} dB` : '–',
              }) : info ? trFn('em.wav.progStarted', { cells: big(info.cells), time: sText(info.seconds * info.runs) }) : trFn('em.wav.measuring')}
            </p>
          </>
        ) : (
          <p className={css.small}>
            {phase === 'cancelled' ? trFn('em.wav.cancelled') : phase === 'error' ? trFn('em.wav.failed', { error }) : phase === 'refused' ? trFn('em.wav.refused') : done ? trFn('em.wav.done', { elapsed: sText(done.elapsed), hw: done.backend === 'webgpu' ? 'GPU' : 'CPU', est: Number.isFinite(done.estimate) ? trFn('em.wav.doneEst', { time: sText(done.estimate) }) : '' }) : trFn('em.wav.notRun')}
          </p>
        )}
        {phase === 'refused' && refusal && (
          <ul className={base.issues} data-waves-refused={refusal.verdicts.length}>
            {refusal.verdicts.map((v, i) => <li key={i} data-waves-verdict={v.code}><span className={base.level} data-level="error">{v.level === 'refuse' ? trFn('em.wav.tooBig') : trFn('em.wav.note')}</span>{v.message}</li>)}
            {refusal.notes.filter((n) => n.level === 'error').map((n, i) => <li key={`n${i}`}><span className={base.level} data-level="error">{trFn('em.wav.error')}</span>{n.message}</li>)}
          </ul>
        )}
      </div>
      <Why k="waves-run" bare />
      <Why k="waves-progress" bare />

      {done && <WavesResults d={done} stale={stale} unit={unit} />}
      <p className={css.small} data-waves-checked>{trFn('em.wav.checked')}</p>
      <Why k="waves-checked" bare />
    </div>
  );
}

const NOTE_LEVEL: Record<string, string> = { error: 'error', warning: 'warn', info: 'note' };

function WavesResults({ d, stale, unit }: { d: Done; stale: boolean; unit: LengthUnit }) {
  const { t: trFn } = useI18n();
  const v = d.view, T = v.fw.tdr, Q = v.qs;
  const [tCur, setTCur] = useState(NaN);
  const [fCur, setFCur] = useState(NaN);
  const ts = useMemo(() => Array.from(T.t), [T]);
  const tDomain = useMemo(() => [ts[0], ts[ts.length - 1]] as [number, number], [ts]);
  const tScale = useMemo(() => timeScale({ min: tDomain[0], max: tDomain[1] }), [tDomain]);
  const qName = d.spec.kind === 'via' ? trFn('em.wav.viaModel') : trFn('em.wav.line2d');
  const fwName = trFn('em.wav.fullWave');
  const noCursor = trFn('em.wav.noCursor');
  const two = (fw: ArrayLike<number>, qs: ArrayLike<number> | null | undefined): PlotSeries[] => [{ name: fwName, ys: Array.from(fw) }, ...(qs ? [{ name: qName, ys: Array.from(qs) }] : [])];
  const zS = useMemo(() => two(T.z, Q?.tdr?.z), [T, Q, fwName, qName]); // eslint-disable-line react-hooks/exhaustive-deps
  const tdtS = useMemo(() => (T.tdt ? two(T.tdt, Q?.tdr?.tdt) : null), [T, Q, fwName, qName]); // eslint-disable-line react-hooks/exhaustive-deps
  const s11 = useMemo(() => two(v.fw.db[0], Q?.db[0]), [v, Q, fwName, qName]); // eslint-disable-line react-hooks/exhaustive-deps
  const s21 = useMemo(() => two(v.fw.db[1], Q?.db[1]), [v, Q, fwName, qName]); // eslint-disable-line react-hooks/exhaustive-deps
  const fDomain = useMemo(() => [0, v.f[v.f.length - 1]] as [number, number], [v]);
  const tAt = (t: number) => `${Number((t * tScale.k).toFixed(tScale.unit === 'ps' ? 1 : 4))} ${tScale.unit}`;
  const read = (xs: number[], ss: PlotSeries[], x: number, fmt: (y: number) => string) => ss.map((s) => { const y = readAt(xs, s.ys, x); return `${s.name} ${Number.isFinite(y) ? fmt(y) : '–'}`; }).join(', ');
  const zName = v.pair ? 'Zdiff' : 'Z';
  const zRead = (t: number) => (Number.isFinite(t) ? `${tAt(t)}: ${zName} ${read(ts, zS, t, (y) => `${y.toFixed(2)} Ω`)}` : noCursor);
  const tdtRead = (t: number) => (Number.isFinite(t) && tdtS ? `${tAt(t)}: ${read(ts, tdtS, t, (y) => y.toFixed(4))}` : noCursor);
  const sRead = (q: 0 | 1, ss: PlotSeries[]) => (f: number) => (Number.isFinite(f) ? `${f.toFixed(2)} GHz: ${v.names[q]} ${read(v.f, ss, f, (y) => (y <= DB_FLOOR ? trFn('em.wav.belowDb', { db: DB_FLOOR }) : `${y.toFixed(2)} dB`))}`.replace(/-/g, '−') : noCursor);
  const lines = useMemo(() => [{ y: v.zRef, name: trFn('em.wav.portRef', { z: v.zRef.toFixed(0) }) }], [v, trFn]);
  const notSettled = d.res.status.some((s) => s === 'done'), unstable = d.res.status.some((s) => s === 'unstable');
  const eeffOff = d.res.eeff.filter((e) => e.flag);
  // the run's warnings once each (the mesh's notes repeat per feed edge; its info lines say what the notes above say)
  const notes = d.res.notes.filter((n, i, a) => n.level === 'warning' && a.findIndex((m) => m.message === n.message) === i);
  const shifted = v.shift.some((x) => Math.abs(x) > 1e-6);
  const diffParen = v.pair ? trFn('em.wav.diffParen') : '';
  return (
    <div className={vcss.plots} data-waves-results data-stale={stale} data-pair={v.pair} data-elapsed={d.elapsed} data-run-s={d.res.ms / 1000} data-estimate={d.estimate} data-backend={d.backend} data-where={d.where}>
      {stale && <p className={css.small} data-waves-stale>{trFn('em.wav.stale')}</p>}
      {d.res.snap && (
        <>
          <h4 className={vcss.h4}>{trFn('em.wav.theWaves')}</h4>
          {d.store && d.store.frames.length > 0
            ? <WavesPlayer key={d.res.ms + d.elapsed} store={d.store} snap={d.res.snap} views={d.pv.views} geom={d.pv.geom} unit={unit} />
            : <p className={css.small} data-waves-player-gone>{stale ? trFn('em.wav.framesGoneStale') : trFn('em.wav.framesGoneNext')}</p>}
        </>
      )}
      <h4 className={vcss.h4}>{trFn('em.wav.tdrTdt')}</h4>
      <Why k="waves-plots" bare />
      <Plot name="waves-tdr" title={trFn('em.wav.impTitle', { diff: diffParen })} xs={ts} series={zS} xDomain={tDomain} xScale={tScale}
        xLabel={trFn('em.wav.timeBack', { unit: tScale.unit })} cursor={tCur} onCursor={setTCur} readout={zRead} lines={lines} stale={stale} />
      {tdtS && <Plot name="waves-tdt" title={trFn('em.wav.stepTitle', { diff: diffParen })} xs={ts} series={tdtS} xDomain={tDomain} xScale={tScale}
        xLabel={trFn('em.wav.timeStep', { unit: tScale.unit })} cursor={tCur} onCursor={setTCur} readout={tdtRead} stale={stale} />}
      <h4 className={vcss.h4}>{trFn('em.wav.sparams')}</h4>
      <Plot name="waves-s11" title={`|${v.names[0]}| (dB)`} xs={v.f} series={s11} xDomain={fDomain} xLabel={trFn('em.wav.freqGhz')} cursor={fCur} onCursor={setFCur} readout={sRead(0, s11)} stale={stale} />
      <Plot name="waves-s21" title={`|${v.names[1]}| (dB)`} xs={v.f} series={s21} xDomain={fDomain} xLabel={trFn('em.wav.freqGhz')} cursor={fCur} onCursor={setFCur} readout={sRead(1, s21)} stale={stale} />
      <p className={css.small} data-waves-about>
        {trFn('em.wav.aboutBase', { tr: Math.round(d.spec.tr * 1e12), z0: WAVES_Z0, diff: v.pair ? trFn('em.wav.aboutDiff') : '', fS: v.fS.toFixed(1) })}
        {shifted && trFn('em.wav.aboutShifted', { shifts: v.shift.map((x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)}`).join(', ') })}
        {Q && Number.isFinite(Q.fValid) && Q.fValid < v.fS && trFn('em.wav.aboutValid', { fValid: Q.fValid.toFixed(1) })}
        {!Q && (d.spec.kind === 'via' ? trFn('em.wav.aboutNoVia') : trFn('em.wav.aboutNoCoupled'))}
        {v.pair && trFn('em.wav.aboutPair')}
      </p>
      <div data-waves-notes={notes.length + eeffOff.length + (notSettled ? 1 : 0) + (unstable ? 1 : 0)}>
        {notSettled || unstable || eeffOff.length || notes.length ? (
          <ul className={base.issues}>
            {unstable && <li data-waves-run-note="unstable"><span className={base.level} data-level="error">{trFn('em.wav.error')}</span>{trFn('em.wav.unstable')}</li>}
            {notSettled && <li data-waves-run-note="not-settled"><span className={base.level} data-level="warn">{trFn('em.wav.note')}</span>{trFn('em.wav.notSettled')}</li>}
            {eeffOff.map((e, i) => <li key={`e${i}`} data-waves-run-note="eeff"><span className={base.level} data-level="warn">{trFn('em.wav.note')}</span>{trFn('em.wav.eeffOff', { pct: (e.diff * 100).toFixed(1), eeff: e.eeff.toFixed(3), eeff2d: e.eeff2d.toFixed(3) })}</li>)}
            {notes.map((n, i) => <li key={`n${i}`} data-waves-run-note={n.code}><span className={base.level} data-level={NOTE_LEVEL[n.level] ?? 'note'}>{n.level === 'warning' || n.level === 'info' ? trFn('em.wav.note') : trFn('em.wav.error')}</span>{n.message}</li>)}
          </ul>
        ) : <p className={css.small}>{trFn('em.wav.noNotes')}</p>}
      </div>
      <Why k="waves-notes" bare />
    </div>
  );
}
