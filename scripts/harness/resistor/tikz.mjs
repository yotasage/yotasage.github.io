// TikZ samples of the flat drawings, without the page: `npm run tikz -- <folder>` writes an axial and a chip sample
// as .tex files that compile as they are (pdflatex or lualatex, if installed, is run by hand or by the caller).

import fs from 'node:fs';
import path from 'node:path';

import * as imported from '../../../lib/resistor/index.ts';

const lib = imported.default ?? imported;
const { AXIAL_BODIES, CHIP_SIZES, encodeBands, tikzAxial, tikzChip } = lib;

const folder = process.argv[2];
if (!folder) {
  console.error('Give a folder to write to, outside the repo.');
  process.exit(1);
}
fs.mkdirSync(folder, { recursive: true });

const code = encodeBands(4700, 4, 5);
const axial = tikzAxial(code.bands.map((b) => b.colour), AXIAL_BODIES[1], 'beige', {
  title: 'Resistor 4k7 5 %, axial 1/4 W',
  caption: ['4.7 kΩ ±5 %', 'yellow · violet · red · gold', `${AXIAL_BODIES[1].rating} axial, ${AXIAL_BODIES[1].length} × ${AXIAL_BODIES[1].diameter} mm`],
  bandNotes: code.bands.map((b) => b.meaning),
});
const size = CHIP_SIZES.find((c) => c.imperial === '0805');
const chip = tikzChip(size, '4701', {
  title: 'Resistor 4k7 1 %, chip 0805',
  caption: ['4.7 kΩ ±1 %', 'marking 4701', '0805 (2012 metric), 2 × 1.25 mm'],
});

fs.writeFileSync(path.join(folder, 'tikz-axial-4k7.tex'), axial.document);
fs.writeFileSync(path.join(folder, 'tikz-chip-0805-4701.tex'), chip.document);
console.log(`tikz: wrote tikz-axial-4k7.tex (${axial.width.toFixed(1)} mm wide, ${axial.enlarged}x) and tikz-chip-0805-4701.tex (${chip.width.toFixed(1)} mm wide, ${chip.enlarged}x) to ${folder}`);
