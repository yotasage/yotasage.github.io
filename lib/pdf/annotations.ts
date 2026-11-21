// Inspect, selectively remove, and flatten PDF annotations and interactive AcroForm fields.
import {
  concatTransformationMatrix,
  drawObject,
  PDFArray,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFPage,
  PDFRef,
  PDFStream,
  popGraphicsState,
  pushGraphicsState,
} from '@cantoo/pdf-lib';

import { parsePageRanges } from './merge';
import { N, nameOf, num, removeUnusedObjects } from './objects';

export interface AnnotationSubtypeCount {
  subtype: string;
  count: number;
}

export interface AnnotationSummary {
  totalCount: number;
  subtypes: AnnotationSubtypeCount[];
  pagesWithAnnotations: number;
  pageCount: number;
  acroFormFieldCount: number;
  hasAcroForm: boolean;
}

export interface RemoveAnnotationsOptions {
  /** Subtypes to remove (e.g. ['Text', 'Highlight']). Empty or omitted removes all subtypes. */
  subtypes?: string[];
  /** 1-based page range string (e.g. '1-3, 5'). Empty or omitted targets all pages. */
  pageRange?: string;
  /** Remove /AcroForm from catalog if no Widget annotations remain. Default true. */
  removeAcroFormIfEmpty?: boolean;
}

export interface RemoveAnnotationsResult {
  bytes: Uint8Array;
  removedCount: number;
  remainingCount: number;
}

export interface FlattenOptions {
  /** Flatten interactive AcroForm fields. Default true. */
  flattenForms?: boolean;
  /** Flatten visual non-widget annotations via their /AP /N appearance streams. Default true. */
  flattenAnnotations?: boolean;
  /** Keep Link annotations interactive when flattening annotations. Default true. */
  keepLinks?: boolean;
  /** Optional 1-based page range string for non-widget annotation flattening. Empty = all pages. */
  pageRange?: string;
}

export interface FlattenResult {
  bytes: Uint8Array;
  flattenedFormFields: number;
  flattenedAnnotations: number;
  skippedWithoutAppearance: number;
  keptAnnotations: number;
}

function countAcroFormFields(doc: PDFDocument): number {
  const acro = doc.catalog.AcroForm();
  if (!acro) return 0;
  const fields = acro.lookup(N('Fields'));
  if (!(fields instanceof PDFArray)) return 0;

  let count = 0;
  const visit = (obj: PDFObject, depth: number) => {
    const dict = doc.context.lookup(obj);
    if (!(dict instanceof PDFDict) || depth > 50) return;
    const kids = dict.lookup(N('Kids'));
    const fieldKids =
      kids instanceof PDFArray
        ? kids.asArray().filter((k) => {
            const kid = doc.context.lookup(k);
            return kid instanceof PDFDict && kid.has(N('T'));
          })
        : [];
    if (fieldKids.length > 0) {
      for (const k of fieldKids) visit(k, depth + 1);
    } else {
      count += 1;
    }
  };

  for (const f of fields.asArray()) visit(f, 0);
  return count;
}

function readNumberArray(ctx: PDFContext, obj: PDFObject | undefined, len: number): number[] | null {
  const arr = ctx.lookup(obj);
  if (!(arr instanceof PDFArray) || arr.size() < len) return null;
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    const v = ctx.lookup(arr.get(i));
    if (!(v instanceof PDFNumber)) return null;
    const n = v.asNumber();
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

function resolveNormalAppearance(
  ctx: PDFContext,
  annot: PDFDict,
): { ref: PDFRef; stream: PDFStream } | null {
  const ap = annot.lookup(N('AP'));
  if (!(ap instanceof PDFDict)) return null;

  const nRaw = ap.get(N('N'));
  if (!nRaw) return null;
  const nObj = ctx.lookup(nRaw);

  if (nObj instanceof PDFStream) {
    const ref = nRaw instanceof PDFRef ? nRaw : ctx.register(nObj);
    return { ref, stream: nObj };
  }

  // Appearance state subdictionary (e.g. /N << /On 12 0 R /Off 13 0 R >>).
  if (nObj instanceof PDFDict) {
    const asObj = annot.lookup(N('AS'));
    const asName = asObj instanceof PDFName ? asObj : undefined;
    if (asName) {
      const stateRaw = nObj.get(asName);
      const stateObj = ctx.lookup(stateRaw);
      if (stateObj instanceof PDFStream) {
        const ref = stateRaw instanceof PDFRef ? stateRaw : ctx.register(stateObj);
        return { ref, stream: stateObj };
      }
    }
    for (const [k, v] of nObj.entries()) {
      if (k.decodeText() === 'Off') continue;
      const candidate = ctx.lookup(v);
      if (candidate instanceof PDFStream) {
        const ref = v instanceof PDFRef ? v : ctx.register(candidate);
        return { ref, stream: candidate };
      }
    }
  }

  return null;
}

function getPageContentRefs(ctx: PDFContext, page: PDFPage): PDFRef[] {
  const raw = page.node.get(N('Contents'));
  if (!raw) return [];
  if (raw instanceof PDFRef) {
    const target = ctx.lookup(raw);
    if (target instanceof PDFArray) {
      return target.asArray().filter((x): x is PDFRef => x instanceof PDFRef);
    }
    if (target instanceof PDFStream) return [raw];
    return [];
  }
  if (raw instanceof PDFArray) {
    return raw.asArray().map((item) => {
      if (item instanceof PDFRef) return item;
      return ctx.register(item);
    });
  }
  if (raw instanceof PDFStream) {
    return [ctx.register(raw)];
  }
  return [];
}

/**
 * Computes the transformation matrix placing a Form XObject (/BBox + optional /Matrix)
 * into the annotation's /Rect according to ISO 32000-1 §12.5.5.
 */
function computeAppearancePlacementMatrix(
  ctx: PDFContext,
  annot: PDFDict,
  stream: PDFStream,
): [number, number, number, number, number, number] | null {
  const rect = readNumberArray(ctx, annot.get(N('Rect')), 4);
  if (!rect) return null;

  const rx0 = Math.min(rect[0], rect[2]);
  const ry0 = Math.min(rect[1], rect[3]);
  const rx1 = Math.max(rect[0], rect[2]);
  const ry1 = Math.max(rect[1], rect[3]);
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;
  if (rw <= 0 || rh <= 0) return null;

  const bbox = readNumberArray(ctx, stream.dict.get(N('BBox')), 4) ?? [0, 0, rw, rh];
  const [bx0, by0, bx1, by1] = bbox;
  const matrix = readNumberArray(ctx, stream.dict.get(N('Matrix')), 6) ?? [1, 0, 0, 1, 0, 0];
  const [a, b, c, d, e, f] = matrix;

  const corners: Array<[number, number]> = [
    [bx0, by0],
    [bx1, by0],
    [bx1, by1],
    [bx0, by1],
  ];

  let tx0 = Infinity;
  let ty0 = Infinity;
  let tx1 = -Infinity;
  let ty1 = -Infinity;
  for (const [cx, cy] of corners) {
    const px = a * cx + c * cy + e;
    const py = b * cx + d * cy + f;
    if (px < tx0) tx0 = px;
    if (py < ty0) ty0 = py;
    if (px > tx1) tx1 = px;
    if (py > ty1) ty1 = py;
  }

  const tw = tx1 - tx0;
  const th = ty1 - ty0;
  const sx = tw > 1e-6 ? rw / tw : 1;
  const sy = th > 1e-6 ? rh / th : 1;
  const tx = rx0 - tx0 * sx;
  const ty = ry0 - ty0 * sy;

  return [sx, 0, 0, sy, tx, ty];
}

/**
 * Counts annotations by /Subtype across all pages and reports interactive AcroForm field counts.
 */
export async function inspectAnnotations(bytes: Uint8Array, password?: string): Promise<AnnotationSummary> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const counts = new Map<string, number>();
  let totalCount = 0;
  let pagesWithAnnotations = 0;

  const pages = doc.getPages();
  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    let foundOnPage = 0;
    for (const ref of annots.asArray()) {
      const dict = doc.context.lookup(ref);
      if (!(dict instanceof PDFDict)) continue;
      const subtype = nameOf(dict, 'Subtype') ?? 'Unknown';
      counts.set(subtype, (counts.get(subtype) ?? 0) + 1);
      totalCount += 1;
      foundOnPage += 1;
    }
    if (foundOnPage > 0) pagesWithAnnotations += 1;
  }

  const subtypes: AnnotationSubtypeCount[] = Array.from(counts.entries())
    .map(([subtype, count]) => ({ subtype, count }))
    .sort((a, b) => b.count - a.count || a.subtype.localeCompare(b.subtype));

  const hasAcroForm = Boolean(doc.catalog.AcroForm());
  const acroFormFieldCount = countAcroFormFields(doc);

  return {
    totalCount,
    subtypes,
    pagesWithAnnotations,
    pageCount: pages.length,
    acroFormFieldCount,
    hasAcroForm,
  };
}

/**
 * Selectively removes annotations by subtype and optional page range, cleaning empty /Annots arrays and /AcroForm.
 */
export async function removeAnnotations(
  bytes: Uint8Array,
  options: RemoveAnnotationsOptions = {},
  password?: string,
): Promise<RemoveAnnotationsResult> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const ctx = doc.context;
  const pages = doc.getPages();

  const targetPages =
    options.pageRange && options.pageRange.trim()
      ? new Set(parsePageRanges(options.pageRange, pages.length))
      : new Set(pages.map((_, idx) => idx));

  const targetSubtypes =
    options.subtypes && options.subtypes.length > 0 ? new Set(options.subtypes) : null;

  let removedCount = 0;
  let remainingCount = 0;
  let remainingWidgets = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const annots = page.node.Annots();
    if (!annots) continue;

    const entries = annots.asArray().map((ref) => ({ ref, dict: ctx.lookup(ref) }));

    if (!targetPages.has(i)) {
      for (const { dict } of entries) {
        if (!(dict instanceof PDFDict)) continue;
        remainingCount += 1;
        if (nameOf(dict, 'Subtype') === 'Widget') remainingWidgets += 1;
      }
      continue;
    }

    const toRemove = new Set<PDFDict>();
    for (const { dict } of entries) {
      if (!(dict instanceof PDFDict)) continue;
      const subtype = nameOf(dict, 'Subtype') ?? 'Unknown';
      if (!targetSubtypes || targetSubtypes.has(subtype)) {
        toRemove.add(dict);
      }
    }

    // Remove Popup annotations whose parent annotation is being removed.
    for (const { dict } of entries) {
      if (!(dict instanceof PDFDict) || toRemove.has(dict)) continue;
      if (nameOf(dict, 'Subtype') === 'Popup') {
        const parent = dict.lookup(N('Parent'));
        if (parent instanceof PDFDict && toRemove.has(parent)) {
          toRemove.add(dict);
        }
      }
    }

    const kept = entries.filter(({ dict }) => !(dict instanceof PDFDict) || !toRemove.has(dict));
    removedCount += entries.length - kept.length;

    for (const { dict } of kept) {
      if (!(dict instanceof PDFDict)) continue;
      remainingCount += 1;
      if (nameOf(dict, 'Subtype') === 'Widget') remainingWidgets += 1;
    }

    if (kept.length === 0) {
      page.node.delete(N('Annots'));
    } else if (kept.length !== entries.length) {
      page.node.set(N('Annots'), ctx.obj(kept.map((e) => e.ref)));
    }
  }

  if ((options.removeAcroFormIfEmpty ?? true) && remainingWidgets === 0) {
    doc.catalog.delete(N('AcroForm'));
  }

  removeUnusedObjects(ctx);
  const outBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });

  return {
    bytes: outBytes,
    removedCount,
    remainingCount,
  };
}

/**
 * Flattens interactive AcroForm fields and visual non-widget annotations into static page content.
 */
export async function flattenPdf(
  bytes: Uint8Array,
  options: FlattenOptions = {},
  password?: string,
): Promise<FlattenResult> {
  const flattenForms = options.flattenForms ?? true;
  const flattenAnnotations = options.flattenAnnotations ?? true;
  const keepLinks = options.keepLinks ?? true;

  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const ctx = doc.context;
  const pages = doc.getPages();

  // Protect every page's existing content stream with q ... Q before appending flattened appearances.
  const wrappedPages = new Set<PDFPage>();
  const ensureWrapped = (page: PDFPage) => {
    if (wrappedPages.has(page)) return;
    wrappedPages.add(page);
    const refs = getPageContentRefs(ctx, page);
    if (refs.length > 0) {
      page.node.set(
        N('Contents'),
        ctx.obj([
          ctx.getPushGraphicsStateContentStream(),
          ...refs,
          ctx.getPopGraphicsStateContentStream(),
        ]),
      );
    }
  };

  let flattenedFormFields = 0;
  if (flattenForms && doc.catalog.AcroForm()) {
    for (const page of pages) ensureWrapped(page);
    const form = doc.getForm();
    const fieldsBefore = form.getFields().length;
    try {
      form.flatten({ updateFieldAppearances: true });
    } catch {
      // Fallback when non-WinAnsi characters prevent regenerating default appearances.
      form.flatten({ updateFieldAppearances: false });
    }
    flattenedFormFields = fieldsBefore;
    doc.catalog.delete(N('AcroForm'));
  }

  const targetPages =
    options.pageRange && options.pageRange.trim()
      ? new Set(parsePageRanges(options.pageRange, pages.length))
      : new Set(pages.map((_, idx) => idx));

  let flattenedAnnotations = 0;
  let skippedWithoutAppearance = 0;
  let keptAnnotations = 0;

  if (flattenAnnotations) {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const annots = page.node.Annots();
      if (!annots) continue;

      const entries = annots.asArray().map((ref) => ({ ref, dict: ctx.lookup(ref) }));
      if (!targetPages.has(i)) {
        keptAnnotations += entries.filter((e) => e.dict instanceof PDFDict).length;
        continue;
      }

      const kept: typeof entries = [];
      const operators = [];

      for (const entry of entries) {
        const { dict } = entry;
        if (!(dict instanceof PDFDict)) {
          kept.push(entry);
          continue;
        }

        const subtype = nameOf(dict, 'Subtype') ?? 'Unknown';
        if (subtype === 'Link' && keepLinks) {
          kept.push(entry);
          keptAnnotations += 1;
          continue;
        }

        if (subtype === 'Widget' && !flattenForms) {
          kept.push(entry);
          keptAnnotations += 1;
          continue;
        }

        // Popups are floating UI containers with no static printed representation; drop silently.
        if (subtype === 'Popup') {
          continue;
        }

        // Hidden (bit 2 = 2) or NoView (bit 6 = 32) annotations should not be drawn.
        const flags = num(dict, 'F', 0);
        if ((flags & 2) !== 0 || (flags & 32) !== 0) {
          continue;
        }

        const ap = resolveNormalAppearance(ctx, dict);
        if (!ap) {
          skippedWithoutAppearance += 1;
          kept.push(entry);
          keptAnnotations += 1;
          continue;
        }

        const mat = computeAppearancePlacementMatrix(ctx, dict, ap.stream);
        if (!mat) {
          skippedWithoutAppearance += 1;
          kept.push(entry);
          keptAnnotations += 1;
          continue;
        }

        // Ensure the appearance stream is a valid Form XObject for every viewer.
        ap.stream.dict.set(N('Type'), N('XObject'));
        ap.stream.dict.set(N('Subtype'), N('Form'));

        const xObjName = page.node.newXObject('FlatAnnot', ap.ref);
        operators.push(
          pushGraphicsState(),
          concatTransformationMatrix(mat[0], mat[1], mat[2], mat[3], mat[4], mat[5]),
          drawObject(xObjName),
          popGraphicsState(),
        );
        flattenedAnnotations += 1;
      }

      if (operators.length > 0) {
        ensureWrapped(page);
        const flatStream = ctx.contentStream(operators);
        const flatRef = ctx.register(flatStream);
        const existingRefs = getPageContentRefs(ctx, page);
        page.node.set(N('Contents'), ctx.obj([...existingRefs, flatRef]));
      }

      if (kept.length === 0) {
        page.node.delete(N('Annots'));
      } else if (kept.length !== entries.length) {
        page.node.set(N('Annots'), ctx.obj(kept.map((e) => e.ref)));
      }
    }
  } else {
    for (const page of pages) {
      const annots = page.node.Annots();
      if (!annots) continue;
      for (const ref of annots.asArray()) {
        if (ctx.lookup(ref) instanceof PDFDict) keptAnnotations += 1;
      }
    }
  }

  removeUnusedObjects(ctx);
  const outBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });

  return {
    bytes: outBytes,
    flattenedFormFields,
    flattenedAnnotations,
    skippedWithoutAppearance,
    keptAnnotations,
  };
}
