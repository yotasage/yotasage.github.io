# Smith chart – challenges, lesson links and the Learn section's short lines (step M6.1)

Part of [examples.md](examples.md) (split off for size); the design is
[learning.md §7](learning.md#7-teaching-content-m6). What M6.2 and M6.3b build from it: [notes-M6.1.md](notes-M6.1.md).
`⟨n⟩` marks claims of [claims.md](claims.md).

## 1. Challenges

A challenge is a kind and a seed, both in the link: `ch=<kind>.<seed>`, the seed a whole number from 0 to 2³² − 1
written in decimal (`ch=two.48213`). The same kind and seed give the same problem on every machine: the generator
draws from mulberry32 seeded with the seed, in the order this section lists, and nothing else (no clock, no
`Math.random`). A drawn problem that fails its kind's test is dropped and the next numbers of the same stream are
drawn, so the seed still fixes the problem. "New challenge" picks a seed from `crypto.getRandomValues` and writes it
in the link.

**Common to all kinds.** Z0 = 50 Ω. The problem is a circuit with no parts; the visitor builds. While a challenge
runs the Solve panel, the suggestions and the "Solve for" marks are hidden (learning.md §7). **Reached** (the Check
button, and after every change) when the visitor's circuit has only the allowed kinds, at most the allowed number of
parts, and the goal holds at f0 at the input (`suggest.ts goalHolds`); for `read`, when the typed answer is within its
tolerance. The start state is never reached: every kind draws loads with |Γ_L| above its goal ⟨226⟩. **Progress** is
kept in `localStorage` under `smith.challenges` only: per kind the number solved, revealed, the hints used and the
fewest parts that reached it.

### Kinds

| Kind (`ch=`) | Title on the page | Drawn (in this order) | Allowed parts | Goal | Test before it is offered |
|---|---|---|---|---|---|
| `two` | Two parts to the centre | f0 log-uniform 10 MHz – 3 GHz, rounded to 3 significant digits; R whole ohms 5–250; X whole ohms −150 – 150; again if \|Γ_L\| < 0.3 | series and shunt L and C, at most 2 | \|Γ_in\| ≤ 0.05 | `solve` with both parts free (L or C) in both orders: at least one realisable solution with every L in 0.1 nH – 10 µH and every C in 0.1 pF – 10 nF |
| `stub` | One stub | the stub kind (open or short, one draw < 0.5 is open); R 10–250, X −150 – 150 whole ohms; f0 100 MHz; again if \|Γ_L\| < 0.3 | lines and that stub, Zc = Z0, at most 2 | \|Γ_in\| ≤ 0.05 | `solve` of a line and the stub (lengths): a realisable solution |
| `qw` | A λ/4 transformer | complex or real (one draw < 0.5 is complex); real: R 10–500, X = 0, again if \|Γ_L\| < 0.2; complex: R 10–200, X −150 – 150, again if \|Γ_L\| < 0.3; f0 100 MHz | λ/4 (and, for a complex load, a line of Zc = Z0), at most 1 or 2 | \|Γ_in\| ≤ 0.05 | `solve` of Zt (and the line's length): a solution with Zt in 15–150 Ω |
| `e24` | Standard values only | as `two`, then the goal: one draw < 0.5 gives \|Γ\| ≤ 0.1, else \|Γ\| ≤ 0.2 | as `two`, every L and C an E24 value (values.ts `around(v, E24).exact`) | the drawn \|Γ_in\| goal | as `two`, and a `standardVariants` (E24) of one solution `meets` the goal with values in the same bounds |
| `read` | Read this point | r from {0.2, 0.5, 1, 2, 5}; x from {−5, −2, −1, −0.5, −0.2, 0, 0.2, 0.5, 1, 2, 5}; the question from {z, y, \|Γ\|, VSWR, RL}; again if \|Γ\| > 0.9 or z = 1; the load is Z0·z at f0 100 MHz | none (the circuit is locked) | the typed answer | none needed; the point lies on grid circles of the default grid |

Tolerances of `read`: z or y, typed as two numbers, is reached when the Γ of the typed value is within 0.02 of the
point's; |Γ| within 0.01; VSWR within 3 %; return loss within 0.3 dB. While `read` runs, the readout, the node table,
the equation panel and the cursor readout are hidden too (they would print the answer); the grid and its labels stay.

**Sample (M6.1, scratch script).** 1,000 seeds per kind (0–999) drawn as above and tested with the engine: every seed
gave a problem, in 1.05 draws on average for `two` (at most 3), 1.04 for `stub` (3), 1.16 for `qw` (4; 513 complex,
487 real), 1.05 for `e24` (3) and 1.22 for `read` (4; the five questions 174–228 times each). `two` had 2.28
realisable solutions per problem on average, `stub` 2.00, `qw` 1.50; `e24` had 7.8 E24 variants meeting the goal per
problem. Worst residual below 1e-14; the same seed gave the same problem; the first solution's circles were finite in all
200 `two` problems checked; at most 0.05 ms per problem. Every passive load with R > 0 has an L-match in at least one
order (a load with r ≤ 1 reaches g = 1 with a series part, one with r ≥ 1 has g ≤ 1 and reaches r = 1 with a shunt
part), and every |Γ| circle with 0 < |Γ| < 1 crosses g = 1 twice, so `two` and `stub` drop draws only for their bounds
⟨227⟩.

### Hint ladder

One step per press of "Hint"; each step stays shown. The ladder follows the solver's construction (solver.md
"Method", notes-M4.1a.md): the unknowns are the parts, a nearer the load, b nearer the source; B is the circle b's
locus draws backwards from the target (for b a shunt part the g = 1 circle through the centre, for a series part
r = 1, for a stub g = 1, for a λ/4 its locus through the centre), drawn from `SolveResult.circles` at `circleNode`.
The template is the visitor's own parts when they are two of the allowed kinds (in their order), else the order of
the solver's first realisable solution.

| Kind | 1. The circle | 2. The part and its way | 3. The first value | 4. Reveal |
|---|---|---|---|---|
| `two`, `e24` | B drawn: "Your first part must bring the point onto this circle (g = 1 / r = 1); the second runs along it to the centre." | The first part's kind and sense from theory.md §4: "A series L: clockwise up the r = 0.4 circle." | The first value to two significant digits: "about 11 nH" (`e24`: "about 11 nH; the E24 values beside it are 10 and 11 nH") | The solver's solutions with Apply (`e24`: with their E24 variants, those that meet the goal marked) |
| `stub` | g = 1 and the load's \|Γ\| circle drawn: "The line turns the point on this circle until it meets g = 1." | "A line of Z0, clockwise to the first crossing; the stub then cancels b." | The line's length to two digits: "about 0.15 λ" | The solver's two solutions |
| `qw` real | Zt's locus at node 1 drawn: "As Zt changes, the input moves on this circle through the centre." | "Zt lies between Z0 and the load's R." | Zt to two digits: "about 71 Ω" | The solution |
| `qw` complex | The load's \|Γ\| circle and the axis: "A line first turns the point to the axis, where the load is real." | "A line, clockwise to either crossing of the axis." | The line's length to two digits | The two solutions |
| `read` | The circle(s) through the point drawn: r and x (z), g and b (y), the \|Γ\| circle (\|Γ\|, VSWR, RL) | The rule: "read r and x where their circles' labels are"; \|Γ\| is the distance from the centre; VSWR is r where the \|Γ\| circle crosses the right half of the axis; RL = −20 log₁₀\|Γ\| | The answer to one significant digit | The answer, with the equation that gives it |

A revealed challenge is counted as revealed, not solved; Apply after a reveal is one undo step and is not checked as
reached. Hints 1–3 never change the circuit. The circles of hint 1 are drawn as the Solve panel draws its two
circles (solveLayer.ts) ⟨228⟩.

## 2. Lesson links

The circuit's link plus a lesson part, written by "Make a lesson link" and read with the circuit (learning.md §7).
Three new parameters, each optional; `v` stays 1, since a link without them reads as before. `ch` (above) may be part
of a lesson too.

| Param | Form | Means |
|---|---|---|
| `lk` | comma list of `z0`, `f0`, `zl`, `parts`, `k<n>`, `v<n>` (n the part from the load, 1-based as `u`) | Locks: Z0, f0, the load (R and X), the parts' list (no add, remove or move), part n's kind (it cannot be removed, moved or changed to another kind), part n's value (and Zc; its fields read only, its handle not draggable, not "Solve for") |
| `hd` | comma list of `solve`, `suggest`, `reveal` | Hidden: the Solve panel (and its marks), the suggestions, a challenge's reveal (hints 1–3 stay) |
| `tx` | text, URL-encoded by `URLSearchParams` | The teacher's instructions: at most 500 characters (code points), shown above the guide as plain text (`textContent`, line breaks kept, no links, never HTML); longer text is cut at 500 with an issue |

Reading never throws, as the circuit's: an unknown lock or panel, a `k<n>` or `v<n>` beyond the parts, or a repeat is
left out with an issue in the list above the parameters. With a lesson part the page shows a "Lesson" box: the text,
what is locked, and "Leave the lesson" (drops the lesson part from the link and unlocks; one undo step). A locked
value cannot change through any path: every new circuit goes through `commit`, which keeps the locked parameters
of the lesson's circuit (so undo, Start over, Apply, keys and drags all respect it); Start over in a lesson brings back
the lesson's circuit. The maker panel says plainly that a lock is a teaching aid, not security: anyone can edit the
link ⟨229⟩.

**Example.** `v=1&z0=50&f0=100e6&zl=25:0&p=ls:39e-9,cp:30e-12&lk=z0,f0,zl,parts,k1,k2&hd=solve,suggest&tx=Change%20only%20the%20values%20until%20%7C%CE%93%7C%20%E2%89%A4%200.025.`:
one of E15's pairs to retune, the kinds fixed, the solver hidden, the text "Change only the values until |Γ| ≤ 0.025."
(the start pair gives 0.0300; 39 nH with 33 pF reaches 0.0208, E15).

## 3. Short lines of the new controls

In theory.md §8's form: at most about 12 words, then "→ theory" opening the topic. Keys for `whys.ts` in brackets.

| Control or readout | Short line | Topic |
|---|---|---|
| Learn section (`learn`) | Worked examples: load one and follow its steps; any route counts. | `how-to-use` |
| An example in the list (`learn-example`) | Loads its circuit as one step; Undo brings yours back. | `how-to-use` |
| Guide panel (`guide`) | What to do now; it ticks when your circuit gets there. | `how-to-use` |
| Guide: the answer field (`guide-answer`) | Type the number you read; it is checked within its tolerance. | the step's topic |
| Guide: Hint (`guide-hint`) | One nudge for this step; "→ theory" says why. | the step's topic |
| Challenge kinds (`challenge`) | A new problem of this kind; the same link is the same problem. | `two-one-or-none` |
| Check (`challenge-check`) | Reached when the goal holds at f0 with the allowed parts only. | `how-good-is-a-match` |
| Hint ladder (`challenge-hint`) | Each press tells more: the circle, the part, a value, then all. | `two-one-or-none` |
| Reveal (`challenge-reveal`) | Shows the solver's answers with Apply; counted as revealed, not solved. | `two-one-or-none` |
| Progress (`challenge-progress`) | Solved per kind, hints used, fewest parts: kept in this browser only. | `how-to-use` |
| Make a lesson link (`lesson`) | Writes a link with your circuit, locks, hidden panels and text. | `how-to-use` |
| Locks (`lesson-lock`) | Locked values can't be changed on the page, but the link can be edited. | `how-to-use` |
| Hide (`lesson-hide`) | Hides these panels for whoever opens the link. | `how-to-use` |
| Text (`lesson-text`) | Up to 500 characters, shown as plain text above the guide. | `how-to-use` |
| Lesson box (`lesson-box`) | Set by the lesson's link; Leave the lesson unlocks everything. | `how-to-use` |

Every short line describes the tool (claims.md, the short-lines table: T) except `challenge-check` (D: goalHolds and
the goal, 226) and `challenge-hint` (T 228).
