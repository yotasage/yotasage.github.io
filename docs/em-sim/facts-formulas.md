# EM simulation – closed-form and via formulas (research of 2026-11-16, step M0.2a; §1 and §3–5 checked against the original papers in M0.2c)

Part of [facts.md](facts.md) (split off to keep each file under 40 kB): the closed-form formulas common calculators use,
each with its stated range and accuracy as the source states it, and the via formulas. **The tool does not compute its
results with these**: the engine solves the field problem (D2, D4). They are shown beside the field solution ("what a
closed-form calculator would say", facts.md §9) and in the theory, and the harness checks their implementation against
the values in [facts-cases.md](facts-cases.md). Notation: w strip width, h dielectric height under the strip, t strip
thickness, b plane spacing (stripline), s edge gap, u = w/h, g = s/h, η0 = 376.730 Ω (facts.md §1). Formulas with
"η0/2π" are printed in the sources with 60 or 120π; the tool uses η0 (the difference is 0.07 %).

## 1. IPC-2141 (1996), and the IPC-2251 forms of LearnEMC

**IPC-2141, April 1996** (`IPC2141`, the original edition, opened in M0.2c), §4.2 "Unbalanced Line Equations"
(equations unnumbered; W width, T thickness, H dielectric under the strip, C0 in pF/inch):

- **Surface microstrip (§4.2.1):** Z0 = 87/√(εr + 1.41) · ln(5.98H/(0.8W + T)) Ω, C0 = 0.67(εr + 1.41)/ln(5.98H/(0.8W + T)).
  Same as the LearnEMC row below (so case C37's IPC value stands).
- **Embedded microstrip (§4.2.2):** Z0 = 87/√(εr′ + 1.41) · ln(5.98H/(0.8W + T)) Ω with H′ the height of the
  dielectric's air surface above the plane and **εr′ = εr·(1 + e^{−1.55H′/H}) as printed**. With "+", εr′ > εr (1.21εr
  at H′ = H, no cover), which is unphysical; the form usually reproduced, εr·(1 − e^{−1.55H′/H}), goes from 0.79εr
  (no cover) to εr (deep burial). The printed C0 is malformed ("[1/(H+T)/ln(1−0.6897(εr+1.41)]/√εr") and is not usable.
  **The LearnEMC factor (1 − (h1 − t − h)/0.1) is not in IPC-2141**, nor is a t_pd: this edition handles the cover
  only through εr′ (notes-M0.2a open question 2).
- **Symmetric stripline (§4.2.3):** Z0 = 60/√εr · ln(1.9(2H + T)/(0.8W + T)) Ω, C0 = 1.41εr/ln(3.81H/(0.8W + T)). The text
  calls H "the dielectric separation between reference planes", but Figure 4e and the 2H + T show H from the strip to each
  plane. 1.9 = 4/(0.67π) to 0.02 %: the LearnEMC row below.
- **Dual (asymmetric) stripline (§4.2.4):** Z0 = 80/√εr · ln(1.9(2H + T)/(0.8W + T)) · (1 − H/(4(H + C + T))) Ω, C the
  dielectric between the two signal layers; C0 = 2.82εr/ln((2H − T)/(0.268W + 0.335T)) as printed.
- **No ranges and no accuracy** are stated: §4.2 says the limitations ("range of accuracy") are in IPC-D-317, and §4.3
  recommends that manufacturers verify the results empirically. §4.4 (balanced lines) gives **no differential
  formulas** (only Z0 = f(ε, W, H, T, S)) and says the published forms conflict.

IPC-2141A (March 2004) was **not opened** (paywalled; its table of contents lists microstrip, embedded microstrip and
stripline under "unbalanced line equations"): its ranges, its embedded form and any differential formulas may differ
from the 1996 edition. The table below is read from the equation images of the LearnEMC (Clemson / Missouri S&T)
PCB transmission-line calculators, which cite "Design Guide for Electronic Packaging Utilizing High-Speed Techniques"
(IPC-2251, 4th working draft, February 2001) (`LearnEMCPCB`, opened 2026-11-16); their ranges are IPC-2251's, not
IPC-2141's. Lengths in any consistent unit except where noted.

| Line | Formula | Stated range |
|---|---|---|
| Microstrip | Z0 = 87/√(εr + 1.41) · ln(5.98h/(0.8w + t)) Ω; C0 = 0.67(εr + 1.41)/ln(5.98h/(0.8w + t)) pF/inch; t_pd = C0·Z0 ps/inch | 0.1 < w/h < 3.0, 1 < εr < 15 (other reproductions say 0.1 < w/h < 2.0) |
| Embedded microstrip (h1 = dielectric height above the plane, cover = h1 − t − h) | Z0 = 87/√(εr + 1.41) · ln(5.98h/(0.8w + t)) · (1 − (h1 − t − h)/0.1) Ω; t_pd = 84.75·√(0.475·εr·(1 + e^{−1.55·h1/h}) + 0.67) ps/inch (as printed: the "0.1" is a length, so h must be in inches; the sign inside the exponential term is as printed) | 0.1 < w/h < 3.0, 1 < εr < 15 |
| Symmetric stripline (h = dielectric from the strip to each plane, b = 2h + t) | Z0 = 60/√εr · ln(4(2h + t)/(0.67π(0.8w + t))) Ω; t_pd = 84.75·√εr ps/inch | w/(h − t) < 0.35, t/h < 0.25, 1 < εr < 15 |

Accuracy is not stated on the pages opened (nor in IPC-2141). The embedded row's factor and the "1 + e^{…}" in its t_pd
are as LearnEMC prints them; the tool shows the embedded IPC value, if at all, from IPC-2141's εr′ form with its sign
flagged (decision for M2). The microstrip formula is a fit of the equivalent-wire kind
(0.8w + t as the "width"); at the owner's geometry it is 8 % below the other formulas and the field solution
(facts.md §9). The differential forms often quoted with these (Zdiff = 2Z0(1 − a·e^{−b·s/h})) were **not found in an
opened source** and are left out.

## 2. Wheeler 1977 (microstrip with thickness)

`Wheeler1977` (not opened); formula opened in `Ellingson2018` §3.11 (as eq. "Wheeler") and `WikiMicrostrip`:

- Z0 = (η0/(2π·√(2(1 + εr)))) · ln(1 + (4h/w′)·(Φ + √(Φ² + π²·(1 + 1/εr)/2))), Φ = ((14 + 8/εr)/11)·(4h/w′)
  (η0/(2π√2) = 42.40 Ω, Ellingson prints 42.4 Ω/√(εr + 1));
- w′ = w + Δw·(1 + 1/εr)/2, Δw = (t/π)·ln(4e/√((t/h)² + ((1/π)/(w/t + 1.1))²)) (thickness correction; w′ ≈ w for
  t ≪ w and t ≪ h, Ellingson).

Stated accuracy (WikiMicrostrip, paraphrasing the paper): error in impedance below 1 % for most cases and always below
2 %. Ellingson calls the εeff ≈ (εr + 1)/2 that goes with it "crude". (QucsTech's "Wheeler" section is Wheeler's
earlier 1965 pair of wide/narrow formulas, stated < 1 % for 8 ≤ εr ≤ 12 with a 0.1 Ω step at w/h = 3.3; not used.)

## 3. Hammerstad–Jensen (microstrip)

`HammerstadJensen1980` (not opened); opened in `QucsTech` §11.1 (eqs. 11.4–11.25):

- **Air line (zero thickness):** Z01(u) = (η0/2π)·ln(f(u)/u + √(1 + 4/u²)), f(u) = 6 + (2π − 6)·exp(−(30.666/u)^0.7528).
  Accuracy: better than 0.01 % for u ≤ 1 and 0.03 % for u ≤ 1000 (against the exact air solution).
- **εeff (zero thickness):** εeff = (εr + 1)/2 + ((εr − 1)/2)·(1 + 10/u)^(−a·b),
  a(u) = 1 + (1/49)·ln((u⁴ + (u/52)²)/(u⁴ + 0.432)) + (1/18.7)·ln(1 + (u/18.1)³), b(εr) = 0.564·((εr − 0.9)/(εr + 3))^0.053.
  Accuracy better than 0.2 % for εr ≤ 128, 0.01 ≤ u ≤ 100. Z0 = Z01(u)/√εeff.
- **Thickness** (T = t/h): Δu1 = (T/π)·ln(1 + 4e/(T·coth²(√(6.517u)))), Δur = ½·(1 + sech(√(εr − 1)))·Δu1,
  u1 = u + Δu1, ur = u + Δur; Z0 = Z01(ur)/√εeff(ur, εr), εeff(t) = εeff(ur, εr)·(Z01(u1)/Z01(ur))².
  (The Qucs page prints √(6.517W) where u is meant; the paper's normalised form is used here.)
- **Dispersion** is out of scope in phase 1 (facts.md §2): Kirschning–Jansen 1982 (`KirschningJansen1982`, not
  opened; QucsTech eqs. 11.26–11.32): εeff(f) = εr − (εr − εeff)/(1 + P(f)), P = P1·P2·((0.1844 + P3·P4)·fn)^1.5763,
  P1 = 0.27488 + (0.6315 + 0.525/(1 + 0.0157·fn)^20)·u − 0.065683·exp(−8.7513u), P2 = 0.33622·(1 − exp(−0.03442εr)),
  P3 = 0.0363·exp(−4.6u)·(1 − exp(−(fn/38.7)^4.97)), P4 = 1 + 2.751·(1 − exp(−(εr/15.916)^8)), fn = f·h in GHz·mm;
  range 0.1 ≤ u ≤ 100, 1 ≤ εr ≤ 20, h/λ0 ≤ 0.13, better than 0.6 % (range and accuracy from QucsTech; the 1982 letter
  is not opened). P1–P4 and fn = (f/GHz)·(h/mm) are **checked against `KirschningJansen1984`**, which restates them for
  the coupled lines (eqs. 2 and 6, p. 85): the exponent 20 in P1 is confirmed, and so are the other constants above.
  Getsinger's simpler model: facts.md §2.

## 4. Kirschning–Jansen, coupled microstrip (static)

`KirschningJansen1984` (opened in M0.2c) with its corrections `KirschningJansen1985corr` (opened; they override the
1984 text in eqs. 3, 4, 9 and 10); every formula below is checked against them, and `QucsTech` §11.3 agrees.
εeff(0) and ZL(0) are the single zero-thickness microstrip of width w (Hammerstad–Jensen, §3). Range (eq. 1):
0.1 ≤ u ≤ 10, 0.1 ≤ g ≤ 10, 1 ≤ εr ≤ 18; usable beyond it "with reduced accuracy" (the asymptotes are built in).
Stated accuracy, against the authors' spectral-domain hybrid-mode data: εeff,e(0) is Hammerstad–Jensen's even-mode
value, within 0.7 %; εeff,o(0) is remodelled, 0.5 %; the static impedances (eqs. 8, 9) better than 0.6 % for both
modes. Impedances are the power–current definition (the same as any other at f = 0). The constant 377 Ω is the
paper's. Strip thickness is not in the model: the paper refers to earlier work for it and advises against
Hammerstad–Jensen's coupled-line width correction (it "exaggerates the effect of finite thickness").

- Even εeff (eq. 3, with correction 1: −ae·be is the exponent of (1 + 10/v)): v = u·(20 + g²)/(10 + g²) + g·e^{−g};
  εeff,e = (εr + 1)/2 + ((εr − 1)/2)·(1 + 10/v)^(−ae(v)·be(εr)), with
  ae(v) = 1 + (1/49)·ln((v⁴ + (v/52)²)/(v⁴ + 0.432)) + (1/18.7)·ln(1 + (v/18.1)³), be = 0.564·((εr − 0.9)/(εr + 3))^0.053.
- Odd εeff (eq. 4, with correction 2: −εeff(0) in the bracket, printed "+" in 1984):
  εeff,o = (½(εr + 1) + ao − εeff(0))·exp(−co·g^do) + εeff(0), ao = 0.7287·(εeff(0) − ½(εr + 1))·(1 − e^{−0.179u}),
  bo = 0.747εr/(0.15 + εr), co = bo − (bo − 0.207)·e^{−0.414u}, do = 0.593 + 0.694·e^{−0.562u}.
- Even Z (eq. 8): ZL,e = ZL(0)·√(εeff(0)/εeff,e) / (1 − (ZL(0)/377 Ω)·√εeff(0)·Q4), Q1 = 0.8695·u^0.194,
  Q2 = 1 + 0.7519g + 0.189·g^2.31, Q3 = 0.1975 + (16.6 + (8.4/g)⁶)^(−0.387) + (1/241)·ln(g¹⁰/(1 + (g/3.4)¹⁰)),
  Q4 = (2Q1/Q2)/(e^{−g}·u^Q3 + (2 − e^{−g})·u^(−Q3)).
- Odd Z (eq. 9; Q10 with the closing parenthesis of correction 3, Q10 = Q2⁻¹·(Q2Q4 − Q5·exp(ln(u)·Q6·u^(−Q9))),
  which is the form below): ZL,o = ZL(0)·√(εeff(0)/εeff,o) / (1 − (ZL(0)/377 Ω)·√εeff(0)·Q10), Q5 = 1.794 + 1.14·ln(1 + 0.638/(g + 0.517·g^2.43)),
  Q6 = 0.2305 + (1/281.3)·ln(g¹⁰/(1 + (g/5.8)¹⁰)) + (1/5.1)·ln(1 + 0.598·g^1.154), Q7 = (10 + 190g²)/(1 + 82.3g³),
  Q8 = exp(−6.5 − 0.95·ln g − (g/0.15)⁵), Q9 = ln(Q7)·(Q8 + 1/16.5), Q10 = Q4 − (Q5/Q2)·u^(Q6·u^(−Q9)).
- Thickness: QucsTech uses widths w_t,e = w + Δw·(1 − ½·e^{−0.69Δw/Δt}), w_t,o = w_t,e + Δt, Δt = 2th/(s·εr) (s ≫ 2t),
  Δw from the single line. This is not from `KirschningJansen1984` (see above) and was partly cut off on the page:
  not used.
- Dispersion (out of scope in phase 1): eqs. 5–7 with P1–P15, valid to fn = 25 with at most 1.4 % for εeff,e/o(f);
  the impedance dispersion (eqs. 10, 11, with correction 4: εeff(0)^Ce, not εeff(fn)^Ce, in the denominator of eq. 10)
  to fn = 20 with at most 2.5 %.

**Checked in M0.2c** against the paper and its corrections: the factor (εr − 1)/2 of εeff,e, the bracket of εeff,o,
the inner term (g/5.8)¹⁰ of Q6, the exponent −0.387 of Q3 and the denominators of ZL,e and ZL,o (all as above, which
had been completed from memory in M0.2a). The paper gives no numeric example (only curves, Figs. 2–3, for RT/duroid
5870, εr 2.35, h 0.79 mm, and alumina, εr 9.70, h 0.64 mm). Test values of these formulas (scratch evaluation, M0.2c):
u = 1, εr = 4.3 (single line εeff(0) = 3.1045, ZL(0) = 71.751 Ω): g = 1 → εeff,e 3.3126, εeff,o 2.8312, ZL,e 81.742 Ω,
ZL,o 61.141 Ω; g = 10 → 3.1232, 3.0948, 71.983, 71.392 Ω; g = 100 → 3.1047, 3.1045, 71.752, 71.749 Ω (the limit
g → ∞ is the single line, the harness's test).

## 5. Stripline with thickness (Cohn 1955)

`Cohn1955problems` (opened in M0.2c; eqs. 3–5, 21, 22), and checked against the exact zero-thickness solution
(facts.md §8). Stated accuracy (p. 120): at t = 0 the two formulas below are at most −1.24 % from the exact solution,
at the crossover w/b = 0.35, and the author believes this is not exceeded for t up to 0.25b when each is used in its
range.

- **Wide strip (eqs. 4, 5), w/(b − t) ≥ 0.35:** Z0·√εr = 94.15/(w/b/(1 − t/b) + Cf′/(ε0εr)) Ω, with the fringe of one edge
  Cf′/(ε0εr) = (1/π)·[(2/(1 − t/b))·ln(1/(1 − t/b) + 1) − (1/(1 − t/b) − 1)·ln(1/(1 − t/b)² − 1)]
  (Cohn writes Cf′/(0.0885εr) with Cf′ in pF/cm). At t = 0: Cf′/ε = 2ln2/π = 0.4413 and 94.15 ≈ η0/4 = 94.18: it is
  the wide-strip limit of the exact solution (facts.md §8), 0.4 % high at w/b = 0.5, 0.05 % at w/b = 1.
- **Narrow strip (eq. 3), w/(b − t) ≤ 0.35 and t/b ≤ 0.25:** Z0·√εr = 60·ln(4b/(π·d0)), d0 the diameter of the
  equivalent round conductor (Cohn's Fig. 2 graphically). With d′ the larger and d″ the smaller of w and t (p. 122):
  d0 = (d′/2)·(1 + (d″/(πd′))·(1 + ln(4πd′/d″))), "accurate for d″/d′ ≤ 0.06"; improved (eq. 21):
  **d0 = (d′/2)·(1 + (d″/(πd′))·(1 + ln(4πd′/d″)) + 0.510·(d″/d′)²)**, "extremely accurate for d″/d′ up to at least 0.11"
  (so for t/w ≤ 0.11 or w/t ≤ 0.11). Eq. 21 as printed drops the π of d″/(πd′) and leaves the parentheses ambiguous;
  its derivative, eq. 22, ∂d0/∂d′ + ∂d0/∂d″ = ½ + 0.669·(d″/d′) − 0.255·(d″/d′)² + (1/2π)·ln(4πd′/d″), holds only for
  the form above (0.669 = 1/(2π) + 0.510). At t = 0, d0 = w/2 and the formula is the exact narrow limit 60·ln(8b/(πw)).

Asymmetric (dual) and coupled thick stripline are not covered by a formula here: the field solution is the reference.

## 6. Coplanar waveguide

`QucsTech` coplanar waveguide page (opened), after Gupta et al. (`Wen1969` for the infinite substrate):

- k1 = w/(w + 2g) (infinitely thick substrate, exact: facts.md §8); finite substrate h without a bottom ground:
  k2 = sinh(πw/4h)/sinh(π(w + 2g)/4h), εeff = 1 + ((εr − 1)/2)·(K(k2)/K(k2′))·(K(k1′)/K(k1));
- with a bottom ground (grounded CPW): k3 = tanh(πw/4h)/tanh(π(w + 2g)/4h), q = (K(k3)/K(k3′))/(K(k1)/K(k1′) + K(k3)/K(k3′)),
  εeff = 1 + q(εr − 1), Z0 = (60π/√εeff)/(K(k1)/K(k1′) + K(k3)/K(k3′)) (60π ≈ η0/2);
- Hilberg's K/K′: for 0 ≤ k ≤ 1/√2, K(k)/K(k′) = π/ln(2(1 + √k′)/(1 − √k′)); for 1/√2 ≤ k ≤ 1,
  K(k)/K(k′) = ln(2(1 + √k)/(1 − √k))/π; error about 10⁻⁵ (Collin) or 3 × 10⁻⁶ (Gupta) as the page says; the tool uses the
  AGM instead (facts-cases.md C31 measures Hilberg's error at one k);
- thickness (Gupta, first order): Δ = (1.25t/π)·(1 + ln(4πw/t)), w_e = w + Δ, g_e = g − Δ (the εeff correction is cut
  off on the page; not used).

## 7. Via formulas

The via model (engine.md §6) computes the barrel's cut with the 2D solver and the pads with the axisymmetric solver;
these formulas are its checks and the theory's estimates.

- **Plated barrel geometry:** plating grows inward, so the barrel's **outer diameter is the drill diameter** and the
  finished hole is the drill minus twice the plating. The field outside sees only the outer surface (derived).
- **Coaxial via** (barrel in a ring of plane clearance, or a continuous ring of returns): Z0 = (η0/(2π√εr))·ln(D/d),
  d drill (outer barrel) diameter, D antipad or return-ring diameter (exact coax, facts.md §8).
- **Quasi-coaxial via with N return vias** of radius b on a circle of radius R around a barrel of radius a, thin-wire
  approximation (a, b ≪ R), derived here: C = 2πε/(ln(R/a) + (1/N)·ln(R/(N·b))), Z0 = (η/2π)·(ln(R/a) + (1/N)·ln(R/(N·b))).
  Derivation: line charge q on the barrel, −q/N on each return; the potential difference uses
  Π_{j=1}^{N−1}|1 − e^{2πij/N}| = N. Checks: N = 1 is the thin-wire limit of the two-wire formula (2.8 % high against the
  exact value at a = 0.15, b = 0.25, R = 1, facts-cases.md C09); N·b = R (returns touching) leaves the coax ln(R/a).
  The 2D solver replaces it in the engine (any return pattern, pairs, proximity).
- **Differential via pair without returns:** the two barrels form a two-wire line: Zdiff = (η/π)·arcosh(p/d), p the
  pitch, d the drill (facts.md §8). With returns or planes around, the 2D solver.
- **Pad and antipad capacitance estimate** (Johnson & Graham, `JohnsonGraham1993` §7, not opened, as commonly quoted):
  C ≈ 1.41·εr·T·D1/(D2 − D1) pF, T board thickness, D1 pad diameter, D2 antipad diameter, all in inches. A crude
  estimate (it scales with the whole board thickness); the axisymmetric solve (engine.md §5) replaces it.
- **Via inductance estimates:** Johnson & Graham's L ≈ 5.08·h·(ln(4h/d) + 1) nH (h, d in inches) (not opened; an SI-LIST
  discussion found in a search questions the sign of the +1). The partial self-inductance of a straight round
  conductor of length ℓ ≫ r with surface current is L = (μ0ℓ/2π)·(ln(2ℓ/r) − 1) (`Rosa1908`, not opened; standard). Partial
  inductance depends on where the return path is assumed; the via model uses lines between planes instead.
- **Stub resonance:** an open stub of length ℓ has Zin = −jZ0·cot(βℓ) (`SteerVol2` §2.4, `Ellingson2018` §3.16, both
  opened in the Smith chart's M0.2): a short across the through-path at βℓ = π/2, i.e. **f_stub = c0/(4ℓ√εeff)** and odd
  multiples. Example: 1.3 mm stub in εr 4.3: 27.8 GHz. Backdrilling shortens ℓ to the remaining stub.
- **Delay of a via:** τ = ℓ·√εr/c0 (homogeneous segment): 1.6 mm in εr 4.3 is 11.1 ps.

## 8. Rise time and bandwidth

Derived (no source needed; `JohnsonGraham1993` gives 0.35/tr and the knee frequency 0.5/tr, not opened):

- **First-order (RC) response:** 10–90 % rise tr = τ·ln 9, −3 dB bandwidth f3 = 1/(2πτ), so **f3·tr = ln 9/(2π) = 0.3497**.
- **Gaussian response** (the TDR's edge, engine.md §6): step = erf edge with σ in time; tr(10–90 %) = 2·1.28155·σ,
  |H(f)| = exp(−(2πfσ)²/2) falls to 1/√2 at 2πfσ = √(ln 2), so **f3·tr = 2·1.28155·√(ln 2)/(2π) = 0.3396**.
- So "0.35/tr" assumes a single-pole edge; for the Gaussian edge the tool uses 0.34/tr. The spectrum of a Gaussian edge
  is −20 dB (amplitude 0.1) at f = 2.58·f3 and −60 dB at 4.46·f3 (derived from the exponent): the cascade (engine.md §6)
  runs to a maximum frequency set from that (M5 decides the level).
- A via or line segment is "short" (lumped) when its delay is small against tr; the threshold (often tr/6) is a flag
  setting decided with the via model (M5), not a physical constant.
