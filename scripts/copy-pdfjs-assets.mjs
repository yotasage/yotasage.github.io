// Copies the pdf.js worker and the data files it loads at runtime (CMaps, standard fonts, wasm decoders, ICC
// profiles) into public/pdfjs, so the PDF tools work as a static site without a CDN. Runs on `npm install` / `npm ci`.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'pdfjs-dist');
const dest = join(root, 'public', 'pdfjs');

if (!existsSync(src)) {
  console.warn('pdfjs-dist is not installed; skipping the copy of the pdf.js assets.');
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(src, 'build', 'pdf.worker.min.mjs'), join(dest, 'pdf.worker.min.mjs'));
// QuickJS only runs JavaScript embedded in PDFs, which the tools never enable, so it is not published.
const skip = (path) => /quickjs/i.test(basename(path));
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(src, dir), join(dest, dir), { recursive: true, filter: (path) => !skip(path) });
}
console.log('Copied the pdf.js assets to public/pdfjs.');
