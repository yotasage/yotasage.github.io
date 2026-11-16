# Notes of step M2.4a – first theory, content (2026-11-16)

## What was written

[theory.md](theory.md) (index, topics 0–3), [theory-2.md](theory-2.md) (topics 4–6), [theory-lines.md](theory-lines.md)
(113 short lines), [claims.md](claims.md) (133 claims: 31 with a source, 53 derived, 42 tool descriptions, 7
definitions). Topic ids: `how-to-use`, `transmission-lines`, `field-solver`, `pairs` (`pair-definitions`, `coupling`,
`two-speeds`), `structures` (`trapezoid`, `solder-mask`, `coplanar-ground`, `copper-thickness`), `calculators`
(`closed-forms`, `jlcpcb-calculator`), `tolerances`. New source: `JLCPCBCalc` (the online calculator read in M1.4c,
ref S of presets.ts) in references.bib and sources.md.

## For M2.4b

- **Equations to register** (TeX and live fields in the topics' tables): `telegraph`, `z0-lc`, `delay-lc`, `eeff-c`,
  `l-c0`, `v-eeff`, `lambda-eeff`, `getsinger`, `getsinger-limit`; `charge-potential`, `error-shown`, `order`;
  `mixed-mode-vars`, `zodd-sym`, `zeven-sym`, `zdiff-zodd`, `zdd-zc`, `zcc-zc`, `zdc-zc`, `zdiff-b`, `ztdr`, `kb`, `kf`,
  `fext-pulse`, `eeff-mode`, `mode-skew`; `pct-diff`, `parts-sum`; `sens`, `share`, `corners`, `rss-sigma`,
  `mc-normal` (33).
- **New values needed:** the three levels' Z0 for `error-shown`/`order` (`levelValues` of each `bem.levels[i]`);
  h and εr under the trace for `getsinger` (`closedForms(setup).reduced`); the calculator parts for `parts-sum` (the
  Calculators panel's solves, shared or redone on channel `calc`); the mask's effect live would need a solve with
  `masked: false` (else static text); the tolerance numbers from the Tolerance tool's last run (else static).
- **Figures:** default field lines (topic 1) and an L–C ladder; the panels of two levels (2); odd and even field lines
  of the pair (3); |E| with and without mask, the trapezoid close up (4); the parts waterfall (5); the ranking bars
  with corners and ±2σ (6). The Monte Carlo histogram is BL107.
- **Links from the Calculators panel** (notes-M2.3b.md "For M2.4"): the "as JLCPCB's calculator" sentence →
  `#solder-mask`, `#trapezoid`; the reduction → `#field-solver`; K–J's note and the copper sentence →
  `#copper-thickness` (it links on to `#coupling`); ranges and accuracy → `#closed-forms`.
- **Status line** of the page still says targets and tolerances come next: update it with the theory.
- **Harness:** every short line's link has a target; every citation resolves; live numbers equal the engine in Node;
  the static numbers below equal the engine on the default setups to the digits shown.

## Numbers checked against the engine

Scratch scripts run by `npx tsx` from `scripts/harness/emsim/` (M = 2; D = 0.1377 mm microstrip, P = pair 0.11/0.2
mm, both on L1 of JLC061611-3313A over L2, mask on). Text value → engine → where.

| Text | Engine | Claim |
|---|---|---|
| D: 51.50 ± 0.05 Ω, εeff 3.298, 6.058 ps/mm | 51.4976 ± 0.047 regular, 3.29814, 6.05779 | 2, 22, 41, 44 |
| D: C 117.6 pF/m, L 312.0 nH/m | 117.632, 311.961 | 22 |
| λ at 10 GHz 16.5 mm; v | 16.51 mm; 1.6508 × 10⁸ m/s | 23 |
| Getsinger 0.05 % / 0.3 % at 10 / 25 GHz, limit ≈ 18 GHz at 0.17 % | 0.052 %, 0.321 %, 17.90 GHz, δ 0.166 % (fp 222.7 GHz) | 25 |
| P: Zdiff 103.36 ± 0.15 irregular, Zcm 30.91, Zodd 51.68, Zeven 61.82, Zc11 56.75 | 103.364 ± 0.15, 30.908, 51.682, 61.815, 56.749 | 41, 52 |
| P: kb 4.5 %, kf −0.163 ps/mm, FEXT −0.16 V | 0.04461, −1.6267 × 10⁻¹⁰ s/m; −0.163 V | 61 |
| stripline pair kf −4 × 10⁻⁵ ps/mm; εeff 4.128 both | −3.97 × 10⁻¹⁴ s/m; 4.12824 / 4.12834 | 62, 65 |
| P modes εeff 3.08 / 3.44, 5.86 / 6.18 ps/mm, 33 ps per 100 mm | 3.0818 / 3.4352, 5.8558 / 6.1824, 32.66 | 64 |
| stripline 4.13, 6.78 ps/mm, 38.44 Ω; embedded 57.24 Ω | 4.1284, 6.7775, 38.437, 57.238 | 68, 69 |
| trapezoid: D −0.98, P −2.85 Ω | −0.976, −2.849 | 72 |
| mask: D 54.98 → 51.50 (3.48, 6.3 %), P 112.52 → 103.36 (9.15); εeff 3.30 / 2.89 | 54.981, 9.154, 2.8935 | 75, 76 |
| cpwg g 0.6 / 0.2 / 0.1: 51.43 ± 0.17, −1.1, −4.8 Ω | 51.425 ± 0.17, 50.375, 46.735 | 80 |
| thickness: P −16.4, D −5.3 Ω against sheets | −16.40, −5.33 (check-closedform.mjs) | 84 |
| bare D: H–J 54.06, field 54.16, Wheeler 54.33, IPC 49.38 (−8.8 %) | 54.056, 54.161, 54.332, 49.382 | 94 |
| D: H–J 55.85, IPC 51.24; P: K–J 132.3 | 55.847, 51.244, 132.251 | 95, 96 |
| as the calculator: D 50.06 ± 0.06, P 100.01 | 50.0587 ± 0.058, 100.0075 | 102, 106 |
| parts +0.94, +0.51, +0.25, −0.27, together +1.44 | 0.940, 0.509, 0.245, −0.267, 1.439 | 105 |
| target 5.435 mil (0.1380 mm); on the preset 0.1465 mm | 5.4350 mil; 0.14653 | 108, 109 |
| ranking ±2.87, ∓2.42, ∓0.98, ∓0.49, ∓0.34 Ω; shares 53 / 38 / 6 % | 2.871, −2.421, −0.976, −0.488, −0.343; 0.533, 0.379, 0.062 | 118, 119, 131 |
| corners 44.54 – 59.37 Ω | 44.543, 59.373 | 121 |
| MC median 51.44, 95 % 49.06 – 54.24, sd 1.31; RSS/3 1.31 | 51.444, 49.057, 54.243, 1.3127; 1.3105 | 124, 125 |

No number disagreed with the engine. Numbers not from the engine have a source (claims.md): JLCPCB's 5.42 mil,
4.36 / 8 mil, 49.958 Ω and the ±0.5 % search (JC), 0.33 % over ten queries (JC, M1.4c), the 0.7 / 0.5 mil, 1.2 / 1.0 mil,
εr 4.1 / 4.3 / 3.8 and 0.035 mm / 1.6 mil (JC, JG, JI), ±10 % / ±5 % (JK), 3 / 10 / 20 % (`Renbi2011`), the formulas'
ranges and accuracies (Q, `WikiMicrostrip`, `KirschningJansen1984`, `IPC2141`), the placeholders (tools.ts).
