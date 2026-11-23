// Copies the self-hosted Monaco Editor AMD bundle (MIT) into public/monaco/vs, so the Notepad++ tool
// loads Monaco and its language workers locally without any CDN requests. Runs on `npm install` / `npm ci`.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'monaco-editor', 'min', 'vs');
const dest = join(root, 'public', 'monaco', 'vs');

rmSync(join(root, 'public', 'monaco'), { recursive: true, force: true });
if (!existsSync(src)) {
  console.warn('monaco-editor is not installed; skipping the copy of Monaco assets.');
} else {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log('Copied Monaco Editor assets to public/monaco/vs.');
}
