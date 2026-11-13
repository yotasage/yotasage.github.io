# Smith chart – notes of step M7.4b (the sweep's theory on the page; M7 done)

Done 2026-11-13. The two topics of [theory-sweep.md](theory-sweep.md) on the page, six registry entries with their
derivations, the short lines relinked, the printed chart's rim scales kept whole, and the M7 roll-up below.

## Page

- **Topics 11–12** ("Q and bandwidth" `#q-and-bandwidth`, "Reading a frequency trace" `#reading-a-trace`) are in
  `components/Smith/TheorySweep.tsx`: `SweepTopics`, a memoised child of Theory after `SolverTopics` (so `WikiQ` is
  numbered in page order), with Theory's `topic`, `cite`, `L`, `jump` and `Eq`, memoised on the circuit, the sweep, the
  layer getter, the bibliography, the two topics' folding and the way back. In the contents and folding like the others.
- **Live boxes** (`data-sweep-box` q and trace). With the sweep on ("Your circuit"): the band figures come from the trace
  layer's `figureListeners` (the worker's refined trace, shared with the plot and the report; taken in a transition and
  used only when their band and limit are the page's), so the theory sweeps nothing; the input at the band's ends and
  each marker by `markerAt` on the committed circuit, node Q by `evaluateCircuit`. The boxes (`QBox`, `TraceBox`) read
  the circuit from `SweepCircuitContext`, which Theory provides, and `SweepTopics` is memoised without it: a commit
  renders the two boxes, not the topics' text and equations (first the whole child rendered on every commit; the
  4× drag A/B below moved from +0.42 to −0.10 ms). With it off ("Start circuit"): the
  start circuit over `defaultBand` at 10 dB with markers at 90 and 110 MHz, swept once on first render (0.3 ms). Open
  ends in the words of `bandText.ts`. The page passes the sweep deferred (`useDeferredValue`, as the circuit) and in the
  memo of the theory's section; a "read this point" challenge passes none.
- `fractional-bandwidth` and `q-loaded` show the visitor's numbers when the interval is closed at both ends.
- **Worked examples** are fixed text in `data-ex` spans (113 on the page, 101 distinct), recomputed by the harness from
  the circuits of notes-M7.4a.md (`scripts/harness/smith/sweep-examples.mjs`), plus a table of the examples'
  fractional bandwidths. All printed at four significant digits (the doc's five-digit edges round: 161.80 → 161.8 MHz).
- **Correction:** the "line + short stub" example needs 0.3238 λ of line (233.1° of turn, from the load at Γ = −0.2 +
  j0.4 round to −0.2 − j0.4 on g = 1), not 0.1619 λ (which leaves |Γ(f0)| = 0.689 and no band); its band, 88.92–114.3
  MHz, was computed with 0.32379 λ. Fixed in theory-sweep.md, claims.md (255) and notes-M7.4a.md.
- **Figures** (`TheorySweepFigures.tsx`, primitives exported from `TheoryFigures.tsx`): topic 11 the series resonators
  x = ±2 and ±5 on r = 1 and the start load with the λ/8 stub alone and behind λ/2 of line, 10 dB dashed, ticks at 90
  and 110 MHz; topic 12 (a) the start trace with an arrow for rising f, dots at 50, 79.50, 100, 150 MHz and its
  return-loss plot with the matched stretch shaded, (b) the two-section match with its loop and the two dips, 20 dB. The
  six example traces are swept once, when a figure first comes within 400 px of the view and the browser is idle
  (`IntersectionObserver`, `requestIdleCallback`; about 2 ms), so the static page, hydration, folded topics and drags
  never pay for them. Side by side; trace above plot under 560 px (`Figure`'s `stack`).
- Claim 129's sentence links "Q and bandwidth"; so does theory-solver's "(… over a narrower band)". The theory's lead
  says the last two topics sweep a band.

## Registry (75 entries, 30 derivations)

The six entries of notes-M7.4a.md, with `arccos` in `FUNCTIONS` (TeX `\arccos`; the evaluator gives `Math.acos` on
real arguments in [−1, 1] and the principal value −j·ln(z + j√(1 − z²)) elsewhere, so no NaN). New symbols: f_0,
omega_0, FBW, f_lo, f_hi, Q_L, f_m, f_1, f_2 (half-power edges; the notes' f₊/f₋), omega_1, omega_2, X_m, Gamma_m,
v_Gamma, y_d, s, theta_m; `r` of `l-network-slope` is R_L/Z0 (its own symbol). Steps rewritten so reasons hold their
maths in backticks. The four derivations take no numbers from the visitor's circuit (`theorySubject` null: they are
about example circuits).

check-equations.mjs binds them from sweep.ts on a stream of their own (`bandRandom`, so the shared one is unchanged):
worst relative spread 0 (fractional-bandwidth, q-loaded), 1.2e-11 (q-series-rlc), 8.3e-11 (fbw-series-rlc), 2.0e-11
(quarter-wave-bandwidth), 2.4e-10 (l-network-slope, a Richardson central difference); TOLS 1e-10 / 1e-9 with the
reasons in the file (edges bracketed to 1e-12 of f, amplified by 1/FBW and Q).

## Print fix

The printed chart (Report's `chartCopy`) was cut to the disc plus 44 px, less than the grid's scale room
(`SCALE_ROOM_PX`), so rim labels were cut at the top, bottom and left. Now the box is the disc plus `SCALE_ROOM_PX + 4`
and grows to every perimeter label's drawn box (+2 px), within the chart's box. ui-report checks every rim label of the
print copy inside the printed frame at A4 and Letter in both themes.

## Checks

- `npm run check`: 1,395,121 checks (check-equations: 75 entries, 202 trees; the six new at 200 points each).
- `npm run ui`: ui-theory 8,011 (196 live numbers on the start page, 113 worked-example numbers, 62 citations, 97
  #links; 596 live numbers over three visitor sweeps: the start circuit on its default band, C3 over 10 MHz–1 GHz log
  at 15 dB with three markers, C1 over 1.8–3 GHz with 2,001 points at 6 dB; the eight figure traces drawn only once in
  view; twelve topics; no horizontal scroll at 320 and 390 px in both themes), ui-derive 38,885 (30 derivations, 127
  steps, every one opened from the theory), ui-why 992 (the eleven relinked lines open their topics), ui-report 114
  (four new: every rim label of the printed chart inside its frame at A4 and Letter in both themes; 76 labels). Every
  other script passes except ui-drag's two absolute 4× checks (this machine: 13.67 ms per frame, 4 frames lost).
- **ui-edit's 320 px one-finger draw** failed (6 moves) while the status note was one line longer ("explains Q and
  bandwidth"): the line pushed the chart down and the drag's end below the 844 px viewport. The status note is left as
  it was (it already says only export is to come); the test's fragility is **BL65**.
- **A/B, 4× drag with a 10,000-point sweep shown** (`SMITH_TRACE_AB=1 tsx ui-trace.mjs`, median of three runs, HEAD
  faac5a6 against this step, interleaved by stashing the step's tracked code files): with the theory's boxes on the
  context, 14.49 / 13.73 and 11.26 / 11.82 ms (−0.76, +0.56; mean −0.10 ms). Before that change: 12.54 / 13.85 and
  14.02 / 13.55 (+1.31, −0.47; mean +0.42).
- `npx tsc --noEmit`; `npm run build`. Looked at in both themes at 390 and 1440 px (figures, boxes, table) and the
  printed A4 page (rim labels whole).

## M7 roll-up (milestones.md "Done when")

M7 is done; one exception, said plainly at the end.

- **Every swept point equals the point engine to 1e-12.** check-sweep "sweep vs point engine": 200 random circuits
  (1–10 parts of every kind), every point of the refined trace (about 145,000) bit-identical to `evaluateCircuit`
  (worst difference 0; M7.1). On the page, ui-trace reads the drawn trace for five circuits against the engine's sweep
  to 1e-9 (the path's whole-number coordinates are within 5e-10; M7.2a).
- **Band figures match a 10⁶-point brute force and the series RLC and λ/4 closed forms.** check-sweep "sweep figures
  vs brute force": 200 circuits, 207 intervals and 414 edges, worst edge 1.9e-10 relative, none missing or extra, 200
  loaded Qs within the brute force's step; "sweep closed forms": 57 cases, worst 1.3e-10 (M7.1). M7.4b adds the
  registry's `q-series-rlc`, `fbw-series-rlc` and `quarter-wave-bandwidth`, their steps checked against the figures at
  200 random points each (worst 1.2e-11, 8.3e-11, 2.0e-11).
- **A 10,000-point trace redraws within engine.md §9's budget at 1× and 4× while dragging.** ui-trace: every drag frame
  draws a coarse trace within 0.3 ms of script (about 400 points at 1×, 48–70 at 4×) and the refined trace comes from
  the worker after the release; ui-drag's 4× A/B with a 10,000-point band: +0.44 ms per frame (M7.2a), the plot −0.11
  ms (M7.2b), the report −0.30 ms (M7.3), this step −0.10 ms. The exception: ui-drag's two *absolute* 4× checks (10 ms
  per frame, no lost frames) fail on this machine with or without the sweep (11–14 ms; excepted since M4.3a), so the
  budget is shown by the A/Bs, not by the absolute figure.
- **Plot and chart point at the same frequency both ways, by mouse and touch.** ui-plot (96 checks): hover, tap and
  arrow keys on the plot show the frequency's point on the trace and the reverse, markers on both, a plot drag moves a
  marker on both, at 1280 px by mouse and at 390 and 320 px by touch (M7.2b).
- **The printed report fits its pages at A4 and Letter, in both themes, with nothing cut.** ui-report (114 checks):
  print media at both papers' widths shows only the report, nothing interactive, nothing wider than the page, light
  colours in both themes; `page.pdf` gives 3 pages at A4 and at Letter in both themes with every value and the link
  in its text (pdftotext); no table row or figure cut by a page break (M7.3). The chart's rim labels were cut in M7.3's
  print (the copy kept only 44 px around the disc); fixed here and checked label by label (76 labels, none cut).
  (The milestone names Edge's own print dialog; the harness prints with Chromium's `page.pdf` in Edge, the same engine.)
