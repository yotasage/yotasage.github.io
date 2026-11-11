# Smith chart – find the missing value

The solver (built in M4). Part of [plan.md](plan.md); decision D7 there; the geometry it rests on is
[engine.md §3](engine.md#3-the-geometry-every-v1-locus-is-a-circle).

The owner's request: some values are known and one or two are not; the tool finds them.

## Setting it up

Every parameter has a state: *fixed* or *solve for this* (at most two at a time). The *goal* says what must hold at
the input, or at a chosen node for an intermediate step: reach a target z (default the centre), land on a circle
(|Γ| or VSWR, return loss, g = 1, r = 1), or zero reactance (resonance). An unknown part may be "a series reactance"
or "a shunt susceptance": the sign of the answer then says whether it is an L or a C.

## Counting

A point target is two real conditions; a circle goal is one.

| Unknowns | Point target | Circle goal |
|---|---|---|
| One | Exact only by chance. The tool says so plainly, gives the **best** value and the \|Γ\| it reaches, and suggests freeing a second parameter. That message is itself teaching. | 0, 1 or 2 values (the locus crosses the goal circle). For an inequality goal (VSWR ≤ 1.5) the **range** of values that keeps it ("any C from 3.1 to 4.7 pF"). |
| Two | 0, 1 or 2 solutions (per period of a length), or infinitely many when the two circles coincide: "these two parts do the same job" (for example two series reactances in a row). | **A family**: for each value of the first unknown in a range, 0 to 2 values of the second. Shown as a slider along the family (with its range), or the tool asks to fix one. |

## Method: intersect two circles

Unknowns in parts a and b, a nearer the load. The parts before a are fixed, so the node before a is known.

1. **Forward:** as a's value changes, the node after a moves on a circle A (its locus, engine.md §2). The fixed parts
   between a and b map A to another circle A′ (a Möbius map M).
2. **Backward:** the fixed parts after b map back the target T to T′ = N⁻¹(T). Part b can carry a node P to T′ only
   if P lies on b's locus through T′ run backwards: for a series reactance the constant-r circle through T′, a shunt
   susceptance or a stub the constant-g circle, a series R the constant-x circle, a shunt R the constant-b circle, a
   line its circle of constant |Γ| about Zc. Call it B.
3. **Solutions:** A′ ∩ B: 0, 1 (tangent) or 2 points, or the whole circle (coincident). For each point P: b's value
   from P → T′, a's value from M⁻¹(P) on A.
4. **Realisable:** keep a value in the part's reachable range (L, C, R never negative); a value of the wrong sign is
   offered as the other kind of part (a negative capacitance at this frequency is a positive inductance), marked "true
   at this frequency only". Lengths: the shortest positive one, with a note that adding λ/2 gives the same match at f0
   and a narrower band.

A circle goal with one unknown is the same with T replaced by the goal circle carried back by N⁻¹: locus ∩ circle.
The best value for one unknown and a point target: minimise |Γ| at the goal node over the locus, a deterministic
bracketed one-dimensional search over the angle on the circle (or a closed form if M0.2 finds one).

**On the chart:** the two circles A′ and B are drawn, and their crossings are the solutions. This is the textbook
Smith chart construction; it is also the explanation of the answer and of why there are two, one or none.

**Fallback numerical search** only for unknowns whose locus is not a circle (a line's Zc at a general length, f0, and
later lossy parts BL42 and band goals BL44): a grid over the reachable range with each unknown mapped to a bounded
variable (for example the angle on the chart, so 0 to ∞ is covered evenly), refinement with a bracketing or Newton
step, several starts, duplicates merged. Results are ordered the same way every time.

## What comes back

All solutions, each with the values, the residual |Γ|, the realisable flag, the nearest standard value (engine.md
§7) with the |Γ| it actually gives, a preview path on the chart (on hover, and on tap on a phone), and "Apply". Ordered:
realisable first, then fewer parts changed, then the smaller total change, then by value.

**When nothing is marked:** "Suggestions": for each free part the single change that reaches the goal, then pairs,
ranked by the smallest change. The page pattern is the resistor tool's design-mode suggestions
(`components/Resistor/DesignSection.tsx`).

## Validation (M4.2)

- Closed-form cases from `facts.md` (L-match, single stub, λ/4 transformer) to a residual below 1e-9.
- Brute force over a fine grid on 200 or more random problems of each kind: no solution the solver missed, no
  solution that is not one.
- Each solution re-evaluated by the engine's independent second computation (engine.md §4).
- Optionally an AC check against ngspice where the owner's PC has it (skipped otherwise).

**Not in v1:** three or more unknowns and band optimisation (BL44), the L-match and stub wizards (BL38, BL39).
