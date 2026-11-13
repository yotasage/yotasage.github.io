# Smith chart – notes of step M7.4a (the sweep's theory, content)

Done 2026-11-13. Content only, no code: [theory-sweep.md](theory-sweep.md) (topics §12–13), claims 237–281 in
[claims.md](claims.md), the new source `WikiQ` (sources.md, references.bib), eleven short lines relinked in
theory.md §8. M7.4b builds it on the page, as M3.5b/M4.4a did for the earlier topics.

## What the page builds (M7.4b)

- **Two topics after "Realisable values and standard values"** (page topics 11–12), in the contents, folding like the
  others: `#q-and-bandwidth` "Q and bandwidth", `#reading-a-trace` "Reading a frequency trace". Text, equations, live
  numbers, figure and citations per topic in theory-sweep.md; `⟨n⟩` markers are not printed.
- **Live boxes.** "Your circuit" when the sweep is on: the figures from the trace layer's `figureListeners` (already
  shared by the plot and the report), the band from the page's `sweep`, markers by `markerAt` on the committed circuit,
  node Q by `M_Q`; open ends in the words of `bandText.ts` (T 235/236). "Start circuit" when it is off: the start
  circuit on `defaultBand(f0)` at 10 dB, numbers in theory-sweep.md. The worked examples are fixed text.
- **Figures.** Mini charts with traces: `runSweep` on the example circuit and `pathData` (sweep.ts) into the mini
  chart's SVG; ticks by `markerAt`. The small return-loss plot of topic 13 can be a `PlotView` laid out at the figure's
  size (as `printCopy` does) or a plain SVG polyline of `returnLoss(mag)`; both themes.
- **Short lines.** In whys.ts the topic of `sweep`, `sweep-trace`, `sweep-band`, `sweep-points`, `sweep-log`,
  `sweep-marker`, `sweep-plot`, `sweep-limit`, `sweep-table` becomes `reading-a-trace`, of `sweep-figures` and
  `sweep-q` `q-and-bandwidth` (theory.md §8). Texts unchanged; `sweep-plot-kind`, `report`, `report-link` keep theirs.
- **Links into the new topics.** Claim 129's sentence now reads "What Q means for bandwidth is in Q and bandwidth."
  (link it); theory-solver's 175 "(… over a narrower band)" may link to `#q-and-bandwidth`.
- **Citations.** `WikiQ` is new in references.bib; the Bibliography numbers it by first citation.

## Example circuits (all Z0 = 50 Ω, f0 = 100 MHz; ω0 = 2π·10⁸)

| Name | Load | Parts from the load | Band, limit |
|---|---|---|---|
| start | 25 + j25 | series C 31.83 pF (x −1), shunt L 79.58 nH (b −1) | 50–150 MHz; 10 and 20 dB; also 10 MHz–1 GHz log |
| RLC2 / RLC5 | 50 | series L x·Z0/ω0, series C 1/(ω0·x·Z0), x = 2 / 5 | 10 MHz–1 GHz log, 10 dB |
| L25 / L10 | 25 / 10 | series C 1/(ω0·Q·R), shunt L Z0/(ω0·Q), Q = √(50/R − 1) | 20 dB |
| two | 10 | (series C, shunt L) for 10 → √500 Ω, then for √500 → 50 Ω, Q 1.1118 each | 10 and 20 dB |
| stub | 25 + j25 | open stub λ/8 (Zc 50) | 10 dB |
| line+short | 25 + j25 | line 0.32379 λ (233.1° of turn, back onto g = 1; M7.4b: 0.161896 λ, as first written, leaves \|Γ(f0)\| = 0.689), shorted stub λ/8 | 10 dB |
| half / one | 25 + j25 | line λ/2 / λ, open stub λ/8 | 10 dB |
| shuntC | 25 + j25 | shunt C 1/(ω0·50) = 31.83 pF | 10 dB |
| qw25 / qw10 | 25 / 10 | λ/4 of Zt = √(50·R) | 20 dB; qw25 also 1–199 MHz linear at 10 dB |

Bands are 401 points, linear, unless named; traces refined with `REFINE_DEFAULTS`.

## New registry entries (equations.ts), with harness bindings for check-equations.mjs

Assumptions as the registry's constants (`EJWT`, `LOSSLESS`, `REAL_Z0`). Every step below was checked numerically
against the engine in the scratch script (worst relative 2.3e-11, "Checks").

1. **`fractional-bandwidth`** "Fractional bandwidth": `FBW = (f_hi - f_lo)/f_0`. sources [], derivation 'A
   definition: the interval below the limit that holds f0, over f0 (the band's middle would differ when the band is
   lopsided).' engine `sweep.bandFigures (atF0, fractional)`. Symbols f_hi, f_lo (ends of the matched interval around
   f0). Binding: a random circuit and band, `bandFigures` at a threshold below the band's worst; skip draws without
   `atF0`.
2. **`q-loaded`** "Loaded Q": `Q_L = f_m/(f_+ - f_-)`. sources [WikiQ "Bandwidth definition"], derivation 'The
   resonator's Q applied to the power delivered, 1 − |Γ|²: f_± are where it is half its value at the best point f_m
   near f0, |Γ|² = (1 + |Γ_m|²)/2.' engine `sweep.bandFigures (q)`. Binding: `q` of a random circuit (closed ends only).
3. **`q-series-rlc`** "Loaded Q of a series resonator": `Q_L = omega_0*L/(R + Z_0) = 1/(omega_0*C*(R + Z_0))`.
   sources [WikiQ "RLC circuits"], assumptions [EJWT, REAL_Z0, 'load R in series with L and C, f0 = 1/(2π√(LC))'],
   engine `sweep.bandFigures (q)`. Steps:
   - `omega_+*L - 1/(omega_+*C) = R + Z_0` — The power delivered, 4·R·Z0/((R + Z0)² + X²) (`power-delivered` with
     `gamma-z`), is half its peak where X² = (R + Z0)²: above f0 X is positive.
   - `omega_-*L - 1/(omega_-*C) = -(R + Z_0)` — Below f0 X is negative.
   - `omega_+*omega_- = 1/(L*C)` — Add the two: (ω₊ + ω₋)L = (ω₊ + ω₋)/(ω₊ω₋C).
   - `omega_+ - omega_- = (R + Z_0)/L` — Subtract them; with ω₊ω₋ = 1/(LC), 1/(ω₋C) − 1/(ω₊C) = (ω₊ − ω₋)L.
   - `Q_L = omega_0*L/(R + Z_0) = 1/(omega_0*C*(R + Z_0))` — X = 0 at ω0, so the best point is f0 and
     Q_L = ω0/(ω₊ − ω₋); ω0L = 1/(ω0C).
   Binding: random R 5–200 Ω, x 0.5–20, L = x·Z0/ω0, C = 1/(ω0²L); band f0/1000…1000·f0 log, 2,001 points; ω± from
   `q.hi`, `q.lo`; Q_L = `q.q`.
4. **`fbw-series-rlc`** "Band of a series resonator": `FBW = X_m/(omega_0*L) = X_m/(Q_L*(R + Z_0))`, assumptions as 3
   and 'Γ_m > |R − Z_0|/(R + Z_0)'. Steps:
   - `X_m^2 = (Gamma_m^2*(R + Z_0)^2 - (R - Z_0)^2)/(1 - Gamma_m^2)` — |Γ|² = ((R − Z0)² + X²)/((R + Z0)² + X²) grows
     with X²; set it to Γ_m² and solve for X².
   - `omega_+ - omega_- = X_m/L` — As in `q-series-rlc` with X_m for R + Z0.
   - `FBW = X_m/(omega_0*L) = X_m/(Q_L*(R + Z_0))` — Divide by ω0; ω0L = Q_L(R + Z0).
   Binding: as 3 with Γ_m between the floor and 0.9; FBW = `fractional`, ω± from `atF0`.
5. **`l-network-slope`** "How fast an L network leaves the match": `v_Gamma = Q^2/sqrt(1 + Q^2)`. sources [],
   derivation 'Differentiate the input admittance of the L network in δ = (f − f0)/f0 at f0.' assumptions [EJWT,
   REAL_Z0, 'resistive load R_L < Z_0, series part next to it'], engine `sweep.markerAt` (central difference). Symbols:
   `v_Gamma` "how fast Γ leaves the centre: |dΓ/dδ| at f0", `y_d` "dy_in/dδ at f0", `s` "+1 for a series L, −1 for a
   series C", `r` "R_L/Z_0", `delta` "detuning (f − f0)/f0". Steps:
   - `r*(1 + Q^2) = 1` — `q-l-network` with R_high = Z0 and R_low = R_L.
   - `y_d = j*Q - j*Q*(1 + Q^2)/(1 + j*s*Q)^2` — The series leg 1/(r + jx) changes by −j·(dx/dδ)/(r + jx)²; dx/dδ =
     |x| = Q·r for an L (x ∝ f) and a C (x ∝ −1/f) alike, and r + jx = r(1 + jsQ); the shunt part's b changes by
     |b| = Q; use r = 1/(1 + Q²).
   - `y_d = -2*s*Q^2/(1 + j*s*Q)` — 1 + Q² = (1 + jsQ)(1 − jsQ), so the fraction is jQ(1 − jsQ)/(1 + jsQ).
   - `v_Gamma = abs(y_d)/2 = Q^2/sqrt(1 + Q^2)` — Near y = 1, Γ = (1 − y)/(1 + y) (`gamma-y`) changes by −Δy/2;
     |1 + jsQ| = √(1 + Q²).
   Binding: random R_L 1–49 Ω, random s, the L network built as in check-equations' `q-l-network`; y_d and v_Gamma by
   a Richardson-extrapolated central difference of `markerAt` (h = 1e-3 and 5e-4 in δ: agrees to 1.2e-11).
6. **`quarter-wave-bandwidth`** "Band of a λ/4 transformer":
   `FBW = 2 - 4/pi*arccos(2*Gamma_m*sqrt(Z_0*R_L)/(abs(R_L - Z_0)*sqrt(1 - Gamma_m^2)))`. sources [], derivation
   'notes-M7.1.md; the textbook result (Pozar) was not opened.' assumptions [LOSSLESS, EJWT, 'resistive load,
   Z_t = √(Z_0·R_L)'], engine `sweep.bandFigures (fractional)`. **Needs `arccos` in FUNCTIONS** (parser, `NAMED` for
   `\arccos`, evaluator on real arguments in [−1, 1]); or, without it, end the text at `FBW = 2 - 4*theta_m/pi` and
   show the cos line as the entry's first step. Steps (θ = (π/2)·f/f0, t = tan θ):
   - `Z_in = Z_t*(R_L + j*Z_t*tan(theta))/(Z_t + j*R_L*tan(theta))` — `line-zin` with Zc = Zt.
   - `abs(Gamma)^2 = (R_L - Z_0)^2/((R_L - Z_0)^2 + 4*Z_0*R_L*(1 + tan(theta)^2))` — With Zt² = Z0·R_L, Zin − Z0 ∝ Zt(R_L − Z0)
     and Zin + Z0 ∝ Zt(R_L + Z0) + 2jt·Z0R_L, so |Γ|² = (R_L − Z0)²/((R_L + Z0)² + 4t²Z0R_L); (R_L + Z0)² =
     (R_L − Z0)² + 4Z0R_L.
   - `cos(theta_m)^2 = 4*Gamma_m^2*Z_0*R_L/((R_L - Z_0)^2*(1 - Gamma_m^2))` — Set |Γ| = Γ_m; 1 + tan² = 1/cos².
   - `FBW = 2 - 4*theta_m/pi` — tan² is symmetric about θ = π/2, so the band is θ_m … π − θ_m, f from 2θ_m/π·f0 to
     (2 − 2θ_m/π)·f0.
   - the text — θ_m = arccos of the root (0 < θ_m < π/2).
   Binding: random R_L (1–41 or 60–960 Ω), Γ_m 5–95 % of |R_L − Z0|/(R_L + Z0), band 0.001·f0 … 1.999·f0 linear 801;
   θ_m from `atF0.lo`, θ random 0.1–3.1 with Γ and Z_in from `markerAt`.

## Short lines

No new keys. Eleven relinked (above); `ui-why` checks every link opens a topic that exists, so the two new anchors
must exist before whys.ts changes.

## Checks (scratch `npx tsx` scripts, not in the repo)

- **Every worked number** of theory-sweep.md is from `runSweep` + `bandFigures` / `markerAt` / `evaluateCircuit` of the
  circuits above, printed to 4–5 digits and copied; the fractional bandwidths equal (hi − lo)/f0 of the printed edges.
- **By hand** (u = f0/f, y_in = 1/(0.5 + j(0.5 − u)) − ju for the start circuit): |Γ| at 50 MHz 0.87447, at
  60.874 MHz 0.70711 (half power), at 79.496 MHz 0.31622 (10 dB edge), at 150 MHz 0.28662 — equal to `markerAt` to
  1e-15; |Γ| → 0.44721 as f → ∞ (engine at 1 THz 0.44721). Slope at f0: dy/dδ = 2 + j, |dΓ/dδ| = 1.118 (engine 1.118).
- **Closed forms vs engine:** λ/4 bandwidth 0.367002 / 0.143372 (20 dB) and 1.56731 (10 dB) against `fractional`
  0.36700 / 0.14337 / 1.567; series RLC Q_L 1 and 2.5, half-power edges 61.803 / 161.803 MHz = f0(√5 ∓ 1)/2,
  FBW Xm/(ω0L) = (1/3)/Q_L; L-network slope 0.70711 and 1.78885 against central differences.
- **Registry steps** of entries 3, 5, 6 against the engine on 100–200 random cases each: worst relative 1.2e-11,
  1.2e-11, 2.3e-11.
- **Turning sense:** the signed turning angle summed along each refined trace is negative (clockwise) for all 13
  example circuits (16 sweeps), e.g. start −216°, λ line −833°. Self-crossings counted segment by segment: two 1,
  one (λ line) 2, all others 0. The two-section match's second zero is at 61.8034 MHz = f0·2/(1 + √5), |Γ| 9e-16
  (stated on the page as found, not explained).
- `references.bib`: `WikiQ` added; every cited key (WikiQ, SteerVol3, Ellingson2018) exists.
- Sizes: theory-sweep.md 13 kB, claims.md 33 kB, theory.md 39 kB (under 40 kB; further theory goes in new parts).

## For M7.4b

- Check the topics' live numbers in ui-theory against the engine like the others, and the fixed examples by sweeping
  the circuits of the table above in the harness (they are not on the page as circuits).
- The page could offer the examples as lesson links (M6.3) so a reader can open each trace; not part of M7.4a.
