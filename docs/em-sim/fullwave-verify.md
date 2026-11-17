# EM simulation – full-wave verification against openEMS (step M6.4c, 2026-11-17)

Part of [fullwave.md](fullwave.md) (§14.6 links here). Our FDTD and the quasi-static via model against the openEMS
fixtures of M6.4a ([notes-M6.4a.md](notes-M6.4a.md)); the limits frozen from it; the via model's measured range.
Data: `scripts/harness/emsim/openems/compare.json` (written by `compare-openems.mjs`, which runs our FDTD on WebGPU;
held by the check group "Full-wave against openEMS (M6.4c)", `check-compare.mjs`). openEMS was not run again.

## 1. How the three are compared
- **Same structure:** `defaultSetup()` with the fixture's via (C44 preset; without returns; exit L3; the L3 stub
  backdrilled 1.2 mm, Ø0.5; the C45 pair with its feeds along −x/+x as the fixture, BL161), our FDTD at tr_min 30 ps
  (S valid to 41 GHz), conformal barrels as the product, and again with `staircase: true` (harness option of
  `model.ts`: every cut edge whole or copper, as openEMS meshes metal) to split mesh error from model error.
- **Same planes:** our waves at the second measurement plane are moved to the via axis with our feed's own Z and γ
  (from both planes' V and I) and out through the **fixture's own feed** (its stored Z and εeff) to its planes 3 mm
  from the axis, at 50 Ω. The model's core (feeds 'none', pad edge to pad edge) gets the fixture's feed from the pad's
  edge. So the three differ only in the via; the feeds' own errors (ours −5.8 % in Z, BL153; openEMS's +3.4 %, BL162)
  drop out.
- **Section:** the fixture's feeds (3 mm each) taken off again, Z = √(B/C) and delay over 1–10 GHz, as viacases.py.
  **TDR** at 35 ps by tdr.ts from S on the fixture's grid (0–40 GHz) for all three (ours of openEMS's S is within
  0.2–0.6 Ω of the fixture's own TDR, whose grid differs).

## 2. The table (openEMS / FDTD / FDTD staircased / model / model with the BL90 estimate)
| Fixture | section Z (Ω) | delay (ps) | TDR window (Ω) | \|S11\| dB at 5 / 10 / 20 GHz | \|S21\| dB at 10 / 20 / 30 GHz |
|---|---|---|---|---|---|
| via-c44 | 68.9 / 73.1 / 72.5 / 49.7 / 85.8 | 13.9 / 12.6 / 13.3 / 9.9 / 11.5 | 54.0–61.9 / 54.2–62.4 / 54.2–62.8 / 51.8–52.2 / 54.9–65.7 | −14.8 −25.8 −4.8 / −14.2 −21.1 −4.8 / – / −27.8 −36.4 −37.2 / −12.2 −15.6 −5.0 | −0.18 −2.70 −5.3 / −0.18 −2.61 −6.1 / – / 0.00 0.00 −0.31 / −0.12 −1.65 −3.8 |
| via-c44-noret | 99.3 / 108.9 | 13.0 / 11.7 | 54.2–76.4 / 53.8–76.5 | −10.4 −12.3 −8.0 / −10.1 −11.4 −8.2 | −1.25 −2.6 −7.4 / −1.32 −2.5 −7.5 (model refuses: `no-return`) |
| via-c44-stub | – | – | 46.3–59.8 / 47.7–60.3 / model 37.6–55.2 | −23.4 −12.6 −1.1 / −20.9 −14.4 −1.1 / model −18.8 −8.1 −0.3 | −0.50 −17.2 −7.9 / −0.43 −13.7 −10.6 / model −0.73 −11.8 −1.3 |
| via-c44-bd | – | – | 54.2–68.9 / 54.3–70.4 / model 47.2–53.7 | −12.4 −10.7 −17.1 / −11.9 −10.0 −14.3 / model −34.4 −18.9 −8.6 | −0.45 −0.33 −1.4 / −0.55 −0.41 −1.2 / model −0.06 −0.64 −0.48 |
| via-c45 (Sdd, 100 Ω) | – | – | 101.9–107.3 / 102.7–108.2 / 103.5–108.8 / 92.6–103.6 / 106.4–113.5 | Sdd11 −25.9 −30.8 −11.9 / −24.7 −32.1 −11.6 / – / −30.5 −16.9 −15.4 / −19.8 −44.7 −8.2 | Sdd21 0.00 −0.29 −0.93 / 0.00 −0.32 −1.06 / – / −0.09 −0.13 −0.08 / 0.00 −0.72 −2.1 |

Stub notch (\|S21\| minimum, 5–40 GHz): openEMS **21.6 GHz** (−22.2 dB), FDTD 22.9 (+6.0 %), staircased **22.0
(+1.9 %)**, model 21.8 (−56.7 dB: lossless). Backdrilled: no notch below 40 GHz in any. The pair's Scc21 and
the mode conversion: openEMS's pair is solved by symmetry, so its Sdc is 0 by construction; ours peaks at 0.028.

**LVDS pair line (msl-c41, 10 mm, 4-port):** Zdiff 103.39 / **102.41 (−0.9 %)** / 2D 103.36 Ω; Zcm 31.00 / 30.78
(−0.7 %) / 30.91; εeff odd 3.259 / 3.021 / 2D **3.082**, even 3.606 / 3.417 / 2D **3.435** (also from the phase of
Sdd21 and Scc21). openEMS is the outlier on the modal εeff (+5.7 % and +5.0 % over the 2D solver, BL162); ours is
−2.0 % and −0.5 % under it.

**Mesh against model:** with staircased barrels our \|ΔS\| to openEMS up to 20 GHz drops from 0.092 to 0.029 (C44),
0.094 to 0.034 (stub) and 0.066 to 0.015 (pair), the notch from +6.0 % to +1.9 %: the remaining FDTD–openEMS
difference is openEMS's staircase (its own coarse → fine mesh moved the section's delay by 7 %, Z by 2 %; Richardson
puts C44's converged section near 70.3 Ω and 12.9 ps, where our conformal 73.1 Ω and 12.6 ps are +4 % and −2 %; BL167).

## 3. Frozen limits (FDTD against openEMS; `compare-openems.mjs` LIMITS)
| Quantity | Limit | Worst measured | Reason |
|---|---|---|---|
| TDR (35 ps) \|Δz\| over 0–100 ps | 2.5 Ω | 1.92 Ω (stub) | openEMS's mesh moves its window 0.4–0.6 Ω, conformal vs staircase 0.4 Ω, plus the 1.3 ps delay shift |
| \|ΔS11\|, \|ΔS21\| (Sdd) to 10 GHz | 0.10 | 0.075 (stub S21) | the barrel delay difference (1.3 ps → 0.08 at 10 GHz) |
| the same to 20 GHz | 0.15 | 0.094 | as above, doubled in phase; the cavity loss above 15 GHz agrees (−2.6 against −2.7 dB) |
| section Z, delay (symmetric single vias) | 12 % | +9.7 %, −9.9 % (no returns) | openEMS's 7 % mesh change in delay; a radial-line section is ill-defined without returns |
| stub notch | 8 % | +6.0 % | the stub's delay follows the barrel's (staircase −5 %) |
| staircased: \|ΔS\| to 20 GHz, notch, TDR | 0.05, 3 %, 2.5 Ω | 0.034, +1.9 %, 1.66 Ω | same mesh as openEMS: what is left is the model |
| pair line Zdiff, Zcm | 2 % | −0.9 % | both within 0.3 % of the 2D solver |
| modal εeff against openEMS / the 2D solver | 10 % / 3 % | −7.3 % / −2.0 % | openEMS +5.7 % over the 2D solver (BL162); ours as M6.4b's statics |

Above 20 GHz nothing is barred: the C44 via resonates and radiates there, and the staircase alone changes \|ΔS21\| at
40 GHz from 0.35 to 0.06. 43 limits, all held; the worst at 0.82 of its limit.

## 4. The via model's range (FDTD sweeps on the C44 via, both brought to 3 mm 2D-solver feeds)
| Antipad, nearest return | FDTD Z / delay / L / C | model Z / delay / L / C | model left FDTD (\|ΔS\| > 0.1) |
|---|---|---|---|
| 0.8, 0.8 mm | 36.9 Ω, 15.1 ps, 0.557 nH, 0.410 pF | 36.4, 14.2, 0.517, 0.390 | 15.4 GHz |
| 0.8, 1.2 mm | 42.5, 16.8, 0.716, 0.396 | 43.6 (+2.5 %), 16.8, 0.734, 0.386 | 13.0 GHz |
| 0.8, 2.0 mm | 48.5, 18.9, 0.918, 0.390 | 51.2 (+5.5 %), 19.7, 1.007, 0.384 | 9.2 GHz |
| 0.8, 3.0 mm | 52.4, 20.3, 1.063, 0.388 | 56.7 (+8.2 %), 21.7, 1.227, 0.382 | 6.7 GHz |
| 1.2, 0.8 mm | 52.4, 13.0, 0.679, 0.248 | 44.3 (−15 %), 11.4, 0.504, 0.256 | 10.3 GHz |
| 1.8, 0.8 mm (C44) | 73.1, 12.6, 0.921, 0.172 | 50.3 (−31 %), 9.9, 0.499, 0.197 | 2.7 GHz |

- **Return distance (BL92):** with the feed over the antipad out (antipad 0.8), the model's Z is within 2.5 % to 1.2 mm,
  +5.5 % at 2 mm, +8.2 % at 3 mm, and its range falls with the distance. **`RETURN_NEAR_MM` 2.0 → 1.5 mm** (about 4 %
  and 11.6 GHz there, above the 35 ps edge's f3 of 9.7 GHz).
- **Frequency:** even at 0.8 mm the model holds only to about 15 GHz, where `valid.fMax` (λ/8 of the longest window)
  says 29.5 GHz: above it the two-return via loses power into the plane cavity (both full-wave solvers), no lumped
  part does. λ/16 of the window (14.7 GHz) matches; changing `valid.fMax` and the page's "(λ/8)" texts is BL165.
- **Feed over the antipad (BL90):** a series inductance of about 0.02 / 0.09 / 0.21 nH per feed for 0.1 / 0.3 /
  0.6 mm over the opening (openEMS: 0.23 nH at 0.6 mm), with the model's C right (C44: 0.199 against openEMS's
  0.201 pF). It is the whole of the single via's 50 against 69 Ω: model 49.7, openEMS 68.9, FDTD 73.1 Ω; TDR peak
  52.2 / 61.9 / 62.4 Ω; \|S11\| at 5 GHz −27.8 / −14.8 / −14.2 dB. The existing estimate (the part over the opening as
  the 145 Ω line over the next plane) gets the inductance within 10 % but removes capacitance that stays: 85.8 Ω, TDR
  65.7 Ω, so it overshoots by about half the excess. On the pair (stadium 1.22, pads 0.5) the same estimate brings the
  model's range from 6.8 to 16 GHz.
- **Stub:** the model's notch is right (21.8 against 21.6 GHz); openEMS's stub costs 1 dB from 11.9 GHz (0.55·f_res),
  3 dB from 14.0 GHz against its backdrilled twin. `stub-resonance` (f_res inside the −20 dB band) left as it is (BL166).
- **Shared antipad, pad coupling:** the pair fixture has one shared (stadium) antipad and no unshared twin, so the
  40 GHz threshold (Duan2014) and k12 are not measured here; left as they are.

## 5. What the page should say (M7)
Suggest a full-wave run when any of: a feed crosses its plane's antipad by more than about 0.1 mm (the model's Z then
reads low: −15 % at 0.3 mm, −31 % at 0.6 mm); the nearest return is beyond 1.5 mm; there are no returns; the edge's
band reaches above about 15 GHz (two returns at 0.8 mm; less with returns further away); a stub resonance lies within
twice the edge's band. The full-wave run itself is within the limits of §3 of openEMS.
