import type { PickedFile } from './load';

export type PcbExampleId =
  | 'mcu-4layer'
  | 'gerber-breakout'
  | 'kicad-rf-filter'
  | 'eagle-sensor'
  | 'kicad-psu';

export interface PcbExamplePreset {
  id: PcbExampleId;
  code: string;
}

export const PCB_EXAMPLE_PRESETS: readonly PcbExamplePreset[] = [
  { id: 'mcu-4layer', code: '.kicad_pcb · 4L' },
  { id: 'gerber-breakout', code: 'RS-274X + DRL + CSV' },
  { id: 'kicad-rf-filter', code: '.kicad_pcb · 2L RF' },
  { id: 'eagle-sensor', code: '.brd · EAGLE XML' },
  { id: 'kicad-psu', code: '.kicad_pcb · 2L PSU' },
];

// --- Gerber RS-274X + Excellon + Pick-and-Place Breakout (40 x 26 mm) ---

function gCoord(mm: number): string {
  return String(Math.round(mm * 10000));
}

function buildGerberBreakoutFiles(): { name: string; content: string }[] {
  const header = (fn: string) =>
    [
      '%TF.GenerationSoftware,yotasage,PcbExampleGen,1.0*%',
      `%TF.FileFunction,${fn}*%`,
      '%FSLAX44Y44*%',
      '%MOMM*%',
      '%LPD*%',
    ].join('\n');

  const gko = [
    header('Profile,NP'),
    '%ADD10C,0.1000*%',
    'D10*',
    `X${gCoord(0)}Y${gCoord(0)}D02*`,
    `X${gCoord(40)}Y${gCoord(0)}D01*`,
    `X${gCoord(40)}Y${gCoord(26)}D01*`,
    `X${gCoord(0)}Y${gCoord(26)}D01*`,
    `X${gCoord(0)}Y${gCoord(0)}D01*`,
    'M02*',
  ].join('\n');

  // Pin headers along left (J1: 4 pins at x=3.5) and right (J2: 4 pins at x=36.5), SOIC-8 U1 center (20, 13), R1/R2/C1
  const j1Y = [6, 8.54, 11.08, 13.62];
  const j2Y = [6, 8.54, 11.08, 13.62];
  const u1LeftX = 17.3;
  const u1RightX = 22.7;
  const u1PinY = [11.095, 12.365, 13.635, 14.905];

  const gtlLines = [
    header('Copper,L1,Top'),
    '%ADD10C,1.6000*%', // TH pad
    '%ADD11R,1.6000X0.6500*%', // SOIC pad
    '%ADD12R,0.9000X1.0000*%', // 0603 pad
    '%ADD13C,0.6000*%', // Via pad
    '%ADD14C,0.2500*%', // Signal trace
    '%ADD15C,0.5000*%', // Power trace
    'D10*',
    ...j1Y.map((y) => `X${gCoord(3.5)}Y${gCoord(y)}D03*`),
    ...j2Y.map((y) => `X${gCoord(36.5)}Y${gCoord(y)}D03*`),
    'D11*',
    ...u1PinY.map((y) => `X${gCoord(u1LeftX)}Y${gCoord(y)}D03*`),
    ...u1PinY.map((y) => `X${gCoord(u1RightX)}Y${gCoord(y)}D03*`),
    'D12*',
    // C1 decoupling cap above U1 at (20, 19.5)
    `X${gCoord(19.2)}Y${gCoord(19.5)}D03*`,
    `X${gCoord(20.8)}Y${gCoord(19.5)}D03*`,
    // R1 pullup at (11, 19.5)
    `X${gCoord(10.2)}Y${gCoord(19.5)}D03*`,
    `X${gCoord(11.8)}Y${gCoord(19.5)}D03*`,
    // R2 pullup at (29, 19.5)
    `X${gCoord(28.2)}Y${gCoord(19.5)}D03*`,
    `X${gCoord(29.8)}Y${gCoord(19.5)}D03*`,
    // Stitching vias
    'D13*',
    `X${gCoord(14)}Y${gCoord(6)}D03*`,
    `X${gCoord(26)}Y${gCoord(6)}D03*`,
    `X${gCoord(20)}Y${gCoord(22.5)}D03*`,
    // Traces (power)
    'D15*',
    `X${gCoord(3.5)}Y${gCoord(6)}D02*`,
    `X${gCoord(14)}Y${gCoord(6)}D01*`,
    `X${gCoord(17.3)}Y${gCoord(11.095)}D01*`,
    `X${gCoord(19.2)}Y${gCoord(19.5)}D02*`,
    `X${gCoord(19.2)}Y${gCoord(14.905)}D01*`,
    `X${gCoord(17.3)}Y${gCoord(14.905)}D01*`,
    // Traces (signals)
    'D14*',
    `X${gCoord(3.5)}Y${gCoord(8.54)}D02*`,
    `X${gCoord(11)}Y${gCoord(8.54)}D01*`,
    `X${gCoord(14)}Y${gCoord(12.365)}D01*`,
    `X${gCoord(17.3)}Y${gCoord(12.365)}D01*`,
    `X${gCoord(3.5)}Y${gCoord(11.08)}D02*`,
    `X${gCoord(12.5)}Y${gCoord(11.08)}D01*`,
    `X${gCoord(14.8)}Y${gCoord(13.635)}D01*`,
    `X${gCoord(17.3)}Y${gCoord(13.635)}D01*`,
    `X${gCoord(22.7)}Y${gCoord(11.095)}D02*`,
    `X${gCoord(30)}Y${gCoord(11.095)}D01*`,
    `X${gCoord(36.5)}Y${gCoord(8.54)}D01*`,
    `X${gCoord(22.7)}Y${gCoord(12.365)}D02*`,
    `X${gCoord(29.5)}Y${gCoord(12.365)}D01*`,
    `X${gCoord(36.5)}Y${gCoord(11.08)}D01*`,
    `X${gCoord(22.7)}Y${gCoord(13.635)}D02*`,
    `X${gCoord(28.2)}Y${gCoord(19.5)}D01*`,
    `X${gCoord(22.7)}Y${gCoord(14.905)}D02*`,
    `X${gCoord(31)}Y${gCoord(14.905)}D01*`,
    `X${gCoord(36.5)}Y${gCoord(13.62)}D01*`,
    'M02*',
  ];

  const gblLines = [
    header('Copper,L2,Bot'),
    '%ADD10C,1.6000*%',
    '%ADD13C,0.6000*%',
    '%ADD15C,0.6000*%',
    'D10*',
    ...j1Y.map((y) => `X${gCoord(3.5)}Y${gCoord(y)}D03*`),
    ...j2Y.map((y) => `X${gCoord(36.5)}Y${gCoord(y)}D03*`),
    'D13*',
    `X${gCoord(14)}Y${gCoord(6)}D03*`,
    `X${gCoord(26)}Y${gCoord(6)}D03*`,
    `X${gCoord(20)}Y${gCoord(22.5)}D03*`,
    'D15*',
    `X${gCoord(3.5)}Y${gCoord(6)}D02*`,
    `X${gCoord(14)}Y${gCoord(6)}D01*`,
    `X${gCoord(26)}Y${gCoord(6)}D01*`,
    `X${gCoord(36.5)}Y${gCoord(6)}D01*`,
    `X${gCoord(14)}Y${gCoord(6)}D02*`,
    `X${gCoord(20)}Y${gCoord(22.5)}D01*`,
    'M02*',
  ];

  const gtsLines = [
    header('Soldermask,Top'),
    '%ADD10C,1.7200*%',
    '%ADD11R,1.7200X0.7700*%',
    '%ADD12R,1.0200X1.1200*%',
    'D10*',
    ...j1Y.map((y) => `X${gCoord(3.5)}Y${gCoord(y)}D03*`),
    ...j2Y.map((y) => `X${gCoord(36.5)}Y${gCoord(y)}D03*`),
    'D11*',
    ...u1PinY.map((y) => `X${gCoord(u1LeftX)}Y${gCoord(y)}D03*`),
    ...u1PinY.map((y) => `X${gCoord(u1RightX)}Y${gCoord(y)}D03*`),
    'D12*',
    `X${gCoord(19.2)}Y${gCoord(19.5)}D03*`,
    `X${gCoord(20.8)}Y${gCoord(19.5)}D03*`,
    `X${gCoord(10.2)}Y${gCoord(19.5)}D03*`,
    `X${gCoord(11.8)}Y${gCoord(19.5)}D03*`,
    `X${gCoord(28.2)}Y${gCoord(19.5)}D03*`,
    `X${gCoord(29.8)}Y${gCoord(19.5)}D03*`,
    'M02*',
  ];

  const gtoLines = [
    header('Legend,Top'),
    '%ADD10C,0.1500*%',
    'D10*',
    // U1 outline box
    `X${gCoord(18.2)}Y${gCoord(10.2)}D02*`,
    `X${gCoord(21.8)}Y${gCoord(10.2)}D01*`,
    `X${gCoord(21.8)}Y${gCoord(15.8)}D01*`,
    `X${gCoord(18.2)}Y${gCoord(15.8)}D01*`,
    `X${gCoord(18.2)}Y${gCoord(10.2)}D01*`,
    // J1 header box
    `X${gCoord(2.2)}Y${gCoord(4.7)}D02*`,
    `X${gCoord(4.8)}Y${gCoord(4.7)}D01*`,
    `X${gCoord(4.8)}Y${gCoord(14.9)}D01*`,
    `X${gCoord(2.2)}Y${gCoord(14.9)}D01*`,
    `X${gCoord(2.2)}Y${gCoord(4.7)}D01*`,
    // J2 header box
    `X${gCoord(35.2)}Y${gCoord(4.7)}D02*`,
    `X${gCoord(37.8)}Y${gCoord(4.7)}D01*`,
    `X${gCoord(37.8)}Y${gCoord(14.9)}D01*`,
    `X${gCoord(35.2)}Y${gCoord(14.9)}D01*`,
    `X${gCoord(35.2)}Y${gCoord(4.7)}D01*`,
    'M02*',
  ];

  const drlLines = [
    'M48',
    'METRIC,TZ',
    'T1C0.900',
    'T2C0.300',
    'T3C2.200',
    '%',
    'T1',
    ...j1Y.map((y) => `X3.500Y${y.toFixed(3)}`),
    ...j2Y.map((y) => `X36.500Y${y.toFixed(3)}`),
    'T2',
    'X14.000Y6.000',
    'X26.000Y6.000',
    'X20.000Y22.500',
    'T3',
    'X3.500Y22.500',
    'X36.500Y22.500',
    'M30',
  ];

  const pnpCsv = [
    'Ref,Val,Package,PosX,PosY,Rot,Side',
    'U1,INA219,SOIC-8,20.000,13.000,0.0,top',
    'C1,100nF,C_0603,20.000,19.500,0.0,top',
    'R1,4.7k,R_0603,11.000,19.500,0.0,top',
    'R2,4.7k,R_0603,29.000,19.500,0.0,top',
    'J1,HDR-1x4,PinHeader_1x04_P2.54mm,3.500,9.810,0.0,top',
    'J2,HDR-1x4,PinHeader_1x04_P2.54mm,36.500,9.810,0.0,top',
  ].join('\n');

  return [
    { name: 'sensor-breakout-Edge_Cuts.gko', content: gko },
    { name: 'sensor-breakout-F_Cu.gtl', content: gtlLines.join('\n') },
    { name: 'sensor-breakout-B_Cu.gbl', content: gblLines.join('\n') },
    { name: 'sensor-breakout-F_Mask.gts', content: gtsLines.join('\n') },
    { name: 'sensor-breakout-F_SilkS.gto', content: gtoLines.join('\n') },
    { name: 'sensor-breakout-PTH.drl', content: drlLines.join('\n') },
    { name: 'sensor-breakout-pos.csv', content: pnpCsv },
  ];
}

// --- KiCad 9 Helpers ---

function kicad0603Footprint(
  ref: string,
  val: string,
  x: number,
  y: number,
  angle: number,
  net1: [number, string],
  net2: [number, string],
  id: number,
): string {
  return `\t(footprint "Resistor_SMD:R_0603_1608Metric"
\t\t(layer "F.Cu")
\t\t(uuid "f1000000-0000-4000-8000-${String(id).padStart(12, '0')}")
\t\t(at ${x} ${y}${angle ? ` ${angle}` : ''})
\t\t(property "Reference" "${ref}" (at 0 -1.43 0) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))
\t\t(property "Value" "${val}" (at 0 1.43 0) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))
\t\t(fp_line (start -0.24 -0.71) (end 0.24 -0.71) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
\t\t(fp_line (start -0.24 0.71) (end 0.24 0.71) (stroke (width 0.12) (type solid)) (layer "F.SilkS"))
\t\t(pad "1" smd roundrect (at -0.825 0 ${angle}) (size 0.8 0.95) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${net1[0]} "${net1[1]}"))
\t\t(pad "2" smd roundrect (at 0.825 0 ${angle}) (size 0.8 0.95) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25) (net ${net2[0]} "${net2[1]}"))
\t)`;
}

function kicadSmaFootprint(
  ref: string,
  x: number,
  y: number,
  angle: number,
  sigNet: [number, string],
  gndNet: [number, string],
  id: number,
): string {
  return `\t(footprint "Connector_Coaxial:SMA_EdgeLaunch"
\t\t(layer "F.Cu")
\t\t(uuid "f2000000-0000-4000-8000-${String(id).padStart(12, '0')}")
\t\t(at ${x} ${y}${angle ? ` ${angle}` : ''})
\t\t(property "Reference" "${ref}" (at 0 -4.8 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
\t\t(property "Value" "SMA 50R" (at 0 4.8 0) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
\t\t(pad "1" smd rect (at 0 0 ${angle}) (size 4.2 1.2) (layers "F.Cu" "F.Paste" "F.Mask") (net ${sigNet[0]} "${sigNet[1]}"))
\t\t(pad "2" smd rect (at 0 -2.6 ${angle}) (size 4.2 2.2) (layers "F.Cu" "F.Paste" "F.Mask") (net ${gndNet[0]} "${gndNet[1]}"))
\t\t(pad "2" smd rect (at 0 2.6 ${angle}) (size 4.2 2.2) (layers "F.Cu" "F.Paste" "F.Mask") (net ${gndNet[0]} "${gndNet[1]}"))
\t)`;
}

function kicadHeaderFootprint(
  ref: string,
  val: string,
  x: number,
  y: number,
  pins: [string, [number, string]][],
  id: number,
): string {
  const padLines = pins.map(
    ([num, net], idx) =>
      `\t\t(pad "${num}" thru_hole ${idx === 0 ? 'rect' : 'oval'} (at 0 ${(idx * 2.54).toFixed(2)}) (size 1.7 1.7) (drill 1.0) (layers "*.Cu" "*.Mask") (net ${net[0]} "${net[1]}"))`,
  );
  const h = (pins.length - 1) * 2.54;
  return `\t(footprint "Connector_PinHeader_2.54mm:PinHeader_1x${String(pins.length).padStart(2, '0')}_P2.54mm_Vertical"
\t\t(layer "F.Cu")
\t\t(uuid "f3000000-0000-4000-8000-${String(id).padStart(12, '0')}")
\t\t(at ${x} ${y})
\t\t(property "Reference" "${ref}" (at 0 -2.2 0) (layer "F.SilkS") (effects (font (size 0.9 0.9) (thickness 0.14))))
\t\t(property "Value" "${val}" (at 0 ${(h + 2.2).toFixed(2)} 0) (layer "F.Fab") (effects (font (size 0.9 0.9) (thickness 0.14))))
\t\t(fp_rect (start -1.3 -1.3) (end 1.3 ${(h + 1.3).toFixed(2)}) (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS"))
${padLines.join('\n')}
\t)`;
}

function buildKicadRfFilter(): string {
  const viaCoords: [number, number][] = [];
  for (let x = 104; x <= 146; x += 4.2) {
    viaCoords.push([x, 103.5], [x, 120.5]);
  }
  viaCoords.push([116, 108], [125, 108], [134, 108], [116, 116], [125, 116], [134, 116]);

  const vias = viaCoords
    .map(
      ([x, y]) =>
        `\t(via (at ${x.toFixed(2)} ${y.toFixed(2)}) (size 0.65) (drill 0.3) (layers "F.Cu" "B.Cu") (net 1))`,
    )
    .join('\n');

  return `(kicad_pcb
\t(version 20241229)
\t(generator "yotasage_example_gen")
\t(generator_version "1.0")
\t(general (thickness 0.8))
\t(paper "A4")
\t(title_block
\t\t(title "2.4 GHz 5th-Order LC Bandpass Filter")
\t\t(rev "1.0")
\t)
\t(layers
\t\t(0 "F.Cu" signal)
\t\t(2 "B.Cu" signal)
\t\t(13 "F.Paste" user)
\t\t(15 "B.Paste" user)
\t\t(5 "F.SilkS" user "F.Silkscreen")
\t\t(7 "B.SilkS" user "B.Silkscreen")
\t\t(1 "F.Mask" user)
\t\t(3 "B.Mask" user)
\t\t(25 "Edge.Cuts" user)
\t\t(19 "F.Fab" user)
\t)
\t(setup
\t\t(stackup
\t\t\t(layer "F.SilkS" (type "Top Silk Screen") (color "White"))
\t\t\t(layer "F.Mask" (type "Top Solder Mask") (color "Blue") (thickness 0.01))
\t\t\t(layer "F.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "dielectric 1" (type "core") (thickness 0.73) (material "RO4350B") (epsilon_r 3.48))
\t\t\t(layer "B.Cu" (type "copper") (thickness 0.035))
\t\t\t(layer "B.Mask" (type "Bottom Solder Mask") (color "Blue") (thickness 0.01))
\t\t\t(copper_finish "ENIG")
\t\t)
\t\t(pad_to_mask_clearance 0.05)
\t)
\t(net 0 "")
\t(net 1 "GND")
\t(net 2 "RF_IN")
\t(net 3 "NODE_1")
\t(net 4 "NODE_2")
\t(net 5 "RF_OUT")
\t(gr_rect (start 100 100) (end 150 124) (stroke (width 0.1) (type solid)) (fill none) (layer "Edge.Cuts"))
\t(gr_text "2.4 GHz BPF 50R" (at 125 102.2 0) (layer "F.SilkS") (effects (font (size 1.2 1.2) (thickness 0.18))))
${kicadSmaFootprint('J1', 102.1, 112, 0, [2, 'RF_IN'], [1, 'GND'], 1)}
${kicadSmaFootprint('J2', 147.9, 112, 180, [5, 'RF_OUT'], [1, 'GND'], 2)}
${kicad0603Footprint('L1', '2.7nH', 114, 112, 0, [2, 'RF_IN'], [3, 'NODE_1'], 3)}
${kicad0603Footprint('C1', '1.8pF', 120, 115.2, 90, [3, 'NODE_1'], [1, 'GND'], 4)}
${kicad0603Footprint('C2', '1.2pF', 125, 112, 0, [3, 'NODE_1'], [4, 'NODE_2'], 5)}
${kicad0603Footprint('L2', '2.7nH', 130, 115.2, 90, [4, 'NODE_2'], [1, 'GND'], 6)}
${kicad0603Footprint('L3', '2.7nH', 136, 112, 0, [4, 'NODE_2'], [5, 'RF_OUT'], 7)}
\t(segment (start 104.2 112) (end 113.175 112) (width 1.1) (layer "F.Cu") (net 2))
\t(segment (start 114.825 112) (end 124.175 112) (width 1.1) (layer "F.Cu") (net 3))
\t(segment (start 120 112) (end 120 114.375) (width 0.6) (layer "F.Cu") (net 3))
\t(segment (start 125.825 112) (end 135.175 112) (width 1.1) (layer "F.Cu") (net 4))
\t(segment (start 130 112) (end 130 114.375) (width 0.6) (layer "F.Cu") (net 4))
\t(segment (start 136.825 112) (end 145.8 112) (width 1.1) (layer "F.Cu") (net 5))
${vias}
\t(zone (net 1) (net_name "GND") (layer "B.Cu")
\t\t(polygon (pts (xy 100.5 100.5) (xy 149.5 100.5) (xy 149.5 123.5) (xy 100.5 123.5)))
\t\t(filled_polygon (layer "B.Cu") (pts (xy 100.5 100.5) (xy 149.5 100.5) (xy 149.5 123.5) (xy 100.5 123.5)))
\t)
)`;
}

function buildKicadBuckPsu(): string {
  return `(kicad_pcb
\t(version 20241229)
\t(generator "yotasage_example_gen")
\t(generator_version "1.0")
\t(general (thickness 1.6))
\t(paper "A4")
\t(title_block
\t\t(title "12V to 3.3V Synchronous Buck Regulator")
\t\t(rev "2.0")
\t)
\t(layers
\t\t(0 "F.Cu" signal)
\t\t(2 "B.Cu" signal)
\t\t(13 "F.Paste" user)
\t\t(15 "B.Paste" user)
\t\t(5 "F.SilkS" user "F.Silkscreen")
\t\t(7 "B.SilkS" user "B.Silkscreen")
\t\t(1 "F.Mask" user)
\t\t(3 "B.Mask" user)
\t\t(25 "Edge.Cuts" user)
\t\t(19 "F.Fab" user)
\t)
\t(setup
\t\t(stackup
\t\t\t(layer "F.SilkS" (type "Top Silk Screen") (color "White"))
\t\t\t(layer "F.Mask" (type "Top Solder Mask") (color "Black") (thickness 0.01))
\t\t\t(layer "F.Cu" (type "copper") (thickness 0.07))
\t\t\t(layer "dielectric 1" (type "core") (thickness 1.46) (material "FR4") (epsilon_r 4.5))
\t\t\t(layer "B.Cu" (type "copper") (thickness 0.07))
\t\t\t(layer "B.Mask" (type "Bottom Solder Mask") (color "Black") (thickness 0.01))
\t\t\t(copper_finish "HAL lead-free")
\t\t)
\t\t(pad_to_mask_clearance 0.05)
\t)
\t(net 0 "")
\t(net 1 "GND")
\t(net 2 "VIN_12V")
\t(net 3 "SW")
\t(net 4 "VOUT_3V3")
\t(net 5 "FB")
\t(gr_rect (start 100 100) (end 154 134) (stroke (width 0.12) (type solid)) (fill none) (layer "Edge.Cuts"))
\t(gr_text "12V -> 3.3V 2A BUCK" (at 127 103 0) (layer "F.SilkS") (effects (font (size 1.2 1.2) (thickness 0.18))))
${kicadHeaderFootprint('J1', 'VIN 12V', 105, 114, [['1', [2, 'VIN_12V']], ['2', [1, 'GND']]], 10)}
${kicadHeaderFootprint('J2', 'VOUT 3V3', 149, 114, [['1', [4, 'VOUT_3V3']], ['2', [1, 'GND']]], 11)}
\t(footprint "Inductor_SMD:L_6.3x6.3_H3"
\t\t(layer "F.Cu")
\t\t(uuid "f4000000-0000-4000-8000-000000000012")
\t\t(at 131 114)
\t\t(property "Reference" "L1" (at 0 -4.2 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
\t\t(property "Value" "10uH" (at 0 4.2 0) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
\t\t(fp_rect (start -3.2 -3.2) (end 3.2 3.2) (stroke (width 0.15) (type solid)) (fill none) (layer "F.SilkS"))
\t\t(pad "1" smd roundrect (at -2.2 0) (size 2.0 5.4) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.12) (net 3 "SW"))
\t\t(pad "2" smd roundrect (at 2.2 0) (size 2.0 5.4) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.12) (net 4 "VOUT_3V3"))
\t)
\t(footprint "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm"
\t\t(layer "F.Cu")
\t\t(uuid "f4000000-0000-4000-8000-000000000013")
\t\t(at 120 114)
\t\t(property "Reference" "U1" (at 0 -3.6 0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))
\t\t(property "Value" "TPS54202" (at 0 3.6 0) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))
\t\t(fp_rect (start -1.9 -2.5) (end 1.9 2.5) (stroke (width 0.12) (type solid)) (fill none) (layer "F.SilkS"))
\t\t(pad "1" smd roundrect (at -2.6 -1.905) (size 1.6 0.65) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2) (net 2 "VIN_12V"))
\t\t(pad "2" smd roundrect (at -2.6 -0.635) (size 1.6 0.65) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2) (net 2 "VIN_12V"))
\t\t(pad "3" smd roundrect (at -2.6 0.635) (size 1.6 0.65) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2) (net 1 "GND"))
\t\t(pad "4" smd roundrect (at -2.6 1.905) (size 1.6 0.65) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2) (net 1 "GND"))
\t\t(pad "5" smd roundrect (at 2.6 1.905) (size 1.6 0.65) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2) (net 5 "FB"))
\t\t(pad "6" smd roundrect (at 2.6 0.635) (size 1.6 0.65) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2) (net 3 "SW"))
\t\t(pad "7" smd roundrect (at 2.6 -0.635) (size 1.6 0.65) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2) (net 3 "SW"))
\t\t(pad "8" smd roundrect (at 2.6 -1.905) (size 1.6 0.65) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.2) (net 1 "GND"))
\t)
${kicad0603Footprint('C1', '22uF', 112, 114, 90, [2, 'VIN_12V'], [1, 'GND'], 14)}
${kicad0603Footprint('C2', '47uF', 141, 114, 90, [4, 'VOUT_3V3'], [1, 'GND'], 15)}
${kicad0603Footprint('R1', '100k', 127, 123, 0, [5, 'FB'], [4, 'VOUT_3V3'], 16)}
${kicad0603Footprint('R2', '31.6k', 120, 123, 0, [1, 'GND'], [5, 'FB'], 17)}
\t(segment (start 105 114) (end 112 113.175) (width 1.4) (layer "F.Cu") (net 2))
\t(segment (start 112 113.175) (end 117.4 112.095) (width 1.2) (layer "F.Cu") (net 2))
\t(segment (start 122.6 114) (end 128.8 114) (width 1.6) (layer "F.Cu") (net 3))
\t(segment (start 133.2 114) (end 141 113.175) (width 1.6) (layer "F.Cu") (net 4))
\t(segment (start 141 113.175) (end 149 114) (width 1.6) (layer "F.Cu") (net 4))
\t(segment (start 122.6 115.905) (end 124 123) (width 0.3) (layer "F.Cu") (net 5))
\t(segment (start 124 123) (end 126.175 123) (width 0.3) (layer "F.Cu") (net 5))
\t(segment (start 120.825 123) (end 124 123) (width 0.3) (layer "F.Cu") (net 5))
\t(segment (start 127.825 123) (end 141 123) (width 0.3) (layer "F.Cu") (net 4))
\t(segment (start 141 123) (end 141 113.175) (width 0.3) (layer "F.Cu") (net 4))
\t(via (at 112 118) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1))
\t(via (at 117 118) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1))
\t(via (at 141 118) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1))
\t(via (at 105 120) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1))
\t(via (at 149 120) (size 0.8) (drill 0.4) (layers "F.Cu" "B.Cu") (net 1))
\t(zone (net 1) (net_name "GND") (layer "B.Cu")
\t\t(polygon (pts (xy 100.8 100.8) (xy 153.2 100.8) (xy 153.2 133.2) (xy 100.8 133.2)))
\t\t(filled_polygon (layer "B.Cu") (pts (xy 100.8 100.8) (xy 153.2 100.8) (xy 153.2 133.2) (xy 100.8 133.2)))
\t)
)`;
}

// --- EAGLE 9 XML Sensor Module (.brd) ---

function buildEagleSensorBrd(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE eagle SYSTEM "eagle.dtd">
<eagle version="9.6.2">
<drawing>
<settings>
<setting alwaysvectorfont="yes"/>
</settings>
<grid distance="1" unitdist="mm" unit="mm" style="lines" multiple="1" display="no" altdistance="0.1" altunitdist="mm" altunit="mm"/>
<layers>
<layer number="1" name="Top" color="4" fill="1" visible="yes" active="yes"/>
<layer number="16" name="Bottom" color="1" fill="1" visible="yes" active="yes"/>
<layer number="17" name="Pads" color="2" fill="1" visible="yes" active="yes"/>
<layer number="18" name="Vias" color="2" fill="1" visible="yes" active="yes"/>
<layer number="20" name="Dimension" color="24" fill="1" visible="yes" active="yes"/>
<layer number="21" name="tPlace" color="7" fill="1" visible="yes" active="yes"/>
<layer number="25" name="tNames" color="7" fill="1" visible="yes" active="yes"/>
<layer number="29" name="tStop" color="7" fill="3" visible="no" active="yes"/>
<layer number="30" name="bStop" color="7" fill="6" visible="no" active="yes"/>
<layer number="31" name="tCream" color="7" fill="4" visible="no" active="yes"/>
</layers>
<board>
<plain>
<wire x1="0" y1="0" x2="28" y2="0" width="0.15" layer="20"/>
<wire x1="28" y1="0" x2="28" y2="20" width="0.15" layer="20"/>
<wire x1="28" y1="20" x2="0" y2="20" width="0.15" layer="20"/>
<wire x1="0" y1="20" x2="0" y2="0" width="0.15" layer="20"/>
<hole x="3" y="17" drill="2.2"/>
<hole x="25" y="17" drill="2.2"/>
<text x="6.5" y="16.5" size="1.4" layer="21">I2C ENV SENSOR</text>
</plain>
<libraries>
<library name="demo">
<packages>
<package name="HDR1X4">
<pad name="1" x="-3.81" y="0" drill="1.0" diameter="1.7" shape="square"/>
<pad name="2" x="-1.27" y="0" drill="1.0" diameter="1.7"/>
<pad name="3" x="1.27" y="0" drill="1.0" diameter="1.7"/>
<pad name="4" x="3.81" y="0" drill="1.0" diameter="1.7"/>
<wire x1="-5.08" y1="-1.27" x2="5.08" y2="-1.27" width="0.15" layer="21"/>
<wire x1="5.08" y1="-1.27" x2="5.08" y2="1.27" width="0.15" layer="21"/>
<wire x1="5.08" y1="1.27" x2="-5.08" y2="1.27" width="0.15" layer="21"/>
<wire x1="-5.08" y1="1.27" x2="-5.08" y2="-1.27" width="0.15" layer="21"/>
</package>
<package name="DFN6">
<smd name="1" x="-1.2" y="0.9" dx="0.8" dy="0.45" layer="1"/>
<smd name="2" x="-1.2" y="0" dx="0.8" dy="0.45" layer="1"/>
<smd name="3" x="-1.2" y="-0.9" dx="0.8" dy="0.45" layer="1"/>
<smd name="4" x="1.2" y="-0.9" dx="0.8" dy="0.45" layer="1"/>
<smd name="5" x="1.2" y="0" dx="0.8" dy="0.45" layer="1"/>
<smd name="6" x="1.2" y="0.9" dx="0.8" dy="0.45" layer="1"/>
<wire x1="-1.5" y1="-1.5" x2="1.5" y2="-1.5" width="0.15" layer="21"/>
<wire x1="1.5" y1="-1.5" x2="1.5" y2="1.5" width="0.15" layer="21"/>
<wire x1="1.5" y1="1.5" x2="-1.5" y2="1.5" width="0.15" layer="21"/>
<wire x1="-1.5" y1="1.5" x2="-1.5" y2="-1.5" width="0.15" layer="21"/>
</package>
<package name="R0603">
<smd name="1" x="-0.85" y="0" dx="0.8" dy="0.9" layer="1"/>
<smd name="2" x="0.85" y="0" dx="0.8" dy="0.9" layer="1"/>
</package>
</packages>
</library>
</libraries>
<designrules name="default">
<param name="mdWireWire" value="0.2mm"/>
<param name="rlMinPadTop" value="0.25mm"/>
<param name="rlMaxPadTop" value="0.5mm"/>
<param name="mvStopFrame" value="0.05"/>
</designrules>
<elements>
<element name="J1" library="demo" package="HDR1X4" value="I2C_HDR" x="14" y="3.5"/>
<element name="U1" library="demo" package="DFN6" value="SHT40" x="14" y="11"/>
<element name="R1" library="demo" package="R0603" value="4.7k" x="7" y="11" rot="R90"/>
<element name="R2" library="demo" package="R0603" value="4.7k" x="21" y="11" rot="R90"/>
<element name="C1" library="demo" package="R0603" value="100nF" x="14" y="15"/>
</elements>
<signals>
<signal name="VDD">
<contactref element="J1" pad="1"/>
<contactref element="U1" pad="1"/>
<contactref element="R1" pad="2"/>
<contactref element="R2" pad="2"/>
<contactref element="C1" pad="1"/>
<wire x1="10.19" y1="3.5" x2="7" y2="6.69" width="0.4" layer="1"/>
<wire x1="7" y1="6.69" x2="7" y2="11.85" width="0.4" layer="1"/>
<wire x1="7" y1="11.85" x2="12.8" y2="11.9" width="0.35" layer="1"/>
<wire x1="12.8" y1="11.9" x2="13.15" y2="15" width="0.35" layer="1"/>
<wire x1="13.15" y1="15" x2="21" y2="11.85" width="0.3" layer="1"/>
</signal>
<signal name="GND">
<contactref element="J1" pad="2"/>
<contactref element="U1" pad="3"/>
<contactref element="C1" pad="2"/>
<wire x1="12.73" y1="3.5" x2="12.8" y2="10.1" width="0.4" layer="1"/>
<via x="14.85" y="15" extent="1-16" drill="0.35" diameter="0.7"/>
<via x="12.73" y="7" extent="1-16" drill="0.35" diameter="0.7"/>
<polygon width="0.2" layer="16" isolate="0.3">
<vertex x="1" y="1"/>
<vertex x="27" y="1"/>
<vertex x="27" y="19"/>
<vertex x="1" y="19"/>
</polygon>
</signal>
<signal name="SDA">
<contactref element="J1" pad="3"/>
<contactref element="U1" pad="4"/>
<contactref element="R1" pad="1"/>
<wire x1="15.27" y1="3.5" x2="15.2" y2="10.1" width="0.25" layer="1"/>
<wire x1="7" y1="10.15" x2="11" y2="8.5" width="0.25" layer="1"/>
<wire x1="11" y1="8.5" x2="15.2" y2="10.1" width="0.25" layer="1"/>
</signal>
<signal name="SCL">
<contactref element="J1" pad="4"/>
<contactref element="U1" pad="6"/>
<contactref element="R2" pad="1"/>
<wire x1="17.81" y1="3.5" x2="21" y2="6.69" width="0.25" layer="1"/>
<wire x1="21" y1="6.69" x2="21" y2="10.15" width="0.25" layer="1"/>
<wire x1="21" y1="10.15" x2="15.2" y2="11.9" width="0.25" layer="1"/>
</signal>
</signals>
</board>
</drawing>
</eagle>`;
}

export function generateProceduralPcbExample(
  id: Exclude<PcbExampleId, 'mcu-4layer'>,
): { name: string; content: string }[] {
  if (id === 'gerber-breakout') return buildGerberBreakoutFiles();
  if (id === 'kicad-rf-filter') {
    return [{ name: 'rf-bandpass-2g4.kicad_pcb', content: buildKicadRfFilter() }];
  }
  if (id === 'eagle-sensor') {
    return [{ name: 'i2c-env-sensor.brd', content: buildEagleSensorBrd() }];
  }
  return [{ name: 'buck-regulator-3v3.kicad_pcb', content: buildKicadBuckPsu() }];
}

export async function loadPcbExampleFiles(id: PcbExampleId): Promise<PickedFile[]> {
  if (id === 'mcu-4layer') {
    const res = await fetch('/samples/example-board.kicad_pcb');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    const file = new File([buf], 'example-board.kicad_pcb', { type: 'text/plain' });
    return [{ file, path: file.name }];
  }
  const generated = generateProceduralPcbExample(id);
  return generated.map(({ name, content }) => {
    const file = new File([content], name, { type: 'text/plain' });
    return { file, path: name };
  });
}
