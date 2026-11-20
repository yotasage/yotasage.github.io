// Inline vector figure auto-detection and tighten-to-content snapping.
// Shares path decoding and coordinate transforms with lib/pdf/pdfToSvg.ts.
import type { PDFPageProxy } from 'pdfjs-dist';

import type { ViewportRect } from './extractVectors';
import {
  BBox,
  decodeConstructPathArgs,
  intersectBBox,
  Matrix2D,
  matrixScale,
  multiplyMatrix,
  PathCmd,
  PDFJS_OPS,
  textItemViewportBBox,
  transformBBox,
  transformPathToSvg,
  unionBBox,
} from './pdfToSvg';

export type PrimitiveRole = 'figure' | 'background' | 'border' | 'rule';

export interface VectorPrimitive {
  kind: 'path' | 'image';
  bbox: BBox;
  role: PrimitiveRole;
  segmentCount: number;
  hasFill: boolean;
  hasStroke: boolean;
}

export interface TextBox {
  str: string;
  bbox: BBox;
}

export interface PageVectorIndex {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  primitives: VectorPrimitive[];
  texts: TextBox[];
}

export interface DetectedFigure {
  id: string;
  pageIndex: number;
  rect: ViewportRect;
  pathCount: number;
  imageCount: number;
  textCount: number;
  label: string;
}

export interface DetectFiguresOptions {
  mergeGapPt?: number;
  minSizePt?: number;
  paddingPt?: number;
}

interface WalkState {
  ctm: Matrix2D;
  lineWidth: number;
  clipBBox: BBox;
}

function cloneWalkState(s: WalkState): WalkState {
  return {
    ctm: [...s.ctm] as Matrix2D,
    lineWidth: s.lineWidth,
    clipBBox: { ...s.clipBBox },
  };
}

function classifyPath(
  bbox: BBox,
  pageWidth: number,
  pageHeight: number,
  hasFill: boolean,
  hasStroke: boolean,
  isAxisAlignedRect: boolean,
  segmentCount: number,
): PrimitiveRole {
  const w = bbox.maxX - bbox.minX;
  const h = bbox.maxY - bbox.minY;
  const area = w * h;
  const pageArea = pageWidth * pageHeight;

  // Full-page background fills (cover >85% of page area).
  if (hasFill && isAxisAlignedRect && area > 0.85 * pageArea) {
    return 'background';
  }

  // Full-page borders (stroked rectangles spanning >85% of both page dimensions).
  if (hasStroke && isAxisAlignedRect && w > 0.85 * pageWidth && h > 0.85 * pageHeight) {
    return 'border';
  }

  // Thin header/footer/column separator rules: aspect ratio > 25:1, thickness < 3 pt,
  // spanning > 50% of page width (or height for vertical margin rules).
  const minSide = Math.min(w, h);
  const maxSide = Math.max(w, h);
  const aspect = maxSide / Math.max(0.05, minSide);
  if (minSide < 3 && aspect > 25 && (w > 0.5 * pageWidth || (h > 0.5 * pageHeight && segmentCount <= 5))) {
    return 'rule';
  }

  return 'figure';
}

// Walks a PDF page's operator list and text content once, building a reusable spatial index
// of all vector paths, embedded images, and text boxes in viewport top-left points.
export async function analyzePageVectors(
  page: PDFPageProxy,
  OPS: Record<string, number> = PDFJS_OPS,
): Promise<PageVectorIndex> {
  const viewport = page.getViewport({ scale: 1 });
  const pageWidth = viewport.width;
  const pageHeight = viewport.height;
  const pageBox: BBox = { minX: 0, minY: 0, maxX: pageWidth, maxY: pageHeight };
  const vpTransform = viewport.transform as unknown as Matrix2D;

  const ops = await page.getOperatorList();
  const primitives: VectorPrimitive[] = [];

  let state: WalkState = {
    ctm: [...vpTransform] as Matrix2D,
    lineWidth: 1,
    clipBBox: { ...pageBox },
  };
  const stack: WalkState[] = [];

  let currentPath: PathCmd[] = [];
  let pathCx = 0;
  let pathCy = 0;
  let pendingClip = false;

  function recordPath(cmds: PathCmd[], paintOp: number) {
    const closeSubpath =
      paintOp === OPS.closeStroke ||
      paintOp === OPS.closeFillStroke ||
      paintOp === OPS.closeEOFillStroke;

    const doFill =
      paintOp === OPS.fill ||
      paintOp === OPS.eoFill ||
      paintOp === OPS.fillStroke ||
      paintOp === OPS.eoFillStroke ||
      paintOp === OPS.closeFillStroke ||
      paintOp === OPS.closeEOFillStroke ||
      paintOp === OPS.rawFillPath;

    const doStroke =
      paintOp === OPS.stroke ||
      paintOp === OPS.closeStroke ||
      paintOp === OPS.fillStroke ||
      paintOp === OPS.eoFillStroke ||
      paintOp === OPS.closeFillStroke ||
      paintOp === OPS.closeEOFillStroke;

    const info = transformPathToSvg(cmds, state.ctm, closeSubpath);

    if (info.bbox && (doFill || doStroke)) {
      const scale = matrixScale(state.ctm);
      const pad = doStroke ? Math.max(0.25, (state.lineWidth === 0 ? 0.5 : state.lineWidth * scale) / 2) : 0;
      const expanded: BBox = {
        minX: info.bbox.minX - pad,
        minY: info.bbox.minY - pad,
        maxX: info.bbox.maxX + pad,
        maxY: info.bbox.maxY + pad,
      };
      const clipped = intersectBBox(expanded, state.clipBBox);
      if (clipped && (clipped.maxX - clipped.minX > 0.05 || clipped.maxY - clipped.minY > 0.05)) {
        const role = classifyPath(
          clipped,
          pageWidth,
          pageHeight,
          doFill,
          doStroke,
          info.isAxisAlignedRect,
          info.segmentCount,
        );
        primitives.push({
          kind: 'path',
          bbox: clipped,
          role,
          segmentCount: info.segmentCount,
          hasFill: doFill,
          hasStroke: doStroke,
        });
      }
    }

    if (pendingClip) {
      if (info.bbox) {
        const nextClip = intersectBBox(state.clipBBox, info.bbox);
        if (nextClip) state.clipBBox = nextClip;
      }
      pendingClip = false;
    }
  }

  function recordImage() {
    const imgBox = transformBBox({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, state.ctm);
    const clipped = intersectBBox(imgBox, state.clipBBox);
    if (!clipped) return;
    const w = clipped.maxX - clipped.minX;
    const h = clipped.maxY - clipped.minY;
    if (w < 1 || h < 1) return;
    const role: PrimitiveRole = w * h > 0.85 * pageWidth * pageHeight ? 'background' : 'figure';
    primitives.push({
      kind: 'image',
      bbox: clipped,
      role,
      segmentCount: 4,
      hasFill: true,
      hasStroke: false,
    });
  }

  const { fnArray, argsArray } = ops;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] as unknown[] | null | undefined;

    if (fn === OPS.save) {
      stack.push(cloneWalkState(state));
    } else if (fn === OPS.restore) {
      const prev = stack.pop();
      if (prev) state = prev;
    } else if (fn === OPS.transform && args && args.length >= 6) {
      state.ctm = multiplyMatrix(state.ctm, [
        Number(args[0]),
        Number(args[1]),
        Number(args[2]),
        Number(args[3]),
        Number(args[4]),
        Number(args[5]),
      ]);
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(cloneWalkState(state));
      const matrix = args?.[0] as ArrayLike<number> | null | undefined;
      if (matrix && matrix.length >= 6) {
        state.ctm = multiplyMatrix(state.ctm, [
          Number(matrix[0]),
          Number(matrix[1]),
          Number(matrix[2]),
          Number(matrix[3]),
          Number(matrix[4]),
          Number(matrix[5]),
        ]);
      }
      const bbox = args?.[1] as ArrayLike<number> | null | undefined;
      if (bbox && bbox.length >= 4) {
        const fb = transformBBox(
          { minX: Number(bbox[0]), minY: Number(bbox[1]), maxX: Number(bbox[2]), maxY: Number(bbox[3]) },
          state.ctm,
        );
        const nextClip = intersectBBox(state.clipBBox, fb);
        if (nextClip) state.clipBBox = nextClip;
      }
    } else if (fn === OPS.paintFormXObjectEnd || fn === OPS.endGroup) {
      const prev = stack.pop();
      if (prev) state = prev;
    } else if (fn === OPS.beginGroup) {
      stack.push(cloneWalkState(state));
    } else if (fn === OPS.setLineWidth && args && typeof args[0] === 'number') {
      state.lineWidth = args[0];
    } else if (fn === OPS.setGState && args && Array.isArray(args[0])) {
      for (const entry of args[0] as Array<[string, unknown]>) {
        if (Array.isArray(entry) && entry[0] === 'LW' && typeof entry[1] === 'number') {
          state.lineWidth = entry[1];
        }
      }
    } else if (fn === OPS.clip || fn === OPS.eoClip) {
      pendingClip = true;
    } else if (fn === OPS.constructPath) {
      const decoded = decodeConstructPathArgs(args, OPS);
      if (decoded.paintOp !== null) {
        recordPath(decoded.cmds, decoded.paintOp);
        currentPath = [];
      } else {
        currentPath.push(...decoded.cmds);
      }
    } else if (fn === OPS.moveTo && args && args.length >= 2) {
      pathCx = Number(args[0]);
      pathCy = Number(args[1]);
      currentPath.push({ kind: 'M', x: pathCx, y: pathCy });
    } else if (fn === OPS.lineTo && args && args.length >= 2) {
      pathCx = Number(args[0]);
      pathCy = Number(args[1]);
      currentPath.push({ kind: 'L', x: pathCx, y: pathCy });
    } else if (fn === OPS.curveTo && args && args.length >= 6) {
      pathCx = Number(args[4]);
      pathCy = Number(args[5]);
      currentPath.push({
        kind: 'C',
        x1: Number(args[0]),
        y1: Number(args[1]),
        x2: Number(args[2]),
        y2: Number(args[3]),
        x3: pathCx,
        y3: pathCy,
      });
    } else if (fn === OPS.curveTo2 && args && args.length >= 4) {
      const x3 = Number(args[2]);
      const y3 = Number(args[3]);
      currentPath.push({ kind: 'C', x1: pathCx, y1: pathCy, x2: Number(args[0]), y2: Number(args[1]), x3, y3 });
      pathCx = x3;
      pathCy = y3;
    } else if (fn === OPS.curveTo3 && args && args.length >= 4) {
      const x3 = Number(args[2]);
      const y3 = Number(args[3]);
      currentPath.push({ kind: 'C', x1: Number(args[0]), y1: Number(args[1]), x2: x3, y2: y3, x3, y3 });
      pathCx = x3;
      pathCy = y3;
    } else if (fn === OPS.closePath) {
      currentPath.push({ kind: 'Z' });
    } else if (fn === OPS.rectangle && args && args.length >= 4) {
      const x = Number(args[0]);
      const y = Number(args[1]);
      const w = Number(args[2]);
      const h = Number(args[3]);
      currentPath.push(
        { kind: 'M', x, y },
        { kind: 'L', x: x + w, y },
        { kind: 'L', x: x + w, y: y + h },
        { kind: 'L', x, y: y + h },
        { kind: 'Z' },
      );
      pathCx = x;
      pathCy = y;
    } else if (
      fn === OPS.stroke ||
      fn === OPS.closeStroke ||
      fn === OPS.fill ||
      fn === OPS.eoFill ||
      fn === OPS.fillStroke ||
      fn === OPS.eoFillStroke ||
      fn === OPS.closeFillStroke ||
      fn === OPS.closeEOFillStroke ||
      fn === OPS.endPath
    ) {
      recordPath(currentPath, fn);
      currentPath = [];
    } else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageMaskXObject
    ) {
      recordImage();
    }
  }

  const texts: TextBox[] = [];
  try {
    const textContent = await page.getTextContent();
    for (const rawItem of textContent.items) {
      if (!('str' in rawItem) || !rawItem.str || !rawItem.str.trim()) continue;
      const item = rawItem as { str: string; width: number; height: number; transform: number[] };
      const tBox = textItemViewportBBox(item, vpTransform);
      if (!tBox) continue;
      const clipped = intersectBBox(tBox, pageBox);
      if (clipped) texts.push({ str: item.str, bbox: clipped });
    }
  } catch {
    // Ignore text errors; vector primitives remain usable.
  }

  return {
    pageIndex: Math.max(0, (page.pageNumber ?? 1) - 1),
    pageWidth,
    pageHeight,
    primitives,
    texts,
  };
}

function boxesWithinGap(a: BBox, b: BBox, gap: number): boolean {
  return a.maxX + gap >= b.minX && b.maxX + gap >= a.minX && a.maxY + gap >= b.minY && b.maxY + gap >= a.minY;
}

function clampRect(box: BBox, pad: number, pageWidth: number, pageHeight: number): ViewportRect {
  const minX = Math.max(0, box.minX - pad);
  const minY = Math.max(0, box.minY - pad);
  const maxX = Math.min(pageWidth, box.maxX + pad);
  const maxY = Math.min(pageHeight, box.maxY + pad);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

// Clusters vector primitives and images into candidate inline figures, attaching nearby short labels
// while ignoring page backgrounds, borders, separator rules, prose paragraphs, and isolated stray marks.
export function detectFiguresOnPage(
  index: PageVectorIndex,
  opts?: DetectFiguresOptions,
): DetectedFigure[] {
  const mergeGapPt = Math.max(0, opts?.mergeGapPt ?? 14);
  const minSizePt = Math.max(1, opts?.minSizePt ?? 36);
  const paddingPt = Math.max(0, opts?.paddingPt ?? 4);

  const items = index.primitives.filter((p) => p.role === 'figure');
  const n = items.length;
  if (n === 0) return [];

  // Disjoint-set union (union-find) with spatial grid acceleration for large vector drawings.
  const parent = new Int32Array(n);
  const rank = new Uint8Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function unite(a: number, b: number) {
    let ra = find(a);
    let rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) {
      const tmp = ra;
      ra = rb;
      rb = tmp;
    }
    parent[rb] = ra;
    if (rank[ra] === rank[rb]) rank[ra]++;
  }

  const halfGap = mergeGapPt / 2;
  const cellSize = Math.max(16, mergeGapPt);
  const grid = new Map<string, number[]>();
  const oversized: number[] = [];

  for (let i = 0; i < n; i++) {
    const b = items[i].bbox;
    const gx0 = Math.floor((b.minX - halfGap) / cellSize);
    const gx1 = Math.floor((b.maxX + halfGap) / cellSize);
    const gy0 = Math.floor((b.minY - halfGap) / cellSize);
    const gy1 = Math.floor((b.maxY + halfGap) / cellSize);
    const cellCount = (gx1 - gx0 + 1) * (gy1 - gy0 + 1);

    if (cellCount > 120) {
      oversized.push(i);
      continue;
    }

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gy = gy0; gy <= gy1; gy++) {
        const key = `${gx},${gy}`;
        let bucket = grid.get(key);
        if (!bucket) {
          bucket = [];
          grid.set(key, bucket);
        }
        for (let k = 0; k < bucket.length; k++) {
          const j = bucket[k];
          if (find(i) !== find(j) && boxesWithinGap(b, items[j].bbox, mergeGapPt)) {
            unite(i, j);
          }
        }
        bucket.push(i);
      }
    }
  }

  for (let oi = 0; oi < oversized.length; oi++) {
    const i = oversized[oi];
    const b = items[i].bbox;
    for (let j = 0; j < n; j++) {
      if (i !== j && find(i) !== find(j) && boxesWithinGap(b, items[j].bbox, mergeGapPt)) {
        unite(i, j);
      }
    }
  }

  interface Cluster {
    bbox: BBox;
    pathCount: number;
    imageCount: number;
    textCount: number;
    maxSegments: number;
  }

  const clusters = new Map<number, Cluster>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const item = items[i];
    const existing = clusters.get(root);
    if (!existing) {
      clusters.set(root, {
        bbox: { ...item.bbox },
        pathCount: item.kind === 'path' ? 1 : 0,
        imageCount: item.kind === 'image' ? 1 : 0,
        textCount: 0,
        maxSegments: item.segmentCount,
      });
    } else {
      existing.bbox = unionBBox(existing.bbox, item.bbox);
      if (item.kind === 'path') existing.pathCount++;
      else existing.imageCount++;
      if (item.segmentCount > existing.maxSegments) existing.maxSegments = item.segmentCount;
    }
  }

  // Attach short text labels (axis ticks, legends, diagram annotations) once per cluster
  // without pulling in wide prose paragraphs.
  const maxLabelWidth = 0.45 * index.pageWidth;
  const shortTexts = index.texts.filter((t) => {
    const trimmed = t.str.trim();
    if (!trimmed || trimmed.length > 60) return false;
    return t.bbox.maxX - t.bbox.minX < maxLabelWidth;
  });

  const labelGapPt = 12;
  const surviving: Cluster[] = [];

  for (const cluster of clusters.values()) {
    // Snapshot pre-text bbox so attached labels cannot chain outward into body prose.
    const baseBox = { ...cluster.bbox };
    for (let t = 0; t < shortTexts.length; t++) {
      const tb = shortTexts[t].bbox;
      if (boxesWithinGap(tb, baseBox, labelGapPt)) {
        cluster.bbox = unionBBox(cluster.bbox, tb);
        cluster.textCount++;
      }
    }

    const w = cluster.bbox.maxX - cluster.bbox.minX;
    const h = cluster.bbox.maxY - cluster.bbox.minY;
    const minSide = Math.min(w, h);
    const maxSide = Math.max(w, h);

    if (w < minSizePt || h < minSizePt) continue;
    if (minSide < 12) continue;

    // Require non-trivial content: >=2 primitives, >=1 image, or 1 multi-segment path >= 48 pt.
    const nonTrivial =
      cluster.pathCount >= 2 ||
      cluster.imageCount >= 1 ||
      (cluster.pathCount === 1 && cluster.maxSegments >= 3 && maxSide >= 48);
    if (!nonTrivial) continue;

    surviving.push(cluster);
  }

  // Sort top-to-bottom (grouping figures within 24 pt vertically as one row), then left-to-right.
  surviving.sort((a, b) => {
    const dy = a.bbox.minY - b.bbox.minY;
    if (Math.abs(dy) > 24) return dy;
    return a.bbox.minX - b.bbox.minX;
  });

  return surviving.map((c, i) => ({
    id: `fig-p${index.pageIndex + 1}-${i + 1}`,
    pageIndex: index.pageIndex,
    rect: clampRect(c.bbox, paddingPt, index.pageWidth, index.pageHeight),
    pathCount: c.pathCount,
    imageCount: c.imageCount,
    textCount: c.textCount,
    label: `Figure ${i + 1}`,
  }));
}

function substantiallyInside(box: BBox, container: BBox): boolean {
  const inter = intersectBBox(box, container);
  if (!inter) return false;

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  if (cx >= container.minX && cx <= container.maxX && cy >= container.minY && cy <= container.maxY) {
    return true;
  }

  const boxArea = (box.maxX - box.minX) * (box.maxY - box.minY);
  if (boxArea <= 1e-6) return false;
  const interArea = (inter.maxX - inter.minX) * (inter.maxY - inter.minY);
  return interArea / boxArea >= 0.5;
}

// Snaps a user-drawn viewport rectangle tightly around all non-background vector primitives,
// images, and text boxes substantially inside it. Returns null when nothing lies inside.
export function tightenRegionToContent(
  index: PageVectorIndex,
  rect: ViewportRect,
  paddingPt = 4,
): ViewportRect | null {
  const container: BBox = {
    minX: rect.x,
    minY: rect.y,
    maxX: rect.x + rect.width,
    maxY: rect.y + rect.height,
  };

  let tight: BBox | null = null;

  for (let i = 0; i < index.primitives.length; i++) {
    const p = index.primitives[i];
    if (p.role === 'background' || p.role === 'border') continue;
    if (substantiallyInside(p.bbox, container)) {
      tight = unionBBox(tight, p.bbox);
    }
  }

  for (let i = 0; i < index.texts.length; i++) {
    const t = index.texts[i];
    if (substantiallyInside(t.bbox, container)) {
      tight = unionBBox(tight, t.bbox);
    }
  }

  if (!tight) return null;
  return clampRect(tight, Math.max(0, paddingPt), index.pageWidth, index.pageHeight);
}
