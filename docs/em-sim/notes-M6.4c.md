# EM simulation – notes of step M6.4c (2026-11-17)

The verification of M6: our FDTD against the openEMS fixtures of M6.4a on every fixture, the limits frozen from it,
and the via model's range (BL92, BL90). Harness only, nothing on the page but one sentence of the via theory (the
1.5 mm threshold). The full table, the limits with their reasons and the sweeps: [fullwave-verify.md](fullwave-verify.md).

## What was built
- `compare-openems.mjs` (with `compare-lib.mjs` and the browser entry `webgpu/compare-gpu.mts`): 18 FDTD runs on
  WebGPU (0.3–3.0 M cells, 1–9 s each), the model on the same, `openems/compare.json`. `--cache <dir>` keeps the records.
- `check-compare.mjs`, group "Full-wave against openEMS (M6.4c)" (68 checks, a few seconds): openEMS's sections, TDR
  windows and notch and the model re-computed from the fixtures, the stored FDTD numbers held to the 43 limits, and
  `RETURN_NEAR_MM` held to the stored sweep.
- `model.ts`/`materials.ts`: the harness option `staircase` (cut edges whole or copper, as openEMS meshes metal).

## Headline numbers (openEMS / FDTD / FDTD staircased / model)
- C44 section 68.9 / 73.1 / 72.5 / 49.7 Ω, 13.9 / 12.6 / 13.3 / 9.9 ps; TDR peak 61.9 / 62.4 / 62.8 / 52.2 Ω.
- No returns: 99.3 / 108.9 Ω, TDR peak 76.4 / 76.5 Ω (the model refuses).
- Stub notch 21.6 / 22.9 / 22.0 / 21.8 GHz. Pair Sdd TDR 101.9–107.3 / 102.7–108.2 Ω (model 92.6–103.6).
- LVDS line Zdiff 103.39 / 102.41 Ω, Zcm 31.00 / 30.78 Ω; modal εeff: openEMS +5.7 / +5.0 % over the 2D solver,
  ours −2.0 / −0.5 % under it (BL162).
- Above 15 GHz the C44 via loses power into the plane cavity in both full-wave solvers (\|S21\| −2.7 / −2.6 dB at
  20 GHz); the model shows nothing.

## Frozen limits (all held, worst 0.82 of its limit)
TDR 2.5 Ω; \|ΔS11\|, \|ΔS21\| 0.10 to 10 GHz and 0.15 to 20 GHz; section Z and delay 12 %; notch 8 %; staircased
\|ΔS\| 0.05 to 20 GHz and notch 3 %; Zdiff, Zcm 2 %; modal εeff 10 % against openEMS, 3 % against the 2D solver.
Nothing above 20 GHz is barred (resonances, mesh-dominated).

## Thresholds before → after
| Constant | Before | After | Evidence |
|---|---|---|---|
| `RETURN_NEAR_MM` | 2.0 (provisional) | **1.5** | antipad 0.8 sweep: model Z −1.2 / +2.5 / +5.5 / +8.2 %, range 15.4 / 13.0 / 9.2 / 6.7 GHz at 0.8 / 1.2 / 2.0 / 3.0 mm |
| `BAND_LEVEL` (stub, shared antipad) | 0.1 | 0.1 | notch within 1 %; 1 dB lost from 0.55·f_res (BL166); no unshared pair to compare |
| `LUMPED_FRACTION` (λ/8) | 8 | 8 | Cartier's lumped rule kept for the flags; the model's range is half of `valid.fMax` (BL165) |
| `SHARED_ANTIPAD_HZ`, k12 | 40 GHz | 40 GHz | not measured (one shared-antipad pair only) |

## BL90's size
A series inductance per feed: 0.02 / 0.09 / 0.21 nH for 0.1 / 0.3 / 0.6 mm over the antipad; on C44 it explains
the whole 50 against 69 Ω (the model's C is within 1 % of openEMS's, its L is half). The 145 Ω-line estimate
overshoots (85.8 Ω) because it removes capacitance that stays. BL90 updated with these numbers.

## For M7 (the page)
Offer a full-wave run, and say why, when: a feed crosses its antipad by more than about 0.1 mm (the via's Z reads low:
−15 % at 0.3 mm, −31 % at 0.6 mm; `feed-over-antipad`); the nearest return is beyond 1.5 mm (`return-far`); no
return (`no-return`); the edge's band reaches above about 15 GHz (BL165); a stub resonates within about twice the
band. Show the full-wave result with "checked against openEMS within" the limits above.

## Left for later
BL165 (the model's band from the cavity), BL166 (the stub flag's onset), BL167 (conformal against staircase, a finer
openEMS fixture). BL92 done; BL90 and BL162 updated.
