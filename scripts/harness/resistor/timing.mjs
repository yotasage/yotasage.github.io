// Timings of the combination search and of the design mode's suggestions in Node: `npm run timing` in this folder. For each series over 1 Ω to 10 MΩ and
// each number of parts: the first search on a list (with its tables), a second target on the same list, and a target
// with very many exact matches. Memory is the resident set after the search.

import * as imported from '../../../lib/resistor/index.ts';

const lib = imported.default ?? imported;
const { seriesList, searchCombinations, clearSearchCache } = lib;

const ms = (value) => `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`.padStart(9);
console.log('series  n     parts  first      next       exact      networks   best error   memory');
for (const id of ['E24', 'E96', 'E192']) {
  const values = seriesList(id);
  for (const maxParts of [2, 3, 4]) {
    clearSearchCache();
    const first = searchCombinations(628.75, values, { maxParts });
    const next = searchCombinations(12345.6, values, { maxParts });
    const exact = searchCombinations(10000, values, { maxParts, allowTarget: false });
    const memory = Math.round(process.memoryUsage().rss / 1048576);
    console.log(`${id.padEnd(6)}  ${String(values.length).padEnd(5)} ${maxParts}     ${ms(first.ms)}  ${ms(next.ms)}  ${ms(exact.ms)}  ${first.considered.toExponential(2).padStart(9)}  ${(Math.abs(first.best[maxParts].errorPct).toExponential(1) + ' %').padStart(11)}  ${memory} MB`);
  }
}

// The suggestions of the design mode for circuits with two resistances: each resistance one value ("1") or up to
// two ("2"). First: with the table of two-value legs; next: another target on the same list; none: nothing passes.
const { suggestParts, clearSuggestCache } = lib;
const thick = { tolerancePct: 1, tcrPpm: 100 };
const thin = { tolerancePct: 0.1, tcrPpm: 25 };
const designs = [
  ['divider 5 V to 3.3 V', { id: 'divider', inputs: { vin: 5 } }, 3.3, {}],
  ['divider 5 V to 2.5 V (many exact)', { id: 'divider', inputs: { vin: 5 } }, 2.5, {}],
  ['divider 12 V to 5 V, 47 k load ±10 %', { id: 'divider', inputs: { vin: 12, load: 47e3 }, tolerances: { load: 10 } }, 5, {}],
  ['divider, 10 k to 100 k in all', { id: 'divider', inputs: { vin: 5 } }, 3.3, { ranges: { total: { min: 10e3, max: 100e3 } } }],
  ['divider, a current no pair draws', { id: 'divider', inputs: { vin: 5 } }, 3.3, { ranges: { current: { min: 100, max: 200 } } }],
  ['feedback 0.8 V to 3.3 V', { id: 'feedback', inputs: { vref: 0.8 } }, 3.3, {}],
  ['feedback with 1 µA, 2 % reference', { id: 'feedback', inputs: { vref: 0.8, ifb: 1e-6 }, tolerances: { vref: 2 } }, 3.3, {}],
  ['non-inverting gain 11', { id: 'noninverting', inputs: {} }, 11, {}],
  ['inverting gain −4.7', { id: 'inverting', inputs: {} }, -4.7, {}],
  ['inverting gain, 5 % parts (lopsided)', { id: 'inverting', inputs: {} }, -4.7, { spec: { tolerancePct: 5, tcrPpm: 500 }, allowedPct: 21.25 }],
];
console.log('\nsuggestions                              series legs  first      next       none       pairs      passing');
for (const id of ['E24', 'E96', 'E192']) {
  const values = seriesList(id);
  for (const legParts of [1, 2]) {
    for (const [name, circuit, target, extra] of designs) {
      clearSuggestCache();
      const first = suggestParts(circuit, target, values, { spec: thick, allowedPct: 3, legParts, ...extra });
      const next = suggestParts(circuit, target * 1.0137, values, { spec: thin, allowedPct: 0.3, legParts, drift: 'tracking', trackingPpm: 10, ...extra, ...(extra.spec ? { allowedPct: 21.25 } : {}) });
      const none = suggestParts(circuit, target, values, { spec: thick, allowedPct: 0.5, legParts, ...extra, ...(extra.spec ? { allowedPct: 15 } : {}) });
      console.log(`${name.padEnd(40)} ${id.padEnd(6)} ${legParts}     ${ms(first.ms)}  ${ms(next.ms)}  ${ms(none.ms)}  ${first.considered.toExponential(2).padStart(9)}  ${first.passing}/${next.passing}/${none.passing}`);
    }
  }
}
clearSuggestCache();
