# EM simulation – the short lines beside the controls (step M2.4a)

One line beside every control and readout of the page as it is after M2.3b, for step M2.4b to place (as the Smith
chart's `whys.ts`). Part of [theory.md](theory.md). Columns: **Where** names the control by its `data-` attribute or
label (docs/em-sim/modules-page.md); **Line** is the text (at most about 20 words); **→** is the topic or sub-anchor it
links to; **Claim** is its number in [claims.md](claims.md) when it states a fact (numbers from theory.md and
theory-2.md where the line repeats one; ⟨127⟩ on are the lines' own). A line without a claim describes what the control
does (claims.md lists those as T in one row).

## The bar and the page

| Where | Line | → | Claim |
|---|---|---|---|
| Home (`aria-label="Home"`) | Back to all the tools on this site. | – | – |
| Sections nav | Jump to Stackup, Trace or Theory. | – | – |
| Undo / Redo (`data-undo`, `data-redo`) | Step back or forward through every change; Ctrl+Z and Ctrl+Shift+Z too. | `how-to-use` | 11 |
| Theme (`data-theme-toggle`) | Light or dark; the page remembers your choice on this device. | – | 127 |
| Status line | What the page does so far and what comes next. | `how-to-use` | – |
| Units (`aria-label="Units"`) | Show lengths in mm, mil or µm; what you type is kept exactly. | – | 128 |
| Significant digits | Digits for typed values and lengths; results follow their own error instead. | `field-solver` | 44, 45 |
| Copy link (`data-copy-link`) | The address holds the whole setup: share it and others see the same. | `how-to-use` | 11 |
| The link's issues | What the link held that the page could not read, and what it used instead. | – | – |

## Stackup

| Where | Line | → | Claim |
|---|---|---|---|
| Preset (`data-preset`) | A fab's stackup with its layers, thicknesses, εr and mask, each value with its source. | `how-to-use` | 3, 4 |
| KiCad file (`data-kicad-input`) | Open a .kicad_pcb for its stackup or a .kicad_pro for its net classes; nothing leaves your device. | `how-to-use` | 3, 129 |
| All JLCPCB stackups (`data-jlc-open`) | Every stackup JLCPCB offers, filtered by layers, thickness and copper. | `how-to-use` | 130 |
| Picker filters (`data-jlc-filter`) | Narrow the list; each menu offers only what the others leave. | – | – |
| Show withdrawn (`data-jlc-withdrawn`) | Include stackups JLCPCB marks as withdrawn. | – | 130 |
| Picker row (`data-jlc-key`) | Use this stackup; its pressed thickness shows in orange when off the nominal. | – | 130 |
| Summary (`data-stackup-summary`) | Layers, copper and total thickness; "edited" once a value differs from the preset. | – | – |
| Stackup drawing | The board to scale, top up; widen to see the thin layers. | `structures` | – |
| Widen (stackup drawing) | Gives every thin layer room to read; then the drawing is not to scale. | – | – |
| Mask: on laminate | Mask thickness away from copper; it fills the gap between traces of a pair. | `solder-mask` | 73, 75 |
| Mask: over copper | Mask thickness on the trace's top and sides. | `solder-mask` | 73 |
| Mask: between traces | Mask thickness in the gap of a pair. | `solder-mask` | – |
| Mask: εr | The mask's permittivity; it lowers Z0 by raising εeff. | `solder-mask` | 74 |
| εr (dielectric) | The laminate's permittivity; on the default microstrip 0.3 more lowers Z0 by about 1.5 Ω. | `tolerances` | 131 |
| tanδ | Loss of the material; kept for later, not used by the impedance. | `transmission-lines` | 27 |
| εr frequency | The frequency the fab states εr at; the impedance uses εr as given, at any frequency. | `transmission-lines` | 27 |
| Thickness (dielectric) | Pressed thickness between copper layers; the largest single input for an outer microstrip. | `tolerances` | 118, 120 |
| Thickness (copper) | Finished copper; side walls add capacitance, most in a pair. | `copper-thickness` | 82, 84 |
| Calculator thickness (note) | The copper thickness the fab's own calculator uses, shown for comparison. | `jlcpcb-calculator` | 99 |
| Etch (note) | The top of the trace is narrower than its base by this much; widths are at the base. | `trapezoid` | 70, 71 |
| Tolerance field (`Tolerance of …`) | ± in the same unit, or %; the Tolerance tool uses it instead of a placeholder. | `tolerances` | 116 |
| Source tag | Where the value comes from: a fab's page, KiCad, or typed by you. | – | 4 |
| Sources | Every reference the stackup's values cite, with the date read. | – | – |
| KiCad board format / ignored tokens | What KiCad version wrote the file and what the page did not use. | – | – |
| Net class cards | The project's track widths, clearances and pair sizes, usable as structures in Trace. | `how-to-use` | – |
| Stackup issues | Values that cannot be solved as they are, with the reason. | – | – |

## Trace: structure and fields

| Where | Line | → | Claim |
|---|---|---|---|
| Structure (`data-trace-kind`) | Microstrip on an outer layer, stripline between planes, pairs, coplanar grounds, or a free arrangement. | `structures` | 67 |
| Edit as general (`data-trace-to-general`) | The same structure as traces and grounds you can add to; the values stay the same. | `how-to-use` | 6 |
| Net class buttons (`data-class-structure`) | A KiCad net class's track or pair as the structure. | `how-to-use` | – |
| Signal layer (`data-trace-layer`) | The copper layer the trace is on; planes move to its neighbours. | `structures` | – |
| Signal layer 2 (`data-trace-layer2`) | The second trace's layer of a broadside pair. | `pairs` | – |
| Plane above / below (`data-trace-plane`) | The reference copper; the field and the return current run there. | `transmission-lines` | 12 |
| Width / Width (each) (`trace.w`) | Base width of the trace; Z0 falls as it widens. | `trapezoid` | 71, 118 |
| Gap (`trace.s`) | Edge-to-edge gap of a pair; a smaller gap lowers Zdiff and raises coupling. | `pair-definitions` | 51 |
| Offset across (`trace.s`, broadside) | Sideways offset between the two traces of a broadside pair. | `pairs` | – |
| Gap to ground (`trace.g`) | Gap to the coplanar ground; under a few laminate thicknesses it lowers Z0. | `coplanar-ground` | 80, 81 |
| Ground width (`trace.gw`) | Width of each coplanar ground; empty runs it to the edge. | `coplanar-ground` | – |
| Solder mask over the trace (`data-trace-masked`) | Off for a trace left bare; the mask lowers Z0 by a few ohms. | `solder-mask` | 75 |
| General: layer for new features (`data-gen-layer`) | The copper layer that Add trace and Add ground use. | – | – |
| Add trace / Add ground (`data-gen-add`) | Adds one in the free place nearest the centre; up to eight traces. | `how-to-use` | 6 |
| Remove (`data-gen-remove`) | Removes the selected trace or ground. | – | – |
| Position (centre) (`gen.sig.<i>.u`) | Where the trace's centre is, across the board. | – | – |
| Left / right edge (`gen.gnd.<i>.a`, `.b`) | The ground's edges; empty runs it to that edge of the board. | `coplanar-ground` | – |
| Trace drawing (`data-trace-view`) | The cross-section the solver sees; drag, pinch or wheel to move and zoom. | `field-solver` | 30 |
| Handles (`data-handle`) | Drag or use the arrow keys to change a size; one undo step per drag. | `field-solver` | 46 |
| Reset view (`data-trace-reset`) | Shows the whole cross-section again. | – | – |
| Widen thin layers (`data-trace-widen`) | Stretches thin layers to see them; not to scale while on. | – | – |
| Show the fields (`data-field-on`) | Draws the field of the solved structure behind the copper. | `transmission-lines` | 9 |
| Quantity (`data-field-qty`) | Potential, electric or magnetic field, or the charge and current on the copper. | `transmission-lines` | 9 |
| Drive (`data-field-drive`) | Odd or differential, even or common, or one line driven. | `pairs` | 48 |
| Driven line (`data-field-line`) | The one trace at 1 V; the others at 0 V. | `coupling` | – |
| Colour scale (`data-field-scale-kind`) | Logarithmic shows the weak field far from the copper too. | – | – |
| Probe keys (`data-field-probe-mode`) | When on, the arrow keys move the probe instead of the view. | – | – |
| Field scale bar (`data-field-scale`) | The quantity, its unit, range and the drive shown. | – | – |
| Probe readout (`data-field-probe`) | Position, material, potential and E at the probe. | – | – |

## Trace: results

| Where | Line | → | Claim |
|---|---|---|---|
| Z0 (`z0`) | Voltage over current of a wave on this line; √(L/C). | `transmission-lines` | 14 |
| εeff (`eeff`) | The uniform permittivity that would give the same speed: C with dielectrics over C in air. | `transmission-lines` | 19 |
| Delay (`delay`) | Time per length, √(LC); in ps/mm, or ps/in when lengths are in mil. | `transmission-lines` | 15 |
| ± and the error | The solver's error from refining the panels; digits never finer than it. | `field-solver` | 37, 44 |
| Status (regular / irregular) | Whether the solver's levels shrank steadily; irregular is a cautious error, not a wrong value. | `field-solver` | 40, 41 |
| Coarse while dragging (`data-quick`) | A quick value while you drag; the full value and its error follow when you stop. | `field-solver` | 46 |
| Zdiff (`zdiff`) | Impedance between the two traces of the pair; twice Zodd when symmetric. | `pair-definitions` | 50, 54 |
| Zcm (`zcm`) | Both traces together against the planes; half of Zeven when symmetric. | `pair-definitions` | 50, 54 |
| Zodd (`zodd`) | One trace's impedance with the pair driven opposite; Zdiff / 2. | `pair-definitions` | 49 |
| Zeven (`zeven`) | One trace's impedance with both driven alike; 2 · Zcm. | `pair-definitions` | 49 |
| Zdc (`zdc`) | How much differential signal turns into common mode on an unequal pair. | `pair-definitions` | 56 |
| Modes' εeff and delay | Each mode's own speed; on a microstrip pair the odd mode is faster. | `two-speeds` | 63, 64 |
| Zdiff (B), Zcm (B) (`zdiffB`, `zcmB`) | The same for a pure differential voltage drive; equal to Zdiff when symmetric. | `pair-definitions` | 57 |
| Z_TDR (`ztdr`) | What a differential TDR with 50 Ω ports reads. | `pair-definitions` | 57 |
| NEXT kb (`kb`) | Height of the near-end copy on the neighbour, as a share of the signal. | `coupling` | 58, 59 |
| FEXT kf (`kf`) | Far-end copy per length and edge slope; negative over a microstrip pair. | `coupling` | 58, 60 |
| Zc_kk of each line | Each trace's impedance while the other carries no current: the diagonal of Zc. | `pair-definitions` | 132 |
| Z0 and εeff of each line (`z0.k`, `eeff.k`) | Each trace's Zc_kk and its C over C in air, for three or more traces. | `pair-definitions` | 132 |
| Flags | Notes from the solver: unresolved modes, a single level, irregular refinement. | `field-solver` | 66 |
| Matrices C, L, Zc (`data-matrices`) | Per-length capacitance, inductance and impedance matrices that every result comes from. | `field-solver` | 33 |
| About this structure | Why a structure cannot be solved as set, or what to watch. | – | – |

## Trace: tools

| Where | Line | → | Claim |
|---|---|---|---|
| Tools bar (`data-tool-tab`) | Target, Sweep, Tolerance and Calculators; press again to close. | `how-to-use` | 10 |
| Target: quantity (`data-target-key`) | Z0, Zdiff or Zcm to reach. | `pair-definitions` | – |
| Target: solve for (`data-target-vary`) | Width, gap, or both at a fixed ratio. | – | – |
| Target value (`data-target-input`) | The impedance you want, in Ω. | – | – |
| Target result (`data-target-result`) | The width found, ± what the solver's error allows. | `field-solver` | 133 |
| Use this width (`data-target-use`) | Puts the shown width in the setup, as one step you can undo. | – | – |
| Sweep input (`data-sweep-input`) | Any width, gap, thickness, εr or mask value to vary. | `tolerances` | – |
| From / To / Points | The range and how many solves, 3 to 200. | – | – |
| Sweep outputs (Plot) | Which results get a plot. | – | – |
| Sweep plot (`data-plot`) | Each point as it arrives; the band is the solver's error, dashed the current value. | `field-solver` | – |
| Plot cursor (`data-plot-box`) | Point, tap or use arrows to read values; Shift moves ten. | – | – |
| Sweep table (`data-sweep-table`) | The same points as numbers. | – | – |
| Cancel | Stops the sweep or Monte Carlo; points so far stay. | – | – |
| Placeholder note (`data-tol-note`) | Tolerances not typed are placeholders: ±10 %, εr ±0.2, mask ±30 %. | `tolerances` | 116 |
| Worst case (corners) (`data-tol-corners`) | Every input at the end that moves Z the same way: safe, pessimistic. | `tolerances` | 121, 122 |
| Monte Carlo (`data-mc-run`) | 1000 boards with random inputs from a fixed seed; repeats exactly. | `tolerances` | 123 |
| Median, 95 %, 99.73 %, standard deviation | Where the middle, 95 % and nearly all boards fall. | `tolerances` | 124 |
| What moves (`data-rank-id`) | Each input alone at its tolerance, ranked; the share is its change squared. | `tolerances` | 117, 119 |
| Calculators: field value (`data-calc-row="field"`) | This page's value, the same as under the drawing. | `field-solver` | – |
| As JLCPCB's calculator (`data-calc-row="jlc"`) | The same trace with the inputs JLCPCB's calculator sends to Si9000. | `jlcpcb-calculator` | 98, 99 |
| JLCPCB's stated number (`data-calc-stated`) | What JLCPCB's calculator states for this case, and Si9000's value there. | `jlcpcb-calculator` | 102 |
| Use JLCPCB's calculator inputs (`data-calc-use`) | Puts the calculator's inputs in the stackup, as one step you can undo. | `jlcpcb-calculator` | 101 |
| One at a time (`data-calc-part`) | Each input's share of the difference to JLCPCB's calculator. | `jlcpcb-calculator` | 105 |
| Reduction (`data-calc-reduced`) | The single width, height and εr the formulas are given. | `closed-forms` | 92 |
| Formula card (`data-cf`) | A closed formula's value, its range and stated accuracy, and what it leaves out. | `closed-forms` | 88–91, 93 |
| Kirschning–Jansen note (`data-calc-kj`) | Zero-thickness strips: thick copper lowers Zdiff by many ohms. | `copper-thickness` | 84, 90 |
| Neglect sentences | Why the formulas sit above a masked or thick trace. | `closed-forms` | 77, 93 |
| No formula (`data-calc-none`) | No closed formula covers this structure; the field value stands alone. | `closed-forms` | – |
