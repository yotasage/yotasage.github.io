# Smith chart – worked examples (step M6.1)

The content of the Learn section's worked examples: 16 examples with their circuits, steps and answers. Part of
[plan.md](plan.md); the design is [learning.md §7](learning.md#7-teaching-content-m6), the steps M6.2 and M6.3a in
[milestones.md](milestones.md#m6--teaching-content). The challenge kinds, the lesson link and the short lines of the new controls in
[examples-challenges.md](examples-challenges.md). What M6.2 and M6.3 build from it: [notes-M6.1.md](notes-M6.1.md).

## How to read this file

- **Link** is the example's circuit in the tool's link format (notes-M3.1.md), the query without `?`. Every link has
  `p=` (empty for no parts): a link without `p` keeps the start circuit's parts. Loading an example commits its circuit
  as one undo step. Every link was decoded by `decodeCircuit` with no issue and compared to the stated circuit to the
  bit (notes-M6.1.md "Checks").
- **Intro** and the steps' **Do** and **Hint** are the page's text, plain, as the theory's. **Topic** is the theory
  anchor that the step's "→ theory" opens (theory.md, theory-solver.md).
- **Done** is the test the guide panel runs on the visitor's own circuit after every change, so any way of getting
  there counts (typing, dragging, the solver). The forms, all at f0:
  - `kinds ls,cp`: the parts from the load are exactly these kinds (the link's codes).
  - `node k ≈ z (±t)`: |Γ_k − Γ(z)| ≤ t, with Γ_k the Γ at node k (0 the load, k after the k-th part from the load,
    `in` the input). `in ≈ centre (±t)` is |Γ_in| ≤ t.
  - `node k on g = 1 (±t)`, also `r =`, `x =`: goal.ts `goalResidual` of that circle goal at node k ≤ t.
  - `part k: L = v (±p %)`: part k (from the load, 1-based) has that value within p %.
  - `answer: q = v (±t)`: the visitor types the number into the guide; q names what is read.
  - `grid Y|ZY`: the chart shows the Y or the ZY grid. `load = R + jX`: the load as stated, to 1e-9 relative.
  - `away from step s at node k (≥ t)`: node k's Γ is at least t from where it was when step s was done (the other
    solution of the same kinds).
  - `next`: nothing to check; the visitor presses Next.
  A step lists several forms: all must hold; `or` between two groups: either group.
- **Answers** are worked by hand here; every stated number was reproduced by the engine (`network.evaluateCircuit`,
  `solve`, `standardVariants`) and by an independent hand formula to the digits stated (notes-M6.1.md). `⟨n⟩` after a
  sentence is its claim number in [claims.md](claims.md) (not printed on the page).
- **Solutions** are links of the finished circuits (the harness of M6.3a plays them: each reaches "done" at the last
  step). Values in links are numText's shortest round-trip digits.
- Numbers: Z0 = 50 Ω and f0 = 100 MHz unless stated, so ω = 2π·10⁸ s⁻¹; ωZ0 = 3.1416·10¹⁰ Ω/s; 1/(ωZ0) = 31.83 pF
  and Z0/ω = 79.58 nH are the C and L of one normalised unit (as the start circuit's parts).

## Index

| # | Id | Title | Load, f0 | Topic |
|---|---|---|---|---|
| E1 | `reading-a-match` | Reading \|Γ\|, VSWR and return loss | 75 Ω | `how-good-is-a-match` |
| E2 | `reading-a-point` | Reading Γ of a complex load | 25 + j25 Ω | `gamma-z-y` |
| E3 | `admittance` | The same load as an admittance: Y and ZY | 25 + j25 Ω | `reading-the-chart` |
| E4 | `series-or-shunt` | Series against shunt: one L, two ways | 25 Ω | `moving-on-the-chart` |
| E5 | `one-shunt-part` | One shunt part for a load on g = 1 | 25 + j25 Ω | `moving-on-the-chart` |
| E6 | `l-match-up` | L-match from 25 Ω up to 50 Ω, both solutions | 25 Ω | `matching-with-two-parts` |
| E7 | `l-match-down` | L-match from 100 Ω down to 50 Ω, both solutions | 100 Ω | `matching-with-two-parts` |
| E8 | `l-match-none` | When an L-match has no answer | 100 Ω | `two-one-or-none` |
| E9 | `line-turns` | A line turns the load | 25 + j25 Ω | `transmission-lines` |
| E10 | `quarter-wave` | A λ/4 transformer for 100 Ω | 100 Ω | `transmission-lines` |
| E11 | `line-and-quarter-wave` | A complex load: a line, then λ/4 | 25 + j25 Ω | `transmission-lines` |
| E12 | `open-stub` | Single open stub, both solutions | 100 Ω | `transmission-lines` |
| E13 | `short-stub` | Single short stub, both solutions | 60 − j80 Ω | `transmission-lines` |
| E14 | `three-part-ladder` | A three-part ladder from 10 Ω | 10 Ω | `matching-with-two-parts` |
| E15 | `e24-values` | Matching with E24 values: what rounding costs | 25 Ω | `realisable-values` |
| E16 | `sub-ghz-load` | A sub-GHz load: 20 − j35 Ω at 868 MHz | 20 − j35 Ω, 868 MHz | `realisable-values` |

The list on the page is in this order: reading first, then single moves, matching with lumped parts, lines, and the
practical ones last.

---

## E1. Reading |Γ|, VSWR and return loss

**Id:** `reading-a-match` · **Link:** `v=1&z0=50&f0=100e6&zl=75:0&p=` (Z0 50 Ω, f0 100 MHz, load 75 + j0 Ω, no parts)

**Intro.** A 75 Ω load on a 50 Ω reference. How far from a match is it, in the three figures engineers use?

**Steps.**
1. *Do:* Read |Γ| of the load from the readout, or as the point's distance from the centre. *Done:* `answer: |Γ| =
   0.2 (±0.005)`. *Hint:* Γ = (z − 1)/(z + 1) with z = 75/50 = 1.5. *Topic:* `gamma-z-y`.
2. *Do:* Read the VSWR. *Done:* `answer: VSWR = 1.5 (±0.01)`. *Hint:* VSWR = (1 + |Γ|)/(1 − |Γ|); a real load above
   Z0 sits on the axis at r = VSWR. *Topic:* `how-good-is-a-match`.
3. *Do:* Read the return loss. *Done:* `answer: RL = 13.98 dB (±0.05)`. *Hint:* RL = −20 log₁₀|Γ|. *Topic:*
   `how-good-is-a-match`.
4. *Do:* Set the load's R to 25 Ω. *Done:* `load = 25 + j0`. *Hint:* the Load R field above the strip. *Topic:*
   `gamma-z-y`.
5. *Do:* Read the VSWR now. *Done:* `answer: VSWR = 2 (±0.01)`. *Hint:* Γ = (0.5 − 1)/(0.5 + 1) = −1/3. *Topic:*
   `how-good-is-a-match`.

**Answers.** z = 1.5, so Γ = 0.5/2.5 = 0.2: 0.2² = 4 % of the incident power is reflected, 96 % delivered, and the
VSWR is 1.2/0.8 = 1.5 ⟨191⟩. The return loss is −20 log₁₀ 0.2 = 13.98 dB and the mismatch loss −10 log₁₀ 0.96 =
0.177 dB ⟨192⟩. A real load has a real Γ: 75 Ω lies on the axis right of the centre, 25 Ω left of it with Γ = −1/3,
VSWR 2 and return loss 9.54 dB ⟨193⟩.

---

## E2. Reading Γ of a complex load

**Id:** `reading-a-point` · **Link:** `v=1&z0=50&f0=100e6&zl=25:25&p=` (load 25 + j25 Ω, the start circuit's load, no
parts)

**Intro.** The start circuit's load without its parts: a resistance with some inductance in series. Read where it is.

**Steps.**
1. *Do:* Read |Γ|. *Done:* `answer: |Γ| = 0.447 (±0.005)`. *Hint:* z = 25/50 + j25/50 = 0.5 + j0.5. *Topic:*
   `gamma-z-y`.
2. *Do:* Read the angle of Γ, from the rim scale or the readout. *Done:* `answer: ∠Γ = 116.6° (±1)`. *Hint:* the angle
   is measured from the right half of the axis, counter-clockwise. *Topic:* `reading-the-chart`.
3. *Do:* Read the VSWR. *Done:* `answer: VSWR = 2.62 (±0.02)`. *Hint:* follow the point's |Γ| circle to the right half
   of the axis and read r there. *Topic:* `how-good-is-a-match`.
4. *Do:* Read the return loss. *Done:* `answer: RL = 6.99 dB (±0.05)`. *Hint:* −20 log₁₀|Γ|. *Topic:*
   `how-good-is-a-match`.

**Answers.** Γ = (z − 1)/(z + 1) = (−0.5 + j0.5)/(1.5 + j0.5); multiplying above and below by 1.5 − j0.5 gives
(−0.5 + j1)/2.5 = −0.2 + j0.4, so |Γ| = √0.2 = 0.447 at 180° − atan 2 = 116.6°; VSWR = 1.447/0.553 = 2.62, return loss
6.99 dB, mismatch loss 0.97 dB: 80 % of the power is delivered ⟨194⟩. The point is in the upper half because x > 0:
the load is inductive ⟨195⟩.

---

## E3. The same load as an admittance: Y and ZY

**Id:** `admittance` · **Link:** `v=1&z0=50&f0=100e6&zl=25:25&p=` (as E2)

**Intro.** Shunt parts add admittance, so a shunt part is read on the Y grid. Read this load as y = g + jb.

**Steps.**
1. *Do:* Switch the grid to Y or ZY. *Done:* `grid Y|ZY`. *Hint:* the Z / Y / ZY switch by the chart. *Topic:*
   `reading-the-chart`.
2. *Do:* Read g, the normalised conductance. *Done:* `answer: g = 1 (±0.02)`. *Hint:* every g circle touches the short
   at Γ = −1; find the one through L. *Topic:* `reading-the-chart`.
3. *Do:* Read b, the normalised susceptance. *Done:* `answer: b = −1 (±0.02)`. *Hint:* on the Y grid a negative b lies
   in the upper half. *Topic:* `gamma-z-y`.

**Answers.** y = 1/z = 1/(0.5 + j0.5) = (0.5 − j0.5)/0.5 = 1 − j1, so Y = y/Z0 = 20 − j20 mS ⟨196⟩. On the Z grid the
same y is the z of the point −Γ = 0.2 − j0.4, which is why the Y grid is the Z grid turned half a turn ⟨197⟩. An
inductive load has b < 0, in the upper half ⟨198⟩. The load lies on the g = 1 circle: E5 uses that.

---

## E4. Series against shunt: one L, two ways

**Id:** `series-or-shunt` · **Link:** `v=1&z0=50&f0=100e6&zl=25:0&p=` (load 25 Ω, no parts)

**Intro.** The same inductor moves the point differently in series and in shunt. Put one in each way and compare.

**Steps.**
1. *Do:* Add a series L and type L = 39.79 nH in its card. *Done:* `kinds ls`; `part 1: L = 39.79 nH (±0.5 %)`.
   *Hint:* x = ωL/Z0 = 2π·100 MHz·39.79 nH/50 Ω = 0.5. *Topic:* `moving-on-the-chart`.
2. *Do:* Read x at node 1, the end of its arc. *Done:* `answer: x = 0.5 (±0.01)`. *Hint:* a series part keeps r =
   0.5: the point runs clockwise up its r circle. *Topic:* `moving-on-the-chart`.
3. *Do:* Remove it and add a shunt L of the same 39.79 nH. *Done:* `kinds lp`; `part 1: L = 39.79 nH (±0.5 %)`.
   *Hint:* in shunt it adds b = −Z0/(ωL) = −2 to the load's y = 2. *Topic:* `moving-on-the-chart`.
4. *Do:* Read x at node 1 now. *Done:* `answer: x = 0.25 (±0.01)`. *Hint:* y = 2 − j2, and z = 1/y. *Topic:*
   `gamma-z-y`.

**Answers.** At 100 MHz, 39.79 nH is x = +0.5 in series and b = −2 in shunt ⟨199⟩. In series z = 0.5 + j0.5: the
point turns clockwise up the r = 0.5 circle. In shunt y = 2 − j2, so z = (2 + j2)/8 = 0.25 + j0.25: the point turns
counter-clockwise up the g = 2 circle and ends further from the centre (|Γ| 0.62 against 0.447). Both go into the
inductive upper half, on different circles and in opposite senses ⟨200⟩.

**Solutions.** `v=1&z0=50&f0=100e6&zl=25:0&p=ls:39.78873577297384e-9` (step 1),
`v=1&z0=50&f0=100e6&zl=25:0&p=lp:39.78873577297384e-9` (step 3).

---

## E5. One shunt part for a load on g = 1

**Id:** `one-shunt-part` · **Link:** `v=1&z0=50&f0=100e6&zl=25:25&p=` (as E2)

**Intro.** E3 found this load on the g = 1 circle. One shunt part then reaches the centre: it moves along g.

**Steps.**
1. *Do:* Switch to the Y or ZY grid and find the load on g = 1. *Done:* `grid Y|ZY`. *Hint:* y = 1 − j1 (E3).
   *Topic:* `reading-the-chart`.
2. *Do:* Add a shunt C. *Done:* `kinds cp`. *Hint:* a shunt C adds +jb: clockwise along its g circle, downwards.
   *Topic:* `moving-on-the-chart`.
3. *Do:* Set it so the input is at the centre. *Done:* `kinds cp`; `in ≈ centre (±0.02)`. *Hint:* b must cancel −1:
   C = b/(ωZ0) with b = 1. *Topic:* `moving-on-the-chart`.

**Answers.** y = 1 − j1, so the C must add b = +1: C = 1/(ωZ0) = 1/(2π·10⁸·50) = 31.83 pF, and the input is
y = 1, Z_in = 50 Ω ⟨201⟩.

**Solution.** `v=1&z0=50&f0=100e6&zl=25:25&p=cp:31.83098861837907e-12`

---

## E6. L-match from 25 Ω up to 50 Ω, both solutions

**Id:** `l-match-up` · **Link:** `v=1&z0=50&f0=100e6&zl=25:0&p=` (load 25 Ω, no parts)

**Intro.** A load below Z0 takes a series part first, onto the g = 1 circle, then a shunt part along g = 1 to the
centre. There are two ways.

**Steps.**
1. *Do:* Add a series L and drag it until node 1 is on the g = 1 circle (the ZY grid shows it). *Done:* `kinds ls`;
   `node 1 on g = 1 (±0.02)`. *Hint:* the r = 0.5 circle meets g = 1 at x = ±0.5; the L takes the upper one. *Topic:*
   `matching-with-two-parts`.
2. *Do:* Add a shunt C at the source end and bring the input to the centre. *Done:* `kinds ls,cp`; `in ≈ centre
   (±0.02)`. *Hint:* node 1 has y = 1 − j1, so the C adds b = +1. *Topic:* `matching-with-two-parts`.
3. *Do:* Now the other solution: a series C, then a shunt L. *Done:* `kinds cs,lp`; `in ≈ centre (±0.02)`. *Hint:*
   go down to x = −0.5 instead; y is then 1 + j1. *Topic:* `two-one-or-none`.

**Answers.** z is on the g = 1 circle when g = r/(r² + x²) = 1, that is r² + x² = r; with r = 0.5, x = ±0.5 ⟨202⟩.
Up: L = 0.5·Z0/ω = 39.79 nH, y = 1/(0.5 + j0.5) = 1 − j1, then a shunt C of b = 1, 31.83 pF. Down: a series C of
x = −0.5, C = 1/(ω·25 Ω) = 63.66 pF, y = 1 + j1, then a shunt L of b = −1, L = Z0/ω = 79.58 nH ⟨203⟩. Both have
Q = |x|/r = 1 at node 1, the Q of an L network from 25 to 50 Ω: √(50/25 − 1) = 1 ⟨204⟩.

**Solutions.** `v=1&z0=50&f0=100e6&zl=25:0&p=ls:39.78873577297384e-9,cp:31.83098861837907e-12`;
`v=1&z0=50&f0=100e6&zl=25:0&p=cs:63.66197723675814e-12,lp:79.57747154594767e-9`

---

## E7. L-match from 100 Ω down to 50 Ω, both solutions

**Id:** `l-match-down` · **Link:** `v=1&z0=50&f0=100e6&zl=100:0&p=` (load 100 Ω, no parts)

**Intro.** A load above Z0 takes the shunt part first, onto the r = 1 circle, then a series part along r = 1.

**Steps.**
1. *Do:* Add a shunt C and drag it until node 1 is on the r = 1 circle. *Done:* `kinds cp`; `node 1 on r = 1
   (±0.02)`. *Hint:* the load's y = 0.5; the g = 0.5 circle meets r = 1 at b = ±0.5. *Topic:*
   `matching-with-two-parts`.
2. *Do:* Add a series L at the source end and bring the input to the centre. *Done:* `kinds cp,ls`; `in ≈ centre
   (±0.02)`. *Hint:* node 1 has z = 1 − j1, so the L adds x = +1. *Topic:* `matching-with-two-parts`.
3. *Do:* The other solution: a shunt L, then a series C. *Done:* `kinds lp,cs`; `in ≈ centre (±0.02)`. *Hint:* take
   b = −0.5; z is then 1 + j1. *Topic:* `two-one-or-none`.

**Answers.** y is on the r = 1 circle when r = g/(g² + b²) = 1, so b = ±√(g − g²) = ±0.5 for g = 0.5. With a C: a shunt C
of b = 0.5, C = 0.5/(ωZ0) = 15.92 pF, z = 1/(0.5 + j0.5) = 1 − j1, then a series L of x = 1, 79.58 nH. With an L: a shunt
L of b = −0.5, L = Z0/(0.5ω) = 159.2 nH, z = 1 + j1, then a series C of x = −1, 31.83 pF. Q = 1 at node 1, as
√(100/50 − 1) ⟨205⟩.

**Solutions.** `v=1&z0=50&f0=100e6&zl=100:0&p=cp:15.915494309189536e-12,ls:79.57747154594767e-9`;
`v=1&z0=50&f0=100e6&zl=100:0&p=lp:159.15494309189535e-9,cs:31.83098861837907e-12`

---

## E8. When an L-match has no answer

**Id:** `l-match-none` · **Link:**
`v=1&z0=50&f0=100e6&zl=100:0&p=ls:79.57747154594767e-9,cp:15.915494309189536e-12&u=1lc,2lc` (load 100 Ω; E7's two
parts in the other order, the series L at the load; both marked "Solve for" as an L or C)

**Intro.** The same two parts as E7's answer, in the other order. The solver is asked for both values; read its
answer, then fix the order.

**Steps.**
1. *Do:* Read the Solve panel's message and the two circles on the chart. *Done:* `next`. *Hint:* the series part
   moves the 100 Ω point along r = 2, a circle right of Γr = 1/3; g = 1 lies left of 0. *Topic:* `two-one-or-none`.
2. *Do:* Move the series L to the source end (its card's ←, or Alt + ← on its tile). *Done:* `kinds cp,ls`. *Hint:*
   each part acts on what lies on its load side, so order matters. *Topic:* `moving-on-the-chart`.
3. *Do:* Apply one of the solver's solutions. *Done:* `kinds cp,ls` or `kinds lp,cs`; `in ≈ centre (±0.02)`.
   *Hint:* the marks moved with the parts; E7 has the numbers. *Topic:* `two-one-or-none`.

**Answers.** The solver answers "the two circles do not cross: no values of these two parts reach the target" ⟨206⟩.
A series part keeps r = 2; that circle runs from Γr = (r − 1)/(r + 1) = 1/3 to 1, and the g = 1 circle from −1 to 0, so
they never meet. Any load with r > 1 is so: it needs the shunt part at the load ⟨207⟩. Moved, the parts give E7's two
solutions.

**Solutions.** E7's two links (the moved link also carries `u=2lc,1lc`).

---

## E9. A line turns the load

**Id:** `line-turns` · **Link:** `v=1&z0=50&f0=100e6&zl=25:25&p=` (as E2)

**Intro.** A line of Z0 does not change how well the load is matched; it turns the point round the centre. Watch Z
change while |Γ| stays.

**Steps.**
1. *Do:* Add a line; it comes as λ/8 of Zc = Z0. *Done:* `kinds tl`; `node 1 ≈ 2 + j1 (±0.01)`. *Hint:* λ/8 turns Γ
   by 2βℓ = 90° clockwise. *Topic:* `transmission-lines`.
2. *Do:* Read |Γ| at node 1. *Done:* `answer: |Γ| = 0.447 (±0.005)`. *Hint:* a line of Z0 keeps the point on its
   circle round the centre. *Topic:* `transmission-lines`.
3. *Do:* Lengthen the line until node 1 is on the axis right of the centre. *Done:* `kinds tl`; `node 1 ≈ 2.618
   (±0.01)`. *Hint:* the load is at 116.6°, so Γ must turn 116.6° clockwise: ℓ = 116.6°/720° λ. *Topic:*
   `transmission-lines`.
4. *Do:* Read the input's R in ohms. *Done:* `answer: R = 130.9 Ω (±1)`. *Hint:* on the right half of the axis
   r = VSWR. *Topic:* `how-good-is-a-match`.
5. *Do:* Lengthen it on to the axis left of the centre. *Done:* `kinds tl`; `node 1 ≈ 0.382 (±0.01)`. *Hint:* λ/4
   more turns half a circle. *Topic:* `transmission-lines`.

**Answers.** λ/8 turns Γ = −0.2 + j0.4 by −90°: Γ = 0.4 + j0.2 at 26.6°, z = (1.4 + j0.2)/(0.6 − j0.2) = 2 + j1
(100 + j50 Ω), and |Γ| stays 0.447 ⟨208⟩. The axis is reached after 116.6°/720° = 0.1619 λ and, λ/4 later, after
0.4119 λ ⟨209⟩. There the input is real: Z0·VSWR = 50·2.618 = 130.9 Ω and Z0/VSWR = 19.10 Ω (z = 0.382) ⟨210⟩.

**Solutions.** `v=1&z0=50&f0=100e6&zl=25:25&p=tl:0.1618959044126083:50` (step 3),
`v=1&z0=50&f0=100e6&zl=25:25&p=tl:0.4118959044126083:50` (step 5)

---

## E10. A λ/4 transformer for 100 Ω

**Id:** `quarter-wave` · **Link:** `v=1&z0=50&f0=100e6&zl=100:0&p=` (load 100 Ω, no parts)

**Intro.** A quarter-wave line of another impedance Zt matches a real load at f0. Find Zt.

**Steps.**
1. *Do:* Add a λ/4 transformer; it comes with Zt = Z0. *Done:* `kinds qw`; `node 1 ≈ 0.5 (±0.01)`. *Hint:* a λ/4 of
   Z0 inverts: z_in = 1/z_L. *Topic:* `transmission-lines`.
2. *Do:* Set Zt so the input is at the centre. *Done:* `kinds qw`; `in ≈ centre (±0.01)`. *Hint:* Z_in = Zt²/Z_L must
   be 50 Ω. *Topic:* `transmission-lines`.

**Answers.** With Zt = Z0 the input is 50²/100 = 25 Ω, z = 0.5: the λ/4 inverts z ⟨211⟩. Z_in = Zt²/100 Ω = 50 Ω
gives Zt = √(50·100) = 70.71 Ω ⟨212⟩.

**Solution.** `v=1&z0=50&f0=100e6&zl=100:0&p=qw:70.71067811865476`

---

## E11. A complex load: a line, then λ/4

**Id:** `line-and-quarter-wave` · **Link:** `v=1&z0=50&f0=100e6&zl=25:25&p=` (as E2)

**Intro.** A λ/4 transformer needs a real load. A line first turns this load to the axis, where it is real (E9).

**Steps.**
1. *Do:* Add a line and lengthen it until node 1 is on the axis. *Done:* `kinds tl`; `node 1 on x = 0 (±0.01)`.
   *Hint:* E9: 0.1619 λ to the right half, 0.4119 λ to the left. *Topic:* `transmission-lines`.
2. *Do:* Add a λ/4 at the source end and set Zt to match. *Done:* `kinds tl,qw`; `in ≈ centre (±0.02)`. *Hint:*
   Zt = √(Z0·R) with R the line's real input. *Topic:* `transmission-lines`.
3. *Do:* Now the other solution: the line to the other crossing, and Zt again. *Done:* `kinds tl,qw`; `in ≈ centre
   (±0.02)`; `away from step 2 at node 1 (≥ 0.1)`. *Hint:* a quarter wavelength more or less. *Topic:*
   `two-one-or-none`.

**Answers.** At 0.1619 λ the line's input is 130.9 Ω, so Zt = √(50·130.9) = 80.90 Ω; at 0.4119 λ it is 19.10 Ω and
Zt = 30.90 Ω ⟨213⟩.

**Solutions.** `v=1&z0=50&f0=100e6&zl=25:25&p=tl:0.1618959044126083:50,qw:80.90169943749474`;
`v=1&z0=50&f0=100e6&zl=25:25&p=tl:0.4118959044126083:50,qw:30.90169943749474`

---

## E12. Single open stub, both solutions

**Id:** `open-stub` · **Link:** `v=1&z0=50&f0=100e6&zl=100:0&p=` (load 100 Ω, no parts; lines and stubs of Zc = Z0)

**Intro.** A line turns the load onto the g = 1 circle; a shunt stub there cancels b. Two places on the circle work.

**Steps.**
1. *Do:* Add a line and lengthen it until node 1 is on g = 1. *Done:* `kinds tl`; `node 1 on g = 1 (±0.02)`. *Hint:*
   the point turns on its |Γ| = 1/3 circle and meets g = 1 where Γr = −|Γ|² = −1/9. *Topic:* `transmission-lines`.
2. *Do:* Add an open stub at the source end and set its length to match. *Done:* `kinds tl,so`; `in ≈ centre
   (±0.02)`. *Hint:* node 1 has y = 1 ± j0.707: the stub adds the opposite b. *Topic:* `transmission-lines`.
3. *Do:* The other solution. *Done:* `kinds tl,so`; `in ≈ centre (±0.02)`; `away from step 2 at node 1 (≥ 0.1)`.
   *Hint:* the other crossing of g = 1. *Topic:* `two-one-or-none`.

**Answers.** A line of Z0 keeps |Γ| = 1/3. On the g = 1 circle y = 1 + jb has |Γ|² = b²/(4 + b²), so b² = 1/2 and
b = ±0.707, where Γr = −1/9 ⟨214⟩. Turning clockwise from 0°, the line meets y = 1 + j0.707 after 0.1520 λ and
y = 1 − j0.707 after 0.3480 λ. An open stub adds b = tan θ: −0.707 needs θ = 144.7°, 0.4020 λ, longer than λ/4 so it
acts as an L; +0.707 needs θ = 35.3°, 0.0980 λ, a C ⟨215⟩. The second solution is shorter in all: 0.446 λ against
0.554 λ.

**Solutions.** `v=1&z0=50&f0=100e6&zl=100:0&p=tl:0.1520433619923482:50,so:0.4020433619923482:50`;
`v=1&z0=50&f0=100e6&zl=100:0&p=tl:0.3479566380076518:50,so:0.09795663800765182:50`

---

## E13. Single short stub, both solutions

**Id:** `short-stub` · **Link:** `v=1&z0=50&f0=100e6&zl=60:-80&p=` (load 60 − j80 Ω, no parts; Zc = Z0)

**Intro.** The same construction with a shorted stub and a load that is not real.

**Steps.**
1. *Do:* Add a line and lengthen it until node 1 is on g = 1. *Done:* `kinds tl`; `node 1 on g = 1 (±0.02)`. *Hint:*
   the load is at |Γ| = 0.593, −46.8°; turn clockwise. *Topic:* `transmission-lines`.
2. *Do:* Add a short stub at the source end and set its length to match. *Done:* `kinds tl,ss`; `in ≈ centre
   (±0.02)`. *Hint:* a short stub adds b = −cot θ; shorter than λ/4 it acts as an L. *Topic:* `transmission-lines`.
3. *Do:* The other solution. *Done:* `kinds tl,ss`; `in ≈ centre (±0.02)`; `away from step 2 at node 1 (≥ 0.1)`.
   *Hint:* the other crossing of g = 1. *Topic:* `two-one-or-none`.

**Answers.** z = 1.2 − j1.6 gives Γ = (0.2 − j1.6)/(2.2 − j1.6) = (3 − j3.2)/7.4, |Γ| = 0.593 at −46.8°. On g = 1,
b² = 4|Γ|²/(1 − |Γ|²), so b = ±1.472 ⟨216⟩. The line meets y = 1 + j1.472 after 0.1104 λ: the stub adds −1.472,
cot θ = 1.472, θ = 34.2°, 0.0950 λ. It meets y = 1 − j1.472 after 0.2594 λ: θ = 145.8°, 0.4050 λ ⟨217⟩.

**Solutions.** `v=1&z0=50&f0=100e6&zl=60:-80&p=tl:0.11042321863830028:50,ss:0.09497462163589147:50`;
`v=1&z0=50&f0=100e6&zl=60:-80&p=tl:0.25944453062282585:50,ss:0.4050253783641085:50`

---

## E14. A three-part ladder from 10 Ω

**Id:** `three-part-ladder` · **Link:** `v=1&z0=50&f0=100e6&zl=10:0&p=` (load 10 Ω, no parts)

**Intro.** Three parts, shunt C, series L, shunt C (a pi), walked node by node. The first C is a free choice; the other
two then follow as in an L-match.

**Steps.**
1. *Do:* Add a shunt C of 159.2 pF. *Done:* `kinds cp`; `node 1 ≈ 0.1 − j0.1 (±0.01)`. *Hint:* the load's y = 5;
   b = ωC·Z0 = 5 gives y = 5 + j5. *Topic:* `moving-on-the-chart`.
2. *Do:* Add a series L at the source end and drag it until node 2 is on g = 1. *Done:* `kinds cp,ls`; `node 2 on
   g = 1 (±0.02)`. *Hint:* the r = 0.1 circle meets g = 1 at x = ±0.3; the L goes from −0.1 up to +0.3. *Topic:*
   `matching-with-two-parts`.
3. *Do:* Add a shunt C at the source end and match. *Done:* `kinds cp,ls,cp`; `in ≈ centre (±0.02)`. *Hint:* node 2
   has y = 1 − j3. *Topic:* `matching-with-two-parts`.
4. *Do:* Read the Q of node 2 in the node table. *Done:* `answer: Q = 3 (±0.05)`. *Hint:* Q = |x|/r at the node.
   *Topic:* `matching-with-two-parts`.

**Answers.** z₁ = 1/(5 + j5) = 0.1 − j0.1. On g = 1 with r = 0.1, x² = r − r² = 0.09, x = 0.3: the L adds 0.4,
31.83 nH, z₂ = 0.1 + j0.3, y₂ = 1 − j3; the last C adds b = 3, 95.49 pF ⟨218⟩. The node Q is 1 at node 1 and 3 at
node 2; an L-match from 10 to 50 Ω has Q = √(50/10 − 1) = 2. The first C sets where node 1 lands and so the Q of
node 2 ⟨219⟩.

**Solution.** `v=1&z0=50&f0=100e6&zl=10:0&p=cp:159.15494309189535e-12,ls:31.83098861837907e-9,cp:95.49296585513721e-12`

---

## E15. Matching with E24 values: what rounding costs

**Id:** `e24-values` · **Link:** `v=1&z0=50&f0=100e6&zl=25:0&p=ls:39.78873577297384e-9,cp:31.83098861837907e-12`
(E6's first solution, exact)

**Intro.** Exact values are not on the shelf. Round E6's match to E24 parts and see what it costs.

**Steps.**
1. *Do:* Set the L to 39 nH, the nearest E24 value. *Done:* `kinds ls,cp`; `part 1: L = 39 nH (±0.1 %)`. *Hint:* type
   it, or drag with Snap on: Snap uses each kind's list, E24 by default. *Topic:* `realisable-values`.
2. *Do:* Set the C to 33 pF. *Done:* `part 1: L = 39 nH (±0.1 %)`; `part 2: C = 33 pF (±0.1 %)`. *Hint:* 31.83 pF
   lies between 30 and 33 pF. *Topic:* `realisable-values`.
3. *Do:* Read |Γ| at the input. *Done:* `answer: |Γ| = 0.0208 (±0.001)`. *Hint:* the Solve panel's variants list the
   same pairs. *Topic:* `how-good-is-a-match`.
4. *Do:* Try the far pair, 43 nH and 30 pF, and read |Γ|. *Done:* `part 1: L = 43 nH (±0.1 %)`; `part 2: C = 30 pF
   (±0.1 %)`; `answer: |Γ| = 0.0492 (±0.001)`. *Hint:* both values now err the other way. *Topic:*
   `realisable-values`.

**Answers.** The E24 neighbours are 39 and 43 nH, 30 and 33 pF ⟨220⟩. 39 nH is 2.0 % low and 33 pF 3.7 % high. The
four pairs give ⟨221⟩:

| L | C | \|Γ\| | Return loss |
|---|---|---|---|
| 39 nH | 33 pF | 0.0208 | 33.6 dB |
| 39 nH | 30 pF | 0.0300 | 30.4 dB |
| 43 nH | 33 pF | 0.0453 | 26.9 dB |
| 43 nH | 30 pF | 0.0492 | 26.2 dB |

All four keep |Γ| ≤ 0.05 at f0: here rounding costs little. The Solve panel lists them nearest first ⟨222⟩.

**Solutions.** `v=1&z0=50&f0=100e6&zl=25:0&p=ls:39e-9,cp:33e-12` (step 3),
`v=1&z0=50&f0=100e6&zl=25:0&p=ls:43e-9,cp:30e-12` (step 4)

---

## E16. A sub-GHz load: 20 − j35 Ω at 868 MHz

**Id:** `sub-ghz-load` · **Link:** `v=1&z0=50&f0=868e6&zl=20:-35&p=` (Z0 50 Ω, f0 868 MHz, load 20 − j35 Ω, no parts)

**Intro.** A made-up load, low in resistance and capacitive, at a sub-GHz frequency (an example, not a measured
antenna). Match it with two parts the solver finds, then round to E24.

**Steps.**
1. *Do:* Read |Γ| of the load. *Done:* `answer: |Γ| = 0.589 (±0.005)`. *Hint:* z = 0.4 − j0.7. *Topic:*
   `how-good-is-a-match`.
2. *Do:* Add a series L and then a shunt C at the source end, mark both "Solve for" and apply the solution with these
   kinds. *Done:* `kinds ls,cp`; `in ≈ centre (±0.02)`. *Hint:* the r = 0.4 circle meets g = 1 at x = ±0.49; from
   −0.7 the L adds 0.7 + 0.49 = 1.19. *Topic:* `two-one-or-none`.
3. *Do:* Round to E24: 11 nH and 4.3 pF. *Done:* `part 1: L = 11 nH (±0.1 %)`; `part 2: C = 4.3 pF (±0.1 %)`.
   *Hint:* the variants under the solution. *Topic:* `realisable-values`.
4. *Do:* Read |Γ| at the input. *Done:* `answer: |Γ| = 0.0267 (±0.001)`. *Hint:* then try 10 nH, the other
   neighbour. *Topic:* `realisable-values`.

**Answers.** z = 0.4 − j0.7: |Γ| = 0.589, VSWR 3.87, return loss 4.60 dB, mismatch loss 1.85 dB. Its y = 0.615 +
j1.077, so r and g are both below 1 and either order of an L-match works ⟨223⟩. With the series part at the load,
x′ = ±√(r − r²) = ±0.49: the L adds 1.19 or 0.21. The solutions are a series L of 10.91 nH with a shunt C of 4.491 pF,
and a series L of 1.926 nH with a shunt L of 7.486 nH ⟨224⟩. Rounded to E24, 11 nH with 4.3 pF gives |Γ| = 0.0267
(31.5 dB) and with 4.7 pF 0.0337 (29.5 dB); 10 nH gives 0.127 with 4.3 pF and 0.123 with 4.7 pF (17.9, 18.2 dB): 8 % off in the L costs far
more than 1 % ⟨225⟩.

**Solutions.** `v=1&z0=50&f0=868e6&zl=20:-35&p=ls:10.90887904883032e-9,cp:4.491341020931314e-12` (step 2),
`v=1&z0=50&f0=868e6&zl=20:-35&p=ls:11e-9,cp:4.3e-12` (step 3)
