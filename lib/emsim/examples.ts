// The EM simulation's worked examples as data (step M4.2; text in docs/em-sim/examples.md, numbers checked against the
// engine by scripts/harness/emsim/check-teach.mjs). Each example: its id (the anchor), title, intro, the links that
// open its states (path + encodeLink of the setup its recipe names), the steps with the numbers they quote (the
// engine key each comes from, in the unit shown, to the decimals shown) and the theory topics it uses. Framework-free;
// no engine import (M4.3's Examples section renders these).

export interface ExampleLink {
  /** The stable key (data-example-link, the harness). */
  name: string;
  /** What the link opens, for the visitor: the link reads “Open ” + label. */
  label: string;
  recipe: string;
  link: string;
}
export interface ExampleValue {
  /** The number as the text shows it, in `unit`. */
  value: number;
  /** Decimals shown: the engine's value rounds to it. */
  digits: number;
  unit: string;
  /** The engine's value (check-teach.mjs resolves it on the setup of `link`). */
  key: string;
  link: string;
}
export interface ExampleStep { text: string; values: ExampleValue[]; claims: number[] }
export interface Example { id: string; title: string; intro: string; links: ExampleLink[]; steps: ExampleStep[]; topics: string[] }

export const EXAMPLE_PATH = '/em-sim/main?';

const v = (link: string, key: string, value: number, digits: number, unit: string): ExampleValue => ({ value, digits, unit, key, link });

export const EXAMPLES: readonly Example[] = [
  {
    id: 'ex-microstrip', title: 'A 50 Ω microstrip on JLC061611-3313A',
    intro: 'A 0.1377 mm (5.42 mil) trace on L1 over the plane L2 of JLC061611-3313A, under solder mask: the width JLCPCB’s online calculator gives for 50 Ω on this stackup. What does the field solver say, and why does it differ?',
    links: [
      { name: 'stackup', label: 'the 0.1377 mm trace', recipe: 'defaultSetup()', link: "/em-sim/main?v=1" },
      { name: 'w50', label: 'the width for 50 Ω (0.1465 mm)', recipe: 'the default with w 0.1465 mm', link: "/em-sim/main?v=1&t=(k:microstrip,l:L1,b:L2,w:0.1465)" },
      { name: 'calc', label: 'with JLCPCB’s calculator inputs', recipe: 'asJlcpcbCalculator(defaultSetup()).setup', link: "/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))" },
    ],
    steps: [
      { text: 'Open the 0.1377 mm trace. The Trace results show Z0 51.50 ± 0.05 Ω, εeff 3.298 and 6.058 ps/mm.', claims: [206],
        values: [v('stackup', 'lines[0].z0', 51.50, 2, 'Ω'), v('stackup', 'lines[0].z0.e', 0.05, 2, 'Ω'), v('stackup', 'lines[0].eeff', 3.298, 3, ''), v('stackup', 'lines[0].delay', 6.058, 3, 'ps/mm')] },
      { text: 'In Tools, Target 50 Ω by width: 0.1465 mm (5.77 mil); the link for 0.1465 mm has it and reads 50.01 Ω, so the 5.42 mil trace is 3 % above 50 Ω on the stackup’s own values, well inside JLCPCB’s ±10 %.', claims: [207, 208],
        values: [v('stackup', 'inverse(z0,50,w).w', 0.1465, 4, 'mm'), v('stackup', 'inverse(z0,50,w).w.mil', 5.77, 2, 'mil'), v('w50', 'lines[0].z0', 50.01, 2, 'Ω')] },
      { text: 'Switch the Calculators panel to “as JLCPCB’s calculator”, or open the link with JLCPCB’s calculator inputs: 50.06 ± 0.06 Ω at the same 0.1377 mm (εeff 3.363); Si9000 gave 49.958 Ω, 0.20 % below. Its Target 50 Ω gives 5.435 mil.', claims: [209, 210, 211, 212],
        values: [v('calc', 'lines[0].z0', 50.06, 2, 'Ω'), v('calc', 'lines[0].z0.e', 0.06, 2, 'Ω'), v('calc', 'lines[0].eeff', 3.363, 3, ''), v('calc', 'inverse(z0,50,w).w.mil', 5.435, 3, 'mil')] },
      { text: 'Example 4 takes the 1.44 Ω between the two apart.', claims: [], values: [v('stackup', 'calc.total', 1.44, 2, 'Ω')] },
    ],
    topics: ['transmission-lines', 'field-solver', 'solder-mask', 'trapezoid', 'jlcpcb-calculator', 'tolerances'],
  },
  {
    id: 'ex-lvds-pair', title: 'A 100 Ω LVDS pair',
    intro: 'Two 0.11 mm traces 0.2 mm apart on L1 over L2 of the same stackup, the widths JLCPCB’s calculator gives for 100 Ω differential (4.36 / 8 mil) as drawn in millimetres.',
    links: [
      { name: 'pair', label: 'the pair at 0.11 / 0.2 mm', recipe: "the default stackup, presetStructure('pair-microstrip', stackup, 0.11) (gap 0.2)", link: "/em-sim/main?v=1&t=(k:pair-microstrip,l:L1,b:L2,w:0.11)" },
      { name: 'w100', label: 'the width for 100 Ω (0.1191 mm)', recipe: 'the same with w 0.1191 mm', link: "/em-sim/main?v=1&t=(k:pair-microstrip,l:L1,b:L2,w:0.1191)" },
      { name: 'calc', label: 'the pair with JLCPCB’s calculator inputs', recipe: 'asJlcpcbCalculator(pair).setup', link: "/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&t=(k:pair-microstrip,l:L1,b:L2,w:0.11)&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))" },
    ],
    steps: [
      { text: 'Open the pair at 0.11 / 0.2 mm: Zdiff 103.36 ± 0.15 Ω, Zcm 30.91 Ω.', claims: [213],
        values: [v('pair', 'pair.zdiff', 103.36, 2, 'Ω'), v('pair', 'pair.zdiff.e', 0.15, 2, 'Ω'), v('pair', 'pair.zcm', 30.91, 2, 'Ω')] },
      { text: 'Zodd is 51.68 Ω, exactly half of Zdiff, and Zeven 61.82 Ω, twice Zcm: for a symmetric pair Zdiff = 2·Zodd.', claims: [214],
        values: [v('pair', 'pair.zodd', 51.68, 2, 'Ω'), v('pair', 'pair.zeven', 61.82, 2, 'Ω')] },
      { text: 'Zdiff is not twice a lone trace’s Z0: one 0.11 mm trace alone is 56.90 Ω. The neighbour takes 10.4 Ω off: Zc11 = 56.75 Ω and Zc12 = 5.07 Ω, and Zdiff = Zc11 + Zc22 − 2·Zc12.', claims: [215],
        values: [v('pair', 'lone.z0', 56.90, 2, 'Ω'), v('pair', 'Zc[0][0]', 56.75, 2, 'Ω'), v('pair', 'Zc[0][1]', 5.07, 2, 'Ω')] },
      { text: 'Target Zdiff 100 Ω by width at the 0.2 mm gap: 0.1191 mm (4.69 mil); the link for 0.1191 mm reads 100.01 Ω.', claims: [216],
        values: [v('pair', 'inverse(zdiff,100,w).w', 0.1191, 4, 'mm'), v('pair', 'inverse(zdiff,100,w).w.mil', 4.69, 2, 'mil'), v('w100', 'pair.zdiff', 100.01, 2, 'Ω')] },
      { text: '“As JLCPCB’s calculator” (the link with JLCPCB’s calculator inputs): 100.01 ± 0.53 Ω at 0.11 / 0.2 mm; Si9000 gave 99.951 Ω at 4.356 / 8 mil.', claims: [217],
        values: [v('calc', 'pair.zdiff', 100.01, 2, 'Ω'), v('calc', 'pair.zdiff.e', 0.53, 2, 'Ω')] },
      { text: 'The two modes travel at different speeds: εeff 3.08 (odd) and 3.44 (even), 5.86 and 6.18 ps/mm.', claims: [218],
        values: [v('pair', 'modes.odd.eeff', 3.08, 2, ''), v('pair', 'modes.even.eeff', 3.44, 2, ''), v('pair', 'modes.odd.delay', 5.86, 2, 'ps/mm'), v('pair', 'modes.even.delay', 6.18, 2, 'ps/mm')] },
    ],
    topics: ['pairs', 'pair-definitions', 'coupling', 'two-speeds', 'calculators'],
  },
  {
    id: 'ex-via-pair', title: 'The LVDS pair’s via',
    intro: 'The pair of Example 2 changes from L1 to L6 through two vias: drill 0.22 mm, pads Ø0.5 on L1 and L6 only, pitch 0.7 mm, a stadium antipad 1.22 × 1.92 mm on the planes L2 and L5, and six ground vias around them.',
    links: [
      { name: 'via', label: 'the via pair (2 mm feeds)', recipe: "pair with presetVia('pair', stackup) (2 mm feeds)", link: "/em-sim/main?v=1&t=(k:pair-microstrip,l:L1,b:L2,w:0.11)&via=(st:L1,en:L6,in:L1,out:L6,dr:0.22,pl:0.02,pi:0.7,pd:!(!(L1,0.5),!(L2,!n),!(L3,!n),!(L4,!n),!(L5,!n),!(L6,0.5)),pn:!(L2,L5),ap:!(!(L2,1.22,oblong),!(L5,1.22,oblong)),rv:!(!(0.67,-0.47,0.2,0.4,!(L2,L5)),!(-0.67,-0.47,0.2,0.4,!(L2,L5)),!(0,-0.81,0.2,0.4,!(L2,L5)),!(0.67,1.17,0.2,0.4,!(L2,L5)),!(-0.67,1.17,0.2,0.4,!(L2,L5)),!(0,1.51,0.2,0.4,!(L2,L5))),fd:!(!(L1,2,270),!(L6,2,90)))" },
      { name: 'long', label: 'the via pair with 25 mm feeds', recipe: 'the same with 25 mm feeds', link: "/em-sim/main?v=1&t=(k:pair-microstrip,l:L1,b:L2,w:0.11)&via=(st:L1,en:L6,in:L1,out:L6,dr:0.22,pl:0.02,pi:0.7,pd:!(!(L1,0.5),!(L2,!n),!(L3,!n),!(L4,!n),!(L5,!n),!(L6,0.5)),pn:!(L2,L5),ap:!(!(L2,1.22,oblong),!(L5,1.22,oblong)),rv:!(!(0.67,-0.47,0.2,0.4,!(L2,L5)),!(-0.67,-0.47,0.2,0.4,!(L2,L5)),!(0,-0.81,0.2,0.4,!(L2,L5)),!(0.67,1.17,0.2,0.4,!(L2,L5)),!(-0.67,1.17,0.2,0.4,!(L2,L5)),!(0,1.51,0.2,0.4,!(L2,L5))),fd:!(!(L1,25,270),!(L6,25,90)))" },
    ],
    steps: [
      { text: 'Open the via pair. The barrel’s Zdiff is 92.23 Ω in the 0.865 mm core and 97.16 Ω in the 3313 prepreg.', claims: [219],
        values: [v('via', 'pieces[D4].zdiff', 92.23, 2, 'Ω'), v('via', 'pieces[D1].zdiff', 97.16, 2, 'Ω')] },
      { text: 'The section as one element is 83.49 Ω differential, 36.63 Ω common, 12.59 ps; each via’s pads and openings add 54.0 fF.', claims: [220],
        values: [v('via', 'lumped.zdiff', 83.49, 2, 'Ω'), v('via', 'lumped.zcm', 36.63, 2, 'Ω'), v('via', 'lumped.delay', 12.59, 2, 'ps'), v('via', 'lumped.dCsum', 54.0, 1, 'fF')] },
      { text: 'Target Zdiff 100 Ω by the antipad: out of reach, from 83.49 Ω at 1.22 mm to 99.88 Ω at 3.27 mm, the widest the search tries. The pads on L1 and L6, 31.5 fF per via, stay whatever the antipad. 85 Ω is in reach, at Ø1.375 mm.', claims: [221, 222, 223],
        values: [v('via', 'viaTarget(zdiff,100,antipad).values[1]', 99.88, 2, 'Ω'), v('via', 'viaTarget(zdiff,100,antipad).range[1]', 3.27, 2, 'mm'), v('via', 'nodes[L1].dC', 31.5, 1, 'fF'), v('via', 'viaTarget(zdiff,85,antipad).x', 1.375, 3, 'mm')] },
      { text: 'The differential TDR at 35 ps against 100 Ω dips to 91.59 Ω with the 2 mm feeds; open the via pair with 25 mm feeds: flat at the feeds’ 103.36 Ω, a dip to 91.65 Ω at the via.', claims: [224],
        values: [v('via', 'tdr.min', 91.59, 2, 'Ω'), v('long', 'tdr.flat', 103.36, 2, 'Ω'), v('long', 'tdr.min', 91.65, 2, 'Ω')] },
      { text: 'Change the rise time to 15 ps: the dip deepens to 88.29 Ω; at 100 ps it is 97.99 Ω.', claims: [225],
        values: [v('long', 'tdr15.min', 88.29, 2, 'Ω'), v('long', 'tdr100.min', 97.99, 2, 'Ω')] },
      { text: 'Sdd21 at 10 GHz is −0.05 dB and Sdd11 −19.4 dB; Scd21 is rounding noise, since the pair is symmetric.', claims: [226],
        values: [v('via', 'mixed.dB(1,0)@10GHz', -0.05, 2, 'dB'), v('via', 'mixed.dB(0,0)@10GHz', -19.4, 1, 'dB')] },
    ],
    topics: ['via-line', 'via-pads', 'via-return', 'via-tdr', 'via-sparams', 'via-limits'],
  },
  {
    id: 'ex-jlcpcb-widths', title: 'JLCPCB’s widths explained',
    intro: 'JLCPCB’s calculator says 5.42 mil is 50 Ω on JLC061611-3313A; the tool says 51.50 Ω. Change the inputs one at a time from JLCPCB’s to the stackup’s and watch where the 1.44 Ω comes from.',
    links: [
      { name: 'stackup', label: 'the 0.1377 mm trace', recipe: 'defaultSetup()', link: "/em-sim/main?v=1" },
      { name: 'calc', label: 'with JLCPCB’s calculator inputs', recipe: 'asJlcpcbCalculator(defaultSetup()).setup', link: "/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))" },
      { name: 'er', label: 'JLCPCB’s inputs with the stackup’s εr', recipe: "jlcAllBut(defaultSetup(), 'er')", link: "/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.1,3)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(3.91,3)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(3.91,3)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.1,3)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))" },
      { name: 'copper', label: 'JLCPCB’s inputs with the stackup’s copper', recipe: "jlcAllBut(defaultSetup(), 'copper')", link: "/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.035,2),ct:!(0.04064,3),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,2),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,2),ct:!(0.030479999999999997,3),e:!(o,!(0.008889999999999999,3))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,2),er:!(4.17,2)),(k:c,id:L3,t:!(0.03,2),ct:!(0.030479999999999997,3),e:!(o,!(0.008889999999999999,3))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,2),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,2),er:!(4.55,2)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,2),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,2),ct:!(0.030479999999999997,3),e:!(o,!(0.008889999999999999,3))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,2),er:!(4.17,2)),(k:c,id:L5,t:!(0.03,2),ct:!(0.030479999999999997,3),e:!(o,!(0.008889999999999999,3))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,2),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.035,2),ct:!(0.04064,3),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:A),(k:p,id:JLC061611-3313A,r:U2))" },
      { name: 'etch', label: 'JLCPCB’s inputs with the stackup’s etch', recipe: "jlcAllBut(defaultSetup(), 'etch')", link: "/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.008889999999999999,2))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.0254,1),c2:!(0.015239999999999998,0),c3:!(0.0254,1))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))" },
      { name: 'mask', label: 'JLCPCB’s inputs with the stackup’s mask', recipe: "jlcAllBut(defaultSetup(), 'mask')", link: "/em-sim/main?v=1&s=(id:JLC061611-3313A,n:'JLCPCB%20JLC061611-3313A:%206%20layers,%201.6%20mm,%201%20oz%20outer,%201%20oz%20inner',l:!((k:m,id:MT,n:'Top%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.030479999999999997,0),c2:!(0.015239999999999998,0),c3:!(0.030479999999999997,0)),(k:c,id:L1,n:'L1%20(top)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:d,id:D1,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L2,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D2,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L3,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D3,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:d,id:D4,n:'Core%20FR-4%20core,%20etched%20bare%20(NP-155F)',r:c,mat:'FR-4%20core,%20etched%20bare%20(NP-155F)',t:!(0.865,3),er:!(4.55,3)),(k:d,id:D5,n:'Prepreg%201080',r:p,mat:'1080',t:!(0.069,3),er:!(4.3,1)),(k:c,id:L4,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D6,n:'Core%20FR-4%20core%20(NP-155F)',r:c,mat:'FR-4%20core%20(NP-155F)',t:!(0.13,3),er:!(4.17,3)),(k:c,id:L5,t:!(0.03,3),ct:!(0.030479999999999997,2),e:!(o,!(0.008889999999999999,2))),(k:d,id:D7,n:'Prepreg%203313',r:p,mat:'3313',t:!(0.092,3),er:!(4.3,1)),(k:c,id:L6,n:'L6%20(bottom)',t:!(0.04064,1),ct:!(0.04064,2),e:!(o,!(0.00635,1))),(k:m,id:MB,n:'Bottom%20mask',mat:'LPI%20solder%20mask',er:!(3.8,0),c1:!(0.030479999999999997,0),c2:!(0.015239999999999998,0),c3:!(0.030479999999999997,0))))&src=!((k:p,id:JLC061611-3313A,r:U1),(k:p,id:JLC061611-3313A,r:S),(k:p,id:JLC061611-3313A,r:U2),(k:p,id:JLC061611-3313A,r:A))" },
    ],
    steps: [
      { text: 'Open the link with JLCPCB’s calculator inputs: the calculator sends εr 4.3 for the prepreg, 1.6 mil outer copper, a top 0.5 mil narrower than the base and mask 1.0 / 0.6 / 1.0 mil at εr 3.8; with these the tool gives 50.06 Ω.', claims: [227, 228],
        values: [v('calc', 'lines[0].z0', 50.06, 2, 'Ω')] },
      { text: 'Open JLCPCB’s inputs with the stackup’s εr: the prepreg’s own εr 4.1 gives 51.00 Ω, +0.94 Ω.', claims: [229], values: [v('er', 'lines[0].z0', 51.00, 2, 'Ω'), v('stackup', 'calc.parts.er', 0.94, 2, 'Ω')] },
      { text: 'With the stackup’s copper: 0.035 mm copper instead of 1.6 mil, 50.57 Ω, +0.51 Ω.', claims: [230], values: [v('copper', 'lines[0].z0', 50.57, 2, 'Ω'), v('stackup', 'calc.parts.copper', 0.51, 2, 'Ω')] },
      { text: 'With the stackup’s etch: 0.35 mil per side instead of 0.25, 50.30 Ω, +0.25 Ω.', claims: [231], values: [v('etch', 'lines[0].z0', 50.30, 2, 'Ω'), v('stackup', 'calc.parts.etch', 0.25, 2, 'Ω')] },
      { text: 'With the stackup’s mask: 1.2 mil of mask instead of 1.0, 49.79 Ω, −0.27 Ω.', claims: [232], values: [v('mask', 'lines[0].z0', 49.79, 2, 'Ω'), v('stackup', 'calc.parts.mask', -0.27, 2, 'Ω')] },
      { text: 'The four add up to +1.43 Ω against the whole +1.44 Ω: the parts barely interact. For the pair of Example 2 the same parts are +1.70, +1.63, +0.73 and −0.73 Ω, 3.33 Ω against the whole 3.36 Ω.', claims: [233, 234],
        values: [v('stackup', 'calc.sum', 1.43, 2, 'Ω'), v('stackup', 'calc.total', 1.44, 2, 'Ω'), v('ex-lvds-pair/pair', 'calc.parts.er', 1.70, 2, 'Ω'), v('ex-lvds-pair/pair', 'calc.parts.copper', 1.63, 2, 'Ω'), v('ex-lvds-pair/pair', 'calc.parts.etch', 0.73, 2, 'Ω'), v('ex-lvds-pair/pair', 'calc.parts.mask', -0.73, 2, 'Ω'), v('ex-lvds-pair/pair', 'calc.sum', 3.33, 2, 'Ω'), v('ex-lvds-pair/pair', 'calc.total', 3.36, 2, 'Ω')] },
      { text: 'On the same inputs the two solvers agree within 0.2 %; the 3 % comes from the inputs, mostly εr: the stackup lists 4.1 for the 3313 prepreg, the calculator sends 4.3.', claims: [235], values: [] },
    ],
    topics: ['jlcpcb-calculator', 'calculators', 'solder-mask', 'trapezoid', 'copper-thickness'],
  },
  {
    id: 'ex-via-stub', title: 'A 0.6/0.3 via: the line, a stub and backdrill',
    intro: 'A through via of 0.3 mm drill with 0.6 mm pads on every layer, antipads Ø1.8 on L2 and L5 and two ground vias 0.8 mm away, between 50 Ω microstrips on L1 and L6. Then the signal leaves on L3 instead, and the rest of the barrel is a stub.',
    links: [
      { name: 'through', label: 'the through via', recipe: 'defaultSetup() with 25 mm feeds', link: "/em-sim/main?v=1&via=(st:L1,en:L6,in:L1,out:L6,dr:0.3,pl:0.02,pd:!(!(L1,0.6),!(L2,0.6),!(L3,0.6),!(L4,0.6),!(L5,0.6),!(L6,0.6)),pn:!(L2,L5),ap:!(!(L2,1.8,round),!(L5,1.8,round)),rv:!(!(0,0.8,0.3,0.6,!(L2,L5)),!(0,-0.8,0.3,0.6,!(L2,L5))),fd:!(!(L1,25,180),!(L6,25,0)))" },
      { name: 'stub', label: 'the via with a stub', recipe: 'defaultSetup() with the exit on L3 and only the L1 feed', link: "/em-sim/main?v=1&via=(st:L1,en:L6,in:L1,out:L3,dr:0.3,pl:0.02,pd:!(!(L1,0.6),!(L2,0.6),!(L3,0.6),!(L4,0.6),!(L5,0.6),!(L6,0.6)),pn:!(L2,L5),ap:!(!(L2,1.8,round),!(L5,1.8,round)),rv:!(!(0,0.8,0.3,0.6,!(L2,L5)),!(0,-0.8,0.3,0.6,!(L2,L5))),fd:!(!(L1,2,180)))" },
      { name: 'backdrill', label: 'the stub backdrilled', recipe: 'stub backdrilled from the bottom, 1.2 mm deep, Ø0.5', link: "/em-sim/main?v=1&via=(st:L1,en:L6,in:L1,out:L3,dr:0.3,pl:0.02,pd:!(!(L1,0.6),!(L2,0.6),!(L3,0.6),!(L4,0.6),!(L5,0.6),!(L6,0.6)),pn:!(L2,L5),ap:!(!(L2,1.8,round),!(L5,1.8,round)),bd:!(bottom,1.2,0.5),rv:!(!(0,0.8,0.3,0.6,!(L2,L5)),!(0,-0.8,0.3,0.6,!(L2,L5))),fd:!(!(L1,2,180)))" },
    ],
    steps: [
      { text: 'Open the through via. The barrel is 59.71 Ω in the core, but the section as one element is 50.23 Ω, 13.55 ps: the pads and planes add 90.0 fF to 179.8 fF of barrel.', claims: [236],
        values: [v('through', 'pieces[D4].z0', 59.71, 2, 'Ω'), v('through', 'lumped.z', 50.23, 2, 'Ω'), v('through', 'lumped.delay', 13.55, 2, 'ps'), v('through', 'lumped.dCsum', 90.0, 1, 'fF'), v('through', 'lumped.lineC', 179.8, 1, 'fF')] },
      { text: 'The TDR at 35 ps is flat at the feeds’ 51.50 Ω and dips to 50.81 Ω at the via; at 15 ps the pads (48.54 Ω) and the barrel (55.32 Ω) show apart. Target 50 Ω by the antipad: Ø1.758 mm.', claims: [237, 238],
        values: [v('through', 'tdr.flat', 51.50, 2, 'Ω'), v('through', 'tdr.min', 50.81, 2, 'Ω'), v('through', 'tdr15.min', 48.54, 2, 'Ω'), v('through', 'tdr15.max', 55.32, 2, 'Ω'), v('through', 'viaTarget(z,50,antipad).x', 1.758, 3, 'mm')] },
      { text: 'Open the via with a stub: the barrel below L3 is a 1.335 mm stub (9.19 ps). Its bare quarter wave is 27.2 GHz; with its pads it resonates at 21.8 GHz, inside the 25.0 GHz band. At 10 GHz S21 is already −0.67 dB and S11 −8.4 dB.', claims: [239, 240],
        values: [v('stub', 'stubs[long].length', 1.335, 3, 'mm'), v('stub', 'stubs[long].delay', 9.19, 2, 'ps'), v('stub', 'stubs[long].fFormula', 27.2, 1, 'GHz'), v('stub', 'stubs[long].fRes', 21.8, 1, 'GHz'), v('stub', 'band', 25.0, 1, 'GHz'), v('stub', 'S.dB(1,0)@10GHz', -0.67, 2, 'dB'), v('stub', 'S.dB(0,0)@10GHz', -8.4, 1, 'dB')] },
      { text: 'Open the stub backdrilled: 0.165 mm of stub is left, resonating near 215 GHz; at 10 GHz S21 is −0.07 dB and S11 −18.1 dB, and the stub flag is gone.', claims: [241],
        values: [v('backdrill', 'stubs[long].fRes', 215, 0, 'GHz'), v('backdrill', 'stubs[long].length', 0.165, 3, 'mm'), v('backdrill', 'S.dB(1,0)@10GHz', -0.07, 2, 'dB'), v('backdrill', 'S.dB(0,0)@10GHz', -18.1, 1, 'dB')] },
    ],
    topics: ['via-line', 'via-pads', 'via-stubs', 'via-tdr', 'via-sparams', 'via-limits'],
  },
];
