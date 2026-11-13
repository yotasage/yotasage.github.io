# Smith chart – notes of step M8.1b (TikZ and its compile harness)

Part of [plan.md](plan.md) (D18, milestones.md M8). Harness only: nothing on the page yet. New files
`lib/smith/figureTikz.ts` and `scripts/harness/smith/check-tikz.mjs` (awaited at the end of `check.mjs`).
figure.ts and figureSvg.ts are unchanged (the text-off option is the TikZ writer's; the harness strips the SVG's
`<text>` elements).

## The output

`figureTikz(fig, { text? }) → { picture, document }`. The picture, for a standard 88 mm figure:

```tex
% Smith chart, 88 x 88 mm, standard detail, colour, from https://yotasage.github.io/smith-chart/main
% Needs only \usepackage{tikz}. Coordinates are millimetres on paper with the chart's centre (Gamma = 0)
% at (0,0), y up; text is set in the document's font at the size in pt it was laid out for.
\definecolor{smithDFDFDF}{HTML}{DFDFDF}%
…
\begin{tikzpicture}[x=1mm, y=1mm, line cap=round, line join=round,
  sk1/.style={draw=smithDFDFDF, line width=0.07mm},
  …
  sk5/.style={draw=smith0B6A5F, line width=0.3mm, dash pattern=on 1.3mm off 1.05mm},
  mk6/.style={draw=smith0B6A5F, fill=smith0B6A5F, line width=0.3mm},
  tx12/.style={text=smith7A766D, font=\fontsize{7}{8.4}\selectfont, text height=4.9pt, text depth=0pt, inner sep=0pt, outer sep=0pt}]
  \useasboundingbox (-44,-44) rectangle (44,44);
  \begin{scope}
  \clip (-44,-44) rectangle (44,44);
  \begin{scope}
  \clip (0,0) circle[radius=29.777083];
  \draw[sk1] (-7.6750938,-26.4658408) arc[start angle=-108.9246444, delta angle=-142.1507112, radius=27.9781746]
  …
```

- Coordinates are the model's (mm, origin at Γ = 0, y up), so TikZ needs no y flip. Circles, lines, polylines,
  marks and text positions are rounded to 1e-6 mm (`num`); an arc's start and radius to 1e-7 mm and its angles to the
  decimals that keep r × error ≤ 2.5e-8 mm, because TikZ computes the arc's centre and end from them: at 1e-6 the end
  came out up to 1.7e-6 mm off, at 1e-7 it stays under 3e-7.
- Colours are `\definecolor{smithRRGGBB}{HTML}{…}%` (named by their value, so two pasted figures never clash; the `%`
  keeps the lines from adding spaces in a paragraph). Styles live in the picture's options (local to the picture).
- Drawing order and clipping as figureSvg.ts: `\useasboundingbox` the box (so the standalone page is exactly the
  figure), a scope clipping to the box, and a scope with `\clip (0,0) circle[radius=clipR]` around each run of
  clipped primitives.
- **Large arcs.** Grid lines near x = 0 in a zoomed view have radii up to 10⁴ × the figure's width. pgf computes an
  arc's centre (overflowing TeX's 16384 pt ≈ 5.76 m) and its end from sin and cos to about five digits of the
  radius, so arcs and circles over `ARC_MAX_MM` (500 mm) are written as their part inside the visible disc (the clip
  circle, or the box's circumcircle, plus 0.5 mm) in cubic Béziers with exact ends and control points
  (k = 4/3 tan(δ/4), pieces short enough for a radial error under 1e-7 mm), or a straight segment when the sagitta is
  under `FLAT_MM`.
- pgf builds a path by appending to a macro, quadratic in its length: polylines are split every `POLY_CHUNK` (200)
  points and one `\draw` holds at most `DRAW_WEIGHT` (200) segments. A Full 180 mm figure with a 10,000-point trace
  compiles in about 3 s.
- Text: `\node[txN] at (x,y) {…}` with `anchor=west` for the legend and `rotate=` for grid labels; the style sets
  `\fontsize{pt}{1.2 pt}\selectfont` (the model's pt written as TeX pt; 0.4 % apart), `text height` 0.7 em and depth 0,
  so the node's centre is 0.35 em above the baseline as in the SVG, whatever the glyphs. `texLabel` escapes TeX's
  specials and writes λ, Ω, µ, −, °, ∞, ± … as `\ensuremath{…}`, ’ as ', so it compiles with pdfLaTeX, XeLaTeX and
  LuaLaTeX; anything else outside ASCII becomes "?".
- Marks are paths with figureSvg.ts's shapes and sizes: dot `\fill … circle`, target a circle and a dot, cross two
  segments at 1.6 × the width, triangle `\filldraw … -- cycle`.
- `\linewidth`: `x=\linewidth/W, y=\linewidth/W` with W the assumed width (pgfmath divides to 5 digits), the same
  body as the W mm figure; text keeps its pt and lines their width in mm. The head says to start the paragraph with
  `\noindent`. Its standalone document wraps the picture in a minipage of W mm.
- The standalone document: `\RequirePackage{fix-cm}` (any font size without substitution warnings),
  `\documentclass[tikz, border=0pt]{standalone}`; no library and no other package.

## Checks (check-tikz.mjs, about 460 in `npm run check`)

- Read-back on the 27 presets (start circuit with trace, markers and a solve) and 20 random option sets: the TikZ
  is parsed by a reader in the harness (statements, scopes, styles, paths: coordinates, `circle`, `arc`, `--`,
  `.. controls … and … ..`, `cycle`) and walked against `fig.prims`: every circle, line and polyline point to 1e-6 mm,
  every arc's centre and end recomputed from its start, angles and radius against the model's (worst 5e-7 mm), large
  arcs' pieces with ends on the circle, inside the model's arc and either at its ends or on the visible disc's edge,
  control points of the construction and the curve's middle on the circle; strokes (colour, width, dash) against
  `strokeOf`, marks, text nodes (place, rotation, anchor, size, text height, colour, `texLabel` text, not clipped).
  Nothing left over. Digits: no coordinate beyond 1e-6 mm except arcs' and Béziers' 1e-7. B&w: only #000000/#ffffff
  defined; greyscale: only greys. ASCII only; no `\usetikzlibrary`, no package but tikz.
- Text at 30 mm (MIN_WIDTH) for every detail and colour mode: every label ≥ 6 pt in the model and a node at that size.
- `\linewidth` at 160 and 120 mm: the unit and the same styles and body as the fixed width.
- Compile (58 jobs, 8 at a time, 10.5 s on the owner's PC): all 47 sets with pdflatex `-halt-on-error`, logs without
  overfull boxes, missing characters or font size substitutions; MediaBox (read from the PDF, inflating object streams)
  equal to the figure's width and height (worst 0.002 mm); the `\linewidth` picture in minipages of 70 and 160 mm gives
  70 and 160 mm wide pages with the height scaled; both `\linewidth` documents; the Full figure with xelatex and
  lualatex; a Full figure with a 10,000-point trace.
- Pixels at 600 dpi, text off (the SVG's `<text>` stripped), pdftoppm `-gray` against Edge (Chrome as fallback,
  viewport at the PDF's pixel size, SVG sized in px): pixels differing by more than 64 of 255 outside a 1-px edge band:
  column minimal b&w 0.395 %, text standard colour 0.04 %, page full grey 0.11 %, random set 3 0.04–0.15 %. The b&w
  column figure is the closest to the limit: its heavy black real axis is drawn by pdftoppm with stroke adjustment
  (snapped to whole pixels), so both its edges differ along the whole line; elsewhere the differences are pgf's
  quarter-turn Bézier circles (radial error 2.7e-4 r, half a pixel on the rim).
- Writer timing: Full 180 mm figure with a 10,000-point trace: 3.4 ms (364 kB); budget 30 ms.
- The TikZ section adds about 15 s to `npm run check` (1 m 52 s in all on the owner's PC).
- Without TeX Live (or with `SMITH_NO_TEX=1`): "tikz compile: skipped: no pdflatex", the structural checks still run.
  pdflatex is looked for in `TEXBIN`, the PATH and `C:\texlive\2026\bin\windows`. `SMITH_TIKZ_OUT=<dir>` keeps every
  compile folder (with `browser.png` beside pdftoppm's `page.pgm` for the pixel sets); otherwise a temp folder is used
  and removed.

## For M8.3a (page)

- The picture and the document: `const fig = buildFigure(input, options); const { picture, document } =
  figureTikz(fig);` with the same `fig` as the preview (`figureSvg`), so they cannot disagree. Writing is 3–4 ms for the
  largest figure; build it on option changes or only when the visitor copies or saves.
- "Copy TikZ" copies `picture` (paste into a document with `\usepackage{tikz}`); "Save .tex" saves `document`
  (compiles as it is). A `\linewidth` width (readWidth) gives `fig.linewidth`, and the picture fills the line where it
  is pasted; say on the page that the density and text were chosen for the assumed width.
- Text is in the reader's document font, so its widths differ from the preview's sans-serif; the model's text boxes
  are generous estimates (0.6 em per character), so labels do not collide.
- Still to check there: the figure equals the on-screen chart's geometry from the DOM in the same view.

## Left out

- The PDF's own Bézier circles (pgf's quarter-turn pieces) are pgf's; writing every circle as finer Béziers would make
  the PDF match the SVG more closely but would no longer be TikZ's `circle` and `arc`, which the owner can edit.
- No arrows on the path's arcs (as the SVG).
