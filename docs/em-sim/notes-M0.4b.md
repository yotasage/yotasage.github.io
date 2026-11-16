# Notes from step M0.4b (2026-11-16)

openEMS installed for the harness, the fixture format, the first two fixtures. Details in
[fullwave.md](fullwave.md) §14; the scripts in `scripts/harness/emsim/openems/`.

## Install and interface
- **openEMS v0.37.0**, official Windows package from `github.com/thliebig/openEMS-Project/releases`, unzipped to
  `C:\Users\Jonat\opt\openEMS`; nothing on PATH, no admin rights.
- **Python**, not MATLAB: the release carries wheels for Python 3.14, so a venv (`C:\Users\Jonat\opt\openEMS-venv`)
  and two `pip install` lines were enough; it worked on the first try. `CSXCAD_INSTALL_PATH` is set by `run.mjs`.
- On another machine: unzip the same package, make the venv (fullwave.md §14.1), or point `OPENEMS_DIR` and
  `OPENEMS_PYTHON` at them.

## Run times (8 threads; the default)
| Fixture | Cells | Steps | Run |
|---|---|---|---|
| `msl-c39` | 0.45 M | 49 152 (Δt 16.3 fs) | 187–264 s |
| `via-th-0p3` | 1.11 M | 12 740 (Δt 62.6 fs) | 122–144 s |

`npm run openems` re-makes both in 5–7 min (run times vary with the load on the PC); both came out identical to the last digit on every re-run.
openEMS runs at 64–130 Mcells/s here; 8 threads beat 16 and 32 at these sizes.

## Sanity checks
- **Microstrip C39 with mask:** Z0 49.794 Ω, εeff 3.2950; BEM 50.526 Ω and 3.2918: **−1.45 %, +0.10 %**. Coarse
  mesh 49.463 Ω (−2.10 %): converging from below, about first order; the edge singularity with lines on the copper
  edges (the strip acts slightly wide) and the 4.5 µm mask step. Four routes to Z0 agree within 0.05 %.
- **Via:** de-embedded section Z = √(B/C) 78.8 Ω, delay 12.0 ps (L 0.948 nH, C 0.153 pF); TDR peak 64.0 Ω at 35 ps.
  Quasi-coax with the returns 65.1 Ω, coax in the antipad 51.8 Ω, barrel delay 11.3 ps. Delay within 6 %; Z 21 %
  higher, because the section also holds the antipad crossings, the barrel's runs above In1 and below In4 to its
  outer pads (inductive) and the pads, which the formula ignores. Staircase: 3 cells per drill 75.9 Ω, 6 cells 78.8 Ω.
- Feeds: 53.94 Ω and εeff 3.007 against Hammerstad–Jensen 52.98 Ω and 2.9805 (+1.8 %, +0.9 %).

## Lessons (cost a few runs)
- A baseband Gaussian on a line that runs into the PML leaves a static charge that never drains: **use resistive
  lumped ports** at the line ends and measure on probe planes inside.
- openEMS's energy measure stalls near −31 dB with a baseband pulse even when the probes are quiet (tail 10⁻⁶–10⁻⁵):
  runs **stop at 0.8 ns** (`SetMaxTime`); `probeTailRelative` in each fixture shows the truncation.
- `MSLPort`'s current loop wraps a zero-thickness sheet; for a 35 µm trace the loop must enclose the whole copper
  section (`common.ProbePort`).
- Keep the dielectric box off the outer copper layer, or the gaps beside an outer trace fill with laminate (εeff
  3.46 instead of about 3.0).
- With a line on a trace edge and 30 µm cells beside it, Z0 is 6 % low: use the thirds rule or cells ≤ 15 µm.
- The PML (8 cells) lies **inside** the domain: leave at least 8 coarse cells of clearance.

## What M6.4 (verification against openEMS) must know
- **Barrels:** openEMS staircases them here (lines on the drill edges, 6 cells per drill). Our solver uses conformal
  cells (§4), so a difference of a few % in the via section's Z is expected from the staircase alone (3 → 6 cells per
  drill moved it 4 %); compare delays and S21 first, Z second, and run our solver staircased too to separate mesh
  from model error.
- **Ports:** both fixtures use lumped 50 Ω ports 3 mm beyond the reference plane; S is referred to
  50 Ω at the probe planes, not de-embedded. `results.feeds` holds each feed's own Z and εeff vs frequency for
  de-embedding to the via axis; `common.sym_s` assumes symmetry and reciprocity (true for both structures; a new,
  asymmetric fixture needs two runs, one per port).
- **TDR** follows §7.2 to the letter, so overlay without conversion; time 0 is the reference plane.
- **More fixtures:** copy `via.py`, change the structure block and the `id`, add it to `all` in `run.mjs`; keep a
  0.8 ns cap (longer for long lines: 3 round trips plus the pulse), 8 threads, files under 200 kB (the thinning in
  the scripts gives about 50 kB). Run `--coarse` once and report both meshes.

## Open questions
- Whether openEMS's slow energy decay is the PML with static fields or the lumped ports' caps; it does not touch
  the probes, so it was not chased.
- The via section's 21 % against the thin-wire quasi-coax formula is explained in kind, not split by part; the via
  model of M3 (2D solver per segment) will give the barrel alone.
