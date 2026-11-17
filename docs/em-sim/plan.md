# EM simulation – plan

A tool at `/em-sim/main` that computes **the impedance of PCB traces and vias, single-ended and differential, from field
solvers**, and **shows the fields**: in the cross-section, around a via, in 3D and as animated waves. It runs entirely in
the browser like the rest of the site.

The owner designs controlled-impedance boards (LVDS pairs, 50 Ω single-ended nets) and orders them from JLCPCB. Online
calculators disagree with each other and hide their assumptions; this tool should be the one the owner trusts, because
every number comes from a solver that is checked against exact solutions and an independent solver, states its
assumptions and its error, and can be followed to its theory. The owner **does not read code or diffs**: a step is
judged by the harness and by how the page behaves and looks. Code is written the best way possible and **performance is
never traded for readability**.

Drafted 2026-11-11 by Sonnet 5.5 (v1, v2: `.local/EM simulation/`, private to the owner's machine), reviewed and
reworked 2026-11-16 (step M0.1, [notes-M0.1.md](notes-M0.1.md): what changed from v2 and why, the owner's answers).
Where this plan and [CLAUDE.md](../../CLAUDE.md) or [agent-workflow.md](../agent-workflow.md) disagree, those two win.

## Files of this plan

Read only the files and sections a brief names. Every file stays under 40 kB; split before.

| File | What |
| --- | --- |
| [plan.md](plan.md) | This index: goal, decisions, ground rules, design direction, milestones and status, running a step, quality bar, risks |
| [milestones.md](milestones.md) | Every step of phase 1: scope, files, size, "done when" |
| [engine.md](engine.md) | The shared model and the contract of each solver: frames and units, stackup, structures, the 2D solver, the via model, full-wave, fields, results and validity, workers, budgets |
| [later.md](later.md) | Phase 2 and beyond, kept from the v2 draft: losses, board import and net analysis, time domain, IBIS, PDN, measurement import; planned in detail only when the owner says so |
| [notes-M0.1.md](notes-M0.1.md) | The review of v2, the owner's answers of 2026-11-16, reference material found on the owner's machine |
| `facts.md`, `facts-cases.md`, `sources.md` | Written by M0.2: definitions and conventions with sources, numeric reference cases, what each source may be cited for |
| [literature.md](literature.md) | Written by M0.2d: papers on the 2D solver, pair definitions, calculators and vias, verified on Crossref and read from their abstracts only, with the step each is for and which to open; M0.2e added "Findings with numbers", each marked whether its abstract states it |
| `solver.md`, `solver-fd.md`, `fullwave.md` | Written by M0.3 and M0.4: the decided formulations, spike measurements, the harness's reference solvers (`solver-fd.md`: the finite-difference solver M1.4 builds; M0.5 writes only its notes) |
| `modules.md` | From M1.1: the module map, one line per file with its main exports (split into `modules-page.md`, `modules-page-via.md`, `modules-page-waves.md`, `modules-page-teach.md`, `modules-page-checks.md` and `modules-harness.md` before 40 kB) |
| `theory*.md`, `claims.md` | From M2.4: the Theory section's topics and the claims checklist |
| `theory-vias.md`, `equations-list.md`, `examples.md` | From M4.1: the via topics (§7–§13), every displayed relation with its derivation steps (61 ids), the worked examples with their links |
| `theory-waves.md` | From M7.2c: the topic on full-wave runs and the waves (§14, `full-wave`, ten sub-anchors), its claims 242–313 and nine equations (70 ids in equations-list.md) |
| `notes-<step>.md` | What a step left for later steps (under 6 kB each) |

## Goal

What phase 1 lets a person do:

1. **Describe the board.** Enter a stackup, pick a JLCPCB preset, or open a `.kicad_pcb` (and `.kicad_pro`) to take its
   stackup and its net classes' widths and gaps.
2. **Trace impedance.** For any trace cross-section (microstrip with solder mask, embedded microstrip, stripline,
   asymmetric stripline, coplanar with or without ground, edge- and broadside-coupled pairs, or any arrangement of
   traces and planes on the stackup): Z0, Zdiff, Zcm, Zodd, Zeven, εeff, delay, L and C matrices, crosstalk
   coefficients, with the solver's error, a tolerance band and which input moves the result most.
3. **Hit a target.** Find the width (or width and gap) for a target impedance; sweep any input.
4. **Via impedance.** A single or differential via between any layers, with pads, antipads, return vias, stub or
   backdrill: the impedance of each barrel segment, the pads' capacitance, the TDR the via would show at a chosen rise
   time, S11 and S21, the stub's resonance, and the width of antipad or distance of return vias for a target impedance.
5. **See.** The fields in the trace's cross-section (potential, |E|, field lines, H, charge and current on the copper,
   even and odd modes), the via drawn from the side and from the top with its fields, the via structure in 3D, and
   **animated waves** from a full-wave (FDTD) run travelling along a trace or through a via, with the TDR and
   S-parameters that run gives.
6. **Understand.** As in the Smith chart: a Theory section with sources, a short line beside every control and readout,
   equations with the live numbers put in, derivations, worked examples (the owner's own boards), and a calculator
   comparison that says why closed-form calculators and JLCPCB differ from the field solver.
7. **Take it away.** Link, project file, CSV, Touchstone, SVG/PNG and TikZ figures, a printable report.

## Decisions

Settled with the owner on 2026-11-16 (D1, D6, D7, D10, D16) or in the review (M0.1). Changing one needs the owner.

| # | Decision | Why |
|---|---|---|
| D1 | **Phase 1 is impedance and fields of traces and vias** with every visual of the Goal, including animated full-wave waves. Losses, board import and net analysis, time domain, IBIS, PDN and measurement import are phase 2 ([later.md](later.md)), planned in detail only when the owner says so. | Owner, 2026-11-16 ("Impedance + fields" first, all four visuals). agent-workflow.md: smallest useful version first. |
| D2 | **2D quasi-static solver: boundary elements** (method of moments: charge on conductor surfaces and bound charge on dielectric interfaces), f64, TypeScript, in a worker. M0.3 decides the Green's function, the treatment of planes and of the infinite dielectric interfaces, panel grading and the error estimate. | From v2: unknowns only on boundaries (hundreds), so a solve is milliseconds and dragging, inverse solves, sweeps and Monte Carlo are nearly free; no volume mesh. |
| D3 | **The solver's result is the full L and C matrices** (and C0), from which every impedance, velocity and coupling coefficient follows by fixed definitions (facts.md). Modal decomposition, not scalar Z0, is the interface to every later model. | Microstrip is inhomogeneous: even and odd modes travel at different speeds; Zdiff and Zcm have more than one definition in use, and the tool states which it shows. |
| D4 | **Vias, quasi-static model:** the barrel between two reference planes is a line along z whose cut (barrel or barrels plus return vias) is solved by the D2 solver; pads and antipads at each plane crossing are a capacitance from an **axisymmetric** boundary-element solve (which also gives the side view's field); stubs are open lines; feed traces come from D2. These are cascaded in the frequency domain to S-parameters and a TDR at a chosen rise time. Each result carries validity flags (for example a segment with no return via near it, or a via long against the rise time) that point to the full-wave run. | Milliseconds, so the via can be dragged live. The quasi-static model is what textbooks and via calculators use; its limits are found by comparing with D5 and openEMS (M6.4) and stated on the page. |
| D5 | **Full-wave: 3D FDTD** (Yee scheme on a graded Cartesian mesh, CPML boundaries, lumped ports with feed lines, DFT to S-parameters, TDR, snapshots of field slices for the animation) of one structure at a time (a via with its feed traces, a trace or pair section), never a whole board. **WebGPU (f32) is the main backend, a JavaScript worker the fallback**; an estimator of cells, memory and time runs before every run and refuses what will not fit. FDTD is never the default model; it is the accurate check of the via model and the source of the animation. | Owner wants animated waves (2026-11-16); the same solver gives the via's full-wave TDR, so v2's level 2 (3D quasi-static PEEC) is not needed in phase 1. A WebAssembly kernel and the multi-thread service-worker shim of v2 are phase 2 if profiling asks for them. |
| D6 | **Visuals:** fields in cross-section (D2), via side and top views with their fields (D4), a **3D view** of the via structure with fields on cut planes (three.js, already self-hosted, loaded with `await import` only when the view opens), and the **animated waves** of D5 on cut planes, in 2D canvas and in the 3D view. | Owner, 2026-11-16 (all four picked). |
| D7 | **Teaching like the Smith chart:** Theory section with numbered claims and sources (claims checklist), short line and theory link beside every control and readout, equations as data with live numbers, derivations, worked examples. The Smith chart's equation registry, printer, evaluator and derivation dialog are made shared (not copied) if M0.4 finds them generic enough, with the Smith chart's `npm run recheck` still passing. | Owner, 2026-11-16 ("Like the Smith chart"). One equation system on the site, not two. |
| D8 | **Stackup as data:** every layer with thickness, εr and tanδ at a stated frequency, copper thickness (outer layers base plus plating), solder mask with three thicknesses (on laminate, over copper, between traces), etch trapezoid, and a tolerance on every number. Values say where they come from (preset with its date and source, KiCad file, typed). | The inputs are where calculators differ most (v2 §7.8); a value without a source cannot be explained. |
| D9 | **Board link in phase 1 is the stackup and net classes only**, read from `.kicad_pcb` (the `(stackup …)` block, read with the PCB viewer's S-expression reader `lib/pcb/kicad/sexpr.ts`) and `.kicad_pro` (net classes: track width, diff-pair width and gap). Net analysis of routed boards is phase 2, built on the PCB viewer's `Design` (KiCad, Altium, PADS, EAGLE). | The owner's own boards then open as presets in one step; route analysis is a large separate piece of work. |
| D10 | **openEMS is installed on the owner's PC by the harness steps** and used only offline, by the harness, to make reference fixtures (small JSON files with their provenance, kept in the repo). It is never shipped or loaded by the site. | Owner, 2026-11-16. GPL is fine for a tool on the owner's machine that the site does not contain. |
| D11 | **Independent checks:** exact solutions (coax, eccentric coax, two wires, wire over plane, Cohn's stripline and coupled stripline, parallel plates, homogeneous-dielectric identities), a **finite-difference Laplace solver written for the harness** by an agent that has not read the engine (Richardson-extrapolated), openEMS for vias and full-wave, and JLCPCB's numbers for the owner's boards as validation (differences explained, not forced). | The site's practice: quality from checks against independent computations (Smith chart, resistor lookup). |
| D12 | **No new runtime dependency in phase 1.** Dense LU and eigen-solvers in TypeScript; KaTeX and three.js are already on the site. WebGPU types: no `@webgpu/types` (M0.5): TypeScript 7's lib.dom already types the API; M6.3 declares the few flag constants it uses (`GPUBufferUsage`, `GPUMapMode`, …, missing from lib.dom) from the WebGPU spec in the GPU module. | Static, self-hosted site; the solvers are small enough to own. |
| D13 | **Names:** route, docs, branch `em-sim` (`/em-sim/main`, `docs/em-sim/`); code `emsim` (`lib/emsim/`, `components/EmSim/`, `styles/EmSim*.module.css`, `scripts/harness/emsim/`). Home card "EM simulation" in the category "Electronics". | Kebab-case route folders as the site's other tools; a code name without a hyphen for imports. |
| D14 | **Released early** (the Smith chart's D19): the tool goes to `main` with its card when M2 is done (trace impedance and fields), with a status note on the page that says what works, what is checked and how, and what is not done yet. Every later step keeps the note true and is merged when its checks pass, as the main session decides. Owner checkpoints are not gates, except that phase 2 waits for the owner. | The owner's time; a released tool stays honest. |
| D15 | **Touch and phone width from the start** for the editors, the field views and the players; the 3D view and full-wave runs work on a phone within its limits, which the estimator states. | The owner tests on a phone. |
| D16 | **TikZ export** of the stackup, cross-section and via drawings (field maps as embedded images), from one figure model that also makes the SVG, the PNG and the preview, as the Smith chart's D18 (sizes, colour modes, `\linewidth`), compiled by the harness (M8.1a). | Owner, 2026-11-16: "I do want TikZ export. No doubt." The owner writes reports in LaTeX. |

## Ground rules

- **The site's hard constraints apply** (CLAUDE.md): no server, self-hosted assets, nothing leaves the device, licence
  check for any new dependency. WGSL shaders are strings in the code; nothing is fetched from elsewhere.
- **The whole setup is in the link** (query string replaced without reloading, the resistor tool's pattern);
  preferences (theme, units, digits) in `localStorage`, read after mount.
- **Results update while typing and dragging**; there is no submit button except to start a full-wave run. Input that
  cannot be read says why; nothing is silently clamped.
- **Every number is honest:** units shown, the solver's error estimate beside it, digits no finer than that error and
  the tolerance band allow (engine.md §8), assumptions stated, validity flags with their numbers.
- **Keyboard and touch** for every main task; layouts work at 320 px width; nothing exists only on hover.
- **Nothing reaches `main` before M2.5** adds the card (CLAUDE.md: every tool has a card, no placeholder cards).
- **The owner's files are read where they are** and never copied into the repo (CLAUDE.md "Test files"); numbers taken
  from them go into `facts-cases.md` with their path.

## Design direction

The Smith chart and resistor lookup are the model for page structure, tone and the theme system
(`components/Resistor/`, `components/Smith/`, `styles/Resistor.module.css`): light and dark themes following the system
with a switch, colours as CSS variables on the tool's root, system UI type with tabular numerals, calm sections, a slim
section nav, short functional motion (none with reduced motion). **The drawings are the hero:** the cross-section and
the via are drawn to scale (with an exaggeration switch for thin layers) in the colours a PCB designer expects (copper,
laminate, mask, air), the field maps in a perceptually uniform, colour-blind safe colour map that reads in both themes.
Sections: Stackup · Trace · Via · Waves · Theory · Examples · Report · Export · References. M2.1a makes the design pass
and records the tokens in its notes.

## Milestones

One agent per step, one at a time, each started and checked by the main session (agent-workflow.md). Every step is in
[milestones.md](milestones.md) with its scope, size and "done when". The step that finishes updates the status column.

| M | Name | Steps | Result | Status |
|---|---|---|---|---|
| M0 | Research and set-up | M0.1–M0.5 | Plan reviewed; facts, cases and sources; solver formulations decided with spikes; full-wave decided and openEMS installed; shared site modules decided | Done 2026-11-16: M0.1–M0.5 (M0.2 in a–e, M0.4 in a–b); notes in notes-M0.*.md |
| M1 | Static engine (harness only) | M1.1–M1.7 | Stackup and structures, KiCad reader, 2D solver, modes, inverse and tolerance, independent checks, fields, via model | Done 2026-11-16: M1.1–M1.7 (M1.2 in a–c, M1.4 in a–b with a fix); notes in notes-M1.*.md; M1.4c done 2026-11-16, [notes-M1.4c.md](notes-M1.4c.md); M1.8a done 2026-11-16, [notes-M1.8a.md](notes-M1.8a.md); M1.8b done 2026-11-16, [notes-M1.8b.md](notes-M1.8b.md); M1.8c done 2026-11-16, [notes-M1.8c.md](notes-M1.8c.md) |
| M2 | Trace page, **release** | M2.1a–M2.5 | First usable tool: stackup editor, cross-section editor, results, fields, target and tolerance, calculator comparison, first theory; card on the main page | Done 2026-11-16: released (M2.5), [notes-M2.5.md](notes-M2.5.md); M2.1a done 2026-11-16, [notes-M2.1a.md](notes-M2.1a.md); M2.1b done 2026-11-16, [notes-M2.1b.md](notes-M2.1b.md); M2.1b-fix done 2026-11-16, [notes-M2.1b-fix.md](notes-M2.1b-fix.md); M2.1c done 2026-11-16, [notes-M2.1c.md](notes-M2.1c.md); M2.1d done 2026-11-16, [notes-M2.1d.md](notes-M2.1d.md); M2.2 done 2026-11-16, [notes-M2.2.md](notes-M2.2.md); M2.3a done 2026-11-16, [notes-M2.3a.md](notes-M2.3a.md); M2.3b done 2026-11-16, [notes-M2.3b.md](notes-M2.3b.md); M2.4a done 2026-11-16, [notes-M2.4a.md](notes-M2.4a.md); M2.4b done 2026-11-16, [notes-M2.4b.md](notes-M2.4b.md); M2.4c done 2026-11-16, [notes-M2.4c.md](notes-M2.4c.md); M2.4d done 2026-11-16, [notes-M2.4d.md](notes-M2.4d.md) |
| M3 | Vias on the page | M3.1–M3.2 | Via editor with side and top views, results, TDR and S-parameter plots, fields, target | M3.1a done 2026-11-16, [notes-M3.1a.md](notes-M3.1a.md); M3.1b done 2026-11-16, [notes-M3.1b.md](notes-M3.1b.md); M3.2a done 2026-11-16, [notes-M3.2a.md](notes-M3.2a.md); **Done 2026-11-16: M3.1a–M3.2b**, M3.2b [notes-M3.2b.md](notes-M3.2b.md) |
| M4 | Teaching layer | M4.1–M4.3 | Equations with live numbers, derivations, worked examples, the theory of vias | M4.1 done 2026-11-16, [notes-M4.1.md](notes-M4.1.md); M4.2 done 2026-11-16, [notes-M4.2.md](notes-M4.2.md); M4.3a done 2026-11-16, [notes-M4.3a.md](notes-M4.3a.md); M4.3b done 2026-11-17, [notes-M4.3b.md](notes-M4.3b.md). Done 2026-11-17: M4.1–M4.3b |
| M5 | 3D view | M5.1 | The via structure and trace in 3D with fields on cut planes | Done 2026-11-17: M5.1, [notes-M5.1.md](notes-M5.1.md) |
| M6 | Full-wave engine (harness only) | M6.1–M6.4 | Mesh, CPU and WebGPU FDTD, ports, S-parameters, TDR, snapshots; checked against analytic cases, the 2D solver and openEMS | Done 2026-11-17: M6.1–M6.4c. M6.5 done 2026-11-17, [notes-M6.5.md](notes-M6.5.md). M6.1 done 2026-11-17, [notes-M6.1.md](notes-M6.1.md); M6.2a done 2026-11-17, [notes-M6.2a.md](notes-M6.2a.md); M6.2b done 2026-11-17, [notes-M6.2b.md](notes-M6.2b.md); M6.3 done 2026-11-17, [notes-M6.3.md](notes-M6.3.md); M6.4a done 2026-11-17, [notes-M6.4a.md](notes-M6.4a.md); M6.4b done 2026-11-17, [notes-M6.4b.md](notes-M6.4b.md); M6.4c done 2026-11-17, [notes-M6.4c.md](notes-M6.4c.md), [fullwave-verify.md](fullwave-verify.md). |
| M7 | Waves on the page | M7.1–M7.2 | Full-wave runs with estimator, animation in 2D and 3D, full-wave against quasi-static | **Done 2026-11-17: M7.1a–M7.2d.** **M7.1 done 2026-11-17: M7.1a–M7.1b**; M7.1a [notes-M7.1a.md](notes-M7.1a.md), M7.1b (the 2D player) [notes-M7.1b.md](notes-M7.1b.md); **M7.2a done 2026-11-17** (a pair's differential and common drive in the player) [notes-M7.2a.md](notes-M7.2a.md); **M7.2b done 2026-11-17** (the waves on cut planes in the 3D view, one clock with the player) [notes-M7.2b.md](notes-M7.2b.md); **M7.2c done 2026-11-17** (the full-wave theory topic's content, [theory-waves.md](theory-waves.md), claims 242–313) [notes-M7.2c.md](notes-M7.2c.md); **M7.2d done 2026-11-17** (topic 14 on the page with live numbers, nine equations with their derivations, three figures, the Waves lines linked) [notes-M7.2d.md](notes-M7.2d.md); M9 next |
| M8 | Export and report | M8.1a–M8.2b | Figures (SVG, PNG, TikZ), data (CSV, Touchstone, project file), printable report | Done 2026-11-16: M8.1a–M8.2b, [notes-M8.1a.md](notes-M8.1a.md), [notes-M8.1b.md](notes-M8.1b.md), [notes-M8.2a.md](notes-M8.2a.md), [notes-M8.2b.md](notes-M8.2b.md) |
| M9 | Polish and re-checks | M9.1–M9.3 | Access, browsers and WebGPU support, performance and size, how-to, `npm run recheck` | **M9.1a done 2026-11-17** (access in Edge: keyboard, touch, names, contrast, reduced motion, 200 % zoom; [notes-M9.1a.md](notes-M9.1a.md), `ui-access.mjs`); **M9.1b done 2026-11-17** (the page in Edge, Firefox and WebKit: every feature and the access checks in each, the CPU fallback's message where WebGPU is missing and its run within the estimate, the via's layer labels fitted, a focus guard for engines that do not scroll a Tab stop into view; [notes-M9.1b.md](notes-M9.1b.md), `ui-browsers.mjs`); **M9.1 done**; **M9.2 done 2026-11-17** (engine.md §10's budgets at 1× and 4× in one table, the chunks by trigger, a 10-minute session's memory flat; fixed: closed 3D views kept their renderer, context and DOM, and a via model queued before the field map's first picture; [notes-M9.2.md](notes-M9.2.md), `ui-perf.mjs`, `ui-session.mjs`); M9.3 (docs and re-check) next |

**Owner checkpoints:** 1 after M2 (released: trace impedance and fields), 2 after M3 (vias; the owner may reorder M4–M8
or move a part to phase 2), 3 when the owner first uses the tool on a board of their own. None is a gate (D14); phase 2
is. **Order after checkpoint 2** (owner, 2026-11-16): **M8 (export) first**, then M4, M5, M6, M7, then M9. **Stopping points:** after any finished milestone from M2 on, since the tool is released. Never in the middle of a
milestone.

## Module map

From M1.1 in `modules.md` (and its parts): one line per file and its main exports; a step that renames or adds a file
updates it. Agents find their way by it instead of reading the code.

## Running a step

- Follow [agent-workflow.md](../agent-workflow.md): the brief names the files to read and the verification bar; stay
  under about 200k tokens of context (page steps: brief for about 150k); write a new file whole; chain shell commands.
  Heavy steps are split into research, code and check. **Engine steps check by harness only** (no dev server, no
  screenshots).
- **Harness:** `scripts/harness/emsim/` with its own `package.json` (`playwright-core`, `tsx`) and ignored
  `node_modules`, after `scripts/harness/smith/`. `npm run check` runs the engine checks and prints a short summary
  table; `npm run ui` builds, starts `next start` on port 3022 and runs the page scripts; openEMS scripts and their
  fixtures in `scripts/harness/emsim/openems/`. Screenshots from the installed Edge (`channel: 'msedge'`), 390 px and
  1440 px wide, both themes, downscaled to about 1,000 px, into the session's scratch folder, never the repo.
- **Reference tools on the owner's PC** (2026-11-16): Python 3.12 and 3.14 (`py`), MATLAB R2023a (no RF, PCB or PDE
  toolbox), KiCad 10 (`C:\Program Files\KiCad\10.0\bin\kicad-cli.exe`), Saturn PCB Toolkit (in `Program Files (x86)`,
  GUI only: the owner may give numbers from it), openEMS v0.37.0 in `C:\Users\Jonat\opt\openEMS` with its Python
  interface in the venv `C:\Users\Jonat\opt\openEMS-venv` (fullwave.md §14).
- **Done means:** the harness passes, `npx tsc --noEmit` and `npm run build` pass (then `git checkout --
  next-env.d.ts`), the code was read against the static-export constraints, page steps were looked at in both themes at
  both widths, and the step's `notes-<step>.md`, this file's status and `modules.md` are updated; from M2.5 also the
  card, README and the page's status note. Anything left out goes to `docs/BACKLOG.md` with the next free id.
- **Commits:** one per step on the branch `em-sim`, by the step's agent when its checks pass (message as CLAUDE.md's
  "Commits" says, files named explicitly, no push). From M2.5 the main session merges to `main` when a step's checks
  pass: `git fetch`, merge `origin/main` into `em-sim` if it moved, `npm install` if dependencies changed, re-check,
  `git push origin em-sim:main`, `git branch -f main em-sim`. **The branch `breadboard` is never touched** (CLAUDE.md
  "Waiting on").

## Quality bar

| Area | What it means here | How it is checked |
|---|---|---|
| Correctness | Every impedance within its stated error of the exact or refined reference; matrices symmetric and reciprocal; no NaN or ∞ shown | `npm run check`: exact solutions, the harness's finite-difference solver on hundreds of random structures, convergence order, symmetry and invariance checks |
| Honesty | Error, tolerance band and assumptions beside every result; differences to JLCPCB and to closed-form calculators explained | facts-cases.md validation table; the calculator comparison; text reviewed in M2.4, M4, M9 |
| Via models | The quasi-static model's range of validity known and stated; full-wave agrees with openEMS within frozen limits | M6.4's comparison table; validity flags tested on constructed cases |
| Performance | Dragging a dimension updates the impedance every frame on the laptop and within about 100 ms on a phone; fields and full-wave runs progressive and cancellable | Budgets in engine.md §10, measured by the harness on a production build, also with the CPU throttled 4× |
| Teaching | Any number can be followed to its equation, derivation, theory topic and source | M2.4, M4 "done when" lists; claims checklist |
| Looks | Drawings to scale, legible field maps in both themes, consistent with the site | Screenshots at 390 and 1440 px in both themes |
| Access | Main tasks by keyboard alone and by touch; names, roles, contrast, reduced motion | M2, M9.1 |

## Risks

- **Numbers wrong but plausible:** the reason for D11; the independent finite-difference solver is written without
  reading the engine, and JLCPCB's numbers are explained, not matched by tuning.
- **Infinite dielectric interfaces and planes in the BEM** (truncation error, slow convergence at corners): M0.3
  decides the formulation with a spike that measures the error against exact cases before M1.2 builds on it.
- **Degenerate modes** (a symmetric pair in a homogeneous medium has equal even and odd velocities): the modal
  decomposition handles equal eigenvalues; checked on stripline.
- **The quasi-static via model is only valid with a nearby return path:** validity flags with numbers, and M6.4
  measures where it fails against full-wave and openEMS.
- **FDTD staircasing of round barrels** (a few per cent in impedance) and f32 accuracy over long runs: M0.4 decides
  conformal cells or a fine graded mesh; WebGPU results are checked against the CPU backend in f64 on small cases.
- **WebGPU missing or limited** (older browsers, phones, adapter limits, GPU timeouts): feature detection, adapter limits
  requested, work split into dispatches, the JavaScript fallback with the estimator saying what is feasible.
- **Page size:** the static solvers in a worker, three.js and the full-wave code loaded only when their section is
  used; the first load budget is set in M2.1a.
- **Scope:** 36 agent steps (M0.2–M9.3), between the resistor lookup (7) and the Smith chart (about 45). Steps that grow past
  the context budget are split before they start, not during.
- **JLCPCB's data change** (stackups, εr): presets carry their date and source; the owner's order emails are the record.
