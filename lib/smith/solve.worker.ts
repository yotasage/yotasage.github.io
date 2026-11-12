// The Smith chart's solver worker (step M4.4a): runs solveJob.ts's jobs off the page's thread. Started by
// solveClient.ts, one worker per channel (the slow solves, the suggestions), after lib/resistor/combine.worker.ts.
// A job cannot be stopped once it runs; a newer request that arrives before it starts replaces it (only the newest
// waiting request is worked on), and the client drops the answer of a request that was overtaken.
//
// In:  { id, job } runs a job; { id, cancel: true } only drops what is waiting.
// Out: { id, reply } or { id, error }.

import { runJob } from './solveJob';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

let current = 0;

scope.onmessage = (event) => {
  const { id, cancel, job } = event.data;
  current = id;
  if (cancel) return;
  // After the messages already waiting: only the newest request is worked on.
  setTimeout(() => {
    if (current !== id) return;
    try {
      scope.postMessage({ id, reply: runJob(job) });
    } catch (error) {
      scope.postMessage({ id, error: String((error && (error as Error).message) || error) });
    }
  }, 0);
};
