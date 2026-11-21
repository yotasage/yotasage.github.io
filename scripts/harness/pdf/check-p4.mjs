// Node verification harness for Phase 4 lib/pdf/* modules (QPDF WASM, self-hosted OCR runtime, etc.).
//   npm run check   (tsx check.mjs && tsx check-p4.mjs)

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { zlibSync } from 'fflate';

import { makeCompressiblePdf, makeMultiPagePdf } from './fixtures.mjs';
import * as compareMod from '../../../lib/pdf/compare.ts';
import * as compressMod from '../../../lib/pdf/compress.ts';
import * as compressContentMod from '../../../lib/pdf/compressContent.ts';
import * as ghostscriptMod from '../../../lib/pdf/ghostscript.ts';
import * as linearizeMod from '../../../lib/pdf/linearize.ts';
import * as ocrMod from '../../../lib/pdf/ocr.ts';
import * as ocrRuntimeMod from '../../../lib/pdf/ocrRuntime.ts';
import * as pdfaMod from '../../../lib/pdf/pdfa.ts';
import * as qpdfMod from '../../../lib/pdf/qpdf.ts';
import * as redactMod from '../../../lib/pdf/redact.ts';
import * as repairMod from '../../../lib/pdf/repair.ts';

// Load @cantoo/pdf-lib via CJS require so PDFDocument/PDFRawStream class identities match lib/pdf/*.ts under tsx.
const require = createRequire(import.meta.url);
const {
  concatTransformationMatrix,
  decodePDFRawStream,
  degrees,
  drawObject,
  PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  popGraphicsState,
  pushGraphicsState,
} = require('@cantoo/pdf-lib');

const { checkQpdf, runQpdf } = qpdfMod.default ?? qpdfMod;
const { inspectPdfA, convertToPdfA } = pdfaMod.default ?? pdfaMod;
const { compressPdfWithGhostscript, runGhostscript } = ghostscriptMod.default ?? ghostscriptMod;
const { OCR_ASSET_PATHS, OCR_LANGUAGES } = ocrRuntimeMod.default ?? ocrRuntimeMod;
const {
  extractWordsFromTesseractResult,
  injectOcrTextLayer,
  sanitizeWinAnsiText,
} = ocrMod.default ?? ocrMod;
const {
  assembleLinesFromTextItems,
  computePixelDiff,
  diffTextLines,
  diffWords,
  formatTextDiffSummary,
} = compareMod.default ?? compareMod;
const { compressPdf } = compressMod.default ?? compressMod;
const { hasLinearizedHeader, inspectLinearization, linearizePdf } = linearizeMod.default ?? linearizeMod;
const { applyRedactions, burnRedactionsIntoRgba, findTextRedactMatches } = redactMod.default ?? redactMod;
const { diagnosePdf, repairPdf } = repairMod.default ?? repairMod;
const {
  computeOtsuThreshold,
  decodeAnyImageToRgba,
  deduplicateSharedObjects,
  encodeRgbaTo1BitPdfStream,
  encodeRgbaToGray8PdfStream,
  measureImageDisplaySizes,
} = compressContentMod.default ?? compressContentMod;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const results = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function check(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true, detail: '' });
  } catch (err) {
    results.push({ name, pass: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

await check('29. P4.1 self-hosted WASM/OCR assets, sequential QPDF runs, and licences', async () => {
  // 29a. Verify all expected self-hosted assets exist and are non-empty
  const expectedFiles = [
    'public/pdf-wasm/qpdf.wasm',
    'public/pdf-wasm/qpdf.js',
    'public/ocr/worker.min.js',
    'public/ocr/core/tesseract-core.wasm.js',
    'public/ocr/core/tesseract-core-lstm.wasm.js',
    'public/ocr/core/tesseract-core-simd.wasm.js',
    'public/ocr/core/tesseract-core-simd-lstm.wasm.js',
    'public/ocr/core/tesseract-core-relaxedsimd.wasm.js',
    'public/ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js',
    'public/ocr/tessdata/eng.traineddata.gz',
    'public/ocr/tessdata/nor.traineddata.gz',
    'public/ocr/tessdata/swe.traineddata.gz',
    'public/ocr/tessdata/dan.traineddata.gz',
    'public/ocr/tessdata/deu.traineddata.gz',
    'public/ocr/tessdata/fra.traineddata.gz',
    'public/ocr/tessdata/spa.traineddata.gz',
  ];

  for (const rel of expectedFiles) {
    const abs = join(repoRoot, rel);
    assert(existsSync(abs), `missing self-hosted asset: ${rel}`);
    const size = statSync(abs).size;
    assert(size > 1000, `self-hosted asset ${rel} unexpectedly small (${size} bytes)`);
  }

  // Verify OCR runtime paths are strictly relative (zero external URLs) and list all 7 languages
  for (const [key, val] of Object.entries(OCR_ASSET_PATHS)) {
    assert(typeof val === 'string' && val.startsWith('/ocr/'), `OCR_ASSET_PATHS.${key} must start with /ocr/ (got ${val})`);
    assert(!/https?:\/\//i.test(val), `OCR_ASSET_PATHS.${key} must not contain external URL`);
  }
  const expectedLangs = ['eng', 'nor', 'swe', 'dan', 'deu', 'fra', 'spa'];
  assert(OCR_LANGUAGES.length === expectedLangs.length, `expected ${expectedLangs.length} OCR languages, got ${OCR_LANGUAGES.length}`);
  for (const code of expectedLangs) {
    assert(OCR_LANGUAGES.some((l) => l.code === code), `OCR_LANGUAGES missing ${code}`);
  }

  // 29b. Run QPDF sequentially: check -> linearize -> check -> invalid PDF -> linearize again
  const syntheticPdf = await makeMultiPagePdf(3);

  const initialCheck = await checkQpdf(syntheticPdf);
  assert(initialCheck.ok, `initial checkQpdf failed (exit ${initialCheck.exitCode}): ${initialCheck.stderr}`);
  assert(initialCheck.exitCode === 0, `expected exit 0 for clean synthetic PDF, got ${initialCheck.exitCode}`);
  assert(!initialCheck.isLinearized, 'fresh pdf-lib document should not be linearized yet');

  const linRes = await runQpdf(syntheticPdf, ['--linearize', '$IN', '$OUT']);
  assert(linRes.exitCode === 0 || linRes.exitCode === 3, `qpdf --linearize failed (exit ${linRes.exitCode}): ${linRes.stderr}`);
  assert(linRes.output && linRes.output.length > 100, 'qpdf --linearize produced empty output');
  const header = new TextDecoder('ascii').decode(linRes.output.subarray(0, 5));
  assert(header === '%PDF-', `linearized output missing %PDF- header (got ${header})`);

  const linCheck = await checkQpdf(linRes.output);
  assert(linCheck.ok, `linearized checkQpdf failed (exit ${linCheck.exitCode}): ${linCheck.stderr}`);
  assert(linCheck.isLinearized, `expected File is linearized in stdout, got:\n${linCheck.stdout}`);

  // Confirm pdf-lib can still load the linearized PDF and page count matches
  const reloaded = await PDFDocument.load(linRes.output, { updateMetadata: false });
  assert(reloaded.getPageCount() === 3, `expected 3 pages after linearization, got ${reloaded.getPageCount()}`);

  // Intentionally invalid PDF: must fail gracefully without throwing or poisoning process.exitCode / subsequent runs
  const corruptBytes = new TextEncoder().encode('%PDF-1.7\nnot a valid pdf body at all\n%%EOF\n');
  const badCheck = await checkQpdf(corruptBytes);
  assert(!badCheck.ok, 'corrupt PDF checkQpdf must report ok=false');
  assert(badCheck.exitCode !== 0, 'corrupt PDF checkQpdf must return non-zero exitCode');
  assert(badCheck.errors.length > 0 || badCheck.stderr.trim().length > 0, 'corrupt PDF must produce error output');
  assert(process.exitCode === undefined || process.exitCode === 0, `qpdf error poisoned process.exitCode (${process.exitCode})`);

  // Subsequent valid run immediately after an error must still succeed cleanly
  const afterErrRes = await runQpdf(syntheticPdf, ['--linearize', '$IN', '$OUT']);
  assert(afterErrRes.exitCode === 0 || afterErrRes.exitCode === 3, `post-error qpdf run failed (exit ${afterErrRes.exitCode})`);
  assert(afterErrRes.output && afterErrRes.output.length > 100, 'post-error qpdf run produced empty output');
  const afterErrCheck = await checkQpdf(afterErrRes.output);
  assert(afterErrCheck.ok && afterErrCheck.isLinearized, 'post-error linearized PDF check failed');

  // 29c. Verify lib/generated/third-party-licenses.json includes QPDF and Tesseract entries
  const licPath = join(repoRoot, 'lib', 'generated', 'third-party-licenses.json');
  assert(existsSync(licPath), 'missing lib/generated/third-party-licenses.json');
  const licJson = JSON.parse(readFileSync(licPath, 'utf8'));

  const pkgNames = new Set((licJson.packages ?? []).map((p) => p.name));
  assert(pkgNames.has('@neslinesli93/qpdf-wasm'), 'third-party-licenses.json packages missing @neslinesli93/qpdf-wasm');
  assert(pkgNames.has('tesseract.js'), 'third-party-licenses.json packages missing tesseract.js');
  assert(pkgNames.has('tesseract.js-core'), 'third-party-licenses.json packages missing tesseract.js-core');

  const pdfWasm = licJson.pdfWasm ?? [];
  assert(pdfWasm.length >= 3, `expected >= 3 pdfWasm licence entries, got ${pdfWasm.length}`);
  assert(pdfWasm.some((e) => /QPDF/i.test(e.name) && e.text.length > 100), 'pdfWasm missing QPDF entry with licence text');
  assert(pdfWasm.some((e) => /Tesseract OCR/i.test(e.name) && /Leptonica/i.test(e.name) && e.text.length > 100), 'pdfWasm missing Tesseract/Leptonica entry');
  assert(pdfWasm.some((e) => /tessdata_fast/i.test(e.name) && e.text.length > 100), 'pdfWasm missing tessdata_fast entry');
});

await check('30. P4.2 stronger compression (CTM image sizing, dedup, CMYK/Indexed/16-bit, 1-bit Otsu, QPDF pass)', async () => {
  // 30a. Real on-page display size via CTM tracking (direct + scaled Form XObject)
  const sizeDoc = await PDFDocument.create();
  const makeRgbImgRef = (doc, w, h, seed) => {
    const raw = new Uint8Array(w * h * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = (i * 37 + seed) & 0xff;
    const flate = zlibSync(raw);
    const dict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: w,
      Height: h,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
      Length: flate.length,
    });
    return doc.context.register(PDFRawStream.of(dict, flate));
  };

  const imARef = makeRgbImgRef(sizeDoc, 400, 200, 1);
  const imBRef = makeRgbImgRef(sizeDoc, 200, 100, 2);

  // Form XObject with /Matrix [0.5 0 0 0.5 0 0] drawing /ImB at 100x80
  const formContent = new TextEncoder().encode('q 100 0 0 80 0 0 cm /ImB Do Q');
  const formFlate = zlibSync(formContent);
  const formDict = sizeDoc.context.obj({
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, 100, 80],
    Matrix: [0.5, 0, 0, 0.5, 0, 0],
    Resources: { XObject: { ImB: imBRef } },
    Filter: 'FlateDecode',
    Length: formFlate.length,
  });
  const formRef = sizeDoc.context.register(PDFRawStream.of(formDict, formFlate));

  const page = sizeDoc.addPage([612, 792]);
  page.node.setXObject(PDFName.of('ImA'), imARef);
  page.node.setXObject(PDFName.of('Fm1'), formRef);
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(144, 0, 0, 72, 50, 500),
    drawObject(PDFName.of('ImA')),
    popGraphicsState(),
    pushGraphicsState(),
    concatTransformationMatrix(2, 0, 0, 3, 10, 10),
    drawObject(PDFName.of('Fm1')),
    popGraphicsState(),
  );

  const savedSizePdf = await sizeDoc.save();
  const reloadedSizeDoc = await PDFDocument.load(savedSizePdf, { updateMetadata: false });
  const measured = measureImageDisplaySizes(reloadedSizeDoc);
  assert(measured.size === 2, `expected 2 measured images, got ${measured.size}`);

  let foundA = null;
  let foundB = null;
  for (const [ref, sz] of measured.entries()) {
    const obj = reloadedSizeDoc.context.lookup(ref);
    const w = obj.dict.lookup(PDFName.of('Width')).asNumber();
    if (w === 400) foundA = sz;
    if (w === 200) foundB = sz;
  }
  assert(foundA && Math.abs(foundA.widthPt - 144) < 0.01 && Math.abs(foundA.heightPt - 72) < 0.01,
    `expected ImA ~144x72 pt, got ${JSON.stringify(foundA)}`);
  assert(foundB && Math.abs(foundB.widthPt - 100) < 0.01 && Math.abs(foundB.heightPt - 120) < 0.01,
    `expected ImB (via scaled Form) ~100x120 pt, got ${JSON.stringify(foundB)}`);

  // 30b. Duplicate image & embedded font stream deduplication
  const dupDoc = await PDFDocument.create();
  // Pseudo-random incompressible payload so Flate won't hide the size difference
  const noisyImage = new Uint8Array(64 * 64 * 3);
  let lcg = 0x12345678;
  for (let i = 0; i < noisyImage.length; i++) {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    noisyImage[i] = (lcg >>> 24) & 0xff;
  }
  const noisyFont = new Uint8Array(16384);
  for (let i = 0; i < noisyFont.length; i++) {
    lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
    noisyFont[i] = (lcg >>> 24) & 0xff;
  }

  const registerNoisyImg = (doc) => {
    const dict = doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: 64,
      Height: 64,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Length: noisyImage.length,
    });
    return doc.context.register(PDFRawStream.of(dict, noisyImage.slice()));
  };
  const registerNoisyFont = (doc) => {
    const fontStreamDict = doc.context.obj({
      Length1: noisyFont.length,
      Length: noisyFont.length,
    });
    const fontStreamRef = doc.context.register(PDFRawStream.of(fontStreamDict, noisyFont.slice()));
    const descDict = doc.context.obj({
      Type: 'FontDescriptor',
      FontName: 'FakeSans',
      Flags: 32,
      FontBBox: [0, -200, 1000, 800],
      ItalicAngle: 0,
      Ascent: 800,
      Descent: -200,
      CapHeight: 700,
      StemV: 80,
      FontFile2: fontStreamRef,
    });
    const descRef = doc.context.register(descDict);
    const fontDict = doc.context.obj({
      Type: 'Font',
      Subtype: 'TrueType',
      BaseFont: 'FakeSans',
      FirstChar: 32,
      LastChar: 32,
      Widths: [250],
      FontDescriptor: descRef,
    });
    return doc.context.register(fontDict);
  };

  const dupImg1 = registerNoisyImg(dupDoc);
  const dupImg2 = registerNoisyImg(dupDoc);
  const dupFont1 = registerNoisyFont(dupDoc);
  const dupFont2 = registerNoisyFont(dupDoc);

  for (let i = 0; i < 2; i++) {
    const p = dupDoc.addPage([300, 300]);
    p.node.setXObject(PDFName.of('Im0'), i === 0 ? dupImg1 : dupImg2);
    p.node.setFontDictionary(PDFName.of('F1'), i === 0 ? dupFont1 : dupFont2);
    p.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(64, 0, 0, 64, 20, 20),
      drawObject(PDFName.of('Im0')),
      popGraphicsState(),
    );
  }
  const dupBeforeBytes = await dupDoc.save({ useObjectStreams: false });
  const dupReloaded = await PDFDocument.load(dupBeforeBytes, { updateMetadata: false });
  const dedupStats = deduplicateSharedObjects(dupReloaded);
  assert(dedupStats.duplicateImagesMerged >= 1, `expected >= 1 duplicate image merged, got ${dedupStats.duplicateImagesMerged}`);
  assert(dedupStats.duplicateFontsMerged >= 1, `expected >= 1 duplicate font merged, got ${dedupStats.duplicateFontsMerged}`);
  const dupAfterBytes = await dupReloaded.save({ useObjectStreams: false });
  assert(dupAfterBytes.length < dupBeforeBytes.length * 0.65,
    `expected significant dedup savings: before=${dupBeforeBytes.length}, after=${dupAfterBytes.length}`);

  // 30c. CMYK, Indexed (4-bit), and 16-bit image decoding via decodeAnyImageToRgba
  const decDoc = await PDFDocument.create();
  const ctx = decDoc.context;

  // CMYK 2x1: pixel0=(255,0,0,0)->(0,255,255), pixel1=(0,128,255,51)->(204,102,0)
  const cmykData = Uint8Array.from([255, 0, 0, 0, 0, 128, 255, 51]);
  const cmykFlate = zlibSync(cmykData);
  const cmykStream = PDFRawStream.of(ctx.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 2,
    Height: 1,
    ColorSpace: 'DeviceCMYK',
    BitsPerComponent: 8,
    Filter: 'FlateDecode',
    Length: cmykFlate.length,
  }), cmykFlate);
  const cmykRgba = decodeAnyImageToRgba(cmykStream, ctx);
  assert(cmykRgba && cmykRgba.originalSpace === 'DeviceCMYK', 'CMYK decode failed');
  assert(cmykRgba.rgba[0] === 0 && cmykRgba.rgba[1] === 255 && cmykRgba.rgba[2] === 255 && cmykRgba.rgba[3] === 255,
    `unexpected CMYK pixel 0: [${Array.from(cmykRgba.rgba.slice(0, 4))}]`);
  assert(cmykRgba.rgba[4] === 204 && cmykRgba.rgba[5] === 102 && cmykRgba.rgba[6] === 0 && cmykRgba.rgba[7] === 255,
    `unexpected CMYK pixel 1: [${Array.from(cmykRgba.rgba.slice(4, 8))}]`);

  // Indexed 4x1 4-bit palette: [Red, Green, Blue, White]
  const idxCs = PDFArray.withContext(ctx);
  idxCs.push(PDFName.of('Indexed'));
  idxCs.push(PDFName.of('DeviceRGB'));
  idxCs.push(PDFNumber.of(3));
  idxCs.push(PDFHexString.of('FF000000FF000000FFFFFFFF'));
  const idxRaw = Uint8Array.from([0x01, 0x23]); // pixels 0, 1, 2, 3
  const idxStream = PDFRawStream.of(ctx.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 4,
    Height: 1,
    ColorSpace: idxCs,
    BitsPerComponent: 4,
    Length: idxRaw.length,
  }), idxRaw);
  const idxRgba = decodeAnyImageToRgba(idxStream, ctx);
  assert(idxRgba && idxRgba.originalSpace === 'Indexed', 'Indexed decode failed');
  assert(idxRgba.rgba[0] === 255 && idxRgba.rgba[1] === 0 && idxRgba.rgba[2] === 0, 'Indexed pixel 0 not red');
  assert(idxRgba.rgba[4] === 0 && idxRgba.rgba[5] === 255 && idxRgba.rgba[6] === 0, 'Indexed pixel 1 not green');
  assert(idxRgba.rgba[8] === 0 && idxRgba.rgba[9] === 0 && idxRgba.rgba[10] === 255, 'Indexed pixel 2 not blue');
  assert(idxRgba.rgba[12] === 255 && idxRgba.rgba[13] === 255 && idxRgba.rgba[14] === 255, 'Indexed pixel 3 not white');

  // 16-bit RGB 2x1: pixel0=(0xFFFF,0x8000,0x0000)->(255,128,0), pixel1=(0x0000,0x4000,0xFFFF)->(0,64,255)
  const raw16 = Uint8Array.from([
    0xff, 0xff, 0x80, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x40, 0x00, 0xff, 0xff,
  ]);
  const flate16 = zlibSync(raw16);
  const stream16 = PDFRawStream.of(ctx.obj({
    Type: 'XObject',
    Subtype: 'Image',
    Width: 2,
    Height: 1,
    ColorSpace: 'DeviceRGB',
    BitsPerComponent: 16,
    Filter: 'FlateDecode',
    Length: flate16.length,
  }), flate16);
  const rgba16 = decodeAnyImageToRgba(stream16, ctx);
  assert(rgba16 && rgba16.width === 2 && rgba16.height === 1, '16-bit RGB decode failed');
  assert(rgba16.rgba[0] === 255 && Math.abs(rgba16.rgba[1] - 128) <= 1 && rgba16.rgba[2] === 0,
    `unexpected 16-bit pixel 0: [${Array.from(rgba16.rgba.slice(0, 4))}]`);
  assert(rgba16.rgba[4] === 0 && Math.abs(rgba16.rgba[5] - 64) <= 1 && rgba16.rgba[6] === 255,
    `unexpected 16-bit pixel 1: [${Array.from(rgba16.rgba.slice(4, 8))}]`);

  // 30d. Otsu threshold + 1-bit B&W Flate & 8-bit Gray Flate encoding
  const bwW = 100;
  const bwH = 80;
  const bwRgba = new Uint8ClampedArray(bwW * bwH * 4);
  for (let y = 0; y < bwH; y++) {
    const isInk = y % 10 < 3;
    const val = isInk ? 15 : 245;
    for (let x = 0; x < bwW; x++) {
      const p = (y * bwW + x) * 4;
      bwRgba[p] = val;
      bwRgba[p + 1] = val;
      bwRgba[p + 2] = val;
      bwRgba[p + 3] = 255;
    }
  }
  const { compressed: bw1Bit, threshold } = encodeRgbaTo1BitPdfStream(bwRgba, bwW, bwH);
  const gray8Flate = encodeRgbaToGray8PdfStream(bwRgba, bwW, bwH);
  const rawRgbSize = bwW * bwH * 3;
  assert(threshold > 15 && threshold < 245, `unexpected Otsu threshold ${threshold} (expected between 15 and 245)`);
  assert(bw1Bit.length < rawRgbSize / 20, `expected 1-bit Flate (${bw1Bit.length} B) << raw RGB (${rawRgbSize} B)`);
  assert(gray8Flate.length < rawRgbSize / 10, `expected 8-bit gray Flate (${gray8Flate.length} B) << raw RGB (${rawRgbSize} B)`);
  const otsuDirect = computeOtsuThreshold(Uint8Array.from([10, 10, 10, 240, 240, 240]));
  assert(otsuDirect > 10 && otsuDirect < 240, `unexpected direct Otsu threshold ${otsuDirect}`);

  // 30e. End-to-end compressPdf in Node with deduplicateObjects + qpdfOptimize
  const compRes = await compressPdf(dupBeforeBytes, {
    images: false,
    maxDpi: 150,
    quality: 75,
    rasterize: false,
    removeMetadata: false,
    deduplicateObjects: true,
    qpdfOptimize: true,
  });
  assert(compRes.duplicateImagesMerged >= 1, `compressPdf expected >= 1 duplicate image merged`);
  assert(compRes.duplicateFontsMerged >= 1, `compressPdf expected >= 1 duplicate font merged`);
  assert(compRes.bytes.length < dupBeforeBytes.length,
    `compressPdf output (${compRes.bytes.length}) should be smaller than input (${dupBeforeBytes.length})`);
  const qpdfCheck = await checkQpdf(compRes.bytes);
  assert(qpdfCheck.ok, `compressPdf+QPDF output failed checkQpdf: ${qpdfCheck.stderr}`);
  const finalReload = await PDFDocument.load(compRes.bytes, { updateMetadata: false });
  assert(finalReload.getPageCount() === 2, `expected 2 pages after compressPdf, got ${finalReload.getPageCount()}`);

  console.log(
    `      [metrics] dedup: ${dupBeforeBytes.length} -> ${dupAfterBytes.length} B ` +
    `(imgs=${dedupStats.duplicateImagesMerged}, fonts=${dedupStats.duplicateFontsMerged}); ` +
    `1-bit Otsu (t=${threshold}): ${rawRgbSize} -> ${bw1Bit.length} B; ` +
    `compressPdf+QPDF: ${dupBeforeBytes.length} -> ${compRes.bytes.length} B (qpdfSaved=${compRes.qpdfSavedBytes ?? 0} B)`,
  );
});

await check('31. P4.3 linearize.ts (inspect, linearize with object streams + recompress, verify Fast Web View)', async () => {
  const syntheticPdf = await makeMultiPagePdf(3);

  const before = await inspectLinearization(syntheticPdf);
  assert(before.ok, `inspectLinearization should report ok=true on valid synthetic PDF (errors: ${before.errors.join('; ')})`);
  assert(before.isLinearized === false, 'fresh synthetic PDF must report isLinearized=false');
  assert(before.pdfVersion && /^\d+\.\d+$/.test(before.pdfVersion), `expected valid pdfVersion, got ${before.pdfVersion}`);
  assert(before.isEncrypted === false, 'synthetic PDF must not be marked encrypted');

  const result = await linearizePdf(syntheticPdf, {
    objectStreams: true,
    recompressStreams: true,
  });
  assert(result.isLinearized === true, 'linearizePdf result.isLinearized must be true');
  assert(hasLinearizedHeader(result.bytes) === true, 'hasLinearizedHeader must return true on linearized output');
  assert(result.beforeBytes === syntheticPdf.length, 'beforeBytes mismatch');
  assert(result.afterBytes === result.bytes.length, 'afterBytes mismatch');

  const verify = await checkQpdf(result.bytes);
  assert(verify.ok === true, `checkQpdf failed on linearized PDF: ${verify.stderr}`);
  assert(verify.isLinearized === true, 'checkQpdf must report isLinearized=true on linearized output');

  const reloaded = await PDFDocument.load(result.bytes, { updateMetadata: false });
  assert(reloaded.getPageCount() === 3, `expected 3 pages after linearization, got ${reloaded.getPageCount()}`);
});

await check('32. P4.3 repair.ts (corrupt xref + trailing junk, leading garbage + truncated EOF, explicit pdflib strategy)', async () => {
  // Build a classic 3-page PDF without object streams so it has a textual xref table we can corrupt cleanly.
  const basePdfBytes = await makeMultiPagePdf(3);
  const baseDoc = await PDFDocument.load(basePdfBytes, { updateMetadata: false });
  const classicPdf = await baseDoc.save({ useObjectStreams: false });

  // Case A: Corrupt xref table offsets (leaving binary streams untouched) + append trailing junk bytes after %%EOF
  const latin1 = new TextDecoder('latin1').decode(classicPdf);
  const xrefPos = latin1.indexOf('xref\n');
  assert(xrefPos > 0, 'classic PDF fixture must contain textual xref table');
  const xrefTail = latin1.slice(xrefPos);
  const corruptedTail = xrefTail.replace(/\d{10} 00000 n/g, '0000009999 00000 n');
  assert(corruptedTail !== xrefTail, 'failed to mutate xref table entries for test case A');
  const tailWithJunk = `${corruptedTail}\nTRAILING_GARBAGE_BYTES_AFTER_EOF_1234567890`;
  const tailBytes = new TextEncoder().encode(tailWithJunk);
  const caseA = new Uint8Array(xrefPos + tailBytes.length);
  caseA.set(classicPdf.subarray(0, xrefPos), 0);
  caseA.set(tailBytes, xrefPos);

  const diagA = await diagnosePdf(caseA);
  assert(diagA.needsRepair === true, 'case A diagnosePdf must flag needsRepair=true');
  assert(diagA.trailingGarbageBytes > 0, `case A must detect trailing garbage, got ${diagA.trailingGarbageBytes}`);
  assert(diagA.issues.length > 0, 'case A must report issues');

  const repairA = await repairPdf(caseA);
  assert(repairA.strategyUsed === 'qpdf', `case A expected strategyUsed="qpdf", got "${repairA.strategyUsed}"`);
  assert(repairA.verifiedOk === true, `case A expected verifiedOk=true (warnings: ${repairA.warnings.join('; ')})`);
  assert(repairA.pagesRecovered === 3, `case A expected 3 pagesRecovered, got ${repairA.pagesRecovered}`);
  const reloadA = await PDFDocument.load(repairA.bytes, { updateMetadata: false });
  assert(reloadA.getPageCount() === 3, `case A reloaded doc expected 3 pages, got ${reloadA.getPageCount()}`);

  // Case B: Prepend 128 bytes of garbage before %PDF- and truncate %%EOF
  const eofIdx = latin1.lastIndexOf('%%EOF');
  assert(eofIdx > 0, 'classic PDF fixture must contain %%EOF');
  const truncated = classicPdf.subarray(0, eofIdx);
  const caseB = new Uint8Array(128 + truncated.length);
  caseB.fill(0x58, 0, 128); // 128 'X' bytes of leading junk
  caseB.set(truncated, 128);

  const diagB = await diagnosePdf(caseB);
  assert(diagB.hasHeader === true, 'case B should still locate %PDF- header after leading junk');
  assert(diagB.headerOffset === 128, `case B expected headerOffset=128, got ${diagB.headerOffset}`);
  assert(diagB.hasEof === false, 'case B must detect missing %%EOF');
  assert(diagB.needsRepair === true, 'case B must flag needsRepair=true');

  const repairB = await repairPdf(caseB);
  assert(repairB.verifiedOk === true, `case B expected verifiedOk=true (warnings: ${repairB.warnings.join('; ')})`);
  assert(repairB.pagesRecovered === 3, `case B expected 3 pagesRecovered, got ${repairB.pagesRecovered}`);
  const reloadB = await PDFDocument.load(repairB.bytes, { updateMetadata: false });
  assert(reloadB.getPageCount() === 3, `case B reloaded doc expected 3 pages, got ${reloadB.getPageCount()}`);

  // Case C: Explicit strategy='pdflib' recovers all 3 pages cleanly into a valid PDF
  const repairC = await repairPdf(caseB, { strategy: 'pdflib' });
  assert(repairC.strategyUsed === 'pdflib', `case C expected strategyUsed="pdflib", got "${repairC.strategyUsed}"`);
  assert(repairC.verifiedOk === true, `case C expected verifiedOk=true (warnings: ${repairC.warnings.join('; ')})`);
  assert(repairC.pagesRecovered === 3, `case C expected 3 pagesRecovered, got ${repairC.pagesRecovered}`);
  const checkC = await checkQpdf(repairC.bytes);
  assert(checkC.ok === true, `case C checkQpdf failed: ${checkC.stderr}`);
  const reloadC = await PDFDocument.load(repairC.bytes, { updateMetadata: false });
  assert(reloadC.getPageCount() === 3, `case C reloaded doc expected 3 pages, got ${reloadC.getPageCount()}`);
});

await check('33. P4.4 compare.ts (reading-order lines, text/word LCS diff, RGBA pixel diff + changedBoxes, text report)', async () => {
  // 33a. Reading-order line reconstruction from unordered positioned items across 3 lines
  const unorderedItems = [
    { str: 'Line 3 end.', x: 80, y: 660, width: 55, height: 12 },
    { str: 'World', x: 52, y: 700, width: 32, height: 12 },
    { str: 'Second', x: 10, y: 680.5, width: 40, height: 12 },
    { str: 'Hello', x: 10, y: 700, width: 30, height: 12 },
    { str: 'line', x: 56, y: 680, width: 20, height: 12 },
    { str: 'Line 3', x: 10, y: 660.4, width: 34, height: 12 },
    { str: 'here', x: 82, y: 679.8, width: 24, height: 12 },
    { str: '!', x: 84.5, y: 700, width: 4, height: 12 },
  ];
  const assembled = assembleLinesFromTextItems(unorderedItems);
  assert(assembled.length === 3, `expected 3 assembled lines, got ${assembled.length}: ${JSON.stringify(assembled)}`);
  assert(assembled[0] === 'Hello World!', `unexpected line 0: "${assembled[0]}"`);
  assert(assembled[1] === 'Second line here', `unexpected line 1: "${assembled[1]}"`);
  assert(assembled[2] === 'Line 3 Line 3 end.', `unexpected line 2: "${assembled[2]}"`);

  // 33b. diffTextLines & diffWords: identical arrays
  const sameDiff = diffTextLines(['Alpha', 'Beta', 'Gamma'], ['Alpha', 'Beta', 'Gamma']);
  assert(sameDiff.hasChanges === false, 'identical lines must report hasChanges=false');
  assert(sameDiff.addedLines === 0 && sameDiff.removedLines === 0, 'identical lines must have 0 added/removed');
  assert(sameDiff.unchangedLines === 3, `expected 3 unchangedLines, got ${sameDiff.unchangedLines}`);

  // 33c. diffTextLines & diffWords: modified paragraph with inline word highlights
  const linesA = [
    'Project Overview',
    'The quick brown fox jumps over the lazy dog.',
    'Budget: 1000 USD',
    'End of section.',
  ];
  const linesB = [
    'Project Overview',
    'The quick red fox leaps over the lazy dog.',
    'Budget: 1250 USD',
    'Approved by review.',
    'End of section.',
  ];
  const modDiff = diffTextLines(linesA, linesB);
  assert(modDiff.hasChanges === true, 'modified paragraph must report hasChanges=true');
  assert(modDiff.removedLines === 2, `expected 2 removedLines, got ${modDiff.removedLines}`);
  assert(modDiff.addedLines === 3, `expected 3 addedLines, got ${modDiff.addedLines}`);
  assert(modDiff.unchangedLines === 2, `expected 2 unchangedLines, got ${modDiff.unchangedLines}`);

  const removedFox = modDiff.lines.find((l) => l.type === 'removed' && l.text.includes('brown'));
  const addedFox = modDiff.lines.find((l) => l.type === 'added' && l.text.includes('red'));
  assert(removedFox?.chunks && addedFox?.chunks, 'paired removed/added lines must include inline word chunks');
  assert(
    removedFox.chunks.some((c) => c.type === 'removed' && c.text.includes('brown')),
    `expected "brown" highlighted as removed in chunks: ${JSON.stringify(removedFox.chunks)}`,
  );
  assert(
    addedFox.chunks.some((c) => c.type === 'added' && c.text.includes('red')),
    `expected "red" highlighted as added in chunks: ${JSON.stringify(addedFox.chunks)}`,
  );

  const directWords = diffWords('Version 1.0 draft', 'Version 2.0 final');
  assert(
    directWords.chunksA.some((c) => c.type === 'removed' && c.text.includes('1')) &&
      directWords.chunksB.some((c) => c.type === 'added' && c.text.includes('2')),
    'diffWords must highlight exact changed tokens',
  );

  // 33d. computePixelDiff: identical 64x64 RGBA buffers
  const w = 64;
  const h = 64;
  const whiteA = new Uint8ClampedArray(w * h * 4).fill(255);
  const whiteB = new Uint8ClampedArray(w * h * 4).fill(255);
  const samePx = computePixelDiff(whiteA, w, h, whiteB, w, h);
  assert(samePx.changedPixels === 0, `expected 0 changedPixels on identical images, got ${samePx.changedPixels}`);
  assert(samePx.changedPercent === 0, `expected 0 changedPercent, got ${samePx.changedPercent}`);
  assert(samePx.changedBoxes.length === 0, `expected 0 changedBoxes, got ${samePx.changedBoxes.length}`);

  // 33e. computePixelDiff: modified 12x12 dark patch in B on white background
  const patchedB = whiteB.slice();
  for (let y = 20; y < 32; y++) {
    for (let x = 24; x < 36; x++) {
      const p = (y * w + x) * 4;
      patchedB[p] = 20;
      patchedB[p + 1] = 20;
      patchedB[p + 2] = 20;
      patchedB[p + 3] = 255;
    }
  }
  const patchPx = computePixelDiff(whiteA, w, h, patchedB, w, h);
  assert(patchPx.changedPixels === 144, `expected 144 changedPixels for 12x12 patch, got ${patchPx.changedPixels}`);
  assert(patchPx.changedBoxes.length >= 1, `expected >= 1 changedBox, got ${patchPx.changedBoxes.length}`);
  const centerIdx = (26 * w + 30) * 4;
  assert(
    patchPx.rgba[centerIdx] === 30 &&
      patchPx.rgba[centerIdx + 1] === 128 &&
      patchPx.rgba[centerIdx + 2] === 232 &&
      patchPx.rgba[centerIdx + 3] === 255,
    `expected blue (30,128,232) inside added dark patch, got (${patchPx.rgba[centerIdx]},${patchPx.rgba[centerIdx + 1]},${patchPx.rgba[centerIdx + 2]},${patchPx.rgba[centerIdx + 3]})`,
  );

  // 33f. computePixelDiff: mismatched dimensions (64x64 vs 80x64)
  const wideB = new Uint8ClampedArray(80 * 64 * 4).fill(255);
  const mismatchPx = computePixelDiff(whiteA, 64, 64, wideB, 80, 64);
  assert(
    mismatchPx.width === 80 && mismatchPx.height === 64,
    `expected mismatched output 80x64, got ${mismatchPx.width}x${mismatchPx.height}`,
  );
  assert(mismatchPx.changedPixels === 0, `white-padded mismatched images should have 0 changedPixels, got ${mismatchPx.changedPixels}`);

  // 33g. formatTextDiffSummary produces expected headers and +/- markers
  const report = formatTextDiffSummary('orig.pdf', 'rev.pdf', [
    {
      page: 1,
      addedLines: modDiff.addedLines,
      removedLines: modDiff.removedLines,
      hasChanges: modDiff.hasChanges,
      diff: modDiff,
    },
    {
      page: 2,
      addedLines: 0,
      removedLines: 0,
      hasChanges: false,
      diff: sameDiff,
    },
  ]);
  assert(report.includes('--- orig.pdf') && report.includes('+++ rev.pdf'), 'report missing file headers');
  assert(report.includes('@@ Page 1 (+3 / -2 lines) @@'), 'report missing page hunk header');
  assert(report.includes('- Budget: 1000 USD') && report.includes('+ Budget: 1250 USD'), 'report missing +/- diff lines');
});

await check('34. P4.5 redact.ts (multi-span text/regex/PII matching, RGBA pixel burn, lossless+flattened applyRedactions & metadata scrub)', async () => {
  // 34a. Multi-span visual line matching: substring & case-insensitive
  const spans = [
    { str: 'Contact', x: 0.1, y: 0.1, width: 0.12, height: 0.02 },
    { str: 'Secret', x: 0.24, y: 0.101, width: 0.1, height: 0.02 },
    { str: 'Project', x: 0.36, y: 0.099, width: 0.12, height: 0.02 },
    { str: 'alice@example.org', x: 0.1, y: 0.2, width: 0.25, height: 0.02 },
    { str: 'Phone: +1 (555) 123-4567', x: 0.1, y: 0.3, width: 0.35, height: 0.02 },
    { str: 'Visit https://secret.example.com/docs', x: 0.1, y: 0.4, width: 0.45, height: 0.02 },
    { str: 'Date: 2026-11-21 Server: 192.168.1.42', x: 0.1, y: 0.5, width: 0.5, height: 0.02 },
  ];

  const subMatches = findTextRedactMatches(0, spans, { text: 'secret project', caseSensitive: false });
  assert(subMatches.length === 1, `expected 1 cross-span match, got ${subMatches.length}`);
  assert(
    subMatches[0].x >= 0 &&
      subMatches[0].y >= 0 &&
      subMatches[0].x + subMatches[0].width <= 1 &&
      subMatches[0].y + subMatches[0].height <= 1,
    `cross-span match box out of [0,1]: ${JSON.stringify(subMatches[0])}`,
  );
  assert(
    subMatches[0].x <= 0.24 && subMatches[0].x + subMatches[0].width >= 0.48,
    `cross-span match box did not cover both spans: ${JSON.stringify(subMatches[0])}`,
  );

  const regexMatches = findTextRedactMatches(0, spans, { text: 'Server:\\s+\\d+\\.\\d+', regex: true });
  assert(regexMatches.length === 1, `expected 1 regex match, got ${regexMatches.length}`);

  for (const preset of ['emails', 'phones', 'urls', 'dates', 'ipv4']) {
    const pii = findTextRedactMatches(0, spans, { preset });
    assert(pii.length === 1, `expected 1 match for PII preset "${preset}", got ${pii.length}`);
    assert(pii[0].source === 'pii', `expected source="pii" for "${preset}", got "${pii[0].source}"`);
    assert(
      pii[0].x >= 0 && pii[0].y >= 0 && pii[0].width > 0 && pii[0].height > 0 && pii[0].x + pii[0].width <= 1 && pii[0].y + pii[0].height <= 1,
      `PII preset "${preset}" box out of bounds: ${JSON.stringify(pii[0])}`,
    );
  }

  // 34b. burnRedactionsIntoRgba on 40x40 white RGBA buffer with centered 20x20 black box
  const bufW = 40;
  const bufH = 40;
  const rgba = new Uint8ClampedArray(bufW * bufH * 4).fill(255);
  const burned = burnRedactionsIntoRgba(
    rgba,
    bufW,
    bufH,
    [{ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }],
    [0, 0, 0],
  );
  assert(burned === 400, `expected exactly 400 burned pixels, got ${burned}`);
  const centerOff = (20 * bufW + 20) * 4;
  assert(
    rgba[centerOff] === 0 && rgba[centerOff + 1] === 0 && rgba[centerOff + 2] === 0 && rgba[centerOff + 3] === 255,
    `center pixel not opaque black: [${Array.from(rgba.slice(centerOff, centerOff + 4))}]`,
  );
  assert(
    rgba[0] === 255 && rgba[1] === 255 && rgba[2] === 255 && rgba[3] === 255,
    `corner pixel (0,0) was unexpectedly modified: [${Array.from(rgba.slice(0, 4))}]`,
  );

  // 34c. applyRedactions on 3-page synthetic PDF with metadata + injected renderPageRgba for page index 1 (page 2)
  const baseBytes = await makeMultiPagePdf(3);
  const metaDoc = await PDFDocument.load(baseBytes, { updateMetadata: false });
  metaDoc.setTitle('SecretReport');
  metaDoc.setAuthor('Confidential Author');
  const srcBytes = await metaDoc.save();

  const redactRes = await applyRedactions(
    srcBytes,
    [
      {
        id: 'box-1',
        pageIndex: 1,
        x: 0.1,
        y: 0.1,
        width: 0.5,
        height: 0.15,
        source: 'manual',
      },
    ],
    {
      fillColor: '#000000',
      sanitizeMetadata: true,
      renderPageRgba: async (_pageIdx, _dpi) => {
        const w = 80;
        const h = 100;
        return {
          rgba: new Uint8ClampedArray(w * h * 4).fill(255),
          width: w,
          height: h,
          widthPt: 612,
          heightPt: 792,
        };
      },
    },
  );

  assert(
    redactRes.redactedPages.length === 1 && redactRes.redactedPages[0] === 2,
    `expected redactedPages=[2], got ${JSON.stringify(redactRes.redactedPages)}`,
  );
  assert(redactRes.boxesApplied === 1, `expected boxesApplied=1, got ${redactRes.boxesApplied}`);
  assert(redactRes.metadataSanitized === true, 'expected metadataSanitized=true');

  const outDoc = await PDFDocument.load(redactRes.bytes, { updateMetadata: false });
  assert(outDoc.getPageCount() === 3, `expected 3 pages in redacted PDF, got ${outDoc.getPageCount()}`);
  const outTitle = outDoc.getTitle();
  assert(!outTitle, `expected metadata Title to be scrubbed, got "${outTitle}"`);

  const qpdfVerify = await checkQpdf(redactRes.bytes);
  assert(qpdfVerify.ok === true, `redacted PDF failed checkQpdf: ${qpdfVerify.stderr}`);

  const readPageStreamText = (page) => {
    const contents = page.node.Contents();
    if (!contents) return '';
    const streams = [];
    if (contents instanceof PDFRawStream) {
      streams.push(contents);
    } else if (contents instanceof PDFArray) {
      for (const ref of contents.asArray()) {
        const obj = outDoc.context.lookup(ref);
        if (obj instanceof PDFRawStream) streams.push(obj);
      }
    }
    return streams
      .map((s) => new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()))
      .join('\n');
  };

  const p1Stream = readPageStreamText(outDoc.getPage(0));
  const p2Stream = readPageStreamText(outDoc.getPage(1));
  const p3Stream = readPageStreamText(outDoc.getPage(2));

  assert(/\bT[jJ]\b/.test(p1Stream), 'page 1 (unredacted) should retain lossless Tj/TJ text operators');
  assert(!/\bT[jJ]\b/.test(p2Stream), `page 2 (redacted) must contain NO Tj/TJ text operators, got: ${p2Stream.slice(0, 200)}`);
  assert(/\bT[jJ]\b/.test(p3Stream), 'page 3 (unredacted) should retain lossless Tj/TJ text operators');
});

await check('35. P4.6a AGPL-3.0 LICENSE.md, self-hosted Ghostscript WASM, compression & PDF/A-2 smoke test', async () => {
  // 35a. Verbatim FSF AGPL-3.0 LICENSE.md at repo root
  const licensePath = join(repoRoot, 'LICENSE.md');
  assert(existsSync(licensePath), 'LICENSE.md missing at repo root');
  const licenseSize = statSync(licensePath).size;
  assert(licenseSize > 30000, `LICENSE.md too small (${licenseSize} bytes; expected full FSF AGPL-3.0 > 30 KB)`);
  const licenseText = readFileSync(licensePath, 'utf8');
  assert(licenseText.includes('GNU AFFERO GENERAL PUBLIC LICENSE'), 'LICENSE.md missing AGPL title');
  assert(licenseText.includes('Version 3, 19 November 2007'), 'LICENSE.md missing Version 3, 19 November 2007');

  // 35b. Self-hosted Ghostscript WASM assets in public/pdf-wasm/gs/
  for (const rel of ['public/pdf-wasm/gs/wghostscript.wasm', 'public/pdf-wasm/gs/wghostscript.js']) {
    const abs = join(repoRoot, rel);
    assert(existsSync(abs), `missing Ghostscript asset: ${rel}`);
    assert(statSync(abs).size > 0, `empty Ghostscript asset: ${rel}`);
  }

  // 35c. /licenses generated JSON includes Ghostscript AGPL-3.0 entry with upstream source URL
  const licJsonPath = join(repoRoot, 'lib', 'generated', 'third-party-licenses.json');
  assert(existsSync(licJsonPath), 'missing lib/generated/third-party-licenses.json');
  const licData = JSON.parse(readFileSync(licJsonPath, 'utf8'));
  const gsEntry = (licData.pdfWasm ?? []).find(
    (entry) => /Ghostscript/i.test(entry.name) && /AGPL-3\.0/i.test(entry.license),
  );
  assert(gsEntry, 'missing Ghostscript AGPL-3.0 entry in third-party-licenses.json pdfWasm');
  assert(
    typeof gsEntry.url === 'string' && gsEntry.url.includes('ArtifexSoftware/ghostpdl'),
    `unexpected Ghostscript upstream URL: ${gsEntry.url}`,
  );
  assert(
    typeof gsEntry.text === 'string' && gsEntry.text.includes('GNU AFFERO GENERAL PUBLIC LICENSE'),
    'Ghostscript licence entry missing verbatim AGPL-3.0 text',
  );

  // 35d. Ghostscript compression on image-heavy 2-page synthetic PDF ('screen' and 'ebook')
  const imgDoc = await PDFDocument.create();
  const imgW = 320;
  const imgH = 320;
  const rawRgb = new Uint8Array(imgW * imgH * 3);
  for (let y = 0; y < imgH; y++) {
    for (let x = 0; x < imgW; x++) {
      const idx = (y * imgW + x) * 3;
      rawRgb[idx] = (x * 255) / imgW;
      rawRgb[idx + 1] = (y * 255) / imgH;
      rawRgb[idx + 2] = ((x ^ y) * 3) & 0xff;
    }
  }
  const flateRgb = zlibSync(rawRgb);
  const imgStream = PDFRawStream.of(
    imgDoc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: imgW,
      Height: imgH,
      ColorSpace: 'DeviceRGB',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
      Length: flateRgb.length,
    }),
    flateRgb,
  );
  const imgRef = imgDoc.context.register(imgStream);
  for (let i = 0; i < 2; i++) {
    const page = imgDoc.addPage([400, 400]);
    page.node.setXObject(PDFName.of('Im0'), imgRef);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(200, 0, 0, 200, 100, 100),
      drawObject(PDFName.of('Im0')),
      popGraphicsState(),
    );
  }
  const heavyPdfBytes = await imgDoc.save({ useObjectStreams: false });

  const screenRes = await compressPdfWithGhostscript(heavyPdfBytes, { preset: 'screen' });
  const screenHeader = new TextDecoder('ascii').decode(screenRes.bytes.subarray(0, 5));
  assert(screenHeader === '%PDF-', `screen output missing %PDF- header: ${screenHeader}`);
  const screenDoc = await PDFDocument.load(screenRes.bytes, { updateMetadata: false });
  assert(screenDoc.getPageCount() === 2, `screen output expected 2 pages, got ${screenDoc.getPageCount()}`);
  const screenQpdf = await checkQpdf(screenRes.bytes);
  assert(screenQpdf.ok === true, `screen output failed checkQpdf: ${screenQpdf.stderr}`);
  assert(
    screenRes.bytes.length < heavyPdfBytes.length,
    `expected Ghostscript screen preset (${screenRes.bytes.length} B) to be smaller than input (${heavyPdfBytes.length} B)`,
  );

  const ebookRes = await compressPdfWithGhostscript(heavyPdfBytes, { preset: 'ebook', colorMode: 'grayscale' });
  const ebookHeader = new TextDecoder('ascii').decode(ebookRes.bytes.subarray(0, 5));
  assert(ebookHeader === '%PDF-', `ebook output missing %PDF- header: ${ebookHeader}`);
  const ebookDoc = await PDFDocument.load(ebookRes.bytes, { updateMetadata: false });
  assert(ebookDoc.getPageCount() === 2, `ebook output expected 2 pages, got ${ebookDoc.getPageCount()}`);
  const ebookQpdf = await checkQpdf(ebookRes.bytes);
  assert(ebookQpdf.ok === true, `ebook output failed checkQpdf: ${ebookQpdf.stderr}`);

  // Also exercise compressPdf({ ghostscriptPreset }) wrapper path with compressible fixture
  const compressibleBytes = await makeCompressiblePdf();
  const wrapperRes = await compressPdf(compressibleBytes, {
    images: false,
    maxDpi: 150,
    quality: 75,
    rasterize: false,
    removeMetadata: true,
    ghostscriptPreset: 'ebook',
  });
  const wrapperDoc = await PDFDocument.load(wrapperRes.bytes, { updateMetadata: false });
  assert(wrapperDoc.getPageCount() === 2, `compressPdf(ghostscriptPreset) expected 2 pages, got ${wrapperDoc.getPageCount()}`);
  assert(
    wrapperRes.bytes.length < compressibleBytes.length,
    `compressPdf(ghostscriptPreset) (${wrapperRes.bytes.length} B) should shrink compressible fixture (${compressibleBytes.length} B)`,
  );

  // 35e. Ghostscript -dPDFA=2 smoke test using extraFiles (verifies P4.6b readiness)
  const pdfaSrc = await makeMultiPagePdf(2);
  const iccRomPath = '%rom%iccprofiles/srgb.icc';
  const pdfaDefPs = [
    '[/_objdef {icc_PDFA} /type /stream /OBJ pdfmark',
    '[{icc_PDFA} << /N 3 >> /PUT pdfmark',
    `[{icc_PDFA} (${iccRomPath}) (r) file /PUT pdfmark`,
    '[/_objdef {OutputIntent_PDFA} /type /dict /OBJ pdfmark',
    '[{OutputIntent_PDFA} <<',
    '  /Type /OutputIntent',
    '  /S /GTS_PDFA1',
    '  /DestOutputProfile {icc_PDFA}',
    '  /OutputConditionIdentifier (sRGB)',
    '>> /PUT pdfmark',
    '[{Catalog} << /OutputIntents [ {OutputIntent_PDFA} ] >> /PUT pdfmark',
  ].join('\n');

  const pdfaRun = await runGhostscript(
    pdfaSrc,
    [
      '-sDEVICE=pdfwrite',
      '-dPDFA=2',
      '-dPDFACompatibilityPolicy=1',
      '-sColorConversionStrategy=RGB',
      `--permit-file-read=${iccRomPath}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBATCH',
      '-sOutputFile=$OUT',
      '/PDFA_def.ps',
      '$IN',
    ],
    { extraFiles: { '/PDFA_def.ps': pdfaDefPs } },
  );
  assert(pdfaRun.exitCode === 0, `PDFA=2 run exited with ${pdfaRun.exitCode}: ${pdfaRun.stderr}`);
  assert(pdfaRun.output && pdfaRun.output.length > 0, 'PDFA=2 run produced no output bytes');
  const pdfaHeader = new TextDecoder('ascii').decode(pdfaRun.output.subarray(0, 5));
  assert(pdfaHeader === '%PDF-', `PDFA=2 output missing %PDF- header: ${pdfaHeader}`);
  const pdfaOutDoc = await PDFDocument.load(pdfaRun.output, { updateMetadata: false });
  assert(pdfaOutDoc.getPageCount() === 2, `PDFA=2 output expected 2 pages, got ${pdfaOutDoc.getPageCount()}`);
  const pdfaQpdf = await checkQpdf(pdfaRun.output);
  assert(pdfaQpdf.ok === true, `PDFA=2 output failed checkQpdf: ${pdfaQpdf.stderr}`);
  const outputIntents = pdfaOutDoc.catalog.lookup(PDFName.of('OutputIntents'));
  assert(outputIntents instanceof PDFArray && outputIntents.size() >= 1, 'PDFA=2 output missing /OutputIntents array in catalog');
  const firstIntent = pdfaOutDoc.context.lookup(outputIntents.get(0));
  assert(firstIntent && typeof firstIntent.lookup === 'function', 'PDFA=2 OutputIntent entry is not a dictionary');
  assert(
    firstIntent.lookup(PDFName.of('S')) === PDFName.of('GTS_PDFA1'),
    `PDFA=2 OutputIntent /S expected /GTS_PDFA1, got ${String(firstIntent.lookup(PDFName.of('S')))}`,
  );
  assert(firstIntent.get(PDFName.of('DestOutputProfile')), 'PDFA=2 OutputIntent missing /DestOutputProfile');
  const pdfaRawText = new TextDecoder('latin1').decode(pdfaRun.output);
  assert(pdfaRawText.includes('pdfaid:part'), 'PDFA=2 output missing XMP pdfaid:part');
});

await check('36. P4.6b pdfa.ts (inspectPdfA pre-flight + convertToPdfA for 1b, 2b, 3b & Gray)', async () => {
  const srcBytes = await makeMultiPagePdf(2);

  // 36a. Pre-flight compliance audit on standard synthetic PDF (unembedded Helvetica, no OutputIntent, no XMP pdfaid)
  const before = await inspectPdfA(srcBytes);
  assert(before.isPdfA === false, 'synthetic multiPage PDF must not be reported as PDF/A');
  assert(before.hasOutputIntent === false, 'synthetic multiPage PDF should not have an OutputIntent');
  assert(
    before.unembeddedFonts.length >= 1,
    `expected >= 1 unembedded font in synthetic multiPage PDF, got ${JSON.stringify(before.unembeddedFonts)}`,
  );
  assert(before.checks.length >= 5, `expected compliance check rows, got ${before.checks.length}`);

  // 36b. Convert to PDF/A-1b, PDF/A-2b, PDF/A-3b (sRGB) and PDF/A-2b (Grayscale)
  const cases = [
    { label: 'PDF/A-1b (RGB)', opts: { level: '1b', colorStrategy: 'RGB' }, expectedPart: 1, expectedCond: 'sRGB' },
    { label: 'PDF/A-2b (RGB)', opts: { level: '2b', colorStrategy: 'RGB', title: 'Archival Test Document' }, expectedPart: 2, expectedCond: 'sRGB' },
    { label: 'PDF/A-3b (RGB)', opts: { level: '3b', colorStrategy: 'RGB' }, expectedPart: 3, expectedCond: 'sRGB' },
    { label: 'PDF/A-2b (Gray)', opts: { level: '2b', colorStrategy: 'Gray' }, expectedPart: 2, expectedCond: 'Gray' },
  ];

  const metrics = [];
  for (const c of cases) {
    const res = await convertToPdfA(srcBytes, c.opts);
    const rep = res.afterReport;
    assert(
      rep.isPdfA === true,
      `${c.label}: expected afterReport.isPdfA=true (checks: ${JSON.stringify(rep.checks)})`,
    );
    assert(
      rep.pdfaidPart === c.expectedPart,
      `${c.label}: expected pdfaidPart=${c.expectedPart}, got ${rep.pdfaidPart}`,
    );
    assert(
      rep.pdfaidConformance === 'B',
      `${c.label}: expected pdfaidConformance="B", got ${rep.pdfaidConformance}`,
    );
    assert(rep.hasOutputIntent === true, `${c.label}: expected hasOutputIntent=true`);
    assert(
      rep.outputCondition && rep.outputCondition.includes(c.expectedCond),
      `${c.label}: expected outputCondition containing "${c.expectedCond}", got "${rep.outputCondition}"`,
    );
    assert(rep.hasXmpMetadata === true, `${c.label}: expected hasXmpMetadata=true`);
    assert(rep.hasTrailerId === true, `${c.label}: expected hasTrailerId=true`);
    assert(
      rep.unembeddedFonts.length === 0,
      `${c.label}: expected 0 unembedded fonts, got ${JSON.stringify(rep.unembeddedFonts)}`,
    );
    assert(res.qpdfOk === true, `${c.label}: expected qpdfOk=true (warnings: ${res.warnings.join('; ')})`);
    const outDoc = await PDFDocument.load(res.bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `${c.label}: expected 2 pages, got ${outDoc.getPageCount()}`);
    if (c.opts.title) {
      assert(
        outDoc.getTitle() === c.opts.title,
        `${c.label}: expected title "${c.opts.title}", got "${outDoc.getTitle()}"`,
      );
    }
    metrics.push(`${c.label}: ${res.beforeBytes}B -> ${res.afterBytes}B (fonts=${rep.totalFonts}, unembedded=0, qpdfOk=true)`);
  }
  console.log('  [Check 36 metrics] ' + metrics.join(' | '));
});

await check('37. P4.7 ocr.ts (WinAnsi sanitization, Tesseract v7 word extraction, 3 Tr invisible text-layer injection on 0° & 90° pages + pdfjs-dist extraction)', async () => {
  // 37a. sanitizeWinAnsiText preserves Nordic/Latin-1, normalizes quotes/dashes/ligatures, strips non-WinAnsi safely
  const nordic = sanitizeWinAnsiText('ÆØÅæøåéüÄÖÜß');
  assert(nordic === 'ÆØÅæøåéüÄÖÜß', `expected Nordic/Latin-1 preserved, got "${nordic}"`);

  const normalized = sanitizeWinAnsiText('“Hello” — ‘world’ \uFB01le \uFB02ow \uFB03ce');
  assert(
    normalized === '"Hello" - \'world\' file flow ffice',
    `unexpected smart-quote/ligature normalization: "${normalized}"`,
  );

  const stripped = sanitizeWinAnsiText('Invoice 🚀 日本語 2026\x00\x07');
  assert(
    stripped.includes('Invoice') && stripped.includes('2026') && !stripped.includes('🚀') && !stripped.includes('日'),
    `expected emoji/CJK/control stripped, got "${stripped}"`,
  );

  // Verify StandardFonts.Helvetica can encode all sanitized outputs without throwing
  const fontCheckDoc = await PDFDocument.create();
  const { StandardFonts } = require('@cantoo/pdf-lib');
  const helv = await fontCheckDoc.embedFont(StandardFonts.Helvetica);
  helv.encodeText(nordic);
  helv.encodeText(normalized);
  helv.encodeText(stripped);

  // 37b. extractWordsFromTesseractResult on a mock tesseract.js@7.0.0 blocks -> paragraphs -> lines -> words tree
  const mockV7Data = {
    text: 'Invoice 2026 Blåbær',
    confidence: 93,
    blocks: [
      {
        paragraphs: [
          {
            lines: [
              {
                words: [
                  { text: 'Invoice', confidence: 96, bbox: { x0: 80, y0: 100, x1: 240, y1: 140 } },
                  { text: '   ', confidence: 10, bbox: { x0: 250, y0: 100, x1: 260, y1: 140 } },
                  { text: '2026', confidence: 94, bbox: { x0: 270, y0: 100, x1: 360, y1: 140 } },
                  { text: 'BadBox', confidence: 80, bbox: { x0: 370, y0: 100, x1: 370, y1: 140 } },
                  { text: 'Blåbær', confidence: 91, bbox: { x0: 390, y0: 100, x1: 530, y1: 140 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const extracted = extractWordsFromTesseractResult(mockV7Data);
  assert(extracted.length === 3, `expected 3 valid words from v7 tree, got ${extracted.length}: ${JSON.stringify(extracted)}`);
  assert(
    extracted[0].text === 'Invoice' && extracted[1].text === '2026' && extracted[2].text === 'Blåbær',
    `unexpected extracted texts: ${JSON.stringify(extracted.map((w) => w.text))}`,
  );
  assert(
    extracted[2].x0 === 390 && extracted[2].y1 === 140 && extracted[2].confidence === 91,
    `unexpected word bbox/confidence: ${JSON.stringify(extracted[2])}`,
  );

  // 37c. injectOcrTextLayer on synthetic 2-page image-only/blank PDF (page 1 = 0°, page 2 = 90°)
  const blankDoc = await PDFDocument.create();
  blankDoc.addPage([612, 792]); // Page 1: unrotated (0°)
  const page2 = blankDoc.addPage([612, 792]);
  page2.setRotation(degrees(90)); // Page 2: rotated 90° clockwise
  const blankBytes = await blankDoc.save({ useObjectStreams: false });

  const pageWords = new Map([
    [
      0,
      {
        imageWidth: 1000,
        imageHeight: 1294,
        fullText: 'Invoice 2026 Blåbær',
        avgConfidence: 93.7,
        words: [
          { text: 'Invoice', x0: 80, y0: 120, x1: 240, y1: 165, confidence: 96 },
          { text: '2026', x0: 270, y0: 120, x1: 370, y1: 165, confidence: 94 },
          { text: 'Blåbær', x0: 400, y0: 120, x1: 560, y1: 165, confidence: 91 },
        ],
      },
    ],
    [
      1,
      {
        imageWidth: 1294,
        imageHeight: 1000,
        fullText: 'Rotated Scan',
        avgConfidence: 95,
        words: [
          { text: 'Rotated', x0: 120, y0: 140, x1: 340, y1: 195, confidence: 96 },
          { text: 'Scan', x0: 370, y0: 140, x1: 500, y1: 195, confidence: 94 },
        ],
      },
    ],
  ]);

  const ocrBytes = await injectOcrTextLayer(blankBytes, pageWords);
  const outDoc = await PDFDocument.load(ocrBytes, { updateMetadata: false });
  assert(outDoc.getPageCount() === 2, `expected 2 pages in OCR output, got ${outDoc.getPageCount()}`);

  const qpdfRes = await checkQpdf(ocrBytes);
  assert(qpdfRes.ok === true, `OCR output failed checkQpdf: ${qpdfRes.stderr}`);

  const readPageStream = (page) => {
    const contents = page.node.Contents();
    if (!contents) return '';
    const streams = [];
    if (contents instanceof PDFRawStream) {
      streams.push(contents);
    } else if (contents instanceof PDFArray) {
      for (const ref of contents.asArray()) {
        const obj = outDoc.context.lookup(ref);
        if (obj instanceof PDFRawStream) streams.push(obj);
      }
    }
    return streams
      .map((s) => new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()))
      .join('\n');
  };

  const p1Stream = readPageStream(outDoc.getPage(0));
  const p2Stream = readPageStream(outDoc.getPage(1));
  assert(/\b3\s+Tr\b/.test(p1Stream), `page 1 OCR stream missing invisible text mode "3 Tr": ${p1Stream.slice(0, 300)}`);
  assert(/\b3\s+Tr\b/.test(p2Stream), `page 2 OCR stream missing invisible text mode "3 Tr": ${p2Stream.slice(0, 300)}`);

  // 37d. Extract text back via pdfjs-dist in Node and verify words on both 0° and 90° pages
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: ocrBytes.slice(),
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: 0,
  });
  const pdfDoc = await loadingTask.promise;
  try {
    assert(pdfDoc.numPages === 2, `pdfjs expected 2 pages, got ${pdfDoc.numPages}`);

    const pdfPage1 = await pdfDoc.getPage(1);
    const tc1 = await pdfPage1.getTextContent();
    const p1Text = tc1.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    assert(
      p1Text.includes('Invoice') && p1Text.includes('2026') && p1Text.includes('Blåbær'),
      `pdfjs page 1 text missing expected words, got: "${p1Text}"`,
    );

    const pdfPage2 = await pdfDoc.getPage(2);
    const tc2 = await pdfPage2.getTextContent();
    const p2Text = tc2.items.map((it) => ('str' in it ? it.str : '')).join(' ');
    assert(
      p2Text.includes('Rotated') && p2Text.includes('Scan'),
      `pdfjs page 2 (90°) text missing expected words, got: "${p2Text}"`,
    );
  } finally {
    await loadingTask.destroy();
  }
});

// Print summary table
let passed = 0;
let failed = 0;
console.log('\nPDF Harness Phase 4 (lib/pdf) Summary');
console.log('─'.repeat(64));
for (const r of results) {
  if (r.pass) {
    passed++;
    console.log(`PASS  ${r.name}`);
  } else {
    failed++;
    console.log(`FAIL  ${r.name}\n      ${r.detail}`);
  }
}
console.log('─'.repeat(64));
console.log(`${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
