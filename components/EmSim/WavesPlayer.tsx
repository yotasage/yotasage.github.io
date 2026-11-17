// The Waves section's player (step M7.1b, in the Waves chunk): the snapshot frames of a run on one slice, played as an
// animation. Choices: the slice (a view: from the side, from above at a feed, between the planes …) and the component
// taken there (|E|, Ez …); Play/Pause, a Time slider (keys: arrows one frame, Page keys further, Home/End), speed
// ¼× … 2×, Loop; the shown frame's time in ps. One colour scale over the whole run (wavesPlayer.ts playScale) with its
// bar; the structure's outline (copper cut by the slice filled, the copper beside a top view outlined, the ports) and
// axes in the page's unit drawn over it as SVG, re-made only on resize or a new view.
//
// The animation runs off requestAnimationFrame in `Engine` (no React render per frame): each new frame becomes the
// pixels of a raster (framePixels, at most RASTER_CAP pixels) put into an offscreen canvas and drawn scaled into the
// visible one (sized to its box × devicePixelRatio); the slider, the time and data-player-frame are set directly. The
// loop stops while the player is off screen or the tab hidden, and does not start by itself under
// prefers-reduced-motion. The frames belong to the result, in its FrameStore: WavesSection empties it on a new run, a
// cancel or a stale setup (so closures of an old render that still hold the box hold no frames), and the Engine lets go
// of it on unmount; no closure here captures the frames' array itself. `el.emsimPlayer` (the Engine) is for the harness.
// M7.2a: for a pair the store holds entry A's and entry B's frames, and a third choice, the drive (entry A alone,
// differential, common), shows them added as values (wavesPlayer.ts trackOf); the combined frames of the shown
// component and drive live in the store too (`track`, one at a time, made when chosen), so emptying it frees them.
// Changing the drive keeps the frame and the clock; the scale is per slice, component and drive over the whole run.

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { scaleBar, barPosition } from '../../lib/emsim/colormap';
import type { Frame, SliceInfo } from '../../lib/emsim/fdtd/snapshots';
import type { Model } from '../../lib/emsim/fdtd/model';
import type { SnapView } from '../../lib/emsim/fullwave';
import type { LengthUnit } from '../../lib/emsim/units';
import { UNIT_TEXT } from '../../lib/emsim/units';
import {
  advance, axisTicks, axesOf, COMP_TEXT, focusBox, framePixels, outlineOf, PLAY_CLIP, playerViews, playScale, psText, rasterOf, rasterSize, siText,
  SPEEDS, viewBox, VIEW_TEXT, FPS_1X,
} from '../../lib/emsim/wavesPlayer';
import { driveText, DRIVE_MODES, MODE_TEXT, trackOf } from '../../lib/emsim/wavesPlayer';
import type { DriveMode, Outline, PlayScale, Raster, Ring } from '../../lib/emsim/wavesPlayer';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import wcss from '../../styles/EmSimWaves.module.css';
import { Why } from './Why';

export interface PlayerSnap { slices: SliceInfo[]; max: number[]; runs?: { run: number }[] }
/** The run's frames in a box the result owns: emptying it frees them, whatever still holds the box. `frames` entry A's
 *  (the first excitation's), `pair` entry B's for a pair (else empty), `track` the combined frames shown (M7.2a). */
export interface FrameStore { frames: Frame[]; pair: Frame[]; track: { key: string; frames: Frame[] } | null }
/** Lets go of every frame the box holds. */
export function freeFrames(s: FrameStore | null | undefined): void {
  if (!s) return;
  s.frames = []; s.pair = []; s.track = null;
}
/** The frames the box holds (both runs'). */
export const heldFrames = (s: FrameStore | null | undefined): number => (s ? s.frames.length + s.pair.length : 0);
interface Props { store: FrameStore; snap: PlayerSnap; views: SnapView[]; geom: Model; unit: LengthUnit }

const M = { l: 46, r: 10, t: 20, b: 38 }; // the figure's margins around the plot (CSS px)
const STATS = 2000; // the stats kept (frame intervals, work per frame)
const speedText = (s: number) => (s === 0.25 ? '¼×' : s === 0.5 ? '½×' : `${s}×`);

/** The animation outside React. */
export class Engine {
  store: FrameStore = { frames: [], pair: [], track: null }; si = 0; ps: PlayScale | null = null; raster: Raster | null = null;
  key: string | null = null; // the shown track's key when it is combined (store.track), null for entry A's own frames
  src: number[] = []; mode: DriveMode = 'single'; // the harness reads them
  pos = 0; shown = -1; playing = false; speed = 1; loop = true; visible = false;
  raf = 0; last = NaN;
  off: HTMLCanvasElement | null = null; img: ImageData | null = null; px: Uint32Array | null = null;
  canvas: HTMLCanvasElement | null = null; slider: HTMLInputElement | null = null; time: HTMLElement | null = null; root: HTMLElement | null = null;
  cw = 0; ch = 0;
  onEnd: () => void = () => {};
  stats = { intervals: [] as number[], work: [] as number[], draws: 0, ticks: 0 };

  get frames(): Frame[] {
    const s = this.store;
    return this.key === null ? s.frames : s.track && s.track.key === this.key ? s.track.frames : [];
  }
  get n(): number { return this.store.frames.length; }
  get running(): boolean { return this.raf !== 0; }

  /** A new picture size, slice or scale: the raster again, then the shown frame. */
  layout(info: SliceInfo, box: { u0: number; u1: number; v0: number; v1: number }, cssW: number, cssH: number, dpr: number): void {
    const c = this.canvas;
    if (!c || cssW <= 0 || cssH <= 0) return;
    this.cw = Math.max(1, Math.round(cssW * dpr)); this.ch = Math.max(1, Math.round(cssH * dpr));
    if (c.width !== this.cw) c.width = this.cw;
    if (c.height !== this.ch) c.height = this.ch;
    const { w, h } = rasterSize(this.cw, this.ch);
    this.raster = rasterOf(info, w, h, box);
    if (!this.off) this.off = document.createElement('canvas');
    if (this.off.width !== w || this.off.height !== h) { this.off.width = w; this.off.height = h; }
    this.img = new ImageData(w, h);
    this.px = new Uint32Array(this.img.data.buffer);
    this.root?.setAttribute('data-player-raster', `${w}x${h}`);
    this.shown = -1;
    this.draw(Math.min(this.n - 1, Math.floor(this.pos)));
  }

  draw(i: number): void {
    const f = this.frames[i], r = this.raster, ps = this.ps, c = this.canvas;
    if (!f || !r || !ps || !c || !this.img || !this.px || !this.off) return;
    framePixels(r, f.data[this.si], f.scale[this.si], ps, this.px);
    this.off.getContext('2d')!.putImageData(this.img, 0, 0);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.drawImage(this.off, 0, 0, this.cw, this.ch);
    this.shown = i;
    this.stats.draws++;
    const t = psText(f.t);
    if (this.slider) { this.slider.value = String(i); this.slider.setAttribute('aria-valuetext', t); }
    if (this.time) this.time.textContent = `${t} · frame ${i + 1} of ${this.n}`;
    this.root?.setAttribute('data-player-frame', String(i));
  }

  seek(i: number): void {
    this.pos = Math.max(0, Math.min(this.n - 1, i));
    this.last = NaN;
    this.draw(Math.floor(this.pos));
  }

  /** Runs the loop when playing, in view and the tab shown; stops it otherwise. */
  sync(): void {
    const run = this.playing && this.visible && typeof document !== 'undefined' && !document.hidden && this.n > 1;
    if (run && !this.raf) { this.last = NaN; this.raf = requestAnimationFrame(this.tick); }
    else if (!run && this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.root?.setAttribute('data-player-running', String(run));
  }

  tick = (now: number): void => {
    this.raf = 0;
    const t0 = performance.now();
    const gap = Number.isNaN(this.last) ? 0 : now - this.last;
    if (gap > 0) push(this.stats.intervals, gap);
    this.last = now;
    // a long gap (a stall, a tab switch) moves on by at most 0.1 s
    const r = advance(this.pos, Math.min(gap, 100), this.speed, this.n, this.loop);
    this.pos = r.pos;
    const i = Math.floor(r.pos);
    if (i !== this.shown) this.draw(i);
    this.stats.ticks++;
    push(this.stats.work, performance.now() - t0);
    if (r.ended) { this.playing = false; this.sync(); this.onEnd(); return; }
    this.raf = requestAnimationFrame(this.tick);
  };

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.store = { frames: [], pair: [], track: null }; this.img = null; this.px = null; this.raster = null; this.ps = null;
    if (this.off) { this.off.width = 1; this.off.height = 1; }
    this.off = null;
  }
}

function push(a: number[], x: number): void {
  if (a.length >= STATS) a.splice(0, a.length - STATS + 1);
  a.push(x);
}

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function WavesPlayer({ store, snap, views, geom, unit }: Props) {
  const pviews = useMemo(() => playerViews(snap.slices, views), [snap, views]);
  const [vi, setVi] = useState(0);
  const [ci, setCi] = useState(0);
  const pair = (snap.runs?.length ?? 1) > 1;
  const [mode, setMode] = useState<DriveMode>('single');
  const view = pviews[Math.min(vi, pviews.length - 1)];
  const k = Math.min(ci, view.comps.length - 1), compSet = view.comps[k], src = view.src[k];
  const info = snap.slices[src[0]];
  // the frames shown: entry A's own, or combined into the box (the memo keeps only the key and the scale)
  const tk = useMemo(() => {
    const m: DriveMode = pair ? mode : 'single';
    const t = trackOf([store.frames, store.pair], src, compSet, m, snap.max);
    const key = t.frames === store.frames ? null : `${src.join('.')}:${compSet}:${m}`;
    store.track = key === null ? null : { key, frames: t.frames };
    return { key, si: t.si, mode: m, ps: playScale(t.frames, t.si, compSet, t.max) };
  }, [store, src, compSet, mode, pair, snap]);
  const si = tk.si, ps = tk.ps;
  const box = useMemo(() => focusBox(geom, view.normal, viewBox(snap.slices, view)), [geom, snap, view]);
  const outline = useMemo(() => outlineOf(geom, view.normal, view.at, box), [geom, view, box]);
  const [playing, setPlaying] = useState(() => !reduced());
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [width, setWidth] = useState(0);
  const [vh, setVh] = useState(800);
  const [dpr, setDpr] = useState(1);
  const eng = useMemo(() => new Engine(), []);
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const fig = useRef<HTMLDivElement>(null);

  // the figure's size: the plot to scale, as wide as the box allows and at most about 60 % of the window's height
  const lay = useMemo(() => {
    const uw = box.u1 - box.u0, vw = box.v1 - box.v0;
    const avail = Math.max(60, width - M.l - M.r), hmax = Math.max(120, Math.min(560, 0.6 * vh));
    let k = avail / uw;
    if (vw * k > hmax) k = hmax / vw;
    const w = Math.max(1, Math.floor(uw * k)), h = Math.max(1, Math.floor(vw * k));
    return { k, w, h, W: w + M.l + M.r, H: h + M.t + M.b };
  }, [box, width, vh]);

  // the engine's elements and callbacks (once), its frames (with the result)
  useLayoutEffect(() => {
    eng.canvas = canvas.current; eng.slider = slider.current; eng.time = time.current; eng.root = root.current;
    if (root.current) (root.current as unknown as { emsimPlayer?: Engine }).emsimPlayer = eng;
    eng.onEnd = () => setPlaying(false);
    return () => { eng.stop(); if (root.current) delete (root.current as unknown as { emsimPlayer?: Engine }).emsimPlayer; };
  }, [eng]);
  useLayoutEffect(() => { eng.store = store; eng.pos = Math.min(eng.pos, Math.max(0, store.frames.length - 1)); }, [eng, store]);
  // the slice, its scale and the picture's size
  useLayoutEffect(() => {
    eng.si = si; eng.ps = ps; eng.key = tk.key; eng.src = src; eng.mode = tk.mode;
    if (width > 0) eng.layout(info, box, lay.w, lay.h, dpr);
  }, [eng, si, ps, tk, src, info, box, lay, width, dpr]);
  useEffect(() => { eng.speed = speed; eng.loop = loop; }, [eng, speed, loop]);
  useEffect(() => {
    if (playing && !eng.playing && eng.n > 1 && !loop && Math.floor(eng.pos) >= eng.n - 1) eng.seek(0); // Play at the end: from the start
    eng.playing = playing; eng.sync();
  }, [eng, playing, loop]);

  // size, view and visibility
  useEffect(() => {
    const f = fig.current;
    if (!f) return;
    const size = () => { setWidth(f.clientWidth); setVh(window.innerHeight); setDpr(window.devicePixelRatio || 1); };
    const ro = new ResizeObserver(size);
    ro.observe(f);
    size();
    const onWin = size;
    window.addEventListener('resize', onWin);
    const io = new IntersectionObserver((es) => { eng.visible = es[es.length - 1].isIntersecting; eng.sync(); });
    io.observe(f);
    const onVis = () => eng.sync();
    document.addEventListener('visibilitychange', onVis);
    return () => { ro.disconnect(); io.disconnect(); window.removeEventListener('resize', onWin); document.removeEventListener('visibilitychange', onVis); };
  }, [eng]);

  const n = store.frames.length, t0 = n ? store.frames[0].t : 0;
  const [ua, va] = axesOf(view.normal);
  const uid = useId().replace(/:/g, '');
  const svg = useMemo(() => overlay(outline, box, lay, unit, uid), [outline, box, lay, unit, uid]);
  const bar = useMemo(() => barOf(ps), [ps]);
  const pct = (100 * PLAY_CLIP).toFixed(1);
  const comp = COMP_TEXT[compSet];

  return (
    <div ref={root} className={wcss.player} data-waves-player data-player-view={view.view} data-player-comp={compSet} data-player-slice={src.join(',')} data-player-mode={pair ? tk.mode : ''}
      data-player-frames={n} data-player-playing={playing} data-player-speed={speed} data-player-loop={loop}
      data-player-top={ps.top} data-player-max={ps.max} data-player-box={JSON.stringify(box)} data-player-size={`${lay.w}x${lay.h}`}>
      <Why k="waves-player" bare />
      <div className={wcss.playerTools}>
        {pviews.length > 1 && (
          <div className={base.seg} role="group" aria-label="Slice" data-player-views={pviews.length}>
            {pviews.map((v, i) => <button key={i} type="button" aria-pressed={i === vi} onClick={() => { setVi(i); setCi(0); }} data-player-view-set={v.view}>{VIEW_TEXT[v.view]}</button>)}
          </div>
        )}
        {view.comps.length > 1 && (
          <div className={base.seg} role="group" aria-label="Field" data-player-comps={view.comps.length}>
            {view.comps.map((c, i) => <button key={c} type="button" aria-pressed={i === k} onClick={() => setCi(i)} data-player-comp-set={c}>{COMP_TEXT[c]}</button>)}
          </div>
        )}
        {pair && (
          <div className={base.seg} role="group" aria-label="Drive" data-player-modes>
            {DRIVE_MODES.map((m) => <button key={m} type="button" aria-pressed={m === tk.mode} onClick={() => setMode(m)} data-player-mode-set={m}>{MODE_TEXT[m]}</button>)}
          </div>
        )}
      </div>
      <div className={vcss.whyRow}>
        {pviews.length > 1 && <Why k="waves-view" />}
        {view.comps.length > 1 && <Why k="waves-comp" />}
        {pair && <Why k="waves-mode" />}
      </div>

      <div ref={fig} className={wcss.figure}>
        <div className={wcss.figBox} style={{ width: lay.W, height: lay.H }}>
          <canvas ref={canvas} className={wcss.canvas} style={{ left: M.l, top: M.t, width: lay.w, height: lay.h }}
            role="img" aria-label={`${comp} ${VIEW_TEXT[view.view].toLowerCase()}, ${UNIT_TEXT[unit]} axes`} data-player-canvas />
          <svg className={wcss.overlay} width={lay.W} height={lay.H} viewBox={`0 0 ${lay.W} ${lay.H}`} aria-hidden="true" data-player-outline={svg.items}>
            <g className={wcss.copper}>{svg.copper}</g>
            <g>{svg.beside}</g>
            <g>{svg.ports}</g>
            <rect x={M.l - 0.5} y={M.t - 0.5} width={lay.w + 1} height={lay.h + 1} className={wcss.frame} />
            <g className={wcss.axis}>{svg.axes}</g>
            <text className={wcss.axisName} x={M.l + lay.w / 2} y={lay.H - 4} textAnchor="middle">{ua} ({UNIT_TEXT[unit]})</text>
            <text className={wcss.axisName} x={M.l - 6} y={12} textAnchor="end">{va} ({UNIT_TEXT[unit]})</text>
          </svg>
        </div>
      </div>

      <div className={wcss.transport}>
        <button type="button" className={`${base.button} ${wcss.play}`} onClick={() => setPlaying((p) => !p)} data-player-play disabled={n < 2}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input ref={slider} type="range" className={wcss.scrub} min={0} max={Math.max(0, n - 1)} step={1} defaultValue={0} aria-label="Time" data-player-time
          onChange={(e) => eng.seek(Number(e.currentTarget.value))} />
        <span ref={time} className={wcss.time} data-player-time-text>{n ? `${psText(t0)} · frame 1 of ${n}` : ''}</span>
      </div>
      <div className={wcss.transport}>
        <div className={base.seg} role="group" aria-label="Speed" data-player-speeds>
          {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={s === speed} onClick={() => setSpeed(s)} data-player-speed-set={s}>{speedText(s)}</button>)}
        </div>
        <button type="button" className={base.button} aria-pressed={loop} onClick={() => setLoop((l) => !l)} data-player-loop-set>Loop</button>
      </div>
      <div className={vcss.whyRow}>
        <Why k="waves-play" />
        <Why k="waves-time" />
        <Why k="waves-speed" />
        <Why k="waves-loop" />
      </div>

      <div className={css.fieldScale} data-player-scale data-lo={ps.scale.lo} data-hi={ps.scale.hi}>
        <div className={css.fieldScaleHead}>
          <span>{comp} (V/m{ps.signed ? ', signed, zero in the middle' : ''})</span>
          <span>{siText(ps.scale.lo, 'V/m')} to {siText(ps.scale.hi, 'V/m')}</span>
        </div>
        <div className={css.fieldBar} style={{ backgroundImage: bar.url ? `url(${bar.url})` : undefined }} />
        <div className={css.fieldTicks} aria-hidden="true">
          {bar.ticks.map((t, i) => (
            <span key={i} className={i % 2 ? css.tickOdd : undefined} style={{ left: `${(t.t * 100).toFixed(2)}%`, transform: `translateX(${t.t < 0.1 ? 0 : t.t > 0.9 ? -100 : -50}%)` }}>{t.text}</span>
          ))}
        </div>
        <div className={css.fieldNote}>
          One scale for all {n} frames, for <span data-player-drive-note>{driveText(tk.mode, pair)}</span>; its top holds {pct} % of the values, the rest
          (up to {siText(ps.max, 'V/m')}, at copper edges) is drawn in the top colour. At 1× the run plays in {(n / FPS_1X).toFixed(0)} s.
        </div>
      </div>
      <Why k="waves-scale" bare />
    </div>
  );
}

function barOf(ps: PlayScale): { url: string; ticks: { t: number; text: string }[] } {
  let url = '';
  if (typeof document !== 'undefined') {
    const w = 256, c = document.createElement('canvas');
    c.width = w; c.height = 1;
    c.getContext('2d')!.putImageData(new ImageData(scaleBar(ps.scale, w, 1) as unknown as Uint8ClampedArray<ArrayBuffer>, w, 1), 0, 0);
    url = c.toDataURL();
  }
  return { url, ticks: ps.scale.ticks.map((v) => ({ t: barPosition(ps.scale, v), text: siText(v, 'V/m', 2) })) };
}

type Lay = { k: number; w: number; h: number; W: number; H: number };

/** The outline, ports and axes in the figure's pixels. */
function overlay(o: Outline, box: { u0: number; u1: number; v0: number; v1: number }, lay: Lay, unit: LengthUnit, uid: string) {
  const X = (u: number) => M.l + (u - box.u0) * lay.k, Y = (v: number) => M.t + (box.v1 - v) * lay.k;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const clipX = (x: number) => Math.min(M.l + lay.w, Math.max(M.l, x)), clipY = (y: number) => Math.min(M.t + lay.h, Math.max(M.t, y));
  const poly = (pts: [number, number][], clip: boolean) => `M${pts.map(([u, v]) => `${r1(clip ? clipX(X(u)) : X(u))},${r1(clip ? clipY(Y(v)) : Y(v))}`).join('L')}Z`;
  const copper = (
    <>
      {o.copper.length > 0 && <path d={o.copper.map((p) => poly(p, true)).join('')} />}
      {o.discs.map((d, i) => <circle key={i} cx={r1(X(d.u))} cy={r1(Y(d.v))} r={r1(d.r * lay.k)} />)}
    </>
  );
  // each layer's outline is the union of its shapes: its strokes masked by their own fill keep the outer half only
  const ring = (b: Ring) => (b.k === 'poly' ? poly(b.pts, true) : `M${r1(X(b.u) + b.r * lay.k)},${r1(Y(b.v))}a${r1(b.r * lay.k)},${r1(b.r * lay.k)} 0 1 0 ${r1(-2 * b.r * lay.k)},0a${r1(b.r * lay.k)},${r1(b.r * lay.k)} 0 1 0 ${r1(2 * b.r * lay.k)},0`);
  const faces = o.faces.map((f) => `M${M.l},${r1(Y(f))}H${M.l + lay.w}`).join('');
  const beside = (
    <>
      {o.beside.map((g, i) => {
        const dd = g.map(ring).join(''), id = `${uid}m${i}`;
        return (
          <g key={i}>
            <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={lay.W} height={lay.H}><rect width={lay.W} height={lay.H} fill="#fff" /><path d={dd} fill="#000" /></mask>
            <path d={dd} className={wcss.halo} mask={`url(#${id})`} />
            <path d={dd} className={wcss.beside} mask={`url(#${id})`} />
          </g>
        );
      })}
      {faces && <><path d={faces} className={wcss.faceHalo} /><path d={faces} className={wcss.face} /></>}
    </>
  );
  const ports = o.ports.map((p, i) => {
    const x1 = r1(X(p.a[0])), y1 = r1(Y(p.a[1])), x2 = r1(X(p.b[0])), y2 = r1(Y(p.b[1]));
    const right = (x1 + x2) / 2 < M.l + lay.w / 2;
    return (
      <g key={i} data-player-port={p.name}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} className={wcss.portHalo} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} className={wcss.port} />
        <text x={right ? Math.max(x1, x2) + 5 : Math.min(x1, x2) - 5} y={Math.min(y1, y2) - 3} textAnchor={right ? 'start' : 'end'} className={wcss.portText}>{p.name}</text>
      </g>
    );
  });
  const tu = axisTicks(box.u0, box.u1, unit, Math.max(2, Math.round(lay.w / 80))), tv = axisTicks(box.v0, box.v1, unit, Math.max(2, Math.round(lay.h / 40)));
  const axes = (
    <>
      {tu.map((t, i) => <g key={`u${i}`}><line x1={r1(X(t.mm))} x2={r1(X(t.mm))} y1={M.t + lay.h} y2={M.t + lay.h + 4} /><text x={r1(X(t.mm))} y={M.t + lay.h + 16} textAnchor="middle">{t.text}</text></g>)}
      {tv.map((t, i) => <g key={`v${i}`}><line x1={M.l - 4} x2={M.l} y1={r1(Y(t.mm))} y2={r1(Y(t.mm))} /><text x={M.l - 6} y={r1(Y(t.mm)) + 4} textAnchor="end">{t.text}</text></g>)}
    </>
  );
  return { copper, beside, ports, axes, items: o.copper.length + o.discs.length + o.beside.length + o.ports.length };
}
