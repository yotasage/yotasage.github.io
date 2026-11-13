# Smith chart – notes of step M7.1 (sweep engine)

Done 2026-11-13. Harness only, no page: `lib/smith/sweep.ts` and `scripts/harness/smith/check-sweep.mjs` (in
`npm run check`).

## API for M7.2a, M7.2b and M7.3

All in `lib/smith/sweep.ts`. Frequencies in Hz, Γ normalised to Z0, |Γ| thresholds as magnitudes (use convert.ts's
`magFromVswr` / `magFromReturnLoss` for a VSWR or return-loss limit).

| Export | What |
|---|---|
| `Band` `{ start, stop, points, log }` | A band; `bandProblem(band)` → `'start'` (not finite, < 0, or 0 in a log band), `'stop'` (not above start), `'points'` (not an integer in `MIN_POINTS` 2 … `MAX_POINTS` 100,000), `'narrow'` (steps at rounding level) or null. `defaultBand(f0, span = 0.5, points = 401)`. `bandFrequencies(freqs, start, stop, n, log)`: both ends exact, even steps in f or in log f |
| `SweepCircuit`, `sweepCircuit(circuit, into?)` | The circuit packed once (network.ts's layout); pass `into` to reuse it per drag frame |
| `Trace` (`new Trace(capacity)`) | `n`, `freqs`, `gamma` (interleaved re, im), `log`, `start`, `stop`, `base` (band points); after `refine`: `passes`, `added`, `capped`, `limited`. **Read `freqs`/`gamma` from the trace after every call**: `refine` swaps them with its back buffers and `reserve` replaces them when the capacity grows |
| `sweepBand(trace, band, sc)` | One sweep: the band's frequencies and network.ts's allocation-free `sweep` into the trace |
| `refine(trace, sc, options = REFINE_DEFAULTS)` | Midpoints (geometric in a log band) into every segment whose chord is over `maxStep` (0.02 of the chart's radius) or that meets a turn over `maxAngle` (5°), pass after pass, until none is left, a segment is under `minSpan`·f (1e-9) or the trace holds `cap` (10,000) points; with too little room the worst segments (ratio to their threshold) go first, ties from low f. Turns between chords under `ANGLE_FLOOR` (1e-9) are not counted |
| `runSweep(trace, band, sc, options | null)` | `sweepBand` then `refine` (none with null) |
| `bandFigures(trace, sc, threshold, f0 = sc.f0)` → `BandFigures` | `worst` / `best` (`{ f, mag }`, polished between samples), `worstRL`, `bestRL`, `maxVswr`; `intervals` (`{ lo, hi, openLo, openHi }`, ascending, every one with \|Γ\| < threshold; an open end is the band's end); `atF0` (the interval holding f0, null when f0 is outside the band or not below); `fractional` = (hi − lo)/f0 (NaN without `atF0`); `q` (`LoadedQ` `{ f, mag, lo, hi, q, openLo, openHi }` or null) |
| `markerAt(sc, f)` → `MarkerPoint` | `{ f, gr, gi, mag, vswr, rl, zr, zi }` (z in ohms); bit-identical to the sweep's point at that f. `markersAt(sc, freqs)` |
| `pickOnTrace(trace, gr, gi)` → `{ index, t, f, dist }` | The polyline point nearest a Γ (a tap on the chart): segment, fraction, the frequency there in the band's spacing (evaluate it with `markerAt`), distance |
| `segmentAt(trace, f)`, `nearestIndex(trace, f)` | Binary searches: the segment holding f, the nearest point (a marker's arrow keys step `nearestIndex ± 1`) |
| `gammaAt(out, o, sc, f)`, `mag2At(sc, f)` | One point |

Deterministic: the same circuit, band and options give the same arrays and figures to the bit (checked).
`sweepBand` and `refine` allocate nothing once the trace has its capacity; `bandFigures` allocates its result and
small arrays of candidates.

## How the figures are found

- **Worst and best |Γ|.** Every sample that is a local extremum (strictly above a neighbour) and whose value plus its
  largest change to a neighbour could beat the best so far is polished by golden-section search between its
  neighbours to 1e-12 relative in f, best bound first (branch and bound; a parabolic peak between samples exceeds its
  best sample by at most a quarter of that change). The result is an evaluated point, never worse than the samples.
- **Intervals below a threshold g.** Samples within their change of g that are a dip (or bump) are polished first, so
  a dip below g (or a bump above it) between samples is seen; then every change of side along the samples and those
  points is bracketed by bisection to 1e-12 relative in f.
- **Around f0.** The interval holding f0; when the samples missed it but |Γ(f0)| < g, the walk out from f0 finds it.
  Fractional bandwidth (hi − lo)/f0.
- **Loaded Q.** From the |Γ| minimum nearest f0 (walk downhill on the samples from f0, polish; **f0 itself** when
  |Γ(f0)|² is that minimum to 1e-12 relative, so a flat |Γ| or a resonance at f0 gives f0), the half-power band: the
  power delivered, 1 − |Γ|², above half its peak, i.e. |Γ|² < (1 + |Γmin|²)/2; Q = fmin/(hi − lo). Null when
  |Γmin|² ≥ 1 − 1e-12 (nothing is delivered). With an open end the band went on past the sweep and q is an upper
  bound. For a matched resonance (|Γmin| = 0) the level is |Γ| = 1/√2 (VSWR 5.83).

## Closed forms used by the harness (derivations)

**Series RLC** (load R, then series L and series C, on Z0): Z = R + jX, X = ωL − 1/(ωC),
|Γ|² = ((R − Z0)² + X²)/((R + Z0)² + X²), increasing in X². So |Γ| < g ⇔ X² < Xm² with
Xm² = (g²(R + Z0)² − (R − Z0)²)/(1 − g²) (needs g > |R − Z0|/(R + Z0)). ωL − 1/(ωC) = ±Xm gives
ω± = (√(Xm² + 4L/C) ± Xm)/(2L), width ω+ − ω− = Xm/L, fractional bandwidth Xm/(ω0L).
Half power: 1 − |Γ|² = 4RZ0/((R + Z0)² + X²) is half its peak 4RZ0/(R + Z0)² at X = ±(R + Z0), so the edges are
ω± with Xm = R + Z0, and since ω+ω− = 1/(LC) = ω0², Q = ω0/(ω+ − ω−) = ω0L/(R + Z0), the loaded Q of the resonator
with the source's Z0 in series (SteerVol3 §6.4 for Q as reactance over resistance).

**λ/4 transformer** (Zt = √(Z0·RL) on a real load RL, θ = (π/2)·f/f0, t = tan θ):
Zin = Zt(RL + jZt t)/(Zt + jRL t); with Zt² = Z0·RL, Zin − Z0 ∝ Zt(RL − Z0) and Zin + Z0 ∝ Zt(RL + Z0) + 2jtZ0RL,
so |Γ|² = (RL − Z0)²/((RL + Z0)² + 4t²Z0RL) = (RL − Z0)²/((RL − Z0)² + 4Z0RL·sec²θ). |Γ| = Γm at
cos θm = 2Γm√(Z0RL)/(|RL − Z0|√(1 − Γm²)); |Γ| is symmetric about θ = π/2, so the band is θm … π − θm and
Δf/f0 = 2 − 4θm/π. This is the textbook result for a single-section transformer (Pozar, *Microwave Engineering*,
"bandwidth of the quarter-wave transformer"; no copy at hand, sources.md, so the derivation above is what is cited).

## Checks (`check-sweep.mjs`, 3,691 checks)

The counts below are from a run of the file alone; inside `npm run check` the shared random sequence gives other
circuits (there: 149,079 points refined, 207 intervals, worst edge 1.9e-10, worst loaded Q 1.1e-6), all within the
same bars.

- **Bands:** `bandProblem` cases; 200 random bands with ends exact, ascending, even steps in f or log f.
- **Sweep vs point engine:** 200 random circuits (1–10 parts of every kind, Z0 25–100 Ω, f0 1 MHz–10 GHz, loads
  1–500 Ω and ±300 Ω, random linear or log bands of 101–1,000 points), every point of the refined trace (145,507
  points, 39,338 added by refinement) against `evaluateCircuit` at that f: worst difference 0 (bit-identical).
- **Refinement:** 200 traces refined uncapped: every chord ≤ 0.02 (largest 0.0200), every counted turn ≤ 5°
  (largest 4.99°), none left at the minimum span, ends kept, ascending; a cap of one more point adds one point at the
  worst segment; a cap of 500 stops at 500.
- **Brute force (10⁶ points, 200 circuits of 1–6 parts, about 25 s):** worst and best |Γ|² never below the brute
  force's sample and above it by at most its resolution there; 222 intervals (444 edges) below a threshold between the
  band's best and worst (every fifth VSWR 2) all found, edges against the brute force's brackets bisected by the
  harness: worst 6.2e-12 relative (bar 1e-9); none extra; the interval around f0 and its fractional bandwidth; 200
  loaded Qs (worst 1.8e-6 relative, within four brute-force steps: the brute force places the minimum to its step).
- **Closed forms:** 57 cases (series RLC: five resonators, Qs 2–200, R = Z0 and not, thresholds 0.1–0.8, linear and
  log bands: edges, fractional bandwidth, the minimum at f0, half-power edges and loaded Q to 1e-9; λ/4: five loads
  10–1000 Ω on 50 and 75 Ω, Γm 0.02–0.2, linear and log: edges and Δf/f0 to 1e-9, |Γ| at the band's end to 1e-12);
  worst 1.3e-10 relative.
- **Markers and determinism:** 50 circuits: a marker on a trace point is that point, z in ohms, RL and VSWR,
  `nearestIndex`, `segmentAt`, picking a point and a chord's middle; the sweep, refinement and figures again in a new
  trace give the same arrays and JSON.

## Timings (median, Node 26 on the owner's laptop; Edge 157 by a bundled page, headless)

| | Node | Edge 1× | Edge 4× CPU |
|---|---|---|---|
| 10,000-point sweep, 10 parts (the network timing circuit) | 2.8 ms | 3.6 ms | 15.7 ms |
| 2,000-point sweep, same | 0.53 ms | 0.7 ms | 3.2 ms |
| refine 101 → 928 points (0.2–3·f0, 4 passes) | 0.24 ms | | |
| band figures of that trace, and of the 200 random refined traces | 0.09 ms | | |

The 10,000-point sweep is **inside but not well under** the 4 ms script budget at 1× and far over it at 4×: about
25 ns per part and frequency, which is the cost of `applyPart` itself (Math.sin/cos for lines and stubs, the bounded
forms of lumped parts). Tried in a bundled build and not kept: applying part by part over all frequencies (−2 to
−7 %), the outputs of `lumped` and `sincosTurns` in typed arrays instead of module variables (−15 % for resistors,
+35 % for the mixed circuit). **For M7.2a:** while dragging, sweep the band's base points only (2,000 fit
the budget at 1× and 4×) or run the 10,000-point sweep in a worker (the pattern of `solve.worker.ts`) and draw the last
finished trace; refine after the pointer is released. A faster kernel (per-kind loops with the node in locals, hoisted
ω factors) is BL64.

## Decisions

- Thresholds of the refinement are on the Γ plane (the chart), not in screen pixels, so the trace is the same at
  every zoom; M7.2a may pass a smaller `maxStep` for a zoomed view.
- The loaded Q is the half-power width of the delivered power around the minimum nearest f0, not a node Q (the
  node Q, |x|/r, is `M_Q` of network.ts and the chart's Q circles).
- The fractional bandwidth divides by f0, not by the interval's centre: for the λ/4 transformer the two agree, and the
  figure answers "how much of f0's neighbourhood is matched".
