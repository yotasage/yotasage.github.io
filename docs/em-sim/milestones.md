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

**Split** (main session, 2026-11-16) into **M0.2a** (theory, definitions, exact and closed-form formulas, via formulas,
exact cases, sources) and **M0.2b** (JLCPCB, KiCad fields, the owner's cases and JLCPCB's numbers, the validation table).

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

**Split** (main session, 2026-11-16) into **M0.4a** (FDTD design, the harness's WebGPU runner, Yee spike in WGSL and JavaScript) and **M0.4b** (openEMS installed, fixture format, the first two fixtures).

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

**Split** (main session, 2026-11-16, after M1.1 overran its context budget) into **M1.2a** (correctness: panels from
the geometry, kernels, assembly, LU, C/C0/L/Z0/εeff, the error estimate; every accuracy, symmetry, invariance and
identity item below) and **M1.2b** (speed: the budgets of engine.md §10 in Node, by mirror symmetry, reuse between the
refinements and between dielectric and vacuum solves, a faster LU, and per-corner grading if it pays).
**M1.2c** (added after M1.4a-fix, 2026-11-16): per-corner grading from each corner's singularity exponent (BL79), so
triple points converge at second order and the honest error estimates of M1.4a-fix become tight again; the full fuzz
against the FD reference still clean, budgets kept.

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

**Split** (main session, 2026-11-16) into **M1.4a** (the finite-difference reference and the fuzz of at least 500
structures, by an agent that reads no solver code or solver notes) and **M1.4b** (`closedform.ts`, the closed forms
against the field solver, the validation table and the explanation of every difference).
**M1.4c** (added 2026-11-16 from the owner's numbers): reconcile the tool with JLCPCB. JLCPCB's online calculator gives
50 Ω at 5.42 mil and 100 Ω at 4.36/8 mil, its engineers kept the drawn widths within rounding (5.4 mil, 4.33/7.87 mil); this tool reads about 3 %
higher on both. Find which assumptions (mask model, εr, etch, copper thickness, definition) reproduce JLCPCB's numbers,
from JLCPCB's published parameters and the owner's screenshot of the online calculator (JLCPCB's confirmation form shows no εr, mask or etch); record it in
facts-cases.md and in what M2.3's calculator comparison says. Runs when the screenshots are in, or before M2.3.

A fresh agent that **does not read** `lib/emsim/` solver files (only engine.md §3–§4, facts.md, solver.md's design of
the reference): writes the finite-difference reference solver in `scripts/harness/emsim/fd/` (non-uniform grid,
Richardson extrapolation, its own error estimate), the closed-form calculator formulas in `lib/emsim/closedform.ts`
(product code, used by the calculator comparison of M2.3), and a fuzz check of at least 500 random structures (single,
pairs, mask, coplanar, stripline, asymmetric) against the boundary-element solver. Fills the "this tool" column of the
validation table in facts-cases.md and writes the explanation of every difference to JLCPCB and to the closed forms.
Differences beyond the bar are reported, not fixed: the main session briefs a fix agent.

**Done when:** the fuzz agrees within the two solvers' combined error estimates (outliers explained); closed forms agree
with the field solver within their published accuracy inside their stated ranges; the validation table is filled.

### M1.8 – All of JLCPCB's stackups (added 2026-11-16, owner) · S + a long fetch

The owner asked for every JLCPCB stackup as presets, fetched by our own harness script from the data behind JLCPCB's
impedance calculator (not copied from the unlicensed GitHub snapshot of 2025-05-09 that M0.2b used), **slowly: 2–3
requests a minute, 2–4 hours at least**, resumable, on the owner's PC only. **M1.8a:** find the requests, write the
fetcher (`scripts/harness/emsim/jlcpcb/`, cache in the ignored `.cache/`) and the converter to one dated data file in
`lib/emsim/`, test on a handful of requests. **The fetch** runs in the background (main session), in parallel with
other steps (owner, 2026-11-16). **M1.8b** (after the fetch, between page steps): convert, check every stackup's
invariants, load the list with `await import` only when the preset list opens, keep the first-load budget.
Split by the main session on 2026-11-16 (two jobs, engine and page): **M1.8b** (S–M, harness only): convert and commit
`lib/emsim/jlcpcbStackups.json`, a framework-free module that turns an entry into a `Stackup` with the presets'
conventions, `check-jlcpcb.mjs` in `npm run check` with every stackup's invariants, the ten hand presets moved onto the
API's values (checked equal to their entries), facts-cases rows re-checked. **M1.8c** (M, page): the preset picker
(layer count, thickness, copper, offer; the hand presets first), the data loaded with `await import` only when the
picker opens, a list stackup in the link (also opened from a fresh link), `ui-stackup.mjs` extended, the first-load
budget kept.

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

M0.5: copies the base theme tokens into `styles/EmSim.module.css` and adds `scripts/harness/emsim/size.mjs` (first-load budget) to `npm run ui`.

### M2.1b – Cross-section editor and results · L (page)

The Trace section: structure presets and the general editor (add traces, grounds, planes), the cross-section drawn to
scale with drag handles for widths, gaps, positions and heights (mouse, touch, keys), the results panel (Z0 or Zdiff,
Zcm, Zodd, Zeven, εeff, delay, the matrices on demand, the error, flags, the definition used) through the static
worker with the stale state.

**Done when:** a drag updates the result within engine.md §10's budget at 1× and 4×; every preset opens with sensible
start values; the owner's `50R_SE` and `LVDS_100R` open from their board as structures; keyboard and touch do every
task; screenshots in both themes at both widths.

M0.5: writes the pan-zoom controller `components/EmSim/panZoom.ts`, reused by M2.2 and M3.1.

**Split** (main session, 2026-11-16, page steps overrun their budgets) into **M2.1b** (the Trace section: structure
presets, the owner's net classes as structures, typed dimensions, the cross-section drawn to scale without handles, the
results panel through the static worker with the stale state) and **M2.1c** (drag handles for widths, gaps, positions
and heights by mouse, touch and keys, `panZoom.ts`, the general editor that adds traces, grounds and planes, the drag
budget at 1× and 4×).

**M2.1c split again** (main session, 2026-11-16, three jobs): **M2.1c** (`panZoom.ts`; pan and zoom of the
cross-section; drag handles for the preset structures' widths, gaps, coplanar gap and ground width, and the heights of
the dielectrics between the signal and its planes, by mouse, touch and keys, one undo step per drag; the drag budget at
1× and 4× measured by the harness) and **M2.1d** (the general editor: add, remove and move traces, grounds and planes of
a `general` structure, their handles, a preset turned into a general structure, the link round trip).

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

**Split** (main session, 2026-11-16, two jobs): **M2.3a** (the target: width, or width and gap, for Z0, Zdiff or Zcm
with "use this width"; sweeps of any input with the new framework-free `lib/emsim/plot.ts` of M0.5, drawn as they go
and cancellable; the tolerance band by corners and Monte Carlo with the sensitivity ranking) and **M2.3b** (the
calculator comparison: closed forms with their range, JLCPCB's number for the owner's cases, each difference explained
from facts.md and notes-M1.4c.md; the **"as JLCPCB's calculator"** setting: εr 4.3 for every prepreg, 1.6 mil outer
copper, a top 0.5 mil narrower than the base, mask 1.0/0.6/1.0 mil at εr 3.8, applied to the current stackup as a
named, reversible variant; the preset keeps JLCPCB's published guide values, main session 2026-11-16).

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

M0.5: moves the generic equation engine to `lib/equations/` and `lib/smith/complex.ts` to `lib/complex.ts` (old files re-export); the Smith subset to run is in notes-M0.5.md.

**Split** (main session, 2026-11-16, three jobs; M2.4a wrote 33 equations, 7 topics and 113 short lines): **M2.4b**
(harness only: the shared equation engine moved as notes-M0.5.md item 1a says, with the Smith checks it lists;
`lib/emsim/equations.ts` with the 33 equations of notes-M2.4a.md bound to engine values, and the new values they need;
a check group that every equation evaluates to the engine's number), **M2.4c** (page: the Theory and References
sections with live numbers, citations through `getStaticProps` and `Bibliography`, the figures, the status line) and
**M2.4d** (page: the 113 short lines beside the controls and readouts with their "→ theory" links, the Calculators
panel's links, the short-line harness).

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

**Split** (main session, 2026-11-16, two jobs, as M2.1): **M3.1a** (the Via section: the via typed in a form (layers,
drill, plating, pads, antipads with their shapes, planes, return vias as rows, pair pitch, backdrill, feeds), the side
and top views drawn to scale without handles, the results through the worker's `via` job with the stale state, the
flags with their numbers, the presets C44 and C45 and the link) and **M3.1b** (drag handles in both views: pad, antipad,
drill, pitch, backdrill depth; add, move and remove return vias by mouse, touch and keys; pan and zoom with
`panZoom.ts`; the drag budget at 1× and 4×).

### M3.2 – Via plots, fields, target · M (page)

TDR/TDT plot with the rise-time control, S11/S21 (and mixed-mode for pairs) in dB against frequency, the feed traces'
impedance in the same TDR, the top and side field maps, the target for antipad or return-via distance. **Owner
checkpoint 2** (the owner may reorder M4–M8 or move a part to phase 2).

**Done when:** a via with a feed trace on each side gives a TDR whose flat parts equal the traces' Z0; plots linked by a
shared cursor; fields legible.

**Split** (main session, 2026-11-16, two jobs): **M3.2a** (the plots: TDR/TDT with the rise-time control and the feed
traces in the same record, S11/S21 in dB and mixed-mode for pairs, `plot.ts`'s time axis and dB, the cursor shared
across plots of different x) and **M3.2b** (the side and top field maps of the via in the views' worlds, the probe, and
the target for antipad diameter or return-via distance). Owner checkpoint 2 after M3.2b.

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

M0.5: the registry is `lib/emsim/equations.ts` on `lib/equations/` (moved in M2.4b).

### M4.3 – Equation layer on the page · L (page)

The equation panel beside the results with the live numbers, the derivation dialog, the Examples section with its
links, the via theory on the page.

**Done when:** every number in the results has an equation one click away; examples open their states; keyboard,
touch, both themes.

M0.5: moves the derivation dialog's shell, `mathHtml` and `wide.ts` to `components/Equations/`; Smith `npm run check` and `npm run ui` pass.

**Split** (main session, 2026-11-16, L page step with two jobs): **M4.3a** (the shared dialog shell moved as
notes-M0.5.md item 1b says, with the Smith chart's checks; the equation panel beside the trace and via results with
live numbers, every result number one click from its equation; the derivation dialog) and **M4.3b** (the via theory
topics §7–§13 on the page with their figures and the via short lines re-linked; the Examples section with its links;
the status note).

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

**Split** (main session, 2026-11-17, two jobs): **M6.2a** (the time loop: Yee update with CPML ψ, conformal barrel
cells made stable (BL147), sources, the energy monitor; checks: energy constant without sources over a full run's
length, cavity resonances, CPML reflection) and **M6.2b** (ports and records, DFT to S-parameters, TDR/TDT, snapshots,
the full-wave worker with cancel and progress; checks: the microstrip's TDR impedance against the 2D solver, matched
S11, reciprocity).

### M6.3 – WebGPU backend · L

The WGSL kernels and their host code per fullwave.md (adapter limits, buffers per component, split dispatches,
snapshot readback), the calibration run of the estimator, the fallback to the CPU backend.

**Done when:** WebGPU and CPU agree on M6.2's cases within the f32 bar of fullwave.md; the 2 M-cell via run's time is
within 2× of the estimate; a lost device or missing adapter falls back with a message.

M0.5: no `@webgpu/types`; lib.dom types the API, the flag constants are declared in the GPU module.

### M6.4 – Verification against openEMS and the via model's range · M

openEMS fixtures for the via cases (single and pair, with and without return vias, stub and backdrill) and two trace
cases; the comparison table quasi-static ↔ FDTD ↔ openEMS (impedance, TDR, S11, S21); limits frozen from it; the via
model's validity flags tuned to where it is measured to fail, recorded in facts.md.

**Done when:** FDTD within the frozen limits of openEMS on every fixture; the table and the flag thresholds are in
`fullwave.md` and the notes.

**Split** (main session, 2026-11-17, compute and analysis): **M6.4a** (the openEMS fixtures: scripts for the via cases
— single and pair, with and without return vias, stub and backdrill — and the second trace case, the runs on the
owner's PC, JSON fixtures with their provenance in `scripts/harness/emsim/openems/fixtures/`) and **M6.4b** (the
comparison table quasi-static ↔ FDTD ↔ openEMS, the limits frozen, BL150 (FDTD εeff 4 % high) resolved or explained,
the via model's flag thresholds (BL92) set from the measurements and recorded in facts.md and fullwave.md).

**M6.4b split again** (main session, 2026-11-17: an engine fix and an analysis): **M6.4b** (BL150: our FDTD's εeff is
4.1 % above the 2D solver where openEMS is 0.9 % above on the same line, so the error is ours; find and fix it in the
conformal/material treatment, re-check M6.2b's microstrip and the GPU agreement) and **M6.4c** (the comparison table
quasi-static ↔ FDTD ↔ openEMS on every fixture, the limits frozen, the via model's flag thresholds (BL92) and BL90's
feed over the antipad, recorded in facts.md and fullwave.md).

### M6.5 – The via model corrected from the verification (added by the main session, 2026-11-17) · M

M6.4c measured two things the quasi-static via model gets wrong on the owner's own via: **BL90**, the feed trace over
its plane's antipad is a series inductance (0.02 / 0.09 / 0.21 nH per feed for 0.1 / 0.3 / 0.6 mm), and leaving it out
makes the C44 via read 49.7 Ω where openEMS gives 68.9 Ω; **BL165**, above about 15 GHz the plane cavity takes power, so
`valid.fMax` (λ/8, 29.5 GHz on C44) claims twice the band the model holds. Model the feed over the antipad in the via
model, give `valid.fMax` the measured cavity limit, and re-check against the openEMS fixtures and our FDTD.

**Done when:** the C44 via's section Z and TDR peak are within the frozen FDTD ↔ openEMS limits of openEMS (or the
remaining gap is explained with numbers); the model's band matches where it leaves the full-wave results; every check
and the page's numbers that moved are updated (facts-cases, examples, theory, short lines).

## M7 – Waves on the page

### M7.1 – Runs and the 2D player · L (page)

The Waves section: the structure from the Trace or Via section, the estimate (cells, memory, time, backend), run,
progress and cancel, the results (TDR and S-parameters overlaid with the quasi-static ones), and the animation player on
a 2D slice (slice and component choice, play, pause, scrub, speed, fixed colour scale), also on a phone.

**Done when:** the owner's LVDS via runs to the end on the laptop with WebGPU and on the JavaScript fallback within the
estimate; the animation plays smoothly at 1440 and 390 px; cancelling frees the GPU memory.

**Split** (main session, 2026-11-17, two jobs): **M7.1a** (the Waves section: the structure taken from the Trace or Via
section, the estimate with backend, cells, memory and time, run with progress and cancel through `FdtdClient`, the
results: TDR/TDT and S-parameters overlaid with the quasi-static ones, the notes and the "checked against openEMS"
limits, when to suggest a run (notes-M6.4c.md "For M7")) and **M7.1b** (the 2D animation player on a slice: slice and
component, play, pause, scrub, speed, fixed colour scale, phone width; cancel frees the GPU memory).

### M7.2 – Waves in 3D, modes, theory · M (page)

The animation on cut planes in the 3D view, differential and common-mode excitation of pairs, the theory topic on
full-wave simulation and what the animation shows (content and page, with claims).

**Done when:** the 3D animation plays at the 2D player's frame rate; the topic's claims are sourced.

**Split** (main session, 2026-11-17, three jobs; M7.1b alone took about 340k tokens): **M7.2a** (pair modes: the
differential and common-mode drive of a pair, its frames for the player as values (A − B, A + B, or one run driven with
opposite signs), a mode choice in the Waves section, the Sdd/Scc results unchanged), **M7.2b** (the animation on cut
planes in the 3D view, from the same frames and the player's clock, at the 2D player's frame rate) and **M7.2c** (the
theory topic on full-wave simulation and what the animation shows, with sourced claims).

## M8 – Export and report (next after M3: the owner moved it ahead of M4–M7 on 2026-11-16)

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

**Split** (main session, 2026-11-16, two jobs): **M8.2a** (data in the Export section: CSV of the results, sweeps,
TDR/TDT and S-parameters; Touchstone `.s2p`/`.s4p` from the via model; the project file saved and opened by picker or
drop as one undo step; Copy link) and **M8.2b** (the printable report: the setup, every result with its error, the
drawings from the figure model, A4 and Letter, light colours, vectors, `@media print`).

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
