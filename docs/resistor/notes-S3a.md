# Resistor lookup – notes from S3a (the combination search engine)

Library only, nothing on the page yet. Exported by `lib/resistor/index.ts`, except the worker file.

## Networks (`network.ts`) and analysis (`analyse.ts`)

- `Network` is `{ kind: 'r', ohms }` or `{ kind: 'series' | 'parallel', parts: Network[] }`; made by `resistorNet(ohms)`,
  `seriesNet(parts)`, `parallelNet(parts)`.
- `networkValue(net)`, `networkLeaves(net)` (values in formula order), `networkStats(net)` → `{ parts, distinct, depth }`.
- `networkFormula(net, { names?, write? })` → `560 Ω + (100 Ω ∥ 220 Ω)` or `R1 + (R2 ∥ R3)`; `write` replaces `formatOhms`.
- `networkKey(net)` → `s(560,p(100,220))`, the same for every order of the parts; `canonicalNetwork(net)`.
- `networkLayout(net)` → `{ width, height, resistors: [{ index, ohms, x, y }], wires: [[x1, y1, x2, y2]] }` in units:
  a resistor lies from (x, y) to (x + 1, y), a row is 1 high, the terminals are at (0, height/2) and (width, height/2),
  wires are horizontal or vertical. At most 4 × 4 units. `index` 0 is R1 of the formula.
- `networkShares(net)` → per resistor `{ ohms, voltage, current, power }` as fractions (the powers add up to 1).
- `networkLoad(net, { volts } | { amps })` → `{ ohms, volts, amps, watts, parts: [{ ohms, volts, amps, watts, share }] }`.
- `networkTolerance(net, pct | pct[])` → `{ nominal, low, high, minusPct, plusPct, worstPct, rssPct, sensitivities }`.
  With one tolerance for all parts the worst case always equals it; only the RSS differs between networks.

## Value lists (`values.ts`)

- `seriesList(id, min = 1, max = 1e7)`; `cleanValues(values)` (positive, sorted, each once).
- `parseValueList(text)` → `{ values, rejected, duplicates, entries }`. Commas, semicolons, spaces and lines separate;
  S3b added the decimal comma (`4,7k 10k`, see [notes-S3b.md](notes-S3b.md)). `4.7 kΩ` is one entry. 472 is 472 Ω;
  markings and colours are rejected.

## Search (`combine.ts`)

`searchCombinations(target, values, options)` → `SearchResult`; `values` need not be sorted.

| Option | Default | |
| --- | --- | --- |
| `maxParts` | 2 | 1 to 4 |
| `connections` | `'mixed'` | `'series'` or `'parallel'` (plain groups only), `'mixed'` (every shape) |
| `reuse` | true | false: a value at most once in a network |
| `allowTarget` | true | false: the single resistor equal to the target is left out |
| `maxErrorPct` | none | results further off are not reported |
| `keep` | 50 | 1 to 1000, for the ranked list and for each number of parts |

- Result: `results` (ranked over all numbers of parts), `byParts[1..4]` (the networks of exactly that many parts, up
  to `keep` each), `best[1..4]`, `considered`, `consideredByParts`, `options` (as used), `values`, `ms`, `note`.
- A `Combination`: `{ network, key, ohms, errorOhms, errorPct, exact, parts, distinct, depth }`; errors are signed and
  0 when `exact` (within 1e-9, relative). Ranking: error (steps of 1e-12), parts, depth, distinct values.
- With many exact matches `results` holds only the simplest: show `best` or `byParts` too.
- `searchSteps(...)` is the same as a generator (yields progress 0 to 1); `runSearch(steps, sliceMs, onProgress,
  cancelled)` runs it in slices. `clearSearchCache()` drops the pair tables kept for the last list (45 MB for E192).

## Worker (`combineClient.ts`, `combine.worker.ts`)

- `startSearch(target, values, options, onProgress?)` → `Promise<SearchResult | null>`: null when a newer search or
  `cancelSearch()` stopped it; it rejects only on an error. `searchPlace()` → `'worker'` or `'page'`;
  `stopSearchWorker()` when the page is left.
- The worker is made with `new Worker(new URL('./combine.worker.ts', import.meta.url))` under `@ts-expect-error`. A
  build with a page that calls `startSearch` wrote `static/chunks/turbopack-worker-*.js` and the worker's chunks as
  static files. **Not run in a browser yet**: S3b checks that `searchPlace()` is `'worker'` on the dev server and
  in a static build, and that a new search stops the old one.
- Fallback (no `Worker`, or its `onerror`): the same search on the page in 12 ms slices (the tables of E192 block 0.25 s).

## Timings (Node 26, 1 Ω to 10 MΩ, keep 50) and limits

| Series | Values | 2 parts | 3 parts, first / next | 4 parts, first / next | Networks | Memory |
| --- | --- | --- | --- | --- | --- | --- |
| E24 | 169 | 2 ms | 6 / 1 ms | 12 / 7 ms | 1.8e9 | 70 MB |
| E96 | 673 | 1 ms | 60 / 2 ms | 120 / 55 ms | 4.5e11 | 142 MB |
| E192 | 1345 | 1 ms | 240 / 2 ms | 480 / 240 ms | 7.1e12 | 223 MB |

- "First" builds the pair tables. Awkward targets (0.3 Ω, 50 MΩ, 1 TΩ; keep 1000; no reuse) stay under 0.7 s for
  E192 with four parts. Every target of the brief is met: the page can search on each keystroke.
- Limits: 4 parts; above `MAX_SEARCH_VALUES` (2000) values only 1 and 2 parts are searched and `note` says so.

## Harness

`combine.mjs` (run by `npm run check`): 403 checks, with a brute-force enumeration for E12 (1 to 3 parts) and E6
(4 parts), 8 targets, 4 sets of options. `npm run timing` prints the table above.
