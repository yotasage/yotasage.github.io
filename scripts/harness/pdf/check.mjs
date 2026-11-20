// Node verification harness for framework-free lib/pdf/* modules.
//   npm run check   (tsx check.mjs)

import { PDFDocument } from '@cantoo/pdf-lib';

import {
  makeBookmarkedPdf,
  makeCompressiblePdf,
  makeEncryptedPdf,
  makeImagePdf,
  makeMetadataPdf,
  makeMultiPagePdf,
  makeRotatedPdf,
  pageDimensionsFor,
} from './fixtures.mjs';

import * as breakdownMod from '../../../lib/pdf/breakdown.ts';
import * as compressMod from '../../../lib/pdf/compress.ts';
import * as extractImagesMod from '../../../lib/pdf/extractImages.ts';
import * as mergeMod from '../../../lib/pdf/merge.ts';
import * as pagesMod from '../../../lib/pdf/pages.ts';
import * as sanitizeMod from '../../../lib/pdf/sanitize.ts';
import * as splitMod from '../../../lib/pdf/split.ts';

const unwrap = (x) => x.default ?? x;
const { inspectPdfSizeBreakdown } = unwrap(breakdownMod);
const { compressPdf } = unwrap(compressMod);
const { extractImagesFromPdf } = unwrap(extractImagesMod);
const { parsePageRanges, mergePdfs } = unwrap(mergeMod);
const { formatPageRanges, buildPdfFromPages, rotatePdf, removePagesPdf, extractPagesPdf } = unwrap(pagesMod);
const { inspectPdf, cleanPdf, PRESETS } = unwrap(sanitizeMod);
const { parseSplitGroups, splitByEveryN, splitByBreakPoints, splitByBookmarks, splitPdfParts, splitPdfBySize } = unwrap(splitMod);

const results = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertDeepEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

function assertBytesEqual(a, b, label) {
  if (a.length !== b.length) throw new Error(`${label}: length mismatch (${a.length} vs ${b.length})`);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) throw new Error(`${label}: byte mismatch at offset ${i} (${a[i]} vs ${b[i]})`);
  }
}

async function pageSizes(bytes, password) {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  return doc.getPages().map((p) => ({
    width: Math.round(p.getWidth()),
    height: Math.round(p.getHeight()),
    rotation: p.getRotation().angle,
  }));
}

async function runCheck(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (err) {
    results.push({ name, pass: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

// 1. parsePageRanges & formatPageRanges
await runCheck('1. parsePageRanges & formatPageRanges', async () => {
  assertDeepEqual(parsePageRanges('1-3, 5', 6), [0, 1, 2, 4], 'forward');
  assertDeepEqual(parsePageRanges('end-1', 4), [3, 2, 1, 0], 'reversed end-1');
  assertDeepEqual(parsePageRanges('-3', 6), [0, 1, 2], 'open start -3');
  assertDeepEqual(parsePageRanges('4-', 6), [3, 4, 5], 'open end 4-');
  assertDeepEqual(formatPageRanges([4, 0, 2, 1, 2, 5]), '1-3, 5-6', 'formatPageRanges');
  assertDeepEqual(formatPageRanges([]), '', 'formatPageRanges empty');

  for (const bad of ['', '   ', '0', '7', '2-9', 'abc', '1--3']) {
    let threw = false;
    try {
      parsePageRanges(bad, 6);
    } catch {
      threw = true;
    }
    assert(threw, `expected parsePageRanges(${JSON.stringify(bad)}) to throw`);
  }
});

// 2. mergePdfs (2 PDFs with ranges + encrypted PDF with password)
await runCheck('2. mergePdfs (ranges + encrypted input)', async () => {
  const pdfA = await makeMultiPagePdf(4, { dimOffset: 0 });
  const pdfB = await makeMultiPagePdf(3, { dimOffset: 200 });
  const pdfEnc = await makeEncryptedPdf('secret', 'owner');

  const merged = await mergePdfs([
    { bytes: pdfA, pages: [3, 0] }, // page 4 then page 1 of A
    { bytes: pdfB, pages: [1, 2] }, // page 2, 3 of B
    { bytes: pdfEnc, pages: [0], password: 'secret' }, // page 1 of encrypted
  ]);

  const sizes = await pageSizes(merged);
  assert(sizes.length === 5, `expected 5 merged pages, got ${sizes.length}`);
  const expected = [
    pageDimensionsFor(3, 0),
    pageDimensionsFor(0, 0),
    pageDimensionsFor(1, 200),
    pageDimensionsFor(2, 200),
    pageDimensionsFor(0, 50),
  ];
  for (let i = 0; i < expected.length; i++) {
    assert(
      sizes[i].width === expected[i].width && sizes[i].height === expected[i].height,
      `merged page ${i}: expected ${expected[i].width}x${expected[i].height}, got ${sizes[i].width}x${sizes[i].height}`,
    );
  }
});

// 3. rotatePdf (additive rotation, mod 360 wrap-around, encrypted input)
await runCheck('3. rotatePdf (additive, mod 360, encrypted)', async () => {
  const rotPdf = await makeRotatedPdf(); // initial: 0, 90, 180, 270
  const rotated = await rotatePdf(rotPdf, [90, 180, 270, 90]);
  const angles = (await pageSizes(rotated)).map((p) => p.rotation);
  assertDeepEqual(angles, [90, 270, 90, 0], 'additive rotation mod 360');

  // Negative delta wrap-around
  const rotatedBack = await rotatePdf(rotated, [-90, -270, 0, -90]);
  const backAngles = (await pageSizes(rotatedBack)).map((p) => p.rotation);
  assertDeepEqual(backAngles, [0, 0, 90, 270], 'negative wrap-around');

  // Encrypted input
  const enc = await makeEncryptedPdf('pass123', 'owner123');
  const encRot = await rotatePdf(enc, [180, 0, 90, 0], { password: 'pass123' });
  const encAngles = (await pageSizes(encRot)).map((p) => p.rotation);
  assertDeepEqual(encAngles, [180, 0, 90, 0], 'encrypted rotatePdf');
});

// 4. removePagesPdf & extractPagesPdf
await runCheck('4. removePagesPdf & extractPagesPdf', async () => {
  const pdf = await makeMultiPagePdf(5);
  const removed = await removePagesPdf(pdf, new Set([1, 3]));
  assert(removed.keptPages === 3, `expected keptPages=3, got ${removed.keptPages}`);
  const remSizes = await pageSizes(removed.bytes);
  assertDeepEqual(
    remSizes.map((s) => s.width),
    [0, 2, 4].map((i) => pageDimensionsFor(i).width),
    'remaining page widths',
  );

  // Extract single PDF
  const single = await extractPagesPdf(pdf, [0, 2, 4], { separate: false, sourceName: 'sample.pdf' });
  assert(single.length === 1, `expected 1 output file, got ${single.length}`);
  const singleSizes = await pageSizes(single[0].bytes);
  assertDeepEqual(
    singleSizes.map((s) => s.width),
    [0, 2, 4].map((i) => pageDimensionsFor(i).width),
    'extracted single PDF widths',
  );

  // Extract separate PDFs
  const sep = await extractPagesPdf(pdf, [1, 4], { separate: true, sourceName: 'sample.pdf' });
  assert(sep.length === 2, `expected 2 separate files, got ${sep.length}`);
  const s0 = await pageSizes(sep[0].bytes);
  const s1 = await pageSizes(sep[1].bytes);
  assert(s0.length === 1 && s0[0].width === pageDimensionsFor(1).width, 'separate[0] page size');
  assert(s1.length === 1 && s1[0].width === pageDimensionsFor(4).width, 'separate[1] page size');
});

// 5. buildPdfFromPages (multi-PDF reorder, duplicate, per-page rotation, blank page)
await runCheck('5. buildPdfFromPages (reorder, duplicate, rotate, blank)', async () => {
  const pdfA = await makeMultiPagePdf(3, { dimOffset: 0 });
  const pdfB = await makeMultiPagePdf(2, { dimOffset: 300 });
  const built = await buildPdfFromPages(
    [{ bytes: pdfA }, { bytes: pdfB }],
    [
      { kind: 'page', sourceIndex: 1, pageIndex: 1, rotation: 90 },
      { kind: 'blank', width: 595, height: 842 },
      { kind: 'page', sourceIndex: 0, pageIndex: 2, rotation: 180 },
      { kind: 'page', sourceIndex: 0, pageIndex: 2, rotation: 0 }, // duplicate
    ],
  );

  const sizes = await pageSizes(built);
  assert(sizes.length === 4, `expected 4 pages, got ${sizes.length}`);
  assert(sizes[0].width === pageDimensionsFor(1, 300).width && sizes[0].rotation === 90, 'page 0 reorder+rot');
  assert(sizes[1].width === 595 && sizes[1].height === 842, 'page 1 blank A4 dimensions');
  assert(sizes[2].width === pageDimensionsFor(2, 0).width && sizes[2].rotation === 180, 'page 2 rot 180');
  assert(sizes[3].width === pageDimensionsFor(2, 0).width && sizes[3].rotation === 0, 'page 3 duplicate');
});

// 6. splitPdfParts & splitPdfBySize
await runCheck('6. splitPdfParts & splitPdfBySize', async () => {
  const groups = parseSplitGroups('1-2; 3, 5; 4, 6', 6);
  assertDeepEqual(groups.map((g) => g.pages), [[0, 1], [2, 4], [3, 5]], 'parseSplitGroups');

  const every2 = splitByEveryN(6, 2);
  assertDeepEqual(every2.map((g) => g.pages), [[0, 1], [2, 3], [4, 5]], 'splitByEveryN');

  const breaks = splitByBreakPoints(6, new Set([0, 3]));
  assertDeepEqual(breaks.map((g) => g.pages), [[0], [1, 2, 3], [4, 5]], 'splitByBreakPoints');

  const bmParts = splitByBookmarks(6, [
    { title: 'Chapter 1', pageIndex: 0 },
    { title: 'Chapter 2', pageIndex: 2 },
    { title: 'Chapter 3', pageIndex: 4 },
  ]);
  assertDeepEqual(bmParts.map((g) => g.pages), [[0, 1], [2, 3], [4, 5]], 'splitByBookmarks');

  const pdf6 = await makeBookmarkedPdf();
  const splitOut = await splitPdfParts(pdf6, bmParts, { sourceName: 'chapters.pdf' });
  assert(splitOut.length === 3, `expected 3 split PDFs, got ${splitOut.length}`);
  for (let i = 0; i < splitOut.length; i++) {
    const sz = await pageSizes(splitOut[i].bytes);
    assert(sz.length === 2, `split part ${i} expected 2 pages, got ${sz.length}`);
  }

  // splitPdfBySize with tiny maxBytes triggers oversized single pages cleanly without hanging
  const pdf4 = await makeMultiPagePdf(4);
  const bySizeTiny = await splitPdfBySize(pdf4, 100, { sourceName: 'tiny.pdf' });
  assert(bySizeTiny.files.length === 4, `tiny maxBytes expected 4 parts, got ${bySizeTiny.files.length}`);
  assertDeepEqual(bySizeTiny.oversizedPages, [0, 1, 2, 3], 'all pages marked oversized');
  assertDeepEqual(bySizeTiny.parts.flatMap((p) => p.pages), [0, 1, 2, 3], 'partitions all pages');

  // splitPdfBySize with generous maxBytes keeps all pages in 1 part
  const bySizeLarge = await splitPdfBySize(pdf4, 5 * 1024 * 1024, { sourceName: 'large.pdf' });
  assert(bySizeLarge.files.length === 1 && bySizeLarge.oversizedPages.length === 0, 'large maxBytes produces 1 part');
});

// 7. extractImagesFromPdf
await runCheck('7. extractImagesFromPdf (JPEG verbatim, PNG+SMask, minSize)', async () => {
  const { bytes, jpeg } = await makeImagePdf();
  const res = await extractImagesFromPdf(bytes, { sourceName: 'photos.pdf', minSize: 16 });
  assert(res.images.length === 2, `expected 2 extracted images, got ${res.images.length}`);

  const jpgOut = res.images.find((i) => i.mime === 'image/jpeg');
  const pngOut = res.images.find((i) => i.mime === 'image/png');
  assert(Boolean(jpgOut), 'missing extracted JPEG');
  assert(Boolean(pngOut), 'missing extracted PNG');

  assertBytesEqual(jpgOut.bytes, jpeg, 'verbatim JPEG bytes');
  assertDeepEqual(jpgOut.pages, [1], 'JPEG on page 1');
  assert(jpgOut.width === 32 && jpgOut.height === 32, 'JPEG dimensions');

  assertDeepEqual(pngOut.pages, [2], 'PNG on page 2');
  assert(pngOut.width === 32 && pngOut.height === 24, 'PNG dimensions');
  // Re-embed extracted PNG (with SMask alpha) into a fresh PDFDocument to confirm valid PNG
  const verifyDoc = await PDFDocument.create();
  const embedded = await verifyDoc.embedPng(pngOut.bytes);
  assert(embedded.width === 32 && embedded.height === 24, 're-embedded PNG dimensions');

  // minSize filter: 30px filters out 32x24 PNG (height < 30), keeps 32x32 JPEG
  const filtered = await extractImagesFromPdf(bytes, { sourceName: 'photos.pdf', minSize: 30 });
  assert(filtered.images.length === 1 && filtered.images[0].mime === 'image/jpeg', 'minSize=30 keeps only 32x32 JPEG');
});

// 8. compressPdf (lossless reduction + encrypted input)
await runCheck('8. compressPdf (lossless savings + encrypted input)', async () => {
  const input = await makeCompressiblePdf();
  const res = await compressPdf(input, {
    images: false,
    maxDpi: 150,
    quality: 75,
    rasterize: false,
    removeMetadata: false,
  });
  assert(res.bytes.length < input.length, `expected compressed (${res.bytes.length}) < input (${input.length})`);
  const outPages = await pageSizes(res.bytes);
  assert(outPages.length === 2, `expected 2 pages after compress, got ${outPages.length}`);

  const enc = await makeEncryptedPdf('openme', 'owner');
  const encRes = await compressPdf(enc, {
    images: false,
    maxDpi: 150,
    quality: 75,
    rasterize: false,
    removeMetadata: false,
    password: 'openme',
  });
  const encPages = await pageSizes(encRes.bytes);
  assert(encPages.length === 4, `expected 4 pages from compressed encrypted PDF, got ${encPages.length}`);
});

// 9. inspectPdf & cleanPdf
await runCheck('9. inspectPdf & cleanPdf (Info/XMP/EXIF + encrypted)', async () => {
  const dirty = await makeMetadataPdf();
  const before = await inspectPdf(dirty);
  const beforeIds = new Set(before.map((f) => f.id));
  assert(beforeIds.has('info'), 'expected info finding before clean');
  assert(beforeIds.has('xmp'), 'expected xmp finding before clean');
  assert(beforeIds.has('imageMeta'), 'expected imageMeta (EXIF) finding before clean');

  const anonymize = PRESETS.find((p) => p.id === 'anonymize').options;
  const cleaned = await cleanPdf(dirty, anonymize);
  const after = await inspectPdf(cleaned);
  const afterIds = new Set(after.map((f) => f.id));
  assert(!afterIds.has('info'), 'info still present after clean');
  assert(!afterIds.has('xmp'), 'xmp still present after clean');
  assert(!afterIds.has('imageMeta'), 'imageMeta still present after clean');

  // Encrypted input
  const enc = await makeEncryptedPdf('pw', 'own');
  const encFindings = await inspectPdf(enc, 'pw');
  assert(Array.isArray(encFindings), 'inspectPdf works on encrypted input');
  const encCleaned = await cleanPdf(enc, anonymize, 'pw');
  const encPages = await pageSizes(encCleaned);
  assert(encPages.length === 4, 'cleanPdf preserves pages on encrypted input');
});

// 10. inspectPdfSizeBreakdown
await runCheck('10. inspectPdfSizeBreakdown', async () => {
  const { bytes } = await makeImagePdf();
  const breakdown = await inspectPdfSizeBreakdown(bytes);
  assert(breakdown.totalBytes === bytes.length, `totalBytes (${breakdown.totalBytes}) !== bytes.length (${bytes.length})`);
  const imgCat = breakdown.categories.find((c) => c.id === 'images');
  assert(imgCat && imgCat.bytes > 0, `expected images > 0, got ${imgCat?.bytes}`);
  const sum = breakdown.categories.reduce((acc, c) => acc + c.bytes, 0);
  assert(sum === breakdown.totalBytes, `category sum (${sum}) !== totalBytes (${breakdown.totalBytes})`);
});

// Print summary table
let passed = 0;
let failed = 0;
console.log('\nPDF Harness (lib/pdf) Summary');
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
