# Smith chart – notes of step M8.1a (figure model and standalone SVG)

Part of [plan.md](plan.md) (D18, milestones.md M8). Harness only: nothing on the page yet. New files
`lib/smith/figure.ts`, `lib/smith/figureStyle.ts`, `lib/smith/figureSvg.ts`, `scripts/harness/smith/check-figure.mjs`
(called from `check.mjs`).

## Coordinates

Millimetres on paper, **origin at the chart's centre (Γ = 0), x to the right, Y up** (Γ's own sense and TikZ's).
A point Γ is at `(fig.scale·Γr, fig.scale·Γi)`; the disk's radius is `fig.scale` mm. Angles are radians anticlockwise
from +x; a text's `rotate` is degrees anticlockwise (TikZ `rotate=`). `fig.box` `{x0, y0, x1, y1}` is the figure's
extent in the same coordinates (the legend, when shown, lies below the chart, so `box.y0 < −width/2`). The SVG writer
negates y; TikZ (M8.1b) can use the numbers as they are.

## API for M8.1b and M8.3a

- `buildFigure(input, options) → Figure`. `input`: `circuit` (state.ts `Circuit` with its `ask`; null for a blank
  chart), `solve` (a `SolveResult` or solveLayer.ts `CircleShape`: `circleNode`, `circles`, `unknowns`, `status`),
  `trace` (sweep.ts `Trace` or `{gamma, n}`), `markers` (sweep.ts `MarkerPoint[]`, labelled M1, M2, …).
  `options`: `width` (mm; default 88; 30–2000), `linewidth` (the width is `\linewidth`, `width` the assumed width the
  density and text are chosen for; `LINEWIDTH_MM` 160 by default), `view` (a Γ window, y up; absent: the whole chart),
  `detail` (`'minimal' | 'standard' | 'full'` or `{ preset?, …items }`), `colour` (`'colour' | 'grey' | 'bw'`),
  `fontPt` (grid labels; default 7, raised to `MIN_PT` 6; node, marker and legend text one point larger, legend at
  `fontPt`).
- `Detail` items: `density` (`coarse` 2.4 mm, `normal` 1.6 mm, `fine` 1.0 mm least distance between neighbouring
  lines, `DENSITY_MM`), `grid` (`z`, `y`, `zy`), `gridLabels`, `scales`, `path` (each part's arc node to node),
  `nodes`, `nodeLabels`, `loci` ("part arcs": each part's whole circle inside the disk, the circle its arc lies on),
  `goal`, `construction`, `solutions`, `trace`, `markers`, `legend`. Presets in `DETAIL_PRESETS`: Minimal (coarse Z,
  labels, no scales, path, nodes and labels, trace), Standard (normal Z, labels, scales, path, nodes, goal, solutions,
  trace, markers), Full (fine ZY, everything, legend). `blankDetail(d)` switches the circuit off (BL47's blank chart);
  a null circuit gives the same.
- `readWidth(text)`: "88", "88mm", "8.8 cm", "3.5in", "\linewidth" → `{ mm, linewidth }` or null.
- `Figure`: `width`, `height`, `box`, `scale`, `clipR` (`scale` + 0.4 mm: the disk clip, so a stroke along the rim is
  not halved), `whole`, `view`, `linewidth`, `colour`, `detail`, `fontPt`, `minMm`, `prims` (in drawing order),
  `lines` (every grid r/x/g/b line: `prim` index, `fam`, `value`, `lo`, `hi`), `grid` (grid.ts `Grid`), `dropped`
  (node or marker labels with no free place; 0 in every checked set), `buildMs`.
- Primitives, each with `role` (`ROLE_GRID`, `ROLE_SCALE`, `ROLE_PART`, `ROLE_NODE`, `ROLE_GOAL`, `ROLE_CONSTRUCTION`,
  `ROLE_SOLUTION`, `ROLE_TRACE`, `ROLE_MARKER`, `ROLE_LEGEND`), `sub` (grid `SUB_AXIS`, `SUB_Z_MAJOR/MINOR`,
  `SUB_Y_MAJOR/MINOR`; part `SUB_PATH`, `SUB_LOCUS`; goal `SUB_RING`, `SUB_TARGET`), `index` (the part; a construction
  circle's unknown part, −1 none, −2 the goal carried back), `clip` (cut to the circle of `clipR`), `key` (a legend
  sample):
  `circle` (cx, cy, r), `arc` (cx, cy, r, `start`, signed `sweep` > 0 anticlockwise with full turns of long lines
  included, and the exact ends x0, y0, x1, y1 from the engine: write the ends as given, TikZ `arc[start angle=…, delta
  angle=…, radius=…]` from (x0, y0)), `line`, `poly` (`pts` Float64Array x, y interleaved, `n`), `mark` (x, y,
  `shape` dot, target, cross, triangle; `size` mm across), `text` (anchor point x, y; `anchor` middle (box centre) or
  start (middle of the left edge); `text` with real minus signs; `pt`; `rotate`; the estimated box `w × h` mm:
  characters × 0.6 em + 2 px by one em, grid.ts's estimate).
- `figureStyle.ts`: `strokeOf(mode, role, sub, index)` → `{ colour #rrggbb, width mm, dash mm[], mark, fill }`,
  `inkOf(mode, role, sub)` for text. Widths are the same in every mode (one layout). Colour: the page's light
  `--part-1…8` (`PART_COLOURS`), grid colours premixed over white, the goal in the accent, dashed; construction
  circles in the unknown's part colour (as the page). B&w: all black; parts by dash (`PART_DASH`, eight patterns),
  marks dot (nodes), target (goal), cross (solutions), triangle (markers). Greyscale: the b&w dashes, widths and
  marks with greys 0 (parts), 0.22 (trace), 0.44 (scale), 0.66 (grid), 0.88 (part arcs). Parts beyond eight repeat
  the first eight's styles (as the page's colours do).
- `figureSvg(fig, { id, background })`: `width="88mm"` and `height` in mm, viewBox in mm with y negated, one
  `font-family="sans-serif"`, no CSS (all attributes), the box and the disk as clipPaths named `<id>-box`,
  `<id>-disk` (default id `smith`; give each inlined figure its own), a white background unless `background: false`.
  Paths of one style are one `path` element with `data-role`, `data-sub`, `data-index` (and `data-key` for legend
  samples). Arcs are `A` pieces of at most 0.6π (`PIECE`; an `A` near a half circle fixes its centre only to √ε of its
  radius), straight when the sagitta is under 1e-5 mm; full circles two half `A`s. Text is placed by its baseline at
  0.35 em below the centre (no `dominant-baseline`, which converters ignore). Numbers are rounded to 1e-6 mm (`num`).

## How the grid is fitted to paper

grid.ts is built at **exactly** the paper's k: k = scale / `PX_MM` (1 px = 1/96 in, a CSS px on paper) and a
fractional level with `levelK(level) = k`, so its spacing rule holds on paper as it does on screen: neighbouring
lines are at least `minPx = DENSITY_MM / PX_MM` apart, i.e. the density's mm. A smaller figure has a smaller k and
so fewer lines (Standard, Z at normal density: 73 r and x lines at 88 mm, 132 at 160 mm, 150 at 180 mm). Label sizes go in as
`fontPx = fontPt · PT_MM / PX_MM`, label gap 1 mm, ticks at least 1.2 mm apart; the perimeter scales' margin is
`scaleLayout(fontPx).outer · PX_MM` + 0.6 mm (the chart's radius is the rest of half the width). Positions grid.ts
makes in Γ at its k are exact on paper: its label boxes in px become mm × `PX_MM`, so they still do not overlap. A
view has no perimeter scales (they lie outside the window).

Node labels (L, 1, 2, …, In; coincident nodes share one label "1, 2") and marker labels (M1, …) are placed here:
16 directions round the point at four distances, the first place inside the figure that keeps off every mark and
every other label; if none is free, the place covering fewest grid or scale labels, which are then left out (a
node's name matters more than one grid value).

## Checks (check-figure.mjs, 1,153 in `npm run check`)

Geometry against the engine for the start circuit, 40 random circuits (up to six parts of every kind, with a solve
of the first two parts for a match) and a circuit of lines over a full turn: grid circles against the circle
equations written in the harness, every arc's ends on its circle and start + sweep at its end (worst 3e-15 of the
radius), each part's arc from node k to node k + 1 (evaluateCircuit), each part arc's circle through both nodes, the
goal ring |Γ| = 0.2 (VSWR 1.5), the solutions on both construction circles, every trace point equal to sweep.ts
`gammaAt` at its frequency (1e-9), markers at `markerAt`, nodes. Density: sampled gaps between neighbouring lines in
mm ≥ the density's mm for coarse, normal, fine × Z, ZY × 88, 160, 180 mm (smallest 1.02 × over 21,600 samples) and
fewer lines on smaller figures. Text: every preset size × detail × colour mode for two circuits (54 sets): every text
≥ 6 pt, no two label boxes overlapping (oriented boxes, written independently), every label inside the figure, no
dropped label. B&w: only #000000/#ffffff written; every pair of roles shown differs in dash, width or mark (and all
26 styles at once). Greyscale: only greys written; any two roles with the same dash and the same mark differ by
≥ 20 % in lightness (the marks being the b&w distinction of nodes, solutions, markers and the goal's target). SVG: a
small XML parser written in the harness, `width`/`height` equal to the figure's mm, the viewBox, no CSS variables,
one generic font, every part and grid path read back from its `d` (start, end, radius, each piece's end on the
circle to 2e-6 mm, the turn's direction). 20 random option sets (random width 40–300 mm, view, detail items, colour,
fontPt, with and without a circuit) build and write without error.

## Timing (Node, median of 15)

Full figure at 180 mm with a 10,000-point trace (ZY fine grid, every item): build 1.5–2.0 ms, SVG 2.6 ms (320 kB).
Budgets in the harness: 15 ms and 25 ms.

## For M8.1b (TikZ)

- Use the primitives as they are (mm, Y up): `\draw (x0,y0) arc[start angle=deg(start), delta angle=deg(sweep),
  radius=r]` for arcs, `circle[radius=r]`, the trace as a coordinate list, marks as paths (no TikZ library) with the
  shapes and sizes of figureSvg.ts `markSvg`, text as nodes with `rotate=`, `anchor=center` or `west`, at `pt`.
- Clip: a `scope` with `\clip (0,0) circle[radius=clipR]` for prims with `clip`, the box as the outer clip; the
  same drawing order as `prims`.
- Strokes from `strokeOf`: `line width`, `dash pattern=on … off …` in mm, colours by `\definecolor` from the #rrggbb.
- `\linewidth`: `fig.linewidth` with `fig.width` the assumed width; scale the mm coordinates by a length the picture
  sets (`\linewidth / width`), text staying at its pt.
- The checks of milestones.md M8 (compile, MediaBox width, read-back to 1e-6 mm, pixels against this SVG rendered
  by Edge) can read `data-role` paths of the SVG the same way check-figure.mjs does.

## For M8.3a (page)

- The preview is `figureSvg(fig, { id: <unique> })` in a frame of `fig.width` CSS mm; build on option changes only
  (2 ms). The PNG renders the same SVG at 1×–8×.
- The current view: pass the chart's Γ window as `view`.
- Still to check there: the figure equals the on-screen chart's geometry from the DOM in the same view (1e-9 of the
  radius).

## Left out

- No arrows on the path's arcs (the page has them); nodes and their labels show the order. Could be a detail item
  later.
- Text widths are estimates (0.6 em per character, grid.ts's); real sans-serif digits are narrower, so the boxes are
  generous, never tight.
