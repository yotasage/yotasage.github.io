// Node verification harness for framework-free lib/pdf/* modules.
//   npm run check   (tsx check.mjs)

import { PDFDocument, PDFName } from '@cantoo/pdf-lib';

import {
  makeAnnotatedFormPdf,
  makeBookmarkedPdf,
  makeCompressiblePdf,
  makeEncryptedPdf,
  makeImagePdf,
  makeInlineVectorPdf,
  makeMetadataPdf,
  makeMultiPagePdf,
  makeRgbaPng,
  makeRotatedPdf,
  makeVectorFormPdf,
  pageDimensionsFor,
} from './fixtures.mjs';

import * as annotationsMod from '../../../lib/pdf/annotations.ts';
import * as breakdownMod from '../../../lib/pdf/breakdown.ts';
import * as compressMod from '../../../lib/pdf/compress.ts';
import * as detectFiguresMod from '../../../lib/pdf/detectFigures.ts';
import * as extractImagesMod from '../../../lib/pdf/extractImages.ts';
import * as extractVectorsMod from '../../../lib/pdf/extractVectors.ts';
import * as mergeMod from '../../../lib/pdf/merge.ts';
import * as metadataMod from '../../../lib/pdf/metadata.ts';
import * as pageNumbersMod from '../../../lib/pdf/pageNumbers.ts';
import * as pagesMod from '../../../lib/pdf/pages.ts';
import * as pdfToSvgMod from '../../../lib/pdf/pdfToSvg.ts';
import * as readerMod from '../../../lib/pdf/reader.ts';
import * as sanitizeMod from '../../../lib/pdf/sanitize.ts';
import * as securityMod from '../../../lib/pdf/security.ts';
import * as splitMod from '../../../lib/pdf/split.ts';
import * as watermarkMod from '../../../lib/pdf/watermark.ts';

const unwrap = (x) => x.default ?? x;
const { inspectAnnotations, removeAnnotations, flattenPdf } = unwrap(annotationsMod);
const { inspectPdfSizeBreakdown } = unwrap(breakdownMod);
const { compressPdf } = unwrap(compressMod);
const { analyzePageVectors, detectFiguresOnPage, tightenRegionToContent } = unwrap(detectFiguresMod);
const { extractImagesFromPdf } = unwrap(extractImagesMod);
const { extractFormXObjects, extractRegionAsPdf } = unwrap(extractVectorsMod);
const { parsePageRanges, mergePdfs } = unwrap(mergeMod);
const { readPdfMetadata, writePdfMetadata } = unwrap(metadataMod);
const { addPageNumbers } = unwrap(pageNumbersMod);
const { formatPageRanges, buildPdfFromPages, rotatePdf, removePagesPdf, extractPagesPdf } = unwrap(pagesMod);
const { pdfBytesToSvg } = unwrap(pdfToSvgMod);
const { findTextMatches, splitItemWithMatches } = unwrap(readerMod);
const { inspectPdf, cleanPdf, PRESETS } = unwrap(sanitizeMod);
const { inspectSecurity, protectPdf, unlockPdf } = unwrap(securityMod);
const { parseSplitGroups, splitByEveryN, splitByBreakPoints, splitByBookmarks, splitPdfParts, splitPdfBySize } = unwrap(splitMod);
const { addWatermark } = unwrap(watermarkMod);

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

// 11. extractFormXObjects (2 qualifying forms, skips 8x8, valid standalone PDFs, encrypted input)
await runCheck('11. extractFormXObjects (BBox, Matrix, minSize, encrypted)', async () => {
  const vectorPdf = await makeVectorFormPdf();
  const forms = await extractFormXObjects(vectorPdf, { sourceName: 'diagrams.pdf', minSizePt: 16 });
  assert(forms.length === 2, `expected 2 qualifying Form XObjects, got ${forms.length}`);

  const chart = forms.find((f) => f.name.includes('FmChart'));
  const scaled = forms.find((f) => f.name.includes('FmScaled'));
  assert(Boolean(chart), `missing FmChart form in ${forms.map((f) => f.name).join(', ')}`);
  assert(Boolean(scaled), `missing FmScaled form in ${forms.map((f) => f.name).join(', ')}`);

  assert(Math.round(chart.widthPt) === 160 && Math.round(chart.heightPt) === 120, `FmChart dims ${chart.widthPt}x${chart.heightPt}`);
  assert(Math.round(scaled.widthPt) === 150 && Math.round(scaled.heightPt) === 120, `FmScaled dims ${scaled.widthPt}x${scaled.heightPt}`);

  const chartSizes = await pageSizes(chart.pdfBytes);
  assert(chartSizes.length === 1 && chartSizes[0].width === 160 && chartSizes[0].height === 120, 'FmChart standalone PDF page size');
  const scaledSizes = await pageSizes(scaled.pdfBytes);
  assert(scaledSizes.length === 1 && scaledSizes[0].width === 150 && scaledSizes[0].height === 120, 'FmScaled standalone PDF page size');

  // Encrypted PDF with Form XObjects
  const encVectorPdf = await makeVectorFormPdf({ userPassword: 'vpass', ownerPassword: 'vown' });
  const encForms = await extractFormXObjects(encVectorPdf, {
    sourceName: 'locked-diagrams.pdf',
    password: 'vpass',
    minSizePt: 16,
  });
  assert(encForms.length === 2, `expected 2 forms from encrypted PDF, got ${encForms.length}`);
  const unlockedSizes = await pageSizes(encForms[0].pdfBytes);
  assert(unlockedSizes.length === 1, 'extracted form PDF from encrypted input should open without password');
});

// 12. pdfBytesToSvg (extracted Form XObject PDF & cropped inline page region)
await runCheck('12. pdfBytesToSvg (Form XObject & page region -> valid SVG)', async () => {
  const vectorPdf = await makeVectorFormPdf();
  const forms = await extractFormXObjects(vectorPdf, { sourceName: 'diagrams.pdf', minSizePt: 16 });
  const chart = forms.find((f) => f.name.includes('FmChart'));
  assert(Boolean(chart), 'missing FmChart for SVG conversion');

  const formSvg = await pdfBytesToSvg(chart.pdfBytes);
  assert(formSvg.svg.startsWith('<svg '), 'Form SVG must start with <svg');
  assert(formSvg.svg.trim().endsWith('</svg>'), 'Form SVG must end with </svg>');
  assert(formSvg.pathCount >= 2 && formSvg.svg.includes('<path '), `expected >=2 paths, got ${formSvg.pathCount}`);
  assert(formSvg.textCount >= 1 && formSvg.svg.includes('<text ') && formSvg.svg.includes('Vector Chart'), 'expected text label in Form SVG');

  const openG = (formSvg.svg.match(/<g[\s>]/g) ?? []).length;
  const closeG = (formSvg.svg.match(/<\/g>/g) ?? []).length;
  assert(openG > 0 && openG === closeG, `unbalanced <g> tags in Form SVG (${openG} open vs ${closeG} close)`);

  // Page region conversion on inline vector PDF (top schematic cluster)
  const inlinePdf = await makeInlineVectorPdf();
  const regionSvg = await pdfBytesToSvg(inlinePdf, {
    pageIndex: 0,
    rect: { x: 75, y: 128, width: 272, height: 150 },
  });
  assert(regionSvg.svg.startsWith('<svg '), 'Region SVG must start with <svg');
  assert(regionSvg.pathCount >= 4, `expected >=4 paths in top schematic region, got ${regionSvg.pathCount}`);
  assert(regionSvg.textCount >= 1 && regionSvg.svg.includes('Vin'), 'expected schematic label text in region SVG');
  assert(!regionSvg.svg.includes('wide body prose'), 'region SVG should exclude prose outside crop box');

  const rOpenG = (regionSvg.svg.match(/<g[\s>]/g) ?? []).length;
  const rCloseG = (regionSvg.svg.match(/<\/g>/g) ?? []).length;
  assert(rOpenG > 0 && rOpenG === rCloseG, `unbalanced <g> tags in Region SVG (${rOpenG} open vs ${rCloseG} close)`);
});

// 13. extractRegionAsPdf (unrotated page & 90° rotated page)
await runCheck('13. extractRegionAsPdf (unrotated & 90° rotated page)', async () => {
  const inlinePdf = await makeInlineVectorPdf();
  const unrotCropped = await extractRegionAsPdf(inlinePdf, {
    pageIndex: 0,
    rect: { x: 75, y: 128, width: 270, height: 150 },
  });
  const unrotSizes = await pageSizes(unrotCropped);
  assert(
    unrotSizes.length === 1 && unrotSizes[0].width === 270 && unrotSizes[0].height === 150 && unrotSizes[0].rotation === 0,
    `unexpected unrotated crop size: ${JSON.stringify(unrotSizes)}`,
  );

  // Page index 1 of makeRotatedPdf() has /Rotate 90 and raw 320x415 => upright viewport 415x320.
  const rotPdf = await makeRotatedPdf();
  const rotCropped = await extractRegionAsPdf(rotPdf, {
    pageIndex: 1,
    rect: { x: 40, y: 30, width: 180, height: 120 },
  });
  const rotSizes = await pageSizes(rotCropped);
  assert(
    rotSizes.length === 1 && rotSizes[0].rotation === 90 && rotSizes[0].width === 120 && rotSizes[0].height === 180,
    `unexpected raw rotated crop box: ${JSON.stringify(rotSizes)}`,
  );

  // Confirm upright rendered viewport dimensions via pdf.js are exactly 180x120.
  const pdfjs = await import('pdfjs-dist');
  const task = pdfjs.getDocument({ data: rotCropped.slice(), verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    assert(
      Math.round(vp.width) === 180 && Math.round(vp.height) === 120,
      `expected upright rotated crop viewport 180x120, got ${vp.width}x${vp.height}`,
    );
  } finally {
    await task.destroy();
  }
});

// 14. analyzePageVectors, detectFiguresOnPage & tightenRegionToContent
await runCheck('14. analyzePageVectors, detectFiguresOnPage & tightenRegionToContent', async () => {
  const inlinePdf = await makeInlineVectorPdf();
  const pdfjs = await import('pdfjs-dist');
  const task = pdfjs.getDocument({ data: inlinePdf.slice(), verbosity: 0 });
  let index;
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    index = await analyzePageVectors(page, pdfjs.OPS);
  } finally {
    await task.destroy();
  }

  assert(index.primitives.some((p) => p.role === 'background'), 'expected full-page white background to be classified as background');
  assert(index.primitives.some((p) => p.role === 'rule'), 'expected header line to be classified as rule');

  const detected = detectFiguresOnPage(index);
  assert(detected.length === 2, `expected 2 detected inline figures, got ${detected.length}`);

  const [topFig, botFig] = detected;
  // Top figure sits above prose (vpY ~ 138..266); prose sits at vpY ~ 352..402; bottom figure sits below (vpY ~ 532..692).
  assert(
    topFig.rect.y < 160 && topFig.rect.y + topFig.rect.height < 320,
    `top figure rect leaked out of top band: ${JSON.stringify(topFig.rect)}`,
  );
  assert(
    botFig.rect.y > 490 && botFig.rect.y + botFig.rect.height > 640,
    `bottom figure rect out of bottom band: ${JSON.stringify(botFig.rect)}`,
  );
  assert(topFig.textCount >= 1 && botFig.textCount >= 1, 'expected short labels attached to both figures');

  // tightenRegionToContent shrinks an oversized box tightly around top figure
  const oversized = { x: 20, y: 80, width: 420, height: 240 };
  const tightened = tightenRegionToContent(index, oversized, 4);
  assert(Boolean(tightened), 'tightenRegionToContent should return a rect for box containing top figure');
  assert(
    tightened.width < oversized.width - 80 && tightened.height < oversized.height - 40,
    `expected tightened box (${JSON.stringify(tightened)}) to shrink substantially from ${JSON.stringify(oversized)}`,
  );

  // tightenRegionToContent returns null on empty space (ignoring background fill)
  const emptyRect = { x: 420, y: 540, width: 130, height: 160 };
  const emptyTight = tightenRegionToContent(index, emptyRect, 4);
  assert(emptyTight === null, `expected null on empty space, got ${JSON.stringify(emptyTight)}`);
});

// 15. lib/pdf/reader.ts helpers (findTextMatches & splitItemWithMatches)
await runCheck('15. lib/pdf/reader.ts (findTextMatches & splitItemWithMatches)', async () => {
  const insensitive = findTextMatches('Alpha alpha ALPHA', 'alpha', false, 2);
  assertDeepEqual(
    insensitive,
    [
      { pageNumber: 2, start: 0, end: 5 },
      { pageNumber: 2, start: 6, end: 11 },
      { pageNumber: 2, start: 12, end: 17 },
    ],
    'case-insensitive matches',
  );

  const sensitive = findTextMatches('Alpha alpha ALPHA', 'alpha', true, 2);
  assertDeepEqual(sensitive, [{ pageNumber: 2, start: 6, end: 11 }], 'case-sensitive match');

  const nonOverlapping = findTextMatches('aaaaa', 'aa', false, 1);
  assertDeepEqual(
    nonOverlapping,
    [
      { pageNumber: 1, start: 0, end: 2 },
      { pageNumber: 1, start: 2, end: 4 },
    ],
    'non-overlapping matches',
  );

  assertDeepEqual(findTextMatches('hello', '', false, 1), [], 'empty query');

  const item = {
    str: 'Hello QUANTUM world QUANTUM!',
    startOffset: 10,
    endOffset: 38,
    left: 0,
    top: 0,
    fontSize: 12,
    angle: 0,
    targetWidth: 100,
    fontFamily: 'sans-serif',
  };
  const spans = [
    { start: 0, end: 5, globalIndex: 0 }, // before item
    { start: 16, end: 23, globalIndex: 1 }, // first QUANTUM
    { start: 30, end: 37, globalIndex: 2 }, // second QUANTUM
    { start: 50, end: 55, globalIndex: 3 }, // after item
  ];
  const segments = splitItemWithMatches(item, spans);
  assertDeepEqual(
    segments,
    [
      { text: 'Hello ', matchIndex: null },
      { text: 'QUANTUM', matchIndex: 1 },
      { text: ' world ', matchIndex: null },
      { text: 'QUANTUM', matchIndex: 2 },
      { text: '!', matchIndex: null },
    ],
    'splitItemWithMatches segments',
  );

  // Partial boundary overlap clips cleanly
  const clipped = splitItemWithMatches(item, [{ start: 8, end: 15, globalIndex: 7 }]);
  assertDeepEqual(
    clipped,
    [
      { text: 'Hello', matchIndex: 7 },
      { text: ' QUANTUM world QUANTUM!', matchIndex: null },
    ],
    'splitItemWithMatches partial boundary overlap',
  );
});

// 16. lib/pdf/security.ts (inspectSecurity, protectPdf AES-256 & AES-128, unlockPdf)
await runCheck('16. security.ts (inspectSecurity, protectPdf, unlockPdf)', async () => {
  const plain = await makeMultiPagePdf(3);
  const plainInfo = await inspectSecurity(plain);
  assert(!plainInfo.isEncrypted && !plainInfo.needsPassword && plainInfo.passwordAccepted, 'plain PDF should not be encrypted');

  const enc256 = await protectPdf(plain, {
    userPassword: 'user-pass',
    ownerPassword: 'owner-pass',
    algorithm: 'aes256',
    permissions: {
      printing: 'lowResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: true,
      contentAccessibility: true,
      documentAssembly: false,
    },
  });

  const encInfoNoPw = await inspectSecurity(enc256);
  assert(encInfoNoPw.isEncrypted && encInfoNoPw.needsPassword && !encInfoNoPw.passwordAccepted, 'AES-256 PDF should require password');
  assert(encInfoNoPw.algorithm === 'AES-256', `expected AES-256, got ${encInfoNoPw.algorithm}`);

  const encInfoGoodPw = await inspectSecurity(enc256, 'user-pass');
  assert(encInfoGoodPw.passwordAccepted, 'inspectSecurity should accept userPassword');

  // Verify loading without password fails in @cantoo/pdf-lib
  let loadFailed = false;
  try {
    await PDFDocument.load(enc256);
  } catch {
    loadFailed = true;
  }
  assert(loadFailed, 'loading encrypted PDF without password must fail');

  // Verify opening with userPassword and ownerPassword works in @cantoo/pdf-lib
  const userSizes = await pageSizes(enc256, 'user-pass');
  const ownerSizes = await pageSizes(enc256, 'owner-pass');
  assert(userSizes.length === 3 && ownerSizes.length === 3, 'user and owner passwords must unlock 3 pages');

  // Verify pdfjs-dist rejects without password and opens with userPassword & ownerPassword
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let pdfjsNoPwFailed = false;
  const badTask = pdfjs.getDocument({ data: enc256.slice(), verbosity: 0 });
  try {
    await badTask.promise;
  } catch {
    pdfjsNoPwFailed = true;
  } finally {
    await badTask.destroy();
  }
  assert(pdfjsNoPwFailed, 'pdfjs-dist must reject encrypted PDF without password');

  for (const pw of ['user-pass', 'owner-pass']) {
    const okTask = pdfjs.getDocument({ data: enc256.slice(), password: pw, verbosity: 0 });
    try {
      const doc = await okTask.promise;
      assert(doc.numPages === 3, `pdfjs-dist expected 3 pages with ${pw}`);
      const p1 = await doc.getPage(1);
      const tc = await p1.getTextContent();
      const joined = tc.items.map((it) => it.str).join(' ');
      assert(joined.includes('Page 1'), `expected "Page 1" text via pdfjs-dist with ${pw}`);
    } finally {
      await okTask.destroy();
    }
  }

  // AES-128 with omitted ownerPassword (auto-generates random owner password when permissions restricted)
  const enc128 = await protectPdf(plain, {
    userPassword: 'u128',
    algorithm: 'aes128',
    permissions: { copying: false },
  });
  const info128 = await inspectSecurity(enc128, 'u128');
  assert(info128.isEncrypted && info128.algorithm === 'AES-128' && info128.passwordAccepted, `expected AES-128 accepted, got ${JSON.stringify(info128)}`);

  // Unlock encrypted PDF -> opens without password and is no longer encrypted
  const unlocked = await unlockPdf(enc256, 'user-pass');
  assert(unlocked.wasEncrypted === true, 'unlockPdf should report wasEncrypted=true');
  const unlockedInfo = await inspectSecurity(unlocked.bytes);
  assert(!unlockedInfo.isEncrypted && !unlockedInfo.needsPassword, 'unlocked PDF must not be encrypted');
  const unlockedSizes = await pageSizes(unlocked.bytes);
  assert(unlockedSizes.length === 3, 'unlocked PDF should open without password and keep 3 pages');

  const unlockedTask = pdfjs.getDocument({ data: unlocked.bytes.slice(), verbosity: 0 });
  try {
    const doc = await unlockedTask.promise;
    assert(doc.numPages === 3, 'pdfjs-dist should open unlocked PDF without password');
  } finally {
    await unlockedTask.destroy();
  }

  // Unlocking an already unencrypted PDF reports wasEncrypted=false
  const noopUnlock = await unlockPdf(unlocked.bytes, '');
  assert(noopUnlock.wasEncrypted === false, 'unlockPdf on plain PDF should report wasEncrypted=false');
});

// 17. lib/pdf/metadata.ts (readPdfMetadata & writePdfMetadata round-trip + XMP control)
await runCheck('17. metadata.ts (readPdfMetadata & writePdfMetadata + XMP)', async () => {
  const dirty = await makeMetadataPdf();
  const initial = await readPdfMetadata(dirty);
  assert(initial.title === 'Confidential Brief', `unexpected initial title: ${initial.title}`);
  assert(initial.author === 'Alice Example', `unexpected initial author: ${initial.author}`);
  assert(initial.subject === 'Internal Review', `unexpected initial subject: ${initial.subject}`);
  assert(initial.keywords.includes('secret') && initial.keywords.includes('draft'), `unexpected initial keywords: ${initial.keywords}`);
  assert(initial.creator === 'FixtureCreator 1.0', `unexpected initial creator: ${initial.creator}`);
  assert(initial.producer === 'FixtureProducer 2.0', `unexpected initial producer: ${initial.producer}`);
  assert(initial.hasXmp === true, 'expected initial XMP to be present');

  const targetDate = '2025-06-15T10:30:00.000Z';
  const updatedBytes = await writePdfMetadata(dirty, {
    title: 'Updated Spec',
    author: 'Ada Lovelace',
    subject: '', // clear subject cleanly
    keywords: 'rf, antenna, v2',
    creator: 'Editor 2.0',
    producer: 'PDF Tools',
    creationDate: targetDate,
    modificationDate: null,
    customFields: [
      { key: 'Department', value: 'RF Lab' },
      { key: 'ProjectCode', value: 'EM-42' },
    ],
    clearXmp: true,
  });

  const roundTrip = await readPdfMetadata(updatedBytes);
  assert(roundTrip.title === 'Updated Spec', `round-trip title: ${roundTrip.title}`);
  assert(roundTrip.author === 'Ada Lovelace', `round-trip author: ${roundTrip.author}`);
  assert(roundTrip.subject === '', `expected cleared subject, got "${roundTrip.subject}"`);
  assert(roundTrip.keywords === 'rf, antenna, v2', `round-trip keywords: ${roundTrip.keywords}`);
  assert(roundTrip.creator === 'Editor 2.0', `round-trip creator: ${roundTrip.creator}`);
  assert(roundTrip.producer === 'PDF Tools', `round-trip producer: ${roundTrip.producer}`);
  assert(roundTrip.creationDate === targetDate, `round-trip creationDate: ${roundTrip.creationDate}`);
  assert(roundTrip.modificationDate === null, `expected cleared modificationDate, got ${roundTrip.modificationDate}`);
  assert(roundTrip.hasXmp === false, 'expected XMP stream cleared when clearXmp=true');
  assertDeepEqual(
    roundTrip.customFields,
    [
      { key: 'Department', value: 'RF Lab' },
      { key: 'ProjectCode', value: 'EM-42' },
    ],
    'custom fields round-trip',
  );

  // Verify clearXmp: false preserves XMP stream
  const keptXmpBytes = await writePdfMetadata(dirty, { title: 'Keep XMP', clearXmp: false });
  const keptXmp = await readPdfMetadata(keptXmpBytes);
  assert(keptXmp.title === 'Keep XMP' && keptXmp.hasXmp === true, 'clearXmp=false must retain catalog XMP');
});

// 18. lib/pdf/annotations.ts (inspectAnnotations, removeAnnotations, flattenPdf)
await runCheck('18. annotations.ts (inspect, selective remove, flatten)', async () => {
  const annotPdf = await makeAnnotatedFormPdf();
  const summary = await inspectAnnotations(annotPdf);
  assert(summary.totalCount === 7, `expected 7 annotations, got ${summary.totalCount}`);
  assert(summary.pagesWithAnnotations === 2, `expected 2 pages with annotations, got ${summary.pagesWithAnnotations}`);
  assert(summary.acroFormFieldCount === 2 && summary.hasAcroForm, `expected 2 AcroForm fields, got ${summary.acroFormFieldCount}`);

  const bySubtype = Object.fromEntries(summary.subtypes.map((s) => [s.subtype, s.count]));
  assert(bySubtype.Widget === 2, `expected 2 Widgets, got ${bySubtype.Widget}`);
  assert(bySubtype.Text === 2, `expected 2 Text notes, got ${bySubtype.Text}`);
  assert(bySubtype.Highlight === 1, `expected 1 Highlight, got ${bySubtype.Highlight}`);
  assert(bySubtype.Square === 1, `expected 1 Square, got ${bySubtype.Square}`);
  assert(bySubtype.Link === 1, `expected 1 Link, got ${bySubtype.Link}`);

  // Selective removal: remove Text and Square while preserving Link, Highlight, and Widgets
  const selRes = await removeAnnotations(annotPdf, { subtypes: ['Text', 'Square'] });
  assert(selRes.removedCount === 3 && selRes.remainingCount === 4, `selective removal counts: ${JSON.stringify(selRes)}`);
  const afterSel = await inspectAnnotations(selRes.bytes);
  const selMap = Object.fromEntries(afterSel.subtypes.map((s) => [s.subtype, s.count]));
  assert(!selMap.Text && !selMap.Square && selMap.Link === 1 && selMap.Highlight === 1 && selMap.Widget === 2, `unexpected subtypes after selective remove: ${JSON.stringify(selMap)}`);

  // Full removal: removes all annotations and cleans /AcroForm
  const allRes = await removeAnnotations(annotPdf, { removeAcroFormIfEmpty: true });
  assert(allRes.removedCount === 7 && allRes.remainingCount === 0, `full removal counts: ${JSON.stringify(allRes)}`);
  const afterAll = await inspectAnnotations(allRes.bytes);
  assert(afterAll.totalCount === 0 && !afterAll.hasAcroForm, `expected 0 annotations & no AcroForm after full removal, got ${JSON.stringify(afterAll)}`);

  // Flatten: flattens AcroForm fields + Highlight/Square /AP/N, keeps Link, skips 2 Text notes without /AP
  const flatRes = await flattenPdf(annotPdf, {
    flattenForms: true,
    flattenAnnotations: true,
    keepLinks: true,
  });
  assert(flatRes.flattenedFormFields === 2, `expected 2 flattenedFormFields, got ${flatRes.flattenedFormFields}`);
  assert(flatRes.flattenedAnnotations === 2, `expected 2 flattenedAnnotations, got ${flatRes.flattenedAnnotations}`);
  assert(flatRes.skippedWithoutAppearance === 2, `expected 2 skippedWithoutAppearance, got ${flatRes.skippedWithoutAppearance}`);
  assert(flatRes.keptAnnotations === 3, `expected 3 keptAnnotations (1 Link + 2 skipped Text), got ${flatRes.keptAnnotations}`);

  const afterFlat = await inspectAnnotations(flatRes.bytes);
  assert(!afterFlat.hasAcroForm && afterFlat.acroFormFieldCount === 0, 'AcroForm must be removed after flatten');
  const flatMap = Object.fromEntries(afterFlat.subtypes.map((s) => [s.subtype, s.count]));
  assert(flatMap.Link === 1 && !flatMap.Highlight && !flatMap.Square && !flatMap.Widget, `unexpected remaining subtypes after flatten: ${JSON.stringify(flatMap)}`);

  // Verify FlatAnnot XObjects were registered on both pages and form value text is static via pdfjs-dist
  const flatDoc = await PDFDocument.load(flatRes.bytes, { updateMetadata: false });
  for (let pIdx = 0; pIdx < 2; pIdx++) {
    const resDict = flatDoc.getPage(pIdx).node.Resources();
    const xobjs = resDict?.lookup(PDFName.of('XObject'));
    const keys = xobjs ? xobjs.keys().map((k) => k.decodeText()) : [];
    assert(keys.some((k) => k.startsWith('FlatAnnot')), `page ${pIdx + 1} missing FlatAnnot XObject in ${keys.join(', ')}`);
  }

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const flatTask = pdfjs.getDocument({ data: flatRes.bytes.slice(), verbosity: 0 });
  try {
    const pdoc = await flatTask.promise;
    const p1 = await pdoc.getPage(1);
    const tc = await p1.getTextContent();
    const text = tc.items.map((it) => it.str).join(' ');
    assert(text.includes('Ada Lovelace'), `expected flattened form text "Ada Lovelace" in page 1 content, got "${text}"`);
  } finally {
    await flatTask.destroy();
  }
});

// 19. lib/pdf/pageNumbers.ts (unrotated + rotated pages, skipFirstPage, startNumber, mirrorEvenPages, pageRange)
await runCheck('19. pageNumbers.ts (rotated pages, skipFirst, startNumber, pageRange)', async () => {
  const rotPdf = await makeRotatedPdf(); // 4 pages with /Rotate 0, 90, 180, 270
  const stamped = await addPageNumbers(rotPdf, {
    position: 'bottom-right',
    format: 'Page {n} of {total} ({page}/{pages})',
    font: 'helvetica-bold',
    fontSize: 12,
    color: '#112233',
    marginX: 24,
    marginY: 20,
    startNumber: 10,
    skipFirstPage: true,
    mirrorEvenPages: true,
  });

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: stamped.slice(), verbosity: 0 });
  try {
    const pdoc = await task.promise;
    assert(pdoc.numPages === 4, 'expected 4 pages');

    // Page 1 was skipped
    const p1 = await pdoc.getPage(1);
    const t1 = (await p1.getTextContent()).items.map((i) => i.str).join(' ');
    assert(!t1.includes('Page '), `page 1 should be skipped, got "${t1}"`);

    const expectedSpecs = [
      { pageNum: 2, label: 'Page 10 of 3 (2/4)', side: 'left' },  // even -> mirrored to bottom-left
      { pageNum: 3, label: 'Page 11 of 3 (3/4)', side: 'right' }, // odd -> bottom-right
      { pageNum: 4, label: 'Page 12 of 3 (4/4)', side: 'left' },  // even -> mirrored to bottom-left
    ];

    for (const spec of expectedSpecs) {
      const page = await pdoc.getPage(spec.pageNum);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const joined = tc.items.map((i) => i.str).join(' ');
      assert(joined.includes(spec.label), `page ${spec.pageNum} missing "${spec.label}" in "${joined}"`);

      // Confirm the stamped text item sits in the visual bottom half and expected left/right half, upright!
      const matchItem = tc.items.find((i) => i.str.includes('Page '));
      assert(Boolean(matchItem), `page ${spec.pageNum} missing text item for position check`);
      const tx = pdfjs.Util.transform(vp.transform, matchItem.transform);
      const vx = tx[4];
      const vy = tx[5]; // viewport Y grows downward: bottom of page has vy close to vp.height
      assert(vy > vp.height * 0.7, `page ${spec.pageNum} number should be near visual bottom (vy=${vy.toFixed(1)}, H=${vp.height})`);
      if (spec.side === 'left') {
        assert(vx < vp.width * 0.5, `page ${spec.pageNum} number should be on visual left (vx=${vx.toFixed(1)}, W=${vp.width})`);
      } else {
        assert(vx > vp.width * 0.4, `page ${spec.pageNum} number should be on visual right (vx=${vx.toFixed(1)}, W=${vp.width})`);
      }
      // Check upright orientation in viewport space: tx[0] > 0 and |tx[1]| ~ 0
      assert(tx[0] > 0 && Math.abs(tx[1]) < 0.1, `page ${spec.pageNum} number should be upright (tx=${JSON.stringify(tx)})`);
    }
  } finally {
    await task.destroy();
  }

  // Test pageRange subset
  const plain4 = await makeMultiPagePdf(4);
  const ranged = await addPageNumbers(plain4, {
    format: 'NUM_{n}',
    pageRange: '2-3',
    startNumber: 5,
  });
  const rTask = pdfjs.getDocument({ data: ranged.slice(), verbosity: 0 });
  try {
    const pdoc = await rTask.promise;
    const texts = [];
    for (let i = 1; i <= 4; i++) {
      const p = await pdoc.getPage(i);
      texts.push((await p.getTextContent()).items.map((it) => it.str).join(' '));
    }
    assert(!texts[0].includes('NUM_'), 'page 1 outside pageRange must not be numbered');
    assert(texts[1].includes('NUM_5'), `page 2 expected NUM_5 in "${texts[1]}"`);
    assert(texts[2].includes('NUM_6'), `page 3 expected NUM_6 in "${texts[2]}"`);
    assert(!texts[3].includes('NUM_'), 'page 4 outside pageRange must not be numbered');
  } finally {
    await rTask.destroy();
  }
});

// 20. lib/pdf/watermark.ts (text single/tiled, over/under, rotated pages, PNG image watermark)
await runCheck('20. watermark.ts (text single/tiled, over/under, rotated, PNG image)', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // A. Single text watermark on rotated PDF ('over')
  const rotPdf = await makeRotatedPdf();
  const singleTextWm = await addWatermark(rotPdf, {
    kind: 'text',
    text: 'CONFIDENTIAL',
    font: 'helvetica-bold',
    fontSize: 36,
    color: '#cc2222',
    layout: 'single',
    position: 'center',
    rotation: -45,
    opacity: 0.3,
    layer: 'over',
  });

  const t1 = pdfjs.getDocument({ data: singleTextWm.slice(), verbosity: 0 });
  try {
    const pdoc = await t1.promise;
    for (let i = 1; i <= 4; i++) {
      const page = await pdoc.getPage(i);
      const tc = await page.getTextContent();
      const joined = tc.items.map((it) => it.str).join(' ');
      assert(joined.includes('CONFIDENTIAL'), `rotated page ${i} missing CONFIDENTIAL watermark`);
    }
  } finally {
    await t1.destroy();
  }

  // B. Tiled text watermark with layer='under' and pageRange='1-2'
  const multi3 = await makeMultiPagePdf(3);
  const tiledUnderWm = await addWatermark(multi3, {
    kind: 'text',
    text: 'DRAFT',
    fontSize: 22,
    layout: 'tiled',
    tileGapX: 80,
    tileGapY: 80,
    rotation: 30,
    opacity: 0.2,
    layer: 'under',
    pageRange: '1-2',
  });

  const t2 = pdfjs.getDocument({ data: tiledUnderWm.slice(), verbosity: 0 });
  try {
    const pdoc = await t2.promise;
    const p1Items = (await (await pdoc.getPage(1)).getTextContent()).items.map((it) => it.str);
    const p2Items = (await (await pdoc.getPage(2)).getTextContent()).items.map((it) => it.str);
    const p3Items = (await (await pdoc.getPage(3)).getTextContent()).items.map((it) => it.str);

    const p1Drafts = p1Items.filter((s) => s.includes('DRAFT'));
    assert(p1Drafts.length >= 2, `expected tiled watermark to repeat >=2 times on page 1, got ${p1Drafts.length}`);
    assert(p2Items.some((s) => s.includes('DRAFT')), 'page 2 should contain DRAFT watermark');
    assert(!p3Items.some((s) => s.includes('DRAFT')), 'page 3 outside pageRange should not contain DRAFT');

    // Verify layer='under' drew DRAFT BEFORE original 'Page 1' text!
    const firstDraftIdx = p1Items.findIndex((s) => s.includes('DRAFT'));
    const page1TextIdx = p1Items.findIndex((s) => s.includes('Page 1'));
    assert(
      firstDraftIdx >= 0 && page1TextIdx > firstDraftIdx,
      `expected layer='under' to place DRAFT (${firstDraftIdx}) before Page 1 (${page1TextIdx})`,
    );
  } finally {
    await t2.destroy();
  }

  // C. PNG image watermark
  const pngBytes = makeRgbaPng(32, 24);
  const multi2 = await makeMultiPagePdf(2);
  const imgWm = await addWatermark(multi2, {
    kind: 'image',
    imageBytes: pngBytes,
    imageType: 'png',
    imageScale: 0.35,
    layout: 'single',
    position: 'bottom-right',
    rotation: 0,
    opacity: 0.4,
    layer: 'over',
  });

  const imgDocSizes = await pageSizes(imgWm);
  assert(imgDocSizes.length === 2, 'image-watermarked PDF must remain valid 2-page PDF');

  const t3 = pdfjs.getDocument({ data: imgWm.slice(), verbosity: 0 });
  try {
    const pdoc = await t3.promise;
    for (let i = 1; i <= 2; i++) {
      const page = await pdoc.getPage(i);
      const ops = await page.getOperatorList();
      const hasImageOp = ops.fnArray.some(
        (fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject,
      );
      assert(hasImageOp, `page ${i} missing image paint operator after PNG watermark`);
    }
  } finally {
    await t3.destroy();
  }
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
