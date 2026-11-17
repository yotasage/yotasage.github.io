# Notes from step M9.3a – `npm run recheck` (2026-11-17)

Step M9.3 was split by the main session: **M9.3a** (this step: `npm run recheck`, every earlier step's "done when" run
or read from its check, as one table, as the Smith chart's) and **M9.3b** (`howto.md`, README, CLAUDE.md and BACKLOG
tidied, a fresh reading of the status note, the short lines and the claims; phase 1 done).

## What was done

- `scripts/harness/emsim/recheck.mjs` and `npm run recheck` (`tsx recheck.mjs`; options in its head and in
  [modules-harness.md](modules-harness.md)). One run: `check.mjs`, the Smith chart's `check.mjs`, `next build` (run
  again once if it stops on Next.js's security notice, as it did in this run), `size.mjs`, `next start -p 3022`,
  `ui.mjs - --base` against that server (a script that fails is run once more alone, for BL145), the Smith chart's
  `ui-math`, `ui-math-link`, `ui-derive`, `ui-explain` and `ui-theory` against the same server (one retry each), the
  server stopped in `finally`. The output of each is kept (`<tmp>/emsim-recheck/recheck-logs/`, with `codes.json`) and
  parsed once; `--logs <dir>` parses a saved run again without running anything (how the parser was worked on).
- **Rows:** 69 steps, one per step of milestones.md M0.1–M9.2 with the split sub-steps (M0.2a–e, M0.4a–b, M1.2a–c,
  M1.4a–c, M1.8a–c, M2.1a–d, M2.3a–b, M2.4a–d, M3.1a–b, M3.2a–b, M4.3a–b, M6.2a–b, M6.4a–c, M7.1a–b, M7.2a–d, M8.1a–b,
  M8.2a–b, M9.1a–b), the fix steps M1.4a-fix and M2.1b-fix and M9.2's fix (M9.2-fix, notes-M9.2.md "Fix"). Each
  done-when is split into parts (135), each part names what checks it now. **The list is compared mechanically:** the
  ids of milestones.md's `###` headings, its bold sub-step ids and the `notes-<step>.md` files up to M9.2 (83 ids) must
  each have a row, or a parent its sub-steps' rows; a missing one fails the recheck.
- **How a part is checked:** a group of `npm run check` (pass when it ran without a failure; a group's note that says
  a part was skipped makes that part "not checked"), a UI script of `npm run ui` (with its check count), a row of
  ui-perf's budget table (its measured median / p95 and the verdict at 1× or 4×), `size.mjs`, the build, the Smith
  chart's checks, or a docs check made by the recheck itself: every `docs/em-sim/*.md` under 40 kB, facts-cases.md with
  ≥ 25 cases and the owner's C38–C43, claims.md numbered 1…N with a kind and a source on every row (a definition may
  have none), every year-style key in it in references.bib and its "In all" count equal to the table, references.bib
  parsed by `lib/bibtex.ts` with unique keys, README, CLAUDE.md and the card naming the tool.
- **Result kinds:** pass; fail; *known miss* (a fail with its backlog id: the 4× drag budgets BL99, BL101, BL115,
  which ui-perf reports and does not check; they do not set the exit code); *not checked* (with the reason and a
  backlog id); *recorded* (measured or read once, with where: the openEMS runs, our FDTD against every fixture
  (`compare-openems.mjs`), the JLCPCB fetch, the spikes, the decisions in solver.md and fullwave.md, screenshots looked
  at); *owner* (the two owner checkpoints).
- **Long runs** are not run without `--long`; their parts give the last recorded result from the notes:
  `EMSIM_FDTD_LONG` (M6.2a energy over 7 645 steps, M6.2b's 12 mm section and pair, M6.3's C44 runs to the cap),
  `EMSIM_WAVES_LONG` (M7.1a, C45 on the CPU), `EMSIM_SESSION_LONG` (M9.2, 10 minutes) and the FD fuzz of 500 structures
  (`fd/fuzz.mts`, M1.2c, M1.4a, M1.4a-fix; about 15 minutes). With `--long` they run and their parts are checked.

## The Smith chart and the resistor lookup

The EM recheck runs the Smith chart's engine checks (1 399 641, its "equations" groups among them) and its five browser
scripts on what the two pages share: `lib/equations/` and `lib/complex.ts` (moved in M2.4b), `components/Equations/`
(the derivation dialog, `mathHtml`, `wide.ts`, moved in M4.3a) and KaTeX's MathML. They run against the same production
server, so no second build. Its other 17 scripts and the resistor harness are not run: the EM page shares nothing with
them; the Smith chart's own `npm run recheck` (about 25 minutes) runs them, and its M1 keeps the resistor harness.

## This run

`npm run recheck` on this machine (Edge with WebGPU, the owner's dev server idle on 3020): 40 minutes. Engine checks
54 212, none failed (255 s); 28 of 28 UI scripts passed, none on retry (1 790 s); first load 187.6 kB gzip (≤ 200);
Smith chart check.mjs 1 399 641 passed, 4 of 5 scripts.

**Totals (135 parts):** 99 pass, 2 fail, 4 known misses, 2 not checked, 26 recorded, 2 owner.

- **Failures (2 parts, one cause):** the Smith chart's `ui-math.mjs` fails its timing check, the Equations panel's
  cost per drag frame at 4× CPU: +1.02 / +0.67 / +1.18 ms in its three attempts against 0.3 ms (and +0.96 ms run alone
  afterwards), with frames of 13.6–14.3 ms; its other 1 988 checks pass. It passed after M4.3a. Rows M2.4b and M4.3a
  ("the Smith chart passes with the shared modules") fail on it. BL202 (A/B to find what moved it).
- **Known misses (4):** the 4× drag budgets: microstrip 12.10 and pair-cpw 12.65 ms per frame (≤ 12; BL99), with the
  field map 18.48 ms (BL101), the via's antipad 19.09 ms (BL115); every 1× budget met.
- **Not checked (2):** the KiCad 5–8 demo boards of M1.1 (fetched once into a scratch folder in M1.1, gone;
  check-kicad skips them without `EMSIM_KICAD_OLD`; BL201), and M6.3's 2 M-cell via run (no mesh option makes one; the
  C45 pair and C44 stand in for the time against the estimate; BL200).
- **Recorded (26)** and **owner (2)**: as the table says.

Some measured values: one 2D solve (C39) 2.6 / 4.1 ms in the worker; the field map's first picture 11 / 13 ms; the
via model after a new drill 16.5 / 20.2 ms and after a new trace width 6.6 / 8.5 ms (≤ 30); C44 on WebGPU 1.6–1.8 s
against its estimate of 1.45 s (within 2×).

## Backlog

BL200 (M6.3's 2 M-cell via run), BL201 (the KiCad 5–8 demo boards kept for the recheck), BL202 (the Smith chart's
ui-math panel cost at 4×). Next free: BL203.

## Fix: BL202 (the Smith chart's ui-math panel cost)

**A/B of the builds:** HEAD (ef37eb0) and M4.3a's commit (5c67a17), each built in a worktree and served by
`next start` (3022, 3023), ui-math's timing interleaved A B A B, 6 rounds of a fresh page per drag: median panel
cost +0.37 ms (HEAD) and +1.00 ms (M4.3a), each pair scattering −0.35 to +1.41 ms, and the panel's own script in
its time slice 0.122 and 0.118 ms per frame. Then 6 same-page pairs a round, 5 rounds (before the handle fix below): HEAD 0.21, 0.43, 0.94, 0.45, 0.18
ms; M4.3a 0.48, 0.17, −0.60, 0.27, 0.15 ms. **No code change moved it** (the only shared change in the Smith
page's bundle since M4.3a is `lib/equations/tex.ts`, 56e1712 and 32442ee); frames off are 11.4–15.6 ms on both
builds, so the 4× frame's move from 11.4 ms (Smith M5.4) is this machine's.

**Why it failed:** two causes in the measure and one in the panel.

- A fresh page per drag scatters ±1 ms (CDP's metrics split it: script, style and layout differences are steady
  at about 0.1, 0.02 and 0.08 ms; the rest, garbage collection and paint, carries the scatter).
- On one page, a drag ends a few px off its start and the next drags, aimed at the first place, miss the handle
  (~6 ms a frame instead of ~12): those gave the 5–8 ms outlier pairs and the "panel followed the drag" failures.
- With both fixed, the panel added **+0.42 ms** a frame (median of 40 pairs over 5 attempts) for 0.125 ms of its
  own script: 3.4 times the script, where `MathLive.CHARGE` assumed 2.2 (M5.1's measure, ±0.5 ms). The leaky
  bucket thus let the panel do more than its 0.25 ms rate.

**Change:** `components/Smith/MathPanel.tsx` `CHARGE` 2.2 → 3.4 (no output changes: the rows are the same, written
2 times per 2 s drag at 4× instead of 3, and at once after the drag). `scripts/harness/smith/ui-math.mjs`: one
page, a warm-up drag, 8 off/on pairs (off on, on off, …) of 2 s drags, a forced garbage collection
(`HeapProfiler.collectGarbage`) before each, each aimed at the handle where the link's circuit puts it and ended
at its start, the median of the pairs' differences against the unchanged 0.3 ms bar (up to 3 attempts), and a new
check that every timed drag moved the line. A time refill of the bucket's debt between drags was tried and dropped:
the debt at a drag's start is −1 to −2 (a few frames), not the cause.

**After:** ui-math on the final build, 3 runs in a row, each passing on its first attempt: −0.00, −0.15, +0.02 ms
(1990 of 1990 checks each). `npx tsc --noEmit` clean. No shared module changed, so the Smith and EM `npm run check`
were not rerun.

## The table

This run: **69 steps, 135 parts:** 99 pass, 2 fail, 4 known misses (fail with a backlog id), 2 not checked, 26 recorded, 2 owner.

Engine checks: 54212 checks, 0 failed (255 s). 28 of 28 UI scripts passed (1790 s). Size: first load: JS 13 chunks, 573.2 kB, 187.6 kB gzip (budget 200); CSS 2 files, 87.4 kB, 16.6 kB gzip (budget 30); later 42 chunks, 709.4 kB gzip.

Smith chart: check.mjs passed (1399641 of 1399641 checks passed); 4 of 5 browser scripts on the shared modules passed.

Every step of milestones.md M0.1–M9.2 (83 ids: headings, split sub-steps, notes files) has a row; rows not named there: M9.2-fix.

| Step | Done when (short) | Checked by (this run: check count or measured value) | Result |
| --- | --- | --- | --- |
| M0.1 Plan review | The v2 draft reviewed, this plan written | plan.md, notes-M0.1.md | recorded |
| M0.2a Theory, formulas, exact cases, sources | 1. Every formula the engine or theory uses in facts.md with a source or a derivation<br>2. The exact cases (10 digits) reproduced by the solvers<br>3. Each file under 40 kB<br>4. Open questions listed | 1. facts.md, facts-formulas.md, sources.md; claims.md for the theory<br>2. check "2D solver (BEM)": 280; check "Axisymmetric solver (M1.6)": 21<br>3. docs: docsize: 99 files, largest fullwave.md 39.2 kB<br>4. notes-M0.2a.md | 1. recorded<br>2. pass<br>3. pass<br>4. recorded |
| M0.2b JLCPCB, KiCad fields, the owner's cases | 1. facts-cases.md has at least 25 cases, the owner's C38–C43 among them<br>2. Every JLCPCB number has a date and URL<br>3. The owner's boards read as facts-cases.md says | 1. docs: cases: 45 cases<br>2. check "Stackup presets": 1093; check "JLCPCB stackups (M1.8b)": 11191; facts-fab.md for the numbers in the text<br>3. check "KiCad reader": 884 | 1. pass<br>2. pass<br>3. pass |
| M0.2c Formulas checked against the original papers | 1. Every closed form equal to its published numbers<br>2. The papers opened and what they confirm | 1. check "Closed forms (M1.4b)": 420<br>2. notes-M0.2c.md, sources.md "Opened in M0.2c" | 1. pass<br>2. recorded |
| M0.2d Literature pointers | 1. references.bib parses, keys unique<br>2. 57 papers with what each is for | 1. docs: bib: 166 entries<br>2. literature.md | 1. pass<br>2. recorded |
| M0.2e Literature findings | 1. references.bib parses, keys unique<br>2. 36 findings with their numbers | 1. docs: bib: 166 entries<br>2. literature.md "Findings with numbers (M0.2e)" | 1. pass<br>2. recorded |
| M0.3 Static solvers: formulation and spikes | 1. 0.1 % on the exact cases with a measured order (now 0.05 % by the product's solver)<br>2. The budget of engine.md §10 reachable<br>3. Every "M0.3 decides" answered | 1. check "2D solver (BEM)": 280; solver.md; the spike kept in spikes/ (npm run spike, not run)<br>2. check "2D solver (BEM)": 280; ui-perf "one 2D solve, microstrip with mask (C39): worker": 2.6 / 4.1 (≤ 20 ms (≤ 80 at 4×)); ui-perf "one 2D solve, pair with mask and coplanar ground (pair-cpw): worker": 22.6 / 24.4 (≤ 40 ms (≤ 150 at 4×))<br>3. solver.md | 1. pass<br>2. pass<br>3. recorded |
| M0.4a Full-wave design, WebGPU runner, Yee spike | 1. WebGPU and JavaScript rates give a via run's time (now the calibrated estimate against real runs)<br>2. Every "M0.4 decides" answered | 1. fullwave.md §9, notes-M0.4a.md; check "FDTD WebGPU (M6.3)": 38; ui-perf "full-wave run, via C44 on WebGPU: estimate against real time": 1.81 s / est. 1.45, 1.59 s / est. 1.45, 1.60 s / est. 1.45 (before the first run: 2.72 s) (within 2×)<br>2. fullwave.md | 1. pass<br>2. recorded |
| M0.4b openEMS installed, the first two fixtures | 1. The two openEMS fixtures exist with their provenance<br>2. openEMS installed and run | 1. check "openEMS fixtures (M6.4a)": 212<br>2. fullwave.md §14, notes-M0.4b.md (measured once; openEMS is not run by the recheck) | 1. pass<br>2. recorded |
| M0.5 Site infrastructure review | 1. Each item has a decision and a step<br>2. The first-load budget it set | 1. notes-M0.5.md<br>2. size.mjs: JS 13 chunks, 573.2 kB, 187.6 kB gzip (budget 200); CSS 2 files, 87.4 kB, 16.6 kB gzip (budget 30) | 1. recorded<br>2. pass |
| M1.1 Model, presets, KiCad reader, link | 1. The owner's two boards' stackups and net classes as facts-cases.md says<br>2. KiCad 10's demos read or refused with a reason<br>3. KiCad 5–8 demo boards read or refused with a reason (skipped without EMSIM_KICAD_OLD: BL201)<br>4. Every preset's geometry passes the invariants<br>5. Link and project round trips exact | 1. check "KiCad reader": 884<br>2. check "KiCad reader": 884<br>3. check "KiCad reader": EMSIM_KICAD_OLD not set: KiCad 5–8 demo boards skipped. [skipped]<br>4. check "Structure geometry": 1604; check "Stackup presets": 1093; check "Via structures": 78; check "Units": 69<br>5. check "Link and project": 1103 | 1. pass<br>2. pass<br>3. not checked<br>4. pass<br>5. pass |
| M1.2a 2D boundary-element core: correctness | Every exact case within 0.05 % with its measured order; C, L symmetric; invariance; homogeneous identities | check "2D solver (BEM)": 280 | pass |
| M1.2b 2D core: speed | 1. Budgets of engine.md §10 met in Node<br>2. The same budgets on the page (worker) | 1. check "2D solver (BEM)": 280<br>2. ui-perf "one 2D solve, microstrip with mask (C39): worker": 2.6 / 4.1 (≤ 20 ms (≤ 80 at 4×)); ui-perf "one 2D solve, pair with mask and coplanar ground (pair-cpw): worker": 22.6 / 24.4 (≤ 40 ms (≤ 150 at 4×)) | 1. pass<br>2. pass |
| M1.2c Per-corner grading | 1. Triple points converge, estimates tight<br>2. The full fuzz against the FD reference still clean | 1. check "2D solver (BEM)": 280; check "FD reference (M1.4a)": 131<br>2. recheck --long (not run): 0 of 3678 quantities over the bar in 500 structures, 885 s (notes-M1.4a-fix.md; M1.2c's bench the same) | 1. pass<br>2. recorded |
| M1.3 Modes, target, sweeps, tolerance | 1. Cohn's coupled stripline exact; Zdiff = 2·Zodd, Zcm = Zeven/2; asymmetric pairs as facts.md<br>2. Inverse round trips to 1e-6; Monte Carlo deterministic; budgets met | 1. check "Modes and impedances": 1489<br>2. check "Target, sweeps, tolerance": 90; ui-perf "inverse solve (width for a Z0 target)": 14 / 24 ms (≤ 0.3 s); ui-perf "sweep of 100 points": 84 / 90 ms (≤ 2 s); ui-perf "Monte Carlo, 1,000 samples": 689 / 695 ms (≤ 20 s) | 1. pass<br>2. pass |
| M1.4a FD reference and fuzz | 1. The FD reference on the exact cases; 16 fuzz structures against the BEM<br>2. The fuzz of 500 structures within the combined estimates<br>3. Written without reading the solver | 1. check "FD reference (M1.4a)": 131<br>2. recheck --long (not run): 0 of 3678 quantities over the bar in 500 structures, 885 s (notes-M1.4a-fix.md; M1.2c's bench the same)<br>3. notes-M1.4a.md, solver-fd.md | 1. pass<br>2. recorded<br>3. recorded |
| M1.4a-fix The BEM at triple points | 1. Copper on a high-εr slab within the FD reference's estimate<br>2. The fuzz clean (159 quantities over the bar before) | 1. check "2D solver (BEM)": 280; check "FD reference (M1.4a)": 131<br>2. recheck --long (not run): 0 of 3678 quantities over the bar in 500 structures, 885 s (notes-M1.4a-fix.md; M1.2c's bench the same) | 1. pass<br>2. recorded |
| M1.4b Closed forms against the field solver | 1. Closed forms within their published accuracy inside their ranges<br>2. The validation table filled, every difference explained | 1. check "Closed forms (M1.4b)": 420<br>2. facts-cases.md validation table, notes-M1.4b.md | 1. pass<br>2. recorded |
| M1.4c Reconciled with JLCPCB | JLCPCB's 50 Ω and 100 Ω widths reproduced by the named assumptions | check "JLCPCB calculator (M2.3b)": 40 | pass |
| M1.5 Fields and the static worker | 1. Fields equal exact coax and two-wire to 1e-4; Gauss; φ on conductors<br>2. The worker: cancel, cache by hash<br>3. The field-map budgets | 1. check "Fields (M1.5)": 59<br>2. check "Static worker (M1.5)": 23<br>3. check "Fields (M1.5)": 59; ui-perf "field map, 1440 px view: first picture": 11 / 13 (≤ 50 ms); ui-perf "field map, 1440 px view: full": 37 / 39 (≤ 300 ms) | 1. pass<br>2. pass<br>3. pass |
| M1.6 Axisymmetric solver and via cut | 1. Exact cases (coax, disk 8ε0a, sphere); pad and antipad capacitances<br>2. The quasi-coaxial barrel with N returns against facts.md and the 2D core | 1. check "Axisymmetric solver (M1.6)": 21<br>2. check "Via cut (M1.6)": 43 | 1. pass<br>2. pass |
| M1.7 Via model, TDR, N-port | 1. A uniform line's TDR = Z0; passive and reciprocal to 1e-12; stub resonance; every flag on its case<br>2. Budget ≤ 30 ms | 1. check "Via model (M1.7)": 53<br>2. check "Via model (M1.7)": 53; ui-perf "via model C44, after a new drill: worker": 16.5 / 20.2 (≤ 30 ms) | 1. pass<br>2. pass |
| M1.8a JLCPCB stackup fetcher | The fetcher and converter, tried on a handful of requests; the fetch of 2–4 hours | notes-M1.8a.md (measured once; JLCPCB's server is not asked again) | recorded |
| M1.8b All JLCPCB stackups as data | Every stackup's invariants; hand presets equal their entries; no static import of the data | check "JLCPCB stackups (M1.8b)": 11191 | pass |
| M1.8c The preset picker | 1. The picker by mouse, keys and touch; the list loaded on opening; the link<br>2. The first-load budget kept | 1. ui-jlcpcb: 36<br>2. size.mjs: JS 13 chunks, 573.2 kB, 187.6 kB gzip (budget 200); CSS 2 files, 87.4 kB, 16.6 kB gzip (budget 30) | 1. pass<br>2. pass |
| M2.1a Page shell and stackup | 1. The owner's board opens with its stackup and net classes; the link restores everything<br>2. 320, 390 and 1440 px in both themes without sideways scroll<br>3. Those widths look right<br>4. First-load size within M0.5's budget | 1. ui-stackup: 52<br>2. ui-stackup: 52<br>3. screenshots looked at, notes-M2.1a.md; again in M9.1a<br>4. size.mjs: JS 13 chunks, 573.2 kB, 187.6 kB gzip (budget 200); CSS 2 files, 87.4 kB, 16.6 kB gzip (budget 30); next build | 1. pass<br>2. pass<br>3. recorded<br>4. pass |
| M2.1b Trace section and results | 1. Every preset opens and equals the engine; the owner's 50R_SE and LVDS_100R open from their board<br>2. Keyboard and touch do every task<br>3. Screenshots in both themes at both widths | 1. ui-trace: 65<br>2. ui-trace: 65; ui-access: 218<br>3. notes-M2.1b.md (screenshots are made only with a folder: npm run ui <folder>) | 1. pass<br>2. pass<br>3. recorded |
| M2.1b-fix Status on ordinary structures | C39 and C41 regular, with their value and error | check "2D solver (BEM)": 280; ui-trace: 65 | pass |
| M2.1c Drag handles, pan and zoom | 1. A drag updates the result within budget at 1×<br>2. The same at 4×<br>3. Mouse, touch and keys; one undo per drag | 1. ui-drag: 76; ui-perf "drag: trace width, microstrip" 1×: 2.95 ms per frame, 0.99 results per frame (≤ 8 ms, ≤ 12 at 4×); ui-perf "drag: trace width, pair-cpw" 1×: 3.39 ms per frame, 0.99 results per frame (≤ 8 ms, ≤ 12 at 4×)<br>2. ui-perf "drag: trace width, microstrip" 4×: 12.10 ms per frame, 1.00 results per frame (≤ 8 ms, ≤ 12 at 4×) [fail]; ui-perf "drag: trace width, pair-cpw" 4×: 12.65 ms per frame, 1.00 results per frame (≤ 8 ms, ≤ 12 at 4×) [fail]<br>3. ui-drag: 76 | 1. pass<br>2. **fail (known, BL99)**<br>3. pass |
| M2.1d The general editor | Add, move, remove traces, grounds and planes by mouse, touch and keys; the link | ui-general: 65 | pass |
| M2.2 Field view | 1. Fields follow a drag within budget<br>2. No main-thread frame over budget at 4×<br>3. The probe by hover, keys and tap<br>4. The map legible in both themes | 1. ui-fields: 105; ui-perf "drag: trace width, microstrip with the field map (\|E\|)" 1×: 5.01 ms per frame, 0.99 results per frame, map 14 ms (≤ 8 ms, ≤ 12 at 4×)<br>2. ui-perf "drag: trace width, microstrip with the field map (\|E\|)" 4×: 18.48 ms per frame, 1.00 results per frame, map 35 ms (≤ 8 ms, ≤ 12 at 4×) [fail]<br>3. ui-fields: 105<br>4. check "Fields (M1.5)": 59; ui-access: 218; screenshots, notes-M2.2.md | 1. pass<br>2. **fail (known, BL101)**<br>3. pass<br>4. pass |
| M2.3a Target, sweeps, tolerance on the page | Target width, sweeps that draw as they go and cancel, tolerance band; touch and keys | ui-tools: 55; check "Target, sweeps, tolerance": 90; check "Plot (M2.3a)": 59 | pass |
| M2.3b Calculator comparison | The owner's two cases: closed forms, JLCPCB's number, each difference explained | ui-calc: 43; check "JLCPCB calculator (M2.3b)": 40; check "Closed forms (M1.4b)": 420 | pass |
| M2.4a First theory (content) | 1. Every claim has a source or a derivation (form: numbered, kind, source, keys in references.bib)<br>2. Every number in the text checked against the engine | 1. docs: claims: 313 claims numbered, each with a kind and a source; claims.md; the reading again in M9.3b<br>2. check "Equations (M2.4b)": 636 | 1. pass<br>2. pass |
| M2.4b Shared equation engine, EM equations | 1. Every equation evaluates to the engine's number<br>2. The Smith chart still passes with the shared engine (a failing ui-math: BL202) | 1. check "Equations (M2.4b)": 636<br>2. Smith check.mjs: 1399641 of 1399641 checks passed; Smith ui-math [fail]; Smith ui-math-link; Smith ui-derive; Smith ui-explain; Smith ui-theory | 1. pass<br>2. **fail** |
| M2.4c Theory and References on the page | 1. Live numbers follow the editor; citations resolve<br>2. /em-sim/main builds as a static page | 1. ui-theory: 182<br>2. next build | 1. pass<br>2. pass |
| M2.4d Short lines | Every short line links to its topic | ui-why: 142 | pass |
| M2.5 Release | 1. The card, the status note, npm run ui on a production build<br>2. README and CLAUDE.md lines<br>3. Owner checkpoint 1 | 1. ui-release: 35; next build<br>2. docs: release: README, CLAUDE.md and the card name the tool<br>3. the owner tries the released trace tool | 1. pass<br>2. pass<br>3. owner |
| M3.1a Via section | 1. The owner's LVDS via pair (C45) and C44 open, equal to the engine; flags; link<br>2. Solve within budget | 1. ui-via: 108; check "Via structures": 78; check "Via model (M1.7)": 53<br>2. ui-via: 108; ui-perf "via model C44, after a new drill: worker": 16.5 / 20.2 (≤ 30 ms) | 1. pass<br>2. pass |
| M3.1b Via handles | 1. Every drag updates within budget at 1×; touch and keys; both themes and widths<br>2. The same at 4× | 1. ui-viadrag: 110; ui-perf "drag: via side antipad (C44)" 1×: 5.31 ms per frame, 0.95 results per frame (≤ 8 ms, ≤ 12 at 4×)<br>2. ui-perf "drag: via side antipad (C44)" 4×: 19.09 ms per frame, 1.02 results per frame (≤ 8 ms, ≤ 12 at 4×) [fail] | 1. pass<br>2. **fail (known, BL115)** |
| M3.2a Via plots | Feeds on both sides: the TDR's flat parts equal the traces' Z0; cursors shared | ui-viaplots: 65 | pass |
| M3.2b Via fields and target | 1. Fields legible, equal to the engine; the target<br>2. Owner checkpoint 2 | 1. ui-viafields: 42; check "Via fields (M3.2b)": 109<br>2. the owner looks at the via tool (may reorder M4–M8) | 1. pass<br>2. owner |
| M4.1 Teaching content: vias, equations, examples | 1. Every claim sourced (claims 134–241)<br>2. The examples' numbers as the engine gives them | 1. docs: claims: 313 claims numbered, each with a kind and a source; claims.md<br>2. check "Equations and derivations (M4.2)": 9979 | 1. pass<br>2. pass |
| M4.2 Equation layer engine | Every equation equal to the engine within 1e-9; every derivation step checks | check "Equations and derivations (M4.2)": 9979 | pass |
| M4.3a Equation panel and derivation dialog | 1. Every number in the results has an equation one click away; keys, touch, both themes<br>2. The Smith chart's checks pass with the shared dialog (a failing ui-math: BL202) | 1. ui-equations: 341<br>2. Smith check.mjs: 1399641 of 1399641 checks passed; Smith ui-derive; Smith ui-math [fail]; Smith ui-explain | 1. pass<br>2. **fail** |
| M4.3b Via theory and examples on the page | 1. Examples open their states; keyboard, touch, both themes<br>2. The via topics with live numbers | 1. ui-examples: 103<br>2. ui-theory: 182 | 1. pass<br>2. pass |
| M5.1 3D view | 1. Opens within 1 s, orbits at 60 fps, touch at 390 px<br>2. The first load does not grow (no three.js in it) | 1. ui-via3d: 42; check "Scene 3D (M5.1)": 2838<br>2. size.mjs: JS 13 chunks, 573.2 kB, 187.6 kB gzip (budget 200); CSS 2 files, 87.4 kB, 16.6 kB gzip (budget 30); ui-perf: 17 | 1. pass<br>2. pass |
| M6.1 Mesh, materials, ports, estimator | Mesh invariants on every preset; estimate within 10 % of the buffers | check "FDTD mesh (M6.1)": 20824 | pass |
| M6.2a CPU FDTD: the time loop | 1. Cavity resonances; CPML reflection; energy without sources (300 steps)<br>2. Energy constant over a full run (7 645 steps) | 1. check "FDTD CPU loop (M6.2a)": 47<br>2. EMSIM_FDTD_LONG=1 (not run): 4.6·10⁻¹⁴ over 7 645 steps on the closed C44 via (notes-M6.2a.md) | 1. pass<br>2. recorded |
| M6.2b Ports, S-parameters, TDR, the worker | 1. Microstrip TDR within 1 % of the 2D solver; matched S11 under −30 dB; reciprocity<br>2. The 12 mm section and the coupled pair | 1. check "FDTD runs (M6.2b)": 111<br>2. EMSIM_FDTD_LONG=1 (not run): 12 mm: 51.577 Ω (+0.15 %); pair: −24.9 dB at Zodd, reciprocity 6.7·10⁻⁷ (notes-M6.2b.md) | 1. pass<br>2. recorded |
| M6.3 WebGPU backend | 1. WebGPU and CPU agree within the f32 bar; lost device or no adapter falls back<br>2. Both C44 runs to the cap<br>3. A via run's time within 2× of the estimate (C45 pair and C44 stand in)<br>4. The 2 M-cell via run itself | 1. check "FDTD WebGPU (M6.3)": 38<br>2. EMSIM_FDTD_LONG=1 (not run): signals 5.2·10⁻⁷, \|ΔS\| 1.3·10⁻⁶, TDR 1.3·10⁻⁶ Ω over 15 290 steps (notes-M6.3.md)<br>3. check "FDTD WebGPU (M6.3)": 38; ui-perf "full-wave run, via C44 on WebGPU: estimate against real time": 1.81 s / est. 1.45, 1.59 s / est. 1.45, 1.60 s / est. 1.45 (before the first run: 2.72 s) (within 2×)<br>4. no mesh option makes a 2 M-cell via; C45 (0.52 M cells per run) stands in (notes-M6.3.md); BL200 [not checked] | 1. pass<br>2. recorded<br>3. pass<br>4. not checked |
| M6.4a openEMS fixtures | 1. The fixtures with their provenance, passive and reciprocal<br>2. The openEMS runs | 1. check "openEMS fixtures (M6.4a)": 212<br>2. notes-M6.4a.md, fullwave-verify.md (hours on the owner's PC; measured once) | 1. pass<br>2. recorded |
| M6.4b FDTD εeff fixed (BL150) | The microstrip's εeff within 1.5 % of the 2D solver; the GPU agreement kept | check "FDTD runs (M6.2b)": 111; check "FDTD WebGPU (M6.3)": 38 | pass |
| M6.4c FDTD against openEMS | 1. FDTD within the frozen limits of openEMS on every fixture (stored numbers re-read)<br>2. Our FDTD run again on every fixture<br>3. The table and flag thresholds in fullwave.md and the notes | 1. check "Full-wave against openEMS (M6.4c)": 86<br>2. compare-openems.mjs writes openems/compare.json (measured once, about an hour on WebGPU; not re-run)<br>3. fullwave-verify.md, notes-M6.4c.md | 1. pass<br>2. recorded<br>3. recorded |
| M6.5 Via model corrected from the verification | 1. C44's section Z and TDR peak within the frozen limits; the band where it leaves full-wave<br>2. The page's numbers that moved updated | 1. check "Full-wave against openEMS (M6.4c)": 86; check "Via model (M1.7)": 53<br>2. check "Equations and derivations (M4.2)": 9979; ui-examples: 103; ui-via: 108 | 1. pass<br>2. pass |
| M7.1a Waves section: runs | 1. C45 on WebGPU within the estimate; a trace on the CPU within its estimate; cancel frees the GPU memory<br>2. C45 on the CPU fallback to the end | 1. ui-waves: 37<br>2. EMSIM_WAVES_LONG=1 (not run): 10.1 min against 9.9 min calibrated (notes-M7.1b.md) | 1. pass<br>2. recorded |
| M7.1b The 2D player | Plays smoothly at 1440 and 390 px; cancel frees the frames | ui-player: 58 | pass |
| M7.2a Pair modes | Differential and common drive; frames as A ∓ B | check "Waves drive (M7.2a)": 26; ui-player: 58; check "FDTD WebGPU (M6.3)": 38 | pass |
| M7.2b Waves in 3D | The 3D animation at the 2D player's frame rate | ui-waves3d: 47; check "Waves 3D (M7.2b)": 25 | pass |
| M7.2c Full-wave topic (content) | The topic's claims sourced (242–313) | docs: claims: 313 claims numbered, each with a kind and a source; claims.md, sources.md | pass |
| M7.2d Full-wave topic on the page | Live numbers equal the engine; figures; links to Waves | ui-theory: 182; check "Equations and derivations (M4.2)": 9979 | pass |
| M8.1a Figure model, SVG, PNG, TikZ | Figures read back from SVG and TikZ; TikZ compiled by TeX Live | check "Figures (M8.1a)": 463 | pass |
| M8.1b Export section | True-size preview, Copy and Save equal to the model | ui-export: 56 | pass |
| M8.2a Data, Touchstone, project file | CSV and Touchstone read back; the project file round trip | check "Data export (M8.2a)": 49; ui-data: 41; check "Link and project": 1103 | pass |
| M8.2b Printable report | A4 and Letter, light, vectors | ui-report: 36 | pass |
| M9.1a Access in Edge | Keyboard, touch, names, contrast AA, reduced motion, 200 % zoom | ui-access: 218 | pass |
| M9.1b Firefox and WebKit | Every feature in three browsers; the CPU fallback's message | ui-browsers: 62 | pass |
| M9.2 Performance, size, memory | 1. engine.md §10's budgets at 1× on a production build<br>2. The drag budgets at 4×<br>3. The first-load budget<br>4. A session without growing memory (2 minutes)<br>5. The 10-minute session | 1. ui-perf: 17; ui-perf "one 2D solve, microstrip with mask (C39): worker": 2.6 / 4.1 (≤ 20 ms (≤ 80 at 4×)); ui-perf "field map, 1440 px view: first picture": 11 / 13 (≤ 50 ms); ui-perf "drag: trace width, microstrip" 1×: 2.95 ms per frame, 0.99 results per frame (≤ 8 ms, ≤ 12 at 4×); ui-perf "drag: via side antipad (C44)" 1×: 5.31 ms per frame, 0.95 results per frame (≤ 8 ms, ≤ 12 at 4×); ui-perf "full-wave run, via C44 on WebGPU: estimate against real time": 1.81 s / est. 1.45, 1.59 s / est. 1.45, 1.60 s / est. 1.45 (before the first run: 2.72 s) (within 2×)<br>2. ui-perf "drag: trace width, microstrip" 4×: 12.10 ms per frame, 1.00 results per frame (≤ 8 ms, ≤ 12 at 4×) [fail]; ui-perf "drag: trace width, microstrip with the field map (\|E\|)" 4×: 18.48 ms per frame, 1.00 results per frame, map 35 ms (≤ 8 ms, ≤ 12 at 4×) [fail]; ui-perf "drag: via side antipad (C44)" 4×: 19.09 ms per frame, 1.02 results per frame (≤ 8 ms, ≤ 12 at 4×) [fail]<br>3. size.mjs: JS 13 chunks, 573.2 kB, 187.6 kB gzip (budget 200); CSS 2 files, 87.4 kB, 16.6 kB gzip (budget 30)<br>4. ui-session: 11<br>5. EMSIM_SESSION_LONG=1 (not run): page heap 118 kiB/min from minute 2, last sample +9.0 %, nodes +29, no live WebGL context (notes-M9.2.md) | 1. pass<br>2. **fail (known, BL99, BL101, BL115)**<br>3. pass<br>4. pass<br>5. recorded |
| M9.2-fix Via-model budgets (BL197–BL199; notes-M9.2.md "Fix") | 1. The via model ≤ 30 ms after a new drill and after a trace edit<br>2. One field-map job per typed width | 1. check "Via model (M1.7)": 53; ui-perf "via model C44, after a new drill: worker": 16.5 / 20.2 (≤ 30 ms); ui-perf "via model C44, after a new trace width (feeds solved again): worker": 6.6 / 8.5 (≤ 30 ms)<br>2. ui-perf: 17 | 1. pass<br>2. pass |

**Failures:** M2.4b The Smith chart still passes with the shared engine (a failing ui-math: BL202); M4.3a The Smith chart's checks pass with the shared dialog (a failing ui-math: BL202).

**Not checked:**

- M1.1 KiCad 5–8 demo boards read or refused with a reason (skipped without EMSIM_KICAD_OLD: BL201): check "KiCad reader" (EMSIM_KICAD_OLD not set: KiCad 5–8 demo boards skipped.)
- M6.3 The 2 M-cell via run itself: no mesh option makes a 2 M-cell via; C45 (0.52 M cells per run) stands in (notes-M6.3.md); BL200
