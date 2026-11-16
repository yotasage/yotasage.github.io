# Notes from M1.7 – via model, TDR and the N-port type (2026-11-16)

## API for M3

- `viamodel.ts`: `viaModel(stackup, via, trace, { tr = 35 ps, z0 = 50, M, estimate, feeds, f, nf, tdr })` →
  `nodes` (ΔC per crossing), `pieces` (barrel lines), `stubs` (`fRes` with pads, `fFormula` bare), `feeds`, `lumped`
  (the section as one element: L, C, √(L/C), Zdiff/Zcm for a pair, delay), `nport` (2- or 4-port at 50 Ω), `mixed`
  (D1, D2 at 100 Ω, C1, C2 at 25 Ω), `tdr` (single, or differential) and `tdrCommon`, `flags`, `assumptions`,
  `valid` (λ/8 of the longest pad window), `parts` (ms). `viaTarget(…, 'z'|'zdiff'|'zcm', target, 'antipad'|'returns')`.
  Jobs `via` and `via-target` in jobs.ts.
- `nport.ts`: `NPort` (engine.md §8) for the via model now and the full-wave solver later; `abcdToS`, `toMixedMode`.
- `tdr.ts`: a periodic square wave with Gaussian edges (f3·tr = 0.3396): DC and odd harmonics of 1/T to the edge's
  10⁻⁷, evaluated at the record's times directly (an inverse FFT without padding); the edge is the only window;
  T/2 = max(1 ns, 40 × delay, 20·tr). Stated error: truncation + settling over the last quarter of T/2.
- Feeds end at the pad's edge (their length is to the axis); the setup's trace mirrored to the exit layer.

## The wall (decided)

The axisymmetric solve uses the return vias' coaxial equivalent radius R_eq (`equivalentRadius`, C44 1.255 mm) as
its wall, and ΔC = window charge − the cut's C′ over the window. Reason: between the planes the axisymmetric barrel
then has exactly the cut's C′, so its window charges far from the pads are the cascade's lines and ΔC is only the
local excess; Σ lines + ΣΔC equals the axisymmetric total to 10⁻¹² (checked on C44, the fixture via, C45). The rule
wall (4.91 mm) with its own line part gives ΣΔC 152.7 fF (barrel charge counted twice); referred to the cut it gives
83.4 fF against 89.9 fF, from window charges of a barrel that ends on the planes instead of the returns. When R_eq lies
inside an opening the rule wall is used, referred to the cut's C′, with the flag `wall-rule`.

## Flags (each fires on its case, none on the fixture via without feeds or on C45 at 35 ps)

| code | threshold |
|---|---|
| `no-return` (error) | no return via: refused |
| `return-far` | nearest return > 2 mm (provisional, BL92; M6.4 sets it) |
| `return-in-antipad` | antipad edge past a return via's edge (C44 fires: 0.25 mm) |
| `pad-overlap`, `antipad-overlap` | pair pads ≥ pitch; round antipads > pitch (Miller2004) |
| `shared-antipad` | pair with a shared antipad and the band (edge −20 dB, 2.58·f3) > 40 GHz (Duan2014) |
| `lumped-long` | a pad window's c0/(8ℓ√εr) < f3 (Cartier2007): fixture at 10 ps, 30.3 < 34.0 GHz |
| `via-lumped` (info) | the section as one element: 1/(8τ) < f3 |
| `stub-resonance` | first stub resonance (with its pads) < the band: C44 exit at L3, 21.9 GHz (27.5 bare) |
| `feed-over-antipad` | the feed crosses its reference plane's antipad (BL90) |
| `wall-rule` (info) | R_eq inside an opening |

## Checks

Uniform 60 Ω line: TDR plateau 4 × 10⁻⁹ Ω off (stated 1.6 × 10⁻⁷ Ω), TDT exact; coupled pair reads Zdiff 90, Zcm 30 to
4 × 10⁻⁹. Unitarity and reciprocity ≤ 2.2 × 10⁻¹⁵ (single, 4-port, mixed). Stub 1.3 mm in εr 4.3: 27.8025 GHz =
formula, |S21| 10⁻¹³. Low-frequency C and L of the chain = the lumped section to 10⁻⁶. Budget: C44 with feeds 2.9 ms
cached (19 ms with pads and feeds solved), fixture 4.2 ms, C45 pair 13.8 ms (4-port, mixed, two TDRs).

## openEMS via fixture (model / openEMS)

Feeds 53.08 / 53.94 Ω. Section √(L/C) 50.6 / 78.8 Ω, 14.1 / 12.0 ps, L 0.714 / 0.948 nH, C 0.279 / 0.153 pF; barrel
64.4 Ω (thin-wire 65.1). S11 −27.8 / −13.0 dB at 5 GHz, −25.0 / −7.2 at 20 GHz; TDR peak 52.4 / 64.0 Ω. The
difference is the feed over the 1.8 mm antipad (0.6 mm a side with no plane under it): as a 151 Ω line it gives
S11 −12.1 / −15.4 dB at 5 / 10 GHz (openEMS −13.0 / −15.6) and a TDR peak of 65.9 Ω at 31 ps (64.0 at 32 ps). The
section values differ in kind too: openEMS de-embeds the feeds to the axis with the feed's own line, which removes more
C than the trace over the hole has. Not a pass bar (M6.4); BL90.

## C44, C45

C44: barrel 60.51 ± 0.08 Ω, section 50.49 Ω, 13.48 ps, 266.9 fF. C45 (stadium as round Ø1.22): barrel Zdiff 93.47 Ω,
section Zdiff 83.99 Ω, Zcm 36.84 Ω; 100 Ω would need a round antipad Ø3.14.

## Open

BL90 (feed over the antipad), BL91 (each via of a pair its own backdrill), BL92 (provisional thresholds; the target's
jump where the wall changes).
