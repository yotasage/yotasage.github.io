# EM simulation – theory content (step M2.4a)

The source text of the page's first Theory section and of the short lines beside the controls. Step M2.4b turns it
into the page's Theory and References sections. Part of [plan.md](plan.md); the claims are checked in
[claims.md](claims.md), the engine numbers in [notes-M2.4a.md](notes-M2.4a.md).

**Index.**

| § | Topic | Id | File |
|---|---|---|---|
| 0 | How to use | `how-to-use` | this file |
| 1 | Transmission lines and quasi-TEM | `transmission-lines` | this file |
| 2 | How the field solver works and what its error means | `field-solver` | this file |
| 3 | Single-ended and differential | `pairs` (sub-anchors `pair-definitions`, `coupling`, `two-speeds`) | this file |
| 4 | Microstrip, stripline and the solder mask | `structures` (`trapezoid`, `solder-mask`, `coplanar-ground`, `copper-thickness`) | [theory-2.md](theory-2.md) |
| 5 | Why calculators and fabs disagree | `calculators` (`closed-forms`, `jlcpcb-calculator`) | [theory-2.md](theory-2.md) |
| 6 | Tolerances and what matters most | `tolerances` | [theory-2.md](theory-2.md) |
| – | The short lines beside every control and readout | – | [theory-lines.md](theory-lines.md) |

**How to read these files.**
- One section per topic, in the page's order. **Id** is the page anchor (`#field-solver`); sub-anchors are the
  places other parts of the page link to (the Calculators panel, notes-M2.3b.md "For M2.4").
- **Text** is what the page says, plain, for an engineer who designs boards but is not a field specialist. `⟨n⟩` after
  a sentence is its number in [claims.md](claims.md); the page does not print it. `[key §x]` is a citation: the page
  prints it as an IEEE number through the `Bibliography`. `[key abstract]` cites what a paper's abstract states
  (literature.md "Findings with numbers"); the page prints it like any citation.
- **Equations** are ids for M2.4b's registry (`lib/emsim/equations.ts`, on `lib/equations/` after the M0.5 move),
  with their TeX and the **live numbers** they carry: the field of the engine's result that gives each, for the
  current setup. Paths are of `LineResults` (`lib/emsim/lines.ts`, `solveSetup`) unless named otherwise: `lines[k]`,
  `pair`, `modes[m]`, `Zc`, `bem.C`, `bem.C0`, `bem.L` (matrices as rows, SI units), each value a `Q` {v, e, status}.
  Values in brackets are those of the default setup (D: a 50 Ω microstrip of 0.1377 mm on L1 of JLC061611-3313A
  with mask, over L2) or of the default pair (P: 0.11 mm traces 0.2 mm apart on the same layers), all checked against
  the engine (notes-M2.4a.md).
- **Figures** are drawn by the page's own code (the trace drawing, the field view, the plot) in both themes, from the
  solver's own polygons and fields; none is a picture file.
- Words: "the laminate" is the dielectric between the trace and its plane; "the plane" is the reference copper; "a
  pair" is two signal traces side by side.

---

## 0. How to use this tool

**Id:** `how-to-use`

**Text.**

The page works out what a trace on a printed circuit board looks like to a fast signal: its impedance, how fast the
signal travels and, for a pair, how the two traces share their fields. ⟨1⟩ It opens on a 50 Ω microstrip of
0.1377 mm on the top layer of JLCPCB's six-layer stackup JLC061611-3313A, under solder mask, over the plane on L2. ⟨2⟩

1. **Stackup.** Choose a preset, any of JLCPCB's stackups from "All JLCPCB stackups…", or open a KiCad board
   (`.kicad_pcb`) to read its stackup; a KiCad project (`.kicad_pro`) adds its net classes. ⟨3⟩ Every thickness and
   εr can be typed, with a tolerance, and shows where it came from. ⟨4⟩
2. **Trace.** Choose the structure, its layer and its planes, then type the width and gap, or drag the handles in
   the drawing. ⟨5⟩ "General arrangement" places up to eight traces and any number of grounds freely. ⟨6⟩
3. **Read.** Z0, εeff and the delay (for a pair Zdiff, Zcm and their parts) appear under the drawing, each with the
   solver's error. ⟨7⟩ While you drag, a quicker coarse value follows the pointer, and the full one arrives when you
   pause. ⟨8⟩
4. **Look.** "Show the fields" draws the potential, the electric or magnetic field, or the charge and current on the
   copper behind the drawing; the probe reads the values at a point. ⟨9⟩
5. **Tools.** Target finds the width or gap for an impedance; Sweep plots what one input does; Tolerance shows the
   spread the inputs' tolerances give; Calculators compares the result with closed formulas and with JLCPCB's
   calculator. ⟨10⟩

Undo and Redo step through every change. The page's address holds the whole setup, so Copy link shares exactly what
you see. ⟨11⟩

**Equations:** none (the topic links to the others).

**Live numbers:** after step 3, "the default gives Z0 = … ([51.50 ± 0.05 Ω])", from `lines[0].z0`.

**Figure:** none.

---

## 1. Transmission lines and quasi-TEM

**Id:** `transmission-lines`

**Text.**

A trace and the plane under it form a transmission line: a signal travels along it as a wave, a voltage between trace
and plane with a current along the trace and back in the plane beneath it. ⟨12⟩ Per unit length the line has a
capacitance C between the trace and its return and an inductance L of the loop they make, and these two decide every
number on this page. ⟨13⟩

A wave travelling one way has the same ratio of voltage to current everywhere: the characteristic impedance
Z0 = √(L/C). ⟨14⟩ It needs √(LC) seconds per metre: the delay. ⟨15⟩ A line ended in Z0 looks to the driver like an
endless line, so nothing is reflected [Ellingson2018 §3.12]. ⟨16⟩

On a real board the field runs through more than one material: the laminate under a microstrip, air and solder mask
above it. Then the wave is not purely transverse (TEM): the field has a small part along the line, which vanishes as
the frequency goes to zero [Pozar2012 §3.8]. ⟨17⟩ The static C and L describe the line exactly in that limit, and
closely while the cross-section is small against the wavelength: the quasi-TEM model, which every 2D field solver
uses. ⟨18⟩

The line then behaves as if it were in one uniform material of relative permittivity εeff = C/C0, where C0 is the
capacitance with every dielectric replaced by air. ⟨19⟩ A wave travels at v = c0/√εeff and its wavelength is
λ0/√εeff [Ellingson2018 §3.11]. ⟨20⟩ Board materials are not magnetic, so L is the same with or without them: the
solver finds L from the air-filled problem, L = μ0ε0·C0⁻¹ [Paul2008]. ⟨21⟩

On the default microstrip C = 117.6 pF/m and L = 312.0 nH/m, which give Z0 = 51.50 Ω, εeff = 3.298 and 6.058 ps
per millimetre. ⟨22⟩

**When does it hold?** At 10 GHz the wavelength on this line is 16.5 mm, while its cross-section is a few tenths of a
millimetre, about 0.02 of a wavelength. ⟨23⟩ Getsinger's dispersion model estimates how εeff of a microstrip rises
with frequency [QucsTech §11.1] [Getsinger1973]. ⟨24⟩ Applied to the default microstrip it gives a rise of 0.05 % at
10 GHz and 0.3 % at 25 GHz; the rise reaches the solver's error on εeff (0.17 %) at about 18 GHz. ⟨25⟩ So on thin
laminates the quasi-TEM numbers hold within their error to well above 10 GHz. ⟨26⟩ This version leaves out
dispersion, losses, copper roughness and how εr changes with frequency; they are planned for later. ⟨27⟩

**Equations** (in this order):

| Id | TeX | Live numbers |
|---|---|---|
| `telegraph` | `-\frac{\partial V}{\partial v} = L\,\frac{\partial I}{\partial t},\quad -\frac{\partial I}{\partial v} = C\,\frac{\partial V}{\partial t}` | none |
| `z0-lc` | `Z_0 = \sqrt{L/C}` | L = `bem.L[0][0]` [3.1196 × 10⁻⁷ H/m], C = `bem.C[0][0]` [1.1763 × 10⁻¹⁰ F/m], Z0 = `lines[0].z0` [51.50 Ω] |
| `delay-lc` | `\tau = \sqrt{LC} = 1/v` | `lines[0].delay` [6.058 ps/mm] (engine in s/m) |
| `eeff-c` | `\varepsilon_\mathrm{eff} = C/C_0` | C0 = `bem.C0[0][0]` [3.5666 × 10⁻¹¹ F/m], `lines[0].eeff` [3.298] |
| `l-c0` | `L = \mu_0\varepsilon_0\,C_0^{-1}` | `bem.L`, `bem.C0` |
| `v-eeff` | `v = c_0/\sqrt{\varepsilon_\mathrm{eff}}` | from `lines[0].eeff` [1.651 × 10⁸ m/s] |
| `lambda-eeff` | `\lambda = \lambda_0/\sqrt{\varepsilon_\mathrm{eff}}` | λ at 10 GHz from `lines[0].eeff` [16.51 mm] |
| `getsinger` | `\varepsilon_\mathrm{eff}(f) = \varepsilon_r - \frac{\varepsilon_r - \varepsilon_\mathrm{eff}}{1 + G\,(f/f_p)^2},\ f_p = \frac{Z_0}{2\mu_0 h},\ G = 0.6 + 0.009\,Z_0/\Omega` | Z0, εeff from `lines[0]`; h and εr of the laminate under the trace from `closedForms(setup).reduced` (`h`, `er`) [0.092 mm, 4.1]; fp [222.7 GHz]; rise at 10 / 25 GHz [0.052 %, 0.32 %] |
| `getsinger-limit` | `f_\mathrm{lim} = f_p\sqrt{x},\ x = \frac{\delta\,\varepsilon_\mathrm{eff}}{G\,(\varepsilon_r - \varepsilon_\mathrm{eff} - \delta\,\varepsilon_\mathrm{eff})},\ \delta = e/\varepsilon_\mathrm{eff}` (the frequency at which the rise equals the error) | e = `lines[0].eeff.e`; [17.9 GHz, δ = 0.166 %]; microstrip kinds only (for a pair, the odd mode's `modes[m].eeff`) |

`getsinger-limit` follows from `getsinger`: the rise εeff(f) − εeff = (εr − εeff)·x/(1 + x), with x = G(f/fp)²,
equals δ·εeff at the x above.

**Figures.**
1. The default cross-section with "Field lines and equipotentials" (the field view's `lines` quantity, one line
   driven), as small as the trace drawing allows, caption "The field of the default microstrip: most of it in the
   laminate, some in the mask and the air above."
2. A ladder of four sections of series L and shunt C between a trace and a plane (static SVG, labels L·Δv, C·Δv).

---

## 2. How the field solver works and what its error means

**Id:** `field-solver`

**Text.**

The page solves the cross-section itself, in your browser, for every change you make. ⟨28⟩ It looks for the charge
on the copper that holds each trace at its potential with the planes at 0 V. ⟨29⟩ The unknowns sit on surfaces only:
the outline of every piece of copper and every boundary between two materials (laminate and air, laminate and mask,
prepreg and core) is cut into short straight pieces, the panels, each with its own constant charge. ⟨30⟩ This is the
boundary element method. Planes are not cut into panels: one plane enters through its mirror image, two through the
exact solution between parallel plates. ⟨31⟩

The solver runs twice: with the dielectrics it gives C, with every dielectric replaced by air it gives C0 and from
it L. ⟨32⟩ Z0, εeff, the delay and, for several traces, every impedance and coupling follow from these matrices. ⟨33⟩
The panels are made shorter towards every edge and corner, where the charge crowds. ⟨34⟩ The solver assumes perfect
copper carrying its current on its surface and uniform, lossless materials. ⟨35⟩

**The error.** The solver solves the same section at three levels, each with twice the panels of the one before,
and compares them. ⟨36⟩ The error it shows is 1.5 times the change between the two finest levels, with rules for
levels that do not shrink cleanly, and never less than what the capacitances' own errors imply. ⟨37⟩ Checked against
an independent finite-difference solver on 500 random structures, the shown error was never below the true error and
was typically about four times it. ⟨38⟩ Against exact solutions (Cohn's stripline [Cohn1954], a wire over a plane
and a half-filled coax [WikiCapacitance]) the error falls as the panels are refined, at the rate expected, to 0.1 %
and below. ⟨39⟩

**Regular and irregular.** A value is *regular* when its three levels approach their limit steadily, each change
smaller than the last at a sensible rate; it is *irregular* when they do not, and its error is then a cautious
difference of the levels. ⟨40⟩ Irregular does not mean wrong: thin mask films and narrow gaps converge slowly, and the
default pair shows Zdiff = 103.36 ± 0.15 Ω irregular. ⟨41⟩ Refinement that stops on its own can report convergence
that has not happened [Zhechev2026 abstract]; ⟨42⟩ the page shows how its levels behaved instead, so you can judge. ⟨43⟩

**Digits.** A result never shows more digits than its error allows, and never finer than 0.01 Ω: the error gets one
significant digit, two when it starts with 1 or 2, and the value ends at the error's last digit (51.50 ± 0.05 Ω,
103.36 ± 0.15 Ω). ⟨44⟩ The digits switch sets how many significant digits the typed values and lengths show; the setup
keeps every digit. ⟨45⟩

**Coarse while dragging.** While you drag a handle, a full solve can lag behind the pointer. When it does (a round
trip over 30 ms), the page solves only the coarsest useful level, without an error, and marks the result "Coarse while
dragging"; the full solve follows when the drag pauses for 200 ms or ends. ⟨46⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `charge-potential` | `\mathbf Q = \mathbf C\,\mathbf V` (per unit length; Maxwell matrix, `C_{ij} \le 0` for i ≠ j) | `bem.C` |
| `error-shown` | `e = 1.5\,\lvert X_M - X_{M/2}\rvert` (regular levels; the full rule in solver.md §2.6) | `lines[0].z0.e` [0.047 Ω], `lines[0].z0.status` [regular]; the three levels' Z0 need a new value: `levelValues(level.C, level.C0, level.L, n)` of each of `bem.levels` (lines.ts exports `levelValues`) |
| `order` | `p = \log_2\frac{\lvert X_{M/2} - X_{M/4}\rvert}{\lvert X_M - X_{M/2}\rvert}` | from the same three levels; regular when 0.8 ≤ p ≤ 4 with one sign |

**Figure.** The default section's panels at the two finest levels (`bem.levels[i].mesh`, panel ends as ticks on the
copper and on the laminate–mask–air boundaries), zoomed on the trace so the grading to the corners shows; caption
"Panels on the copper and on every boundary between materials; each level halves them."

---

## 3. Single-ended and differential

**Id:** `pairs`

**Text.**

A single-ended signal runs on one trace against the planes. A differential signal runs on a pair, as opposite voltages
on the two traces, and the receiver looks at the difference. ⟨47⟩ Two traces near each other share their fields, so a
pair can carry a wave in two ways, its modes. On a symmetric pair these are the odd mode (+V and −V) and the even
mode (both at +V). ⟨48⟩

**Id:** `pair-definitions`

Zodd is the impedance of one trace when the pair is driven in the odd mode, Zeven when it is driven in the even
mode [PolarAP157]. ⟨49⟩ The differential impedance, seen between the two traces, is Zdiff = 2·Zodd; the common-mode
impedance, both traces together against the planes, is Zcm = Zeven/2 [PolarAP157]. ⟨50⟩ In the odd mode the
capacitance between the traces adds to each trace's capacitance, so Zodd is lower than a trace's own impedance;
in the even mode it carries no charge and the mutual inductance adds, so Zeven is higher. ⟨51⟩ On the default pair
Zodd = 51.68 Ω and Zeven = 61.82 Ω around each trace's own 56.75 Ω, so Zdiff = 103.36 Ω and Zcm = 30.91 Ω. ⟨52⟩

When the two traces differ (other widths, other layers, a ground on one side only) the modes are no longer odd and
even, and several definitions of Zdiff are in use. ⟨53⟩ The page shows the mixed-mode one, built from the line's
impedance matrix Zc: Zdiff = Zc11 + Zc22 − 2·Zc12 and Zcm = (Zc11 + Zc22 + 2·Zc12)/4, the impedances a mixed-mode
S-parameter model of the line uses [BockelmanEisenstadt1995]. ⟨54⟩ For a symmetric pair they equal 2·Zodd and
Zeven/2, as above. ⟨55⟩ Zdc = (Zc11 − Zc22)/2 is shown when the pair is not symmetric: how much a differential signal
turns into common mode on the line. ⟨56⟩ The details also give the form for a pure differential voltage drive (B) and
the value a differential TDR with 50 Ω ports reads; both equal Zdiff for a symmetric pair. ⟨57⟩

**Id:** `coupling`

A signal on one trace puts a copy on its neighbour. At the near end (NEXT) the copy lasts twice the line's delay and
its height is kb of the signal; at the far end (FEXT) it is a pulse as large as kf times the length times the edge's
slope [Paul2008] [Bogatin2018]. ⟨58⟩ Both come from the mutual capacitance and inductance: kb = ¼·(Cm/C + Lm/L) and
kf = (Cm/C − Lm/L)/(2v). ⟨59⟩ In one uniform dielectric Cm/C equals Lm/L and FEXT vanishes; over a microstrip pair
Lm/L is larger, so FEXT is negative. ⟨60⟩ On the default pair kb = 4.5 % and kf = −0.163 ps/mm: a 1 V step with a
100 ps edge gives a far-end pulse of about −0.16 V after 100 mm. ⟨61⟩ A stripline pair on L2 of the same stackup, in
nearly one dielectric, has kf of only −4 × 10⁻⁵ ps/mm. ⟨62⟩

**Id:** `two-speeds`

On a microstrip pair the two modes travel at different speeds. ⟨63⟩ The odd mode's field is strongest in the gap and
just above it, in mask and air, and the even mode's lies more in the laminate below, so the odd mode is faster:
εeff 3.08 against 3.44 on the default pair, 5.86 against 6.18 ps/mm, 33 ps apart after 100 mm. ⟨64⟩ In a stripline
both modes see nearly the same dielectric and travel together (εeff 4.128 for both on the stripline pair). ⟨65⟩ The
page then says their speeds are not resolved; the impedances are not affected. ⟨66⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `mixed-mode-vars` | `V_d = V_1 - V_2,\ I_d = \tfrac12(I_1 - I_2),\ V_c = \tfrac12(V_1 + V_2),\ I_c = I_1 + I_2` | none |
| `zodd-sym` | `Z_\mathrm{odd} = \sqrt{\frac{L_{11} - L_{12}}{C_{11} - C_{12}}}` | `bem.L`, `bem.C`, `pair.zodd` [P: 51.68 Ω] |
| `zeven-sym` | `Z_\mathrm{even} = \sqrt{\frac{L_{11} + L_{12}}{C_{11} + C_{12}}}` | `pair.zeven` [P: 61.82 Ω] |
| `zdiff-zodd` | `Z_\mathrm{diff} = 2\,Z_\mathrm{odd},\ Z_\mathrm{cm} = Z_\mathrm{even}/2` | `pair.zdiff` [103.36 Ω], `pair.zcm` [30.91 Ω] |
| `zdd-zc` | `Z_\mathrm{diff} = Z_{c,11} + Z_{c,22} - 2Z_{c,12}` | `Zc` [P: 56.75, 5.066 Ω], `pair.zdiff` |
| `zcc-zc` | `Z_\mathrm{cm} = \tfrac14(Z_{c,11} + Z_{c,22} + 2Z_{c,12})` | `Zc`, `pair.zcm` |
| `zdc-zc` | `Z_\mathrm{dc} = \tfrac12(Z_{c,11} - Z_{c,22})` | `pair.zdc` [P: 0] |
| `zdiff-b` | `Z_\mathrm{diff}^{(B)} = \frac{4}{Y_{c,11} + Y_{c,22} - 2Y_{c,12}},\ Z_\mathrm{cm}^{(B)} = \frac{1}{Y_{c,11} + Y_{c,22} + 2Y_{c,12}}` | `Yc`, `pair.zdiffB`, `pair.zcmB` |
| `ztdr` | `Z_\mathrm{TDR} = Z_\mathrm{dd} - \frac{Z_\mathrm{dc}^2}{Z_\mathrm{cc} + 25\,\Omega}` | `pair.ztdr` [P: 103.36 Ω] |
| `kb` | `k_b = \tfrac14\left(\frac{C_m}{C} + \frac{L_m}{L}\right),\ C_m = -C_{12}` | `bem.C[0]`, `bem.L[0]`, `pair.kb` [P: 0.0446] |
| `kf` | `k_f = \frac{1}{2v}\left(\frac{C_m}{C} - \frac{L_m}{L}\right)` | `pair.kf` [P: −1.627 × 10⁻¹⁰ s/m = −0.163 ps/mm] |
| `fext-pulse` | `V_\mathrm{FEXT} = k_f\,\ell\,\frac{\mathrm dV}{\mathrm dt}` | `pair.kf`; ℓ = 100 mm and 1 V / 100 ps fixed [−0.163 V] |
| `eeff-mode` | `\varepsilon_{\mathrm{eff},m} = (c_0/v_m)^2` | `modes[m].eeff` [P: odd 3.082, even 3.435] |
| `mode-skew` | `\Delta\tau = (\tau_\mathrm{even} - \tau_\mathrm{odd})\,\ell` | `modes[m].delay` [P: 5.856, 6.182 ps/mm; 32.7 ps at ℓ = 100 mm] |

**Figure.** The default pair twice, side by side (stacked under 600 px): "Odd (+1, −1)" and "Even (all +1)" drives
of the field view with field lines and equipotentials; caption "Odd: the field crowds into the gap. Even: the gap
is nearly field-free and the traces push their field down to the plane."
