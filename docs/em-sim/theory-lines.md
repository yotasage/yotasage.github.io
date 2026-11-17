# EM simulation – the short lines beside the controls (step M2.4a)

One line beside every control and readout of the page as it is after M2.3b, for step M2.4b to place (as the Smith
chart's `whys.ts`). Part of [theory.md](theory.md). Columns: **Where** names the control by its `data-` attribute or
label (docs/em-sim/modules-page.md); **Line** is the text (at most about 20 words); **→** is the topic or sub-anchor it
links to; **Claim** is its number in [claims.md](claims.md) when it states a fact (numbers from theory.md and
theory-2.md where the line repeats one; ⟨127⟩ on are the lines' own). A line without a claim describes what the control
does (claims.md lists those as T in one row).

Placed in step M2.4d as `components/EmSim/whys.ts` (keys there; notes-M2.4d.md): "Reset view" reads "The corner button
shows the whole cross-section again.", and the bar's switch has its own line ("Show or hide the short lines like this one;
the page remembers your choice."). A new control gets its line here and in whys.ts.

## The bar and the page

| Where | Line | → | Claim |
|---|---|---|---|
| Home (`aria-label="Home"`) | Back to all the tools on this site. | – | – |
| Sections nav | Jump to Stackup, Trace, Via, Export, the worked Examples or Theory. | – | – |
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

## Via (step M3.1a)

Placed in `whys.ts` with the keys in brackets. Since M4.3b the links go to the via topics 7–13 (theory-vias.md). Lines without a claim describe what the control does.

| Where | Line | → | Claim |
|---|---|---|---|
| Single · Pair (`data-via-kind`, via-kind) | One via, or a differential pair whose second via sits one pitch away. | `via-line` | – |
| Presets (`data-via-preset`, via-preset) | A 0.6/0.3 via and an LVDS pair from real boards; each replaces the whole via. | – | – |
| Entry on the trace's layer (`data-via-use-trace`, via-use-trace) | Puts the via's entry on the Trace section's signal layer. | – | – |
| Barrel from, to (via-barrel) | Where the plated hole starts and ends: through, blind or buried. | – | – |
| Entry, exit (via-signal) | The layers the feed traces join; barrel beyond them is a stub. | `via-stubs` | – |
| Drill (via-drill) | The drilled hole; the model takes the barrel as solid copper of this diameter. | – | – |
| Plating (via-plating) | Copper on the hole's wall; the finished hole is the drill less twice this. | – | – |
| Pitch (via-pitch) | Centre to centre between the pair's two vias; closer couples them more. | `via-line` | – |
| Layers (`data-via-layers`, via-layer-table) | Each copper layer: its pad, and whether it is a plane the barrel passes. | `via-pads` | – |
| Pad (via-pad) | Copper ring around the barrel; empty means removed. Every pad adds capacitance. | `via-pads` | – |
| Plane (`data-via-plane`, via-plane) | A reference plane: the barrel passes it through an antipad, return vias join it. | `via-pads` | – |
| Antipad Ø (via-antipad) | The opening in the plane: wider means less capacitance and a higher impedance. | `via-pads` | – |
| Antipad shape (`data-via-shape`, via-shape) | Round per via, oblong around both, or two rounds joined by a bridge. | – | – |
| All antipads (via-antipad-all) | Sets one antipad size on every plane at once. | – | – |
| Return vias (via-returns) | Ground vias beside the barrel carry its return current; positions from the via's centre. | `via-return` | – |
| Add return via (via-return-add) | Places one more at a free spot around the via. | – | – |
| Remove (via-return-remove) | Takes that return via away. | – | – |
| Joins (via-return-planes) | The planes this return via connects. | – | – |
| Backdrill (via-backdrill) | Drills out unused barrel from one side, so the stub gets shorter. | `via-stubs` | – |
| Feeds (via-feeds) | The traces into and out of the via: the Trace section's line, length and direction. | `via-tdr` | – |
| Side view (via-side) | The board cut along the dashed line of the top view, to scale. | – | – |
| Top view (via-top) | Looking down at a plane: pads, antipads, return vias and feeds, to scale. | – | – |
| Handles (via-handles, M3.1b) | Drag one, or focus it and use the arrow keys (Shift finer); the results follow. | – | – |
| Show all (`data-via-reset`, via-reset) | The corner button shows the whole view again. | – | – |
| Add by tap (`data-via-add-mode`, via-add-tap) | The next tap on the top view places a return via there (Enter: at a free spot). | – | – |
| Remove return via (`data-via-remove-sel`, via-remove-sel) | Takes the selected return via away; Delete on its handle does the same. | – | – |
| About this via (via-issues) | What makes the via impossible or doubtful, and why. | – | – |
| Solving (via-solve) | Old numbers stay dimmed until the new ones arrive. | `via-line` | – |
| Barrel (via-barrel-z) | The barrel and its returns as a line, from a 2D cut through the core. | `via-line` | – |
| Via section (via-section-z) | The whole via as one element, √(L/C): the barrel with every pad's capacitance. | `via-line` | – |
| Delay through (via-delay) | The time an edge takes from the top pad to the bottom one. | `via-line` | – |
| L and C (via-lc) | The via's total inductance and capacitance, pads and planes included. | `via-line` | – |
| Piece by piece (via-segments) | Each length of barrel between layer boundaries: its impedance and delay. | `via-line` | – |
| Pads and planes (via-crossings) | The extra capacitance where the barrel meets a pad or passes a plane. | `via-pads` | – |
| Stubs (via-stubs) | Unused barrel is an open line; it notches the signal near its quarter-wave frequency. | `via-stubs` | – |
| Feed traces (via-feed-z) | The feeds' impedance and εeff, solved as in the Trace section. | `field-solver` | – |
| Valid to (via-valid) | Each lumped part is short against the wavelength up to here (λ/8). | `via-limits` | – |
| Flags (via-flags) | Where the model is stretched, each with its numbers. | `via-limits` | – |
| Assumptions (via-assumptions) | What the via model takes as given. | `via-limits` | – |
| Full-wave (via-next) | Why a full-wave run would check this via, and the link that opens it in the Waves section. | – | – |
| TDR (via-tdr, M3.2a) | The impedance a step from the port meets, there and back: feeds, pads, barrel and stubs in turn. | `via-tdr` | – |
| Rise time (`data-field="via.tr"`, via-tr) | The edge's 10–90 % time; a faster edge shows finer detail and reaches higher frequencies. | `via-tdr` | – |
| Port (`data-field="via.port"`, via-port) | The instrument's impedance at both ends; a pair's is the differential one, twice each line's. | – | – |
| TDR mode (`data-via-tdr-mode`, via-tdr-mode) | Differential drives the two vias in opposite directions, common drives them together. | `via-tdr` | – |
| TDT (via-tdt) | The step that arrives at the far port: its delay and how much its edge has slowed. | – | – |
| S-parameters (via-s) | Reflection and transmission of a sine wave against frequency, in dB. | `via-sparams` | – |
| Mixed-mode (`data-via-s-mode`, via-s-mode) | Sdd for the differential signal, Scc for common noise, Scd for differential turned into common. | `via-sparams` | – |
| Ports (via-s-ports) | Both ends at the port impedance above, the feeds included; faded where the lumped parts no longer hold. | `via-limits` | – |
| Cursor (via-cursor) | The time plots share one cursor, the frequency plots another: point, tap, or the arrow keys (Shift: ten points). | – | – |
| Show the fields (`data-viafield-on`, via-fields, M3.2b) | Draws the via's electric field in both views, under the copper. | `via-line` | – |
| Quantity (`data-viafield-qty`, via-field-qty) | The potential, the field's strength, or field lines with equipotentials (lines in the top view). | – | – |
| Drive (`data-viafield-drive`, via-field-drive) | The two vias' voltages in the top view: opposite, together, or one alone. | `pair-definitions` | – |
| Colour scale (`data-viafield-scale`, via-field-scale) | Logarithmic shows the weak field far out next to the strong field at the barrel. | – | – |
| Probe keys (`data-viafield-probe-mode`, via-field-probe-keys) | When on, the arrow keys on the focused view move the probe instead of panning. | – | – |
| Probe (`data-viafield-probe`, via-field-probe) | The potential and the field where you point, tap or move it, read from the map. | – | – |
| Side view (via-field-side) | One via alone at 1 V inside its return vias' coaxial wall, as the via model solves it. | `via-pads` | – |
| 3D view (`data-via3d-open`, via-3d, M5.1) | The via in 3D: barrels, pads, planes with their antipads, return vias and feeds; drag to turn it. | `via-line` | – |
| Reset view (`data-via3d-reset`, via-3d-reset) | Back to the first view: from the side the side view shows, a little above. | – | – |
| Cut away half (`data-via3d-cut`, via-3d-cut) | Removes the near half along the side view's line, so the barrel, its stub and a backdrill show. | `via-stubs` | – |
| Hide the laminate (`data-via3d-laminate`, via-3d-laminate) | Shows the copper alone: how the return vias join the planes around the signal. | `via-return` | – |
| Save PNG (`data-via3d-png`, via-3d-png) | The view as it is now, at the canvas's size or twice it. | – | – |
| Fields in 3D (via-3d-fields) | The side map stands on the side view's line, the top map lies between two planes. | `via-pads` | – |
| Target (`data-field="via.target"`, via-target) | The impedance the via section should have; the antipad or the return vias are found for it. | `via-pads` | – |
| By changing (`data-via-target-vary`, via-target-vary) | Every plane's antipad diameter, or how far the return vias are from the barrel. | – | – |
| Use this (`data-via-target-use`, via-target-use) | Puts the size found into the via, as one undo step. | – | – |
| Figure (`data-export-figure`, export-figure, M8.1b) | What to draw: the stackup, the cross-section, the via, a field map once drawn, or a plot the page has made. | – | – |
| Width (`data-export-size`, export-size) | The figure's width on paper: a column, the text width, a page, LaTeX's \linewidth or any width. | – | – |
| Colours (`data-export-colour`, export-colour) | Colour, greys only, or pure black and white with hatched materials and dashed lines for print. | – | – |
| Format (`data-export-format`, export-format) | TikZ for LaTeX (needs only \usepackage{tikz}), SVG for vector editors, PNG for slides and documents. | – | – |
| PNG scale (`data-export-scale`, export-scale) | Pixels per millimetre: 1× is 96 per inch, 4× about 384 per inch for print. | – | – |
| File name (`data-export-name`, export-name) | The name of the saved file; empty uses the figure's own name. | – | – |
| Copy (`data-export-copy`, export-copy) | Puts the TikZ picture, the SVG text or the PNG on the clipboard. | – | – |
| Save (`data-export-save`, export-save) | Downloads the file; TikZ with a field map comes as a ZIP with its PNG files beside the .tex. | – | – |
| Preview (`data-export-preview`, export-preview) | The figure at its true size on paper; text never smaller than 6 pt. | – | – |
| Data (`data-data-set`, data-set, M8.2a) | The results to write: the trace's, the last sweep, the via's model, its TDR and TDT, its S-parameters. | – | – |
| File (`data-data-format`, data-format) | CSV for spreadsheets and scripts; Touchstone (.s2p, .s4p) for circuit simulators, the via's S-parameters only. | – | – |
| Numbers (`data-data-numbers`, data-numbers) | How Touchstone writes each S: real and imaginary, magnitude and angle, or dB and angle. | – | – |
| Copy (`data-data-copy`, data-copy) | Puts the CSV or Touchstone text on the clipboard, every digit the solver gave. | – | – |
| Save (`data-data-save`, data-save) | Downloads the file, with the date and the setup's link in its first lines. | – | – |
| Save project (`data-project-save`, project-save) | Downloads the whole setup as a .emsim.json file to open here again later. | – | – |
| Open project (`data-project-open`, project-open) | Reads a project file and puts its setup in place as one undo step; dropping it works too. | – | – |
| Copy link (`data-project-link`, project-link) | Copies the page's address, which holds the whole setup. | – | – |
| Paper (`data-report-paper`, report-paper) | The page size the report is laid out for: A4 or US Letter. | – | – |
| Include (`data-report-part`, report-parts) | What the report holds; field maps, plots and calculators once the page has them. | – | – |
| Print report (`data-report-print`, report-print) | Opens the browser's print dialog with the report alone, light; "Save as PDF" there gives a file. | – | – |
| Equations (`data-eq-open` in the Trace results, eq-open) | A number with a dotted underline opens its equation with your numbers beside the results; Escape closes it. | – | – |
| Equations (`data-eq-open` in the Via results, eq-via-open) | A number with a dotted underline opens its equation with this via's numbers; Escape closes it. | – | – |
| Derivation (`data-eq-derive`, eq-derive) | How the equation follows, one step at a time with its reason; Next step, Back, Show all. | – | – |

## Waves (step M7.1a)

| Where | Line | → | Claim |
| --- | --- | --- | --- |
| What to run (waves-kind) | The via with its feeds, or the trace as a straight section between two ports. | – | – |
| Length (waves-length) | The trace section between the reference planes; the run adds a feed at each end. | – | – |
| Rise time (waves-tr) | The fastest edge the run resolves: a faster one needs finer cells, so more memory and time. | – | – |
| Where it runs (waves-backend) | WebGPU when the browser offers a GPU and the run fits it; the CPU is slower, often a hundred times or more. | – | – |
| Estimate (waves-estimate) | Cells, memory and steps of the grid, and the time from the rate this device measured. | – | – |
| Run (waves-run) | Starts the run; a new run cancels the one under way, and Cancel stops it and frees the memory. | – | – |
| Progress (waves-progress) | The step of each excitation, the time left and how far the energy in the grid has died down. | – | – |
| Full-wave against model (waves-plots) | Both curves at the same ports, reference and edge: where they part, the quasi-static model stops holding. | – | – |
| Run notes (waves-notes) | Whether the run settled, stayed stable and its feeds matched the 2D solver. | – | – |
| Checked (waves-checked) | The limits the engine held against openEMS, a separate full-wave solver, on the same structures. | – | – |
