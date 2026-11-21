// Node verification harness for Phase 4 lib/pdf/* modules (QPDF WASM, self-hosted OCR runtime, etc.).
//   npm run check   (tsx check.mjs && tsx check-p4.mjs)

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PDFDocument } from '@cantoo/pdf-lib';

import { makeMultiPagePdf } from './fixtures.mjs';
import * as ocrRuntimeMod from '../../../lib/pdf/ocrRuntime.ts';
import * as qpdfMod from '../../../lib/pdf/qpdf.ts';

const { checkQpdf, runQpdf } = qpdfMod.default ?? qpdfMod;
const { OCR_ASSET_PATHS, OCR_LANGUAGES } = ocrRuntimeMod.default ?? ocrRuntimeMod;

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
