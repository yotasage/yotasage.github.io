# Notes of step M2.4b – shared equation engine, EM equations (2026-11-16)

## The move (notes-M0.5.md item 1a)

The generic part of `lib/smith/equations.ts` moved, code unchanged, to `lib/equations/`:

| File | Exports |
|---|---|
| `parse.ts` | `Node`, `FUNCTIONS`, `CONSTANTS`, `parse`, `toText`, `variablesOf` (the grammar in its header) |
| `tex.ts` | `TexPiece`, `TexOptions`, `nameTex`, `tex`, `substitutions`, `valueTex` |
| `compile.ts` | `Side`, `Program`, `compile`, `Value`, `Binding`, `bind`, `programOf`, `evaluate` |
| `equation.ts` | `SymbolInfo<K>`, `Source`, `Step`, `parseReason`, `Equation<K>` (K: the tool's object kinds) |

`lib/smith/complex.ts` moved to `lib/complex.ts`. `lib/smith/equations.ts` keeps `ChartObject`, `SYMBOLS`, the registry
(`EQUATIONS`, `EQUATION_BY_ID`, `symbolOf`, `PARSE_MS`), defines `SymbolInfo = SymbolInfo<ChartObject>` and
`Equation = Equation<ChartObject>`, and re-exports the rest, so no component import changed.
`lib/smith/complex.ts` re-exports `lib/complex.ts`, **but nothing imports it any more**: the Smith modules (convert,
explain, geometry, goal, network, parts, solve, sweep) and `scripts/harness/smith/check.mjs` import `lib/complex.ts`
directly. Under tsx, merely loading the re-export (`export *` or consts) made every call of the complex functions five
to six times slower, also from modules importing `lib/complex.ts` directly: the sweep of 10 parts at 10,000 points
took 16.4 ms against 2.7 ms (budget 4 ms) and the f0 fallback search 5.4 ms against 1.2 ms (budget 5 ms). Found by
A/B runs of check-sweep alone; the cause inside tsx was not pinned down. Keep new code off `lib/smith/complex.ts`.

## The EM registry

`lib/emsim/equations.ts` (no engine import, so the page can print without the solver): `EM_EQUATIONS` (33, in the
theory's order), `EM_EQUATION_BY_ID`, `EM_SYMBOLS` (meaning, SI unit, `EmObject`: line, pair, mode, stackup, solver,
drive, formula, calculator, tolerance, constant), `TEX_NAMES` (names the printer cannot spell: `Z_{c,11}`, `X_{M/2}`,
`\varepsilon_\mathrm{eff}(f)`, `Z(x_i + t_i)`, …). An `EmEquation` is the shared `Equation<EmObject>` plus `topic`
(anchor), `applies` (`line`, `pair`, `any`), `where` (more relations printed with it, e.g. f_p and G of Getsinger),
`extra` (TeX as it stands: a condition or distribution) and `live`. Definitions without numbers (`live: false`):
`telegraph`, `charge-potential`, `mixed-mode-vars`. `corners` and `sens` use names whose TeX is the expression
(`Z_hiat` → Z(x_i + sign(d_i) t_i)). `error-shown` prints e = 1.5·max(|X_M − X_{M/2}|, ¼|X_{M/2} − X_{M/4}|): the
rule `estimateOf` uses when the differences shrink at least twofold (theory.md's table had only the first term; on
the default microstrip the quarter of the coarser difference is the larger, ratio 42).

## How M2.4c prints an equation with live numbers

```ts
const ctx = { result, kind: setup.trace.kind, reduced: closedForms(setup).reduced, calc, corners, mc };
const b = emBinding(ctx);                       // eqvalues.ts: symbol → SI number
const eq = EM_EQUATION_BY_ID.get('z0-lc');
emTex(eq.tree, { variable: colour });           // symbolic line, TEX_NAMES applied before the page's decoration
const sub = emSubstitutions(eq.tree, valuesTex(eq, b), colour); // { lhs, rhs, lines } or null
eq.where.forEach((w) => emSubstitutions(w.tree, valuesTex(eq, b), colour));
bindingFor(eq, b);                              // null: print without numbers (a symbol has no number, or not live)
```

Units are SI (s/m, H/m, Hz, m); `valueTex` puts the prefix (6.058 ns/m is 6.058 ps/mm: the page may convert lengths).
`f` 10 GHz, ℓ 100 mm and the step 1 V in 100 ps are the defaults of `EmContext`.

## New values (`lib/emsim/eqvalues.ts`)

`emBinding(ctx)`; `levelSeries(r, key)` (main value at each level from `levelValues` of `bem.levels`);
`getsinger(z0, eeff, er, h, f)` → `{ eeffF, fp, G, rise }`; `getsingerLimit(z0, eeff, er, h, e)`;
`calculatorParts(setup, M = 2)` → `{ stackup, calculator, parts }` (five solves; the Calculators panel already does
them on channel `calc`, so M2.4c can pass its numbers instead); `MU0` = 1/(ε0·c0²) as the engine has it.
Getsinger is bound on `microstrip` and `embedded` only; the mask's effect stays static text (BL108).
`error-shown` is bound only where the shown error is that rule (not on the default pair: a floor; not on cpwg:
the differences change sign), so a page never prints an equation its numbers do not satisfy.

## Checks

`check-equations.mjs`, group "Equations (M2.4b)": 542 checks. 94 relations on five cases (D, the default pair, C41
0.11 / 0.2 mm, stripline, cpwg); worst relative difference between sides 2.9e-15 (limit 1e-9); a 1 ppm error in Z0
is caught. Theory numbers reproduced: Getsinger 0.052 % / 0.32 %, f_lim 17.9 GHz, δ 0.166 %; parts +0.940, +0.509,
+0.245, −0.267 (sum 1.427 against 1.439 Ω); shares, corners 44.54–59.37 Ω; σ from the ranking 1.3104 Ω (theory-2.md's
table and claims.md said 1.311; corrected to 1.310, the text's 1.31 Ω stands) against Monte Carlo's 1.313.

Smith before/after the move: `npm run check` 1 399 628 of 1 399 628 both (equations 75 entries, worst spread 2.41e-10
both; sweep 2.77 / 2.63 ms); `npm run build` passes; `size.mjs` first load 423.2 kB gzip (budget 430); against
`next start -p 3021`: ui-theory 8011, ui-math 1920, ui-derive 38 885, ui-explain 77 checks, all passed. EM `npm run
check`: 19 221 of 19 221.
