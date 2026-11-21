// Pure, DOM-free PDF comparison engine: reading-order text line assembly,
// line + inline word LCS diffs, RGBA pixel overlay/heatmap diffs with 8-connected
// changed-region bounding boxes, and unified-style text diff report formatting.

export interface TextItemPos {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AssembleLinesOptions {
  /** Set true if y increases downward (canvas/screen coords); default false (PDF y-up coords). */
  yDown?: boolean;
}

export interface WordChunk {
  type: 'same' | 'removed' | 'added';
  text: string;
}

export interface DiffLine {
  type: 'same' | 'removed' | 'added';
  text: string;
  lineA?: number;
  lineB?: number;
  chunks?: WordChunk[];
}

export interface TextDiffResult {
  lines: DiffLine[];
  addedLines: number;
  removedLines: number;
  unchangedLines: number;
  hasChanges: boolean;
}

export interface PixelDiffOptions {
  threshold?: number;
  mode?: 'overlay' | 'diff-only';
  unchangedOpacity?: number;
}

export interface NormBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelDiffResult {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  changedPixels: number;
  totalPixels: number;
  changedPercent: number;
  changedBoxes: NormBox[];
}

export interface PageTextComparison {
  page: number;
  addedLines: number;
  removedLines: number;
  hasChanges: boolean;
  diff: TextDiffResult;
}

interface LineBucket {
  ySum: number;
  count: number;
  maxHeight: number;
  items: TextItemPos[];
}

function estimateCharWidth(item: TextItemPos): number {
  const len = item.str.length;
  if (item.width > 0 && len > 0) {
    return item.width / len;
  }
  const h = Math.abs(item.height);
  return Math.max(h > 0 ? h * 0.5 : 4, 2);
}

/**
 * Reconstructs reading-order text lines from positioned PDF text items.
 * Clusters items within vertical tolerance `max(3, height * 0.55)`, sorts each
 * line left-to-right by x, and inserts spaces when horizontal gaps exceed `0.25 * charWidth`.
 */
export function assembleLinesFromTextItems(
  items: TextItemPos[],
  opts?: AssembleLinesOptions,
): string[] {
  const yDown = opts?.yDown === true;
  const nonEmpty = items.filter((it) => it && typeof it.str === 'string' && it.str.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const sorted = nonEmpty.slice().sort((a, b) => {
    const dy = yDown ? a.y - b.y : b.y - a.y;
    if (Math.abs(dy) > 0.001) return dy;
    return a.x - b.x;
  });

  const buckets: LineBucket[] = [];
  for (const item of sorted) {
    const h = Math.max(Math.abs(item.height) || 0, 1);
    let matched: LineBucket | null = null;
    let bestDist = Infinity;

    // Check recent buckets (typically only the last 1-3 are vertically close).
    for (let i = buckets.length - 1; i >= Math.max(0, buckets.length - 6); i--) {
      const b = buckets[i];
      const refY = b.ySum / b.count;
      const tol = Math.max(3, Math.max(b.maxHeight, h) * 0.55);
      const dist = Math.abs(item.y - refY);
      if (dist <= tol && dist < bestDist) {
        bestDist = dist;
        matched = b;
      }
    }

    if (matched) {
      matched.items.push(item);
      matched.ySum += item.y;
      matched.count += 1;
      if (h > matched.maxHeight) matched.maxHeight = h;
    } else {
      buckets.push({
        ySum: item.y,
        count: 1,
        maxHeight: h,
        items: [item],
      });
    }
  }

  buckets.sort((a, b) => {
    const ya = a.ySum / a.count;
    const yb = b.ySum / b.count;
    return yDown ? ya - yb : yb - ya;
  });

  const lines: string[] = [];
  for (const bucket of buckets) {
    bucket.items.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEndX = 0;
    let prevCharW = 4;

    for (let i = 0; i < bucket.items.length; i++) {
      const it = bucket.items[i];
      const charW = estimateCharWidth(it);
      const itemWidth = it.width > 0 ? it.width : it.str.length * charW;

      if (i === 0) {
        text = it.str;
      } else {
        const gap = it.x - prevEndX;
        const refCharW = Math.min(prevCharW, charW) > 0 ? (prevCharW + charW) * 0.5 : Math.max(prevCharW, charW);
        if (!text.endsWith(' ') && !it.str.startsWith(' ') && gap > 0.25 * refCharW) {
          text += ' ';
        }
        text += it.str;
      }

      const endX = it.x + itemWidth;
      prevEndX = i === 0 ? endX : Math.max(prevEndX, endX);
      prevCharW = charW;
    }

    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length > 0) {
      lines.push(cleaned);
    }
  }

  return lines;
}

type DiffOp = 'same' | 'removed' | 'added';

interface RawEdit {
  type: DiffOp;
  indexA?: number;
  indexB?: number;
}

const MAX_LCS_CELLS = 2_000_000;
const MAX_WORD_LCS_CELLS = 250_000;

function runLcsSequence(a: string[], b: string[], maxCells: number): RawEdit[] {
  const lenA = a.length;
  const lenB = b.length;

  let prefix = 0;
  const minLen = Math.min(lenA, lenB);
  while (prefix < minLen && a[prefix] === b[prefix]) {
    prefix++;
  }

  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    a[lenA - 1 - suffix] === b[lenB - 1 - suffix]
  ) {
    suffix++;
  }

  const out: RawEdit[] = [];
  for (let i = 0; i < prefix; i++) {
    out.push({ type: 'same', indexA: i, indexB: i });
  }

  const m = lenA - prefix - suffix;
  const n = lenB - prefix - suffix;

  if (m === 0 && n > 0) {
    for (let j = 0; j < n; j++) {
      out.push({ type: 'added', indexB: prefix + j });
    }
  } else if (n === 0 && m > 0) {
    for (let i = 0; i < m; i++) {
      out.push({ type: 'removed', indexA: prefix + i });
    }
  } else if (m > 0 && n > 0) {
    if (m * n <= maxCells) {
      const cols = n + 1;
      const dp = new Uint32Array((m + 1) * cols);

      for (let i = m - 1; i >= 0; i--) {
        const ai = a[prefix + i];
        const rowOff = i * cols;
        const nextRowOff = (i + 1) * cols;
        for (let j = n - 1; j >= 0; j--) {
          if (ai === b[prefix + j]) {
            dp[rowOff + j] = dp[nextRowOff + j + 1] + 1;
          } else {
            const down = dp[nextRowOff + j];
            const right = dp[rowOff + j + 1];
            dp[rowOff + j] = down >= right ? down : right;
          }
        }
      }

      let i = 0;
      let j = 0;
      while (i < m && j < n) {
        if (a[prefix + i] === b[prefix + j]) {
          out.push({ type: 'same', indexA: prefix + i, indexB: prefix + j });
          i++;
          j++;
        } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
          out.push({ type: 'removed', indexA: prefix + i });
          i++;
        } else {
          out.push({ type: 'added', indexB: prefix + j });
          j++;
        }
      }
      while (i < m) {
        out.push({ type: 'removed', indexA: prefix + i });
        i++;
      }
      while (j < n) {
        out.push({ type: 'added', indexB: prefix + j });
        j++;
      }
    } else {
      // Safe linear-time fallback for very large slices using unique-line anchoring.
      const posB = new Map<string, number[]>();
      for (let j = 0; j < n; j++) {
        const key = b[prefix + j];
        let arr = posB.get(key);
        if (!arr) {
          arr = [];
          posB.set(key, arr);
        }
        if (arr.length < 4) arr.push(j);
      }

      let i = 0;
      let j = 0;
      while (i < m && j < n) {
        if (a[prefix + i] === b[prefix + j]) {
          out.push({ type: 'same', indexA: prefix + i, indexB: prefix + j });
          i++;
          j++;
          continue;
        }
        // Look ahead for the next matching anchor in a bounded window.
        const candidates = posB.get(a[prefix + i]);
        const matchJ = candidates?.find((cand) => cand >= j && cand - j <= 64);
        if (matchJ !== undefined) {
          while (j < matchJ) {
            out.push({ type: 'added', indexB: prefix + j });
            j++;
          }
          out.push({ type: 'same', indexA: prefix + i, indexB: prefix + j });
          i++;
          j++;
        } else {
          out.push({ type: 'removed', indexA: prefix + i });
          i++;
        }
      }
      while (i < m) {
        out.push({ type: 'removed', indexA: prefix + i });
        i++;
      }
      while (j < n) {
        out.push({ type: 'added', indexB: prefix + j });
        j++;
      }
    }
  }

  for (let s = 0; s < suffix; s++) {
    out.push({
      type: 'same',
      indexA: lenA - suffix + s,
      indexB: lenB - suffix + s,
    });
  }

  return out;
}

function tokenizeWords(text: string): string[] {
  if (!text) return [];
  return text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu) ?? [text];
}

function pushChunk(list: WordChunk[], type: WordChunk['type'], text: string): void {
  if (!text) return;
  const last = list[list.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    list.push({ type, text });
  }
}

/**
 * Tokenizes two strings by words/whitespace/punctuation and runs an LCS diff,
 * returning compact word-level highlight chunks for line A and line B.
 */
export function diffWords(a: string, b: string): { chunksA: WordChunk[]; chunksB: WordChunk[] } {
  if (a === b) {
    const same: WordChunk[] = a ? [{ type: 'same', text: a }] : [];
    return { chunksA: same.map((c) => ({ ...c })), chunksB: same.map((c) => ({ ...c })) };
  }
  const tokensA = tokenizeWords(a);
  const tokensB = tokenizeWords(b);
  const edits = runLcsSequence(tokensA, tokensB, MAX_WORD_LCS_CELLS);

  const chunksA: WordChunk[] = [];
  const chunksB: WordChunk[] = [];

  for (const edit of edits) {
    if (edit.type === 'same' && edit.indexA !== undefined) {
      const tok = tokensA[edit.indexA];
      pushChunk(chunksA, 'same', tok);
      pushChunk(chunksB, 'same', tok);
    } else if (edit.type === 'removed' && edit.indexA !== undefined) {
      pushChunk(chunksA, 'removed', tokensA[edit.indexA]);
    } else if (edit.type === 'added' && edit.indexB !== undefined) {
      pushChunk(chunksB, 'added', tokensB[edit.indexB]);
    }
  }

  return { chunksA, chunksB };
}

/**
 * Diffs two arrays of reading-order text lines using prefix/suffix trimming,
 * LCS dynamic programming (with a safe fallback above 2M cells), and inline
 * word-level diff pairing on adjacent removed+added blocks.
 */
export function diffTextLines(linesA: string[], linesB: string[]): TextDiffResult {
  const edits = runLcsSequence(linesA, linesB, MAX_LCS_CELLS);
  const lines: DiffLine[] = [];
  let addedLines = 0;
  let removedLines = 0;
  let unchangedLines = 0;

  for (const edit of edits) {
    if (edit.type === 'same' && edit.indexA !== undefined && edit.indexB !== undefined) {
      unchangedLines++;
      lines.push({
        type: 'same',
        text: linesA[edit.indexA],
        lineA: edit.indexA + 1,
        lineB: edit.indexB + 1,
      });
    } else if (edit.type === 'removed' && edit.indexA !== undefined) {
      removedLines++;
      lines.push({
        type: 'removed',
        text: linesA[edit.indexA],
        lineA: edit.indexA + 1,
      });
    } else if (edit.type === 'added' && edit.indexB !== undefined) {
      addedLines++;
      lines.push({
        type: 'added',
        text: linesB[edit.indexB],
        lineB: edit.indexB + 1,
      });
    }
  }

  // Pair consecutive removed + added blocks to attach inline word-level chunks.
  let idx = 0;
  while (idx < lines.length) {
    if (lines[idx].type !== 'removed') {
      idx++;
      continue;
    }
    const remStart = idx;
    while (idx < lines.length && lines[idx].type === 'removed') idx++;
    const remEnd = idx;
    const addStart = idx;
    while (idx < lines.length && lines[idx].type === 'added') idx++;
    const addEnd = idx;

    const pairs = Math.min(remEnd - remStart, addEnd - addStart);
    for (let k = 0; k < pairs; k++) {
      const remLine = lines[remStart + k];
      const addLine = lines[addStart + k];
      const { chunksA, chunksB } = diffWords(remLine.text, addLine.text);
      remLine.chunks = chunksA;
      addLine.chunks = chunksB;
    }
  }

  return {
    lines,
    addedLines,
    removedLines,
    unchangedLines,
    hasChanges: addedLines > 0 || removedLines > 0,
  };
}

/**
 * Computes a pixel-level visual diff between two RGBA images, handling
 * mismatched dimensions by white-padding, colouring removed/added/modified
 * pixels, and clustering changed regions into normalized bounding boxes.
 */
export function computePixelDiff(
  rgbaA: Uint8ClampedArray,
  wA: number,
  hA: number,
  rgbaB: Uint8ClampedArray,
  wB: number,
  hB: number,
  opts?: PixelDiffOptions,
): PixelDiffResult {
  const width = Math.max(0, wA, wB);
  const height = Math.max(0, hA, hB);
  const totalPixels = width * height;
  const rgba = new Uint8ClampedArray(totalPixels * 4);

  if (totalPixels === 0) {
    return {
      rgba,
      width,
      height,
      changedPixels: 0,
      totalPixels: 0,
      changedPercent: 0,
      changedBoxes: [],
    };
  }

  const threshold = Math.max(0, Math.min(255, opts?.threshold ?? 24));
  const mode = opts?.mode ?? 'overlay';
  const unchangedOpacity = Math.max(0, Math.min(1, opts?.unchangedOpacity ?? 0.28));

  const cell = Math.max(12, Math.round(Math.max(width, height) / 48));
  const gridW = Math.ceil(width / cell);
  const gridH = Math.ceil(height / cell);
  const grid = new Uint8Array(gridW * gridH);

  let changedPixels = 0;
  const lumGate = Math.max(12, threshold * 0.75);

  for (let y = 0; y < height; y++) {
    const inAY = y < hA;
    const inBY = y < hB;
    const rowOut = y * width;
    const rowA = y * wA;
    const rowB = y * wB;
    const gyOff = Math.floor(y / cell) * gridW;

    for (let x = 0; x < width; x++) {
      let rA = 255;
      let gA = 255;
      let bA = 255;
      if (inAY && x < wA) {
        const pA = (rowA + x) * 4;
        const aA = rgbaA[pA + 3];
        if (aA === 255) {
          rA = rgbaA[pA];
          gA = rgbaA[pA + 1];
          bA = rgbaA[pA + 2];
        } else if (aA > 0) {
          const f = aA / 255;
          rA = Math.round(rgbaA[pA] * f + 255 * (1 - f));
          gA = Math.round(rgbaA[pA + 1] * f + 255 * (1 - f));
          bA = Math.round(rgbaA[pA + 2] * f + 255 * (1 - f));
        }
      }

      let rB = 255;
      let gB = 255;
      let bB = 255;
      if (inBY && x < wB) {
        const pB = (rowB + x) * 4;
        const aB = rgbaB[pB + 3];
        if (aB === 255) {
          rB = rgbaB[pB];
          gB = rgbaB[pB + 1];
          bB = rgbaB[pB + 2];
        } else if (aB > 0) {
          const f = aB / 255;
          rB = Math.round(rgbaB[pB] * f + 255 * (1 - f));
          gB = Math.round(rgbaB[pB + 1] * f + 255 * (1 - f));
          bB = Math.round(rgbaB[pB + 2] * f + 255 * (1 - f));
        }
      }

      const dR = rA > rB ? rA - rB : rB - rA;
      const dG = gA > gB ? gA - gB : gB - gA;
      const dB = bA > bB ? bA - bB : bB - bA;
      const maxDiff = dR >= dG ? (dR >= dB ? dR : dB) : (dG >= dB ? dG : dB);

      const pOut = (rowOut + x) * 4;

      if (maxDiff > threshold) {
        changedPixels++;
        grid[gyOff + Math.floor(x / cell)] = 1;

        const lumA = 0.299 * rA + 0.587 * gA + 0.114 * bA;
        const lumB = 0.299 * rB + 0.587 * gB + 0.114 * bB;

        if (lumB - lumA >= lumGate && lumB >= 210) {
          // Dark in A, light in B (removed) -> red
          rgba[pOut] = 224;
          rgba[pOut + 1] = 52;
          rgba[pOut + 2] = 52;
        } else if (lumA - lumB >= lumGate && lumA >= 210) {
          // Light in A, dark in B (added) -> blue
          rgba[pOut] = 30;
          rgba[pOut + 1] = 128;
          rgba[pOut + 2] = 232;
        } else if (lumA < 210 && lumB < 210 && Math.abs(lumA - lumB) <= 75) {
          // Changed colour/content in both -> magenta
          rgba[pOut] = 204;
          rgba[pOut + 1] = 48;
          rgba[pOut + 2] = 152;
        } else if (lumA < lumB) {
          rgba[pOut] = 224;
          rgba[pOut + 1] = 52;
          rgba[pOut + 2] = 52;
        } else if (lumB < lumA) {
          rgba[pOut] = 30;
          rgba[pOut + 1] = 128;
          rgba[pOut + 2] = 232;
        } else {
          rgba[pOut] = 204;
          rgba[pOut + 1] = 48;
          rgba[pOut + 2] = 152;
        }
        rgba[pOut + 3] = 255;
      } else if (mode === 'diff-only') {
        rgba[pOut] = 246;
        rgba[pOut + 1] = 246;
        rgba[pOut + 2] = 248;
        rgba[pOut + 3] = 255;
      } else {
        const avgR = (rA + rB) * 0.5;
        const avgG = (gA + gB) * 0.5;
        const avgB = (bA + bB) * 0.5;
        rgba[pOut] = Math.round(255 - (255 - avgR) * unchangedOpacity);
        rgba[pOut + 1] = Math.round(255 - (255 - avgG) * unchangedOpacity);
        rgba[pOut + 2] = Math.round(255 - (255 - avgB) * unchangedOpacity);
        rgba[pOut + 3] = 255;
      }
    }
  }

  // 8-connected component BFS across marked coarse grid cells.
  const visited = new Uint8Array(gridW * gridH);
  const changedBoxes: NormBox[] = [];
  const queueX = new Int32Array(gridW * gridH);
  const queueY = new Int32Array(gridW * gridH);
  const padPx = Math.max(2, Math.round(cell * 0.2));

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const startIdx = gy * gridW + gx;
      if (grid[startIdx] !== 1 || visited[startIdx] === 1) continue;

      visited[startIdx] = 1;
      let head = 0;
      let tail = 0;
      queueX[tail] = gx;
      queueY[tail] = gy;
      tail++;

      let minGx = gx;
      let maxGx = gx;
      let minGy = gy;
      let maxGy = gy;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;

        if (cx < minGx) minGx = cx;
        if (cx > maxGx) maxGx = cx;
        if (cy < minGy) minGy = cy;
        if (cy > maxGy) maxGy = cy;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= gridH) continue;
          const nRow = ny * gridW;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < 0 || nx >= gridW) continue;
            const nIdx = nRow + nx;
            if (grid[nIdx] === 1 && visited[nIdx] === 0) {
              visited[nIdx] = 1;
              queueX[tail] = nx;
              queueY[tail] = ny;
              tail++;
            }
          }
        }
      }

      const px0 = Math.max(0, minGx * cell - padPx);
      const py0 = Math.max(0, minGy * cell - padPx);
      const px1 = Math.min(width, (maxGx + 1) * cell + padPx);
      const py1 = Math.min(height, (maxGy + 1) * cell + padPx);

      const normX = Math.max(0, Math.min(1, px0 / width));
      const normY = Math.max(0, Math.min(1, py0 / height));
      const normW = Math.max(0, Math.min(1 - normX, (px1 - px0) / width));
      const normH = Math.max(0, Math.min(1 - normY, (py1 - py0) / height));

      if (normW > 0 && normH > 0) {
        changedBoxes.push({ x: normX, y: normY, width: normW, height: normH });
      }
    }
  }

  return {
    rgba,
    width,
    height,
    changedPixels,
    totalPixels,
    changedPercent: (changedPixels / totalPixels) * 100,
    changedBoxes,
  };
}

/**
 * Formats a clean unified-diff style `.txt` report across all compared pages.
 */
export function formatTextDiffSummary(
  nameA: string,
  nameB: string,
  pages: PageTextComparison[],
): string {
  const changedPages = pages.filter((p) => p.hasChanges);
  const totalAdded = pages.reduce((sum, p) => sum + p.addedLines, 0);
  const totalRemoved = pages.reduce((sum, p) => sum + p.removedLines, 0);

  const out: string[] = [
    'PDF Text Comparison Report',
    '==========================',
    `--- ${nameA}`,
    `+++ ${nameB}`,
    `Pages compared: ${pages.length} | Changed pages: ${changedPages.length} | +${totalAdded} / -${totalRemoved} lines`,
    '',
  ];

  if (changedPages.length === 0) {
    out.push(`No text differences found across ${pages.length} page${pages.length === 1 ? '' : 's'}.`);
    return out.join('\n');
  }

  for (const p of pages) {
    if (!p.hasChanges) continue;
    out.push(`@@ Page ${p.page} (+${p.addedLines} / -${p.removedLines} lines) @@`);
    for (const line of p.diff.lines) {
      if (line.type === 'removed') {
        out.push(`- ${line.text}`);
      } else if (line.type === 'added') {
        out.push(`+ ${line.text}`);
      } else {
        out.push(`  ${line.text}`);
      }
    }
    out.push('');
  }

  return out.join('\n');
}
