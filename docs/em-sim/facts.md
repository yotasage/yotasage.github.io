# EM simulation – facts (research of 2026-11-16, step M0.2a)

The conventions, definitions and exact solutions the engine (engine.md §1–§6) and the theory rely on, each with a source
or a short derivation. The closed-form calculator formulas and the via formulas are in
[facts-formulas.md](facts-formulas.md) (split off to keep each file under 40 kB); the numeric cases are in
[facts-cases.md](facts-cases.md); what each source may be cited for is in [sources.md](sources.md). Keys in `code` are
entries of `references.bib`. **Not opened** means the source itself was not read in this step; such a statement rests on
the derivation given here or on the opened secondary named beside it.

Sections: 1 conventions · 2 quasi-TEM and its limits · 3 one line · 4 the multiconductor line · 5 pair impedances
(every definition, the default) · 6 coupling coefficients · 7 fields · 8 exact solutions · 9 why calculators disagree ·
10 JLCPCB · 11 KiCad fields (both in [facts-fab.md](facts-fab.md), step M0.2b).

## 1. Conventions and constants

| Item | Statement | Source |
|---|---|---|
| Constants | c0 = 299 792 458 m/s (exact); μ0 = 1.256 637 061 27 × 10⁻⁶ H/m (CODATA 2022, rel. unc. 1.6 × 10⁻¹⁰); ε0 = 1/(μ0 c0²) = 8.854 187 819 × 10⁻¹² F/m; η0 = μ0 c0 = 376.730 313 4 Ω. μ0 ≠ 4π × 10⁻⁷ since 2019 (differs by 5.5 × 10⁻¹⁰, visible only in the 10th digit). | `CODATA2022` (opened: NIST value page of μ0) |
| Units | Lengths in mm in the engine, everything else SI (engine.md §1). Per-unit-length quantities in F/m, H/m. | engine.md §1 |
| Phasors | e^{jωt}, as the Smith chart (docs/smith-chart/facts.md §1). | `Ellingson2018` §1.5 |
| Frames | Board frame (x, y, z), z up from the bottom surface. Cross-section (u, z) with the line along +v; **(u, v, z) is right-handed** (decided here: a line along +y has u = +x). Via frame (r, z) or (x, z). | engine.md §1; handedness decided in M0.2a |
| Voltages, currents | Vk is conductor k's potential against the reference conductors (all planes and grounds, one net at 0 V). Ik flows in conductor k along +v; the return current flows in the references. | Paul (`Paul2008`, ch. 2–3, not opened); standard |
| Telegrapher's equations (lossless) | −∂V/∂v = L ∂I/∂t, −∂I/∂v = C ∂V/∂t, V and I vectors of the n signal conductors. | `Paul2008` (not opened); `Pozar2012` §2.1 for n = 1 (not opened); derivation from Faraday and charge conservation per unit length |
| Maxwell capacitance matrix | Q = C·V (charge per unit length). Cii > 0, Cij ≤ 0 (i ≠ j), C symmetric positive definite, row sums Σj Cij ≥ 0. Circuit form: capacitance to ground of conductor i is Σj Cij, mutual capacitance between i and j is Cm,ij = −Cij. **The engine reports the Maxwell matrix**; every formula below that writes Cm means −C12. | `Paul2008` (not opened); standard electrostatics (Green's reciprocity gives the symmetry) |
| Inductance matrix | Flux per unit length Ψ = L·I; L symmetric positive definite, Lij > 0. | `Paul2008` (not opened) |

## 2. Quasi-TEM and when it holds on PCBs

A line in one homogeneous dielectric carries an exact TEM mode; with several dielectrics (microstrip, mask, mixed
prepreg and core) the fundamental modes have small longitudinal fields, which vanish as f → 0. The quasi-TEM model
keeps the static C (with dielectrics) and L (from C0) and is exact in the limit f → 0 (`Paul2008`, `Pozar2012` §3.8,
both not opened; the statement follows from the static limit of Maxwell's equations). Estimates for the owner's kind of
board (prepreg h ≈ 0.09 mm, εr ≈ 4.3, 50 Ω microstrip; computed in M0.2a):

| Limit | Formula | Number | Source |
|---|---|---|---|
| Microstrip dispersion (Getsinger) | εeff(f) = εr − (εr − εeff)/(1 + G(f/fp)²), fp = Z0/(2μ0 h), G = 0.6 + 0.009·Z0 (Z0 in Ω) | fp ≈ 224 GHz; εeff rises 0.10 % at 10 GHz, 0.6 % at 25 GHz | `Getsinger1973` (not opened) from `QucsTech` §11.1 (opened); numbers computed |
| Microstrip dispersion (Kirschning–Jansen 1982) | facts-formulas.md §3.4; range 0.1 ≤ W/h ≤ 100, 1 ≤ εr ≤ 20, h/λ0 ≤ 0.13, better than 0.6 % | — | `KirschningJansen1982` (not opened) from `QucsTech` |
| Surface-wave TE1 onset (microstrip) | f = c0/(4h√(εr − 1)) | ≈ 446 GHz | Standard grounded-slab result (`Pozar2012` §3.8, not opened) |
| Parallel-plate higher modes (stripline, plane pairs) | TE1/TM1 cutoff f = c0/(2b√εr), b plate spacing | b = 0.3 mm: ≈ 241 GHz | Parallel-plate guide (`Pozar2012` §3.2, not opened); derived from the half-wave condition |
| Plane-pair TM0 (via return) | The TEM radial mode between two planes has **no cutoff**: a via without a nearby return via launches it at every frequency. Board cavity resonances (open edges as magnetic walls): f_mn = c0/(2√εr)·√((m/a)² + (n/b)²) | 50 × 50 mm board, εr 4.3: f10 ≈ 1.45 GHz | Derived (rectangular cavity with magnetic walls); `Pozar2012` §6.3 (not opened) |
| Electrically small cross-section | Quasi-static C and L need the cross-section ≪ λ. λ in εr 4.3 at 10 GHz is 14.5 mm; a 0.3 mm cross-section is 0.02 λ. | — | Derived |

**Consequence for the tool:** for PCB traces on thin dielectrics (≤ 0.2 mm) the quasi-TEM result is within about 1 %
up to 20–30 GHz; the full-wave check (D5) is where this fails first for vias (no return via, long stubs), not for
traces. The page states the frequency at which the Getsinger estimate exceeds the solver's error (engine.md §8 decides
the display). Dispersion itself is out of scope in phase 1 (shown as a validity note, not applied).

## 3. One line: Z0, εeff, delay

For n = 1 with C and L per unit length (lossless): Z0 = √(L/C), v = 1/√(LC), delay per length τ = 1/v = √(LC),
εeff = (c0/v)² = C/C0 (since L = μ0ε0/C0, §4), Z0 = 1/(v·C) = 1/(c0√(C·C0)), λ = λ0/√εeff. Sources: `Pozar2012`
§2.1 (not opened); `Ellingson2018` §3.11 (opened: β = β0√εeff, v = c/√εeff, λ = λ0/√εeff); the C/C0 form is the
definition of εeff used by every quasi-static solver (derivation: §4 with n = 1).

## 4. The multiconductor line (D3)

**L from C0.** In a homogeneous medium of ε and μ the TEM modes satisfy L·C = με·1 (`Paul2008` ch. 3, not opened).
Dielectrics are non-magnetic, so L does not change when they are replaced by vacuum: **L = μ0ε0·C0⁻¹**, with C0 the
Maxwell matrix with every εr set to 1. Derivation: L depends only on μ (= μ0 everywhere) and the conductor geometry;
in vacuum L·C0 = μ0ε0·1. (Assumes perfect conductors with surface currents, i.e. skin depth ≪ conductor size: 2.1 µm
in copper at 1 GHz against 18–35 µm copper. At low frequency the internal inductance adds; phase 2.)

**Modes.** For waves e^{jωt − jβv}, the voltages satisfy (L·C)·V = (1/v²)·V. L·C is not symmetric; the engine uses the
symmetric form (derivation: similarity transform):

- W = C^{1/2}·L·C^{1/2} (symmetric positive definite), W = U·Λ·Uᵀ with U orthogonal, Λ = diag(1/v_m²);
- modal voltages Tv = C^{−1/2}·U, modal currents Ti = C^{1/2}·U; then (L·C)·Tv = Tv·Λ, (C·L)·Ti = Ti·Λ, Tvᵀ·Ti = 1;
- mode m: velocity v_m, **εeff,m = (c0/v_m)²**, a forward wave V = Tv,m·a carries I = v_m·Ti,m·a;
- **modal impedance of conductor k in mode m** (Tripathi's c- and π-mode impedances for a pair):
  Z_k,m = (Tv)_km / (v_m·(Ti)_km) (`Tripathi1975`, not opened; derived here);
- **characteristic impedance matrix** Zc (forward waves V = Zc·I): Zc·C·Zc = L (from both telegrapher's equations),
  whose symmetric positive definite solution is **Zc = C^{−1/2}·W^{1/2}·C^{−1/2} = Σ_m Tv,m·Tv,mᵀ / v_m**,
  Yc = Zc⁻¹ = Σ_m v_m·Ti,m·Ti,mᵀ. For n = 1 this is √(L/C). A Cholesky factor R (C = RᵀR) can replace C^{1/2}:
  Zc = R⁻¹·(R L Rᵀ)^{1/2}·R⁻ᵀ (the same matrix; M0.3 picks).
- Check (homogeneous medium, C = εr·C0): W = μ0ε0εr·1, every mode at v = c0/√εr, and Zc = C⁻¹/v; for n = 1 this is
  Z0 = 1/(vC).

**Degenerate modes.** When eigenvalues of W coincide (homogeneous medium: all coincide; two far-apart identical lines:
nearly), U is not unique inside the cluster. **Zc, Yc and every pair quantity of §5 are functions of W only and do not
depend on that choice**, so the tool computes every impedance from Zc, never from individual mode vectors. For display
(mode shapes, the field of "the odd mode"), proposal of this step: inside a cluster of eigenvalues equal to a relative
tolerance (M0.3 sets it, near the solver's error), choose U as the eigenvectors of the restriction of C to the cluster
(PᵀCP, P an orthonormal basis of the cluster); for a symmetric pair this gives the even and odd modes, and in general a
symmetry-adapted set; if C is degenerate there too, order by the conductor numbering. Nearly degenerate modes make
Tv and Ti ill-conditioned, not Zc: one more reason to report from Zc.

## 5. Pair impedances: every definition in use

Mixed-mode quantities (Bockelman–Eisenstadt, `BockelmanEisenstadt1995`, not opened; the definitions below are the
ones mixed-mode S-parameter tools use; they make the powers add up and give the
factors 2 and ½ that Polar AP157, `PolarAP157`, opened, states in words): **Vd = V1 − V2, Id = (I1 − I2)/2,
Vc = (V1 + V2)/2, Ic = I1 + I2.** With these, V1·I1 + V2·I2 = Vd·Id + Vc·Ic (check by expanding), and a single-ended
reference Z0 at each port becomes Zd = 2·Z0 and Zc = Z0/2 for the mixed-mode S-parameters.

**Symmetric pair** (mirror-symmetric conductors and surroundings, C11 = C22, L11 = L22): the modes are exactly even
(V1 = V2) and odd (V1 = −V2):

- **Zodd** = √((L11 − L12)/(C11 − C12)) (with Maxwell C12 < 0, C11 − C12 = Cg + 2Cm); εeff,odd = (C11 − C12)(L11 − L12)/(μ0ε0)
- **Zeven** = √((L11 + L12)/(C11 + C12)) (C11 + C12 = Cg); εeff,even likewise
- **Zdiff = 2·Zodd, Zcm = Zeven/2** (differential: between the lines driven in opposite polarity; common: both driven
  together against the reference).

Sources: Polar AP157 (opened: "Zdiff is twice the value of the odd mode impedance", even mode is twice the common mode,
and the four test descriptions); `BockelmanEisenstadt1995` (not opened); derivation from §4 with Tv = (1, ±1).

**Asymmetric pair** (different widths, layers or surroundings): the modes are no longer even/odd (and, with several
dielectrics, travel at different speeds); four definitions are in use:

| # | Name | Zdiff | Zcm | Meaning |
|---|---|---|---|---|
| A | **Mixed-mode transform of Zc** (tool default) | Zdd = Zc11 + Zc22 − 2·Zc12 | Zcc = (Zc11 + Zc22 + 2·Zc12)/4 | Vd/Id of an infinitely long (matched) pair driven by a pure differential **current** (I1 = −I2). Off-diagonal Zdc = Zcd = (Zc11 − Zc22)/2 measures mode conversion. |
| B | Voltage drive | 4/(Yc11 + Yc22 − 2·Yc12) | 1/(Yc11 + Yc22 + 2·Yc12) | Vd/Id for a pure differential **voltage** (V1 = −V2). Equals A when Zc11 = Zc22. |
| C | Modal (Tripathi) | four impedances Z_k,m (§4): Zc1, Zc2 (c mode), Zπ1, Zπ2 (π mode), with voltage ratios Rc, Rπ | — | The natural description of an asymmetric pair (`Tripathi1975`, not opened); a "differential" number from the π mode alone is (V1 − V2)/((I1 − I2)/2) of that mode. |
| D | Symmetric formulas applied to one line | 2·√((L11 − L12)/(C11 − C12)) | √((L11 + L12)/(C11 + C12))/2 | What a symmetric-pair calculator gives when fed an asymmetric pair. Not a valid definition; listed because it is met in practice. |

Derivation of A and B: with Mv = [[1, −1], [½, ½]] (V → (Vd, Vc)) and Mi = [[½, −½], [1, 1]] (I → (Id, Ic)), the
mixed-mode impedance matrix of the line is Zmm = Mv·Zc·Mi⁻¹, Mi⁻¹ = [[1, ½], [−1, ½]], giving the entries of row A;
row B is the same with Ic = 0 replaced by Vc = 0 (Yc instead of Zc). For a symmetric pair, Zc11 = Zc22 = (Zeven + Zodd)/2
and Zc12 = (Zeven − Zodd)/2, so A, B and D all give 2·Zodd and Zeven/2.

**How far apart they are** (rough finite-difference estimate of M0.2a, method in §9): a microstrip pair 0.11 and
0.20 mm wide, gap 0.2 mm, h = 0.0925 mm, t = 0.035 mm, εr 4.3, no mask: A = 94.1 Ω, B = 92.0 Ω, D (from line 1) =
108.7 Ω; the symmetric 0.11/0.2/0.11 pair gives 107.7 Ω by all three. So A and B differ by about 2 % for a strongly
asymmetric pair, and D is wrong by 15 %.

**What the calculators report.** Polar SI9000: Zodd, Zeven, Zdiff = 2·Zodd and Zcommon = Zeven/2 for its
symmetric structures (AP157, opened; the page says Si8000/Si9000 use 2D field solvers to extract both); **Polar's
definition for asymmetric structures is not documented in any page opened** (AP157 does not discuss them). JLCPCB's
calculator (M0.2b, [facts-fab.md](facts-fab.md) §1.8): its definition and solver are **not documented**, but it offers
only symmetric edge-coupled and coplanar pairs, for which A, B and D all give 2·Zodd, so the definition does not matter
for what it reports.

**The tool's default: definition A** (Zdiff = Zdd, Zcm = Zcc of the mixed-mode transform of Zc), with Zdc shown when
it is not negligible. Why: it equals 2·Zodd and Zeven/2 for symmetric pairs (agrees with Polar, JLCPCB's likely
definition and Bockelman–Eisenstadt); it is the diagonal of the line's own mixed-mode impedance matrix in the
Bockelman–Eisenstadt variables, so it is what a mixed-mode S-parameter model of the line (engine.md §6, 4-port with
mode conversion) is built from; it depends on Zc only, so it is well defined when modes are degenerate; it is cheap.
B and C are offered in the details view, D is never shown.

## 6. Coupling coefficients (NEXT, FEXT)

Weak coupling, matched lines, aggressor 1 driven by a wave f(t − v/vel) (derivation, first-order perturbation: the
mutual capacitance injects a shunt current Cm·∂V1/∂t per length that splits equally both ways; the mutual inductance
a series voltage Lm·∂I1/∂t that adds to the backward wave and subtracts from the forward one; `Paul2008` crosstalk
chapter and `Bogatin2018` ch. 10 give the same, both not opened). With C = C11, Cm = −C12, L = L11, Lm = L12:

- **Backward (near-end) coefficient kb = ¼·(Cm/C + Lm/L)**; V_NEXT(t) = kb·[f(t) − f(t − 2T)], T the line delay. For a
  long line and a step, the plateau is kb.
- **Forward (far-end) coefficient kf = (1/(2v))·(Cm/C − Lm/L)** (s/m); V_FEXT(t) = kf·ℓ·f′(t − T). In a homogeneous
  medium Cm/C = Lm/L and FEXT vanishes; microstrip has Lm/L > Cm/C, so FEXT is negative.
- Strongly coupled symmetric pair in a homogeneous medium, terminations √(Zeven·Zodd), step on line 1: before the
  far end's reflection returns, V2/V1 = (√Zeven − √Zodd)/(√Zeven + √Zodd) (derived from the even/odd decomposition);
  for weak coupling this is ≈ kb. The coupler's voltage coupling factor k = (Zeven − Zodd)/(Zeven + Zodd) (λ/4 coupler at
  its centre frequency) is ≈ 2·kb (`Pozar2012` §7.6, not opened; derived: f(t) − f(t − 2T) doubles a sinusoid when
  2T is half a period).
- Estimate (§9's method): the symmetric 0.11/0.2/0.11 microstrip pair gives kb = 0.037 and kf·v = −0.035, odd and even
  εeff 2.66 and 3.06.

In general (n lines, inhomogeneous) the tool computes crosstalk from the modal solution (§4) cascaded as engine.md §6;
kb and kf are the readouts for a pair.

## 7. Fields of the quasi-TEM mode

**E field.** For conductor voltages V (a mode's Tv,m, or any drive) the transverse E is −∇φ of the solve **with**
dielectrics, φ = V on the conductors (linear combination of the unit-potential solutions the solver keeps, engine.md §4).

**H field** (derivation; assumes μr = 1 everywhere, perfect conductors, surface currents). The magnetic problem is the
vacuum problem: Az satisfies Laplace's equation outside the conductors with Az constant on each, Az,k = (L·I)k. Since
L = μ0ε0·C0⁻¹, Az = V0/c0 where V0 = C0⁻¹·Q0 are the potentials of the **vacuum** solve with charges Q0 = I/c0. Hence

- **H = (1/η0)·v̂ × E0**, with E0 the vacuum field of the charges Q0 = I/c0 (wave along +v; with (u, v, z) right-handed,
  Hu = E0,z/η0 and Hz = −E0,u/η0);
- the surface current density on conductor k is J_s = c0·ρ_s,0 (ρ_s,0 the vacuum solve's surface charge), so the
  current distribution needs no second solve (engine.md §4 keeps both solves' panel charges);
- for a mode, I = v_m·Ti,m·a (§4). For a wave travelling along −v, H changes sign.

Check: in a homogeneous medium E0 ∝ E and H = (1/η)·v̂ × E, the TEM relation (`Pozar2012` §3.1, not opened).
Stored energies per length: We = ½·Vᵀ·C·V, Wm = ½·Iᵀ·L·I; equal for a quasi-TEM mode (derivation from Zc·C·Zc = L).

## 8. Exact solutions (all quasi-static, zero-thickness strips where stated)

η = η0/√εr, ε = ε0εr; for a homogeneous medium Z0 = 1/(v·C) and L = μ0ε0/C0. Numbers in facts-cases.md.

| Structure | Exact result per unit length | Source | Cross-check (facts-cases.md) |
|---|---|---|---|
| Coax, inner radius a, outer b | C = 2πε/ln(b/a); Z0 = (η/2π)·ln(b/a) | `WikiCapacitance` (opened); `Pozar2012` Table 2.1 (not opened) | = eccentric coax at d = 0 |
| Coax with two concentric layers (ε1 for a < r < r1, ε2 for r1 < r < b) | C = 2π/(ln(r1/a)/ε1 + ln(b/r1)/ε2) (series capacitors; field radial by symmetry) | Derived (Gauss's law) | εeff = C/C0 closed form |
| Eccentric coax, radii a < b, centre offset d < b − a | C = 2πε/arcosh((a² + b² − d²)/(2ab)) | `WikiCapacitance` (opened) | d = 0 gives ln(b/a) (cosh ln(b/a) = (a² + b²)/(2ab)) |
| Two round wires, radius a, centre distance D | C = πε/arcosh(D/(2a)); Z0 = (η/π)·arcosh(D/(2a)) (the balanced Z, i.e. Zdiff of the pair with no ground) | `WikiCapacitance` (opened) | = 2 × wire over plane at h = D/2 (image) |
| Two wires of radii a1, a2 | C = 2πε/arcosh((D² − a1² − a2²)/(2·a1·a2)) | Derived (image pair: same bipolar construction as the eccentric coax); reduces to the row above for a1 = a2 | thin-wire limit ln(D²/(a1a2)) |
| Wire over plane, radius a, centre height h | C = 2πε/arcosh(h/a); Z0 = (η/2π)·arcosh(h/a) | `WikiCapacitance` ("wire parallel to wall", opened) | half of two wires at D = 2h |
| Parallel plates, width w, spacing d, no fringing (w ≫ d) | C = εw/d; Z0 = η·d/w; layers in series: C = w/Σ(di/εi) | `Pozar2012` Table 2.1 (not opened); derived | limit of Cohn's stripline below |
| **Zero-thickness stripline** (Cohn): strip width w centred between planes b apart | Z0 = (η/4)·K(k′)/K(k), k = tanh(πw/(2b)), k′ = sech(πw/(2b)) | `Cohn1954` (not opened); derived checks below | wide strip: (η/4)/(w/b + 2ln2/π) (each half a parallel plate plus the exact fringe 2ε·ln2/π per edge); narrow: (η/2π)·ln(8b/(πw)) (equivalent wire of diameter w/2); both reached to 10⁻⁷ and 0.06 % |
| **Edge-coupled zero-thickness stripline** (Cohn): two strips w, edge gap s, planes b apart | Zeven = (η/4)·K(ke′)/K(ke), ke = tanh(πw/2b)·tanh(π(w + s)/2b); Zodd = (η/4)·K(ko′)/K(ko), ko = tanh(πw/2b)·coth(π(w + s)/2b); k′ = √(1 − k²) | `Cohn1955coupled` (not opened); `Pozar2012` §7.6 (not opened) | s → ∞: both → single stripline; s = 0: Zodd = 0 and Zeven = 2·Z0(2w) exactly (Landen's transformation, checked to 10 digits) |
| Coplanar waveguide, zero thickness, centre strip w, gaps g, semi-infinite grounds, on an infinitely thick substrate | εeff = (εr + 1)/2 exactly; Z0 = (η0/(4√εeff))·K(k′)/K(k), k = w/(w + 2g) | `Wen1969` (not opened) from `QucsTech`, coplanar waveguide page (opened); εeff derived: conductors in the interface plane see a field symmetric about it, so each half-space contributes its own ε (C = C0·(εr + 1)/2) | Hilberg's approximation of K/K′ (QucsTech) to 1.2 × 10⁻⁸ |

**Complete elliptic integrals by the AGM** (`DLMF19` §19.8, opened): with a0 = 1, g0 = k′ = √((1 − k)(1 + k)) (this
form keeps precision as k → 1), a_{n+1} = (a_n + g_n)/2, g_{n+1} = √(a_n g_n), c_{n+1} = (a_n − g_n)/2, c0 = k:
**K(k) = π/(2·M(1, k′))** (19.8.5), M the common limit; **E(k) = K(k)·(1 − Σ_{n≥0} 2^{n−1}·c_n²)** (19.8.6, a0 = 1).
Convergence is quadratic: 5–6 iterations reach f64 precision for k ≤ 0.999 999. For K(k′)/K(k) compute both moduli
from the same tanh/sech (k′ = sech directly, not √(1 − k²)), which keeps 10 digits at w/b = 5 where k = 0.999 999 92.
E is needed by the axisymmetric solver's ring kernel (engine.md §5).

## 9. Why calculators disagree (v2 §7.8, notes-M0.1.md)

**How estimated.** A rough finite-difference Laplace solve written for this step (scratch script, not kept: 5-point
stencil on a 2.5 µm square grid, ε averaged on cell faces, grounded box 1 mm from the line, C and C0 from the field
energy, L = μ0ε0·C0⁻¹) of the owner's kind of microstrip: trace 0.1375 × 0.035 mm on prepreg 0.0925 mm, εr 4.3, no
mask; it gives **52.04 Ω, εeff 2.95** (its absolute error is about 1–2 %, its differences between variants about
0.2 Ω). Closed forms by facts-formulas.md. The real numbers come from M0.2b's validation table.

| Cause | What it changes | About how much (estimate above) |
|---|---|---|
| εr per layer, or one εr for the board | εeff and Z0 ∝ 1/√εeff; for microstrip only the layer under the trace and the mask matter, for stripline both sides | εr 4.0 / 4.6 instead of 4.3: 53.64 / 50.57 Ω (+3.1 % / −2.8 %): **about 1.5 Ω per 0.3 of εr** |
| εr at which frequency | FR-4 class laminates lose a few tenths of εr between 1 MHz and a few GHz (values for M0.2b from JLCPCB's data) | as the row above: ≈ 0.5 Ω per 0.1 |
| Solder mask: none, uniform, or three thicknesses (D8) | adds dielectric above the trace and in the gaps; raises εeff, lowers Z0 and Zdiff (more for pairs: the gap fills) | mask 20 µm on laminate and 10 µm over copper, εr 3.8: 49.49 Ω (**−2.5 Ω, −4.9 %**) |
| Rectangular or trapezoidal trace | the narrower top lowers C | top 25 µm narrower than the bottom (12.5 µm per side): 53.78 Ω (**+1.7 Ω, +3.3 %**) |
| Nominal or pressed dielectric thickness (resin fill) | Z0 grows roughly with ln h | h 0.085 instead of 0.0925 mm (−8 %): 49.67 Ω (**−2.4 Ω, −4.6 %**) |
| Plated or base copper | thicker copper adds side capacitance | t 0.0175 instead of 0.035 mm: 53.96 Ω (**+1.9 Ω, +3.7 %**) |
| Roughness | no effect on lossless quasi-static C and L; raises loss and the apparent εr at GHz (phase 2, later.md) | not estimated |
| Closed form or numerical solution | each formula has its own fit and range; IPC's is the crudest | same geometry: Hammerstad–Jensen with thickness 53.18 Ω, Wheeler 1977 53.44 Ω, IPC-2141 48.75 Ω, FD 52.04 Ω: **IPC 4.5 Ω (8 %) below the others** |
| Definition of Zdiff and Zcm | §5 | symmetric pairs: none; strongly asymmetric pair: A 94.1, B 92.0, D 108.7 Ω |
| Choice of reference plane, coplanar ground | a calculator fed the wrong plane, or a pour treated as coplanar ground | coplanar ground at 0.6 mm (the owner's clearance): −0.01 Ω (none); at 0.2 mm: −0.9 Ω; at 0.1 mm: −4.0 Ω. Next plane instead of In1 (h 0.252 mm, H–J): 85.9 Ω instead of 53.2 Ω |

The largest single causes for the owner's boards are the mask, the dielectric thickness and εr; they add up to about
±5 Ω, which is the size of the disagreement usually seen between a fab's sheet and a free calculator.

With JLCPCB's own numbers for the owner's microstrip (M0.2b: 3313 prepreg h = 0.092 mm, εr 4.1, mask 0.6 mil over
copper and 1.2 mil on laminate at εr 3.8, top width 0.7 mil narrower; facts-fab.md §1) the εr, mask and trapezoid rows
above all apply at once: Hammerstad–Jensen gives 54.06 Ω for the bare rectangular 0.1377 mm trace (C39), so the mask
(about −2.5 Ω) and the trapezoid (about +1 Ω for 0.7 mil) roughly cancel around 52–53 Ω before any field solve.

## 10. JLCPCB (M0.2b)

In [facts-fab.md](facts-fab.md) §1 (split off to keep this file under 40 kB): stackup naming, JLC061611-3313A/G (G is
not published anywhere reachable; the owner's KiCad stackup is 3313A), common 2/4/6-layer stackups, εr per prepreg and
by core thickness (no frequency stated), copper (0.035 mm outer in the stackup, 1.6 mil in the calculator; inner
0.0152 / 0.03 mm), mask (1.2 / 0.6 / 1.2 mil, εr 3.8), trapezoid (top = base − 0.7 mil), spacing, sheet form,
tolerance, and the Zdiff definition (not documented; irrelevant for symmetric pairs). Every number with its URL and the
date 2026-11-16.

## 11. KiCad fields (M0.2b)

In [facts-fab.md](facts-fab.md) §2: board file versions per release (6.0 20211014 … 10.0 20260206), every token of the
`(stackup …)` block with what changed between versions (`spec_frequency` and `dielectric_model` only in 11.0
development), KiCad's default εr 4.5 / tanδ 0.02 / mask 3.3 placeholders, and the `.kicad_pro` net-class fields and
schema versions (2 in 6.0 … 5 in 10.0).

## 12. Where the via model holds (full-wave, M6.4c)

Measured with our FDTD (held to the openEMS fixtures within the limits of [fullwave-verify.md](fullwave-verify.md) §3)
on the C44 via (0.6/0.3 through L1–L6 of JLC061611-3313A, two returns 0.3/0.6), against the quasi-static model
(viamodel.ts). Derived from those runs, not from a paper.

| Case | Model against full-wave | Consequence |
|---|---|---|
| Feed over its plane's antipad by 0.1 / 0.3 / 0.6 mm (pad 0.6, antipad 0.8 / 1.2 / 1.8) | section Z −1 / −15 / −31 %; the missing part is a series L of about 0.02 / 0.09 / 0.21 nH per feed, C within 2–4 % | the C44 via's 50 against 69 Ω (openEMS) is this alone (BL90); flag `feed-over-antipad` |
| Nearest return 0.8 / 1.2 / 2.0 / 3.0 mm (antipad 0.8) | Z −1.2 / +2.5 / +5.5 / +8.2 %; within \|ΔS\| 0.1 to 15.4 / 13.0 / 9.2 / 6.7 GHz | `RETURN_NEAR_MM` 1.5 mm (about 4 %, 11.6 GHz) |
| No return via | openEMS 99.3 Ω section, TDR peak 76.4 Ω; the model has no line to solve | refused (`no-return`) |
| Frequency, two returns at 0.8 mm | holds to about 15 GHz; above, power leaks into the plane cavity (\|S21\| −2.7 dB at 20 GHz, model 0.0 dB) | λ/8 of the window (29.5 GHz) is twice too high (BL165) |
| Stub L3–L6 | notch 21.8 against 21.6 GHz (openEMS); depth −57 against −22 dB (no loss, no radiation); 1 dB of \|S21\| lost from 0.55·f_res | `stub-resonance` when f_res is in the −20 dB band (BL166) |

