# Notes from M3.4 (card and start)

## What was done

- **Card**: an entry in `TOOLS` in `pages/index.tsx` (category "Electronics", colour `#e0679a`, after the resistor tool)
  and the icon `smith` in `components/Home/ToolIcon.tsx` (unit circle, real axis, r = 1 circle, x = ±1 arcs, a dot at
  the match). The text and tags say only what works at M3.3b; the README row says the same at more length.
- **Metadata**: `<Head>` of `pages/smith-chart/main.tsx` already had the title and `/favicon.ico`; the description now
  says what the tool does.
- **Start state**: unchanged from M3.1. A visit without a query renders `defaultCircuit()` (D16, Γin = 0) and the link
  written after mount is exactly `?` + `encodeCircuit(defaultCircuit())`, with no link issues.
- **Empty state**: with no parts the card's place in `Strip.tsx` holds a dashed note (`data-empty`, `.emptyNote`) that
  says the chart shows the load alone and how to add a part (Add, or Draw and drag out of In). Add and Draw stay
  enabled; the strip's own "no parts" stays.
- **Start over**: a toolbar button after Redo (`data-start-over`), disabled while the circuit is the start circuit
  (`sameCircuit` with a module-level `START`). It commits a fresh `defaultCircuit()` through `commit` with no group (one
  undo step, redo cleared as for any edit), bumps `revision` so no field keeps typed text, clears the selection, and does
  nothing during a drag. It resets Z0, f0 and the load too, since D16 is the whole start state.

## Checks (in `ui-edit.mjs`, section "M3.4")

Fresh visit: link, committed circuit and |Γin| < 1e-9, Start over disabled, nothing to undo, no link issues. Remove
every part: empty note visible and naming Add and Draw, no card, Add and Draw enabled. Start over: link and readout
equal to the fresh visit's; Undo brings the empty circuit back, a second Undo the one-part circuit, two Redo Start over
again. Main page: the card (`li` holding the link to `/smith-chart/main`) with its category and an icon of 3 circles and
2 paths at 40 px. No horizontal scroll at 390 and 320 px on `/`, `/smith-chart/main` and the empty circuit's link. With
`SMITH_SHOTS` it also writes `home-1440-light.png` (the main page scrolled to the card).

## For M3.5

The theory's "→ theory" links can sit beside the empty note and the Start over button too; nothing here depends on them.
