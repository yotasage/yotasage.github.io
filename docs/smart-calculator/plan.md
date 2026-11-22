# Smart Calculator Plan

A fast, ad-free, client-side engineering calculator at `/calculator/main` designed to replace Google and Windows Calculator for unit-aware calculations, quick formula solving, and everyday electronics/RF/math work.

## Ground Rules

- Static export only (`output: 'export'`), zero server calls, zero external math/CAS dependencies (framework-free TypeScript in `lib/calc/`), zero CDN assets.
- Every source, CSS, and doc file must stay well under the 40 KiB repo guardrail (target < 25 KiB).
- Full Design System v2 support (`data-ds="v2"`, light & dark themes, EN & NB i18n parity, phone-width responsive layout).
- Strict TypeScript (`tsconfig.strict.json` includes `lib/calc/**/*` and `components/Calculator/**/*`).
- All persistence (history, notebook sheet, active tab, custom layouts) stays in `localStorage` on the user's device, with explicit **Clear memory** actions.

## User-Confirmed Features (v1)

1. **Three calculator workflow tabs** to try side-by-side (sharing the same unit engine & persistent history):
   - **Hybrid Bar + Tape:** Google-style live expression bar (instant preview as you type, Enter commits to persistent history tape, Up/Down recalls), supports `ans`, `ans1`..`ansN`, and variables (`R = 10 kOhm`, `C = 100 pF`, `R * C`).
   - **Variable List (Editable + Excel Copy):** Dedicated interactive variable table where variables can be added inline, edited in place, deleted, or cleared, synced with `name = expr` assignments in the calculator. Includes one-click **Copy table (Excel)** as clean tab-separated values (`Name`, `Expression`, `Value`, `Unit`, `Base SI`) so pasting into Excel or Sheets populates columns directly.
   - **Notebook (Scratchpad):** Soulver/Numi-style multi-line editor where each line evaluates live in an aligned right-hand result column, supports `# comments`, variables, and line references (`line1`, `prev`).
   - **Quick Bar:** Minimal Google-like single bar + large instant readout + conversion chips + compact recent history list.
2. **Unit-aware arithmetic, electronics/RF units, complex numbers & physical constants:**
   - Dimensional analysis over 7 SI base exponents `[M, L, T, I, Θ, N, J]` + angle (`rad`/`deg`) + logarithmic level tags (`dB`, `dBm`, `dBW`, `dBV`, `dBuV`).
   - Electronics/RF & everyday units: `Hz, s, Ω/ohm, F, H, V, A, W, J, C, S, Wb, T, N, Pa, m, um/µm, mm, cm, km, mil, in, ft, m^2, um^2, mm^2, rad, deg, °C/degC, °F/degF, K, %, dB, dBm, dBW, bit, B`.
   - Smart SI auto-prefixing (e.g. `1 / (100 MHz)` → `10 ns`, `10 kOhm * 100 pF` → `1 µs`, `25 um * 40 um` → `1000 µm²`), clickable compatible-unit conversion chips, explicit conversion (`in mm^2`, `to ns`, `as dBm`, `-> MHz`), and companion hints (Frequency ↔ Period, Rectangular ↔ Polar).
   - Complex numbers & phasors: `j` (and `i`), `50 + j*30 Ohm`, `1 / (j * 2*pi * 1 MHz * 100 pF)`, polar input `10 ∠ 45 deg` / `10 angle 45 deg` / `polar(10, 45 deg)`, `re`, `im`, `abs`, `arg`, `conj`.
   - Built-in CODATA physical constants (`c`, `k_B`, `q`, `eps0`, `mu0`, `Z0`, `h`, `hbar`, `g0`, `N_A`, `R_gas`, `pi`, `e`) with exact SI units (overridable by user variable assignments).
3. **Basic calculus in v1** (step-by-step solver deferred to a later phase):
   - Symbolic differentiation: `diff(expr, x)`, `diff(expr, x, n)`, `d/dx(expr)` with algebraic simplification and KaTeX rendering.
   - Symbolic indefinite integration: `int(expr, x)` / `integrate(expr, x)` for polynomials, power rule, `1/x`, `exp`, `sin/cos/tan/sec^2`, `sinh/cosh`, `1/(a^2+x^2)`, `1/sqrt(a^2-x^2)`, linear substitution `f(a*x+b)`, linearity, and standard integration-by-parts forms (`x*exp(a*x)`, `x*sin(a*x)`, `x*cos(a*x)`, `x^n*ln(x)`).
   - Definite integration: `int(expr, x, a, b)` / `integrate(expr, x, a, b)` using exact FTC when available (verified numerically) and adaptive Gauss-Kronrod G7-K15 quadrature otherwise.
4. **Bidirectional Equation Layouts + Shareable JSON:**
   - Curated built-in presets (`τ = RC`, `T = 1/f`, `ω = 2πf`, `λ = c/f`, `f_c = 1/(2πRC)`, `τ = L/R`, `f_0 = 1/(2π√LC)`, `X_C`, `X_L`, `V = IR`, `P = VI`, `P = V²/R`, Voltage divider, Parallel resistors, `dBm ↔ W`, `dB ↔ voltage ratio`, Rectangle area, Circle area, Volume).
   - Pick any variable to solve for, enter remaining values with any compatible units, inspect KaTeX rearranged formula, and "Send to Calculator".
   - Custom layout builder + **Copy JSON to clipboard**, **Download `.json`**, and **Import JSON** (paste or file upload, single layout or bundle, strict validation).

## Shareable Layout JSON Schema (`SmartCalcLayoutV1`)

```json
{
  "schemaVersion": 1,
  "id": "rc-time-constant",
  "name": "RC Time Constant",
  "category": "rc-rlc",
  "description": "Time constant of a first-order RC circuit.",
  "equation": "tau = R * C",
  "latex": "\\tau = R \\cdot C",
  "variables": [
    { "symbol": "tau", "label": "Time constant (τ)", "defaultUnit": "s", "example": "1 us" },
    { "symbol": "R",   "label": "Resistance (R)",    "defaultUnit": "ohm", "example": "10 kOhm" },
    { "symbol": "C",   "label": "Capacitance (C)",   "defaultUnit": "F", "example": "100 pF" }
  ],
  "solvers": {
    "tau": { "expr": "R * C",   "latex": "\\tau = R \\cdot C" },
    "R":   { "expr": "tau / C", "latex": "R = \\frac{\\tau}{C}" },
    "C":   { "expr": "tau / R", "latex": "C = \\frac{\\tau}{R}" }
  }
}
```

- `solvers` is optional for custom layouts: when omitted, `lib/calc/invert.ts` rearranges `equation` symbolically (or falls back to unit-aware numerical root finding).
- Bundles use `{ "schemaVersion": 1, "layouts": [ ... ] }`. Both single objects and bundles are accepted by the importer.

## Module Map

| File | Responsibility |
| --- | --- |
| `lib/calc/units.ts` | 7-tuple SI dimensions, unit registry, prefix parsing, unit conversion, smart SI/area formatting, compatible-unit suggestions |
| `lib/calc/constants.ts` | CODATA physical & mathematical constants with dimensions and display metadata |
| `lib/calc/value.ts` | `CalcValue` (complex + dimension + log/angle/preferred unit), unit-safe ops, math functions, text & KaTeX formatting |
| `lib/calc/ast.ts` | AST node types, AST constructors, AST → TeX & AST → plain-text printers |
| `lib/calc/parse.ts` | Tokenizer & recursive-descent parser (implicit mul, units, `in`/`to` conversion, phasor `∠`, assignments, `diff`/`int`) |
| `lib/calc/calculus.ts` | Symbolic differentiation, algebraic simplification, symbolic integration, adaptive Gauss-Kronrod G7-K15 quadrature |
| `lib/calc/eval.ts` | Single-expression & multi-line notebook evaluators, variable scopes, `ans` history refs, companion hints |
| `lib/calc/invert.ts` | Symbolic single-occurrence equation rearranger & numerical root-finding fallback |
| `lib/calc/layouts.ts` | `SmartCalcLayoutV1` types, JSON validator/serializer, built-in presets, bidirectional `solveLayout()` |
| `lib/calc/storage.ts` | Safe `localStorage` persistence for history, notebook text, active workflow tab, and custom layouts |
| `pages/calculator/main.tsx` | Route entry (`PageHead`, `ToolHeader` with Calculator / Equation Layouts / Guide workspaces) |
| `components/Calculator/SafeKatex.tsx` | SSR-safe MathML KaTeX wrapper that tolerates user-edited LaTeX without throwing |
| `components/Calculator/ResultDisplay.tsx` | Shared result readout, KaTeX preview, conversion chips, Freq↔Period / Rect↔Polar companion hints, copy |
| `components/Calculator/VariablesPanel.tsx` | Editable variable table (add/edit/delete/clear, live re-evaluation, Excel-ready TSV clipboard copy) |
| `components/Calculator/HybridView.tsx` | Workflow tab 1: Hybrid expression bar + editable variable list + persistent history tape + Clear memory |
| `components/Calculator/NotebookView.tsx` | Workflow tab 2: Soulver/Numi-style multi-line scratchpad with live aligned result gutter & sample sheets |
| `components/Calculator/QuickBarView.tsx` | Workflow tab 3: Minimal Google-like single bar + recent history list + Clear memory |
| `components/Calculator/LayoutsView.tsx` | Bidirectional equation solver cards, category/search filter, JSON copy/download, send-to-calculator |
| `components/Calculator/LayoutEditorModal.tsx` | Create/edit custom layout dialog & JSON paste/upload importer with validation |
| `components/Calculator/GuideView.tsx` | Quick reference for units, constants, phasors, calculus, with one-click "Try in Calculator" chips |
| `styles/Calculator.module.css` | Calculator page & 3 workflow views styles (Design System v2, dark/light, phone-responsive) |
| `styles/CalculatorLayouts.module.css` | Layouts workspace, modal, and guide styles |
| `lib/ui/i18n/calculator.ts` | EN + NB translations for Smart Calculator |
| `scripts/harness/calc/` | Independent engine & browser verification suite (`check-units.mjs`, `check-eval.mjs`, `check-layouts.mjs`, `ui.mjs`) |

## Steps & Status

| Step | Scope | Status |
| --- | --- | --- |
| C0 | Branch `smart-calculator` + plan (`docs/smart-calculator/plan.md`) | Done |
| C1 | Engine: `units.ts`, `constants.ts`, `value.ts` + unit harness (`check-units.mjs`) | Done |
| C2 | Engine: `ast.ts`, `parse.ts`, `calculus.ts`, `eval.ts` + eval/calculus harness (`check-eval.mjs`) | Done |
| C3 | Engine: `invert.ts`, `layouts.ts`, `storage.ts` + layouts/JSON harness (`check-layouts.mjs`) | Done |
| C4 | Page: `/calculator/main`, 3 workflow tabs (`HybridView`, `NotebookView`, `QuickBarView`, `ResultDisplay`, `VariablesPanel`), i18n, Home card & icon | Done |
| C5 | Page: `LayoutsView`, `LayoutEditorModal` (JSON copy/download/import), `GuideView` | Done |
| C6 | Verification: `scripts/harness/calc/ui.mjs`, `npm run verify`, update `CLAUDE.md` | Done |
