# Step M2.4d – the short lines beside the controls (2026-11-16)

The 113 lines of [theory-lines.md](theory-lines.md) are on the page, with their "→ theory" links, and the Calculators
panel's sentences link to their topics.

## How the lines are shown

- `components/EmSim/whys.ts`: `WHYS` (key → label, text, topic or null; 114 entries: the 113 of theory-lines.md and one
  for the switch) and `TOPIC_TITLE` (the topics' titles for the links' accessible names; Theory.tsx's `TOPICS` is not
  in the first load).
- `components/EmSim/Why.tsx`: `Why` (one line, "Label: text → theory"; `bare` leaves out the label for a line right under
  its only control) and `Whys` (several lines under a row of controls, keys as one string). Both are `React.memo` on
  string props, so a drag frame that renders TraceSection or TraceResults does not render them.
- Visible text in a quiet small type (`.why`, `.whys` in `EmSim.module.css`), never only on hover. Lines sit under the
  row of controls they describe, not inside `<label>`s (that would change the controls' accessible names) and not
  inside the 8.5 rem value fields (a line would wrap to six rows). Controls that repeat (the layer rows, the general
  editor's rows, the results' values) have their lines once, in a group after the list or the values.
- **The switch:** the "?" button in the bar (`data-whys-toggle`, `aria-pressed`) hides or shows every line by the root's
  `data-whys` (CSS only). **Default: shown**; hidden is stored as `emsim.whys = off` in `localStorage` (read after
  mount, try/catch), shown removes the key.
- Links are plain `<a href="#topic">`. Fixed on the way: a link followed before the theory had loaded scrolled to the
  topic but did not make it the `:target` (the element did not exist at the navigation), so it had no highlight; once
  the chunk is there EmSimTool now repeats the fragment navigation with `location.replace` (no hashchange, no history
  entry).

## Lines placed, moved, added

- All 113 placed; none dropped. Changed to fit a group: "Reset view" reads "The corner button shows the whole
  cross-section again." (the line is under the drawing, not beside the button); "Flags" is "Notes from the solver:" with
  the rest as written; "Width / Width (each)" also serves the general editor's Width.
- Added: the switch's own line (`whys`). Controls without a line of their own: Close and Clear filters of the picker,
  the general editor's row select and row layer, the Solve and Sweep buttons, the MC Cancel (the Cancel line covers
  both), the solve info line, the "Other definitions" summary. Their neighbours' lines cover them.
- Where conditional: the KiCad lines only with a board and project open, Zdc on an unequal pair, flags with flags,
  the issue lines with issues, "No formula" instead of the formula lines when no formula fits.

## The Calculators panel's links (`data-calc-link`)

"As JLCPCB's calculator" paragraph → `#solder-mask` and `#trapezoid`; the reduction paragraph → `#field-solver`; the
Kirschning–Jansen note and the copper neglect sentence → `#copper-thickness` (the mask one → `#solder-mask`, the ground
width one → `#coplanar-ground`); each formula's range and accuracy → `#closed-forms`.

## Checks

`scripts/harness/emsim/ui-why.mjs` (in `npm run ui`): every key in the states that show it (see its header), no key
twice, every text and link as in whys.ts, **every key of whys.ts seen** (the KiCad two only where the owner's files
are), one link of every topic followed by mouse (target, in view, highlighted; a second click replays), the
Calculators links, Tab and Enter, a tap at 390 px, the switch and its memory, no horizontal scroll at 320/390/1440 in
both themes, screenshots `emsim-why-trace-*`.

Results: ui-why 89 checks; `npm run ui` 667 in all (578 before), 10 of 10 scripts; `npm run check` 19 221. First load
174.8 kB gzip (169.0 before: whys.ts's text and Why). `ui-drag.mjs` at 4×, task per frame: microstrip 10.86 ms,
pair-microstrip 11.71 ms, pair-cpw 12.70 ms, no dropped frames (11.6, 12.4 and 12.1–13.0 before): not worse.

## For M2.5 and later steps

- A new control or readout gets its line in `whys.ts` and in theory-lines.md, placed with `Why` or `Whys`, and the
  state that shows it in ui-why.mjs's lists (the count check, 114 now, changes with it). A key in whys.ts that no state
  shows fails the harness.
- Keep `Why`/`Whys` props strings (memo); a line inside a drag-rendered component must not take objects.
- M2.5's status note can point at the switch ("?" in the bar).
