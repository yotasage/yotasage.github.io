// What the Export section (M8.1b) can draw besides the setup itself: the field maps and plots the page already has,
// handed over by the parts that make them, so the export never solves anything itself. In the first load (a few
// lines); the Export chunk reads it with useExportFeed.
//   traceMap  the Trace drawing's field map once it is done (not while it refines, not the theory's figures)
//   viaSide, viaTop  the Via section's two maps once done
//   sweep     the Sweep tool's plots of its last finished run for the shown setup
//   via       the Via section's TDR, TDT and S-parameter plots of its last full solve (not while stale)

import { useSyncExternalStore } from 'react';

import type { PlotSpec } from '../../lib/emsim/figure/plot';
import type { Painted } from './fieldPaint';

export interface FedPlot { id: string; label: string; spec: PlotSpec }
export interface ExportFeed {
  traceMap: Painted | null;
  viaSide: Painted | null;
  viaTop: Painted | null;
  sweep: FedPlot[];
  via: FedPlot[];
}

let feed: ExportFeed = { traceMap: null, viaSide: null, viaTop: null, sweep: [], via: [] };
const subs = new Set<() => void>();

export function feedExport(part: Partial<ExportFeed>): void {
  let changed = false;
  for (const k of Object.keys(part) as (keyof ExportFeed)[]) if (feed[k] !== part[k]) changed = true;
  if (!changed) return;
  feed = { ...feed, ...part };
  for (const f of Array.from(subs)) f();
}

const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const snap = () => feed;
const EMPTY: ExportFeed = { traceMap: null, viaSide: null, viaTop: null, sweep: [], via: [] };

export function useExportFeed(): ExportFeed {
  return useSyncExternalStore(sub, snap, () => EMPTY);
}
