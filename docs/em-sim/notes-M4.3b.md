# Notes of step M4.3b – via theory and Examples on the page (2026-11-17)

## Via theory

- `components/EmSim/TheoryVias.tsx` (Theory chunk): topics 7–13 of [theory-vias.md](theory-vias.md) as written, without
  the claim markers, after `tolerances`; `VIA_TOPICS` joins `TOPICS`, so the contents list them and the theory's own
  numbering goes on (7–13). Citations through the same `cite()`: the build-time scan of `pages/em-sim/main.tsx` finds
  them (16 sources, all in references.bib), and they are numbered with the rest in the page's order.
- Live numbers: ViaSection's `ViaSolve` feeds `feedTheory({ via })` the plots' last full solve (never a drag's coarse
  frame; null while the via has errors). TheoryVias makes `viaBinding({ model, via })` of it with eqvaluesVia's default
  choices (the first piece between the signal layers, the first node with a ΔC, the point nearest 10 GHz, the TDR's
  lowest impedance) and hands it to the same `Eq` with `via` set: `data-scope="via"`, notes that name the Via
  section, `data-v` only for real values (the S entries are complex). On the default via `via-section-
  pair`, `via-pad-coupling` (pair only) and `via-target` (the Target's own result, not fed) stay symbolic with a note.
  The default via has two tiny pad stubs, so `stub-quarter` is live on it.
- `TOPIC_TITLE` (whys.ts) has the seven ids: the equation panel's "→ theory" now shows for every via entry.
- Figures (`TheoryViaFigures.tsx`): fixed setups decoded from the examples' own links (V = `defaultSetup()`, V with
  25 mm feeds, exit on L3, backdrilled, VP), each solved once per page in the worker on `theory-via-<key>-<tr>` (a shared
  promise; a failed solve is dropped so a later mount tries again), only once `Near` mounts the figure's body. Side
  view (heights to scale, a label per piece of at least 11 px), cut with the R_eq circle, with and without returns, ΔC
  bars, and the page's `Plot` for |S21| stub against backdrill, the TDR at three rise times (resampled onto the 35 ps
  record's time axis), |S11|/|S21| faded above λ/8, Sdd21/Scc21 (Scd21 is at the floor and said so). Not drawn: BL139.
- `content-visibility` stays on the Theory; its intrinsic size went from 14 000 to 22 000 px (the theory is longer).

## Short lines

The via lines of whys.ts and theory-lines.md link to the via topics (30 lines re-linked; `via-feed-z` keeps
`field-solver`, the feeds are the trace's solve, and `via-field-drive` keeps `pair-definitions`). The nav line names
Examples.

## Examples section

- `components/EmSim/Examples.tsx`, a chunk of its own loaded by `useNearLoad('examples', …, 'ex-')`: near, by
  `#examples` or by an example's id (`#ex-via-stub`); EmSimTool's `notTheory` keeps those hashes from loading the
  theory. In the nav between Export and Theory. It renders `EXAMPLES` (lib/emsim/examples.ts), not the markdown.
- A link is an `<a>` whose `href` is the state's own path, so a new tab, a middle click or a copied link work as any
  link. A plain click (mouse, Enter, tap) calls EmSimTool's `applyLink(query, then)`: `splitQuery`, `decodeLink` (a
  JLCPCB list key loads the list first, as the page's own link does), `commit` as one undo step, the link's issues
  shown as the link's; the address follows through the usual `replaceState`. Then it scrolls to `#via` when the query
  has `via=`, else `#trace`, and for five links (`OPENS`) calls `openEq` with the link as `from`, so Escape on the
  panel brings the focus back to the example. The long links (1.6–1.7 kB) apply the same way.

## Sizes and checks

- First load 185.0 kB gzip (184.4 before: the nav entry, `applyLink`, the section frame). The theory's chunks with the
  via topics 240.5 kB gzip, loaded later; the Examples chunk carries examples.ts.
- `ui-theory.mjs`: the 7 via anchors in the contents, the 16 via sources cited and numbered, at least 25 via equations,
  every via live number equal to `viaBinding` in Node on the default (C44) via (within 1e-9), 14 entries live with real
  values and `abcd-line`, `s-abcd`, `s-db` live with complex ones, three symbolic, the nine via figures drawn, six ΔC
  bars, the backdrill drawn, R_eq equal to the model; screenshots `emsim-theory-via-tdr-*`.
- `ui-examples.mjs` (new, 102 checks): see modules-page-checks.md. `npm run ui` 1 672 of 1 672 (ui-theory 123,
  ui-why 116 with the re-linked lines); `npm run check` 29 377. One full run had ui-release time out waiting for the
  card's navigation; it passed in the run before and twice alone after.
- A jump to `#via-limits` once landed 91 px off: the figures above it mounted after the jump and their "Solving" line was
  shorter than the box they replaced. Each figure now keeps about its drawn height (`FigH`) from before it mounts until
  it is drawn.

## For M5 (3D view)

- Topics the 3D view should link: `via-line` (the barrel as a line, the cut), `via-pads` (pads and antipads), `via-return`
  (where the return current goes), `via-stubs` (the stub and the backdrill). The side view of `TheoryViaFigures.tsx` and
  the example `ex-via-stub` (through, stub, backdrill) are the natural first scenes; `ex-via-pair` for a pair.
- A 3D view in the theory would go in through `Near` the same way (mount only when near; a channel of its own).
