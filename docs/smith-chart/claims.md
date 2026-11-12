# Smith chart – claims checklist (theory and short lines)

Every factual sentence the page states, with where it comes from. Started in M3.5a (theory.md's `⟨n⟩` markers, which
the page leaves out), finished in M3.5c with the sentences the page added and the short lines beside the tool.
Moved here from notes-M3.5.md.

**Kinds.** **S** source (key and section, as [sources.md](sources.md) allows; E = Ellingson2018, S2 = SteerVol2,
S3 = SteerVol3, W = WikiSmith, M = WikiMobius), **D** derived (registry ids of `lib/smith/equations.ts` or claims it
follows from; live numbers are checked against the engine by `ui-theory.mjs`), **Def** definition or wording,
**T** describes the tool (checked by the code it names or the ui harness). Nothing is left unsourced: a claim
without a source says "derived" on the page through its equation, or describes the tool.

**Checks.** `ui-theory.mjs`: every citation on the page resolves to an entry of the reference list, numbered by first
citation; every #link of the page (contents, citations, nav, short lines) has its target; every live number equals
the engine's. `ui-why.mjs`: all 39 short lines with their text, and every one's link opens a topic that exists.

## The theory, by topic (theory.md §1–7)

**1 How to use.** 1–12 T (state.ts D16, Strip, Chart, Nodes, history; 7 also engine.md §2) · 13 S E §3.20
(`power-delivered`) · 14 T (`GOAL_VSWR`).

**2 Γ, z, y.** 15 Def · 16 S W "Normalization" · 17 D `z-norm` · 18 S E §3.12 · 19 S E §3.12, S2 §2.3 eq:9 ·
20–22 S E §3.12 · 23 S S3 §3.4 · 24 Def · 25 S W "Admittance chart" · 26 D `gamma-y`, `z-gamma` · 27 S S3 §3.4.2.

**3 Reading.** 28 Def · 29–30 D `circle-r` · 31–32 D `circle-x` · 33 D `x-gamma` at Γi = 0 · 34 S S3 §3.4.3 ·
35 D `circle-g`, `circle-b` · 36 S S3 §3.4.3 · 37 D steps of `r-gamma`…`circle-b` · 38 T · 39 S S3 §3.4.2 · 40 D 47,
52 · 41 S S3 §3.4.5 · 42 T (grid.ts) · 43 S S3 §3.4 Ex. 3.4.2; "0 at the short" T (grid.ts) · 44 S S3 §3.4
Fig. 3.4.6 · 45 T.

**4 Moving.** 46 S S3 §2.2.6 (`series-adds-z`) · 47 D `series-adds-z`, `circle-r` · 48 S W "Circuit elements and
topology" · 49 D `circle-x`, `gamma-parts-z` (r → ∞) · 50 S S3 §2.2.6 · 51 S W "Circuit elements and topology" ·
52 D `shunt-adds-y`, `circle-g` · 53 D `circle-b`, `gamma-parts-y` (g → ∞) · 54 D `stub-open-b`, `stub-short-b`,
`shunt-adds-y` · 55 D `circle-r` · 56 D facts.md §1 (dΓi/dx = 2/(r+1)² > 0 at x = 0) · 57 D facts.md §1
(dΓi/db = −2/(1+g)²) · 58 S S3 §3.4 Step 2, §6.7 · 59 D 56, 57, 34, 36 · 60 S S3 §3.4.3 · 61 S S3 §3.4.1, §3.5.2 ·
62 D `stub-open-b`, `stub-short-b` · 63 D `series-adds-z` · 64 D `gamma-z` · 65 S M lead, "Elementary properties" ·
66 D `circle-r` · 67 D `abcd-zin` (facts.md eq. 27) · 68 S M "Definition" · 69 D `mobius` from 64, 67, 68 · 70 D 47,
52, `line-rotation` · 71 S S3 §3.5 · 72 T (geometry.ts, engine.md §3) · 73 Def (D3) · 74 D `x-series-l`,
`x-series-c`, `b-shunt-c`, `b-shunt-l`, `r-series`, `g-shunt`, `stub-open-b`, `stub-short-b` (engine.md §2 "no
effect") · 75 Def · 76 D `x-series-c` · 77 D the four part ids, 56, 57.

**5 Lines.** 78 Def · 79 S E §3.15 · 80 T · 81 S S2 §2.3 eq:16 · 82 S S3 §3.4.1, §3.5.2 · 83 S E §3.15 · 84 S E §3.15
· 85 D `line-rotation`, 43 · 86 D `line-rotation`, `z-gamma` (also `line-zin`) · 87 S S3 §3.5; "round Zc's point" D
(the map of 69 takes the disc about Γ_Zc = 0 to the inside of the circle) · 88 S S3 §3.5 · 89 S E §3.19 · 90 S E
§3.19; the Zt number D `quarter-wave-match` · 91 S E §3.19, S2 §2.4 · 92 D `quarter-wave` (Z_in = Z0 needs
Z_L = Zt²/Z0, real) · 93 Def · 94 S E §3.16 · 95 S E §3.23 · 96 D 54 · 97 S S2 §2.4, E §3.17 · 98 D `stub-short-b`,
`stub-open-b` at βℓ = π/2.

**6 Match.** 99 D `vswr`, `return-loss`, `mismatch-loss` · 100 S E §3.20 · 101 S E §3.14 · 102 D `vswr` · 103 S S2
§2.3 (`z-max`); r = VSWR D `z-gamma` at Γ = |Γ| · 104 S S3 §2.8 · 105 S S3 §2.8 (positive); "larger is better" D ·
106 D `return-loss` · 107 D `power-delivered` (facts.md eq. 16) · 108 S S3 §2.8 · 109–110 D (numbers; 110's VSWR 1.5
T) · 111 T.

**7 Two parts.** 112 Def · 113 D `circle-r`, `circle-g` (r = 1, g = 1 through 0) · 114 D 47, 52 · 115 S S3 §6.7 ·
116 D `z-norm` · 117 D `x-series-c`, `y-norm` · 118 D `shunt-adds-y` · 119 D `x-series-c`, `b-shunt-l` · 120–121 D
`circle-r`, `circle-g` (leftmost point (r−1)/(r+1) ≤ 0) · 122 D (two circles meet at most twice) · 123 D
`shunt-adds-y`, `b-shunt-c` · 124 S E §3.22 · 125 S E §3.23 · 126 S S3 §6.4 · 127 S S3 §6.4; the |b|/g form D
`q-node` · 128 D `q-node` · 129 T (M7).

**Count:** 129 claims: 50 sourced (S, some with a derived part), 51 derived, 8 definitions, 20 describing the tool.

## Sentences the page added (M3.5b, M3.5c)

| Where | Sentence | Kind |
|---|---|---|
| Theory lead | What the chart shows and why the parts move the point; the boxes marked *Your circuit* follow the circuit. | T |
| Theory lead | Everything assumes ideal parts, lossless lines, a real Z0, one frequency f0. | Def (registry assumptions `EJWT`, `REAL_Z0`, `LOSSLESS`) |
| Theory lead | Numbers in brackets lead to the sources. | T |
| Live boxes (every topic) | "Start circuit" / "Your circuit" headings and their lines (\|Γ\| of the input, what each part keeps and changes, λ/8 on the load, the metrics table, the node table, the routes) | D: engine (`network.evaluateCircuit`, `nodeMetrics`, `parts.added`, `convert`), checked number by number in ui-theory |
| Equation lines | The substitution lines under an equation (aligned on "=", ω written 2π·f0) | D: the equation's registry id with the engine's values |
| Equation titles | "below: part n", "below: your load", "below: the start circuit" | T |
| Topic 2 figure | The match at the centre, the open at +1, the short at −1, the load and −Γ (whose z is the load's y). | D `gamma-z`, 26 |
| Topic 3 figure | The r, x, g, b circles through the load; each z circle touches +1, each y circle −1. | D `circle-r`…`circle-b`, 35 |
| Topic 4 figure (plane) | A series reactance moves z = 0.5 + j0.5 along the line r = 0.5; on the chart that is the r = 0.5 circle with x = −1, 0, 1 at the marked points; both ends (x → ±∞) meet at the open; growing x turns clockwise. | D `gamma-z` (Γ = (x² − 0.75 + 2jx)/(2.25 + x²)), `circle-r`, 56 |
| Topic 4 figure (walks) | From the start load: series L, C along its r circle, shunt C, L along its g circle, a line round the centre. | D 47, 52, 56, 57, 61 |
| Topic 4 table | Each part: what it keeps, what it moves along, the arc's direction from "no effect". | D 47, 49, 52, 53, 56, 57, 61, 62 |
| Topic 5 figure | λ/8 of Z0 on the load turns Γ a quarter turn clockwise; the rim scale towards the generator. | D `line-rotation`, 43 |
| Topic 6 figure | Circles of VSWR 1.5, 2 and 3 about the centre. | D `gamma-vswr` |
| Topic 7 figure | The start circuit's path: series C along r = 0.5 onto g = 1, shunt L along g = 1 into the centre. | D 116–119 |
| Back button | "Back to the tool" returns to where a "→ theory" link was followed. | T (ui-why) |

## The short lines (theory.md §8, `components/Smith/whys.ts`)

Each repeats claims of the topic it links to; the tool's own behaviour is T. Keys are those of `whys.ts`.

| Key | Short line | Kind |
|---|---|---|
| z0 | The reference: every z on the chart is Z divided by Z0. | S 16 (W "Normalization") |
| f0 | The frequency the parts' reactances and line lengths are worked out at. | Def (73, 78) |
| load | The load Z = R + jX; the path starts at its point, L. | Def; T (path starts at L: ui-path) |
| strip | Source left, load right; the chart's path runs from the load. | T (claim 5–6) |
| add | Adds the chosen kind at that place; its arc appears on the chart. | T (ui-strip, ui-path) |
| draw | Drag out of In to add this kind at the source end. | T (ui-edit) |
| card | Order matters: each part acts on what lies on its load side. | D 46, 50 (`series-adds-z`, `shunt-adds-y` act on z_L, y_L) |
| kind-ls | Adds +jx: clockwise along its r circle, upwards. | S 48; D 56 |
| kind-cs | Adds −jx: counter-clockwise along its r circle, downwards. | S 48; D 56 |
| kind-rs | Adds r: along its x arc, towards the open at Γ = +1. | D 49 |
| kind-lp | Adds −jb: counter-clockwise along its g circle, upwards. | S 51; D 57 |
| kind-cp | Adds +jb: clockwise along its g circle, downwards. | S 51; D 57 |
| kind-rp | Adds g: along its b arc, towards the short at Γ = −1. | D 53 |
| kind-tl | Turns the point clockwise on a circle round Zc; λ/2 is a full turn. | S 61, 84, 87 |
| kind-so | Shunt b = (Z0/Zc)·tan θ; shorter than λ/4 it acts as a C. | S 95, 97 |
| kind-ss | Shunt b = −(Z0/Zc)·cot θ; shorter than λ/4 it acts as an L. | S 95, 97 |
| kind-qw | A λ/4 line of Zt: Z_in = Zt²/Z_L, exact at f0. | S 89, 91 |
| field-value | The part's value; the other fields follow. | T (state.ts `withForm`) |
| field-at-f0 | Its reactance or susceptance at f0, in ohms or siemens. | Def; D `x-series-l`…`b-shunt-l` |
| field-normalised | The same divided by Z0 (or times Z0): what the chart adds. | D `z-norm`, `y-norm`, 47, 52 |
| field-length | Length in wavelengths, or electrical length in degrees, at f0. | Def 78; T (80) |
| field-zc | The line's own impedance; not Z0 means a circle off-centre. | S 87, 88 (S3 §3.5) |
| ring | Drag to change this part's value along its circle. | T (claim 8; ui-drag) |
| grid | Which grid to read: r and x, g and b, or both. | T 38 |
| snap | Drags settle on drawn grid circles and E24 values; Alt drags free. | T (ui-drag) |
| history | Step through changes; Start over brings back the worked example. | T (claims 2, 10; ui-edit) |
| zoom | Zoom in near the centre; the grid fills in finer circles. | T 45 (grid.ts) |
| rim | Angle of Γ, and wavelengths towards the generator or the load. | T 42; S 43 |
| read-z | Z/Z0 = r + jx at the point. | S 16 |
| read-Z | The same in ohms: z times Z0. | D `z-norm` |
| read-y | 1/z = g + jb at the point. | S 16 |
| read-Y | The admittance in siemens: y divided by Z0. | D `y-norm` |
| read-gamma | Reflection coefficient: distance from the centre and angle. | Def 24; S 18 |
| read-gammaRect | The same Γ as Γr + jΓi: the point's coordinates. | Def 24 |
| read-vswr | Largest over smallest voltage on the line; 1 is a match. | S 101; D 102 |
| read-rl | Reflected power below incident, in dB; larger is better. | S 104, 105 |
| nodes | Each node from the load to the input: z, Γ, VSWR, return loss. | T (claim 12; ui-path) |
| input | What the source sees: the end of the path, In. | T; D 46, 50 |
| goal | The centre is the match; dashed circle: VSWR 1.5, \|Γ\| ≤ 0.2. | S 13 (E §3.20); D 110; T 111 |

## Deliberately left out (not sourced)

- Bandwidth and what Q means for it (sources.md: not yet sourced; M7).
- That VSWR 1.5 is a usual "good enough": the page calls it the tool's default only (claim 111).
- Physical line length with εeff and c: the page speaks of wavelengths and degrees only.
- Lossy parts and why they leave the circles (BL42; not read in any source).
- The 1939 and 1944 papers of P. H. Smith (not opened; sources.md).
