# EM simulation: literature pointers (step M0.2d, 2026-11-16)

Papers for the later steps to look at. **None was opened:** each was checked on Crossref by its DOI (title, authors
and year match; for `Kay1989` and `Kok1993` Crossref has no date and the year is the one in the DOI, for `Wang1994`,
`Mechaik2001`, `Arz2000`, `Birchak1988` and `Archambeault2004` the one in the proceedings' title). "Abstract says"
is a summary of the published abstract in our words; cite a paper on the page only for that until someone opens it.
Full entries with DOIs are in `references.bib` under the keys below.

## 2D field solver (M1.2, M1.4)

| Key | Citation | Abstract says | Useful for |
|---|---|---|---|
| `Wei1984` | Wei, Harrington, Mautz, Sarkar, IEEE TMTT 32(4), 1984 | C and L matrices of multiconductor lines in any number of dielectric layers, over one plane or between two; free-space Green's function with total charge on conductor–dielectric and polarization charge on dielectric–dielectric interfaces; pulse basis, point matching; thick and zero-thickness conductors. | M1.2: the same formulation as solver.md §2 (total charge, free-space kernel, images); the classic to cite for it. |
| `Delbare1989` | Delbare, De Zutter, IEEE TMTT 37(10), 1989 | Layered-medium space-domain Green's function as kernel (only conductors meshed), polygonal and zero-thickness conductors, basis functions that model the edge singularity of the charge exactly. | M1.2: the alternative solver.md §6 rejected (layered kernel, singular basis); M1.4: its examples as reference values. |
| `Wang1994` | Wang, Pan, Gilbert, IEEE MTT-S IMS Digest, 1994 | BEM with the total charge expanded in orthogonal wavelets; sparse matrix; curved interfaces treated accurately; agrees with published data. | M1.2: only if dense LU becomes the bottleneck (notes-M0.3: pair 57 ms). |
| `Cecchini2001` | Cecchini, Bardati, Ravanelli, IEEE TMTT 49(4), 2001 | 2D BEM that factors the charge near composed wedges (copper meeting dielectric) into a known singular part and a regular part, needing only the singularity order; better accuracy and convergence; example: microstrip with a thick strip. | M1.2: the triple points of copper, laminate and mask, if grading alone leaves the drift notes-M0.3 describes. |
| `Zhechev2026` | Zhechev, Maksimov, Murmansky, …, Kuksenko, IEEE TMTT, 2026 | Corner charge singularities (sharpened by trapezoidal etch) limit quasi-static MoM; a generalized wedge equation gives the local exponent at corners of any etch angle and metal–dielectric junctions, error equidistribution turns it into a closed-form grading; charge-based refinement criteria stall at accuracy ceilings; holds 10⁻⁴ in capacitance on 11 of 12 benchmarks with half the unknowns; iterative criteria fail silently on some. | M1.2: grading per corner instead of one q = 2, and a warning for the |Z(M) − Z(M/2)| estimate; the most relevant paper found. |
| `Peterson2016` | Peterson, Graglia, IEEE JMMCT, 2016 | Review of scalar and vector basis functions for field singularities at edges and corners. | M1.2: background if singular bases are reconsidered. |
| `Zheng2008` | Zheng, Xie, Yao, Cai, PIER Letters, 2008 | Conformal transformation maps an unscreened (open) slab line to a finite boundary problem solved by BEM; three examples. | M1.2: another way to handle open domains; M1.4: slab-line reference cases. |
| `AlQedra2013` | Al-Qedra, Okhmatovski, USNC-URSI, 2013 | Electrostatic Green's function of planar layered media computed by higher-order FEM, so only conductor charge is unknown. | M1.2: if interface panels ever dominate the cost. |
| `SheikhHosseiniLori2017` | Sheikh Hosseini Lori, …, Okhmatovski, IEEE TMTT, 2017 | Higher-order MoM (surface-volume-surface EFIE) for the R and L matrices of lines with complex cross sections over a wide frequency range; checked against canonical currents and FEM. | Phase 2 losses (later.md): frequency-dependent R and L. |
| `Hwang2006` | Hwang, Given, Phys. Rev. E 74, 2006 | Last-passage Monte Carlo algorithm for mutual capacitance; checked on the circular-disk parallel-plate capacitor. | M1.4: a third, fully independent method, if the FD check ever needs one. |

## Pair impedance definitions (M1.3)

| Key | Citation | Abstract says | Useful for |
|---|---|---|---|
| `Carin1989` | Carin, Webb, IEEE Trans. Magn. 25(4), 1989 | Compares two definitions of modal characteristic impedance for multiconductor microstrip; their sensitivity to numerical error; negative modal impedances are plausible for asymmetric three-line (two-mode) cases. | M1.3: why per-mode impedances are not shown as "the" impedance of asymmetric structures; the matrix Zc stays the result. |
| `Nickel2001` | Nickel, Trainor, Schutt-Ainé, IEEE TEMC 43(4), 2001 | Extracts the normal-mode parameters of asymmetric coupled microstrip (characteristic impedance matrix, mode propagation constants and configurations, p.u.l. parameters) from S-parameters; quasi-TEM expressions of S in terms of them. | M1.3: the same quantities as solver.md §3 from the measurement side; M6/M7: a check of the N-port. |
| `Huynh2007` | Huynh, Håkansson, Gong, EuMC, 2007 | The usual single-ended to mixed-mode S conversion only holds when the odd- and even-mode impedances are 50 Ω; the correct conversion includes them. | M1.3, M1.7: mixed-mode port references. |
| `Wan1996` | Wan, IEEE TMTT 44(1), 1996 | Closed form for coupled microstrip by modified conformal mapping and a magnetic wall: εeff of both modes within 0.4 %, Zeven within 1.2 %, Zodd within 1.8 % (w/h ≥ 0.4) and 3.8 % (0.1–0.4) against numerical results. | M1.4: a calculator formula with stated accuracy, besides Kirschning–Jansen. |
| `Garg1979` | Garg, Int. J. Electronics 47(6), 1979 | Closed-form even and odd capacitances of coupled microstrip within 3 % for 0.2 ≤ W/h ≤ 2, 0.05 ≤ S/h ≤ 2; extended to asymmetric pairs, about 5 % in the case shown (εr 10). | M1.4: one of few closed forms for asymmetric pairs. |
| `Wu2018` | Wu, Grassi, Manfredi, Vande Ginste, IEEE TEMC, 2018 | Perturbative prediction of differential-to-common-mode conversion from imbalance and nonuniformity; checked against full-wave and measurement. | M1.3 tolerance view; phase 2 (mode conversion). |
| `Anusorn2024` | Anusorn, …, Torrungrueng, IEEE Access, 2024 | Bi-characteristic-impedance line model for asymmetric reciprocal lines; extracts both impedances and γ from S-parameters. | M1.3: one more definition to name if asked, not to adopt. |
| `Marynowski2010` | Marynowski, Kowalczyk, Mazur, PIER 110, 2010 | The characteristic impedance of lossless microstrip and coplanar lines is ambiguous because of the longitudinal displacement current, much more for coplanar lines. | M1.3/M1.5: the validity note on coplanar results at high frequency. |
| `Mechaik2001` | Mechaik, ISQED, 2001 | Numerical single-ended, differential and common-mode impedances of microstrip and stripline in a stackup against w/h and s/h; termination for PCI and LVDS. | M1.3: background for the even, odd and common-mode labels. |
| `Arz2000` | Arz, Williams, Walker, …, Grabinski, IEEE MTT-S IMS, 2000 | Asymmetric coupled lines in 0.25 µm CMOS, 50 MHz–26.5 GHz: line parameters from four-port measurements agree with numerical calculation. | M1.3: evidence that the modal (matrix) description fits measurements of asymmetric pairs. |
| `Koledintseva2016` | Koledintseva, Vincent, IEEE EMC, 2016 | Full-wave study of how weak or strong coupling changes mixed-mode S of slightly length-imbalanced microstrip and stripline pairs. | Phase 2: mode conversion; M1.3 coupling labels. |
| `Yan2026` | Yan, Nie, Zhang, Qin, IEEE TCPMT, 2026 | Full-wave study of differential-mode non-TEM dispersion in microstrip pairs; a fitted closed form for the dispersion-onset frequency from geometry and coupling; quasi-static results degrade quickly once the Nyquist frequency exceeds it. | M1.3/M1.5: a quantitative validity flag for pairs (engine.md §8). |

## Calculators against field solvers and measurements (M1.4, M1.1, M1.3)

| Key | Citation | Abstract says | Useful for |
|---|---|---|---|
| `Bongiorno2015` | Bongiorno, Mariscotti, Measurement, 2015 | No abstract in Crossref or OpenAlex; the title: the variability of microstrip formulas as a source of uncertainty. | M1.4: the spread between calculators; worth opening. |
| `Schellenberg1995` | Schellenberg, IEEE TMTT 43(6), 1995 | CAD models for suspended and inverted microstrip over 0.1 ≤ w/h ≤ 10, εr 3.78 and 12.9: the best old model has 2.94 % maximum (1.28 % mean) error; new ones 0.65 % and 1.02 % maximum. | M1.4: how a formula's accuracy is stated; not our structures. |
| `Birchak1988` | Birchak, Haill, ITC, 1988 | Equations for impedance, coupling capacitance and inductive coupling of PCB stripline and microstrip, checked by measurement on many geometries. | M1.4: an early measured comparison. |
| `Chen2017` | Chen, ECTC, 2017 | 3D full-wave and 2D quasi-static models of uniform microstrip agree except in return loss and TDR, caused by loose 3D convergence settings; the 2D result with a dense mesh is the impedance target. | M1.4/M6: why our 2D impedance is the reference for full-wave runs. |
| `Phung2026` | Phung, Flisgen, Streitenberger, …, Heinrich, IEEE SPI, 2026 | Two quasi-analytical microstrip models compared with full-wave up to 500 GHz. | M1.4/M1.5: where dispersion formulas stop holding. |
| `Chen2021` | Chen, Ye, Hu, …, Chen, ICEMI, 2021 | Circuit and field models of how solder mask type and thickness change εeff, impedance, return and insertion loss; 3D simulation. | M1.1/M1.4: mask, besides facts-fab.md. |
| `Gong2022` | Gong, Sun, Liu, IEEE TCPMT, 2022 | Conformal coating by conformal mapping and FEM: 1.5 mm of coating lowers the impedance of a 25 mil, 10 in line by 4.2 Ω and adds 0.53 dB to S21 at 1 GHz. | M1.4: a dielectric-cover case to compare with. |
| `Koledintseva2015` | Koledintseva, Vincent, Radu, IEEE EMCSI, 2015 | Full-wave analysis of edge-coupled microstrip pairs with roughness, solder mask, rectangular and trapezoidal traces; imbalance causes mode conversion. | M1.1: trapezoid and mask in one study. |
| `Anderson2014` | Anderson, Henderson, Aroor, WMCS, 2014 | Etch-induced dimensional errors (sidewall curvature) matter for CPW at mm-wave where lines are tens of µm wide. | M1.1: etch shape; phase 2. |
| `Anderson2015` | Anderson, Aroor, Henderson, IET MAP 9(14), 2015 | εr and tanδ from coplanar lines by closed forms with as-fabricated dimensions, within 10 % of known values, error analysis on Isola FR408 up to 110 GHz. | M1.1: εr against frequency; phase 2. |
| `CortesHernandez2017` | Cortes-Hernandez, …, Torres-Torres, IEEE TMTT, 2017 | Zc and complex permittivity of single-ended and edge-coupled PCB lines from measured γ and computed R and L; agrees with datasheets at 4 GHz. | M1.1/phase 2: frequency-dependent εr from measurements. |
| `Araneo2002` | Araneo, Celozzi, Maradei, IEEE SPI, 2002 | Expressions for εeff and p.u.l. parameters of dispersive substrates for design. | M1.3 sweeps: εr(f). |
| `Hill2006` | Hill, Wojewoda, IEEE Trans. Adv. Packag., 2006 | Reproducibility of εr measured with the Agilent 4291B (1 MHz–1 GHz): 6 % to 12 % across operators and days on ABF and FR5. | M1.3 tolerance: the size of εr uncertainty. |
| `HernandezBonilla2024` | Hernandez-Bonilla, …, Schuster, IEEE SPI, 2024 | Measured cross sections of two automotive boards (10 in striplines) in a 2D MoM solver with polynomial chaos: insertion loss uncertainty to 20 GHz depends more on dielectric properties than on dimensions; among dimensions roughness matters most. | M1.3 Monte Carlo: inputs from real cross sections. |
| `Renbi2011` | Renbi, Carlson, Delsing, IMAPS, 2011 | 3 × 20 boards from three makers, same 50 Ω trace: measured impedance off by 3 %, 10 % and 20 % by maker; 2.6–3.5 % spread within a batch. | M1.3: what the fab tolerance means in practice. |
| `Kay1989` | Kay, Pomerleau, Steer, IEEE SoutheastCon, 1989 | Empirical statistical analysis of PCB lines from S-parameters (Z0 and γ) for worst-case design. | M1.3: tolerance analysis background. |

## Vias (M1.6, M1.7)

| Key | Citation | Abstract says | Useful for |
|---|---|---|---|
| `Kok1993` | Kok, De Zutter, IEEE EPEP, 1993 | Quasi-static integral equation for the excess capacitance and inductance of a via with strips, pads and finite plane thickness; effect of pad and opening size. | M1.6: the same quantity as solver.md §4; reference values. |
| `Kok1994` | Kok, De Zutter, IEEE TMTT 42(7), 1994 | Excess inductance of vias from a scalar magnetic potential integral equation, flux through a cut; grounded via as a limit. | M1.6/M1.7: the inductance side and the "cut" idea. |
| `Friedrich2012b` | Friedrich, Leone, Bednarz, IEEE TEMC, 2012 | Exact analytical via-plate capacitance from Laplace's equation in cylindrical subdomains (barrel and pad, antipad, plate); one coefficient gives it; checked by 2D static and 3D full-wave. | M1.6: an exact check of the axisymmetric solver. |
| `Friedrich2012c` | Friedrich, Leone, EMC Europe, 2012 | The same via-plate solution combined with the cavity impedances of plane pairs into a multiport; small structures reduce to coupled port inductances; checked by full-wave and measurement. | M1.7: when planes form cavities. |
| `Friedrich2012a` | Friedrich, Leone, IEEE TEMC, 2012 | Quasi-static port inductance of vertical interconnections between parallel planes from a magnetostatic vector-potential problem; agrees with the low-frequency limit of the modal solution. | M1.7: barrel inductance between planes. |
| `Friedrich2013` | Friedrich, Bednarz, Leone, IEEE TEMC, 2013 | The magnetic-frill via-plate capacitance disagrees with exact and numerical results for large pads because of an inconsistent admittance definition; a complex-power expression fixes it. | M1.6: do not use the frill formula as a check for large pads. |
| `Zhang2008` | Zhang, Fan, Selli, …, De Paulis, IEEE TMTT 56(9), 2008 | Via barrel-plate capacitance from higher-order parallel-plate modes in a bounded coaxial cavity (PEC, PMC or PML walls); convergence with mode count and outer wall radius discussed; checked by quasi-static numerics and measurement. | M1.6: the outer wall radius R_w choice. |
| `Gao2019` | Gao, Liu, EMC Sapporo/APEMC, 2019 | Review of the physics-based via model; a fast-converging barrel-plate capacitance without underflow; a capacitor-free model. | M1.6/M1.7. |
| `RimoloDonadio2009a` | Rimolo-Donadio, Gu, Kwark, …, Schuster, IEEE TMTT 57(8), 2009 | Analytical via models with parallel-plate impedance and capacitive elements, trace-via transitions by modal decomposition, to 40 GHz; thru, buried and power vias. | M1.7: the standard physics-based model. |
| `Selli2006` | Selli, Schuster, Kwark, IEEE EMC, 2006 | Physics-based via model with parallel-plate impedance compared with measurements. | M1.7. |
| `Muller2011` | Müller, Duan, Rimolo-Donadio, …, Schuster, ICEAA, 2011 | Review of via modelling by multiple scattering and equivalent circuits, and of the return current path in each. | M1.7: overview to read first. |
| `Chada2009` | Chada, Zhang, Feng, …, Fan, IEEE EMC, 2009 | Closed-form impedance of an infinite plane pair when shorting vias surround the signal via, so edge reflections can be ignored. | M1.7: return vias around a via. |
| `Archambeault2004` | Archambeault, Connor, Zhang, …, Ruehli, IEEE EMC, 2004 | Quasi-static equivalent circuit of a via against full-wave: the frequency range where it holds as the return via moves away. | M1.7: the validity flag's numbers. |
| `Cartier2007` | Cartier, Sivaprasad, ECTC, 2007 | Measured plated-through-hole vias, 100 MHz–20 GHz: usable bandwidth of quasi-static models as the structure approaches λ/8. | M1.7: validity flag. |
| `Chang2008` | Chang, Archambeault, …, Drewniak, EMC Europe, 2008 | Fast equivalent circuit for a via whose return current changes planes, with antipad capacitance and cavity effects, against the distance to a return via. | M1.7. |
| `Xu2017` | Xu, Wang, Zhang, …, Fan, IEEE EMCSI, 2017 | Survey of differential via models (π RLC, differential line with via-plate capacitance and εeff, parallel-plate impedance) compared with HFSS mixed-mode S. | M1.7: pairs. |
| `Simonovich2011` | Simonovich, Bogatin, Cao, IEEE TCPMT 1(5), 2011 | Differential via as a line with analytical Z and εeff, no measured or simulated data needed. | M1.7: the simplest pair model to compare. |
| `Kushta2003` | Kushta, Narita, Kaneko, …, Tohya, IEEE MWCL 13(5), 2003 | Stub resonance of a through via into a stripline, with ground vias, simulated and measured to 20 GHz. | M1.7: stub check. |
| `RimoloDonadio2009b` | Rimolo-Donadio, Duan, Brüns, Schuster, IEEE SPI, 2009 | An asymmetric ground via arrangement near a link end raises mode conversion about as much as trace length mismatch. | M1.7/phase 2. |

## Worth opening in full

Ranked; for the owner to fetch if wanted (open access marked).

1. `Zhechev2026`, DOI 10.1109/TMTT.2026.3736651: closed-form grading from wedge exponents and why refinement criteria
   stall; bears on M1.2's drift and error estimate.
2. `Wei1984`, DOI 10.1109/TMTT.1984.1132696: our formulation's origin; its tables are reference values for M1.4.
3. `Friedrich2012b`, DOI 10.1109/TEMC.2012.2189573: exact via-plate capacitance, the check M1.6 needs.
4. `Kok1993`, DOI 10.1109/EPEP.1993.394571, and `Kok1994`, DOI 10.1109/22.299761: excess C and L of a via, the
   quantities of solver.md §4–5.
5. `Bongiorno2015`, DOI 10.1016/j.measurement.2015.05.014: the spread between calculators (no abstract to go by).
6. `Carin1989`, DOI 10.1109/20.34333: modal impedance definitions and negative values.
7. `Yan2026`, DOI 10.1109/TCPMT.2026.3711650: the pair dispersion-onset frequency for a validity flag.
8. `Zhang2008`, DOI 10.1109/TMTT.2008.2002237: wall radius and convergence of the barrel-plate capacitance.

Open access among the kept: `Zheng2008` and `Marynowski2010` (PIER), `Anusorn2024` (IEEE Access).

## Dropped

Of 84 candidate papers checked on Crossref, 7 were not verified (title, first author or year did not match, or
Crossref listed no authors) and are not used. 20 verified items were left out after reading their abstracts as off
topic or redundant. About 150 further cited items were off topic for this tool and were not checked.
