# Notes from M3.2a: the via's plots

Step M3.2a (2026-11-16) gives the Via section its plots: the TDR and TDT at a chosen rise time with the feed traces in
the same record, and |S11|, |S21| in dB (for a pair Sdd, Scc, Scd). M3.2b adds the field maps and the via target.

## The plots (`ViaPlots.tsx`, under the results in `ViaSolve`)

- **TDR** `via-tdr`: Z(t) of the model's `tdr` (a pair: differential, or `tdrCommon` on the switch) against the time
  there and back from the port, with dashed lines at the port (`tdr.zRef`: 50 Ω, a pair's 100 or 25 Ω) and at the feed
  traces' Z0 in the record's mode (one line when both feeds agree within 0.005 Ω, else In and Out). A single-ended trace
  feeds each via of a pair on its own (the line at 2·Z0 differential, Z0/2 common); a coupled trace's Zcm is not in
  the result, so its common line is left out (BL118).
- **TDT** `via-tdt`: the transmitted step on the same time axis, sharing the TDR's cursor.
- **S** `via-s11`, `via-s21`: dB of the model's 401-point sweep (0 … the edge spectrum's −60 dB; DC left out, it has
  no dB), faded from `valid.fMax` (λ/8 of the longest lumped part) with the reason under the plots; the readout in dB
  and phase, "below −100 dB" at the floor (a symmetric pair's conversion is numerically zero).
- The record's stated error (`tdr.err.z`, truncation + settling, about 10⁻⁷ Ω) is under the TDT; the model's own
  error stays with the values above. When the shorter feed's round trip is under twice the edge, a note says their
  flat part cannot show: the default via's 2 mm feeds (1.7 mm to the pad, 20.6 ps there and back) at 35 ps have none.

## The cursor

Two shared cursors: the time plots one, the frequency plots another (a time and a frequency are not one reading;
linking them is BL119). Each is `Plot`'s parent-held x; pointer, tap and the arrow keys (Shift ten points, Home, End).
`data-plot-readout` carries `data-cursor` and `data-values` (each series' exact value there) for the harness.

## The settings

- Rise time `via.tr`: `readTime` ("35 ps", "0.1 ns", a plain number in ps, 5 … 500 ps; "35" is the literal 35e-12)
  and presets 15, 35, 100 ps. It also sets the flags' band and the sweep's end (43.3 GHz at 35 ps).
- Port `via.port`: the single-ended `z0` of every port; a pair's field is the differential 2·z0.
- Both are page state of `ViaSolve`, not in the link (BL117).
- The job: `viaOpt(tr, z0)` = {tr, z0, nf: 401} with the TDR on; the drag's fast path {tdr: false, nf: 2, estimate:
  false}. A via solve in the worker on the page: 16.6 to 20.0 ms after the first (33 ms, feeds and pads solved), within 30 ms.

## During drags

The plots draw `plotRes`, the last full solve; a full solve that arrives while a drag has not paused is not drawn
(the fast path is used nearly always anyway), so a drag frame never redraws them; they dim (`data-stale`) until the
drag's end. ui-viadrag at 4× (work p95 / task per frame, ms): side antipad 4.6 / 15.3, return via 4.7 / 13.9, pair top
antipads 4.9 / 18.8; the full `npm run ui` run: 4.1 / 15.0, 4.4 / 13.7, 4.9 / 19.7 (M3.1b: 4.4 / 14.5, 4.8 / 13.8, 4.7 / 18.4): no change beyond noise.

## Numbers checked (ui-viaplots, = the engine in Node)

- Default via: TDR and TDT at three times, |S11|, |S21| at three frequencies (dB to 10⁻⁹ dB: the browser's and Node's
  last bits of S differ); feed Z0 51.4976 Ω.
- 25 mm feeds (the milestone's "done when"): the flat part before the via (at 150 ps) 51.497582 − 3·10⁻⁹ Ω and after it (at 471
  ps) 51.497582 + 2·10⁻⁹ Ω against the trace's 51.497582 Ω, within the record's stated 1.3·10⁻⁷ Ω.
- Rise time: the peak's distance from √(L/C) = 50.23 Ω is 5.07, 1.16 and 0.39 Ω at 15, 35 and 100 ps (peaks 55.30, 51.39, 50.62 Ω).
- Pair: differential and common TDR at two times, Sdd, Scc, Scd at three frequencies each.

## Checks

`npm run check` 19 236 (the Plot group 59: time ticks over 300 random records, dB, phase). `ui-viaplots.mjs` in
`npm run ui` (65 checks, 996 in all; ui-why 163 keys). First load 179.4 kB gzip (the plots in the Via
chunk).

## For M3.2b and M8

- M3.2b: the field maps go next to the drawings; `ViaPlots` needs nothing from them. The via target's result is a
  `ViaModelResult` too, so it can be drawn by `ViaPlots` as it is.
- M8 (export): the plot data is the result's `tdr`/`tdrCommon` (t, z, tdt, err) and `nport`/`mixed` (an `NPort`:
  Touchstone directly); the SVG of `Plot` has whole-number paths under one transform, so it can be serialised as it
  is, with the theme's colours resolved.
