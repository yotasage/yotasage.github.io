# Resistor lookup: notes from S5 (theory, references, corrections)

## How the page cites

- `pages/resistor/main.tsx` loads `references.bib` in `getStaticProps`; `ResistorTool.tsx` makes one `Bibliography`
  and hands it to Lookup, Combinations, Design, Reference and Theory. The References section is drawn last.
- Numbers follow the first citation on the page. Notes that come and go (the Lookup has none before a value is
  typed; the notes of Combinations and Design arrive with the worker's results) get their numbers reserved in
  `ResistorTool.tsx` (`CITED_BY_…`), so the numbers change once, when the first value is typed, and never while a
  search runs. Known gap: a Design with a field that cannot be read shows no notes, and two numbers are then first
  seen further down, out of order.
- A source is cited only for what [sources.md](sources.md) says it supports. Check there before adding a citation.
- Figure coordinates are rounded to 0.01: `Math.log10` differs in the last digit between Node and the browser,
  which is a hydration error.

## Deliberately uncited (the text says so where a reader could take it for sourced)

- Ohm's law, power, series, parallel, dividers: general circuit theory. Horowitz and Hill is in `references.bib`
  but was not read, so it is not cited.
- That 1 % parts are sold in E24 values; "ranges meet at" (r − 1)/(r + 1) is the page's own arithmetic.
- Technologies table: the metal oxide and foil rows (marked †) and the noise and stability columns without a number.
- Tracking of parts in a ratio; the divider's 2t(1 − k) (own derivation, same form as TI SLVA423).
- Pulse load beyond "datasheets give pulse diagrams, tested per IEC 60115-1"; no noise index figures; the voltage
  coefficient of thick film and carbon; parasitic L and C figures; the sulfur mechanism.
- IEC 60063 and IEC 60062 are cited as the standards that define the series and the codes (only their catalogue
  pages were read); Johnson and Nyquist as the original papers.

## Decisions

- EIA-96 `R` and `S`: the first reading is TT Electronics' (S = ×0.01, R = ×0.1), the only maker's table found; the
  other is a second reading (id `eia96-alt`) with a note.
- Axial bodies are Yageo's CFR series; the smallest is now 1/6 W (`body=0.167` in the link; `body=0.125` of older
  links still opens it).
- Limiting voltages are Yageo's, with Vishay's beside them where higher (`voltageNote`). 01005 stays without one, as
  in facts.md, although sources.md lists 15 V for Yageo's 0100: the owner may want it added.
- The derating chart uses the chip size of the drawing and can change it. The example value is 4.7 kΩ until a value is typed.
- Topics are `<details>`, folded at first below 720 px; a contents link opens its topic.
- The Design headline joins numbers and units with no-break spaces (`unbroken` in `components/Resistor/design.ts`).

## Harness

`npm run check` (3294), `npm run ui` (192, 36 in `ui-theory.mjs`), `node shots-theory.mjs <folder>`. Left: BL36.
