# Smith chart – notes of step M4.4a (suggestions engine, the solver worker, BL57)

Part of [plan.md](plan.md); the method is [solver.md](solver.md) "When nothing is marked", the API it builds on
[notes-M4.1b.md](notes-M4.1b.md), the panel [notes-M4.3a.md](notes-M4.3a.md). Checks: `npm run check` (groups
"suggest: …" and "solver worker core" in `check-suggest.mjs`; BL57 and BL58 in `check-validate.mjs`) and `npm run ui`
(`ui-solve.mjs`: the slow solve from the worker). Nothing new on the page but where the slow solves run.

## Suggestions (`lib/smith/suggest.ts`)

`suggest(circuit, goal, { max = 8, lists = defaultChoice(), singlesOnly })` → `{ status, reason, list, singles, pairs }`:

- `holds` when the goal already holds (network.ts at the goal node; `goalHolds`), `rejected` for a bad goal, `none`
  when nothing is offered, else `some`.
- **Singles**: every part before the goal's node, its value as the one unknown (never "free", never a Zc or f0, so
  always the geometric path). A circle goal: the crossing nearest the current value; an inequality goal: the nearest
  edge of a range that keeps it, with `ranges`; a point target: the best value and its mismatch (`meets` false unless
  exact). One per part: the best of its solutions by the ranking below (so a realisable crossing beats a nearer swapped
  one). Solutions that change nothing are left out.
- **Pairs** (point targets only): every two parts before the goal node, the exact solutions that change both (up to
  two per pair). A pair with a circle goal is a family, with no single answer to rank: not offered (**BL59**).
- **Ranking**, deterministic: meets the goal; realisable (no swapped kind); fewer parts changed; for those that do
  not meet it the smaller mismatch (the |Γ| reached for the centre); the smaller change; the parts; the values. The
  change is the solver's `Solution.change`: per changed unknown the distance of its coordinates, atan of the
  normalised added quantity (r, x, g, b, (Zt/Z0)², period π) or 2π per wavelength of a length (period λ/2). So a
  factor of two in a value counts alike anywhere near Z0, and 0 and ∞ are a finite π/2 away. "Meets first" is ahead of
  "realisable first" (solver.md's order for solutions) because a suggestion is there to reach the goal: an exact pair
  ranks before a single that only comes near.
- Each `Suggestion` carries `unknowns` (as solve was asked), `solution` (the solver's `Solution`: values, residual,
  mismatch, |Γ|, realisable, `atF0Only`, changed, change), `meets`, `variants` (values.ts `standardVariants` with the
  lists, computed for the returned ones only), `ranges`, `circleNode` and `circles`, so M4.4b can reuse the panel's
  solution rows, Apply (`applySolution`), previews and the chart's circles.
- **Cost**: no grid search is ever needed (values only), so nothing is excluded or capped for time. Medians
  (check-suggest's timing group): the start circuit with its load at 30 + j10 Ω 0.05–0.08 ms (2 singles, 1 pair);
  ten parts, the centre 0.56–0.83 ms (10 singles, 45 pairs); ten parts, VSWR ≤ 1.5 0.05 ms. 24 parts (the most a
  circuit has) is 276 pairs, about 5 ms, in the worker.

## The solver worker

- `lib/smith/solveJob.ts` `runJob(job)`: `{ kind: 'solve', circuit }` solves the circuit's ask, `{ kind: 'suggest',
  circuit, options }` suggests for its goal; replies carry `ms`. A family's `at` is a closure into solve.ts's module
  state and cannot be cloned: `family` comes back null (the worker only gets fallback problems, whose families have
  no `at` anyway). Node runs `runJob` directly in the checks.
- `lib/smith/solve.worker.ts`: as `lib/resistor/combine.worker.ts`: a job runs after the messages already waiting
  (`setTimeout` 0), so only the newest request is worked on; `{ id, cancel }` drops what waits.
- `lib/smith/solveClient.ts`: as combineClient.ts/designClient.ts, built by the bundler from
  `new Worker(new URL('./solve.worker.ts', import.meta.url))` (the exact form, with `@ts-expect-error`; works in
  `next dev` and the static export). Two channels, a worker each (slow solves; suggestions), so neither waits for the
  other; per channel the newest request wins and an overtaken promise gives null. Without a worker (or after a worker
  error) the job runs on the page after `PAGE_WAIT_MS` (150 ms) and not while `busy` (a drag), as before.
- **What goes to the worker** (`SolvePanel.tsx` `slowAsk`, measured on 300 random 10-part circuits, three goals each,
  in Node): any f0 unknown (one f0: median 1.9 ms, p90 3.6, worst 22 ms; f0 with a part: p90 4.4, worst 20 ms; f0
  with a λ/4 or a Zc, the generic grid: p90 46, worst 216 ms) and two of a line's Zc, a Zc and a λ/4 (the grid). A
  line's Zc alone (worst 0.9 ms) or with a part (worst 0.7 ms) and every geometric solve (µs) stay in the deferred
  render: a worker's round trip and the extra render cost more than they do. A request goes out at once (no 150 ms
  pause any more): the page's thread is not touched.
- While the worker solves, the panel keeps the last answer for the same marks (stale: `aria-busy`, Apply disabled)
  instead of "Solving…" for a few ms on every keystroke; with other marks it shows "Solving…". `Outcome.where` is
  `render`, `worker` or `page`.
- **Shown** (ui-solve.mjs): a 5-part circuit with f0 and a λ/4's Zt, the goal changed to a point Z: the worker's solve
  took 46.8 ms; meanwhile the page's longest frame gap was 16.9 ms and there were no long tasks (PerformanceObserver);
  the result equals `solve()`.

## BL57 fix

- **Cause** (`solve.ts` `familyResult`): when K′ (the goal circle carried back to node b + 1) is itself one of b's loci
  (`touching` returns −1: x = 0 for a shunt R, whose loci are constant-b circles, b = 0 for a series R), the solver
  returned none ("moves the node along the goal circle itself"). But every other locus meets K′ at the point all loci
  share, b's value at its limit (a shunt R of 0 Ω shorts the node, a series R of ∞ opens it), and that point is on K′.
  It is an answer unless it is the goal's pole: as for one unknown (`consider` keeps a short on x = 0, drops it on
  b = 0, whose pole is the short), and as families already did when K′ was not a locus.
- **Fix**: with K′ a locus, `familyAt` (flag `COMMON`) offers b = ∞ in its added quantity for every a (consider
  evaluates it, polishes, drops it at the pole); the range breaks are the crossings of A′ and K′; if A′ is K′ too, the
  status is `coincident`. The old reason stays for when no range results (the pole case).
- **Checks**: three fixed families in check-validate.mjs (`two unknowns, family (BL57)`: the circuit of the backlog,
  a series R of ∞ onto b = 0, a shunt R onto x = 0 behind a series L) against the brute force, a shunt R onto b = 0
  that stays none, the backlog circuit's members all 0 Ω with residual ≤ 1e-9; check-suggest runs it through `runJob`.
- **Shifted stream**: check-solve-b's family loop skipped problems with the old reason, so the fix changed which
  random problems it draws, and the shared stream moved for the groups after it. The new problems exposed two misses
  of the fallback search (an f0 with a tiny line Zc, an f0 with a series C near the open), fixed as **BL58**
  ([notes-M4.2.md](notes-M4.2.md) "BL58 fix").

## Counts

- `npm run check`: 1,389,933 (91 s) checks pass (check-suggest: 300 random problems with their own stream, 220 with
  suggestions, 78 none, 2 already held; 888 suggestions re-evaluated with network.ts to 1e-9; 524 singles against a
  20,000-point scan of their part (roots bisected, the goal's pole left out), none worse; 364 pair solutions of
  `solve()` all suggested; the same JSON twice; the cap a prefix; 5 asks and their suggestions through `runJob` equal
  to `solve()`/`suggest()` and through `structuredClone`).
- `npm run ui`: ui-solve 474 (the worker block new), ui-grid 20,719, ui-chart 309, ui-strip 347, ui-edit 3,714, ui-theory 4,983, ui-why 612 pass; ui-path 1,118 of 1,119 inside the full run (its 4× zoom frames, 9 lost; the known miss of notes-M4.3c.md), 1,117 of 1,117 alone; ui-drag 143 of 145: the absolute 4× budget, 12.14 ms per drag frame, and 2 frames lost with it, excepted since notes-M4.3a.md (the ten-part drag has only geometric unknowns, solved in the render as before). `npm run build` writes the worker as a file of its own (`static/media/solve.worker.*.ts`, as combine.worker).

## For M4.4b

- Run suggestions through `suggestOffPage(circuit, { lists })` when nothing is marked and the goal does not hold
  (status `holds` says so); the newest request wins. Show `list` in the panel's solution rows (each `Suggestion` has a
  `solution` like the panel's, its `variants` and `ranges`); Apply with `applySolution(circuit, s.solution)`; mark the
  parts with `s.unknowns` to turn a suggestion into an ask.
- `MAX_SUGGESTIONS` is 8; `rankSuggestions` is the order; a pair for a circle goal is BL59.
- The panel calls `stopSolveWorkers()` when it unmounts (the tool's page left), as the resistor tool does.
