// Phase 4 headless browser E2E checks for /licenses and Phase 4 /pdf/* tools.
// Invoked by scripts/harness/pdf/ui.mjs before the final zero-errors assertion.

import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

import * as imageDecodeMod from '../../../lib/pdf/imageDecode.ts';
import * as pdfaMod from '../../../lib/pdf/pdfa.ts';

const { encodePngRgba } = imageDecodeMod.default ?? imageDecodeMod;
const { inspectPdfA } = pdfaMod.default ?? pdfaMod;

// Minimal crisp 5x7 uppercase + digit bitmap font for generating synthetic image-only scan PDFs.
const BITMAP_FONT_5X7 = {
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
};

/**
 * Renders uppercase/digit text into an RGBA bitmap with crisp black strokes on pure white,
 * encodes as PNG, and embeds into a single-page image-only PDF (ZERO text operators).
 */
async function buildScannedTextPdf(text) {
  const upper = text.toUpperCase();
  const scale = 10; // Each 5x7 glyph becomes 50x70 px
  const glyphW = 5 * scale;
  const glyphH = 7 * scale;
  const charGap = 18;
  const marginX = 110;
  const marginY = 110;

  const width = marginX * 2 + upper.length * glyphW + Math.max(0, upper.length - 1) * charGap;
  const height = marginY * 2 + glyphH;

  const rgba = new Uint8Array(width * height * 4);
  rgba.fill(255); // Pure opaque white background

  for (let i = 0; i < upper.length; i++) {
    const glyph = BITMAP_FONT_5X7[upper[i]] ?? BITMAP_FONT_5X7[' '];
    const baseX = marginX + i * (glyphW + charGap);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          const y = marginY + row * scale + dy;
          for (let dx = 0; dx < scale; dx++) {
            const x = baseX + col * scale + dx;
            const idx = (y * width + x) * 4;
            rgba[idx] = 0;
            rgba[idx + 1] = 0;
            rgba[idx + 2] = 0;
            rgba[idx + 3] = 255;
          }
        }
      }
    }
  }

  const pngBytes = encodePngRgba(rgba, width, height);
  const doc = await PDFDocument.create();
  const img = await doc.embedPng(pngBytes);
  const page = doc.addPage([612, 792]);
  const drawW = 500;
  const drawH = (drawW * height) / width;
  page.drawImage(img, {
    x: (612 - drawW) / 2,
    y: 480,
    width: drawW,
    height: drawH,
  });
  return new Uint8Array(await doc.save());
}

/**
 * Extracts per-page text strings from a PDF in Node via pdfjs-dist legacy build.
 */
async function extractPdfPageTexts(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    verbosity: 0,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      try {
        const content = await page.getTextContent();
        const joined = content.items
          .map((item) => (item && typeof item === 'object' && 'str' in item ? String(item.str) : ''))
          .join(' ');
        pages.push(joined);
      } finally {
        page.cleanup();
      }
    }
    return pages;
  } finally {
    await loadingTask.destroy();
  }
}

async function makeComparePair() {
  async function build(page1Line) {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    const p1 = doc.addPage([595, 842]);
    p1.drawText('Document Comparison Spec', { x: 60, y: 740, size: 18, font, color: rgb(0.1, 0.1, 0.1) });
    p1.drawText(page1Line, { x: 60, y: 690, size: 16, font, color: rgb(0.1, 0.1, 0.1) });
    p1.drawText('Shared Footer Line', { x: 60, y: 120, size: 12, font, color: rgb(0.2, 0.2, 0.2) });

    const p2 = doc.addPage([595, 842]);
    p2.drawText('Identical Page Two Content', { x: 60, y: 740, size: 16, font, color: rgb(0.1, 0.1, 0.1) });

    return new Uint8Array(await doc.save());
  }
  return {
    docA: await build('Version Alpha Release'),
    docB: await build('Version Beta Release'),
  };
}

async function makeRedactSamplePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const p1 = doc.addPage([595, 842]);
  p1.drawText('Confidential Record', { x: 60, y: 750, size: 18, font, color: rgb(0, 0, 0) });
  p1.drawText('Token: SECRET_TOKEN_99', { x: 60, y: 700, size: 14, font, color: rgb(0, 0, 0) });
  p1.drawText('Contact: alice@example.com', { x: 60, y: 660, size: 14, font, color: rgb(0, 0, 0) });

  const p2 = doc.addPage([595, 842]);
  p2.drawText('Public Summary: KEEP_ME', { x: 60, y: 750, size: 16, font, color: rgb(0, 0, 0) });

  return new Uint8Array(await doc.save());
}

async function makeDamagedPdf(basePdfBytes) {
  const baseDoc = await PDFDocument.load(basePdfBytes, { updateMetadata: false });
  const classicPdf = new Uint8Array(await baseDoc.save({ useObjectStreams: false }));
  const latin1 = new TextDecoder('latin1').decode(classicPdf);
  const xrefPos = latin1.indexOf('xref\n');
  if (xrefPos <= 0) throw new Error('Classic PDF fixture missing textual xref table');
  const xrefTail = latin1.slice(xrefPos);
  const corruptedTail = xrefTail.replace(/\d{10} 00000 n/g, '0000009999 00000 n');
  const tailWithJunk = `${corruptedTail}\nTRAILING_GARBAGE_BYTES_AFTER_EOF_1234567890`;
  const tailBytes = new TextEncoder().encode(tailWithJunk);
  const damaged = new Uint8Array(xrefPos + tailBytes.length);
  damaged.set(classicPdf.subarray(0, xrefPos), 0);
  damaged.set(tailBytes, xrefPos);
  return damaged;
}

export async function runPhase4UiChecks(ctx) {
  const { page, baseUrl, runTest, assert, readDownloadBytes, pdfUpload, fixtures } = ctx;
  const { pdf4, pdf3, colorAndImagePdf } = fixtures;

  // 31. /licenses lists site AGPL-3.0, Ghostscript, QPDF, and Tesseract.
  await runTest('31. /licenses lists site AGPL-3.0, Ghostscript, QPDF, and Tesseract', async () => {
    const res = await page.goto(`${baseUrl}/licenses`, { waitUntil: 'networkidle' });
    assert(res && res.status() === 200, `/licenses returned HTTP ${res?.status()}`);
    const bodyText = await page.evaluate(() => document.body.innerText);
    for (const token of ['AGPL-3.0', 'Ghostscript', 'QPDF', 'Tesseract']) {
      assert(bodyText.includes(token), `/licenses missing expected text "${token}"`);
    }
  });

  // 32. /pdf/compress (Ghostscript maximum compression in browser).
  await runTest('32. /pdf/compress (Ghostscript maximum compression in browser)', async () => {
    await page.goto(`${baseUrl}/pdf/compress`, { waitUntil: 'networkidle' });
    const srcDoc = await PDFDocument.load(colorAndImagePdf, { updateMetadata: false });
    const expectedPages = srcDoc.getPageCount();

    await page.locator('input[type="file"]').setInputFiles(pdfUpload('color-doc.pdf', colorAndImagePdf));
    await page.locator('img[src^="data:"]').first().waitFor({ timeout: 20000 });

    await page.getByText('Ghostscript (maximum)', { exact: true }).click();
    await page.getByRole('button', { name: 'Compress PDF', exact: true }).click();

    const dlBtn = page.locator('[class*="result"] button:has-text("Download")').first();
    await dlBtn.waitFor({ timeout: 60000 });

    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'Ghostscript compressed PDF missing %PDF- header');
    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(
      outDoc.getPageCount() === expectedPages,
      `expected ${expectedPages} pages after Ghostscript compression, got ${outDoc.getPageCount()}`,
    );
  });

  // 33. /pdf/linearize (QPDF Fast Web View in browser).
  await runTest('33. /pdf/linearize (QPDF Fast Web View in browser)', async () => {
    await page.goto(`${baseUrl}/pdf/linearize`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('report.pdf', pdf4));
    await page.getByText('Not linearized', { exact: true }).waitFor({ timeout: 25000 });

    await page.getByRole('button', { name: 'Optimize PDF', exact: true }).click();
    await page.getByRole('heading', { name: 'Verified Fast Web View' }).waitFor({ timeout: 30000 });

    const dlBtn = page.getByRole('button', { name: 'Download report-web.pdf', exact: true });
    await dlBtn.waitFor({ timeout: 10000 });

    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    const headerSlice = new TextDecoder('latin1').decode(bytes.slice(0, 1024));
    assert(headerSlice.includes('/Linearized'), 'linearized PDF first 1024 bytes missing /Linearized dictionary');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 4, `expected 4 pages after linearization, got ${outDoc.getPageCount()}`);
  });

  // 34. /pdf/repair (Damaged PDF recovery in browser).
  await runTest('34. /pdf/repair (Damaged PDF recovery in browser)', async () => {
    const damagedBytes = await makeDamagedPdf(pdf3);
    await page.goto(`${baseUrl}/pdf/repair`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('damaged.pdf', damagedBytes));

    await page.getByText(/issue[s]? detected/i).first().waitFor({ timeout: 25000 });
    await page.getByText('Needs repair', { exact: true }).first().waitFor({ timeout: 10000 });

    await page.getByRole('button', { name: 'Repair PDF', exact: true }).click();
    await page.getByText('Repaired & verified', { exact: true }).first().waitFor({ timeout: 30000 });

    const dlBtn = page.getByRole('button', { name: 'Download damaged-repaired.pdf', exact: true });
    await dlBtn.waitFor({ timeout: 10000 });

    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'repaired PDF missing %PDF- header');
    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 3, `expected 3 pages after repair, got ${outDoc.getPageCount()}`);
  });

  // 35. /pdf/compare (Visual overlay, Side-by-side, Swipe, and Text diff).
  await runTest('35. /pdf/compare (Visual overlay, Side-by-side, Swipe, and Text diff)', async () => {
    const { docA, docB } = await makeComparePair();
    await page.goto(`${baseUrl}/pdf/compare`, { waitUntil: 'networkidle' });

    const inputs = page.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles(pdfUpload('spec-a.pdf', docA));
    await inputs.nth(1).setInputFiles(pdfUpload('spec-b.pdf', docB));

    await page.getByText(/1 of 2 pages changed/i).waitFor({ timeout: 30000 });

    // Visual overlay (default active tab)
    const overlayTab = page.getByRole('tab', { name: 'Visual overlay' });
    await overlayTab.click();
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });

    // Side-by-side
    await page.getByRole('tab', { name: 'Side-by-side' }).click();
    await page.locator('canvas[aria-label="Document A page 1"]').waitFor({ timeout: 15000 });
    await page.locator('canvas[aria-label="Document B page 1"]').waitFor({ timeout: 15000 });

    // Swipe compare
    await page.getByRole('tab', { name: 'Swipe compare' }).click();
    await page.locator('input[aria-label="Swipe curtain position"]').waitFor({ timeout: 15000 });

    // Text diff
    await page.getByRole('tab', { name: 'Text diff' }).click();
    const textWrap = page.locator('[class*="textDiffWrap"]');
    await textWrap.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => {
      const el = document.querySelector('[class*="textDiffWrap"]');
      const txt = el?.textContent ?? '';
      return txt.includes('Alpha') && txt.includes('Beta');
    }, null, { timeout: 15000 });
  });

  // 36. /pdf/redact (Search & PII auto-mark + irreversible redaction in browser).
  await runTest('36. /pdf/redact (Search & PII auto-mark + irreversible redaction in browser)', async () => {
    const sampleBytes = await makeRedactSamplePdf();
    await page.goto(`${baseUrl}/pdf/redact`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('confidential.pdf', sampleBytes));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });

    // Search & auto-mark SECRET_TOKEN_99
    await page.getByLabel('Search text to redact').fill('SECRET_TOKEN_99');
    await page.getByRole('button', { name: 'Find & mark' }).click();
    await page.getByText(/Marked 1 match/i).waitFor({ timeout: 15000 });

    // PII auto-mark Emails
    await page.getByRole('button', { name: 'Emails', exact: true }).click();
    const applyBtn = page.getByRole('button', { name: 'Apply 2 redactions', exact: true });
    await applyBtn.waitFor({ timeout: 15000 });

    await applyBtn.click();
    await page.getByText(/Verified: 0 text items remain on 1 redacted page/i).waitFor({ timeout: 30000 });

    const dlBtn = page.getByRole('button', { name: 'Download confidential-redacted.pdf', exact: true });
    await dlBtn.waitFor({ timeout: 10000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 pages after redaction, got ${outDoc.getPageCount()}`);

    const texts = await extractPdfPageTexts(bytes);
    assert(!texts[0].includes('SECRET_TOKEN_99'), `page 1 still contains SECRET_TOKEN_99: "${texts[0]}"`);
    assert(!texts[0].includes('alice@example.com'), `page 1 still contains alice@example.com: "${texts[0]}"`);
    assert(texts[1].includes('KEEP_ME'), `page 2 lost untouched KEEP_ME text: "${texts[1]}"`);
  });

  // 37. /pdf/pdfa (Ghostscript PDF/A-2b conversion in browser).
  await runTest('37. /pdf/pdfa (Ghostscript PDF/A-2b conversion in browser)', async () => {
    await page.goto(`${baseUrl}/pdf/pdfa`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('archive.pdf', pdf3));

    await page.getByText('Not PDF/A', { exact: true }).first().waitFor({ timeout: 25000 });
    await page.getByText(/unembedded font/i).first().waitFor({ timeout: 15000 });

    await page.getByRole('button', { name: 'Convert to PDF/A-2b', exact: true }).click();
    await page.getByRole('heading', { name: 'Verified PDF/A-2b' }).waitFor({ timeout: 60000 });

    const dlBtn = page.getByRole('button', { name: 'Download archive-pdfa-2b.pdf', exact: true });
    await dlBtn.waitFor({ timeout: 10000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());

    const report = await inspectPdfA(bytes);
    assert(report.isPdfA, `PDF/A-2b output failed inspectPdfA: ${JSON.stringify(report.checks)}`);
    assert(
      report.pdfaidPart === 2 && report.pdfaidConformance === 'B',
      `expected PDF/A-2B, got part=${report.pdfaidPart} conf=${report.pdfaidConformance}`,
    );
    assert(report.hasOutputIntent, 'PDF/A-2b output missing /OutputIntents (/GTS_PDFA1)');
    assert(report.hasXmpMetadata, 'PDF/A-2b output missing XMP metadata');
    assert(
      report.unembeddedFonts.length === 0,
      `PDF/A-2b output still has unembedded fonts: ${report.unembeddedFonts.join(', ')}`,
    );

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 3, `expected 3 pages in PDF/A-2b output, got ${outDoc.getPageCount()}`);
  });

  // 38. /pdf/ocr (Real self-hosted Tesseract.js OCR in browser — zero CDN).
  await runTest('38. /pdf/ocr (Real self-hosted Tesseract.js OCR in browser — zero CDN)', async () => {
    const scannedBytes = await buildScannedTextPdf('HELLO 2026');
    // Confirm input truly has zero text before OCR
    const beforeTexts = await extractPdfPageTexts(scannedBytes);
    assert(beforeTexts[0].trim() === '', `scanned fixture unexpectedly had pre-existing text: "${beforeTexts[0]}"`);

    await page.goto(`${baseUrl}/pdf/ocr`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"][accept*="pdf"]').first().setInputFiles(pdfUpload('scanned.pdf', scannedBytes));
    await page.getByText('Ready for OCR', { exact: true }).first().waitFor({ timeout: 20000 });

    // Confirm English is checked by default
    const engCheckbox = page.locator('label:has-text("English") input[type="checkbox"]');
    assert(await engCheckbox.isChecked(), 'English OCR language checkbox should be checked by default');

    await page.getByRole('button', { name: 'Run OCR', exact: true }).click();
    await page.getByRole('heading', { name: 'Searchable PDF ready' }).waitFor({ timeout: 90000 });

    const previewText = await page.locator('[class*="textPreviewPre"]').innerText();
    assert(
      /HELLO|2026/i.test(previewText),
      `OCR extracted preview did not contain "HELLO" or "2026": "${previewText}"`,
    );

    const dlBtn = page.getByRole('button', { name: 'Download scanned-ocr.pdf', exact: true });
    await dlBtn.waitFor({ timeout: 10000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 1, `expected 1 page in OCR PDF, got ${outDoc.getPageCount()}`);

    const afterTexts = await extractPdfPageTexts(bytes);
    assert(
      /HELLO|2026/i.test(afterTexts[0]),
      `OCR output PDF text layer did not contain "HELLO" or "2026": "${afterTexts[0]}"`,
    );
  });
}
