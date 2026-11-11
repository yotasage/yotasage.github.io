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
  M0.2; the snapping offers what M0.2 finds.

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
- **Budgets (targets, confirmed or revised by the M0.3 spike, then measured by `timing.mjs` and recorded in the
  notes):** dragging with 10 parts and a 2,000-point sweep trace: at most 4 ms of script per frame on the owner's
  laptop and a frame within 16 ms with the CPU throttled 4× (the stand-in for a phone). The equation panel may update
  at a lower rate than the chart. The solver: under 1 ms for the closed forms; the fallback search under 50 ms, else a
  worker (pattern: `lib/resistor/combine.worker.ts`). The page's script size is compared with the resistor page's and
  not exceeded without a reason noted.
