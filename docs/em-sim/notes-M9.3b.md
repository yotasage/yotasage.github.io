# Notes from step M9.3b – how-to, a fresh reading, docs tidied (2026-11-17)

The last step of phase 1 (milestones.md M9.3, split note). **Phase 1 is done**; phase 2 ([later.md](later.md)) waits
for the owner.

## What was done

- [howto.md](howto.md) for visitors, after the Smith chart's: what the page does, a quick start, each section's tasks
  (stackup and JLCPCB's stackups, KiCad files, trace and its results and fields, Target, Sweep, Tolerance with Monte
  Carlo, Calculators, the via and its drawings, 3D, plots and target, the full-wave run, player and 3D waves, export,
  data, project and report, examples, theory and equations), **when to trust a result** (the 2D solver against exact
  cases and the finite-difference solver, JLCPCB's calculator, the via model's range against full-wave, the full-wave
  runs against openEMS, from notes-M1.4a-fix.md, notes-M1.4c.md and fullwave-verify.md §3–§4), browsers and devices
  (notes-M9.1b.md), limits.
- A fresh reading of the status note, the short lines, the theory and the claims (below). A read-only review agent read
  claims.md against the four theory components and the theory-*.md sources and recomputed the via numbers with
  `viaModel`; each finding was checked against the engine here before it was changed (10 GHz values interpolated between
  the 9.96 and 10.07 GHz grid points, as examples.ts's checked values are).
- README's EM row rewritten (current, links howto.md); CLAUDE.md's EM paragraph rewritten as the Smith chart's finished
  one, and howto.md in its Docs list; plan.md "State at the end of phase 1", howto.md in the files table, M9 done;
  later.md's head says phase 1 is done.
- `docs/BACKLOG.md`'s EM rows tidied: in descending id order; BL185 done (M9.1a gave the Via 3D view its keys);
  merged: BL122 → BL89, BL117/BL123/BL130 → BL102 (and BL103's settings part), BL169 → BL114, BL161/BL173 → BL142,
  BL164 → BL146, BL152 → BL149, BL196 → BL179; BL141 and BL160 cut to what is left; every open row names its trigger;
  phase 2 rows BL69–BL75 "waits for the owner"; BL99, BL101, BL115 marked as the recheck's known misses. 177 → 166 rows.
  No new id (next free: BL203).

## The status note

**Before:** lead "New and still growing."; a 20-line list of features; "Not here yet: a how-to and a re-check of every
result; they come next. Full-wave runs use the graphics card through WebGPU where the browser offers it, and the CPU
(slower) where not."

**After** (`components/EmSim/statusText.ts`):

- Lead: "New, with everything planned for now in place."
- Now: traces, vias, full-wave runs, theory and exports in five sentences.
- Checked: "Checked by automated tests against exact solutions, a separate finite-difference solver on hundreds of
  random structures, JLCPCB's own calculator (within about 0.3 %) and, for vias and full-wave runs, openEMS, a separate
  full-wave solver; and the page in Edge, Firefox and Safari's engine, by keyboard and by touch, and for its speed and
  memory. The numbers are a careful estimate; for an order, your board house's own figures have the last word."
- More, assumes: as before, plus "(the Via section says up to which frequency)".
- More, left out: "Not here: losses and how εr changes with frequency, reading routed boards, simulating drivers and
  receivers in time, and measured data; they may come later. On a slow device a drag can fall a little behind the
  pointer. Full-wave runs use the graphics card through WebGPU where the browser offers it (Edge and Chrome, for
  example), and the CPU, often a hundred times slower, where not."

## Stale or wrong texts, before → after

**Short lines** (`whys.ts`, theory-lines.md):

- nav: "Jump to Stackup, Trace, Via, Export, the worked Examples or Theory." → "… Via, Waves, Export, the worked
  Examples, Theory or References." (title with Waves and References too).
- status: "Work in progress" / "What the page does so far and what comes next." → "Status" / "What the page does, how
  it is checked and what it leaves out."
- tanδ: "Loss of the material; kept for later, not used by the impedance." → "Loss of the material: the full-wave runs
  use it, the quasi-static impedance does not." (fdtd/model.ts F_TAN; claim 311).

**Theory (page and theory*.md):**

- Topic 0 described the trace only. Now "a trace or a via", and three items: Via, Waves, Keep (export, report,
  examples). No claim numbers of their own (they say where things are).
- Topic 1: "This version leaves out dispersion, losses, copper roughness and how εr changes with frequency; they are
  planned for later." → "The quasi-static results leave out …. The full-wave runs (topic 14) take in the structure's
  own dispersion and the laminate's loss at one frequency, but not how εr and tanδ change with frequency." (claim 27's
  row adds fullwave.md §3).
- The foot of the Theory section: "The waves on a line and through a via, from a full-wave run, follow in later
  versions." → removed (topic 14 is there).
- Topic 7 (pair): "… 83.49 Ω differential and 36.63 Ω common, 12.59 ps." → adds "; with 0.11 mm feeds over the openings
  (example 3) it reads 89.08 Ω, 48.09 Ω and 13.43 ps." (as the single via's sentence does since M6.5).
- Topic 8: "… k12 = 0.274, and flags it until a full-wave check." → "… and marks it as an estimate: a full-wave run of
  the pair takes the pads' coupling in fully." (M6.4's pair fixture shares one antipad and could not measure k12,
  fullwave-verify.md §4.) The Via section's assumption "… not yet checked." and engine.md §6, solver.md's "flagged until
  M6.4 checks it" say the same.
- Topic 10 (numbers from before M6.5, without the feed): "The 0.6/0.3 via leaving on L3 has …, where |S21| falls to
  −48.6 dB" → "… leaving on L3, with its 2 mm feed on L1, has …, −51.7 dB" (engine: −51.68 dB at 21.77 GHz; −48.40
  without the feed); "at 10 GHz the stub cost 0.68 dB of transmission, the backdrilled via 0.07 dB" → "0.60 dB … 0.10
  dB" (as example 5's checked values).
- Topic 12: "S11 −33.4 dB and S21 −0.002 dB at 10 GHz, S11 −17.3 dB at 25 GHz" (the via without the feeds' runs over the
  antipads) → "S11 −18.0 dB and S21 −0.07 dB at 10 GHz, S11 −5.0 dB at 25 GHz; most of the reflection comes from the
  feeds' runs over the antipads." (engine: −17.98, −0.070; −5.02 at 25.02 GHz; without the runs −34.4, −0.0016.)
- Topic 14: "On the default via, before the via model took the feeds' runs … in, it read the via's section at 49.7 Ω;
  … the model now reads 67.9 Ω." → "On the 0.6/0.3 via of the openEMS comparison (its section between 3 mm feeds), …"
  (the Via section's default reads 69.38 Ω with its 2 mm feeds; 67.9 is the comparison's).

**Equation dialog** (`equationsVia.ts`, `equationsLines.ts`: derivations and assumptions are shown): step ids and doc
file names removed: "(facts-formulas.md §7)", "(step M6.5)", "(notes-M1.7.md, the wall)", "(engine.md §6.3)", "an
estimate (flagged until M6.4)" → "an estimate, not measured on its own; a full-wave run of the pair takes the coupling in
fully", "(facts.md §2)", "(facts-formulas.md §8)", "(facts.md §5)", "the full rule in solver.md, section 2.6",
"notes-M0.2e.md item 2: two 50 Ω sources …" → "Two 50 Ω sources …".

**Docs only:** theory-vias.md's live-number column "[Ø1.7583 mm for 50 Ω]" → "[Ø1.048 mm]" (claim 151); examples.md
example 5: "|S21| falls to −48.6 dB" → −51.7; "S21 is −0.07 dB and S11 −16.3 dB (−18.0 without the feed)" → "−0.10 dB
and −16.3 dB (−0.08 and −17.5 dB without the feed)"; "E without it" → "without it" (E is defined with the feed).

**Claims rows** brought to the text: 78 (no ui-trace check of `data-trace-masked`; the row names ui-why's line), 142
(50.229 Ω is without the feeds' runs; with them 69.38 Ω, 18.72 ps), 171, 175, 184, 193, 196, 226, 236, 240, 241. The
claim count (313) and numbering are unchanged.

Checked and fine: every decimal in the four theory components is in its source; openEMS limits (43, worst 0.82) as
fullwave-verify.md §3; "five worked examples"; the GPU/CPU times of claim 281; every harness file a claim names exists.

## Checks

- `npx tsc --noEmit` clean. `npm run check`: 54 212 checks, none failed (lib/ changed: the equation texts and a
  comment).
- `npm run ui` (its build stopped once on Next.js's security notice and passed when run again): 27 of 28 scripts
  passed on the first run, among them ui-why 142, ui-theory 182, ui-release 35, ui-equations 341, ui-examples 103,
  ui-perf 17 and ui-session 11. ui-browsers failed once on one WebKit access check (opening the Z0 equation by keys
  timed out after 15 s; that equation's text did not change) and passed alone against the same build: 62 of 62,
  ui-access 218 of 218 in Firefox and WebKit. First load 187.3 kB gzip (≤ 200).
- Screenshots of the status note at 390 dark (ui-release) and at 1440 light with "More" open, looked at: the note
  reads in both, nothing cut, the nav shows every section.

## Left out

- Topic 0's new items have no claims of their own.
- The pair preset's feeds over its return vias (BL142) stay as they are; the Waves section warns before a run.
