# Notes from step M7.2d – the full-wave theory topic on the page

Done 2026-11-17. With it M7 (waves on the page) is done; M9 (polish and re-checks) comes next, as plan.md's order says.

## 1. What is on the page
- **Topic 14** (`components/EmSim/TheoryWaves.tsx`, in the Theory chunk after topic 13): [theory-waves.md](theory-waves.md)
  as written, without the ⟨n⟩ markers, its ten sub-anchors (`fw-why` … `fw-checked`) in `TOPICS` and the contents. The
  eight new sources are cited through the shared `cite()` and numbered with the rest by first citation;
  `OpenEMSDocs` carries its page (Numerical method, Ports) as claims.md names it. The page adds three link phrases the
  doc now has too: "the player in the Waves section", "The Drive choice in the Waves section shows each", "The 3D view
  in the Waves section" (`#waves`, `data-fw-link`), instead of pictures of a run.
- **Live numbers.** The prose keeps the default via's numbers (V at 35 ps). The equations and four "now" lines
  (`data-waves-now` yee, mesh, ports, cost; frames after a run) take theirs from the Waves section: WavesSection feeds
  `feedTheory({ waves })` with its `Preview` (and the setup and spec it was made for) and its last run while that is
  for the same setup and spec. Before the Waves section has an estimate (it loads only near or by `#waves`) a line says
  the text's numbers are the default via's and links there. `Preview.minCell` (mm) is new: the mesh's smallest cell
  per axis, from the same `minCell` buildProblem uses, so the engine's numbers are unchanged; `hmax`, `erMax` were
  already in `Preview.geom`. After a run: the ports' Z (`records.ports[i].z0`), the frames and their step
  (`snap.frames`, `snap.every`), the last S frequency, and the rate the run measured (the estimate follows it).
- **Equations** (`lib/emsim/equationsWaves.ts`, registry 70): `fdtd-update`, `fdtd-courant`, `fdtd-steps`,
  `fdtd-cell`, `fdtd-dispersion`, `fdtd-pulse`, `fdtd-waves`, `fdtd-s`, `fdtd-cost`, `on: 'waves'`; numbers from
  `lib/emsim/eqvaluesWaves.ts` `wavesBinding`. Five are live (courant, steps, cell, pulse, cost), four are rules
  printed without numbers. Each entry has a **Derivation** button (the page's `.button`) that opens the shared dialog
  (`derivationOf`, now exported from EqPanel.tsx) with the estimate's numbers in the steps that have every quantity;
  the dialog is mounted only while open, so other scripts' `dialog[data-derive]` locators stay unique. How the steps
  were written so that every one has a numeric check: equations-list.md "As registered (M7.2d)". The shared engine
  gained `ceil` (`lib/equations/`: parse, tex ⌈ ⌉, compile).
- **Figures** (`TheoryWaveFigures.tsx`, static SVG on the theme tokens, labels 15 px so they read at 320 px): one Yee
  cell (E on three edges, η₀·H at three face centres), the leapfrog (E at whole steps, η₀·H at half steps, arrows each
  way), a barrel staircased beside conformal (the cut edges' outside parts drawn thick).
- **Short lines:** whys.ts links the 17 lines of theory-waves.md's last table (via-next → `fw-why`, the Waves,
  player and 3D lines); `TOPIC_TITLE` has `full-wave` and the ten sub-anchors; theory-lines.md's → column matches.
- **Stale text:** topic 13's last sentence now links to topic 14 (theory-vias.md ⟨204⟩ and its claims row to match);
  theory-vias.md ⟨161⟩ says 1.5 mm with the reason the page gives (claims row: `RETURN_NEAR_MM` 1.5).
- Status note: M7 complete (the theory topic in STATUS_NOW), "Not here yet" names M9's polish and re-check; README
  likewise. `content-visibility`'s intrinsic size of the Theory 22 000 → 26 000 px.

## 2. Checks
- `npx tsc --noEmit` clean; `npm run build` passed (once after the known SecurityFatalError notice), next-env.d.ts
  restored; the new code read against the static-export rules (nothing fetched, no server feature).
- `npm run check`: 54 061 of 54 061. check-teach.mjs 9 506 → 9 928: the registry's 70 entries, random bindings for the
  nine new entries' 34 steps (rounded constants within stated bounds), `checkWaves` (V at 15/35/100 ps, C45, the
  default trace: `Preview.minCell` against the mesh, Δt against `courantDt`, T, τrt, steps, cells against the
  estimator, the largest cell against `largestCell`, the pulse against `pulseOf`, f_S against `F_S`; the 100 sides of
  the five live entries equal the engine within 2·10⁻¹⁶; V's quoted numbers 712 320 cells, 7645 steps, 52.444 fs,
  400.93 ps, 0.37393 mm, 43.429 GHz, 13.622 ps, 68.109 ps, 35.438 GHz, 1.0891·10¹⁰ updates; 0.99271, 3.717, 0.8165).
- `npm run ui` (built once, then `ui.mjs --no-build`): 24 of 24 scripts, 1 942 checks; ui-theory 123 → 182 (see
  modules-page-checks.md), ui-why 142, ui-equations 341 (the theory's dialog mounts only while open, so its locators
  stay unique). First load 186.7 kB gzip (186.5 before: whys.ts's titles and the feed's type); the Theory chunks
  332.6 kB gzip with KaTeX. ui-drag passed in this run, no flake.
- Screenshots (looked at): `emsim-theory-full-wave-390-dark.png`, `emsim-theory-full-wave-1440-light.png` and the
  `fw-yee`, `fw-mesh` parts in the session's scratch `shots` folder. The first pass showed the Derivation button
  unstyled (`.root button` resets a lone class: it now uses the page's `.button`), the Yee cell's top cut off, and
  labels too small at phone width (now 15 px in narrower viewBoxes).

## 3. Left out
- BL189: the Waves section's own numbers as `EqNum` buttons into the equation panel, and the theory's Derivation
  button on the trace and via topics.
- The prose's numbers stay the default via's (as the via topics' do); only the equations and the "now" lines follow the
  Waves section.

## Fix: squared units
- A value with a unit (or `j0.5`) as the base of a power or `^{*}` printed as `50\,\mu\mathrm{m}^{2}`, which reads as square micrometres; the shared printer (`lib/equations/tex.ts`, `TexPiece.u` set by `valueTex`) now brackets it, `(50\,\mu\mathrm{m})^{2}`, for the EM entries `fdtd-courant`, `fdtd-pulse`, `l-c0`, `v-eeff`, `ztdr`, `share`, `rss-sigma`, `cavity-f` and the Smith chart's `quarter-wave`, `quarter-wave-match`, `q-l-network`, `fbw-series-rlc` (`z_t^{*}` too when z_t is purely reactive); checked in the Smith harness's "equations TeX" group and by `RAISED_UNIT` in check-equations.mjs and check-teach.mjs.
