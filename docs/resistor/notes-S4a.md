# Resistor lookup – notes from S4a (the design-mode engine)

Step S4a (2026-11-11): library only, exported by the index; checked by `design.mjs` (428 checks).

## Parts (`technology.ts`)

A part is R·(1 + d)·(1 + a·(T − 25 °C)), d within ± tolerance, a within ± TCR. `PartSpec` is `{ tolerancePct, tcrPpm }`,
one for all resistors of a circuit. `TECHNOLOGIES` (`technology(id)`): seven presets with their usual ranges.

## Circuits (`circuits.ts`)

A `Circuit` is `{ id, inputs, tolerances? }`: values by input id in V, A, Ω; `tolerances` is ± percent per input id.
`CIRCUITS` / `circuitDef(id)`: label, formula, legs with their role, inputs (unit, optional, initial), output.

| id | Legs | Inputs | Output (target) |
| --- | --- | --- | --- |
| `single-current` | R | `volts`, `drop` (optional) | A = (volts − drop) / R |
| `single-voltage` | R | `amps` | V = amps · R |
| `shunt` | R | `amps` | V (sense) = amps · R |
| `divider` | R1 top, R2 bottom | `vin`, `load` (Ω, optional, across R2) | V = vin · (R2 ∥ load) / (R1 + R2 ∥ load) |
| `feedback` | R1 output to pin, R2 across the reference | `vref`, `ifb` (A, optional) | V = vref · (1 + R1/R2) + ifb · R1 |
| `noninverting` | R1 feedback, R2 to ground | `vin` (optional, for power only) | gain 1 + R1/R2 |
| `inverting` | R1 input, R2 feedback | `vin` (optional) | gain −R2/R1 (negative) |

`circuitOutput(circuit, legs)`, `idealResistance(circuit, target, leg?, otherOhms?)`, `circuitProblem(circuit, target)`
(a sentence or null), `deviationPct(value, target)`. `legs` is one `Network` of S3a for each resistance.

## Analysis (`design.ts`)

`analyseCircuit(circuit, legs, target, options)`; `circuitSpread(...)` is the same without the loads.
Options: `spec`, `temperatures`, `reference` (25), `drift` (`'independent'` or `'tracking'`), `trackingPpm`,
`allowedPct`, `chipSize` (imperial name, default `'0603'`).

- Result: `nominal`, `errorPct`, `points[]` per temperature (`min`, `max`, `minPct`, `maxPct`, `worstPct`, `rssPct`,
  `rssWorstPct`, `margin`, `rssMargin`), `worst` (index), `passes`, `margin`, `rssPasses`, `rssMargin` (null without
  `allowedPct`), `contributions`, `parts[]` (`name` R1 or R1a, `volts`, `amps`, `watts`, `rating[]` per temperature
  with `watts` left and `loadPct`, `carries`, `smallest` chip at the hottest temperature), `quantities[]`, `problem`.
- Corners (header of `design.ts`): the end of each variable is found by moving it alone from the nominal point,
  then each is flipped once more and kept if the output goes further.
- `'tracking'`: one drift within ± TCR for all parts, plus each part's own within ± `trackingPpm`/2. It cancels in
  a divider and a gain, not in a single resistance, a loaded divider or a feedback with pin current.
- RSS: root of the squares of each variable's effect alone (tolerance and drift of a part count separately);
  uniform random parts have a standard deviation of `rss`/√3.
- `smallestChip(watts, temperature)`, `chipSize(name)`. Power is nominal; ratings are typical, without margin.

## Suggestions (`suggest.ts`)

`suggestParts(circuit, target, values, options)` → `{ candidates, best[n], passing, needed, ideal, considered, ms, note }`.
Options: those of the analysis with `allowedPct` required, `maxParts` (one resistance: 1 to 4, default 2), `legParts`
(two resistances: 1 or 2 parts in each, default 1), `connections`, `reuse` (false: no value twice in the circuit),
`keep` (20, for each number of parts), `ranges` `{ R1, R2, total, current }` (each `{ min?, max? }`; `current` is the
divider's input current, `vref`/R2 for the feedback, the signal current of a gain), `preferTotal`.

- A `Candidate`: `legs`, `ohms`, `parts`, `distinct`, `output`, `errorPct`, at the worst `temperature` `minPct`,
  `maxPct`, `worstPct`, `rssPct`; `passes`, `margin`, `rssPasses`, `rssMargin`, `total`, `current`. Call
  `analyseCircuit` for the one that is opened.
- Ranking: candidates that pass the worst case at every temperature first (fewer parts, then the smaller nominal
  error, then the sum nearest `preferTotal`: the middle of `ranges.total`, else 20 kΩ); then the others by margin
  (least outside first), then fewer parts. RSS never decides.
- `needed` (only when nothing passes): `{ candidate, spec, why }` for the candidate closest nominally.
  `why`: `'tighter'` (`spec` is the tolerance and TCR to buy), `'nominal'` (the values are too far off), `'fixed'`
  (input tolerances or tracking spread alone are outside), `'beyond'` (tighter than 0.005 %, 1 ppm/K).
  `neededSpec(circuit, legs, target, options)` does the same for any candidate.

## Timings (Node 26, 1 Ω to 10 MΩ) and limits

| Legs | E24 | E96 | E192 |
| --- | --- | --- | --- |
| One value each | 1 ms | 1 ms | 3 ms |
| Up to two values each, first / next | 25 / 18 ms | 65–350 / 35–160 ms | 0.4–1.4 / 0.2–1.0 s |

- Two-value legs with E192 are too slow for every keystroke (the call is synchronous): debounce, or offer them up
  to E24∪E96. Above `MAX_PAIR_LEG_VALUES` (1400) values the legs are single values and `note` says so.
  `clearSuggestCache()` drops the table of two-value legs (6 MB for E96, 22 MB for E192).
- A shunt needs a list that reaches down: `seriesList('E24', 0.001, 1)`.

## What the page must not get wrong

- Percentages are of the **target**, and `minPct`/`maxPct` include the nominal error. Positive is above the target;
  for a negative gain, −10.1 against −10 is −1 %.
- `rssPct` is a ± around the nominal output; `rssWorstPct` adds the nominal error. `passes` is the worst case over
  all temperatures: show `rssPasses` beside it, never instead.
- The feedback's R2 is the resistor the reference stands across (LM317: the one from OUT to ADJ); a positive `ifb`
  raises the output. In the inverting gain R2 is the feedback resistor, in the non-inverting gain R1.
- A missing, zero or negative `load` is no load. A shunt value typed directly: target = amps × that value.
- Without candidates, show `note`.
