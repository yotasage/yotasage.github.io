# Notes of M5.2: the equations linked both ways

Step M5.2 of [milestones.md](milestones.md) (learning.md §2–§3, plan.md D14). Done 2026-11-13.

## What is on the page

- **Equation → page.** Every variable of the Equations panel carries what it stands for (`data-mt`, space-separated
  tokens): `p<i>` part i (its arc, arrow, handle, tile and card), `n<k>` node k (its marker, its node-table row, and
  the circuit input for the input), `goal` (added to a variable of the goal's node that the goal is about: |Γ|, VSWR,
  RL, ML for a circle goal, Γ, z, Z for a point target: the goal's ring, mark, line and text), `r<field>` a readout row
  (`rgamma` both Γ rows). Pointing at it lights those with `data-lit`, and the variable's other places in the panel:
  - hover (mouse, pen); leaving the rows clears it;
  - focus: every row is focusable (`tabIndex 0`); a focused row lights its left side's target, ← and → step through the
    row's targets one by one, Escape goes back to the row's;
  - tap (D14): a tap lights the variable and it stays; a second tap, Escape or an arrow step clears it. Order of
    precedence: hover, tap, focus (a tap also focuses its row).
  A hint under the follow switch says so; the short line `math` sits in the panel's title.
- **Page → equation.** The chart's own hover on an arc or a node (`pathLayer.onHot`) and a hover or focus on a tile
  or a node row light that part's or node's variables in the panel (also when the panel is out of view: a query over
  the panel's rows, so it is right when scrolled to).
- **"Show equation"** (`ShowEq.tsx`): a small "=" beside every readout row (the point's row of that field:
  `READOUT_ROWS`), in the circuit input's title, beside every node-table row and beside the part card's name. It sets the
  panel's subject (the page's selection without the node table's toggle, or the readout's point), opens the panel
  (closed on phones), scrolls the wanted row to the centre and focuses it; under the row's title "↩ Back to …" (the
  readout, the circuit input, the node table, the part card) returns the focus to the control, scrolled to the centre
  (found again by `data-show-eq` when React replaced it). The short line `show-eq` is at the readout's title.

## Placement: a jump with a way back

The panel stays under the readout and the controls jump to it, as the theory links do. Moving it beside the card or
the node table would push the readout (which must stay next to the chart while one reads) or the circuit down, and a
floating copy would be a second panel to keep in step. With the row focused and centred and the way back in that
row (the next Tab stop), the jump costs one key or tap each way at every width; the Theory's "Back to the tool" works
the same way, so the page has one pattern.

## How it works (components/Smith/mathLink.ts)

- Sentinels (learning.md §2): `\textcolor{#0aCCVV}` with CC the colour (1 + the COLOUR_KEYS index, 0 none) and VV the
  variable's index among its spec's variables. `mathHtml(tex, targets)` turns `mathcolor="#0aCCVV"` into the colour's
  class and `data-mt` once per render of a line (the symbolic lines once per subject, the lines with numbers when
  MathLive writes them). Variables with a target but no colour (the load's z_L) are now wrapped too; the TeX annotation
  keeps the sentinels, so ui-math's comparison with `mathRows` still holds.
- Targets come from `specsOf` (mathRows.ts): a node's every variable is the node; a part's are the part, or the node
  it starts at (z_L, y_L, Z_L, Γ_c) or ends at (z_in, y_in, Z_in, and Γ, z, Z of `gamma-z`); the point's map to readout
  rows. Constants (Z0, Y0, ω, β, λ) and quantities with no number in the panel (V_max, P_inc: only in the symbolic
  line) have none.
- Highlights are attribute toggles on pointer, focus and key events: page elements by a query in the tool's element,
  the chart's arc, arrow, handle and node marker by `pathLayer.light`, drawn in its next frame's `writeMarks` with the
  selection and hover marks (no extra frame work when nothing changes). MathLive calls `mathLink.mark(el)` after a
  write (a query in that row only, and nothing when nothing is lit), inside its measured, charged slice.

## Harness

- `ui-math-link.mjs` (run by ui.mjs after ui-math): 2776 checks. Every variable's target for every part, node and the
  readout's point of five circuits (start, ten parts of every kind, an open load, 1 kHz, ten parts with a VSWR goal at
  node 3): equal to mathRows', present on the page, every bound variable of the registry's equation given one, the goal
  token only at the goal's node, and right **by value** (777 variables): the bound value equals the engine's at that
  node (z, Z, y, Γ, Γ on the line's Zc, VSWR, RL, ML), the part's value, Zc, parts.added or turnsAt, or the readout's
  quantity at the point (convert.ts). 80 hovers on three circuits and the point: exactly the expected page elements lit
  and all the variable's places in the panel; nothing after leaving. Focus on every row of a line part with → around
  the row's targets, ← and Escape. Tile, node row, an arc and a node marker found by `pathLayer.pick` → the panel. Show
  and back from every readout row, the input, every node row and three part cards by mouse, four by the keyboard alone
  (Enter, Tab, Enter), and at 320 and 390 px (dark, touch) by taps from the card and a node row (the table opened),
  with a tap on a goal variable that stays and a second that clears; no horizontal scroll; no errors.
- `ui-why.mjs`: 56 lines.

## Performance

Interleaved A/B with ui-drag.mjs (10 parts, 2 s drag, panel out of view), HEAD before the step against the step,
alternating, two runs each; each run's 4× figure is the median of its attempts' medians:

| Run | HEAD 1× | HEAD 4× | after 1× | after 4× |
| --- | --- | --- | --- | --- |
| 1 | 2.41 | 10.65 | 2.44 | 10.71 |
| 2 | 2.29 | 12.09 (one attempt 16.13) | 2.60 | 10.60 |

Pooled over the 18 timed drags of each side: median 10.90 ms (HEAD) and 10.51 ms (after); the first attempts' best
runs 10.03 / 9.95 against 10.04 / 10.05. The step adds nothing measurable (under 0.1 ms) per 4× drag frame.

A first A/B gave +0.7 and +1.4 ms at 4×: the node rows were then flex boxes (row button and "=" side by side), and
live.ts rewrites the rows' texts every drag frame, so each row measured its texts again. The "=" is now placed
absolutely over the row's right edge and the row keeps block layout; that version is the one above. Also: the
panel's `contain: layout style` moved from the whole `<details>` to its rows, because containment makes the box the
containing block of fixed elements and the title's short-line bubble (fixed) landed off the screen (ui-why caught it).

ui-drag's absolute 4× budget and its 4× frame-loss check fail on this machine at HEAD as well (notes-M4.3a.md).
ui-path's keyboard check now steps over the node row's "=" (two Shift+Tab); the part card's "=" sits beside the card's
name, so Tab from the card's short line still reaches the kind's line first (ui-why).

## For M5.3

- A derivation can be a subject like a row: `mathLink.show` takes a subject and a row id; a derivation's steps can carry
  the same sentinels (`sentinel`, `Spec.targets`) to link their variables.
- The rows are focusable and the arrow keys are taken inside a focused row: a derivation opened from a row should use
  Enter or a button, not the arrows.
