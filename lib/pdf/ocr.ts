// Client-side OCR engine for searchable PDFs powered by self-hosted Tesseract.js.
// Pure DOM-free helpers (`sanitizeWinAnsiText`, `extractWordsFromTesseractResult`, `injectOcrTextLayer`)
// work in both browsers and Node; `ocrPdf` orchestrates page rendering and recognition in the browser.

import {
  beginText,
  endText,
  PDFArray,
  PDFContext,
  PDFDocument,
  PDFFont,
  PDFOperator,
  PDFPage,
  PDFRef,
  PDFStream,
  popGraphicsState,
  pushGraphicsState,
  setCharacterSqueeze,
  setFontAndSize,
  setTextMatrix,
  setTextRenderingMode,
  showText,
  StandardFonts,
  TextRenderingMode,
} from '@cantoo/pdf-lib';

import { parsePageRanges } from './merge';
import { N, removeUnusedObjects } from './objects';
import { createSelfHostedOcrWorker } from './ocrRuntime';
import { openPdf, renderPage } from './pdfjs';

export interface OcrWordBox {
  text: string;
  /** Left edge in source image pixels (top-left origin). */
  x0: number;
  /** Top edge in source image pixels (top-left origin). */
  y0: number;
  /** Right edge in source image pixels (top-left origin). */
  x1: number;
  /** Bottom edge in source image pixels (top-left origin). */
  y1: number;
  /** Recognition confidence in the range 0..100. */
  confidence: number;
}

export interface OcrPageWords {
  words: OcrWordBox[];
  imageWidth: number;
  imageHeight: number;
  fullText: string;
  avgConfidence: number;
}

export interface OcrProgressUpdate {
  fraction: number;
  label: string;
  page?: number;
  totalPages?: number;
  wordsSoFar?: number;
}

export interface OcrOptions {
  languages: string[];
  customLangFiles?: Map<string, Uint8Array>;
  dpi?: number;
  pageRange?: string;
  skipPagesWithText?: boolean;
  password?: string;
  signal?: AbortSignal;
  onProgress?: (info: OcrProgressUpdate) => void;
}

export interface OcrPageText {
  page: number;
  text: string;
  words: number;
  skipped: boolean;
}

export interface OcrResult {
  bytes: Uint8Array;
  extractedText: string;
  pageTexts: OcrPageText[];
  pagesOcred: number;
  pagesSkipped: number;
  totalWords: number;
  avgConfidence: number;
}

// Unicode code points above U+00FF that are directly representable in PDF WinAnsiEncoding (Windows-1252).
const WINANSI_EXTRA_CODEPOINTS = new Set<number>([
  0x0152, // Œ
  0x0153, // œ
  0x0160, // Š
  0x0161, // š
  0x0178, // Ÿ
  0x017d, // Ž
  0x017e, // ž
  0x0192, // ƒ
  0x02c6, // ˆ
  0x02dc, // ˜
  0x2013, // –
  0x2014, // —
  0x2018, // ‘
  0x2019, // ’
  0x201a, // ‚
  0x201c, // “
  0x201d, // ”
  0x201e, // „
  0x2020, // †
  0x2021, // ‡
  0x2022, // •
  0x2026, // …
  0x2030, // ‰
  0x2039, // ‹
  0x203a, // ›
  0x20ac, // €
  0x2122, // ™
]);

const LIGATURE_AND_PUNCT_MAP: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
  '\u0132': 'IJ',
  '\u0133': 'ij',
  '\u2018': "'",
  '\u2019': "'",
  '\u201A': "'",
  '\u201B': "'",
  '\u2032': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u201E': '"',
  '\u201F': '"',
  '\u2033': '"',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2015': '-',
  '\u2212': '-',
  '\u2026': '...',
  '\u00A0': ' ',
  '\u2000': ' ',
  '\u2001': ' ',
  '\u2002': ' ',
  '\u2003': ' ',
  '\u2004': ' ',
  '\u2005': ' ',
  '\u2006': ' ',
  '\u2007': ' ',
  '\u2008': ' ',
  '\u2009': ' ',
  '\u200A': ' ',
  '\u202F': ' ',
  '\u205F': ' ',
  '\u3000': ' ',
  '\u00AD': '',
  '\u200B': '',
  '\u200C': '',
  '\u200D': '',
  '\uFEFF': '',
};

/**
 * Normalizes and sanitizes text for PDF WinAnsiEncoding (`StandardFonts.Helvetica`).
 * Preserves ASCII and Latin-1/Nordic WinAnsi characters (e.g. `æøåÆØÅäöüÄÖÜéèêëàâçñß`),
 * normalizes smart quotes, dashes, and typographic ligatures, and strips unencodable
 * control/non-WinAnsi code points so `font.encodeText()` never throws.
 */
export function sanitizeWinAnsiText(text: string): string {
  if (!text) return '';
  const composed = text.normalize('NFC');
  let out = '';

  for (const ch of composed) {
    const mapped = LIGATURE_AND_PUNCT_MAP[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }

    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;

    if (cp === 0x09 || cp === 0x0a || cp === 0x0d) {
      out += ' ';
      continue;
    }

    if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa1 && cp <= 0xff && cp !== 0xad) || WINANSI_EXTRA_CODEPOINTS.has(cp)) {
      out += ch;
      continue;
    }

    // Try stripping diacritics via NFKD decomposition for Latin-extended characters (e.g. č, ł, ń -> c, n).
    const decomposed = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (decomposed && decomposed !== ch) {
      for (const dch of decomposed) {
        const dcp = dch.codePointAt(0);
        if (dcp !== undefined && ((dcp >= 0x20 && dcp <= 0x7e) || (dcp >= 0xa1 && dcp <= 0xff && dcp !== 0xad))) {
          out += dch;
        }
      }
    }
  }

  return out;
}

function parseRawWord(raw: unknown): OcrWordBox | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as {
    text?: unknown;
    confidence?: unknown;
    bbox?: { x0?: unknown; y0?: unknown; x1?: unknown; y1?: unknown };
  };
  const text = typeof obj.text === 'string' ? obj.text.trim() : '';
  if (!text) return null;

  const bbox = obj.bbox;
  if (!bbox || typeof bbox !== 'object') return null;
  const x0 = Number(bbox.x0);
  const y0 = Number(bbox.y0);
  const x1 = Number(bbox.x1);
  const y1 = Number(bbox.y1);
  if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
    return null;
  }
  if (x1 <= x0 || y1 <= y0) return null;

  const rawConf = typeof obj.confidence === 'number' && Number.isFinite(obj.confidence) ? obj.confidence : 0;
  const confidence = Math.max(0, Math.min(100, rawConf));

  return { text, x0, y0, x1, y1, confidence };
}

/**
 * Extracts validated word bounding boxes from a `tesseract.js@7.0.0` `RecognizeResult.data` object.
 * Traverses `blocks -> paragraphs -> lines -> words` (with a fallback to flat `data.words` if present).
 */
export function extractWordsFromTesseractResult(data: unknown): OcrWordBox[] {
  if (!data || typeof data !== 'object') return [];
  const rec = data as {
    blocks?: unknown;
    words?: unknown;
  };
  const out: OcrWordBox[] = [];

  if (Array.isArray(rec.blocks)) {
    for (const block of rec.blocks) {
      const paragraphs = (block as { paragraphs?: unknown })?.paragraphs;
      if (!Array.isArray(paragraphs)) continue;
      for (const para of paragraphs) {
        const lines = (para as { lines?: unknown })?.lines;
        if (!Array.isArray(lines)) continue;
        for (const line of lines) {
          const words = (line as { words?: unknown })?.words;
          if (!Array.isArray(words)) continue;
          for (const rawWord of words) {
            const parsed = parseRawWord(rawWord);
            if (parsed) out.push(parsed);
          }
        }
      }
    }
  }

  if (out.length === 0 && Array.isArray(rec.words)) {
    for (const rawWord of rec.words) {
      const parsed = parseRawWord(rawWord);
      if (parsed) out.push(parsed);
    }
  }

  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

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

/**
 * Returns visual upright dimensions `(visW, visH)` and the affine matrix mapping upright visual
 * bottom-left coordinates `(u, v)` into raw PDF page space, honoring `/CropBox` and `/Rotate`.
 */
function uprightPageTransform(page: PDFPage): {
  visW: number;
  visH: number;
  matrix: [number, number, number, number, number, number];
} {
  const [vx0, vy0, vx1, vy1] = getPageVisibleBox(page);
  const rawW = vx1 - vx0;
  const rawH = vy1 - vy0;
  const rot = ((Math.round(page.getRotation().angle / 90) * 90) % 360 + 360) % 360;

  if (rot === 90) {
    return { visW: rawH, visH: rawW, matrix: [0, 1, -1, 0, vx1, vy0] };
  }
  if (rot === 180) {
    return { visW: rawW, visH: rawH, matrix: [-1, 0, 0, -1, vx1, vy1] };
  }
  if (rot === 270) {
    return { visW: rawH, visH: rawW, matrix: [0, -1, 1, 0, vx0, vy1] };
  }
  return { visW: rawW, visH: rawH, matrix: [1, 0, 0, 1, vx0, vy0] };
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
    return raw.asArray().map((item) => (item instanceof PDFRef ? item : ctx.register(item)));
  }
  if (raw instanceof PDFStream) {
    return [ctx.register(raw)];
  }
  return [];
}

function safeEncodeWord(
  font: PDFFont,
  text: string,
): { encoded: ReturnType<PDFFont['encodeText']>; clean: string } | null {
  const clean = sanitizeWinAnsiText(text).trim();
  if (!clean) return null;
  try {
    return { encoded: font.encodeText(clean), clean };
  } catch {
    let fallback = '';
    for (const ch of clean) {
      try {
        font.encodeText(ch);
        fallback += ch;
      } catch {
        // skip unencodable character
      }
    }
    const trimmed = fallback.trim();
    if (!trimmed) return null;
    return { encoded: font.encodeText(trimmed), clean: trimmed };
  }
}

/**
 * Pure DOM-free invisible OCR text-layer injector.
 * Preserves all existing page content, images, annotations, and bookmarks losslessly while
 * appending an invisible (`3 Tr`) selectable/searchable text stream positioned in exact visual
 * alignment over `/CropBox` and `/Rotate`.
 */
export async function injectOcrTextLayer(
  bytes: Uint8Array,
  pageWords: Map<number, OcrPageWords>,
  opts?: { password?: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password: opts?.password });
  const ctx = doc.context;
  const pages = doc.getPages();
  const wasEncrypted = Boolean(
    ctx.trailerInfo.Encrypt ||
      ctx.security ||
      (ctx as { isDecrypted?: boolean }).isDecrypted,
  );

  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const [pageIndex, data] of pageWords.entries()) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pages.length) continue;
    if (!data || !Array.isArray(data.words) || data.words.length === 0) continue;
    if (!Number.isFinite(data.imageWidth) || data.imageWidth <= 0) continue;
    if (!Number.isFinite(data.imageHeight) || data.imageHeight <= 0) continue;

    const page = pages[pageIndex];
    const { visW, visH, matrix } = uprightPageTransform(page);
    if (visW <= 0 || visH <= 0) continue;

    const [a, b, c, d, e, f] = matrix;
    const fontKey = page.node.newFontDictionary('OcrFont', font.ref);

    const ops: PDFOperator[] = [
      pushGraphicsState(),
      beginText(),
      setTextRenderingMode(TextRenderingMode.Invisible),
    ];

    let wordsEmitted = 0;

    for (const word of data.words) {
      if (!word) continue;
      const encodedResult = safeEncodeWord(font, word.text);
      if (!encodedResult) continue;

      const nx0 = clamp(word.x0 / data.imageWidth, 0, 1);
      const ny0 = clamp(word.y0 / data.imageHeight, 0, 1);
      const nx1 = clamp(word.x1 / data.imageWidth, 0, 1);
      const ny1 = clamp(word.y1 / data.imageHeight, 0, 1);
      if (nx1 <= nx0 || ny1 <= ny0) continue;

      const u = nx0 * visW;
      const boxW = (nx1 - nx0) * visW;
      const boxH = (ny1 - ny0) * visH;
      const vBottom = (1 - ny1) * visH;
      const baselineV = vBottom + boxH * 0.18;

      const pdfX = a * u + c * baselineV + e;
      const pdfY = b * u + d * baselineV + f;

      const fontSize = Math.max(4, boxH * 0.85);
      let measuredW = 0;
      try {
        measuredW = font.widthOfTextAtSize(encodedResult.clean, fontSize);
      } catch {
        measuredW = 0;
      }
      const tz = measuredW > 0 ? clamp((boxW / measuredW) * 100, 10, 400) : 100;

      ops.push(
        setFontAndSize(fontKey, round3(fontSize)),
        setCharacterSqueeze(round2(tz)),
        setTextMatrix(a, b, c, d, round3(pdfX), round3(pdfY)),
        showText(encodedResult.encoded),
      );
      wordsEmitted += 1;
    }

    ops.push(endText(), popGraphicsState());

    if (wordsEmitted > 0) {
      const ocrStreamRef = ctx.register(ctx.contentStream(ops));
      const existingRefs = getPageContentRefs(ctx, page);
      if (existingRefs.length > 0) {
        page.node.set(
          N('Contents'),
          ctx.obj([
            ctx.getPushGraphicsStateContentStream(),
            ...existingRefs,
            ctx.getPopGraphicsStateContentStream(),
            ocrStreamRef,
          ]),
        );
      } else {
        page.node.set(N('Contents'), ctx.obj([ocrStreamRef]));
      }
    }
  }

  if (wasEncrypted) {
    removeUnusedObjects(ctx);
  }

  return doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });
}

function createAbortError(): Error {
  const err = new Error('OCR was cancelled.');
  err.name = 'AbortError';
  return err;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function countWordsInText(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

const EXISTING_TEXT_SKIP_THRESHOLD = 20;

/**
 * Browser page-by-page OCR orchestrator.
 * Optionally skips pages that already contain selectable text, renders remaining target pages,
 * runs self-hosted Tesseract.js OCR, and injects an invisible searchable text layer (`3 Tr`).
 */
export async function ocrPdf(bytes: Uint8Array, opts: OcrOptions): Promise<OcrResult> {
  throwIfAborted(opts.signal);

  const dpi = clamp(opts.dpi ?? 200, 72, 600);
  const scale = dpi / 72;
  const skipPagesWithText = opts.skipPagesWithText !== false;
  const languages = opts.languages.length > 0 ? opts.languages : ['eng'];

  const { doc, close } = await openPdf(bytes, opts.password);

  try {
    throwIfAborted(opts.signal);

    let targetIndices: number[];
    if (opts.pageRange && opts.pageRange.trim()) {
      const parsed = parsePageRanges(opts.pageRange, doc.numPages);
      const seen = new Set<number>();
      targetIndices = [];
      for (const idx of parsed) {
        if (!seen.has(idx)) {
          seen.add(idx);
          targetIndices.push(idx);
        }
      }
    } else {
      targetIndices = Array.from({ length: doc.numPages }, (_, i) => i);
    }

    const totalTarget = targetIndices.length;
    const pageTextByIdx = new Map<number, OcrPageText>();
    const pagesToOcr: number[] = [];
    let pagesSkipped = 0;

    // Step 1: Optionally scan target pages for existing selectable text.
    if (skipPagesWithText) {
      for (let i = 0; i < targetIndices.length; i++) {
        throwIfAborted(opts.signal);
        const pageIndex = targetIndices[i];
        const pageNum = pageIndex + 1;
        opts.onProgress?.({
          fraction: (i / Math.max(1, totalTarget)) * 0.08,
          label: `Checking page ${pageNum} of ${doc.numPages} for existing text…`,
          page: pageNum,
          totalPages: totalTarget,
          wordsSoFar: 0,
        });

        const page = await doc.getPage(pageNum);
        try {
          const textContent = await page.getTextContent();
          const joined = textContent.items
            .map((item) => ('str' in item && typeof item.str === 'string' ? item.str : ''))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          const nonWsLen = joined.replace(/\s+/g, '').length;
          if (nonWsLen >= EXISTING_TEXT_SKIP_THRESHOLD) {
            pagesSkipped += 1;
            pageTextByIdx.set(pageIndex, {
              page: pageNum,
              text: joined,
              words: countWordsInText(joined),
              skipped: true,
            });
          } else {
            pagesToOcr.push(pageIndex);
          }
        } finally {
          page.cleanup();
        }
      }
    } else {
      pagesToOcr.push(...targetIndices);
    }

    const pageWords = new Map<number, OcrPageWords>();
    let totalWords = 0;
    let confSum = 0;
    let confWordCount = 0;

    // Step 2: Run self-hosted Tesseract OCR on pages that need recognition.
    if (pagesToOcr.length > 0) {
      throwIfAborted(opts.signal);

      let activePageIdx = -1;
      let activePageNum = 0;

      opts.onProgress?.({
        fraction: 0.1,
        label: `Loading OCR engine (${languages.join(' + ')})…`,
        totalPages: totalTarget,
        wordsSoFar: 0,
      });

      const worker = await createSelfHostedOcrWorker(languages, {
        customLangFiles: opts.customLangFiles,
        onProgress: (info) => {
          if (activePageIdx < 0) {
            opts.onProgress?.({
              fraction: 0.1 + clamp(info.progress, 0, 1) * 0.12,
              label: `${info.status}…`,
              totalPages: totalTarget,
              wordsSoFar: totalWords,
            });
          } else {
            const pageProgress = (activePageIdx + clamp(info.progress, 0, 1)) / Math.max(1, pagesToOcr.length);
            opts.onProgress?.({
              fraction: 0.22 + pageProgress * 0.72,
              label: `Recognizing page ${activePageNum} (${activePageIdx + 1}/${pagesToOcr.length})…`,
              page: activePageNum,
              totalPages: totalTarget,
              wordsSoFar: totalWords,
            });
          }
        },
      });

      const onAbort = () => {
        void worker.terminate().catch(() => undefined);
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        for (let i = 0; i < pagesToOcr.length; i++) {
          throwIfAborted(opts.signal);
          const pageIndex = pagesToOcr[i];
          const pageNum = pageIndex + 1;
          activePageIdx = i;
          activePageNum = pageNum;

          opts.onProgress?.({
            fraction: 0.22 + (i / Math.max(1, pagesToOcr.length)) * 0.72,
            label: `Rendering page ${pageNum} (${i + 1}/${pagesToOcr.length}) at ${dpi} DPI…`,
            page: pageNum,
            totalPages: totalTarget,
            wordsSoFar: totalWords,
          });

          const page = await doc.getPage(pageNum);
          let canvas: HTMLCanvasElement | null = null;
          try {
            canvas = await renderPage(page, scale);
            throwIfAborted(opts.signal);

            const imageWidth = canvas.width;
            const imageHeight = canvas.height;
            const recognized = await worker.recognize(canvas, {}, { blocks: true, text: true });
            throwIfAborted(opts.signal);

            const words = extractWordsFromTesseractResult(recognized.data);
            const rawText = typeof recognized.data.text === 'string' ? recognized.data.text.trim() : '';
            const fullText = rawText || words.map((w) => w.text).join(' ');

            let pageConfSum = 0;
            for (const w of words) {
              pageConfSum += w.confidence;
            }
            const pageAvgConf =
              words.length > 0
                ? pageConfSum / words.length
                : typeof recognized.data.confidence === 'number' && Number.isFinite(recognized.data.confidence)
                  ? recognized.data.confidence
                  : 0;

            totalWords += words.length;
            confSum += pageConfSum;
            confWordCount += words.length;

            pageWords.set(pageIndex, {
              words,
              imageWidth,
              imageHeight,
              fullText,
              avgConfidence: pageAvgConf,
            });

            pageTextByIdx.set(pageIndex, {
              page: pageNum,
              text: fullText,
              words: words.length,
              skipped: false,
            });

            opts.onProgress?.({
              fraction: 0.22 + ((i + 1) / Math.max(1, pagesToOcr.length)) * 0.72,
              label: `Finished page ${pageNum} (${words.length} words)`,
              page: pageNum,
              totalPages: totalTarget,
              wordsSoFar: totalWords,
            });
          } finally {
            if (canvas) {
              canvas.width = 0;
              canvas.height = 0;
            }
            page.cleanup();
          }
        }
      } finally {
        opts.signal?.removeEventListener('abort', onAbort);
        await worker.terminate().catch(() => undefined);
      }
    }

    throwIfAborted(opts.signal);

    // Step 3: Inject invisible text layer into the original PDF losslessly.
    let outBytes: Uint8Array;
    if (pageWords.size > 0) {
      opts.onProgress?.({
        fraction: 0.95,
        label: 'Embedding invisible searchable text layer…',
        totalPages: totalTarget,
        wordsSoFar: totalWords,
      });
      outBytes = await injectOcrTextLayer(bytes, pageWords, { password: opts.password });
    } else {
      outBytes = bytes;
    }

    const pageTexts: OcrPageText[] = targetIndices.map(
      (idx) =>
        pageTextByIdx.get(idx) ?? {
          page: idx + 1,
          text: '',
          words: 0,
          skipped: false,
        },
    );

    const extractedText =
      pageTexts.length > 1
        ? pageTexts.map((p) => `--- Page ${p.page} ---\n${p.text}`).join('\n\n')
        : (pageTexts[0]?.text ?? '');

    const avgConfidence =
      confWordCount > 0 ? Math.round((confSum / confWordCount) * 10) / 10 : 0;

    opts.onProgress?.({
      fraction: 1,
      label: 'Done',
      totalPages: totalTarget,
      wordsSoFar: totalWords,
    });

    return {
      bytes: outBytes,
      extractedText,
      pageTexts,
      pagesOcred: pageWords.size,
      pagesSkipped,
      totalWords,
      avgConfidence,
    };
  } finally {
    await close();
  }
}
