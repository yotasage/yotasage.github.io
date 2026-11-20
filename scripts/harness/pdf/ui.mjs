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
  makeBookmarkedPdf,
  makeCompressiblePdf,
  makeEncryptedPdf,
  makeImagePdf,
  makeMultiPagePdf,
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
  const outsideRequests = [];

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
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

  // 1. Hub shows all 11 tools and every route returns 200.
  await runTest('1. /pdf/main lists all 11 tools and every route returns HTTP 200', async () => {
    assert(ALL_TOOLS.length === 11, `Expected 11 registered tools, found ${ALL_TOOLS.length}`);
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

  // 2. Phone layout (390x844) overflow check.
  await runTest('2. Phone layout (390x844) has no horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const phoneRoutes = ['/pdf/main', '/pdf/rotate', '/pdf/organize', '/pdf/split', '/pdf/compress', '/pdf/extract-images'];
    for (const route of phoneRoutes) {
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      assert(
        scrollWidth <= innerWidth + 2,
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

  // 12. Zero runtime errors and zero third-party network requests.
  await runTest('12. Zero pageerror, console.error, and third-party requests', async () => {
    assert(pageErrors.length === 0, `pageerror(s): ${pageErrors.slice(0, 3).join(' | ')}`);
    assert(consoleErrors.length === 0, `console.error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
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
