// Timing checks of the engine harness on a busy machine (notes-M5.3.md, Fixes): a measurement over its budget is taken
// again, up to three times in all, and the check passes if any attempt is within the budget, as the ui scripts do with
// their frame rates. The budgets are not loosened: a real slowdown is over in every attempt. The check's text names
// the attempt that passed, or that all three were over.

/** Measures until `within(value)` holds, at most `attempts` times; the last value and how many measurements it took. */
export function retried(measure, within, attempts = 3) {
  let value, tries = 0;
  do { value = measure(); tries++; } while (!within(value) && tries < attempts);
  return { value, tries, note: tries > 1 ? ` [attempt ${tries} of ${attempts}${within(value) ? '' : ', all over'}]` : '' };
}
