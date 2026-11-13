// Copies the barcode reader that the QR code reader loads at runtime into public/qr, so it works as a static site
// without a CDN (zxing-wasm would otherwise fetch it from jsDelivr). Runs on `npm install` / `npm ci`.
//
// - zxing_reader.wasm: ZXing-C++ (Apache-2.0) compiled to WebAssembly by zxing-wasm (MIT), the reading half only.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm');
const dest = join(root, 'public', 'qr');

rmSync(dest, { recursive: true, force: true });
if (!existsSync(src)) {
  console.warn('zxing-wasm is not installed; skipping the copy of the QR code reader.');
} else {
  mkdirSync(dest, { recursive: true });
  cpSync(src, join(dest, 'zxing_reader.wasm'));
  console.log('Copied the QR code reader to public/qr.');
}
