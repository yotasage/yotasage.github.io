# Smith chart – the learning layer

Equations, theory and teaching content (M1.4, M3.5, M5, M6). Part of [plan.md](plan.md); decisions D5 and D6 there.
The main purpose of the tool is learning and teaching: a user must be able to catch up at any moment, understand what
to do and how things work, without leaving the page.

## 1. Equations as data (M1.4)

`lib/smith/equations.ts`. Each equation is written as **short text** (for example `Gamma = (z - 1)/(z + 1)`) and
parsed into an expression tree when the module loads. One printer turns a tree into TeX, one evaluator computes it on
complex numbers.

- **Entry:** id, title, the text, the variables (TeX symbol, meaning, unit, the chart object whose colour it takes),
  the assumptions ("lossless line", "e^{jωt}"), the source keys in `references.bib`, the derivation steps (each an
  equation in the same text form plus one sentence saying why), and the engine function it must equal.
- **Printer:** brackets from operator precedence, `\frac` for division, `\cdot` only where a product would be
  ambiguous; complex values written the engineering way (`25 + j25`, `25 − j25`, `j0.5`, in brackets when multiplied
  or raised; polar `0.447∠116.6°` where the entry asks for it); units after the number with a thin space; numbers
  formatted by `lib/quantity.ts` with the digits setting.
- **The engine does not use the trees.** The engine is hand-written (engine.md §9); the trees give the symbolic line,
  the line with the live numbers put in and the result. The harness evaluates every entry and every derivation step on
  random points against the engine (to 1e-12 relative) and renders every entry with `throwOnError`. No equation is on
  screen that the harness cannot evaluate.
- **Fallback** if M1.4 finds the printer's output poor: hand-written TeX per entry with a golden test against the
  evaluator.

## 2. KaTeX facts (measured in M0.1)

KaTeX 0.19.1 with `output: 'mathml'`, as `components/KatexSpan.tsx` uses it:

- `\htmlClass`, `\htmlId` and `\htmlData` are **dropped entirely** in MathML output (and warn in strict mode): they
  give no hooks.
- `\textcolor{#hex}{…}` becomes `<mstyle mathcolor="#hex">`, scoped to its argument. `\color` is a switch that colours
  the rest of the group; it is not used.
- **Hooks for highlighting:** each variable is wrapped in `\textcolor` with a unique sentinel colour, and one pass over
  the MathML string replaces those attributes with classes (`class="v-gamma"`), whose real colours come from the
  page's CSS variables in both themes. No separate spans per term.
- `katex.renderToString` takes about 0.04 ms per equation (Node, warm), so re-rendering every frame is affordable;
  what M0.3 measures is the browser's MathML layout and DOM replacement per frame.
- `KatexSpan` renders in a `useMemo`: at build time for the static HTML and again in the browser, so KaTeX is already
  in the client bundle of a page that uses it.

## 3. The equation panel (M5)

Bound to what is selected (a node, a part, a grid circle under the cursor, a metric, a solver solution). For each
equation three lines: symbolic, with the live numbers put in, and the result. Variables have the colour of their
object on the chart. Pointing at an object (hover, or tap on a phone) highlights its equation and the other way round.
Every readout number and part card has a "show equation" control. "Explain this move" narrates a change of a part in
words and equations: which equation applied, why the path runs along a constant-r or constant-g circle, why clockwise,
with the live numbers; no animation when reduced motion is on. The panel may update at a lower rate than the chart
(engine.md §9).

## 4. Derivations (M5)

Stepped reveal, one step at a time with its one-line reason: z from Γ; y; the r, x, g and b circles from the
expressions for r, x, g and b (completing the square, ending in centre and radius); VSWR, return loss and mismatch
loss; the line and the λ/4 transformer; series adds z and shunt adds y; matching with two parts. Each step is an
equality the harness checks numerically on random points.

## 5. The Theory section (from M3.5)

After the resistor tool's Theory (`components/Resistor/Theory.tsx`, `styles/ResistorTheory.module.css`, its notes in
`docs/resistor/notes-S5.md`): a section in the page's nav with a contents list, short numbered topics that fold (folded
on a phone), formulas from the equation registry, small figures in both themes (mini charts drawn by the tool's own
chart code), and IEEE citations through one `Bibliography` loaded in `getStaticProps` (a References section last in
the nav, every citation linked to its entry, numbered by first citation; `docs/smith-chart/sources.md` says what each
source may be cited for). A click in the contents opens its topic; a `#link` to a topic opens it and replays the
highlight (`lib/useReplayHighlight.ts`).

- **The theory follows the user's circuit**, as the resistor's theory follows the typed value: the formulas carry the
  current load's and node's numbers (the default example until the user changes it).
- **A short line beside every control and readout** (as the resistor tool's quiet explanations beside its results)
  with a link "→ theory" that opens its topic.
- **Topics with the milestone that adds them:**

| Milestone | Topics |
|---|---|
| M3.5 | How to use this tool (what to do first, build, drag, read) · Γ, z and y, and normalising by Z0 · Reading the chart: r, x, g and b circles, Z, Y and ZY modes, the wavelength and angle scales · Moving on the chart: series along constant r, shunt along constant g, which way and why · Transmission lines: rotation, the half-wavelength period, a line of another impedance, the λ/4 transformer, stubs · How good is a match: \|Γ\|, VSWR, return loss, mismatch loss · Matching with two parts on the chart |
| M4 | Why there are two solutions, one or none (the two circles) · Why one unknown cannot reach a point · Realisable values and standard values |
| M5 | Links from every topic to its derivations |
| M7 | Q, bandwidth and why a longer line or a higher-Q path narrows the match · Reading a frequency trace |

Every claim has a source or a derivation (checklist in the step's notes); concepts are cited, no text is copied from
books; the owner's own numbers are used in examples.

## 6. The owner's notes

`Impedance and Admittance.docx` (in the owner's git-ignored `.local/Smith chart/`, not on other machines) is
transcribed in full in [notes-M0.1.md](notes-M0.1.md); M0.2 works from that transcription. The mathematics is right,
with these slips to fix before anything reaches the screen:

- The reactance circle is written (Γr − 1)² + (Γi − **i**/x)² = (1/x)²: it is (Γi − **1**/x)².
- One line of the y expansion is typed in plain text: `Gr`, `Gi` and `i` where Γr, Γi and j are meant.
- The heading "Addmittance" is misspelt.
- Only the resistance-circle derivation is carried through, and it repeats a line and stops before completing the
  square (the result is stated above it). The reactance, conductance and susceptance derivations stop at the
  unsimplified form.
- The circle forms of g and b are missing: (Γr + g/(1+g))² + Γi² = (1/(1+g))² and (Γr + 1)² + (Γi + 1/b)² = (1/b)².
  The sign of b is written correctly in the notes (b = −2Γi/(Γi² + (Γr+1)²)).

## 7. Teaching content (M6, outline)

Detailed after owner checkpoint 2; the owner confirms which are built.

- **Worked examples**, 12 to 20, each loaded in one click, with the owner's own numbers (concepts cited, no text copied
  from books), step-by-step guidance and hints.
- **Challenges** (to confirm): generated or curated problems ("bring this load to the centre") checked against a
  tolerance, a hint ladder, "reveal the solution" via the solver; progress kept in the browser.
- **Lesson links** (to confirm): a link that opens a prepared circuit, can lock chosen parameters and hide the solver or
  the solution, for a teacher to hand out. Everything is in the link.
- A printable **cheat sheet** with blank charts is BL47, generated from the same registry.
