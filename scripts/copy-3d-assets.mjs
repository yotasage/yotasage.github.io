// Copies the files the 3D viewer loads at runtime into public/3d, so it works as a static site without a CDN. Runs on
// `npm install` / `npm ci`.
//
// - occt/: occt-import-js, Open CASCADE compiled to WebAssembly, which reads STEP, IGES and BREP files. It is
//   LGPL-2.1, so it is served unmodified as its own files, with its licence texts next to it.
// - draco/: the Draco decoder for glTF files with compressed meshes.
// - basis/: the Basis Universal transcoder for glTF files with KTX2 textures.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const dest = join(root, 'public', '3d');

const COPIES = [
  ['occt-import-js/dist', 'occt', ['occt-import-js.js', 'occt-import-js.wasm', 'license.occt-import-js.txt', 'license.occt.txt']],
  ['three/examples/jsm/libs/draco', 'draco', ['draco_wasm_wrapper.js', 'draco_decoder.wasm']],
  ['three/examples/jsm/libs/basis', 'basis', ['basis_transcoder.js', 'basis_transcoder.wasm']],
];

rmSync(dest, { recursive: true, force: true });
for (const [from, to, files] of COPIES) {
  const src = join(modules, from);
  if (!existsSync(src)) {
    console.warn(`${from} is not installed; skipping the copy of its 3D viewer files.`);
    continue;
  }
  mkdirSync(join(dest, to), { recursive: true });
  for (const file of files) cpSync(join(src, file), join(dest, to, file));
}
console.log('Copied the 3D viewer assets to public/3d.');
