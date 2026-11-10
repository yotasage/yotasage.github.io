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
| S3 | Combinations: every network of 1 to 4 resistors (default 2; series, parallel and mixed) from the chosen series or the user's own value lists (pasted or edited, presets, kept in the browser, shareable by link), searched in a worker; ranked by error, then number of parts; each with its formula, a small circuit drawing, combined tolerance (worst case and RSS) and the share of power in each resistor | not started |
| S4 | Design mode: single resistance from a voltage and a current, voltage divider (optional load, limit on current), regulator feedback and op-amp gain ratio, current-sense shunt; each with a target, an allowed deviation, tolerance, TCR and temperatures (default −40, 25, 85, 125 °C), worst case and RSS at each temperature, series and parallel suggestions that stay inside the deviation, and power against rating with derating | not started |
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
| `lib/resistor/read.ts` | `readInput`: a typed text to its readings (value, marking, bands), ranked |
| `lib/resistor/packages.ts` | `CHIP_SIZES` (with typical termination lengths), `AXIAL_BODIES`, `deratedPower` |
| `lib/resistor/glyphs.ts` | The stroke font of the drawings: `strokeText`, `textWidth` |
| `lib/resistor/draw.ts` | Self-contained SVG in millimetres: `drawAxial`, `drawChip` (realistic and flat, scale bar, caption), `BODY_COATS` |
| `lib/resistor/export.ts` | Saving a drawing in the browser: `exportSvg`, `rasterise`, `exportBlob`, `saveBlob`, `copyImage`, `drawingFileName` |
| `components/Resistor/ResistorTool.tsx` | The page: state, URL, theme and drawing style, top bar with the section nav (`SECTIONS`), layout, `html, body` and footer colours; `change` applies a `Change` |
| `components/Resistor/view.ts` | What is drawn: `View` (in the link), `resolveView` (band count, code, marking, fixes), `bandOptions`, `otherEnd`, `upsideDown`, `markingChange` |
| `components/Resistor/Stage.tsx` | The drawing in the hero with its controls: kind, style, band count, band legend and colour picker, other end, chip size, marking system and marking field |
| `components/Resistor/DrawingSection.tsx` | The Drawing section: body, colour and chip size, and the export (preview, width, background, caption, formats, copy) |
| `components/Resistor/Reference.tsx` | The Reference section: colour code, SMD marking rules, EIA-96, chip sizes, axial bodies, all clickable |
| `components/Resistor/SmartInput.tsx` | The field with its stepper, the examples and the list of readings |
| `components/Resistor/ValueHero.tsx` | The large value, whether it is standard, tolerance choice, range, copy buttons |
| `components/Resistor/Lookup.tsx` | The Lookup section: series table with error bars, band strips, markings; the guide shown before anything is typed |
| `components/Resistor/parts.tsx` | `Ohms`, `ValueButton`, `CopyButton`, `Segmented` and the icons |
| `styles/Resistor.module.css` | The tool's styles and theme variables |
| `scripts/harness/resistor/` | Harness with its own `package.json`: `check.mjs` (library and drawings), `ui.mjs` (page behaviour), `shots.mjs` (screenshots), `samples.mjs` (contact sheet of drawings), `exports.mjs` (files saved by the page) |

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
  (message as CLAUDE.md's "Commits" says, files named explicitly, no push). S1 and S2 share one commit.
