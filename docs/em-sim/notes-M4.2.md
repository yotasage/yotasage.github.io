# Notes of step M4.2 – the teaching layer as checked code (2026-11-16)

## The registry (61 equations, 135 steps)

| File | What |
|---|---|
| `lib/emsim/equations.ts` | Assembles and parses: `EM_EQUATIONS` (61: the trace's 33 in the theory's order, then the 28 of equations-list.md), `EM_EQUATION_BY_ID`, `EM_SYMBOLS`, `TEX_NAMES`, `emSymbolOf(name, eq?)`, `bindingFor`, `valuesTex`, `finiteValue`, `emTex`, `emSubstitutions` |
| `lib/emsim/equationsDef.ts` | `Def` (the written form), `EmObject` (now also via, piece, node, stub, feed, port, derivation), `sym`, `src` |
| `lib/emsim/equationsLines.ts` | `LINE_DEFS` (the 33, moved from equations.ts) with their steps, `STEP_SYMBOLS`, `STEP_TEX_NAMES` |
| `lib/emsim/equationsVia.ts` | `VIA_DEFS` (28) with steps, `VIA_SYMBOLS`, `VIA_TEX_NAMES` |

`EmEquation` gained `on` (`'trace'`: numbers from `emBinding`; `'via'`: from `viaBinding`), `stepVariables` (names only
the steps and their reasons use; they have meanings but never numbers on the page) and `symbols` (an entry's own
meanings). `bindingFor` and `valuesTex` take `Value` (a number or (re, im)): chain matrices and S-parameters are complex.

**Steps** are the shared `Step` (`text`, `tree`, `why`, `reason` from `parseReason`), written as `[text, why]` in each
`Def`. 45 entries have 135 steps; the 16 without are definitions, the tool's rules or source statements (`telegraph`,
`eeff-c`, `getsinger`, `charge-potential`, `mixed-mode-vars`, `pct-diff`, `share`, `corners`, `mc-normal`, `via-dc`,
`via-pad-coupling`, `via-target`, `target`, `abcd-shunt`, `s-db`, `tdr-rho`). Primes are spelt `Cp`, `C_0p`, `L_ip`
(TeX `C'`, `C_0'`, `L'_i`); names the trace uses with another meaning got their own (`L_sec`, `Z_ref`, `sigma_e`, `A_c`).
`via-barrel-z` is per piece on one barrel (Z_vac = barrel.zVac = Zc₁₁ for a pair); `via-coax`, `via-quasi-coax`,
`stub-zin`, `abcd-line`, `abcd-shunt`, `s-abcd`, `s-db`, `tdr-roundtrip`, `via-section-delay` apply to a single via,
`via-section-pair`, `via-pad-coupling`, `mixed-mode-s` to a pair (the per-mode forms for pairs: BL136).

## New values

- `lib/emsim/eqvaluesVia.ts`: `viaBinding(ViaContext)` with `{ model, via, piece?, node?, stub?, feed?, fIndex?,
  tIndex?, target? }` (defaults: the first through piece, the first node with ΔC, stub and feed 0, the point nearest
  10 GHz, the TDR's lowest point); `quasiCoax(a, b, R, N, er)`; `sAt(np, k, i, j)`; `nearestIndex(xs, x)`; `MU0_VIA`,
  `SWEEP_LEVEL` (1e-3, where the sweep ends). `via-quasi-coax` is bound only when every return via is at one distance
  with one drill.
- `eqvalues.ts`: `EmContext.inverse` (a Target result) binds `Z_x`, `Z_target` when reached.
- `viamodel.ts`: `barrel.C0` (the cut's vacuum C′ matrix) and `valid.window`, `valid.er` (the λ/8 window of `valid.fMax`).

## Examples as data

`lib/emsim/examples.ts`: `EXAMPLES` (5), `EXAMPLE_PATH`. An `Example` is `{ id, title, intro, links, steps, topics }`;
a link `{ name, recipe, link }` (the link as examples.md writes it, path included); a step `{ text, values, claims }`; a
value `{ value, digits, unit, key, link }` (`key` the engine's value as check-teach.mjs resolves it; `link` a name of
the example or `example/name`). Two numbers of Example 5 were E/Eb's without the L1 feed while the links have it: the
stub's S21 at 10 GHz is −0.67 dB (E: −0.68) and the backdrilled via's S11 −18.1 dB (Eb: −18.0); examples.md and the data
now give the links' own numbers (claims 240–241 stay as written: they name E and Eb). The pads' 31.5 fF is per node
(L1, L6), not their sum.

## Checks

`check-teach.mjs`, group "Equations and derivations (M4.2)", 9 506 checks (EM `npm run check` 29 377 of 29 377):

- Registry: 61 ids, sources in references.bib, topics, `on`, steps present exactly on derived entries, every name a
  meaning and TeX, every step an equality whose text round-trips and renders, every reason's maths renders.
- Steps: 200 seeded random bindings per entry that satisfy its steps: 27 000 step evaluations, worst 9.9e-13; edge-f3
  step 5 (0.3396) within 2e-4. The thin-wire product (N for N = 2…12), 0.3396, 2.578, 4.465.
- Trace entries: 235 random setups (presets, kinds, widths; M = 2) with random f and ℓ, 50 inverse targets (tol
  1e-12): 24 entries on 56–235 setups each, worst 9.8e-13. `error-shown`, `parts-sum` and the tolerance entries stay on
  check-equations.mjs's default cases (BL135).
- Via entries: V, VP, E, Eb at every piece, and 140 random vias (single and pair: drill, pads, antipads, returns, exit,
  feeds, rise time, cursor; 50 reached targets): every live via entry on 50–191 cases, worst 1.4e-10 (mixed mode);
  values zero by symmetry against 1e-15 of the entry's scale. Identities: C_line + ΣΔC = axiTotal (1e-12), fFormula =
  1/(4τ), mixed = toMixedMode(nport), tdr.z from ρ, the sweep's end at −60 dB; V's thin wires 60.84 against 59.71 Ω.
- Examples: 17 links equal `encodeLink` of their recipes and decode with no issues to them; 84 quoted numbers equal the
  engine to the decimals shown (S at exactly 10 GHz from `cascadeS`, the TDR's dip within 100 ps of the via).

## For M4.3

```ts
const eq = EM_EQUATION_BY_ID.get(id);
const b = eq.on === 'via' ? viaBinding({ model, via, piece, node, fIndex, tIndex, target }) : emBinding({ ...ctx, inverse });
const live = bindingFor(eq, b);                         // null: print without numbers
emTex(eq.tree, { variable }); emSubstitutions(eq.tree, valuesTex(eq, b), variable);
eq.steps.forEach((s) => { emTex(s.tree); s.reason.map((r) => (typeof r === 'string' ? r : emTex(r))); });
EXAMPLES.forEach((x) => x.links.map((l) => l.link));    // decodeLink(l.link.slice(EXAMPLE_PATH.length))
```
