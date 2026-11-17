// What the Theory section prints its live numbers from (step M2.4c): the results the page already has, handed over by
// the sections that make them, so the theory never solves anything itself. In the first load (a few lines); the
// Theory chunk reads it with useTheoryFeed.
//   result   the Trace section's last full solve (not a coarse one while dragging) and the setup it is for
//   calc     the Calculators tool's last complete run: the field value, the value "as JLCPCB's calculator" and each part
//   corners  the Tolerance tool's ranking and worst-case corners, mc its last Monte Carlo run
//   via      the Via section's last full solve and the via it is for (M4.3b; not a drag's coarse frames)
//   waves    the Waves section's estimate (fullwave.preview) for its setup and choices, and its last run while that is
//            for the same setup and choices (M7.2d)
// Each entry keeps the setup it belongs to; the theory shows a tool's numbers only while they are for the shown setup.

import { useSyncExternalStore } from 'react';

import type { JlcPart } from '../../lib/emsim/jlcCalc';
import type { LineResults } from '../../lib/emsim/lines';
import type { Setup } from '../../lib/emsim/setup';
import type { CornersResult, McResult } from '../../lib/emsim/vary';
import type { ViaStructure } from '../../lib/emsim/via';
import type { ViaModelResult } from '../../lib/emsim/viamodel';
import type { Preview, WavesSpec } from '../../lib/emsim/fullwave';
import type { FdtdResult } from '../../lib/emsim/fdtd/job';

export interface FedCalc { setup: Setup; stackup: number; calculator: number; parts: Partial<Record<JlcPart, number>> }
export interface TheoryFeed {
  result: { setup: Setup; r: LineResults } | null;
  calc: FedCalc | null;
  corners: { setup: Setup; r: CornersResult } | null;
  mc: { setup: Setup; r: McResult } | null;
  via: { r: ViaModelResult; v: ViaStructure } | null;
  waves: { setup: Setup; spec: WavesSpec; pv: Preview; res: FdtdResult | null } | null;
}

let feed: TheoryFeed = { result: null, calc: null, corners: null, mc: null, via: null, waves: null };
const subs = new Set<() => void>();

export function feedTheory(part: Partial<TheoryFeed>): void {
  feed = { ...feed, ...part };
  for (const f of subs) f();
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const get = () => feed;

export function useTheoryFeed(): TheoryFeed {
  return useSyncExternalStore(subscribe, get, get);
}
