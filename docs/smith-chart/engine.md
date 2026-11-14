# Smith chart – engine

The model of the tool (built in M1, used by every later step). Part of [plan.md](plan.md); decisions D2–D5, D8, D10,
D11, D13 there.

## 1. Conventions

Fixed here and in `facts.md` (M0.2), never mixed afterwards:

- Time convention e^{jωt}. Z = R + jX, Y = G + jB. X_L = ωL > 0 (inductive), X_C = −1/(ωC) < 0; B_C = ωC > 0
  (capacitive), B_L = −1/(ωL) < 0.
- z = Z/Z0, y = Y·Z0 = 1/z. Γ = (z − 1)/(z + 1) = (1 − y)/(1 + y). Γ = Γr + jΓi with Γi pointing **up** in the model.
  The flip to SVG's downward y happens in exactly one function at the drawing boundary.
- Z0 is real (D12). A line or stub has its own real characteristic impedance Zc.
- Angles in degrees on screen, radians inside. Lengths in wavelengths at f0 (electrical) or in metres with εeff.
- Direction of travel, the facts the harness checks: series L moves clockwise along a constant-r circle, series C
  counter-clockwise; shunt C clockwise along a constant-g circle, shunt L counter-clockwise; a line clockwise (towards
  the generator) around the centre of its own chart.
- Circles (centre, radius) in the Γ plane: r: (r/(1+r), 0), 1/(1+r); x: (1, 1/x), 1/|x|; g: (−g/(1+g), 0), 1/(1+g);
  b: (−1, −1/b), 1/|b|. b = −2Γi/((Γr+1)² + Γi²).

## 2. State

`Circuit` = Z0, f0, the load, and an ordered list of parts counted **from the load towards the source** (the direction
the chart path travels). The schematic strip draws it the textbook way round (source left, load right) with an arrow
saying which way the path runs. A goal is kept next to the circuit (§8).

| Part | Parameters | Adds | "No effect" | Locus as the value changes |
|---|---|---|---|---|
| Series R | R ≥ 0 | r to z | R = 0 | constant-x circle (a ray along the real axis when x = 0) |
| Series L, C | L or C > 0 | jx to z | x = 0 (L = 0, C = ∞) | constant-r circle |
| Shunt R | R > 0 | g = Z0/R to y | R = ∞ | constant-b circle |
| Shunt L, C | L or C > 0 | jb to y | b = 0 (L = ∞, C = 0) | constant-g circle |
| Line | Zc, length (electrical, or physical with εeff) | rotation by 2βℓ in its own chart | ℓ = 0 | circle of constant \|Γ\| about Zc (centred on the real axis of the reference chart) |
| Shunt stub, open or short | Zc, length | jb to y: open b = (Z0/Zc)·tan βℓ, short b = −(Z0/Zc)·cot βℓ | b = 0 | constant-g circle (drawn as its susceptance, see §5) |
| λ/4 transformer | Zt | the line of Zt at 90° at f0: Zin = Zt²/ZL | length 0 | as a line |

Values are entered and shown in three equivalent forms: the component (nH, pF, Ω), the impedance or admittance at f0
in ohms or siemens, and the normalised reactance or susceptance. Editing any one updates the others. Every part is a
function of frequency (electrical length scales with f/f0), so the sweep (M7) needs no new part code.

## 3. The geometry: every v1 locus is a circle

Every ideal part with a fixed value maps a node's Γ by a Möbius transformation Γ′ = (aΓ + b)/(cΓ + d) (its ABCD
matrix acts bilinearly on Z, and Γ is bilinear in Z). As its value changes, a part moves the node along a circle (or an
arc of one, or a straight line as a circle of infinite radius): the table above. A Möbius map takes circles to
circles. Consequences used throughout:

- **Drawing:** each part's arc is an exact circle arc (§5).
- **Dragging:** projecting the cursor onto a part's path is closed form for every part (§6).
- **Solving:** two unknowns with a point target are the intersection of two circles ([solver.md](solver.md)).
- `geometry.ts` holds one representation of a Möbius map (a 2×2 complex matrix, composed by multiplication, inverted
  by the adjugate) and of a generalised circle (centre and radius, or a line), with the image of a circle under a map.
  A generic way to get a locus circle: the circle through three points of it.

Not circles: a line's own Zc as the unknown at a general length, f0 as the unknown, lossy parts (BL42). These use the
fallback numerical search and polylines.

## 4. Evaluation

Each part gives an ABCD matrix at the frequency. The node state is a normalised (V, I·Z0) pair, started at the load
(open: (1, 0); short: (0, 1)) and multiplied through the parts. Γ = (V − Z0·I)/(V + Z0·I).

- A part of value 0 or ∞ that is an open in series or a short in shunt uses its scaled matrix (series open
  [[0, 1], [0, 0]], shunt short [[0, 0], [1, 0]]), which has rank 1. If the product is (0, 0) (an open followed by a
  series open, a short followed by a shunt short), the node is the part's image point: open (1, 0) or short (0, 1).
  This rule is in the fuzz test.
- V + Z0·I = 0 (z = −1) needs a negative resistance: reported as "not passive", never NaN.
- **A second, independent computation** in the harness: plain impedance arithmetic (series adds z, shunt adds y, a
  line by Zin = Zc(ZL + jZc tan βℓ)/(Zc + jZL tan βℓ)), compared with the ABCD engine on every test circuit.

## 5. Drawing a path

- A part's arc runs from the node before it ("no effect") to the node after it, along its locus circle, in its
  direction of travel. Computed in the model, converted to an SVG arc (`A` command) at the one drawing boundary. Arcs
  of very large radius are drawn as straight segments.
- **Never sweep the component value from 0:** a series C of 0 F is an open, a shunt L or R of 0 is a short, a short
  stub of length 0 is a short, a λ/4 transformer swept in Zt from 0 is a short; those arcs would start at Γ = ±1.
- A stub is drawn as the susceptance it adds (along the constant-g circle from the node), not as its length swept from
  0 (which for a stub longer than λ/4 would run through the short point).
- A line longer than λ/2 goes round more than once: full circles plus the remaining arc, so the length stays visible.
- Sweep traces (M7) and non-circular loci are polylines: the curve is subdivided until within a quarter of a pixel at
  the zoom it is drawn for, with a cap on points.

## 6. Dragging

Given the cursor and the active part: the closest point of the part's locus circle to the cursor, then the value read
from that point (series: the change of Im z; shunt: of Im y; a line: the angle in its own chart; a stub: its
susceptance converted to a length). Closed form for every v1 part.

- The value is limited to what the part can be: L, C and R never negative, so a drag moves along the reachable arc
  only (a series C from the node towards the open point, never past it). The cursor is projected onto what is
  reachable; a drag never produces an impossible circuit.
- **Lengths are tracked continuously**: the angle change between pointer events is accumulated, so dragging a line
  twice round gives 0.5λ + the rest, not a jump back to 0. At f0, ℓ and ℓ + λ/2 give the same point, but over a band
  (M7) the longer line gives a narrower match.
- Snapping (M3.3): to grid circles and to standard values (§7).

## 7. Numbers

- **One shared module** (`lib/quantity.ts`, M1.1): `readAmount` and `formatAmount` of `lib/resistor/lists.ts` move
  there (the resistor tool re-exports them and its harness proves no change) and are extended: units Ω, S, H, F, Hz,
  m, W, dB; prefixes f to T (case matters: m milli, M mega; `meg` accepted as mega); `3e-9`; `4n7`-style letter
  decimals; the decimal comma; the real minus sign.
- Never truncated: rounded with carry (999.96 becomes 1.000 k), engineering notation, a user-set number of digits.
  Open and short are shown as "∞ Ω" and "0 Ω", not as errors. Everything shown in ohms is in ohms; normalised values
  are labelled as normalised.
- **Standard values:** `lib/resistor/eseries.ts` takes plain numbers, so it snaps nH and pF as it is. Which series or
  steps real inductors and capacitors come in (small RF inductors often in 0.1 nH steps, not E-series) is a fact for
  M0.2; the snapping offers what M0.2 finds. The owner's choice (D17): a list per part kind (E6–E96, own list, any
  value), E24 by default for R, L and C.

## 8. Goal

What the circuit should achieve, shown on the chart: the centre (Γ = 0, the default) or a chosen target z, plus one
adjustable circle (|Γ| or VSWR) that says "close enough". A conjugate-matched source impedance can be the target
without changing the chart's real reference (D12). The goal can also be a circle (a VSWR or return loss, zero
reactance, landing on g = 1 as an intermediate step); see [solver.md](solver.md).

## 9. Performance architecture and budgets

The owner does not read code; performance is never traded for readability.

- **Engine:** plain numbers and typed arrays in hot loops, no objects created per point or per frame, matrices
  composed in place. Equation trees (D5) are never evaluated in a hot loop.
- **Chart:** pointer events are coalesced to one update per animation frame (`requestAnimationFrame`); the moving
  layer (arcs, handles, trace, readout) is written directly to the SVG (`setAttribute`) from refs; React re-renders
  panels only. Zoom and pan change one transform; strokes use `vector-effect: non-scaling-stroke`; labels are laid out
  again only when the zoom level changes the grid density.
- **Two SVG layers (M0.3 b):** the grid (circles, labels) in its own `<svg>` with `will-change: transform`, the moving
  layer in a second `<svg>` stacked on it; a zoom sets the same transform on both. In one `<svg>`, every drag frame
  re-rasters the grid and 8.7 % of frames dropped at 4× (0 with two layers). Arcs are `A` commands, the trace one `d`.
- **Equation panel in a time slice (M0.3 a):** after the chart's update in the same frame, the visible equations are
  re-rendered round-robin until 3 ms of work are spent, the rest in the next frames; on pointer up all get their final
  values. Ten MathML equations cost 2.3 ms at 1× but 14 ms of work (21 ms main thread) at 4×.
- **Touch (M0.3 d, D14):** the chart's `<svg>` has `touch-action: pan-y` and a non-passive `touchstart` listener that
  calls `preventDefault()` only when the touch starts on a handle's hit area (at least 44 px; `touch-action` on SVG
  children is ignored). One finger on a handle drags it, one finger vertically elsewhere scrolls the page, two fingers
  pinch-zoom and pan the chart, a tap or a sideways drag goes to the chart.
- **Budgets (confirmed by M0.3 in Edge 157, measured again by `timing.mjs` and recorded in the notes):** dragging with
  10 parts and a 2,000-point sweep trace: at most 4 ms of script per frame on the owner's laptop and a frame within
  16 ms with the CPU throttled 4× (the stand-in for a phone), with no dropped frames (rAF interval p95 ≤ 17 ms, headed
  Edge). Split of the 4× frame: chart ≤ 6 ms main thread (spike: 3.7 ms), equation slice 3 ms of work (≈ 6 ms main
  thread), the rest for React and the browser. At 1× the spike's chart frame was 0.8 ms and all ten equations 3.6 ms
  main thread. The solver: under 1 ms for the closed forms; the fallback search under 50 ms, else a
  worker (pattern: `lib/resistor/combine.worker.ts`). The page's script size is compared with the resistor page's and
  not exceeded without a reason noted.
- **How the budgets are measured (M9.3, notes-M9.3.md):** on a **production build** (`npm run ui` in
  `scripts/harness/smith`: `next build`, then `next start` on port 3021), what visitors run; on a dev server the
  main-thread guards are × 1.1 (dev/production 1.07–1.08 for a drag, ~1.0 for a zoom). The guards below the 16 ms frame
  (`timing.mjs` `BUDGET`): a 4× drag of the 10-part circuit ≤ 12 ms of main thread per frame (M9.3: 9.9–11.5 ms; 8.0–8.9
  for the M3.5 page today: the page's growth since, ~2 ms, is M5's panels and M7.3–M8's report and export, each step
  within its 0.5 ms A/B), a 4× zoom ≤ 7 ms (5.2–6.6 ms), at 1× no frame lost, at 4× at most one more than grid
  rebuilds; the drag layer's script p95 ≤ 1 ms at 1× and ≤ 4 ms at 4×, the chart's script p50 ≤ 0.5 ms in a zoom. This
  machine varies by ±1–1.5 ms per 4× frame between minutes (CPU load 4–12 % before each run), so a step is judged by
  an interleaved A/B with `ui-perf.mjs` against the previous build, the absolute guards only catch drift.
- **Script size (M9.3, `size.mjs`):** first load of /smith-chart/main ≤ 430 kB gzip (M9.3: 423.1 kB, 1,318 kB raw;
  the resistor page 278.6 kB with the same KaTeX and app chunks), chunks loaded later (the workers) ≤ 45 kB gzip
  (36.3 kB).
- **Memory (M9.3, `ui-memory.mjs`):** a 10-minute session of drags, zooms and undos must not grow the heap after GC
  beyond max(2 MB, 10 %), nor the DOM nodes, listeners or detached DOM nodes beyond a few.
- **Zooming at 4× (BL51, after M3.2):** script is < 0.5 ms a frame; the cost is Chromium's Layerize, run on every
  frame of the grid's stretch and ~8 µs per hinted turned label, so turned labels use `geometricPrecision` (3.7–4.3 ms
  a frame, was 5.3–6.3). Grid rebuilds (~32 ms at 4×, 5 per 2 s zoom) each drop a frame; a hidden page
  written in steps cost more than it saved (notes-M3.2.md).
- **Below the tool (fix after M3.5b):** the theory (3,600 nodes) renders from `useDeferredValue(circuit)` and the
  sections are one memoised element, so a drag's commit renders the tool only (a sync render of both: 230 ms at 4× in
  dev); a drag's pick selects in `startTransition`. Off-screen DOM itself cost a drag frame nothing (notes-M3.5-fix.md).
