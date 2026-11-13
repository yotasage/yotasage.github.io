# Smith chart – plan

A Smith chart tool at `/smith-chart/main`, running entirely in the browser like the rest of the site, **for learning
and teaching impedance and admittance, matching and transmission lines**, and handy enough to use at the desk.

The owner's goal (2026-11-11): correct, fast, useful, professional, "10/10 for something running client side in the
browser". The owner designs PCBs and **does not read code or diffs**: a step is judged by how the page behaves and
looks, and by the harness. Code is written the best way possible, and **performance is never traded for
readability**. Quality comes from engineering discipline: verified facts, checks against independent computations,
measured budgets.

Drafted 2026-11-11 (with Sonnet 5.5), reviewed and reworked the same day (step M0.1, see
[notes-M0.1.md](notes-M0.1.md)). Where this plan and [CLAUDE.md](../../CLAUDE.md) or
[agent-workflow.md](../agent-workflow.md) disagree, those two win.

## Files of this plan

Read only the files and sections a brief names. Every file stays under 40 kB; split before.

| File | What |
| --- | --- |
| [plan.md](plan.md) | This index: goal, decisions, ground rules, milestones and status, how a step is run, quality bar, risks |
| [modules.md](modules.md) | The module map: one line per file and its main exports (index and `lib/`; the page in [modules-page.md](modules-page.md), the checks in [modules-harness.md](modules-harness.md)) |
| [engine.md](engine.md) | The model: conventions, parts, the geometry (every v1 locus is a circle), evaluation, drawing, dragging, numbers, goal, performance architecture and budgets |
| [solver.md](solver.md) | Find the missing value: counting, the circle-intersection method, the fallback search, what comes back, suggestions |
| [learning.md](learning.md) | Equations as data, the equation panel, derivations, the Theory section (from M3), the owner's notes, teaching content |
| [milestones.md](milestones.md) | Every milestone's steps and "done when"; M6–M9 detailed after owner checkpoint 2 |
| [facts.md](facts.md) | Written by M0.2: the conventions and every equation with its source or derivation, the owner's notes checked, the values real L and C come in |
| [facts-cases.md](facts-cases.md) | 28 worked numeric cases with the sources' numbers and ours to 10 digits, for M1's harness |
| [sources.md](sources.md) | What each source is, what was opened, what it may and may not be cited for; the sources not opened |
| [theory.md](theory.md) | Written by M3.5a: the Theory section's topics (text with numbered claims, equation ids, live numbers, figures, citations) and the short line beside every control and readout, for M3.5b to put on the page; M4.3c changed §8 and claim 14 |
| [theory-solver.md](theory-solver.md) | Written by M4.3c: the solver's topics §9–§11 (two, one or none; one value and a point; realisable and standard values), split off theory.md for size |
| [claims.md](claims.md) | The claims checklist (moved from notes-M3.5.md in M3.5c): every factual sentence of the Theory section and of the short lines with its source and section, registry ids, "definition" or "describes the tool" |
| `notes-<step>.md` | What a step left for later steps (under 6 kB each) |

## Goal

What the finished tool lets a person do:

1. **See.** Build a circuit (load, then series and shunt parts, lines, stubs) and watch its path on the chart.
2. **Draw.** Drag on the chart and the circuit follows: the value of the part changes.
3. **Understand.** Theory within reach from the first usable version (a Theory section after the resistor tool's
   pattern, a short line beside every control and readout that links to its topic). Every number and every move has
   its equation one click away, with the live numbers put in, the derivation behind it and a source.
4. **Find.** Mark one or two values as unknown and say what the circuit should achieve: the tool finds every solution,
   marks the realisable ones, shows them on the chart as the two circles whose crossings they are, and explains them.
5. **Sweep, report, export.** See how the match behaves over a band, get the figures (return loss, VSWR, bandwidth),
   and take the chart and data away as SVG, PNG, CSV, Touchstone or a link.

## Decisions

Settled with the owner on 2026-11-11. Changing one needs the owner.

| # | Decision | Why |
|---|---|---|
| D1 | **Written from scratch.** Nothing of the 2021 prototype is kept as code; its parts list and ideas are in [notes-M0.1.md](notes-M0.1.md). | In the prototype the chart is the model (a point is an SVG circle's position), with no frequency, Z0 or values. |
| D2 | **Model first.** A circuit (load, ordered parts, f0, Z0) is the one source of truth; the chart is a view and an editor of it. | Typing a value and dragging are then one mapping run two ways and cannot disagree. |
| D3 | **Every v1 locus is a circle**, and a part's arc runs from **"no effect"** to its value (added reactance or susceptance from 0, a line's length from 0), drawn as an exact SVG arc. Polylines only for sweep traces and, later, lossy parts. | Every ideal part maps Γ by a Möbius transformation (engine.md §3). Exact at every zoom, nothing to recompute while zooming, small SVG. Sweeping the component value from 0 is wrong: a series C of 0 F is an open. |
| D4 | Nodes are **(V, I) pairs**, with an explicit rule for parts of value 0 or ∞. | Open and short are ordinary numbers; the two (0, 0) cases are defined, not NaN (engine.md §4). |
| D5 | **Equations are data**, written as short text, parsed into expression trees when the module loads, printed to TeX by one printer and evaluated by one evaluator. They are for display; the engine is separate hand-written code, and the harness proves each equation equals the engine. | What the learner reads is what is computed, without an interpreter in the drag loop. Text is about a quarter of the output of hand-built trees. |
| D6 | **Teaching is core.** The Theory section comes with the first usable tool (M3) and grows with every feature; the equation panel is M5. | The main purpose is learning and teaching; a user must be able to catch up at any time. |
| D7 | **The solver for one or two unknowns is core (M4)** and **geometric**: two unknowns with a point target are the intersection of two circles. A numerical search only for unknowns whose locus is not a circle. | Exact, complete by construction, microseconds, and the picture is the textbook construction. |
| D8 | **Ideal parts in v1**, every part a function of frequency, so finite Q and parasitics can come later (BL42). | Correct and small without painting the design into a corner. |
| D9 | **Ladder networks only in v1** (series and shunt parts, lines and stubs between load and source). Branches: BL43. | That is what a Smith chart path represents. |
| D10 | The chart is **SVG**. Its moving layer (arcs, handles, trace, readout) is updated **outside React**, at most once per animation frame; React renders the panels. | Crisp at any zoom, SVG export without a second renderer; React reconciliation per pointer move would eat the budget. |
| D11 | **No new dependency in v1.** Maths with KaTeX through `components/KatexSpan.tsx`; the number reader and writer of `lib/resistor/lists.ts` moved to a shared module and extended. | Static, self-hosted site; one number parser on the site, not three. |
| D12 | **Not supported:** a complex reference impedance, time domain, branching networks (v1), accounts or any server feature. | Out of scope. |
| D13 | **The chart never rotates.** Y mode draws admittance circles on the same Γ plane, so a point never moves when the mode changes. | Textbooks differ (some rotate the chart by 180° for admittances); one plane avoids that confusion. |
| D14 | **Touch from the start.** Everything done by hover (cursor readout, linking, solution preview, plot linking) has a tap equivalent, decided in M2 and kept in every later step. | The owner tests on a phone; touch added at the end means rewriting the interaction code. |
| D15 | **Names:** route, docs, branch `smith-chart` (`/smith-chart/main`, `docs/smith-chart/`); code `smith` (`lib/smith/`, `components/Smith/`, `styles/Smith*.module.css`, `scripts/harness/smith/`). Home card category "Electronics". | The site's route folders are kebab-case (`pcb-viewer`, `3d-viewer`). |
| D16 | **Default start state:** Z0 = 50 Ω, load 25 + j25 Ω, f0 = 100 MHz, a basic two-part circuit. Kept at owner checkpoint 1 (2026-11-12), although this load is on g = 1 and one shunt C alone matches it. | The owner's "start with a basic two-component circuit and add as needed". |
| D17 | **Value series per part kind** (owner checkpoint 1, 2026-11-12): each of R, L, C (and Zt) has its own list: E6, E12, E24, E48, E96, the visitor's own pasted list (the resistor tool's value lists, `lib/resistor/values.ts` and `lists.ts`), or "any value". Defaults: R, L and C on E24, Zt and line lengths on any value. Snap and the solver's standard-value variants use the same list; the Snap switch still turns all snapping (grid circles and values) off. Built in M4.3. | Makers' inductor lists are irregular (facts.md §4) and no fixed list fits everyone; ideal values first, then rounding to what the visitor can buy, with what the rounding costs shown. |
| D18 | **LaTeX export as plain TikZ** (owner checkpoint 2, 2026-11-12), built in M8.1b and M8.3a from one figure model that also makes the standalone SVG, the PNG and the preview: a `tikzpicture` to paste and a `standalone` document, needing only `\usepackage{tikz}`; grid circles and arcs as exact TikZ circles and arcs clipped to the disk, text as nodes in the document's font at a set pt size (never under 6 pt). Options: size (column 88 mm, text 160 mm, page 180 mm, any width in mm, cm or in, or `\linewidth`), detail (Minimal, Standard, Full presets and each item: grid density, Z/Y/ZY grid, labels, perimeter scales, path, nodes and labels, part arcs, goal, construction circles, solutions, trace and markers, legend), colour mode (colour, greyscale, black and white with dash patterns, widths and markers instead of colours), whole chart or current view; a true-size preview of each. pgfplots' `smithchart` library was not chosen: its grid is its own, so the figure could not equal the tool's chart or follow the density chosen for the size, it compiles slowly, and it adds a package. | The owner writes reports in LaTeX and wants the chart as code, not an image, at the size and colour a report allows; one model keeps the preview, SVG and TikZ identical, and the harness compiles it (TeX Live 2026 is on the owner's PC). |
| D19 | **The owner's testing pattern** (checkpoint 2): the owner does not use Smith charts now and will use the tool when it becomes relevant. The tool is released the week of checkpoint 2 (merged to `main` with a status note on the page). Every later step keeps that note true and is merged to `main` when its checks pass, as the main session decides. Steps are judged by the harness, screenshots and reading agents; no "done when" waits for the owner. Owner checkpoint 3 is not a gate. | The owner's time; a released tool stays honest about what it does. |
| D20 | **Values at rounding level** (checkpoint 2) are shown as a bound, not as noise: a residual below the floor (|Γ|, a mismatch or a Γ component under 1e-12; a solved value under 1e-12 of its part's scale, as M4.3c already does for x and b) reads "\|Γ\| < 1e-12", return loss "> 240 dB", VSWR "1" to the shown digits; the raw number stays in the equation panel's result line. One rule in `lib/quantity.ts`, built in M5.1 with the digits setting. | "\|Γ\| = 7.2e-17" is true but reads as a real number; a bound is honest and readable, and "0" would hide that it is a computed residual. |
## Ground rules

- **The site's hard constraints apply** (CLAUDE.md): no server, self-hosted assets, nothing leaves the device, licence
  check for any new dependency (v1 adds none).
- **The whole circuit is in the link** (query string replaced without reloading, the resistor tool's pattern), so every
  state is a link. Preferences (theme, digits, chart mode) in `localStorage`, read after mount.
- **Results update while typing and dragging**; there is no submit button. Input that cannot be read says why.
- **Keyboard and touch** for every main task; layouts work at 320 px width; nothing exists only on hover.
- **Numbers are honest**: never truncated, signed, units shown, normalised values labelled. When no exact answer
  exists the tool says so and why.
- **Assumptions are stated** on the page: ideal parts, lossless lines, real Z0.
- **The card on the main page and the README list only what works**; the card arrives with M3.
- **Nothing reaches `main` before M3.4** adds the card (CLAUDE.md: every tool has a card, no placeholder cards).
- **Released from checkpoint 2 (D19):** the page carries a status note (its texts in `components/Smith/Status.tsx`); every
  later step keeps it true, and its work is merged to `main` when its checks pass, as the main session decides.

## Design direction

The resistor lookup is the model for page structure, tone and the theme system (`components/Resistor/`,
`styles/Resistor.module.css`): light and dark themes following the system with a switch, all colours as CSS variables
on the tool's root, system UI type with tabular monospace numerals, calm sections separated by space and fine rules, a
slim section nav, short functional motion (none with reduced motion). The chart is the hero: a quiet grid, each part's
arc in its own colour (the same colour in the schematic strip and the equations), the goal clearly marked. M2.3 makes
the design pass and records the tokens in its notes.

## Milestones

One agent per step, one at a time, each started and checked by the main session (agent-workflow.md). M0–M5 are planned
in [milestones.md](milestones.md), M6–M9 since owner checkpoint 2 (steps M6.1–M9.4 with sizes). The step that
finishes updates the status column.

| M | Name | Size | Result | Status |
|---|---|---|---|---|
| M0 | Research and set-up | M | Plan reviewed (M0.1), verified facts and sources, spike decisions | M0.1 done 2026-11-11, notes in [notes-M0.1.md](notes-M0.1.md); M0.2 done 2026-11-11, notes in [notes-M0.2.md](notes-M0.2.md); M0.3 done 2026-11-11, notes in [notes-M0.3.md](notes-M0.3.md) |
| M1 | Engine | L | `lib/smith/` with a harness; no UI | done 2026-11-11 (M1.1–M1.4), notes in [notes-M1.1.md](notes-M1.1.md), [notes-M1.2.md](notes-M1.2.md), [notes-M1.3.md](notes-M1.3.md), [notes-M1.4.md](notes-M1.4.md) |
| M2 | Chart | L | Labelled, zoomable Z/Y/ZY chart on its own route, touch included | M2.1a done 2026-11-12 (grid geometry, density, labels and scales in `lib/smith/grid.ts`, harness only), notes in [notes-M2.1a.md](notes-M2.1a.md); M2.1b done 2026-11-12 (the grid's SVG layer in `components/Smith/`, a bare `/smith-chart/main` with a Z/Y/ZY switch and a temporary zoom, page harness `npm run ui`; `arcFlags`' sweep bit corrected), notes in [notes-M2.1b.md](notes-M2.1b.md); M2.2 done 2026-11-12 (wheel, pinch, drag, keyboard and touch per D14 in a framework-free controller with one write per frame, the grid stretched by CSS during gestures, the cursor readout of z, y, Γ, VSWR and return loss; 3.8 ms main thread per frame at 4× CPU while zooming), notes in [notes-M2.2.md](notes-M2.2.md); **done 2026-11-12 (M2.1a–M2.3)**: M2.3 put the page in the site's frame (bar with theme switch, chart as the hero, readout beside it or below), cut the grid's fine regions to whole blocks (outlines on circles), labels lines inside the field (BL48) and shows every readout digit, notes in [notes-M2.3.md](notes-M2.3.md) |
| M3 | Circuit editor, both ways, and first theory | L | **First usable tool**: card on the main page, Theory section with the first topics | done 2026-11-12 (M3.1–M3.5c: the circuit editor typed and dragged, path, handles, draw tool, undo and redo, card and start state, the Theory and References sections with live numbers, the short line and "→ theory" link beside every control and readout), notes in [notes-M3.1.md](notes-M3.1.md), [notes-M3.2.md](notes-M3.2.md), [notes-M3.3a.md](notes-M3.3a.md), [notes-M3.3b.md](notes-M3.3b.md), [notes-M3.4.md](notes-M3.4.md), [notes-M3.5.md](notes-M3.5.md) (with the roll-up of the "done when" list), [notes-M3.5-fix.md](notes-M3.5-fix.md); claims in [claims.md](claims.md); the branch may be merged to main when the owner says so |
| M4 | Find the missing value | M | Geometric solver and suggestions for one or two unknowns | M4.1a done 2026-11-12 (goals in `lib/smith/goal.ts`, the circle-intersection core in `lib/smith/solve.ts`: two unknowns with a point target, one unknown with a circle goal, coincident and touching circles, the other kind for a wrong sign, lengths with their λ/2 period, a fixed order; about 5 µs per solve of a 10-part circuit; harness only), notes in [notes-M4.1a.md](notes-M4.1a.md). M4.1b done 2026-11-12 (the best value of one unknown for a point target in closed form, ranges of inequality goals, families of two unknowns with a circle goal, a stub's Zc on the geometric path, the fallback search for a line's Zc and f0 in `lib/smith/search.ts`, the value lists of D17 and standard-value variants in `lib/smith/values.ts`; 20 µs for a best value, 0.08 ms for a family, under 2 ms for the fallback in a 10-part circuit; harness only), notes in [notes-M4.1b.md](notes-M4.1b.md). M4.2 done 2026-11-12 (`scripts/harness/smith/check-validate.mjs`: 1,660 random problems of every kind against an independent brute force, closed-form cases, determinism; five solver bugs fixed: f0 with a swapped lumped part, answers at a goal's pole (`goalPole`), range ends at ±π/2, f0 outside its range, narrow bands missed by the generic grid, now refined; harness only), notes in [notes-M4.2.md](notes-M4.2.md). M4.3a done 2026-11-12 (the Solve panel: "Solve for" on the part card and f0, at most two with the oldest replaced, the goal at a node as a point or a circle with "or less", every message of the counting table, solutions in the solver's order with Apply as one undo step, ranges and family ends; the ask in the circuit, the link (`u`, `g`) and the history; slow 2-D searches after a pause, never in a drag), notes in [notes-M4.3a.md](notes-M4.3a.md). M4.3b done 2026-11-12 (the solver on the chart: the goal's ring and mark follow the chosen goal, an r, g, x or b goal's pole crossed out, the construction's two circles cut to the disk with their crossings, previews of solutions, members and variants by hover, focus and tap, the family's slider, standard-value variants under every solution, the value list per kind (E6–E96, own, any) in the link and localStorage, snapping and keys by it; `lib/smith/goalView.ts`, `components/Smith/solveLayer.ts`), notes in [notes-M4.3b.md](notes-M4.3b.md). M4.3c content done 2026-11-12 (theory-solver.md §9–§11: two solutions, one or none; why one value cannot reach a point; realisable and standard values, with the start circuit worked by hand and checked against the solver; the short lines of the Solve panel, the lists and their kinds, Snap and the goal corrected; claims 130–187 in claims.md; one registry entry to add, `mismatch-to-target`; no code), notes in [notes-M4.3c.md](notes-M4.3c.md). M4.3c page done 2026-11-12 (topics 8–10 on the page in `components/Smith/TheorySolver.tsx` with live boxes from the Solve panel's outcome or the start example, three figures, the registry's `mismatch-to-target`, nine short lines and the solve lines relinked, a solved x or b at rounding level shown as the part's no-effect value; module map moved to [modules.md](modules.md)), notes in [notes-M4.3c.md](notes-M4.3c.md) "Page". M4.4a done 2026-11-12 (`lib/smith/suggest.ts`: the single change of each part and the exact pairs for a point target, ranked, with their standard values; the solver worker `solve.worker.ts` with `solveJob.ts` and `solveClient.ts`, which now solves every f0 problem and the generic grid off the page; BL57 and BL58 fixed; harness only for the suggestions), notes in [notes-M4.4a.md](notes-M4.4a.md). M4.4b done 2026-11-12 (the suggestions on the page when nothing is marked: each with its value(s), the |Γ| reached, Apply as one undo step, "Solve for" to mark its parts, its standard values and a preview with its construction circles; the texts for a goal already met and for none; the short line `solve-suggest`; the home card and README say the tool finds missing values), notes in [notes-M4.4b.md](notes-M4.4b.md) with the roll-up of M4's "done when" (all pass; ui-drag's absolute 4× budget excepted, notes-M4.3a.md). **M4 done 2026-11-12** (M4.1a–M4.4b); owner checkpoint 2 held 2026-11-12 (below) |
| M5 | Equation layer | L | Equations shown everywhere with live numbers, derivations, "explain this move"; values at rounding level shown as D20 | M5.1 done 2026-11-13 (the equation panel under the readout: symbolic, substituted and result lines from the registry for the selected part or node or the readout's point, the chart's colours, the digits setting, time-sliced at 0.25 ms a frame; D20's rule in `lib/quantity.ts` used by every readout, the node table, the Solve panel and the theory), notes in [notes-M5.1.md](notes-M5.1.md); M5.2 done 2026-11-13 (the equations linked both ways: every variable lights its part, node, goal or readout row by hover, focus with the arrow keys or a tap, the chart's arcs and nodes, tiles and node rows light their variables, "=" show-equation controls on every readout row, the circuit input, node rows and the part card jump to the row with a way back), notes in [notes-M5.2.md](notes-M5.2.md); M5.3 done 2026-11-13 (derivations: 26 registry entries with 102 checked steps, the owner's notes items 8–11 finished to centre and radius, the two-part match and the line of Z0 new; a modal dialog with Next step, Back and Show all, reasons, the subject's numbers and the M5.2 links, opened by Derive or Enter from the panel's rows and by "derive" beside the theory's equations), notes in [notes-M5.3.md](notes-M5.3.md); M5.4 done 2026-11-13 ("Explain this move" in the part card: after a drag, a typed value or a handle's key, what the change did with the engine's numbers and why by theory.md §4's rules, and on demand the part's arc from no effect with its circle, sense, equations with your numbers, Derive and the theory link; a marker traces the move on the chart, none with reduced motion), notes and the M5 roll-up in [notes-M5.4.md](notes-M5.4.md); **M5 done** |
| M6 | Teaching content | M | Worked examples, challenges, lesson links (M6.1 content, M6.2 engine, M6.3a–b page) | M6.1 done 2026-11-13 (content, no code: 16 worked examples in [examples.md](examples.md) with links, steps, done states, hints, topics and answers checked by hand and against the engine; the five challenge kinds with generator ranges, tolerances and hint ladders, the lesson link's parameters and the 15 short lines in [examples-challenges.md](examples-challenges.md); claims 191–229), notes in [notes-M6.1.md](notes-M6.1.md); M6.2 done 2026-11-13 (engine, harness only: `examples.ts`, `challenge.ts`, `lesson.ts`, the lesson and challenge parameters in state.ts, `check-teach.mjs`), notes in [notes-M6.2.md](notes-M6.2.md); M6.3a done 2026-11-13 (the Learn section and the guide beside the chart: `Learn.tsx`, `ui-learn.mjs`), notes in [notes-M6.3a.md](notes-M6.3a.md); M6.3b done 2026-11-13 (challenges with the hint ladder and reveal, progress, lesson links with locks, hidden panels and text: `Challenge.tsx`, `Lesson.tsx`, `ui-challenge.mjs`), notes and the M6 roll-up in [notes-M6.3b.md](notes-M6.3b.md). **M6 done.** |
| M7 | Sweep and report | L | Γ(f) trace, markers, return-loss plot, band figures, report with print layout, M7 theory (M7.1–M7.4b) | M7.1 done 2026-11-13 (the sweep engine `lib/smith/sweep.ts`, harness only: linear and log bands, refinement where the trace bends, markers and picking, band figures with intervals bracketed to 1e-12 and a loaded Q, checked against the point engine, a 10⁶-point brute force and the series RLC and λ/4 closed forms; a 10,000-point sweep of 10 parts takes 2.8 ms, so M7.2a sweeps fewer points or in a worker while dragging), notes in [notes-M7.1.md](notes-M7.1.md); M7.2a done 2026-11-13 (the Sweep panel with the band in the link, the Γ(f) trace on the chart refined in a worker and drawn at once at a 0.3 ms coarse budget, also every drag frame, markers by tap, drag and keys in the link; [notes-M7.2a.md](notes-M7.2a.md)); M7.2b done 2026-11-13 (the plot of return loss or VSWR under the chart with the limit, f0 and the shaded intervals, linked both ways with the chart by a shared cursor and the markers, the band figures from the worker and the marker table; [notes-M7.2b.md](notes-M7.2b.md)); M7.3 done 2026-11-13 (the report after the tool: the circuit as text, the input and every node at f0, the band, its figures and the marker table, the link; Print report and Ctrl+P print it alone on A4 or Letter in light colours with the chart and the plot as vectors and nothing interactive; the marker table as cards on phones and the band figures' open ends in words; [notes-M7.3.md](notes-M7.3.md)) |
| M8 | Export and share | L | Figure model with SVG, PNG and TikZ (D18) and a true-size preview, CSV, Touchstone, project file, link (M8.1a–M8.3b) | planned |
| M9 | Polish and re-checks | M | Accessibility, browsers and touch, performance, docs, every check run again (M9.1–M9.4) | planned |

**Owner checkpoints:** 1 after M3 (first usable tool), 2 after M4 (the solver; M6–M9 were then detailed), 3 when the
owner first uses the tool for a problem of their own (not a gate, D19). **Stopping points** if time runs short: after
any finished milestone, since the tool is released. Never in the middle of a milestone.

**Owner checkpoint 2** (2026-11-12). M6: yes to challenges and lesson links besides the worked examples. M7: yes to
the report's print layout. M8: yes to the project file (versioned JSON). New wish: the chart for LaTeX reports as
code, with detail levels, sizes and colour modes and a preview of each (D18, M8; BL46 scheduled there). The owner will
not try the tool for a while; the tool is released this week with a status note on the page, and later steps are
judged by the harness and screenshots and merged as they pass (D19). Residuals at rounding level such as "|Γ| =
7.2e-17" are to be shown honestly but readably (D20, M5.1).

The owner's "Resolution" wish is covered in three places: grid density that adapts to the zoom (M2), number of shown
digits and sweep points (M5, M7), export size, detail and scale (M8, D18).

## Module map

In [modules.md](modules.md) (`lib/`), [modules-page.md](modules-page.md) (the page) and
[modules-harness.md](modules-harness.md) (the checks): one line per file and its main exports; a step that renames or
adds a file updates the part it belongs to.

## Running a step

- Follow [agent-workflow.md](../agent-workflow.md): the brief names the files to read and the verification bar; stay
  under about 200k tokens of context; write a new file whole; chain shell commands. Heavy steps are split into research,
  code and check. Engine steps check by harness only (no dev server, no screenshots).
- **Harness:** `scripts/harness/smith/` with its own `package.json` (`playwright-core`, `tsx`) and ignored
  `node_modules`, after `scripts/harness/resistor/`. `npm run check` runs the engine checks and prints a short summary.
  Screenshots from the installed Edge or Chrome (`channel: 'msedge'`), 390 px and 1440 px wide, both themes,
  downscaled to about 1,000 px, written to the session's scratch folder, never to the repo. Firefox and WebKit (the
  stand-in for Safari on Windows) need `npx playwright install firefox webkit` in the harness folder; only the steps
  that compare browsers (M5, M9) do that.
- **Done means:** the harness passes, `npx tsc --noEmit` and `npm run build` pass (then `git checkout --
  next-env.d.ts`), the code was read against the static-export constraints, page steps were looked at in both themes at
  both widths, and the step's `notes-<step>.md`, this file's status, the module map ([modules.md](modules.md) and its parts) (and from M3 the card and README)
  are updated, and the page's status note is still true. Anything left out goes to `docs/BACKLOG.md` with the next
  free id.
- **Commits:** one per step on the branch `smith-chart`, made by the step's agent when its checks pass (message as
  CLAUDE.md's "Commits" says, files named explicitly, no push). Merging to `main` is the main session's call, once
  the step's checks pass (D19). Other sessions push other tools to `main` from their own clones, so the main session
  first runs `git fetch` and, if `origin/main` moved, `git merge origin/main` into `smith-chart` (stash the owner's
  uncommitted `.gitignore` line around it), `npm install` for new dependencies (do not commit a lockfile change that
  is only the project's `name`), re-checks, then `git push origin smith-chart:main` and `git branch -f main smith-chart`.

## Quality bar ("10/10", made checkable)

| Area | What it means here | How it is checked |
|---|---|---|
| Correctness | Every number from the engine; every equation shown is checked against it; no NaN, ∞ or truncation shown | `check.mjs`: textbook cases from facts.md, a second independent computation, round trips, fuzz, equations against the engine |
| Performance | Smooth dragging and zooming with a realistic circuit, on the laptop and on a phone | Budgets in engine.md §9, measured by `timing.mjs`, also with the CPU throttled 4× |
| Usability | Nothing needs explaining that the page does not explain; no dead ends; undo everywhere; plain messages; sensible start | Scripted use of every task; owner checkpoints 1 and 2, and the owner's own use when it comes (D19) |
| Teaching | Any number can be followed to its equation, derivation, theory topic and source | M3.5, M5 and M6 "done when" lists |
| Looks | Consistent, calm, a chart legible at every zoom, both themes designed | Screenshots at three sizes in both themes (M2, M9) |
| Access | Main tasks by keyboard alone and by touch; names, roles, contrast, reduced motion | M3, M9.1 |
| Honesty | Assumptions stated; says when no exact answer exists and why | Text reviewed in M3.5, M6, M9 |

## Risks

- **Sign conventions**, the classic failure of Smith chart tools: fixed once in engine.md §1 and facts.md, checked by
  direction-of-travel facts in the harness.
- **MathML layout cost per frame** while dragging (KaTeX itself is about 0.04 ms per equation): measured in M0.3; the
  fallback is updating the panel at a lower rate.
- **MathML across browsers:** spacing and fonts differ; checked in M5 and M9.1.
- **Teaching content takes real writing and checking:** no claim without a source or a derivation; the research pass
  (M0.2) is not hurried.
- **Size:** M0–M5 are about 20 agent steps, more than any earlier tool (resistor 7, PCB viewer 9). Steps that grow past
  the context budget are split before they start, not during.
