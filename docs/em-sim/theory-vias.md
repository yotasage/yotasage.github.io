# EM simulation – theory of vias (step M4.1)

The source text of the page's via theory, read as [theory.md](theory.md) says ("How to read these files"): ids are page
anchors, `⟨n⟩` is the claim's number in [claims.md](claims.md), `[key §x]` a citation, `[key abstract]` what a paper's
abstract states (literature.md "Findings with numbers"). Equations are ids of [equations-list.md](equations-list.md);
**live numbers** are fields of `ViaModelResult` (`lib/emsim/viamodel.ts`, `viaModel(stackup, via, trace, { tr, z0 })`)
unless named otherwise. Values in brackets are those of **V**, the default via (0.6/0.3, antipads Ø1.8 on L2 and L5,
two return vias 0.8 mm away, 2 mm feeds of the default microstrip, on JLC061611-3313A, 35 ps, 50 Ω ports), or of
**VP**, the via-pair preset (Ø0.5/0.22, pitch 0.7, stadium antipad 1.22 × 1.92, six return vias, feeds of the 0.11/0.2
pair); every one checked against the engine ([notes-M4.1.md](notes-M4.1.md)). Step M4.3 puts these topics on the page
after the six of theory.md and theory-2.md, and the via's short lines (theory-lines.md "Via") link to them.

| § | Topic | Id |
|---|---|---|
| 7 | The via as a line | `via-line` |
| 8 | Pads and antipads | `via-pads` |
| 9 | The return path and stitching vias | `via-return` |
| 10 | Stubs and backdrill | `via-stubs` |
| 11 | Reading a TDR | `via-tdr` |
| 12 | S-parameters and mixed mode | `via-sparams` |
| 13 | Where the via model stops | `via-limits` |

---

## 7. The via as a line

A via is a short vertical line: the barrel is its signal conductor, and the return vias and the planes around it carry
the return current. ⟨134⟩ Between two planes the field around the barrel lies in the horizontal cut, so the tool
solves that cut in 2D, as it solves a trace's cross-section, with the barrel and the return vias as circles. ⟨135⟩
Within one material the cut is an exact TEM line: its impedance is the vacuum value divided by √εr, and its delay is
the length times √εr / c0. ⟨136⟩ For the 0.6/0.3 via with two return vias 0.8 mm away, the barrel is 127.36 Ω in
vacuum, 59.71 Ω in the 0.865 mm core (εr 4.55) and 62.90 Ω in the 3313 prepreg (εr 4.1). ⟨137⟩

**Quick estimates.** A barrel of diameter d inside a solid ring of return of diameter D is a coaxial line,
Z = η0/(2π√εr)·ln(D/d) [WikiCapacitance]. ⟨138⟩ With N return vias on a circle a thin-wire estimate adds a term for
the gaps between them; for the via above it gives 60.84 Ω, 1.9 % above the solver, because returns 0.8 mm from a
0.3 mm barrel are too close for the thin-wire picture. ⟨139⟩ The tool turns the cut's vacuum capacitance into the
radius R_eq of the coaxial line with the same capacitance: 1.255 mm here. ⟨140⟩

**The section as one element.** Taken whole between its outer pads, the via has the inductance of its barrel lines
and their capacitance plus every pad's and plane's excess; its impedance is √(L/C) and its delay √(LC). ⟨141⟩ For the
0.6/0.3 via: L 0.681 nH, C 269.7 fF (179.8 fF of barrel line, 90.0 fF at the pads and planes), so √(L/C) = 50.23 Ω and
13.55 ps through the board. ⟨142⟩ With a controlled return path, physics-based models treat a via as a line whose
impedance can be matched, studied up to 20 GHz [Fan2014 abstract]. ⟨143⟩

A via pair is the same with two barrels: the cut gives Zdiff and Zcm as for a pair of traces (§3). ⟨144⟩ For the LVDS
pair of 0.22 mm drills 0.7 mm apart with six return vias, the barrel's Zdiff is 92.23 Ω in the core and 97.16 Ω in the
prepreg; the section as one element is 83.49 Ω differential and 36.63 Ω common, 12.59 ps. ⟨145⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `via-barrel-z` | `Z_i = Z_\mathrm{vac}/\sqrt{\varepsilon_{r,i}}` | `barrel.zVac` [127.36 Ω], `pieces[i].er`, `pieces[i].z0` [59.71 Ω in the core]; a pair: `zdiffVac`, `zcmVac`, `pieces[i].zdiff`, `zcm` [VP 196.74 → 92.23 Ω] |
| `via-barrel-delay` | `\tau_i = \ell_i\sqrt{\varepsilon_{r,i}}/c_0` | `pieces[i].zTop − zBot` (mm), `pieces[i].delay` [0.865 mm core: 6.155 ps] |
| `via-coax` | `Z = \frac{\eta_0}{2\pi\sqrt{\varepsilon_r}}\ln\frac{D}{d}` | d = `via.drill`, D = 2·`wall.Req` [2.510 mm], εr of the core piece; equals `pieces[i].z0` |
| `via-quasi-coax` | `Z \approx \frac{\eta_0}{2\pi\sqrt{\varepsilon_r}}\Big(\ln\frac{R}{a} + \frac1N\ln\frac{R}{N b}\Big)` | a = drill/2, b = return drill/2, R = `nearestReturn(via)`, N = returns; single via with equidistant returns only [60.84 against 59.71 Ω] |
| `via-req` | `R_\mathrm{eq} = a\,e^{2\pi\varepsilon_0/C_0'}` | `wall.Req` [1.2548 mm], a = drill/2; C0′ from Z_vac = 1/(c0·C0′) |
| `via-section-l` | `L = \sum_i L_i'\ell_i,\ L_i' = Z_\mathrm{vac}/c_0` | `lumped.L[0][0]` [0.6806 nH] |
| `via-section-c` | `C = \sum_i C_i'\ell_i + \sum_k \Delta C_k` | `lumped.lineC` [179.79 fF], `lumped.dCsum` [89.95 fF], `lumped.C[0][0]` [269.74 fF] |
| `via-section-z` | `Z_\mathrm{sec} = \sqrt{L/C}` | `lumped.z` [50.229 Ω] |
| `via-section-delay` | `\tau_\mathrm{sec} = \sqrt{LC}` | `lumped.delay` [13.549 ps] |
| `via-section-pair` | `Z_\mathrm{diff} = 2\sqrt{\frac{L_{11}-L_{12}}{C_{11}-C_{12}}},\ Z_\mathrm{cm} = \tfrac12\sqrt{\frac{L_{11}+L_{12}}{C_{11}+C_{12}}}` | `lumped.L`, `lumped.C`, `lumped.zdiff` [VP 83.49 Ω], `lumped.zcm` [36.63 Ω] |

**Figures.** 1. The side view with each barrel piece labelled by its Z and delay (the Via section's own drawing).
2. The cut's top view with field lines and equipotentials, barrel driven at 1 V and the returns at 0 V (the via field
map of M3.2b, "Lines"), the R_eq circle dashed, caption "Between the planes the barrel and its returns are a line;
the dashed circle is the coaxial line with the same capacitance."

---

## 8. Pads and antipads

Where the barrel meets a pad, the pad's copper adds capacitance to the planes nearby; where it passes a plane, the
edge of the opening (the antipad) comes close to the barrel. ⟨146⟩ Both are local: the tool takes each as a shunt
capacitance at its layer, the charge in a window around the layer less the barrel line's own over that window. ⟨147⟩
Pads, antipads and planes are rings around the axis, so the tool solves them as bodies of revolution with ring
charges, one via at a time. ⟨148⟩ Quasi-static integral equations give the excess capacitance and inductance of a via
with pads and openings, and how they depend on pad and opening size [Kok1993 abstract]. ⟨155⟩

On the 0.6/0.3 via each pad adds about 15.3 fF and each plane crossing with its pad 14.3 fF: 90.0 fF over six
layers. ⟨149⟩ So the section, 50.23 Ω, lies below the barrel's 59.71 Ω: half again as much capacitance at the same
inductance. ⟨150⟩ A smaller antipad adds capacitance and lowers the impedance, a larger one does the opposite; the
Target finds the size: the 0.6/0.3 via reaches 50 Ω with antipads of Ø1.758 mm instead of 1.8 mm. ⟨151⟩ Drill,
pad, antipad and pitch are the means of tuning a differential via, by whether it is too capacitive or too inductive
[Vardapetyan2020 abstract]. ⟨152⟩

The LVDS pair keeps pads only on L1 and L6, 31.5 fF each per via, while its planes' openings take 4.5 fF away: 54.0 fF
per via. ⟨153⟩ Between the pair's two pads the tool estimates the coupling from the barrel's cut, as −k12·ΔC with
k12 = 0.274, and flags it until a full-wave check. ⟨154⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `via-dc` | `\Delta C_k = Q_k - C'(z_{\mathrm{hi},k} - z_{\mathrm{lo},k})` (1 V on the barrel) | `nodes[k].dC` [L1 15.31, L2 14.33 fF], `nodes[k].dCErr` |
| `via-pad-coupling` | `\Delta C_{12} = -k_{12}\,\Delta C,\ k_{12} = -C_{12}'/C_{11}'` | `barrel.k12` [VP 0.2740]; pair only |
| `via-target` | `Z_\mathrm{sec}(x) = Z_\mathrm{target}` (x: every antipad's Ø, or the return vias' distance) | `viaTarget(…).x` [Ø1.7583 mm for 50 Ω], `.value`, `.range`, `.values` |

**Figures.** 1. The side view's field map of one via in its coaxial wall (M3.2b, "Potential"), with the windows of
two crossings shaded, caption "The excess at a pad is the charge in its window less the barrel line's." 2. A bar per
layer of `nodes[k].dC`, pads and planes in two colours.

---

## 9. The return path and stitching vias

A via is a line only when its return current has a path beside it: return (stitching) vias joined to the planes the
signal changes between [Fan2014 abstract]. ⟨156⟩ Without one, the return current spreads from the antipad into the
cavity between the two planes, where the radial wave has no cut-off: it is launched at every frequency. ⟨157⟩ The
board's open edges make that plane pair a cavity with resonances; a 50 × 50 mm board with εr 4.3 has its first near
1.45 GHz. ⟨158⟩ Shorting vias around the signal via make the plane pair's impedance independent of the board's edges
[Chada2009 abstract], ⟨159⟩ and how far a quasi-static via model holds depends on the distance to the return via
[Archambeault2004 abstract]. ⟨160⟩

So the tool refuses a via without return vias and flags one whose nearest return is more than 2 mm away, a
provisional limit that the full-wave check will set. ⟨161⟩ Moving the 0.6/0.3 via's two returns from 0.8 to 2.5 mm
raises its barrel in the core from 59.71 to 108.78 Ω and the section from 50.23 to 68.63 Ω. ⟨162⟩

**The wall rule.** The axisymmetric solve closes its domain with a grounded coaxial wall at the returns' R_eq, so that
between the planes it has exactly the cut's capacitance and what remains at a pad is only the local excess. ⟨163⟩
When R_eq would lie inside an opening, the tool uses a wider wall and says so (`wall-rule`). ⟨164⟩ Return vias that an
antipad cuts into are flagged too: the 0.6/0.3 via's antipad edge lies 0.25 mm past its return vias' near edge. ⟨165⟩

An uneven arrangement of ground vias near a pair raises mode conversion about as much as a length mismatch of its
traces [RimoloDonadio2009b abstract]. ⟨166⟩ In a dense via array, overlapping antipads raise the planes' impedance
sharply [Miller2004 abstract]; the tool flags a pair's round antipads wider than its pitch. ⟨167⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `cavity-f` | `f_{mn} = \frac{c_0}{2\sqrt{\varepsilon_r}}\sqrt{(m/a)^2 + (n/b)^2}` | none on the page (a, b: the board, not in the setup); the example 1.45 GHz is static text |

**Figures.** 1. The top view with the return vias, the R_eq circle and, beside it, the same via with no returns and
arrows spreading into the plane pair (static SVG).

---

## 10. Stubs and backdrill

Barrel beyond the layer where the signal leaves is a stub: an open line hanging off the path. ⟨168⟩ An open line of
length ℓ has the input impedance −jZ0·cot(βℓ), zero when βℓ = π/2: a short across the path at the quarter-wave
frequency and its odd multiples [SteerVol2 §2.4] [Ellingson2018 §3.16]. ⟨169⟩ So the bare stub resonates at
f = 1/(4τ) = c0/(4ℓ√εeff), τ its one-way delay. ⟨170⟩

The 0.6/0.3 via leaving on L3 has 1.335 mm of barrel below it: 9.19 ps, a quarter wave at 27.2 GHz bare; with its pads
the stub resonates at 21.8 GHz, where |S21| falls to −48.6 dB. ⟨171⟩ The pads load the stub with capacitance and pull
its resonance down. ⟨172⟩ The frequency is set by the stub's length, its depth by the stub's structure and return
paths [Huddar2021 abstract]. ⟨173⟩

Backdrilling drills the unused barrel out from the other side with a wider bit, leaving a short remainder. ⟨174⟩
Backdrilled from the bottom to 1.2 mm, the same via keeps 0.165 mm of stub, which resonates near 215 GHz, far above
the band; at 10 GHz the stub cost 0.68 dB of transmission, the backdrilled via 0.07 dB. ⟨175⟩ In a pair, residual stubs
that differ by the ±10 mil backdrill tolerance gave 9 Ω of differential impedance variation, mode conversion above
−40 dB from 5 GHz and 2–3 ps of skew in simulation [Zhang2020 abstract]. ⟨176⟩ Removing power-via stub resonances in
25 Gbps+ links improved the bit-error rate by seven orders of magnitude, simulated and measured [Park2017
abstract]. ⟨177⟩ The tool flags a stub whose first resonance, with its pads, falls inside the edge's band. ⟨178⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `stub-zin` | `Z_\mathrm{in} = -jZ_0\cot(\beta\ell)` | none (the shape of the resonance) |
| `stub-quarter` | `f_\mathrm{stub} = \frac{1}{4\tau_\mathrm{stub}} = \frac{c_0}{4\ell\sqrt{\varepsilon_\mathrm{eff}}}` | `stubs[i].length` [1.335 mm], `stubs[i].delay` [9.188 ps], `stubs[i].fFormula` [27.21 GHz]; with the pads `stubs[i].fRes` [21.79 GHz] (the first zero of the stub chain's A) |

**Figures.** 1. |S21| of the via leaving on L3, with and without backdrill, on one plot (the via's S plot). 2. The side
view with the backdrilled part drawn hollow.

---

## 11. Reading a TDR

A TDR sends a step down the line and shows the impedance the step meets, from the part that comes back:
Z = Z_ref·(1 + ρ)/(1 − ρ), ρ the reflected step. ⟨179⟩ Time on the plot is there and back: a feature at delay τ from
the port shows at 2τ. ⟨180⟩ The tool's step has a Gaussian edge of the chosen 10–90 % rise time; its spectrum is down
3 dB at f3 = 0.34/tr (9.70 GHz at 35 ps), and the S-parameters run to where it is down 60 dB (43.3 GHz). ⟨181⟩ The
common 0.35/tr belongs to a single-pole edge; for the Gaussian edge the factor is 0.3396. ⟨182⟩

A feature shorter than the rise time shows as a softened bump or dip, smaller than its true step. ⟨183⟩ On the 0.6/0.3
via between 25 mm feeds of 51.50 Ω: at 15 ps the trace shows the pads as dips to 48.54 Ω and the barrel as a bump to
55.32 Ω; at 35 ps a single dip to 50.81 Ω is left; at 100 ps 51.19 Ω. ⟨184⟩ Extra capacitance (pads, a wide trace) shows
as a dip, extra inductance (a barrel far from its returns, a narrow neck) as a bump. ⟨185⟩ The flat parts before and
after the via are the feeds' own impedance: 51.4975 Ω here, the trace's 51.4976 Ω. ⟨186⟩

A feed shows a flat part only when its round trip is longer than the rise time: the default 2 mm feeds (1.7 mm from the
pad's edge) take 20.6 ps there and back, less than 35 ps, so the step never settles on them. ⟨187⟩ With the ports right
at the pads the 0.6/0.3 via reads 49.66 to 51.00 Ω at 35 ps. ⟨188⟩ For a pair the TDR drives the two vias in opposite
directions against a 100 Ω differential port, or together against 25 Ω for the common mode. ⟨189⟩ The LVDS pair
between 25 mm feeds dips from 103.36 to 91.65 Ω at 35 ps, to 88.29 Ω at 15 ps and to 97.99 Ω at 100 ps. ⟨190⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `tdr-rho` | `\rho = \frac{Z - Z_\mathrm{ref}}{Z + Z_\mathrm{ref}}` | `tdr.rho` at the cursor |
| `tdr-z` | `Z = Z_\mathrm{ref}\,\frac{1+\rho}{1-\rho}` | `tdr.zRef` [50 Ω; VP 100 Ω], `tdr.z` at the cursor |
| `tdr-roundtrip` | `t = 2\ell\sqrt{\varepsilon_\mathrm{eff}}/c_0` | `feeds[i].length`, `feeds[i].eeff` [1.7 mm, 3.298 → 20.60 ps] |
| `edge-f3` | `f_3 = \frac{2\cdot 1.28155\sqrt{\ln 2}}{2\pi\,t_r} = 0.3396/t_r` | `tr` [35 ps], `f3` [9.7036 GHz] |
| `edge-band` | `f_\mathrm{band} = 2.58\,f_3\ (-20\ \mathrm{dB}),\ f_\mathrm{max} = 4.46\,f_3\ (-60\ \mathrm{dB})` | `band` [25.012 GHz]; `nport.f` last [43.32 GHz] |

**Figures.** 1. The TDR of the 0.6/0.3 via between 25 mm feeds at 15, 35 and 100 ps on one plot, the feed's Z0 as a
dashed line. 2. A sketch of a step meeting a dip and a bump, with the round trip marked (static SVG).

---

## 12. S-parameters and mixed mode

S-parameters describe the via as a sine wave sees it: S11 what returns to the port, S21 what goes through, each
against frequency, usually in dB as 20·log10|S|. ⟨191⟩ The tool chains the ABCD matrix of every piece (barrel lines,
shunt capacitances, stubs, feeds) and turns the product into S at the ports' impedance. ⟨192⟩ The 0.6/0.3 via with its
2 mm feeds between 50 Ω ports: S11 −33.4 dB and S21 −0.002 dB at 10 GHz, S11 −17.3 dB at 25 GHz. ⟨193⟩ The model has
no losses, so |S11|² + |S21|² = 1 at every frequency. ⟨194⟩

For a pair, the four single-ended ports become mixed-mode ports: differential (Sdd) referred to 100 Ω, common (Scc)
to 25 Ω, and Scd and Sdc for conversion between them [BockelmanEisenstadt1995]. ⟨195⟩ The LVDS pair at 10 GHz: Sdd11
−19.4 dB, Sdd21 −0.05 dB, Scc11 −10.3 dB. ⟨196⟩ A symmetric pair converts nothing between the modes in this model
(Scd21 is rounding noise, below −300 dB); unequal stubs or return vias are what convert
[Zhang2020 abstract] [RimoloDonadio2009b abstract]. ⟨197⟩ The plots fade above the frequency where the lumped parts stop
being short (§13). ⟨198⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `abcd-line` | `\begin{bmatrix}\cos\beta\ell & jZ\sin\beta\ell\\ j\sin\beta\ell/Z & \cos\beta\ell\end{bmatrix},\ \beta\ell = 2\pi f\tau` | a piece's `pieces[i].z0`, `delay`; f at the cursor |
| `abcd-shunt` | `\begin{bmatrix}1 & 0\\ j2\pi f\,\Delta C & 1\end{bmatrix}` | `nodes[k].dC`; f at the cursor |
| `s-abcd` | `S_{11} = \frac{A + B/Z_0 - CZ_0 - D}{A + B/Z_0 + CZ_0 + D},\ S_{21} = \frac{2}{A + B/Z_0 + CZ_0 + D}` | `nport.s` at the cursor, Z0 = `z0` [50 Ω] |
| `s-db` | `\lvert S\rvert_\mathrm{dB} = 20\log_{10}\lvert S\rvert` | the plotted value at the cursor |
| `mixed-mode-s` | `S_\mathrm{mm} = M S M^{\mathsf T},\ M = \tfrac{1}{\sqrt2}\begin{bmatrix}1&-1&0&0\\0&0&1&-1\\1&1&0&0\\0&0&1&1\end{bmatrix}` (ports A in, B in, A out, B out) | `nport.s`, `mixed.s`, `mixed.z0` [100, 100, 25, 25 Ω] |

**Figures.** 1. |S11| and |S21| of the 0.6/0.3 via, the band and the λ/8 limit marked. 2. Sdd21, Scc21 and Scd21 of
the LVDS pair.

---

## 13. Where the via model stops

Each lumped part, a pad's window or the section as one element, holds while it is short against the wavelength.
Quasi-static via circuits lose their usable bandwidth as the structure approaches λ/8 [Cartier2007 abstract], so the
tool's limit is c0/(8ℓ√εr) for the longest window. ⟨199⟩ For the 0.6/0.3 via that is 29.5 GHz (the 0.597 mm window at
L4, εr 4.55); for the LVDS pair 23.8 GHz. ⟨200⟩ The flags name each case with its numbers: no return via (refused), a
far return, a return inside an antipad, overlapping pads or antipads in a pair, a shared antipad, a long lumped part,
a stub resonance in the band, a feed over its plane's antipad, and the wider wall. ⟨201⟩ A shared antipad of a
differential via excites higher-order modes, and separate antipads on the outer planes did better mainly at 40–60 GHz
in a full-wave study to 100 GHz [Duan2014 abstract]; the tool flags a shared antipad when the band passes 40 GHz. ⟨202⟩
A feed that crosses its plane's antipad has no plane under it there and is more inductive than the line it is
modelled as. ⟨205⟩

Left out of this model: losses, the return current through the plane cavity, radiation and higher-order modes, and the
coupling of a pair's pads beyond the estimate. ⟨203⟩ A full-wave solver in the browser comes in later steps and will
check these limits on the same vias. ⟨204⟩

**Equations:**

| Id | TeX | Live numbers |
|---|---|---|
| `lambda8` | `f_\mathrm{valid} = \frac{c_0}{8\ell\sqrt{\varepsilon_r}}` | `valid.fMax` [29.452 GHz], `valid.reason` (the window and its εr) |

**Figures.** None beyond the plots' faded part.
