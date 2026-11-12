# Smith chart – theory content (steps M3.5a, M4.3c)

The source text of the page's Theory section and of the short lines beside the controls. Step M3.5b turns it into
`components/Smith/Theory.tsx` and the References section (learning.md §5). Part of [plan.md](plan.md). M4.3c added the
solver's topics as §9–§11 in [theory-solver.md](theory-solver.md) (split off for size; §8 keeps its number, which
whys.ts and claims.md name); on the page they follow topic 7, as topics 8–10.

**How to read this file.**
- One section per topic of learning.md §5, in that order. **Id** is the page anchor (`#moving-on-the-chart`).
- **Text** is what the page says, plain, for an engineer meeting the chart. `⟨n⟩` after a sentence is its number in
  the claims checklist ([notes-M3.5.md](notes-M3.5.md)); the page does not print it. `[key §x]` is a citation: the
  page prints it as an IEEE number through the `Bibliography`. A sentence with neither a citation nor a registry
  equation behind it is a definition or describes the tool (the checklist says which).
- **Equations** are ids of `lib/smith/equations.ts` (`EQUATION_BY_ID`), shown in the order listed, with live
  numbers where the topic says so (notes-M1.4.md "For M3.5": `tex(tree)`, `tex(tree, {value})`, `valueTex`).
  `mobius` (topic 4) was added in M3.5b; `mismatch-to-target` (topic 10) is **to add** (notes-M4.3c.md).
- **Live numbers** name what the formulas carry and the engine function that gives it; values in brackets are those
  of the start circuit (D16: Z0 = 50 Ω, f0 = 100 MHz, load 25 + j25 Ω, series C of x = −1, shunt L of b = −1), worked
  by hand here and to be checked against the engine by M3.5b's harness. Node k is node k of
  `network.evaluateCircuit` (0 = the load); `M_*` are the metric slots of `network.nodeMetrics`.
- **Figures** are mini charts drawn by the tool's own chart code in both themes.
- Words: "the point" is the node's Γ on the chart; "clockwise" is as seen on the screen (Γi up).

---

## 1. How to use this tool

**Id:** `how-to-use`

**Text.**

The page opens on a worked example: a load of 25 + j25 Ω on a 50 Ω reference at 100 MHz, brought to the centre of
the chart by a series capacitor and a shunt inductor. ⟨1⟩ Change it, or press Start over to come back to it. ⟨2⟩

1. **Say what you have.** Type the load's R and X in ohms, the reference impedance Z0 (often 50 Ω) and the frequency
   f0 you design for. ⟨3⟩ The load appears as a point on the chart, marked L. ⟨4⟩
2. **Build.** Add a part with Add: pick its kind and where it goes. ⟨5⟩ Or press Draw and drag out of the input
   (In) on the chart: the part is added at the source end and follows your pointer. ⟨6⟩ The strip shows the circuit
   the textbook way, source left and load right; the path on the chart runs the other way, from the load towards the
   source, because each part changes what the parts before it look like from the source side. ⟨7⟩
3. **Drag.** Each part draws an arc that starts at the point before it and ends at a ring. Drag the ring and the
   part's value follows. ⟨8⟩ Type a value in the part's card when you know it exactly. ⟨9⟩ Undo and Redo step
   through every change. ⟨10⟩
4. **Read.** Hover over or tap any place on the chart and the readout gives z, Z, y, Y, Γ, the VSWR and the return
   loss there. ⟨11⟩ The node table gives the same for every node of the path, from the load to the input. ⟨12⟩

The usual aim is to bring the input to the centre. There Γ = 0: nothing is reflected and all the power the source
sends reaches the load [Ellingson2018 §3.20]. ⟨13⟩ The dashed circle around the centre is the tool's "close enough"
(VSWR 1.5); it follows the goal when you choose another in the Solve panel. ⟨14⟩

**Equations:** none (the topic links to the others).

**Live numbers:** in the last paragraph, "the input is now at |Γ| = … ([0])", from `M_MAG` of the last node.

**Figure:** none.

**Citations:** Ellingson2018 §3.20.

---

## 2. Γ, z and y, and normalising by Z0

**Id:** `gamma-z-y`

**Text.**

The chart never shows ohms. It shows ratios to one reference impedance Z0, the impedance of the system the circuit
sits in. ⟨15⟩ The normalised impedance is z = Z/Z0 = r + jx, and the normalised admittance is its inverse,
y = 1/z = Y·Z0 = g + jb [WikiSmith "Normalization"]. ⟨16⟩ Normalising is what makes one drawing serve every system:
the circle marked r = 1 is 50 Ω on a 50 Ω chart and 75 Ω on a 75 Ω chart. ⟨17⟩

What the chart plots is Γ, the reflection coefficient: the reflected voltage wave at a point divided by the incident
one [Ellingson2018 §3.12]. ⟨18⟩ It follows from z alone, Γ = (z − 1)/(z + 1) [Ellingson2018 §3.12], and z follows
back from Γ [SteerVol2 §2.3]. ⟨19⟩ Three points are worth knowing by heart: a load equal to Z0 gives Γ = 0, the
centre; an open circuit gives Γ = +1, the right-hand edge; a short gives Γ = −1, the left-hand edge
[Ellingson2018 §3.12]. ⟨20⟩ A passive load has |Γ| ≤ 1, so every passive load lies on or inside the rim
[Ellingson2018 §3.12]. ⟨21⟩ (Γ is the reflection coefficient of the voltage; that of the current is −Γ
[Ellingson2018 §3.12].) ⟨22⟩

So a point on the chart *is* a value of Γ, and the grid printed over it lets you read that point's z without
computing anything [SteerVol3 §3.4]. ⟨23⟩ The readout gives Γ two ways: polar (|Γ| and its angle, how far out and
which way round) and Cartesian (Γr + jΓi, the point's coordinates across and up). ⟨24⟩

Admittance needs no second plot. The same point has y = (1 − Γ)/(1 + Γ) [WikiSmith "Admittance chart"], ⟨25⟩ which
is the z formula applied to −Γ: the y of a point is read like the z of the point opposite it through the centre. ⟨26⟩
That is why an admittance grid is the impedance grid turned half a turn about the centre; the point stays where it
is, only the grid changes [SteerVol3 §3.4]. ⟨27⟩

**Equations:** `z-norm`, `y-norm`, `gamma-z`, `z-gamma`, `gamma-y`, `y-gamma`.

**Live numbers:** the load's (node 0): Z [25 + j25 Ω], z [0.5 + j0.5], y [1 − j1], Γ Cartesian [−0.2 + j0.4] and
polar [0.4472∠116.57°]; from `network.nodeMetrics` (`M_ZR`, `M_ZI`, `M_YR`, `M_YI`, `M_GR`, `M_GI`, `M_MAG`,
`M_ANGLE`), Z as z·Z0.

**Figure:** the unit disc without grid: the centre (match), +1 (open), −1 (short), the load's point and, dotted, the
point −Γ whose z is the load's y.

**Citations:** WikiSmith "Normalization", "Admittance chart"; Ellingson2018 §3.12; SteerVol2 §2.3; SteerVol3 §3.4.

---

## 3. Reading the chart

**Id:** `reading-the-chart`

**Text.**

The grid is two families of circles for z and two for y. ⟨28⟩

- **Constant r.** All points with the same resistance r lie on one circle, centred on the real axis, with centre
  r/(1 + r) and radius 1/(1 + r). ⟨29⟩ Every one of them touches the right-hand edge at Γ = +1; r = 0 is the rim
  itself, and r = 1 passes through the centre. ⟨30⟩
- **Constant x.** Points of the same reactance x lie on a circle centred at (1, 1/x) with radius 1/|x|, of which
  only an arc falls inside the chart; these too all pass through Γ = +1. ⟨31⟩ The centre's height 1/x is a real
  number: a common slip in the derivation is to write (Γi − i/x)², where (Γi − 1/x)² is right. ⟨32⟩ The real axis
  is x = 0, pure resistance. ⟨33⟩ The upper half is inductive (x > 0), the lower half capacitive (x < 0)
  [SteerVol3 §3.4]. ⟨34⟩
- **Constant g and b.** The admittance grid is the same picture mirrored left to right: g circles have their centre
  at −g/(1 + g) and radius 1/(1 + g), b circles their centre at (−1, −1/b) and radius 1/|b|, and all of them pass
  through Γ = −1. ⟨35⟩ Read as admittance, the upper half has b < 0, which is still inductive: an inductor's
  susceptance is negative [SteerVol3 §3.4]. ⟨36⟩

The circle equations are not taken on trust: each comes from writing r, x, g or b in terms of Γr and Γi and completing
the square (the derivations come with the equation panel). ⟨37⟩

**Z, Y and ZY.** Z draws the r and x circles, Y the g and b circles, ZY both. ⟨38⟩ The point is the same in all
three; only what you read off it changes [SteerVol3 §3.4]. ⟨39⟩ ZY, the combined chart, is the one to use when a
circuit mixes series and shunt parts, because series parts move along the impedance grid and shunt parts along the
admittance grid (see Moving on the chart). ⟨40⟩ Older practice read admittance by turning the point half a turn on an
impedance chart; that is not used now [SteerVol3 §3.4], and this tool never moves the point. ⟨41⟩

**The scales on the rim.** One scale gives the angle of Γ in degrees. ⟨42⟩ Two more count wavelengths
"towards the generator" (clockwise) and "towards the load" (counter-clockwise), from 0 at the short circuit to 0.5 for
a full turn [SteerVol3 §3.4]. ⟨43⟩ A full turn is half a wavelength because the angle of Γ changes by twice the
electrical length of a line (see Transmission lines) [SteerVol3 §3.4]. ⟨44⟩

**Zooming.** Close to the centre the circles crowd together; zoom in and the grid fills in finer values. ⟨45⟩

**Equations:** `gamma-parts-z`, `r-gamma`, `x-gamma`, `circle-r`, `circle-x`, `gamma-parts-y`, `g-gamma`, `b-gamma`,
`circle-g`, `circle-b`.

**Live numbers:** the four circles through the load's point: r [0.5: centre 0.3333, radius 0.6667], x [0.5: centre
(1, 2), radius 2], g [1: centre −0.5, radius 0.5], b [−1: centre (−1, 1), radius 1]; r, x, g, b from
`network.nodeMetrics` of node 0, centres and radii by the registry's circle formulas (evaluated with the equation
evaluator, which has no engine figure for them). Γr, Γi from `M_GR`, `M_GI`.

**Figure:** a mini chart with only those four circles, in the grid's r/x and g/b colours, crossing at the load.

**Citations:** SteerVol3 §3.4.

**Note for M3.5b (not on the page).** This topic is where the owner's notes (learning.md §6) are put right: the x
circle with 1/x (claim 32, said as a common slip without naming the notes), the g and b circle forms the notes lack
(claim 35, shown by `circle-g`, `circle-b`), "Admittance" spelt right, Γr, Γi and j printed as symbols. The
derivations the notes stop short of are M5's stepped reveal (claim 37).

---

## 4. Moving on the chart

**Id:** `moving-on-the-chart`

**Text.**

Every part does one simple thing to the point, and each simple thing is a walk along one of the chart's circles. Learn
the four walks and you can read any matching circuit off the chart.

**Series parts add to z.** A part in series adds its own impedance to what it sees: z_in = z_L + z_s
[SteerVol3 §2.2.6]. ⟨46⟩ An inductor or a capacitor in series adds only reactance, so r does not change and the point
slides along its constant-r circle. ⟨47⟩ An inductor adds x = ωL/Z0, which is positive; a capacitor adds
x = −1/(ωCZ0), which is negative [WikiSmith "Circuit elements and topology"]. ⟨48⟩ A series resistor adds only r:
the point slides along its constant-x arc, towards the open circuit at Γ = +1 as R grows. ⟨49⟩

**Shunt parts add to y.** A part in shunt adds its admittance: y_in = y_L + y_p [SteerVol3 §2.2.6]. ⟨50⟩ A capacitor
adds b = ωCZ0, positive; an inductor adds b = −Z0/(ωL), negative [WikiSmith "Circuit elements and topology"]. ⟨51⟩ g
does not change, so the point slides along its constant-g circle. ⟨52⟩ A shunt resistor adds only g: the point slides
along its constant-b arc, towards the short at Γ = −1 as R falls. ⟨53⟩ Open and shorted stubs are shunt parts too:
they add susceptance and move along g circles. ⟨54⟩

**Which way round.** Every r circle runs from Γ = +1 round to the point on the real axis where x = 0. ⟨55⟩ As x grows
from 0, the point leaves the real axis upwards, so adding inductance in series turns the point **clockwise** round
its r circle, and adding capacitance in series turns it **counter-clockwise**. ⟨56⟩ Every g circle runs from Γ = −1
round to the point on the real axis where b = 0; as b grows from 0 the point leaves it downwards, so a shunt capacitor
turns the point **clockwise** round its g circle and a shunt inductor **counter-clockwise**. ⟨57⟩ The textbooks give
the signs (a series inductor moves the point up along constant r [SteerVol3 §3.4], a shunt capacitor raises b along
constant g [SteerVol3 §6.7]); the turning sense follows from the circle equations. ⟨58⟩

A shorter way to hold it: inductors move the point towards the upper half, capacitors towards the lower half, whether
they sit in series or in shunt. ⟨59⟩ Both follow from the upper half being inductive for z and for y alike. ⟨60⟩

A line turns the point about the centre of its own chart, **clockwise** as it gets longer: the direction the rim's
scale calls "towards the generator" [SteerVol3 §3.4, §3.5]. ⟨61⟩ (The details are in Transmission lines.)

| Part | Keeps | Moves along | Arc from "no effect" |
|---|---|---|---|
| Series L | r | its r circle | clockwise, upwards |
| Series C | r | its r circle | counter-clockwise, downwards |
| Series R | x | its x arc | towards Γ = +1 |
| Shunt C, open stub (short) | g | its g circle | clockwise, downwards |
| Shunt L, shorted stub (short) | g | its g circle | counter-clockwise, upwards |
| Shunt R | b | its b arc | towards Γ = −1 |
| Line of Z0 | \|Γ\| | a circle about the centre | clockwise |

("Short" stubs: shorter than λ/4; past that, a stub's susceptance changes sign and the arc carries on round the same
g circle.) ⟨62⟩

**Why every arc is a circle.** Picture z on its own plane, r across and x up. A series reactance moves z along a
straight vertical line, r fixed. ⟨63⟩ The chart does not plot z but Γ = (z − 1)/(z + 1), a fraction with a first-degree
expression above and below. ⟨64⟩ Maps of that shape, (az + b)/(cz + d), are called Möbius transformations, and they
take every straight line and every circle to a straight line or a circle [WikiMobius]. ⟨65⟩ So the straight line
"r fixed" lands on the chart as the r circle; completing the square in `circle-r` shows the same thing directly. ⟨66⟩

The same holds for every ideal part. With its value fixed, a part turns the impedance it sees into one of the same
shape, (A·Z + B)/(C·Z + D), with A, B, C, D from its two-port (ABCD) matrix. ⟨67⟩ Going from Γ to Z and back are maps
of that shape too, and such maps chained one after another are again of that shape [WikiMobius]; ⟨68⟩ so every ideal
part maps the point by Γ′ = (aΓ + b)/(cΓ + d). ⟨69⟩ Turn the part's value and the point it would reach moves along a
straight line in the right plane (x for series parts, b for shunt parts) or round a circle (Γ of a line, about its
own centre), and the chart shows that path as a circle. ⟨70⟩ A line whose impedance is not Z0 still draws a circle,
centred on the real axis but not at the centre [SteerVol3 §3.5]. ⟨71⟩ This is why the tool can draw every part's path
as an exact arc and why a drag can follow it exactly. ⟨72⟩

**Why an arc starts where the part does nothing.** Each arc starts at the value where the part has no effect at all,
and ends at the value it has. ⟨73⟩ For a series inductor that is 0 H, for a series capacitor an infinite capacitance
(a plain wire), for a shunt inductor an infinite inductance and for a shunt capacitor 0 F (both an open), for a
series resistor 0 Ω, for a shunt resistor an infinite resistance, and for a line or stub a length that adds nothing
(zero length; for an open stub zero length, for a shorted stub λ/4). ⟨74⟩ So an arc begins exactly on the point
before the part and ends on the point after it, and its length on the chart is how much the part does: a long arc is
a part doing a lot, a tiny one a part you might leave out. ⟨75⟩ It also tells you something about values: a series
capacitor moves the point less as it grows (x = −1/(ωCZ0) runs up to 0), so the long arcs come from the small
capacitors. ⟨76⟩ In general, making an L or a C larger always turns its point clockwise, in series or in shunt. ⟨77⟩

**Equations:** `series-adds-z`, `x-series-l`, `x-series-c`, `r-series`, `circle-r`, `shunt-adds-y`, `b-shunt-c`,
`b-shunt-l`, `g-shunt`, `circle-g`, `gamma-z`, `abcd-zin`, `mobius` (**to add**, below), `line-rotation`.

**`mobius` (to add to the registry).** Title "A part maps Γ by a Möbius transformation"; text
`Gamma_in = (a*Gamma_L + b)/(c*Gamma_L + d)`; sources `[{key: 'WikiMobius', at: '"Elementary properties"'}]`;
derivation "`abcd-zin` with Z_L = Z0·(1 + Γ_L)/(1 − Γ_L) (`z-gamma`), then `gamma-z` for Γ_in: up to a common
factor, a = A − B/Z0 − C·Z0 + D, b = A + B/Z0 − C·Z0 − D, c = A − B/Z0 + C·Z0 − D, d = A + B/Z0 + C·Z0 + D" (worked
here by hand; check with a series z: a = 2 − z, b = z, c = −z, d = 2 + z, and Γ_L = 0 gives z/(2 + z), the Γ of
1 + z); the four formulas can be M5's steps. Symbols a, b, c, d as the entries of the map (override `b` =
susceptance, as `line-circle-b` overrides B); engine `geometry.partMobius, mobApply`;
assumptions [REAL_Z0, 'ideal part, fixed value']. The harness binding: a, b, c, d from `partMobius` of a random part,
Γ_L random, Γ_in from `network.applyPart` and `nodeGamma`.

**Live numbers:** for every part of the circuit (a small list, one line each): its kind, what it keeps and the value
kept, what it changes from and to, and the sense. Start circuit: "1 · Series C keeps r = 0.5, x from 0.5 to −0.5,
counter-clockwise"; "2 · Shunt L keeps g = 1, b from 1 to 0, counter-clockwise". Kept and changed values from
`network.nodeMetrics` of nodes k and k + 1 (`M_ZR`/`M_ZI` for series, `M_YR`/`M_YI` for shunt), what is kept from
`parts.ADDS`, the sense from the sign of `parts.added` (positive x or b: clockwise; lines: clockwise). For the equations:
`x-series-c` with ω, C, Z0 of part 1 [C = 31.83 pF, x = −1]; `b-shunt-l` with part 2 [L = 79.58 nH, b = −1].

**Figures.** (a) Two small panels side by side: on the left, the z plane with the vertical line r = 0.5 and the load
at 0.5 + j0.5; on the right, the chart with the same line as the r = 0.5 circle, the load's point and an arrow for
growing x. (b) A mini chart on the load: its r circle and g circle, with four short arrows from the load (series L,
series C, shunt L, shunt C) in the part colours and a fifth, dashed, round the centre for a line.

**Citations:** SteerVol3 §2.2.6, §3.4, §3.5, §6.7; WikiSmith "Circuit elements and topology"; WikiMobius.

---

## 5. Transmission lines

**Id:** `transmission-lines`

**Text.**

A line is a part you set by its length rather than by a value of L or C. ⟨78⟩ Its electrical length is θ = βℓ =
2πℓ/λ, in radians, at the frequency f0 [Ellingson2018 §3.15]. ⟨79⟩ The tool takes it as ℓ in wavelengths or θ in
degrees at f0. ⟨80⟩

**Rotation.** On a lossless line whose impedance is Z0, the reflection coefficient a length ℓ from the load is the
load's turned by −2θ: Γ_in = Γ_L·e^{−j2θ} [SteerVol2 §2.3]. ⟨81⟩ Its size does not change, so the point walks round a
circle about the centre, and a falling angle means **clockwise** as you move from the load towards the generator
[SteerVol3 §3.4, §3.5]. ⟨82⟩ The same result in impedances is the input-impedance formula of a line
[Ellingson2018 §3.15]. ⟨83⟩

**Half a wavelength is a full turn.** θ = π at ℓ = λ/2, and 2θ = 2π brings Γ back to where it started: a λ/2 line
shows the load's own impedance [Ellingson2018 §3.15]. ⟨84⟩ That is why the rim counts 0 to 0.5 wavelengths per turn.
⟨85⟩ At ℓ = λ/8 the point turns a quarter turn: the start circuit's load 0.5 + j0.5 becomes 2 + j1. ⟨86⟩

**A line of another impedance.** When the line's impedance Zc is not Z0, the line keeps the size of the reflection
measured against Zc, not against Z0, so the point circles round Zc's point instead of the centre. ⟨87⟩ Seen on the Z0
chart that is still a circle, with its centre on the real axis (not on Zc's point), and the tool draws it exactly
[SteerVol3 §3.5]. ⟨88⟩

**The λ/4 transformer.** A line a quarter wavelength long takes the point half a turn round its own circle:
Z_in = Zt²/Z_L [Ellingson2018 §3.19]. ⟨89⟩ To match a resistive load R_L to Z0, choose Zt = √(Z0·R_L)
[Ellingson2018 §3.19]: a 25 Ω resistor on a 50 Ω system needs Zt = 35.36 Ω. ⟨90⟩ It is exact only where the line is
λ/4 long (or λ/4 plus a multiple of λ/2), so at f0 [Ellingson2018 §3.19; SteerVol2 §2.4]. ⟨91⟩ A load with
reactance, like the start circuit's, must first be made resistive: by a part that cancels the reactance, or by a
length of line that turns the point onto the real axis. ⟨92⟩

**Stubs.** A stub is a piece of line ending in a short or an open, put in shunt. ⟨93⟩ A shorted line shows
Z_in = jZc tan βℓ, an open one Z_in = −jZc cot βℓ [Ellingson2018 §3.16]. ⟨94⟩ In shunt they add susceptance:
b = (Z0/Zc) tan βℓ for an open stub and b = −(Z0/Zc) cot βℓ for a shorted one [Ellingson2018 §3.23], ⟨95⟩ so they move
the point along its g circle like a shunt C or L (Moving on the chart). ⟨96⟩ A shorted stub shorter than λ/4 acts as
an inductor and an open one as a capacitor, with the values `stub-short-l` and `stub-open-c` give, at one frequency
only [SteerVol2 §2.4]. ⟨97⟩ At λ/4 they swap roles: a shorted λ/4 stub adds nothing (b = 0) and an open one is a
short across the line. ⟨98⟩

**Equations:** `line-theta`, `beta`, `line-rotation`, `line-zin`, `line-circle-b`, `line-circle-centre`,
`line-circle-radius`, `quarter-wave`, `quarter-wave-match`, `stub-short-z`, `stub-open-z`, `stub-open-b`,
`stub-short-b`, `stub-short-l`, `stub-open-c`.

**Live numbers:** if the circuit has a line, stub or λ/4 part, the first of them: θ (`parts.turnsAt` × 2π), Γ at the
nodes before and after it (`M_GR`, `M_GI`), Zc and, for a stub, b (`parts.added`). Otherwise the load with a λ/8 line
of Z0 as the example: Γ_L [−0.2 + j0.4] → Γ_in [0.4 + j0.2], z_in [2 + j1], computed with `network.applyPart`
(`LINE`, 0.125 turns) on the load node. For `quarter-wave-match`: R_L = Re Z of the load [25 Ω] and Zt
[35.36 Ω], with a remark that the start load is not resistive (claim 92).

**Figure:** a mini chart on the load: the circle of constant |Γ| through it, the λ/8 arc to 2 + j1 with an arrow, and
the rim's wavelength ticks at 0, 0.125, 0.25, 0.375.

**Citations:** Ellingson2018 §3.15, §3.16, §3.19, §3.23; SteerVol2 §2.3, §2.4; SteerVol3 §3.4, §3.5.

---

## 6. How good is a match

**Id:** `how-good-is-a-match`

**Text.**

Four numbers say how far from a match a point is, and all four are one number in disguise: |Γ|, the distance from the
centre. ⟨99⟩

- **|Γ|** is the share of the incident voltage that comes back. Of the power, |Γ|² is reflected and 1 − |Γ|² reaches
  the load [Ellingson2018 §3.20]. ⟨100⟩
- **VSWR**, the voltage standing wave ratio, is the ratio of the largest to the smallest voltage along the line:
  (1 + |Γ|)/(1 − |Γ|) [Ellingson2018 §3.14]. ⟨101⟩ It is 1 at a match and grows without bound as |Γ| nears 1. ⟨102⟩
  On the chart, a circle about the centre is a circle of constant VSWR, and it crosses the real axis on the right
  at r = VSWR: the impedance at a voltage maximum is Z0·VSWR [SteerVol2 §2.3]. ⟨103⟩
- **Return loss** is how far the reflected power lies below the incident power, in decibels:
  RL = −20 log10 |Γ| [SteerVol3 §2.8]. ⟨104⟩ It is positive for a passive load [SteerVol3 §2.8], and larger is
  better. ⟨105⟩ (Written 20 log10 |Γ|, the same figure is negative; the sign says which of the two is meant.) ⟨106⟩
- **Mismatch loss** is how much less power reaches the load than with a match: ML = −10 log10(1 − |Γ|²) dB. ⟨107⟩ It
  is the power delivered above, put in decibels; the textbook names it without the formula [SteerVol3 §2.8]. ⟨108⟩

The start circuit's load alone has |Γ| = 0.4472: VSWR 2.618, return loss 6.99 dB, a fifth of the power reflected,
mismatch loss 0.97 dB. ⟨109⟩ The tool's goal circle, VSWR 1.5, is |Γ| = 0.2: return loss 13.98 dB and 4 % of the
power reflected. ⟨110⟩ Whether that is good enough is the designer's call; the tool's choice is only a default. ⟨111⟩

**Equations:** `power-reflected`, `power-delivered`, `vswr`, `gamma-vswr`, `z-max`, `z-min`, `return-loss`,
`mismatch-loss`.

**Live numbers:** the input's and the load's |Γ| (`M_MAG`), VSWR (`M_VSWR`), return loss (`M_RL`), mismatch loss
(`M_ML`), reflected and delivered share (`convert.reflectedPower`, `convert.deliveredPower`), and Z_max, Z_min as Z0
times and over the VSWR. Start circuit, load [0.4472, 2.618, 6.990 dB, 0.9691 dB, 0.2, 0.8; Z_max 130.9 Ω, Z_min
19.10 Ω]; input [0, 1, ∞, 0 dB].

**Figure:** a mini chart without grid, with circles of VSWR 1.5, 2 and 3 about the centre, each labelled with its |Γ|
and return loss, and the r = VSWR crossings marked on the real axis.

**Citations:** Ellingson2018 §3.14, §3.20; SteerVol2 §2.3; SteerVol3 §2.8.

---

## 7. Matching with two parts

**Id:** `matching-with-two-parts`

**Text.**

To match is to bring the input to the centre. ⟨112⟩ The centre lies on two circles that matter: r = 1 and g = 1. ⟨113⟩
A series part keeps r, a shunt part keeps g (Moving on the chart), so the last step into the centre is either a
series part along r = 1 or a shunt part along g = 1. ⟨114⟩ The first part's job is to land the point on that circle
[SteerVol3 §6.7]. ⟨115⟩

**The start circuit, step by step.** The load is z = 0.5 + j0.5. ⟨116⟩ A series capacitor of x = −1 takes it along
its r = 0.5 circle to 0.5 − j0.5, whose admittance is y = 1 + j1: on the g = 1 circle. ⟨117⟩ A shunt inductor of
b = −1 then takes y to 1, the centre. ⟨118⟩ At 100 MHz on 50 Ω those are 31.83 pF and 79.58 nH. ⟨119⟩

**Two routes, and when each works.** Series first (series, then shunt nearest the source) needs the load's r circle
to meet the g = 1 circle, which happens when r ≤ 1. ⟨120⟩ Shunt first needs the load's g circle to meet the r = 1
circle, so g ≤ 1. ⟨121⟩ Where a circle meets the target circle it usually meets it twice, so a route has two answers,
with different parts. ⟨122⟩ (Why two, one or none is the next topic, with the solver.)

**One part can be enough.** This load already lies on g = 1 (its y is 1 − j1), so a single shunt capacitor of
b = +1, 31.83 pF, matches it on its own. ⟨123⟩ A single series reactance matches any load on r = 1, a single shunt
reactance any load on g = 1 [Ellingson2018 §3.22]. ⟨124⟩ A line followed by a shunt stub does the same job with line pieces: the line turns the
point onto g = 1, the stub cancels b [Ellingson2018 §3.23]. ⟨125⟩

**Q.** For a resistive load matched by an L network, the Q of both legs is √(R_high/R_low − 1) [SteerVol3 §6.4]. ⟨126⟩
Any point has its own Q = |x|/r = |b|/g [SteerVol3 §6.4]; ⟨127⟩ the start load's is 1. ⟨128⟩ What Q means for
bandwidth comes with the frequency sweep. ⟨129⟩

**Equations:** `series-adds-z`, `shunt-adds-y`, `circle-r`, `circle-g`, `x-series-c`, `b-shunt-l`, `b-shunt-c`,
`q-node`, `q-l-network`.

**Live numbers:** the load's z and y (node 0), each node's z and y on the way (`M_ZR`, `M_ZI`, `M_YR`, `M_YI` of
every node), whether the load's r ≤ 1 and g ≤ 1 (which routes are open), each part's value with its x or b
(`parts.added`), and the load's Q (`M_Q`). Start circuit: [z 0.5 + j0.5, y 1 − j1; node 1 z 0.5 − j0.5, y 1 + j1;
input z 1; r ≤ 1 and g ≤ 1, both routes; C 31.83 pF, L 79.58 nH; Q 1]. When the user's circuit is not a two-part
match, the numbers stay those of the load and the text says which routes its r and g allow.

**Figure:** a mini chart with the r = 1 and g = 1 circles drawn strong, the load, the start circuit's two arcs (series
C down to 0.5 − j0.5, shunt L into the centre) and, dashed, the one-part route (shunt C along g = 1).

**Citations:** SteerVol3 §6.4, §6.7; Ellingson2018 §3.22, §3.23.

---

## 8. Short lines beside the controls and readouts

At most about 12 words, after the control or under the readout row, followed by "→ theory" opening the topic.

| Control or readout | Short line | Topic |
|---|---|---|
| Z0 | The reference: every z on the chart is Z divided by Z0. | `gamma-z-y` |
| f0 | The frequency the parts' reactances and line lengths are worked out at. | `moving-on-the-chart` |
| Load R, Load X | The load Z = R + jX; the path starts at its point, L. | `gamma-z-y` |
| Strip | Source left, load right; the chart's path runs from the load. | `how-to-use` |
| Add, Where | Adds the chosen kind at that place; its arc appears on the chart. | `how-to-use` |
| Draw | Drag out of In to add this kind at the source end. | `moving-on-the-chart` |
| Part card: move, Remove | Order matters: each part acts on what lies on its load side. | `moving-on-the-chart` |
| Series L | Adds +jx: clockwise along its r circle, upwards. | `moving-on-the-chart` |
| Series C | Adds −jx: counter-clockwise along its r circle, downwards. | `moving-on-the-chart` |
| Series R | Adds r: along its x arc, towards the open at Γ = +1. | `moving-on-the-chart` |
| Shunt L | Adds −jb: counter-clockwise along its g circle, upwards. | `moving-on-the-chart` |
| Shunt C | Adds +jb: clockwise along its g circle, downwards. | `moving-on-the-chart` |
| Shunt R | Adds g: along its b arc, towards the short at Γ = −1. | `moving-on-the-chart` |
| Line | Turns the point clockwise on a circle round Zc; λ/2 is a full turn. | `transmission-lines` |
| Open stub | Shunt b = (Z0/Zc)·tan θ; shorter than λ/4 it acts as a C. | `transmission-lines` |
| Short stub | Shunt b = −(Z0/Zc)·cot θ; shorter than λ/4 it acts as an L. | `transmission-lines` |
| λ/4 transformer | A λ/4 line of Zt: Z_in = Zt²/Z_L, exact at f0. | `transmission-lines` |
| Fields R, L, C | The part's value; the other fields follow. | `moving-on-the-chart` |
| Fields X, B (at f0) | Its reactance or susceptance at f0, in ohms or siemens. | `moving-on-the-chart` |
| Fields r, x, g, b (normalised) | The same divided by Z0 (or times Z0): what the chart adds. | `gamma-z-y` |
| Fields ℓ, θ (at f0) | Length in wavelengths, or electrical length in degrees, at f0. | `transmission-lines` |
| Fields Zc, Zt | The line's own impedance; not Z0 means a circle off-centre. | `transmission-lines` |
| Ring (handle) on an arc | Drag to change this part's value along its circle. | `moving-on-the-chart` |
| Z / Y / ZY | Which grid to read: r and x, g and b, or both. | `reading-the-chart` |
| Snap | Drags settle on grid circles and each kind’s Standard values list; Alt drags free. | `realisable-values` |
| Undo, Redo, Start over | Step through changes; Start over brings back the worked example. | `how-to-use` |
| Fit, Reset, zoom | Zoom in near the centre; the grid fills in finer circles. | `reading-the-chart` |
| Rim scales | Angle of Γ, and wavelengths towards the generator or the load. | `reading-the-chart` |
| Readout z (normalised) | Z/Z0 = r + jx at the point. | `gamma-z-y` |
| Readout Z | The same in ohms: z times Z0. | `gamma-z-y` |
| Readout y (normalised) | 1/z = g + jb at the point. | `gamma-z-y` |
| Readout Y | The admittance in siemens: y divided by Z0. | `gamma-z-y` |
| Readout Γ (polar) | Reflection coefficient: distance from the centre and angle. | `gamma-z-y` |
| Readout Γ (Cartesian) | The same Γ as Γr + jΓi: the point's coordinates. | `gamma-z-y` |
| Readout VSWR | Largest over smallest voltage on the line; 1 is a match. | `how-good-is-a-match` |
| Readout Return loss | Reflected power below incident, in dB; larger is better. | `how-good-is-a-match` |
| Node table | Each node from the load to the input: z, Γ, VSWR, return loss. | `how-to-use` |
| Circuit input | What the source sees: the end of the path, In. | `how-good-is-a-match` |
| Goal mark and text | The solver’s goal; by default the centre, within \|Γ\| 0.2 (VSWR 1.5). | `how-good-is-a-match` |
| Solve for (`solve-mark`) | Leave this value to the solver: it finds what meets the goal. | `two-one-or-none` |
| L or C (`solve-free`) | An L adds +jx, a C −jx: the answer’s sign picks the kind. | `realisable-values` |
| Goal selector (`solve-goal`) | Where it must hold, and a point or a circle to reach there. | `two-one-or-none` |
| Counting line (`solve-count`) | A point needs two free values; a circle needs one. | `one-value-and-a-point` |
| A solution row (`solve-solution`) | Values that meet the goal, and the \|Γ\| they give at its node. | `two-one-or-none` |
| Apply (`solve-apply`) | Puts these values in the circuit as one step; Undo takes it back. | `how-to-use` |
| Circles line (`solve-circles`) | Each unknown moves a node on a circle; answers are where they cross. | `two-one-or-none` |
| Family slider (`solve-family`) | Slide the first value; the second follows to keep the goal. | `two-one-or-none` |
| A variant (`solve-variant`) | The nearest standard values, and how far they move the input. | `realisable-values` |
| Standard values (`solve-lists`) | The values parts come in, per kind; drags and variants use them. | `realisable-values` |
| A suggestion (`solve-suggest`) | One changed value reaches a point only by chance; two reach it exactly. | `one-value-and-a-point` |
| Its kind R (`list-R`) | E series of IEC 60063; E24 parts usually 5 %, E96 1 %. | `realisable-values` |
| Its kind L (`list-L`) | Chip inductors come in makers’ own lists (1.9 nH): paste yours. | `realisable-values` |
| Its kind C (`list-C`) | E series; RF chip capacitors below 10 pF have tolerances in pF. | `realisable-values` |
| Its kind "Zt, Zc" (`list-Z`) | Any value by default; a list if your lines come in set impedances. | `realisable-values` |

Facts in the short lines repeat claims of the topics they link to (Series L: claims 48, 56; Line: 61, 84; stubs: 95,
97; λ/4: 89, 91; Z/Y/ZY: 38; VSWR: 101, 102; return loss: 104, 105; goal: 110, 14; the solver's lines: claims.md);
the checklist does not number them again.

