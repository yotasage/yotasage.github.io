// The texts of the EM simulation page's status note (Status.tsx), apart so the harness (ui-release.mjs) can read them
// without the page's styles. Every step that changes what the page does keeps them true: this is the one place they live.

/** The short lines, always shown. */
export const STATUS_LEAD = 'New and still growing.';
export const STATUS_NOW =
  'It works out the impedance of PCB traces with a 2D field solver, on a stackup you type, any of JLCPCB’s stackups ' +
  'or the stackup and net classes of a KiCad board: microstrip, stripline, coplanar lines, edge- and broadside-coupled ' +
  'pairs or any arrangement of traces and planes, each result with the solver’s error. Drag the sizes in the drawing, ' +
  'see the fields, find the width for a target, sweep an input, see which tolerance matters most, compare with ' +
  'closed-form calculators and with the inputs JLCPCB’s calculator uses, read the theory of traces and vias with your ' +
  'numbers in its equations, and follow five worked examples whose links open each state on the page; every result ' +
  'with an equation opens it with your numbers in one click, with its derivation step by step. Type a via or a via ' +
  'pair with its pads, antipads, return vias, backdrill and feeds, see it drawn to scale from the side and from above, ' +
  'drag its sizes and return vias in the drawings, turn it in 3D with its fields on the cut planes, ' +
  'with the impedance of its barrel and of the whole via, the extra capacitance of each pad and plane, the stub ' +
  'resonance, its TDR and TDT at the rise time you choose and its S-parameters in dB (mixed-mode for a pair), its ' +
  'fields from the side and from above with a probe, the antipad or return-via distance for a target impedance, and ' +
  'what to watch out for. Export any of these drawings, field maps and plots as TikZ, SVG or PNG at the width of your ' +
  'document, in colour, grey or black and white, and the numbers behind the results as CSV, the via’s S-parameters as ' +
  'Touchstone, the whole setup as a project file to open again or drop on the page, and a printable report of it all ' +
  'on A4 or Letter.';
export const STATUS_CHECKED =
  'Checked by automated tests against exact solutions, against a separate finite-difference solver on hundreds of ' +
  'random structures and against JLCPCB’s own calculator (within about 0.3 %), and the page in the browser. The ' +
  'numbers are a careful estimate; for an order, your board house’s own figures have the last word.';
/** Behind "More". */
export const STATUS_ASSUMES =
  'It is quasi-static: no losses and no change with frequency; a via is lines and lumped capacitances, right while ' +
  'its parts are short against the wavelength. The tolerances are placeholders until you type the ones of your board house.';
export const STATUS_COMING =
  'Not here yet: animated waves from a full-wave run; they come next.';
