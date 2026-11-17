# EM simulation – notes of step M6.5 (2026-11-17)

The via model corrected where M6.4c measured it wrong: the feed's run over its antipad (BL90) and the model's band
(BL165). Engine `lib/emsim/viamodel.ts` (VIAMODEL_VERSION 2); compare data `openems/compare.json` version 2 (step
M6.5: `model` is the corrected model, `modelM64` the model as M6.4c had it; the FDTD runs were made again, same numbers
within the GPU's rounding). openEMS was not run.

## 1. The run over the antipad (BL90)
- **Physics.** Over the opening the trace has no plane under it: its return current runs in the next plane beyond
  the opening (L5 for a trace on L1 over L2's), so its inductance per length is that of the same trace over that
  plane (the 2D solver with the cut plane replaced). Its charge stays: the opening's rim and the pad hold the line's C′
  there (M6.4c: the model's C within 1 % of openEMS on C44). So the run (ℓ = antipad radius − pad radius) is a line of
  the feed's C′ and that inductance, put in for the same length of feed taken off (a line of negative length, its exact
  inverse, so it also works with feeds 'none'); **ΔL = (L′ over the next plane − L′ of the feed)·ℓ** is its sum, added to
  `lumped`. A lumped ΔL instead rang with the pad's ΔC near 28 GHz and read C44 1.2 Ω
  higher in the TDR. A pair fed by single traces takes both L′ from the coupled pair of those traces at the via's pitch (over
  the opening the two close their loop through each other as much as through the far plane).
- **Numbers.** C44: ℓ 0.6 mm, L′ 0.312 → 0.827 nH/mm (the trace over L5 is 144.9 Ω), ΔL 0.309 nH per feed. C45: ℓ 0.36 mm,
  ΔL 0.185 nH per trace (coupled; Zdiff over L5 193.7 Ω).
- **An upper bound.** The opening is finite, so the trace's flux is less than over the whole far plane: against the
  FDTD sweep the run's ΔL is 0.052 / 0.155 / 0.309 nH for 0.1 / 0.3 / 0.6 mm where the full-wave shows about 0.02 /
  0.09 / 0.21 (openEMS 0.23). The local 2D cut (the plane with a gap of the opening's chord at each point of the run,
  integrated) gives 0.012 / 0.068 / 0.190: a lower bound (3D crowding at the rim missing; the second plane's opening
  adds 1 %). Kept the upper bound: it holds C44 within the frozen limits; the lower one would put C44 at about −15 % of
  FDTD. BL168.
- `feed-over-antipad` now says what was added (info) and warns only beyond 0.6 mm (`OVER_CHECKED_MM`) or when no
  plane beyond can be found. It fires with feeds 'none' too when a trace is given.

## 2. The band from the plane cavity (BL165)
- **Physics.** Between two planes the barrels and return vias are posts in a parallel-plate guide whose TEM radial
  mode has no cutoff. A z-current I gives Ez = −(ωμ0/4)·I·H0⁽²⁾(kρ), so the plate-pair impedance between posts is
  Zij = (ωμ0h/4)·H0⁽²⁾(kρij) (ρii the post radius, εr the layers in series). Shorting the returns, the barrels see
  Zeff = Zbb − Zbr·Zrr⁻¹·Zrb; its static part jωL0 is in the model's lines, ΔZ = Zeff − jωL0 is what it leaves out.
  `valid.cavity` is the lowest f where the cascade with ΔZ in the barrel (×share² when the signal crosses only part of
  the cavity) differs from the model's by 0.1 in any S entry (`CAVITY_DS`, M6.4c's measure of where it leaves the
  full-wave results); `valid.fMax` = min(λ/8 of the window, cavity). `valid.lumped` keeps λ/8 (the f_valid equation).
- **Checks of the physics.** The thin posts' static L against FDTD (antipad 0.8, returns 0.8 / 1.2 / 2 / 3 mm):
  0.558 / 0.704 / 0.887 / 1.033 against 0.557 / 0.716 / 0.918 / 1.063 nH. Its loss on C44 is about half of openEMS's
  (2.2 / 6.4 % at 10 / 20 GHz against 3.7 / 13.1 %), on C45 similar (1.3 against 2.3 % at 20 GHz).
- **Band against where the model leaves FDTD** (antipad 0.8): 18.3 / 13.5 / 9.2 / 6.9 GHz against 19.1 / 12.5 / 8.0
  / 5.9 GHz (M6.4c's fit was 17.6 − 3.7·d). C44: 29.5 → **20.8 GHz**, where the model leaves openEMS at 16.2 GHz;
  C45: 23.8 → 23.2 GHz (leaves openEMS at 22.9).

## 3. Before → after (model / openEMS / FDTD)
| | M6.4c model | M6.5 model | openEMS | FDTD |
|---|---|---|---|---|
| C44 section Z, delay | 49.7 Ω, 9.9 ps | **67.9 Ω, 15.1 ps** | 68.9, 13.9 | 73.1, 12.6 |
| C44 TDR window (35 ps) | 51.8–52.2 Ω | **53.9–61.3** | 54.0–61.9 | 54.2–62.4 |
| C44 TDR \|Δz\| to openEMS; \|ΔS11\|, \|ΔS21\| to 10 / 20 GHz | 9.8 Ω | 1.3 Ω; 0.02, 0.07 / 0.14, 0.17 | – | 1.3 Ω |
| C44 leaves openEMS (\|ΔS\| > 0.1) | 2.9 GHz | 16.2 GHz | – | – |
| C45 Sdd TDR window | 92.6–103.6 Ω | **96.9–105.6** | 101.9–107.3 | 102.7–108.2 |
| C45 leaves openEMS; \|ΔSdd\| to 20 GHz | 6.8 GHz | 22.9 GHz; 0.075, 0.027 | – | – |
| stub / backdrilled: TDR \|Δz\| | 15.6 / 21.6 Ω | 6.3 / 15.8 Ω | – | 1.9 / 1.6 Ω |

Within the frozen limits (fullwave-verify.md §3): C44's section Z and delay (−1.5 %, +9 %), its TDR over 0–100 ps
(1.3 Ω) and \|ΔS\| to 10 GHz, the TDR peaks of C44 and C45 (−0.6, −1.7 Ω), C45's \|ΔSdd\| to 20 GHz, the stub's notch
(21.8 against 21.6 GHz). Not within: C44's \|ΔS21\| to 20 GHz (0.17 against 0.15: the cavity's loss, which the model
leaves out, and the section 1.2 ps slow from the upper-bound ΔL); C45's TDR window (|Δz| 5.0 Ω: its minimum 5 Ω low,
the pads' coupling estimate). The stub and backdrilled vias exit on L3, whose
stripline also runs 0.6 mm under L2's opening; the model has no trace for it there (BL169).

## 4. On the page
The via's section reads 69.4 Ω (was 50.23; as one element, ΔL added); the TDR at 35 ps peaks at the via instead of
dipping; "The model holds to 20.8 GHz (the plane cavity …); its lumped parts to 29.5 GHz (λ/8)" in the results, the
report and the S plots' fade; the f_valid equation is the λ/8 part. Examples, theory and claims updated where they
quoted the old section (list in the commit).
