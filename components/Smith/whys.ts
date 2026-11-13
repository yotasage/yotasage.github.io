// The short lines beside the Smith chart's controls and readouts (docs/smith-chart/theory.md §8 and theory-solver.md): what each one is,
// in at most about twelve words, and the Theory topic its "→ theory" link opens. The keys are what the page marks
// the elements with (data-why) and what scripts/harness/smith/ui-why.mjs checks; the kinds' lines are keyed
// `kind-<code>` by state.KIND_CODES. Each fact repeats a claim of the topic it links to (docs/smith-chart/claims.md).

export interface Why {
  /** The short line. */
  text: string;
  /** The Theory topic's id (an anchor of components/Smith/Theory.tsx's TOPICS). */
  topic: string;
  /** What the line is about, for the info button's accessible name ("About Z0"). */
  about: string;
}

const w = (about: string, topic: string, text: string): Why => ({ text, topic, about });

export const WHYS: Readonly<Record<string, Why>> = {
  z0: w('Z0', 'gamma-z-y', 'The reference: every z on the chart is Z divided by Z0.'),
  f0: w('f0', 'moving-on-the-chart', 'The frequency the parts’ reactances and line lengths are worked out at.'),
  load: w('the load', 'gamma-z-y', 'The load Z = R + jX; the path starts at its point, L.'),
  strip: w('the strip', 'how-to-use', 'Source left, load right; the chart’s path runs from the load.'),
  add: w('Add', 'how-to-use', 'Adds the chosen kind at that place; its arc appears on the chart.'),
  draw: w('Draw', 'moving-on-the-chart', 'Drag out of In to add this kind at the source end.'),
  card: w('moving and removing parts', 'moving-on-the-chart', 'Order matters: each part acts on what lies on its load side.'),
  'kind-ls': w('series L', 'moving-on-the-chart', 'Adds +jx: clockwise along its r circle, upwards.'),
  'kind-cs': w('series C', 'moving-on-the-chart', 'Adds −jx: counter-clockwise along its r circle, downwards.'),
  'kind-rs': w('series R', 'moving-on-the-chart', 'Adds r: along its x arc, towards the open at Γ = +1.'),
  'kind-lp': w('shunt L', 'moving-on-the-chart', 'Adds −jb: counter-clockwise along its g circle, upwards.'),
  'kind-cp': w('shunt C', 'moving-on-the-chart', 'Adds +jb: clockwise along its g circle, downwards.'),
  'kind-rp': w('shunt R', 'moving-on-the-chart', 'Adds g: along its b arc, towards the short at Γ = −1.'),
  'kind-tl': w('the line', 'transmission-lines', 'Turns the point clockwise on a circle round Zc; λ/2 is a full turn.'),
  'kind-so': w('the open stub', 'transmission-lines', 'Shunt b = (Z0/Zc)·tan θ; shorter than λ/4 it acts as a C.'),
  'kind-ss': w('the short stub', 'transmission-lines', 'Shunt b = −(Z0/Zc)·cot θ; shorter than λ/4 it acts as an L.'),
  'kind-qw': w('the λ/4 transformer', 'transmission-lines', 'A λ/4 line of Zt: Z_in = Zt²/Z_L, exact at f0.'),
  'field-value': w('the value', 'moving-on-the-chart', 'The part’s value; the other fields follow.'),
  'field-at-f0': w('the reactance or susceptance', 'moving-on-the-chart', 'Its reactance or susceptance at f0, in ohms or siemens.'),
  'field-normalised': w('the normalised value', 'gamma-z-y', 'The same divided by Z0 (or times Z0): what the chart adds.'),
  'field-length': w('the length', 'transmission-lines', 'Length in wavelengths, or electrical length in degrees, at f0.'),
  'field-zc': w('the line impedance', 'transmission-lines', 'The line’s own impedance; not Z0 means a circle off-centre.'),
  ring: w('the rings', 'moving-on-the-chart', 'Drag to change this part’s value along its circle.'),
  grid: w('Z, Y and ZY', 'reading-the-chart', 'Which grid to read: r and x, g and b, or both.'),
  snap: w('Snap', 'realisable-values', 'Drags settle on grid circles and each kind’s Standard values list; Alt drags free.'),
  history: w('Undo, Redo and Start over', 'how-to-use', 'Step through changes; Start over brings back the worked example.'),
  zoom: w('Fit, Reset and zoom', 'reading-the-chart', 'Zoom in near the centre; the grid fills in finer circles.'),
  rim: w('the rim scales', 'reading-the-chart', 'Angle of Γ, and wavelengths towards the generator or the load.'),
  'read-z': w('z', 'gamma-z-y', 'Z/Z0 = r + jx at the point.'),
  'read-Z': w('Z', 'gamma-z-y', 'The same in ohms: z times Z0.'),
  'read-y': w('y', 'gamma-z-y', '1/z = g + jb at the point.'),
  'read-Y': w('Y', 'gamma-z-y', 'The admittance in siemens: y divided by Z0.'),
  'read-gamma': w('Γ (polar)', 'gamma-z-y', 'Reflection coefficient: distance from the centre and angle.'),
  'read-gammaRect': w('Γ (Cartesian)', 'gamma-z-y', 'The same Γ as Γr + jΓi: the point’s coordinates.'),
  'read-vswr': w('VSWR', 'how-good-is-a-match', 'Largest over smallest voltage on the line; 1 is a match.'),
  'read-rl': w('return loss', 'how-good-is-a-match', 'Reflected power below incident, in dB; larger is better.'),
  nodes: w('the node table', 'how-to-use', 'Each node from the load to the input: z, Γ, VSWR, return loss.'),
  input: w('the circuit input', 'how-good-is-a-match', 'What the source sees: the end of the path, In.'),
  // M5.2: the "show equation" control and the equation panel's linking.
  'show-eq': w('show equation', 'how-to-use', 'The = beside a number shows its equation, with your values put in.'),
  math: w('the equations', 'how-to-use', 'Point at or tap a variable: its part, node or readout row lights up.'),
  goal: w('the goal', 'how-good-is-a-match', 'The solver’s goal; by default the centre, within |Γ| 0.2 (VSWR 1.5).'),
  // M4.3a, the Solve panel (linked to the solver's own topics since M4.3c).
  'solve-mark': w('Solve for', 'two-one-or-none', 'Leave this value to the solver: it finds what meets the goal.'),
  'solve-free': w('L or C', 'realisable-values', 'An L adds +jx, a C −jx: the answer’s sign picks the kind.'),
  'solve-goal': w('the solver’s goal', 'two-one-or-none', 'Where it must hold, and a point or a circle to reach there.'),
  'solve-count': w('how many answers', 'one-value-and-a-point', 'A point needs two free values; a circle needs one.'),
  'solve-apply': w('Apply', 'how-to-use', 'Puts these values in the circuit as one step; Undo takes it back.'),
  // M4.3c: the solutions, the circles, the family, the standard values and their lists.
  'solve-solution': w('a solution', 'two-one-or-none', 'Values that meet the goal, and the |Γ| they give at its node.'),
  'solve-circles': w('the circles on the chart', 'two-one-or-none', 'Each unknown moves a node on a circle; answers are where they cross.'),
  'solve-family': w('the family slider', 'two-one-or-none', 'Slide the first value; the second follows to keep the goal.'),
  'solve-variant': w('standard-value variants', 'realisable-values', 'The nearest standard values, and how far they move the input.'),
  'solve-lists': w('Standard values', 'realisable-values', 'The values parts come in, per kind; drags and variants use them.'),
  // M4.4b: the suggestions when nothing is marked.
  'solve-suggest': w('the suggestions', 'one-value-and-a-point', 'One changed value reaches a point only by chance; two reach it exactly.'),
  'list-R': w('the R list', 'realisable-values', 'E series of IEC 60063; E24 parts usually 5 %, E96 1 %.'),
  'list-L': w('the L list', 'realisable-values', 'Chip inductors come in makers’ own lists (1.9 nH): paste yours.'),
  'list-C': w('the C list', 'realisable-values', 'E series; RF chip capacitors below 10 pF have tolerances in pF.'),
  'list-Z': w('the Zt and Zc list', 'realisable-values', 'Any value by default; a list if your lines come in set impedances.'),
};

/** The key of a value field's line by its form (state.ts FormId). */
export const FIELD_WHY: Readonly<Record<string, string>> = {
  R: 'field-value', L: 'field-value', C: 'field-value', G: 'field-value', X: 'field-at-f0', B: 'field-at-f0',
  n: 'field-normalised', len: 'field-length', deg: 'field-length', zc: 'field-zc', zt: 'field-zc',
};
