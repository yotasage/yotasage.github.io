import test from 'node:test';
import assert from 'node:assert/strict';

import { Board, Contour, emptyBox } from './model';
import { computePcbStats, contourSignedAreaMm2 } from './stats';

function rectContour(w: number, h: number, ccw = true): Contour {
  if (ccw) {
    return {
      start: { x: 0, y: 0 },
      segs: [
        { to: { x: w, y: 0 } },
        { to: { x: w, y: h } },
        { to: { x: 0, y: h } },
        { to: { x: 0, y: 0 } },
      ],
    };
  }
  return {
    start: { x: 0, y: 0 },
    segs: [
      { to: { x: 0, y: h } },
      { to: { x: w, y: h } },
      { to: { x: w, y: 0 } },
      { to: { x: 0, y: 0 } },
    ],
  };
}

test('contourSignedAreaMm2 handles rectangular outer edges and cutouts', () => {
  const outer = rectContour(50, 40, true); // +2000 mm^2
  const cutout = rectContour(10, 10, false); // -100 mm^2
  assert.ok(Math.abs(contourSignedAreaMm2(outer) - 2000) < 1e-6);
  assert.ok(Math.abs(contourSignedAreaMm2(cutout) + 100) < 1e-6);
});

test('computePcbStats computes min/max via outer & drill sizes, annular ring, drills, tracks, and area for EDA designs', () => {
  const board: Board = {
    name: 'test.kicad_pcb',
    source: 'kicad',
    layers: [
      { id: 'F.Cu', name: 'F.Cu', kind: 'copper', side: 'top', copper: 1, items: [], apertures: [], bbox: emptyBox() },
      { id: 'B.Cu', name: 'B.Cu', kind: 'copper', side: 'bottom', copper: 2, items: [], apertures: [], bbox: emptyBox() },
    ],
    outline: [rectContour(60, 40, true), rectContour(10, 10, false)],
    outlineFrom: 'design',
    objects: [],
    placements: [],
    warnings: [],
    design: {
      format: 'KiCad 9',
      layers: [],
      nets: ['', 'GND', 'VCC', 'SDA'],
      outline: [],
      components: [
        { ref: 'U1', value: 'MCU', footprint: 'QFN', at: { x: 10, y: 10 }, rot: 0, side: 'top', attrs: { type: 'smd' }, fields: {} },
        { ref: 'J1', value: 'HDR', footprint: 'PinHeader', at: { x: 20, y: 10 }, rot: 0, side: 'bottom', attrs: { type: 'through_hole' }, fields: {} },
      ],
      pads: [
        { comp: 0, num: '1', net: 1, at: { x: 10, y: 10 }, rot: 0, shapes: [], type: 'smd' },
        { comp: 1, num: '1', net: 2, at: { x: 20, y: 10 }, rot: 0, shapes: [], type: 'th', hole: { d: 1.0, plated: true } },
        { comp: 1, num: '2', net: 0, at: { x: 25, y: 10 }, rot: 0, shapes: [], type: 'np', hole: { d: 3.2, plated: false } },
        { comp: 1, num: '3', net: 1, at: { x: 30, y: 10 }, rot: 0, shapes: [], type: 'th', hole: { d: 0.8, slot: { w: 0.8, h: 2.0 }, plated: true } },
      ],
      tracks: [
        { layer: 'F.Cu', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, w: 0.15, net: 1 },
        { layer: 'F.Cu', a: { x: 10, y: 0 }, b: { x: 10, y: 20 }, w: 0.5, net: 2 },
      ],
      vias: [
        { at: { x: 5, y: 5 }, d: 0.45, drill: 0.2, from: 'F.Cu', to: 'B.Cu', layers: ['F.Cu', 'B.Cu'], net: 1, type: 'through' },
        { at: { x: 8, y: 5 }, d: 0.45, drill: 0.2, from: 'F.Cu', to: 'B.Cu', layers: ['F.Cu', 'B.Cu'], net: 1, type: 'through' },
        { at: { x: 12, y: 5 }, d: 0.8, drill: 0.4, from: 'F.Cu', to: 'B.Cu', layers: ['F.Cu', 'B.Cu'], net: 2, type: 'through' },
        { at: { x: 15, y: 5 }, d: 0.35, drill: 0.15, from: 'F.Cu', to: 'In1.Cu', layers: ['F.Cu', 'In1.Cu'], net: 3, type: 'micro' },
      ],
      zones: [
        { layers: ['B.Cu'], net: 1, outline: [], fill: [] },
        { layers: ['F.Cu'], net: 0, outline: [], fill: [], keepout: true },
      ],
      graphics: [],
      texts: [],
      holes: [{ at: { x: 2, y: 2 }, d: 2.5, plated: false }],
      warnings: [],
    },
  };

  const stats = computePcbStats(board);

  assert.equal(stats.widthMm, 60);
  assert.equal(stats.heightMm, 40);
  assert.ok(Math.abs((stats.areaMm2 ?? 0) - 2300) < 1e-6);
  assert.equal(stats.copperLayers, 2);

  // Via metrics
  assert.equal(stats.vias.count, 4);
  assert.equal(stats.vias.source, 'design');
  assert.equal(stats.vias.minOuterMm, 0.35);
  assert.equal(stats.vias.maxOuterMm, 0.8);
  assert.equal(stats.vias.minDrillMm, 0.15);
  assert.equal(stats.vias.maxDrillMm, 0.4);
  assert.ok(Math.abs((stats.vias.minAnnularRingMm ?? 0) - 0.1) < 1e-6);
  assert.equal(stats.vias.uniqueSizes, 3);
  assert.equal(stats.vias.byType.through, 3);
  assert.equal(stats.vias.byType.micro, 1);

  // Drill metrics (4 vias + 3 pad holes + 1 free hole = 8)
  assert.equal(stats.drills.total, 8);
  assert.equal(stats.drills.plated, 6);
  assert.equal(stats.drills.nonPlated, 2);
  assert.equal(stats.drills.slots, 1);
  assert.equal(stats.drills.minDiameterMm, 0.15);
  assert.equal(stats.drills.maxDiameterMm, 3.2);
  assert.equal(stats.drills.uniqueDiameters, 7);

  // Track metrics
  assert.equal(stats.tracks.segmentCount, 2);
  assert.equal(stats.tracks.minWidthMm, 0.15);
  assert.equal(stats.tracks.maxWidthMm, 0.5);
  assert.ok(Math.abs((stats.tracks.totalLengthMm ?? 0) - 30) < 1e-6);

  // Components, pads, nets, zones
  assert.deepEqual(stats.components, { total: 2, top: 1, bottom: 1, smd: 1, tht: 1 });
  assert.deepEqual(stats.pads, { total: 4, smd: 1, tht: 2, npth: 1 });
  assert.equal(stats.netsCount, 3);
  assert.equal(stats.zonesCount, 1);
});

test('computePcbStats detects vias in Gerber + Excellon sets using X2 attributes', () => {
  const board: Board = {
    name: 'gerber-set',
    source: 'gerber',
    layers: [
      {
        id: 'top',
        name: 'F_Cu.gbr',
        kind: 'copper',
        side: 'top',
        copper: 1,
        apertures: [
          { parts: [{ dark: true, circle: { c: { x: 0, y: 0 }, r: 0.3 } }], attrs: { '.AperFunction': 'ViaPad' } },
          { parts: [{ dark: true, circle: { c: { x: 0, y: 0 }, r: 0.5 } }], attrs: { '.AperFunction': 'ViaPad' } },
        ],
        items: [
          { k: 'flash', at: { x: 10, y: 10 }, ap: 0, rot: 0, mirror: 'none', scale: 1, dark: true },
          { k: 'flash', at: { x: 20, y: 10 }, ap: 1, rot: 0, mirror: 'none', scale: 1, dark: true },
          { k: 'line', a: { x: 10, y: 10 }, b: { x: 20, y: 10 }, w: 0.25, cap: 'round', dark: true },
        ],
        bbox: { minX: 0, minY: 0, maxX: 30, maxY: 20 },
      },
      {
        id: 'drill',
        name: 'PTH.drl',
        kind: 'drill',
        side: 'none',
        apertures: [],
        items: [
          { k: 'hole', at: { x: 10, y: 10 }, d: 0.3, plated: true, dark: true },
          { k: 'hole', at: { x: 20, y: 10 }, d: 0.45, plated: true, dark: true },
          { k: 'hole', at: { x: 25, y: 15 }, d: 3.0, plated: false, dark: true },
        ],
        bbox: { minX: 10, minY: 10, maxX: 25, maxY: 15 },
      },
    ],
    objects: [],
    placements: [],
    warnings: [],
  };

  const stats = computePcbStats(board);
  assert.equal(stats.vias.count, 2);
  assert.equal(stats.vias.source, 'gerber-x2');
  assert.ok(Math.abs((stats.vias.minOuterMm ?? 0) - 0.6) < 1e-6);
  assert.ok(Math.abs((stats.vias.maxOuterMm ?? 0) - 1.0) < 1e-6);
  assert.equal(stats.vias.minDrillMm, 0.3);
  assert.equal(stats.vias.maxDrillMm, 0.45);
  assert.ok(Math.abs((stats.vias.minAnnularRingMm ?? 0) - 0.15) < 1e-6);
  assert.equal(stats.drills.total, 3);
  assert.equal(stats.drills.plated, 2);
  assert.equal(stats.drills.nonPlated, 1);
  assert.equal(stats.tracks.minWidthMm, 0.25);
});
