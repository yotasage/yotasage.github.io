# Smith chart – theory content, the sweep's topics (step M7.4a)

Third part of [theory.md](theory.md), for the M7 row of learning.md §5; the head of theory.md ("How to read this
file") holds for this part too. Topics §12–§13 (page topics 11–12, after "Realisable values and standard values");
claims 237–281 in [claims.md](claims.md); what the page builds, the new registry entries and the engine checks of
every number in [notes-M7.4a.md](notes-M7.4a.md).

**The examples' band.** Unless a sentence names another, every number assumes the band the Sweep panel starts with,
`defaultBand(f0)`: 50 to 150 MHz, 401 points, linear, refined (`runSweep` with `REFINE_DEFAULTS`), and the plot's
starting limit, 10 dB (|Γ| = 0.3162). Z0 = 50 Ω and f0 = 100 MHz throughout. "20 dB" is |Γ| = 0.1. All numbers are
`bandFigures` / `markerAt` of `lib/smith/sweep.ts` (notes-M7.4a.md "Checks").

New citation: `WikiQ` ("Q factor", Wikipedia; sources.md).

---

## 12. Q and bandwidth

**Id:** `q-and-bandwidth` (page topic 11)

**Text.**

**Why a match has a band.** Every inductor and capacitor enters the circuit only as ωL or ωC, and a line's electrical
length grows in proportion to f, so raising f by a factor k does what multiplying every L and C by k, and making every
line and stub k times longer, would do at f0. ⟨237⟩ Each part's arc then ends a little past or short of where it
ended at f0, and the end of the path leaves the centre, the further the further f is from f0. ⟨238⟩

**Two measures.** The band of a match is the stretch of frequencies where |Γ| stays below a limit you choose; the tool
takes the limit as a return loss. ⟨239⟩ Its width over f0 is the fractional bandwidth, (f_hi − f_lo)/f0; the tool
divides by f0, not by the band's middle, so the figure says how much of f0's neighbourhood is matched. ⟨240⟩ For a
resonator, Q is the resonant frequency over the width where the power stays above half its peak, the reciprocal of the
fractional bandwidth [WikiQ "Bandwidth definition"]. ⟨241⟩ The tool's loaded Q applies this to the power delivered,
1 − |Γ|², around the best point near f0; for a perfect match, half power is |Γ| = 1/√2: VSWR 5.83, return loss
3.01 dB. ⟨242⟩

**The simplest case.** A 50 Ω load with a series L and a series C that cancel at f0 is matched there, and as only x
changes, its trace runs along the r = 1 circle. ⟨243⟩ The Q of a series RLC circuit is ω0L/R [WikiQ "RLC circuits"];
here the resistance in the loop is the load's and the source's Z0, so Q_L = ω0L/(R + Z0), and the half-power width is
exactly f0/Q_L. ⟨244⟩ Below a limit Γm the band is X_m/(ω0L) of f0, where X_m is the reactance that reaches the limit:
for the same R, the higher Q_L, the narrower in proportion. ⟨245⟩ With x = ±2 (159.15 nH and 15.92 pF): Q_L = 1,
half power from 61.80 to 161.80 MHz, and at 10 dB 84.71 to 118.05 MHz, 33.33 % of f0; with x = ±5 (397.9 nH,
6.366 pF): Q_L = 2.5, half power 81.98–121.98 MHz, 10 dB 93.56–106.89 MHz, 13.33 %. ⟨246⟩ (Band for these two:
10 MHz – 1 GHz, log.)

**A higher-Q path.** An L network matching R_low to R_high has Q = √(R_high/R_low − 1) in both legs [SteerVol3 §6.4].
⟨247⟩ Near f0 its input leaves the centre at |dΓ/dδ| = Q²/√(1 + Q²), with δ = (f − f0)/f0 the detuning, whichever
of the two L networks it is. ⟨248⟩ So for a small limit Γm the band is about 2Γm·√(1 + Q²)/Q² of f0, close to 2Γm/Q
when Q is large. ⟨249⟩ At 20 dB: 25 Ω on 50 Ω (Q 1; series C 63.66 pF, shunt L 79.58 nH) is matched from 88.24 to
118.20 MHz, 29.96 % (estimate 28.28 %); 10 Ω (Q 2; 79.58 pF, 39.79 nH) from 94.82 to 106.14 MHz, 11.33 % (estimate
11.18 %). ⟨250⟩ A point's Q is |x|/r (Matching with two parts): the larger ratio needs larger reactances against its
resistance, so its path climbs to a node of Q 2 where the 25 Ω match's stays at Q 1. ⟨251⟩ Two L sections through
√(10·50) = 22.36 Ω need only Q 1.112 at each step (143.15 pF, 32.01 nH, 64.02 pF, 71.58 nH), and match 10 Ω from
90.96 to 109.43 MHz, 18.48 %: more parts, a wider band. ⟨252⟩ In every example here, the path that keeps to lower
node Q has the wider band around f0. ⟨253⟩

**A longer line.** A line's θ grows in proportion to f, so a line ℓ long (ℓ/λ at f0) turns its point a further
720°·(ℓ/λ)·δ: each extra λ/2 adds 360°·δ. ⟨254⟩ The start load sits on g = 1, so a shunt part alone matches it, and
lines can be put in front of it. At 10 dB: an open stub of λ/8 alone is matched from before the band's start to
131.19 MHz (at least 81.19 %); 0.1619 λ of line and a shorted stub of λ/8 from 88.92 to 114.30 MHz, 25.37 %; λ/2 of
line and the open stub from 90.55 to 107.94 MHz, 17.39 %; λ of line and the stub from 95.21 to 104.37 MHz,
9.16 %. ⟨255⟩ Even the stub is narrower than the part it stands for: its b = tan θ rises by π/2 per unit of δ at λ/8,
a capacitor's b = ωCZ0 by 1, and the shunt C of 31.83 pF keeps the whole 50–150 MHz band above 12.30 dB. ⟨256⟩

**The λ/4 transformer.** Its band below Γm has a closed form, derived step by step (`quarter-wave-bandwidth`). ⟨257⟩
At 20 dB it matches 25 Ω (Zt 35.36 Ω) from 81.65 to 118.35 MHz, 36.70 %, and 10 Ω (Zt 22.36 Ω) from 92.83 to
107.17 MHz, 14.34 %: the larger the step, the narrower. ⟨258⟩ At 10 dB the 25 Ω transformer holds from 21.63 to
178.37 MHz. ⟨259⟩ (Band: 1–199 MHz, linear.)

**The start circuit.** Its load and node 1 both have Q 1; the input, at the centre, 0. ⟨260⟩ At 10 dB it is matched
from 79.50 MHz to past the band's end (at least 70.50 MHz wide, 70.50 % of f0); at 20 dB from 92.12 to 110.54 MHz,
18.41 %. ⟨261⟩ Its loaded Q is at most 1.122: the power falls to half at 60.87 MHz below f0 but never above it, since
at high f the series C is a short and the shunt L an open, leaving the bare load with |Γ| = 0.4472 and 80 % of the
power delivered. ⟨262⟩ Over 10 MHz – 1 GHz (log) the 10 dB band closes at 162.89 MHz (83.39 %), and the loaded Q
still has no upper edge. ⟨263⟩

**What this leaves out.** Everything here is for ideal parts, lossless lines and a load whose Z is the same at every
frequency; a real load changes with f, and real parts have their own Q, losses and self-resonance, which the tool does
not model, so a measured trace can differ. ⟨264⟩

**Equations:** `fractional-bandwidth`, `q-loaded`, `q-series-rlc`, `fbw-series-rlc`, `q-l-network`,
`l-network-slope`, `q-node`, `line-theta`, `line-rotation`, `quarter-wave-match`, `quarter-wave-bandwidth`
(new: `fractional-bandwidth`, `q-loaded`, `q-series-rlc`, `fbw-series-rlc`, `l-network-slope`,
`quarter-wave-bandwidth`; notes-M7.4a.md).

**Live numbers:** with the sweep on, the user's band figures at the user's limit (`TraceLayer.figures`: `atF0` lo, hi,
open ends, `fractional`; `q` with `lo`, `hi`, `f`, open ends; the words of `bandText.ts`), the band and limit, and the
node Q of every node (`M_Q`) with the largest marked. With the sweep off: the start circuit on the band above.
Start: [10 dB: 79.50 MHz to past 150 MHz, at least 70.50 %; loaded Q at most 1.122, half power 60.87 MHz to past
150 MHz; node Q 1, 1, 0]. The worked examples (⟨246⟩, ⟨250⟩, ⟨252⟩, ⟨255⟩, ⟨256⟩, ⟨258⟩, ⟨259⟩, ⟨263⟩ and §13's ⟨269⟩–⟨276⟩) are fixed text, checked
against the engine by the harness (notes).

**Figure:** two mini charts side by side, each with the 10 dB circle dashed and ticks on the traces at 90 and 110 MHz:
left, the series resonators x = ±2 and x = ±5 on 50 Ω (both on r = 1; the x = ±5 ticks lie further from the centre);
right, the start load with the λ/8 open stub alone and with λ/2 of line before it (the second trace longer, its ticks
outside the circle). Under them a small table of the examples' fractional bandwidths (one row per example of ⟨250⟩,
⟨252⟩, ⟨255⟩, ⟨258⟩).

**Citations:** WikiQ "Bandwidth definition", "RLC circuits"; SteerVol3 §6.4.

---

## 13. Reading a frequency trace

**Id:** `reading-a-trace` (page topic 12)

**Text.**

**What it is.** The trace is the input's point at every frequency of the band, joined in order of f: the point the
chart shows at f0, swept. ⟨265⟩ Its distance from the centre is |Γ| at that frequency, so the circles about the centre
are circles of constant VSWR and return loss (How good is a match). ⟨266⟩

**Which way it runs.** Raising f makes every part's x or b larger (a series C's x and a shunt L's b rise towards 0)
and every line longer (Q and bandwidth), and each of those on its own turns its point clockwise (Moving on the
chart). ⟨267⟩ All the traces in these two topics turn clockwise as f rises. ⟨268⟩ The series resonator's runs round
the r = 1 circle, from near the open below the axis (at 10 MHz Γ = 0.990 − j0.100 for x = ±2) through the centre at
f0 to near the open above it (0.990 + j0.100 at 1 GHz). ⟨269⟩ The start circuit's heads for the short at low f,
where the series C opens and the shunt L shorts (at 10 MHz Γ = −0.980 + j0.200), and for the bare load at high f
(Q and bandwidth). ⟨270⟩

**How fast it runs.** Equal steps in f are not equal steps on the chart: where the trace runs fast, the match changes
fast with f, which is what a high Q means. ⟨271⟩ Markers show it: at 90 and 110 MHz the start circuit's input has
|Γ| = 0.1314 and 0.0957 (17.63 and 20.38 dB), the x = ±5 resonator's 0.4668 and 0.4307 (6.62 and 7.32 dB). ⟨272⟩

**Through the centre, loops and crossings.** Where the trace passes through the centre the match is perfect, and the
plot dips there. ⟨273⟩ The two-section match of 10 Ω (Q and bandwidth) passes through the centre at 100 MHz and
again at 61.80 MHz, looping between; its |Γ| rises only to 0.2182 (13.22 dB) at 74.35 MHz, so at 10 dB it is one
band, 56.93 to 137.07 MHz (80.15 %), and at 20 dB two, 59.94–64.43 and 90.96–109.43 MHz. ⟨274⟩ Where a trace
crosses itself, two frequencies give the same input. ⟨275⟩ A line makes the trace wind: with λ of line before the λ/8
stub, at 50 MHz the line is λ/2 and gives the load back unturned, so the input is the stub's alone (|Γ| 0.2811 in
both), and in 50–150 MHz the trace crosses itself twice and dips below 10 dB a second time, up to 56.71 MHz. ⟨276⟩

**The plot.** The plot under the chart is the same |Γ| against f, as return loss (a match is a dip) or VSWR. ⟨277⟩
The limit is a circle about the centre (10 dB: |Γ| = 0.3162, VSWR 1.925); the shaded stretches of the plot are where
the trace is inside it, and their edges where it crosses it. ⟨278⟩ The start circuit's trace enters the 10 dB circle
at 79.50 MHz and is still inside at 150 MHz (|Γ| 0.2866, 10.85 dB); at 50 MHz it is at −0.2941 + j0.8235,
|Γ| 0.8745, return loss 1.165 dB, the band's worst (VSWR 14.93). ⟨279⟩ The band figures read the same trace: the
worst and best return loss are its points furthest from and nearest to the centre, the band around f0 is the stretch
inside the limit's circle that holds f0, and the loaded Q the stretch inside the half-power circle around the best
point near f0 (Q and bandwidth). ⟨280⟩

**How it is drawn.** The sweep takes evenly spaced frequencies (or evenly spaced in log f, for wide bands) and adds
points where the trace turns by more than 5° or steps more than 0.02 of the chart's radius, so a sharp bend is drawn
as it is; markers and the figures are worked out at their own frequencies, not read off the drawn line. ⟨281⟩

**Equations:** `x-series-l`, `x-series-c`, `b-shunt-c`, `b-shunt-l`, `line-theta`, `return-loss`, `vswr`,
`gamma-vswr`, `power-delivered`.

**Live numbers:** with the sweep on, the user's band (start, stop, points, spacing), the input at both ends
(`markerAt` at `band.start`, `band.stop`: Γ, |Γ|, return loss), every marker's row (`markerAt`), the limit's |Γ| and
VSWR (`convert.magFromReturnLoss`, `vswr`), the intervals and the worst and best figures. With the sweep off: the
start circuit on the band above. Start: [50 MHz: Γ −0.2941 + j0.8235, |Γ| 0.8745, 1.165 dB; 150 MHz: −0.2861 + j0.0170,
|Γ| 0.2866, 10.85 dB; limit |Γ| 0.3162, VSWR 1.925; band 79.50 MHz to past 150 MHz; worst 1.165 dB at 50 MHz,
VSWR 14.93; best at 100 MHz, a perfect match; markers at 90 and 110 MHz: 0.1314, 17.63 dB; 0.0957, 20.38 dB].

**Figure:** (a) a mini chart with the start circuit's trace over 50–150 MHz, an arrow for rising f, dots at 50,
79.50, 100 and 150 MHz and the 10 dB circle dashed; beside it (below it on a phone) a small return-loss plot of the
same band with the 10 dB line, the matched stretch shaded and 79.50 MHz marked on both. (b) the two-section match's
trace with its loop through the centre and its plot with the two dips at 61.80 and 100 MHz, the 20 dB line drawn.

**Citations:** none new (the definitions are those of How good is a match: Ellingson2018 §3.14, SteerVol3 §2.8, if
the page repeats them).
