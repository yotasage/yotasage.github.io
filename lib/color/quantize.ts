import { clampByte, normalizeRgba } from './convert';
import { formatHex } from './parse';
import type { DominantColor, RGBA } from './types';

/**
 * Samples an average RGBA color from a raw ImageData pixel buffer centered at (cx, cy)
 * with an odd square kernel size (1, 3, 5, 9).
 */
export function sampleRegionRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
  sampleSize: 1 | 3 | 5 | 9 = 1,
): RGBA {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(cx)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(cy)));
  const half = Math.floor(sampleSize / 2);

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let aSum = 0;
  let count = 0;

  for (let dy = -half; dy <= half; dy++) {
    const py = y0 + dy;
    if (py < 0 || py >= height) continue;
    for (let dx = -half; dx <= half; dx++) {
      const px = x0 + dx;
      if (px < 0 || px >= width) continue;
      const idx = (py * width + px) * 4;
      rSum += data[idx];
      gSum += data[idx + 1];
      bSum += data[idx + 2];
      aSum += data[idx + 3];
      count++;
    }
  }

  if (count === 0) return { r: 0, g: 0, b: 0, a: 1 };
  return normalizeRgba({
    r: rSum / count,
    g: gSum / count,
    b: bSum / count,
    a: aSum / count / 255,
  });
}

interface PixelBucket {
  pixels: [number, number, number][];
}

function channelRange(pixels: readonly [number, number, number][], ch: 0 | 1 | 2): number {
  let min = 255;
  let max = 0;
  for (let i = 0; i < pixels.length; i++) {
    const v = pixels[i][ch];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

/**
 * Deterministic Median-Cut color quantization over RGBA pixel data.
 * Ignores mostly-transparent pixels (alpha < 128), splits buckets along their widest
 * RGB channel, merges near-identical clusters, and returns sorted dominant colors.
 */
export function extractDominantColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxColors = 8,
): DominantColor[] {
  const totalPixels = width * height;
  if (totalPixels <= 0 || data.length < totalPixels * 4) return [];

  const targetK = Math.max(1, Math.min(16, Math.round(maxColors)));
  // Subsample deterministically to at most ~12,000 pixels for instant response
  const stride = Math.max(1, Math.floor(totalPixels / 12000));
  const samples: [number, number, number][] = [];

  for (let i = 0; i < totalPixels; i += stride) {
    const off = i * 4;
    if (data[off + 3] < 128) continue;
    samples.push([data[off], data[off + 1], data[off + 2]]);
  }

  if (samples.length === 0) return [];

  const buckets: PixelBucket[] = [{ pixels: samples }];

  while (buckets.length < targetK) {
    // Pick the bucket with largest (range * log2(size)) so vivid accents aren't starved
    let bestIdx = -1;
    let bestScore = 0;
    let bestChannel: 0 | 1 | 2 = 0;

    for (let i = 0; i < buckets.length; i++) {
      const pts = buckets[i].pixels;
      if (pts.length < 4) continue;
      const rr = channelRange(pts, 0);
      const gr = channelRange(pts, 1);
      const br = channelRange(pts, 2);
      const maxR = Math.max(rr, gr, br);
      if (maxR < 8) continue;
      const score = maxR * Math.log2(pts.length);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestChannel = maxR === rr ? 0 : maxR === gr ? 1 : 2;
      }
    }

    if (bestIdx === -1) break;

    const target = buckets[bestIdx].pixels;
    target.sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = Math.floor(target.length / 2);
    const left = target.slice(0, mid);
    const right = target.slice(mid);

    buckets.splice(bestIdx, 1, { pixels: left }, { pixels: right });
  }

  // Seed centroids from median-cut buckets
  let centroids = buckets.map((bucket) => {
    let r = 0;
    let g = 0;
    let b = 0;
    for (const p of bucket.pixels) {
      r += p[0];
      g += p[1];
      b += p[2];
    }
    const n = bucket.pixels.length;
    return { r: r / n, g: g / n, b: b / n, count: n };
  });

  // Deterministic Lloyd k-means refinement (4 passes) for accurate centroids and truthful shares
  const k = centroids.length;
  for (let iter = 0; iter < 4; iter++) {
    const sumsR = new Float64Array(k);
    const sumsG = new Float64Array(k);
    const sumsB = new Float64Array(k);
    const counts = new Uint32Array(k);

    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dr = p[0] - centroids[c].r;
        const dg = p[1] - centroids[c].g;
        const db = p[2] - centroids[c].b;
        const d2 = dr * dr + dg * dg + db * db;
        if (d2 < bestDist) {
          bestDist = d2;
          best = c;
        }
      }
      sumsR[best] += p[0];
      sumsG[best] += p[1];
      sumsB[best] += p[2];
      counts[best] += 1;
    }

    centroids = centroids.map((prev, c) =>
      counts[c] > 0
        ? {
            r: sumsR[c] / counts[c],
            g: sumsG[c] / counts[c],
            b: sumsB[c] / counts[c],
            count: counts[c],
          }
        : { ...prev, count: 0 },
    );
  }

  const rawClusters = centroids
    .filter((c) => c.count > 0)
    .map((c) => ({
      r: clampByte(c.r),
      g: clampByte(c.g),
      b: clampByte(c.b),
      count: c.count,
    }));

  // Sort by count descending and deduplicate very close colors (Euclidean RGB < 16)
  rawClusters.sort((a, b) => b.count - a.count);
  const merged: { r: number; g: number; b: number; count: number }[] = [];
  for (const cl of rawClusters) {
    const existing = merged.find(
      (m) => Math.hypot(m.r - cl.r, m.g - cl.g, m.b - cl.b) < 16,
    );
    if (existing) {
      const total = existing.count + cl.count;
      existing.r = clampByte((existing.r * existing.count + cl.r * cl.count) / total);
      existing.g = clampByte((existing.g * existing.count + cl.g * cl.count) / total);
      existing.b = clampByte((existing.b * existing.count + cl.b * cl.count) / total);
      existing.count = total;
    } else {
      merged.push({ ...cl });
    }
  }

  const totalCount = samples.length;
  return merged
    .sort((a, b) => b.count - a.count)
    .slice(0, targetK)
    .map((m) => {
      const color: RGBA = { r: m.r, g: m.g, b: m.b, a: 1 };
      return {
        color,
        hex: formatHex(color),
        share: m.count / totalCount,
        count: m.count,
      };
    });
}
