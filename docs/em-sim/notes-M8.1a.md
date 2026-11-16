# EM simulation – notes of step M8.1a (figure model, SVG, PNG, TikZ)

Part of [plan.md](plan.md) (D16, milestones.md M8). Harness only: nothing on the page yet. New: `lib/emsim/figure/`
(`model.ts`, `style.ts`, `board.ts`, `field.ts`, `plot.ts`, `png.ts`, `svg.ts`, `tikz.ts`) and
`scripts/harness/emsim/check-figure.mjs` (group "Figures (M8.1a)").

## The model

- mm on paper, **y up**, box `[0, W] × [0, H]`; the standalone page is the box. Primitives (`model.ts`): `rect`,
  `poly` (closed or open, x, y interleaved), `circle`, `segs` (separate segments: contours, ticks, dimensions), `text`
  (anchor point at the middle of its height, `start`/`middle`/`end`, `pt`, `rotate` in degrees), `image` (mm box, PNG
  bytes, a file name). Each has a `role`, a drawing `layer` (`L_BACK` laminate and air, `L_MAP`, `L_OVER` contours and
  field lines, `L_COPPER`, `L_NOTE` labels, dimensions, scale bars, keys, plot frames) and an optional `clip` rectangle.
- `fig.world` (board figures) maps world mm to paper (`ox + s·x`, `oy + s·z`) with the drawing's clip: the map's
  coordinates. Text widths are estimates (`textWidth`).
- Builders: `stackupFigure(s, { widen })` (the page's sketch in mm, labels wrapped to the column at narrow widths),
  `sectionFigure(s, st, sec, { dims })` (true scale, cropped like the page: signals plus about 2.5 section heights
  across, planes or copper with a margin, at least 0.35 × the width high when air shows; dimensions w, s for pairs, h
  to the plane below), `viaSideFigure(s, v, traceW)` and `viaTopFigure(s, v, traceW)` (viaGeom.ts at true scale), and
  `plotFigure(spec)` for any plot: `PlotSpec` = axes (plot.ts `Axis` + label + tick scale `k`), series, reference
  lines (`y` across, `x` up), with plot.ts's ticks, a legend row when series are labelled, series cut to the frame.
- **Field maps**: the board builders' `map` option (`MapInput`: grid view, values, cls, colormap `Scale`, unit, label,
  contours, lines). `field.ts` `addMap` lays the image (one pixel per grid point, centred on it, copper transparent)
  under the copper, contours (dashed, with a dark halo) and field lines over it; `mapFooter` adds the colour bar with
  its ticks (`siText`); dimensions are left out and the key shows only what the map leaves visible.
- Options: `width` (mm or `readWidth` text: "88", "8.8 cm", "3.5in", `\linewidth` = laid out for 160 mm; 40–2000 mm;
  presets column 88, text 160, page 180), `colour`, `fontPt` (labels 8 pt by default, ticks and notes one less, never
  under 6).

## Colour modes (`style.ts`)

Colour: the page's light theme. Greyscale: greys only (copper #595959, mask #8c8c8c, core #bdbdbd, prepreg #dcdcdc, air
#f2f2f2); the map as a grey ramp of the same scale (dark low; signed: dark −). Black and white: #000000 and #ffffff
only: copper solid black, core hatched 45°, prepreg 135° (`hatchLines`, anchored at the origin so neighbours line up,
cut to the shape), mask outlined, behind-the-cut dashed; no map and no bar (a note says so), contours dashed; plot series
by dash pattern (eight).

## Images

PNG bytes made in `png.ts` (filter 0, fflate's `zlibSync`, RGBA or grey + alpha; no new dependency). **SVG:** data URIs.
**TikZ:** separate files beside the document (`<name>.png`, `<name>-bar.png`), placed with `\includegraphics[width,
height, interpolate=true]`: graphicx is loaded by TikZ itself, so the picture still needs only `\usepackage{tikz}`;
the head comment names the files to keep beside the `.tex`. `figureTikz` returns them in `files`.

## TikZ conventions (`tikz.ts`)

`{ picture, document, files }`. `x=1mm, y=1mm` or `x=\linewidth/160` (same body; image sizes as fractions of
`\linewidth`); `\definecolor{emRRGGBB}`; `\useasboundingbox`; a scope with `\clip` per run of clipped primitives; one
statement per line ending in `%p<i>` (hatch blocks `%h<i>`); polylines in chunks of 200 points; text as `\node`s at
`\fontsize{pt}{1.2pt}`, 0.7 em high with no depth (centre 0.35 em above the baseline, as the SVG's); `texText` keeps it
ASCII (µ, Ω, ε, φ, −, ·, | as math). The document: `fix-cm`, `standalone` with
border 0, `\usepackage{tikz}`; a `\linewidth` figure inside a 160 mm minipage.

## Checks (462, about 16 s)

19 figures (two stackups, four sections, two section maps, via side C44/C45 and a side map, via top C44/C45 and a top
map of the pair's φ, five plots) × 40/88/160/180 mm/`\linewidth` × 3 modes = 285 sets: SVG and TikZ read back to the
model within 1e-6 mm (worst 9.7e-7), text ≥ 6 pt and inside the box, colours by mode (images' PNG colour type too),
no NaN, plot series, grid and ticks inside the frame, the `\linewidth` body equal to the 160 mm body, the SVG
self-contained, the PNG inflating back to its pixels. **Compile:** 118 documents with pdflatex (every figure in 3 modes
at 88 mm, in colour at 40/160/180 mm, two `\linewidth` pictures in 70 and 160 mm minipages): no error, overfull box or
missing character, MediaBox within 0.0016 mm; about 15 s. **Timing:** the section map at 180 mm (241 × 141 grid) is
built and written in 6 ms (SVG 137 kB, TikZ 140 kB + 7 kB PNG). No pixel comparison (BL125).

## For M8.1b

- The page builds a figure from what it already holds: `sectionFigure(stackup, trace, setupSection(setup), opts)`,
  `viaSideFigure`/`viaTopFigure(stackup, via, trace.w.v, opts)`, `stackupFigure(stackup, opts)`; maps from the
  field view's `Painted` (`grid.view`, `values`, `grid.cls`, `scale`, `unit`, `contours`, `lines`) as `opts.map`;
  plots from the result's `tdr`, `nport`/`mixed`, sweeps through `plotFigure`. Pass `len` (the page's `lenText` in
  its unit) and `num`.
- **PNG:** draw `figureSvg(fig)` into a canvas at 1×–8× of 96 px per inch (`new Image()` from a Blob URL, then
  `toBlob`); the SVG is self-contained, so nothing else is fetched. The preview is the same SVG at true size.
- Save TikZ as a ZIP or the `.tex` with its PNG files; Copy gives the picture (its head names the image files).
- Left: BL124 (viaGeom.ts into `lib/emsim/`), BL125 (pixel comparison, other engines), BL126 (more dimensions and
  labels).
