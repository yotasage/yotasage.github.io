# EM simulation – phase 2 and beyond

Kept from the v2 draft (2026-11-11) so it survives outside `.local/`. **Nothing here is scheduled.** When phase 1 is
done (M9.3) or earlier if the owner asks, the owner picks what comes next and the main session plans it into
milestones the way [milestones.md](milestones.md) does. Each area has a backlog row in `docs/BACKLOG.md`.

## Principles that phase 1 already keeps for this

- **Linear interconnect separate from nonlinear terminations.** Lines, vias, planes, full-wave results and imported
  Touchstone are linear N-ports (engine.md §8), solved in the frequency domain or fitted; drivers, receivers and clamps
  are nonlinear and solved in the time domain. IBIS models never go inside a field solver.
- **One N-port type** with its producer, validity range and assumptions, so the model of any piece can be swapped and
  compared.
- **Provenance and validity flags** on every result; f64 for matrix solves; workers; deterministic input → output.

## P2.1 – Losses and dispersion (BL69)

- **Conductor loss** by Wheeler's incremental-inductance rule on the same boundary-element solution (R from the change
  in L when the surfaces recede by a skin depth): edge crowding and the plane's share included; blended to DC
  resistance where the skin depth is comparable to the copper; internal inductance from the same rule.
- **Roughness:** Hammerstad–Jensen (saturates at 2) and Huray, with presets.
- **Dielectric:** Djordjevic–Sarkar wideband causal model from εr and tanδ at their reference frequency; constant εr
  and tanδ only as a flagged non-causal option to reproduce calculators.
- **Outputs:** RLGC(f), Z0(f), attenuation, insertion loss, group delay; Touchstone of a line section. Checks:
  causality, passivity and reciprocity of the exported data, published formulas, openEMS.
- Full-wave: dispersive dielectrics in the FDTD (auxiliary differential equation matching the same causal model).

## P2.2 – Board import and net analysis (BL70)

- Built on the PCB viewer's `Design` (`lib/pcb/model.ts`), so KiCad, Altium, PADS and EAGLE boards all work; the
  design readers would also read their stackups (KiCad's in phase 1 already; Altium's and EAGLE's to check).
- Possible entry from the PCB viewer: "Analyse net or pair" opens this tool with the route.
- **Reference coverage** per segment from the filled zones (`clipper2-ts` is on the site): which copper is above and
  below, gaps, splits, distance to the nearest stitching via; warn when zones are not filled in the file. Roles per
  region (one layer can be ground here and power there).
- **Net report** without a solver: length per layer, vias, stubs, P/N skew, coupled and uncoupled stretches, width and
  gap changes, arcs, reference gaps. Lengths must match KiCad's own.
- **Impedance profile** along the route from the 2D solver on each local cross-section.

## P2.3 – Time domain (BL71)

- **Own circuit engine:** modified nodal analysis, trapezoidal or Gear integration, Newton with limiting at nonlinear
  elements. Lossless lines by the method of characteristics, coupled lines by modal decomposition with phase 1's
  matrices. Lossy lines as a delay-extracted modal model with vector-fitted propagation and admittance functions
  (passivity enforcement, causality checks), in the spirit of the universal line model; RLGC ladders as a first cut and
  as the SPICE export form. Vector fitting is core infrastructure (lines, planes, Touchstone).
- **Elements:** step, pulse, clock (duty options), PRBS; R, L, C, diodes, clamps, lumped drivers and receivers, coupled
  lines, N-port macromodels, the via models of phase 1.
- **Compliance:** threshold presets LVDS (TIA/EIA-644: VOD, VOS, ±100 mV receiver threshold), LVCMOS 3.3 V, a 1.5 V
  standard, all editable; overshoot, undershoot, ringback and monotonic crossing of the threshold region, noise margin,
  delay, skew, duty-cycle distortion; Vdiff and Vcm probes; eye diagram with optional mask; a clock view; pass/fail
  margins drawn on the waveforms. Series-termination sweeps.
- **ngspice as the oracle**, not the engine: native ngspice runs the exported netlists in the harness; the owner's
  ngspice-WASM build as an optional in-browser cross-check (licence and size to check). Where ngspice has no equivalent
  the comparison is labelled approximate.
- Checks: lattice diagrams, coupled-line crosstalk against modal solutions, lossy lines against an FFT reference,
  ngspice agreement, passivity and causality of fitted models.
- Then **route to simulation**: sections between vias as lines with their own parameters, vias as phase 1's models,
  branches and stubs kept, pins mapped to drivers and receivers; simulate the owner's LVDS pair and a CMOS net end to
  end.

## P2.4 – IBIS drivers and receivers (BL72)

Parser for `[Component]`, `[Pin]`, `[Model]` (Input, Output, I/O, 3-state, open-drain), `[Pullup]`, `[Pulldown]`,
`[GND Clamp]`, `[POWER Clamp]`, `[Ramp]`, `[Rising Waveform]`, `[Falling Waveform]`, `C_comp`, package parasitics,
differential pin pairs; unsupported keywords warned, never skipped silently. Two-waveform switching, ramp otherwise;
min/typ/max corners; lumped drivers as the fallback. Tested on the vendor files of the owner's LVDS and CMOS parts.

## P2.5 – Measurement import (BL73)

Touchstone (`.sNp`) and CSV import, vector-fitted when needed, overlaid on the simulation; TDR/TDT from S-parameters
(windowing stated); mixed-mode conversion; a comparison report listing the assumptions beside each difference. A fab's
coupon TDR report is a free measurement anchor; coupons on the next board spin. Shares a reader with the Smith chart's
BL37.

## P2.6 – Planes, return path and PDN (BL74)

Finite-difference cavity model of plane pairs in the frequency domain (about 0.5 mm cells, refinable) with conductor
and dielectric losses; vias as ports or shorts, stitching vias as shorts; **several plane pairs coupled through vias**
(the owner's boards: In1/In2 and In3/In4 are tight pairs 0.13 mm apart, separated by a 1.003 mm prepreg, so a signal
going from F.Cu to B.Cu carries its return current through stitching vias); cavity outlines from imported zones;
return-current maps; PDN Z(f) with decoupling capacitors (ESL, ESR, mounting inductance). The result vector-fitted into
an N-port, so via models can combine their barrel parasitics with the plane-pair Z-matrix. Checks: cavity resonance
scaling c/(2·L·√εr), hand-calculable PDN cases, openEMS.

## P2.7 – Other levels and speed-ups (BL75)

- **Quasi-static 3D extraction** (3D boundary-element capacitance and PEEC partial inductance with an explicit return
  loop) for pads and short structures, only if phase 1's full-wave runs are too slow for a question the owner has.
- **WebAssembly kernels** (SIMD) for the FDTD's CPU path or sparse plane solves, if profiling asks; the **opt-in
  multi-thread mode** (a service worker scoped to the tool's path adding COOP/COEP so `SharedArrayBuffer` works on
  GitHub Pages; a visible toggle, a reload, automatic fallback, same-origin only).
- Mixed-mode Touchstone of full-wave pairs to four ports with de-embedding beyond phase 1's.

## P2.8 – Links to other tools (BL45, existing)

A line part in the Smith chart defined by physical length and εeff, with Z0 and εeff handed over from this tool by link
or file.

## Non-goals (from v2, still true)

Not a sign-off or certification tool, not a replacement for the fab's impedance report or for measurement; not a
full-board full-wave solver or an EMC/radiation predictor; no IBIS-AMI or SerDes equalisation; no simultaneous
switching noise in the first releases; no server, telemetry or accounts.
