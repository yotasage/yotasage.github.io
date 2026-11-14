# Smith chart – the short lines (theory.md §8)

Part of [theory.md](theory.md), split off for size in M8.3b; it keeps the number §8, which whys.ts, claims.md and the
notes name. The lines are `components/Smith/whys.ts` (checked by `scripts/harness/smith/ui-why.mjs`).

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
| Show equation (`show-eq`, M5.2; at the readout's title, for the "=" beside every readout row, the circuit input, node rows and the part card) | The = beside a number shows its equation, with your values put in. | `how-to-use` |
| Equations panel (`math`, M5.2) | Point at or tap a variable: its part, node or readout row lights up. | `how-to-use` |
| Derive (`derive`, M5.3; in the Equations panel, beside the hint on Derive) | Derive shows how an equation follows, one reasoned step at a time. | `how-to-use` |
| Explain (`explain`, M5.4; on the part card, beside Explain) | Says which equation moved the point, along which circle and which way. | `moving-on-the-chart` |
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
| Learn section (`learn`, M6.3a) | Worked examples: load one and follow its steps; any route counts. | `how-to-use` |
| An example in the list (`learn-example`) | Loads its circuit as one step; Undo brings yours back. | `how-to-use` |
| Guide panel (`guide`) | What to do now; it ticks when your circuit gets there. | `how-to-use` |
| Guide: the answer field (`guide-answer`) | Type the number you read; it is checked within its tolerance. | the step's topic |
| Guide: Hint (`guide-hint`) | One nudge for this step; "→ theory" says why. | the step's topic |
| Challenge kinds (`challenge`, M6.3b) | A new problem of this kind; the same link is the same problem. | `two-one-or-none` |
| Check (`challenge-check`) | Reached when the goal holds at f0 with the allowed parts only. | `how-good-is-a-match` |
| Hint ladder (`challenge-hint`) | Each press tells more: the circle, the part, a value, then all. | `two-one-or-none` |
| Reveal (`challenge-reveal`) | Shows the solver's answers with Apply; counted as revealed, not solved. | `two-one-or-none` |
| Progress (`challenge-progress`) | Solved per kind, hints used, fewest parts: kept in this browser only. | `how-to-use` |
| Make a lesson link (`lesson`) | Writes a link with your circuit, locks, hidden panels and text. | `how-to-use` |
| Locks (`lesson-lock`) | Locked values can't be changed on the page, but the link can be edited. | `how-to-use` |
| Hide (`lesson-hide`) | Hides these panels for whoever opens the link. | `how-to-use` |
| Text (`lesson-text`) | Up to 500 characters, shown as plain text above the guide. | `how-to-use` |
| Lesson box (`lesson-box`) | Set by the lesson's link; Leave the lesson unlocks everything. | `how-to-use` |
| Sweep panel (`sweep`, M7.2a) | Reactances and line lengths change with f; the trace shows the input then. | `reading-a-trace` |
| Show the trace (`sweep-trace`) | Γ at the input across the band: nearer the centre, a better match. | `reading-a-trace` |
| Start and Stop (`sweep-band`) | The frequencies swept, in Hz; f0 need not lie inside them. | `reading-a-trace` |
| Points (`sweep-points`) | Even steps across the band; more are added where the trace bends. | `reading-a-trace` |
| Spacing (`sweep-log`) | Log gives each decade the same number of points, for wide bands. | `reading-a-trace` |
| Markers (`sweep-marker`) | Marks the input's point at one frequency and follows the circuit. | `reading-a-trace` |
| Sweep plot (`sweep-plot`, M7.2b) | The trace against frequency: a dip is a better match, a peak a worse. | `reading-a-trace` |
| Return loss or VSWR (`sweep-plot-kind`) | Two scales of \|Γ\|: return loss falls and VSWR rises as the match worsens. | `how-good-is-a-match` |
| Limit (`sweep-limit`) | The return loss to beat; where \|Γ\| stays below it is shaded and measured. | `reading-a-trace` |
| Band figures (`sweep-figures`) | Found on the refined trace, edges and extremes polished between its points. | `q-and-bandwidth` |
| Loaded Q (`sweep-q`) | f over the width where the power delivered is over half its peak, near f0. | `q-and-bandwidth` |
| Marker table (`sweep-table`) | Each marker's input point at its frequency, in the digits you chose. | `reading-a-trace` |
| Report (`report`) | The circuit and its figures at f0 and across the band, to print or keep. | `how-to-use` |
| The report's link (`report-link`) | Opens this circuit, band, markers and limit again, as printed here. | `how-to-use` |
| Export (`export`, M8.3a) | The chart as a figure, its data and the project, made on this device. | `how-to-use` |
| What is shown (`export-area`) | The whole chart, or the window the chart shows now, zoom included. | `how-to-use` |
| Width (`export-size`) | The width on paper; grid lines thin out so they stay apart. | `how-to-use` |
| Detail (`export-detail`) | What is drawn: a preset, or each item on its own. | `how-to-use` |
| Colour mode (`export-colour`) | Greyscale and black and white tell lines apart by dashes and marks. | `how-to-use` |
| Preview (`export-preview`) | At its size in CSS millimetres, text at its point size. | `how-to-use` |
| TikZ (`export-tikz`) | Plain TikZ: paste the picture, or compile the standalone document. | `how-to-use` |
| SVG and PNG (`export-image`) | SVG keeps the vectors; PNG is pixels at 96 dpi times the scale. | `how-to-use` |
| CSV files (`export-data`, M8.3b) | Tables for a spreadsheet; every digit may exceed what Excel keeps (15). | `how-to-use` |
| The .s1p file (`export-s1p`) | Touchstone S11 at the input over the sweep, for circuit simulators. | `how-to-use` |
| Project file (`export-project`) | Circuit, goal, sweep, value lists and these settings; opened here only. | `how-to-use` |
| The link (`export-link`) | The address holds the circuit, value lists and sweep; send it to share. | `how-to-use` |

Facts in the short lines repeat claims of the topics they link to (Series L: claims 48, 56; Line: 61, 84; stubs: 95,
97; λ/4: 89, 91; Z/Y/ZY: 38; VSWR: 101, 102; return loss: 104, 105; goal: 110, 14; the solver's lines: claims.md);
the checklist does not number them again.

