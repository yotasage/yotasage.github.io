# Smith chart – theory content, the solver's topics (step M4.3c)

Second part of [theory.md](theory.md), split off to keep each file under 40 kB; the head of theory.md ("How to read
this file") holds for this part too. Topics §9–§11 (page topics 8–10, after "Matching with two parts"); claims
130–187 in [claims.md](claims.md); what the page builds in [notes-M4.3c.md](notes-M4.3c.md).

---

## 9. Two solutions, one or none

**Id:** `two-one-or-none` (page topic 8, after "Matching with two parts")

**Text.**

Every value the solver is asked for moves a node on a circle: a series reactance along its r circle, a shunt one
along its g circle, a line round its circle about Zc (Moving on the chart). ⟨130⟩ Fixed parts in between carry a
circle to another circle, since each part maps Γ by a Möbius transformation [WikiMobius]. ⟨131⟩ So with two unknowns
and a target point the solver draws two circles at the node between them: where the first unknown can take that node,
and where the second must start from to end on the target. ⟨132⟩ A node on both is a solution, so the solutions are
where the circles cross; it is the textbook's construction on the chart: land the point on the circle through the
target, then move along it [SteerVol3 §6.7]. ⟨133⟩

**Why two, one or none.** Two circles whose centres are d apart, with radii R₁ and R₂, cross twice when
|R₁ − R₂| < d < R₁ + R₂, touch once when d equals either end, and miss otherwise. ⟨134⟩ Two different circles never
share more than two points. ⟨135⟩ So the page says "Two solutions.", "One solution: the two circles just touch." or
"No solution." with its reason. ⟨136⟩ The textbook's L network has two answers too, a low-pass and a high-pass one
[SteerVol3 §6.4]. ⟨137⟩

**When the circles are one.** Two series reactances in a row both move the node along the same r circle, so they act
as one part. ⟨138⟩ If that circle misses the target there is no solution ("These two parts do the same job."); if it
passes through, every value of one has a value of the other, and the page asks to fix one of them. ⟨139⟩

**The start circuit.** Mark both values (part 1's C and part 2's L under "Solve for") and keep the goal, the centre at
the input. The first circle is the load's r = 0.5 circle: centre Γ = 1/3, radius 2/3. ⟨140⟩ The second is g = 1,
the circle a shunt part must start on to end at the centre: centre −1/2, radius 1/2. ⟨141⟩ Their centres are 5/6
apart, between 2/3 − 1/2 = 1/6 and 2/3 + 1/2 = 7/6: two crossings, z = 0.5 − j0.5 and z = 0.5 + j0.5
(Γ = −0.2 ∓ j0.4). ⟨142⟩ The first is the worked match: C 31.83 pF, L 79.58 nH (Matching with two parts). ⟨143⟩
The second is the load itself, which is on g = 1 already: part 1 adds nothing (x = 0) and part 2 adds b = +1, a shunt
C of 31.83 pF, the one-part match. ⟨144⟩ Both leave |Γ| = 0 at the input. ⟨145⟩

**The load decides the count.** With R = 50 Ω (r = 1) the r circle touches g = 1 at the centre: one solution, a
series C of 63.66 pF that cancels the load's +j25 Ω and no shunt part (an L of ∞). ⟨146⟩ With R = 100 Ω (r = 2,
centre 2/3, radius 1/3) the centres are 7/6 apart, more than 1/3 + 1/2 = 5/6: no solution in this order; shunt first
can (Matching with two parts). ⟨147⟩ A line's length repeats every λ/2, so its solutions are counted per λ/2. ⟨148⟩

**A circle instead of a point.** A circle goal (VSWR ≤ 1.5, g = 1, …) is one condition, so one unknown meets it at
0, 1 or 2 values, where its circle crosses the goal's (next topic). ⟨149⟩ Two unknowns then leave a family: for every
value of the first, 0 to 2 values of the second. ⟨150⟩ With both start values marked and the goal VSWR ≤ 1.5 at the
input, a C of 31.83 pF needs an L of 56.51 nH or 134.48 nH to put the input on the VSWR 1.5 circle, and any L
between keeps it inside. ⟨151⟩ The slider runs over the first unknown's ranges (C from 26.37 to 40.36 pF is one of
them) and shows the second's values at each. ⟨152⟩

**Equations:** `series-adds-z`, `shunt-adds-y`, `circle-r`, `circle-g`, `mobius`, `x-series-c`, `b-shunt-c`,
`b-shunt-l`.

**Live numbers:** the user's own solve when something is marked (`solve(circuit, ask.unknowns, ask.goal)`): its status
in words, the two circles at `circleNode` (centre and radius of each from `SolveResult.circles`, the distance d of the
centres, and which of the three cases holds), the solutions' values with their x or b (`SolvedValue.value`, `added`).
Nothing marked: the start example (both values, the centre at the input) on `defaultCircuit()`. Start: [circles
r = 0.5 (centre 1/3, radius 2/3) and g = 1 (−1/2, 1/2) at node 1; d = 5/6; two; C 31.83 pF, L 79.58 nH; x = 0, shunt
C 31.83 pF; |Γ| 0 and 0].

**Figure:** three mini charts side by side, each with g = 1 in part 2's colour and an r circle in part 1's colour:
r = 0.5 with both crossings marked ("two"), r = 1 touching at the centre ("one"), r = 2 apart ("none").

**Citations:** WikiMobius "Elementary properties"; SteerVol3 §6.4, §6.7.

---

## 10. Why one value cannot reach a point

**Id:** `one-value-and-a-point` (page topic 9)

**Text.**

A point on the chart is two numbers, r and x (or Γr and Γi); one value is one number. ⟨153⟩ As that value runs over
all it can take, the node moves along one circle, and a point off that circle is never reached; one on it is a lucky
hit. ⟨154⟩ So the counting line says "One value and a point: exact only by chance, so the solver gives the nearest
value.", and the result says "One value alone reaches a point only by chance." ⟨155⟩

**The nearest value.** How near the node comes is measured by the mismatch m, the |Γ| the node would have on a chart
centred on the target. ⟨156⟩ For the centre as target, m is |Γ| itself. ⟨157⟩ On the target's chart the part's circle
is still a circle, and the nearest it comes to the target is where it touches a circle of constant m about the
target; the page draws that circle with the part's. ⟨158⟩

**The start circuit.** Mark only part 1's C and put the goal (the centre) at node 1, between the two parts. The C moves
node 1 along r = 0.5, and the centre is on r = 1: no C reaches it. ⟨159⟩ On an r circle |Γ| is least where x = 0,
since |Γ|² = ((r − 1)² + x²)/((r + 1)² + x²) grows with x². ⟨160⟩ So the nearest is z = 0.5, Γ = −1/3: the C must
cancel the load's +j25 Ω, X = −25 Ω, C = 63.66 pF, and the page says it comes within m = 0.333 of the
target (VSWR 2). ⟨161⟩ The page then suggests freeing a second value, or choosing a circle goal. ⟨162⟩

**Inside a circle: a range.** A goal that allows a margin (VSWR ≤ 1.5, |Γ| ≤ 0.2, return loss ≥ 14 dB) is the inside
of a circle, so one value keeps it over the arc of its circle inside the goal's: a range of values. ⟨163⟩ With only
part 1's C marked and the goal VSWR ≤ 1.5 at the input (the L at 79.58 nH), any C from 26.43 to 39.99 pF keeps it:
C = 1/(ωZ0(1 ± 1/√24)). ⟨164⟩ An exact circle (|Γ| = 0.2, or g = 1) is met at its 0, 1 or 2 crossings instead:
with the goal g = 1 at node 1, part 1 meets it at 31.83 pF and at x = 0. ⟨165⟩

**Equations:** `gamma-z`, `circle-r`, `mismatch-to-target` (to add), `gamma-vswr`, `x-series-c`.

**Live numbers:** with one unknown and a point target (status `best`): the value (`solutions[0].values[0]`), m
(`Solution.mismatch`) and the circles at `circleNode` (the part's and the touching one, centre and radius); with an
inequality goal (status `range`): `ranges[i].min`/`max` and the kind. Otherwise the start example on
`defaultCircuit()` with only part 1's C marked: goal the centre at node 1 for the nearest value, VSWR ≤ 1.5 at the
input for the range. Start: [r = 0.5; C 63.66 pF; m 0.333 (VSWR 2); touching circle |Γ| = 1/3 about the centre; range
26.43–39.99 pF].

**Figure:** a mini chart with the r = 0.5 circle (part 1's colour), the dashed circle |Γ| = 1/3 about the centre
touching it at Γ = −1/3 (marked "nearest"), the centre marked as the target, and r = 1 faint to show where the target
lies.

**Citations:** none: every claim is derived or describes the tool (claims.md).

---

## 11. Realisable values and standard values

**Id:** `realisable-values` (page topic 10)

**Text.**

**Values a part can have.** An ideal R, L or C has a value of zero or more. ⟨166⟩ A series C adds x = −1/(ωCZ0),
never positive, and a series L adds x = ωL/Z0, never negative; the shunt parts likewise with b. ⟨167⟩ When an answer
needs the other sign, the page offers the other kind ("as a series L") and marks it "true at this frequency only":
ωL grows with f and 1/(ωC) falls, so the swap gives the same reactance at f0 alone. ⟨168⟩ Marking "L or C" instead
lets the sign choose the kind, with no swap. ⟨169⟩ In the start circuit's second solution part 2 is such a swap: a
shunt C of 31.83 pF where the circuit has an L. ⟨170⟩

A series C of ∞ or a series L of 0 is a plain connection; a shunt L of ∞ or a shunt C of 0 is no part at all. ⟨171⟩
A negative R would give out power, so the solver drops it and says why. ⟨172⟩ A λ/4 transformer's Zt of 0 or ∞ is
not offered: it would make the node a short or an open, whatever the load. ⟨173⟩

**Lengths.** A line's or stub's length comes back as the shortest that works; λ/2 more turns the point once more
round its full circle at f0, so it gives the same match there (Transmission lines). ⟨174⟩ Away from f0 each extra
λ/2 turns the point a further 360°·Δf/f0, so the match drifts away faster as f leaves f0; the page notes "(+ λ/2 gives
the same match at f0, over a narrower band)". ⟨175⟩

**Standard values.** Resistors and capacitors follow the E series of IEC 60063: E6, E12, E24, E48 and E96 have 6 to
96 values per decade, and parts in them are usually sold at 20, 10, 5, 2 and 1 % [WikiE]. ⟨176⟩ E24's values are
about 10^(1/24) ≈ 1.10 apart, steps of about 10 % [WikiE]. ⟨177⟩ High-Q RF chip capacitors in 0402 run from 0.1 pF (or
0.2 pF) to 33 pF, with tolerances in pF below 10 pF (±0.05 to ±0.5 pF) and in percent from 10 pF [JohansonHighQ]. ⟨178⟩ RF chip
inductors come in each maker's own list, not an E series: 1.9 nH, which no E series has, with tolerances of 2 %, 5 %
or ±0.2 nH [WurthWEKI]. ⟨179⟩

So "Standard values" in the Solve panel picks a list per kind: E6 to E96, an own list pasted from a maker's range, or
any value; R, L and C start at E24, Zt and Zc at any value. ⟨180⟩ Dragging snaps to the same lists. ⟨181⟩ Under every
solution the page lists the neighbouring standard values, each value's neighbour below and above in every combination,
re-evaluated, with the |Γ| each gives, and Apply. ⟨182⟩

**The start match in E24.** 31.83 pF lies between 30 and 33 pF, 79.58 nH between 75 and 82 nH. ⟨183⟩ 33 pF with 82 nH
gives |Γ| = 0.0377 (VSWR 1.08, return loss 28.5 dB), 33 pF with 75 nH 0.0468, 30 pF with 82 nH 0.0620, and 30 pF
with 75 nH 0.0706 (VSWR 1.15). ⟨184⟩ All four are inside the default close-enough circle, |Γ| ≤ 0.2. ⟨185⟩

**Limits.** All of this is for ideal parts at one frequency: the tool computes neither a part's tolerance nor its
losses. ⟨186⟩ Real chip inductors have a finite Q and resonate on their own: the WE-KI parts of 6.2 to 7.5 nH have
Q ≈ 20–25 at 250 MHz and self-resonate at 4.8 to 5.8 GHz [WurthWEKI]. ⟨187⟩

**Equations:** `x-series-l`, `x-series-c`, `b-shunt-l`, `b-shunt-c`, `quarter-wave`, `line-rotation`, `line-theta`,
`beta`, `vswr`, `return-loss`.

**Live numbers:** the user's solve when something is marked: each solution's swapped values (`SolvedValue.swapped`,
`kind`), lengths with `period`, and the first solution's variants (`standardVariants(circuit, goal, solution,
choice)` with the page's list choice: `values`, `gamma`); the list per kind (the "Standard values" summary). Otherwise
the start example (both values, the centre) on `defaultCircuit()` with E24. Start: [solution 1 C 31.83 pF, L
79.58 nH; neighbours 30/33 pF, 75/82 nH; variants |Γ| 0.0377, 0.0468, 0.0620, 0.0706; solution 2: shunt C 31.83 pF,
swapped].

**Figure:** a mini chart zoomed on the centre (|Γ| ≤ 0.25 in view) with the dashed |Γ| = 0.2 circle, the exact match
at the centre and the four E24 variants' input points, each labelled with its pair ("33 pF · 82 nH").

**Citations:** WikiE; JohansonHighQ; WurthWEKI.
