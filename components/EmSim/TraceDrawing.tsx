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

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { Section } from '../../lib/emsim/geometry';
import { layerIndex, stackZ } from '../../lib/emsim/stackup';
import type { DielectricLayer, Stackup } from '../../lib/emsim/stackup';
import type { Structure } from '../../lib/emsim/structure';
import type { LengthUnit } from '../../lib/emsim/units';
import { fromMm } from '../../lib/emsim/units';
import css from '../../styles/EmSimTrace.module.css';
import { lenText } from './format';
import { PanZoom, frameTransform } from './panZoom';
import type { View } from './panZoom';
import { MAX_K, niceStep, roundTo, traceFit, traceHandles, worldMap } from './traceGeom';
import type { HandleDef, HandleKey, TraceFit } from './traceGeom';

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
}

interface Drag { key: HandleKey; def: HandleDef; Z: (y: number) => number; px: number; py: number; raf: number; last: number }

function TraceDrawing({ s, st, sec, reason, unit, digits, widen, edit }: Props) {
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

  // ---- the controller (made before the fit's layout effect reads it) ----
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const pz = new PanZoom(el, { maxK: MAX_K });
    pzRef.current = pz;
    pz.onFrame = (v, gesture) => {
      const g = content.current;
      if (g && gesture) g.setAttribute('transform', frameTransform(viewRef.current, v));
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
    pz.handles = {
      hit: (_x, _y, target) => {
        hitKey.current = ((target as Element | null)?.closest?.('[data-handle]')?.getAttribute('data-handle') ?? null) as HandleKey | null;
        return hitKey.current !== null;
      },
      down: (_id, px, py) => {
        const def = defsRef.current.find((d) => d.key === hitKey.current);
        if (!def || !fit) return;
        frozen.current = fit;
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
      body.push(<polygon key={`r${i}`} points={pts(g.pts)} fill={fill} stroke={m.kind === 'mask' ? 'var(--mask-edge)' : fill} strokeWidth={m.kind === 'mask' ? 0.75 : 0.5} strokeLinejoin="round" />);
    });
    // Boundaries between two dielectric layers.
    const z = stackZ(s);
    const xl = -Wv, xr = 2 * Wv; // drawn past the box so a pan does not show their ends
    for (let i = 1; i < s.layers.length; i++) {
      if (s.layers[i].kind !== 'dielectric' || s.layers[i - 1].kind !== 'dielectric') continue;
      const yy = y(z[i]);
      body.push(<line key={`e${i}`} x1={xl} x2={xr} y1={yy} y2={yy} stroke="var(--laminate-edge)" strokeWidth={1} />);
    }
    const plane = (id: string, face: number, dir: 1 | -1, what: string) => {
      const i = layerIndex(s, id);
      if (i < 0) return;
      const t = z[i] - z[i + 1];
      const y1 = y(face), y2 = y(face + dir * t);
      body.push(<rect key={`p${id}`} x={xl} width={xr - xl} y={Math.min(y1, y2)} height={r(Math.max(Math.abs(y2 - y1), 1))} fill="var(--copper)" stroke="var(--copper-edge)" strokeWidth={0.75} data-plane={what} />);
      labels.push(<text key={`l${id}`} x={Wv - 6} y={r(dir < 0 ? Math.min(y1, y2) - 4 : Math.max(y1, y2) + 12)} textAnchor="end">{`${s.layers[i].name} · plane`}</text>);
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
    const sigLayer = s.layers[layerIndex(s, st.layer)];
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
    <figure className={css.figure} data-trace-drawing data-widen={widen} data-px-per-mm={k} data-view-u={Wv / (2 * k)} data-view-cx={view.cx} data-view-cy={view.cy} data-at-fit={atFit} data-conductors={sec ? sec.conductors.length : 0}>
      <div
        ref={box}
        className={css.drawing}
        data-trace-view
        tabIndex={sec ? 0 : -1}
        aria-label="Cross-section view: drag or arrow keys pan, wheel, pinch or + and − zoom, 0 shows all"
        style={{ height: sec && fit ? H + 2 : undefined }}
      >
        {sec && fit ? (
          <>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Cross-section of the ${st.kind} as the solver sees it${widen ? ', thin layers widened' : ', to scale'}`}>
              <rect x={0} y={0} width={W} height={H} fill="var(--air)" />
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
      {refused && <p className={css.refused} role="alert" data-handle-refused>{refused}</p>}
      <div className={css.caption}>
        <span className={css.key} style={{ background: 'var(--copper)' }} />copper
        <span className={css.key} style={{ background: 'var(--core)' }} />core
        <span className={css.key} style={{ background: 'var(--prepreg)' }} />prepreg
        <span className={css.key} style={{ background: 'var(--mask)' }} />mask
        <span className={css.key} style={{ background: 'var(--air)' }} />air
      </div>
      {fit && (
        <div className={css.caption}>
          <span className={css.scale}><span className={css.scaleBar} style={{ width: Math.round(bar * k) }} />{lenText(bar, unit, Math.max(3, digits - 1))}</span>
          {' '}· {widen ? 'across to scale; thin layers widened top to bottom' : 'to scale both ways'}. Layers beyond the reference planes do not change the result and are not drawn.
          {defs.length > 0 && ' Drag the handles (or focus one and use the arrow keys) to change widths, gaps and heights; drag the picture to pan, wheel or pinch to zoom.'}
        </div>
      )}
    </figure>
  );
}

// Drawn again only when its own props change (not when a result arrives).
export default React.memo(TraceDrawing);
