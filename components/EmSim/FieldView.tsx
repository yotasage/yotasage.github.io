// The field view's scale bar and probe (M2.2), shown by TraceDrawing when the field view is on. The probe keeps its own
// state (set through `api` by hover, tap and keys), so moving it does not draw the cross-section again; its readout is
// text under the drawing (read out by Calm.tsx once the probe rests, M9.1a), with a marker in the drawing.

import React, { useImperativeHandle, useMemo, useState, useSyncExternalStore } from 'react';

import type { Section } from '../../lib/emsim/geometry';
import type { Stackup } from '../../lib/emsim/stackup';
import type { LengthUnit } from '../../lib/emsim/units';
import css from '../../styles/EmSimTrace.module.css';
import type { FieldMod, FieldStore } from './useFieldMap';
import type { Painted } from './fieldPaint';
import Calm from './Calm';
import { QTY_LABEL } from './fieldTypes';
import { lenText } from './format';
import type { View } from './panZoom';
import type { WorldMap } from './traceGeom';

export interface Pt { x: number; z: number }
export interface ProbeApi { set(p: Pt | null): void; get(): Pt | null }

const BAR_W = 256;

const useStore = (store: FieldStore): number => useSyncExternalStore(store.sub, store.snap, store.snap);

/** The map's contours, field lines and surface strips in the SVG (under the copper), in the drawn view. */
export const FieldOverlay = React.memo(function FieldOverlay({ store, mod, view, map }: { store: FieldStore; mod: FieldMod; view: View; map: WorldMap }) {
  useStore(store);
  const p = store.painted;
  const o = useMemo(() => {
    const X = (u: number) => view.w / 2 + (u - view.cx) * view.k, Y = (z: number) => view.h / 2 + (map.Y(z) - view.cy) * view.k;
    return mod.overlay(p, X, Y);
  }, [mod, p, view, map]);
  if (!p) return null;
  return (
    <g className={css.fieldOverlay} data-field-overlay data-contours={p.contours.length} data-lines={p.lines.length} data-strips={o.strips.length}>
      {o.contours && <><path d={o.contours} className={css.contourHalo} /><path d={o.contours} className={css.contour} /></>}
      {o.lines && <><path d={o.lines} className={css.lineHalo} /><path d={o.lines} className={css.fieldLine} /></>}
      {o.strips.map((q, j) => <path key={j} d={q.d} stroke={q.color} className={css.strip} />)}
    </g>
  );
});

/** Under the drawing: the error, if any, and the scale bar. */
export function FieldFoot({ mod, store, drive }: { mod: FieldMod; store: FieldStore; drive: string }) {
  useStore(store);
  return (
    <>
      {store.state === 'error' && <p className={css.refused} role="alert" data-field-error>{store.message}</p>}
      {store.painted && <FieldScaleBar mod={mod} painted={store.painted} drive={drive} />}
    </>
  );
}

export function FieldScaleBar({ mod, painted, drive }: { mod: FieldMod; painted: Painted; drive: string }) {
  const { scale, unit, qty } = painted;
  const b = useMemo(() => mod.bar(scale, BAR_W, unit), [mod, scale, unit]);
  const kind = scale.kind === 'signed' ? 'signed, zero in the middle' : scale.kind;
  return (
    <div className={css.fieldScale} data-field-scale data-view={JSON.stringify(painted.grid.view)} data-done={painted.done} data-lo={scale.lo} data-hi={scale.hi} data-unit={unit} data-kind={scale.kind} data-qty={qty}>
      <div className={css.fieldScaleHead}>
        <span>{QTY_LABEL[qty]} ({unit}, {kind})</span>
        <span>{mod.si(scale.lo, unit)} to {mod.si(scale.hi, unit)}</span>
      </div>
      <div className={css.fieldBar} style={{ backgroundImage: b.url ? `url(${b.url})` : undefined }} />
      <div className={css.fieldTicks} aria-hidden="true">
        {b.ticks.map((t, i) => (
          <span key={i} className={i % 2 ? css.tickOdd : undefined} style={{ left: `${(t.t * 100).toFixed(2)}%`, transform: `translateX(${t.t < 0.1 ? 0 : t.t > 0.9 ? -100 : -50}%)` }}>{t.text}</span>
        ))}
      </div>
      <div className={css.fieldNote}>For {drive}{qty !== 'charge' && qty !== 'current' ? '; the top of the scale is the 99.5th percentile, as the field is singular at copper corners' : ''}.</div>
    </div>
  );
}

interface ProbeProps {
  api: React.Ref<ProbeApi>;
  mod: FieldMod | null;
  store: FieldStore;
  sec: Section;
  s: Stackup;
  view: View;
  map: WorldMap;
  unit: LengthUnit;
  digits: number;
  keys: boolean; // the arrow keys move it
}

export function FieldProbe({ api, mod, store, sec, s, view, map, unit, digits, keys }: ProbeProps) {
  const [pt, setPt] = useState<Pt | null>(null);
  useStore(store);
  const painted = store.painted;
  useImperativeHandle(api, () => ({ set: setPt, get: () => pt }), [pt]);
  if (!pt) {
    const hint = keys ? 'Probe: arrow keys on the focused drawing move it (Shift: finer).' : 'Probe: hover over or tap the drawing to read the field at a point.';
    return <><Calm text={hint} name="probe" /><p className={css.fieldProbe} data-field-probe="">{hint}</p></>;
  }
  const media = mod ? mod.mediaOf(sec) : null;
  const surfaceOnly = !painted || !painted.values;
  const pr = mod && painted && !surfaceOnly ? mod.probeAt(painted, pt.x, pt.z, media) : null;
  const c = pr ? pr.cls : mod ? mod.classAt(sec, pt.x, pt.z) : -999;
  let where = '';
  if (c <= -1) where = c === -1 ? 'copper, ground' : `copper, line ${-1 - c}`;
  else if (c >= 0) {
    const m = sec.materials[c];
    const name = m ? (m.kind === 'air' ? 'air' : s.layers[m.layer]?.name ?? m.kind) : '?';
    where = `${name}, εr ${m ? Number(m.er.toPrecision(3)) : '?'}`;
  }
  const H = painted?.grid.kind === 'H';
  const fu = H ? 'A/m' : 'V/m', pu = H ? 'Wb/m' : 'V';
  const si = mod ? mod.si : (v: number, u: string) => `${v} ${u}`;
  const pos = `x ${lenText(pt.x, unit, digits)}, y ${lenText(pt.z, unit, digits)}`;
  const text = !pr
    ? `${pos}${where ? ` (${where})` : ''}${surfaceOnly ? '' : ': outside the computed field'}.`
    : `${pos} (${where}): ${H ? 'Az' : 'φ'} ${si(pr.phi, pu)}, |${H ? 'H' : 'E'}| ${si(pr.f, fu)} (${H ? 'Hx' : 'Ex'} ${si(pr.fx, fu)}, ${H ? 'Hy' : 'Ey'} ${si(pr.fz, fu)}).`;
  const px = view.w / 2 + (pt.x - view.cx) * view.k, py = view.h / 2 + (map.Y(pt.z) - view.cy) * view.k;
  const inside = px >= 0 && px <= view.w && py >= 0 && py <= view.h;
  return (
    <>
      <Calm text={`Probe at ${text}`} name="probe" />
      {inside && <span className={css.probeMark} style={{ left: Math.round(px) + 1, top: Math.round(py) + 1 }} aria-hidden="true" />}
      <p className={css.fieldProbe} data-field-probe={pr ? 'value' : 'none'} data-x={pt.x} data-z={pt.z} data-phi={pr?.phi ?? ''} data-f={pr?.f ?? ''} data-fx={pr?.fx ?? ''} data-fz={pr?.fz ?? ''} data-cls={pr?.cls ?? ''}>
        Probe at {text}
      </p>
    </>
  );
}
