// The texts of the EM simulation page's status note (Status.tsx), apart so the harness (ui-release.mjs) can read them
// without the page's styles. Every step that changes what the page does keeps them true: this is the one place they live.

/** The short lines, always shown. */
export const STATUS_LEAD = 'New, with everything planned for now in place.';
export const STATUS_NOW =
  'It works out the impedance of PCB traces and vias with field solvers, on a stackup you type, any of JLCPCB’s ' +
  'stackups or the stackup and net classes of a KiCad board. Traces: microstrip, stripline, coplanar lines, edge- and ' +
  'broadside-coupled pairs or any arrangement of traces and planes, each result with the solver’s error; drag the ' +
  'sizes, see the fields, find the width for a target, sweep an input, see which tolerance matters most, and compare ' +
  'with closed-form calculators and JLCPCB’s calculator. Vias and via pairs with their pads, antipads, return vias, ' +
  'backdrill and feeds, drawn from the side, from above and in 3D, with their impedance, TDR, S-parameters, stub ' +
  'resonance and fields, and the antipad or return-via distance for a target. Full-wave (FDTD) runs of a via or a ' +
  'trace section, with their TDR and S-parameters beside the model’s and their waves played on a slice and in 3D. ' +
  'Theory with your numbers in its equations and their derivations, five worked examples, figures for LaTeX (TikZ), ' +
  'SVG and PNG, CSV, Touchstone, a project file and a printable report.';
export const STATUS_CHECKED =
  'Checked by automated tests against exact solutions, a separate finite-difference solver on hundreds of random ' +
  'structures, JLCPCB’s own calculator (within about 0.3 %) and, for vias and full-wave runs, openEMS, a separate ' +
  'full-wave solver; and the page in Edge, Firefox and Safari’s engine, by keyboard and by touch, and for its speed ' +
  'and memory. The numbers are a careful estimate; for an order, your board house’s own figures have the last word.';
/** Behind "More". */
export const STATUS_ASSUMES =
  'Apart from the full-wave runs it is quasi-static: no losses and no change with frequency; a via is lines and lumped ' +
  'capacitances, right while its parts are short against the wavelength (the Via section says up to which frequency). ' +
  'The tolerances are placeholders until you type the ones of your board house.';
export const STATUS_COMING =
  'Not here: copper losses (the laminate’s only in full-wave runs) and how εr changes with frequency, reading routed boards, simulating drivers and receivers in ' +
  'time, and measured data; they may come later. On a slow device a drag can fall a little behind the pointer. ' +
  'Full-wave runs use the graphics card through WebGPU where the browser offers it (Edge and Chrome, for example), and the CPU, ' +
  'often a hundred times slower, where not.';
