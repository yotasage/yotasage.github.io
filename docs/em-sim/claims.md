# EM simulation – claims checklist (theory and short lines)

Every factual sentence of [theory.md](theory.md), [theory-2.md](theory-2.md) and [theory-lines.md](theory-lines.md),
with where it comes from (step M2.4a; M2.4b adds the sentences the page itself adds); step M4.1 adds those of
[theory-vias.md](theory-vias.md) and [examples.md](examples.md) (134–241). The page leaves the `⟨n⟩` markers
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

## Vias (theory-vias.md §7–§13, step M4.1)

Abbreviations as above, and: V = the default via (0.6/0.3, Ø1.8, two returns at 0.8, 2 mm feeds), VP = the via-pair
preset with the 0.11/0.2 pair's feeds, V25/VP25 = the same with 25 mm feeds, E = V leaving on L3 with the L1 feed only,
Eb = E backdrilled from the bottom 1.2 mm deep. "engine" = the via model at its defaults (35 ps, 50 Ω ports, level 1),
listed in notes-M4.1.md "Numbers checked". Equation ids are those of [equations-list.md](equations-list.md).

| # | Kind | Where it comes from |
|---|---|---|
| 134 | Def + T | engine.md §6 (barrel, returns, planes) |
| 135 | T | engine.md §6.2; `viacut.ts` (circles in the 2D solver) |
| 136 | D | `via-barrel-z`, `via-barrel-delay` |
| 137 | D | engine V: `barrel.zVac` 127.357, pieces 59.706 (εr 4.55), 62.897 (4.1) |
| 138 | S + D | `WikiCapacitance` (concentric cylinders); `via-coax` |
| 139 | D | `via-quasi-coax` (facts-formulas.md §7); 60.839 against 59.706 (+1.9 %) |
| 140 | D + T | `via-req`; `viacut.equivalentRadius`; engine 1.2548 mm |
| 141 | D | `via-section-l`, `via-section-c`, `via-section-z`, `via-section-delay` |
| 142 | D | engine V: `lumped` L 0.6806 nH, C 269.74 fF, lineC 179.79, dCsum 89.95, z 50.229, delay 13.549 ps |
| 143 | S | `Fan2014` abstract (V3) |
| 144 | D | `via-section-pair`, `zdiff-zodd`; engine.md §6.2 |
| 145 | D | engine VP: pieces' zdiff 92.232 (core), 97.161 (prepreg); `lumped` 83.492, 36.628, 12.592 ps |
| 146 | D | engine.md §5, §6.3 (geometry of pads and antipads) |
| 147 | D + T | `via-dc`; `axisym.ts` windows (notes-M1.6.md), notes-M1.7.md "The wall" |
| 148 | T | engine.md §5; `axisym.ts` |
| 149 | D | engine V: `nodes` 15.31, 14.33, 15.34, 15.34, 14.33, 15.31 fF, sum 89.95 |
| 150 | D | engine V: 269.74 / 179.79 = 1.50; 50.229 against 59.706 |
| 151 | D + T | `via-target`; engine `viaTarget(V, 'z', 50, 'antipad')` Ø1.75828 mm, 50.0000 Ω; `ViaTarget.tsx` |
| 152 | S | `Vardapetyan2020` abstract (literature.md, Vias) |
| 153 | D | engine VP: `nodes` L1 31.49, L6 31.48, L2 −4.47, L5 −4.45 fF; dCsum 54.04 |
| 154 | T | engine.md §6.3, solver.md §5.2; `barrel.k12` 0.27399 |
| 155 | S | `Kok1993` abstract (literature.md, Vias) |
| 156 | S | `Fan2014` abstract (V3: a controlled return path) |
| 157 | D | facts.md §2 ("Plane-pair TM0") |
| 158 | D | `cavity-f`; facts.md §2 (50 × 50 mm, εr 4.3: 1.446 GHz) |
| 159 | S | `Chada2009` abstract (literature.md, Vias) |
| 160 | S | `Archambeault2004` abstract (V2) |
| 161 | T | `viamodel.ts` (`no-return` refuses, `RETURN_NEAR_MM` 2.0, BL92); notes-M1.7.md "Flags" |
| 162 | D | engine V with the returns at ±2.5 mm: core piece 108.784 Ω, section 68.626 Ω (flag `return-far`) |
| 163 | T | notes-M1.7.md "The wall"; engine.md §5 |
| 164 | T | notes-M1.7.md (`wall-rule`) |
| 165 | D + T | notes-M1.7.md "Flags" (`return-in-antipad`, C44: 0.9 − 0.65 = 0.25 mm) |
| 166 | S | `RimoloDonadio2009b` abstract (literature.md, Vias) |
| 167 | S + T | `Miller2004` abstract (V5); flag `antipad-overlap` (notes-M1.7.md) |
| 168 | Def | – |
| 169 | S | `SteerVol2` §2.4, `Ellingson2018` §3.16 (facts-formulas.md §7) |
| 170 | D | `stub-quarter` |
| 171 | D | engine E: exit stub 1.335 mm, 9.188 ps, `fFormula` 27.210, `fRes` 21.791 GHz; \|S21\| −48.63 dB at 21.77 GHz (401 points) |
| 172 | D | engine E (21.79 < 27.21 GHz); `stub-zin` with a shunt C at the stub |
| 173 | S | `Huddar2021` abstract (V8) |
| 174 | Def + T | `via.ts` (the backdrill must be wider than the drill and may not reach the signal layer) |
| 175 | D | engine Eb: stub 0.1655 mm, `fRes` 215.18 GHz; S21 at 10.07 GHz −0.684 (E) and −0.0696 dB (Eb) |
| 176 | S | `Zhang2020` abstract (V7) |
| 177 | S | `Park2017` abstract (V9) |
| 178 | T | flag `stub-resonance` (notes-M1.7.md "Flags") |
| 179 | D + T | `tdr-rho`, `tdr-z`; `tdr.ts` (z = zRef·(1 + ρ)/(1 − ρ)) |
| 180 | D | `tdr-roundtrip` |
| 181 | D + T | `edge-f3`, `edge-band`; `tdr.ts`, `viamodel.ts` (sweep to the −60 dB point); engine f3 9.7036, last f 43.321 GHz |
| 182 | D | facts-formulas.md §8 |
| 183 | D | engine V25 (claim 184's numbers) |
| 184 | D | engine V25 via window: 15 ps 48.537 / 55.318, 35 ps 50.808, 100 ps 51.194 Ω |
| 185 | D | `tdr-z` with `z0-lc` on the local section (more C: lower Z; more L: higher Z) |
| 186 | D + T | engine V25 51.4975 Ω 60 ps before the via, trace 51.4976 Ω; ui-viaplots.mjs (notes-M3.2a.md) |
| 187 | D | `tdr-roundtrip`; engine V feed 1.7 mm, εeff 3.298: 20.60 ps |
| 188 | D | engine V with `feeds: 'none'`: 49.665–50.998 Ω (facts-cases.md C44) |
| 189 | T | `mixed.z0` [100, 100, 25, 25]; `lines.ts` `TDR_COMMON_OHM`; theory-lines.md (via-port, via-tdr-mode) |
| 190 | D | engine VP25: flat 103.361, dip 91.647 (35 ps), 88.290 (15 ps), 97.987 Ω (100 ps) |
| 191 | Def | `s-db` |
| 192 | T | engine.md §6.6; `viamodel.cascadeS`, `nport.abcdToS` |
| 193 | D | engine V: 10.07 GHz S11 −33.35, S21 −0.0020 dB; 25.02 GHz S11 −17.31 dB |
| 194 | D + T | a lossless reciprocal network has a unitary S; `check-viamodel.mjs` (unitarity < 1e-12) |
| 195 | S + D | `BockelmanEisenstadt1995` (not opened) beside `mixed-mode-s` and facts.md §5; `mixed.z0` |
| 196 | D | engine VP at 10.07 GHz: Sdd11 −19.35, Sdd21 −0.0507, Scc11 −10.33 dB |
| 197 | D + S | engine VP Scd21 −325 dB; `Zhang2020`, `RimoloDonadio2009b` abstracts |
| 198 | T | `ViaPlots.tsx` (faded beyond `valid.fMax`) |
| 199 | S + T | `Cartier2007` abstract (V1); `LUMPED_FRACTION` 8 in `viamodel.ts`; `lambda8` |
| 200 | D | engine `valid.fMax` V 29.452 GHz (0.597 mm window of L4, εr 4.55), VP 23.821 GHz |
| 201 | T | `viamodel.ts` flags (notes-M1.7.md "Flags") |
| 202 | S + T | `Duan2014` abstract (V6); `SHARED_ANTIPAD_HZ` 40 GHz |
| 203 | T | `viamodel.ts` assumptions; engine.md §6 |
| 204 | T | plan.md (M5–M7), engine.md §7 |
| 205 | T | flag `feed-over-antipad` (`viamodel.ts`, BL90) |

## Examples (examples.md, step M4.1)

Numbers from the engine at M = 2 (trace) and the via model's defaults, in notes-M4.1.md "Numbers checked".

| # | Kind | Where it comes from |
|---|---|---|
| 206 | D | engine D: 51.4976 ± 0.0466, εeff 3.29814, 6.05779 ps/mm |
| 207 | D | engine `inverse(D, 'z0', 50, 'w')` 0.146532 mm (5.769 mil); w 0.1465: 50.0053 Ω |
| 208 | D + S | 51.50 / 50 = 1.030; `JLCPCBCapabilities` (±10 %) |
| 209 | D | engine `asJlcpcbCalculator(D)`: 50.0587 ± 0.058 Ω, εeff 3.36309 |
| 210 | S | `JLCPCBCalc` (Si9000, 49.958 Ω at W1 5.421875 mil; notes-M1.4c.md) |
| 211 | D | 50.0587 / 49.958 = 1.0020 |
| 212 | D | engine `inverse` on the calculator's inputs: 5.43500 mil (0.138049 mm) |
| 213 | D | engine P: 103.364 ± 0.150 Ω, Zcm 30.908 |
| 214 | D + S | engine P Zodd 51.682, Zeven 61.815; `PolarAP157` |
| 215 | D | engine: a lone 0.11 mm trace 56.9035 Ω; P's Zc 56.7486, 5.0665; `zdd-zc` |
| 216 | D | engine `inverse(P, 'zdiff', 100, 'w')` 0.119134 mm (4.690 mil); w 0.1191: 100.012 Ω |
| 217 | D + S | engine 100.0075 ± 0.527 Ω; `JLCPCBCalc` (99.951 Ω at 4.35625 / 8 mil) |
| 218 | D | engine P `modes`: εeff 3.0818 / 3.4352, 5.8558 / 6.1824 ps/mm |
| 219 | D | as claim 145 |
| 220 | D | engine VP `lumped` (claim 145), dCsum 54.04 fF |
| 221 | D | engine `viaTarget(VP, 'zdiff', 100, 'antipad')`: 53.21–99.88 Ω over 0.270–3.270 mm |
| 222 | D | engine VP `nodes` (claim 153); at Ø3.27 flags `return-in-antipad`, `wall-rule`; `nearestReturn` 0.81 mm |
| 223 | D | engine `viaTarget(VP, 'zdiff', 85, 'antipad')` Ø1.37534 mm |
| 224 | D | engine VP: TDR minimum 91.589 Ω; VP25 flat 103.361, dip 91.647 Ω |
| 225 | D | engine VP25 at 15 and 100 ps: 88.290, 97.987 Ω |
| 226 | D | engine VP at 10.07 GHz (claim 196), Scd21 −325 dB |
| 227 | S | `JLCPCBCalc` (the inputs it sends; notes-M1.4c.md) |
| 228 | D | engine 50.0587 Ω |
| 229 | D | engine `jlcAllBut(D, 'er')` 50.9988 Ω (+0.9401) |
| 230 | D | engine `jlcAllBut(D, 'copper')` 50.5676 Ω (+0.5089) |
| 231 | D | engine `jlcAllBut(D, 'etch')` 50.3038 Ω (+0.2450) |
| 232 | D | engine `jlcAllBut(D, 'mask')` 49.7913 Ω (−0.2674) |
| 233 | D | `parts-sum`; 1.4266 against 1.4389 Ω |
| 234 | D | engine `calculatorParts(P)`: 1.7019, 1.6264, 0.7285, −0.7258; 3.331 against 3.357 Ω |
| 235 | D + S | claims 211, 217 (+0.20 %, +0.05 %); εr part 0.94 of 1.44 Ω; `JLCPCBCalcGuide` (3313 εr 4.1), `JLCPCBCalc` (4.3) |
| 236 | D | engine V25 as V (claims 137, 142) |
| 237 | D | engine V25 (claims 184, 186) |
| 238 | D | as claim 151 |
| 239 | D + T | engine E (claim 171), flag `stub-resonance`, band 25.012 GHz |
| 240 | D | engine E at 10.07 GHz: S21 −0.684, S11 −8.364 dB |
| 241 | D + T | engine Eb (claim 175), S11 −17.99 dB; no `stub-resonance` flag |

**Counts of M4.1:** 108 claims (134–241): 23 with a source (13 S alone, 10 S beside a derivation or a tool
description), 67 D (57 alone, 10 with T), 16 T (2 of them with Def) and 2 Def. [equations-list.md](equations-list.md)
carries its own sources and derivations per entry and has no `⟨n⟩`. **In all:** 241 claims.
