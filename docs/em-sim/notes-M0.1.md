# Notes from M0.1 – plan review (2026-11-16)

The v2 draft (`.local/EM simulation/PROJECT_PLAN_EM_v2.md`, 2026-11-11, private) was reviewed against the site, the
agent workflow and the owner's TODO ("EM simulation: Visual; Impedance (single ended and differential): Traces, Vias").

## The owner's answers (2026-11-16)

- **Visual:** all four: fields in cross-section, via side and top views, a 3D view of the via, animated full-wave waves.
- **First scope:** impedance and fields (stackup, traces single-ended and differential, vias, target width, tolerance,
  fields); losses, board import, time domain and the rest later, planned when the owner says so.
- **openEMS:** yes, agents may install it on the PC for the harness; never shipped.
- **Theory:** like the Smith chart (theory with sources, equations with live numbers, derivations, worked examples).

## What changed from v2, and why

- **Phase 1 is a tenth of v2.** v2 planned ten milestones from field solver to FDTD, time domain, IBIS and PDN in one
  go; agent-workflow.md asks for the smallest useful version first. The rest is [later.md](later.md), unscheduled.
- **FDTD moved into phase 1** (the owner wants animated waves) and doubles as the accurate via model. So v2's level 2
  (3D quasi-static PEEC) is no longer needed in phase 1, and level 3 (plane-pair cavity) belongs with the PDN (P2.6).
- **Via model made concrete:** v2's level 1 ("barrel as a short line, analytic") is now the barrel's cut solved by the
  same 2D solver (any return-via arrangement, pairs included) and pad/antipad capacitance from an axisymmetric
  boundary-element solve, which also gives the side view's field. Fast enough to drag.
- **Board import:** v2 said "reuse the PCB viewer's KiCad parser". The site now reads KiCad, Altium, PADS and EAGLE into
  one `Design`; route analysis builds on that in phase 2. Phase 1 takes only the stackup (not read by the PCB viewer
  today: it keeps colours and thickness) and the net classes.
- **No CI:** the site has no test CI; v2's "runs in CI" became the harness (`npm run check`, `npm run ui`, later
  `npm run recheck`), as the Smith chart does.
- **Independent second solver** (finite differences, written by an agent that has not read the engine) added beside
  exact cases and openEMS: the site's way of checking.
- **Teaching layer** added (owner); v2 had only an assumptions panel.
- **Dropped from phase 1:** multi-thread service-worker shim, WebAssembly kernels in Rust or C++ (no toolchain on the
  site; WebGPU plus a JavaScript fallback first), ngspice-WASM, per-region layer roles, PDF report (the browser prints
  the report, as in the Smith chart).
- **Kept:** boundary elements for 2D; full L and C matrices and modal decomposition as the interface; per-layer εr and
  tanδ with a reference frequency; three mask thicknesses; trapezoid; dated JLCPCB presets; tolerance band and
  sensitivity; verification separate from validation; the N-port type; provenance and validity flags; estimators.

## v2's list of why calculators disagree (for M0.2 and the theory)

εr per layer or one value; εr at which frequency; solder mask as nothing, a uniform layer or with three thicknesses;
rectangular or trapezoidal traces; nominal or pressed thickness (resin fill); plated or base copper; roughness;
closed-form approximation or numerical solution; the definition of differential and common-mode impedance; the choice
of reference plane.

## v2's validation table form (for facts-cases.md)

One row per case: case, geometry, exact or refined reference, JLCPCB, Saturn, other calculators, this tool, largest
difference, explanation. v2's cases: F.Cu single-ended microstrip over In1; F.Cu edge-coupled pair (LVDS) over In1;
B.Cu single-ended over In4; symmetric zero-thickness stripline (Cohn, exact); coupled zero-thickness stripline (Cohn,
exact); asymmetric stripline or coplanar variant; F.Cu to B.Cu transition with and without stitching vias.

## Reference material on the owner's machine

- **Boards** (read where they are, never copy): `E:\OneDrive - NTNU\ULDAC\PCB\ARTI-CARRIER-PICO2` (the carrier) and
  `E:\OneDrive - NTNU\ULDAC\PCB\2026_ARTIFICER_TC1` (the mezzanine), both KiCad 10 (file version 20260206), the same
  6-layer stackup: mask 0.01, F.Cu 0.035, prepreg 0.092, In1 0.03, core 0.13, In2 0.03, prepreg 1.003, In3 0.03, core
  0.13, In4 0.03, prepreg 0.092, B.Cu 0.035, mask 0.01 mm; εr 4.3 and tanδ 0.02 everywhere (KiCad placeholders).
  In1 and In4 are solid ground; In2 and In3 mixed (power, slow signals).
- **Net classes:** carrier `50R_SE` track 0.1377 mm (5.42 mil) on F.Cu over In1 and B.Cu over In4, GND pour kept
  ≥ 0.6 mm away (non-coplanar); mezzanine `LVDS_100R` width 0.11 mm, gap 0.2 mm; default diff pair 0.2/0.25 mm.
- **JLCPCB records:** impedance sheets `ARTI-CARRIER-PICO2/manufacturing/Impedance Control/Required_impedance_control.xlsx`
  and `2026_ARTIFICER_TC1/manufacturing/Required_impedance_control.xlsx` (openpyxl not installed: read in a scratch
  venv); emails in each project's `emails/` folder. The carrier's email: "the trace width and spacing need to be
  adjusted as shown below. The stack-up will be kept as **JLC061611-3313G**"; the mezzanine's: "the trace width and
  spacing should be unchanged". The tables are probably images inside the `.msg` files.
  `ARTI-CARRIER-PICO2/docs/jlcpcb-production.md` "Step 7" explains how the sheet was filled.
- **Tools:** Python (`py`), MATLAB R2023a (base only), KiCad 10 (`kicad-cli` in `C:\Program Files\KiCad\10.0\bin`),
  Saturn PCB Toolkit (GUI), TeX Live 2026 (used by the Smith chart's harness).

## Open questions for the owner (none blocks M0.2)

1. JLCPCB's online calculator and Saturn: if M0.2's agent cannot run them, it lists the inputs; the owner may type the
   results in when convenient.
2. ~~TikZ export of the drawings~~: yes, decided by the owner on 2026-11-16 (plan.md D16, M8.1a).
