// Copies only the required self-hosted 4:3 SVG flags from lipis/flag-icons into public/flags,
// so the language selector renders crisp flags locally with zero CDN requests. Runs on `npm install` / `npm ci`.
//
// flag-icons is licensed under the MIT License (listed on /licenses).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'flags');

// ISO 3166-1 alpha-2 codes used by the site's EN / NB language selector.
const FLAG_CODES = ['gb', 'no'];

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

let copied = 0;
for (const code of FLAG_CODES) {
  const src = join(root, 'node_modules', 'flag-icons', 'flags', '4x3', `${code}.svg`);
  if (!existsSync(src)) {
    console.warn(`copy-flags: flag-icons/flags/4x3/${code}.svg is not installed; skipped.`);
    continue;
  }
  cpSync(src, join(dest, `${code}.svg`));
  copied++;
}

console.log(`Copied ${copied} self-hosted SVG flags to public/flags.`);
