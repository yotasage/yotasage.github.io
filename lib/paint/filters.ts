import { clampByte } from './color';
import type { ColorStyleId, Rect } from './types';

export interface ColorStyleOptions {
  threshold?: number; // 0..255 for bw-threshold
  posterizeLevels?: number; // 2..16 for posterize
  selection?: Rect | null;
}

export interface AdjustmentOptions {
  brightness: number; // -100..100
  contrast: number; // -100..100
  hue: number; // -180..180
  saturation: number; // -100..100
  selection?: Rect | null;
}

function getBounds(width: number, height: number, selection?: Rect | null): Rect {
  if (!selection || selection.w <= 0 || selection.h <= 0) {
    return { x: 0, y: 0, w: width, h: height };
  }
  const x0 = Math.max(0, Math.min(width, Math.round(selection.x)));
  const y0 = Math.max(0, Math.min(height, Math.round(selection.y)));
  const x1 = Math.max(x0, Math.min(width, Math.round(selection.x + selection.w)));
  const y1 = Math.max(y0, Math.min(height, Math.round(selection.y + selection.h)));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyColorStyleBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  style: ColorStyleId,
  opts: ColorStyleOptions = {},
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const bounds = getBounds(width, height, opts.selection);
  if (bounds.w === 0 || bounds.h === 0) return out;

  if (style === 'bw-dither') {
    // Floyd-Steinberg error diffusion dithering strictly within bounds
    const lum = new Float32Array(bounds.w * bounds.h);
    for (let ry = 0; ry < bounds.h; ry++) {
      const y = bounds.y + ry;
      for (let rx = 0; rx < bounds.w; rx++) {
        const x = bounds.x + rx;
        const idx = (y * width + x) * 4;
        lum[ry * bounds.w + rx] = luminance(out[idx], out[idx + 1], out[idx + 2]);
      }
    }

    const thresh = opts.threshold ?? 128;
    for (let ry = 0; ry < bounds.h; ry++) {
      const y = bounds.y + ry;
      for (let rx = 0; rx < bounds.w; rx++) {
        const li = ry * bounds.w + rx;
        const oldVal = lum[li];
        const newVal = oldVal >= thresh ? 255 : 0;
        const err = oldVal - newVal;

        const x = bounds.x + rx;
        const idx = (y * width + x) * 4;
        if (out[idx + 3] > 0) {
          out[idx] = newVal;
          out[idx + 1] = newVal;
          out[idx + 2] = newVal;
        }

        if (rx + 1 < bounds.w) lum[li + 1] += (err * 7) / 16;
        if (ry + 1 < bounds.h) {
          if (rx > 0) lum[li + bounds.w - 1] += (err * 3) / 16;
          lum[li + bounds.w] += (err * 5) / 16;
          if (rx + 1 < bounds.w) lum[li + bounds.w + 1] += (err * 1) / 16;
        }
      }
    }
    return out;
  }

  const threshold = opts.threshold ?? 128;
  const levels = Math.max(2, Math.min(16, Math.round(opts.posterizeLevels ?? 4)));
  const step = 255 / (levels - 1);

  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const idx = (y * width + x) * 4;
      if (out[idx + 3] === 0) continue;

      const r = out[idx];
      const g = out[idx + 1];
      const b = out[idx + 2];

      switch (style) {
        case 'grayscale': {
          const v = clampByte(luminance(r, g, b));
          out[idx] = v;
          out[idx + 1] = v;
          out[idx + 2] = v;
          break;
        }
        case 'bw-threshold': {
          const v = luminance(r, g, b) >= threshold ? 255 : 0;
          out[idx] = v;
          out[idx + 1] = v;
          out[idx + 2] = v;
          break;
        }
        case 'sepia': {
          out[idx] = clampByte(0.393 * r + 0.769 * g + 0.189 * b);
          out[idx + 1] = clampByte(0.349 * r + 0.686 * g + 0.168 * b);
          out[idx + 2] = clampByte(0.272 * r + 0.534 * g + 0.131 * b);
          break;
        }
        case 'invert': {
          out[idx] = 255 - r;
          out[idx + 1] = 255 - g;
          out[idx + 2] = 255 - b;
          break;
        }
        case 'posterize': {
          out[idx] = clampByte(Math.round(r / step) * step);
          out[idx + 1] = clampByte(Math.round(g / step) * step);
          out[idx + 2] = clampByte(Math.round(b / step) * step);
          break;
        }
        case 'high-contrast': {
          const f = 1.65;
          out[idx] = clampByte((r - 128) * f + 128);
          out[idx + 1] = clampByte((g - 128) * f + 128);
          out[idx + 2] = clampByte((b - 128) * f + 128);
          break;
        }
        case 'warm': {
          out[idx] = clampByte(r * 1.12 + 8);
          out[idx + 1] = clampByte(g * 1.03 + 2);
          out[idx + 2] = clampByte(b * 0.86);
          break;
        }
        case 'cool': {
          out[idx] = clampByte(r * 0.88);
          out[idx + 1] = clampByte(g * 1.02 + 2);
          out[idx + 2] = clampByte(b * 1.14 + 8);
          break;
        }
      }
    }
  }

  return out;
}

export function applyAdjustmentsBuffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  opts: AdjustmentOptions,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const bounds = getBounds(width, height, opts.selection);
  if (bounds.w === 0 || bounds.h === 0) return out;

  const brightOffset = (opts.brightness / 100) * 128;
  const cVal = (opts.contrast / 100) * 255;
  const contrastFactor = (259 * (cVal + 255)) / (255 * (259 - cVal));

  const hueRad = (opts.hue * Math.PI) / 180;
  const cosH = Math.cos(hueRad);
  const sinH = Math.sin(hueRad);
  const satScale = 1 + opts.saturation / 100;

  // Hue rotation matrix in RGB space (luminance-preserving)
  const m00 = 0.213 + cosH * 0.787 - sinH * 0.213;
  const m01 = 0.715 - cosH * 0.715 - sinH * 0.715;
  const m02 = 0.072 - cosH * 0.072 + sinH * 0.928;
  const m10 = 0.213 - cosH * 0.213 + sinH * 0.143;
  const m11 = 0.715 + cosH * 0.285 + sinH * 0.140;
  const m12 = 0.072 - cosH * 0.072 - sinH * 0.283;
  const m20 = 0.213 - cosH * 0.213 - sinH * 0.787;
  const m21 = 0.715 - cosH * 0.715 + sinH * 0.715;
  const m22 = 0.072 + cosH * 0.928 + sinH * 0.072;

  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const idx = (y * width + x) * 4;
      if (out[idx + 3] === 0) continue;

      let r = out[idx];
      let g = out[idx + 1];
      let b = out[idx + 2];

      // Brightness & Contrast
      if (opts.brightness !== 0 || opts.contrast !== 0) {
        r = contrastFactor * (r + brightOffset - 128) + 128;
        g = contrastFactor * (g + brightOffset - 128) + 128;
        b = contrastFactor * (b + brightOffset - 128) + 128;
      }

      // Hue rotation
      if (opts.hue !== 0) {
        const nr = m00 * r + m01 * g + m02 * b;
        const ng = m10 * r + m11 * g + m12 * b;
        const nb = m20 * r + m21 * g + m22 * b;
        r = nr;
        g = ng;
        b = nb;
      }

      // Saturation
      if (opts.saturation !== 0) {
        const lum = luminance(r, g, b);
        r = lum + (r - lum) * satScale;
        g = lum + (g - lum) * satScale;
        b = lum + (b - lum) * satScale;
      }

      out[idx] = clampByte(r);
      out[idx + 1] = clampByte(g);
      out[idx + 2] = clampByte(b);
    }
  }

  return out;
}

export function applyConvolution3x3Buffer(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  kernel: readonly number[], // length 9
  selection?: Rect | null,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  const bounds = getBounds(width, height, selection);
  if (bounds.w === 0 || bounds.h === 0) return out;

  for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
    for (let x = bounds.x; x < bounds.x + bounds.w; x++) {
      const centerIdx = (y * width + x) * 4;
      if (src[centerIdx + 3] === 0) continue;

      let r = 0;
      let g = 0;
      let b = 0;
      let ki = 0;

      for (let ky = -1; ky <= 1; ky++) {
        const sy = Math.max(0, Math.min(height - 1, y + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const sx = Math.max(0, Math.min(width - 1, x + kx));
          const sIdx = (sy * width + sx) * 4;
          const w = kernel[ki++];
          r += src[sIdx] * w;
          g += src[sIdx + 1] * w;
          b += src[sIdx + 2] * w;
        }
      }

      out[centerIdx] = clampByte(r);
      out[centerIdx + 1] = clampByte(g);
      out[centerIdx + 2] = clampByte(b);
    }
  }

  return out;
}

export const KERNEL_BLUR: readonly number[] = [
  1 / 9, 1 / 9, 1 / 9,
  1 / 9, 1 / 9, 1 / 9,
  1 / 9, 1 / 9, 1 / 9,
];

export const KERNEL_SHARPEN: readonly number[] = [
  0, -1, 0,
  -1, 5, -1,
  0, -1, 0,
];
