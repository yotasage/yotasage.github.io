# Notes from step M6.4a (2026-11-17)

openEMS reference fixtures for the full-wave verification (M6.4b compares against them). Scripts in
`scripts/harness/emsim/openems/`: `viacases.py --case=c44|c44-noret|c44-stub|c44-bd|c45`, `lvds.py`; `npm run openems
<name> [--coarse] [--post]`; `--post` re-processes the last run's probe files in `%TEMP%\emsim-openems\` without
running openEMS. Format as fullwave.md §14.2, plus `sParameters.ports` and `pattern`, `provenance.scriptSha256`.

## The fixtures (8 threads; two or three ran side by side, so the times are about 1.3× a lone run)
| Fixture | Structure | Cells, Δt | Runs, time |
|---|---|---|---|
| `via-c44` | C44 preset: 0.6/0.3 through L1–L6, pads on all six layers, antipads Ø1.8 on L2 and L5, returns 0.3/0.6 at y = ±0.8 (pads on L2 and L5 only, barrels through all copper) | 1.58 M, 41.0 fs | 1, 456 s |
| `via-c44-coarse` | the same, 3 cells per drill | 0.84 M, 42.2 fs | 1, 377 s |
| `via-c44-noret` | without the returns | 1.39 M, 39.5 fs | 1, 419 s |
| `via-c44-stub` | exit on L3 (stripline between L2 and L5 toward +x): an L3–L6 stub | 1.58 M, 41.0 fs | 2, 976 s |
| `via-c44-bd` | the stub backdrilled from the bottom 1.2 mm, Ø0.5 (air through barrel, pads and mask) | 1.66 M, 40.9 fs | 2, 1043 s |
| `via-c45` | C45 pair 0.5/0.22 at pitch 0.7 (y), pads on L1/L6, stadium antipad 1.22 × 1.92 on L2/L5, six returns 0.4/0.2 | 2.46 M, 37.3 fs | 2, 1369 s |
| `msl-c41` | LVDS_100R pair on L1 over L2: w 0.11 trapezoid (top 0.0922), s 0.2, mask; 10 mm between reference planes | 0.84 M, 16.3 fs | 1, 619 s |

All in `defaultSetup()`'s stackup (JLC061611-3313A, finished copper 35/30 µm, εr 4.1/4.17/3.91/4.55, masks 30.48 µm on
laminate and 15.24 µm over copper, εr 3.8), lossless. Via frame: the barrel at x = y = 0, z from L6's outer copper face;
feeds along −x (L1) and +x (L6 or L3), ports at |x| = 4.5, reference planes at |x| = 3. Meshes are mirror-symmetric
(`sym_lines`); 6 cells per drill (FINE = drill/6 over the via block), lines closer than 15 µm to a more important one
dropped (else the pair's Δt was 18 fs). Each run stops at 0.8 ns.

## Sanity (check-openems.mjs; bars in its `BAR`)
- **Passivity** σmax(S) 1.00004–1.00098 over 0.1–40 GHz (bar 1.01). **Probe tails** (last 10 % against the run's
  largest peak) ≤ 5·10⁻⁴ (bar 10⁻³).
- **Feeds against the 2D solver** (lines.ts on the trapezoid with its mask: L1/L6 51.50 Ω, εeff 3.298; the L3
  stripline 54.59 Ω, 4.144): openEMS reads the microstrip feeds **+3.45 %** in Z and +0.93 % in εeff, the stripline
  +2.6–2.8 % and −0.2 to +0.5 %; the coarse mesh +1.7 %. The bar for Z is **4 %**, set after the first run: openEMS's
  own feed error on this mesh (27 µm cells across the trace by the thirds rule, the mask over laminate averaged);
  msl-c39 at 15 µm read 1.45 % low (BL162). M6.4b de-embeds with the fixtures' own feed Z and β.
- **LVDS:** Zdiff **103.39 Ω** against 103.36 (+0.02 %), Zcm 31.00 against 30.91 (+0.31 %); εeff odd 3.259, even 3.606
  (3.623 from Scc21's phase); differential TDR plateau 103.33 Ω.
- **Reciprocity** (full 2-ports): |S12 − S21| grows with f, 1.6·10⁻³ at 4 GHz, 0.018 (stub) and 0.023 (backdrill)
  near 20–25 GHz (bar 0.025, set after the runs). Likely the L3 port: it reads V to L2 only, while L2 and L5 are
  joined only by the via's two returns, so a parallel-plate mode between them is part of what the port sees.
- **Symmetry shortcut:** the pair's two runs (A1, B6) fit S_ij = p[i xor j] with a misfit of 0.95 % (bar 2 %).
- **Reproducible:** `via-c45` run again (1369 s against 1435 s): all 3 208 stored S values and the TDR identical to
  the last digit, as M0.4b's fixtures. `--post` re-made every fixture from its probe files after the last script change,
  so each one's `scriptSha256` matches the committed scripts.

## Results to compare (M6.4b)
| Fixture | via section (de-embedded, 1–10 GHz) | TDR 35 ps at the via |
|---|---|---|
| `via-c44` | Z 68.93 Ω, 13.86 ps, L 0.956 nH, C 0.201 pF | 54.37–61.93 Ω |
| `via-c44-coarse` | 67.59 Ω, 14.86 ps | 53.77–61.52 Ω |
| `via-c44-noret` | 99.26 Ω, 13.00 ps, L 1.291 nH, C 0.131 pF | 54.57–76.46 Ω |

Stub: |S21| dips to −22.2 dB at **21.6 GHz** (model, examples.md 5: 21.8 GHz, −48.6 dB); at 10 GHz S21 −0.50 dB,
S11 −12.6 dB (model −0.67, −8.4). Backdrilled: no dip below 40 GHz; at 10 GHz S21 −0.45 dB, S11 −10.7 dB (model
−0.07, −18.1). Pair at 10 GHz: Sdd21 −0.004 dB, Sdd11 −30.8 dB, Scc21 −0.79 dB.

## Where the fixtures differ from our model's geometry
- **Barrels, pads, antipads, returns** staircased (6 cells per drill); ours are conformal. Compare delays and S21
  first; `via-c44-coarse` against `via-c44` shows the staircase's size (Z −2 %, delay +7 %; the coarse mesh also
  coarsens the feeds).
- **Feeds** are the rectangle of the trapezoid's mean width (model.ts meshes the via feeds the same way), 3 mm from
  the axis to the reference plane and 4.5 to the lumped port; our FDTD's feeds have length `feedLength` (1.5 mm here)
  and their own planes: move S with the feeds' Z and β (`results.feeds`).
- **The pair's feeds** run along −x on L1 and +x on L6 for both barrels; the preset points them along ±y, over two
  return vias (BL161). Run our FDTD with the feeds at 180° and 0°.
- The mask over pads and feeds is conformal, the mask over laminate has no mesh line (4.5 µm from the copper face).
- The barrel is a solid PEC cylinder of the drill; plating ignored, as ours.

## How M6.4b should compare
Build the same setup (`defaultSetup()`, the via changed as above), run our FDTD (staircased too, to split mesh from
model error), move both to the via axis with each one's own feed Z and β, and compare S11, S21 (the pair: all four
pattern entries and Sdd/Scc), the de-embedded Z and delay, and the TDR at 35 ps; for C41 Zdiff, Zcm, the modal εeff
and the 4-port S at the 10 mm planes directly.
