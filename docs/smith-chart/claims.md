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
the engine's. `ui-why.mjs`: all short lines with their text (39 in M3.5, 44 after M4.3a, 53 after M4.3c, 54 after M4.4b, 56 after M5.2, 57 after M5.3), and every one's link opens a topic that exists.

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

**Changed in M4.3c:** 14 now adds "it follows the goal when you choose another in the Solve panel": T (solveLayer.ts
ring from `askOf(c).goal`, ui-solve-chart); the default part stays T (`GOAL_VSWR`).

## The solver's topics (theory-solver.md §9–11, M4.3c)

Start-circuit numbers were worked by hand and checked against `solve` and `standardVariants` on `defaultCircuit()`
(the example's marks and goal as theory.md says) with `npx tsx` in M4.3c; the page's harness checks them again.

**9 Two, one or none.** 130 D `circle-r`, `circle-g`, 47, 52, 87 · 131 S M "Elementary properties"; D 69 (`mobius`) ·
132 T (solve.ts, solver.md "Method"; ui-solve-chart) · 133 D 132; the construction S S3 §6.7 (as 115) · 134 D plane
geometry (subtracting the circles' equations gives their radical line, which meets a circle 0, 1 or 2 times) · 135 D
134 · 136 T (SolvePanel's result heads; ui-solve) · 137 S S3 §6.4 Example 6.4.2 (facts-cases C24) · 138 D
`series-adds-z`, 47 · 139 T (solve.ts `sameJob`, notes-M4.1a); D 138 · 140 D `circle-r` (centre r/(r+1), radius
1/(r+1)) · 141 D `circle-g` (centre −g/(g+1), radius 1/(g+1)), 52 · 142 D 134, `gamma-z`; engine: `circles` at node 1
= (1/3, 2/3) and (−1/2, 1/2) · 143 D 116–119 · 144 D 123, `shunt-adds-y`, `b-shunt-c` · 145 D (engine residuals
≤ 2e-16) · 146 D `circle-r`, `circle-g` (r = 1 and g = 1 touch at Γ = 0), `x-series-c` (X = −25 Ω); engine: one
solution, L = ∞ · 147 D `circle-r`, 134, 121 · 148 S E §3.15 (84); T (solver.md "Counting") · 149 Def (a circle is
one condition); D 134 · 150 D 149; T (`family`, notes-M4.1b) · 151 D `shunt-adds-y`, `gamma-y`, `vswr` (y = 1 + jB
gives |Γ| = |B|/√(4 + B²), so |Γ| = 0.2 at B = ±1/√6, b = −1 ± 0.408), `b-shunt-l`; engine `family.at` · 152 T
(slider, ui-solve-chart); the range from the engine (`ranges[0]`).

**10 One value and a point.** 153 Def (16, 24) · 154 D 130 · 155 T (SolvePanel texts; ui-solve) · 156 Def; D
`mismatch-to-target` (to add) · 157 D `mismatch-to-target` at Γt = 0 · 158 D 131 (Γ → (Γ − Γt)/(1 − Γt*Γ) is a
Möbius map), plane geometry (a circle's point nearest a point lies on the line through its centre); T (solveLayer.ts
draws `circles[4]`) · 159 D `circle-r`, 113 · 160 D `gamma-z` (the derivative in x² has the sign of 4r > 0) · 161 D
160, `x-series-c`, `vswr`; engine (`best`: 63.66 pF, mismatch 1/3) · 162 T (`suggestSecond`) · 163 Def; D 134 · 164 D
`x-series-c`, `vswr`; engine (`range` 26.43–39.99 pF; the closed form agrees to 1e-16) · 165 D 142; engine.

**11 Realisable and standard values.** 166 Def (registry assumption: ideal parts) · 167 D `x-series-c`,
`x-series-l`, `b-shunt-c`, `b-shunt-l` · 168 D 167, `omega`; T (the flag, `swapped`) · 169 T (`Unknown.free`,
notes-M4.1a) · 170 D 144, `b-shunt-c`; engine (`swapped`) · 171 D 167 at x → 0 or b → 0 with `series-adds-z`,
`shunt-adds-y` · 172 Def (a negative R gives |Γ| > 1: 1 − |Γ|² < 0 in `power-delivered`); T (solve.ts reason) · 173 D
`quarter-wave`; T (notes-M4.1b "λ/4 limits") · 174 S E §3.15 (84); D `line-rotation`; T (`period`) · 175 D
`line-rotation`, `line-theta`, `beta` (θ ∝ f at a fixed length); T (the note's text) · 176 S WikiE (via
docs/resistor/facts.md; IEC 60063 as WikiE names it, its text not read) · 177 S WikiE (values near round(10^(n/24)));
D 10^(1/24) = 1.101 · 178 S JohansonHighQ · 179 S WurthWEKI; "no E series has 1.9" D from WikiE's tables (E192 has
1.89 and 1.91) · 180 T (values.ts `defaultChoice`, M4.3b) · 181 T (ui-drag) · 182 T (`standardVariants`,
ui-solve-chart) · 183 D facts.md §4 E24 table · 184 D `vswr`, `return-loss`; engine `standardVariants` (33 pF + 82 nH
worked by hand to 0.0377) · 185 D 184, 110 · 186 T; Def (registry assumptions) · 187 S WurthWEKI.

**Count:** 58 claims (130–187): 10 sourced (some with a derived part), 31 derived, 6 definitions, 11 describing the
tool. All: 187 claims.

**Added in M5.2 (topic 1, "Read").** 188 T: the = beside a number shows its equation with your values; pointing at or
tapping a variable lights its part, node or readout row, and pointing at an arc or a node of the chart lights its
variables (components/Smith/mathLink.ts, ShowEq.tsx, MathPanel.tsx; ui-math-link.mjs). All: 188 claims.

**Added in M5.3 (topic 1, "Read"; topics 3 and 7).** 189 T: Derive beside an equation, in the Equations panel or
the theory, shows how it follows one step at a time with each step's reason and, where every quantity has a value,
your numbers (components/Smith/Derivation.tsx, derive.ts; ui-derive.mjs). Claim 37 now ends "“derive” beside each
shows every step". The derivations' mathematical claims are their registry steps, each an equality that
check-equations.mjs evaluates at 200 random points against the engine (and that the last step ends in the equation):
`z-gamma` (4), `gamma-y` (2), `y-gamma` (2), `gamma-parts-z` (4), `gamma-parts-y` (4), `z-parts` (4), `y-parts` (4),
`circle-r` (9), `circle-x` (5), `circle-g` (9), `circle-b` (5), `vswr` (4), `gamma-vswr` (3), `mismatch-to-target`
(4), `return-loss` (2), `mismatch-loss` (2), `q-l-network` (5), `line-zin` (5), `line-rotation` (2), `quarter-wave`
(3), `quarter-wave-match` (3), `series-adds-z` (3), `shunt-adds-y` (3), `match-two-parts` (8, [S3 §6.7] for the
route; new, D on the page), `abcd-zin` (3), `mobius` (8): 26 derivations, 110 steps (after the read-through of notes-M5.3.md). The reasons are one-line
statements of the algebra the step does; the step itself is what is checked. All: 189 claims.

**Added in M5.4 ("Explain this move", the part card).** 190 T: after a drag, a typed value or a handle's key changes
a part's value, the card says what the change did (old and new value, the change in x, b, r, g or length, the node's z
and |Γ| before and after, the sense), and "Explain" shows the part's arc from no effect with its rule, circle, sense,
equations with your numbers, Derive and the theory link (components/Smith/Explain.tsx, lib/smith/explain.ts;
check-explain.mjs, ui-explain.mjs). Every other sentence of the narration is a claim of theory.md §4 in its wording,
with its sources: series adds z 46 [S3]; L and C add ±x 47, 48 [W]; series R along its x arc towards +1 49 [W]; shunt
adds y 50 [S3]; shunt C and L add ±b 51 [W], keep g 52; shunt R towards −1 53 [W]; stubs move along g circles 54, 62;
the r circle's run and the sense of series L and C 55, 56 [S3 §3.4], 58; the g circle's run and the sense of shunt C
and L 57 [S3 §6.7], 58; why a circle 63–66 [M] (series reactance) and 67–70 [M] (the others); a line clockwise 61
[S3 §3.4, §3.5], a line of another Zc off-centre 71 [S3 §3.5]; the arc starts at no effect 73, 74, its length is how
much the part does 75; "making an L or a C larger always turns its point clockwise" 77 (its converse, smaller turns
counter-clockwise, is the same rule read backwards). Two statements are derived from registry equations, D: a stub's b
grows with its length (`stub-open-b`, `stub-short-b`: tan θ and −cot θ increase with θ), so a longer stub turns
clockwise by 57; a resistor's way to its pole is counter-clockwise on an arc whose centre (`circle-x`: (1, 1/x);
`circle-b`: (−1, −1/b)) lies above the axis for a series R (below for a shunt R) and clockwise on the other side,
from 49 and 53. The numbers (centre and radius from `circle-r`…`circle-b`, `line-circle-centre`, `line-circle-radius`,
`line-rotation`) and every sense are checked against geometry.ts in check-explain.mjs. All: 190 claims.

## The worked examples, challenges and lesson links (examples.md, examples-challenges.md, M6.1)

Every number was worked by hand and reproduced by an independent formula and by the engine (`evaluateCircuit`,
`solve`, `standardVariants`) to the digits stated, with a scratch script (notes-M6.1.md "Checks"); M6.2's harness
checks them again from `lib/smith/examples.ts`. Numbers are D unless a source is named.

**Examples.** 191 S E §3.20 Example 1 (facts-cases C2: Γ = 0.2, 4 % reflected, VSWR 1.5) · 192 D `return-loss`,
`mismatch-loss` · 193 D `gamma-z` (a real z gives a real Γ, positive for z > 1), `vswr`, `return-loss` · 194 D
`gamma-z`, `vswr`, `return-loss`, `mismatch-loss`, `power-delivered` · 195 S S3 §3.4 (upper half inductive) · 196 D
`y-norm`, `gamma-y` · 197 S W "Admittance chart"; D 26 · 198 D `gamma-parts-y` (Γi has the sign of −b) · 199 D
`x-series-l`, `b-shunt-l` · 200 D `series-adds-z`, `shunt-adds-y`, 47, 52, 56, 57 · 201 D `shunt-adds-y`,
`b-shunt-c` · 202 D `y-parts` (g = r/(r² + x²)) · 203 D `x-series-l`, `x-series-c`, `b-shunt-c`, `b-shunt-l`; engine
`solve` · 204 S S3 §6.4 (Q = √(R_high/R_low − 1); two solutions, Example 6.4.2); D `q-node` · 205 D `z-parts`
(r = g/(g² + b²)), the four part ids; S S3 §6.4 (Q) · 206 T (solve.ts status `none` and its reason) · 207 D
`circle-r`, `circle-g`, 120–121 · 208 S E §3.15 (84), S3 §3.4.1 (61); D `line-rotation`, `gamma-z` · 209 D
`line-rotation` · 210 S S2 §2.3 (Z_max = Z0·VSWR); Z_min = Z0/VSWR D `gamma-z` at Γ = −|Γ| · 211 S S2 §2.4 (impedance
inverter); D `quarter-wave` · 212 S E §3.19; D `quarter-wave-match` · 213 S E §3.19 Example 2 (facts-cases C15: a line
to a real point, then λ/4); D `quarter-wave-match`, 210; engine `solve` · 214 D `shunt-adds-y`, `gamma-y` (y = 1 + jb
gives |Γ|² = b²/(4 + b²), as 151), `circle-g` · 215 S E §3.23, S2 §2.4 (single stub); D `line-rotation`,
`stub-open-b`, 97 · 216 D `gamma-z`, 214 · 217 D `line-rotation`, `stub-short-b`; S E §3.23 · 218 D
`shunt-adds-y`, `series-adds-z`, `b-shunt-c`, `x-series-l`, 202 · 219 D `q-node`; S S3 §6.4 (the L network's Q) · 220
S WikiE (E24 has 30, 33, 39, 43; via docs/resistor/facts.md, as 176) · 221 D the network by hand; engine
`standardVariants` · 222 D 221; T (`standardVariants` orders by mismatch, 182) · 223 D `gamma-z`, `vswr`,
`return-loss`, `mismatch-loss`, `y-norm`, 202, 205 · 224 D 202, `x-series-l`, `b-shunt-c`, `b-shunt-l`; engine `solve`
· 225 S WikiE (10, 11, 4.3, 4.7 in E24); D the network by hand; engine `standardVariants`.

**Challenges and lesson links.** 226 D (each kind draws \|Γ_L\| ≥ 0.3, or ≥ 0.2 for a real `qw` load, above its goal of
at most 0.2 or 0.05); T `goalHolds` · 227 D 202, 205 (r ≤ 1: series to g = 1; r ≥ 1 gives g = r/(r² + x²) ≤ 1: shunt
to r = 1), 214 (every \|Γ\| circle with 0 < \|Γ\| < 1 meets g = 1 at Γr = −\|Γ\|², twice); the sample T (notes-M6.1.md) ·
228 T (challenge.ts hints from `solve`'s circles and solutions, M6.2; solveLayer.ts draws them); "Zt between Z0 and R"
D `quarter-wave-match` (a geometric mean) · 229 T (lesson.ts, the page's `commit`; M6.3b).

**Short lines** (examples-challenges.md §3; added to the table below when M6.3 puts them in `whys.ts`): `learn`,
`learn-example`, `guide`, `guide-answer`, `guide-hint`, `challenge`, `challenge-reveal`, `challenge-progress`,
`lesson`, `lesson-lock`, `lesson-hide`, `lesson-text`, `lesson-box` T; `challenge-check` D 226, T; `challenge-hint`
T 228.

**Count:** 39 claims (191–229): 15 with a source (some with a derived part), 21 derived, 3 describing the tool. All:
229 claims.

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
| snap | Drags settle on grid circles and each kind’s Standard values list; Alt drags free. | T (ui-drag; 181) |
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
| goal | The solver’s goal; by default the centre, within \|Γ\| 0.2 (VSWR 1.5). | D 110; T 14, 111 |
| solve-mark | Leave this value to the solver: it finds what meets the goal. | T (132) |
| solve-free | An L adds +jx, a C −jx: the answer’s sign picks the kind. | D 167; T 169 |
| solve-goal | Where it must hold, and a point or a circle to reach there. | T (goal node and kind) |
| solve-count | A point needs two free values; a circle needs one. | D 153, 149 |
| solve-solution | Values that meet the goal, and the \|Γ\| they give at its node. | T (SolvePanel; 136) |
| solve-apply | Puts these values in the circuit as one step; Undo takes it back. | T (ui-solve) |
| solve-circles | Each unknown moves a node on a circle; answers are where they cross. | D 130, 133 |
| solve-family | Slide the first value; the second follows to keep the goal. | T 152; D 150 |
| solve-variant | The nearest standard values, and how far they move the input. | T 182 |
| solve-lists | The values parts come in, per kind; drags and variants use them. | T 180–182 |
| solve-suggest | One changed value reaches a point only by chance; two reach it exactly. | D 153, 154; T (suggest.ts: singles give the nearest value, pairs the exact ones; SolvePanel, ui-solve-suggest) |
| list-R | E series of IEC 60063; E24 parts usually 5 %, E96 1 %. | S 176 |
| list-L | Chip inductors come in makers’ own lists (1.9 nH): paste yours. | S 179 |
| list-C | E series; RF chip capacitors below 10 pF have tolerances in pF. | S 176, 178 |
| list-Z | Any value by default; a list if your lines come in set impedances. | T 180 |
| show-eq | The = beside a number shows its equation, with your values put in. | T 188 (ShowEq.tsx; ui-math-link: every readout row, the input, node rows, the part card) |
| math | Point at or tap a variable: its part, node or readout row lights up. | T 188 (mathLink.ts; ui-math-link: hover, focus, tap) |
| derive | Derive shows how an equation follows, one reasoned step at a time. | T 189 (Derivation.tsx; ui-derive: panel, theory, keys, taps) |
| explain | Says which equation moved the point, along which circle and which way. | T 190 (Explain.tsx; ui-explain: drag, typing, keys, taps, reduced motion) |

## Deliberately left out (not sourced)

- Bandwidth and what Q means for it (sources.md: not yet sourced; M7). The λ/2 note (175) says only that the extra
  turning grows with Δf, which is derived; how wide a band is stays for M7.
- What tolerance does to a match, and lossy parts (186 says the tool computes neither).
- That VSWR 1.5 is a usual "good enough": the page calls it the tool's default only (claim 111).
- Physical line length with εeff and c: the page speaks of wavelengths and degrees only.
- Lossy parts and why they leave the circles (BL42; not read in any source).
- The 1939 and 1944 papers of P. H. Smith (not opened; sources.md).
