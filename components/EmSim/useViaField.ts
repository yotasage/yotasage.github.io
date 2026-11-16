// The Via section's field maps (step M3.2b): the worker's `via-field` job (lib/emsim/viafield.ts) for the part of
// each view that is shown, on a channel per view, progressive (coarse first; each partial grid is drawn as it comes).
// The side view's grid is 4 px per point (the axisymmetric field costs about 30 µs a point, notes-M3.2b.md), the top
// view's 2 px. While a handle is dragged the map follows as the Trace section's (useFieldMap.ts): 8 px per point, a
// new job only when the last has come back and at most every 40 ms, the newest edit waiting; the full map follows the
// drag's end. Results go into a store, so a new map draws only the layer, the scale bar and the probe.

import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { View as GridView } from '../../lib/emsim/fields';
import type { StaticJob } from '../../lib/emsim/jobs';
import type { Stackup } from '../../lib/emsim/stackup';
import type { ViaStructure } from '../../lib/emsim/via';
import type { ViaFieldResult } from '../../lib/emsim/viafield';
import type { FieldScale } from './fieldTypes';
import type { View } from './panZoom';
import { getClient } from './TraceSection';
import { FieldStore } from './useFieldMap';
import type { FieldMod } from './useFieldMap';
import type { Box } from './viaGeom';

export type ViaFieldQty = 'phi' | 'E' | 'lines';
export type ViaFieldDrive = 'differential' | 'common' | 'one';
export interface ViaFieldSettings { on: boolean; qty: ViaFieldQty; drive: ViaFieldDrive; scale: FieldScale; probe: boolean }
export const VIA_FIELD_DEFAULT: ViaFieldSettings = { on: false, qty: 'E', drive: 'differential', scale: 'linear', probe: false };
export const VIA_QTY_LABEL: Record<ViaFieldQty, string> = { phi: 'Potential φ', E: 'Electric field |E|', lines: 'Field lines and equipotentials' };
export const VIA_DRIVE_LABEL: Record<ViaFieldDrive, string> = { differential: 'Differential (±½ V)', common: 'Common (both 1 V)', one: 'Via A alone (1 V, B at 0 V)' };

/** The barrels' voltages of the top view. */
export const viaDriveV = (f: ViaFieldSettings, pair: boolean): number[] => (!pair ? [1] : f.drive === 'differential' ? [0.5, -0.5] : f.drive === 'common' ? [1, 1] : [1, 0]);
export function viaDriveText(which: 'side' | 'top', f: ViaFieldSettings, pair: boolean): string {
  if (which === 'side') return pair ? 'one via of the pair alone at 1 V in its coaxial wall, as the via model solves it' : 'the via at 1 V in its coaxial wall, as the via model solves it';
  return pair ? `the cut between the planes, ${VIA_DRIVE_LABEL[f.drive].replace(/^./, (c) => c.toLowerCase())}` : 'the cut between the planes, the via at 1 V';
}

/** A FieldStore with what the side view's probe needs: the map's radius (the wall, a pair at most half the pitch). */
export class ViaFieldStore extends FieldStore { rLim = NaN; wall = '' }

const STEP_PX = { side: 4, top: 2 };
const DRAG_STEP_PX = 8;
const DRAG_GAP_MS = 40;

/** The grid of the view's part of the drawing's box: world y is the depth (side, z = thick − y) or −y (top). */
export function viaGridView(which: 'side' | 'top', v: View, box: Box, thick: number, step: number): GridView | null {
  const hw = v.w / (2 * v.k), hh = v.h / (2 * v.k);
  // The drawing's board reaches a box beyond its content (a pan shows board), the side view's air only its own box.
  const bw = box.x1 - box.x0, bh = which === 'top' ? box.y1 - box.y0 : 0;
  const x0 = Math.max(v.cx - hw, box.x0 - bw), x1 = Math.min(v.cx + hw, box.x1 + bw);
  const y0 = Math.max(v.cy - hh, box.y0 - bh), y1 = Math.min(v.cy + hh, box.y1 + bh);
  if (!(x1 > x0 && y1 > y0)) return null;
  const nx = Math.max(2, Math.round(((x1 - x0) * v.k) / step) + 1), ny = Math.max(2, Math.round(((y1 - y0) * v.k) / step) + 1);
  return which === 'side' ? { x0, x1, z0: thick - y1, z1: thick - y0, nx, ny } : { x0, x1, z0: -y1, z1: -y0, nx, ny };
}

interface Stat { requests: number; paints: { kind: 'partial' | 'done'; ms: number; at: number; drag: boolean; nx: number; ny: number; cached: boolean }[] }

export function useViaField(which: 'side' | 'top', f: ViaFieldSettings | undefined, s: Stackup, v: ViaStructure, view: View, box: Box, thick: number, dragging: boolean, el: React.RefObject<HTMLDivElement | null>) {
  const on = !!(f && f.on && v);
  const [mod, setMod] = useState<FieldMod | null>(null);
  const [store] = useState(() => new ViaFieldStore());
  const onRef = useRef(on);
  onRef.current = on;
  useEffect(() => {
    if (!on || mod) return;
    let live = true;
    // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
    void (import('./fieldPaint') as Promise<FieldMod>).then((m) => { if (live) setMod(m); });
    return () => { live = false; };
  }, [on, mod]);
  const inflight = useRef(0);
  const waiting = useRef<(() => void) | null>(null);
  const lastSend = useRef(0);
  const timer = useRef(0);
  const nextId = useRef(0);
  const flush = useRef(() => {});
  flush.current = () => {
    if (timer.current || inflight.current || !waiting.current) return;
    const wait = DRAG_GAP_MS - (performance.now() - lastSend.current);
    const go = () => { timer.current = 0; if (inflight.current) return; const w = waiting.current; waiting.current = null; if (w && onRef.current) w(); };
    if (wait > 0) timer.current = window.setTimeout(go, wait);
    else go();
  };
  const pair = !!v?.pitch;
  const qty = f?.qty ?? 'E', scaleKind = f?.scale ?? 'linear';
  const drive = f ? viaDriveV(f, pair).join(',') : '';
  const channel = `via-field-${which}`;
  useEffect(() => {
    if (!on || !mod || !f) {
      if (!on && store.state !== 'off') { store.set({ painted: null, state: 'off', message: '' }); waiting.current = null; void getClient().then((c) => c.cancel(channel)); }
      return;
    }
    const gv = viaGridView(which, view, box, thick, dragging ? DRAG_STEP_PX : STEP_PX[which]);
    if (!gv) { store.set({ painted: null }); return; }
    const job: StaticJob = {
      kind: 'via-field', setup: { stackup: s, via: v }, which, view: gv,
      ...(which === 'top' ? { drive: drive.split(',').map(Number), lines: qty === 'lines' ? 24 : 0 } : {}),
      ...(dragging ? { estimate: false } : {}),
      contours: qty === 'phi' || qty === 'lines' ? 10 : 0,
    };
    const stat = () => (el.current as unknown as { emsimViaField?: Stat } | null)?.emsimViaField;
    const elx = el.current as unknown as { emsimViaField?: Stat } | null;
    if (elx && !elx.emsimViaField) elx.emsimViaField = { requests: 0, paints: [] };
    const t0 = performance.now();
    const send = (): void => {
      const id = (nextId.current += 1);
      inflight.current = id;
      lastSend.current = performance.now();
      const s0 = stat();
      if (s0) s0.requests++;
      const record = (kind: 'partial' | 'done', cached: boolean) => {
        const sx = stat();
        if (sx) { sx.paints.push({ kind, ms: performance.now() - t0, at: performance.now(), drag: dragging, nx: gv.nx, ny: gv.ny, cached }); if (sx.paints.length > 4000) sx.paints.shift(); }
      };
      void getClient().then((c) => c.run<ViaFieldResult>(channel, job, (_d, _t, partial) => {
        if (!onRef.current || inflight.current !== id || !partial || dragging) return;
        store.set({ painted: mod.prepare(partial as ViaFieldResult['grid'] & object, qty, scaleKind), state: 'partial' });
        record('partial', false);
      })).then((rr) => {
        if (inflight.current === id) inflight.current = 0;
        if (rr && onRef.current) {
          const r = rr.result;
          if (r.ok && r.grid) {
            store.rLim = r.rLim; store.wall = r.wall;
            store.set({ painted: mod.prepare(r.grid, qty, scaleKind, { contours: r.contours, lines: r.lines, surface: null }), state: 'done', message: '' });
            record('done', rr.cached);
          } else store.set({ painted: null, state: 'error', message: r.reason || 'No field.' });
        }
        flush.current();
      }, (e: unknown) => {
        if (inflight.current === id) inflight.current = 0;
        store.set({ state: 'error', message: `The field could not be computed: ${e instanceof Error ? e.message : String(e)}` });
      });
    };
    if (dragging) { waiting.current = send; flush.current(); return; }
    waiting.current = null;
    if (timer.current) { clearTimeout(timer.current); timer.current = 0; }
    if (store.state === 'off') store.set({ state: 'loading' });
    send();
    // box and thick follow s and v.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, mod, s, v, qty, scaleKind, drive, view, dragging, store, which]);
  return { mod, store, on: on && !!mod };
}
