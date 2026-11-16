# Notes from step M3.1a – the Via section (form, drawings, results)

Done 2026-11-16. The page's Via section, between Trace and Theory: the via typed in a form, drawn to scale from the
side and from the top, solved by the via model in the static worker. Handles and pan/zoom are M3.1b; the TDR,
S-parameters, fields and the target M3.2.

## The form (`ViaSection.tsx`, edits in `viaEdit.ts`)

- A chunk of its own (`import('./ViaSection')` from EmSimTool when `#via` comes within 400 px, or the hash is `#via`;
  `via` is in `TOOL_IDS` so `#via` does not load the Theory). First load 175.4 → 178.6 kB gzip (the frame, the
  nav link and the 36 short lines in whys.ts).
- Single · Pair, the presets C44 (`single`) and C45 (`pair`), "Entry on the trace's layer"; barrel from/to,
  entry/exit; drill, plating, pitch; one row per copper layer (pad, empty = removed; plane checkbox; antipad shape
  round / oblong / joined with its bridge, and Ø); "All antipads"; return-via rows (x, y, drill, pad, planes joined,
  remove) and "Add return via" (a free spot at the existing returns' distance, away from the feeds); backdrill (side,
  depth, Ø; refused with a reason when there is no stub); feed rows (layer, length, direction in degrees).
- Every edit is one `commit`; typing in one field is one undo group `via.<key>.<v|tol>`. A via that makes no sense
  is kept as typed and `viaIssues` says why under "About this via"; the results then say "Not solved: …".
- The link: the via was already in the plain form (setup.ts); ui-via checks the round trip in a fresh context.

## The drawings (`viaGeom.ts`, `ViaDrawing.tsx`)

- World in mm. **Side view:** x along the section line u through the via's centre (`sectionDir`: a pair's axis
  (0, 1); one via against its entry feed, so the entry comes in from the left), y down from the board's top
  (y = zTop − z of `stackZ`); air `max(0.12, 0.08·t)` above and below. Return vias and barrels off the line are
  projected (`inCut` false, drawn pale). Antipad openings on the line come from `insideAntipad` by sampling (480
  points) and bisection, so a new shape needs only its test; `openings` are kept for M3.1b's handles.
  **Top view:** board (x, −y), the box around the barrels, antipads and returns; antipads as paths (`antipadPath`),
  the section line `cut`, feeds clipped to the box.
- px: one scale per view (`fitK`, same in x and y): side ≤ 420 px tall with a 58 px label column; top ≤ 380 px
  square. M3.1b: give `panZoom.ts` the world box (`box`) as the fit rect; handles map through the same `X`/`Y`.
- The plane is drawn as copper over the laminate with the union of the antipads painted as laminate (overlapping
  holes in one path would fill again under nonzero).

## Results (`ViaResults.tsx`)

- Job `via` with `VIA_OPT = { tdr: false, nf: 2 }` on its own channel; M3.2 drops `tdr: false` and asks for the
  sweep. The result keeps `elements`, so M3.2 could also cascade on the page side, but the plan is the worker.
- Shown: barrel Z (or Zdiff, Zcm) of the longest through piece with the cut's error (viamodel.ts `barrel`, now with
  `zdiffVacErr`, `zcmVacErr`); section √(L/C) (or Zdiff, Zcm), delay, L, C with ΣΔC; the pieces merged per dielectric
  and line; ΔC per crossing with its error; stubs (`realStubs`: the half of the signal copper the model also lists is
  hidden, BL113); feeds' Z0 and εeff; λ/8 validity; the flags with their sentences and `data-numbers`; the assumptions
  as sentences (`ASSUME_TEXT`, incl. `antipad-as-round` for BL88).
- Section error: ½(rel. error of the lines + (lineC·rel + ΣdCErr)/C), the bounds added; ΔC per pair is per via.

## Numbers on the page (= the engine in Node)

C44: barrel 59.71 ± 0.08 Ω, section 50.23 Ω, ΣΔC 90.0 fF. C45: barrel Zdiff 92.23 Ω, section Zdiff 83.49 Ω. Exit
on L3 (exit feed removed, BL114): stub resonance 21.79 GHz (M1.7 noted 21.9 before M1.8b's εr). One return 3 mm away:
`return-far` (3.00, 2). No return: `no-return`, not solved.

## Timing (production build, the owner's laptop, 1×)

The model in the worker: the first solve 30–31 ms (feed lines and pads solved), then 17–18 ms after an antipad or
drill change (new pads), 11–14 ms otherwise; round trips 15–35 ms (the first 74–81 ms with the worker's start).
Budget 30 ms (engine.md §10): met after the first; the first is at it.

## For M3.1b and M3.2

- Handles: the geometry has everything in mm; drag the antipad (`openings` edges, `antipadPath`), the pad (copper
  rects with `what: 'pad'`), the drill (barrel), the pitch (barrel B), the backdrill depth (`drilled`), return vias
  (top view circles `data-via-return`, `withReturn`, `addReturn`, `removeReturn`). Apply through `viaEdit.ts`.
- The drag budget: a via solve is 11–18 ms in the worker; the fast path could use `estimate: false`.
- M3.2: the TDR needs `tdr` back on (≈ 3 ms more for C44, two TDRs for a pair).
- Leftovers: BL112 (widen thin layers in the side view), BL113 (half-copper stubs), BL114 (inner exit feed refused).
