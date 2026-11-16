// The field view's jobs (M2.2): the worker's `field` job on its own channel for the part of the section the view
// shows, at 2 px per grid point, progressive (coarse first; each partial grid is drawn as it comes). While a handle is
// dragged the job is a coarse one (8 px per point; evaluating every point directly is slower than the progressive
// lattice, 55 against 15 ms in Node for C39) and a new one is sent only when the
// last has come back, keeping the newest edit waiting (and at most one every DRAG_GAP_MS): newest-wins cancelling would starve the map while every frame
// brings a new setup. The solve options are the trace solve's (fast path included), so the worker's solve cache serves
// the field job. Settings that do not change the job (the scale) come back from the client's cache at once.
// What arrives goes into a FieldStore, not React state: the drawing does not render again for a new map, only the
// canvas (drawn by a listener) and the few parts that subscribe (overlay, scale bar, probe).

import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { View as GridView } from '../../lib/emsim/fields';
import type { Section } from '../../lib/emsim/geometry';
import type { FieldJob, FieldResult } from '../../lib/emsim/jobs';
import type { SolveOptions } from '../../lib/emsim/lines';
import type { Stackup } from '../../lib/emsim/stackup';
import type { StaticClient } from '../../lib/emsim/staticClient';
import type { Structure } from '../../lib/emsim/structure';
import type { ViaStructure } from '../../lib/emsim/via';
import type { Painted } from './fieldPaint';
import type { FieldSettings } from './fieldTypes';
import { driveOf, isMagnetic } from './fieldTypes';
import type { View } from './panZoom';
import type { WorldMap } from './traceGeom';

export interface FieldEnv { client: () => Promise<StaticClient>; via: ViaStructure; opt?: SolveOptions; channel?: string } // channel: the theory's figures each have their own (M2.4c)
export type FieldMod = typeof import('./fieldPaint');
export type FieldState = 'off' | 'loading' | 'partial' | 'done' | 'error';

const STEP_PX = 2; // px per grid point (engine.md §10's 1440 px budget is measured at 2 px per point)
const DRAG_STEP_PX = 8;
const DRAG_GAP_MS = 40; // a drag's coarse maps at most this often: the map follows within 100 ms, and at 4× CPU a map
// every frame cost about a third of the frame budget (notes-M2.2.md)

/** The grid of the view's part of the section, one point every step px (the view's y is the world's: Y(z)). */
export function gridView(v: View, map: WorldMap, sec: Section, step: number): GridView | null {
  const hw = v.w / (2 * v.k), hh = v.h / (2 * v.k);
  const x0 = Math.max(v.cx - hw, -sec.ext), x1 = Math.min(v.cx + hw, sec.ext);
  const z1 = Math.min(map.Z(v.cy - hh), sec.zHi), z0 = Math.max(map.Z(v.cy + hh), sec.zLo);
  if (!(x1 > x0 && z1 > z0)) return null;
  const nx = Math.max(2, Math.round(((x1 - x0) * v.k) / step) + 1);
  const ny = Math.max(2, Math.round(((map.Y(z0) - map.Y(z1)) * v.k) / step) + 1);
  return { x0, x1, z0, z1, nx, ny };
}

/** The newest map and the view's state; subscribers are called on every change. */
export class FieldStore {
  painted: Painted | null = null;
  state: FieldState = 'off';
  message = '';
  version = 0;
  private ls = new Set<() => void>();
  sub = (f: () => void): (() => void) => { this.ls.add(f); return () => { this.ls.delete(f); }; };
  snap = (): number => this.version;
  set(x: { painted?: Painted | null; state?: FieldState; message?: string }): void {
    if (x.painted !== undefined) this.painted = x.painted;
    if (x.state !== undefined) this.state = x.state;
    if (x.message !== undefined) this.message = x.message;
    this.version++;
    for (const f of Array.from(this.ls)) f();
  }
}

interface Stat { requests: number; paints: { kind: 'partial' | 'done'; ms: number; at: number; drag: boolean; nx: number; cached: boolean }[] }

export function useFieldMap(f: FieldSettings | undefined, env: FieldEnv | undefined, s: Stackup, st: Structure, sec: Section | null, view: View, map: WorldMap, dragging: boolean, box: React.RefObject<HTMLDivElement | null>) {
  const on = !!(f && f.on && env && sec);
  const [mod, setMod] = useState<FieldMod | null>(null);
  const [store] = useState(() => new FieldStore());
  const onRef = useRef(on);
  onRef.current = on;
  useEffect(() => {
    if (!on || mod) return;
    let live = true;
    // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
    void (import('./fieldPaint') as Promise<FieldMod>).then((m) => { if (live) setMod(m); });
    return () => { live = false; };
  }, [on, mod]);
  useEffect(() => {
    const el = box.current as unknown as { emsimField?: Stat } | null;
    if (el && !el.emsimField) el.emsimField = { requests: 0, paints: [] };
  }, [box]);

  const inflight = useRef(0); // id of the job sent, 0 when none
  const waiting = useRef<(() => void) | null>(null);
  const lastSend = useRef(0);
  const timer = useRef(0);
  // Sends the waiting job when none is in flight and the gap since the last has passed.
  const flush = useRef(() => {});
  flush.current = () => {
    if (timer.current || inflight.current || !waiting.current) return;
    const wait = DRAG_GAP_MS - (performance.now() - lastSend.current);
    const go = () => { timer.current = 0; if (inflight.current) return; const w = waiting.current; waiting.current = null; if (w && onRef.current) w(); };
    if (wait > 0) timer.current = window.setTimeout(go, wait);
    else go();
  };
  const nextId = useRef(0);
  const n = sec ? sec.signals : 1;
  const qty = f?.qty ?? 'E', scaleKind = f?.scale ?? 'linear';
  const drive = f ? JSON.stringify(driveOf(f, n)) : '';
  useEffect(() => {
    if (!on || !mod || !sec || !env || !f) {
      if (!on && store.state !== 'off') { store.set({ painted: null, state: 'off', message: '' }); waiting.current = null; }
      return;
    }
    const surfaceOnly = qty === 'charge' || qty === 'current';
    const gv = surfaceOnly ? { x0: -1, x1: 1, z0: sec.zLo, z1: sec.zHi, nx: 2, ny: 2 } : gridView(view, map, sec, dragging ? DRAG_STEP_PX : STEP_PX);
    if (!gv) { store.set({ painted: null }); return; }
    const job: FieldJob = {
      kind: 'field',
      setup: { stackup: s, trace: st, via: env.via },
      ...(env.opt ? { opt: env.opt } : {}),
      field: isMagnetic(qty) ? 'H' : 'E',
      drive: JSON.parse(drive),
      view: gv,
      contours: qty === 'phi' || qty === 'lines' || qty === 'H' ? 10 : 0,
      lines: qty === 'lines' ? { count: 24 } : null,
    };
    const stat = () => (box.current as unknown as { emsimField?: Stat } | null)?.emsimField;
    const t0 = performance.now(); // the request (a drag's edit), not the send: a waiting job's time counts
    const send = (): void => {
      const id = (nextId.current += 1);
      inflight.current = id;
      lastSend.current = performance.now();
      const st0 = stat();
      if (st0) st0.requests++;
      const record = (kind: 'partial' | 'done', cached: boolean) => {
        const sx = stat();
        if (sx) { sx.paints.push({ kind, ms: performance.now() - t0, at: performance.now(), drag: dragging, nx: gv.nx, cached }); if (sx.paints.length > 4000) sx.paints.shift(); }
      };
      void env.client().then((c) => c.run<FieldResult>(env.channel ?? 'field', job, (_d, _t, partial) => {
        if (!onRef.current || inflight.current !== id || !partial || surfaceOnly || dragging) return; // a drag's map is drawn when done
        store.set({ painted: mod.prepare(partial as FieldResult['grid'] & object, qty, scaleKind), state: 'partial' });
        record('partial', false);
      })).then((rr) => {
        if (inflight.current === id) inflight.current = 0;
        if (rr && onRef.current) {
          const r = rr.result;
          if (r.ok && r.grid) {
            store.set({ painted: mod.prepare(r.grid, qty, scaleKind, { contours: r.contours, lines: r.lines, surface: r.surface }), state: 'done', message: '' });
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
  }, [on, mod, sec, env, s, st, qty, scaleKind, drive, view, map, dragging, store]);
  return { mod, store, on: on && !!mod };
}
