// Timing checks of the engine harness on a busy machine (notes-M5.3.md, Fixes): a measurement over its budget is taken
// again, up to three times in all, and the check passes if any attempt is within the budget, as the ui scripts do with
// their frame rates. The budgets are not loosened: a real slowdown is over in every attempt. The check's text names
// the attempt that passed, or that all three were over.

import { cpus } from 'node:os';

/** Measures until `within(value)` holds, at most `attempts` times; the last value and how many measurements it took. */
export function retried(measure, within, attempts = 3) {
  let value, tries = 0;
  do { value = measure(); tries++; } while (!within(value) && tries < attempts);
  return { value, tries, note: tries > 1 ? ` [attempt ${tries} of ${attempts}${within(value) ? '' : ', all over'}]` : '' };
}

// ---------- the page's frame budgets (engine.md §9, step M9.3) ----------
// Checked on a production build (`next build` + `next start`, what visitors run: `npm run ui -- --prod`). On a dev
// server (React's development build) the same frames cost more and the main-thread budgets are multiplied by
// devFactor: the dev/production ratio of the median 4× frames on a fresh server in M9.3 was 1.07–1.08 for a drag and
// 0.97–1.0 for a zoom (notes-M9.3.md). The page's frame at 4× must fit 16 ms; main4 is the guard below that which a
// step may not cross: 12 ms for a drag of the 10-part circuit (M9.3 on production: 9.9–11.5 ms), 7 ms for a zoom
// (5.2–6.6 ms). A step's own cost is judged by an interleaved A/B with ui-perf.mjs, not by these absolute numbers.
export const BUDGET = {
  devFactor: 1.1,
  // script: the drag layer's own script per frame, p95 (pathLayer.lastMs).
  drag: { main4: 12, script1: 1, script4: 4, lost1: 0, lost4: 1, scriptAt: 0.95 },
  // script: the chart's own script per frame, p50 (chartView.lastWorkMs; a frame with a grid rebuild is the p95).
  zoom: { main4: 7, script1: 0.5, script4: 0.5, lost1: 0, lost4: 1, scriptAt: 0.5 },
};

/** The limits of `act` ('drag' or 'zoom') at CPU `rate` for a page of `build` ('production' or 'development'). */
export function budgetFor(build, act, rate) {
  const b = BUDGET[act], f = build === 'development' ? BUDGET.devFactor : 1;
  return { main: rate === 1 ? 0 : b.main4 * f, script: rate === 1 ? b.script1 : b.script4, scriptAt: b.scriptAt, lost: rate === 1 ? b.lost1 : b.lost4 };
}

/** 'development' under `next dev`, else 'production' (a `next build` served by `next start` or as static files). */
export const buildOf = (page) => page.evaluate(() => (window.__NEXT_DATA__?.buildId === 'development' ? 'development' : 'production'));

/** The machine's CPU load in % over `ms` (all cores, from os.cpus() times). */
export async function machineLoad(ms = 1000) {
  const sum = () => cpus().reduce((a, c) => { const t = c.times; a.busy += t.user + t.nice + t.sys + t.irq; a.all += t.user + t.nice + t.sys + t.irq + t.idle; return a; }, { busy: 0, all: 0 });
  const a = sum();
  await new Promise((r) => setTimeout(r, ms));
  const b = sum();
  return (100 * (b.busy - a.busy)) / Math.max(1, b.all - a.all);
}
