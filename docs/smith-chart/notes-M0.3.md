# Notes of M0.3: spikes

Spike code stayed in the scratch folder. Edge 157.0.4341.42 via `playwright-core` 1.50 on the owner's laptop, 300
frames per run. "Work": `performance.now()` around update plus forced layout; "main": main-thread busy time per frame
(CDP `Performance.getMetrics`, incl. paint recording); "drop": rAF intervals over 20 ms. 4×:
`Emulation.setCPUThrottlingRate`, main thread only (raster and GPU are not slowed). (a), (b) headed (headless within 10 %).

## (a) MathML per frame: time-slice the equation panel

Ten KaTeX 0.19.1 MathML equations with live numbers and the `\textcolor` → class pass, `innerHTML` replaced per frame.

| Per frame | work 1× med / p95 | main 1× | work 4× med / p95 | main 4× | drop 4× |
| --- | --- | --- | --- | --- | --- |
| 10 equations | 2.3 / 2.8 ms | 3.6 ms | 14.1 / 19.2 ms | 20.9 ms | 25 % |
| 3 equations | 0.9 / 1.2 ms | 1.9 ms | 4.1 / 5.7 ms | 8.6 ms | 0 |
| 1 equation | 0.4 / 0.6 ms | 1.0 ms | 2.0 / 2.7 ms | 5.0 ms | 0 |

`renderToString` is 0.3 ms of it at 1×; the rest is DOM, style and MathML layout. **Decision:** the panel updates in a time slice after the chart's update: it renders
the visible equations round-robin until 3 ms of work are spent, then continues in the next frame; on pointer up every
equation gets its final value. On the laptop all ten fit every frame; at 4× two or three per frame (each one refreshed
at 12–20 Hz). A fixed lower rate was rejected: rendering all ten in one frame costs 21 ms at 4× and drops that frame.

## (b) SVG chart: holds the budget with the grid in its own layer

200 grid circles clipped to the unit circle, 10 arcs as `A` commands, a 2,000-point trace as one `d`, 10 handles;
`vector-effect: non-scaling-stroke`; zoom by one `transform` on a group; drag rewrites all arcs, handles and the trace.

| Structure, gesture | work 1× med / p95 | main 1× | drop 1× | work 4× med / p95 | main 4× | drop 4× |
| --- | --- | --- | --- | --- | --- | --- |
| one `<svg>`, zoom | 0.2 / 0.4 ms | 1.0 ms | 0.7 % | 1.2 / 1.7 ms | 6.0 ms | 1.3 %, one 367 ms stall |
| one `<svg>`, drag | 0.6 / 0.8 ms | 0.9 ms | 0.3 % | 2.6 / 3.0 ms | 3.8 ms | 8.7 % |
| two layers, zoom | 0.3 / 0.4 ms | 0.7 ms | 0 | 1.3 / 1.7 ms | 3.1 ms | 0 |
| two layers, drag | 0.6 / 0.8 ms | 0.8 ms | 0 | 2.6 / 3.1 ms | 3.7 ms | 0 |

The main thread is far inside the budget in every case; the dropped frames of one `<svg>` come from re-rastering the
grid when anything in the same SVG changes. **Decision:** SVG with this structure: the grid (circles, later labels) in
its own `<svg>` with `will-change: transform`, the moving layer (arcs, trace, handles, readout) in a second `<svg>`
stacked on it, same zoom transform on both. Most of the 2.2 ms script at 4× is building the trace's `d` string.

## (c) Equation text → tree → TeX: the printer works

A 105-line prototype (Pratt parser, printer, complex evaluator) on 24 entries: the owner's notes 1, 2, 4–8, 10, 11,
the g and b circles, Γ, VSWR, RL, Z_in, X_C, λ/4. All render with KaTeX
`throwOnError` and `strict: 'error'`; every side of every chain agrees on 200 random Γ to 1.5e-15 (which also checks
the notes' algebra). Parse and print take 0.004 ms per entry. Ugly cases found, each with the rule for M1.4:

1. `-2*Gamma_i/(...)` printed `\frac{-2\Gamma_i}{…}`: **unary minus binds like a product**, so it prints `-\frac{…}{…}`.
2. `j*2*Gamma_i/(...)` printed `\frac{j \cdot 2\Gamma_i}{…}`: **j before a number is juxtaposed** (`j2`, as `j0.5`),
   and entries are written `j*(2*Gamma_i/(...))`, which prints `j\frac{2\Gamma_i}{…}`.
3. `Z_0*(A)/(B)` printed `\frac{Z_0(A)}{B}`: left-associative division is right; entries are written `Z_0*(A/B)`,
   which prints `Z_0\frac{A}{B}`.
4. The author's redundant brackets are dropped (`((1 - Γr) - jΓi)` → `1 - Γr - jΓi`): **the parser keeps a bracket
   the text writes** around a sum or difference (a derivation step must show the grouping it is about); brackets
   around an atom or a fraction are still dropped.
5. `a + (-b)` printed `a + -b`: **a negation on the right of + or −, or as a later factor, is bracketed**.
6. Kept: juxtaposed products, `\cdot` only before a number, `\left(\right)` only around a fraction, `\tan βℓ`
   unbracketed, multi-letter names upright (`\mathrm{VSWR}`, `Z_{\mathrm{in}}`), Greek by name, italic `j`.

**Decision:** the grammar and printer above with rules 1–5 for M1.4; the hand-written-TeX fallback is not needed.

## (d) Touch: `pan-y` on the chart, `preventDefault` on a handle's touchstart

Touch emulation, 390 × 844 viewport, `isMobile`, chart 358 px square in a scrolling page, gestures sent with CDP
`Input.dispatchTouchEvent` (13 moves 16 ms apart). Scroll in CSS px; chart events counted with pointer capture.

| Chart setting | 1 finger up on background | 1 finger from a handle | 1 finger sideways | pinch | 2 fingers up |
| --- | --- | --- | --- | --- | --- |
| `none` | chart, no scroll | chart | chart | chart, 2 pointers | chart |
| `pan-y` | page scrolls 166, chart gets `pointercancel` | page scrolls | chart | chart, no page zoom | chart, no scroll |
| `pan-y`, `none` on handle `g`/`circle` | page scrolls | page scrolls | chart | chart | chart |
| `pan-x pan-y` | page scrolls | page scrolls | `pointercancel` | chart | chart |
| `pan-y` + handle `preventDefault` | page scrolls 167 | **chart, no scroll** | chart | chart | chart |

`touch-action` on an SVG child element is ignored. `none` leaves only the margins to scroll the page by. **Decision (D14, M2.2):** the chart has
`touch-action: pan-y` and a non-passive `touchstart` listener that calls `preventDefault()` only when the touch starts
on a handle's hit area (at least 44 px): one finger on a handle drags it, one finger vertically elsewhere scrolls the
page, two fingers pinch-zoom and pan the chart, one finger sideways or a tap goes to the chart (readout, selection).
To be confirmed on the owner's phone in M2.2.
