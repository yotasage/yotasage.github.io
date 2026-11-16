# Notes of step M4.3a – the equation panel and the shared derivation dialog (2026-11-16)

## Shared in `components/Equations/` (notes-M0.5.md item 1b)

| File | What |
|---|---|
| `math.ts` | `mathHtml(tex, targets = [], inline = false, classes = [])`: KaTeX MathML, the sentinel colours `#0aCCVV` as `classes[CC]` and `data-mt` = `targets[VV]` (the Smith chart passes `MATH_CLASSES`; the EM page none) |
| `wide.ts` | moved unchanged from `components/Smith/` (`markWide`, `watchWide`) |
| `DerivationDialog.tsx` | the modal shell (memoised): props `view` (`DerivationView`: `id, title, goal, meta, steps[{ sym, why, nums, sides? }], bind?`, HTML from `sidesHtml(sides, targets?, tail?, classes?)` and `reasonHtml(why, targets?, classes?)`, why = text and TeX alternating), `opening` (a new count opens it at step 1 with the focus on Next step), `from` (gets the focus back), `onClosed`, `titleId`, `link?` (`DerivationLink`: `opened, closed, revealed, escape, stepKey, stepFocus, stepBlur, body`: the page's hooks; the Smith chart's M5.2 lighting) |
| `styles/Equations.module.css` | was `SmithDerive.module.css` (git mv), on the base tokens both pages define |

The Smith chart keeps `derive.ts` and `openDerivation` (`Derivation.tsx` builds the view and the `mathLink` hooks);
`MathPanel.tsx`'s `mathHtml(tex, targets, inline)` is the shared one with its colours; `Explain.tsx`, `Theory.tsx`
import `wide.ts` from the new place. Data attributes are unchanged (`data-derive*`), so Smith's harness is untouched.

Smith checks (`scripts/harness/smith`), before → after: `npm run check` 1 399 628 → 1 399 628; `npm run ui` (production
build, port 3021) 21 of 22 → 20 of 22 scripts with the same counts (ui-derive 38 885, equation links 2 776, theory
8 011, explain 77, browsers 377; the equation panel's count follows its time slices: 1 851, 1 920), first load 423.3 →
424.0 kB gzip (≤ 430). ui-path's two CPU-4× frame budgets fail before and after; ui-export's A/B drag budget failed once
after and passed 216 of 216 twice when run alone. `recheck` not run: Smith code changed only by the move itself.

## The panel

- `components/EmSim/eqLinks.tsx` (first load, no KaTeX): `traceEq(name, n)`, `viaEq(name, n)` map a result number to
  `{ id, sym, mode? }`; one open request for the page (`openEq`, `closeEq`, `useEqRequest`); `EqNum` (the number as a
  button with a dotted underline); `EqLayout` (beside the results where the section is ≥ 640 px wide, a container
  query, sticky under the bar; below them otherwise); `EqEnv` (references, the theory's Bibliography).
- `components/EmSim/EqPanel.tsx` (lazy, with KaTeX, the registry, eqvalues and eqvaluesVia): each relation of the
  entry as symbols, then with the numbers (`emSubstitutions`) down to the result, which is the engine's number; the
  number's own relation is evaluated by the shared engine (`data-eval`) and, if it differs by more than 1e-6 (an
  entry that assumes a symmetric pair on an unequal one), a note says so with both values. Assumptions, sources
  (`[n, at]` to `#ref-key` once the References list the key, else "Author year" to `#references`: the via sources are
  listed only once M4.3b cites them), "→ theory" for topics the page has (the trace's; the via topics come with
  M4.3b, add them to `TOPIC_TITLE` in whys.ts), Derivation (the steps, with numbers where every quantity of a step is
  one of the entry's bound variables). It follows the section's shown result and its stale state; Escape or Close.
- Trace numbers with an equation: one line Z0 (`z0-lc`), εeff (`eeff-c`), delay (`delay-lc`), matrix L₁₁ (`l-c0`),
  Zc₁₁ (`z0-lc`); a pair Zdiff (`zdd-zc`), Zcm (`zcc-zc`), Zodd, Zeven (`zodd-sym`, `zeven-sym`), Zdc (`zdc-zc`),
  Zdiff (B), Zcm (B) (`zdiff-b`), Z_TDR, kb, kf, εeff of each mode (`eeff-mode`).
- Via numbers: a via's barrel Z (`via-barrel-z` on the core piece) and section √(L/C); a pair's section Zdiff and Zcm
  (`via-section-pair`); delay (single `via-section-delay`, pair `via-section-pair`'s τ); L, C; "of which pads and
  planes" (`via-dc`); the piece table's Z (single) and the delay of unmerged rows (`via-barrel-delay`); each stub's
  bare frequency (`stub-quarter`); λ/8 limit (`lambda8`); the edge's band (`edge-band`, f_band).
- Not buttons: BL137 (plot cursor readouts), BL138 (numbers without an entry).

## Checks

`ui-equations.mjs` (341 checks) in `npm run ui` (1 522 in all, port 3022): 5 numbers of the default microstrip, 11 of the default pair and 26 of the default via, all bound, worst 7.9e-16 against Node; `npm run check` 29 377. First load 184.4 kB gzip (182.7 before: eqLinks.tsx and the number style); the panel chunk brings KaTeX. ui-why: 196 lines (eq-open, eq-via-open, eq-derive), the panel opened in its first state.

## For M4.3b

Put the via topics on the page (the panel's "→ theory" then appears for via entries once their ids are in
`TOPIC_TITLE`) and cite the via sources in the theory, so the panel's citations become numbers. Examples' links can
open an equation by calling `openEq` after the state is applied.
