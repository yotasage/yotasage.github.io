# Notes from M1.4b – Closed-form formulas and the validation table (2026-11-16)

## What was done

`lib/emsim/closedform.ts` ([modules.md](modules.md)): the formulas of [facts-formulas.md](facts-formulas.md) §1–§6,
each returning its values, its validity (the input outside the stated range and by how much, the published accuracy
per value) and `closedForms(setup)`, which reduces a setup to the formulas' inputs. `check-closedform.mjs` is the
group "Closed forms (M1.4b)" of `npm run check` (420 checks, about 10 s). The validation table of
[facts-cases.md](facts-cases.md) has "this tool" for C39–C43 and "Differences explained (M1.4b)"; C44–C45 wait for M1.7.

## How the comparison is made

- Formulas with thickness: `solveSetup` on rectangles without mask, the formula's dielectric on both sides.
- Zero-thickness formulas: sheets on the solver's own boundary. The solver sums a conductor's free charge as
  epsC·σ, right for one medium only; a sheet in the substrate's surface faces air and laminate, so the harness takes
  each sheet panel's free charge as σ(εu + εd)/2 + (εu − εd)·ε0·Ez, Ez from the images and the substrate's bottom
  face (collinear panels give none). Checked by Hammerstad–Jensen in air (Z01, 0.03 %) and in εr up to 30 (0.2 %).

| Formula (points) | Max error inside the stated range | Published | Exceeded |
|---|---|---|---|
| Hammerstad–Jensen, t = 0 (50) | εeff −0.23 % (w/h 5, εr 30), within the estimate | 0.2 % εeff, 0.13 % Z0 | 0 |
| Kirschning–Jansen (105) | Zodd +1.35 % (w/h 10, s/h 0.1, εr 2.35) | 0.6 % Z, 0.7/0.5 % εeff | 14, all at s/h 0.1 or w/h 10 with s/h 0.3 |
| Cohn coupled stripline, t = 0 (6) | 0.09 % = the solver's estimate | exact | 0 |
| Cohn thick stripline (38, 29 inside) | −1.13 % at the crossover | −1.24 % | 0 (outside up to −3.8 %) |
| Wheeler 1977 (84) | −4.2 % at t = 4w; −1.0 % for t/h ≤ 0.1 | 2 % | 1 (t ≪ w violated) |
| Hammerstad–Jensen with t (84) | Z0 0.13 / −0.53 / 1.2 / 3.2 % at t/h 0.05 / 0.1 / 0.2 / 0.4 (εeff to 8 %) | not stated | — |
| IPC-2141 microstrip (84, 60 inside) | −18.5 % (t/h 0.05) to −27 % (t/h 0.4); −8.8 % at C39 | not stated | — |
| IPC-2141 stripline (38, 4 inside) | −1.1 % (narrow strips only; outside it fails) | not stated | — |
| IPC-2141 dual stripline (9) | +10 to +39 % | not stated | — |
| IPC-2141 embedded (12) | corrected sign +8 to +15 %, printed −0.1 to +15 % | not stated | — |
| CPW, finite substrate (24) | εeff −2.8 %, Z0 +1.3 % (w/h 2, g/h 1) | not stated | — |
| CPWG (24) | εeff +0.8 % | not stated | — |

**Exceedances:** Kirschning–Jansen at its narrowest gap (s/h = 0.1) is up to 1.35 % (Zodd, wide strips, low εr) and
0.7 % (Zeven, narrow strips, high εr) from the static solution; the solver gives the same to 0.01 % at M = 2, 4 and 8,
so it is the formula's (fitted to hybrid-mode data, whose own accuracy at the corner of the range is not stated). Two
more at w/h 10, s/h 0.3 by 0.02 %. Wheeler's one is t = 4w, against the stated assumption t ≪ w. Both are in
`KNOWN`; any other exceedance fails the check.

**Decisions.** IPC-2141's embedded microstrip and dual stripline are **left out** of `closedForms` (kept as functions
for the harness): the embedded form's printed sign is unphysical and neither sign comes within 8 % for covers of
0.1–2 h (the surface formula is closer), the dual form is 10–39 % high. Cohn's wide-strip formula at t = 0 is 0.4 %
**below** the exact line at w/b = 0.5 (facts-formulas.md §5 says "high": a slip there).

## What M2.3's calculator comparison must show

- Each formula's value beside the field value, with "inside its range" or the input outside it, and the published
  accuracy or "not stated"; `neglects` (mask, copper thickness for K–J and Cohn coupled, finite grounds) as the main
  reason for a difference: on the owner's boards the mask (7–9 %) and K–J's missing thickness (13 %) dwarf the
  formulas' own errors.
- The reduction used (mean width of the trapezoid, series εr), from `ClosedForms.notes`.
- For pairs say that K–J is a zero-thickness value (16 Ω above at C41 from thickness alone).

## The owner's cases (preset JLC061611-3313A, M = 2)

C39 51.50 ± 0.05 Ω (target 50 at 5.42 mil; 50 Ω at 5.77 mil), C40 = C39; C41 Zdiff 103.36 ± 0.15 Ω (target 100 at
4.36/8 mil, 103.31 there; 100 Ω at 4.69 mil with the 0.2 gap), C42 = C41; C43 80.02 ± 0.32 Ω. KiCad's stackup as read
is within 0.4 Ω of the preset (εr 4.3 and its thinner mask cancel the missing trapezoid). Causes: mask −3.5 / −9.2 Ω,
trapezoid +1.0 / +2.9 Ω, εr 4.3 −1.0 / −1.7 Ω, copper 1.6 mil −0.5 / −1.7 Ω (C39 / C41).

## Open questions for the owner

- JLCPCB's adjusted width for the carrier (the image in the email) and which numbers of the mezzanine differed:
  then the difference to JLCPCB can be split between copper (1.6 mil), εr frequency and the mask model.
- Saturn PCB Toolkit values for C39/C41 (facts-cases.md "Inputs for the owner") would add a second calculator.
- Left for later: BL85 (thickness correction for coupled microstrip, Gupta's CPW εeff with t, IPC-2141A).
