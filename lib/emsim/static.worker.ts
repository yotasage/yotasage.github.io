// The EM simulation tool's static worker (engine.md §10): 2D solves, sweeps, corners, Monte Carlo, the inverse solve
// and field maps; the axisymmetric solver and the via model join it in M1.6–M1.7. The protocol and the work are in
// jobs.ts (`createStaticHandler`), which the client also runs on the page when no worker can be made.

import { createStaticHandler, messageScheduler } from './jobs';
import type { StaticRequest } from './jobs';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const handle = createStaticHandler((msg, transfer) => scope.postMessage(msg, transfer ?? []), messageScheduler());

scope.onmessage = (event) => handle(event.data as StaticRequest);
