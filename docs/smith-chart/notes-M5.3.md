# Notes of M5.3: derivations

Step M5.3 of [milestones.md](milestones.md) and learning.md §4: every equation with steps in the registry is a
derivation, shown one step at a time with its one-line reason.

## The derivations

All are registry data (`lib/smith/equations.ts`, `steps` of an entry: text in the equation grammar and one sentence
saying why), never hand-written TeX. `check-equations.mjs` evaluates every step at 200 random points against the engine
(every side within 1e-12 of the largest), checks that every step is an equality and that the last step's first side is
the equation's first side and its last side one of the equation's sides (the derivation ends in its equation).

| Id | Steps | What it derives |
| --- | --- | --- |
| `z-gamma` | 4 | z from Γ |
| `gamma-y` | 2 | Γ from y |
| `y-gamma` | 2 | y from Γ |
| `gamma-parts-z` | 4 | Γ in parts of z |
| `gamma-parts-y` | 4 | Γ in parts of y |
| `z-parts` | 4 | z in parts of Γ (owner's items 1, 6) |
| `y-parts` | 4 | y in parts of Γ (owner's items 2–4) |
| `circle-r` | 9 | the r circle (owner's items 7, 8: their lines, then the square completed) |
| `circle-x` | 5 | the x circle (owner's item 9, finished) |
| `circle-g` | 9 | the g circle (owner's items 5, 10, finished) |
| `circle-b` | 5 | the b circle (owner's items 5, 11, finished) |
| `vswr` | 3 | VSWR from V_max and V_min |
| `gamma-vswr` | 3 | \|Γ\| from the VSWR (a last step to the result added) |
| `mismatch-to-target` | 3 | the solver's mismatch to a point target, in z |
| `return-loss` | 2 | RL = −20 log₁₀\|Γ\| |
| `mismatch-loss` | 2 | ML = −10 log₁₀(1 − \|Γ\|²) |
| `q-l-network` | 3 | Q of an L network (last step added) |
| `line-zin` | 4 | Z_in of a line |
| `line-rotation` | 2 | Γ turning on a line of Z0 (new steps) |
| `quarter-wave` | 3 | the λ/4 transformer |
| `quarter-wave-match` | 3 | Z_t = √(Z0 R_L) (two steps added) |
| `series-adds-z` | 3 | a series part adds z |
| `shunt-adds-y` | 3 | a shunt part adds y |
| `match-two-parts` | 8 | matching with two parts, series next to the load then shunt (new entry) |
| `abcd-zin` | 3 | Z_in of a two-port |
| `mobius` | 5 | a part maps Γ by a Möbius transformation (last step added) |

26 derivations, 102 steps. The owner's notes (notes-M0.1.md, "transcribed"): items 8–11 stopped before the circle
forms; `circle-r` now follows item 8's own lines (multiply out, gather, divide by r + 1, where the notes stop) and
completes the square; `circle-x`, `circle-g` and `circle-b` start from items 9, 10 and 11 (the notes' order of the
denominator, Γi² first) and end in (Γr − 1)² + (Γi − 1/x)² = (1/x)², (Γr + g/(1+g))² + Γi² = (1/(1+g))² and
(Γr + 1)² + (Γi + 1/b)² = (1/b)², the missing results notes-M0.1.md gives. No step has a side that is 0 (the check is
relative to the largest side, and a side of 0 against a rounding residual would fail it), so "bring to the left" is
folded into the step that completes the square.

`match-two-parts`: y_in = 1/(r_L + j(x_L + x_s)) + j b_p = 1, the route theory.md §7 describes (series first, r_L ≤ 1);
x_1 = ±√(r_L(1 − r_L)), x_s = x_1 − x_L, b_p = x_1/r_L. The harness binds it from its own random sequence (as
`mismatch-to-target`, so the shared stream and every later check's problems stay as they were) and takes z_1, y_1 and
y_in from network.evaluate of the circuit built from x_s and b_p.

## On the page

- **Where it opens: a modal dialog** (`components/Smith/Derivation.tsx`, one per page in the tool's element), on the
  right of the screen at desktop widths (the chart stays visible on the left, so what a variable lights shows behind
  the light backdrop) and the whole screen under 600 px. Why not inside the panel: the panel's rows are
  `content-visibility: auto` boxes whose numbers MathLive rewrites in drag frames, and a derivation is 2–9 tall steps,
  which would push the readout or the circuit down (notes-M5.2.md "Placement") and need its numbers kept live. One
  dialog serves both the panel and the theory; being modal, nothing on the page can be dragged while it is open, so its
  numbers are fixed and it costs drag frames nothing, and closed it renders nothing (React renders an empty
  `<dialog>`; the derivation is built when it opens, a few tenths of a millisecond). Keys pressed in it stay out of
  the page (undo, the chart's keys).
- **Opening.** In the Equations panel, "Derive" after the title of every row whose entry has steps (`vswr`,
  `return-loss`, `mismatch-loss` of every node; `z-gamma`, `vswr`, `return-loss` of the readout's point; the part's
  `series-adds-z`, `shunt-adds-y`, `line-zin`, `quarter-wave`) and Enter on a focused row (the arrow keys are the row's
  own, notes-M5.2.md); the numbers are the panel's subject's. In the theory, "derive" in the title of every equation
  with steps (every one of the 26 is in a topic: topic 3 now also shows `z-parts` and `y-parts`, topic 7
  `match-two-parts`); the numbers are those of the place the theory uses (`theorySubject`: the load, the first part
  of the kind, the goal's node for a point target, none for `abcd-zin`, `mobius`, `q-l-network`). The focus goes to
  "Next step" and back to the opener when it closes (Close, Escape).
- **Steps.** "Next step", "Back", "Show all", "Step k of n"; the list is `aria-live`. Each step: the symbolic line in
  the chart's colours, its reason, and "With your numbers" when every quantity of the step has a value: the step with
  the values put in and the value its sides share (the evaluator on the binding, as learning.md §1 allows for
  intermediate steps; the values put in are the engine's, from mathRows.specsFor and convert/goal; D20: a shared value
  under the floor is shown as |·| < 10⁻¹²). Steps with quantities the circuit has no number for (V_inc, the ABCD
  entries, the V and I of a node, whose scale is arbitrary) are symbolic only. A wide line scrolls inside itself (and
  is then a Tab stop of its own); the dialog never scrolls sideways.
- **Links (M5.2).** The steps carry the sentinels with the subject's targets; hover, a tap that stays, and ← → in a
  focused step light the part, node or readout row (`mathLink.extra` is marked with the panel); Escape first ends the
  stepping, then closes.
- **Short line** `derive` (57 lines) under the panel's hint; theory.md §1 item 4 and §8, claims.md 189.

## Harness

- `check-equations.mjs`: the two new registry checks above; `line-rotation`'s binding gains Γ_c, β and ℓ (no extra
  random draws). `npm run check`: all pass.
- `ui-derive.mjs` (in ui.mjs): KaTeX (`throwOnError`, `strict: 'error'`) of every TeX string of every derivation for
  every subject of three circuits (9666 strings); every panel row with a derivation for every part and node of three
  circuits (start, eleven parts of every kind with a line of Z0, 1 kHz) and the readout's point from the keyboard (77
  openings), every derivation from the theory (26): the dialog's equation, steps, reasons, lines with numbers and values
  equal derive.ts for the circuit in the link; the values put in against the engine here (2150: network.evaluateCircuit,
  parts.added, convert, goal; the two-part match by building its circuit); every shown step's sides equal the
  registry's tree evaluated on the page's binding (to 1e-9) and each other (341 steps with numbers); reveal order (Next,
  Back, Show all), the focus on Next and back on the opener; keyboard alone (Enter on a row, Enter on Next, Shift+Tab to
  Back and a step, → lights the page, Escape twice, focus back on the row, nothing left lit); taps at 320 and 390 px
  dark (the dialog fits, no sideways scroll of the page or the dialog, a tapped variable lights its tile or card).
- `ui-why.mjs`: 57 lines.

## Performance

Interleaved A/B with ui-drag.mjs (10 parts, 2 s drag), HEAD's app code (stashed) against this step's, alternating, two
runs each; main thread per drag frame, ms (each 4× figure the median of its attempts' medians):

| Run | HEAD 1× | HEAD 4× | after 1× | after 4× |
| --- | --- | --- | --- | --- |
| 1 | 2.47 | 11.69 | 2.56 | 11.35 |
| 2 | 2.50 | 11.25 | 2.80 | 10.70 |

Means at 4×: 11.47 (HEAD) and 11.03 (after): nothing measurable added (the closed dialog renders nothing; the panel
gains one button per row outside the lines MathLive rewrites). ui-drag's absolute 4× budget and 4× frame-loss check
fail on this machine at HEAD as well (notes-M4.3a.md). In the full ui run ui-grid once timed out waiting for the
first page (the dev server compiling the changed modules) and passed when run again; ui-math-link's keyboard check of
the way back caught Derive placed before "↩ Back to …": Derive now follows it, under the title.

## For M5.4

- `openDerivation(id, from, subject)` opens any registry derivation; "explain this move" can link to one (e.g. a
  series part's move to `series-adds-z`, a match to `match-two-parts`).
- A dialog is the page's pattern for longer reading that fixes the circuit; a move's explanation shown during a drag
  must instead stay out of the drag's frames (it cannot be modal).
