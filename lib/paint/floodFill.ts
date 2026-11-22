import type { Rect, RGBA } from './types';

function colorMatches(
  data: Uint8ClampedArray,
  idx: number,
  tr: number,
  tg: number,
  tb: number,
  ta: number,
  tolBytes: number,
): boolean {
  const dr = Math.abs(data[idx] - tr);
  const dg = Math.abs(data[idx + 1] - tg);
  const db = Math.abs(data[idx + 2] - tb);
  const da = Math.abs(data[idx + 3] - ta);
  return Math.max(dr, dg, db, da) <= tolBytes;
}

/**
 * Non-recursive scanline flood fill on an RGBA pixel buffer.
 * Returns true if any pixels were modified.
 */
export function floodFillBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  startX: number,
  startY: number,
  fill: RGBA,
  tolerancePercent = 20,
  selection?: Rect | null,
): boolean {
  const sx = Math.floor(startX);
  const sy = Math.floor(startY);
  if (sx < 0 || sx >= width || sy < 0 || sy >= height) return false;

  const minX = selection && selection.w > 0 ? Math.max(0, Math.round(selection.x)) : 0;
  const minY = selection && selection.h > 0 ? Math.max(0, Math.round(selection.y)) : 0;
  const maxX = selection && selection.w > 0 ? Math.min(width, Math.round(selection.x + selection.w)) : width;
  const maxY = selection && selection.h > 0 ? Math.min(height, Math.round(selection.y + selection.h)) : height;

  if (sx < minX || sx >= maxX || sy < minY || sy >= maxY) return false;

  const startIdx = (sy * width + sx) * 4;
  const tr = data[startIdx];
  const tg = data[startIdx + 1];
  const tb = data[startIdx + 2];
  const ta = data[startIdx + 3];

  if (tr === fill.r && tg === fill.g && tb === fill.b && ta === fill.a) {
    return false;
  }

  const tolBytes = Math.round((Math.max(0, Math.min(100, tolerancePercent)) / 100) * 255);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];
  let modified = false;

  while (stack.length > 0) {
    const y = stack.pop()!;
    const x = stack.pop()!;

    let lx = x;
    while (lx > minX) {
      const prev = y * width + (lx - 1);
      if (visited[prev] || !colorMatches(data, prev * 4, tr, tg, tb, ta, tolBytes)) break;
      lx--;
    }

    let rx = x;
    while (rx < maxX - 1) {
      const next = y * width + (rx + 1);
      if (visited[next] || !colorMatches(data, next * 4, tr, tg, tb, ta, tolBytes)) break;
      rx++;
    }

    let spanAbove = false;
    let spanBelow = false;

    for (let cx = lx; cx <= rx; cx++) {
      const p = y * width + cx;
      if (visited[p]) continue;
      visited[p] = 1;

      const idx = p * 4;
      data[idx] = fill.r;
      data[idx + 1] = fill.g;
      data[idx + 2] = fill.b;
      data[idx + 3] = fill.a;
      modified = true;

      if (y > minY) {
        const up = (y - 1) * width + cx;
        const matchUp = !visited[up] && colorMatches(data, up * 4, tr, tg, tb, ta, tolBytes);
        if (!spanAbove && matchUp) {
          stack.push(cx, y - 1);
          spanAbove = true;
        } else if (spanAbove && !matchUp) {
          spanAbove = false;
        }
      }

      if (y + 1 < maxY) {
        const down = (y + 1) * width + cx;
        const matchDown = !visited[down] && colorMatches(data, down * 4, tr, tg, tb, ta, tolBytes);
        if (!spanBelow && matchDown) {
          stack.push(cx, y + 1);
          spanBelow = true;
        } else if (spanBelow && !matchDown) {
          spanBelow = false;
        }
      }
    }
  }

  return modified;
}
