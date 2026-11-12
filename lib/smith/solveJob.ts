// What the solver's worker does (step M4.4a), framework-free so Node (the harness) and the page's fallback run the same
// function: a solve of the circuit's ask (state.ts), or the suggestions for its goal (suggest.ts). The worker
// (solve.worker.ts) and its client (solveClient.ts) only carry these requests and replies.

import { solve } from './solve';
import type { SolveResult } from './solve';
import { suggest } from './suggest';
import type { SuggestOptions, Suggestions } from './suggest';
import { askOf } from './state';
import type { Circuit } from './state';

export type SolveJob =
  | { kind: 'solve'; circuit: Circuit }
  | { kind: 'suggest'; circuit: Circuit; options?: SuggestOptions };

export type SolveReply =
  | { kind: 'solve'; result: SolveResult; ms: number }
  | { kind: 'suggest'; suggestions: Suggestions; ms: number };

/**
 * Runs a job. A solve's result crosses to the page by structured clone, so a family's `at` (a closure into the
 * solver's module state) cannot: a family comes back with `family` null and its ranges (the worker only gets problems
 * of the fallback search, whose families have no `at`; a page that needs `at` solves on the page).
 */
export function runJob(job: SolveJob): SolveReply {
  const t = performance.now();
  if (job.kind === 'suggest') {
    const suggestions = suggest(job.circuit, askOf(job.circuit).goal, job.options);
    return { kind: 'suggest', suggestions, ms: performance.now() - t };
  }
  const ask = askOf(job.circuit);
  const result = solve(job.circuit, ask.unknowns, ask.goal);
  if (result.family) result.family = null;
  return { kind: 'solve', result, ms: performance.now() - t };
}
