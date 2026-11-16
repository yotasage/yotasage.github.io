# EM simulation – theory content, topics 4–6 (step M2.4a)

Continues [theory.md](theory.md) (index, how to read, topics 0–3); split off to keep each file under 40 kB. The
claim numbers continue those of theory.md; [claims.md](claims.md) has them all. D is the default microstrip
(0.1377 mm on L1 of JLC061611-3313A, mask, over L2), P the default pair (0.11 mm traces, 0.2 mm gap, same layers).

---

## 4. Microstrip, stripline and the solder mask

**Id:** `structures`

**Text.**

A microstrip is a trace on an outer layer over a plane, with air and usually solder mask above it. A stripline is a
trace inside the board between two planes. An embedded microstrip is an inner trace with a plane below it only. ⟨67⟩
A stripline's field lies wholly in the laminate, so its εeff is the laminate's: 4.13 for 0.1377 mm on L2 of the
default stackup, between its prepreg's 4.1 and its core's 4.17. ⟨68⟩ It is slower than the microstrip, 6.78 against
6.06 ps/mm, and with planes on both sides it has more capacitance: the same 0.1377 mm gives 51.50 Ω as microstrip on
L1, 38.44 Ω as stripline on L2 between L1 and L3, and 57.24 Ω as embedded microstrip on L2 over the thicker core to
L3. ⟨69⟩

**Id:** `trapezoid`

Etching removes copper from the top down, so a trace's top ends up narrower than its base. JLCPCB's guide gives the
top as the base minus 0.7 mil [JLCPCBCalcGuide]. ⟨70⟩ The page draws the trace as that trapezoid when the stackup
has an etch, and every width you type is the base. ⟨71⟩ A narrower top means less capacitance: the trapezoid raises
the default microstrip by 0.98 Ω and the default pair's Zdiff by 2.85 Ω against rectangles. ⟨72⟩

**Id:** `solder-mask`

Solder mask is a dielectric too: JLCPCB's guide gives it εr 3.8, 1.2 mil thick on the laminate and 0.6 mil over
the copper [JLCPCBCalcGuide]. ⟨73⟩ It takes the place of some of the air in the trace's field, so εeff rises and Z0
falls. ⟨74⟩ On the default microstrip the mask lowers Z0 by 3.48 Ω, from 54.98 to 51.50 Ω (6.3 %); on the default
pair it lowers Zdiff by 9.15 Ω, from 112.52 to 103.36 Ω, more because the mask fills the gap where the odd mode's
field is strongest. ⟨75⟩ The mask also slows the signal: εeff 3.30 with it, 2.89 without. ⟨76⟩ The closed formulas
leave the mask out, which alone puts them a few ohms above a masked microstrip (topic 5). ⟨77⟩ "Solder mask over the
trace" switches it off for traces left bare. ⟨78⟩

**Id:** `coplanar-ground`

Ground copper beside the trace on the same layer adds capacitance from the sides. ⟨79⟩ With the default microstrip
as a coplanar waveguide with ground, a gap of 0.6 mm changes nothing visible (51.43 ± 0.17 Ω), 0.2 mm lowers Z0 by
1.1 Ω and 0.1 mm by 4.8 Ω. ⟨80⟩ A pour that keeps a gap of a few laminate thicknesses hardly matters; a close one
must be part of the design. ⟨81⟩

**Id:** `copper-thickness`

The copper's side walls face the plane and, in a pair, each other. Thicker copper adds capacitance there, most
between the two traces of a pair. ⟨82⟩ The thickness changes the impedance of single and coupled microstrip too much
to ignore in many practical cases [Gunston1969 abstract]: ⟨83⟩ on the default pair, without mask and trapezoid,
the 0.035 mm copper lowers Zdiff by 16.4 Ω against zero-thickness copper, and on the single microstrip by 5.3 Ω. ⟨84⟩

**Equations:** none new; the topic uses `eeff-c` (topic 1) and `zodd-sym` (topic 3), with these live numbers:

| What | Live numbers |
|---|---|
| The mask's effect | needs a new value: one more solve of the setup with `trace.masked = false` (`lines[0].z0` or `pair.zdiff` of both) [D: 54.98 → 51.50 Ω; P: 112.52 → 103.36 Ω]. Until M2.4b adds it, the text's numbers are static (the default examples) |
| The trapezoid's effect | static numbers [D: +0.98 Ω, P: +2.85 Ω]; live would need one more solve with every copper `etch = {kind: 'none'}` |

**Figures.**
1. The default microstrip's |E| twice, with and without the mask (field view `E`, linear scale, the same colour
   range for both), caption "With mask, part of the field above the trace runs in the mask instead of the air."
2. The trace close up, with the trapezoid's top and base widths marked (from the section's polygon of the copper).

---

## 5. Why calculators and fabs disagree

**Id:** `calculators`

**Text.**

Calculators get their numbers in two ways. A field solver works out the field of the actual cross-section, as this
page does and as Polar's Si8000 and Si9000 do [PolarAP157]. ⟨85⟩ A closed formula is a fitted expression for one kind
of structure, quick and good inside the range it was fitted for. ⟨86⟩ In the examples below, where two of them disagree, the
cause is in what they were told or what they leave out, not in the arithmetic. ⟨87⟩

**Id:** `closed-forms`

**Closed forms and their ranges.** Hammerstad–Jensen's microstrip is stated within 0.03 % for Z0 in air and 0.2 % for
εeff, for zero thickness [QucsTech §(single microstrip)] [HammerstadJensen1980]. ⟨88⟩ Wheeler's 1977 formula is
within 1 % for most cases and always within 2 % [WikiMicrostrip] [Wheeler1977]. ⟨89⟩ Kirschning and Jansen's coupled
microstrip is stated within 0.6 % for impedances, for 0.1 ≤ w/h ≤ 10, 0.1 ≤ s/h ≤ 10 and 1 ≤ εr ≤ 18, with
zero-thickness strips [KirschningJansen1984 §II]. ⟨90⟩ IPC-2141 states no range or accuracy for its formulas and
points to measurement [IPC2141 §4]. ⟨91⟩

To use a formula the page first reduces the structure to its inputs: the trapezoid becomes its mean width, several
layers one height and one εr. ⟨92⟩ What the formulas leave out matters more than their own error: none has the solder
mask, Kirschning–Jansen has no copper thickness, and the coplanar formulas take the grounds as endless. ⟨93⟩

On the bare default microstrip (no mask, a rectangle) the formulas hold: Hammerstad–Jensen gives 54.06 Ω against
this page's 54.16 Ω, 0.2 % apart, and Wheeler 54.33 Ω, while IPC-2141 gives 49.38 Ω, 8.8 % low. ⟨94⟩ On the trace as
it is, with mask and trapezoid, Hammerstad–Jensen gives 55.85 Ω against 51.50 Ω, the mask's few ohms; IPC-2141 lands
at 51.24 Ω, close only because its own error and the missing mask cancel. ⟨95⟩ Kirschning–Jansen gives 132.3 Ω for
the default pair against 103.36 Ω: no mask and no copper thickness. ⟨96⟩ Published comparisons find closed forms for
coupled microstrip within 5 % of a full-wave solver in most cases [Abbosh2009 abstract]. ⟨97⟩

**Id:** `jlcpcb-calculator`

**JLCPCB's calculator.** JLCPCB's online impedance calculator sends its inputs to Polar's Si9000 field solver
[JLCPCBCalc]. ⟨98⟩ For JLC061611-3313A, a trace on L1 over L2, it uses εr 4.3 for the prepreg, copper 1.6 mil thick
with a top 0.5 mil narrower than the base, and mask 1.0 mil on the laminate and between traces and 0.6 mil over the
copper, at εr 3.8 [JLCPCBCalc]. ⟨99⟩ JLCPCB's own lists give other values for the same stackup: εr 4.1 for its 3313
prepreg and 0.035 mm finished outer copper [JLCPCBImpedance], a top 0.7 mil narrower and mask 1.2 mil on the
laminate [JLCPCBCalcGuide]. ⟨100⟩ The page's preset keeps the listed values; "Use JLCPCB's calculator inputs" puts
the calculator's in, as one step you can undo. ⟨101⟩

On the calculator's inputs the two solvers agree: JLCPCB states 50 Ω at 5.42 mil, where Si9000 gives 49.96 Ω
[JLCPCBCalc], and this page gives 50.06 ± 0.06 Ω at 0.1377 mm (5.42 mil). ⟨102⟩ Over ten such queries the largest
difference was 0.33 %. ⟨103⟩ With the listed values the same trace is 51.50 Ω, 3.0 % above the 50 Ω JLCPCB states. ⟨104⟩ One at a time,
from the calculator's inputs to the listed ones: εr 4.1 instead of 4.3 adds 0.94 Ω, 0.035 mm copper instead of
1.6 mil 0.51 Ω, the wider trapezoid 0.25 Ω, and the thicker mask takes 0.27 Ω; together 1.44 Ω. ⟨105⟩ The default
pair is 100.01 Ω on the calculator's inputs and 103.36 Ω on the listed values, against JLCPCB's 100 Ω at
4.36 / 8 mil. ⟨106⟩ So the 3 % is the inputs, not the solvers. ⟨107⟩

The Target tool on the calculator's inputs finds 5.435 mil (0.1380 mm) for 50 Ω; the calculator's 5.42 mil is a
little narrower because its search stops within ±0.5 % of the target [JLCPCBCalc]. ⟨108⟩ On the listed values 50 Ω
needs 0.1465 mm. ⟨109⟩

Which to trust? Both describe a board that has not been made yet. JLCPCB promises impedance within ±10 %
[JLCPCBCapabilities], ⟨110⟩ and both numbers lie well inside that. ⟨111⟩ Finished boards vary too: in one study,
boards of the same 50 Ω trace from three makers were off the nominal by 3 %, 10 % and 20 % [Renbi2011 abstract]. ⟨112⟩
A measurement of the finished board has the last word; the page helps you start close to it. ⟨113⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `pct-diff` | `\Delta = \frac{X_\mathrm{formula} - X_\mathrm{field}}{X_\mathrm{field}}` | the Calculators panel's `closedForms(setup).results[i].values` against `lines[0].z0` or `pair.zdiff` [D: H–J 55.85 Ω, +8.4 %] |
| `parts-sum` | `\Delta Z = Z(\text{stackup}) - Z(\text{calculator}) \approx \sum_\text{part} \big(Z(\text{calculator, part as stackup}) - Z(\text{calculator})\big)` | the panel's parts (`jlcAllBut(setup, part)` solved, `asJlcpcbCalculator(setup)` solved) [D: +0.94, +0.51, +0.25, −0.27; together +1.44 Ω]: new for the theory, the panel already solves them (CalcTool's results can be shared, or the theory solves them on the `calc` channel when shown) |

**Figure.** A waterfall from the calculator's value to the stackup's: one bar per part (εr, copper, etch, mask),
then the sum, from the panel's numbers (`data-calc-part`), with the error band of each end; caption "From JLCPCB's
calculator inputs to this stackup's own, one at a time."

---

## 6. Tolerances and what matters most

**Id:** `tolerances`

**Text.**

Every input has a tolerance: the laminate's thickness after pressing, its εr, the etched width, the mask. ⟨114⟩ A fab
states its promise on the impedance instead: JLCPCB gives ±10 %, or ±5 % on request [JLCPCBCapabilities]. ⟨115⟩
Where you have not typed a tolerance, the Tolerance tool fills in placeholders: ±10 % for widths, gaps and
thicknesses, ±0.2 for εr and ±30 % for the mask. They show the method, not your fab's figures; type real ones where
you have them. ⟨116⟩

**What moves it.** The ranking sets each input alone to the ends of its tolerance and shows how far Z moves. ⟨117⟩ On
the default microstrip with the placeholders: the prepreg's thickness ±2.87 Ω, the width ∓2.42 Ω, the prepreg's εr
∓0.98 Ω, the mask on the laminate ∓0.49 Ω, the copper's thickness ∓0.34 Ω, and the rest less. ⟨118⟩ Each input's share
is its change squared over the sum of the squares: 53 % thickness, 38 % width, 6 % εr. ⟨119⟩ With these tolerances
on a thin outer laminate, the laminate's thickness and the width matter most, εr comes a distant third, and the
mask's thickness hardly counts. ⟨120⟩

**Worst case.** The corners put every input at the end of its tolerance that moves Z the same way, and solve those
two setups: 44.54 to 59.37 Ω here. ⟨121⟩ It is a safe bound but a pessimistic one, because every input at its limit
at once is unlikely. ⟨122⟩

**Monte Carlo.** The tool draws 1000 boards, each input independent and normal with its tolerance at 3σ (redrawn
beyond it), from a fixed seed so the result repeats. ⟨123⟩ Here: median 51.44 Ω, 95 % between 49.06 and 54.24 Ω,
standard deviation 1.31 Ω. ⟨124⟩ The same 1.31 Ω follows from the ranking: the root of the sum of the squared
changes, divided by three, because changes this small add almost like straight lines. ⟨125⟩ Inputs that move
together in a real panel (a prepreg's thickness and its εr through the resin content) would widen or narrow the band;
the tool takes them as independent. ⟨126⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `sens` | `d_i = \tfrac12\big(Z(x_i + t_i) - Z(x_i - t_i)\big)` | `corners(setup).inputs[i].d[key]` [D: 2.871, −2.421, −0.976 Ω, …] |
| `share` | `s_i = d_i^2 \big/ \textstyle\sum_j d_j^2` | `shares` of components/EmSim/tools.ts [D: 0.533, 0.379, 0.062] |
| `corners` | `Z_\mathrm{hi} = Z\big(x_i + \operatorname{sign}(d_i)\,t_i\big),\ Z_\mathrm{lo} = Z\big(x_i - \operatorname{sign}(d_i)\,t_i\big)` | `corners(setup).corners[0]` `lo`, `hi` [44.54, 59.37 Ω] |
| `rss-sigma` | `\sigma \approx \tfrac13\sqrt{\textstyle\sum_i d_i^2}` | from the ranking [1.310 Ω]; against `monteCarlo(setup).stats[key].sd` [1.313 Ω] |
| `mc-normal` | `x_i \sim \mathcal N(x_i, (t_i/3)^2),\ \lvert x_i - \bar x_i\rvert \le t_i` | `monteCarlo(setup).stats[key].p` at `MC_P` [47.91, 49.06, 51.44, 54.24, 55.43 Ω] |

These live numbers come from the Tolerance tool's own runs (`withPlaceholders(setup)` then `corners`, `monteCarlo`):
the theory shows the tool's last result when it has one, else the default's numbers above as static text.

**Figure.** The ranking as horizontal bars (each input's d with its sign, the placeholder tag where it applies),
the worst-case corners and the ±2σ band drawn on one axis beside them. A histogram of the Monte Carlo samples is
BL107 (the result keeps statistics only).
