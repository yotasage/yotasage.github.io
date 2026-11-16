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
| Sections nav | Jump to Stackup, Trace, Via, Export or Theory. | – | – |
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

Placed in `whys.ts` with the keys in brackets. The via theory is M4.1; until then the links go to the line and solver
topics. Lines without a claim describe what the control does.

| Where | Line | → | Claim |
|---|---|---|---|
| Single · Pair (`data-via-kind`, via-kind) | One via, or a differential pair whose second via sits one pitch away. | `pairs` | – |
| Presets (`data-via-preset`, via-preset) | A 0.6/0.3 via and an LVDS pair from real boards; each replaces the whole via. | – | – |
| Entry on the trace's layer (`data-via-use-trace`, via-use-trace) | Puts the via's entry on the Trace section's signal layer. | – | – |
| Barrel from, to (via-barrel) | Where the plated hole starts and ends: through, blind or buried. | – | – |
| Entry, exit (via-signal) | The layers the feed traces join; barrel beyond them is a stub. | – | – |
| Drill (via-drill) | The drilled hole; the model takes the barrel as solid copper of this diameter. | – | – |
| Plating (via-plating) | Copper on the hole's wall; the finished hole is the drill less twice this. | – | – |
| Pitch (via-pitch) | Centre to centre between the pair's two vias; closer couples them more. | `pair-definitions` | – |
| Layers (`data-via-layers`, via-layer-table) | Each copper layer: its pad, and whether it is a plane the barrel passes. | `structures` | – |
| Pad (via-pad) | Copper ring around the barrel; empty means removed. Every pad adds capacitance. | `field-solver` | – |
| Plane (`data-via-plane`, via-plane) | A reference plane: the barrel passes it through an antipad, return vias join it. | – | – |
| Antipad Ø (via-antipad) | The opening in the plane: wider means less capacitance and a higher impedance. | `field-solver` | – |
| Antipad shape (`data-via-shape`, via-shape) | Round per via, oblong around both, or two rounds joined by a bridge. | – | – |
| All antipads (via-antipad-all) | Sets one antipad size on every plane at once. | – | – |
| Return vias (via-returns) | Ground vias beside the barrel carry its return current; positions from the via's centre. | `transmission-lines` | – |
| Add return via (via-return-add) | Places one more at a free spot around the via. | – | – |
| Remove (via-return-remove) | Takes that return via away. | – | – |
| Joins (via-return-planes) | The planes this return via connects. | – | – |
| Backdrill (via-backdrill) | Drills out unused barrel from one side, so the stub gets shorter. | – | – |
| Feeds (via-feeds) | The traces into and out of the via: the Trace section's line, length and direction. | `transmission-lines` | – |
| Side view (via-side) | The board cut along the dashed line of the top view, to scale. | – | – |
| Top view (via-top) | Looking down at a plane: pads, antipads, return vias and feeds, to scale. | – | – |
| Handles (via-handles, M3.1b) | Drag one, or focus it and use the arrow keys (Shift finer); the results follow. | – | – |
| Show all (`data-via-reset`, via-reset) | The corner button shows the whole view again. | – | – |
| Add by tap (`data-via-add-mode`, via-add-tap) | The next tap on the top view places a return via there (Enter: at a free spot). | – | – |
| Remove return via (`data-via-remove-sel`, via-remove-sel) | Takes the selected return via away; Delete on its handle does the same. | – | – |
| About this via (via-issues) | What makes the via impossible or doubtful, and why. | – | – |
| Solving (via-solve) | Old numbers stay dimmed until the new ones arrive. | `field-solver` | – |
| Barrel (via-barrel-z) | The barrel and its returns as a line, from a 2D cut through the core. | `field-solver` | – |
| Via section (via-section-z) | The whole via as one element, √(L/C): the barrel with every pad's capacitance. | `transmission-lines` | – |
| Delay through (via-delay) | The time an edge takes from the top pad to the bottom one. | `transmission-lines` | – |
| L and C (via-lc) | The via's total inductance and capacitance, pads and planes included. | – | – |
| Piece by piece (via-segments) | Each length of barrel between layer boundaries: its impedance and delay. | `field-solver` | – |
| Pads and planes (via-crossings) | The extra capacitance where the barrel meets a pad or passes a plane. | `field-solver` | – |
| Stubs (via-stubs) | Unused barrel is an open line; it notches the signal near its quarter-wave frequency. | – | – |
| Feed traces (via-feed-z) | The feeds' impedance and εeff, solved as in the Trace section. | `field-solver` | – |
| Valid to (via-valid) | Each lumped part is short against the wavelength up to here (λ/8). | – | – |
| Flags (via-flags) | Where the model is stretched, each with its numbers. | – | – |
| Assumptions (via-assumptions) | What the via model takes as given. | `field-solver` | – |
| Next (via-next) | A 3D view of the via and full-wave waves come in later steps. | – | – |
| TDR (via-tdr, M3.2a) | The impedance a step from the port meets, there and back: feeds, pads, barrel and stubs in turn. | `transmission-lines` | – |
| Rise time (`data-field="via.tr"`, via-tr) | The edge's 10–90 % time; a faster edge shows finer detail and reaches higher frequencies. | – | – |
| Port (`data-field="via.port"`, via-port) | The instrument's impedance at both ends; a pair's is the differential one, twice each line's. | – | – |
| TDR mode (`data-via-tdr-mode`, via-tdr-mode) | Differential drives the two vias in opposite directions, common drives them together. | `pair-definitions` | – |
| TDT (via-tdt) | The step that arrives at the far port: its delay and how much its edge has slowed. | – | – |
| S-parameters (via-s) | Reflection and transmission of a sine wave against frequency, in dB. | – | – |
| Mixed-mode (`data-via-s-mode`, via-s-mode) | Sdd for the differential signal, Scc for common noise, Scd for differential turned into common. | `pair-definitions` | – |
| Ports (via-s-ports) | Both ends at the port impedance above, the feeds included; faded where the lumped parts no longer hold. | – | – |
| Cursor (via-cursor) | The time plots share one cursor, the frequency plots another: point, tap, or the arrow keys (Shift: ten points). | – | – |
| Show the fields (`data-viafield-on`, via-fields, M3.2b) | Draws the via's electric field in both views, under the copper. | `field-solver` | – |
| Quantity (`data-viafield-qty`, via-field-qty) | The potential, the field's strength, or field lines with equipotentials (lines in the top view). | – | – |
| Drive (`data-viafield-drive`, via-field-drive) | The two vias' voltages in the top view: opposite, together, or one alone. | `pair-definitions` | – |
| Colour scale (`data-viafield-scale`, via-field-scale) | Logarithmic shows the weak field far out next to the strong field at the barrel. | – | – |
| Probe keys (`data-viafield-probe-mode`, via-field-probe-keys) | When on, the arrow keys on the focused view move the probe instead of panning. | – | – |
| Probe (`data-viafield-probe`, via-field-probe) | The potential and the field where you point, tap or move it, read from the map. | – | – |
| Side view (via-field-side) | One via alone at 1 V inside its return vias' coaxial wall, as the via model solves it. | `field-solver` | – |
| Target (`data-field="via.target"`, via-target) | The impedance the via section should have; the antipad or the return vias are found for it. | – | – |
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
