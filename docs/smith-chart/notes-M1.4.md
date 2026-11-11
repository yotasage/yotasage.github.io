# Smith chart – notes of step M1.4 (equations)

`lib/smith/equations.ts`: equations as text, parsed into trees when the module loads (66 entries, 141 trees with steps,
about 1.5 ms in Node), one TeX printer, one evaluator. It does not import KaTeX, and the engine does not use it.

## Grammar
Numbers (`2`, `0.5`, `1e-9`); names `[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)?` (`Gamma_r`, `Z_in`, Greek letters by name,
`ell`); constants `j`, `pi`; `+ - * / ^`; unary minus binds like a product (`-2*x/y` is −(2x/y)); `/` left-associative,
`^` right-associative; calls `abs sqrt exp conj ln log10 sin cos tan cot arctan Re Im arg` (one argument; another name
followed by `(` is an error, so there is no implicit product); matrices `[a, b; c, d]`; `=` chains only at the top.
A bracket written around a sum or difference is kept as a `group`; brackets around anything else are dropped.
Exponents: `x^-2*y` parses as x^(−(2y)), so write `x^(-2)*y`.

## Tree
`num {v, s}` (s as written), `id {v}`, `group {a}`, `neg {a}`, `op {op, a, b}`, `call {f, a}`, `mat {rows, cols, xs}`,
`eq {xs}`. `toText` prints a tree back with the fewest brackets; parse → toText → parse gives the same tree (checked
for every tree). `variablesOf` lists the free names.

## Printer (`tex(tree, {value?, variable?})`)
The five rules of M0.3 plus: `\frac` for `/` (a group in a numerator, denominator, exponent, argument or side is printed
without brackets); `\cdot` only before a number, but `j` before a number is juxtaposed (`j2`); a negation right of
`+`/`−` or as a later factor is bracketed; `\left(\right)` only around something holding a `\frac`; `\tan \beta \ell` and
`\log_{10} |\Gamma|` without brackets when the argument is a plain atom or product of atoms; `exp` prints `e^{…}`,
`conj` `…^{*}`, matrices `bmatrix`; multi-letter names and subscripts upright (`\mathrm{VSWR}`, `Z_{\mathrm{in}}`).
Juxtaposed factors are separated by a space (`2 x`), which TeX ignores.
- `value(name)` returns a `TexPiece` for the live-numbers line; `valueTex(re, im, unit, digits, polar)` makes one with
  `formatAmount`: `25`, `-3`, `j0.5`, `25 + j25`, `(25 - j25)\,\Omega` when both parts share a prefix, polar
  `0.4472\angle 63.43^{\circ}`. The printer brackets a value that is a sum or a negation when multiplied or raised.
- `variable(name, tex)` decorates a symbol, e.g. `\textcolor{#sentinel}{…}` for highlighting (learning.md §2).

## Evaluator
`compile(tree)` → `Program {regs, names, slots, sides, run()}`: closures over one Float64Array of (re, im) pairs,
variables in the same file at `slots`, constants written once; `run()` allocates nothing (0.13 µs per entry). Shapes are
checked when compiling (matrix products, sides of the same shape). `bind(program, binding)` writes a `Binding` (`number`
or `[re, im]` per name); `programOf(tree)` caches; `evaluate(tree, binding)` returns copies of the sides (allocates).
Division with `cdiv` (Smith's method), `abs` with `cabs`, `sqrt` with `csqrt` from complex.ts; real arguments use
`Math.tan`, `Math.log10` and so on directly.

## Registry entry
`Equation {id, title, text, tree, sources: {key, at}[], derivation?, owner? (item of the owner's notes), assumptions,
steps: {text, tree, why}[], engine (the function it is checked against), variables, symbols?}`. `SYMBOLS` gives each
name a meaning, unit and `ChartObject` (the colour it takes); an entry's `symbols` override them (A, B, C, D of the ABCD
entries, B of the line circle). `symbolOf(eq, name)`, `EQUATION_BY_ID`, `PARSE_MS`.

Ids: `z-norm y-norm gamma-z z-gamma gamma-y y-gamma gamma-parts-z gamma-parts-y z-parts y-parts r-gamma x-gamma g-gamma
b-gamma circle-r circle-x circle-g circle-b line-circle-b line-circle-centre line-circle-radius vswr gamma-vswr z-max
z-min return-loss power-reflected power-delivered mismatch-loss q-node q-l-network line-zin line-rotation line-theta beta
omega quarter-wave quarter-wave-match stub-short-z stub-open-z stub-short-b stub-open-b stub-short-l stub-open-c r-series
g-shunt x-series-l x-series-c b-shunt-c b-shunt-l z-inductor z-capacitor y-capacitor y-inductor series-adds-z
shunt-adds-y abcd abcd-cascade abcd-reciprocal abcd-series abcd-shunt abcd-line abcd-stub-short abcd-stub-open abcd-zin
node-z`. Steps (learning.md §4): z and y from Γ, Γ in parts, z and y in parts (the owner's items 1–4, 6), the four
circles completed to centre and radius (items 8–11), VSWR, RL, ML, the line and λ/4, series adds z and shunt adds y,
the L network's Q, Z_in from ABCD. The series stubs of facts.md eq. 26 are left out: the tool has no series stubs.

## Harness (`check-equations.mjs`, 1,858 checks)
Each entry has a binding made from the engine (convert, parts, network, geometry); every side of the entry and of
every step agrees within 1e-12 of the largest side at 200 random points (worst 1.3e-13). Exceptions, with reasons in
the file: `line-circle-centre` to 1e-11 with |B| ≥ 0.05 (it subtracts two terms of size 1/|B|); random |Γ| in
[0.05, 0.9] and lengths kept away from multiples of λ/8 (the check's own arithmetic loses digits there).
`q-l-network` and `quarter-wave-match` give a design value: the harness takes it from the formula and checks that the
network built from it has |Γ_in| ≤ 1e-12. Every tree renders with KaTeX 0.19.1 (`mathml`, `strict: 'error'`)
symbolic, coloured and with live numbers (Cartesian and polar).

## For M3.5 and M5
- Render with `KatexSpan`; take entries by id from `EQUATION_BY_ID`. Three lines: `tex(tree)`, `tex(tree, {value})`
  with values from the engine (not from the evaluator), and the result with `valueTex`. Use the evaluator only for
  sides that have no engine figure (e.g. an intermediate step).
- Units in `SYMBOLS` are lib/quantity.ts units; `rad`, `rad/m`, `rad/s`, `m/s` get SI prefixes from `formatAmount`,
  which may need a no-prefix list in M5.
- A new entry needs a binding in the harness, or the registry group fails.
- learning.md was right; nothing in it changed.
