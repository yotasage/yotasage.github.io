# EM simulation – how to use it

The tool is at [/em-sim/main](https://yotasage.github.io/em-sim/main). It runs in the browser; nothing you type or
open (a KiCad board, a project file) leaves the device. This page is for a visitor: what the tool does, how to do each
task, what the results mean and where their limits are. The plan and the build notes are in [plan.md](plan.md).

## What it does

It works out the **impedance of PCB traces and vias** from field solvers instead of closed formulas, and **shows the
fields**: in the trace's cross-section, around a via, in 3D, and as animated waves from a full-wave run.

- **Traces:** a 2D field solver (boundary elements) gives Z0, εeff and the delay, and for a pair Zdiff, Zcm, Zodd,
  Zeven, the crosstalk coefficients and each mode's speed, every number with the solver's own error.
- **Vias:** a model made of lines and capacitances, each piece solved in 2D or around the barrel's axis, gives the
  barrel's and the whole via's impedance, the pads' capacitance, the stub's resonance, a TDR and S-parameters.
- **Full-wave:** a 3D FDTD run of the via or a trace section, on the graphics card or the CPU, gives its own TDR and
  S-parameters to put beside the model's, and the waves to watch.

The bar at the top jumps to the sections: **Stackup · Trace · Via · Waves · Export · Examples · Theory ·
References**. The status note under it says what works, how it is checked and what is left out ("More"). The **?**
switch in the bar shows a short line beside every control and result, most with a **→ theory** link. **Undo** and
**Redo** (Ctrl+Z, Ctrl+Shift+Z) step through every change; the page's address holds the whole setup, so **Copy link**
shares exactly what you see. Light and dark follow the system or the sun/moon button; units (mm, mil, µm) and digits
are under the status note.

## Quick start

1. Open the page. It starts on a 50 Ω microstrip of 0.1377 mm on L1 of JLCPCB's six-layer stackup JLC061611-3313A,
   under solder mask, over the plane on L2; the solver gives 51.50 ± 0.05 Ω.
2. Pick your fab's stackup in **Stackup**, or open your KiCad board.
3. In **Trace**, choose the structure and drag the width in the drawing, or open **Tools → Target** and type 50 Ω.
4. Open **Via** for the via the trace goes through, and **Waves** to run it full-wave if the Via section suggests it.
5. **Export** the figures and numbers, or print the report.

## Stackup

- **Preset** gives a fab's stackup with every layer's thickness, εr and mask, each value with its source and date.
  **All JLCPCB stackups…** lists every stackup JLCPCB offers, filtered by layers, thickness and copper (withdrawn ones on
  request).
- **KiCad files:** open a `.kicad_pcb` to take its stackup, a `.kicad_pro` to add its net classes (track widths and
  pair sizes), which **Trace** then offers as structures. The board card says which KiCad version wrote the file and
  what was not used.
- **Every value can be typed**, with a tolerance (± in the unit or %): thicknesses, εr (with the frequency the fab
  states it at), tanδ, copper, the etch (the trace's top narrower than its base) and the solder mask's three
  thicknesses (on laminate, over copper, between traces). An edited value says so.
- The **drawing** is to scale; **Widen thin layers** gives thin layers room to read (then it is not to scale).

## Trace

- **Structure:** microstrip, embedded microstrip, stripline (symmetric or not), coplanar with or without ground,
  edge- and broadside-coupled pairs, or **General arrangement** (up to eight traces and any number of grounds, on any
  layers). **Edit as general** turns a structure into its traces and grounds to add to.
- **Sizes:** type them, or drag the handles in the drawing (arrow keys on a focused handle; one undo step per drag).
  While you drag, a quick coarse value follows the pointer; the full one and its error arrive when you pause.
- **Results:** Z0, εeff and the delay; for a pair Zdiff, Zcm, Zodd, Zeven, Zdc, both modes' εeff and delay, Z_TDR (what
  a differential TDR with 50 Ω ports reads), NEXT kb and FEXT kf; for three or more traces each line's Z0; and the C, L
  and Z matrices every result comes from. "Irregular" means the solver's refinement did not shrink steadily: the
  error shown is then a cautious one, not a sign of a wrong value.
- **Fields:** **Show the fields** draws the potential, E, H, or the charge and current on the copper, for any drive
  (odd, even, one line); the probe reads the values at a point (tap, or the arrow keys with **Probe keys** on).

### Tools

- **Target** finds the width, the gap, or both at a fixed ratio for a Z0, Zdiff or Zcm; **Use this width** puts it in.
- **Sweep** varies any width, gap, thickness, εr or mask value (3 to 200 points) and plots the results with the
  solver's error as a band; the points are also a table.
- **Tolerance** gives the worst case (every input at the end that moves Z the same way), a **Monte Carlo** of 1000
  boards from a fixed seed (median, 95 %, 99.73 %, σ), and **What moves**: each input alone at its tolerance, ranked.
  Tolerances you have not typed are placeholders (±10 %, εr ±0.2, mask ±30 %) and say so.
- **Calculators** compares with closed formulas (each with its range and what it leaves out) and with the inputs
  JLCPCB's own calculator uses, input by input; **Use JLCPCB's calculator inputs** puts them in the stackup.

## Via

- **Single or pair**, or one of the two **examples** (a 0.6/0.3 via and an LVDS pair from real boards). Set the
  barrel's layers (through, blind or buried), the entry and exit layers (barrel beyond them is a stub), drill, plating
  and, for a pair, the pitch.
- **Layers:** per copper layer its pad (empty: removed) and whether it is a plane, with the antipad (round, oblong
  around both vias, or two rounds joined); **Return vias** with their places and the planes they join; **Backdrill**
  from either side; **Feeds**, the traces in and out with length and direction.
- **Drawings:** the side view (the board cut along the top view's dashed line) and the top view, both to scale, with
  handles to drag (or arrow keys, Shift for finer); a tap on the top view adds a return via there. **Show the fields**
  draws the via's field in both views; **3D view** turns the via in 3D (drag, or arrows and + −), with its fields on
  the cut planes, half cut away or the laminate hidden, and saves a PNG.
- **Results:** the barrel's impedance (from a 2D cut), the whole via as one section (√(L/C), pads and planes in), the
  delay through, L and C, each piece of barrel, the extra capacitance at every pad and plane, the stubs and their
  resonance, the feeds, **Valid to** (the frequency up to which the model holds), flags with their numbers, and the
  model's assumptions.
- **Plots:** the TDR and TDT at the rise time you choose, and S-parameters in dB, all at the port impedance you set
  (for a pair differential or common, and mixed-mode S). The plots share cursors (point, tap or arrow keys).
- **Target** finds every plane's antipad diameter, or the return vias' distance, for an impedance.
- **Full-wave:** when the model is stretched (a feed crossing its antipad by more than 0.1 mm, the nearest return via
  more than 1.5 mm away or none, the edge's band past the model's, a stub resonating within twice the band), the
  section says why and links to the Waves section with this via.

## Waves (full-wave runs)

1. Choose **what to run**: the via with its feeds, or the trace as a straight section of a given length.
2. Set the **rise time**: a faster edge needs finer cells, so more memory and time.
3. Read the **estimate**: cells, memory, steps and the time on this device (from a short measured run). It says where
   it would run: on the graphics card with WebGPU, or on the CPU, often a hundred times slower. A run that will not fit
   is refused before it starts.
4. **Run.** The progress line shows each excitation's step, the time left and how far the energy has died down;
   **Cancel** stops and frees the memory.
5. Compare: the run's **TDR and S-parameters** lie beside the quasi-static model's at the same ports; where the curves
   part, the model stops holding. The run notes say whether it settled, stayed stable and whether its feeds matched the
   2D solver.
6. **Watch:** the player shows the electric field on a slice (from the side through the barrel, or from above) frame by
   frame, with the copper drawn over it: |E| or one component, play, step (arrow keys, Page Up/Down), speed and loop.
   For a pair: entry A alone, or both as a differential or common drive. The **3D view** shows the slices as planes in
   the structure on the same clock; turn planes off, cut the near half away or show the laminate.

## Export, data and the report

- **Figure:** the stackup, the cross-section, the via (side or top), a field map once drawn, or any plot. Width: column
  88 mm, text 160 mm, page 180 mm, any width, or LaTeX's `\linewidth`. Colour, greys, or black and white (hatched
  materials, dashed lines). **TikZ** needs only `\usepackage{tikz}`; a figure with a field map comes as a ZIP with its
  PNG files beside the `.tex`. **SVG** for vector editors, **PNG** at 1× to 8× (1× is 96 pixels per inch). The preview is at true size,
  with text never under 6 pt.
- **Data:** CSV of the trace's results, the last sweep, the via's model, its TDR and TDT, or its S-parameters, and
  Touchstone (`.s2p`, `.s4p`) of the via's S-parameters as RI, MA or DB, every digit the solver gave, with the date and
  the setup's link in the first lines.
- **Project:** **Save project** writes a `.emsim.json` with the whole setup; **Open project**, or a drop on the page,
  puts it back as one undo step. **Copy link** copies the address, which holds the same setup.
- **Report:** **Print report** prints the setup and results (with field maps, plots and calculators once the page has
  them) on A4 or Letter, light whatever the theme; choose "Save as PDF" in the print dialog for a file.

## Examples, theory and equations

- **Examples** (five): a 50 Ω microstrip on JLC061611-3313A, a 100 Ω LVDS pair, the LVDS pair's via, JLCPCB's widths
  explained, and a 0.6/0.3 via with a stub and backdrill. Each step's link opens its state on the page, with the
  numbers to look for.
- **Theory** has 15 topics (how to use, transmission lines, the field solver and its error, pairs, structures and the
  mask, calculators and fabs, tolerances, the via as a line, pads and antipads, the return path, stubs and backdrill,
  reading a TDR, S-parameters, where the via model stops, and full-wave runs), with your numbers in them and every
  claim's source in **References**.
- **Equations:** a number with a dotted underline opens its equation with your numbers beside the result; **Derive**
  shows how it follows, a step at a time. Escape closes it.

## When to trust a result

- **Trace impedance.** The 2D solver's error is shown beside every number, and the digits never go finer. It is
  checked against exact solutions (coax, striplines, coupled striplines, coplanar lines) and against a separate
  finite-difference solver on 500 random structures: they agree to a median of 0.05 %, and every difference lies within
  the error shown. With the inputs JLCPCB's calculator uses, the tool gives the same impedance within about 0.3 %; with
  the stackup's own εr and copper it gives about 3 % more, which the Calculators tool explains input by input.
- **What it leaves out.** Apart from the full-wave runs it is quasi-static: no losses, no copper roughness, and εr does
  not change with frequency. On the default microstrip, dispersion raises εeff by 0.05 % at 10 GHz and 0.3 % at 25 GHz,
  so the numbers hold to well above 10 GHz on thin laminates. The tolerance results are only as good as the tolerances
  typed; without yours they are placeholders.
- **Vias.** The via model is right while its pieces are short against the wavelength and the return path is close.
  Against full-wave runs, with the nearest return via within 1.2 mm its impedance is within about 2.5 %, at 2 mm about
  5 % high and at 3 mm about 8 % high; **Valid to** gives its frequency limit for the via you typed. The coupling
  between a pair's pads is an estimate. Where the section flags a via, run it full-wave.
- **Full-wave runs** are checked against openEMS, a separate full-wave solver, on a single via, a via with a stub, a
  backdrilled via, a via pair and a trace pair: 43 frozen limits, all held (for example the TDR within 2.5 Ω, |ΔS|
  within 0.10 up to 10 GHz and 0.15 up to 20 GHz, the stub's notch within 8 %). The run itself says whether it settled.
- The whole set of checks runs again with every change to the tool. Still, the numbers are a careful estimate: for an
  order, your board house's own figures have the last word, and results that matter are worth checking against
  another source.

## Browsers and devices

- **Full-wave on the graphics card** needs WebGPU: Edge and Chrome offer it. Where a browser has no WebGPU, or no usable
  graphics card, the Waves section says so in plain words, and the run is on the CPU, often a hundred times slower,
  with its time estimated first. The quickest case is the trace section at a 100 ps rise.
- The page is checked in Edge, Firefox and Safari's engine (WebKit), by keyboard alone and by touch, at 320 px wide
  and 200 % zoom, in both themes (WCAG AA contrast), with reduced motion respected. WebGPU in real Firefox and Safari
  has not been tried.
- **Phones:** every section works at phone width and by touch. On a slow device a drag can fall a little behind the
  pointer, and a full-wave run on a phone's CPU can take long; the estimate says how long before it starts.

## Limits

- **Losses and frequency:** no conductor, roughness or dielectric loss in the quasi-static results, and no change of εr
  with frequency (the full-wave runs take the laminate's tanδ at one frequency).
- **One structure at a time:** a trace cross-section or one via (or via pair) with its feeds, never a routed net or a
  whole board; KiCad files give the stackup and net classes only.
- **No time-domain circuit simulation** (drivers, receivers, eye diagrams) and **no import of measured data**.
- **Settings:** the field views' and the tools' settings, the via plots' rise time and port, and the export's options
  are not in the link or the project file yet.

These may come later; for now the tool covers impedance and fields of traces and vias.
