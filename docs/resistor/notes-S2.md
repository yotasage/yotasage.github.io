# Resistor lookup – notes from S2

Step S2 (2026-11-10): the drawings, the decoder, the export and the Reference section. Read with [plan.md](plan.md)
and [notes-S1.md](notes-S1.md).

## State added

| Where | Name | What |
| --- | --- | --- |
| URL | `part` | `axial` or `chip`, only when chosen; otherwise a typed marking shows a chip, anything else an axial part |
| URL | `bands` | 3 to 6, only when chosen; otherwise the typed band count, or 4, or 5 when the value needs three digits |
| URL | `body` | Rating of the axial body in watts (`0.125`, `0.5`, `1`), when not 1/4 W |
| URL | `coat` | Body colour (`blue`, `green`, `grey`), when not beige |
| URL | `size` | Imperial name of the chip size, when not 0805 |
| URL | `mark` | `3`, `4` or `eia96`, only when chosen; otherwise 3 digits from 2 %, 4 digits to 1 %, or what was typed |
| URL | `tcr` | ppm/K of the sixth band, when set by a band; otherwise the typed one, or 50 |
| localStorage | `resistor.style` | `flat`, only when the flat style is chosen |

All of it is one `View` object (`components/Resistor/view.ts`), read and written by `viewFromParams` and
`viewToParams`. Export settings (width, density, background, caption) are not kept.

## How it fits together

- `resolveView(view, reading, text, tolerance)` gives a `Resolved`: the part, the band code or the marking, why a
  value cannot be shown and the `fixes` offered. Before anything is typed it resolves 4.7 kΩ (`example`).
- Everything that changes the result goes through `change(c: Change)` in `ResistorTool.tsx`: `ohms` (written into the
  field as `4.7 kΩ`), `tolerance`, `view` (merged) or `text`. S3 and S4 can use the same for "use this value".
- `drawAxial(colours, body, coatId, options)` and `drawChip(size, marking | null, options)` return
  `{ svg, width, height, bands }` in millimetres. Options: `style`, `ink` (lines and text; `currentColor` on the page so
  it follows the theme, a hex in exports), `background`, `caption` (lines), `id` (prefix of gradient ids; two drawings
  on one page need different ones: `hero` and `out` are taken), `interactive` (`data-band` areas for clicks).
- `strokeText` and `textWidth` (`glyphs.ts`) are free for circuit drawings in S3: capitals 6 units high, paths only.
- Sections are now Lookup, Drawing, Reference. On a wide screen the hero (field, drawing, value) scrolls by itself
  when it is taller than the window.

## Decisions

- **Hero:** field, then the drawing with its controls, then the value. The band legend under the drawing is the band
  picker; S1's larger strips stay in Lookup as the explanation (4 and 5 bands side by side).
- **S1's themed footer and ghost value are kept.** The footer follows the theme beside the drawings without clashing.
  The ghost 4.7 kΩ now has company: the drawing shows the same example in full colour, and says it is one.
- **A colour that would give a code nobody writes cannot be chosen** (a leading black band, all digits black); the
  option is dimmed and its tooltip says how the value is written. The same rule decides whether the other end is a
  reading.
- **Three bands set the tolerance to ±20 %**, and going back to 4, 5 or 6 bands from a tolerance without a colour sets
  5 % or 1 %. "No band" in the tolerance picker of a four-band part makes it a three-band part.
- **Sizes 01005, 0201 and 0402 are drawn without a marking**, with a note; 0603 is drawn marked, with a note that
  some are not.
- **Transparent exports use dark lines and text** (for light documents); a dark or dark custom background switches
  them to light. JPG is drawn on white when there is no background.
- A click on a digit in the colour table sets the first digit; multiplier, tolerance and TCR set their own band (TCR
  switches to six bands). EIA-96 cells keep the decade of the current value and set 1 %.
- Body colours: beige and blue are named as usual for carbon and metal film; green and grey make no claim.

## Harness

- `npm run check`: 1,819 checks, of which 488 on the drawings (every chip size and marking form, every body and
  band count, both styles: well-formed, self-contained, millimetre viewBox, true body size, the wider gap).
- `npm run ui`: 50 checks; S2 adds band clicks, band count, the other end, a value that cannot be shown, the marking
  field, an unmarked size, the style, all four export formats at the width asked for, both copies, the tables, a link.
- `npm run samples -- <folder>`: a contact sheet of drawings without the page. `npm run exports -- <folder>`: four
  files saved by the page's own buttons. `npm run shots` as before.
- Large heredocs in Git Bash broke on this machine: write a script file and run it.

## facts.md: found while building

- **Termination lengths are not in facts.md.** `CHIP_SIZES[].termination` (0.1 mm for 01005 up to 0.6 mm for 2512)
  is from memory of common datasheets, unverified: S5's research pass should check it.
- Reading a five-band 1 % part backwards often gives a valid code with an odd value (49.9 kΩ reads 129 GΩ ±0.02 %
  from the other end): both are shown with whether each is a standard value, as facts.md asks. 129 is in E192, so
  "standard" alone does not settle it; S5 could rank by series and plausible range.
- Nothing in the colour, marking or size tables was found wrong.

## Left out

- Marking drawn on 0402 (rare), marking with an underline, tolerance letter printed on the chip.
- Export settings in the link or in the browser; a PDF export; a printable sheet (BL33).
- MELF, power and network parts (BL30).
