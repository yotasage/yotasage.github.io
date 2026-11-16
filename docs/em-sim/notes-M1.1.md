# Notes from M1.1 – model, presets, KiCad reader, link (2026-11-16)

## What was done

`lib/emsim/`: `units`, `stackup`, `presets`, `kicad`, `structure`, `geometry`, `via`, `setup`, `link`, `project`
(one line each in [modules.md](modules.md)). Harness `npm run check` in `scripts/harness/emsim/`: 6 groups, about
5,000 checks in 1.6 s. engine.md §2 (positions) and §3 (mask side walls) got short additions.

## The mask convention (engine.md §3)

Side walls take the **over-copper** thickness, measured across (u) from the copper's sloped side and continued up to
the over-copper height; the mask's outer surface is the **upper envelope** of: the laminate level (`onLaminate`, or
`between` in any gap between two features of the layer, signal or ground), the side coats and the top coats. So coats
that meet in a narrow gap merge (the V fills to the "between" level), a "between" thicker than copper plus coat buries
the copper, and nothing is clamped. Why: JLCPCB gives C1, C2, C3 and no side figure; the side is copper as the top
is; the outline stays continuous at the top corners; it is what M0.3's spike used. An assumption, flagged; **M1.2
should measure** C39 with the side coat at 0, C2 and C1 to state its weight (expected well under 0.1 Ω).

## What later steps must know

- **M1.2 (BEM):** read `Section` (`geometry.ts` head comment is the contract). Polygons are CCW, tile
  [−ext, ext] × [zLo, zHi]; at |u| = ext every boundary is horizontal and `open` flags say which continue (rays from
  there, solver.md §2.4); `ext` is only the drawn extent (copper span + max(5 × section height, 0.5 mm)). Planes are not
  polygons: `planeBelow`/`planeAbove` are their faces and choose the kernel. Inner copper gaps use the **same material
  index** as the dielectric on the fill side, so equal-ε interfaces can be dropped by index. Conductors to the edge are
  flagged and need the far-end panel. Walls (`wall` > 0) close the box (ideal fence). `section()` costs about 5 µs.
  The mask polygon's lower chain follows the copper; vertical jumps in the surface are two points at one u.
- **M1.3 (tolerance):** every number is a `Val` with `tol` and `src`; `stackupVals` lists them. Perturb a
  `cloneStackup` and build the section from it. JLCPCB states no tolerance on thicknesses or εr (only ±10 % on
  impedance), so presets carry `tol: null`.
- **M1.4 (FD solver):** reads only the structure types and `section()` output; the FD grid can rasterise the polygons.
- **M1.6/M1.7 (vias):** `via.ts` holds the types and `viaIssues`; `viaStubs` gives the stub after backdrill. The two
  presets are C44 (`single`) and C45 (`pair`, oblong antipad 1.22 wide = the stadium 1.22 × 1.92). Return-via positions
  of C44 are placed at (0, ±0.8) (the facts give the distance, not the direction). **Plating 0.02 mm is a typed
  placeholder**: JLCPCB's hole-wall plating is not in the facts yet; M1.7 or M3.1 should look it up. An antipad that
  cuts into a return via is a warning (C44 has it: GND vias at 0.8 inside the Ø1.8 clearance).
- **M2.1 (page):** `defaultSetup()` is the owner's 50R_SE microstrip on JLC061611-3313A with the C44 via, written as
  `v=1`. `decodeLink` accepts a whole URL and reports issues per parameter; show them. Readers in `units.ts` return
  a reason for every refusal (fields say why). KiCad: read `.kicad_pcb` text with `readKicadStackup`, show `issues`
  (the placeholder warning, mask without εr) and `ignored`; `.kicad_pro` with `readKicadProject` and offer
  `structuresFromClass`. An edited preset's link is about 2.2 kB (BL77).
- **Presets** use JLCPCB's API data (GsuberlandStackups, 2025-05-09) for thicknesses: two centre layers differ from
  the page text of facts-fab.md §1.4 (06161H-3313A: 2116 0.1164, not 0.1088; 06161H-7628: 0.2104, not 0.2028), and
  06161H-2116A's centre is an unnamed 0.7 mm prepreg (εr 4.53 of a 0.70 core, noted as assumed, like 3313A's 0.865 at
  4.43). The 2-layer board's core (1.53) is derived and its source says so. Mask εr 3.8, C1 1.2 mil, C2 0.6 mil,
  C3 1.2 mil; outer copper 0.035 with the calculator's 1.6 mil as `calc`; etch 0.35 mil per side on every layer.

## KiCad coverage

Owner's boards: both read exactly as C38 (13 layers, 1.657 mm, εr 4.3 / tanδ 0.02 flagged placeholders, masks
0.01 mm without εr → 3.3 absent), classes as C39–C43 (`50R_SE` 0.1377 with the pair from Default; `LVDS_100R`
0.11 / 0.2, via 0.5 / 0.22; Default 0.2 / 0.25, clearance 0.2 / 0.1), schema 5. Demos: KiCad 10 ×3 and 9 ×12 read,
3 KiCad 9 boards without a stackup refused (microwave, multichannel ×2); fetched pic_programmer and video of 5.1.12
(refused: KiCad 5), 6.0.11, 7.0.11, 8.0.9 (read) and their projects (schema 2, 3). The jetson board (88 MB) reads its
stackup in milliseconds because only the items up to `setup` are parsed. The fetched files lie in the session's
scratch folder; without `EMSIM_KICAD_OLD` they are skipped with a note.

## Open questions

1. The mask side-wall convention's weight (M1.2 measures; the owner may know JLCPCB's practice).
2. JLCPCB's plating thickness for via barrels (M1.7).
3. From M0.2b, still open: 3313G vs 3313A, the frequency of JLCPCB's εr, whether sheet widths are base widths.
