// Timings of the combination search in Node: `npm run timing` in this folder. For each series over 1 Ω to 10 MΩ and
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
