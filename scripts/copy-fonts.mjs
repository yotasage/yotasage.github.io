// Copies self-hosted variable fonts (Inter + JetBrains Mono, latin & latin-ext) into public/fonts,
// so the site renders modern typography locally with zero CDN requests. Runs on `npm install` / `npm ci`.
//
// Both fonts are licensed under the SIL Open Font License 1.1 (listed on /licenses).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'fonts');

const FONT_FILES = [
  ['@fontsource-variable/inter', 'files/inter-latin-wght-normal.woff2'],
  ['@fontsource-variable/inter', 'files/inter-latin-ext-wght-normal.woff2'],
  ['@fontsource-variable/inter', 'files/inter-latin-wght-italic.woff2'],
  ['@fontsource-variable/jetbrains-mono', 'files/jetbrains-mono-latin-wght-normal.woff2'],
  ['@fontsource-variable/jetbrains-mono', 'files/jetbrains-mono-latin-ext-wght-normal.woff2'],
];

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

let copied = 0;
for (const [pkg, rel] of FONT_FILES) {
  const src = join(root, 'node_modules', ...pkg.split('/'), ...rel.split('/'));
  const filename = rel.split('/').pop();
  if (!existsSync(src)) {
    console.warn(`copy-fonts: ${pkg}/${rel} is not installed; skipped.`);
    continue;
  }
  cpSync(src, join(dest, filename));
  copied++;
}

console.log(`Copied ${copied} self-hosted font files to public/fonts.`);
