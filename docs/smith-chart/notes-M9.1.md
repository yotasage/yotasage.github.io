# Smith chart – notes of step M9.1 (access)

Milestone M9 (milestones.md): an audit of keyboard use, names and roles, contrast, reduced motion and large text, with
fixes. The check is `scripts/harness/smith/ui-a11y.mjs` in `npm run ui` (about 370 checks, 3 minutes).

## Findings and fixes

| Kind | Found | Fix |
| --- | --- | --- |
| Contrast, text | 7 light tokens under 4.5:1 on `--bg`, `--field` or `--raise`: `--part-2` 3.54 (on raise), `--part-6` 3.33, `--part-4` 3.60, `--part-7` 3.58, `--part-1` 4.14, `--part-8` 4.50, `--ink-3` 4.12; `--grid-scale-ink` 4.49 on the chart. Dark: `--ink-3` 4.46 on field (3.90 on raise), `--grid-scale-ink` 4.46. The footer's dark "quiet" `#8f8c83` 4.21. A solver chip's muted span (`--ink-3` on the accent tint) 4.36 / 4.28. | HSL lightness only, hue and saturation kept (light: `--part-1` `#186ab7`, `--part-2` `#ba3e0d`, `--part-4` `#257736`, `--part-6` `#816500`, `--part-7` `#0a7384`, `--part-8` `#c72a2a`, `--ink-3` `#6c6861`, `--grid-scale-ink` `#6c6860`; dark: `--ink-3` and `--grid-scale-ink` `#a6a49c`); the footer's quiet colour follows `--ink-3` in both themes; the chip's span uses `--ink-2`. `lib/smith/figureStyle.ts` keeps the page's light colours (parts, `INK_3`, the scale ink, the grid mixes). |
| Contrast, lines | Light major grid lines 2.77 (Z) and 2.51 (Y) on the chart, the rim scale's ticks 2.96; dark scale ticks 2.79. | Z major ink at 0.48 (was 0.44), Y major accent at 0.65 (was 0.55), `--grid-scale` `#979287` light and `#7e7b72` dark. Minor lines left as they are (decoration between the labelled major circles; the readout gives every point as text). |
| Contrast, field edges | Text fields, selects and the value-list box were outlined in `--rule-strong`: 1.55–1.69:1 (light), 1.71–1.86:1 (dark). | A new token `--edge` (`#968b73` light, `#7b7b73` dark, `--rule-strong`'s hue, 3.05–3.34:1) on `.input`, `.select`, the digits select and `.own`. Buttons and cards keep `--rule-strong` (their text names them). |
| Names | The theory and references regions were named by `aria-labelledby` to a heading inside a `content-visibility: auto` section: unnamed while off screen. The report's region took the whole heading with its button ("Report About the report Print report"). Each equation row (a focusable `li`) had no name. | `aria-label` "Theory", "References", "Report"; each equation row is named by its title (`aria-label`). |
| Reduced motion | The hover and toggle fades, the chevrons' turns and the #link highlights (topics, references) ran under `prefers-reduced-motion: reduce` (the Explain marker already stopped). | One rule in Smith.module.css: no transition, animation or smooth scroll inside `.root` under reduce. |
| Text size | Every font size was in px, so a larger default font in the browser changed nothing. | 128 sizes in `Smith*.module.css` are now `rem` (N/16: equal at the default 16 px). Kept in px: the chart's SVG text and marks (grid labels, node and marker labels, the parts' symbols, the plot's text), whose positions are worked out in px, and the fixed 15 px "?" and "=" marks. |
| Layout | At 320 px a citation with a long section ("[2, “Normalization”]") and two sentences of live values in topic text ran past the column, cut by the section's paint containment; with 2× text so did inline formulas (`.nw`) and the "Your progress ?" head in Learn. | `.theory .cites` may break anywhere when it must; `.theory p > .n` and `p > .nw`, `li > .nw` are inline blocks of at most the line's width that wrap inside only when longer than the line; `.listHead` wraps. |
| Harness | `ui-why.mjs` hung in this Edge: a page behind the context's newest page gets no animation frames, so Playwright's "stable" wait never ended (also with the old code). | `bringToFront()` before using a page. |

Kept as they were, after checking: the bar's **Tool** link is the skip link (second Tab stop; Enter on it and Tab lands
in the tool), so no extra skip link. The derivation is a native modal `<dialog>`: past its last control Tab goes to the
browser (never to the page behind); Escape closes it and the focus goes back to Derive. The strip of parts is one Tab
stop whose arrows walk the parts (as M3.1 made it). `tabindex="-1"` text blocks that a guide step moves the focus to are
read by their content (ARIA forbids naming a paragraph).

## The contrast table (after)

Lowest pair of each kind (ui-a11y.mjs prints the table):

| Kind (need) | Light | Dark |
| --- | --- | --- |
| text on bg, field, raise (4.5) | `--part-7` on raise 4.55 | `--ink-3` on raise 4.57 |
| text on a pressed toggle or chip (4.5) | `--accent` on accent-soft/raise 4.64 | `--ink-2` on accent-soft/raise 4.50 |
| chart text (4.5) | `--grid-scale-ink` 5.50 | `--grid-scale-ink` 5.22 |
| chart lines and parts (3) | `--grid-y-major` 3.05 | `--grid-y-major` 3.08 |
| focus ring (3) | `--accent` on raise 5.34 | `--accent` on raise 6.29 |
| form-field edge (3) | `--edge` on bg 3.06 | `--edge` on field 3.05 |
| site footer (4.5) | quiet 5.04 | quiet 5.67 |

On the page: about 33,000 visible texts (every `<details>` open, content-visibility forced) and 168 field edges over
three pages in both themes, each over its composited background, all at AA.

## What ui-a11y.mjs walks

One Tab cycle of the whole page (about 400 stops, each showing its focus, back to the home link: no trap); then by keys
only: add a part, type a value, a handle's arrows, the chart's cursor, undo and redo by keys and buttons, a short line
(Escape, its theory link, ↩ Back), an equation's variables, Derive and its dialog, Explain and its Derive, Print
report; solve (mark two parts in the strip, goal, Apply, a suggestion, the family's slider and member, a variant);
sweep (on, marker, plot, VSWR, a chart marker); export (every option pressed by Enter, the lists, all 9 files, both
copies, Open project's picker); Learn (example, challenge with hint and Check, lesson link copied); a topic folded and
a citation followed. The accessibility tree is read in 15 states. Reduced motion compares `reduce` (0 running, 0
elements with a transition) with `no-preference` (some). Layout: 200 % browser zoom (720 px at 2×), 2× root font size
at 320, 390 and 1440 px, and 320 px plain, both themes.

## A/B and timings

Interleaved A/B, B (this step) and A (the commit before, the page's files stashed) in the order B, A, B, A on the running dev server, each `SMITH_TRACE_AB=1 tsx ui-trace.mjs` (ui-drag's 4× handle drag of 10 parts with a 10,000-point band, median of 3): main thread per frame B 12.83 and 12.33 ms, A 12.41 and 12.65 ms; mean B − A = +0.05 ms (pairs +0.42 and −0.32: noise). The changes are CSS values, `rem` sizes, labels and one media rule, none on the drag's path.

`npm run check` passes (1,399,628 checks); `npm run ui` passes but for the 4× timing checks known to fail on this machine with the old code too (M9.3): ui-path 4× zoom (8 frames lost, 7.60 ms per frame; passed in a second run) and ui-drag 4× (3 frames lost, 11.71 ms per drag frame).

## For later steps

- Not tried with a real screen reader (NVDA, VoiceOver): names and roles are checked in the tree only (M9.2 or the
  owner's checkpoint).
- The minor grid lines stay under 3:1 by design; a "high contrast grid" option would be a backlog row if wanted.
