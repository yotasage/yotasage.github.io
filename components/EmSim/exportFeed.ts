// What the Export section (M8.1b) can draw besides the setup itself: the field maps and plots the page already has,
// handed over by the parts that make them, so the export never solves anything itself. In the first load (a few
// lines); the Export chunk reads it with useExportFeed.
//   traceMap  the Trace drawing's field map once it is done (not while it refines, not the theory's figures)
//   viaSide, viaTop  the Via section's two maps once done
//   sweep     the Sweep tool's plots of its last finished run for the shown setup
//   via       the Via section's TDR, TDT and S-parameter plots of its last full solve (not while stale)
// M8.2a: the raw results behind them, for the Data group's CSV and Touchstone (types only here):
//   trace     the Trace section's line results of the shown setup (not while stale, quick or dragging)
//   sweepRun  the Sweep tool's finished run for the shown setup
//   viaRun    the Via section's full via model result while not stale

import { useSyncExternalStore } from 'react';

import type { SweepRun } from '../../lib/emsim/export/csv';
import type { PlotSpec } from '../../lib/emsim/figure/plot';
import type { SolveResult } from '../../lib/emsim/jobs';
import type { Issue } from '../../lib/emsim/stackup';
import type { ViaModelResult } from '../../lib/emsim/viamodel';
import type { Painted } from './fieldPaint';

/** M8.2a: what opening a project file (picker or drop, EmSimTool's openText) came to, shown in the Data group. */
export interface OpenedNote { name: string; ok: boolean; message: string; issues: Issue[]; at: number }
export type OpenText = (text: string, name: string, dropped?: boolean) => void;

export interface FedPlot { id: string; label: string; spec: PlotSpec }
export interface ExportFeed {
  traceMap: Painted | null;
  viaSide: Painted | null;
  viaTop: Painted | null;
  sweep: FedPlot[];
  via: FedPlot[];
  trace: SolveResult | null;
  sweepRun: SweepRun | null;
  viaRun: ViaModelResult | null;
}

let feed: ExportFeed = { traceMap: null, viaSide: null, viaTop: null, sweep: [], via: [], trace: null, sweepRun: null, viaRun: null };
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
const EMPTY: ExportFeed = { traceMap: null, viaSide: null, viaTop: null, sweep: [], via: [], trace: null, sweepRun: null, viaRun: null };

export function useExportFeed(): ExportFeed {
  return useSyncExternalStore(sub, snap, () => EMPTY);
}
