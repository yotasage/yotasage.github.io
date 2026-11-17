// The Via section's field maps on the page (step M3.2b): the map as an SVG image in the view's world (under the copper,
// so the copper, pads and barrels stay drawn over it and a pan or zoom moves it with the drawing until the new map
// comes), its equipotentials and field lines, the probe's readout and marker, and the controls under the two views.

import React, { useImperativeHandle, useMemo, useState, useSyncExternalStore } from 'react';

import type { LengthUnit } from '../../lib/emsim/units';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTrace.module.css';
import Calm from './Calm';
import { lenText } from './format';
import type { View } from './panZoom';
import type { FieldMod } from './useFieldMap';
import type { ViaFieldDrive, ViaFieldQty, ViaFieldSettings, ViaFieldStore } from './useViaField';
import { VIA_DRIVE_LABEL, VIA_QTY_LABEL } from './useViaField';
import { Why, Whys } from './Why';

const useStore = (store: ViaFieldStore): number => useSyncExternalStore(store.sub, store.snap, store.snap);

/** The world's y of a grid z: the side view's depth below the top surface, the top view's −y. */
const yOf = (which: 'side' | 'top', thick: number) => (which === 'side' ? (z: number) => thick - z : (z: number) => -z);

/** The map and its lines in the view's pixels. */
export const ViaFieldLayer = React.memo(function ViaFieldLayer({ store, mod, view, which, thick }: { store: ViaFieldStore; mod: FieldMod; view: View; which: 'side' | 'top'; thick: number }) {
  useStore(store);
  const p = store.painted;
  const url = useMemo(() => (p && p.image ? p.image.toDataURL() : ''), [p]);
  const Y = yOf(which, thick);
  const X = (x: number) => view.w / 2 + (x - view.cx) * view.k, Yp = (z: number) => view.h / 2 + (Y(z) - view.cy) * view.k;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const o = useMemo(() => (p ? mod.overlay(p, X, Yp) : null), [mod, p, view, which, thick]);
  if (!p || !url) return null;
  const g = p.grid.view;
  const dx = (g.x1 - g.x0) / Math.max(1, g.nx - 1), dz = (g.z1 - g.z0) / Math.max(1, g.ny - 1);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return (
    <g data-viafield-layer={which} data-done={p.done} data-nx={g.nx} data-ny={g.ny}>
      <image href={url} x={r1(X(g.x0 - dx / 2))} y={r1(Yp(g.z1 + dz / 2))} width={r1(g.nx * dx * view.k)} height={r1(g.ny * dz * view.k)} preserveAspectRatio="none" />
      {o && o.contours && <><path d={o.contours} className={css.contourHalo} /><path d={o.contours} className={css.contour} /></>}
      {o && o.lines && <><path d={o.lines} className={css.lineHalo} /><path d={o.lines} className={css.fieldLine} /></>}
    </g>
  );
});

export interface ViaProbePt { x: number; z: number }
export interface ViaProbeApi { set(p: ViaProbePt | null): void; get(): ViaProbePt | null }

interface ProbeProps { api: React.Ref<ViaProbeApi>; mod: FieldMod | null; store: ViaFieldStore; which: 'side' | 'top'; thick: number; view: View; unit: LengthUnit; digits: number; keys: boolean }

/** The probe's readout under the view (read out by Calm.tsx once the probe rests) and its marker over the view. */
export function ViaFieldProbe({ api, mod, store, which, thick, view, unit, digits, keys }: ProbeProps) {
  const [pt, setPt] = useState<ViaProbePt | null>(null);
  useStore(store);
  useImperativeHandle(api, () => ({ set: setPt, get: () => pt }), [pt]);
  const attr = { 'data-viafield-probe': which };
  if (!pt) {
    const hint = keys ? 'Probe: arrow keys on the focused view move it (Shift: finer).' : 'Probe: hover over or tap the view to read the field at a point.';
    return <><Calm text={hint} name="probe" /><p className={css.fieldProbe} {...attr} data-state="">{hint}</p></>;
  }
  const side = which === 'side';
  const p = store.painted;
  const pr = mod && p ? mod.probeAt(p, pt.x, pt.z, null) : null;
  const L = (v: number) => lenText(v, unit, digits);
  const pos = side ? `x ${L(pt.x)} along the cut, depth ${L(thick - pt.z)}` : `x ${L(pt.x)}, y ${L(pt.z)}`;
  let where = '';
  if (pr) {
    const c = pr.cls;
    if (side && Math.abs(pt.x) > store.rLim) where = 'beyond the return vias’ coaxial wall, outside the model';
    else if (c === -1) where = side ? 'copper, ground' : 'copper, a return via';
    else if (c <= -2) where = side ? 'copper, the via' : `copper, via ${c === -2 ? 'A' : 'B'}`;
    else if (side) { const e = p.grid.eps[c]; where = e === 1 ? 'air' : `εr ${Number(e.toPrecision(3))}`; }
    else where = 'between the planes';
  }
  const si = mod ? mod.si : (v: number, u: string) => `${v} ${u}`;
  const text = !pr ? `${pos}: outside the computed field.` : `${pos} (${where}): φ ${si(pr.phi, 'V')}, |E| ${si(pr.f, 'V/m')} (Ex ${si(pr.fx, 'V/m')}, ${side ? 'Ez' : 'Ey'} ${si(pr.fz, 'V/m')}).`;
  const px = view.w / 2 + (pt.x - view.cx) * view.k, py = view.h / 2 + ((side ? thick - pt.z : -pt.z) - view.cy) * view.k;
  const inside = px >= 0 && px <= view.w && py >= 0 && py <= view.h;
  return (
    <>
      <Calm text={`Probe at ${text}`} name="probe" />
      {inside && <span className={css.probeMark} style={{ left: Math.round(px) + 1, top: Math.round(py) + 1 }} aria-hidden="true" data-viafield-mark={which} />}
      <p className={css.fieldProbe} {...attr} data-state={pr ? 'value' : 'none'} data-x={pt.x} data-z={pt.z} data-phi={pr?.phi ?? ''} data-f={pr?.f ?? ''} data-cls={pr?.cls ?? ''}>
        Probe at {text}
      </p>
    </>
  );
}

/** "Show the fields" and, when on, the quantity, a pair's drive (top view), the colour scale and the probe's keys. */
export function ViaFieldControls({ f, set, pair }: { f: ViaFieldSettings; set: (f: ViaFieldSettings) => void; pair: boolean }) {
  return (
    <div className={css.fieldControls} data-viafield-controls>
      <label className={css.check}>
        <input type="checkbox" checked={f.on} data-viafield-on onChange={(e) => set({ ...f, on: e.target.checked })} />
        Show the fields
      </label>
      <Why k="via-fields" bare />
      {f.on && (
        <div className={css.selects}>
          <label className={css.ctl}>
            Quantity
            <select className={base.select} data-viafield-qty value={f.qty} onChange={(e) => set({ ...f, qty: e.target.value as ViaFieldQty })}>
              {(Object.keys(VIA_QTY_LABEL) as ViaFieldQty[]).map((q) => <option key={q} value={q}>{VIA_QTY_LABEL[q]}</option>)}
            </select>
          </label>
          {pair && (
            <label className={css.ctl}>
              Drive (top view)
              <select className={base.select} data-viafield-drive value={f.drive} onChange={(e) => set({ ...f, drive: e.target.value as ViaFieldDrive })}>
                {(Object.keys(VIA_DRIVE_LABEL) as ViaFieldDrive[]).map((d) => <option key={d} value={d}>{VIA_DRIVE_LABEL[d]}</option>)}
              </select>
            </label>
          )}
          <label className={css.ctl}>
            Colour scale
            <select className={base.select} data-viafield-scale value={f.scale} onChange={(e) => set({ ...f, scale: e.target.value as ViaFieldSettings['scale'] })}>
              <option value="linear">Linear</option>
              <option value="log">Logarithmic (3 decades)</option>
            </select>
          </label>
          <div className={css.ctl}>
            Probe keys
            <button type="button" className={base.button} aria-pressed={f.probe} data-viafield-probe-mode onClick={() => set({ ...f, probe: !f.probe })} title="When on, the arrow keys on the focused view move the probe instead of panning">
              {f.probe ? 'Arrows move the probe' : 'Arrows pan'}
            </button>
          </div>
        </div>
      )}
      {f.on && <Whys ks={`via-field-qty${pair ? ' via-field-drive' : ''} via-field-scale via-field-probe-keys via-field-probe via-field-side`} />}
    </div>
  );
}
