# Smith chart – how to use it

The tool is at [/smith-chart/main](https://yotasage.github.io/smith-chart/main). It runs in the browser; nothing you
type or open leaves the device. This page is for a visitor: what the tool does, how to do the main tasks, and where its
limits are. The plan and the build notes are in [plan.md](plan.md).

## What it does

You build a **matching network** between a load and a source as a ladder of parts (series and shunt R, L and C,
transmission lines, open and short stubs, λ/4 transformers), and the tool draws the impedance's **path on a Smith
chart**: each part's exact arc in its colour, an arrow in the direction of travel, a marker at every node, and the
goal (a match, by default with a VSWR 1.5 circle around the centre). Every number comes from the same engine: the
readout under the pointer, the node table, the equations, the solver, the sweep and the exports.

The page has four parts, reached from the bar at the top: **Tool**, **Learn**, **Theory** and **References**. A short
status note at the top says what the tool does now and what it assumes ("More").

## Quick start

1. Open the page. It starts with Z0 = 50 Ω, a load of 25 + j25 Ω, f0 = 100 MHz and two parts that match it.
2. Type your own **Z0**, **f0** and **load** (R and X) in the fields above the circuit.
3. Add parts with **Add** (choose the kind), type their values, or drag their handles on the chart until the path ends
   in the centre.
4. Read the input's z, Γ, VSWR and return loss in the node table; open **Equations** for the numbers behind them.
5. Copy the page's link to keep the circuit: the whole circuit is in it.

**Undo** and **Redo** (Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) keep the last 200 steps; **Start over** goes back to the start
circuit and can itself be undone.

## Building a circuit

- **Order.** The ladder runs from the load (at the right of the strip, node 0) to the source (the input, "In"). A new
  part goes at the source end. Move a part with the strip's arrows or Alt + arrow keys, remove it with **Remove** or
  Delete. Up to 24 parts.
- **Values.** Each part takes its value in any of its forms: R, L or C with units (`4.7 nH`, `12p`, `1k5`), the
  reactance or susceptance at f0, or the normalised value. A line or stub takes its length in λ or in degrees at f0
  and its **Zc**; a λ/4 transformer its Zt. A value the field cannot read is marked with the reason and leaves the
  circuit as it was.
- **Dragging.** Every arc ends in a round handle. Drag it and the part's value follows; the point stays on the part's
  own circle (a series L can only move along its constant-r circle, a shunt C along constant g, a line around the
  centre). With **Snap** on, the drag snaps to the grid's circles and to standard values of the part's list (E24 for R,
  L and C unless changed); hold Alt to drag freely once.
- **Keyboard.** Tab to a handle and use the arrow keys: they step through the standard values (or whole degrees for a
  line). On the chart, arrows pan and + and − zoom.
- **Draw.** Arm a part kind with **Draw** and drag out from the input on the chart: the part is added and its value set
  by the drag. Escape or the "Drawing … ×" button stops.
- **The chart.** The grid shows impedance (Z), admittance (Y) or both (ZY) on one Γ plane. Wheel or pinch to zoom
  about the pointer, drag the background to pan, **Fit** and **Reset** to come back; the labels and the grid's density
  follow the zoom. The readout under the pointer gives z, y, Γ, VSWR and return loss (a tap on a phone).

## Finding a missing value

1. In the part's card or the **Solve** panel, mark one or two values as unknown (**Solve for**). f0 and a line's Zc can
   be unknowns too.
2. Pick the **goal** and the node it applies to: the centre (a match), a point Z, a circle of VSWR, |Γ| or return loss
   (or a limit: "at most"), or an r, g, x or b circle.
3. The panel lists **every solution** with its |Γ| at the input. Hover, focus or tap a row to see its path on the chart;
   **Apply** takes it (one undo step).

On the chart the solver draws its **construction**: the two circles whose crossings are the answers (two unknowns) or
the part's circle and the goal carried back to it (one unknown). Under each solution, **standard values** list the
nearest values of the part's list and what they cost in match. With one unknown and a point target there is usually no
exact answer; the panel says so and gives the best value. Two unknowns with a circle goal give a **family**: a slider
walks along it. When there is no answer, the panel says why in words (the circles do not meet, the part cannot reach
the goal, the unknowns do the same job).

With nothing marked, the panel **suggests** the smallest change of one value, or of two, that meets the goal, each with
its own preview, standard values, Apply and Solve for.

The value lists live under **Standard values** in the Solve panel: E6 to E96, any value, or a list you paste (kept in the
link and on this device).

## Equations, derivations and "Explain"

- **Equations** (under the chart) shows the equations of the selected part or node, or of the readout's point: the
  symbolic form, the same with your numbers, and the result. Variables are coloured as on the chart; pointing at one
  lights its place on the chart, and the other way round. The digits setting rounds every readout the same way.
- **Derive** opens the derivation of an equation step by step.
- **Explain** on a part card says in words what the part does to the path (which circle it moves on, which way and
  why), with its arc traced on the chart.
- Every control has a short line beside it (the "?" button) with a **→ theory** link to the topic that explains it,
  and a way back.

## Sweep, plot and report

- In **Sweep**, set a band (start, stop, points, linear or logarithmic). The chart draws Γ(f) as a trace; click or tap
  it to add a **marker**, drag a marker or move it with the arrow keys.
- The **plot** shows return loss (or VSWR) against frequency. Pointing at the plot shows the frequency's point on the
  trace, and pointing at the trace shows it on the plot. The **marker table** gives f, z, Γ, VSWR and return loss; the
  **band figures** give the worst and best return loss, the largest VSWR, every interval under a chosen |Γ| with its
  fractional bandwidth, and a loaded-Q estimate.
- The **report** collects the f0 summary, the band figures, the node table and the circuit as text. **Print report**
  prints only the report, light whatever the theme, on A4 or Letter, with the chart and the plot as vectors and the
  link under them (choose "Save as PDF" for a PDF).

## Export for LaTeX and other files

The **Export** section (the Export link in the chart's toolbar) makes every file on the device.

**The chart as a figure.** Choose:

- **What:** the whole chart, or the chart's current view (as zoomed and panned).
- **Size:** column width 88 mm, text width 160 mm, page width 180 mm, or **Other**: any width in mm, cm or in, or
  `\linewidth`.
- **Detail:** Minimal, Standard or Full, or each item on its own (grid and its density, Z/Y/ZY, labels, rim scales,
  path, nodes and labels, part arcs, goal, construction circles, solutions, trace and markers, legend). Switching the
  circuit off gives a **blank chart** to print and draw on.
- **Colour:** colour, greyscale, or black and white (each role then has its own dash pattern, width and marker).
- **Text size** in pt (at least 6 pt).

The **preview** shows the figure at its true size on screen (scaled to fit on a narrow screen, which it says). Then:

- **Copy TikZ** or **Save .tex**, as a *picture* or a *standalone document*.
  - A picture is a `tikzpicture` with its colour definitions. Paste it into a document whose preamble has
    `\usepackage{tikz}` (no TikZ library is needed), for example inside
    `\begin{figure}\centering … \caption{…}\end{figure}`, or save it as `smith.tex` and `\input{smith.tex}`.
  - A standalone document compiles as it is (`pdflatex smith-chart.tex`); include the PDF it makes with
    `\includegraphics{smith-chart.pdf}` from `graphicx`.
  - Text is set in your document's font at the chosen pt size, so it matches the body text. Circles and arcs are
    exact TikZ circles and arcs, not polylines.
  - With `\linewidth` the picture scales to the line it sits in; the grid's density and text are chosen for a
    160 mm wide line, and text stays at its pt size. For a column of a two-column paper, the 88 mm size fits best.
- **Save SVG** for vector drawings (sized in mm), **Save PNG** at 1× to 8×.

**Data and the project.**

- **CSV** of the nodes, of the sweep's trace and of the markers, with the page's digits or every digit, as plain or
  engineering numbers. The trace CSV feeds a pgfplots plot.
- **Touchstone `.s1p`**: S11 at the input over the sweep, as RI, MA or DB, for other RF tools.
- **Save project** writes a `.smith.json` file with the circuit, unknowns and goal, the sweep, your value lists and the
  export settings. **Open project**, or a drop of the file anywhere on the page, opens it again as one undo step.
- **Copy link** copies the page's link, which holds the circuit, the solve and the sweep.

The export settings are kept for the next visit on this device.

## Learn

- **Worked examples** (16): pick one and a guide walks through it step by step: what to do, a check that says when the
  step is done, a hint and a link to the theory. Some steps ask you to type an answer read from the chart.
- **Challenges** of five kinds (an L-match, a stub, a λ/4 transformer, matching with E24 values, reading the chart):
  the solver and suggestions are hidden while one runs; **Check** says whether the goal is met, the hints come one at a
  time, and the answer can be revealed. Progress is kept on this device.
- **Lesson links**: a teacher can make a link that locks chosen values, hides chosen panels (such as the solver) and
  shows a short text. A student who opens it can change only what is not locked; **Leave the lesson** frees the page.

## Accessibility

Every task works by keyboard alone (Tab, arrows, Enter, Space, typing) and by touch; every control has a name for
screen readers; text and lines meet WCAG 2.2 AA contrast in both themes; the page follows reduced motion and the
browser's text size (up to twice the size and 200 % zoom, down to 320 px wide). Light and dark themes follow the system
or the moon/sun button.

## Limits

- **Ideal parts.** R, L and C have no loss, parasitics or self-resonance; a real part's Q and ESR are not modelled.
- **Lossless lines.** Lines, stubs and λ/4 transformers are lossless TEM lines; their lengths are electrical (λ or
  degrees at f0), not physical lengths with a velocity factor.
- **One real Z0.** The whole chart is normalised to one real reference Z0; there is no complex reference and no
  change of reference along the ladder (a line's own Zc is its own).
- **Ladders only.** Parts are in series or shunt one after the other; a branch that holds parts of its own (a stub with
  a capacitor in it) is not possible.
- **Values at f0.** The path, the solver and the node table work at f0; the sweep evaluates the same ideal parts at
  each frequency. A solution is "true at this frequency only".
- **At most two unknowns**, with one goal at one node; no optimiser over a band.
- **One port.** The `.s1p` is written, not read: a measured file cannot be drawn on the chart yet.
- **Phones.** Pinch and one-finger scrolling are checked by emulation in Chromium; real iOS and Android browsers are
  not tested automatically.

The results are checked by automated tests against independent computations and textbook cases, but the tool has not
yet been used for real design work: check results that matter against another source.
