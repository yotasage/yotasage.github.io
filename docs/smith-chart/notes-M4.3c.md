# Smith chart – notes of step M4.3c, part 1 (the solver's theory: content)

Part of [plan.md](plan.md). M4.3c runs as two agents (milestones.md): this one wrote the content, no code; the next
puts it on the page. The text is in [theory-solver.md](theory-solver.md) §9–§11 (split off theory.md, which keeps the changed §8 rows and claim 14); every claim is in
[claims.md](claims.md) ("The solver's topics", 130–187, and the short-line rows). No source was added: the topics
cite WikiMobius, SteerVol3 §6.4 and §6.7, WikiE, JohansonHighQ and WurthWEKI, all in references.bib.

## What the page agent builds

**Three topics** after "Matching with two parts" in `components/Smith/Theory.tsx`'s TOPICS (page topics 8–10; in
theory-solver.md they are §9–§11, after theory.md's §8 of short lines):

| theory-solver.md | Anchor | Title | Equations (registry ids) | Citations |
|---|---|---|---|---|
| §9 | `two-one-or-none` | Two solutions, one or none | `series-adds-z`, `shunt-adds-y`, `circle-r`, `circle-g`, `mobius`, `x-series-c`, `b-shunt-c`, `b-shunt-l` | WikiMobius "Elementary properties"; SteerVol3 §6.4, §6.7 |
| §10 | `one-value-and-a-point` | Why one value cannot reach a point | `gamma-z`, `circle-r`, `mismatch-to-target` (**new**, below), `gamma-vswr`, `x-series-c` | none |
| §11 | `realisable-values` | Realisable values and standard values | `x-series-l`, `x-series-c`, `b-shunt-l`, `b-shunt-c`, `quarter-wave`, `line-rotation`, `line-theta`, `beta`, `vswr`, `return-loss` | WikiE; JohansonHighQ; WurthWEKI |

Topic 7's last sentence "(Why two, one or none is the next topic, with the solver.)" links to `#two-one-or-none`.
The topics' text names the page's messages exactly as SolvePanel.tsx prints them ("Two solutions.", "One solution:
the two circles just touch.", "No solution.", "These two parts do the same job.", "One value and a point: exact only
by chance, so the solver gives the nearest value.", "One value alone reaches a point only by chance.", "true at this
frequency only", "(+ λ/2 gives the same match at f0, over a narrower band)", "Standard values", "Solve for", "L or C").
If the page changes one of them, change the topic too.

**Topic 1, claim 14** now reads "… (VSWR 1.5); it follows the goal when you choose another in the Solve panel."

## The new registry entry (lib/smith/equations.ts)

```ts
{
  id: 'mismatch-to-target', title: 'Mismatch to a target',
  text: 'm = abs(Gamma - Gamma_t)/abs(1 - conj(Gamma_t)*Gamma) = abs(z - z_t)/abs(z + conj(z_t))',
  sources: [],
  derivation: 'The |Γ| of the node on a chart whose centre is the target: Γ → (Γ − Γt)/(1 − Γt*Γ) takes Γt to 0 and keeps the unit circle. With Γ = (z − 1)/(z + 1) and Γt = (zt − 1)/(zt + 1) (gamma-z) the z form follows.',
  assumptions: [REAL_Z0, 'target inside the chart, |Γt| < 1'], engine: 'goal.goalMismatch',
  symbols: { m: mismatch (no unit), Gamma_t: Γ of the target, z_t: the target's z },
  steps: [
    ['Gamma - Gamma_t = 2*(z - z_t)/((z + 1)*(z_t + 1))', 'Put both Γ in terms of z and take one fraction.'],
    ['1 - conj(Gamma_t)*Gamma = 2*(z + conj(z_t))/((conj(z_t) + 1)*(z + 1))', 'The same below the line.'],
    ['m = abs(z - z_t)/abs(z + conj(z_t))', 'Divide; |conj(z_t) + 1| = |z_t + 1|, so the factors cancel.'],
  ],
},
```

The identity was checked on 1,000 random z, zt in M4.3c (worst 3e-15). Its check in `check-equations.mjs`: both
forms and every step on random points as for the other entries, and against `goalMismatch` for an off-centre point
target (goalMismatch uses |Γ − Γt| for a rim target, outside this entry's assumption). The symbol helper's form is the
registry's (`sym(...)`); pick the names so they do not clash with existing variables.

## Live numbers and where they come from

Rule for all three: if the user has marked something (`askOf(circuit)` has unknowns), the box is "Your circuit" from
the page's own `SolveResult` (the one SolvePanel shows; reuse it, do not solve again per render); otherwise "Start
circuit" from `solve(defaultCircuit(), unknowns, goal)` with the example's marks below (computed once). The ui-theory
harness compares each number with the engine.

| Topic | Example marks and goal (start) | Numbers (start values, checked with `npx tsx` in M4.3c) | Engine |
|---|---|---|---|
| §9 | part 1's C and part 2's L (`{part:0}`, `{part:1}`); goal the centre at the input (`{kind:'point'}`) | circles at node 1: r = 0.5 (centre 1/3, radius 2/3) and g = 1 (−1/2, 1/2), d = 5/6, case "two"; solution 1 C 31.83 pF, L 79.58 nH; solution 2 x = 0, shunt C 31.83 pF (swapped); \|Γ\| 0 and 0 | `status`, `circleNode`, `circles` (two generalised circles [a, bx, by, c] at 0 and 4: centre (bx, by)/a, radius √(bx² + by² − ac)/\|a\|), `solutions[].values[].value/added/kind/swapped`, `gamma` |
| §9 family | same marks, goal `{kind:'vswr', value:1.5, within:true}` | at C 31.83 pF (t = −π/4) members L 56.51 nH and 134.48 nH; first range C 26.37–40.36 pF (three ranges in all: also C ≥ 150.6 pF and, swapped, L ≤ 16.48 nH) | `family.at(t)`, `ranges` |
| §10 best | `{part:0}` only; goal `{kind:'point', node:1}` | C 63.66 pF (added x −0.5), m = 1/3, VSWR 2; touching circle \|Γ\| = 1/3 about 0 (circles[4..7] = [1, 0, 0, −1/9]) | status `best`, `solutions[0]`, `mismatch`, `circles` |
| §10 range | `{part:0}` only; goal `{kind:'vswr', value:1.5, within:true}` at the input | C 26.43–39.99 pF (= 1/(ωZ0(1 ± 1/√24))) | status `range`, `ranges[0].min/max` |
| §10 exact circle | `{part:0}` only; goal `{kind:'g', value:1, node:1}` | 31.83 pF and x = 0 | `solutions` |
| §11 | as §9, E24 lists (`defaultChoice()`) or the page's choice | variants of solution 1: 33 pF + 82 nH \|Γ\| 0.0377 (VSWR 1.08, RL 28.5 dB), 33 + 75 0.0468, 30 + 82 0.0620, 30 + 75 0.0706 (VSWR 1.15) | `standardVariants(circuit, goal, solution, choice)`: `values`, `gamma` |

§9's example also mentions R = 50 Ω (one solution: C 63.66 pF, shunt L = ∞) and R = 100 Ω (none, reason "the two
circles do not cross: …") as fixed text; a box may compute them with the load changed, not required.

**Found in M4.3c (for the main session):** the start circuit's second solution comes back as a series **L of
1.66·10⁻²⁴ H**, swapped (x = 2·10⁻¹⁷ by rounding, really x = 0, a plain connection), and its variants are E24
neighbours of that (1.6e-24, 1.8e-24 H). The topic says "x = 0"; the live box should print x = 0 ("a plain
connection") when |added| < 1e-12 rather than the value. SolvePanel shows the raw value; worth a BL entry (values
within rounding of a kind's 0 or ∞ shown as such, no variants for them) or a small fix in the page step.

## Figures (mini charts with the tool's chart code, both themes)

- §9: three small charts side by side, each with the g = 1 circle in part 2's colour and an r circle in part 1's:
  r = 0.5 with its two crossings at Γ = −0.2 ± j0.4 marked ("two"), r = 1 touching g = 1 at the centre ("one"),
  r = 2 apart from it ("none"). Labels under each.
- §10: the r = 0.5 circle (part 1's colour), the dashed circle \|Γ\| = 1/3 about the centre touching it at Γ = −1/3
  (marked "nearest"), the centre marked as the target, r = 1 faint.
- §11: zoomed to \|Γ\| ≤ 0.25: the dashed \|Γ\| = 0.2 circle, the exact match at the centre, the four E24 variants'
  input points (evaluate each variant's circuit with network.ts) labelled "33 pF · 82 nH" and so on.

## Short lines (whys.ts; theory.md §8; claims.md rows)

Changed (text or topic):

| Key | Text | Topic |
|---|---|---|
| `snap` | Drags settle on grid circles and each kind’s Standard values list; Alt drags free. | `realisable-values` |
| `goal` | The solver’s goal; by default the centre, within \|Γ\| 0.2 (VSWR 1.5). | `how-good-is-a-match` |
| `solve-mark` | (as now) | `two-one-or-none` |
| `solve-free` | (as now) | `realisable-values` |
| `solve-goal` | (as now) | `two-one-or-none` |
| `solve-count` | (as now) | `one-value-and-a-point` |

New (about, text, topic; 53 lines in all):

| Key | About | Where | Text | Topic |
|---|---|---|---|---|
| `solve-solution` | a solution | the solutions list (one per list) | Values that meet the goal, and the \|Γ\| they give at its node. | `two-one-or-none` |
| `solve-circles` | the circles on the chart | `data-solve-circles` line | Each unknown moves a node on a circle; answers are where they cross. | `two-one-or-none` |
| `solve-family` | the family slider | beside `data-family-slider` | Slide the first value; the second follows to keep the goal. | `two-one-or-none` |
| `solve-variant` | standard-value variants | the variants block (one per block) | The nearest standard values, and how far they move the input. | `realisable-values` |
| `solve-lists` | Standard values | the "Standard values" summary | The values parts come in, per kind; drags and variants use them. | `realisable-values` |
| `list-R` | the R list | its select | E series of IEC 60063; E24 parts usually 5 %, E96 1 %. | `realisable-values` |
| `list-L` | the L list | its select | Chip inductors come in makers’ own lists (1.9 nH): paste yours. | `realisable-values` |
| `list-C` | the C list | its select | E series; RF chip capacitors below 10 pF have tolerances in pF. | `realisable-values` |
| `list-Z` | the Zt and Zc list | its select | Any value by default; a list if your lines come in set impedances. | `realisable-values` |

ui-why.mjs: its count (44 → 53) and the new keys; ui-theory.mjs: the three topics' live numbers, equations,
citations and anchors.

## Limits the topics state (keep them)

Ideal parts at one frequency (claims 166, 186); a swapped kind is true at f0 only (168); λ/2 more gives the same match
at f0 and drifts faster away from it (175; bandwidth itself stays for M7); standard values move \|Γ\| (184), and the
tool computes neither tolerance nor losses (186). Not claimed: what a usual tolerance does to a match, any Q or SRF
beyond the WE-KI figures, IEC 60063's own text (cited through WikiE only).

## Page (part 2, 2026-11-12)

- **Topics 8–10** are in `components/Smith/TheorySolver.tsx`: `SolverTopics`, a child of Theory memoised on the
  outcome, the lists, the bibliography, the three topics' folding and the way back, gets Theory's `topic` (with the
  topic's number), `cite`, `L`, `jump` and `Eq`; a child renders after its parent, so citations stay in page order.
  First they were rendered inside Theory's body: Theory renders on every committed network change, and the longer
  render made ui-strip's keyboard moves flaky (focus left on the old tile, 2 runs in 3; 0 in 4 without them, 0 in 3
  with the memo). The page also renders for an outcome only when it or the last one has a result. Theory.tsx was already 54 kB; the new file keeps it from growing. Text, equations (by id, as the table above),
  citations (WikiE, JohansonHighQ and WurthWEKI are web pages without sections: Theory's `cite` prints `[n]` when the
  section is empty) and the three figures (`TwoOneNoneFigure`, `MismatchFigure`, `StandardFigure` with the E24 variants'
  input points evaluated by network.ts, 4× zoom) follow §9–§11.
- **Live numbers.** The text's numbers (`sv9-*`, `sv10-*`, `sv11-*`) are the start examples, solved once at module
  load (`solve`, `family.at` at the start C's coordinate, `standardVariants` with E24). Five boxes (`data-solver-box`:
  two, family, best, range, standard) show the visitor's solve when the Solve panel's outcome is of the box's kind (two
  unknowns and a point target with circles; a family; a best value; a range; any solutions, with the page's lists) and
  else the start example, headed "Your circuit" or "Start circuit". The outcome reaches the theory as state in
  `pages/smith-chart/main.tsx` (set in a transition from SolvePanel's `onResult`, read with `useDeferredValue`); nothing is
  solved again per render. The mismatch equation's live z drops the evaluation's 1e-17 imaginary part: its last bits
  differ between Node's and the browser's `Math` and broke hydration.
- **Near-zero values (`solve.ts` `zeroRounding`).** In `buildSolution`, an L or C unknown whose solved x or b is at most
  1e-9 and whose removal moves Γ at the part's far node by at most 64ε (|ΔΓ| = |p|·|1 ∓ Γ|²/2 with Γ at the node before
  the part, − for series, + for shunt: the Γ-change of p at that node, so the tolerance follows the node's scale) is set
  to exactly 0; the part then shows its own kind's no-effect value (series C ∞, series L 0, shunt L ∞, shunt C 0), not
  swapped, and `values.ts` `candidates` gives 0 and ∞ no neighbours, so its variants vary the other unknown only. The
  start circuit's second solution is now "series C ∞ F (x = 0: a plain connection)" with a shunt C of 31.83 pF.
  check-solve.mjs "solve special cases" has four circuits for it, ui-solve.mjs checks it on the page.
- **Registry:** `mismatch-to-target` (68 entries), checked in check-equations.mjs against `goalMismatch` with a generator
  of its own: drawing from the shared stream shifted check-validate's random problems and exposed an unrelated family
  gap (a shunt R of 0 Ω shorting the node onto an x = 0 goal), filed as **BL57**.
- **Short lines:** 53 (nine new, `snap` and `goal` reworded, the solve lines relinked). The family's line is on a page
  with a circle goal in ui-why.mjs; the lists' lines need the Standard values setting opened. Buttons sit outside
  labels (the slider's label is now a `<label htmlFor>` beside its "?").
- **Docs:** plan.md's module map moved whole to [modules.md](modules.md).
- **Counts:** `npm run check` 1,378,467 checks; ui-theory 4,983 (169 live numbers on the start page, four circuits with
  asks: C1 two unknowns, C2 a range, C3 a best value, C4 a family); ui-why 612 (43 buttons followed by mouse). ui-solve 471, ui-strip 347 (three runs), ui-path 1,117
  (its 4× frame budget missed once inside the full `npm run ui`, passed alone), ui-drag 144 of 145: 10.29 ms per drag frame
  at 4× against the absolute budget, excepted since notes-M4.3a.md. Figures: the E24 points are numbered, their pairs in
  the caption (labels overlapped); circle centres within 1e-12 of an axis are on it (no "− j2.3e-17").
