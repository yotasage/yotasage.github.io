# Smith chart – notes of step M6.3a (examples on the page)

Part of [plan.md](plan.md). The Learn section and the guide on the page, on the engine of M6.2
([notes-M6.2.md](notes-M6.2.md)); content from [examples.md](examples.md). Challenges and lesson links are M6.3b.

## Files

- `components/Smith/Learn.tsx`: `LearnSection` (the examples in examples.md's order) and `Guide` (the panel).
- `styles/SmithLearn.module.css`: both. Selectors that must beat Smith.module.css's `.root button` rules use doubled
  classes (`.item.item`, `.btn.btn.btn`): `.root` there is another module's hashed class.
- `pages/smith-chart/main.tsx`: the `guide` state, `loadExample`, Learn in `SECTIONS`, `LearnSection` after the tool,
  `Guide` at the top of the side panel.
- `lib/smith/examples.ts`: `guideFigure` (the number the guide shows).
- `components/Smith/whys.ts`, `Why.tsx`: five lines (`learn`, `learn-example`, `guide`, `guide-answer`, `guide-hint`;
  63 in all); `Why` takes `topic`, so the answer's and the hint's lines open the step's topic (`data-why-topic`).
- `components/Smith/Status.tsx`: the examples are in "what it does"; "still to come" keeps exercises with hints and
  lesson links.
- `styles/Smith.module.css`, `SmithTheory.module.css`: four sections in the nav did not fit a phone (References was cut
  at 390 px): at ≤ 440 px the bar's title is visually hidden (kept for screen readers), at ≤ 360 px the links' padding
  is 3 px. ui-learn checks that the nav does not scroll at 320 and 390 px.
- `scripts/harness/smith/ui-learn.mjs` in `npm run ui`; `ui-why.mjs` counts 63 lines and follows the guide's three on a
  page with E1 loaded.
- examples.md E16: "10 nH gives 0.127 with 4.3 pF and 0.123 with 4.7 pF (17.9, 18.2 dB)", as the data has it.

## Where the guide sits, and why

At the top of the side panel, above the circuit. On wide screens that column is beside the chart and sticky, so the
step and the chart are on the screen together while the visitor drags or types; on phones the side panel follows the
chart, so the guide is the first thing under it (at 390 × 844 the chart's bottom and the whole guide are in view at
once, screenshot below). A load scrolls the tool into view, puts the side panel's own scroll back to its top and the
focus on the guide's heading (without scrolling); Next puts it on the new step's text. The alternatives were worse: in
the Learn section the guide is a screen away from the chart, and a floating panel would cover the chart on a phone.

The Learn section itself sits between the tool and the theory (notes-M6.1: after the chart's panels, before Theory),
with a link in the bar's nav.

## Behaviour

- Loading is `commit(decodeCircuit(link).circuit)`: one undo step, the history group closed, the selection cleared;
  the guide gets a new key, so it starts at step 1. Undo and Redo leave the guide open and it tests whatever circuit
  is there.
- `stepDone` runs in a `useMemo` on the committed circuit, the grid, the submitted answer and `doneAt` (a few µs). A
  step once done stays done (a later edit does not untick it); its `nodeGammas` go into `doneAt` then, which E11–E13's
  "other solution" steps need. Next is enabled once the step is done; Back is always there; the last step offers Next
  example.
- The answer field takes a comma or a typographic minus and the quantity's unit (`readAnswer`); Enter or Check
  submits; a number outside the tolerance says so with the tolerance ("Not within ±0.005 of the value the chart shows
  there").
- The figure (`guideFigure`): for a step with a circle or point check, the node's g, r, x or z and what it should be;
  for the centre, |Γ| at the input with the limit; for an answer, the engine's value only once the step is done (before,
  it would give the answer away). Values below 1e-12 print as 0 (an exact match leaves |Γ| ≈ 4e-17).
- "→ theory" beside the step's text and in the two short lines open the step's topic by `followTopic`; the theory's
  "Back to the tool" returns the focus to the link.
- During a drag nothing of this renders: `Guide` and `LearnSection` are memoised with stable callbacks and their props
  change only on a commit, a grid switch or the digits setting. No CSS containment on the guide and no
  `content-visibility` on the Learn section: ui-why found that `contain` makes the guide the containing block of the
  info bubbles (`position: fixed`, so they opened off the screen) and that the section's rendering on scroll moved its
  bubbles. The A/B below measures the guide open in the side panel.

## Harness (ui-learn.mjs)

E1, E6 and E12 by keyboard alone at 1440 px (load by Enter, values typed into the fields from each step's `reach`,
parts added with the add row and removed with Delete, the grid by arrow keys, answers typed with Enter, Next by
Enter); E5 (390 px, dark), E9 (320 px) and E15 (390 px) by touch emulation (taps; each value change a real CDP touch
drag of the part's handle along its locus, Snap on where the value is an E24 value, as in E15, off otherwise). At every
step: not done and Next disabled before its action, done after it, the figure equal to network.ts's number evaluated
in the harness. Also: one Undo brings the circuit before the load back and Redo the example, a wrong answer is refused,
Hint shows the step's hint, "→ theory" and back by keyboard, the focus after a load and after Next, no sideways scroll
at 320 and 390 px, the nav's four links fit, the guide's buttons are 44 px targets on touch. 197 checks: 23 steps done, 6 values typed, 6 touch drags, 8 answers, 24
figures. ui-why: 725 checks, 53 info buttons followed (the guide's three on a page with E1 loaded).

## Performance

Interleaved A/B with ui-drag.mjs (10 parts, 2 s drag, no guide open), HEAD's app code against this step's, alternating,
four runs each (two pairs, as the first pair's +0.39 ms was within the noise); main thread per drag frame at 4×, ms
(each the median of its attempts' medians):

| Pair, run | HEAD | after |
| --- | --- | --- |
| 1, 1 | 11.23 | 11.01 |
| 1, 2 | 10.87 | 11.86 |
| 2, 1 | 11.11 | 12.82 |
| 2, 2 | 12.50 | 11.08 |

Means 11.43 and 11.69: +0.26 ms, under the 0.3 ms allowed, with a spread of ±1 ms between runs of the same code. At
1× 2.64–2.68 (HEAD) and 2.76–3.09 (after). ui-drag's absolute 4× budget and 4× frame-loss checks fail on this machine
at HEAD as well (143 of 145 in every run, notes-M4.3a.md).

With the guide open (a scratch A/B: the same ten-part drag after E15 was loaded and undone, so the guide stays open,
against the guide closed; alternating, two runs each, 4×): 11.76 closed, 12.01 open, +0.25 ms. Nothing of the guide
renders in a drag (memo); the cost is the side panel's taller layout in the frames that write the live text.

## Runs

`npm run check`: 1,390,800 of 1,390,800. `npm run ui`: 12 of 14 scripts; ui-drag with only its two 4× checks (143 of
145, as at HEAD), ui-theory on its nav check, which expected three sections (updated to four with Learn; then 4,999 of
4,999). `npx tsc --noEmit` and `npm run build` pass.

## For M6.3b

- The guide panel is where the lesson's text (above the guide, examples-challenges.md §3 `lesson-text`) and a running
  challenge's panel can go: the same place at the top of the side panel, the same focus handling.
- `Why`'s `topic` serves the challenge lines that depend on the kind.
- The Learn section is the place for the five challenge kinds (below the examples) and their progress.
- modules.md is at 39 kB: split it (e.g. engine and page rows) before M6.3b adds rows.
- Not added: an `ex=` link parameter to open an example directly (notes-M6.1).
