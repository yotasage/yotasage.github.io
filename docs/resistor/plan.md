# Resistor lookup – plan

A resistor tool at `/resistor/main`, running entirely in the browser like the rest of the site.

The owner's goal (2026-11-10): a tool that is a 10/10 next to every other resistor tool online: professional, great
looking, as useful and handy as possible. It does not have to follow the style of the other tools on the site.
Functions beyond the ones asked for are welcome. The owner does not read code or diffs: a step is judged by how the
page behaves and looks.

## Files of this plan

Read only the files a task names.

| File | What |
| --- | --- |
| [plan.md](plan.md) | This index: goal, ground rules, design direction, steps and status, module map, how a step is run |
| [facts.md](facts.md) | The tables and rules the tool must get right (E-series, colour code, SMD markings, sizes), with what is still unverified |
| `notes-S<n>.md` | What step n left for later steps (under 6 kB each): URL parameters, CSS tokens, harness commands, decisions |

## Ground rules

- **The site's hard constraints apply** ([CLAUDE.md](../../CLAUDE.md)): no server, self-hosted assets only (no web
  fonts from a CDN: system font stacks), nothing leaves the device, licence check for a new dependency. Prefer no new
  runtime dependency at all; the tool needs none.
- **One page, one smart input.** Results update on every keystroke; there is no submit button. An input that can be
  read several ways (`101` is 100 Ω as an SMD code and 101 Ω as a number) shows every reading and lets the user pick.
  An input that cannot be read says why.
- **The whole state is in the URL** (query string, replaced as the state changes, without reloading), so every result
  is a link. Preferences that are not part of a result (theme, drawing style, own value lists) are kept in
  `localStorage`, read only after mount.
- **Every value can be copied** with one click, as `4.7 kΩ` and as `4k7`.
- **Keyboard first, and phone width and touch work.** The input has focus on load on a desktop; arrow keys step to
  the next standard value.
- **Colour is never the only carrier.** Bands are named wherever they are shown (colour-blind users).
- **Numbers are honest.** Errors are signed and show enough digits; where sources disagree (see facts.md) the page
  says so instead of picking silently.
- **The card on the main page and the README list only what works**; each step updates them.
- **Search must be exhaustive** within its stated limits, and say what the limits are.

## Design direction

The look is the owner's second requirement after usefulness. It is not the look of the other tools.

- **Idea:** a precision instrument, not a form. The resistor drawing and one large input are the hero; everything
  else is calm, dense, aligned data.
- **Themes:** light and dark, following the system, with a switch on the page (kept in `localStorage`). All colours
  are CSS variables on the tool's root element (`data-theme`); nothing is hard-coded in components. Both themes must
  look designed, not inverted.
- **Colour:** neutral chrome (ink and paper, slightly warm), one restrained accent. The only saturated colours on the
  page are the resistor bands, so they read at once. No gradients as decoration, no glassy cards, no purple.
- **Type:** system UI stack for text; tabular monospace numerals (`ui-monospace`, Cascadia, SF Mono, Consolas) for
  every value, so columns of numbers line up. A clear scale: one very large value, small quiet labels.
- **Data:** results are tables and rows with right-aligned numbers, a small bar showing each signed error, and units
  in a quieter colour. Sections are separated by space and fine rules, not by heavy boxes.
- **Layout:** on a desktop, the input and the drawing stay in view while the results scroll; on a phone, one column.
  Sections: Lookup, Drawing, Combinations, Design, Reference, Theory, References, reachable from a slim nav that
  shows where one is.
- **Motion:** short and functional (about 120 ms), none for users who prefer reduced motion.
- **Site frame:** the page keeps the home link (`components/icons/home.tsx`), sets its own `<Head>` and the
  `html, body` background per theme, and gets the site footer from `_app.tsx`.

## Steps

One agent per step, started and checked by the main session. S1 and S2 are the smallest useful version; the owner
tries it before S3 to S5 are briefed in detail.

| Step | Scope | Status |
| --- | --- | --- |
| S1 | Foundation and lookup: core library (E-series, reading and writing values, colour code, SMD markings, package table) with a test harness; the page shell and its design system (themes, nav, layout); the smart input with its readings; the lookup (the value below, above and nearest in E3 to E192 and E24∪E96 with signed error, bands and markings for each); URL state; the card and icon on the main page | done 2026-11-10, notes in [notes-S1.md](notes-S1.md) |
| S2 | Drawings and decoder: SVG drawings of a chip resistor (every size, with its marking) and an axial through-hole resistor (body sizes, 3 to 6 bands), in a realistic and a flat style with a switch; click a band or edit the marking to change the value; both reading directions; export as SVG, PNG, JPG and WebP at a chosen size and background, and copy to the clipboard; the reference tables (colour code, SMD codes with EIA-96, chip and axial sizes) | done 2026-11-10, notes in [notes-S2.md](notes-S2.md) |
| S2b | The owner's feedback on S1 and S2: a value is read as a value first with a "Read as: Value / Marking" choice in the link, the reading from the other end is labelled more likely or unlikely, the colour table has a column per band, marking examples draw a marked chip, Caption: None gives the bare drawing, and the flat drawing is saved or copied as TikZ | done 2026-11-10, notes in [notes-S2b.md](notes-S2b.md) |
| S3a | The combination search engine, library only: networks as trees (value, formula, canonical key, layout for a circuit drawing), the exhaustive search for 1 to 4 parts by sorted pair tables and binary search in ohms and siemens, ranked results with the best for each number of parts, tolerance (worst case and RSS) and the share of voltage, current and power in each part, value lists (a series over a range, a pasted list), and a worker with a client that falls back to the page | done 2026-11-10, notes in [notes-S3a.md](notes-S3a.md) |
| S3b | The Combinations section on the page: the networks of 1 to 4 resistors (default 2; any way, series only, parallel only; a value more than once or once) from an E-series over a range or from the visitor's own value lists ("My values": pasted or typed with a decimal comma read, chips that show each reading, presets, kept in the browser, carried by the link), searched in the worker on every change; the best for each number of parts, the ranked list with a filter, each result with a circuit drawing, formula, value, signed error with its bar, worst-case and RSS tolerance, the share of voltage, current and power in each resistor, watts and the smallest chip size for a voltage or a current, copy as text, CSV | done 2026-11-11, notes in [notes-S3b.md](notes-S3b.md) |
| S4a | The design-mode engine, library only: the part model with presets by technology, four circuits (single resistance, voltage divider with a load, feedback and gain ratios, current-sense shunt) with a tolerance on each input, their analysis at each temperature (worst case by corners, RSS, parts that drift independently or track, power against the derated rating) and the suggestions that stay inside an allowed deviation, ranked, with the tolerance and TCR that would be needed when nothing passes | done 2026-11-11, notes in [notes-S4a.md](notes-S4a.md) |
| S4b | The Design section on the page: a circuit choice with a schematic (a resistor for a current or a voltage, a divider with a load, regulator feedback, non-inverting and inverting gain, a shunt), its quantities and target in engineering notation, the allowed deviation, a kind of part with tolerance and TCR, temperature chips, parts that drift on their own or track, the values (a series over a range or an own list), one or two values in each resistance, limits on R1 + R2 and on the current, the chip size; the answer in one sentence (or the tolerance and TCR needed, applied with one click), the ranked suggestions from the worker, and an opened suggestion with the output at each temperature in a table and a range chart and the load of each resistor against the derated rating; the Combinations table fits a phone | done 2026-11-11, notes in [notes-S4b.md](notes-S4b.md) |
| S4 | Design mode (done as S4a and S4b): single resistance from a voltage and a current, voltage divider (optional load, limit on current), regulator feedback and op-amp gain ratio, current-sense shunt; each with a target, an allowed deviation, tolerance, TCR and temperatures (default −40, 25, 85, 125 °C), worst case and RSS at each temperature, series and parallel suggestions that stay inside the deviation, and power against rating with derating | done 2026-11-11 |
| S5 | Theory and references: short explanations beside the results and a full reference section (E-series, technologies with TCR and noise, power and derating, pulse load, voltage coefficient, reading codes), cited from `references.bib` with the `Bibliography` class as `/simsetup/main` does, after a research pass that checks facts.md against primary sources; README, CLAUDE.md and the final card | not started |

Left for later, in [BACKLOG.md](../BACKLOG.md): BL30 (MELF, power types, networks and arrays), BL31 (Monte Carlo yield),
BL32 (E-series ruler and value tables), BL33 (printable cheat sheet, also as `.tex`), BL34 (offline and installable).

## Module map

Kept current by each step (one line per file: what it does, main exports).

| File | What |
| --- | --- |
| `pages/resistor/main.tsx` | The route: `<Head>`, renders `ResistorTool` |
| `lib/resistor/index.ts` | Re-exports the library; import from here |
| `lib/resistor/eseries.ts` | E-series tables and lookups: `SERIES`, `neighbours`, `errorPct`, `step`, `seriesValues`, `usualSeries`; exact decimals with `shift10`, `decompose`, `same` |
| `lib/resistor/format.ts` | Writing: `formatOhms`, `ohmsParts`, `formatRkm`, `formatError`, `formatTolerance` |
| `lib/resistor/colours.ts` | Colour code: `COLOURS`, `encodeBands`, `decodeBands`, `coloursFromText` |
| `lib/resistor/smd.ts` | Chip markings: `encodeMarkings`, `decodeMarking`, `flipMarking`, tolerance letters |
| `lib/resistor/read.ts` | `readInput(text, readAs)`: a typed text to its readings (value, marking, bands), the value or the marking first; `bandDoubt`, `otherEndLabel`: whether colours read from one end are plausible |
| `lib/resistor/packages.ts` | `CHIP_SIZES` (with typical termination lengths), `AXIAL_BODIES`, `deratedPower` |
| `lib/resistor/glyphs.ts` | The stroke font of the drawings: `strokeText`, `textWidth` |
| `lib/resistor/draw.ts` | Self-contained SVG in millimetres: `drawAxial`, `drawChip` (realistic and flat; scale bar and caption, or the part alone), `BODY_COATS`; the shapes in `axialGeometry`, `chipGeometry` |
| `lib/resistor/tikz.ts` | The flat drawings as TikZ: `tikzAxial`, `tikzChip` (a `tikzpicture` with its colours, and a `standalone` document), `texText` |
| `lib/resistor/network.ts` | Series-parallel networks: `Network`, `resistorNet`, `seriesNet`, `parallelNet`, `networkValue`, `networkFormula`, `networkKey`, `canonicalNetwork`, `networkStats`, `networkLeaves`, `networkLayout` |
| `lib/resistor/analyse.ts` | What a network does: `networkShares` (voltage, current, power per part), `networkLoad`, `networkTolerance` (worst case and RSS) |
| `lib/resistor/values.ts` | Value lists for the search: `seriesList`, `parseValueList` (entries with their place in the text; the decimal comma rule), `readValue`, `cleanValues` |
| `lib/resistor/lists.ts` | The visitor's lists: in storage (`listsFromStorage`, `listsToStorage`, `LISTS_KEY`), in a link (`listToLink`, `listFromLink`, `LINK_LIST_MAX`), `LIST_PRESETS`, `presetText`, `withoutEntry`, `listReach`; `parseQuantity`, `formatQuantity`, `formatCount`; `readAmount` and `formatAmount` (signed numbers with SI prefixes, for the design mode) |
| `lib/resistor/combine.ts` | The combination search: `searchCombinations`, `searchSteps` and `runSearch` (in slices, with progress), `networkCount`, `clearSearchCache`, `MAX_SEARCH_VALUES` |
| `lib/resistor/combineClient.ts` | The search in a worker: `startSearch` (a new search stops the one before), `cancelSearch`, `searchPlace`, `stopSearchWorker`; runs on the page when a worker cannot be made |
| `lib/resistor/combine.worker.ts` | The worker: runs `searchSteps` in slices, or `suggestParts` for the design mode, and answers the client (not exported by the index) |
| `lib/resistor/designClient.ts` | The suggestions in a worker of their own: `startSuggest` (a new request overtakes the one before), `cancelSuggest`, `suggestPlace`, `stopSuggestWorker`; runs on the page when a worker cannot be made |
| `lib/resistor/technology.ts` | The part model of the design mode: `PartSpec`, `TECHNOLOGIES`, `partFactor`, `partLimits`, `DESIGN_TEMPERATURES`, `TOLERANCE_STEPS`, `TCR_STEPS` |
| `lib/resistor/circuits.ts` | The circuits of the design mode: `CIRCUITS`, `circuitDef`, `Circuit`, `circuitInputs`, `circuitOutput`, `idealResistance`, `circuitProblem`, `deviationPct` |
| `lib/resistor/design.ts` | A circuit with chosen parts over temperature: `analyseCircuit` (worst case, RSS, pass and margin, loads against the derated rating), `circuitSpread`, `smallestChip`, `chipSize` |
| `lib/resistor/suggest.ts` | The values that give a circuit its target: `suggestParts` (one resistance by `searchCombinations`, two by sorted leg tables), `neededSpec`, `clearSuggestCache`, `MAX_PAIR_LEG_VALUES` |
| `lib/resistor/export.ts` | Saving a drawing in the browser: `exportSvg`, `rasterise`, `exportBlob`, `saveBlob`, `copyImage`, `drawingFileName` |
| `components/Resistor/ResistorTool.tsx` | The page: state, URL, theme and drawing style, top bar with the section nav (`SECTIONS`), the `Combo` state, layout, `html, body` and footer colours; `change` applies a `Change` |
| `components/Resistor/view.ts` | What is drawn: `View` (in the link), `resolveView` (band count, code, marking, fixes), `bandOptions`, `thirdDigit`, `otherEnd`, `upsideDown`, `markingChange`, `markingExample` |
| `components/Resistor/Stage.tsx` | The drawing in the hero with its controls: kind, style, band count, band legend and colour picker, other end, chip size, marking system and marking field |
| `components/Resistor/DrawingSection.tsx` | The Drawing section: body, colour and chip size, and the export (preview, width, background, caption, formats with TikZ, copy) |
| `components/Resistor/combo.ts` | What the Combinations section searches with: `Combo` (in the link), `comboFromParams`, `comboToParams` |
| `components/Resistor/Combinations.tsx` | The Combinations section: controls, the search through `startSearch`, status line, best for each number of parts, ranked list with details, copy and CSV (`combinationText`); reads and writes the lists in `localStorage` |
| `components/Resistor/design.ts` | What the Design section works with: `Design` (in the link), `designFromParams`, `designToParams`, `designFields`, `parseDesign` (fields to the engine's circuit, target and parts, with the errors of each field), `designOptions`, `designRange`, `technologyFor`; its sentences `answerText`, `candidateText`, `legsText`, `spanText`, `errorText` |
| `components/Resistor/DesignSection.tsx` | The Design section: circuit choice, fields, parts, temperature chips, values, limits, the request through `startSuggest`, the answer, the status line, the ranked suggestions |
| `components/Resistor/DesignDetails.tsx` | An opened suggestion (`analyseCircuit`): the output at each temperature as a table with the range chart, the circuit's quantities, the load of each resistor against the derated rating, the warning, "use this value" |
| `components/Resistor/Schematic.tsx` | The schematic of each circuit of the design mode, with its quantities |
| `components/Resistor/Circuit.tsx` | The small circuit drawing of a network, from `networkLayout` |
| `components/Resistor/ValueLists.tsx` | "My values": the lists, the editor with its chips, the presets |
| `components/Resistor/Reference.tsx` | The Reference section: colour code (a column per band), SMD marking rules, EIA-96, chip sizes, axial bodies, all clickable |
| `components/Resistor/SmartInput.tsx` | The field with its stepper, the "Read as" choice, the examples and the list of readings |
| `components/Resistor/ValueHero.tsx` | The large value, whether it is standard, tolerance choice, range, copy buttons |
| `components/Resistor/Lookup.tsx` | The Lookup section: series table with error bars, band strips, markings; the guide shown before anything is typed |
| `components/Resistor/parts.tsx` | `Ohms`, `ValueButton`, `CopyButton`, `Segmented` and the icons |
| `styles/Resistor.module.css` | The tool's styles and theme variables |
| `styles/ResistorCombos.module.css` | The styles of the Combinations section (uses the variables of `.root`; rules start with `.combos` to win over the button reset) |
| `styles/ResistorDesign.module.css` | The styles of the Design section: rows of fields, schematic, answer, suggestion rows, the range chart, the tables of an opened suggestion and their layout at phone width |
| `scripts/harness/resistor/` | Harness with its own `package.json`: `check.mjs` (library and drawings; it calls `combine.mjs`, the networks and the combination search against brute force, and `design.mjs`, the design mode's engine against sweeps, random draws and full searches), `timing.mjs` (timings of the search and of the suggestions), `ui.mjs` (page behaviour; it calls `ui-combos.mjs` and `ui-design.mjs`, the Combinations and the Design section against the engine, so it runs with `tsx`), `shots.mjs` (screenshots), `shots-design.mjs` (the Design section cropped, six pictures), `samples.mjs` (contact sheet of drawings), `exports.mjs` (files saved by the page), `tikz.mjs` (two `.tex` samples) |

## Running a step

- Follow [agent-workflow.md](../agent-workflow.md): read only the files the brief names; write a new file whole; chain
  shell commands; stay under about 200k tokens of context.
- **Harness:** `scripts/harness/resistor/` has its own `package.json` and ignored `node_modules`. One command
  (`npm run check` there) runs the library's checks and prints a short summary; `npm run ui` and `npm run shots`
  drive the page on the dev server (see [notes-S1.md](notes-S1.md)). Screenshots come from the installed Edge or Chrome (for example
  `playwright-core` with `channel: 'msedge'`, no browser download), at 390 px and 1440 px width, light and dark,
  downscaled to about 1,000 px wide, written to the session's scratch folder and never into the repo.
- **Done means:** the harness passes, `npx tsc --noEmit` and `npm run build` pass (then `git checkout -- next-env.d.ts`),
  the code was read against the static-export constraints, the page was looked at in both themes at both widths, and
  the step's `notes-S<n>.md`, this file's status and module map, the main page card and the README are updated.
- **Commits:** one commit per step, on the branch `resistor-lookup`, made by the step's agent when its checks pass
  (message as CLAUDE.md's "Commits" says, files named explicitly, no push). S1 and S2 share one commit; S2b has its own.
