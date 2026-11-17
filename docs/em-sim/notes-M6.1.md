# EM simulation – notes of step M6.1 (2026-11-17)

Mesh, materials, ports, CPML, the estimator's static part and an f64 reference kernel for the full-wave solver, in
`lib/emsim/fdtd/` ([modules-fdtd.md](modules-fdtd.md)); checks in `check-fdtd-mesh.mjs`, group "FDTD mesh (M6.1)"
(20 854 checks; 53 071 in all). Harness only, no page work.

## Modules
`model.ts` (Setup → 3D geometry, ports, mesh constraints, material columns), `mesh.ts` (graded axes), `materials.ts`
(CA, CB, conformal fractions), `cpml.ts` (profiles, b/c tables, ψ), `ports.ts` (lumped ports, probes, pulse),
`estimate.ts` (cells, Δt, steps, memory, verdicts), `problem.ts` (assembly, `allocatedBytes`), `ref.ts` (f64 kernel).

## Mesh rules as built
- Fixed lines by rank: copper edges and faces, sheets' planes, barrel and backdrill ends, port ends (0); dielectric
  interfaces (1); measurement planes and trace centres (2). Lines < 20 µm from one taken are dropped (averaged).
- Each gap gets the fewest cells, from its count rule up, that fit within 1.3 of the neighbouring end cells and
  20 µm…λ/15; sweeps reach a fixed point. **Count rules yield** where 1.3 and 20 µm make them impossible (the harness
  proves it): 3 cells across 84 µm of 1080 prepreg between 35 µm copper cells (JLC 8-layer, JLC06161H-1080).
- Barrel block: uniform cells ≤ d/6, shrunk so the feed edges (w/2 = m·h, m ≥ 2) and a pair's pitch fall on its lines.
- Δt = 0.95/(c0·√Σ Δmin⁻²); steps = (10σ + 3τrt)/Δt; CPML 8 cells of the last cell each side.

## Presets (cells, steps, MB f32, estimate/allocated)
| Case | Cells | Steps | MB | Est./alloc. |
|---|---|---|---|---|
| microstrip (default stackup) | 113 022 | 4 577 | 7.5 | 0.9998 |
| pair-cpw | 148 005 | 4 952 | 9.5 | 0.9996 |
| C44 via | 712 320 | 7 645 | 40.9 | 0.9987 |
| C45 pair | 956 760 | 7 952 | 54.2 | 0.9983 |
| backdrilled via | 722 496 | 7 039 | 41.4 | 0.9988 |
| JLC04161H-7628 via | 579 768 | 6 207 | 33.7 | 0.9993 |
| JLC 8-layer via | 634 368 | 6 580 | 36.8 | 0.9991 |

All 11 trace kinds and 7 vias are in the check's note. The C44 run is about 0.71 M cells, not §11.3's 2 M (smaller
air margins and a coarser grading than that guess), so WebGPU about 1.4 s, JavaScript about 4.5 min at the table rates.

## Differs from fullwave.md, and why
- **Count rules vs ratio:** above. **Traces** are meshed at their mean width (base less one etch offset), so the
  edges are lines. **Mask:** on laminate `onLaminate`, over copper `onCopper`; side-wall coats and `between` are not in
  the columns (BL146). **Sheets:** each half takes its neighbour dielectric everywhere, so the interface is the sheet's
  plane (also for copper layers the model leaves empty).
- **ψ:** 2 E + 2 H values per slab cell (each normal axis's slab; corners count in each), 16 B f32, not §9.1's 32 B.
- **Feeds:** L = max(1.5 mm, 10h, 5w) runs from the barrel block's edge (measurement planes stay outside the antipad);
  the via's own feed lengths are not used. Feeds at other angles than multiples of 90° run along the nearest axis
  (warning, BL148). A feed on a layer that is neither the trace's nor its mirror is a stripline, microstrip or embedded
  line of the trace's width between the via's nearest planes (info note).
- **Backdrill depth** within 20 µm of a layer face ends on it (info note). Barrels and return vias are solid
  cylinders; return-via pads sit on their planes.
- **Coplanar ports** (no plane): paths across both gaps on every z line of the copper. **Loss** of series layers:
  σ = ε²·mean(σ/ε²).
- **Conformal cells** (Yu–Mittra) are not energy-conserving: from random fields the energy drifts 3·10⁻³ in 300 steps,
  6·10⁻³ in 2000 on the C44 via (exact, 3·10⁻¹⁴, without conformal edges) (BL147).

## What M6.2 needs
- `buildProblem(setup, kind)` gives everything; the kernels are `ref.ts`'s loops plus the CPML ψ updates (tables and
  ψ in `cpml.ts`; κ already in `lines`), all ports' sources (`src` × `pulseAt`), the records (`v` at a plane's two
  lines, `i` between them: average the two v to the loop's half index), DFT, TDR, energy stop.
- Port 1 only is driven in `ref.ts`; M6.2 picks the excitation per run. `loads: false` leaves the resistors out.
- Watch the energy with conformal edges (BL147). The microstrip's 1 % bar may need the thirds rule (§2) in `model.ts`.
