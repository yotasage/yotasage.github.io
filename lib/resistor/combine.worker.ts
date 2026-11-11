// The worker of the combination search and of the design mode's suggestions. A search runs `searchSteps` in slices;
// between two slices the worker receives its messages, so a newer search (or a cancel) stops the running one. The
// suggestions are one call that cannot be stopped: a newer request that arrives before a call starts replaces it,
// and the client drops the answer of a call that was overtaken. Started by combineClient.ts and designClient.ts,
// each with a worker of its own.
//
// In:  { id, target, values, options } starts a search; { id, suggest: { circuit, target, values, options } } asks
//      for suggestions; { id, cancel: true } only stops what is running or waiting.
// Out: { id, progress } (0 to 1), then { id, result }, { id, suggestions } or { id, error }. A search that was
//      stopped sends nothing.

import { runSearch, searchSteps } from './combine';
import { suggestParts } from './suggest';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
};

// The worker computes for this long before it looks for a new message.
const SLICE_MS = 60;

let current = 0;

scope.onmessage = (event) => {
  const { id, cancel, suggest, target, values, options } = event.data;
  current = id;
  if (cancel) return;
  if (suggest) {
    // After the messages that are already waiting: only the newest request is worked on.
    setTimeout(() => {
      if (current !== id) return;
      try {
        scope.postMessage({ id, suggestions: suggestParts(suggest.circuit, suggest.target, suggest.values, suggest.options) });
      } catch (error) {
        scope.postMessage({ id, error: String((error && (error as Error).message) || error) });
      }
    }, 0);
    return;
  }
  runSearch(searchSteps(target, values, options), SLICE_MS, (progress) => scope.postMessage({ id, progress }), () => current !== id)
    .then((result) => {
      if (result) scope.postMessage({ id, result });
    })
    .catch((error) => scope.postMessage({ id, error: String((error && error.message) || error) }));
};
