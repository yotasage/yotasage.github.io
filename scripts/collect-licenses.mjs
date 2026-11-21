// Collects the licences of everything the site ships to the browser into lib/generated/third-party-licenses.json,
// which /licenses renders. Runs on `npm install` / `npm ci`, so the list follows the installed dependencies.
//
// The packages are found by scanning the site's own imports, then following their runtime `dependencies`
// (not optional, peer or dev dependencies). The pdf.js data files copied to public/pdfjs are listed separately.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['pages', 'components', 'lib'];
// Loaded by Next.js itself on every page.
const ALWAYS = ['next', 'react', 'react-dom'];

const LICENSE_FILE = /^(licen[sc]e|copying|notice)([-._].*)?$/i;

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'generated' ? [] : sourceFiles(path);
    return /\.(m?[jt]sx?)$/.test(name) ? [path] : [];
  });
}

function packageName(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function importedPackages() {
  const names = new Set(ALWAYS);
  // A package name has no blanks or brackets, which keeps text such as label="Seen from" out.
  const pattern = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)['"]([^'"./\s<>{}()[\]][^'"\s<>{}()[\]]*)['"]/gm;
  for (const file of SOURCE_DIRS.flatMap((d) => sourceFiles(join(root, d)))) {
    for (const [, spec] of readFileSync(file, 'utf8').matchAll(pattern)) {
      const name = packageName(spec);
      if (!name.startsWith('node:') && !builtinModules.includes(name)) names.add(name);
    }
  }
  return [...names];
}

// Node's lookup: node_modules of the requiring package, then of each parent directory.
function resolvePackage(name, fromDir) {
  for (let dir = fromDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

function repositoryUrl(pkg) {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  const url = repo?.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://').replace(/^github:/, 'https://github.com/');
  if (url && /^https?:\/\//.test(url)) return url;
  if (url && /^[\w-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return typeof pkg.homepage === 'string' ? pkg.homepage : `https://www.npmjs.com/package/${pkg.name}`;
}

function licenseOf(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return 'UNKNOWN';
}

function licenseTexts(dir) {
  return readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').trim());
}

const packages = new Map();
const queue = importedPackages().map((name) => [name, root]);
while (queue.length) {
  const [name, from] = queue.shift();
  const dir = resolvePackage(name, from);
  if (!dir) {
    console.warn(`collect-licenses: ${name} is not installed; skipped.`);
    continue;
  }
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (packages.has(key)) continue;
  const texts = licenseTexts(dir);
  packages.set(key, {
    name: pkg.name,
    version: pkg.version,
    license: licenseOf(pkg),
    url: repositoryUrl(pkg),
    author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name,
    text: texts.join('\n\n'),
  });
  for (const dep of Object.keys(pkg.dependencies ?? {})) queue.push([dep, dir]);
}

// Data files that pdf.js loads at runtime from public/pdfjs (see copy-pdfjs-assets.mjs).
const PDFJS_ASSETS = [
  ['Adobe CMaps (character maps for CJK fonts)', 'cmaps/LICENSE', 'BSD-3-Clause'],
  ['Foxit standard fonts', 'standard_fonts/LICENSE_FOXIT', 'BSD-3-Clause'],
  ['Liberation Sans fonts', 'standard_fonts/LICENSE_LIBERATION', 'GPL-2.0 with font exception'],
  ['OpenJPEG (JPEG 2000 decoder)', 'wasm/LICENSE_OPENJPEG', 'BSD-2-Clause'],
  ['pdf.js OpenJPEG wrapper', 'wasm/LICENSE_PDFJS_OPENJPEG', 'Apache-2.0'],
  ['PDFium JBIG2 decoder', 'wasm/LICENSE_JBIG2', 'BSD-3-Clause'],
  ['pdf.js JBIG2 wrapper', 'wasm/LICENSE_PDFJS_JBIG2', 'Apache-2.0'],
  ['qcms (colour management)', 'wasm/LICENSE_QCMS', 'MIT'],
  ['pdf.js qcms wrapper', 'wasm/LICENSE_PDFJS_QCMS', 'Apache-2.0'],
  ['ICC colour profile (CGATS001)', 'iccs/LICENSE', 'CC0-1.0'],
];
const pdfjsDir = resolvePackage('pdfjs-dist', root);
const assets = pdfjsDir
  ? PDFJS_ASSETS.filter(([, file]) => existsSync(join(pdfjsDir, file))).map(([name, file, license]) => ({
    name, license, url: 'https://github.com/mozilla/pdf.js', text: readFileSync(join(pdfjsDir, file), 'utf8').trim(),
  }))
  : [];

// Files the 3D viewer loads at runtime from public/3d (see copy-3d-assets.mjs), and libraries that three.js bundles in
// the loaders the viewer imports. These are not packages of their own, so the scan above does not find them.
const occtDir = resolvePackage('occt-import-js', root);
const occtVersion = occtDir ? JSON.parse(readFileSync(join(occtDir, 'package.json'), 'utf8')).version : null;
const read = (dir, file) => (dir && existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8').trim() : null);
// The Apache License 2.0 text, from a package that ships it unchanged.
const APACHE = read(resolvePackage('pdfjs-dist', root), 'LICENSE');
const LGPL_NOTE = 'Served unmodified as separate files from /3d/occt/ and loaded only when a STEP, IGES or BREP file is opened, '
  + 'so it can be replaced with another build. Its complete source code, including the Open CASCADE version it is built '
  + `from (the occt submodule), is at https://github.com/kovacsv/occt-import-js/tree/${occtVersion}.`;
const VIEWER_ASSETS = occtDir ? [
  {
    name: 'occt-import-js', version: occtVersion, license: 'LGPL-2.1', url: `https://github.com/kovacsv/occt-import-js/tree/${occtVersion}`,
    text: `${LGPL_NOTE}\n\nCopyright (c) Viktor Kovacs\n\n${read(join(occtDir, 'dist'), 'license.occt-import-js.txt')}`,
  },
  {
    name: 'Open CASCADE Technology (in occt-import-js)', license: 'LGPL-2.1', url: 'https://github.com/Open-Cascade-SAS/OCCT',
    text: `${LGPL_NOTE}\n\nCopyright (c) Open CASCADE SAS\n\n${read(join(occtDir, 'dist'), 'license.occt.txt')}`,
  },
] : [];
VIEWER_ASSETS.push(
  {
    name: 'Draco decoder (from three.js)', license: 'Apache-2.0', url: 'https://github.com/google/draco',
    text: `Copyright The Draco Authors\n\n${APACHE}`,
  },
  {
    name: 'Basis Universal transcoder (from three.js)', license: 'Apache-2.0', url: 'https://github.com/BinomialLLC/basis_universal',
    text: `Copyright Binomial LLC\n\n${APACHE}`,
  },
  {
    name: 'Chevrotain (bundled in the VRML loader of three.js)', license: 'Apache-2.0', url: 'https://github.com/Chevrotain/chevrotain',
    text: `Copyright the Chevrotain authors\n\n${APACHE}`,
  },
  { name: 'meshoptimizer decoder (bundled in three.js)', license: 'MIT', url: 'https://github.com/zeux/meshoptimizer', author: 'Arseny Kapoulkine' },
  { name: 'ktx-parse (bundled in three.js)', license: 'MIT', url: 'https://github.com/donmccurdy/KTX-Parse', author: 'Don McCurdy' },
  { name: 'zstddec (bundled in three.js)', license: 'MIT', url: 'https://github.com/donmccurdy/zstddec', author: 'Don McCurdy' },
);

const MIT = `Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const list = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
// Packages without a licence file: use the licence of a package from the same repository (such as @next/env and
// next), or the standard MIT text, which is what such packages are released under.
for (const p of list.filter((p) => !p.text)) {
  const sibling = list.find((q) => q.text && q.url === p.url && q.license === p.license);
  const note = `${p.name} does not include a licence file; its package.json declares the ${p.license} licence.`;
  if (sibling) p.text = `${note} The licence of ${sibling.name}, from the same repository:\n\n${sibling.text}`;
  else if (p.license === 'MIT') p.text = `${note}\n\nCopyright (c) ${p.author ?? `the ${p.name} authors`}\n\n${MIT}`;
  else console.warn(`collect-licenses: no licence text for ${p.name}@${p.version} (${p.license})`);
}

const viewer = VIEWER_ASSETS.map(({ author, ...e }) => ({
  ...e,
  text: e.text ?? `Copyright (c) ${author}\n\n${MIT}`,
}));
if (!APACHE) console.warn('collect-licenses: pdfjs-dist is not installed, so the Apache-2.0 text of the 3D viewer files is missing.');

// Code adapted into lib/pcb/font for the PCB viewer's text, and the font data generated there, with their licence
// texts kept next to them.
const fontDir = join(root, 'lib', 'pcb', 'font');
const pcb = [
  {
    name: 'KiCanvas (stroke font code, adapted in lib/pcb/font)', license: 'MIT', url: 'https://github.com/theacodes/kicanvas',
    text: readFileSync(join(fontDir, 'LICENSE.kicanvas.txt'), 'utf8').trim(),
  },
  {
    name: "Newstroke font (glyph data, from the author's source distribution)", license: 'CC0-1.0', url: 'https://vovanium.ru/sledy/newstroke/en',
    text: readFileSync(join(fontDir, 'LICENSE.newstroke.txt'), 'utf8').trim(),
  },
];

// ZXing-C++, compiled into the WebAssembly reader of zxing-wasm that the QR code reader loads from public/qr (see
// copy-qr-assets.mjs). zxing-wasm itself is found by the scan above.
const zxingDir = resolvePackage('zxing-wasm', root);
const zxingCommit = zxingDir ? (await import(pathToFileURL(join(zxingDir, 'dist', 'es', 'reader', 'index.js')).href)).ZXING_CPP_COMMIT : null;
const qr = zxingDir ? [{
  name: 'ZXing-C++ (compiled into zxing-wasm)', license: 'Apache-2.0',
  url: zxingCommit ? `https://github.com/zxing-cpp/zxing-cpp/tree/${zxingCommit}` : 'https://github.com/zxing-cpp/zxing-cpp',
  text: `Copyright the ZXing authors and Axel Waggershauser

${APACHE}`,
}] : [];

// Native C++ libraries compiled to WebAssembly and language models served from public/pdf-wasm and public/ocr
// (see copy-pdf-wasm-assets.mjs). Their JS wrappers (@neslinesli93/qpdf-wasm, tesseract.js, tesseract.js-core)
// are collected automatically above.
const LEPTONICA_BSD = `Copyright (C) 2001 Leptonica. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
   disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following
   disclaimer in the documentation and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL ANY CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

const qpdfDir = resolvePackage('@neslinesli93/qpdf-wasm', root);
const gsDir = resolvePackage('@wasmedia/wghostscript', root);
const tessCoreDir = resolvePackage('tesseract.js-core', root);
const pdfWasm = [];
if (qpdfDir) {
  pdfWasm.push({
    name: 'QPDF (compiled into @neslinesli93/qpdf-wasm)',
    license: 'Apache-2.0',
    url: 'https://github.com/qpdf/qpdf',
    text: `Copyright (c) 2005-2021 Jay Berkenbilt and 2022-2026 QPDF contributors\n\n${APACHE}`,
  });
}
if (gsDir) {
  const gsPkg = JSON.parse(readFileSync(join(gsDir, 'package.json'), 'utf8'));
  const agplText = read(gsDir, 'LICENSE') ?? read(root, 'LICENSE.md') ?? '';
  const gsNote = 'Served unmodified as separate files from /pdf-wasm/gs/ and loaded lazily on demand when Ghostscript '
    + 'compression or PDF/A conversion is used.\n'
    + 'Upstream Ghostscript source (10.08.0): https://github.com/ArtifexSoftware/ghostpdl\n'
    + `WebAssembly build wrapper (@wasmedia/wghostscript ${gsPkg.version}): https://gitlab.com/wasmedia/wghostscript`;
  pdfWasm.push({
    name: 'Ghostscript (compiled into @wasmedia/wghostscript)',
    version: '10.08.0',
    license: 'AGPL-3.0',
    url: 'https://github.com/ArtifexSoftware/ghostpdl',
    text: `${gsNote}\n\nCopyright (C) Artifex Software, Inc.\n\n${agplText}`,
  });
}
if (tessCoreDir) {
  pdfWasm.push({
    name: 'Tesseract OCR & Leptonica (compiled into tesseract.js-core)',
    license: 'Apache-2.0 AND BSD-2-Clause',
    url: 'https://github.com/tesseract-ocr/tesseract',
    text: `Tesseract OCR (https://github.com/tesseract-ocr/tesseract) — Apache-2.0:\n\n${APACHE}\n\n---\n\nLeptonica (https://github.com/DanBloomberg/leptonica) — BSD-2-Clause:\n\n${LEPTONICA_BSD}`,
  });
  pdfWasm.push({
    name: 'Tesseract tessdata_fast language models (eng, nor, swe, dan, deu, fra, spa)',
    license: 'Apache-2.0',
    url: 'https://github.com/tesseract-ocr/tessdata_fast',
    text: `Bundled language models: eng, nor, swe, dan, deu, fra, spa (packaged via @tesseract.js-data/*, MIT).\n\n${APACHE}`,
  });
}

const out = join(root, 'lib', 'generated');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'third-party-licenses.json'), JSON.stringify({ packages: list, assets, pdfWasm, viewer, pcb, qr }, null, 1));
console.log(`Collected the licences of ${list.length} packages, ${assets.length} pdf.js data files, ${pdfWasm.length} PDF WASM/OCR entries, ${viewer.length} 3D viewer files, ${pcb.length} PCB viewer files and ${qr.length} QR code reader file.`);
