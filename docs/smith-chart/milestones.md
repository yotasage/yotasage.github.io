# Smith chart – milestones

Every step of [plan.md](plan.md)'s milestone table, with what "done" means. One agent per step, one at a time; a step
that turns out too big is split before it starts. Engine steps check by harness only; page steps are given less than
seems to fit (agent-workflow.md). M6–M9 are an outline until owner checkpoint 2.

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

*Done when:* exact cases have a residual below 1e-9; brute force finds no missed solution on 200 or more random
problems of each kind; the same input gives the same order; time within budget; a scripted case reaches every message
of the counting table.

**Owner checkpoint 2.** Mark C unknown in a two-part circuit and see the answers and the two circles. Free one unknown
where two are needed and read the message. Pick a solution, round it to a standard value, and look at what the match
does. Then M6–M9 are detailed with the owner, who confirms their extras.

## M5 – Equation layer

- **M5.1 Panel.** learning.md §3: symbolic, substituted and result lines, variable colours matched to the chart, the
  digits setting.
- **M5.2 Linking.** Both ways, by the sentinel colours of learning.md §2; "show equation" on every readout and part
  card; tap equivalents.
- **M5.3 Derivations.** learning.md §4, including the unfinished ones of the owner's notes; theory topics link to them.
- **M5.4 "Explain this move".**

*Done when:* every equation on screen passes the numeric check; TeX renders with errors turned on; screenshots in Edge,
Firefox and WebKit; the panel within budget at 1× and 4×; the owner reads one full derivation through and finds no step
missing.

## M6–M9 – outline

- **M6 Teaching content:** worked examples; challenges and lesson links if confirmed (learning.md §7). *Done when:*
  every example's stated answer is reproduced by the engine; the harness plays three examples through; lesson links
  round-trip.
- **M7 Sweep and report:** an engine sweep (linear or logarithmic, refined where the curve bends, markers, band
  figures: worst and best return loss, bandwidth below a chosen |Γ|, maximum VSWR); the Γ(f) trace with
  frequency-labelled markers; a return-loss plot linked to the chart by pointing; a marker table; a report panel (f0
  summary, band figures, per-node table) and its print layout if confirmed; the M7 theory topics. *Done when:* the
  sweep agrees with the point engine; a 10,000-point trace draws within budget; band figures match brute force on
  analytic cases.
- **M8 Export and share:** a standalone SVG, PNG at 1× to 8×, CSV of nodes, trace and markers, Touchstone `.s1p` of
  S11 (Γ at the input), a project file (versioned JSON) if confirmed, copy link. *Done when:* the exported SVG matches
  the on-screen geometry; the `.s1p` is read back by a reference parser in the harness; the project file round-trips.
- **M9 Polish and release gate:** accessibility (keyboard alone, names and roles, contrast, reduced motion, 200 %
  text), touch on the owner's phone, Edge, Firefox and WebKit including MathML; budgets, script size and a long drag
  session for memory re-measured; docs (how-to, backlog tidied); every earlier "done when" run again.
  **Owner checkpoint 3:** the owner uses it for a real problem; the gate is passed when the owner says it is the tool
  they wanted and the harness is green.
