// Collects the licences of everything the site ships to the browser into lib/generated/third-party-licenses.json,
// which /licenses renders. Runs on `npm install` / `npm ci`, so the list follows the installed dependencies.
//
// The packages are found by scanning the site's own imports, then following their runtime `dependencies`
// (not optional, peer or dev dependencies). The pdf.js data files copied to public/pdfjs are listed separately.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  const pattern = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|^\s*import\s+)['"]([^'"./][^'"]*)['"]/gm;
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

const out = join(root, 'lib', 'generated');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'third-party-licenses.json'), JSON.stringify({ packages: list, assets, viewer }, null, 1));
console.log(`Collected the licences of ${list.length} packages, ${assets.length} pdf.js data files and ${viewer.length} 3D viewer files.`);
