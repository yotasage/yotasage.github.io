# Smith chart – notes of step M3.5 (theory)

M3.5a wrote the content in [theory.md](theory.md), M3.5b built the sections, M3.5c the short lines and the polish
(all 2026-11-12). The claims checklist is in [claims.md](claims.md).

## M3.5b: the sections on the page

- **Placement.** `pages/smith-chart/main.tsx`: the tool (`#tool`) stays the hero; `#theory` and `#references` follow,
  with a section nav in the bar. One `Bibliography` from `getStaticProps` numbers the citations in page order.
- **Citations** are made in `Theory`'s render body, in page order, never in figures, so folding cannot change them.
- **Equations** come from the registry by id (`Eq`); nothing is retyped. **Live numbers** are `data-live` spans from
  the engine, recomputed by name in `ui-theory.mjs`.
- **Cost.** `content-visibility: auto` on each section keeps the zoom at about 4.5 ms of main thread per frame at 4×;
  the release render's cost to the drag was fixed after M3.5b ([notes-M3.5-fix.md](notes-M3.5-fix.md)).
- **Figures** are inline SVG in chart units with the page's tokens; **folding** is `details` per topic, folded under
  720 px except a #link's target.

## M3.5c: short lines, theory links, polish

- **Short lines** (`components/Smith/whys.ts`, 39 keys from theory.md §8). The selected kind's line is a quiet line in
  the part card (`WhyLine`); the other 38 places (labels, toolbar, table rows, readout rows) get a 15 px "?" (`Why`,
  a 32 px touch target) whose bubble holds the line and "→ theory". The bubble opens by click, tap, Enter or Space,
  never by hover; Escape, a second press, a press elsewhere or focus leaving close it; one at a time. It is
  `position: fixed` (the side panel scrolls, so an absolute bubble would be clipped), placed on opening and, once a
  frame, on a scroll while open (closed when its button leaves the screen), and rendered only while open: nothing
  runs during a drag or zoom. The side panel is laid out again on every drag frame (live.ts), and the first
  buttons (inline-flex with an inline-grid mark) cost that 1–2 ms a frame at 4× (ui-drag 10–12 ms, 9.4 without
  them); an unlabelled button is now the 15 px mark itself, fixed size with `contain: layout size style`: 9.5 ms.
- **A chart fix it showed.** `ChartView` measured the chart box again only on scroll and resize; with the toolbar's
  "?" buttons the toolbar wraps at 1280 px when the draw tool's button appears, moving the chart 36 px, and a press
  missed In (ui-edit's random draws stayed armed). The rect is now measured at every press and on pointerenter (one
  read per gesture), and the toolbar's buttons sit tight to their controls.
- **Following a link** (`followTopic` → `Theory`): the topic opens even when the hash is already its own (no
  `hashchange`), the heading gets the focus one frame after the link's navigation (which clears the focus), and the
  topic shows "↩ Back to the tool", which scrolls back and focuses the button the link came from.
- **Fixes in "Moving on the chart".** (a) `.cites` was `nowrap` with its leading space inside, so "negative [2,
  “Circuit elements and topology”]." could not break and stood on a line of its own; now a no-break space joins the
  word to "[n," and long section names wrap inside. Inline formulas (z_in = z_L + z_s, x = −1/(ωCZ0), Γ = (z − 1)/(z +
  1), …) are `nowrap` spans in every topic. (b) Substitutions are aligned rows: the symbol, its equation, then one
  member per line with the values put in and the result, ω written 2π·f0 in the unit f0 is typed in, a leading minus
  braced so MathML spaces it as a sign. (c) The z-plane figure uses the disc's 2.5 × 2.5 box and marks x = −1, 0, 1
  and L on the line r = 0.5 and at the same points on the r = 0.5 circle, with ±∞ at the open.
- **Harness.** `ui-why.mjs` (in `npm run ui`): all 39 lines and texts, every button's bubble on screen, link, focus and
  way back by mouse; the keyboard path; tap at 390 px on folded topics; 320 px; no horizontal scroll. `ui-theory.mjs`
  also checks that every #link on the page resolves and that the short lines lead to topics.

## M3 roll-up ("done when" of milestones.md)

| Item | Checked by | Result |
|---|---|---|
| Typing a value and dragging to it agree to the shown digits | ui-drag "typed vs dragged" | pass (135/135) |
| Edit → chart → drag back to 1e-9 relative | ui-drag "drag back" | pass |
| Undo and redo under random sequences | ui-edit, 200 random sequences against a model history | pass (3,714/3,714) |
| Scripted drags on every part kind, mouse and touch | ui-drag (10 kinds × mouse 1280 px, touch 390 px), ui-edit (draw) | pass |
| The link round-trips | check-state "link round trip", ui-strip (reload), ui-edit (link after every step) | pass |
| Main tasks by keyboard alone, with a "→ theory" link and back | ui-strip (add, move, remove), ui-edit (handles, undo), ui-why (link, back) | pass (347, 3,714, 453) |
| Every live number in the theory equals the engine's | ui-theory (start, C1, C2, typed load, undo) | pass (84 numbers, 2,206/2,206) |
| Every citation resolves | ui-theory (and the build: an unknown key stops it) | pass (51 citations, 68 #links) |
| Every claim has a source or a derivation | [claims.md](claims.md) (theory, added sentences, 39 short lines) | complete |
| Layout at 320 and 390 px | ui-strip, ui-path, ui-drag, ui-edit, ui-theory, ui-why (no horizontal scroll) | pass |
