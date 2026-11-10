# Resistor lookup – notes from S2b

Step S2b (2026-11-10): the owner's feedback on S1 and S2, and the TikZ export. Read with [notes-S2.md](notes-S2.md).

## State added

- URL `read=marking`, only when "Read as: Marking" is chosen. `readInput(text, readAs)` sorts the readings in groups:
  values (or markings) first, then the other kind, then markings upside down. Reading ids do not depend on the
  choice, so `as=` still names one. A text with a unit, a tolerance or a decimal sign is never a marking.
- An example may say what it is meant as; `tryExample` (`ResistorTool.tsx`) then sets the choice only when the text
  would read differently without it. `Change.readAs` does the same for table clicks.

## Readings from the other end

- **The order is never changed** (owner's decision): what was typed or clicked, in its direction, is first; the
  other end is offered below. Labels carry the plausibility.
- `bandDoubt(ohms, tolerance, colours)` (`read.ts`) gives why a reading is unusual, or nothing: a first band that is
  black, above 1 GΩ, below 1 mΩ, in no E-series, only in E192 at ±1 % or wider, only in E96 above ±1 % (E48: above
  ±2 %), or a tolerance of ±0.05 % or tighter.
- `otherEndLabel(given, other)`: the other end is "more likely" when only the given reading has a doubt, "unlikely"
  when only the other end has one, unlabelled otherwise. `Reading.doubt` and `Reading.likely` carry it to the list,
  `otherEnd()` (`view.ts`) to the note by the drawing. A reading with a doubt is never tagged "standard value".

## Drawings

- `DrawOptions.scale: false` leaves out the scale bar; without a caption the picture ends just under the part. The
  export passes it with Caption: None; the hero drawing keeps its scale bar.
- **TikZ** (`tikz.ts`), always the flat drawing, from `axialGeometry` and `chipGeometry` (`draw.ts`), which the SVG
  uses too. Coordinates are millimetres on the part with `y` down; `x=5mm, y=-5mm` enlarges (at most 80 mm wide).
  Colours are `\definecolor`s (`bandyellow`, `resistorbody`, `chipcoat`), the body outline is a `\def` inside the
  picture (fill, clip of the bands, outline), text is nodes: the marking with `\fontsize` from its height in the SVG,
  caption and scale label in the document's sizes. `texText` writes Ω, ±, × and · as maths, so the file is ASCII. A
  background uses a `pgfonlayer`. pdfLaTeX and LuaLaTeX compile the samples.

## Reference tables

- `thirdDigit(r, digit | null)` (`view.ts`) adds or removes the third digit and keeps the size of the value (4.7 kΩ
  + 5 is 4.75 kΩ; without it again 4.7 kΩ, four bands). Cells that would give no code are dimmed; the tooltip says why.
- `markingExample(code, r)`: read as a marking, on a chip, in the example's marking system, and 0805 when the size
  carries no marking (`markedSize`, also used by the EIA-96 table).

## Harness

`npm run check`: 2,395 checks (also imports `components/Resistor/view.ts`). `npm run ui`: 87 checks.
`npm run tikz -- <folder>`: two `.tex` samples.
