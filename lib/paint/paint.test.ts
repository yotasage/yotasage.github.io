import assert from 'node:assert/strict';
import test from 'node:test';

import { hexToRgba, hsvToRgb, isValidHexInput, rgbaToHex, rgbToHsv } from './color';
import {
  applyAdjustmentsBuffer,
  applyColorStyleBuffer,
  applyConvolution3x3Buffer,
  KERNEL_BLUR,
} from './filters';
import { floodFillBuffer } from './floodFill';
import {
  clampFloatingPanel,
  clampRect,
  computeAnchoredOffset,
  computeRotatedDimensions,
  computeScaledDimensions,
  constrainRectAspect,
  isPointInRect,
  normalizeRect,
  nudgeRect,
  snapAnglePoint,
} from './geometry';

test('color hex/rgb/hsv roundtrip conversions', () => {
  const c = hexToRgba('#2563EB');
  assert.deepEqual(c, { r: 37, g: 99, b: 235, a: 255 });
  assert.equal(rgbaToHex(c), '#2563EB');

  const short = hexToRgba('#0f8');
  assert.deepEqual(short, { r: 0, g: 255, b: 136, a: 255 });

  const hsv = rgbToHsv({ r: 255, g: 0, b: 0, a: 200 });
  assert.deepEqual(hsv, { h: 0, s: 100, v: 100, a: 200 });
  assert.deepEqual(hsvToRgb(hsv), { r: 255, g: 0, b: 0, a: 200 });

  const green = hsvToRgb({ h: 120, s: 100, v: 100, a: 255 });
  assert.deepEqual(green, { r: 0, g: 255, b: 0, a: 255 });

  assert.equal(isValidHexInput('#AABBCC'), true);
  assert.equal(isValidHexInput('not-a-color'), false);
});

test('geometry normalizeRect, clampRect, and aspect constraint', () => {
  assert.deepEqual(normalizeRect(100, 80, 20, 30), { x: 20, y: 30, w: 80, h: 50 });
  assert.deepEqual(clampRect({ x: -10, y: 10, w: 500, h: 500 }, 200, 150), {
    x: 0,
    y: 10,
    w: 200,
    h: 140,
  });
  const sq = constrainRectAspect(10, 10, 110, 40, 1);
  assert.equal(sq.w, sq.h);
  assert.equal(sq.w, 100);
});

test('geometry rotation bounding boxes', () => {
  assert.deepEqual(computeRotatedDimensions(800, 600, 90), { width: 600, height: 800 });
  assert.deepEqual(computeRotatedDimensions(800, 600, -90), { width: 600, height: 800 });
  assert.deepEqual(computeRotatedDimensions(800, 600, 180), { width: 800, height: 600 });
  const diag = computeRotatedDimensions(100, 100, 45);
  assert.equal(diag.width, 142);
  assert.equal(diag.height, 142);
});

test('geometry scale down presets and preventUpscale guard', () => {
  const half = computeScaledDimensions(1600, 1200, { percent: 50, preventUpscale: true });
  assert.equal(half.width, 800);
  assert.equal(half.height, 600);

  const max1000 = computeScaledDimensions(2000, 1000, { maxEdge: 1000, preventUpscale: true });
  assert.equal(max1000.width, 1000);
  assert.equal(max1000.height, 500);

  // Should not upscale a 400x300 image when maxEdge is 1920 and preventUpscale is true
  const guarded = computeScaledDimensions(400, 300, { maxEdge: 1920, preventUpscale: true });
  assert.equal(guarded.width, 400);
  assert.equal(guarded.height, 300);

  // Explicit upscale allowed when preventUpscale is false
  const upscaled = computeScaledDimensions(400, 300, { targetWidth: 800, lockAspect: true, preventUpscale: false });
  assert.equal(upscaled.width, 800);
  assert.equal(upscaled.height, 600);
});

test('geometry anchored canvas resize offset & floating panel clamp', () => {
  assert.deepEqual(computeAnchoredOffset(100, 100, 200, 200, 'mc'), { x: 50, y: 50 });
  assert.deepEqual(computeAnchoredOffset(100, 100, 200, 200, 'br'), { x: 100, y: 100 });
  assert.deepEqual(computeAnchoredOffset(100, 100, 200, 200, 'tl'), { x: 0, y: 0 });

  const clamped = clampFloatingPanel(1400, -50, 280, 400, 1440, 900);
  assert.equal(clamped.x, 1440 - 280 - 8);
  assert.equal(clamped.y, 8);

  const snapped = snapAnglePoint({ x: 0, y: 0 }, { x: 100, y: 3 }, 15);
  assert.equal(snapped.y, 0);

  const box = { x: 10, y: 20, w: 50, h: 40 };
  assert.equal(isPointInRect({ x: 30, y: 40 }, box), true);
  assert.equal(isPointInRect({ x: 5, y: 40 }, box), false);
  assert.deepEqual(nudgeRect(box, 1, 0), { x: 11, y: 20, w: 50, h: 40 });
  assert.deepEqual(nudgeRect(box, 0, -1), { x: 10, y: 19, w: 50, h: 40 });
});

test('filters: grayscale, black & white threshold, Floyd-Steinberg dither, and selection bounds', () => {
  // 2x2 image: [dark blue, bright yellow, mid gray, pure red]
  const src = new Uint8ClampedArray([
    10, 20, 40, 255,
    250, 240, 100, 255,
    120, 120, 120, 255,
    255, 0, 0, 255,
  ]);

  const gray = applyColorStyleBuffer(src, 2, 2, 'grayscale');
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  assert.equal(gray[4], gray[5]);

  const bw = applyColorStyleBuffer(src, 2, 2, 'bw-threshold', { threshold: 128 });
  // pixel 0 dark -> 0, pixel 1 bright -> 255
  assert.equal(bw[0], 0);
  assert.equal(bw[4], 255);
  // Every pixel R=G=B in {0, 255}
  for (let i = 0; i < bw.length; i += 4) {
    assert.ok(bw[i] === 0 || bw[i] === 255);
    assert.equal(bw[i], bw[i + 1]);
    assert.equal(bw[i + 1], bw[i + 2]);
  }

  const dithered = applyColorStyleBuffer(src, 2, 2, 'bw-dither', { threshold: 128 });
  for (let i = 0; i < dithered.length; i += 4) {
    assert.ok(dithered[i] === 0 || dithered[i] === 255);
    assert.equal(dithered[i], dithered[i + 1]);
  }

  // Selection restricts invert strictly to top-left pixel (0,0)
  const invertedSel = applyColorStyleBuffer(src, 2, 2, 'invert', {
    selection: { x: 0, y: 0, w: 1, h: 1 },
  });
  assert.equal(invertedSel[0], 245);
  assert.equal(invertedSel[4], 250); // untouched

  // Brightness/contrast adjustment increases pixel brightness
  const brighter = applyAdjustmentsBuffer(src, 2, 2, {
    brightness: 40,
    contrast: 0,
    hue: 0,
    saturation: 0,
  });
  assert.ok(brighter[0] > src[0]);

  // 3x3 blur executes cleanly without NaN
  const blurred = applyConvolution3x3Buffer(src, 2, 2, KERNEL_BLUR);
  assert.equal(blurred.length, src.length);
  assert.ok(blurred[0] > src[0]);
});

test('floodFill fills contiguous region and stops at boundary', () => {
  // 4x4 white image with a vertical black wall at x = 2
  const w = 4;
  const h = 4;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const v = x === 2 ? 0 : 255;
      buf[idx] = v;
      buf[idx + 1] = v;
      buf[idx + 2] = v;
      buf[idx + 3] = 255;
    }
  }

  const changed = floodFillBuffer(buf, w, h, 0, 0, { r: 255, g: 0, b: 0, a: 255 }, 10);
  assert.equal(changed, true);

  // Left side (x=0,1) should be red
  assert.equal(buf[(0 * w + 0) * 4], 255);
  assert.equal(buf[(0 * w + 0) * 4 + 1], 0);
  assert.equal(buf[(3 * w + 1) * 4 + 1], 0);

  // Wall (x=2) should stay black
  assert.equal(buf[(1 * w + 2) * 4], 0);

  // Right side (x=3) should stay white
  assert.equal(buf[(1 * w + 3) * 4], 255);
  assert.equal(buf[(1 * w + 3) * 4 + 1], 255);

  // Filling again with same color is a no-op
  const second = floodFillBuffer(buf, w, h, 0, 0, { r: 255, g: 0, b: 0, a: 255 }, 10);
  assert.equal(second, false);
});
