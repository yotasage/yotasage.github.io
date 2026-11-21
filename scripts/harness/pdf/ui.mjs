// Browser verification harness for /pdf/* pages.
//   npm run ui            (spawns `next start -p 3024` automatically)
//   tsx ui.mjs <baseUrl>  (runs against an already running server)

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument } from '@cantoo/pdf-lib';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright-core';

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
  makeReaderPdf,
  makeVectorFormPdf,
  pageDimensionsFor,
} from './fixtures.mjs';

import * as toolsMod from '../../../lib/pdf/tools.ts';

const { TOOL_CATEGORIES } = toolsMod.default ?? toolsMod;
const ALL_TOOLS = TOOL_CATEGORIES.flatMap((c) => c.tools);

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const DEFAULT_PORT = 3024;
const externalBase = process.argv[2] ? process.argv[2].replace(/\/$/, '') : null;
const baseUrl = externalBase ?? `http://127.0.0.1:${DEFAULT_PORT}`;

const results = [];
let serverChild = null;
let browser = null;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function runTest(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, pass: false, detail });
    console.log(`FAIL  ${name}\n      ${detail}`);
  }
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return;
    } catch {
      // Server not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting ${timeoutMs}ms for ${url} to return 200.`);
}

function killProcessTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // Ignore cleanup errors.
  }
}

function startNextServer() {
  const nextBin = join(REPO_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(DEFAULT_PORT), '-H', '127.0.0.1'], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stderrTail = '';
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-1500);
  });
  child.on('exit', (code) => {
    if (code && code !== 0 && serverChild === child) {
      console.error(`next start exited prematurely (code ${code}):\n${stderrTail}`);
    }
  });
  return child;
}

async function launchBrowser() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      // Try next installed Chromium channel.
    }
  }
  throw new Error('Could not launch installed Edge (msedge) or Chrome (chrome) via playwright-core.');
}

async function readDownloadBytes(page, triggerClick) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    triggerClick(),
  ]);
  const p = await download.path();
  assert(p, 'Download path was null');
  return { name: download.suggestedFilename(), bytes: new Uint8Array(readFileSync(p)) };
}

function pdfUpload(name, bytes) {
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(bytes) };
}

async function main() {
  if (!externalBase) {
    serverChild = startNextServer();
    await waitForServer(`${baseUrl}/pdf/main`, 30000);
  }

  browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const outsideRequests = [];

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    const errText = req.failure()?.errorText ?? 'failed';
    if (errText === 'net::ERR_ABORTED') return;
    failedRequests.push(`${req.url()} (${errText})`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedRequests.push(`${res.url()} (HTTP ${res.status()})`);
    }
  });
  page.on('request', (req) => {
    const raw = req.url();
    if (/^(data|blob):/.test(raw)) return;
    try {
      const u = new URL(raw);
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
        outsideRequests.push(raw);
      }
    } catch {
      outsideRequests.push(raw);
    }
  });

  // Pre-build synthetic fixtures once.
  const pdf4 = await makeMultiPagePdf(4);
  const pdf3 = await makeMultiPagePdf(3, { dimOffset: 0 });
  const pdf2 = await makeMultiPagePdf(2, { dimOffset: 200 });
  const bookmarkedPdf = await makeBookmarkedPdf();
  const { bytes: imagePdf } = await makeImagePdf();
  const compressiblePdf = await makeCompressiblePdf();
  const encryptedPdf = await makeEncryptedPdf('secret', 'owner');
  const metadataPdf = await makeMetadataPdf();
  const annotatedFormPdf = await makeAnnotatedFormPdf();
  const colorAndImagePdf = await makeColorAndImagePdf();
  const fillableFormPdf = await makeFillableFormPdf();
  const vectorFormPdf = await makeVectorFormPdf();
  const inlineVectorPdf = await makeInlineVectorPdf();
  const readerPdf = await makeReaderPdf();

  // 1. Hub shows all 27 tools and every route returns 200.
  await runTest('1. /pdf/main lists all 27 tools and every route returns HTTP 200', async () => {
    assert(ALL_TOOLS.length === 27, `Expected 27 registered tools, found ${ALL_TOOLS.length}`);
    const hubRes = await page.goto(`${baseUrl}/pdf/main`, { waitUntil: 'networkidle' });
    assert(hubRes && hubRes.status() === 200, `/pdf/main returned ${hubRes?.status()}`);
    for (const tool of ALL_TOOLS) {
      const count = await page.locator(`a[href="${tool.href}"]`).count();
      assert(count >= 1, `/pdf/main missing tile link to ${tool.href}`);
    }
    for (const tool of ALL_TOOLS) {
      const r = await fetch(`${baseUrl}${tool.href}`);
      assert(r.status === 200, `${tool.href} returned HTTP ${r.status}`);
    }
  });

  // 2. Phone layout (390x844) overflow check across /pdf/main and all 27 tool routes.
  await runTest('2. Phone layout (390x844) has no horizontal overflow across /pdf/main and all 27 tools', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const phoneRoutes = ['/pdf/main', ...ALL_TOOLS.map((t) => t.href)];
    for (const route of phoneRoutes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      assert(
        scrollWidth <= innerWidth + 1,
        `${route} overflowed at 390px: scrollWidth=${scrollWidth}, innerWidth=${innerWidth}`,
      );
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  // 3. Rotate + Continue with… handoff to Remove metadata.
  await runTest('3. Rotate PDF + Continue with… handoff to Remove metadata', async () => {
    await page.goto(`${baseUrl}/pdf/rotate`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('sample.pdf', pdf4));
    await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 20000 });

    await page.locator('button[aria-label="Rotate page 1 right"]').click();
    await page.getByRole('button', { name: 'Save rotated PDF' }).click();
    const dlBtn = page.getByRole('button', { name: /^Download sample-rotated\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });

    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 4, `expected 4 pages, got ${outDoc.getPageCount()}`);
    assert(outDoc.getPage(0).getRotation().angle === 90, `expected page 0 rotation 90, got ${outDoc.getPage(0).getRotation().angle}`);
    assert(outDoc.getPage(1).getRotation().angle === 0, `expected page 1 rotation 0, got ${outDoc.getPage(1).getRotation().angle}`);

    // Click "Remove metadata" in Continue with… bar and confirm auto-load in memory.
    await page.getByRole('button', { name: 'Remove metadata', exact: true }).click();
    await page.waitForURL('**/pdf/remove-metadata', { timeout: 15000 });
    await page.getByRole('heading', { name: 'sample-rotated.pdf' }).waitFor({ timeout: 15000 });
  });

  // 4. Remove pages.
  await runTest('4. Remove pages (range "2, 4" -> 2 pages remaining)', async () => {
    await page.goto(`${baseUrl}/pdf/remove-pages`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('four.pdf', pdf4));
    await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 20000 });

    const rangeInput = page.locator('input[aria-label="Page ranges"]');
    await rangeInput.click();
    await rangeInput.fill('2, 4');
    await page.getByRole('button', { name: 'Remove 2 pages' }).click();

    const dlBtn = page.getByRole('button', { name: /^Download four-trimmed\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 pages remaining, got ${outDoc.getPageCount()}`);
    assert(Math.round(outDoc.getPage(0).getWidth()) === pageDimensionsFor(0).width, 'kept page 1 width mismatch');
    assert(Math.round(outDoc.getPage(1).getWidth()) === pageDimensionsFor(2).width, 'kept page 3 width mismatch');
  });

  // 5. Extract pages.
  await runTest('5. Extract pages (Odd -> 2-page PDF)', async () => {
    await page.goto(`${baseUrl}/pdf/extract-pages`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('four.pdf', pdf4));
    await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 20000 });

    await page.getByRole('button', { name: 'Odd', exact: true }).click();
    await page.getByRole('button', { name: 'Extract 2 pages' }).click();

    const dlBtn = page.getByRole('button', { name: /^Download four-extracted\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 extracted pages, got ${outDoc.getPageCount()}`);
    assert(Math.round(outDoc.getPage(0).getWidth()) === pageDimensionsFor(0).width, 'extracted page 1 width mismatch');
    assert(Math.round(outDoc.getPage(1).getWidth()) === pageDimensionsFor(2).width, 'extracted page 3 width mismatch');
  });

  // 6. Organize pages (2 PDFs + blank page -> 6 pages).
  await runTest('6. Organize pages (3p + 2p + Blank page -> 6 pages)', async () => {
    await page.goto(`${baseUrl}/pdf/organize`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles([
      pdfUpload('part-a.pdf', pdf3),
      pdfUpload('part-b.pdf', pdf2),
    ]);
    await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 20000 });
    await page.getByText('5 pages in output').waitFor({ timeout: 10000 });

    await page.getByRole('button', { name: '+ Blank page', exact: true }).click();
    await page.getByText('6 pages in output').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Save organized PDF' }).click();

    const dlBtn = page.getByRole('button', { name: /^Download organized\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 6, `expected 6 organized pages, got ${outDoc.getPageCount()}`);
  });

  // 7. Split PDF by bookmarks -> ZIP with 3 PDFs.
  await runTest('7. Split PDF by bookmarks (3 parts -> ZIP with 3 PDFs)', async () => {
    await page.goto(`${baseUrl}/pdf/split`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('book.pdf', bookmarkedPdf));
    await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 20000 });

    await page.locator('label', { hasText: 'By bookmarks' }).click();
    await page.getByText('Found 3 top-level bookmarks').waitFor({ timeout: 15000 });
    await page.getByText('Output preview: 3 PDFs').waitFor({ timeout: 10000 });

    await page.getByRole('button', { name: 'Split into 3 PDFs' }).click();
    const dlBtn = page.getByRole('button', { name: /^Download book-split\.zip$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());

    const unzipped = unzipSync(bytes);
    const names = Object.keys(unzipped).filter((n) => n.endsWith('.pdf'));
    assert(names.length === 3, `expected 3 PDFs in ZIP, got ${names.length}: ${names.join(', ')}`);
    let totalPages = 0;
    for (const name of names) {
      const partDoc = await PDFDocument.load(unzipped[name], { updateMetadata: false });
      totalPages += partDoc.getPageCount();
    }
    assert(totalPages === 6, `expected 6 total pages across 3 split PDFs, got ${totalPages}`);
  });

  // 8. PDF to images (2-page PDF -> PNG at 72 DPI -> ZIP with 2 PNGs).
  await runTest('8. PDF to images (PNG @ 72 DPI -> ZIP with 2 PNGs)', async () => {
    await page.goto(`${baseUrl}/pdf/pdf-to-images`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('two.pdf', pdf2));
    await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 20000 });

    const selects = page.locator('select');
    await selects.nth(0).selectOption('png');
    await selects.nth(1).selectOption('72');

    await page.getByRole('button', { name: 'Convert 2 pages to PNG' }).click();
    const dlBtn = page.getByRole('button', { name: /^Download two-images\.zip$/ });
    await dlBtn.waitFor({ timeout: 25000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());

    const unzipped = unzipSync(bytes);
    const pngNames = Object.keys(unzipped).filter((n) => n.endsWith('.png'));
    assert(pngNames.length === 2, `expected 2 PNGs in ZIP, got ${pngNames.length}`);
    for (const name of pngNames) {
      const b = unzipped[name];
      assert(
        b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
        `${name} does not start with PNG signature`,
      );
    }
  });

  // 9. Extract images (renders Original JPG + Lossless PNG cards).
  await runTest('9. Extract images (Original JPG and Lossless PNG cards render)', async () => {
    await page.goto(`${baseUrl}/pdf/extract-images`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('imgs.pdf', imagePdf));

    const cards = page.locator('ul li');
    await page.waitForFunction(() => document.querySelectorAll('ul li img[src^="blob:"]').length === 2, null, { timeout: 20000 });
    assert(await cards.filter({ hasText: 'Original JPG' }).count() === 1, 'expected 1 Original JPG card');
    assert(await cards.filter({ hasText: 'Lossless PNG' }).count() === 1, 'expected 1 Lossless PNG card');

    const loaded = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('ul li img[src^="blob:"]')];
      await Promise.all(imgs.map((img) => img.complete ? Promise.resolve() : new Promise((res) => { img.onload = res; img.onerror = res; })));
      return imgs.map((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    });
    assert(loaded.every((d) => d.w > 0 && d.h > 0), `extracted images failed to decode: ${JSON.stringify(loaded)}`);
  });

  // 10. Compress PDF (size breakdown renders, Lossless reports savings).
  await runTest('10. Compress PDF (size breakdown + Lossless savings)', async () => {
    await page.goto(`${baseUrl}/pdf/compress`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('bloated.pdf', compressiblePdf));

    await page.locator('[role="img"][aria-label^="File size breakdown"]').waitFor({ timeout: 20000 });
    await page.locator('label', { hasText: 'Lossless' }).click();
    await page.getByRole('button', { name: 'Compress PDF' }).click();

    const savedHeading = page.locator('h3', { hasText: /^Saved / });
    await savedHeading.waitFor({ timeout: 20000 });
    const text = await savedHeading.innerText();
    assert(/^Saved /.test(text), `expected savings headline, got: ${text}`);
  });

  // 11. Encrypted PDF unlock flow (wrong password -> error, right password -> unlocks 4 pages).
  await runTest('11. Encrypted PDF unlock (wrong password error + unlock 4 pages)', async () => {
    await page.goto(`${baseUrl}/pdf/rotate`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('locked.pdf', encryptedPdf));

    const pwInput = page.locator('input[type="password"]');
    await pwInput.waitFor({ timeout: 15000 });

    await pwInput.fill('wrong');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByText('Incorrect password. Try again.').waitFor({ timeout: 15000 });
    assert(await pwInput.isVisible(), 'password prompt disappeared after wrong password');

    await pwInput.fill('secret');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await pwInput.waitFor({ state: 'hidden', timeout: 15000 });
    await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 20000 });
    await page.getByText('4 pages ·').waitFor({ timeout: 10000 });
  });

  // 12. Extract images & vectors — Embedded vectors tab (Form XObjects SVG + PDF downloads).
  await runTest('12. Extract vectors (Embedded vectors tab: 2 previews + SVG/PDF downloads)', async () => {
    await page.goto(`${baseUrl}/pdf/extract-images`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('vectors.pdf', vectorFormPdf));

    const vectorsTab = page.getByRole('tab', { name: /Embedded vectors/ });
    await vectorsTab.waitFor({ timeout: 15000 });
    await vectorsTab.click();

    await page.waitForFunction(
      () => document.querySelectorAll('ul li img[src^="blob:"]').length === 2,
      null,
      { timeout: 25000 },
    );

    const previews = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('ul li img[src^="blob:"]')];
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((res) => {
                img.onload = res;
                img.onerror = res;
              }),
        ),
      );
      return imgs.map((img) => ({ w: img.naturalWidth, h: img.naturalHeight }));
    });
    assert(previews.length === 2 && previews.every((d) => d.w > 0 && d.h > 0), `SVG previews failed: ${JSON.stringify(previews)}`);

    const firstCard = page.locator('ul li').first();
    const { bytes: svgBytes } = await readDownloadBytes(page, () =>
      firstCard.getByRole('button', { name: 'SVG', exact: true }).click(),
    );
    const svgText = new TextDecoder().decode(svgBytes);
    assert(svgText.includes('<svg') && svgText.includes('<path'), 'downloaded vector SVG missing <svg>/<path>');

    const { bytes: pdfBytes } = await readDownloadBytes(page, () =>
      firstCard.getByRole('button', { name: 'PDF', exact: true }).click(),
    );
    const pdfHead = new TextDecoder().decode(pdfBytes.slice(0, 5));
    assert(pdfHead === '%PDF-', `downloaded vector PDF header was ${JSON.stringify(pdfHead)}`);
    const formDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
    assert(formDoc.getPageCount() === 1, `expected 1-page Form XObject PDF, got ${formDoc.getPageCount()}`);
  });

  // 13. Extract images & vectors — Detect & crop figures (auto-detect, drag-a-box, delete, SVG & PDF downloads).
  await runTest('13. Detect & crop figures (auto-detect 2 -> drag 3rd -> delete -> SVG/PDF downloads)', async () => {
    await page.goto(`${baseUrl}/pdf/extract-images`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('inline.pdf', inlineVectorPdf));

    const cropTab = page.getByRole('tab', { name: /Detect & crop figures/ });
    await cropTab.waitFor({ timeout: 15000 });
    await cropTab.click();

    const overlay = page.locator('[aria-label="Page figure selection canvas"]');
    await overlay.waitFor({ timeout: 20000 });
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });

    await page.getByRole('button', { name: 'Auto-detect page', exact: true }).click();
    await page.getByRole('heading', { name: 'Figures (2)' }).waitFor({ timeout: 20000 });

    // Scroll the canvas overlay into view and drag a new box on the empty top-right region
    // (x ~ 72%..90%, y ~ 18%..32%, cleanly outside the top schematic which ends at x ~ 57%).
    await overlay.evaluate((el) => el.scrollIntoView({ block: 'start', inline: 'nearest' }));
    const box = await overlay.boundingBox();
    assert(box && box.width > 100 && box.height > 100, `invalid canvas overlay bbox: ${JSON.stringify(box)}`);
    const x1 = box.x + box.width * 0.72;
    const y1 = box.y + box.height * 0.18;
    const x2 = box.x + box.width * 0.90;
    const y2 = box.y + box.height * 0.32;
    await page.mouse.move(x1, y1);
    await page.mouse.down();
    await page.mouse.move(x2, y2, { steps: 6 });
    await page.mouse.up();

    await page.getByRole('heading', { name: 'Figures (3)' }).waitFor({ timeout: 10000 });

    // Delete the newly drawn (selected) 3rd box -> back to 2
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('heading', { name: 'Figures (2)' }).waitFor({ timeout: 10000 });

    // Select the first detected box and test individual SVG & PDF downloads
    await page.getByRole('button', { name: /^Fig p1-1\b/ }).click();
    const { bytes: cropSvgBytes } = await readDownloadBytes(page, () =>
      page.getByRole('button', { name: 'Download SVG', exact: true }).click(),
    );
    const cropSvg = new TextDecoder().decode(cropSvgBytes);
    assert(cropSvg.includes('<svg') && cropSvg.includes('<path'), 'cropped figure SVG missing <svg>/<path>');

    const { bytes: cropPdfBytes } = await readDownloadBytes(page, () =>
      page.getByRole('button', { name: 'Download PDF', exact: true }).click(),
    );
    assert(new TextDecoder().decode(cropPdfBytes.slice(0, 5)) === '%PDF-', 'cropped figure PDF missing %PDF- header');
    const croppedDoc = await PDFDocument.load(cropPdfBytes, { updateMetadata: false });
    assert(croppedDoc.getPageCount() === 1, `expected 1-page cropped PDF, got ${croppedDoc.getPageCount()}`);
  });

  // 14. Read PDF (render canvas + text layer, outline jump, search + <mark>, dark paper, layout, Continue with… handoff).
  await runTest('14. Read PDF (canvas + text layer, Contents jump, Search highlight, dark mode, handoff)', async () => {
    await page.goto(`${baseUrl}/pdf/reader`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('manual.pdf', readerPdf));

    // Verify page 1 canvas renders with non-zero dimensions and text layer renders selectable text
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas[aria-label="Page 1"]');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 25000 });
    await page.locator('[data-page="1"]').getByText('ALPHA_HEADING').waitFor({ timeout: 15000 });

    // Open Contents sidebar tab and click bookmark pointing to page 3
    await page.getByRole('tab', { name: 'Contents', exact: true }).click();
    await page.getByRole('button', { name: /Gamma Quantum/ }).click();

    const pageInput = page.locator('input[aria-label="Current page"]');
    await page.waitForFunction(
      () => document.querySelector('input[aria-label="Current page"]')?.value === '3',
      null,
      { timeout: 10000 },
    );
    assert((await pageInput.inputValue()) === '3', `expected current page 3 after outline jump, got ${await pageInput.inputValue()}`);

    // Open search with Ctrl+F, search QUANTUM_MARKER, verify match count and <mark> on page 3
    await page.keyboard.press('Control+f');
    const searchInput = page.locator('input[aria-label="Search query"]');
    await searchInput.waitFor({ timeout: 10000 });
    await searchInput.fill('QUANTUM_MARKER');

    await page.getByText('1 / 1').waitFor({ timeout: 15000 });
    const mark = page.locator('[data-page="3"] mark', { hasText: 'QUANTUM_MARKER' });
    await mark.first().waitFor({ timeout: 15000 });
    await page.keyboard.press('Escape');

    // Toggle dark-mode reading paper and view modes without errors
    const darkBtn = page.locator('button[aria-label="Toggle dark paper mode"]');
    await darkBtn.click();
    assert((await darkBtn.getAttribute('aria-pressed')) === 'true', 'dark paper toggle did not activate');

    const layoutSelect = page.locator('select[aria-label="Page layout"]');
    await layoutSelect.selectOption('single');
    await layoutSelect.selectOption('two-page');
    await layoutSelect.selectOption('continuous');

    // Two-way Continue with… handoff: Info tab -> Rotate PDF -> opens /pdf/rotate with document loaded in memory
    await page.getByRole('tab', { name: 'Info', exact: true }).click();
    await page.getByRole('button', { name: 'Rotate PDF', exact: true }).click();
    await page.waitForURL('**/pdf/rotate', { timeout: 15000 });
    await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 20000 });
    await page.getByText('4 pages ·').waitFor({ timeout: 10000 });
  });

  // 15. Read PDF encrypted unlock flow (wrong password -> error, right password -> unlocks & renders).
  await runTest('15. Read PDF encrypted unlock (wrong password error + unlock 4 pages)', async () => {
    await page.goto(`${baseUrl}/pdf/reader`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('locked-reader.pdf', encryptedPdf));

    const pwInput = page.locator('input[type="password"]');
    await pwInput.waitFor({ timeout: 15000 });

    await pwInput.fill('wrong');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await page.getByText('Incorrect password. Try again.').waitFor({ timeout: 15000 });
    assert(await pwInput.isVisible(), 'password prompt disappeared after wrong password on /pdf/reader');

    await pwInput.fill('secret');
    await page.getByRole('button', { name: 'Unlock' }).click();
    await pwInput.waitFor({ state: 'hidden', timeout: 15000 });
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas[aria-label="Page 1"]');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 25000 });
    await page.getByText('/ 4').waitFor({ timeout: 10000 });
  });

  // 16. Protect PDF (encrypt with password and verify encrypted download).
  await runTest('16. Protect PDF (AES-256 password encryption + verified download)', async () => {
    await page.goto(`${baseUrl}/pdf/protect`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('plain.pdf', pdf2));
    await page.getByText('Unencrypted').waitFor({ timeout: 15000 });

    await page.locator('input[placeholder="Enter open password"]').fill('pass123');
    await page.getByRole('button', { name: 'Protect PDF', exact: true }).click();

    const dlBtn = page.getByRole('button', { name: /^Download plain-protected\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'protected PDF missing %PDF- header');

    let rejectedWithoutPassword = false;
    try {
      await PDFDocument.load(bytes, { updateMetadata: false });
    } catch {
      rejectedWithoutPassword = true;
    }
    assert(rejectedWithoutPassword, 'expected protected PDF to reject loading without password');

    const unlockedDoc = await PDFDocument.load(bytes, { password: 'pass123', updateMetadata: false });
    assert(unlockedDoc.getPageCount() === 2, `expected 2 pages in protected PDF, got ${unlockedDoc.getPageCount()}`);
  });

  // 17. Unlock PDF (decrypt encrypted fixture and verify unencrypted download).
  await runTest('17. Unlock PDF (decrypt fixture + unencrypted 4-page download)', async () => {
    await page.goto(`${baseUrl}/pdf/unlock`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('locked.pdf', encryptedPdf));
    await page.getByText(/Password required/).waitFor({ timeout: 15000 });

    await page.locator('input[placeholder="Enter PDF password"]').fill('secret');
    await page.getByRole('button', { name: 'Unlock PDF', exact: true }).click();

    const dlBtn = page.getByRole('button', { name: /^Download locked-unlocked\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'unlocked PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(!outDoc.isEncrypted, 'expected unlocked PDF to be unencrypted');
    assert(outDoc.getPageCount() === 4, `expected 4 pages in unlocked PDF, got ${outDoc.getPageCount()}`);
  });

  // 18. Edit metadata (load existing metadata, edit Title, save & verify).
  await runTest('18. Edit metadata (inspect existing fields, edit Title, save & verify)', async () => {
    await page.goto(`${baseUrl}/pdf/edit-metadata`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('meta.pdf', metadataPdf));

    const titleInput = page.locator('input[placeholder="Document title"]');
    await titleInput.waitFor({ timeout: 15000 });
    assert(
      (await titleInput.inputValue()) === 'Confidential Brief',
      `expected existing title "Confidential Brief", got "${await titleInput.inputValue()}"`,
    );

    await titleInput.fill('Updated Quarterly Report');
    await page.getByRole('button', { name: 'Save metadata', exact: true }).click();

    const dlBtn = page.getByRole('button', { name: /^Download meta-metadata\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'metadata PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(
      outDoc.getTitle() === 'Updated Quarterly Report',
      `expected saved Title "Updated Quarterly Report", got "${outDoc.getTitle()}"`,
    );
  });

  // 19. Remove annotations (inspect breakdown, strip all, verify download).
  await runTest('19. Remove annotations (breakdown renders + strip all annotations)', async () => {
    await page.goto(`${baseUrl}/pdf/remove-annotations`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('annots.pdf', annotatedFormPdf));

    await page.getByRole('heading', { name: 'Annotation breakdown' }).waitFor({ timeout: 15000 });
    await page.getByText('Highlights', { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /^Remove \d+ annotations?$/ }).click();

    const dlBtn = page.getByRole('button', { name: /^Download annots-no-annotations\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'no-annotations PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 pages, got ${outDoc.getPageCount()}`);
  });

  // 20. Flatten PDF (form/annotation summary renders + flatten forms/annotations).
  await runTest('20. Flatten PDF (form/annotation summary + flattened PDF download)', async () => {
    await page.goto(`${baseUrl}/pdf/flatten`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('form-annots.pdf', annotatedFormPdf));

    await page.getByText('Form fields detected').waitFor({ timeout: 15000 });
    const flattenBtn = page.getByRole('button', { name: 'Flatten PDF', exact: true });
    await flattenBtn.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Flatten PDF');
      return Boolean(btn && !btn.disabled);
    }, null, { timeout: 15000 });
    await flattenBtn.click();

    const dlBtn = page.getByRole('button', { name: /^Download form-annots-flattened\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'flattened PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 pages, got ${outDoc.getPageCount()}`);
    assert(outDoc.getForm().getFields().length === 0, `expected 0 remaining form fields, got ${outDoc.getForm().getFields().length}`);
  });

  // 21. Add page numbers (preview canvas renders + apply & download).
  await runTest('21. Add page numbers (live preview canvas + numbered 3-page download)', async () => {
    await page.goto(`${baseUrl}/pdf/page-numbers`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('report.pdf', pdf3));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });

    await page.getByRole('button', { name: 'Page 1 of 12', exact: true }).click();
    await page.getByText('Label: “Page 1 of 3”').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Add numbers to 3 pages', exact: true }).click();

    const dlBtn = page.getByRole('button', { name: /^Download report-numbered\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'numbered PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 3, `expected 3 numbered pages, got ${outDoc.getPageCount()}`);
  });

  // 22. Add watermark (preview renders + text watermark download).
  await runTest('22. Add watermark (live preview overlay + text watermark download)', async () => {
    await page.goto(`${baseUrl}/pdf/watermark`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(pdfUpload('draft.pdf', pdf3));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });
    await page.locator('svg text', { hasText: 'CONFIDENTIAL' }).first().waitFor({ timeout: 10000 });

    await page.getByRole('button', { name: 'Watermark 3 pages', exact: true }).click();

    const dlBtn = page.getByRole('button', { name: /^Download draft-watermarked\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'watermarked PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 3, `expected 3 watermarked pages, got ${outDoc.getPageCount()}`);
  });

  // 23. Crop PDF (CropCanvas renders, Trim 10% preset, crop & verify reduced box).
  await runTest('23. Crop PDF (CropCanvas + Trim 10% preset + cropped download)', async () => {
    await page.goto(`${baseUrl}/pdf/crop`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('margins.pdf', pdf2));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });
    await page.locator('[role="region"][aria-label^="Crop selection"]').waitFor({ timeout: 10000 });

    await page.getByRole('button', { name: 'Trim 10%', exact: true }).click();
    await page.getByRole('button', { name: 'Crop 2 pages', exact: true }).click();

    const dlBtn = page.getByRole('button', { name: /^Download margins-cropped\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'cropped PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 cropped pages, got ${outDoc.getPageCount()}`);
    const cropBox = outDoc.getPage(0).getCropBox();
    const origW = pageDimensionsFor(0, 200).width;
    assert(
      Math.abs(cropBox.width - origW * 0.8) < 2,
      `expected cropped width ~${origW * 0.8}, got ${cropBox.width}`,
    );
  });

  // 24. Resize pages (dimensions/preview render + resize to Letter).
  await runTest('24. Resize pages (SVG preview + resize to US Letter download)', async () => {
    await page.goto(`${baseUrl}/pdf/resize`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('small.pdf', pdf2));

    await page.getByRole('heading', { name: 'Layout preview (Page 1 sample)' }).waitFor({ timeout: 15000 });
    await page.getByText(/^Source: /).waitFor({ timeout: 15000 });

    await page.locator('select').first().selectOption('letter');
    await page.getByRole('button', { name: 'Resize PDF', exact: true }).click();

    const dlBtn = page.getByRole('button', { name: /^Download small-resized\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'resized PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 resized pages, got ${outDoc.getPageCount()}`);
    assert(Math.abs(outDoc.getPage(0).getWidth() - 612) < 2, `expected Letter width 612, got ${outDoc.getPage(0).getWidth()}`);
    assert(Math.abs(outDoc.getPage(0).getHeight() - 792) < 2, `expected Letter height 792, got ${outDoc.getPage(0).getHeight()}`);
  });

  // 25. Pages per sheet & Booklet (N-up download + switch to Booklet preview & download).
  await runTest('25. Pages per sheet & Booklet (2x2 N-up + duplex booklet imposition)', async () => {
    await page.goto(`${baseUrl}/pdf/nup`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('handout.pdf', pdf4));

    await page.locator('svg[aria-label^="N-up sheet 1"]').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Create 2×2 PDF (1 sheet)', exact: true }).click();

    const nupDl = page.getByRole('button', { name: /^Download handout-nup\.pdf$/ });
    await nupDl.waitFor({ timeout: 20000 });
    const { bytes: nupBytes } = await readDownloadBytes(page, () => nupDl.click());
    assert(new TextDecoder().decode(nupBytes.slice(0, 5)) === '%PDF-', 'N-up PDF missing %PDF- header');
    const nupDoc = await PDFDocument.load(nupBytes, { updateMetadata: false });
    assert(nupDoc.getPageCount() === 1, `expected 1 N-up sheet, got ${nupDoc.getPageCount()}`);

    await page.getByRole('button', { name: 'Booklet (duplex)', exact: true }).click();
    await page.locator('svg[aria-label^="Booklet side:"]').first().waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Create booklet (1 duplex sheet)', exact: true }).click();

    const bookletDl = page.getByRole('button', { name: /^Download handout-booklet\.pdf$/ });
    await bookletDl.waitFor({ timeout: 20000 });
    const { bytes: bookletBytes } = await readDownloadBytes(page, () => bookletDl.click());
    assert(new TextDecoder().decode(bookletBytes.slice(0, 5)) === '%PDF-', 'booklet PDF missing %PDF- header');
    const bookletDoc = await PDFDocument.load(bookletBytes, { updateMetadata: false });
    assert(bookletDoc.getPageCount() === 2, `expected 2 booklet sides, got ${bookletDoc.getPageCount()}`);
  });

  // 26. Grayscale PDF (live preview renders + lossless grayscale stats & download).
  await runTest('26. Grayscale PDF (live preview + lossless grayscale stats & download)', async () => {
    await page.goto(`${baseUrl}/pdf/grayscale`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('color.pdf', colorAndImagePdf));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });

    await page.getByRole('button', { name: 'Convert PDF to grayscale', exact: true }).click();
    await page.getByRole('heading', { name: 'Your grayscale PDF is ready' }).waitFor({ timeout: 25000 });
    await page.getByText(/^\d+ colour operators?$/).waitFor({ timeout: 10000 });

    const dlBtn = page.getByRole('button', { name: /^Download color-grayscale\.pdf$/ });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'grayscale PDF missing %PDF- header');
    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 1, `expected 1 grayscale page, got ${outDoc.getPageCount()}`);
  });

  // 27. Invert colours / Dark mode (live preview + Smart dark mode download).
  await runTest('27. Invert colours / Dark mode (live preview + Smart dark mode download)', async () => {
    await page.goto(`${baseUrl}/pdf/invert`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('bright.pdf', colorAndImagePdf));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });

    await page.getByRole('radio', { name: /Smart dark mode/ }).click();
    await page.locator('select').first().selectOption('100');
    await page.getByRole('button', { name: 'Apply smart dark mode to PDF', exact: true }).click();

    const dlBtn = page.getByRole('button', { name: /^Download bright-dark\.pdf$/ });
    await dlBtn.waitFor({ timeout: 25000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'dark-mode PDF missing %PDF- header');
    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 1, `expected 1 dark-mode page, got ${outDoc.getPageCount()}`);
  });

  // 28. Fill PDF forms (overlay + sidebar fields render, edit text & toggle checkbox, save & verify).
  await runTest('28. Fill PDF forms (overlays + sidebar fields, edit text & checkbox, verify)', async () => {
    await page.goto(`${baseUrl}/pdf/fill-forms`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"]').setInputFiles(pdfUpload('application.pdf', fillableFormPdf));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });
    await page.getByText('6 fillable fields').waitFor({ timeout: 15000 });

    const nameInputs = page.locator('input[aria-label="Full Legal Name"]');
    assert((await nameInputs.count()) === 2, `expected both sidebar and overlay inputs for Full Legal Name, got ${await nameInputs.count()}`);
    await nameInputs.first().fill('Grace Hopper');

    const subCheckbox = page.locator('button[role="checkbox"][aria-label="Subscribe to updates"]');
    await subCheckbox.waitFor({ timeout: 10000 });
    await subCheckbox.click();
    assert((await subCheckbox.getAttribute('aria-checked')) === 'true', 'Subscribe checkbox did not toggle on');

    await page.getByRole('button', { name: 'Save filled PDF', exact: true }).click();
    const dlBtn = page.getByRole('button', { name: /^Download application-filled\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'filled form PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    const outForm = outDoc.getForm();
    assert(
      outForm.getTextField('fullName').getText() === 'Grace Hopper',
      `expected filled fullName "Grace Hopper", got "${outForm.getTextField('fullName').getText()}"`,
    );
    assert(outForm.getCheckBox('subscribe').isChecked(), 'expected subscribe checkbox to be checked in output PDF');
  });

  // 29. Sign PDF (SignaturePad Type tab -> place signature + Today's date -> save & download).
  await runTest('29. Sign PDF (Type signature, place on canvas + Today\'s date, save & download)', async () => {
    await page.goto(`${baseUrl}/pdf/sign`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(pdfUpload('contract.pdf', pdf2));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas[class*="previewCanvas"]');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });

    await page.getByRole('tab', { name: 'Type', exact: true }).click();
    await page.locator('input[aria-label="Typed signature text"]').fill('Ada Lovelace');
    await page.getByRole('button', { name: 'Save signature', exact: true }).click();

    await page.getByText(/Click anywhere on the page to place/).waitFor({ timeout: 10000 });
    const canvasEl = page.locator('canvas[class*="previewCanvas"]').first();
    await canvasEl.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    const box = await canvasEl.boundingBox();
    assert(box && box.width > 100 && box.height > 100, `invalid sign canvas bbox: ${JSON.stringify(box)}`);
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.65);

    await page.locator('[aria-label="Placed signature"]').waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: "+ Today's date", exact: true }).click();

    await page.getByRole('button', { name: 'Sign & save PDF (2 items)', exact: true }).click();
    const dlBtn = page.getByRole('button', { name: /^Download contract-signed\.pdf$/ });
    await dlBtn.waitFor({ timeout: 20000 });
    const { bytes } = await readDownloadBytes(page, () => dlBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'signed PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 signed pages, got ${outDoc.getPageCount()}`);
  });

  // 30. Edit PDF (select Text + Rect tool, add items on page canvas, save & verify download).
  await runTest('30. Edit PDF (place Text + draw Rect on canvas, save & verify download)', async () => {
    await page.goto(`${baseUrl}/pdf/edit`, { waitUntil: 'networkidle' });
    await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(pdfUpload('notes.pdf', pdf2));

    await page.waitForFunction(() => {
      const c = document.querySelector('canvas');
      return Boolean(c && c.width > 0 && c.height > 0);
    }, null, { timeout: 20000 });

    // Place a text box and type into the inline textarea
    await page.getByRole('button', { name: 'Text', exact: true }).click();
    const overlay = page.locator('[class*="editHtmlOverlay"]').first();
    await overlay.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    let box = await overlay.boundingBox();
    assert(box && box.width > 100 && box.height > 100, `invalid edit overlay bbox: ${JSON.stringify(box)}`);
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.3);
    const inlineTa = page.locator('textarea[placeholder="Type text…"]').first();
    await inlineTa.waitFor({ timeout: 10000 });
    await inlineTa.fill('Reviewed and approved');
    await inlineTa.press('Escape');

    // Draw a rectangle on the page
    await page.getByRole('button', { name: 'Rect', exact: true }).click();
    await overlay.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
    box = await overlay.boundingBox();
    assert(box && box.width > 100 && box.height > 100, `invalid edit overlay bbox after Rect: ${JSON.stringify(box)}`);
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.55);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.72, { steps: 5 });
    await page.mouse.up();

    const saveBtn = page.getByRole('button', { name: 'Save & download (2 edits)', exact: true });
    await saveBtn.waitFor({ timeout: 10000 });
    const { bytes } = await readDownloadBytes(page, () => saveBtn.click());
    assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'edited PDF missing %PDF- header');

    const outDoc = await PDFDocument.load(bytes, { updateMetadata: false });
    assert(outDoc.getPageCount() === 2, `expected 2 edited pages, got ${outDoc.getPageCount()}`);
  });

  // 31. Zero runtime errors, failed requests, and third-party network requests.
  await runTest('31. Zero pageerror, console.error, failed requests, and third-party requests', async () => {
    assert(pageErrors.length === 0, `pageerror(s): ${pageErrors.slice(0, 3).join(' | ')}`);
    assert(consoleErrors.length === 0, `console.error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
    assert(failedRequests.length === 0, `failed request(s): ${failedRequests.slice(0, 3).join(' | ')}`);
    assert(outsideRequests.length === 0, `third-party request(s): ${outsideRequests.slice(0, 3).join(' | ')}`);
  });
}

try {
  await main();
} finally {
  if (browser) {
    await browser.close().catch(() => undefined);
  }
  if (serverChild) {
    killProcessTree(serverChild);
    serverChild = null;
  }
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log('─'.repeat(64));
console.log(`${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
