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
| [plan.md](plan.md) | This index: goal, decisions, ground rules, milestones and status, module map, how a step is run, quality bar, risks |
| [engine.md](engine.md) | The model: conventions, parts, the geometry (every v1 locus is a circle), evaluation, drawing, dragging, numbers, goal, performance architecture and budgets |
| [solver.md](solver.md) | Find the missing value: counting, the circle-intersection method, the fallback search, what comes back, suggestions |
| [learning.md](learning.md) | Equations as data, the equation panel, derivations, the Theory section (from M3), the owner's notes, teaching content |
| [milestones.md](milestones.md) | Every milestone's steps and "done when"; M6–M9 in outline until owner checkpoint 2 |
| [facts.md](facts.md) | Written by M0.2: the conventions and every equation with its source or derivation, the owner's notes checked, the values real L and C come in |
| [facts-cases.md](facts-cases.md) | 28 worked numeric cases with the sources' numbers and ours to 10 digits, for M1's harness |
| [sources.md](sources.md) | What each source is, what was opened, what it may and may not be cited for; the sources not opened |
| [theory.md](theory.md) | Written by M3.5a: the Theory section's topics (text with numbered claims, equation ids, live numbers, figures, citations) and the short line beside every control and readout, for M3.5b to put on the page |
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

## Design direction

The resistor lookup is the model for page structure, tone and the theme system (`components/Resistor/`,
`styles/Resistor.module.css`): light and dark themes following the system with a switch, all colours as CSS variables
on the tool's root, system UI type with tabular monospace numerals, calm sections separated by space and fine rules, a
slim section nav, short functional motion (none with reduced motion). The chart is the hero: a quiet grid, each part's
arc in its own colour (the same colour in the schematic strip and the equations), the goal clearly marked. M2.3 makes
the design pass and records the tokens in its notes.

## Milestones

One agent per step, one at a time, each started and checked by the main session (agent-workflow.md). M0–M5 are planned
in detail in [milestones.md](milestones.md). **M6–M9 are an outline**: they are detailed after owner checkpoint 2, and
the owner confirms which of their extras are built. The step that finishes updates the status column.

| M | Name | Size | Result | Status |
|---|---|---|---|---|
| M0 | Research and set-up | M | Plan reviewed (M0.1), verified facts and sources, spike decisions | M0.1 done 2026-11-11, notes in [notes-M0.1.md](notes-M0.1.md); M0.2 done 2026-11-11, notes in [notes-M0.2.md](notes-M0.2.md); M0.3 done 2026-11-11, notes in [notes-M0.3.md](notes-M0.3.md) |
| M1 | Engine | L | `lib/smith/` with a harness; no UI | done 2026-11-11 (M1.1–M1.4), notes in [notes-M1.1.md](notes-M1.1.md), [notes-M1.2.md](notes-M1.2.md), [notes-M1.3.md](notes-M1.3.md), [notes-M1.4.md](notes-M1.4.md) |
| M2 | Chart | L | Labelled, zoomable Z/Y/ZY chart on its own route, touch included | M2.1a done 2026-11-12 (grid geometry, density, labels and scales in `lib/smith/grid.ts`, harness only), notes in [notes-M2.1a.md](notes-M2.1a.md); M2.1b done 2026-11-12 (the grid's SVG layer in `components/Smith/`, a bare `/smith-chart/main` with a Z/Y/ZY switch and a temporary zoom, page harness `npm run ui`; `arcFlags`' sweep bit corrected), notes in [notes-M2.1b.md](notes-M2.1b.md); M2.2 done 2026-11-12 (wheel, pinch, drag, keyboard and touch per D14 in a framework-free controller with one write per frame, the grid stretched by CSS during gestures, the cursor readout of z, y, Γ, VSWR and return loss; 3.8 ms main thread per frame at 4× CPU while zooming), notes in [notes-M2.2.md](notes-M2.2.md); **done 2026-11-12 (M2.1a–M2.3)**: M2.3 put the page in the site's frame (bar with theme switch, chart as the hero, readout beside it or below), cut the grid's fine regions to whole blocks (outlines on circles), labels lines inside the field (BL48) and shows every readout digit, notes in [notes-M2.3.md](notes-M2.3.md) |
| M3 | Circuit editor, both ways, and first theory | L | **First usable tool**: card on the main page, Theory section with the first topics | done 2026-11-12 (M3.1–M3.5c: the circuit editor typed and dragged, path, handles, draw tool, undo and redo, card and start state, the Theory and References sections with live numbers, the short line and "→ theory" link beside every control and readout), notes in [notes-M3.1.md](notes-M3.1.md), [notes-M3.2.md](notes-M3.2.md), [notes-M3.3a.md](notes-M3.3a.md), [notes-M3.3b.md](notes-M3.3b.md), [notes-M3.4.md](notes-M3.4.md), [notes-M3.5.md](notes-M3.5.md) (with the roll-up of the "done when" list), [notes-M3.5-fix.md](notes-M3.5-fix.md); claims in [claims.md](claims.md); the branch may be merged to main when the owner says so |
| M4 | Find the missing value | M | Geometric solver and suggestions for one or two unknowns | not started |
| M5 | Equation layer | L | Equations shown everywhere with live numbers, derivations, "explain this move" | not started |
| M6 | Teaching content | M | Worked examples; challenges and lesson links if confirmed | outline |
| M7 | Sweep and report | L | Γ(f) trace, markers, return-loss plot, band figures, report | outline |
| M8 | Export and share | M | SVG, PNG, CSV, Touchstone, project file, link | outline |
| M9 | Polish and release gate | M | Accessibility, performance, browsers, docs, final review | outline |

**Owner checkpoints:** 1 after M3 (first usable tool), 2 after M4 (the solver; M6–M9 are then detailed and confirmed),
3 after M9 (the release gate). **Stopping points** if time runs short: after M3 (a usable tool with theory) and after
M4 (the tool does what the owner asked for). Never in the middle of a milestone.

The owner's "Resolution" wish is covered in three places: grid density that adapts to the zoom (M2), number of shown
digits and sweep points (M5, M7), export scale (M8).

## Module map

Suggested; a step that renames or adds a file updates this table with one line per file and its main exports.

| File | What |
| --- | --- |
| `lib/quantity.ts` | Shared number reading and writing (moved from `lib/resistor/lists.ts`, which re-exports it): `readAmount(text, unit?, infinite?)`, `formatAmount(value, unit, digits)`, `SI_PREFIXES`; prefixes f to T, units Ω S H F Hz m W V A dB, `3e-9`, `4n7`, rounding with carry |
| `lib/smith/complex.ts` | Complex arithmetic on (re, im) pairs into `out[o]`, no allocation: `cadd`, `csub`, `cmul`, `cdiv` (Smith's method), `cinv`, `cscale`, `cexpj`, `crotate`, `csqrt`, `cabs`, `carg`, interleaved `cmulN`, `cdivN`, `cabsN`; type `Vec` |
| `lib/smith/convert.ts` | `gammaFromZ`, `zFromGamma`, `gammaFromY`, `yFromGamma`, `invert`, the same in ohms and siemens (`gammaFromImpedance`, `impedanceFromGamma`, `gammaFromAdmittance`, `admittanceFromGamma`), batch `gammaFromZN`, `zFromGammaN`; `gammaMag`, `gammaAngle`, `vswr`, `magFromVswr`, `returnLoss`, `magFromReturnLoss`, `mismatchLoss`, `reflectedPower`, `deliveredPower`, `qFromZ`, `qFromGamma`; never NaN, ∞ is (Infinity, 0) |
| `lib/smith/parts.ts` | Part kinds `SERIES_R` … `QUARTER`, `Part`, `packParts`; `ADDS`, `REACH_LO`, `REACH_HI`, `noEffect`; `added`, `valueFor` (value ↔ normalised r, x, g, b, turns); `turnsFromMetres`, `metresFromTurns`; `sincosTurns`; `partMatrix` (normalised ABCD, bounded scaling), `lumped` |
| `lib/smith/network.ts` | (V, I) nodes from the load: `loadNode`, `applyPart`, `evaluate`, `nodeGamma`, `inputGamma`, `sweep` (allocation-free), `nodeMetrics`, `allMetrics` (`M_GR` … `M_YI`), `Circuit`, `evaluateCircuit`; the degenerate rule |
| `lib/smith/geometry.ts` | Möbius maps (`partMobius`, `mobApply`, `mobCompose`, `mobInvert`), generalised circles (`circleThrough`, `circleImage`, `circleCentre`, `projectOnCircle`), part loci (`partLocus`, `nodeLocus`, `locusPoint`, `locusValue`, `project`), arcs (`partArcs`, `ARC_*`, `arcFlags`), `trackLength`, `samplePolyline` |
| `lib/smith/equations.ts` | Equation text → trees: `parse`, `toText`, `variablesOf`; TeX printer `tex(tree, {value, variable})`, `valueTex`, `nameTex`; evaluator `compile` (allocation-free `Program`), `bind`, `programOf`, `evaluate`; registry `EQUATIONS` (67 entries with sources and steps; `mobius` from M3.5b), `EQUATION_BY_ID`, `SYMBOLS`, `symbolOf`, `PARSE_MS` |
| `lib/smith/grid.ts` | The chart's grid as data for one density level: `densityLevel` (with hysteresis), `levelK`, `buildGrid(view, level, options)`, `gridFor` (reuses a grid that still covers the view), `gridCovers`; r/x/g/b arcs in geometry.ts's `ARC_*` layout with `FAM_*`, `CLS_*`, values and end values, labels (`GridLabel`, `LBL_*`), perimeter ticks (`SCALE_ANGLE`, `SCALE_WAVE`), `scaleLayout`, `textWidth`, `GRID_DEFAULTS` (M2.3: `blocks` 4, the whole-block rule of the fine regions; `inner`, `repeatPx` 280: labels in the field, `GridLabel.inner`), `MODE_Z/Y/ZY` |
| `lib/smith/goal.ts`, `solve.ts`, `suggest.ts` | Goals, the geometric solver and its fallback, suggestions |
| `lib/smith/state.ts` | The circuit (network.ts's `Circuit`) and its link: `defaultCircuit` (D16), `newPart`, edits `insertPart`, `removePart`, `movePart`, `withPart`; value forms `formsOf`, `formValue`, `withForm`, `readForm`; checks `z0Problem` … `partProblem`, `circuitProblem`; `encodeCircuit`, `decodeCircuit` (never throws; `issues`, `linked`), `numText`, `readNum`, `sameCircuit`, `circuitInputGamma`; `KIND_CODES`, `KIND_NAMES`, `KIND_ORDER`, `MAX_PARTS` 24, `LINK_VERSION` 1; M3.3b: `startPart` (the draw tool's part of no effect), `stepValue` (a handle's arrow keys), `KEY_DIV`, `KEY_FACTOR` |
| `components/Smith/Strip.tsx` | `Strip` (props `circuit, onChange, issues`, from M3.2 `selected, onSelect, onHover`): the circuit panel in `Chart`'s `side`: parameters, the schematic strip (`PartSymbol`, `partColour`), the selected part's card with its value forms, the add row, the circuit input readout (`data-input`); `formText`; M3.3b: `onChange(next, group)` (fields name their group), `revision` (undo and redo drop typed text), `drawKind`/`onDraw` and the Draw button (`data-draw`) |
| `components/Smith/pathLayer.ts` | `PathLayer` (M3.2), framework-free: the circuit's path in `ChartView`'s top layer: arcs (`arcPath`: exact `A` pieces ≤ 0.6π, chords when flat, polylines on the circle above 1e5 px radius) in `world`, rewritten on circuit change and reframe; arrows (`arrowAt`), node markers, the goal mark and line as HTML in a contained box over the chart, moved by CSS transforms each frame; `setCircuit`, `select`, `hover`, `pick` (`arcDistance`), `onPick`; `SEL_*`, `GOAL_VSWR`, `GOAL_MAG`, `partColour`, `nodeLabel`, `nodeName`; from M3.3a the handles (`data-handle`, `handleAt`, `HANDLE_PX` 22) and the drag (`beginDrag`, `dragTo`, `endDrag`, `onCommit`, `onLive`, `snap`, `SNAP_PX`, `SNAP_SERIES`, `snapCode`/`snapFamily`/`snapGridValue`, the snap mark `data-snap`); M3.3b: the draw tool (`arm`, `drawAt`, `beginDraw`, `cancelDraw`, `onDraw`, the ring `data-draw-start`), a still, visually hidden slider per part (`data-handle-key`, the strip's order; the focused ring gets `data-focus`) with `keyStep` (arrows, PageUp/Down, Enter), `committed` |
| `components/Smith/live.ts` | `writeLive(root, circuit, part)` (M3.3a): the side panel's texts during a drag (node rows from the part on, goal distance, tile, card fields, circuit input), written straight into the DOM React renders, in the same texts |
| `components/Smith/Nodes.tsx` | `Nodes` (M3.2): the node table (z, Γ, VSWR, RL of every node at f0 from network.ts; `nodeTexts`), rows select and highlight, the goal line with the input's distance; closed on phones |
| `components/Smith/gridSvg.ts` | The grid layer, framework-free: `GridLayer` (`update(cx, cy, k, w, h, mode)` rebuilds the DOM only when `gridFor` gives a new grid, else sets one transform; `holds(...)` whether the built grid can be shown stretched; `ox`, `oy`, `kq`, `buildMs`, `domMs`), `PART_NAMES`, `SCALE_ROOM_PX`, `fitK(w, h)` |
| `components/Smith/chartView.ts` | `ChartView`: the view (cx, cy, k, limits 1× to 1024×), wheel, pinch, drag, keys and touch (D14), one DOM write per frame, the grid stretched by CSS during gestures, the top layer's `world` (Γ frame, `onReframe`) and `screen` groups, the read point, `handles` hooks (M3.3a: `down` gets touch, Alt and time, other pointers are ignored during a handle drag; M3.5c: the box's rect is measured again at every press and on pointerenter, as the toolbar can move it), `TAP_SLOP`, `TAP_MS` |
| `components/Smith/Theory.tsx` | `Theory` (M3.5b, props `bib, circuit`, memoised on the circuit): the topics of theory.md §1–7 (`TOPICS`, ids are anchors), folding (`details`; folded under 720 px except a #link's target; `hashchange` opens), equations by registry id (`Eq`: `tex(tree)`; with the engine's numbers, M3.5c: `substitutions` gives aligned rows, one substituted member per line and the result, ω as 2π·f0; other equations a second line `tex(tree, {value})`), live numbers as `data-live` spans, citations `[n, §x]` through `bib.number` (no-break spaces, wrapping inside); M3.5c: `onFollowTopic` opens a topic from a short line, focuses its heading and shows "Back to the tool" (`data-back-to-tool`); styles in `styles/SmithTheory.module.css` (also the bar's section nav) |
| `components/Smith/Why.tsx`, `whys.ts` | M3.5c: the 39 short lines of theory.md §8 (`WHYS` by key, `FIELD_WHY` by form) and their components: `Why` (an info button, `data-why`, whose bubble, fixed and placed once, holds the line and the `→ theory` link; click, tap or keys, never hover; one open at a time) and `WhyLine` (the selected kind's line in the part card); `followTopic`/`onFollowTopic` link them to the Theory |
| `components/Smith/TheoryFigures.tsx` | The theory's mini charts as inline SVG in chart units, coloured by the page's tokens: `GammaFigure`, `CirclesFigure`, `LineFigure` (the visitor's load), `PlaneFigure`, `WalksFigure`, `VswrFigure`, `MatchFigure` (fixed, D16) |
| `components/Smith/readout.ts` | The readout's texts (z, Z, y, Y, Γ polar and Cartesian, VSWR, return loss) by `formatAmount` with `keepZeros` (every digit shown, M2.3), written imperatively |
| `components/Smith/Chart.tsx` | `Chart` (props `mode, z0, tools, side, onView`): the workspace: toolbar (`tools`, zoom, Fit, Reset), the two stacked `<svg>`s, the gesture hint, the side panel (`side` above the readout; beside the chart from 960 px, below it under) |
| `styles/Smith.module.css` | The tokens on `.root` (light, dark by system or `data-theme`; notes-M2.3.md): colours, grid `--grid-*`, part colours `--part-1…8`, type, spacing; the bar and theme switch, the workspace layout (`.work`, `.stage`, `.side`, `.panel`), `.chart`, `.grid` (inner labels with a halo) |
| `components/Smith/` | `SmithTool`, `Chart`, `Grid`, `Strip`, `PartCard`, `Readout`, `Theory`, `SolvePanel`, `MathPanel`, … |
| `pages/smith-chart/main.tsx` | The route (M3.1: the circuit state, read from the link after mount, written back by `replaceState`, `commit` the one place a new circuit arrives; M2.3: the site frame, bar with home link, title and theme switch (`smith.theme` in `localStorage`, read after mount), the Z/Y/ZY switch as `Chart`'s `tools`; M3.3b: the history in `commit` (`HISTORY` 200, `GROUP_MS`), Undo/Redo (`data-undo`, `data-redo`) and the armed draw tool's button (`data-draw-stop`) in the toolbar, the keys Ctrl/Cmd+Z, +Shift+Z, Ctrl+Y and Escape; from M3: `getStaticProps` loads `references.bib`, renders `SmithTool`) |
| `scripts/harness/smith/` | `check.mjs` (engine; from M1.1: complex, special points, facts-cases C1–C11, round trips, NaN fuzz, quantity; from M1.2 with `check-network.mjs`: C12–C28, the impedance-arithmetic second computation, 0/∞ fuzz, directions, lines, sweep timing; from M1.3 with `check-geometry.mjs`: maps, circles, arcs, directions, values, projection, fuzz, sampler, drag-frame timing; from M1.4 with `check-equations.mjs`: registry, parse and print, KaTeX rendering, every entry and step against the engine, timing; from M2.1a with `check-grid.mjs`: circles and ends, labels, spacing, stability, scales, fuzz, timing; from M3.1 with `check-state.mjs`: link round trip, number text, broken links, D16, value forms, edits), `ui*.mjs` (page; `ui-grid.mjs` (the grid read back from the DOM, label boxes, D13, themes, 320 px, rebuild time) and `ui-chart.mjs` (M2.2: readout vs the engine, wheel, drag, keys, CDP touch, frame times at 1× and 4× CPU), and `ui-strip.mjs` (M3.1: add, move, remove every kind by mouse and by keys, typing, bad values, reload, 320/390 px, two screenshots) and `ui-path.mjs` (M3.2: arcs read back from the DOM against the engine for 21 circuits, arrows, markers, node table, selection by mouse, keys and tap, path frame time, 320/390 px, two screenshots) and `ui-drag.mjs` (M3.3a: drags of every kind by mouse and touch replayed through `project`, turns, typed vs dragged, drag back, snapping, live panel vs React, link once, scroll off handles, drag frame time; screenshots with `SMITH_SHOTS`), all by `npm run ui [shots folder]` (the folder goes to the last), which starts the dev server if none runs), `shots.mjs` (M2.3: `tsx shots.mjs <folder> [zoom] [Γr,Γi] [widths]`, 390/768/1440 px in both themes, ≤ 1000 px wide); M2.3 added to `check-grid.mjs` inner labels and region outlines (stairs vs single cells), to `ui-grid.mjs` the theme switch and labels in the field, `timing.mjs` (budgets); M3.3b: `ui-edit.mjs` (undo and redo against a model history, the draw tool, keyboard alone; from M3.4 also the start and empty states, Start over and the main page's card) and `check-state.mjs` "draw and key steps"; M3.5b: `ui-theory.mjs` (live numbers, equations, citations, topics, folding; M3.5c: every #link resolves); M3.5c: `ui-why.mjs` (the 39 short lines, their bubbles and links by mouse, keyboard and touch, the way back) |

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
  both widths, and the step's `notes-<step>.md`, this file's status and module map (and from M3 the card and README)
  are updated. Anything left out goes to `docs/BACKLOG.md` with the next free id.
- **Commits:** one per step on the branch `smith-chart`, made by the step's agent when its checks pass (message as
  CLAUDE.md's "Commits" says, files named explicitly, no push).

## Quality bar ("10/10", made checkable)

| Area | What it means here | How it is checked |
|---|---|---|
| Correctness | Every number from the engine; every equation shown is checked against it; no NaN, ∞ or truncation shown | `check.mjs`: textbook cases from facts.md, a second independent computation, round trips, fuzz, equations against the engine |
| Performance | Smooth dragging and zooming with a realistic circuit, on the laptop and on a phone | Budgets in engine.md §9, measured by `timing.mjs`, also with the CPU throttled 4× |
| Usability | Nothing needs explaining that the page does not explain; no dead ends; undo everywhere; plain messages; sensible start | Owner checkpoints; scripted use of every task |
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
