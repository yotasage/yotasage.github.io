// The short lines beside the EM simulation page's controls and readouts (step M2.4d; texts from
// docs/em-sim/theory-lines.md, each fact a claim of docs/em-sim/claims.md): what each one is, and the Theory topic its
// "→ theory" link opens (an anchor of Theory.tsx's TOPICS, or null for none). The keys are what the page marks the
// lines with (data-why) and what scripts/harness/emsim/ui-why.mjs checks: every key is on the page exactly once in the
// states the harness opens. A control added later gets its line here and in theory-lines.md, or the harness fails.
// First load: text only (no KaTeX, no theory).

export interface Why {
  /** The control's name, printed before the line ("Width: …"). */
  label: string;
  /** The short line. */
  text: string;
  /** The Theory topic's id, or null for a line without a link. */
  topic: string | null;
}

/** The topics' titles for the links' accessible names (the same as Theory.tsx's TOPICS, which is not in the first load). */
export const TOPIC_TITLE: Readonly<Record<string, string>> = {
  'how-to-use': 'How to use this tool',
  'transmission-lines': 'Transmission lines and quasi-TEM',
  'field-solver': 'How the field solver works and what its error means',
  pairs: 'Single-ended and differential',
  'pair-definitions': 'Zodd, Zeven, Zdiff and Zcm',
  coupling: 'Crosstalk: NEXT and FEXT',
  'two-speeds': 'Two speeds',
  structures: 'Microstrip, stripline and the solder mask',
  trapezoid: 'The trapezoid',
  'solder-mask': 'Solder mask',
  'coplanar-ground': 'Coplanar ground',
  'copper-thickness': 'Copper thickness',
  calculators: 'Why calculators and fabs disagree',
  'closed-forms': 'Closed forms and their ranges',
  'jlcpcb-calculator': 'JLCPCB’s calculator',
  tolerances: 'Tolerances and what matters most',
};

const w = (label: string, topic: string | null, text: string): Why => ({ label, text, topic });

export const WHYS: Readonly<Record<string, Why>> = {
  // ---- the bar and the page ----
  home: w('Home', null, 'Back to all the tools on this site.'),
  nav: w('Stackup · Trace · Theory', null, 'Jump to Stackup, Trace or Theory.'),
  undo: w('Undo and redo', 'how-to-use', 'Step back or forward through every change; Ctrl+Z and Ctrl+Shift+Z too.'),
  theme: w('Light or dark', null, 'Light or dark; the page remembers your choice on this device.'),
  whys: w('Short lines', null, 'Show or hide the short lines like this one; the page remembers your choice.'),
  status: w('Work in progress', 'how-to-use', 'What the page does so far and what comes next.'),
  units: w('Units', null, 'Show lengths in mm, mil or µm; what you type is kept exactly.'),
  digits: w('Digits', 'field-solver', 'Digits for typed values and lengths; results follow their own error instead.'),
  'copy-link': w('Copy link', 'how-to-use', 'The address holds the whole setup: share it and others see the same.'),
  'link-issues': w('The link', null, 'What the link held that the page could not read, and what it used instead.'),

  // ---- Stackup ----
  preset: w('Preset', 'how-to-use', 'A fab’s stackup with its layers, thicknesses, εr and mask, each value with its source.'),
  kicad: w('KiCad files', 'how-to-use', 'Open a .kicad_pcb for its stackup or a .kicad_pro for its net classes; nothing leaves your device.'),
  'jlc-open': w('All JLCPCB stackups', 'how-to-use', 'Every stackup JLCPCB offers, filtered by layers, thickness and copper.'),
  'jlc-filter': w('Filters', null, 'Narrow the list; each menu offers only what the others leave.'),
  'jlc-withdrawn': w('Show withdrawn', null, 'Include stackups JLCPCB marks as withdrawn.'),
  'jlc-row': w('A stackup', null, 'Use this stackup; its pressed thickness shows in orange when off the nominal.'),
  summary: w('Summary', null, 'Layers, copper and total thickness; “edited” once a value differs from the preset.'),
  'stackup-drawing': w('Drawing', 'structures', 'The board to scale, top up; widen to see the thin layers.'),
  'stackup-widen': w('Widen thin layers', null, 'Gives every thin layer room to read; then the drawing is not to scale.'),
  'mask-laminate': w('Mask on laminate', 'solder-mask', 'Mask thickness away from copper; it fills the gap between traces of a pair.'),
  'mask-copper': w('Mask over copper', 'solder-mask', 'Mask thickness on the trace’s top and sides.'),
  'mask-between': w('Mask between traces', 'solder-mask', 'Mask thickness in the gap of a pair.'),
  'mask-er': w('Mask εr', 'solder-mask', 'The mask’s permittivity; it lowers Z0 by raising εeff.'),
  er: w('εr', 'tolerances', 'The laminate’s permittivity; on the default microstrip 0.3 more lowers Z0 by about 1.5 Ω.'),
  tand: w('tanδ', 'transmission-lines', 'Loss of the material; kept for later, not used by the impedance.'),
  'er-freq': w('εr at', 'transmission-lines', 'The frequency the fab states εr at; the impedance uses εr as given, at any frequency.'),
  'diel-t': w('Thickness of a dielectric', 'tolerances', 'Pressed thickness between copper layers; the largest single input for an outer microstrip.'),
  'cu-t': w('Thickness of copper', 'copper-thickness', 'Finished copper; side walls add capacitance, most in a pair.'),
  'calc-t': w('The fab’s calculator uses', 'jlcpcb-calculator', 'The copper thickness the fab’s own calculator uses, shown for comparison.'),
  etch: w('Etched per side', 'trapezoid', 'The top of the trace is narrower than its base by this much; widths are at the base.'),
  tol: w('± field', 'tolerances', '± in the same unit, or %; the Tolerance tool uses it instead of a placeholder.'),
  src: w('Source tag', null, 'Where the value comes from: a fab’s page, KiCad, or typed by you.'),
  sources: w('Sources', null, 'Every reference the stackup’s values cite, with the date read.'),
  'kicad-board': w('Board file', null, 'What KiCad version wrote the file and what the page did not use.'),
  'net-classes': w('Net classes', 'how-to-use', 'The project’s track widths, clearances and pair sizes, usable as structures in Trace.'),
  'stackup-issues': w('About this stackup', null, 'Values that cannot be solved as they are, with the reason.'),

  // ---- Trace: structure and fields ----
  structure: w('Structure', 'structures', 'Microstrip on an outer layer, stripline between planes, pairs, coplanar grounds, or a free arrangement.'),
  'to-general': w('Edit as general', 'how-to-use', 'The same structure as traces and grounds you can add to; the values stay the same.'),
  'class-structure': w('Net classes', 'how-to-use', 'A KiCad net class’s track or pair as the structure.'),
  layer: w('Signal layer', 'structures', 'The copper layer the trace is on; planes move to its neighbours.'),
  layer2: w('Signal layer 2', 'pairs', 'The second trace’s layer of a broadside pair.'),
  plane: w('Plane above and below', 'transmission-lines', 'The reference copper; the field and the return current run there.'),
  width: w('Width', 'trapezoid', 'Base width of the trace; Z0 falls as it widens.'),
  gap: w('Gap', 'pair-definitions', 'Edge-to-edge gap of a pair; a smaller gap lowers Zdiff and raises coupling.'),
  offset: w('Offset across', 'pairs', 'Sideways offset between the two traces of a broadside pair.'),
  'ground-gap': w('Gap to ground', 'coplanar-ground', 'Gap to the coplanar ground; under a few laminate thicknesses it lowers Z0.'),
  'ground-width': w('Ground width', 'coplanar-ground', 'Width of each coplanar ground; empty runs it to the edge.'),
  masked: w('Solder mask over the trace', 'solder-mask', 'Off for a trace left bare; the mask lowers Z0 by a few ohms.'),
  'gen-layer': w('On layer', null, 'The copper layer that Add trace and Add ground use.'),
  'gen-add': w('Add trace, Add ground', 'how-to-use', 'Adds one in the free place nearest the centre; up to eight traces.'),
  'gen-remove': w('Remove', null, 'Removes the selected trace or ground.'),
  'gen-position': w('Position (centre)', null, 'Where the trace’s centre is, across the board.'),
  'gen-edges': w('Left and right edge', 'coplanar-ground', 'The ground’s edges; empty runs it to that edge of the board.'),
  'trace-view': w('Drawing', 'field-solver', 'The cross-section the solver sees; drag, pinch or wheel to move and zoom.'),
  handles: w('Handles', 'field-solver', 'Drag or use the arrow keys to change a size; one undo step per drag.'),
  'trace-reset': w('Show all', null, 'The corner button shows the whole cross-section again.'),
  'trace-widen': w('Widen thin layers', null, 'Stretches thin layers to see them; not to scale while on.'),
  'field-on': w('Show the fields', 'transmission-lines', 'Draws the field of the solved structure behind the copper.'),
  'field-qty': w('Quantity', 'transmission-lines', 'Potential, electric or magnetic field, or the charge and current on the copper.'),
  'field-drive': w('Drive', 'pairs', 'Odd or differential, even or common, or one line driven.'),
  'field-line': w('Driven line', 'coupling', 'The one trace at 1 V; the others at 0 V.'),
  'field-scale-kind': w('Colour scale', null, 'Logarithmic shows the weak field far from the copper too.'),
  'probe-keys': w('Probe keys', null, 'When on, the arrow keys move the probe instead of the view.'),
  'field-scale': w('Scale bar', null, 'The quantity, its unit, range and the drive shown.'),
  probe: w('Probe', null, 'Position, material, potential and E at the probe.'),

  // ---- Trace: results ----
  z0: w('Z0', 'transmission-lines', 'Voltage over current of a wave on this line; √(L/C).'),
  eeff: w('εeff', 'transmission-lines', 'The uniform permittivity that would give the same speed: C with dielectrics over C in air.'),
  delay: w('Delay', 'transmission-lines', 'Time per length, √(LC); in ps/mm, or ps/in when lengths are in mil.'),
  err: w('± error', 'field-solver', 'The solver’s error from refining the panels; digits never finer than it.'),
  'solve-status': w('Regular, irregular', 'field-solver', 'Whether the solver’s levels shrank steadily; irregular is a cautious error, not a wrong value.'),
  quick: w('Coarse while dragging', 'field-solver', 'A quick value while you drag; the full value and its error follow when you stop.'),
  zdiff: w('Zdiff', 'pair-definitions', 'Impedance between the two traces of the pair; twice Zodd when symmetric.'),
  zcm: w('Zcm', 'pair-definitions', 'Both traces together against the planes; half of Zeven when symmetric.'),
  zodd: w('Zodd', 'pair-definitions', 'One trace’s impedance with the pair driven opposite; Zdiff / 2.'),
  zeven: w('Zeven', 'pair-definitions', 'One trace’s impedance with both driven alike; 2 · Zcm.'),
  zdc: w('Zdc', 'pair-definitions', 'How much differential signal turns into common mode on an unequal pair.'),
  modes: w('Modes’ εeff and delay', 'two-speeds', 'Each mode’s own speed; on a microstrip pair the odd mode is faster.'),
  'zdiff-b': w('Zdiff (B), Zcm (B)', 'pair-definitions', 'The same for a pure differential voltage drive; equal to Zdiff when symmetric.'),
  ztdr: w('Z_TDR', 'pair-definitions', 'What a differential TDR with 50 Ω ports reads.'),
  kb: w('NEXT kb', 'coupling', 'Height of the near-end copy on the neighbour, as a share of the signal.'),
  kf: w('FEXT kf', 'coupling', 'Far-end copy per length and edge slope; negative over a microstrip pair.'),
  'zc-kk': w('Z0 of line k', 'pair-definitions', 'Each trace’s impedance while the other carries no current: the diagonal of Zc.'),
  'lines-each': w('Z0 and εeff of line k', 'pair-definitions', 'Each trace’s Zc_kk and its C over C in air, for three or more traces.'),
  flags: w('Notes from the solver', 'field-solver', 'Unresolved modes, a single level, irregular refinement.'),
  matrices: w('Matrices', 'field-solver', 'Per-length capacitance, inductance and impedance matrices that every result comes from.'),
  'structure-issues': w('About this structure', null, 'Why a structure cannot be solved as set, or what to watch.'),

  // ---- Trace: tools ----
  tools: w('Tools', 'how-to-use', 'Target, Sweep, Tolerance and Calculators; press again to close.'),
  'target-key': w('Quantity', 'pair-definitions', 'Z0, Zdiff or Zcm to reach.'),
  'target-vary': w('Solve for', null, 'Width, gap, or both at a fixed ratio.'),
  'target-input': w('Target', null, 'The impedance you want, in Ω.'),
  'target-result': w('Result', 'field-solver', 'The width found, ± what the solver’s error allows.'),
  'target-use': w('Use this width', null, 'Puts the shown width in the setup, as one step you can undo.'),
  'sweep-input': w('Input', 'tolerances', 'Any width, gap, thickness, εr or mask value to vary.'),
  'sweep-range': w('From, To, Points', null, 'The range and how many solves, 3 to 200.'),
  'sweep-outs': w('Plot', null, 'Which results get a plot.'),
  plot: w('The plot', 'field-solver', 'Each point as it arrives; the band is the solver’s error, dashed the current value.'),
  'plot-cursor': w('Cursor', null, 'Point, tap or use arrows to read values; Shift moves ten.'),
  'sweep-table': w('Values as a table', null, 'The same points as numbers.'),
  cancel: w('Cancel', null, 'Stops the sweep or Monte Carlo; points so far stay.'),
  'tol-note': w('Placeholders', 'tolerances', 'Tolerances not typed are placeholders: ±10 %, εr ±0.2, mask ±30 %.'),
  'tol-corners': w('Worst case (corners)', 'tolerances', 'Every input at the end that moves Z the same way: safe, pessimistic.'),
  mc: w('Monte Carlo', 'tolerances', '1000 boards with random inputs from a fixed seed; repeats exactly.'),
  'mc-stats': w('Median, 95 %, 99.73 %, σ', 'tolerances', 'Where the middle, 95 % and nearly all boards fall.'),
  rank: w('What moves', 'tolerances', 'Each input alone at its tolerance, ranked; the share is its change squared.'),
  'calc-field': w('This tool', 'field-solver', 'This page’s value, the same as under the drawing.'),
  'calc-jlc': w('As JLCPCB’s calculator', 'jlcpcb-calculator', 'The same trace with the inputs JLCPCB’s calculator sends to Si9000.'),
  'calc-stated': w('JLCPCB’s calculator says', 'jlcpcb-calculator', 'What JLCPCB’s calculator states for this case, and Si9000’s value there.'),
  'calc-use': w('Use JLCPCB’s calculator inputs', 'jlcpcb-calculator', 'Puts the calculator’s inputs in the stackup, as one step you can undo.'),
  'calc-parts': w('One at a time', 'jlcpcb-calculator', 'Each input’s share of the difference to JLCPCB’s calculator.'),
  'calc-reduced': w('What the formulas see', 'closed-forms', 'The single width, height and εr the formulas are given.'),
  cf: w('A formula', 'closed-forms', 'A closed formula’s value, its range and stated accuracy, and what it leaves out.'),
  'calc-kj': w('Kirschning–Jansen', 'copper-thickness', 'Zero-thickness strips: thick copper lowers Zdiff by many ohms.'),
  'calc-neglect': w('Not in the formulas', 'closed-forms', 'Why the formulas sit above a masked or thick trace.'),
  'calc-none': w('No formula', 'closed-forms', 'No closed formula covers this structure; the field value stands alone.'),
};
