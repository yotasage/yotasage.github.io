# Notes from M2.3a – Target, sweeps, tolerance on the page (2026-11-16)

## What was done

Under the Trace section's results, a bar "Target · Sweep · Tolerance" opens three tools (`TraceTools.tsx`, a lazy chunk
loaded on the first press; the first load grew 1.1 kB to 167.1 kB gzip). The plots are the new framework-free
`lib/emsim/plot.ts` drawn by `components/EmSim/Plot.tsx`. Module rows in [modules.md](modules.md) and
[modules-page.md](modules-page.md).

## The plot's interface (for M3.2)

- `Axis` {min, max, log}; `ticks(axis, most)` gives 1-2-5 steps (log: 1, 2, 5 per decade, decades only when crowded);
  `niceAxis(lo, hi, most, { pad, log })` pads and snaps until its ends are ticks of the same step; `tickText` labels
  with the step's decimals and U+2212.
- Paths: `linePath(xs, ys, ax, ay)` and `bandPath(xs, lo, hi, ax, ay)` in frame units, whole numbers in 0 … `PLOT_U`
  (10⁵), clamped to −U … 2U (far under 2^24); a value that is not finite breaks the line. The view puts them under
  `translate(ML, MT) scale(pw/U, ph/U)` with `vector-effect: non-scaling-stroke`, so a resize changes one transform.
- Cursor: `readAt(xs, ys, x)` interpolates linearly (NaN outside or next to a missing point), `stepCursor` moves by
  points. The parent holds the cursor's x, so several plots of the same x share it (the sweep's plots do).
- M3.2 adds: a time axis (an `Axis` in s with ps/ns ticks: `tickText` needs a unit scale), dB (a value transform
  before `linePath`, the axis itself stays linear), and the cursor across plots of different x (the TDR and S plots).

## The three tools

- **Target**: the quantity (Z0; Zdiff or Zcm for a pair) and what is solved for (`targetChoices`: width; for an
  edge-coupled pair also the gap or both at a fixed ratio, `inverse`'s `'s'` and `'ws'`; broadside the width only;
  general arrangements are refused with the reason). Enter or Solve runs the worker's `inverse` job, then one `solve`
  0.1 % wider: the width's ± is the value's error over that slope, and the width (and gap) are shown by `qText` to
  those digits (C41: 0.1191 ± 0.0004 mm). "Use this width" commits the shown, rounded numbers as one undo step.
  Out of reach shows the engine's reason as it is.
- **Sweep**: any input of `inputsOf(setup, true)`, range in the shown unit (default ±50 % of a length, ±0.5 of εr,
  ±max(0.2 mm, 50 %) of a position), 3–200 points (51), the outputs of `outputsOf(n)` as one plot each (one line:
  Z0, εeff, delay; a pair: Zdiff, Zcm, the modes' εeff and delay; more lines: each line's Z0). The worker's sweep job now
  sends `SweepPartial` { from, points } at most every 50 ms (the first point at once; `vary.ts`'s `sweep` got a
  `sink`, no number changed), so the plot fills in as it goes. Cancel, a new sweep or an edit cancels it; what came is
  kept and marked. The dashed line is the input's current value, the band the solver's error, a table of the
  values under the plots.
- **Tolerance**: corners run at once when the tool is open (cheap), Monte Carlo 1000 (`MC_SEED`, normal σ = tol/3) on
  a button with progress and Cancel. The band shows the nominal with its error, the worst case, the median, ±2σ and
  ±3σ and the sd, as numbers and as bars on one axis; the ranking lists each input with its tolerance, the change per
  tolerance and its share (d²/Σd²). The tolerances: what is typed in a field, otherwise BL81's placeholders
  (`withPlaceholders`: ±10 %, εr ±0.2, mask ±30 %, the harness's own), tagged "placeholder", and a note says so.

## Measured (Edge, 1×, page round trip including the worker; `npm run ui`)

| | C39 microstrip | C41 pair |
|---|---|---|
| inverse (≤ 0.3 s) | 13 ms | 21 ms |
| sweep of 100 (≤ 2 s) | 57 ms | 136 ms |
| Monte Carlo 1000 (≤ 20 s) | 0.47 s | 1.37 s |

The owner's targets: C39 Z0 50 Ω at w = 0.1465 mm (50.000 ± 0.043 Ω reached); C41 Zdiff 100 Ω at w = 0.1191 mm with
the gap 0.2 mm (100.00 ± 0.14 Ω). C41's ranking: w −4.22, D1 thickness +4.16, D1 εr −1.77, gap +1.46 Ω per
tolerance, MC sd 2.18 Ω (as notes-M1.3.md).

## Checks

`npm run check` group "Plot (M2.3a)" (44: ticks over 400 random ranges, labels, log ticks, nice axes, mapping and its
inverse, whole and bounded path numbers, breaks, bands, the cursor). `ui-tools.mjs` (see modules-page.md).

## For M2.3b

- The calculator comparison belongs in the Trace section beside the results, not in the tools bar: a fourth button
  would hide it behind a press. TraceResults' panel ends with the matrices; the comparison can follow it as a details
  view, or become a fourth tool if the owner prefers it out of the way.
- "As JLCPCB's calculator" changes the stackup: as a committed setup it cancels and marks the tools' results like any
  edit, which is right; the target then gives JLCPCB's width on that variant directly.
- `tools.ts`'s `withPlaceholders` is the one place to swap in tolerances with sources when BL81 is done.
