// The harness's WebGPU runner (M0.4a; kept for M6.3). Not part of the site.
// Bundles a browser entry with the esbuild that tsx brings, serves it with a harness-only page from a small Node
// HTTP server on 127.0.0.1:3023 (a secure context, so navigator.gpu exists), opens it in Microsoft Edge through
// Playwright with WebGPU enabled (headless first, headed if headless has no adapter) and hands the page to a callback.
// Server and browser are always closed in a finally.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PORT = 3023;
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];

/** Bundles `entry` (a .mts/.ts file) into memory. */
async function bundle(entry) {
  const out = await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'error' });
  return out.outputFiles[0].text;
}

function serve(js) {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(await readFile(path.join(HERE, 'index.html')));
      } else if (req.url === '/bundle.js') {
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        res.end(js);
      } else { res.writeHead(404); res.end(); }
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function hasAdapter(page) {
  return page.evaluate(async () => !!(navigator.gpu && await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })));
}

/**
 * Runs `fn(page, mode)` with the bundled `entry` loaded; `mode` is 'headless' or 'headed'.
 * Every wait has a time limit; `timeoutMs` bounds the whole callback.
 */
export async function withWebGpuPage(entry, fn, { timeoutMs = 10 * 60_000, log = () => {} } = {}) {
  const js = await bundle(entry);
  const server = await serve(js);
  let browser = null;
  try {
    let mode = null, page = null;
    for (const headless of [true, false]) {
      browser = await chromium.launch({ channel: 'msedge', headless, args: ARGS, timeout: 60_000 });
      page = await browser.newPage();
      page.on('console', m => { if (m.type() === 'error') log(`[page] ${m.text()}`); });
      page.on('pageerror', e => log(`[page error] ${e.message}`));
      await page.goto(`http://127.0.0.1:${PORT}/`, { timeout: 30_000 });
      await page.waitForFunction(() => globalThis.__ready === true, null, { timeout: 30_000 });
      if (await hasAdapter(page)) { mode = headless ? 'headless' : 'headed'; break; }
      log(`no WebGPU adapter ${headless ? 'headless' : 'headed'}`);
      await browser.close(); browser = null;
    }
    if (!mode) throw new Error('Edge has no WebGPU adapter, headless or headed');
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`WebGPU run over ${timeoutMs} ms`)), timeoutMs); });
    try { return await Promise.race([fn(page, mode), limit]); } finally { clearTimeout(timer); }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise(r => server.close(r));
  }
}
