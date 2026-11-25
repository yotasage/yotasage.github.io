// The Waves section's 3D view (step M7.2b): this file, three.js (via3dRender.ts, the Via section's renderer) and
// lib/emsim/waves3d.ts are one chunk the player loads only when "3D view" is opened (WavesPlayer.tsx). The run's own
// structure (its model: see-through copper, the laminate on request) with the player's slices as cut planes, each a
// texture of wavesPlayer.ts's pixels on its fixed colour scale, played from the 2D player's Engine: the engine calls
// `paint` with each frame it draws (inside its rAF tick, so the work counts there), which writes the visible planes'
// pixels into their buffers and has the renderer upload them in place and draw at once. Play/Pause and the Time slider
// here drive the same engine, so the two views always show one frame. A plane shows the player's field where it has it
// (else its own first: a top view's Ez beside the side view's |E|) in the player's drive; the frames combined for it
// live in the result's FrameStore (`more`), so a new run, a cancel or a stale setup frees them with the rest, and they
// are read through the store at each frame (no closure holds them). Closing disposes the geometry, the textures and the
// WebGL context. `el.emsimWaves3d` is for the harness.

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { Model } from '../../lib/emsim/fdtd/model';
import type { SnapComp } from '../../lib/emsim/fdtd/snapshots';
import { modelScene, planeComp, planeViews, viewPlace, waveBox } from '../../lib/emsim/waves3d';
import type { PlanePlace } from '../../lib/emsim/waves3d';
import { COMP_TEXT, framePixels, playScale, psText, rasterOf, siText, trackOf, VIEW_TEXT } from '../../lib/emsim/wavesPlayer';
import type { DriveMode, PlayerView, PlayScale, Raster } from '../../lib/emsim/wavesPlayer';
import { useI18n } from '../../lib/ui/i18n';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import wcss from '../../styles/EmSimWaves.module.css';
import { emT } from './emText';
import { colorsOf, createVia3D, followTheme } from './via3dRender';
import type { Via3D } from './via3dRender';
import { barOf } from './WavesPlayer';
import type { Engine, FrameStore, PlayerSnap, Track } from './WavesPlayer';
import { Whys } from './Why';

interface Props {
  eng: Engine; store: FrameStore; snap: PlayerSnap; views: PlayerView[]; comp: SnapComp; mode: DriveMode; geom: Model; n: number;
  playing: boolean; onPlay: () => void; t0: number;
}

/** A plane as drawn: its view, place and texels (fixed for the result), and what it shows now. */
interface Plane {
  view: PlayerView; place: PlanePlace; px: Uint32Array;
  comp: SnapComp; src: number[]; key: string | null; si: number; ps: PlayScale; raster: Raster;
}

const COPPER = 0.32; // the copper's opacity: see-through, so the planes show inside the structure
const FIT = 0.72; // the first view a little closer than the Via section's (the box is flatter than its square)
const STEP = Math.PI / 24; // a key's turn

export default function WavesView3D({ eng, store, snap, views, comp, mode, geom, n, playing, onPlay, t0 }: Props) {
  const { t: tr } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const [view, setView] = useState<Via3D | null>(null);
  const [err, setErr] = useState('');
  const [openMs, setOpenMs] = useState(NaN);
  const [laminate, setLaminate] = useState(false);
  // a via's first view: cut along its side plane; a trace's: whole, from above and across (its plane along the trace
  // would hide the plane from above, which lies under the trace)
  const [cut, setCut] = useState(geom.kind === 'via');
  const box = useMemo(() => waveBox(geom), [geom]);
  const scene = useMemo(() => modelScene(geom, box), [geom, box]);
  // the planes' places and buffers: one per view, for the result
  const placed = useMemo(() => planeViews(views).flatMap((v) => {
    const place = viewPlace(snap.slices, v, box);
    return place ? [{ view: v, place, px: new Uint32Array(place.tw * place.th) }] : [];
  }, []), [views, snap, box]);
  const [on, setOn] = useState<boolean[]>(() => placed.map((p) => geom.kind === 'via' || p.view.view !== 'along'));
  // the plane along the side view's line (a via's side view, a trace's view along it): the cut goes through it, so
  // the other planes and the copper lose the half towards the first view and it shows whole
  const cutOn = useMemo(() => {
    const ax = scene.u.x !== 0 ? 'y' : 'x';
    const k = placed.findIndex((p) => p.place.normal === ax);
    return k < 0 ? null : { k, c: ax === 'y' ? placed[k].place.at : -placed[k].place.at };
  }, [placed, scene]);
  // what each plane shows: its component in the player's drive, the frames combined into the store, the fixed scale
  const planes = useMemo<Plane[]>(() => {
    const more: Track[] = [];
    const out = placed.map((p) => {
      const k = planeComp(p.view, comp), c = p.view.comps[k], src = p.view.src[k];
      const key = `${src.join('.')}:${c}:${mode}`;
      // the player's own combined frames, or a plane's before, are taken as they are
      const had = store.track && store.track.key === key ? store.track : more.find((m) => m.key === key);
      const t = had ? { frames: had.frames, si: 0, max: had.max } : trackOf([store.frames, store.pair], src, c, mode, snap.max);
      const own = t.frames === store.frames;
      if (!own && !more.some((m) => m.key === key)) more.push({ key, frames: t.frames, max: t.max });
      const ps = playScale(t.frames, t.si, c, t.max);
      const raster = rasterOf(snap.slices[src[0]], p.place.tw, p.place.th, p.place.box);
      return { ...p, comp: c, src, key: own ? null : key, si: t.si, ps, raster };
    });
    store.more = more;
    return out;
  }, [placed, store, comp, mode, snap]);

  // the state the engine's frame callback reads (it is set before the parent's layout effect draws a frame)
  const st = useRef({ planes, on, view, n });
  useLayoutEffect(() => { st.current = { planes, on, view, n }; }, [planes, on, view, n]);

  // one frame into the visible planes' buffers, then drawn; the transport here follows
  const paint = useMemo(() => (i: number) => {
    const { planes: ps, on: vis, view: v, n: nn } = st.current;
    const s = eng.store;
    for (let k = 0; k < ps.length; k++) {
      if (!vis[k]) continue;
      const p = ps[k];
      const fs = p.key === null ? s.frames : s.more?.find((m) => m.key === p.key)?.frames;
      const f = fs?.[i];
      if (f) framePixels(p.raster, f.data[p.si], f.scale[p.si], p.ps, p.px);
    }
    v?.drawWaves(i);
    const f0 = s.frames[i];
    if (slider.current) { slider.current.value = String(i); if (f0) slider.current.setAttribute('aria-valuetext', psText(f0.t)); }
    if (time.current && f0) time.current.textContent = emT('em.wav.frameOf', { t: psText(f0.t), i: i + 1, n: nn });
    host.current?.parentElement?.setAttribute('data-waves3d-frame', String(i));
  }, [eng]);
  const current = () => (eng.shown >= 0 ? eng.shown : Math.max(0, Math.min(eng.n - 1, Math.floor(eng.pos))));

  // the renderer (once), the engine's frames and visibility
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true, made: Via3D | null = null;
    createVia3D(el, { copper: COPPER, fit: FIT }).then((x) => {
      if (!live) { x.dispose(); return; }
      made = x;
      x.renderer.domElement.setAttribute('data-waves3d-canvas', '');
      (el as unknown as { emsimWaves3d?: unknown }).emsimWaves3d = { view: x, planes: () => st.current.planes, on: () => st.current.on, box, scene };
      x.onFrame = () => setOpenMs(performance.now() - t0);
      x.setColors(colorsOf(el));
      setView(x);
    }, (e: unknown) => { if (live) setErr(emT('em.wav.webglErr', { msg: e instanceof Error ? e.message : String(e) })); });
    eng.listeners.add(paint);
    eng.watch(el);
    return () => {
      live = false;
      eng.listeners.delete(paint);
      eng.unwatch(el);
      eng.store.more = []; // the planes' combined frames go with the view
      made?.dispose();
      // the harness reads what the closed view left (its renderer's memory after disposing), not the view itself
      if (made && eng.root) (eng.root as unknown as { emsimWaves3dGone?: unknown }).emsimWaves3dGone = JSON.parse(JSON.stringify({ ...made.stats, frameMs: [] }));
      delete (el as unknown as { emsimWaves3d?: unknown }).emsimWaves3d;
    };
    // t0 is the click that opened the view, box and scene are the result's: none changes while the view is open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eng, paint]);
  useEffect(() => { view?.setScene(scene); }, [view, scene]);
  useEffect(() => { view?.setLaminate(laminate); }, [view, laminate]);
  useEffect(() => {
    if (!view) return;
    view.setCutAt(cutOn ? cutOn.c : 0, cutOn ? String(cutOn.k) : null);
    view.setCut(!!cutOn && cut);
  }, [view, cut, cutOn, placed]);
  useEffect(() => {
    if (!view) return;
    view.setWaves(placed.map((p, k) => ({ key: String(k), o: p.place.o, U: p.place.U, V: p.place.V, w: p.place.w, h: p.place.h, tw: p.place.tw, th: p.place.th, px: p.px })));
  }, [view, placed]);
  // what is shown changed (the planes on, the component, the drive): this frame again
  useEffect(() => {
    if (!view) return;
    on.forEach((o, k) => view.showWave(String(k), o));
    paint(current());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, planes, on, paint]);
  useEffect(() => { if (view && host.current) return followTheme(host.current, view); }, [view]);

  const onKey = (e: React.KeyboardEvent) => {
    if (!view) return;
    const k = e.key;
    if (k === 'ArrowLeft') view.turn(-STEP, 0);
    else if (k === 'ArrowRight') view.turn(STEP, 0);
    else if (k === 'ArrowUp') view.turn(0, STEP);
    else if (k === 'ArrowDown') view.turn(0, -STEP);
    else if (k === '+' || k === '=') view.zoomBy(1 / 1.2);
    else if (k === '-' || k === '_') view.zoomBy(1.2);
    else if (k === 'Home' || k === '0') view.reset();
    else return;
    e.preventDefault();
  };

  const bars = useMemo(() => planes.map((p) => barOf(p.ps)), [planes]);
  const shown = planes.filter((_, k) => on[k]).length;
  const viewLabel = (k: keyof typeof VIEW_TEXT) => tr(`em.wav.view.${k}`) || VIEW_TEXT[k];

  return (
    <div className={vcss.v3d} data-waves3d data-waves3d-ready={!!view && Number.isFinite(openMs)} data-open-ms={Number.isFinite(openMs) ? openMs.toFixed(0) : ''}
      data-waves3d-planes={planes.length} data-waves3d-shown={shown}>
      <div ref={host} className={vcss.v3dHost} tabIndex={0} onKeyDown={onKey} data-waves3d-host
        aria-label={tr('em.wav.host3dAria')} role="img" />
      {err && <p className={css.refused} role="alert" data-waves3d-error>{err}</p>}
      <div className={wcss.transport}>
        <button type="button" className={`${base.button} ${wcss.play}`} onClick={onPlay} data-waves3d-play disabled={n < 2}>{playing ? tr('em.wav.pause') : tr('em.wav.play')}</button>
        <input ref={slider} type="range" className={wcss.scrub} min={0} max={Math.max(0, n - 1)} step={1} defaultValue={current()} aria-label={tr('em.wav.time3dAria')} data-waves3d-time
          onChange={(e) => eng.seek(Number(e.currentTarget.value))} />
        <span ref={time} className={wcss.time} data-waves3d-time-text />
      </div>
      <div className={vcss.viewTools}>
        <div className={base.seg} role="group" aria-label={tr('em.wav.planesAria')} data-waves3d-plane-set>
          {planes.map((p, k) => (
            <button key={k} type="button" aria-pressed={on[k]} data-waves3d-plane={p.view.view}
              onClick={() => setOn((o) => o.map((x, j) => (j === k ? !x : x)))}>{viewLabel(p.view.view)}</button>
          ))}
        </div>
        <button type="button" className={base.button} data-waves3d-reset onClick={() => view?.reset()}>{tr('em.wav.resetView')}</button>
        {cutOn && <button type="button" className={base.button} aria-pressed={cut} data-waves3d-cut onClick={() => setCut((c) => !c)}>{tr('em.wav.cutNear')}</button>}
        <button type="button" className={base.button} aria-pressed={laminate} data-waves3d-laminate onClick={() => setLaminate((l) => !l)}>{tr('em.wav.showLam')}</button>
      </div>
      <Whys ks={`waves-3d-planes waves-3d-reset${cutOn ? ' waves-3d-cut' : ''} waves-3d-laminate`} />
      {planes.map((p, k) => on[k] && (
        <div key={k} className={css.fieldScale} data-waves3d-scale={p.view.view} data-lo={p.ps.scale.lo} data-hi={p.ps.scale.hi} data-comp={p.comp}>
          <div className={css.fieldScaleHead}>
            <span>{viewLabel(p.view.view)}: {COMP_TEXT[p.comp]} (V/m{p.ps.signed ? tr('em.wav.signed') : ''})</span>
            <span>{tr('em.wav.rangeTo', { lo: siText(p.ps.scale.lo, 'V/m'), hi: siText(p.ps.scale.hi, 'V/m') })}</span>
          </div>
          <div className={css.fieldBar} style={{ backgroundImage: bars[k].url ? `url(${bars[k].url})` : undefined }} />
          <div className={css.fieldTicks} aria-hidden="true">
            {bars[k].ticks.map((t, i) => (
              <span key={i} className={i % 2 ? css.tickOdd : undefined} style={{ left: `${(t.t * 100).toFixed(2)}%`, transform: `translateX(${t.t < 0.1 ? 0 : t.t > 0.9 ? -100 : -50}%)` }}>{t.text}</span>
            ))}
          </div>
        </div>
      ))}
      <p className={css.caption} data-waves3d-counts={JSON.stringify(scene.counts)}>
        {tr('em.wav.cap3d', {
          cut: cutOn && cut ? tr('em.wav.cap3dCut', { name: viewLabel(planes[cutOn.k].view.view) }) : '',
          shown,
          total: planes.length,
          planes: planes.length === 1 ? tr('em.wav.planeOne') : tr('em.wav.planeMany'),
        })}
      </p>
    </div>
  );
}
