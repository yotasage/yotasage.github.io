# EM simulation – milestones

Every step of phase 1. One agent per step, one at a time (agent-workflow.md). Sizes: **S** under about 80k tokens of
context, **M** about 120–160k, **L** up to 200k; page steps are briefed for less than seems to fit. A step that looks
larger than its size when briefed is split before it starts. Each step ends with its `notes-<step>.md`, the status in
[plan.md](plan.md), `modules.md`, and one commit on `em-sim`.

"Reads" lists what the brief should name; the brief adds the exact sections. Nobody reads the v1/v2 drafts in `.local/`:
what is kept of them is in this plan and [later.md](later.md).

## M0 – Research and set-up (no product code)

### M0.1 – Plan review (done 2026-11-16)

The v2 draft reviewed against the site and the owner's answers; this plan written. [notes-M0.1.md](notes-M0.1.md).

### M0.2 – Facts, cases and sources (content) · M

**Scope.** Everything the engine and the theory will rely on, with a source or a derivation, in three files:

- `facts.md`: frames and sign conventions (engine.md §1); quasi-TEM and when it holds on PCBs; Z0, εeff, delay; the
  multiconductor line (C, C0, L, the modes of L·C); **every definition of Zdiff, Zcm, Zodd, Zeven in use** (symmetric
  and asymmetric pairs, the mixed-mode S-parameter definitions, what Polar SI9000 and JLCPCB report) and which one the
  tool shows by default; backward and forward coupling coefficients; the H field of the quasi-TEM mode; **exact
  solutions** (coax, eccentric coax, two wires, wire over plane, Cohn's zero-thickness stripline and coupled stripline,
  parallel plates); **closed-form calculator formulas** used by common calculators (IPC-2141A, Wheeler 1977,
  Hammerstad–Jensen, Kirschning–Jansen for coupled microstrip, Cohn's thickness corrections) with their stated ranges
  and accuracy; via formulas (coaxial and quasi-coaxial barrel with N return vias, pad and antipad capacitance estimates,
  stub resonance, rise time and bandwidth); **JLCPCB:** their published stackups and materials with εr (and the
  frequency it is given at), copper thickness for 1 oz and 0.5 oz outer and inner, mask thickness and εr, how their
  impedance sheet and calculator define W1, W2, S and the trapezoid; the stackup **JLC061611-3313G** of the owner's
  boards; the KiCad `(stackup …)` fields and `.kicad_pro` net-class fields by KiCad version; v2's list of why
  calculators disagree (v2 §7.8, in notes-M0.1.md), each item with what it changes and by about how much.
- `facts-cases.md`: numeric cases to 10 digits where exact (computed with a short script, elliptic integrals by the AGM),
  published numbers where not, each with its source; **the owner's cases** read from the boards where they are
  (`E:\OneDrive - NTNU\ULDAC\PCB\ARTI-CARRIER-PICO2` and `…\2026_ARTIFICER_TC1`: stackup, the `50R_SE` class 0.1377 mm
  on F.Cu over In1 and B.Cu over In4, non-coplanar with the pour ≥ 0.6 mm away; `LVDS_100R` 0.11 mm wide, 0.2 mm gap;
  the via sizes and the vias of the LVDS pairs, with any stitching vias near them), and **JLCPCB's numbers for them**:
  the engineers' adjusted widths in the order emails (`emails/*.msg` in both folders; the tables may be images:
  extract them in a scratch Python venv, never copy the emails into the repo) and, if the agent can reach it, JLCPCB's
  online calculator; otherwise list the exact inputs for the owner to run it (and Saturn PCB Toolkit, installed on the
  PC) and leave the columns open. A validation table with one row per case (v2 Appendix B's form, notes-M0.1.md).
- `sources.md` (what each source is, what was opened, what it may be cited for) and new entries in `references.bib`.

Web and licence lookups may run on Haiku. Content only: scripts in the scratch folder.

**Reads:** plan.md, engine.md §1–§6, notes-M0.1.md, `docs/smith-chart/sources.md` (its first 60 lines, for the form),
`references.bib` (grep for the entry style).

**Done when:** every formula the engine or theory will use is in facts.md with a source or a derivation; facts-cases.md
has at least 25 cases including the owner's; every JLCPCB number has a date and URL; each file under 40 kB; open
questions listed in the notes.

### M0.3 – Static solvers: formulation and spikes · M

**Scope.** Decide the 2D boundary-element formulation (engine.md §4: Green's function, planes, dielectric interfaces
and their truncation, panel grading and corner treatment, closed-form panel integrals, the error estimate), the
eigen-solution of the modes (a symmetric form so equal eigenvalues are safe), the axisymmetric solver (§5: ring kernel,
singular integration, truncation), and how the via model treats segments with several dielectrics (§6.1). **Spike** in
`scripts/harness/emsim/spikes/` (kept for M1.2, marked as spikes): a minimal single-conductor solver measuring error
against two exact cases and one refined case (microstrip with mask), solve time against panel count, and dense LU time
in JavaScript for n = 200–2,000. Also design (not write) the harness's independent finite-difference solver for M1.4,
so that its agent needs only that design and the contract.

**Reads:** engine.md §4–§6, §9, §10; facts.md (exact solutions; quasi-TEM); facts-cases.md (the cases to spike on).

**Writes:** `solver.md` (decisions with reasons and the measured numbers), the spike files, notes-M0.3.md.

**Done when:** the spike meets 0.1 % on the exact cases with a measured convergence order, the budget of engine.md §10
is shown to be reachable (or the budget is changed with the owner's numbers in plan.md's terms), and every "M0.3
decides" of engine.md has an answer.

### M0.4 – Full-wave: formulation, WebGPU spike, openEMS · L

**Scope.** Decide the FDTD design (engine.md §7: mesh grading, conformal cells or a fine mesh for barrels, CPML
parameters, lumped ports and feed lines, de-embedding, TDR from the incident and reflected waves, snapshot format,
f32 strategy, buffer layout, workgroup sizes, dispatch splitting, estimator calibration); **how the harness runs
WebGPU code** (for example a harness-only page served by a small Node server with the code bundled by the esbuild that
`tsx` brings, opened in Edge by Playwright with WebGPU enabled; verify that headless Edge on this PC has an adapter).
**Spike:** a Yee update in WGSL and in JavaScript, cells per second on the owner's laptop for both. **Install openEMS**
(owner's approval, D10: the official Windows release, into a folder outside the repo, path recorded) and its Python or
MATLAB/Octave interface (MATLAB R2023a is installed); run one microstrip line and one through via, and write the
fixture format (JSON with inputs, openEMS version, mesh, S-parameters, TDR) and the scripts that make it, in
`scripts/harness/emsim/openems/`.

**Reads:** engine.md §6–§8, §10; facts.md (the via formulas); solver.md (only its summary).

**Writes:** `fullwave.md`, the spike files, the openEMS scripts and first two fixtures, notes-M0.4.md.

**Done when:** the measured WebGPU and JavaScript rates give the estimated run time of a 2 M-cell via run; the two
openEMS fixtures exist with their provenance; every "M0.4 decides" has an answer.

### M0.5 – Site infrastructure review · S

**Scope.** Read the module maps, not the code where they suffice: the Smith chart's equation registry, printer,
evaluator and derivation dialog (`docs/smith-chart/modules.md`, `modules-page.md`) and decide whether they become shared
modules (where they move, what changes in `lib/smith/`, how `npm run recheck` proves the Smith chart is unchanged, which
step does the move: M2.4b or M4.2); the plot component for sweeps, TDR and S-parameters (generalise the Smith chart's
`lib/smith/plot.ts` pattern into a shared plot, or write one in `lib/emsim/`); pan and zoom of the drawings; three.js
loading as `components/Viewer3D/Viewer3D.tsx` does it; the theme tokens to reuse; WebGPU type declarations (D12); the
first-load size budget of the page.

**Writes:** notes-M0.5.md with each decision and the step that carries it out.

**Done when:** each item has a decision and a step.

## M1 – Static engine (`lib/emsim/`, harness only)

### M1.1 – Model, presets, KiCad reader, link · M

`lib/emsim/`: units and conversions; stackup types with tolerances and sources (engine.md §2); JLCPCB presets from
facts.md; the KiCad reader (stackup from `.kicad_pcb` through `lib/pcb/kicad/sexpr.ts`, net classes from
`.kicad_pro`); structure types and presets (§3) and their geometry (polygons tagged with material, the mask following
the copper); via structure types; the link and project-file form (versioned, reading never throws). The harness
`scripts/harness/emsim/` (package.json, `npm run check` with a summary table) and `modules.md`.

**Done when:** the owner's two boards' stackups and net classes read as facts-cases.md says; KiCad samples of the
versions in `docs/pcb-viewer/test-files.md` read or are refused with a reason; every preset's geometry passes the
invariants (no overlap, mask thickness rules, layers in order); link and project round trips are exact.

### M1.2 – 2D boundary-element core · L

The solver of solver.md for any number of conductors: C, C0, L, Z0, εeff for one conductor, the matrices for several,
the error estimate by refinement, dense linear algebra in `lib/emsim/linalg.ts`. Starts from the M0.3 spike.

**Done when:** every exact case of facts-cases.md within 0.05 % (or the error solver.md set) with the measured
convergence order; C and L symmetric to 1e-12 relative; results unchanged by translating or mirroring the structure;
homogeneous identities hold (εeff = εr, L independent of the dielectric); budgets of engine.md §10 met in Node.

### M1.3 – Modes, target, sweeps, tolerance · M

The modal decomposition and every impedance and coupling of engine.md §4 with facts.md's definitions (degenerate modes
safe), the inverse solver, sweeps, corners, Monte Carlo with a fixed seed, the sensitivity ranking.

**Done when:** Cohn's coupled stripline exact within the M1.2 bar; Zdiff = 2·Zodd and Zcm = Zeven/2 on symmetric pairs
to rounding; an asymmetric pair gives the definitions facts.md lists; inverse solves round-trip to 1e-6 of the target;
Monte Carlo deterministic; budgets met.

### M1.4 – Independent check and calculator formulas · M

A fresh agent that **does not read** `lib/emsim/` solver files (only engine.md §3–§4, facts.md, solver.md's design of
the reference): writes the finite-difference reference solver in `scripts/harness/emsim/fd/` (non-uniform grid,
Richardson extrapolation, its own error estimate), the closed-form calculator formulas in `lib/emsim/closedform.ts`
(product code, used by the calculator comparison of M2.3), and a fuzz check of at least 500 random structures (single,
pairs, mask, coplanar, stripline, asymmetric) against the boundary-element solver. Fills the "this tool" column of the
validation table in facts-cases.md and writes the explanation of every difference to JLCPCB and to the closed forms.
Differences beyond the bar are reported, not fixed: the main session briefs a fix agent.

**Done when:** the fuzz agrees within the two solvers' combined error estimates (outliers explained); closed forms agree
with the field solver within their published accuracy inside their stated ranges; the validation table is filled.

### M1.5 – Fields and the static worker · M

Fields of engine.md §9 from the stored solution (φ, E, D, H, charge and current density, mode combinations), on grids
progressively and only where asked; field lines and equipotentials; the colour map; the static worker and its client
(cancel, cache by hash) per §10.

**Done when:** fields match exact coax and two-wire fields to 1e-4 away from the copper; Gauss's law around each
conductor gives its charge to the solver's error; φ on conductors equals their potential; the field-map budgets met.

### M1.6 – Axisymmetric solver and via cut · M

The solver of engine.md §5 and the via cut of §6.2 (barrel or pair with return vias, through the 2D core).

**Done when:** exact cases pass (coax, isolated disk 8ε0a, sphere, coax with a plane gap if facts-cases.md has one);
the quasi-coaxial barrel with N return vias matches facts.md's formula where it is exact and the 2D core where it is
not; pad and antipad capacitances match the published cases of facts-cases.md within their stated accuracy.

### M1.7 – Via model, TDR and the N-port type · M

The model of engine.md §6: segments, pads, stubs and backdrill, feed traces, the cascade (2-port, 4-port and
mixed-mode), TDR/TDT, validity flags, the target for antipad or return-via distance, the N-port type of §8. First
comparison against M0.4's openEMS via fixture (reported, not a pass bar yet; M6.4 sets the bar).

**Done when:** a uniform line's TDR equals its Z0; a lossless cascade is passive and reciprocal to 1e-12; stub resonance
at the facts.md frequency; every validity flag fires on a constructed case and not on a good via; budget ≤ 30 ms.

## M2 – Trace page and release

### M2.1a – Page shell and stackup · M (page)

`pages/em-sim/main.tsx` (Head, home link, `getStaticProps` for the references), `components/EmSim/EmSimTool.tsx`
(state, link, undo), the design pass (tokens, both themes, the section nav), the Stackup section: a table with each
value's source and tolerance, the stackup drawn to scale with an exaggeration switch, presets, open or drop a
`.kicad_pcb` / `.kicad_pro`, units. Harness `npm run ui` started. No card yet.

**Done when:** the owner's board opens and shows its stackup and net classes; the link restores everything; 320, 390
and 1440 px in both themes look right; first-load size within M0.5's budget.

### M2.1b – Cross-section editor and results · L (page)

The Trace section: structure presets and the general editor (add traces, grounds, planes), the cross-section drawn to
scale with drag handles for widths, gaps, positions and heights (mouse, touch, keys), the results panel (Z0 or Zdiff,
Zcm, Zodd, Zeven, εeff, delay, the matrices on demand, the error, flags, the definition used) through the static
worker with the stale state.

**Done when:** a drag updates the result within engine.md §10's budget at 1× and 4×; every preset opens with sensible
start values; the owner's `50R_SE` and `LVDS_100R` open from their board as structures; keyboard and touch do every
task; screenshots in both themes at both widths.

### M2.2 – Field view · M (page)

The field map over the cross-section: quantity (φ, |E|, field lines, H, charge and current on copper), mode (even, odd,
differential, common, one line driven), the probe readout, the colour scale, pan and zoom of the view.

**Done when:** fields follow a drag within budget; the map is legible in both themes; the probe works by hover, keys and
tap; no main-thread frame over budget at 4×.

### M2.3 – Target, sweep, tolerance, calculators · M (page)

The target (width, or width and gap, for a Z0 or Zdiff), sweeps of any input with the plot of M0.5, the tolerance band
and sensitivity ranking, and the calculator comparison: the closed forms of `closedform.ts` (with their range shown,
out of range marked), JLCPCB's number where facts-cases.md has one, and for each difference the line from facts.md
that explains it.

**Done when:** the owner's two cases show their target width, tolerance band and the comparison with each difference
explained; sweeps draw as they go and cancel; touch and keys.

### M2.4a – First theory (content) · M

`theory.md` topics: the transmission line and quasi-TEM; how the field solver works and what its error means;
single-ended and differential (modes; Zodd, Zeven, Zdiff, Zcm; coupling); microstrip, stripline and the solder mask;
why calculators and fabs disagree; tolerances and what matters most. The short line beside every control and readout.
`claims.md`: every factual sentence with its source. No code.

**Done when:** every claim has a source or a derivation; every number in the text is checked against the engine.

### M2.4b – First theory (page) · M (page)

The Theory and References sections with live numbers from the current structure, figures, citations through
`getStaticProps` and `Bibliography`, the short lines and "→ theory" links; the shared equation modules if M0.5 put the
move here.

**Done when:** every short line links to its topic; live numbers follow the editor; `/em-sim/main` builds as a static
page; the Smith chart's `npm run recheck` passes if shared modules moved.

### M2.5 – Release · S

The card on the main page (`TOOLS` in `pages/index.tsx`, an icon in `components/Home/ToolIcon.tsx`), README, CLAUDE.md
lines, the status note (`components/EmSim/Status.tsx`), `npm run ui` on a production build. The main session merges to
`main`. **Owner checkpoint 1.**

## M3 – Vias on the page

### M3.1 – Via editor · L (page)

The Via section: the side view to scale (stackup slice, barrel, pads, antipads, planes, stub or backdrill) and the top
view (return vias, pair pitch, antipad shapes, feed trace directions), both with drag handles (add, move, remove return
vias), the results (segment impedances, pad capacitances, stub resonance, flags with their numbers), the link.

**Done when:** the owner's LVDS via pair opens from facts-cases.md's values; every drag updates within budget; touch and
keys; both themes and widths.

### M3.2 – Via plots, fields, target · M (page)

TDR/TDT plot with the rise-time control, S11/S21 (and mixed-mode for pairs) in dB against frequency, the feed traces'
impedance in the same TDR, the top and side field maps, the target for antipad or return-via distance. **Owner
checkpoint 2** (the owner may reorder M4–M8 or move a part to phase 2).

**Done when:** a via with a feed trace on each side gives a TDR whose flat parts equal the traces' Z0; plots linked by a
shared cursor; fields legible.

## M4 – Teaching layer (D7)

### M4.1 – Content: vias, equations, examples · M

Theory topics for vias (the via as a line, pads and antipads, the return path and stitching vias, stubs and backdrill,
reading a TDR); the equation list (registry entries for every displayed relation, with derivation steps); worked
examples from the owner's boards (the 50 Ω carrier trace, the LVDS pair and its via, JLCPCB's adjusted widths
explained) with links that open each state; claims. No code.

### M4.2 – Equation layer engine · M

The registry entries and derivations of M4.1 in the shared equation modules (or `lib/emsim/` per M0.5), the harness
check that every equation equals the engine on random inputs, the examples as data.

**Done when:** every equation evaluates equal to the engine within 1e-9; every derivation step checks.

### M4.3 – Equation layer on the page · L (page)

The equation panel beside the results with the live numbers, the derivation dialog, the Examples section with its
links, the via theory on the page.

**Done when:** every number in the results has an equation one click away; examples open their states; keyboard,
touch, both themes.

## M5 – 3D view

### M5.1 – 3D view · M (page)

three.js loaded with `await import` when the view opens: the via structure and feed traces, planes with antipads (cut
away), dielectric layers translucent, orbit, zoom and touch, the static field on the top and side cut planes, a PNG of
the view.

**Done when:** the view opens within 1 s on the laptop, orbits at 60 fps, works by touch at 390 px, and the page's first
load does not grow.

## M6 – Full-wave engine (`lib/emsim/fdtd/`, harness only)

### M6.1 – Mesh, materials, ports, estimator · M

The graded mesh from a trace or via structure, materials on the mesh, PEC sheets and volumes, ports and feed lines,
CPML set-up, the estimator's static part (cells, steps, memory), the f64 reference kernel for small cases.

**Done when:** mesh invariants (grading ratio, every copper edge on a line, smallest cell, Courant step) pass on every
preset; the estimator's memory within 10 % of the allocated buffers.

### M6.2 – CPU FDTD and post-processing · L

The JavaScript backend in the full-wave worker: Yee update, CPML, sources and ports, DFT to S-parameters, TDR,
snapshots, energy monitor, cancel and progress.

**Done when:** parallel-plate cavity resonances within the mesh error; a uniform microstrip's TDR impedance within 1 %
(or fullwave.md's bar) of the 2D solver's Z0; a matched port's S11 under −30 dB; reciprocity S21 = S12; energy constant
without sources.

### M6.3 – WebGPU backend · L

The WGSL kernels and their host code per fullwave.md (adapter limits, buffers per component, split dispatches,
snapshot readback), the calibration run of the estimator, the fallback to the CPU backend.

**Done when:** WebGPU and CPU agree on M6.2's cases within the f32 bar of fullwave.md; the 2 M-cell via run's time is
within 2× of the estimate; a lost device or missing adapter falls back with a message.

### M6.4 – Verification against openEMS and the via model's range · M

openEMS fixtures for the via cases (single and pair, with and without return vias, stub and backdrill) and two trace
cases; the comparison table quasi-static ↔ FDTD ↔ openEMS (impedance, TDR, S11, S21); limits frozen from it; the via
model's validity flags tuned to where it is measured to fail, recorded in facts.md.

**Done when:** FDTD within the frozen limits of openEMS on every fixture; the table and the flag thresholds are in
`fullwave.md` and the notes.

## M7 – Waves on the page

### M7.1 – Runs and the 2D player · L (page)

The Waves section: the structure from the Trace or Via section, the estimate (cells, memory, time, backend), run,
progress and cancel, the results (TDR and S-parameters overlaid with the quasi-static ones), and the animation player on
a 2D slice (slice and component choice, play, pause, scrub, speed, fixed colour scale), also on a phone.

**Done when:** the owner's LVDS via runs to the end on the laptop with WebGPU and on the JavaScript fallback within the
estimate; the animation plays smoothly at 1440 and 390 px; cancelling frees the GPU memory.

### M7.2 – Waves in 3D, modes, theory · M (page)

The animation on cut planes in the 3D view, differential and common-mode excitation of pairs, the theory topic on
full-wave simulation and what the animation shows (content and page, with claims).

**Done when:** the 3D animation plays at the 2D player's frame rate; the topic's claims are sourced.

## M8 – Export and report

### M8.1a – Figure model, SVG, PNG, TikZ (harness only) · M

One figure model for the stackup, the cross-section and the via views (and field maps as images) that makes the SVG,
the PNG and **TikZ** as the Smith chart's D18 does (sizes, colour modes, `\linewidth`); compiled by the harness with
TeX Live. TikZ confirmed by the owner (2026-11-16, D16).

### M8.1b – Export section (page) · M (page)

The Export section with a true-size preview, the figure options, Copy and Save.

### M8.2 – Data, project file, report · M (page)

CSV (results, sweeps, TDR), Touchstone (`.s2p`, `.s4p` from the via model and full-wave), the project file (versioned
JSON, open by picker or drop, one undo step), Copy link, and the report with a print layout (A4 and Letter, light
colours, vectors).

## M9 – Polish and re-checks

### M9.1 – Access, browsers, touch · M

Every task by keyboard alone and by touch; names, roles, contrast (WCAG AA in both themes), reduced motion, 200 % zoom;
Edge, Firefox and WebKit, with what each offers for WebGPU and the fallback's message where it is missing.

### M9.2 – Performance, size, memory · M

engine.md §10's budgets on a production build at 1× and 4×; the first-load budget; a 10-minute session with full-wave
runs without growing memory (GPU buffers freed).

### M9.3 – Docs and re-check · S

`howto.md` for visitors; README, CLAUDE.md and BACKLOG tidied; `npm run recheck` runs every earlier "done when" and
prints one table; a fresh reading of the status note, short lines and claims. **Phase 1 done**; phase 2 waits for the
owner ([later.md](later.md)).
