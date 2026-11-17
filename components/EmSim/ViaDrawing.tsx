// The Via section's two drawings to scale (step M3.1a): the side view (the stackup cut along the section line, with
// copper, laminate and mask, the barrel, pads, the antipads cut into the planes, the stub or backdrill, the feeds and
// the return vias behind the cut) and the top view (pads, antipad shapes, the pair's pitch, return vias numbered as
// their rows, the feeds' directions and the section line). Geometry from lib/emsim/viaGeom.ts in mm, one scale per view.
//
// M3.1b: both views pan and zoom (panZoom.ts, as the Trace section's cross-section: during a gesture the last picture
// is moved by one transform and drawn again when it settles) and have drag handles (viaHandles.ts) by mouse, touch and
// keys: each drag frame is one edit through `edit.move` (rendered at once with flushSync, so a frame's work is
// measurable: box.emsimDrag), the drag ends with `edit.end` (one undo step), a refused value shows its reason. The
// fit (box height and scale) stays while a drag runs and the view it was made in stays afterwards. The live via of a
// drag is in a small store (LiveVia) that only the drawings and the results read, so the form is not drawn per frame.
// The top view adds a return via by a tap with "Add by tap" on (or Enter on the view: at a free spot, then moved by
// keys), and removes the selected one
// (Delete on its handle, or the button).

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';

import type { Stackup } from '../../lib/emsim/stackup';
import type { ViaStructure } from '../../lib/emsim/via';
import { fromMm } from '../../lib/emsim/units';
import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import { lenText } from './format';
import { PanZoom, frameTransform } from './panZoom';
import type { Rect, View } from './panZoom';
import { MAX_K, niceStep, roundTo } from './traceGeom';
import { fitK, sideGeom, topGeom } from '../../lib/emsim/viaGeom';
import type { Box, SideGeom, TopGeom } from '../../lib/emsim/viaGeom';
import { sideHandles, topHandles } from './viaHandles';
import type { ViaHandle, ViaHandleKey } from './viaHandles';
import { Why, Whys } from './Why';
import { FieldFoot } from './FieldView';
import Via3D from './Via3D';
import { useViaField, VIA_FIELD_DEFAULT, viaDriveText } from './useViaField';
import type { ViaFieldSettings } from './useViaField';
import { ViaFieldControls, ViaFieldLayer, ViaFieldProbe } from './ViaFieldView';
import type { ViaProbeApi } from './ViaFieldView';

const LABEL_W = 58; // px for the side view's layer labels
const PAD = 8;
const LABEL_GAP = 12;
const KEY_PX = 4; // px: an arrow key moves a handle by a round step of at least this (Shift: a tenth)

/** What the section does with the handles; move, key and add give the reason when the value is refused. */
export interface ViaEdit {
  begin(): void;
  move(key: ViaHandleKey, a: number, b: number): string | null;
  end(cancelled: boolean): void;
  key(key: ViaHandleKey, a: number, b: number): string | null;
  add(x: number, y: number): string | null; // NaN: at a free spot (viaEdit addReturn)
  remove(k: number): void;
}

/** A drag's live via, read by the drawings and the results only. */
export class LiveVia {
  snap: { via: ViaStructure | null; dragging: boolean } = { via: null, dragging: false };
  private subs = new Set<() => void>();
  sub = (f: () => void) => { this.subs.add(f); return () => { this.subs.delete(f); }; };
  get = () => this.snap;
  set(via: ViaStructure | null, dragging: boolean): void {
    this.snap = { via, dragging };
    for (const f of this.subs) f();
  }
}
export const useLive = (st: LiveVia) => useSyncExternalStore(st.sub, st.get, st.get);

const r2 = (v: number) => Math.round(v * 100) / 100;

function Scale({ k, unit, digits }: { k: number; unit: LengthUnit; digits: number }) {
  const mm = niceStep(56 / k, unit);
  return <span className={css.scale} data-via-scale={mm}><span className={css.scaleBar} style={{ width: `${Math.round(mm * k)}px` }} />{lenText(mm, unit, Math.min(digits, 3))}</span>;
}

// Labels pushed apart to at least LABEL_GAP px, in order.
function spread(want: number[], lo: number, hi: number): number[] {
  const y = want.slice();
  for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i], y[i - 1] + LABEL_GAP);
  if (y.length && y[y.length - 1] > hi) {
    y[y.length - 1] = hi;
    for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] - LABEL_GAP);
  }
  return y.map((v) => Math.max(lo, v));
}

const layerFill = (kind: string, role: string) => (kind === 'mask' ? 'var(--mask)' : role === 'core' ? 'var(--core)' : 'var(--prepreg)');

interface Fit { rect: Rect; H: number; k0: number }

function fitOf(which: 'side' | 'top', g: SideGeom | TopGeom, W: number): Fit | null {
  if (!W || (which === 'side' && !(g as SideGeom).ok)) return null;
  const b = g.box;
  if (which === 'side') {
    const k0 = fitK(b, W - LABEL_W, 420, PAD);
    return { k0, H: Math.ceil((b.y1 - b.y0) * k0 + 2 * PAD), rect: { x0: b.x0 - PAD / k0, x1: b.x1 + (PAD + LABEL_W) / k0, y0: b.y0 - PAD / k0, y1: b.y1 + PAD / k0 } };
  }
  const side = Math.min(W, 380);
  const k0 = fitK(b, side, side, PAD);
  return { k0, H: Math.ceil((b.y1 - b.y0) * k0 + 2 * PAD), rect: { x0: b.x0 - PAD / k0, x1: b.x1 + PAD / k0, y0: b.y0 - PAD / k0, y1: b.y1 + PAD / k0 } };
}

// The direction (world of the top view, radians) for the pad and antipad handles around via A: away from the feeds,
// the return vias and via B.
function freeAngle(v: ViaStructure, g: TopGeom): number {
  const busy: number[] = [];
  for (const f of v.feeds) if (Number.isFinite(f.angle)) busy.push((-f.angle * Math.PI) / 180);
  for (const r of g.returns) busy.push(Math.atan2(r.y, r.x));
  if (v.pitch) busy.push(-Math.PI / 2);
  let best = 0, bestD = -1;
  for (const deg of [0, 45, -45, 90, 135, 180, -135]) {
    const a = (deg * Math.PI) / 180;
    let d = Math.PI;
    for (const b of busy) d = Math.min(d, Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI));
    if (d > bestD + 1e-9) { bestD = d; best = a; }
  }
  return best;
}

interface Drag { key: ViaHandleKey; def: ViaHandle; px: number; py: number; raf: number; last: string }

interface ViewProps {
  which: 'side' | 'top';
  s: Stackup;
  v: ViaStructure;
  traceW: number;
  unit: LengthUnit;
  digits: number;
  edit: ViaEdit;
  fields?: ViaFieldSettings; // M3.2b: the field maps
}

function ViaView({ which, s, v, traceW, unit, digits, edit, fields }: ViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<SVGGElement>(null);
  const pzRef = useRef<PanZoom | null>(null);
  const [W, setW] = useState(0);
  const [dragKey, setDragKey] = useState<ViaHandleKey | null>(null);
  const [focusKey, setFocusKey] = useState<ViaHandleKey | null>(null);
  const [refused, setRefused] = useState('');
  const [atFit, setAtFit] = useState(true);
  const [addMode, setAddMode] = useState(false);
  const [selRet, setSelRet] = useState<number | null>(null);
  const focusNext = useRef<string | null>(null);
  const top = which === 'top';

  const g = useMemo<SideGeom | TopGeom>(() => (top ? topGeom(s, v, traceW) : sideGeom(s, v, traceW)), [top, s, v, traceW]);
  const fitNow = useMemo(() => fitOf(which, g, W), [which, g, W]);
  const frozen = useRef<Fit | null>(null);
  const fit = dragKey && frozen.current ? frozen.current : fitNow;
  const H = fit ? fit.H : 0;
  const [view, setView] = useState<View>({ cx: 0, cy: 0, k: 1, w: 1, h: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // ---- the controller ----
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const pz = new PanZoom(el, { maxK: MAX_K });
    pzRef.current = pz;
    pz.onFrame = (vw, gesture) => { const c = content.current; if (c && gesture) c.setAttribute('transform', frameTransform(viewRef.current, vw)); };
    pz.onSettle = (vw) => { setView(vw); setAtFit(pz.atFit); };
    const set = () => { const w = Math.floor(el.clientWidth); if (w > 0) setW(w); };
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); pz.destroy(); pzRef.current = null; };
  }, []);
  // A new fit: the view follows it when it was the fit or the via is of another kind or stackup, never while
  // dragging; a drag's result keeps the view it was made in.
  const afterDrag = useRef(false);
  const shape = `${!!v.pitch}|${s.layers.map((l) => l.id).join(',')}`;
  const lastShape = useRef('');
  useLayoutEffect(() => {
    const pz = pzRef.current;
    if (!pz || !fit || dragKey) return;
    const other = shape !== lastShape.current;
    lastShape.current = shape;
    pz.resize(W, fit.H);
    const keepView = afterDrag.current && pz.atFit && !other;
    afterDrag.current = false;
    if (keepView) pz.atFit = false;
    pz.setFit(fit.rect, other);
    setView(pz.view);
    setAtFit(pz.atFit);
  }, [fit, W, dragKey, shape]);
  useLayoutEffect(() => { content.current?.removeAttribute('transform'); }, [view]);

  // ---- the field map (M3.2b) and its probe: hover, tap, and the arrow keys when the probe keys are on ----
  const thick = top ? 0 : (g as SideGeom).thick;
  const fm = useViaField(which, fields, s, v, view, g.box, thick, dragKey !== null, box);
  const fieldOn = fm.on;
  useEffect(() => { box.current?.setAttribute('data-field-state', fieldOn ? fm.store.state : 'off'); return fm.store.sub(() => box.current?.setAttribute('data-field-state', fm.store.state)); }, [fieldOn, fm.store]);
  const probe = useRef<ViaProbeApi>(null);
  const zOfY = (y: number) => (top ? -y : thick - y);
  const probeMode = fieldOn && !!fields?.probe;
  useEffect(() => {
    if (probeMode && !probe.current?.get()) { const w = viewRef.current; probe.current?.set({ x: w.cx, z: top ? -w.cy : thick - w.cy }); }
  }, [probeMode, top, thick]);
  const probeAtPx = (px: number, py: number) => {
    const pz = pzRef.current;
    if (pz) probe.current?.set({ x: pz.worldX(px), z: zOfY(pz.worldY(py)) });
  };
  const onProbeKey = (e: React.KeyboardEvent) => {
    if (!probeMode || e.target !== box.current || e.altKey || e.ctrlKey || e.metaKey) return;
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault(); // PanZoom leaves a handled key alone
    const w = viewRef.current, p = probe.current?.get() ?? { x: w.cx, z: zOfY(w.cy) };
    const step = (e.shiftKey ? 1 : 8) / w.k;
    probe.current?.set({ x: p.x + dx * step, z: p.z - dy * step });
  };
  const hoverRaf = useRef(0);
  const onBoxMove = (e: React.PointerEvent) => {
    if (!fieldOn || e.pointerType !== 'mouse' || e.buttons !== 0 || dragKey) return;
    const r = box.current!.getBoundingClientRect(), px = e.clientX - r.left - 1, py = e.clientY - r.top - 1;
    if (!hoverRaf.current) hoverRaf.current = requestAnimationFrame(() => { hoverRaf.current = 0; probeAtPx(px, py); });
  };

  const defs = useMemo(() => (top ? topHandles(s, v, g as TopGeom) : sideHandles(s, v, g as SideGeom)), [top, s, v, g]);
  const defsRef = useRef(defs);
  defsRef.current = defs;
  const angle = useMemo(() => (top ? freeAngle(v, g as TopGeom) : 0), [top, v, g]);
  // Round pads and antipads in the top view: the handle sits on the free direction, the value is the radius × 2.
  const placed = useMemo(() => defs.map((d): ViaHandle => {
    if (!top || !((d.key === 'top-pad' || d.key === 'top-ap') && d.y === 0)) return d;
    const r = d.value / 2;
    return { ...d, x: r * Math.cos(angle), y: r * Math.sin(angle), from: (x, y) => [2 * Math.hypot(x, y), NaN] };
  }), [defs, top, angle]);
  const placedRef = useRef(placed);
  placedRef.current = placed;
  // The selected return via is cleared when it is gone; a new one gets the focus.
  useEffect(() => { if (selRet !== null && selRet >= v.returns.length) setSelRet(null); }, [selRet, v.returns.length]);
  useEffect(() => {
    if (!focusNext.current) return;
    const el = box.current?.querySelector<SVGGElement>(`[data-via-handle="${focusNext.current}"]`);
    if (el) { focusNext.current = null; el.focus(); }
  });

  // ---- handle drags ----
  const drag = useRef<Drag | null>(null);
  const hitKey = useRef<ViaHandleKey | null>(null);
  const editRef = useRef(edit);
  editRef.current = edit;
  const stepOf = (k: number, px: number) => niceStep(px / k, unit);
  const apply = () => {
    const d = drag.current, pz = pzRef.current;
    if (!d || !pz) return;
    d.raf = 0;
    const t0 = performance.now();
    const st = stepOf(pz.view.k, 1);
    const [a0, b0] = d.def.from(pz.worldX(d.px), pz.worldY(d.py));
    const a = roundTo(a0, st), b = Number.isFinite(b0) ? roundTo(b0, st) : NaN;
    const id = `${a},${b}`;
    if (id === d.last) return;
    d.last = id;
    flushSync(() => { setRefused(editRef.current.move(d.key, a, b) ?? ''); });
    const stat = (box.current as unknown as { emsimDrag?: { frames: number; ms: number[] } }).emsimDrag;
    if (stat) { stat.frames++; stat.ms.push(performance.now() - t0); if (stat.ms.length > 2000) stat.ms.shift(); }
  };
  useEffect(() => {
    const el = box.current as unknown as { emsimDrag?: { frames: number; ms: number[] } };
    if (el) el.emsimDrag = { frames: 0, ms: [] };
  }, []);
  const retOf = (key: string | null) => (key && key.startsWith('ret:') ? Number(key.slice(4)) : null);
  const addAt = (x: number, y: number) => {
    const n = v.returns.length;
    const why = edit.add(x, y);
    setRefused(why ?? '');
    if (!why) { setSelRet(n); focusNext.current = `ret:${n}`; setAddMode(false); }
  };
  useEffect(() => {
    const pz = pzRef.current;
    if (!pz) return;
    pz.onTap = !top ? (fieldOn ? probeAtPx : null) : (px, py) => {
      if (addMode) addAt(pz.worldX(px), -pz.worldY(py));
      else { setSelRet(null); if (fieldOn) probeAtPx(px, py); }
    };
    pz.handles = {
      hit: (_x, _y, target) => {
        hitKey.current = (target as Element | null)?.closest?.('[data-via-handle]')?.getAttribute('data-via-handle') ?? null;
        return hitKey.current !== null;
      },
      down: (_id, px, py) => {
        const def = placedRef.current.find((d) => d.key === hitKey.current);
        if (!def || !fit) return;
        frozen.current = fit;
        drag.current = { key: def.key, def, px, py, raf: 0, last: `${def.value},${def.value2}` };
        editRef.current.begin();
        setRefused('');
        const k = retOf(def.key);
        if (k !== null) setSelRet(k);
        setDragKey(def.key);
      },
      move: (_id, px, py) => {
        const d = drag.current;
        if (!d) return;
        d.px = px; d.py = py;
        if (!d.raf) d.raf = requestAnimationFrame(apply);
      },
      up: (_id, px, py, cancelled) => {
        const d = drag.current;
        if (!d) return;
        if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0; }
        if (!cancelled) { d.px = px; d.py = py; apply(); }
        drag.current = null;
        afterDrag.current = true;
        editRef.current.end(cancelled);
        frozen.current = null;
        setDragKey(null);
      },
    };
  });

  const onHandleKey = (d: ViaHandle) => (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = retOf(d.key);
    if (k !== null && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      e.stopPropagation();
      edit.remove(k);
      setSelRet(null);
      setRefused('');
      box.current?.focus();
      return;
    }
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, dy = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    e.stopPropagation();
    const step = stepOf(view.k, KEY_PX) / (e.shiftKey ? 10 : 1);
    if (d.axis === 'xy') setRefused(edit.key(d.key, roundTo(d.value + dx * step, step), roundTo(d.value2 + dy * step, step)) ?? '');
    else setRefused(edit.key(d.key, roundTo(d.value + (dx || dy) * step, step), NaN) ?? '');
  };
  const onBoxKey = (e: React.KeyboardEvent) => {
    if (!top || e.target !== box.current) return;
    if (e.key === 'Escape' && addMode) { setAddMode(false); return; }
    if (addMode && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); addAt(NaN, NaN); }
  };
  const resetView = () => {
    const pz = pzRef.current;
    if (!pz) return;
    pz.fit(false);
    setView(pz.view);
    setAtFit(true);
  };

  // ---- the picture in the drawn view ----
  const k = view.k, Wv = view.w, Hv = view.h;
  const X = (x: number) => r2(Wv / 2 + (x - view.cx) * k);
  const Y = (y: number) => r2(Hv / 2 + (y - view.cy) * k);
  const body: React.ReactNode[] = [];
  const b = g.box, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  if (fit && !top) {
    const sg = g as SideGeom;
    const rect = (q: Box, key: string, fill: string, extra: React.SVGProps<SVGRectElement> = {}) => (
      <rect key={key} x={X(q.x0)} y={Y(q.y0)} width={Math.max(0, r2((q.x1 - q.x0) * k))} height={Math.max(0.6, r2((q.y1 - q.y0) * k))} fill={fill} {...extra} />
    );
    // Layers and planes reach a box's width beyond the content, so a pan shows board, not a gap.
    const ext = (x: number) => (x <= b.x0 + 1e-12 ? x - bw : x >= b.x1 - 1e-12 ? x + bw : x);
    body.push(...sg.layers.map((l) => rect({ x0: b.x0 - bw, x1: b.x1 + bw, y0: l.y0, y1: l.y1 }, `l${l.i}`, layerFill(l.kind, l.role))));
    if (fieldOn && fm.mod) body.push(<ViaFieldLayer key="field" store={fm.store} mod={fm.mod} view={view} which="side" thick={thick} />);
    body.push(...sg.returns.map((rr) => rect({ x0: rr.s - rr.d / 2, x1: rr.s + rr.d / 2, y0: rr.y0, y1: rr.y1 }, `r${rr.k}`, 'var(--copper)', { opacity: rr.inCut ? 1 : 0.38, 'data-via-side-return': rr.k + 1 } as React.SVGProps<SVGRectElement>)));
    body.push(...sg.copper.map((c, i) => rect(c.what === 'plane' ? { ...c, x0: ext(c.x0), x1: ext(c.x1) } : c, `c${i}`, 'var(--copper)', c.what === 'return-pad' ? { opacity: 0.38 } : c.what === 'feed' ? { 'data-via-side-feed': c.layer } as React.SVGProps<SVGRectElement> : {})));
    body.push(...sg.drilled.map((d, i) => rect(d, `d${i}`, 'var(--air)', { stroke: 'var(--ink-3)', strokeDasharray: '3 2', strokeWidth: 1, 'data-via-backdrill': true } as React.SVGProps<SVGRectElement>)));
    body.push(...sg.barrels.map((br, i) => (
      <g key={`b${i}`} opacity={br.inCut ? 1 : 0.4} data-via-barrel={br.name || 'A'}>
        {rect({ x0: br.s - br.d / 2, x1: br.s + br.d / 2, y0: br.y0, y1: br.y1 }, 'h', 'var(--air)')}
        {rect({ x0: br.s - br.d / 2, x1: br.s - br.d / 2 + br.wall, y0: br.y0, y1: br.y1 }, 'w1', 'var(--copper)')}
        {rect({ x0: br.s + br.d / 2 - br.wall, x1: br.s + br.d / 2, y0: br.y0, y1: br.y1 }, 'w2', 'var(--copper)')}
        {rect({ x0: br.s - br.d / 2, x1: br.s + br.d / 2, y0: br.y0, y1: br.y1 }, 'o', 'none', { stroke: 'var(--copper-edge)', strokeWidth: 0.75 })}
      </g>
    )));
    body.push(...sg.stubs.map((t, i) => <line key={`s${i}`} x1={X(t.s)} x2={X(t.s)} y1={Y(t.y0)} y2={Y(t.y1)} stroke="var(--warn)" strokeWidth={3} strokeLinecap="round" data-via-stub={t.side} />));
    // The labels' column on the right.
    const cu = sg.layers.filter((l) => l.kind === 'copper');
    const ly = spread(cu.map((l) => Y(0.5 * (l.y0 + l.y1)) + 4), 11, Hv - 2);
    const L0 = Wv - LABEL_W;
    body.push(
      <g key="labels" className={css.svgLabels}>
        <rect x={L0} y={-Hv} width={LABEL_W} height={3 * Hv} fill="var(--air)" />
        {cu.map((l, i) => (
          <React.Fragment key={l.id}>
            <line x1={L0} x2={L0 + 8} y1={Y(0.5 * (l.y0 + l.y1))} y2={ly[i] - 4} stroke="var(--ink-4)" strokeWidth={1} />
            <text x={L0 + 10} y={ly[i]} data-via-label={l.id}>{l.name}{l.signal === 'entry' ? ' in' : l.signal === 'exit' ? ' out' : l.plane ? ' ⏚' : ''}</text>
          </React.Fragment>
        ))}
        {sg.barrels.length > 1 && sg.barrels.map((br) => <text key={br.name} x={X(br.s)} y={Y(b.y0) + 10} textAnchor="middle" className={css.sigNum}>{br.name}</text>)}
      </g>,
    );
  } else if (fit) {
    const tg = g as TopGeom;
    const hair = { vectorEffect: 'non-scaling-stroke' as const };
    body.push(
      <g key="world" transform={`translate(${r2(Wv / 2 - view.cx * k)} ${r2(Hv / 2 - view.cy * k)}) scale(${k})`}>
        <rect x={b.x0 - bw} y={b.y0 - bh} width={3 * bw} height={3 * bh} fill="var(--core)" />
        <rect x={b.x0 - bw} y={b.y0 - bh} width={3 * bw} height={3 * bh} fill="var(--copper)" opacity={tg.antipads.length ? 0.42 : 0} />
        {tg.antipads.map((a) => <path key={a.layer} d={a.d} fill="var(--core)" data-via-antipad={a.layer} />)}
      </g>,
      fieldOn && fm.mod ? <ViaFieldLayer key="field" store={fm.store} mod={fm.mod} view={view} which="top" thick={0} /> : null,
      <g key="world2" transform={`translate(${r2(Wv / 2 - view.cx * k)} ${r2(Hv / 2 - view.cy * k)}) scale(${k})`}>
        {tg.antipads.map((a) => <path key={`o${a.layer}`} d={a.d} fill="none" stroke="var(--copper-edge)" strokeWidth={1} strokeDasharray="4 3" {...hair} />)}
        <line x1={tg.cut.x0} y1={tg.cut.y0} x2={tg.cut.x1} y2={tg.cut.y1} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="6 4" {...hair} data-via-cut />
        {tg.feeds.map((f, i) => <line key={`f${i}`} x1={f.x0} y1={f.y0} x2={f.x1} y2={f.y1} stroke="var(--copper)" strokeWidth={f.w} strokeLinecap="butt" opacity={f.side === 'entry' ? 1 : 0.6} data-via-feed={f.side} />)}
        {tg.barrels.map((br) => (
          <g key={br.name || 'A'}>
            <circle cx={br.x} cy={br.y} r={br.pad / 2} fill={fieldOn ? 'none' : 'var(--copper)'} stroke="var(--copper-edge)" strokeWidth={1} {...hair} data-via-pad={br.name || 'A'} />
            <circle cx={br.x} cy={br.y} r={br.drill / 2} fill={fieldOn ? 'var(--copper)' : 'var(--air)'} stroke="var(--copper-edge)" strokeWidth={1} {...hair} />
          </g>
        ))}
        {tg.returns.map((rr) => (
          <g key={`r${rr.k}`} data-via-return={rr.k + 1}>
            <circle cx={rr.x} cy={rr.y} r={rr.pad / 2} fill={fieldOn ? 'none' : 'var(--copper)'} stroke="var(--copper-edge)" strokeWidth={1} {...hair} />
            <circle cx={rr.x} cy={rr.y} r={rr.drill / 2} fill="var(--ink-3)" />
          </g>
        ))}
      </g>,
      <g key="labels" className={css.svgLabels}>
        {tg.returns.map((rr) => <text key={rr.k} x={X(rr.x) + (rr.pad / 2) * k + 2} y={Y(rr.y) - (rr.pad / 2) * k + 2} fontSize={10}>{rr.k + 1}</text>)}
        {tg.barrels.length > 1 && tg.barrels.map((br) => <text key={br.name} x={X(br.x) - (br.pad / 2) * k - 4} y={Y(br.y) + 4} textAnchor="end" className={css.sigNum}>{br.name}</text>)}
        {tg.feeds.filter((f, i) => tg.feeds.findIndex((h) => h.side === f.side) === i).map((f) => (
          <text key={f.side} x={X(f.x1)} y={Y(f.y1) + (f.y1 > f.y0 ? -4 : 12)} textAnchor={f.x1 > f.x0 + 1e-6 ? 'end' : f.x1 < f.x0 - 1e-6 ? 'start' : 'middle'} fontSize={10}>{f.side === 'entry' ? `in ${f.layer}` : `out ${f.layer}`}</text>
        ))}
      </g>,
    );
  }
  // Handles: a pill along the axis it moves on (a dot for a return via), a 32 px target, the value while dragged or
  // focused.
  const handles: React.ReactNode[] = [];
  if (fit) {
    const keyStep = lenText(stepOf(k, KEY_PX), unit, 2);
    const u = unit === 'oz' ? 'mm' : unit;
    for (const d of placed) {
      const hx = X(d.x), hy = Y(d.y);
      const xy = d.axis === 'xy';
      const on = dragKey === d.key || (focusKey === d.key && !dragKey);
      const vt = xy ? `x ${lenText(d.value, unit, digits)}, y ${lenText(d.value2, unit, digits)}` : lenText(d.value, unit, digits);
      handles.push(
        <g
          key={d.key}
          className={`${css.handle} ${xy ? vcss.hxy : d.axis === 'y' ? vcss.hy : ''}`}
          data-via-handle={d.key}
          data-value={d.value}
          data-value2={xy ? d.value2 : undefined}
          data-axis={d.axis}
          data-active={dragKey === d.key || (xy && selRet === Number(d.key.slice(4)))}
          transform={`translate(${hx} ${hy})`}
          tabIndex={0}
          role="slider"
          aria-label={d.name}
          aria-roledescription={xy ? 'position' : undefined}
          aria-orientation={d.axis === 'x' ? 'horizontal' : d.axis === 'y' ? 'vertical' : undefined}
          aria-valuenow={Number(fromMm(d.value, u).toPrecision(digits))}
          aria-valuetext={vt}
          aria-keyshortcuts={xy ? 'ArrowLeft ArrowRight ArrowUp ArrowDown Delete' : d.axis === 'x' ? 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight' : 'ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown'}
          data-key-step={keyStep}
          onKeyDown={onHandleKey(d)}
          onFocus={() => { setFocusKey(d.key); if (xy) setSelRet(Number(d.key.slice(4))); }}
          onBlur={() => setFocusKey((f) => (f === d.key ? null : f))}
        >
          <circle r={16} className={css.handleHit} />
          <circle r={11} className={css.handleRing} />
          {xy ? <circle r={5} className={css.handleDot} /> : d.axis === 'x' ? <rect x={-8} y={-4.5} width={16} height={9} rx={4.5} className={css.handleDot} /> : <rect x={-4.5} y={-8} width={9} height={16} rx={4.5} className={css.handleDot} />}
          {on && <text className={css.handleText} x={d.axis === 'y' ? 16 : 0} y={d.axis === 'y' ? 4 : -16} textAnchor={d.axis === 'y' ? 'start' : hx > Wv - 110 ? 'end' : hx < 110 ? 'start' : 'middle'}>{`${d.name} ${vt}`}</text>}
        </g>,
      );
    }
  }
  const sideOk = top || (g as SideGeom).ok;
  const name = top ? 'Top view of the via' : 'Side view of the via, cut along the section line';
  const what = top ? 'top' : 'side';
  return (
    <>
      <div
        ref={box}
        className={`${css.drawing} ${vcss.box}`}
        data-via-view={what}
        data-at-fit={atFit}
        data-add-mode={top ? addMode : undefined}
        tabIndex={sideOk ? 0 : -1}
        aria-label={`${name}: drag or arrow keys pan, wheel, pinch or + and − zoom, 0 shows all${top && addMode ? '; Enter adds a return via at a free spot' : ''}`}
        style={{ height: fit ? H + 2 : undefined }}
        onKeyDown={onBoxKey}
        onKeyDownCapture={onProbeKey}
        onPointerMove={onBoxMove}
      >
        {!sideOk ? (
          <p className={css.noDrawing}>The via cannot be drawn: its barrel or drill is not set.</p>
        ) : fit ? (
          <>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${name}, ${k.toFixed(0)} px per mm`} {...{ [`data-via-${what}`]: '' }} data-px-per-mm={k.toFixed(3)} data-returns={top ? (g as TopGeom).returns.length : undefined}>
              <rect x={0} y={0} width={W} height={H} fill={top ? 'var(--core)' : 'var(--air)'} />
              <g ref={content}>
                {body}
                {handles}
              </g>
            </svg>
            <button type="button" className={css.resetView} data-via-reset={what} onClick={resetView} disabled={atFit} aria-label={`Show the whole ${what} view`} title={`Show the whole ${what} view (0)`}>
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
            </button>
          </>
        ) : null}
      </div>
      {fieldOn && fit && <ViaFieldProbe api={probe} mod={fm.mod} store={fm.store} which={which} thick={thick} view={view} unit={unit} digits={digits} keys={probeMode} />}
      {fieldOn && fm.mod && <FieldFoot mod={fm.mod} store={fm.store} drive={viaDriveText(which, fields!, !!v.pitch)} />}
      {refused && <p className={css.refused} role="alert" data-via-handle-refused={what}>{refused}</p>}
      {top && (
        <div className={vcss.viewTools}>
          <button type="button" className={base.button} aria-pressed={addMode} data-via-add-mode onClick={() => { setAddMode((m) => !m); setRefused(''); }}>{addMode ? 'Tap the view to add…' : 'Add by tap'}</button>
          <button type="button" className={base.button} data-via-remove-sel disabled={selRet === null} onClick={() => { if (selRet !== null) { edit.remove(selRet); setSelRet(null); setRefused(''); } }}>
            {selRet === null ? 'Remove return via' : `Remove return via ${selRet + 1}`}
          </button>
        </div>
      )}
      <figcaption className={css.caption}>
        {top
          ? 'Top view: pads, antipads (dashed) in the planes, return vias numbered as in the list, feeds (pale: the exit side). '
          : 'Side view, cut along the dashed line of the top view; return vias behind the cut are pale. '}
        {fit && <Scale k={k} unit={unit} digits={digits} />}
      </figcaption>
    </>
  );
}

export default React.memo(function ViaDrawing({ s, v: v0, traceW, unit, digits, edit, store }: { s: Stackup; v: ViaStructure; traceW: number; unit: LengthUnit; digits: number; edit: ViaEdit; store: LiveVia }) {
  const live = useLive(store);
  const v = live.via ?? v0;
  const [fields, setFields] = useState<ViaFieldSettings>(VIA_FIELD_DEFAULT);
  return (
    <div className={vcss.views} data-via-dragging={live.dragging}>
      <figure className={css.figure} style={{ position: 'relative' }}>
        <ViaView which="side" s={s} v={v} traceW={traceW} unit={unit} digits={digits} edit={edit} fields={fields} />
        <Why k="via-side" bare />
      </figure>
      <figure className={css.figure} style={{ position: 'relative' }}>
        <ViaView which="top" s={s} v={v} traceW={traceW} unit={unit} digits={digits} edit={edit} fields={fields} />
        <Why k="via-top" bare />
        <Whys ks="via-add-tap via-remove-sel" />
      </figure>
      <p className={css.caption}>Drag the handles (or focus one and use the arrow keys) to change pads, antipads, the drill, the pitch, the backdrill and where the return vias are; drag a view to pan, wheel or pinch to zoom.</p>
      <Whys ks="via-handles via-reset" />
      <ViaFieldControls f={fields} set={setFields} pair={!!v.pitch} />
      <Via3D s={s} v={v} traceW={traceW} fields={fields} />
    </div>
  );
});
