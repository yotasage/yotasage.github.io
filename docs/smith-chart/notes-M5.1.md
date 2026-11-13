# Notes of M5.1: the equation panel and values at rounding level

Step M5.1 of [milestones.md](milestones.md) (learning.md §3, plan.md D20). Done 2026-11-13.

## What is on the page

- **Equations panel** under the readout (`components/Smith/MathPanel.tsx`, rows from the framework-free
  `components/Smith/mathRows.ts`). Its subject is the page's selection: the selected node, else the selected part (the
  last part when nothing is selected), else the load; a switch "Selected part or node · Readout point" follows the
  cursor readout instead. Rows by subject:
  - a part: its own equation (`r-series`, `x-series-l`/`-c`, `g-shunt`, `b-shunt-l`/`-c`, `stub-open-b`/`stub-short-b`,
    `line-theta` + `line-zin`, `quarter-wave`), then `series-adds-z` or `shunt-adds-y` for lumped parts and stubs, then
    `gamma-z` where the part ends;
  - a node (and the input): `z-norm`, `gamma-z`, `vswr`, `return-loss`, `mismatch-loss`;
  - the readout's point: `z-gamma`, `z-norm`, `y-norm`, `vswr`, `return-loss`.
- Each row: the symbolic line (`lhs = rhs`), one line per member with the numbers put in, the result; aligned on "=" as
  the Theory section. The substitution printer is `substitutions` in `lib/smith/equations.ts` (moved there from
  Theory.tsx, which now imports it). β and ℓ are printed in wavelengths (β = 2π/λ, ℓ = 0.3 λ, θ in rad) and bound as
  β = 2π, ℓ = turns, λ = 1; ω as 2π·f0.
- **Colours**: a part's variables in its chart colour (`--part-n`), the node before it in the colour of the arc that
  ends there (the load none), the readout's point in `--accent`. Done with sentinel colours `#0a0b01…09` in
  `\textcolor`, replaced by classes in the MathML string (learning.md §2); the TeX annotation keeps the sentinels.
- **Digits setting**: a "Digits" select (3, 4, 5, 6, 8; default 4) in the readout's title. It sets the readout, the
  circuit input, the node table (and its goal line) and the panel. `readout.ts` holds it (`shownDigits`), so the
  frame loops read it without props; React parts get it as a prop. Kept as `smith.digits` in localStorage after mount
  (removed at the default). The Theory keeps four digits (it says so) and the Solve panel its own `DIGITS`.

## D20: the rule

`lib/quantity.ts`: `ROUNDING_FLOOR` 1e-12, `belowFloor(v)` (non-zero and under it), `formatResidual` ("< 1e−12", or
with a scaled floor the bound in its unit, "< 50 pΩ"), `formatReturnLoss` ("> 240 dB" above `RL_CEILING`; an exact match
stays "∞ dB"). Exact zeros stay "0". Used by:
- readout.ts: Γ fields "|Γ| < 1e−12" (`GAMMA_BOUND`); `complexText` writes a residual part as "1.000 ± j< 1e−12"
  (floors: 1e-12 unitless, 1e-12·Z0 for Z, 1e-12/Z0 for Y); return loss; so also the circuit input and live.ts;
- Nodes.tsx: Γ, RL, the goal's distance;
- SolvePanel.tsx: `small()` (|Γ|, mismatch, residual of solutions, variants and suggestions) and a length in λ;
- Theory.tsx and TheorySolver.tsx: `num`/`amt` are `formatResidual`, the return loss rows `formatReturnLoss`, and a TeX
  value's residual part (unitless or dB) is put in as 0 (TheorySolver's "|Γ| = 0" for an exact match is now the bound);
- the panel: substituted values with a residual part put in as 0; the result line says the bound (`|Γ| < 10^{-12}`,
  `RL > 240 dB`, `ML < 10^{-12} dB`) and "computed: 1.963e−16" stays beside it (`data-math-raw`).

## Performance (engine.md §9, notes-M0.3.md (a))

The symbolic lines are React's; the lines with numbers are written by `MathLive` outside React: at once after a render
(commit, selection, digits), except within 150 ms of a drag frame (the drag's pick re-renders the panel), and during a
drag or a moving readout by a leaky bucket: 0.25 ms of credit a frame (saved up to 1.5 ms), each row charged its measured
script time × 2.2, because the MathML's style and layout follow outside the measured span (first try charged × 1:
0.25 ms of script added 0.43–0.67 ms of main thread a frame at 4×). Rows go round-robin and every row gets its last value
once values stop changing; nothing is done while the panel is closed or out of view (IntersectionObserver). A row costs
about 2.3 ms of script at 4× CPU (most of it the MathML's innerHTML), so at 4× about 6 rows are refreshed in a 2 s drag
(each of the line's 3 rows about once a second); at 1× about four times as often.

ui-drag.mjs (panel out of view there): HEAD before the step 1× 2.28 / 4× 8.75 ms (runs 8.44–9.51); an hour later
HEAD again 2.54 / 11.18 ms (runs 10.26–12.65: the machine drifted, notes-M4.3a.md); after the step 2.47 / 10.87 ms
(runs 10.15–11.88). A same-page A/B (7 drags each, the panel's DOM removed and MathLive off vs kept) gave medians 11.10
vs 11.68 ms with a spread of 10–16 ms: no difference beyond the noise. ui-drag's 4× "frames lost" check (≤ 1) also
fails now and then on this loaded machine, at HEAD too (1 lost).

Measured (ui-math.mjs, ten parts, the line dragged, panel in view, 1440 × 4600, 4× CPU, medians of 3, panel on vs off
on the same page): see the table below.

| Run | off | on | added |
| --- | --- | --- | --- |
| tuning, × 1 charge | 12.17–13.09 ms | 12.84–13.53 ms | +0.43…+0.67 |
| final, × 2.2 charge | 12.38–12.58 ms | 12.41–13.17 ms | +0.03, +0.16 (one attempt +0.71, retried) |
| last run (after containment) | 12.33, 13.99 ms | 13.28, 13.75 ms | +0.95 then −0.23 (retried) |

The run-to-run noise of this measure (±0.5 ms) is larger than the 0.3 ms bar; the harness retries up to three times.

## Harness

- check.mjs "quantity: rounding level (D20)" (21 checks; its fuzz has its own random sequence so the later sections'
  `random()` stays as it was: consuming it shifted two seeded fuzz cases into known-flaky failures).
- ui-math.mjs (in ui.mjs): every row of the panel against `mathRows` for the circuit in the link (the TeX of every line
  via its annotation, the binding to 1e-12, the raw text) for four circuits (start, ten parts of every kind, an open
  load, 1 kHz), the start circuit matched exactly by the Solve panel's first solution and a hand-made circuit at
  rounding level, every part and node, the readout's point at three places; KaTeX `throwOnError` and `strict: 'error'`;
  every side of the registry's tree evaluated on the binding equals the left side (1e-9); Γ and `added` checked against
  network.ts and parts.ts; digits 6 in the readout, the node table and the panel, over a reload; D20: no text and no
  MathML `10^{-n}` (n > 12) on the whole page outside `data-math-raw`, with the exact solutions listed, after Apply and
  on the circuit at rounding level; the timing above; no horizontal scroll at 320 and 390 px (dark, panel open).
  `SMITH_MATH_ONLY=timing` runs the timing alone.
- ui-strip.mjs: the keyboard checks failed about 1 run in 4. Cause found in the app, not only the harness: Strip's
  focus effect could run in a render before the moved/added circuit arrived and focus the old index (the old tile kept
  the focus, Alt+← then did nothing). The effect now waits for the render that shows the circuit the action made
  (`focusFor`, or an equal one: the page drops a commit that changes nothing, such as swapping two equal parts; a
  first version that waited for any change left such a request pending, and its late `focus()` scrolled the page under
  a draw in ui-edit's sequence 81). The harness waits frame by frame (`settle`, up to 3 s) for the link, the tiles and
  the focus. 6 consecutive passing runs after the fix (and 5 more after the `focusFor` version).
- ui-theory.mjs uses the same rule (`formatResidual`, `formatReturnLoss`).
- ui-edit.mjs: its random sequence 81 drew from the input's node at y = 903 of a 900 px window once the status note
  grew a line (the click on Draw scrolls its button into view): `mouseDraw` now scrolls the chart into view after
  arming. HEAD passed the same sequence; after the fix 3734 of 3734.
- The panel's box has `contain: layout style` and each row `content-visibility: auto`, so the side panel's per-frame
  texts never lay out its MathML and rows out of view are not rendered.

## For M5.2

- Linking both ways: the sentinel → class pass is in `mathHtml` (MathPanel.tsx); classes are per colour, not per
  variable: add per-variable classes (e.g. a second sentinel range) for hover highlighting.
- "Show equation" buttons: set the panel's subject from outside (main.tsx holds the selection; the follow switch is
  the panel's own state) and scroll it into view; the panel is far down the side column with many parts (below the
  node table: at 3864 px for ten parts on 1440 px), so M5.2 may want it nearer the card or a jump link.
- Readout fields as subjects (VSWR alone, RL alone) are rows of the point subject today.
