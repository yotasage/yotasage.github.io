// The EM simulation tool's full-wave worker (engine.md §10, step M6.2b): runs one FDTD problem at a time in chunks
// with progress, partial records, snapshot frames and cancel. The protocol and the work are in fdtd/job.ts
// (`createFdtdHandler`), which the client also runs on the page when no worker can be made. The WebGPU backend
// (M6.3) joins it here.

import { createFdtdHandler } from './fdtd/job';
import type { FdtdRequest } from './fdtd/job';
import { messageScheduler } from './jobs';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const handle = createFdtdHandler((msg, transfer) => scope.postMessage(msg, transfer ?? []), messageScheduler());

scope.onmessage = (event) => handle(event.data as FdtdRequest);
