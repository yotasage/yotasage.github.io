// The Smith chart's refined sweep off the page's main thread (step M7.2a): a circuit and a band in, the refined trace
// (sweep.ts runSweep with REFINE_DEFAULTS) and its path `d` (pathData) out, so neither the sweep (15.7 ms for 10,000
// points of 10 parts at 4× CPU, notes-M7.1.md) nor the `d` of 10,000 points costs the page a frame. M7.2b: also the
// plot's two paths (plot.ts plotPath: return loss and VSWR) and the band figures (bandFigures at the request's |Γ|
// threshold), computed on the refined trace only. As solve.worker.ts: only the newest request is worked on.

import { plotPath } from './plot';
import { REFINE_DEFAULTS, Trace, bandFigures, pathData, runSweep, sweepCircuit } from './sweep';
import type { Band, SweepReply } from './sweep';
import type { Circuit } from './network';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

let current = 0;
const trace = new Trace(1024);

scope.onmessage = (event) => {
  const { id, circuit, band, threshold } = event.data as { id: number; circuit: Circuit; band: Band; threshold: number };
  current = id;
  // After the messages already waiting: only the newest request is worked on.
  setTimeout(() => {
    if (current !== id) return;
    const t0 = performance.now();
    const sc = sweepCircuit(circuit);
    runSweep(trace, band, sc, REFINE_DEFAULTS);
    const n = trace.n, freqs = trace.freqs.slice(0, n), gamma = trace.gamma.slice(0, 2 * n);
    const { start, stop, log } = band;
    const reply: SweepReply = {
      id, n, base: trace.base, freqs, gamma, d: pathData(gamma, n),
      plot: { rl: plotPath(freqs, gamma, n, start, stop, log, false), vswr: plotPath(freqs, gamma, n, start, stop, log, true) },
      figures: bandFigures(trace, sc, threshold),
      ms: performance.now() - t0,
    };
    scope.postMessage(reply, [freqs.buffer, gamma.buffer]);
  }, 0);
};
