# EM simulation – claims checklist (theory and short lines)

Every factual sentence of [theory.md](theory.md), [theory-2.md](theory-2.md) and [theory-lines.md](theory-lines.md),
with where it comes from (step M2.4a; M2.4b adds the sentences the page itself adds). The page leaves the `⟨n⟩` markers
out.

**Kinds.** **S** source (key and section, as [sources.md](sources.md) allows; "abstract" = what the paper's abstract
states, literature.md "Findings with numbers"; a key "not opened" in sources.md is only cited beside the derivation
named with it). **D** derived (equation ids of theory.md's tables, or the facts.md section with the derivation; "engine"
= a number computed by the engine at M = 2 and listed in notes-M2.4a.md "Numbers checked"). **Def** definition or
wording. **T** describes the tool (the file, and the check or harness that holds it to it). Nothing is left unsourced.

**Checks for M2.4b** (`ui-theory.mjs`, as the Smith chart's): every citation on the page resolves to a reference entry
(numbered by first citation); every short line's link and every sub-anchor has its target; every live number equals
the engine's for the same setup in Node; the static engine numbers (D, engine) equal notes-M2.4a.md's table on the
default setup within the shown digits.

Abbreviations: E = `Ellingson2018`, AP = `PolarAP157`, Q = `QucsTech`, JC = `JLCPCBCalc`, JG = `JLCPCBCalcGuide`,
JI = `JLCPCBImpedance`, JK = `JLCPCBCapabilities`; D/P = the default microstrip and pair.

## Topic 0 – How to use (theory.md §0)

| # | Kind | Where it comes from |
|---|---|---|
| 1 | T | the page (`EmSimTool.tsx`, `TraceResults.tsx`); ui-trace.mjs |
| 2 | T | `setup.ts` `defaultSetup` (`DEFAULT_TRACE_W` 0.1377, preset JLC061611-3313A, `microstrip` L1 over L2, `masked`); check-stackup.mjs, ui-trace.mjs |
| 3 | T | `StackupSection.tsx`, `JlcPicker.tsx`, `kicad.ts`; ui-stackup.mjs, ui-jlcpcb.mjs |
| 4 | T | `ValField.tsx`, `format.ts` `sourceTag`, Sources list; ui-stackup.mjs |
| 5 | T | `TraceSection.tsx`, `TraceDrawing.tsx` handles; ui-trace.mjs, ui-drag.mjs |
| 6 | T | `GeneralEditor.tsx`, `structure.ts` `MAX_SIGNALS` 8; ui-general.mjs (the 9th refused) |
| 7 | T | `TraceResults.tsx` (`data-e`); ui-trace.mjs |
| 8 | T | `TraceSection.tsx` fast path (M2.1c); ui-drag.mjs |
| 9 | T | `FieldControls.tsx`, `FieldView.tsx`; ui-fields.mjs |
| 10 | T | `TraceTools.tsx`, `CalcTool.tsx`; ui-tools.mjs, ui-calc.mjs |
| 11 | T | `EmSimTool.tsx` history and link; ui-stackup.mjs (round trip in a fresh context) |

## Topic 1 – Transmission lines (theory.md §1)

| # | Kind | Where it comes from |
|---|---|---|
| 12 | Def | (with facts.md §1 "Voltages, currents") |
| 13 | D | `telegraph` (facts.md §1, lossless telegrapher's equations) |
| 14 | D | `z0-lc` (facts.md §3) |
| 15 | D | `delay-lc` (facts.md §3) |
| 16 | S | E §3.12 (Γ = 0 for a matched load; as docs/smith-chart/claims.md 18–20) |
| 17 | S + D | `Pozar2012` §3.8 (not opened) beside facts.md §2 (static limit of Maxwell's equations) |
| 18 | D + T | facts.md §2; engine.md §4 (every quantity from static C, C0) |
| 19 | D | `eeff-c` (facts.md §3) |
| 20 | S | E §3.11 (v = c/√εeff, λ = λ0/√εeff) |
| 21 | D + S | `l-c0` (facts.md §4 derivation), `Paul2008` (not opened) beside |
| 22 | D | `z0-lc`, `eeff-c`, `delay-lc`; engine (D) |
| 23 | D | `lambda-eeff`; engine (D) |
| 24 | S | Q §11.1 (Getsinger's model), `Getsinger1973` (not opened) beside |
| 25 | D | `getsinger`, `getsinger-limit`; engine (D) |
| 26 | D | from 23–25 |
| 27 | T | engine.md §2 ("dispersion out of scope in phase 1"), §4 (lossless); later.md |

## Topic 2 – The field solver (theory.md §2)

| # | Kind | Where it comes from |
|---|---|---|
| 28 | T | `static.worker.ts`, `staticClient.ts`; engine.md §10; ui-trace.mjs (`data-where` worker) |
| 29 | T | engine.md §4, `bem2d.ts` |
| 30 | T | engine.md §4 formulation (total charge, piecewise constant on straight panels), `panels.ts` |
| 31 | T | engine.md §4 (image, parallel-plate kernel), `kernels.ts` |
| 32 | T + D | `bem2d.ts` (C, C0, L); `l-c0` |
| 33 | T | `lines.ts` (every impedance from Zc); check-modes.mjs |
| 34 | T | engine.md §4 ("graded towards both ends of every edge"), solver.md §2 |
| 35 | T | engine.md §4, facts.md §4 (perfect conductors, surface currents) |
| 36 | T | solver.md §2.6 (levels M/4, M/2, M; M = 2) |
| 37 | T | solver.md §2.6 (rule since M1.4a-fix, floor `CFLOOR`), `bem2d.ts` `estimateOf`, `lines.ts`; `error-shown` |
| 38 | T | notes-M2.1b-fix.md (fuzz of 500 structures against the FD reference: estimate / true ≥ 1.05, median 3.8–4.4); `npm run check:fd` |
| 39 | T + S | solver.md §2.6 exact cases (check-bem.mjs); `WikiCapacitance` (wire over plane, coax); `Cohn1954` (not opened) beside facts.md §8's checks |
| 40 | T | solver.md §2.6 "Status (M2.1b-fix)"; `order` |
| 41 | T + D | engine (P: Zdiff 103.36 ± 0.15, irregular) |
| 42 | S | `Zhechev2026` abstract (literature S1: iterative criteria fail silently) |
| 43 | T | `TraceResults.tsx` (`data-status`) |
| 44 | T | engine.md §8, `trace.ts` `qText`, `FLOOR`; ui-trace.mjs |
| 45 | T | `format.ts` (shown values rounded, the setup never) |
| 46 | T | `TraceSection.tsx` (30 ms, 100 ms, 200 ms; M2.1c); ui-drag.mjs |

## Topic 3 – Pairs (theory.md §3)

| # | Kind | Where it comes from |
|---|---|---|
| 47 | Def | |
| 48 | D + S | facts.md §5 (Tv = (1, ±1) for a symmetric pair); AP |
| 49 | S | AP |
| 50 | S | AP (Zdiff = 2·Zodd, Zeven = 2·Zcommon) |
| 51 | D | `zodd-sym`, `zeven-sym` (Maxwell C12 < 0, L12 > 0; facts.md §1, §5) |
| 52 | D | engine (P); Zc11 = (Zeven + Zodd)/2 (facts.md §5) |
| 53 | D | facts.md §5 (four definitions A–D) |
| 54 | D + S | `zdd-zc`, `zcc-zc` (facts.md §5 derivation); `BockelmanEisenstadt1995` (not opened) beside |
| 55 | D | facts.md §5 (symmetric: A = B = D) |
| 56 | D + T | `zdc-zc` (facts.md §5, row A); `TraceResults.tsx` shows it when not symmetric |
| 57 | D + T | `zdiff-b`, `ztdr` (`lines.ts` `zdiffB`, `ztdr`, `TDR_COMMON_OHM` 25 Ω); check-modes.mjs |
| 58 | D + S | `kb`, `kf`, `fext-pulse` (facts.md §6 derivation); `Paul2008`, `Bogatin2018` (not opened) beside |
| 59 | D | `kb`, `kf` (facts.md §6) |
| 60 | D | facts.md §6 (homogeneous: Cm/C = Lm/L) |
| 61 | D | engine (P: kb 0.0446, kf −1.627 × 10⁻¹⁰ s/m); `fext-pulse` |
| 62 | D | engine (stripline pair 0.11/0.2 on L2: kf −3.97 × 10⁻¹⁴ s/m) |
| 63 | D | `eeff-mode`; engine (P) |
| 64 | D | engine (P: εeff 3.082 / 3.435, 5.856 / 6.182 ps/mm); `mode-skew`; the field figure |
| 65 | D | engine (stripline pair: 4.1282 / 4.1283) |
| 66 | T | `lines.ts` flag `modes-unresolved`; check-modes.mjs |

## Topic 4 – Structures (theory-2.md §4)

| # | Kind | Where it comes from |
|---|---|---|
| 67 | Def | (`structure.ts` `TRACE_KINDS`) |
| 68 | D | engine (stripline 0.1377 on L2: εeff 4.128); layer εr from the preset (JI) |
| 69 | D | engine (6.778 / 6.058 ps/mm; 51.50, 38.44, 57.24 Ω) |
| 70 | S | JG ("trace top width = trace base width − 0.7 mil") |
| 71 | T | `geometry.ts` (trapezoid from the etch), `TraceSection.tsx` `data-etch`; check-geometry.mjs |
| 72 | D | engine (D −0.98, P −2.85 Ω for rectangles) |
| 73 | S | JG (mask 1.2 / 0.6 / 1.2 mil, εr 3.8) |
| 74 | D | `eeff-c`, `z0-lc` (C rises, C0 does not) |
| 75 | D | engine (D 54.98 → 51.50, P 112.52 → 103.36 Ω) |
| 76 | D | engine (εeff 3.298 / 2.893) |
| 77 | T + D | `closedform.ts` `neglects` (mask); 75 |
| 78 | T | `TraceSection.tsx` `data-trace-masked`; ui-trace.mjs |
| 79 | D | `z0-lc` (more conductor at 0 V, more C) |
| 80 | D | engine (cpwg g 0.6 / 0.2 / 0.1 mm: 51.43, 50.38, 46.73 Ω) |
| 81 | D | from 80 (0.6 mm ≈ 6.5 h: no change; 0.1 mm ≈ 1.1 h: −4.8 Ω) |
| 82 | D | `z0-lc`; 84 |
| 83 | S | `Gunston1969` abstract (literature C4) |
| 84 | D | engine: check-closedform.mjs (M1.4b) sheets against the bare rectangle, P −16.40, D −5.33 Ω (facts-cases.md "Differences explained") |

## Topic 5 – Calculators (theory-2.md §5)

| # | Kind | Where it comes from |
|---|---|---|
| 85 | S + T | AP (Si8000/Si9000 use 2D field solvers); engine.md §4 |
| 86 | Def | (facts-formulas.md) |
| 87 | D | from 94–107 |
| 88 | S | Q, single microstrip (Hammerstad–Jensen's stated accuracy); `HammerstadJensen1980` (not opened) beside |
| 89 | S | `WikiMicrostrip`; `Wheeler1977` (not opened) beside |
| 90 | S | `KirschningJansen1984` §II (with `KirschningJansen1985corr`) |
| 91 | S | `IPC2141` §4 |
| 92 | T | `closedform.ts` `closedForms().reduced`; ui-calc.mjs |
| 93 | T | `closedform.ts` (`neglects`, CPW with endless grounds); check-closedform.mjs |
| 94 | D + T | engine and `closedform.ts` on the bare D (54.06, 54.16, 54.33, 49.38 Ω) |
| 95 | D | engine and `closedform.ts` on D (55.85, 51.24 Ω) |
| 96 | D | `closedform.ts` K–J on P (132.25 Ω) |
| 97 | S | `Abbosh2009` abstract (literature P3) |
| 98 | S | JC (Si9000) |
| 99 | S | JC (inputs for JLC061611-3313A, notes-M1.4c.md) |
| 100 | S | JI (3313 εr 4.1, outer 0.035 mm), JG (0.7 mil, 1.2 mil) |
| 101 | T | `presets.ts`, `jlcCalc.ts`, `CalcTool.tsx` `data-calc-use`; check-jlccalc.mjs, ui-calc.mjs |
| 102 | S + D | JC (5.42 mil, 49.958 Ω); engine (50.06 ± 0.06 Ω) |
| 103 | S + T | JC (ten queries, facts-cases.md "Differences explained" table, largest +0.33 %) |
| 104 | D | engine (51.50 Ω) |
| 105 | D | `parts-sum`; engine (+0.94, +0.51, +0.25, −0.27, together +1.44 Ω); check-jlccalc.mjs |
| 106 | D + S | engine (100.01, 103.36 Ω); JC (100 Ω at 4.36 / 8 mil) |
| 107 | D | from 102–106 |
| 108 | D + S | engine (`inverse` on the calculator's inputs: 5.435 mil, 0.1380 mm); JC (`ZoTol` ±0.5 %) |
| 109 | D | engine (`inverse` on D: 0.1465 mm) |
| 110 | S | JK (±10 %) |
| 111 | D | 50.06 and 51.50 Ω against 50 Ω ± 10 % |
| 112 | S | `Renbi2011` abstract (literature F1) |
| 113 | Def | |

## Topic 6 – Tolerances (theory-2.md §6)

| # | Kind | Where it comes from |
|---|---|---|
| 114 | Def | |
| 115 | S | JK (±10 %, ±5 % on request) |
| 116 | T | `tools.ts` `PLACEHOLDER`, `withPlaceholders`; `data-tol-note`; ui-tools.mjs |
| 117 | T | `vary.ts` `corners` (one input at a time at ± its limit); check-vary.mjs |
| 118 | D | `sens`; engine (D with placeholders) |
| 119 | D | `share` (`tools.ts` `shares`); engine |
| 120 | D | from 118–119 |
| 121 | D + T | `corners`; engine (44.54, 59.37 Ω); `vary.ts` |
| 122 | Def | |
| 123 | T | `vary.ts` `monteCarlo` (`MC_SAMPLES` 1000, `MC_SEED`, σ = limit/3, redrawn beyond); check-vary.mjs |
| 124 | D | `mc-normal`; engine (median 51.44, 2.5 % / 97.5 % 49.06 / 54.24, sd 1.313 Ω) |
| 125 | D | `rss-sigma` (1.310 Ω from 118) |
| 126 | T + Def | `vary.ts` (independent draws) |

## Short lines (theory-lines.md)

Lines that repeat a theory sentence carry its number (see the table there). Lines without a number describe what the
control does: **T**, checked by the ui script of their section (ui-stackup, ui-jlcpcb, ui-trace, ui-drag,
ui-general, ui-fields, ui-tools, ui-calc). The lines' own claims:

| # | Kind | Where it comes from |
|---|---|---|
| 127 | T | `EmSimTool.tsx` (`emsim.theme` in `localStorage`) |
| 128 | T | `format.ts` (the setup is never rounded) |
| 129 | T | `StackupSection.tsx` (`File.text()`, no request); CLAUDE.md "Files the user gives a tool never leave the device" |
| 130 | T | `JlcPicker.tsx` (filters, withdrawn, pressed-sum warning); ui-jlcpcb.mjs |
| 131 | D | `sens`; engine (D1 εr ±0.2 → ∓0.976 Ω, so 0.3 ≈ 1.5 Ω) |
| 132 | D + T | facts.md §4 (V = Zc·I: Zc_kk = V_k/I_k with the other currents 0); `lines.ts` (Z0 = Zc_kk, εeff = C_kk/C0_kk) |
| 133 | T | `TraceTools.tsx` (the width's ± from one more solve 0.1 % wider); ui-tools.mjs |

**Counts:** 133 claims: 31 with a source (20 S alone, 11 S beside a derivation or a tool description), 53 D (44
alone, 9 with T), 42 T (one of them with Def) and 7 Def.
