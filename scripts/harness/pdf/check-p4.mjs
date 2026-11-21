// Node verification harness for Phase 4 lib/pdf/* modules (QPDF WASM, self-hosted OCR runtime, etc.).
//   npm run check   (tsx check.mjs && tsx check-p4.mjs)

import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { zlibSync } from 'fflate';

import { makeMultiPagePdf } from './fixtures.mjs';
import * as compressMod from '../../../lib/pdf/compress.ts';
import * as compressContentMod from '../../../lib/pdf/compressContent.ts';
import * as linearizeMod from '../../../lib/pdf/linearize.ts';
import * as ocrRuntimeMod from '../../../lib/pdf/ocrRuntime.ts';
import * as qpdfMod from '../../../lib/pdf/qpdf.ts';
import * as repairMod from '../../../lib/pdf/repair.ts';

// Load @cantoo/pdf-lib via CJS require so PDFDocument/PDFRawStream class identities match lib/pdf/*.ts under tsx.
const require = createRequire(import.meta.url);
const {
  concatTransformationMatrix,
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
const { OCR_ASSET_PATHS, OCR_LANGUAGES } = ocrRuntimeMod.default ?? ocrRuntimeMod;
const { compressPdf } = compressMod.default ?? compressMod;
const { hasLinearizedHeader, inspectLinearization, linearizePdf } = linearizeMod.default ?? linearizeMod;
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
