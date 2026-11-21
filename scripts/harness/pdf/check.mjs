// Node verification harness for framework-free lib/pdf/* modules.
//   npm run check   (tsx check.mjs)

import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';

import {
  makeAnnotatedFormPdf,
  makeBookmarkedPdf,
  makeColorAndImagePdf,
  makeCompressiblePdf,
  makeEncryptedPdf,
  makeFillableFormPdf,
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
import * as colorMod from '../../../lib/pdf/color.ts';
import * as compressMod from '../../../lib/pdf/compress.ts';
import * as cropMod from '../../../lib/pdf/crop.ts';
import * as detectFiguresMod from '../../../lib/pdf/detectFigures.ts';
import * as extractImagesMod from '../../../lib/pdf/extractImages.ts';
import * as extractVectorsMod from '../../../lib/pdf/extractVectors.ts';
import * as formsMod from '../../../lib/pdf/forms.ts';
import * as mergeMod from '../../../lib/pdf/merge.ts';
import * as metadataMod from '../../../lib/pdf/metadata.ts';
import * as nupMod from '../../../lib/pdf/nup.ts';
import * as pageNumbersMod from '../../../lib/pdf/pageNumbers.ts';
import * as pagesMod from '../../../lib/pdf/pages.ts';
import * as pdfToSvgMod from '../../../lib/pdf/pdfToSvg.ts';
import * as readerMod from '../../../lib/pdf/reader.ts';
import * as resizeMod from '../../../lib/pdf/resize.ts';
import * as sanitizeMod from '../../../lib/pdf/sanitize.ts';
import * as securityMod from '../../../lib/pdf/security.ts';
import * as signMod from '../../../lib/pdf/sign.ts';
import * as splitMod from '../../../lib/pdf/split.ts';
import * as watermarkMod from '../../../lib/pdf/watermark.ts';

const unwrap = (x) => x.default ?? x;
const { inspectAnnotations, removeAnnotations, flattenPdf } = unwrap(annotationsMod);
const { inspectPdfSizeBreakdown } = unwrap(breakdownMod);
const { grayscalePdf, transformRgbaPixels } = unwrap(colorMod);
const { compressPdf } = unwrap(compressMod);
const { getPageBoxes, cropPdf } = unwrap(cropMod);
const { analyzePageVectors, detectFiguresOnPage, tightenRegionToContent } = unwrap(detectFiguresMod);
const { extractImagesFromPdf } = unwrap(extractImagesMod);
const { extractFormXObjects, extractRegionAsPdf } = unwrap(extractVectorsMod);
const { inspectFormFields, fillFormPdf } = unwrap(formsMod);
const { parsePageRanges, mergePdfs } = unwrap(mergeMod);
const { readPdfMetadata, writePdfMetadata } = unwrap(metadataMod);
const { nupPdf, computeBookletOrder, bookletPdf } = unwrap(nupMod);
const { addPageNumbers } = unwrap(pageNumbersMod);
const { formatPageRanges, buildPdfFromPages, rotatePdf, removePagesPdf, extractPagesPdf } = unwrap(pagesMod);
const { pdfBytesToSvg } = unwrap(pdfToSvgMod);
const { findTextMatches, splitItemWithMatches } = unwrap(readerMod);
const { RESIZE_PRESETS, resizePdf } = unwrap(resizeMod);
const { inspectPdf, cleanPdf, PRESETS } = unwrap(sanitizeMod);
const { inspectSecurity, protectPdf, unlockPdf } = unwrap(securityMod);
const { applySignaturesToPdf } = unwrap(signMod);
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

// 21. lib/pdf/crop.ts (getPageBoxes & cropPdf on unrotated + 90°-rotated pages + resetCrop)
await runCheck('21. crop.ts (getPageBoxes, unrotated & 90°-rotated crop, resetCrop)', async () => {
  const rotPdf = await makeRotatedPdf(); // p1: 300x400 rot 0; p2: 320x415 rot 90 (visual 415x320)
  const boxes = await getPageBoxes(rotPdf);
  assert(boxes.length === 4, `expected 4 page boxes, got ${boxes.length}`);
  assert(boxes[0].rotation === 0 && boxes[0].visualWidth === 300 && boxes[0].visualHeight === 400, `p1 box mismatch: ${JSON.stringify(boxes[0])}`);
  assert(boxes[1].rotation === 90 && boxes[1].visualWidth === 415 && boxes[1].visualHeight === 320, `p2 box mismatch: ${JSON.stringify(boxes[1])}`);

  // Crop page 1 with normalized visual rect [0.1..0.9, 0.2..0.8] and page 2 (rot=90) with [0.1..0.6, 0.25..0.75]
  const croppedBytes = await cropPdf(rotPdf, {
    perPageCrops: {
      1: { left: 0.1, top: 0.2, right: 0.9, bottom: 0.8 },
      2: { left: 0.1, top: 0.25, right: 0.6, bottom: 0.75 },
    },
  });
  const afterBoxes = await getPageBoxes(croppedBytes);

  // Page 1 (rot 0, 300x400): x = 30..270 (w=240), y = 400-320..400-80 = 80..320 (h=240)
  const b0 = afterBoxes[0];
  assert(
    Math.abs(b0.cropBox.x - 30) < 0.5 &&
      Math.abs(b0.cropBox.y - 80) < 0.5 &&
      Math.abs(b0.cropBox.width - 240) < 0.5 &&
      Math.abs(b0.cropBox.height - 240) < 0.5,
    `p1 cropped box unexpected: ${JSON.stringify(b0.cropBox)}`,
  );

  // Page 2 (rot 90, raw 320x415, visual 415x320):
  // rx = 41.5, rw = 207.5 (50% of 415); ry = 80, rh = 160 (50% of 320)
  // For rot=90: raw px = [vx0 + ry, vx0 + ry + rh] = [80, 240] (w=160); raw py = [vy0 + rx, vy0 + rx + rw] = [41.5, 249] (h=207.5)
  const b1 = afterBoxes[1];
  assert(
    Math.abs(b1.cropBox.x - 80) < 0.5 &&
      Math.abs(b1.cropBox.y - 41.5) < 0.5 &&
      Math.abs(b1.cropBox.width - 160) < 0.5 &&
      Math.abs(b1.cropBox.height - 207.5) < 0.5 &&
      Math.abs(b1.visualWidth - 207.5) < 0.5 &&
      Math.abs(b1.visualHeight - 160) < 0.5,
    `p2 (rot=90) cropped box unexpected: ${JSON.stringify(b1)}`,
  );

  // Page 3 & 4 untouched
  assert(afterBoxes[2].visualWidth === boxes[2].visualWidth, 'page 3 should be untouched');

  // Uniform margin crop on page 1: trim 20pt left/right, 30pt top/bottom
  const marginCropped = await cropPdf(rotPdf, {
    margins: { left: 20, right: 20, top: 30, bottom: 30 },
    pageRange: '1',
  });
  const mb0 = (await getPageBoxes(marginCropped))[0];
  assert(
    Math.abs(mb0.visualWidth - 260) < 0.5 && Math.abs(mb0.visualHeight - 340) < 0.5,
    `margin crop p1 expected 260x340, got ${mb0.visualWidth}x${mb0.visualHeight}`,
  );

  // resetCrop restores CropBox back to MediaBox
  const resetBytes = await cropPdf(croppedBytes, { resetCrop: true });
  const resetBoxes = await getPageBoxes(resetBytes);
  assert(
    Math.abs(resetBoxes[0].cropBox.width - resetBoxes[0].mediaBox.width) < 0.1 &&
      Math.abs(resetBoxes[0].cropBox.height - resetBoxes[0].mediaBox.height) < 0.1 &&
      Math.abs(resetBoxes[1].cropBox.width - resetBoxes[1].mediaBox.width) < 0.1 &&
      Math.abs(resetBoxes[1].cropBox.height - resetBoxes[1].mediaBox.height) < 0.1,
    `resetCrop must restore MediaBox on all pages: ${JSON.stringify(resetBoxes.slice(0, 2))}`,
  );

  // Cropping an encrypted PDF with password produces a clean unencrypted PDF
  const encPdf = await makeEncryptedPdf('secret', 'owner');
  const croppedEnc = await cropPdf(encPdf, { margins: { left: 10, right: 10, top: 10, bottom: 10 } }, 'secret');
  const croppedEncBoxes = await getPageBoxes(croppedEnc);
  assert(croppedEncBoxes.length === 4, 'cropped encrypted PDF should open without password and have 4 pages');
});

// 22. lib/pdf/resize.ts (A4 portrait/landscape/auto, fit/fill/center, rotated source, selectable text)
await runCheck('22. resize.ts (A4 portrait/landscape/auto, fit/fill/center, rotated, text)', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Stamp visually upright labels onto makeRotatedPdf (rot 0, 90, 180, 270) so we can verify both
  // original content orientation fidelity AND visually upright text remaining upright after /Rotate baking.
  const rotPdf = await addPageNumbers(await makeRotatedPdf(), {
    position: 'bottom-right',
    format: 'UPRIGHT_{page}',
    marginX: 20,
    marginY: 20,
  });

  // A4 auto orientation: portrait pages -> 595x842, landscape (rot 90/270) -> 842x595
  const autoA4 = await resizePdf(rotPdf, { preset: 'a4', orientation: 'auto', fitMode: 'fit', margin: 18 });
  const autoSizes = await pageSizes(autoA4);
  assert(autoSizes.length === 4, `expected 4 resized pages, got ${autoSizes.length}`);
  assert(
    Math.abs(autoSizes[0].width - Math.round(RESIZE_PRESETS.a4.widthPt)) <= 1 &&
      Math.abs(autoSizes[0].height - Math.round(RESIZE_PRESETS.a4.heightPt)) <= 1 &&
      autoSizes[0].rotation === 0,
    `p1 auto A4 should be portrait: ${JSON.stringify(autoSizes[0])}`,
  );
  assert(
    Math.abs(autoSizes[1].width - Math.round(RESIZE_PRESETS.a4.heightPt)) <= 1 &&
      Math.abs(autoSizes[1].height - Math.round(RESIZE_PRESETS.a4.widthPt)) <= 1 &&
      autoSizes[1].rotation === 0,
    `p2 (rot 90) auto A4 should be landscape upright: ${JSON.stringify(autoSizes[1])}`,
  );

  // Compare source vs resized visual text directions and verify UPRIGHT_1..4 stay upright & bottom-right!
  const srcTask = pdfjs.getDocument({ data: rotPdf.slice(), verbosity: 0 });
  const dstTask = pdfjs.getDocument({ data: autoA4.slice(), verbosity: 0 });
  try {
    const srcDoc = await srcTask.promise;
    const dstDoc = await dstTask.promise;
    const expectedLabels = ['Rot 0', 'Rot 90', 'Rot 180', 'Rot 270'];
    for (let i = 0; i < 4; i++) {
      const srcPage = await srcDoc.getPage(i + 1);
      const dstPage = await dstDoc.getPage(i + 1);
      const srcVp = srcPage.getViewport({ scale: 1 });
      const dstVp = dstPage.getViewport({ scale: 1 });
      const srcTc = await srcPage.getTextContent();
      const dstTc = await dstPage.getTextContent();
      const joined = dstTc.items.map((it) => it.str).join(' ');

      assert(joined.includes(expectedLabels[i]), `resized page ${i + 1} missing "${expectedLabels[i]}" in "${joined}"`);
      assert(joined.includes(`UPRIGHT_${i + 1}`), `resized page ${i + 1} missing "UPRIGHT_${i + 1}" in "${joined}"`);

      // Original text visual direction must match source visual direction exactly
      const srcRotItem = srcTc.items.find((it) => it.str.includes('Rot'));
      const dstRotItem = dstTc.items.find((it) => it.str.includes('Rot'));
      const srcTx = pdfjs.Util.transform(srcVp.transform, srcRotItem.transform);
      const dstTx = pdfjs.Util.transform(dstVp.transform, dstRotItem.transform);
      const srcNorm = Math.hypot(srcTx[0], srcTx[1]);
      const dstNorm = Math.hypot(dstTx[0], dstTx[1]);
      const dot = (srcTx[0] * dstTx[0] + srcTx[1] * dstTx[1]) / (srcNorm * dstNorm);
      assert(dot > 0.999, `resized page ${i + 1} visual orientation drifted from source (dot=${dot.toFixed(4)})`);

      // Visually upright stamp must remain upright (tx[0] > 0, |tx[1]| ~ 0) in bottom-right visual quadrant
      const upItem = dstTc.items.find((it) => it.str.includes(`UPRIGHT_${i + 1}`));
      const upTx = pdfjs.Util.transform(dstVp.transform, upItem.transform);
      assert(
        upTx[0] > 0 && Math.abs(upTx[1]) < 0.1,
        `resized page ${i + 1} UPRIGHT stamp should remain upright (tx=${JSON.stringify(upTx)})`,
      );
      assert(
        upTx[4] > dstVp.width * 0.5 && upTx[5] > dstVp.height * 0.7,
        `resized page ${i + 1} UPRIGHT stamp should stay near bottom-right (${upTx[4].toFixed(1)}, ${upTx[5].toFixed(1)} in ${dstVp.width.toFixed(0)}x${dstVp.height.toFixed(0)})`,
      );
    }
  } finally {
    await srcTask.destroy();
    await dstTask.destroy();
  }

  // Forced portrait & landscape + fill/center modes + pageRange subset
  const forcedLandscape = await resizePdf(rotPdf, {
    preset: 'a4',
    orientation: 'landscape',
    fitMode: 'fill',
    pageRange: '1-2',
  });
  const flSizes = await pageSizes(forcedLandscape);
  assert(flSizes[0].width > flSizes[0].height && flSizes[1].width > flSizes[1].height, 'pages 1-2 must be landscape');
  assert(flSizes[2].width === 340 && flSizes[2].rotation === 180, 'unselected page 3 must be copied unchanged');

  const centeredCustom = await resizePdf(rotPdf, {
    preset: 'custom',
    customWidth: 200,
    customHeight: 250,
    customUnit: 'mm',
    orientation: 'portrait',
    fitMode: 'center',
  });
  const ccSizes = await pageSizes(centeredCustom);
  assert(
    Math.abs(ccSizes[0].width - Math.round((200 * 72) / 25.4)) <= 1 &&
      Math.abs(ccSizes[0].height - Math.round((250 * 72) / 25.4)) <= 1,
    `custom mm dimensions mismatch: ${JSON.stringify(ccSizes[0])}`,
  );
});

// 23. lib/pdf/nup.ts (2-up & 4-up, computeBookletOrder & bookletPdf short-edge/long-edge)
await runCheck('23. nup.ts (2-up, 4-up, computeBookletOrder, bookletPdf short/long-edge)', async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const src6 = await makeMultiPagePdf(6, { labelPrefix: 'Slide' });

  // 2-up of 6 pages -> ceil(6/2) = 3 landscape A4 sheets
  const twoUp = await nupPdf(src6, { perSheet: 2, paperSize: 'a4', orientation: 'auto', drawBorder: true });
  const twoSizes = await pageSizes(twoUp);
  assert(twoSizes.length === 3, `2-up of 6 pages expected 3 sheets, got ${twoSizes.length}`);
  assert(twoSizes[0].width > twoSizes[0].height, `2-up auto of portrait pages should be landscape: ${JSON.stringify(twoSizes[0])}`);

  // 4-up of 6 pages -> ceil(6/4) = 2 portrait A4 sheets, all 6 Slide texts preserved
  const fourUp = await nupPdf(src6, { perSheet: 4, paperSize: 'a4', readingOrder: 'lr-tb' });
  const fourSizes = await pageSizes(fourUp);
  assert(fourSizes.length === 2, `4-up of 6 pages expected 2 sheets, got ${fourSizes.length}`);
  const tFour = pdfjs.getDocument({ data: fourUp.slice(), verbosity: 0 });
  try {
    const pdoc = await tFour.promise;
    const s1 = (await (await pdoc.getPage(1)).getTextContent()).items.map((it) => it.str).join(' ');
    const s2 = (await (await pdoc.getPage(2)).getTextContent()).items.map((it) => it.str).join(' ');
    for (let n = 1; n <= 4; n++) assert(s1.includes(`Slide ${n}`), `4-up sheet 1 missing Slide ${n}`);
    for (let n = 5; n <= 6; n++) assert(s2.includes(`Slide ${n}`), `4-up sheet 2 missing Slide ${n}`);
  } finally {
    await tFour.destroy();
  }

  // computeBookletOrder pure unit checks
  assertDeepEqual(computeBookletOrder(4, 'left'), [[4, 1], [2, 3]], 'booklet 4-page LTR');
  assertDeepEqual(computeBookletOrder(4, 'right'), [[1, 4], [3, 2]], 'booklet 4-page RTL');
  assertDeepEqual(
    computeBookletOrder(6, 'left'),
    [[null, 1], [2, null], [6, 3], [4, 5]],
    'booklet 6-page LTR',
  );
  assertDeepEqual(
    computeBookletOrder(6, 'right'),
    [[1, null], [null, 2], [3, 6], [5, 4]],
    'booklet 6-page RTL',
  );

  // bookletPdf on 4 pages (short-edge: 2 landscape sides, upright backs)
  const src4 = await makeMultiPagePdf(4, { labelPrefix: 'Bk' });
  const bk4Short = await bookletPdf(src4, { binding: 'left', duplexEdge: 'short-edge', paperSize: 'a4' });
  const bk4Sizes = await pageSizes(bk4Short);
  assert(bk4Sizes.length === 2 && bk4Sizes[0].width > bk4Sizes[0].height, `4-page booklet expected 2 landscape sides, got ${JSON.stringify(bk4Sizes)}`);
  const tBk4 = pdfjs.getDocument({ data: bk4Short.slice(), verbosity: 0 });
  try {
    const pdoc = await tBk4.promise;
    const frontText = (await (await pdoc.getPage(1)).getTextContent()).items.map((it) => it.str).join(' ');
    const backPage = await pdoc.getPage(2);
    const backVp = backPage.getViewport({ scale: 1 });
    const backTc = await backPage.getTextContent();
    const backText = backTc.items.map((it) => it.str).join(' ');
    assert(frontText.includes('Bk 4') && frontText.includes('Bk 1'), `booklet front missing Bk 4 / Bk 1: "${frontText}"`);
    assert(backText.includes('Bk 2') && backText.includes('Bk 3'), `booklet back missing Bk 2 / Bk 3: "${backText}"`);
    const backItem = backTc.items.find((it) => it.str.includes('Bk 2'));
    const backTx = pdfjs.Util.transform(backVp.transform, backItem.transform);
    assert(backTx[0] > 0, `short-edge duplex back side should be upright (tx=${JSON.stringify(backTx)})`);
  } finally {
    await tBk4.destroy();
  }

  // bookletPdf on 6 pages (long-edge: 4 landscape sides, back sides rotated 180°)
  const bk6Long = await bookletPdf(src6, { binding: 'left', duplexEdge: 'long-edge', paperSize: 'letter' });
  const bk6Sizes = await pageSizes(bk6Long);
  assert(bk6Sizes.length === 4, `6-page booklet expected 4 sides, got ${bk6Sizes.length}`);
  const tBk6 = pdfjs.getDocument({ data: bk6Long.slice(), verbosity: 0 });
  try {
    const pdoc = await tBk6.promise;
    const s1Front = (await (await pdoc.getPage(1)).getTextContent()).items.map((it) => it.str).join(' ');
    const s1BackPage = await pdoc.getPage(2);
    const s1BackVp = s1BackPage.getViewport({ scale: 1 });
    const s1BackTc = await s1BackPage.getTextContent();
    const s1Back = s1BackTc.items.map((it) => it.str).join(' ');
    const s2Front = (await (await pdoc.getPage(3)).getTextContent()).items.map((it) => it.str).join(' ');
    const s2Back = (await (await pdoc.getPage(4)).getTextContent()).items.map((it) => it.str).join(' ');

    assert(s1Front.includes('Slide 1') && !s1Front.includes('Slide 6'), `sheet 1 front should only have Slide 1: "${s1Front}"`);
    assert(s1Back.includes('Slide 2'), `sheet 1 back missing Slide 2: "${s1Back}"`);
    assert(s2Front.includes('Slide 6') && s2Front.includes('Slide 3'), `sheet 2 front missing Slide 6 & 3: "${s2Front}"`);
    assert(s2Back.includes('Slide 4') && s2Back.includes('Slide 5'), `sheet 2 back missing Slide 4 & 5: "${s2Back}"`);

    // Long-edge duplex rotates back sides 180° -> text x-scale is negative
    const backItem = s1BackTc.items.find((it) => it.str.includes('Slide 2'));
    const backTx = pdfjs.Util.transform(s1BackVp.transform, backItem.transform);
    assert(backTx[0] < 0, `long-edge duplex back side should be rotated 180° (tx=${JSON.stringify(backTx)})`);
  } finally {
    await tBk6.destroy();
  }
});

// 24. lib/pdf/color.ts (grayscalePdf on RGB/CMYK vector operators + Flate RGB image + skipped JPEG)
await runCheck('24. color.ts (grayscalePdf vectors + Flate RGB image + pdfjs open)', async () => {
  const colorFixture = await makeColorAndImagePdf();
  const res = await grayscalePdf(colorFixture);

  assert(res.convertedImages >= 1, `expected >=1 converted Flate RGB image, got ${res.convertedImages}`);
  assert(res.skippedJpegImages === 1, `expected 1 skipped JPEG without callback, got ${res.skippedJpegImages}`);
  assert(res.rewrittenStreams >= 1, `expected >=1 rewritten content stream, got ${res.rewrittenStreams}`);
  assert(res.convertedOperators >= 8, `expected >=8 converted color operators (rg/RG/k/K/cs/sc/CS/SC), got ${res.convertedOperators}`);

  // Inspect output PDF structure: Flate image XObject must now be /ColorSpace /DeviceGray,
  // and content stream must have no rg/RG/k/K color ops while preserving literal text "(Color literal 1 0 0 rg stays intact)".
  const outDoc = await PDFDocument.load(res.bytes, { updateMetadata: false });
  let foundDeviceGrayFlateImg = false;
  let foundRawRgbFlateImg = false;
  for (const [, obj] of outDoc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream && obj.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')) {
      const flt = obj.dict.lookup(PDFName.of('Filter'));
      const cs = obj.dict.lookup(PDFName.of('ColorSpace'));
      if (flt === PDFName.of('FlateDecode')) {
        if (cs === PDFName.of('DeviceGray')) foundDeviceGrayFlateImg = true;
        if (cs === PDFName.of('DeviceRGB')) foundRawRgbFlateImg = true;
      }
    }
  }
  assert(foundDeviceGrayFlateImg && !foundRawRgbFlateImg, 'Flate RGB image must be converted to DeviceGray');

  // Decode page content streams and verify vector color operators were rewritten to g/G
  const p0 = outDoc.getPage(0);
  const contentsObj = p0.node.lookup(PDFName.of('Contents'));
  const streams = contentsObj instanceof PDFArray
    ? contentsObj.asArray().map((ref) => outDoc.context.lookup(ref))
    : [contentsObj];
  const combinedText = streams
    .filter((s) => s instanceof PDFRawStream)
    .map((s) => new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()))
    .join('\n');

  assert(!/\b[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+RG\b/.test(combinedText), `RG operator should be rewritten: ${combinedText}`);
  assert(!/\b[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+[0-9.]+\s+[kK]\b/.test(combinedText), `k/K operator should be rewritten: ${combinedText}`);
  assert(/\b0\.2126\s+g\b/.test(combinedText), `pure red (1 0 0 rg) should become 0.2126 g in: ${combinedText}`);
  assert(/\b0\.0722\s+G\b/.test(combinedText), `pure blue (0 0 1 RG) should become 0.0722 G in: ${combinedText}`);
  assert(/\/DeviceGray\s+cs\b/.test(combinedText), `/DeviceRGB cs should become /DeviceGray cs`);

  // Verify output PDF opens cleanly in pdfjs-dist and preserves the literal text untouched!
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: res.bytes.slice(), verbosity: 0 });
  try {
    const pdoc = await task.promise;
    assert(pdoc.numPages === 1, 'grayscale PDF should have 1 page');
    const page = await pdoc.getPage(1);
    const text = (await page.getTextContent()).items.map((it) => it.str).join(' ');
    assert(
      text.includes('Color literal 1 0 0 rg stays intact'),
      `literal string containing "1 0 0 rg" must not be corrupted: "${text}"`,
    );
  } finally {
    await task.destroy();
  }
});

// 25. lib/pdf/color.ts (transformRgbaPixels for grayscale, invert, smart-dark, warm-dark, custom)
await runCheck('25. color.ts (transformRgbaPixels: grayscale, invert, smart-dark, warm-dark, custom)', async () => {
  // Test pixels: [white (255,255,255,255), black (0,0,0,200), pure blue (0,0,255,128), pure red (255,0,0,255)]
  const makeSample = () =>
    new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 200,
      0, 0, 255, 128,
      255, 0, 0, 255,
    ]);

  // 1) grayscale (BT.709)
  const gray = transformRgbaPixels(makeSample(), 'grayscale');
  assert(gray[0] === 255 && gray[1] === 255 && gray[2] === 255 && gray[3] === 255, 'grayscale white');
  assert(gray[4] === 0 && gray[5] === 0 && gray[6] === 0 && gray[7] === 200, 'grayscale black + alpha preserved');
  assert(gray[8] === 18 && gray[9] === 18 && gray[10] === 18 && gray[11] === 128, `grayscale pure blue expected 18, got ${gray[8]}`);
  assert(gray[12] === 54 && gray[13] === 54 && gray[14] === 54, `grayscale pure red expected 54, got ${gray[12]}`);

  // 2) invert
  const inv = transformRgbaPixels(makeSample(), 'invert');
  assert(inv[0] === 0 && inv[1] === 0 && inv[2] === 0 && inv[3] === 255, 'invert white -> black');
  assert(inv[4] === 255 && inv[5] === 255 && inv[6] === 255 && inv[7] === 200, 'invert black -> white + alpha');
  assert(inv[8] === 255 && inv[9] === 255 && inv[10] === 0 && inv[11] === 128, 'invert blue -> yellow + alpha');

  // 3) smart-dark: white -> #171717 (23), black -> #ededed (237), pure blue keeps blue hue!
  const smart = transformRgbaPixels(makeSample(), 'smart-dark');
  assert(
    Math.abs(smart[0] - 23) <= 1 && Math.abs(smart[1] - 23) <= 1 && Math.abs(smart[2] - 23) <= 1,
    `smart-dark white should map to #171717 (23), got (${smart[0]},${smart[1]},${smart[2]})`,
  );
  assert(
    Math.abs(smart[4] - 237) <= 1 && Math.abs(smart[5] - 237) <= 1 && Math.abs(smart[6] - 237) <= 1 && smart[7] === 200,
    `smart-dark black should map to #ededed (237), got (${smart[4]},${smart[5]},${smart[6]})`,
  );
  assert(
    smart[10] > 240 && smart[8] < 20 && smart[9] < 20 && smart[11] === 128,
    `smart-dark pure blue must keep blue hue (B>>R,G), got (${smart[8]},${smart[9]},${smart[10]})`,
  );
  assert(
    smart[12] > 240 && smart[13] < 20 && smart[14] < 20,
    `smart-dark pure red must keep red hue (R>>G,B), got (${smart[12]},${smart[13]},${smart[14]})`,
  );

  // 4) warm-dark: white -> #1e1b17 (30,27,23), black -> #e8dec8 (232,222,200), blue stays blue-dominant
  const warm = transformRgbaPixels(makeSample(), 'warm-dark');
  assert(
    warm[0] === 30 && warm[1] === 27 && warm[2] === 23,
    `warm-dark white should be #1e1b17 (30,27,23), got (${warm[0]},${warm[1]},${warm[2]})`,
  );
  assert(
    warm[4] === 232 && warm[5] === 222 && warm[6] === 200,
    `warm-dark black should be #e8dec8 (232,222,200), got (${warm[4]},${warm[5]},${warm[6]})`,
  );
  assert(warm[10] > warm[8] + 100 && warm[10] > warm[9] + 100, `warm-dark blue should stay blue-dominant: (${warm[8]},${warm[9]},${warm[10]})`);

  // 5) custom: white -> exact backgroundHex (#102030), black -> exact foregroundHex (#f0e0d0)
  const custom = transformRgbaPixels(makeSample(), 'custom', {
    backgroundHex: '#102030',
    foregroundHex: '#f0e0d0',
    preserveHue: true,
  });
  assert(
    custom[0] === 0x10 && custom[1] === 0x20 && custom[2] === 0x30,
    `custom white should be #102030, got (${custom[0]},${custom[1]},${custom[2]})`,
  );
  assert(
    custom[4] === 0xf0 && custom[5] === 0xe0 && custom[6] === 0xd0 && custom[7] === 200,
    `custom black should be #f0e0d0, got (${custom[4]},${custom[5]},${custom[6]})`,
  );
  assert(
    custom[10] > custom[8] + 100 && custom[10] > custom[9] + 100,
    `custom preserveHue=true should preserve blue hue: (${custom[8]},${custom[9]},${custom[10]})`,
  );
});

// 26. lib/pdf/forms.ts (inspectFormFields with rotated page & /Annots fallback, fillFormPdf round-trip, flatten)
await runCheck('26. forms.ts (inspectFormFields, rotated widgets, fillFormPdf, flatten)', async () => {
  const formPdf = await makeFillableFormPdf();
  const inspected = await inspectFormFields(formPdf);
  assert(inspected.pageCount === 2, `expected 2 pages, got ${inspected.pageCount}`);
  assert(inspected.unsupportedCount === 0, `expected 0 unsupported fields, got ${inspected.unsupportedCount}`);
  assert(inspected.fields.length === 6, `expected 6 fields, got ${inspected.fields.length}`);

  const byName = Object.fromEntries(inspected.fields.map((f) => [f.name, f]));
  assert(byName.fullName.type === 'text' && byName.fullName.label === 'Full Legal Name' && byName.fullName.maxLength === 60 && byName.fullName.value === 'Jane Doe', `unexpected fullName: ${JSON.stringify(byName.fullName)}`);
  assert(byName.notes.type === 'multiline' && byName.notes.label === 'Additional Notes' && byName.notes.value === 'Initial note', `unexpected notes: ${JSON.stringify(byName.notes)}`);
  assert(byName.subscribe.type === 'checkbox' && byName.subscribe.value === false && byName.subscribe.widgets.length === 1 && byName.subscribe.widgets[0].pageIndex === 0, `subscribe widget without /P should resolve to page 0: ${JSON.stringify(byName.subscribe)}`);
  assert(byName.plan.type === 'radio' && byName.plan.value === 'Starter' && byName.plan.widgets.length === 2, `unexpected plan: ${JSON.stringify(byName.plan)}`);
  assertDeepEqual(byName.plan.widgets.map((w) => w.optionValue), ['Starter', 'Pro'], 'radio widget optionValues');
  assert(byName.country.type === 'dropdown' && byName.country.value === 'Norway', `unexpected country: ${JSON.stringify(byName.country)}`);
  assert(byName.topics.type === 'optionList' && byName.topics.multiSelect === true && byName.topics.widgets.length === 1 && byName.topics.widgets[0].pageIndex === 1, `unexpected topics: ${JSON.stringify(byName.topics)}`);
  assertDeepEqual(byName.topics.value, ['RF'], 'initial optionList value');

  // Verify every widget rect is normalized inside [0, 1]
  for (const field of inspected.fields) {
    assert(field.widgets.length > 0, `field ${field.name} has no widgets`);
    for (const w of field.widgets) {
      assert(
        w.left >= 0 && w.top >= 0 && w.width > 0 && w.height > 0 && w.left + w.width <= 1.001 && w.top + w.height <= 1.001,
        `invalid normalized rect on ${field.name}: ${JSON.stringify(w)}`,
      );
    }
  }

  // Cross-check the 90°-rotated page widget normalized rect directly against pdfjs-dist viewport math
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const vpTask = pdfjs.getDocument({ data: formPdf.slice(), verbosity: 0 });
  try {
    const pdoc = await vpTask.promise;
    const p2 = await pdoc.getPage(2);
    const vp = p2.getViewport({ scale: 1 });
    const p2Annots = await p2.getAnnotations();
    const [rx0, ry0, rx1, ry1] = p2Annots[0].rect;
    const [a, b, c, d, e, f] = vp.transform;
    const vx0 = a * rx0 + c * ry0 + e;
    const vy0 = b * rx0 + d * ry0 + f;
    const vx1 = a * rx1 + c * ry1 + e;
    const vy1 = b * rx1 + d * ry1 + f;
    const expLeft = Math.min(vx0, vx1) / vp.width;
    const expTop = Math.min(vy0, vy1) / vp.height;
    const expWidth = Math.abs(vx1 - vx0) / vp.width;
    const expHeight = Math.abs(vy1 - vy0) / vp.height;
    const w = byName.topics.widgets[0];
    assert(
      Math.abs(w.left - expLeft) < 0.002 &&
        Math.abs(w.top - expTop) < 0.002 &&
        Math.abs(w.width - expWidth) < 0.002 &&
        Math.abs(w.height - expHeight) < 0.002,
      `rotated widget rect mismatch: got ${JSON.stringify(w)}, expected (${expLeft.toFixed(4)}, ${expTop.toFixed(4)}, ${expWidth.toFixed(4)}, ${expHeight.toFixed(4)})`,
    );
  } finally {
    await vpTask.destroy();
  }

  // Fill all 6 fields without flattening and verify every value round-trips via inspectFormFields
  const filled = await fillFormPdf(formPdf, {
    fullName: 'Ada Lovelace',
    notes: 'First line\nSecond line',
    subscribe: true,
    plan: 'Pro',
    country: 'Sweden',
    topics: ['Antennas', 'DSP'],
  });
  assert(filled.filledCount === 6 && filled.flattened === false, `unexpected fill result: filledCount=${filled.filledCount}, flattened=${filled.flattened}`);

  const afterFill = await inspectFormFields(filled.bytes);
  const afterMap = Object.fromEntries(afterFill.fields.map((f) => [f.name, f]));
  assert(afterMap.fullName.value === 'Ada Lovelace', `round-trip fullName: ${afterMap.fullName.value}`);
  assert(afterMap.notes.value === 'First line\nSecond line', `round-trip notes: ${afterMap.notes.value}`);
  assert(afterMap.subscribe.value === true, `round-trip subscribe: ${afterMap.subscribe.value}`);
  assert(afterMap.plan.value === 'Pro', `round-trip plan: ${afterMap.plan.value}`);
  assert(afterMap.country.value === 'Sweden', `round-trip country: ${afterMap.country.value}`);
  assertDeepEqual(afterMap.topics.value, ['Antennas', 'DSP'], 'round-trip topics');

  // Fill + flatten -> 0 remaining interactive fields and pdfjs-dist extracts filled static text
  const flatRes = await fillFormPdf(
    formPdf,
    {
      fullName: 'Grace Hopper',
      notes: 'Flattened memo',
      subscribe: true,
      plan: 'Pro',
      country: 'Denmark',
      topics: ['PCB', 'RF'],
    },
    { flatten: true },
  );
  assert(flatRes.flattened === true && flatRes.filledCount === 6, `expected flattened=true, filledCount=6`);

  const afterFlat = await inspectFormFields(flatRes.bytes);
  assert(afterFlat.fields.length === 0, `expected 0 fields after flatten, got ${afterFlat.fields.length}`);

  const flatTask = pdfjs.getDocument({ data: flatRes.bytes.slice(), verbosity: 0 });
  try {
    const pdoc = await flatTask.promise;
    const p1 = await pdoc.getPage(1);
    const t1 = (await p1.getTextContent()).items.map((it) => it.str).join(' ');
    assert(t1.includes('Grace Hopper'), `flattened page 1 missing "Grace Hopper" in "${t1}"`);
    assert(t1.includes('Flattened memo'), `flattened page 1 missing "Flattened memo" in "${t1}"`);
    assert(t1.includes('Denmark'), `flattened page 1 missing "Denmark" in "${t1}"`);
  } finally {
    await flatTask.destroy();
  }
});

// 27. lib/pdf/sign.ts (applySignaturesToPdf: multi-page PNG assetId reuse, 90°-rotated text stamp, encrypted input)
await runCheck('27. sign.ts (applySignaturesToPdf: assetId reuse, rotated page text, pdfjs)', async () => {
  const rotPdf = await makeRotatedPdf(); // 4 pages: rot 0, 90, 180, 270
  const sigPng = makeRgbaPng(48, 24);

  const res = await applySignaturesToPdf(rotPdf, [
    {
      id: 'sig-p1',
      pageIndex: 0,
      kind: 'image',
      assetId: 'hand-sig-1',
      imageBytes: sigPng,
      imageType: 'png',
      left: 0.1,
      top: 0.72,
      width: 0.3,
      height: 0.12,
      opacity: 0.95,
    },
    {
      id: 'sig-p2',
      pageIndex: 1,
      kind: 'image',
      assetId: 'hand-sig-1', // Same assetId on page 2 -> must reuse a single embedded image XObject
      imageBytes: sigPng,
      imageType: 'png',
      left: 0.12,
      top: 0.75,
      width: 0.28,
      height: 0.12,
    },
    {
      id: 'date-p2',
      pageIndex: 1, // 90°-rotated page
      kind: 'text',
      text: '2026-11-21',
      font: 'helvetica-bold',
      fontSize: 14,
      color: '#1d4ed8',
      left: 0.62,
      top: 0.8,
      width: 0.28,
      height: 0.08,
    },
  ]);

  assert(res.placedCount === 3, `expected placedCount=3, got ${res.placedCount}`);
  assert(res.pagesModified === 2, `expected pagesModified=2, got ${res.pagesModified}`);

  // Confirm single embedded image XObject reuse across page 0 and page 1
  const outDoc = await PDFDocument.load(res.bytes, { updateMetadata: false });
  const getSigImgRefs = (pIdx) => {
    const resDict = outDoc.getPage(pIdx).node.Resources();
    const xobjs = resDict?.lookup(PDFName.of('XObject'));
    if (!xobjs) return [];
    return xobjs
      .keys()
      .filter((k) => k.decodeText().startsWith('SigImg'))
      .map((k) => xobjs.get(k));
  };
  const p0Refs = getSigImgRefs(0);
  const p1Refs = getSigImgRefs(1);
  assert(p0Refs.length === 1 && p1Refs.length === 1, `expected 1 SigImg ref on p0 & p1, got ${p0Refs.length}, ${p1Refs.length}`);
  assert(p0Refs[0].toString() === p1Refs[0].toString(), `same assetId must reuse one PDFRef (${p0Refs[0]} vs ${p1Refs[0]})`);

  // Verify with pdfjs-dist: opens cleanly, image paint ops exist on signed pages, and date text on rotated page 2 is upright in bottom-right!
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: res.bytes.slice(), verbosity: 0 });
  try {
    const pdoc = await task.promise;
    assert(pdoc.numPages === 4, `expected 4 pages, got ${pdoc.numPages}`);

    for (const pageNum of [1, 2]) {
      const page = await pdoc.getPage(pageNum);
      const ops = await page.getOperatorList();
      const hasImageOp = ops.fnArray.some(
        (fn) => fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject,
      );
      assert(hasImageOp, `signed page ${pageNum} missing image paint operator`);
    }

    // Check rotated page 2 (rot=90) date stamp text, upright orientation, and visual position
    const p2 = await pdoc.getPage(2);
    const vp = p2.getViewport({ scale: 1 });
    const tc = await p2.getTextContent();
    const joined = tc.items.map((it) => it.str).join(' ');
    assert(joined.includes('2026-11-21'), `rotated page 2 missing date stamp "2026-11-21" in "${joined}"`);

    const dateItem = tc.items.find((it) => it.str.includes('2026-11-21'));
    assert(Boolean(dateItem), 'missing date text item on rotated page 2');
    const tx = pdfjs.Util.transform(vp.transform, dateItem.transform);
    assert(tx[0] > 0 && Math.abs(tx[1]) < 0.1, `date stamp on rotated page 2 must be upright (tx=${JSON.stringify(tx)})`);
    assert(
      tx[4] > vp.width * 0.5 && tx[5] > vp.height * 0.7,
      `date stamp on rotated page 2 must sit in visual bottom-right (vx=${tx[4].toFixed(1)}/${vp.width}, vy=${tx[5].toFixed(1)}/${vp.height})`,
    );
  } finally {
    await task.destroy();
  }

  // Also verify signing an encrypted PDF with password saves cleanly without unused encryption objects
  const encPdf = await makeEncryptedPdf('secret', 'owner');
  const signedEnc = await applySignaturesToPdf(
    encPdf,
    [
      {
        id: 'enc-text',
        pageIndex: 0,
        kind: 'text',
        text: 'Signed OK',
        left: 0.1,
        top: 0.8,
        width: 0.25,
        height: 0.06,
      },
    ],
    'secret',
  );
  assert(signedEnc.placedCount === 1 && signedEnc.pagesModified === 1, 'encrypted sign counts');
  const encDoc = await PDFDocument.load(signedEnc.bytes, { updateMetadata: false });
  assert(!encDoc.context.trailerInfo.Encrypt, 'signed encrypted PDF should save unencrypted');
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
