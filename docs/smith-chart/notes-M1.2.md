# Smith chart – notes of step M1.2 (parts and network)

Part of [plan.md](plan.md). Nothing on the site yet. Checks: `cd scripts/harness/smith && npm run check` (159,713
checks; the M1.2 groups are in `check-network.mjs`, called by `check.mjs`; the resistor harness still passes its 3294).

## API

**`lib/smith/parts.ts`**
- Kinds as numbers: `SERIES_R`, `SERIES_L`, `SERIES_C`, `SHUNT_R`, `SHUNT_L`, `SHUNT_C`, `LINE`, `STUB_OPEN`,
  `STUB_SHORT` (both shunt), `QUARTER`; `PART_KINDS`; type `PartKind`; `isSeries`, `isShunt`, `isLine`, `isStub`.
- `interface Part { kind, value, zc? }`: value is R (Ω), L (H), C (F), a length in **wavelengths at f0** (line, stubs;
  θ = 2π·value·f/f0) or Zt (Ω, `QUARTER`, length λ/4 at f0). `zc` (Ω) for lines and stubs.
- `packParts(parts, into?)` → Float64Array of `PART_STRIDE` = 3 per part (kind, value, zc), load first.
- `ADDS[kind]` ('r', 'x', 'g', 'b', 'turns', 'zt'), `REACH_LO[kind]`, `REACH_HI[kind]` (the added quantity's reach),
  `LINE_PERIOD` = 0.5, `noEffect(kind, f, f0)` (series C ∞, shunt L ∞, short stub 0.25·f0/f, λ/4 NaN: its arc is a
  line of Zt from length 0).
- `added(kind, value, zc, f, f0, z0)`: the normalised r, x, g, b (stubs: b), turns at f, or Zt/Z0; `valueFor(...)` its
  inverse (stubs: the shortest length, open θ ∈ [0, π), short θ ∈ (0, π]). These are the three-form conversions of
  engine.md §2 (component ↔ ohms/siemens = normalised × Z0 ↔ normalised).
- `turnsFromMetres(m, f0, eEff = 1, c = C0)`, `metresFromTurns(...)`, `C0` = 299 792 458.
- `sincosTurns(t)` → `SIN`, `COS` of 2πt with the turn reduced exactly (exact 0 and ±1 at quarter turns).
- `partMatrix(m, o, kind, value, zc, f, f0, z0)`: 8 numbers, the normalised ABCD [[A, B/Z0], [C·Z0, D]] up to a
  factor (see below). `lumped(...)` → `PART_DIRECT`, `PART_RE`, `PART_IM`: the bounded immittance used by both.

**`lib/smith/network.ts`**
- Node: `NODE_STRIDE` = 4 (V re, V im, I re, I im), normalised (V, I·Z0). Node 0 is the load, node k the input of
  part k.
- `loadNode(nodes, o, R, X, z0)`, `applyPart(nodes, o, kind, value, zc, f, f0, z0)` (in place),
  `evaluate(nodes, parts, count, loadR, loadX, z0, f, f0)` (count + 1 nodes), `nodeGamma(out, o, nodes, n)`,
  `inputGamma(out, o, parts, count, loadR, loadX, z0, f, f0)`, `sweep(gamma, freqs, nf, parts, count, loadR, loadX,
  z0, f0)` (interleaved Γ per frequency). None of these allocates.
- Figures: `nodeMetrics(metrics, mo, nodes, k)`, `allMetrics(metrics, nodes, count)`; `METRIC_STRIDE` = 12 at
  `M_GR`, `M_GI`, `M_MAG`, `M_ANGLE` (rad), `M_VSWR`, `M_RL`, `M_ML` (dB), `M_Q`, `M_ZR`, `M_ZI`, `M_YR`, `M_YI`
  (normalised z = V/I, y = I/V; the open/short is (Infinity, 0)). All from convert.ts.
- `interface Circuit { z0, f0, loadR, loadX, parts }` and `evaluateCircuit(circuit, f?)` (allocates; for panels).
- The load is a fixed impedance (open: `loadR = Infinity`); a frequency-dependent load is parts (C27: 17.5 Ω + series L).

## The degenerate rule as implemented (engine.md §4, D4)

- Each lumped part and stub is applied in a bounded form computed directly from its value: a series z with |z| ≤ 1 as
  [[1, z], [0, 1]], else w = 1/z as [[w, 1], [0, w]]; a shunt y with |y| ≤ 1 as [[1, 0], [y, 1]], else u = 1/y as
  [[u, 0], [1, u]]. A value of 0 or ∞ gives w = 0 or u = 0, i.e. engine.md's scaled matrices [[0, 1], [0, 0]] and
  [[0, 0], [1, 0]], with no special case. Lines use their unit-determinant matrix (entries ≤ max(Zc/Z0, Z0/Zc)).
- A (0, 0) product (open + series open, short + shunt short, or an underflow on the way to one) becomes the part's
  image point: (1, 0) after a series part, (0, 1) after a shunt part. A node whose largest component leaves
  [2^−64, 2^64] is rescaled by an exact power of two (in two factors: the fuzz found `1/m` overflowing for a
  subnormal m).
- Γ = (V − I)/(V + I) by `cdiv`; V + I = 0 (not passive) gives (Infinity, 0), never NaN.
- Not checked at run time: f, Z0, Zc, Zt > 0 finite; lengths finite ≥ 0; R, L, C ≥ 0 (0 and ∞ allowed).

## Results

- C12–C28 reproduced to the source's digits and to ours (1e-9); C19's L and C from the stub's dB/dω by finite
  difference (1e-8). 231 checks.
- Second computation (ohms, series adds Z, shunt adds Y, tan formula for lines and stubs): worst |ΔΓ| 2.6e-13
  (relative to max(1, |Γ|)) on 10,000 random circuits of 1–10 parts of all kinds, f within ×2 of f0, Z0 0.01 Ω to
  10 kΩ; `partMatrix` the same; AD − BC = 1 to 1e-14 for unscaled matrices.
- Fuzz: 100,000 circuits with values 0, ∞, 1e±300, lengths at multiples of λ/8, open, short, matched, reactive and
  infinite loads, f within ×1000 of f0: no NaN, no (0, 0) or infinite node, |Γ| ≤ 1 + 1e-9.
- Direction of travel (1,000 points each) and staying on the circle (1e-12): as engine.md §1 says; both stubs move
  clockwise on their g circle as they grow (the open from 0, the short from λ/4).
- λ/8, λ/4 transformer (Zt²/Z_L at f0, Z_L at 2f0, a λ/8 line of Zt at f0/2), λ/2 periodicity (1e-13), and an exact
  node (±1) after n·λ/2 at f0.
- **Timing** (Node 26, the owner's laptop): 10 parts at 2,000 frequencies **0.54 ms** per sweep; nodes and figures of
  10 parts at one frequency 0.8 µs. Against engine.md §9's 4 ms of script per drag frame: an eighth at 1×, about
  2.2 ms at 4×, so the trace can be recomputed on every drag frame.

## Corrections

- facts.md eq. 12 had B's sign reversed: B = (Z_line − Z_chart)/(Z_line + Z_chart) (−0.2 in C12). Corrected there.
- engine.md stands.

## For M1.3

- Γ of a node is invariant to the node's scale, and partMatrix's matrices are only defined up to a factor: compose
  them as Möbius maps (that is all geometry.ts needs), never rely on their determinant.
- The arc of a part starts at `noEffect` and ends at the part's value; for the λ/4 transformer use a line of Zt from
  length 0 to 0.25 (at f0). A line's locus circle is about Zc (facts eq. 12, corrected sign).
- `added`/`valueFor` map a projected r, x, g, b or rotation back to a value (stubs: the shortest length).
