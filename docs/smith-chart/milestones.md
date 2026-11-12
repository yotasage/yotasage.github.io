# Smith chart – milestones

Every step of [plan.md](plan.md)'s milestone table, with what "done" means. One agent per step, one at a time; a step
that turns out too big is split before it starts. Engine steps check by harness only; page steps are given less than
seems to fit (agent-workflow.md). M6–M9 were detailed after owner checkpoint 2 (2026-11-12, plan.md "Owner checkpoint
2"). Sizes: an engine step aims at about 1,000–2,000 new lines and 120k tokens; a page step's brief aims at about 100k
tokens, because page steps in this build ran to about twice their brief; a content step writes one doc under 40 kB.
The tool is released from the week of checkpoint 2 (merged to `main` with a status note on the page); every later
step keeps that note true and is merged to `main` when its checks pass, as the main session decides. The owner uses the
tool when it becomes relevant to them (plan.md D19), so every "done when" below is checked by the harness,
screenshots and a reading agent, never by "the owner tries".

## M0 – Research and set-up (no UI)

- **M0.1 Review the plan.** Done 2026-11-11 by the planning session: branch `smith-chart`, this plan reviewed, moved to
  `docs/smith-chart/` and split, backlog rows BL37–BL47, the Smith chart lines taken out of the owner's `TODO.md`,
  KaTeX checked, the owner's notes transcribed. See [notes-M0.1.md](notes-M0.1.md).
- **M0.2 Research pass** (a research agent; web lookups may run on Haiku). Find and open the sources. Candidates, each
  to be verified before it is cited: Steer, *Microwave and RF Design* (open access, NC State University Libraries);
  Ellingson, *Electromagnetics* (open textbook, Virginia Tech); Smith's 1939 and 1944 papers in *Electronics*; the
  Touchstone file format specification (IBIS Open Forum); Pozar, *Microwave Engineering*, only where the owner has a
  copy to check against. Write `facts.md`: the conventions of engine.md §1 with sources, every equation the tool shows
  with its source (z, y, Γ, the four circles, VSWR, return loss, mismatch loss, Q, a line's input impedance, rotation
  on a lossless line, the λ/4 transformer, open and short stubs, L and C impedances, ABCD forms), the owner's notes
  verified from the transcription in notes-M0.1.md, the values real inductors and capacitors come in, and 20 to 40
  worked numeric cases with the sources' own numbers (L-match, single stub, λ/4, lines) so M1 has answers to test
  against. Write `sources.md`: what each source supports and may be cited for. Add to `references.bib` only what was
  actually opened.
  *Done when:* facts.md and sources.md exist, every equation has a source or a derivation, every case has its source's
  numbers, and the notes' equations are marked verified or corrected.
- **M0.3 Spikes** (throwaway code in the session's scratch folder, never in the repo; results in `notes-M0.3.md`):
  (a) MathML per frame: replacing ten equations' MathML on every animation frame while a value changes, in Edge, at 1×
  and with the CPU throttled 4×; (b) an SVG chart with about 200 grid circles, 10 arcs and a 2,000-point path, updated
  imperatively per frame, non-scaling strokes, zoom by one transform: frame time at 1× and 4×; (c) a 100-line
  prototype of the equation text → tree → TeX printer on the owner's notes' equations: does it print well;
  (d) touch: in Chromium's touch emulation, can the chart take pinch and drag while the page still scrolls past it,
  and which `touch-action` setting does it. Each spike ends in a decision; engine.md §9's budgets are confirmed or
  revised.
  *Done when:* notes-M0.3.md has the four decisions with their measurements and engine.md is updated.

## M1 – Engine (`lib/smith/`, harness only)

- **M1.1 Numbers and complex.** `lib/quantity.ts` from `readAmount`/`formatAmount` of `lib/resistor/lists.ts`
  (re-exported there, so the resistor tool is unchanged), extended as engine.md §7 says; `complex.ts`; `convert.ts`
  (z, y, Γ, metrics); the harness skeleton `scripts/harness/smith/` with `check.mjs`.
- **M1.2 Parts and network.** `parts.ts` and `network.ts` (engine.md §2, §4) with the degenerate rule; metrics at every
  node (|Γ|, ∠Γ, VSWR, return loss, mismatch loss, Q); the independent second computation in the harness.
- **M1.3 Geometry.** `geometry.ts` (engine.md §3, §5, §6): Möbius maps, each part's locus circle, arcs from "no
  effect", projection onto the reachable arc, continuous length tracking, the polyline sampler for non-circles.
- **M1.4 Equations.** `equations.ts` (learning.md §1): text parser, TeX printer, evaluator, the first registry
  entries (the owner's notes and the list in M0.2) with their derivation steps.

*Done when the harness shows:* every facts.md case reproduced to the digits the source gives; the second computation
agreeing to 1e-12 relative on 10,000 random circuits; round trips (Γ → z → Γ, y = 1/z) to 1e-12; a fuzz of 100,000
random circuits with values of 0 and ∞ and open and short loads giving no NaN or ∞; the direction of travel of series
L and C, shunt L and C and lines; a λ/8 line, a λ/4 transformer with Zt ≠ Z0, line periodicity; every arc starting and
ending on its nodes with its midpoint on the part's locus; value → point → value to 1e-9 relative for every part kind;
every registry equation and derivation step against the engine; the resistor harness still passing; the time of 10
parts at 2,000 frequencies recorded.

## M2 – Chart (own route, no card, not merged to `main`)

- **M2.1 Grid.** The grid as a framework-free function (`lib/smith/grid.ts`, checked by the harness: circle
  geometry, label placement) and its SVG: Z, Y and ZY modes on one Γ plane (D13), labelled circles at the usual values,
  **density that adapts to the zoom**, perimeter scales (wavelengths towards the generator and the load, angle of Γ),
  light and dark, strokes that do not thicken with zoom, any aspect ratio.
  Split in two: **M2.1a** the framework-free `lib/smith/grid.ts` and its harness (geometry, density, labels, scales;
  done 2026-11-12), **M2.1b** the grid's SVG layer and a bare route to look at it.
- **M2.2 Interaction.** Pointer Events: wheel and pinch zoom about the pointer, drag to pan, fit and reset, keyboard
  (arrows pan, plus and minus zoom); the touch decisions of M0.3(d) and D14 (how the page scrolls past the chart, tap
  for the readout); the cursor readout of z, y, Γ, VSWR and return loss from the engine, in ohms; the frame loop of
  engine.md §9.
- **M2.3 Route and design pass.** `pages/smith-chart/main.tsx` (plan.md's site frame); layout, spacing, type and
  colour tokens after the resistor tool, recorded in the notes; screenshots at 390, 768 and 1440 px in both themes.

*Done when:* grid circle geometry read back from the DOM matches the circle equations to 1e-9; no overlapping labels
at five zoom levels; the readout matches the engine at 20 points; frame time within budget while zooming, at 1× and
4×; pinch and drag work in touch emulation; usable at 320 px.

## M3 – Circuit editor, both ways, and first theory

- **M3.1 State and strip.** The circuit in the link (the resistor tool's pattern), parameters (load, f0, Z0), the
  schematic strip, add, remove and reorder parts, value fields with units and the three value forms of engine.md §2.
- **M3.2 Path.** Arcs, a marker and a small table at every node, arrows for the direction of travel, the goal of
  engine.md §8.
- **M3.3 Direct manipulation.** A handle at the end of each arc (a touch target of at least 44 px); a "draw" tool (arm
  a part kind, drag from the end of the path); projection (engine.md §6); snapping to grid circles and standard
  values; undo and redo; keyboard use. Run in two steps: **M3.3a** handles, dragging, projection and snapping
  (notes-M3.3a.md); **M3.3b** the draw tool, undo and redo, keyboard use of the handles. The series for snapping
  inductors is the owner's choice (E24 until then, one constant in `components/Smith/pathLayer.ts`); chosen at
  checkpoint 1 as plan.md D17, built in M4.3.
- **M3.4 Card and start.** The card and icon on the main page (`TOOLS` in `pages/index.tsx`, `ToolIcon.tsx`, category
  "Electronics"), page metadata, the start state (D16) and empty state, README. From here the branch may be merged to
  `main` when the owner says so.
- **M3.5 Theory, first topics.** The Theory and References sections and the M3.5 topics of learning.md §5, with live
  numbers from the circuit; the short line and "→ theory" link beside every control and readout.
  Split in two: **M3.5a** writes the content (topics, equation ids, live numbers, figures, citations, short lines and
  the claims checklist) in theory.md and notes-M3.5.md, no code; **M3.5b** builds the sections, links and harness from it.
  The page half is split again: **M3.5b** the Theory and References sections with live numbers (and the `mobius`
  registry entry); **M3.5c** the short line and "→ theory" link beside every control and readout, the claims checklist
  finished, and the harness's 4× frame-loss timing checks made robust.

*Done when:* typing a value and dragging to it agree to the shown precision; edit → chart → drag back gives the same
value to 1e-9 relative; undo and redo hold under random sequences; scripted drags on every part kind, by mouse and by
touch emulation; the link round-trips; the main tasks work by keyboard alone; every live number in the theory equals
the engine's; every citation resolves; every claim has a source or a derivation (checklist in notes-M3.5.md); the
layout holds at 320 and 390 px.

**Owner checkpoint 1.** Run `npm run dev` and open `/smith-chart/main` on the laptop and the phone (port 3020). Try:
a load of 25 + j25 Ω at 100 MHz brought to the centre with two parts; type a value, then drag it; undo; reload from
the link; read the topic "Moving on the chart". Is it nicer than the old one? What annoys you?

## M4 – Find the missing value

- **M4.1 Engine.** Goals, unknown sets, the circle-intersection method, the best value and value ranges for one
  unknown, families, coincident circles, the fallback search ([solver.md](solver.md)).
  Split in two: **M4.1a** goals (`goal.ts`), the unknowns and the circle-intersection core (`solve.ts`): two unknowns
  with a point target, one unknown with a circle goal, coincident circles, realisable values and the other kind of
  part, lengths, ordering; **M4.1b** one unknown with a point target (best value and its |Γ|), ranges for inequality
  goals, families (two unknowns, circle goal), the fallback numerical search, and the value lists of plan.md D17 with
  the nearest standard value and the |Γ| it gives.
- **M4.2 Validation.** As solver.md's "Validation" says.
- **M4.3 Page.** "Solve for" toggles, the goal selector, the two circles drawn on the chart, the solution list with a
  preview path (hover and tap) and Apply, standard-value variants, every message of solver.md's counting table; the M4
  theory topics; the value list per part kind of plan.md D17 (E6–E96, own pasted list, any value; E24 default), used
  by Snap and by the variants.
  Split in three: **M4.3a** the Solve panel: "solve for" on parts (and f0, Zc where the solver takes them), the goal
  selector, the solution list with Apply as one undo step, every message of the counting table, the goal and unknowns in
  the link; **M4.3b** on the chart: the two circles and the goal circle, the preview path (hover and tap), the family
  slider, standard-value variants and the value list per kind (D17, replacing `SNAP_SERIES`); **M4.3c** the three M4
  theory topics (learning.md §5) with their claims, live numbers and short lines. M4.3c runs as two agents, as M3.5
  did: the content (theory.md, claims.md, sources; no code), then the page.
- **M4.4 Suggestions** when nothing is marked. Also moves the slow solves off the main thread: since the BL56 fix
  the generic grid search for two unknowns takes a median of 17 ms and up to about 100 ms at 1× (notes-M4.2.md), too
  long for a phone even after a pause, so solves (and suggestions) that can be slow run in a Web Worker (no new
  dependency; the resistor tool's `combineClient.ts` is the pattern).
  Split in two: **M4.4a** `lib/smith/suggest.ts` (single changes, then pairs, ranked), the solver worker and its
  client with the Solve panel's slow solves moved into it, and BL57; **M4.4b** the suggestions on the page (with
  preview, variants and Apply, as the solutions have) and their short line.

*Done when:* exact cases have a residual below 1e-9; brute force finds no missed solution on 200 or more random
problems of each kind; the same input gives the same order; time within budget; a scripted case reaches every message
of the counting table.

**Owner checkpoint 2.** Mark C unknown in a two-part circuit and see the answers and the two circles. Free one unknown
where two are needed and read the message. Pick a solution, round it to a standard value, and look at what the match
does. Then M6–M9 are detailed with the owner, who confirms their extras.

## M5 – Equation layer

- **M5.1 Panel.** learning.md §3: symbolic, substituted and result lines, variable colours matched to the chart, the
  digits setting. With the digits setting, **values at rounding level** are shown as plan.md D20 says (one rule in
  `lib/quantity.ts`, used by every readout, the Solve panel, the suggestions and the equation panel).
- **M5.2 Linking.** Both ways, by the sentinel colours of learning.md §2; "show equation" on every readout and part
  card; tap equivalents.
- **M5.3 Derivations.** learning.md §4, including the unfinished ones of the owner's notes; theory topics link to them.
- **M5.4 "Explain this move".**

*Done when:* every equation on screen passes the numeric check; TeX renders with errors turned on; screenshots in Edge,
Firefox and WebKit; the panel within budget at 1× and 4×; a fresh reading agent reads every derivation through and
finds no step missing (the owner's own reading moves to checkpoint 3, D19); no readout, solution or suggestion shows a
number below the rounding floor of D20 in scientific notation (harness: the start circuit's exact solutions and a
scripted exact match).

## M6 – Teaching content

Worked examples, challenges and lesson links, all confirmed at checkpoint 2; their design is learning.md §7. Engine
before page; the content is written and checked before any code.

- **M6.1 Content** (no code, as M3.5a and M4.3c). Writes `examples.md` (under 40 kB): 12 to 20 worked examples with
  the owner's kind of numbers (the L-match both ways and its two solutions, one shunt part for a load on g = 1, a λ/4
  transformer, single open and short stubs with their two solutions each, a line rotating a load, reading |Γ|, VSWR
  and return loss, Y and ZY mode, series against shunt direction, a three-part ladder, matching with E24 values and
  what rounding costs, a sub-GHz antenna-like load), each with its circuit as a link string, its steps (what to do,
  the state that counts as done, one hint, the theory topic), its stated answers worked by hand and checked against the
  engine with a scratch script; the challenge kinds with their generator ranges, tolerances and hint ladders; the
  short lines for the new controls; claims added to claims.md. Estimate: one doc of about 30 kB, about 100k tokens.
- **M6.2 Engine** (harness only). `lib/smith/examples.ts` (the examples as data, read from M6.1), `lib/smith/
  challenge.ts` (seeded generator per kind, every problem checked solvable by `solve()` before it is offered, the
  check of a state against the goal and the allowed parts, the hint ladder from the solver's own construction),
  `lib/smith/lesson.ts` (the lesson part of the link: locks, hidden panels, the teacher's text; read and written
  with the circuit's link in `state.ts`). Out of scope: anything on the page. Estimate: about 1,200 lines, 120k tokens.
- **M6.3a Page: examples.** A "Learn" section in the nav with the example list; loading one is one undo step; the
  guide panel steps through it (what to do, done when the circuit's state matches, the hint, "→ theory"); keyboard
  and touch; its short lines. Brief about 100k tokens.
- **M6.3b Page: challenges and lesson links.** Start a challenge of a kind (the solver and suggestions hidden while
  it runs), check, the hint ladder, reveal through the solver; progress in `localStorage`; "Make a lesson link"
  (choose locks, hidden panels and a short text) and the locked view a student opens; short lines. Brief about 100k
  tokens.

*Done when:* every example's stated answer is reproduced by the engine to its stated digits; the harness plays three
examples through by keyboard and three by touch emulation, reaching "done" at each step; 1,000 generated challenges
per kind are solvable and within their ranges, and the same seed gives the same problem; a challenge is reached by
applying the revealed solution and not by the start state; lesson links round-trip (every lock and hidden panel,
the text with any characters) and a locked control cannot be changed from the page; layouts hold at 320 and 390 px.

## M7 – Sweep and report

- **M7.1 Sweep engine** (harness only). `lib/smith/sweep.ts`: linear or logarithmic bands, refinement where the trace
  bends (angle and distance on the Γ plane), markers at chosen frequencies, band figures (worst and best return loss,
  maximum VSWR, every interval below a chosen |Γ| and the one around f0, its fractional bandwidth), a loaded-Q
  estimate; one sweep is the network evaluated per frequency in typed arrays. Estimate: about 1,000 lines, 100k tokens.
- **M7.2a Page: trace.** The band's controls (start, stop, points, linear or logarithmic) in the link; the Γ(f)
  trace in the path layer as a polyline (D3), with frequency-labelled markers added by tap or click and moved along
  the trace by drag or keys; updated with the circuit while dragging, in budget. Brief about 100k tokens.
- **M7.2b Page: plot and marker table.** A return-loss plot (|Γ| in dB, or VSWR) under or beside the chart, linked
  both ways by pointing and by tap; the marker table (f, z, Γ, VSWR, return loss); the band figures. Brief about
  100k tokens.
- **M7.3 Report and print.** A report panel (f0 summary, band figures, the per-node table, the circuit as text) and
  its print layout: `@media print` on A4 and Letter, light colours whatever the theme, the chart and the plot as
  vectors, the link printed under it, nothing interactive printed. Brief about 100k tokens.
- **M7.4 Theory** of learning.md §5's M7 row, as M4.3c: **M7.4a** content (theory doc, claims; no code), **M7.4b**
  the page (topics, live numbers from the sweep, figures, short lines).

*Done when:* every swept point equals the point engine to 1e-12; band figures match a brute force (10⁶ points) and
the closed forms of a series RLC and a λ/4 transformer; a 10,000-point trace redraws within engine.md §9's budget at
1× and 4× while dragging; plot and chart point at the same frequency both ways, by mouse and touch; the printed
report (PDF from Edge's print) fits its pages at A4 and Letter, in both themes, with nothing cut.

## M8 – Export and share

Decision D18 sets the format. One **figure model** feeds the standalone SVG, the PNG, the TikZ and the export's
preview, so they cannot disagree: `lib/smith/figure.ts` builds a list of primitives (circles, arcs, polylines,
markers, text) with roles (grid, scale, part i, node, goal, construction, solution, trace, marker, legend) from the
circuit, the solve and the sweep, from the **options**: what is shown (whole chart or the current view), **size**
(column width 88 mm, text width 160 mm, page width 180 mm, or any width in mm, cm or in), **detail** (presets
Minimal, Standard, Full, and each item on its own: grid density coarse, normal or fine, Z, Y or ZY grid, grid labels,
the perimeter scales, the path, nodes and their labels, part arcs, the goal, the construction circles, solutions,
the trace and markers, a legend) and **colour mode** (colour; greyscale; black and white, where each role has its own
dash pattern, line width and marker shape). The grid's density on paper comes from `grid.ts` with the paper size in
place of the zoom (lines at least a set distance apart in mm), so a column-width figure is thinned, not crowded. Text
is in points, never under 6 pt.

- **M8.1a Figure model and SVG** (harness only). `figure.ts` with the options and the three palettes (`lib/smith/
  figureStyle.ts`: per role a colour, a grey, and a black-and-white dash, width and marker), `figureSvg.ts` (a
  standalone SVG sized in mm, fonts named generically, no CSS variables); a blank chart is the circuit switched off
  (BL47's blank charts). Estimate: about 1,500 lines, 130k tokens.
- **M8.1b TikZ** (harness only). `figureTikz.ts` after `lib/resistor/tikz.ts` (`texText`, colour definitions,
  `picture` to paste and a `standalone` document that compiles as it is): circles and arcs as TikZ circles and arcs
  (exact, not polylines), the disk as a `\clip`, the trace as a coordinate list, text as nodes in the document's
  font at the chosen pt size, markers drawn as paths (no TikZ library), plain TikZ only (`\usepackage{tikz}`). A
  width given as `\linewidth` uses coordinates in units of a length the picture sets, with the density chosen for a
  stated assumed width. Checks below. Estimate: about 1,000 lines plus the compile harness, 130k tokens.
- **M8.2 Data files** (harness only). `lib/smith/export/csv.ts` (nodes, trace, markers), `touchstone.ts` (`.s1p`
  of S11 at the input, `# Hz S RI R <Z0>`, with the comments other tools write), `project.ts` (the project file:
  versioned JSON with the circuit, goal and unknowns, band and markers, the visitor's own value lists and the export
  options; `version: 1`, older versions migrated, newer ones refused with a message). Estimate: about 800 lines, 90k.
- **M8.3a Page: figure export.** An Export section: the options above, a **preview** of the figure at its true size
  in mm (a frame of the chosen width, its text at its pt size), switching size, detail and colour mode at once; save
  and copy TikZ (picture or standalone document), save SVG, PNG at 1× to 8×. Brief about 100k tokens.
- **M8.3b Page: data, project and link.** Save CSV and `.s1p`; save and open the project file (file picker and
  drop, read on the device only); copy link; short lines for every export; README and the home card list the
  exports. Brief about 90k tokens.

**Checks of the LaTeX export** (M8.1b, `scripts/harness/smith/check-tikz.mjs`, in `npm run check`). TeX Live 2026 is
installed on the owner's PC (`C:\texlive\2026\bin\windows`: pdflatex, lualatex, xelatex, latexmk, pdftoppm;
circuitikz and pgfplots present; a standalone TikZ compiles in about 0.6 s); on a machine without it the compile
checks print "skipped: no pdflatex" and the structural checks still run.
- Every preset size × detail preset × colour mode (3 × 3 × 3 = 27) and 20 random option sets compile with
  `pdflatex -halt-on-error` with no warning about overfull boxes or missing characters.
- Size: the standalone PDF's MediaBox width equals the chosen width to 0.1 mm.
- Geometry: the TikZ's circles, arcs and coordinates read back by the harness equal the figure model's to 1e-6 mm,
  and (checked in M8.3a, which has the page) the figure model equals the on-screen chart's geometry read from the
  DOM in the same view to 1e-9 of the radius.
- Pixels: the compiled PDF rendered by pdftoppm and the standalone SVG rendered by Edge, both at 600 dpi with text
  switched off, differ by under 0.5 % of pixels (edges excepted).
- Text: every label's size ≥ 6 pt at the smallest width, and no two labels' boxes overlap (the M2 label check run
  on the figure).
- Black and white: only black and white in the output; every pair of roles shown differs in dash pattern, width or
  marker; greyscale: every pair differs by ≥ 20 % in lightness or in dash pattern.

*Done when:* the checks above pass; the standalone SVG matches the on-screen geometry; the PNG at 1×, 2× and 8× has
the expected pixel size; the `.s1p` is read back by a reference parser in the harness (written from the Touchstone
specification, not from our writer) to 1e-12; CSVs read back to the shown digits; the project file round-trips
(save, open, same link) and a version-0 test file is migrated; the preview's frame is the chosen width in CSS mm at
three sizes; layouts hold at 320 and 390 px.

## M9 – Polish and re-checks

The tool is already released; M9 is polish and every earlier check run again, not a gate.

- **M9.1 Access.** Keyboard alone through every task (scripted), names and roles of every control, contrast of every
  token pair in both themes computed (WCAG AA), reduced motion, 200 % text and 320 px; fixes. Brief about 100k.
- **M9.2 Browsers and touch.** Edge, Firefox and WebKit (`npx playwright install firefox webkit`), MathML included;
  touch emulation through every task; fixes. Brief about 100k.
- **M9.3 Performance and size.** Every budget re-measured at 1× and 4×, script size per route, a 10-minute scripted
  drag session for memory; BL52 (grid labels on a canvas) if a zoom still loses frames at 4×, BL49 (shallow grid
  edges) if the grid's polish needs it; fixes. Estimate about 120k.
- **M9.4 Docs and re-check.** README and a how-to in `docs/smith-chart/`, the backlog tidied, CLAUDE.md's Smith
  chart lines, `npm run recheck` that runs every earlier "done when" check and prints one summary; a fresh agent reads
  the Theory, the short lines and the page's status note against claims.md and what the page does. Brief about 80k.

*Done when:* `npm run recheck` is green; no contrast pair under AA; every task done by keyboard alone and by touch
emulation in three browsers; budgets met; screenshots at 320, 390, 768 and 1440 px in both themes looked at; the
status note on the page says what the tool does now.

**Owner checkpoint 3** is not a gate: when a Smith chart problem of their own comes up, the owner uses the tool on the
laptop and the phone and reads one derivation through; what they find becomes backlog rows or a fix step.
