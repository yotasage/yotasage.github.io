import assert from 'node:assert/strict';
import test from 'node:test';

import { generateProceduralViewer3dFiles, VIEWER3D_EXAMPLE_PRESETS } from './examples';
import { detectFormat } from './formats';

test('3D viewer example preset list includes 6 distinct examples', () => {
  assert.equal(VIEWER3D_EXAMPLE_PRESETS.length, 6);
  assert.equal(new Set(VIEWER3D_EXAMPLE_PRESETS.map((p) => p.id)).size, 6);
});

test('heatsink and spur-gear STL examples have valid binary STL layout', () => {
  for (const id of ['heatsink-stl', 'spur-gear-stl'] as const) {
    const files = generateProceduralViewer3dFiles(id);
    assert.equal(files.length, 1);
    const bytes = files[0].data;
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.byteLength > 84);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triCount = view.getUint32(80, true);
    assert.ok(triCount >= 100, `Expected rich triangle mesh for ${id}, got ${triCount}`);
    assert.equal(bytes.byteLength, 84 + triCount * 50);
    assert.equal(detectFormat(files[0].name, bytes)?.id, 'stl');
  }
});

test('enclosure OBJ + MTL example defines multiple objects and materials', () => {
  const files = generateProceduralViewer3dFiles('enclosure-obj');
  assert.equal(files.length, 2);
  const obj = files.find((f) => f.name.endsWith('.obj'));
  const mtl = files.find((f) => f.name.endsWith('.mtl'));
  assert.ok(obj && typeof obj.data === 'string');
  assert.ok(mtl && typeof mtl.data === 'string');
  assert.ok(obj.data.includes('mtllib sensor-enclosure.mtl'));
  assert.ok(obj.data.includes('o Base_Housing'));
  assert.ok(obj.data.includes('o Top_Cover'));
  assert.ok(mtl.data.includes('newmtl Housing_Slate'));
  assert.ok(mtl.data.includes('newmtl PCB_Green'));
});

test('terrain PLY example has valid vertex and face counts with RGB colors', () => {
  const files = generateProceduralViewer3dFiles('terrain-ply');
  assert.equal(files.length, 1);
  const text = files[0].data;
  assert.ok(typeof text === 'string');
  assert.ok(text.startsWith('ply\nformat ascii 1.0'));
  assert.ok(text.includes('element vertex 676'));
  assert.ok(text.includes('element face 1250'));
  assert.ok(text.includes('property uchar red'));
});

test('shaft-pair example produces two valid binary STL files', () => {
  const files = generateProceduralViewer3dFiles('shaft-pair-stl');
  assert.equal(files.length, 2);
  for (const f of files) {
    assert.ok(f.data instanceof Uint8Array);
    const view = new DataView(f.data.buffer, f.data.byteOffset, f.data.byteLength);
    const triCount = view.getUint32(80, true);
    assert.ok(triCount > 50);
    assert.equal(f.data.byteLength, 84 + triCount * 50);
  }
});
