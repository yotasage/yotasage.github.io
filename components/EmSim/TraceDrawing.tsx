// The trace's cross-section drawn to scale (M2.1b): exactly the polygons the solver gets (lib/emsim/geometry.ts
// `section`): copper trapezoids, laminate, mask following the copper, air, and the reference planes (the section's
// zLo / zHi faces, drawn with their stackup thickness; the layers beyond them do not change the result and are left
// out). Both axes share one scale; "widen" stretches thin layers top to bottom (each at least MIN px) and says so.
//
// M2.1c: the view pans and zooms (panZoom.ts; world and fit in traceGeom.ts): during a gesture the last picture is
// moved by one transform, and it is drawn again when the gesture pauses. The preset structures' dimensions have drag
// handles (mouse, touch, keys): each frame of a drag is one edit through `edit.move` (rendered at once with flushSync,
// so a frame's work is measurable: box.emsimDrag), the drag ends with `edit.end` (one undo step), a value the
// structure cannot take is refused with its reason. While a drag runs the fit (box height and widening scale) stays.
//
// M2.2: the field view (useFieldMap.ts, fieldPaint.ts): a canvas behind the SVG holds the map of the view's part of the
// section (moved with the SVG's content during a gesture, drawn again from the last grid at once when the view
// settles, then from the new job's grids); with the map shown the materials are outlines only and contours, field
// lines and the surface strips are paths under the copper. The probe (FieldView.tsx) follows hover and taps, and the
// arrow keys when the probe mode is on (the keys then do not pan).

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { Section } from '../../lib/emsim/geometry';
import { layerIndex, stackZ } from '../../lib/emsim/stackup';
import type { DielectricLayer, Stackup } from '../../lib/emsim/stackup';
import { arrangement } from '../../lib/emsim/structure';
import type { Structure } from '../../lib/emsim/structure';
import type { LengthUnit } from '../../lib/emsim/units';
import { fromMm } from '../../lib/emsim/units';
import css from '../../styles/EmSimTrace.module.css';
import { lenText } from './format';
import { PanZoom, frameTransform } from './panZoom';
import type { View } from './panZoom';
import type { GenSel } from './trace';
import { MAX_K, labelSpot, niceStep, roundTo, traceFit, traceHandles, worldMap } from './traceGeom';
import type { HandleDef, HandleKey, TraceFit } from './traceGeom';
import { FieldFoot, FieldOverlay, FieldProbe } from './FieldView';
import type { ProbeApi } from './FieldView';
import type { FieldSettings } from './fieldTypes';
import { driveText } from './fieldTypes';
import { useFieldMap } from './useFieldMap';
import type { FieldEnv } from './useFieldMap';

const W0 = 640; // px: the width before the first measurement (the static page)
const KEY_PX = 4; // px: an arrow key moves a handle by a round step of at least this (Shift: a tenth)
const LEFT_HANDLE_PX = 64; // px: where the thickness handles sit across

/** What the section does with a handle's value; move and key give the reason when the value is refused. */
export interface HandleEdit {
  begin(): void;
  move(key: HandleKey, v: number): string | null;
  end(cancelled: boolean): void;
  key(key: HandleKey, v: number): string | null;
}

const r = (v: number) => Math.round(v * 100) / 100;

// A 1-2-5 length of at least 48 px.
function barLength(k: number): number {
  const want = 48 / k;
  const p = 10 ** Math.floor(Math.log10(want));
  for (const m of [1, 2, 5, 10]) if (m * p >= want) return m * p;
  return 10 * p;
}

interface Props {
  s: Stackup;
  st: Structure;
  sec: Section | null;
  reason: string;
  unit: LengthUnit;
  digits: number;
  widen: boolean;
  edit: HandleEdit;
  sel?: GenSel | null; // M2.1d: the general editor's selected feature, outlined
  onSelect?: (sel: GenSel | null) => void; // and a tap on a conductor selects it
  fields?: FieldSettings; // M2.2: the field view
  fieldEnv?: FieldEnv;
}

interface Drag { key: HandleKey; def: HandleDef; Z: (y: number) => number; px: number; py: number; raf: number; last: number }

function TraceDrawing({ s, st, sec, reason, unit, digits, widen, edit, sel = null, onSelect, fields, fieldEnv }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<SVGGElement>(null);
  const pzRef = useRef<PanZoom | null>(null);
  const [W, setW] = useState(W0);
  const [dragKey, setDragKey] = useState<HandleKey | null>(null);
  const [focusKey, setFocusKey] = useState<HandleKey | null>(null);
  const [refused, setRefused] = useState('');
  const [atFit, setAtFit] = useState(true);

  // The fit; frozen while a handle is dragged (the box keeps its height and the widened layers their scale).
  const fitNow = useMemo(() => (sec ? traceFit(s, st, sec, W, widen) : null), [s, st, sec, W, widen]);
  const frozen = useRef<TraceFit | null>(null);
  const fit = dragKey && frozen.current ? frozen.current : fitNow;
  const map = useMemo(() => worldMap(s, widen, fit ? fit.kRef : 1), [s, widen, fit]);
  const H = fit ? fit.H : 0;
  const [view, setView] = useState<View>({ cx: 0, cy: 0, k: 1, w: W0, h: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // ---- the field view (M2.2) ----
  const fm = useFieldMap(fields, fieldEnv, s, st, sec, view, map, dragKey !== null, box);
  const fieldOn = fm.on;
  const mapShown = fieldOn && fields!.qty !== 'charge' && fields!.qty !== 'current';
  const drawRef = useRef<() => void>(() => {});
  const canvas = useRef<HTMLCanvasElement>(null);
  const probe = useRef<ProbeApi>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  // The canvas in the drawn view, from the store's newest map: drawn when the view changes and when a map arrives.
  drawRef.current = () => {
    const c = canvas.current;
    box.current?.setAttribute('data-field-state', fieldOn ? fm.store.state : 'off');
    if (!c || !fm.mod) return;
    c.style.transform = '';
    const ctx = c.getContext('2d');
    if (ctx) fm.mod.drawMap(ctx, mapShown ? fm.store.painted : null, viewRef.current, map.Y, widen ? Array.from(stackZ(s)) : [], dpr);
  };
  useLayoutEffect(() => drawRef.current(), [fieldOn, mapShown, view, map, widen, s, dpr]);
  useEffect(() => fm.store.sub(() => drawRef.current()), [fm.store]);
  const probeMode = fieldOn && !!fields?.probe;
  // The probe at the view's centre when its keys are turned on.
  useEffect(() => {
    if (probeMode && !probe.current?.get()) { const v = viewRef.current; probe.current?.set({ x: v.cx, z: map.Z(v.cy) }); }
  }, [probeMode, map]);
  const probeAtPx = (px: number, py: number) => {
    const pz = pzRef.current;
    if (pz) probe.current?.set({ x: pz.worldX(px), z: map.Z(pz.worldY(py)) });
  };
  const onBoxKey = (e: React.KeyboardEvent) => {
    if (!probeMode || e.target !== box.current || e.altKey || e.ctrlKey || e.metaKey) return;
    const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0, dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!dx && !dy) return;
    e.preventDefault(); // PanZoom leaves a handled key alone
    const v = viewRef.current, p = probe.current?.get() ?? { x: v.cx, z: map.Z(v.cy) };
    const step = (e.shiftKey ? 1 : 8) / v.k;
    probe.current?.set({ x: p.x + dx * step, z: map.Z(map.Y(p.z) + dy * step) });
  };
  const hoverRaf = useRef(0);
  const onBoxMove = (e: React.PointerEvent) => {
    if (!fieldOn || e.pointerType !== 'mouse' || e.buttons !== 0 || dragKey) return;
    const r = box.current!.getBoundingClientRect(), px = e.clientX - r.left - 1, py = e.clientY - r.top - 1;
    if (!hoverRaf.current) hoverRaf.current = requestAnimationFrame(() => { hoverRaf.current = 0; probeAtPx(px, py); });
  };

  // ---- the controller (made before the fit's layout effect reads it) ----
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const pz = new PanZoom(el, { maxK: MAX_K });
    pzRef.current = pz;
    pz.onFrame = (v, gesture) => {
      const g = content.current;
      if (g && gesture) g.setAttribute('transform', frameTransform(viewRef.current, v));
      const c = canvas.current;
      if (c && gesture) {
        const a = viewRef.current, f = v.k / a.k;
        c.style.transform = `translate(${v.w / 2 + (a.cx - v.cx) * v.k - (a.w / 2) * f}px, ${v.h / 2 + (a.cy - v.cy) * v.k - (a.h / 2) * f}px) scale(${f})`;
      }
    };
    pz.onSettle = (v) => { setView(v); setAtFit(pz.atFit); };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { const w = Math.floor(el.clientWidth); if (w > 0) setW(w); }) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); pz.destroy(); pzRef.current = null; };
  }, []);
  // A new fit (content or width): the view follows it when it was the fit or the structure is another (kind, layers,
  // copper, widening), never while dragging; a drag's result keeps the view it was made in.
  const afterDrag = useRef(false);
  const shape = `${st.kind}|${st.layer}|${st.layer2}|${st.below}|${st.above}|${widen}|${s.layers.map((l) => l.id).join(',')}`;
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
  // A drawn view: the gesture's transform is no longer needed.
  useLayoutEffect(() => { content.current?.removeAttribute('transform'); }, [view]);

  const defs = useMemo(() => (sec ? traceHandles(s, st) : []), [s, st, sec]);
  const defsRef = useRef(defs);
  defsRef.current = defs;

  // ---- handle drags ----
  const drag = useRef<Drag | null>(null);
  const hitKey = useRef<HandleKey | null>(null);
  const editRef = useRef(edit);
  editRef.current = edit;
  const stepOf = (k: number, px: number) => niceStep(px / k, unit);
  const apply = () => {
    const d = drag.current, pz = pzRef.current;
    if (!d || !pz) return;
    d.raf = 0;
    const t0 = performance.now();
    const p = d.def.axis === 'x' ? pz.worldX(d.px) : d.Z(pz.worldY(d.py));
    const v = roundTo(d.def.from(p), stepOf(pz.view.k, 1));
    if (v === d.last) return;
    d.last = v;
    let why: string | null = null;
    flushSync(() => { why = editRef.current.move(d.key, v); setRefused(why ?? ''); });
    const stat = (box.current as unknown as { emsimDrag?: { frames: number; ms: number[] } }).emsimDrag;
    if (stat) { stat.frames++; stat.ms.push(performance.now() - t0); if (stat.ms.length > 2000) stat.ms.shift(); }
  };
  useEffect(() => {
    const el = box.current as unknown as { emsimDrag?: { frames: number; ms: number[] } };
    if (el) el.emsimDrag = { frames: 0, ms: [] };
  }, []);
  useEffect(() => {
    const pz = pzRef.current;
    if (!pz) return;
    // A tap on (or within 6 px of) a conductor of a general structure selects it; with the field view on it also
    // moves the probe there.
    const tapProbe = fieldOn ? (px: number, py: number) => probeAtPx(px, py) : null;
    pz.onTap = st.kind !== 'general' || !onSelect || !sec ? tapProbe : (px, py) => {
      tapProbe?.(px, py);
      const u = pz.worldX(px), zz = map.Z(pz.worldY(py)), tol = 6 / pz.view.k;
      const zs = stackZ(s), arr = arrangement(s, st);
      let best: GenSel | null = null, bestD = Infinity;
      arr.features.forEach((f, i) => {
        const du = Math.max(f.a - u, u - f.b, 0), dz = Math.max(zs[f.layer + 1] - zz, zz - zs[f.layer], 0);
        const d = Math.hypot(du, dz);
        if (d <= tol && d < bestD) { bestD = d; best = i < arr.signals ? `sig.${i}` : `gnd.${i - arr.signals}`; }
      });
      if (best) onSelect(best);
    };
    pz.handles = {
      hit: (_x, _y, target) => {
        hitKey.current = ((target as Element | null)?.closest?.('[data-handle]')?.getAttribute('data-handle') ?? null) as HandleKey | null;
        return hitKey.current !== null;
      },
      down: (_id, px, py) => {
        const def = defsRef.current.find((d) => d.key === hitKey.current);
        if (!def || !fit) return;
        frozen.current = fit;
        const gm = /^(sig|gnd)\.(\d+)\./.exec(def.key);
        if (gm && onSelect) onSelect(`${gm[1] as 'sig' | 'gnd'}.${Number(gm[2])}`);
        drag.current = { key: def.key, def, Z: map.Z, px, py, raf: 0, last: def.value };
        editRef.current.begin();
        setRefused('');
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

  const onHandleKey = (def: HandleDef) => (e: React.KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const up = e.key === 'ArrowUp' || e.key === 'ArrowRight', down = e.key === 'ArrowDown' || e.key === 'ArrowLeft';
    if (!up && !down) return;
    e.preventDefault();
    e.stopPropagation();
    const step = stepOf(view.k, KEY_PX) / (e.shiftKey ? 10 : 1);
    const v = roundTo(def.value + (up ? step : -step), step);
    setRefused(edit.key(def.key, v) ?? '');
  };

  const resetView = () => {
    const pz = pzRef.current;
    if (!pz) return;
    pz.fit(false);
    setView(pz.view);
    setAtFit(true);
  };

  // ---- the picture in the drawn view ----
  const body: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];
  const handles: React.ReactNode[] = [];
  const k = view.k, Wv = view.w;
  const x = (u: number) => r(Wv / 2 + (u - view.cx) * k);
  const y = (z: number) => r(view.h / 2 + (map.Y(z) - view.cy) * k);
  if (sec && fit) {
    const pts = (p: Float64Array) => {
      let t = '';
      for (let i = 0; i < p.length; i += 2) t += `${x(p[i])},${y(p[i + 1])} `;
      return t;
    };
    sec.regions.forEach((g, i) => {
      const m = sec.materials[g.mat];
      if (!m || m.kind === 'air') return; // the background is air
      const fill = m.kind === 'mask' ? 'var(--mask)' : (s.layers[m.layer] as DielectricLayer)?.role === 'core' ? 'var(--core)' : 'var(--prepreg)';
      if (mapShown) body.push(<polygon key={`r${i}`} points={pts(g.pts)} fill="none" stroke={m.kind === 'mask' ? 'var(--mask-edge)' : 'var(--field-edge)'} strokeWidth={m.kind === 'mask' ? 1 : 0.75} strokeLinejoin="round" />);
      else body.push(<polygon key={`r${i}`} points={pts(g.pts)} fill={fill} stroke={m.kind === 'mask' ? 'var(--mask-edge)' : fill} strokeWidth={m.kind === 'mask' ? 0.75 : 0.5} strokeLinejoin="round" />);
    });
    // Boundaries between two dielectric layers.
    const z = stackZ(s);
    const xl = -Wv, xr = 2 * Wv; // drawn past the box so a pan does not show their ends
    for (let i = 1; i < s.layers.length; i++) {
      if (s.layers[i].kind !== 'dielectric' || s.layers[i - 1].kind !== 'dielectric') continue;
      const yy = y(z[i]);
      body.push(<line key={`e${i}`} x1={xl} x2={xr} y1={yy} y2={yy} stroke={mapShown ? 'var(--field-edge)' : 'var(--laminate-edge)'} strokeWidth={1} />);
    }
    // The field's contours, lines and surface strips, under the copper.
    if (fieldOn && fm.mod) body.push(<FieldOverlay key="field" store={fm.store} mod={fm.mod} view={view} map={map} />);
    // Plane labels at the right, beside the plane on the structure's side, else on its other side, else moved left:
    // never under a handle (M2.1d).
    const hpos = defs.map((d): [number, number] => [d.u === null ? LEFT_HANDLE_PX : x(d.u), y(d.z)]);
    const plane = (id: string, face: number, dir: 1 | -1, what: string) => {
      const i = layerIndex(s, id);
      if (i < 0) return;
      const t = z[i] - z[i + 1];
      const y1 = y(face), y2 = y(face + dir * t);
      body.push(<rect key={`p${id}`} x={xl} width={xr - xl} y={Math.min(y1, y2)} height={r(Math.max(Math.abs(y2 - y1), 1))} fill="var(--copper)" stroke="var(--copper-edge)" strokeWidth={0.75} data-plane={what} />);
      const text = `${s.layers[i].name} · plane`;
      const near = dir < 0 ? Math.min(y1, y2) - 4 : Math.max(y1, y2) + 12, far = dir < 0 ? Math.max(y1, y2) + 12 : Math.min(y1, y2) - 4;
      const [lx, ly] = labelSpot(Wv - 6, 6.4 * text.length + 4, [near, far], hpos, Wv, view.h);
      labels.push(<text key={`l${id}`} x={r(lx)} y={r(ly)} textAnchor="end" data-plane-label={what}>{text}</text>);
    };
    if (sec.planeBelow !== null && st.below) plane(st.below, sec.zLo, -1, 'below');
    if (sec.planeAbove !== null && st.above) plane(st.above, sec.zHi, 1, 'above');
    let sigTop = Infinity;
    for (const c of sec.conductors) {
      body.push(<polygon key={`c${c.id}-${c.pts[0]}`} points={pts(c.pts)} fill="var(--copper)" stroke="var(--copper-edge)" strokeWidth={0.75} strokeLinejoin="round" data-conductor={c.id} />);
      if (c.id > 0) {
        let u0 = Infinity, u1 = -Infinity, zt = -Infinity;
        for (let i = 0; i < c.pts.length; i += 2) { u0 = Math.min(u0, c.pts[i]); u1 = Math.max(u1, c.pts[i]); zt = Math.max(zt, c.pts[i + 1]); }
        sigTop = Math.min(sigTop, y(zt));
        if (sec.signals > 1) labels.push(<text key={`n${c.id}`} x={x((u0 + u1) / 2)} y={r(Math.max(y(zt) - 6, 11))} textAnchor="middle" className={css.sigNum}>{c.id}</text>);
      }
    }
    // The general editor's selection, outlined (a ground to the edge is cut at the drawn view).
    if (sel && st.kind === 'general') {
      const arr = arrangement(s, st);
      const n = Number(sel.slice(4)), f = arr.features[sel.startsWith('sig') ? n : arr.signals + n];
      if (f && f.layer >= 0) {
        const xa = Math.max(x(f.a), -4), xb = Math.min(x(f.b), Wv + 4), ya = y(z[f.layer]), yb = y(z[f.layer + 1]);
        body.push(<rect key="sel" className={css.selOutline} x={r(xa - 3)} y={r(Math.min(ya, yb) - 3)} width={r(Math.max(xb - xa, 0) + 6)} height={r(Math.abs(yb - ya) + 6)} data-sel-outline={sel} />);
      }
    }
    const sigLayer = s.layers[layerIndex(s, st.kind === 'general' ? (st.signals[0]?.layer ?? st.layer) : st.layer)];
    if (sigLayer && Number.isFinite(sigTop)) labels.push(<text key="sig" x={6} y={14}>{`${sigLayer.name} · signal`}</text>);
    // Handles: a pill along the axis it moves on, a 32 px target, the value shown while dragged or focused.
    const keyStep = lenText(stepOf(k, KEY_PX), unit, 2);
    for (const d of defs) {
      const hx = d.u === null ? LEFT_HANDLE_PX : x(d.u), hy = y(d.z);
      const on = dragKey === d.key || (focusKey === d.key && !dragKey);
      const text = `${d.name} ${lenText(d.value, unit, digits)}`;
      handles.push(
        <g
          key={d.key}
          className={css.handle}
          data-handle={d.key}
          data-value={d.value}
          data-axis={d.axis}
          data-active={dragKey === d.key}
          transform={`translate(${r(hx)} ${r(hy)})`}
          tabIndex={0}
          role="slider"
          aria-label={d.name}
          aria-orientation={d.axis === 'x' ? 'horizontal' : 'vertical'}
          aria-valuenow={Number(fromMm(d.value, unit === 'oz' ? 'mm' : unit).toPrecision(digits))}
          aria-valuetext={lenText(d.value, unit, digits)}
          aria-keyshortcuts={d.axis === 'x' ? 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight' : 'ArrowUp ArrowDown Shift+ArrowUp Shift+ArrowDown'}
          data-key-step={keyStep}
          onKeyDown={onHandleKey(d)}
          onFocus={() => setFocusKey(d.key)}
          onBlur={() => setFocusKey((f) => (f === d.key ? null : f))}
        >
          <circle r={16} className={css.handleHit} />
          <circle r={11} className={css.handleRing} />
          {d.axis === 'x' ? <rect x={-8} y={-4.5} width={16} height={9} rx={4.5} className={css.handleDot} /> : <rect x={-4.5} y={-8} width={9} height={16} rx={4.5} className={css.handleDot} />}
          {on && <text className={css.handleText} x={d.axis === 'x' ? 0 : 16} y={d.axis === 'x' ? -16 : 4} textAnchor={d.axis === 'x' ? (hx > Wv - 90 ? 'end' : hx < 90 ? 'start' : 'middle') : 'start'}>{text}</text>}
        </g>,
      );
    }
  }
  const bar = fit ? barLength(k) : 0;
  return (
    <figure className={css.figure} style={fieldOn ? { position: 'relative' } : undefined} data-trace-drawing data-selected={sel ?? ''} data-box-h={H} data-content-h={fit ? Math.round((fit.content[1] - fit.content[0]) * fit.kRef) : 0} data-widen={widen} data-px-per-mm={k} data-view-u={Wv / (2 * k)} data-view-cx={view.cx} data-view-cy={view.cy} data-at-fit={atFit} data-conductors={sec ? sec.conductors.length : 0}>
      <div
        ref={box}
        className={css.drawing}
        data-trace-view
        tabIndex={sec ? 0 : -1}
        aria-label={probeMode ? 'Cross-section view: arrow keys move the probe (Shift finer), wheel, pinch or + and − zoom, 0 shows all' : 'Cross-section view: drag or arrow keys pan, wheel, pinch or + and − zoom, 0 shows all'}
        style={{ height: sec && fit ? H + 2 : undefined }}
        onKeyDownCapture={onBoxKey}
        onPointerMove={onBoxMove}
      >
        {sec && fit ? (
          <>
            {fieldOn && <canvas ref={canvas} className={css.fieldCanvas} width={Math.round(W * dpr)} height={Math.round(H * dpr)} style={{ width: W, height: H }} data-field-canvas aria-hidden="true" />}
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className={fieldOn ? css.overField : undefined} role="group" aria-label={`Cross-section of the ${st.kind} as the solver sees it${widen ? ', thin layers widened' : ', to scale'}`}>
              {!mapShown && <rect x={0} y={0} width={W} height={H} fill="var(--air)" />}
              <g ref={content}>
                {body}
                <g className={css.svgLabels}>{labels}</g>
                {handles}
              </g>
            </svg>
            <button type="button" className={css.resetView} data-trace-reset onClick={resetView} disabled={atFit} aria-label="Show the whole cross-section" title="Show the whole cross-section (0)">
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
            </button>
          </>
        ) : (
          <p className={css.noDrawing} data-no-drawing>{reason || 'Nothing to draw.'}</p>
        )}
      </div>
      {fieldOn && sec && fit && <FieldProbe api={probe} mod={fm.mod} store={fm.store} sec={sec} s={s} view={view} map={map} unit={unit} digits={digits} keys={probeMode} />}
      {refused && <p className={css.refused} role="alert" data-handle-refused>{refused}</p>}
      {fieldOn && fm.mod && <FieldFoot mod={fm.mod} store={fm.store} drive={driveText(fields!, sec ? sec.signals : 1)} />}
      {!mapShown && <div className={css.caption}>
        <span className={css.key} style={{ background: 'var(--copper)' }} />copper
        <span className={css.key} style={{ background: 'var(--core)' }} />core
        <span className={css.key} style={{ background: 'var(--prepreg)' }} />prepreg
        <span className={css.key} style={{ background: 'var(--mask)' }} />mask
        <span className={css.key} style={{ background: 'var(--air)' }} />air
      </div>}
      {fit && (
        <div className={css.caption}>
          <span className={css.scale}><span className={css.scaleBar} style={{ width: Math.round(bar * k) }} />{lenText(bar, unit, Math.max(3, digits - 1))}</span>
          {' '}· {widen ? 'across to scale; thin layers widened top to bottom' : 'to scale both ways'}. Layers beyond the reference planes do not change the result and are not drawn.
          {st.kind === 'general' && ' Tap a conductor to select it in the list.'}
          {defs.length > 0 && ' Drag the handles (or focus one and use the arrow keys) to change widths, gaps and heights; drag the picture to pan, wheel or pinch to zoom.'}
        </div>
      )}
    </figure>
  );
}

// Drawn again only when its own props change (not when a result arrives).
export default React.memo(TraceDrawing);
