# Notes of step M1.4c – JLCPCB's impedance calculator reconciled (2026-11-16)

**Question.** On JLC061611-3313A, L1 ref L2, JLCPCB's online calculator gives 50 Ω at 5.42 mil and 100 Ω at
4.36 / 8 mil; this tool's preset gives 51.50 Ω and 103.31 Ω there (+3.0 %, +3.3 %). Which assumptions explain it?

## Answer: JLCPCB's inputs, read from the calculator itself

The calculator page posts each stack-up's inputs to `jlcpcb.com/api/jlcTools/impedance/calc` and shows what comes
back. The service is **Polar Si9000** (its error text: "SI9000计算阻抗失败"), models `W2_CoatedMicrostrip1B` and
`W2_DiffEdgeCoupledCoatedMicrostrip1B`. For the owner's case it sends, in mil:

| Input | JLCPCB sends | Preset (M1.4b) | Note |
|---|---|---|---|
| H1 (3313 prepreg) | 3.622 | 0.092 mm = 3.622 | same |
| Er1 | **4.3** | 4.1 | 4.3 in every request seen (3313, 1080, 2116, 7628 stack-ups), not the εr the page lists per material |
| T1 | **1.6** | 0.035 mm = 1.378 | the page's table for outer "1oz" = ½ oz base plated (1 oz base: 2.2) |
| W1 − W2 | **0.5** (0.25 per side) | 0.7 (0.35 per side) | user guide says 0.7; the live table says 0.5 (1 oz base: 1.0) |
| C1 / C2 / C3 | **1.0 / 0.6 / 1.0** | 1.2 / 0.6 / 1.2 | user guide says 1.2; the live table says 1.0 |
| CEr | 3.8 | 3.8 | same |
| reported width | **W1 (base)** | base | settles the owner's question in facts-cases "Inputs for the owner" |

The width is searched to ±0.5 % (`ZoTol`): Si9000 gives 49.958 Ω at W1 5.421875 and Zdiff 99.951 Ω at 4.35625 / 8.

## Evidence and residuals

This tool (M = 2) on exactly these inputs, against Si9000 at the widths it returned (table in facts-cases.md,
"Differences explained"): 50 Ω +0.20 %, 100 Ω pair +0.05 %, and out of sample 40 Ω +0.12 %, 60 Ω +0.33 %, Er1 4.1
+0.20 %, pairs at 90 / 110 Ω (gap 8) +0.06 / +0.11 %, at gap 5 and 12 mil +0.11 / +0.04 %; εeff within 0.15 %. Mean
+0.13 %, largest +0.33 %: the solvers agree, the 3 % is inputs. From JLCPCB's inputs to the preset one at a time
(C39 / C41, Ω): εr 4.1 +0.94 / +1.71, copper 0.035 mm +0.51 / +1.61, trapezoid 0.35 mil +0.25 / +0.72, mask 1.2 mil
−0.27 / −0.72.

Before the requests the two numbers alone were fitted by several pairs of assumptions (εr 4.31 with 1.6 mil copper;
width as the top without mask with εr 4.33; a 0.0889 mm prepreg), so a fit to two numbers was not evidence; the
requests are.

**How it was read.** Headless Edge, a fresh temporary profile, no login, cookies rejected; the page's own Calculate
(6 clicks on 4- and 6-layer settings; each click makes the page send one request per listed stack-up, about 20) and 10 direct requests with only
stack-up and width numbers, 2.5 s apart, the page's own headers. Nothing about the owner or the project was sent.
Scripts stayed in the session's scratch folder.

## For M2.3 (calculator comparison on the page)

Suggested words: "JLCPCB's online calculator uses Polar Si9000 with fixed inputs of its own: εr 4.3 for every
prepreg, 1.6 mil outer copper, a top 0.5 mil narrower than the base and solder mask 1.0 mil on the board and 0.6 mil
on the copper. With those inputs this tool gives the same impedance to within about 0.3 %. With the stack-up's own
εr (4.1 for 3313) and copper (0.035 mm) it gives about 3 % more, so its widths for a target come out a little wider
than JLCPCB's. Both are well inside JLCPCB's ±10 %." A switch or a second line "as JLCPCB's calculator" (Er1 4.3,
T 1.6 mil, 0.25 mil per side, mask 1.0/0.6/1.0) would let the owner match the order form: 50.06 Ω at 5.42 mil,
99.96 Ω at 4.36 / 8, 100.01 Ω at 0.11 / 0.2 mm.

## Proposed preset change (not made; for the fix agent)

The trapezoid and mask in the preset cite the user guide (facts-fab §1.7, §1.8), which the live calculator no longer
follows. Proposal: **trapezoid 0.25 mil per side, mask 1.0 / 0.6 / 1.0 mil** (εr 3.8), source "JLCPCB calculator
table, read 2026-11-16"; **keep εr 4.1** (the material's published value: 4.3 is the calculator's generic number, at
no stated frequency) and **t 0.035 mm** with `calc` 1.6 mil as now. Effect: C39 51.50 → 51.53 Ω, C41 (sheet) 103.31 →
103.32 Ω, C41 (0.11/0.2 mm) 103.36 → 103.38 Ω: the two changes nearly cancel, so the change is about citing what
JLCPCB uses, not the numbers. facts-fab §1.5–§1.8 should get a line each: Er1 4.3 in the calculator, the 0.5 mil and
1.0 mil, the solver is Si9000, the width is W1, and inner 1 oz in the same table is T1 1.2 mil with W1 − W2 0.8 mil
(for striplines, not checked here).
