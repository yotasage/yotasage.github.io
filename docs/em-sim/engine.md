# EM simulation – engine

The shared model and the contract of each solver. What is **decided** here is binding for every step; what is marked
**M0.3 decides** or **M0.4 decides** is settled by that research step in `solver.md` or `fullwave.md`, which then
override this file on that point. Definitions and formulas with their sources are in `facts.md` (M0.2).

## 1. Frames, units, numbers

- **Units inside the engine:** lengths in mm (as `lib/pcb`), every electrical quantity in SI (F/m, H/m, Ω, s, Hz).
  Conversions to mil, µm, inch and copper weight in oz/ft² only at the edges (UI, import, export), through
  `lib/quantity.ts` and one conversion table. 1 oz/ft² = 34.79 µm nominal; facts.md states which copper thickness a
  given oz means at JLCPCB (finished, after plating).
- **Frames:** the **board frame** is the PCB viewer's (x, y in the board plane, Y up), with **z up from the board's
  bottom surface** (outside the mask). A **trace cross-section** uses (u, z): u across the line, z as the board frame,
  the line running along +v. A **via** is placed at the origin of the board frame's (x, y); its side view is (r, z) or
  (x, z). Every drawing and export uses these frames; no step invents its own.
- **Numbers:** f64 everywhere in the static solvers and the via model. f32 only in the full-wave kernels, with the
  checks of §7. Deterministic: the same input gives the same bits (no `Math.random` without a fixed seed, no order
  that depends on timing).

## 2. Stackup

A stackup is an ordered list of layers from top to bottom; each layer has an id, a name, and:

| Kind | Fields |
|---|---|
| `mask` | εr, tanδ, reference frequency; thickness on laminate, over copper, between traces (D8) |
| `copper` | thickness (outer layers: base foil and plating given separately or as one finished number), etch: trapezoid by an etch offset per side or an etch factor (M0.2 settles the conventions JLCPCB and Polar use for W1/W2), optional fill of the gaps below by the next prepreg (resin) |
| `dielectric` | thickness (as pressed), εr and tanδ at a stated reference frequency, kind (core or prepreg), material name (e.g. "3313", "7628", "FR-4 core") |

- Every number carries an optional tolerance (± absolute or %) and a **source**: `{ kind: 'preset', id, date, url }`,
  `{ kind: 'kicad', file, version }` or `{ kind: 'typed' }`. KiCad's default εr of 4.3 / 4.5 on every layer is flagged
  as a placeholder (v2 Appendix A).
- **Presets:** JLCPCB's published stackups with their per-material εr (M0.2 collects them with the date and URL;
  the owner's boards use JLCPCB stackup "JLC061611-3313G", per JLCPCB's email of the carrier order, notes-M0.1.md), and
  stackups the visitor saved (in the link and `localStorage`). No other fab in phase 1.
- **KiCad import (D9):** the `(stackup …)` block of `(setup …)` in a `.kicad_pcb` gives layers, thicknesses, εr, tanδ,
  materials and mask; `.kicad_pro` gives the net classes (`track_width`, `diff_pair_width`, `diff_pair_gap`,
  `diff_pair_via_gap`), each offered as a structure. The reader takes only the `setup` item (the files are 7–8 MB)
  using `lib/pcb/kicad/sexpr.ts`; M0.2 records which KiCad versions write which fields.
- **Roles:** in phase 1 the visitor says which copper layers are solid reference planes for a structure (the editor
  proposes the nearest copper above and below); per-region roles from zones are phase 2.
- **Positions (M1.1, `lib/emsim/stackup.ts`):** a dielectric's thickness is the distance between the copper faces on
  either side; the stack sum counts a mask with its thickness on laminate, so z = 0 is the bottom mask's outside on
  laminate (mask over bottom copper may reach below 0). A copper trapezoid's base is on the side it was etched from:
  the adjacent core on an inner layer, the laminate on an outer one; the gaps of an inner layer are filled by the
  dielectric on the narrow side (usually the prepreg). JLCPCB's etch is an offset per side (0.35 mil); KiCad states
  none. A preset's εr frequency and tanδ are stored as "not stated" (null), never as 1 GHz values.

## 3. Structures

**Trace cross-section.** A stackup, a set of conductors and optional side walls:

- **Signal conductors** (numbered 1…n, n ≥ 1): a trace on a copper layer with its bottom width, etch, u position.
  A pair is two signals; a pair with an aggressor is three. Gaps are edge to edge at the bottom of the copper (M0.2
  confirms this matches JLCPCB's sheet and Polar's S1).
- **Reference conductors:** solid planes on copper layers (full width), coplanar ground on the signal layer (gap to
  the trace, width or "to the edge"), and optional side walls (an ideal fence, flagged as such).
- **Mask** follows the copper as D8 describes; **air** above the top mask and below the bottom one. **Side walls
  (decided in M1.1):** the over-copper thickness, measured across (in u) from the copper's sloped side and continued
  to the over-copper height; the mask's outer surface is the upper envelope of the laminate level (on laminate, or
  "between" in a gap between two features of the layer), the side coats and the top coats, so coats that meet in a
  narrow gap merge and nothing is clamped. Why: JLCPCB states three thicknesses (C1, C2, C3, the names of Polar's coated models)
  and none for side walls; the wall is a copper surface as the top is, so it takes the over-copper figure; it keeps the
  mask continuous at the top corners; it is what M0.3's spike used (C39 50.53 Ω stays valid). Flagged as an
  assumption; its effect is measured in M1.2 (notes-M1.1.md).
- **Presets** are named arrangements of the above: microstrip, embedded microstrip, stripline, asymmetric (dual)
  stripline, coplanar waveguide with and without bottom ground, edge-coupled microstrip, stripline and coplanar pairs,
  broadside-coupled stripline. The solver sees only the general form, so a new preset needs no solver code.

**Via structure.** A stackup with its reference planes, and:

- one via or a differential pair of vias (pitch): drill, finished hole (plating), the layers it starts and ends on (its
  signal layers), pad diameter per layer (non-functional pads kept or removed), antipad per plane layer (round; oblong
  or joined for pairs), stub (barrel beyond the exit layer) or backdrill depth and diameter;
- return (stitching) vias: positions in (x, y), drill, which planes they join;
- feed traces on the entry and exit layers: a trace structure from above, with a length and a direction.

## 4. The 2D solver (D2, D3)

**Contract.** Input: a trace cross-section (§3) and accuracy settings. Output, per unit length:

- the Maxwell capacitance matrix **C** (n×n, with the dielectrics), **C0** (every dielectric replaced by vacuum), and
  **L** = μ0 ε0 C0⁻¹;
- for each mode of the eigenproblem of L·C: velocity, εeff, the modal voltage and current vectors; the characteristic
  impedance matrix; for one line Z0 = √(L/C); for a pair Zodd, Zeven, **Zdiff and Zcm with the definitions in
  facts.md** (for a symmetric pair Zdiff = 2·Zodd and Zcm = Zeven/2), the coupling coefficients (backward kb and
  forward kf);
- the solution itself (panel charges of both solves), so fields (§9) need no second solve;
- an **error estimate** for each impedance (from successive refinement), the panel count, the time taken.

**Formulation (decided by M0.3 in [solver.md](solver.md) §2):** total charge (free plus bound), piecewise constant
on straight panels, collocation at midpoints; potentials prescribed on conductors and normal D continuous across
interfaces; panels graded towards both ends of every edge (q = 2); planes never as panels: free space with a
neutrality row (no plane), one image (one plane) or the closed-form parallel-plate kernel (two planes); infinite
interfaces as geometric rays truncated at X = max(100 × the structure's size, 20 mm) or 4b beyond the copper between
planes; panel integrals in closed form on every pair; error estimate |Z(M) − Z(M/2)|. No layered-media Green's
function (M0.3 measured that the plain formulation meets 0.1 %).

**Inverse and tolerance:** width (or width and gap) for a target Z0 or Zdiff by a bracketed root finder (Brent, or
Newton on the analytic derivative where the solver gives one); sweeps of any input; tolerance by corners and by Monte
Carlo (fixed seed) with the result as a band; sensitivity as the change of Z per tolerance of each input, ranked.

## 5. The axisymmetric solver

**Contract.** Input: conductors and dielectric interfaces that are bodies of revolution about the via's axis (barrel,
pads as annular disks of copper thickness, planes with round antipads truncated at an outer radius or closed by a
coaxial wall, dielectric layer boundaries). Output: the capacitance matrix of the conductors, from it the **excess
capacitance of each pad and antipad** over the barrel's line capacitance, and the solution for the side view's field.
Kernel: the ring-charge Green's function with complete elliptic integrals K and E; the log singularity subtracted
in closed form, a grounded coaxial wall at R_w closing the domain, and the excess capacitance per crossing taken by z
windows ([solver.md](solver.md) §4). Used for one via; a pair or return vias break the symmetry, which the via model
handles as §6 says.

## 6. The via model (D4)

1. **Segments.** The via is cut at every reference plane it passes and at its signal layers. Each segment lies in one
   dielectric layer (or a few, each then a cascade of one homogeneous sub-segment per dielectric layer, never an averaged εr:
[solver.md](solver.md) §5.1).
2. **Barrel lines.** A segment between planes is a line along z whose cut is the 2D problem of §4 in the (x, y) plane:
   the barrel (or the pair's two barrels) as circles, the return vias as reference circles, homogeneous εr of the
   segment. This gives the segment's Z (single: Z0; pair: Zodd, Zeven, Zdiff, Zcm) and velocity.
3. **Pads and antipads.** At each plane crossing a shunt capacitance from §5 (for a pair: each via's own, with the
   coupling between the two pads estimated as ΔC·(−C12/C11) of the barrel pair's cut, [solver.md](solver.md) §5.2,
flagged as an estimate; M6.4's pair fixture shares one antipad, so it could not measure it: fullwave-verify.md §4).
4. **Stubs** are open-ended barrel lines; backdrill shortens them.
5. **Feed traces** are lines from §4 with their own Z0 and length. Where a feed runs over its reference plane's
   antipad (from the pad's edge to the opening's rim) that part of it is a line with its own C′ and the L′ of the trace
   over the next plane beyond the opening, ΔL = (L′ next − L′ own)·ℓ more (M6.5, BL90; a pair fed by single traces takes the coupled pair
   at the pitch). An upper bound of the full-wave's inductance (BL168).
6. **Cascade** in the frequency domain (ABCD or S, 2-port single-ended, 4-port for a pair with mixed-mode conversion)
   from DC to a maximum frequency set by the rise time; **TDR/TDT** by the step response with a Gaussian edge of the
   chosen rise time (10–90 %), windowing stated; stub resonance from the stub's length and εr.
7. **Validity flags,** each with its numbers: no return via within a set distance (return current through the plane
   cavity, not a line: the quasi-static model is not valid, use full-wave); the via's delay against the rise time; the
   frequency at which a segment is no longer short; pads that overlap or antipads that cut into return vias.
   **The band** (`valid.fMax`) is the lower of λ/8 of the longest pad window (`valid.lumped`, Cartier2007) and the plane
   cavity's (`valid.cavity`, M6.5, BL165): between two planes the barrels and returns are thin posts in a parallel-plate
   guide, Zij = (ωμ0h/4)·H0⁽²⁾(kρij), the returns shorted; the cavity's band ends where its ΔZ beyond the static
   inductance, put in the barrel, moves an S entry by 0.1 (C44: 20.8 GHz against λ/8's 29.5).
8. **Target:** antipad diameter or return-via distance for a target barrel impedance, by the same root finder as §4.

## 7. Full-wave (D5)

- **Scheme:** Yee FDTD on a graded Cartesian mesh built from the structure (fine at copper edges, thin dielectrics and
  barrels; coarse elsewhere; grading ratio at most about 1.3), CPML on the open sides, copper as PEC (sheets for traces
  and planes of thickness below a cell; volumes otherwise), round barrels by conformal cells (decided by M0.4a:
  [fullwave.md](fullwave.md) §4, with every other full-wave decision), dielectrics with constant εr and tanδ as a conductivity at the stated frequency (flagged; dispersive media
  are phase 2).
- **Ports:** lumped ports with a source resistance at the ends of feed traces long enough to separate incident and
  reflected waves; reference planes de-embedded to the via; single-ended and mixed-mode excitation for pairs.
- **Outputs:** S-parameters by DFT on a frequency list; TDR/TDT at the chosen rise time (same definition as §6.6);
  **snapshots** of field components on chosen slices every k steps for the animation, kept as compact f32 (or f16)
  frames; energy and stability monitors.
- **Backends:** WebGPU compute (f32; one storage buffer per field, components as blocks, [fullwave.md](fullwave.md) §9; adapter limits requested; work split into
  dispatches so no dispatch is long enough to be stopped by the GPU watchdog) and a JavaScript worker (f32 for runs,
  f64 for the harness's reference). Both share the mesh, the sources and the post-processing.
- **Estimator before every run:** cells, time steps (Courant limit of the smallest cell), memory, and an expected run
  time for the available backend from a short calibration run; refuses or proposes a coarser mesh before allocating.
- **Checks (M6):** parallel-plate cavity resonances, a matched uniform line whose TDR impedance equals §4's Z0 within the
  mesh error, energy conservation without sources, WebGPU against CPU on small cases, openEMS fixtures for vias.

## 8. Results, error, validity, digits

Every result object carries: the input's hash, the solver's name and version, the error estimate, the validity flags
(code, message, the numbers behind it), the assumptions (a list of fixed ids that the page and the theory turn into
text), and the time taken. **Digits shown:** never finer than the larger of the error estimate and 0.01 Ω; the error
itself with one significant digit, two when its leading digit is 1 or 2 (the particle-data convention: 103.64 ± 0.20,
51.50 ± 0.05), and the value to the error's last digit; the tolerance band beside the nominal; the raw number in the equation panel (as the Smith chart's D20).

Phase 2 readiness: the via model and the full-wave solver return their frequency-domain result as one **N-port type**
(frequencies, S-matrices, port reference impedances, producer, validity range), v2's `NPort`, so the time-domain engine
of phase 2 can take any of them.

## 9. Fields

- **Static fields** from the stored panel charges: potential φ, E (and |E|), D, the H field of the quasi-TEM mode (from
  the vacuum problem; facts.md states the relation), surface charge and the high-frequency surface current density on
  each conductor; for pairs, any combination of the modes (even, odd, differential, common, one line driven).
- **Evaluation** on a grid in the worker, coarse first and refined (progressive), only where the view is; closed-form
  panel integrals; the field near copper edges sampled finely enough to show the crowding without aliasing.
- **Drawing:** heat maps into canvas `ImageData` with a perceptually uniform, colour-blind safe colour map (written as a
  table, no library) and a scale bar; equipotentials by marching squares; field lines seeded on the conductors in
  proportion to their charge, so line density shows field strength; arrows optional. The probe readout gives φ, E and
  the position at a point by hover, focus or tap.
- **Via fields:** the top view from the via cut's 2D solve; the side view from §5's (r, z) solution, mirrored to both
  sides of the axis.
- **Full-wave fields:** snapshots from §7 played back as frames in canvas and, in the 3D view, as textures on cut
  planes; colour scale fixed over the run (symmetric for signed components).

## 10. Workers, caching, budgets

- **Workers:** one static worker (2D, axisymmetric, via model, fields) and one full-wave worker that owns the GPU
  device. The page talks to them through clients that cancel stale jobs (the newest input wins) and cache results by the
  input's hash. The page shows a "stale" state while a job runs; the main thread never computes a solve.
- **Budgets** (on the owner's laptop, production build; × 4 CPU throttle for the phone figures; M0.3 and M0.4 confirm
  them with spikes, M9 checks them; M0.3's measurements and the pair rows it could not meet are in
  [solver.md](solver.md) §6; M0.4a's full-wave rates and the 2 M-cell via estimate in [fullwave.md](fullwave.md) §9.6, §11.3):

| Task | Budget |
|---|---|
| One 2D solve, microstrip with mask, error < 0.1 % | ≤ 20 ms (≤ 80 ms at 4×) |
| One 2D solve, coupled pair with mask and coplanar ground | ≤ 40 ms (≤ 150 ms at 4×) |
| Dragging a dimension | a new impedance every frame or every second frame; field map follows within 100 ms |
| Inverse solve (width, or width and gap) | ≤ 0.3 s |
| Sweep of 100 points | ≤ 2 s, drawn as it goes |
| Monte Carlo, 1,000 samples | ≤ 20 s, cancellable |
| Field map, 1440 px wide view | first picture ≤ 50 ms, full ≤ 300 ms |
| Via model (all segments, pads, cascade, TDR) | ≤ 30 ms |
| Full-wave run, via with feed traces (about 2 M cells, WebGPU) | estimator within 2× of the real time; no fixed target |
| Main thread per frame while dragging | ≤ 8 ms (≤ 12 ms at 4×) |

How the budgets are read (M9.2, [notes-M9.2.md](notes-M9.2.md); none was changed):

- **4× for work in a worker:** Chromium's CPU throttle slows the page's main thread only; CDP refuses it on a dedicated
  worker. The 4× figure of a worker's task (solves, the via model, sweeps, Monte Carlo) is its 1× time × 4; the round
  trip on a throttled page is reported beside it.
- **Field map:** the budget is the map's own work (M1.5: the solve excluded, checked in Node by check-fields). On the
  page, a typed edit's first picture also waits for the solve and for any job queued before it in the static worker;
  since M9.2 the worker takes solves and maps' first pictures before other jobs, so it is about 20 ms there too.
- **Via model:** checked in the static worker after an edit of the via (a new drill: the pads solved again) and after
  an edit of the trace (its feed lines solved again), median and p95. Since the fix after M9.2 the trace's own solve
  comes from the worker's solve cache, a feed mirrored through a symmetric stackup is the entry's, and the trace over
  the next plane beyond an antipad is solved as the vacuum problem alone (only its L′ is used; the same numbers): C44
  about 10 ms after a trace edit (was 40–55), 23 ms after a new drill (was 31; [notes-M9.2.md](notes-M9.2.md), "Fix:
  via-model budgets").
- **Drag frames:** "main thread per frame" is read two ways, both checked: the drag frame's own work (p95) and all
  main-thread work divided by the frames (CDP TaskDuration, which includes the harness's synthetic events).
