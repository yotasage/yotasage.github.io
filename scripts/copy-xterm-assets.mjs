// Copies @xterm/xterm's stylesheet (MIT) to public/python/xterm.css so /python/main loads it lazily
// without adding xterm CSS to any other route. Runs on `npm install` / `npm ci`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@xterm', 'xterm', 'css', 'xterm.css');
const destDir = join(root, 'public', 'python');
const dest = join(destDir, 'xterm.css');

if (!existsSync(src)) {
  console.warn('@xterm/xterm is not installed; skipping the copy of xterm.css.');
} else {
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  console.log('Copied @xterm/xterm CSS to public/python/xterm.css.');
}
