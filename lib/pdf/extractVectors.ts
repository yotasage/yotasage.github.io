// Form XObject extraction and lossless vector PDF region cropping.
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFPage,
  PDFRawStream,
  PDFRef,
  PDFStream,
} from '@cantoo/pdf-lib';

import { baseName, nextFrame, OutputFile, safeFileName, uid, uniqueNames } from './files';
import { N, removeUnusedObjects } from './objects';

// Rectangle in PDF points (scale = 1, 72 DPI) with origin at the top-left of the
// rendered/rotated page viewport, matching pdf.js `page.getViewport({ scale: 1 })`.
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedFormXObject {
  id: string;
  name: string;
  pdfBytes: Uint8Array;
  widthPt: number;
  heightPt: number;
  pages: number[];
  refKey: string;
}

export interface ExtractFormXObjectsOptions {
  sourceName: string;
  password?: string;
  minSizePt?: number;
}

export interface ExtractRegionSpec {
  pageIndex: number;
  rect: ViewportRect;
}

export interface NamedRegionSpec extends ExtractRegionSpec {
  name: string;
}

function findPageResources(pageNode: PDFDict): PDFDict | undefined {
  let node: PDFDict | undefined = pageNode;
  const seen = new Set<PDFDict>();
  while (node && !seen.has(node)) {
    seen.add(node);
    const res = node.lookup(N('Resources'));
    if (res instanceof PDFDict) return res;
    const parent = node.lookup(N('Parent'));
    node = parent instanceof PDFDict ? parent : undefined;
  }
  return undefined;
}

function readNumberArray(dict: PDFDict, key: string, expectedLen: number): number[] | null {
  const arr = dict.lookup(N(key));
  if (!(arr instanceof PDFArray) || arr.size() < expectedLen) return null;
  const out: number[] = [];
  for (let i = 0; i < expectedLen; i++) {
    const val = dict.context.lookup(arr.get(i));
    if (!(val instanceof PDFNumber)) return null;
    const n = val.asNumber();
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

function hasNonEmptyStream(stream: PDFStream): boolean {
  if (stream instanceof PDFRawStream) return stream.contents.length > 0;
  try {
    return stream.getContents().length > 0;
  } catch {
    return false;
  }
}

interface TransformedBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

function computeFormBBox(dict: PDFDict): TransformedBox | null {
  const bbox = readNumberArray(dict, 'BBox', 4);
  if (!bbox) return null;
  const [x0, y0, x1, y1] = bbox;
  if (x0 === x1 || y0 === y1) return null;

  const matrix = readNumberArray(dict, 'Matrix', 6) ?? [1, 0, 0, 1, 0, 0];
  const [a, b, c, d, e, f] = matrix;

  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of corners) {
    const tx = a * cx + c * cy + e;
    const ty = b * cx + d * cy + f;
    if (tx < minX) minX = tx;
    if (ty < minY) minY = ty;
    if (tx > maxX) maxX = tx;
    if (ty > maxY) maxY = ty;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { minX, minY, maxX, maxY, width, height };
}

function formatPdfNum(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 1e-6) return '0';
  return Number(n.toFixed(4)).toString();
}

function refKeyOf(ref: PDFRef): string {
  return `${ref.objectNumber} ${ref.generationNumber} R`;
}

// Extracts every qualifying Form XObject (/Subtype /Form) as a lossless standalone single-page PDF.
export async function extractFormXObjects(
  bytes: Uint8Array,
  opts: ExtractFormXObjectsOptions,
  onProgress?: (fraction: number, label: string) => void,
): Promise<ExtractedFormXObject[]> {
  const minSizePt = Math.max(1, opts.minSizePt ?? 16);
  onProgress?.(0.05, 'Scanning vector Form XObjects');
  await nextFrame();

  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts.password });
  const context = doc.context;

  interface FormMeta {
    ref: PDFRef;
    refKey: string;
    firstPageIndex: number;
    pages: Set<number>;
    resourceName: string;
    box: TransformedBox;
  }

  const forms = new Map<string, FormMeta>();

  function walkResources(resources: PDFDict | undefined, pageIndex: number, visited: Set<string>) {
    if (!resources) return;
    const xObjects = resources.lookup(N('XObject'));
    if (!(xObjects instanceof PDFDict)) return;

    for (const key of xObjects.keys()) {
      const raw = xObjects.get(key);
      if (!(raw instanceof PDFRef)) continue;
      const rKey = refKeyOf(raw);
      const obj = context.lookup(raw);
      if (!(obj instanceof PDFStream)) continue;
      if (obj.dict.lookup(N('Subtype')) !== N('Form')) continue;

      if (hasNonEmptyStream(obj)) {
        const box = computeFormBBox(obj.dict);
        if (box && box.width >= minSizePt && box.height >= minSizePt) {
          let meta = forms.get(rKey);
          if (!meta) {
            meta = {
              ref: raw,
              refKey: rKey,
              firstPageIndex: pageIndex,
              pages: new Set<number>(),
              resourceName: key instanceof PDFName ? key.decodeText() : 'Form',
              box,
            };
            forms.set(rKey, meta);
          }
          meta.pages.add(pageIndex + 1);
        }
      }

      if (visited.has(rKey)) continue;
      visited.add(rKey);
      const nestedRes = obj.dict.lookup(N('Resources'));
      if (nestedRes instanceof PDFDict) {
        walkResources(nestedRes, pageIndex, visited);
      }
    }
  }

  const srcPages = doc.getPages();
  for (let p = 0; p < srcPages.length; p++) {
    const res = findPageResources(srcPages[p].node);
    walkResources(res, p, new Set<string>());
  }

  const candidates = Array.from(forms.values());
  if (!candidates.length) {
    onProgress?.(1, 'No Form XObjects found');
    return [];
  }

  const stem = safeFileName(baseName(opts.sourceName), 'document');
  const rawNames = candidates.map((c, idx) => {
    const firstPage = Math.min(...c.pages);
    const cleanedRes = safeFileName(c.resourceName, `form-${idx + 1}`);
    return `${stem}-p${firstPage}-${cleanedRes}.pdf`;
  });
  const finalNames = uniqueNames(rawNames);

  const results: ExtractedFormXObject[] = [];
  const catalogStripKeys = [
    'Outlines',
    'PageLabels',
    'StructTreeRoot',
    'AcroForm',
    'OpenAction',
    'AA',
    'Names',
    'Dests',
    'Threads',
    'Metadata',
    'MarkInfo',
  ];
  const pageStripKeys = ['Rotate', 'Annots', 'TrimBox', 'BleedBox', 'ArtBox', 'Thumb', 'B', 'AA', 'StructParents', 'Tabs'];

  for (let i = 0; i < candidates.length; i++) {
    const meta = candidates[i];
    onProgress?.(
      0.15 + (i / candidates.length) * 0.8,
      `Extracting vector figure ${i + 1} of ${candidates.length}`,
    );
    await nextFrame();

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts.password });
    const targetRef = PDFRef.of(meta.ref.objectNumber, meta.ref.generationNumber);
    const targetObj = outDoc.context.lookup(targetRef);
    if (!(targetObj instanceof PDFStream)) continue;

    // Keep only the owning page so all page-tree plumbing stays intact, then replace its contents & box.
    const pageCount = outDoc.getPageCount();
    const keepIndex = Math.min(meta.firstPageIndex, Math.max(0, pageCount - 1));
    for (let p = pageCount - 1; p >= 0; p--) {
      if (p !== keepIndex) outDoc.removePage(p);
    }

    for (const k of catalogStripKeys) outDoc.catalog.delete(N(k));

    const page = outDoc.getPage(0);
    const node = page.node;
    for (const k of pageStripKeys) node.delete(N(k));

    const w = meta.box.width;
    const h = meta.box.height;
    node.set(N('MediaBox'), outDoc.context.obj([0, 0, w, h]));
    node.set(N('CropBox'), outDoc.context.obj([0, 0, w, h]));

    // Attach only the target Form XObject; all its nested resources remain reachable from targetRef.
    const xObjDict = outDoc.context.obj({ Fm0: targetRef });
    const resDict = outDoc.context.obj({ XObject: xObjDict });
    node.set(N('Resources'), resDict);

    // `/Fm0 Do` applies the form's own /Matrix and clips to its /BBox; translating by (-minX, -minY)
    // places the transformed /BBox squarely onto [0, 0, w, h].
    const dx = formatPdfNum(-meta.box.minX);
    const dy = formatPdfNum(-meta.box.minY);
    const contentCmd = `q 1 0 0 1 ${dx} ${dy} cm /Fm0 Do Q`;
    const contentStream = outDoc.context.flateStream(contentCmd);
    const contentRef = outDoc.context.register(contentStream);
    node.set(N('Contents'), contentRef);

    // Drop stale /Encrypt trailer reference (from unlocked encrypted inputs) and all unreachable objects.
    delete outDoc.context.trailerInfo.Encrypt;
    removeUnusedObjects(outDoc.context);

    const pdfBytes = await outDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });

    results.push({
      id: uid(),
      name: finalNames[i],
      pdfBytes,
      widthPt: w,
      heightPt: h,
      pages: Array.from(meta.pages).sort((a, b) => a - b),
      refKey: meta.refKey,
    });
  }

  onProgress?.(1, `Extracted ${results.length} vector figure${results.length === 1 ? '' : 's'}`);
  return results;
}

// Effective visible PDF box ([x0, y0, x1, y1] in raw PDF user space), matching pdf.js viewBox.
function getPageVisibleBox(page: PDFPage): [number, number, number, number] {
  const media = page.getMediaBox();
  const crop = page.getCropBox();

  const mx0 = Math.min(media.x, media.x + media.width);
  const my0 = Math.min(media.y, media.y + media.height);
  const mx1 = Math.max(media.x, media.x + media.width);
  const my1 = Math.max(media.y, media.y + media.height);

  const cx0 = Math.min(crop.x, crop.x + crop.width);
  const cy0 = Math.min(crop.y, crop.y + crop.height);
  const cx1 = Math.max(crop.x, crop.x + crop.width);
  const cy1 = Math.max(crop.y, crop.y + crop.height);

  const vx0 = Math.max(mx0, cx0);
  const vy0 = Math.max(my0, cy0);
  const vx1 = Math.min(mx1, cx1);
  const vy1 = Math.min(my1, cy1);

  if (vx1 <= vx0 || vy1 <= vy0) return [mx0, my0, mx1, my1];
  return [vx0, vy0, vx1, vy1];
}

// Transforms a top-left viewport rect (scale = 1, matching pdf.js getViewport({ scale: 1 }))
// back into raw PDF user-space coordinates, accounting for /CropBox origin and /Rotate (0/90/180/270).
export function viewportRectToPdfBox(
  rect: ViewportRect,
  viewBox: [number, number, number, number],
  rotationDeg: number,
): { x: number; y: number; width: number; height: number } {
  const [vx0, vy0, vx1, vy1] = viewBox;
  const rot = ((Math.round(rotationDeg / 90) * 90) % 360 + 360) % 360;
  const rx = rect.x;
  const ry = rect.y;
  const rw = Math.max(0, rect.width);
  const rh = Math.max(0, rect.height);

  let px0: number;
  let py0: number;
  let px1: number;
  let py1: number;

  if (rot === 90) {
    px0 = vx0 + ry;
    px1 = vx0 + ry + rh;
    py0 = vy0 + rx;
    py1 = vy0 + rx + rw;
  } else if (rot === 180) {
    px0 = vx1 - (rx + rw);
    px1 = vx1 - rx;
    py0 = vy0 + ry;
    py1 = vy0 + ry + rh;
  } else if (rot === 270) {
    px0 = vx1 - (ry + rh);
    px1 = vx1 - ry;
    py0 = vy1 - (rx + rw);
    py1 = vy1 - rx;
  } else {
    px0 = vx0 + rx;
    px1 = vx0 + rx + rw;
    py0 = vy1 - (ry + rh);
    py1 = vy1 - ry;
  }

  // Clamp strictly inside the page's visible box.
  const cx0 = Math.max(vx0, Math.min(vx1, Math.min(px0, px1)));
  const cy0 = Math.max(vy0, Math.min(vy1, Math.min(py0, py1)));
  const cx1 = Math.max(vx0, Math.min(vx1, Math.max(px0, px1)));
  const cy1 = Math.max(vy0, Math.min(vy1, Math.max(py0, py1)));

  return {
    x: cx0,
    y: cy0,
    width: Math.max(1, cx1 - cx0),
    height: Math.max(1, cy1 - cy0),
  };
}

async function cropSinglePageFromDoc(srcDoc: PDFDocument, region: ExtractRegionSpec): Promise<Uint8Array> {
  const pageCount = srcDoc.getPageCount();
  if (region.pageIndex < 0 || region.pageIndex >= pageCount) {
    throw new Error(`Page index ${region.pageIndex} is out of range (1..${pageCount}).`);
  }
  if (region.rect.width <= 0 || region.rect.height <= 0) {
    throw new Error('Crop region must have positive width and height.');
  }

  const outDoc = await PDFDocument.create();
  const [copied] = await outDoc.copyPages(srcDoc, [region.pageIndex]);
  outDoc.addPage(copied);

  const viewBox = getPageVisibleBox(copied);
  const rot = copied.getRotation().angle;
  const pdfBox = viewportRectToPdfBox(region.rect, viewBox, rot);

  copied.setMediaBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);
  copied.setCropBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);
  copied.setTrimBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);
  copied.setArtBox(pdfBox.x, pdfBox.y, pdfBox.width, pdfBox.height);
  copied.node.delete(N('BleedBox'));

  removeUnusedObjects(outDoc.context);
  return outDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}

// Produces a 100% lossless vector single-page PDF cropped strictly to `region.rect` (viewport top-left points).
export async function extractRegionAsPdf(
  bytes: Uint8Array,
  region: ExtractRegionSpec,
  opts?: { password?: string },
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts?.password });
  return cropSinglePageFromDoc(srcDoc, region);
}

// Crops multiple regions in one source load, returning uniquely named single-page vector PDFs.
export async function extractRegionsAsPdfs(
  bytes: Uint8Array,
  regions: NamedRegionSpec[],
  opts?: { password?: string },
  onProgress?: (fraction: number, label: string) => void,
): Promise<OutputFile[]> {
  if (!regions.length) return [];
  onProgress?.(0.05, 'Reading PDF');
  await nextFrame();

  const srcDoc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts?.password });
  const rawNames = regions.map((r, i) => {
    const clean = safeFileName(r.name.replace(/\.pdf$/i, ''), `figure-${i + 1}`);
    return `${clean}.pdf`;
  });
  const finalNames = uniqueNames(rawNames);

  const files: OutputFile[] = [];
  for (let i = 0; i < regions.length; i++) {
    onProgress?.(0.1 + (i / regions.length) * 0.85, `Cropping figure ${i + 1} of ${regions.length}`);
    await nextFrame();
    const pdfBytes = await cropSinglePageFromDoc(srcDoc, regions[i]);
    files.push({ name: finalNames[i], bytes: pdfBytes });
  }

  onProgress?.(1, `Cropped ${files.length} figure${files.length === 1 ? '' : 's'}`);
  return files;
}
