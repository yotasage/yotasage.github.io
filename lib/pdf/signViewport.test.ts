import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clampPan,
  clampZoom,
  computePinchZoom,
  computeRenderScale,
  computeZoomedPan,
  MAX_SIGN_ZOOM,
  MIN_SIGN_ZOOM,
  stepZoom,
} from './signViewport';

test('clampZoom bounds values and handles non-finite input', () => {
  assert.equal(clampZoom(0.1), MIN_SIGN_ZOOM);
  assert.equal(clampZoom(10), MAX_SIGN_ZOOM);
  assert.equal(clampZoom(1.75), 1.75);
  assert.equal(clampZoom(Number.NaN), 1);
});

test('stepZoom steps cleanly up and down through presets', () => {
  assert.equal(stepZoom(1, 'in'), 1.25);
  assert.equal(stepZoom(1.25, 'in'), 1.5);
  assert.equal(stepZoom(4, 'in'), 4);
  assert.equal(stepZoom(1, 'out'), 0.75);
  assert.equal(stepZoom(0.5, 'out'), 0.5);
  assert.equal(stepZoom(1.6, 'in'), 2);
  assert.equal(stepZoom(1.6, 'out'), 1.5);
});

test('computePinchZoom scales proportionally and respects limits', () => {
  assert.equal(computePinchZoom(1, 100, 200), 2);
  assert.equal(computePinchZoom(2, 100, 300), MAX_SIGN_ZOOM);
  assert.equal(computePinchZoom(1, 100, 20), MIN_SIGN_ZOOM);
  assert.equal(computePinchZoom(1.5, 0, 100), 1.5);
});

test('computeZoomedPan preserves the focal point under the pointer', () => {
  const center = { x: 400, y: 300 };
  // Zooming at the exact center keeps pan at (0, 0).
  assert.deepEqual(computeZoomedPan({ x: 0, y: 0 }, center, center, 1, 2), { x: 0, y: 0 });

  // Zooming 2x at +100px from center shifts pan by -100px so the focal point stays fixed.
  assert.deepEqual(
    computeZoomedPan({ x: 0, y: 0 }, { x: 500, y: 350 }, center, 1, 2),
    { x: -100, y: -50 },
  );

  // Zooming back out from 2x to 1x at the same focal point restores (0, 0).
  assert.deepEqual(
    computeZoomedPan({ x: -100, y: -50 }, { x: 500, y: 350 }, center, 2, 1),
    { x: 0, y: 0 },
  );
});

test('clampPan centers when content fits and bounds pan when zoomed in', () => {
  assert.deepEqual(clampPan({ x: 50, y: -40 }, 300, 400, 600, 600), { x: 0, y: 0 });
  // Content 1000x1200 in 600x800 viewport -> maxX = 200 + 40 = 240, maxY = 200 + 40 = 240
  assert.deepEqual(clampPan({ x: 400, y: -500 }, 1000, 1200, 600, 800, 40), { x: 240, y: -240 });
  assert.deepEqual(clampPan({ x: -120, y: 80 }, 1000, 1200, 600, 800, 40), { x: -120, y: 80 });
});

test('computeRenderScale caps canvas pixels to prevent mobile OOM at high zoom', () => {
  const scale = computeRenderScale(2400, 595, 842, 2, 2400);
  assert.ok(scale * 842 <= 2400.001, `expected height <= 2400, got ${scale * 842}`);
  assert.ok(scale > 2, 'should still render crisply');
});
