// The worker of the combination search. It only runs `searchSteps` in slices; between two slices it receives its
// messages, so a newer search (or a cancel) stops the running one. Started by combineClient.ts.
//
// In:  { id, target, values, options } starts a search; { id, cancel: true } only stops the running one.
// Out: { id, progress } (0 to 1), then { id, result } or { id, error }. A search that was stopped sends nothing.

import { runSearch, searchSteps } from './combine';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

// The worker computes for this long before it looks for a new message.
const SLICE_MS = 60;

let current = 0;

scope.onmessage = (event) => {
  const { id, cancel, target, values, options } = event.data;
  current = id;
  if (cancel) return;
  runSearch(searchSteps(target, values, options), SLICE_MS, (progress) => scope.postMessage({ id, progress }), () => current !== id)
    .then((result) => {
      if (result) scope.postMessage({ id, result });
    })
    .catch((error) => scope.postMessage({ id, error: String((error && error.message) || error) }));
};
