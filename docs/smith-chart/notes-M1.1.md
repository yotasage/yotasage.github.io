# Smith chart – notes of step M1.1 (numbers and complex)

Part of [plan.md](plan.md). Nothing on the site yet. Checks: `cd scripts/harness/smith && npm run check` (159,436
checks; the resistor harness still passes its 3294).

## API

**`lib/quantity.ts`** (shared; `lib/resistor/lists.ts` re-exports `readAmount` and `formatAmount`)
- `readAmount(text, unit?, infinite = false): number | null`. Number, optional exponent (`3e-9`, `2,5e+3`), prefix
  f p n u µ μ m c k M G T or `meg` (any case), unit Ω (ohm, R), S, H, F, Hz, m, W, V, A, dB, %, ×, ppm/K, °C. Letter
  decimals `4k7`, `4n7`, `3V3`, `4R7`, `1meg5`. Decimal comma, real minus and en dash. `unit` is the field's unit:
  a typed unit must equal it, and the letter of a one-letter unit (H, F, S, m) may be the decimal point (`4H7`, `1m5`
  in metres). Without `unit` every unit but the metre is accepted unchecked (the resistor tool's old behaviour, so
  "10 mm" stays null there). `c` only before m. No prefix on dB. `infinite` accepts `∞`, `inf`, `infinity` (±).
- `formatAmount(value, unit, digits = 4): string`. Prefix f to T, rounded with carry (999.96 Ω → "1 kΩ"), trailing
  zeros dropped, real minus, `∞ Ω` / `−∞ S` for infinities, `– Ω` for NaN, no prefix without a unit or for dB.
- `SI_PREFIXES`.

**`lib/smith/complex.ts`**: every function writes (re, im) into `out[o]`, `out[o+1]` (`Vec = Float64Array | number[]`)
and allocates nothing: `cadd`, `csub`, `cmul`, `cdiv` (Smith's method; a/0 = (Infinity, 0), 0/0 = NaN), `cinv`
(1/0 = ∞, 1/∞ = 0), `cscale`, `cexpj(θ)`, `crotate(re, im, θ)` (counter-clockwise for θ > 0), `csqrt` (principal),
`cabs` (sqrt, hypot only outside 1e±150), `carg`; interleaved `cmulN`, `cdivN`, `cabsN`.

**`lib/smith/convert.ts`** (writes like complex.ts; radians inside):
- `gammaFromZ(out, o, r, x)`, `zFromGamma(out, o, Γr, Γi)`, `gammaFromY`, `yFromGamma`, `invert` (y = 1/z).
- Ohms and siemens on a real Z0 > 0: `gammaFromImpedance(out, o, R, X, z0)`, `impedanceFromGamma(out, o, Γr, Γi, z0)`,
  `gammaFromAdmittance(out, o, G, B, z0)`, `admittanceFromGamma(out, o, Γr, Γi, z0)`.
- Batch over interleaved arrays: `gammaFromZN(gamma, z, n)`, `zFromGammaN(z, gamma, n)` (in place allowed).
- Figures: `gammaMag`, `gammaAngle`, `toDegrees`, `toRadians`, `vswr(|Γ|)`, `magFromVswr`, `returnLoss(|Γ|)`,
  `magFromReturnLoss`, `mismatchLoss(|Γ|)` (by log1p), `reflectedPower`, `deliveredPower`, `qFromZ(r, x)`,
  `qFromGamma(Γr, Γi)` = 2|Γi|/(1 − |Γ|²).

## Decisions

- **One infinity.** The open and the short are (Infinity, 0): z of Γ = 1, y of Γ = −1; any infinite input is that
  point (Γ = 1 from z, Γ = −1 from y), Γ = ∞ (z = −1) is (Infinity, 0) and gives z = −1 back. NaN only comes out
  where NaN goes in (and from complex.ts's 0/0, which convert.ts never forms).
- **Precision near the rim.** Γ → z uses (1 + Γ)/(1 − Γ) by Smith's division (1 − Γ is exact near Γ = 1); y is taken
  from −Γ, never as 1/z; above |a| = 1e150 the forms 1 − 2/(z + 1) and −1 + 2/(1 − Γ) avoid Inf/Inf. Worst errors over
  10,000 points (a third within 1e-15 of the rim, a tenth near Γ = ±1, a tenth with |Γ| down to 1e-15): Γ → z → Γ
  4e-16, y vs 1/z 4.6e-16 relative. The round trip is measured on Γ relative to max(1, |Γ|): a z near 1 cannot hold
  a Γ of 1e-12 to relative precision, which is inherent, not a flaw.
- **Conventions at the singular points:** VSWR, mismatch loss = ∞ from |Γ| = 1 on (an active |Γ| > 1 also gives ∞
  for mismatch loss, not NaN); return loss of a match = ∞. Q = 0 on the real axis (also the short and the open) and
  at Γ = ∞, ∞ on the rim (r = 0, x ≠ 0), negative for r < 0.
- **The metre and milli.** "10 m" is ten metres only when the field's unit is m, else 10 milli; "10 m" in an Ω field
  is 10 mΩ.
- formatAmount now writes ±∞ as "∞ unit" (the resistor tool wrote "– unit"; it never passes an infinity to it) and
  uses f and T (it stopped at p and G). Everything else is as before; the resistor harness proves it.
- Harness: a source value is checked to half a unit of its last printed digit, one unit where facts-cases notes the
  source's own rounding (C9 Γr −0.0881, C10 |Γ| 0.428 truncated, C11 0.7080), within 0.025 for C5's chart readings;
  C8 checks 298.118… and that the source's 285 comes from |Γ| = 0.993; C10 checks the source's Γ_L and Z_L from its
  truncated 0.428 (they then match to its digits).

## For M1.2

- Use complex.ts's pattern for ABCD matrices: a node (V, I) is 4 numbers in a Float64Array; compose in place.
- z = V/(I·Z0) through `cdiv` (I = 0 gives the open as (Infinity, 0)); then `gammaFromZ` handles ∞ without a
  special case. A part of 0 or ∞ needs engine.md §4's rule; `invert` and the conversions are already safe there.
- `crotate` turns counter-clockwise for θ > 0: a line is `crotate(Γ, −2βℓ)` (clockwise towards the generator).
- Read user values with `readAmount(text, 'H')` etc. and write them with `formatAmount`; pass `infinite = true` where
  an open (∞ Ω) is a valid entry.
