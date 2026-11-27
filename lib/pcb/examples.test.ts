import assert from 'node:assert/strict';
import test from 'node:test';

import { generateProceduralPcbExample, PCB_EXAMPLE_PRESETS } from './examples';
import { buildBoard, readFiles } from './load';

test('PCB example preset list includes 5 distinct examples', () => {
  assert.equal(PCB_EXAMPLE_PRESETS.length, 5);
  assert.equal(new Set(PCB_EXAMPLE_PRESETS.map((p) => p.id)).size, 5);
});

const PROCEDURAL_IDS = ['gerber-breakout', 'kicad-rf-filter', 'eagle-sensor', 'kicad-psu'] as const;

for (const id of PROCEDURAL_IDS) {
  test(`procedural PCB example "${id}" parses cleanly through loadBoard`, async () => {
    const raw = generateProceduralPcbExample(id);
    assert.ok(raw.length >= 1);
    const picked = raw.map(({ name, content }) => {
      const file = new File([content], name, { type: 'text/plain' });
      return { file, path: name };
    });
    const loaded = await readFiles(picked, new Set(), () => {});
    assert.equal(loaded.length, raw.length);
    for (const f of loaded) {
      assert.equal(f.error, undefined, `File ${f.source.name} failed with error: ${f.error}`);
    }
    const board = buildBoard(loaded, new Map());
    assert.ok(board, `Expected non-null board for ${id}`);
    assert.ok(board.layers.length >= 2, `Expected >=2 layers for ${id}, got ${board.layers.length}`);
    const hasExtent = board.layers.some((l) => l.bbox && l.bbox.maxX > l.bbox.minX && l.bbox.maxY > l.bbox.minY);
    assert.ok(hasExtent, `Expected at least one layer with positive extent for ${id}`);
    if (id === 'gerber-breakout') {
      assert.ok(board.placements.length >= 4, 'Expected pick-and-place components');
      assert.ok(board.layers.some((l) => l.kind === 'drill'), 'Expected drill layer');
    } else {
      assert.ok(loaded.some((f) => f.design), `Expected parsed Design for ${id}`);
      assert.ok(board.placements.length >= 4, `Expected components for ${id}`);
    }
  });
}
