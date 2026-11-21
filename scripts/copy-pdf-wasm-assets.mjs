// Copies the self-hosted WebAssembly and OCR assets used by the PDF tools into public/pdf-wasm and public/ocr,
// so the site works as a static export with zero CDN requests. Runs on `npm install` / `npm ci`.
//
// - public/pdf-wasm/: QPDF compiled to WebAssembly (@neslinesli93/qpdf-wasm, ISC wrapper / Apache-2.0 QPDF).
// - public/pdf-wasm/gs/: Ghostscript compiled to WebAssembly (@wasmedia/wghostscript, AGPL-3.0-or-later).
// - public/ocr/worker.min.js: Tesseract.js browser worker (Apache-2.0).
// - public/ocr/core/: Tesseract.js WASM core builds (standard, SIMD, relaxed-SIMD; LSTM and combined, Apache-2.0).
// - public/ocr/tessdata/: Bundled tessdata_fast (4.0.0_best_int) language models (Apache-2.0 / MIT packaging).
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');

const QPDF_DEST = join(root, 'public', 'pdf-wasm');
const GS_DEST = join(QPDF_DEST, 'gs');
const OCR_DEST = join(root, 'public', 'ocr');

const OCR_CORE_FILES = [
  'tesseract-core.wasm.js',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
];

const OCR_LANGS = ['eng', 'nor', 'swe', 'dan', 'deu', 'fra', 'spa'];

let copiedFiles = 0;
let copiedBytes = 0;

function copyFileTracked(from, to) {
  cpSync(from, to);
  copiedFiles += 1;
  copiedBytes += statSync(to).size;
}

// 1. QPDF WASM + Emscripten JS glue
rmSync(QPDF_DEST, { recursive: true, force: true });
const qpdfSrc = join(modules, '@neslinesli93', 'qpdf-wasm', 'dist');
if (!existsSync(qpdfSrc)) {
  console.warn('@neslinesli93/qpdf-wasm is not installed; skipping the copy of QPDF assets.');
} else {
  mkdirSync(QPDF_DEST, { recursive: true });
  for (const file of ['qpdf.wasm', 'qpdf.js']) {
    const srcFile = join(qpdfSrc, file);
    if (existsSync(srcFile)) copyFileTracked(srcFile, join(QPDF_DEST, file));
  }
}

// 1b. Ghostscript WASM + Emscripten ES module JS glue (served unmodified as separate files)
const gsSrc = join(modules, '@wasmedia', 'wghostscript', 'dist');
if (!existsSync(gsSrc)) {
  console.warn('@wasmedia/wghostscript is not installed; skipping the copy of Ghostscript assets.');
} else {
  mkdirSync(GS_DEST, { recursive: true });
  for (const file of ['wghostscript.wasm', 'wghostscript.js']) {
    const srcFile = join(gsSrc, file);
    if (existsSync(srcFile)) copyFileTracked(srcFile, join(GS_DEST, file));
  }
}

// 2. Tesseract.js worker, WASM cores, and bundled tessdata_fast models
rmSync(OCR_DEST, { recursive: true, force: true });
const tessWorkerSrc = join(modules, 'tesseract.js', 'dist', 'worker.min.js');
const tessCoreSrc = join(modules, 'tesseract.js-core');

if (!existsSync(tessWorkerSrc) || !existsSync(tessCoreSrc)) {
  console.warn('tesseract.js / tesseract.js-core is not installed; skipping the copy of OCR assets.');
} else {
  mkdirSync(join(OCR_DEST, 'core'), { recursive: true });
  mkdirSync(join(OCR_DEST, 'tessdata'), { recursive: true });

  copyFileTracked(tessWorkerSrc, join(OCR_DEST, 'worker.min.js'));

  for (const file of OCR_CORE_FILES) {
    const srcFile = join(tessCoreSrc, file);
    if (!existsSync(srcFile)) {
      console.warn(`tesseract.js-core: expected ${file} not found; skipped.`);
      continue;
    }
    copyFileTracked(srcFile, join(OCR_DEST, 'core', file));
  }

  for (const lang of OCR_LANGS) {
    const pkgDir = join(modules, '@tesseract.js-data', lang);
    // 4.0.0_best_int is the compact integer-quantized LSTM model (tessdata_fast equivalent)
    // that tesseract.js selects by default for OEM.LSTM_ONLY.
    const fastFile = join(pkgDir, '4.0.0_best_int', `${lang}.traineddata.gz`);
    const fallbackFile = join(pkgDir, '4.0.0', `${lang}.traineddata.gz`);
    const srcFile = existsSync(fastFile) ? fastFile : fallbackFile;
    if (!existsSync(srcFile)) {
      console.warn(`@tesseract.js-data/${lang} is not installed; skipping ${lang}.traineddata.gz.`);
      continue;
    }
    copyFileTracked(srcFile, join(OCR_DEST, 'tessdata', `${lang}.traineddata.gz`));
  }
}

const mb = (copiedBytes / (1024 * 1024)).toFixed(2);
console.log(`Copied ${copiedFiles} PDF WASM and OCR files (${mb} MB) to public/pdf-wasm and public/ocr.`);
