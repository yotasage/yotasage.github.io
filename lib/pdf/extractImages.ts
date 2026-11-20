import {
  decodePDFRawStream, PDFArray, PDFBool, PDFContext, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFObject, PDFRawStream, PDFRef, PDFString,
} from '@cantoo/pdf-lib';

import { baseName, nextFrame, safeFileName, uid, uniqueNames } from './files';
import { decodeRawImageBytes, encodePngRgba, imageComponents, unpredict } from './imageDecode';
import { filterNames, N, num } from './objects';

export interface ExtractedImage {
  id: string;
  name: string;
  bytes: Uint8Array;
  mime: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
  pages: number[];
  lossless: boolean;
}

export interface ExtractImagesResult {
  images: ExtractedImage[];
  skipped: number;
}

export interface ExtractImagesOptions {
  sourceName: string;
  password?: string;
  minSize?: number;
}

interface IndexedColorSpace {
  baseComps: 1 | 3;
  hival: number;
  lut: Uint8Array;
}

const RAW_LUT_FILTERS = new Set(['FlateDecode', 'LZWDecode', 'ASCII85Decode', 'ASCIIHexDecode', 'RunLengthDecode']);

function decodeLookupStream(stream: PDFRawStream): Uint8Array | null {
  const filters = filterNames(stream.dict);
  if (!filters || filters.some((f) => !RAW_LUT_FILTERS.has(f))) return null;
  try {
    let data = filters.length === 0 ? stream.contents : decodePDFRawStream(stream).decode();
    const parms = stream.dict.lookup(N('DecodeParms'));
    const lastParms = parms instanceof PDFArray
      ? (parms.size() > 0 ? stream.dict.context.lookup(parms.get(parms.size() - 1)) : undefined)
      : parms;
    data = unpredict(data, lastParms instanceof PDFDict ? lastParms : undefined);
    return data;
  } catch {
    return null;
  }
}

function parseIndexedColorSpace(cs: PDFObject | undefined, context: PDFContext): IndexedColorSpace | null {
  const resolved = cs instanceof PDFRef ? context.lookup(cs) : cs;
  if (!(resolved instanceof PDFArray) || resolved.size() < 4) return null;
  const family = context.lookup(resolved.get(0));
  if (!(family instanceof PDFName) || family.decodeText() !== 'Indexed') return null;

  const base = context.lookup(resolved.get(1));
  const baseComps = imageComponents(base, context);
  if (!baseComps) return null;

  const hivalObj = context.lookup(resolved.get(2));
  if (!(hivalObj instanceof PDFNumber)) return null;
  const hival = Math.floor(hivalObj.asNumber());
  if (hival < 0 || hival > 255) return null;

  const lookupObj = context.lookup(resolved.get(3));
  let lut: Uint8Array | null = null;
  if (lookupObj instanceof PDFString || lookupObj instanceof PDFHexString) {
    lut = lookupObj.asBytes();
  } else if (lookupObj instanceof PDFRawStream) {
    lut = decodeLookupStream(lookupObj);
  }
  if (!lut || lut.length < baseComps) return null;
  return { baseComps, hival, lut };
}

function parseDecodeArray(dict: PDFDict, comps: number): number[] | null {
  const obj = dict.lookup(N('Decode'));
  if (obj === undefined) return null;
  if (!(obj instanceof PDFArray) || obj.size() !== comps * 2) return null;
  const values: number[] = [];
  for (let i = 0; i < obj.size(); i++) {
    const v = dict.context.lookup(obj.get(i));
    if (!(v instanceof PDFNumber)) return null;
    values.push(v.asNumber());
  }
  return values;
}

function isDefaultDecode(dict: PDFDict, comps: number): boolean {
  if (!dict.has(N('Decode'))) return true;
  const values = parseDecodeArray(dict, comps);
  if (!values) return false;
  for (let i = 0; i < comps; i++) {
    if (values[i * 2] !== 0 || values[i * 2 + 1] !== 1) return false;
  }
  return true;
}

function parseMatte(dict: PDFDict, expectedLen: number): number[] | null {
  const obj = dict.lookup(N('Matte'));
  if (!(obj instanceof PDFArray) || obj.size() !== expectedLen) return null;
  const values: number[] = [];
  for (let i = 0; i < expectedLen; i++) {
    const v = dict.context.lookup(obj.get(i));
    if (!(v instanceof PDFNumber)) return null;
    values.push(v.asNumber());
  }
  return values;
}

function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
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

function recordMaskRefs(dict: PDFDict, maskRefs: Set<PDFRef>) {
  for (const key of ['SMask', 'Mask']) {
    const ref = dict.get(N(key));
    if (ref instanceof PDFRef) maskRefs.add(ref);
  }
}

export async function extractImagesFromPdf(
  bytes: Uint8Array,
  opts: ExtractImagesOptions,
  onProgress?: (fraction: number, label: string) => void,
): Promise<ExtractImagesResult> {
  const minSize = Math.max(1, Math.round(opts.minSize ?? 16));
  onProgress?.(0.05, 'Reading PDF');
  await nextFrame();

  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts.password });
  const context = doc.context;

  const imagePages = new Map<PDFRef, Set<number>>();
  const maskRefs = new Set<PDFRef>();

  // Record every SMask/Mask reference in the document up front so masks are never emitted standalone.
  for (const [, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.lookup(N('Subtype')) === N('Image')) {
      recordMaskRefs(obj.dict, maskRefs);
    }
  }

  function walkResources(resources: PDFDict | undefined, pageNum: number, visitedContainers: Set<PDFRef>) {
    if (!resources) return;
    const xObjects = resources.lookup(N('XObject'));
    if (xObjects instanceof PDFDict) {
      for (const key of xObjects.keys()) {
        const raw = xObjects.get(key);
        if (!(raw instanceof PDFRef)) continue;
        const obj = context.lookup(raw);
        if (!(obj instanceof PDFRawStream)) continue;
        const subtype = obj.dict.lookup(N('Subtype'));
        if (subtype === N('Image')) {
          let pages = imagePages.get(raw);
          if (!pages) {
            pages = new Set<number>();
            imagePages.set(raw, pages);
          }
          pages.add(pageNum);
          recordMaskRefs(obj.dict, maskRefs);
        } else if (subtype === N('Form')) {
          if (visitedContainers.has(raw)) continue;
          visitedContainers.add(raw);
          const formRes = obj.dict.lookup(N('Resources'));
          if (formRes instanceof PDFDict) walkResources(formRes, pageNum, visitedContainers);
        }
      }
    }

    const patterns = resources.lookup(N('Pattern'));
    if (patterns instanceof PDFDict) {
      for (const key of patterns.keys()) {
        const raw = patterns.get(key);
        if (!(raw instanceof PDFRef) || visitedContainers.has(raw)) continue;
        const obj = context.lookup(raw);
        if (!(obj instanceof PDFRawStream)) continue;
        if (num(obj.dict, 'PatternType', 0) !== 1) continue;
        visitedContainers.add(raw);
        const patRes = obj.dict.lookup(N('Resources'));
        if (patRes instanceof PDFDict) walkResources(patRes, pageNum, visitedContainers);
      }
    }
  }

  const pages = doc.getPages();
  for (let p = 0; p < pages.length; p++) {
    const res = findPageResources(pages[p].node);
    walkResources(res, p + 1, new Set<PDFRef>());
  }

  const candidates = Array.from(imagePages.entries()).filter(([ref]) => !maskRefs.has(ref));
  const found: Array<{
    bytes: Uint8Array;
    mime: 'image/jpeg' | 'image/png';
    ext: 'jpg' | 'png';
    width: number;
    height: number;
    pages: number[];
    lossless: boolean;
  }> = [];
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const [ref, pageSet] = candidates[i];
    onProgress?.(0.15 + (i / Math.max(1, candidates.length)) * 0.8, `Extracting image ${i + 1} of ${candidates.length}`);
    await nextFrame();

    const stream = context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) continue;
    const dict = stream.dict;

    const w = num(dict, 'Width', 0);
    const h = num(dict, 'Height', 0);
    if (w <= 0 || h <= 0) continue;
    if (w < minSize || h < minSize) continue;

    const imageMask = dict.lookup(N('ImageMask'));
    if (imageMask instanceof PDFBool && imageMask.asBoolean()) {
      skipped++;
      continue;
    }

    const filters = filterNames(dict);
    if (!filters) {
      skipped++;
      continue;
    }

    const smaskObj = dict.lookup(N('SMask'));
    const smask = smaskObj instanceof PDFRawStream ? smaskObj : null;
    const cs = dict.lookup(N('ColorSpace'));
    const comps = imageComponents(cs, context);
    const sortedPages = Array.from(pageSet).sort((a, b) => a - b);

    // Lossless passthrough for JPEG streams without soft masks or custom inverted /Decode.
    if (filters.length === 1 && filters[0] === 'DCTDecode' && !smask && comps !== null && isDefaultDecode(dict, comps)) {
      found.push({
        bytes: stream.contents.slice(),
        mime: 'image/jpeg',
        ext: 'jpg',
        width: w,
        height: h,
        pages: sortedPages,
        lossless: true,
      });
      continue;
    }

    // Raw decodable image streams -> lossless RGBA PNG.
    const indexed = comps === null ? parseIndexedColorSpace(cs, context) : null;
    if (comps === null && !indexed) {
      skipped++;
      continue;
    }

    const raw = decodeRawImageBytes(stream, filters);
    const expectedLen = w * h * (indexed ? 1 : comps!);
    if (!raw || raw.length < expectedLen) {
      skipped++;
      continue;
    }

    const pixelCount = w * h;
    const rgba = new Uint8ClampedArray(pixelCount * 4);

    if (indexed) {
      const { baseComps, hival, lut } = indexed;
      const maxIndex = Math.min(hival, Math.floor(lut.length / baseComps) - 1);
      if (maxIndex < 0) {
        skipped++;
        continue;
      }
      for (let p = 0; p < pixelCount; p++) {
        const idx = raw[p] > maxIndex ? maxIndex : raw[p];
        const baseOffset = idx * baseComps;
        rgba[p * 4] = lut[baseOffset];
        rgba[p * 4 + 1] = baseComps === 3 ? lut[baseOffset + 1] : lut[baseOffset];
        rgba[p * 4 + 2] = baseComps === 3 ? lut[baseOffset + 2] : lut[baseOffset];
        rgba[p * 4 + 3] = 255;
      }
    } else {
      const decode = dict.has(N('Decode')) ? parseDecodeArray(dict, comps!) : null;
      if (dict.has(N('Decode')) && !decode) {
        skipped++;
        continue;
      }
      const useCustomDecode = decode !== null && !isDefaultDecode(dict, comps!);
      if (comps === 3) {
        for (let p = 0, j = 0; p < pixelCount; p++, j += 3) {
          if (useCustomDecode) {
            rgba[p * 4] = clampByte((decode![0] + (raw[j] / 255) * (decode![1] - decode![0])) * 255);
            rgba[p * 4 + 1] = clampByte((decode![2] + (raw[j + 1] / 255) * (decode![3] - decode![2])) * 255);
            rgba[p * 4 + 2] = clampByte((decode![4] + (raw[j + 2] / 255) * (decode![5] - decode![4])) * 255);
          } else {
            rgba[p * 4] = raw[j];
            rgba[p * 4 + 1] = raw[j + 1];
            rgba[p * 4 + 2] = raw[j + 2];
          }
          rgba[p * 4 + 3] = 255;
        }
      } else {
        for (let p = 0; p < pixelCount; p++) {
          const g = useCustomDecode
            ? clampByte((decode![0] + (raw[p] / 255) * (decode![1] - decode![0])) * 255)
            : raw[p];
          rgba[p * 4] = g;
          rgba[p * 4 + 1] = g;
          rgba[p * 4 + 2] = g;
          rgba[p * 4 + 3] = 255;
        }
      }
    }

    // Apply 8-bit SMask alpha when present with matching dimensions.
    if (smask && num(smask.dict, 'Width', 0) === w && num(smask.dict, 'Height', 0) === h) {
      const alpha = decodeRawImageBytes(smask);
      if (alpha && alpha.length >= pixelCount) {
        const matteComps = indexed ? indexed.baseComps : comps!;
        const matte = parseMatte(smask.dict, matteComps);
        for (let p = 0; p < pixelCount; p++) {
          const a = alpha[p];
          rgba[p * 4 + 3] = a;
          if (matte && a > 0 && a < 255) {
            const af = a / 255;
            const m0 = matte[0] * 255;
            const m1 = (matteComps === 3 ? matte[1] : matte[0]) * 255;
            const m2 = (matteComps === 3 ? matte[2] : matte[0]) * 255;
            rgba[p * 4] = clampByte((rgba[p * 4] - m0 * (1 - af)) / af);
            rgba[p * 4 + 1] = clampByte((rgba[p * 4 + 1] - m1 * (1 - af)) / af);
            rgba[p * 4 + 2] = clampByte((rgba[p * 4 + 2] - m2 * (1 - af)) / af);
          }
        }
      }
    }

    try {
      const png = encodePngRgba(rgba, w, h);
      found.push({
        bytes: png,
        mime: 'image/png',
        ext: 'png',
        width: w,
        height: h,
        pages: sortedPages,
        lossless: true,
      });
    } catch {
      skipped++;
    }
  }

  const stem = safeFileName(baseName(opts.sourceName), 'image');
  const pad = Math.max(2, String(found.length).length);
  const rawNames = found.map((item, i) => `${stem}-img-${String(i + 1).padStart(pad, '0')}.${item.ext}`);
  const finalNames = uniqueNames(rawNames);

  const images: ExtractedImage[] = found.map((item, i) => ({
    id: uid(),
    name: finalNames[i],
    bytes: item.bytes,
    mime: item.mime,
    width: item.width,
    height: item.height,
    pages: item.pages,
    lossless: item.lossless,
  }));

  onProgress?.(1, 'Done');
  return { images, skipped };
}
