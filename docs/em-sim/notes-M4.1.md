# Notes of step M4.1 – teaching content: vias, equations, examples (2026-11-16)

## What was written

[theory-vias.md](theory-vias.md) (§7–§13, ids `via-line`, `via-pads`, `via-return`, `via-stubs`, `via-tdr`,
`via-sparams`, `via-limits`; indexed in theory.md), [equations-list.md](equations-list.md) (the 33 registered ids with
derivation steps, 28 new: 61), [examples.md](examples.md) (five examples), [claims.md](claims.md) 134–241 (108: 23 with
a source, 67 derived, 16 tool descriptions, 2 definitions). No new citation: every key used is in references.bib.
BACKLOG: BL133 (via target by pad diameter), BL134 (live cavity resonance needs a board size).

## For M4.2 (registry, derivations, examples as data)

- **Register the 28 new ids** (text form and steps in equations-list.md, TeX and live fields in theory-vias.md):
  `via-barrel-z`, `via-barrel-delay`, `via-coax`, `via-quasi-coax`, `via-req`, `via-section-l`, `via-section-c`,
  `via-section-z`, `via-section-delay`, `via-section-pair`, `via-dc`, `via-pad-coupling`, `via-target`, `target`,
  `cavity-f`, `stub-zin`, `stub-quarter`, `lambda8`, `edge-f3`, `edge-band`, `tdr-rho`, `tdr-z`, `tdr-roundtrip`,
  `abcd-line`, `abcd-shunt`, `s-abcd`, `s-db`, `mixed-mode-s`; add `steps` to the 33.
- **New objects and values:** an `EmObject` for the via (and its pieces, nodes, stubs, feeds, the plots' cursor). From
  `ViaModelResult`: `barrel.zVac`/`zdiffVac`/`zcmVac`/`k12`, `wall.Req`, `pieces[i]` (z0, zdiff, zcm, er, zTop − zBot,
  delay), `nodes[k].dC`, `lumped` (L, C, lineC, dCsum, z, zdiff, zcm, delay), `stubs[i]` (length, delay, fFormula,
  fRes), `feeds[i]` (length, eeff), `valid.fMax`, `tr`, `f3`, `band`, `nport` (f, s, z0), `mixed`, `tdr` (zRef, rho, z at
  the cursor); `nearestReturn(via)`; `viaTarget(…)` and `inverse(…)` results.
- **Checks:** every equation equals the engine within 1e-9 on random vias and on V, VP, E, Eb (names as claims.md);
  every step equals the next. Expected identities: `via-coax` with D = 2·R_eq equals `pieces[i].z0` exactly;
  `via-section-c` sums to `axiTotal` within 1e-12; `stub-quarter` equals `fFormula` (1/(4τ)); `edge-band` ratios 2.578
  and 4.465; `s-abcd` on `elements` equals `nport.s`; `mixed-mode-s` equals `toMixedMode`; `tdr-z` on `tdr.rho` equals
  `tdr.z`. `via-quasi-coax` is an estimate (60.84 against 59.71 Ω): check it against its own closed form, not the engine.
- **Examples as data:** as examples.md; M4.2 builds each linked setup from its recipe and checks its `encodeLink`.

## For M4.3 (the page)

- Theory: topics §7–§13 after `tolerances`; the via's short lines (theory-lines.md "Via") link to the via ids instead of
  the line and solver topics; figures as each topic lists (the via field maps exist; the TDR and S plots exist).
- Examples section: each link opens its state (`decodeLink` with no issues); the four `jlcAllBut` links and the two
  "as calculator" links are 1.6–1.7 kB long (the whole stackup is in them).
- `cavity-f` is static text (BL134).

## Numbers checked against the engine

Scratch scripts (`npx tsx`, `scripts/harness/emsim/`; trace M = 2; via model at its defaults). Names as claims.md.

| Text | Engine |
|---|---|
| D 51.50 ± 0.05, 3.298, 6.058; w for 50 Ω 0.1465 (5.77 mil) → 50.01 | 51.4976 ± 0.0466, 3.29814, 6.05779; 0.146532; 50.0053 |
| as calculator 50.06 ± 0.06, εeff 3.363, 5.435 mil | 50.0587 ± 0.058, 3.36309, 5.43500 mil |
| parts +0.94, +0.51, +0.25, −0.27 (51.00, 50.57, 50.30, 49.79); 1.43 of 1.44; pair 1.70, 1.63, 0.73, −0.73; 3.33 of 3.36 | 0.9401, 0.5089, 0.2450, −0.2674 (50.9988, 50.5676, 50.3038, 49.7913); 1.4266 / 1.4389; 1.7019, 1.6264, 0.7285, −0.7258; 3.331 / 3.357 |
| P 103.36 ± 0.15, Zcm 30.91, Zodd 51.68, Zeven 61.82; lone 0.11 trace 56.90; Zc 56.75 / 5.07; w 0.1191 (4.69 mil) → 100.01; as calc 100.01 ± 0.53 | 103.364 ± 0.150, 30.908, 51.682, 61.815; 56.9035; 56.7486 / 5.0665; 0.119134; 100.012; 100.0075 ± 0.527 |
| V barrel 127.36 / 59.71 / 62.90 Ω; R_eq 1.255; section 0.681 nH, 269.7 fF (179.8 + 90.0), 50.23 Ω, 13.55 ps; ΔC 15.3 / 14.3 fF | 127.357, 59.706, 62.897; 1.25479; 0.68056, 269.74 (179.79 + 89.95), 50.229, 13.549; 15.31–15.34 / 14.33 |
| V thin-wire 60.84 Ω (+1.9 %) | 60.8388 by hand (facts-cases.md C44 writes 60.83: rounding) |
| V target 50 Ω Ø1.758; returns at 2.5 mm: 108.78 / 68.63 Ω | 1.75828; 108.784 / 68.626 |
| V25 TDR: flat 51.4975; 15 ps 48.54 / 55.32, 35 ps 50.81, 100 ps 51.19; ports at pads 49.66–51.00; feed round trip 20.6 ps | 51.49751; 48.537 / 55.318, 50.808, 51.194; 49.665–50.998; 20.596 |
| V S at 10 GHz −33.4 / −0.002 dB, S11 at 25 GHz −17.3 dB; f3 9.70, band 25.0, end 43.3 GHz; λ/8 29.5 GHz | −33.35 / −0.0020 (10.07 GHz), −17.31; 9.7036, 25.012, 43.321; 29.452 |
| VP barrel Zdiff 92.23 / 97.16; section 83.49 / 36.63, 12.59 ps; 54.0 fF (31.5, −4.5); k12 0.274; λ/8 23.8 GHz | 92.232 / 97.161; 83.492 / 36.628, 12.592; 54.04 (31.49, −4.47); 0.27399; 23.821 |
| VP target 100 Ω out of reach 53.21–99.88 over 0.270–3.270; 85 Ω at Ø1.375 | same text from `viaTarget`; 1.37534 |
| VP TDR 91.59 (2 mm feeds); VP25 103.36 → 91.65, 88.29 (15 ps), 97.99 (100 ps) | 91.589; 103.361 → 91.647, 88.290, 97.987 (no feeds: 90.571 = facts-cases C45) |
| VP at 10 GHz Sdd11 −19.4, Sdd21 −0.05, Scc11 −10.3, Scd21 < −300 dB | −19.35, −0.0507, −10.33, −325 |
| E stub 1.335 mm, 9.19 ps, 27.2 / 21.8 GHz, −48.6 dB; 10 GHz S21 −0.68, S11 −8.4 | 1.335, 9.188, 27.210 / 21.791, −48.63 (21.77 GHz); −0.684, −8.364 |
| Eb stub 0.165 mm, ≈ 215 GHz; 10 GHz S21 −0.07, S11 −18.0; no stub flag | 0.16548 (from the middle of L3; `viaStubs` counts from its bottom: 0.1505), 215.18; −0.0696, −17.99 |

No number disagreed with the engine. Every link decodes with no issues to the setup it names (`sameSetup`) and has no
via error; the links are `/em-sim/main?` + `encodeLink(setup)` (default `v=1`).
