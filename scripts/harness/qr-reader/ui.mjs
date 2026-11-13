// Drives /qr-reader/main in the installed Edge (or Chrome) and checks what a visitor does: opening images and a
// PDF, the example, typed and pasted text, the raw and symbol views, structured append, the camera (a fake camera
// that plays a generated video of a code), phones at 320 and 390 px, and that no request leaves the site.
//   tsx ui.mjs [base URL]        (npm run ui; the dev server must run, by default on port 3020)

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from 'playwright-core';
import { zlibSync } from 'fflate';

import * as encMod from '../../../lib/qr/encoder.ts';
import * as otpMod from '../../../lib/qrread/otp.ts';
import * as pdfLibMod from '@cantoo/pdf-lib';

const m = (x) => x.default ?? x;
const { encode, structuredAppendParity } = m(encMod);
const { codeNow, base32Decode } = m(otpMod);
const { PDFDocument } = m(pdfLibMod);

const base = process.argv[2] ?? 'http://localhost:3020';
const work = mkdtempSync(join(tmpdir(), 'qr-reader-ui-'));
const opts = (o) => ({ symbology: 'qr2', version: 'auto', ecLevel: 'M', mask: 'auto', mode: 'auto', charset: 'utf-8', eci: 'auto', ...o });

/** A grey image (one byte per pixel) of symbols side by side. */
function grey(syms, scale = 6, gap = 40, width = 0, height = 0) {
  const w = Math.max(width, syms.reduce((s, x) => s + (x.width + 8) * scale + gap, gap));
  const h = Math.max(height, Math.max(...syms.map((x) => (x.height + 8) * scale)) + 2 * gap);
  const px = new Uint8Array(w * h).fill(255);
  let ox = Math.max(gap, Math.floor((w - syms.reduce((s, x) => s + (x.width + 8) * scale + gap, -gap)) / 2));
  for (const s of syms) {
    const oy = Math.floor((h - (s.height + 8) * scale) / 2) + 4 * scale;
    for (let y = 0; y < s.height * scale; y++) for (let x = 0; x < s.width * scale; x++) {
      if (s.modules[Math.floor(y / scale) * s.width + Math.floor(x / scale)]) px[(oy + y) * w + ox + 4 * scale + x] = 0;
    }
    ox += (s.width + 8) * scale + gap;
  }
  return { w, h, px };
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(bytes) { let c = -1; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function png({ w, h, px }) {
  const raw = new Uint8Array((w + 1) * h);
  for (let y = 0; y < h; y++) raw.set(px.subarray(y * w, (y + 1) * w), y * (w + 1) + 1);
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set([...type].map((c) => c.charCodeAt(0)), 4);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, w);
  new DataView(ihdr.buffer).setUint32(4, h);
  ihdr.set([8, 0, 0, 0, 0], 8);
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())];
  return Buffer.concat(parts);
}

/** A Y4M video for Chromium's fake camera: the image as luma, neutral chroma, a few frames. */
function y4m(img, frames = 8) {
  const header = Buffer.from(`YUV4MPEG2 W${img.w} H${img.h} F15:1 Ip A1:1 C420jpeg\n`);
  const chroma = Buffer.alloc((img.w / 2) * (img.h / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.from(img.px), chroma]);
  return Buffer.concat([header, ...Array(frames).fill(frame)]);
}

const CAMERA_TEXT = 'LPA:1$smdp.example.com$TEST-CAMERA-0001';
const videoFile = join(work, 'camera.y4m');
writeFileSync(videoFile, y4m(grey([encode(CAMERA_TEXT, opts({}))], 8, 40, 640, 480)));

let browser;
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${videoFile}`];
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel, args }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); process.exit(1); }

let passed = 0;
const failures = [];
const ok = (condition, what) => { if (condition) passed++; else failures.push(what); };

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ['camera', 'clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
const errors = [];
const outside = [];
page.on('pageerror', (e) => errors.push(e.message));
const workers = [];
page.on('worker', (w) => workers.push(w.url()));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('request', (r) => {
  const u = new URL(r.url());
  if (!['localhost', '127.0.0.1'].includes(u.hostname) && !/^(data|blob):/.test(r.url())) outside.push(r.url());
});

const source = (name) => page.locator('section[aria-label]').filter({ has: page.locator('h3', { hasText: name }) }).first();
const waitRead = async (loc) => {
  await loc.waitFor({ timeout: 30000 });
  await page.waitForFunction((el) => el.getAttribute('data-status') !== 'reading', await loc.elementHandle(), { timeout: 30000 });
};
const field = (card, label) => card.locator('dt', { hasText: label }).first().locator('xpath=following-sibling::dd[1]').innerText();

await page.goto(`${base}/qr-reader/main`, { waitUntil: 'networkidle' });
ok(await page.locator('h1', { hasText: 'QR code reader' }).isVisible(), 'the page has its title');
ok(await page.locator('aside[aria-label="Status of this tool"]').isVisible(), 'the status note is shown');

// An image with a Wi-Fi code.
const wifiText = 'WIFI:T:WPA;S:Harness net;P:pa\\;ss;;';
await page.locator('input[type=file]').setInputFiles({ name: 'wifi.png', mimeType: 'image/png', buffer: png(grey([encode(wifiText, opts({}))])) });
const wifi = source('wifi.png');
await waitRead(wifi);
ok((await wifi.innerText()).includes('1 code read'), `wifi.png: one code read (${(await wifi.innerText()).slice(0, 80)})`);
const wifiCard = wifi.locator('article[data-kind="wifi"]');
ok(await wifiCard.count() === 1, 'wifi.png: a Wi-Fi preview');
if (await wifiCard.count()) {
  ok((await field(wifiCard, 'Network name')).includes('Harness net'), 'Wi-Fi: network name');
  ok(!(await wifiCard.innerText()).includes('pa;ss'), 'Wi-Fi: password hidden at first');
  await wifiCard.getByRole('button', { name: 'Show' }).first().click();
  ok((await wifiCard.innerText()).includes('pa;ss'), 'Wi-Fi: password shown after "Show"');
  ok(await wifi.locator('svg polygon').count() === 1, 'wifi.png: the code is outlined');
  await wifiCard.getByRole('tab', { name: 'Raw' }).click();
  const raw = await wifiCard.innerText();
  ok(raw.includes('57 49 46 49 3a') && raw.includes('|WIFI:'), 'raw view: hex dump of the bytes');
  ok(raw.includes(wifiText), 'raw view: the text as stored');
  await wifiCard.getByRole('tab', { name: 'Symbol' }).click();
  ok(await wifiCard.locator('canvas').count() === 1, 'symbol view: the modules drawn');
  ok((await wifiCard.innerText()).includes('Mask pattern'), 'symbol view: the mask');
}

// Structured append over three codes in one picture, and a Latin-1 code read in another character set.
const whole = 'One message, split over three symbols by structured append.';
const parity = structuredAppendParity(new TextEncoder().encode(whole));
const parts = [whole.slice(0, 20), whole.slice(20, 40), whole.slice(40)].map((t, index) => encode(t, opts({ structuredAppend: { index, total: 3, parity } })));
await page.locator('input[type=file]').setInputFiles({ name: 'parts.png', mimeType: 'image/png', buffer: png(grey(parts, 5)) });
await waitRead(source('parts.png'));
const joined = page.locator('section[aria-label="Joined message"]');
await joined.waitFor({ timeout: 10000 }).catch(() => undefined);
ok((await joined.innerText().catch(() => '')).includes(whole), 'structured append: the message joined from three codes');

// A PDF with a contact on page 2.
const pdf = await PDFDocument.create();
pdf.addPage([300, 300]);
const p2 = pdf.addPage([400, 400]);
const vcard = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Tester;Pdf;;;\r\nFN:Pdf Tester\r\nTEL:+4799999999\r\nEND:VCARD';
const img = await pdf.embedPng(png(grey([encode(vcard, opts({}))], 4)));
p2.drawImage(img, { x: 50, y: 50, width: 300, height: 300 * (img.height / img.width) });
await page.locator('input[type=file]').setInputFiles({ name: 'card.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
const pdfPage = source('card.pdf, page 2 of 2');
await pdfPage.waitFor({ timeout: 30000 }).catch(() => undefined);
await waitRead(pdfPage).catch(() => undefined);
ok(await pdfPage.locator('article[data-kind="contact"]').count() === 1, 'PDF: the contact on page 2 is read');
ok((await source('card.pdf, page 1 of 2').innerText().catch(() => '')).includes('No code found'), 'PDF: page 1 has no code');

// The example.
await page.getByRole('button', { name: 'Try an example' }).click();
const example = source('Example codes');
await waitRead(example);
const kinds = await example.locator('article[data-kind]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')).sort().join(','));
ok(kinds === 'contact,url,wifi', `the example has a Wi-Fi network, a contact and a link: ${kinds}`);

// Typed text: a sign-in code, checked against the code computed here.
await page.locator('textarea[aria-label="Content of a code"]').fill('otpauth://totp/Example:ada?secret=JBSWY3DPEHPK3PXP&issuer=Example');
await page.getByRole('button', { name: 'Read text' }).click();
const otp = page.locator('article[data-kind="otp"]').first();
await otp.waitFor({ timeout: 5000 });
await page.waitForTimeout(300);
const shown = (await otp.locator('[aria-label="Current code"]').innerText()).replace(/\s/g, '');
const acct = { type: 'totp', secret: base32Decode('JBSWY3DPEHPK3PXP'), algorithm: 'SHA1', digits: 6, period: 30, counter: 0 };
const wants = [(await codeNow(acct)).code, (await codeNow(acct, Date.now() - 30000)).code];
ok(wants.includes(shown), `sign-in code shown (${shown}) equals RFC 6238 (${wants.join(' or ')})`);

// Pasted text anywhere on the page.
await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData('text/plain', 'MT:Y.K9042C00KA0648G00');
  document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
});
const matter = page.locator('article[data-kind="matter"]').first();
await matter.waitFor({ timeout: 5000 }).catch(() => undefined);
ok((await matter.innerText().catch(() => '')).includes('3497-011-2332'), 'pasted Matter code shows the manual code 3497-011-2332');

// The camera: a fake camera plays a video of an eSIM code.
await page.getByRole('button', { name: 'Start camera' }).click();
const cam = page.locator('section[aria-label^="Camera, "]').first();
await cam.waitFor({ timeout: 20000 }).catch(() => undefined);
const camText = await cam.innerText().catch(() => '');
ok(camText.includes('eSIM activation code') && camText.includes('smdp.example.com'), 'camera: the eSIM code is read and previewed');
ok(!camText.includes('TEST-CAMERA-0001'), 'camera: the activation code is hidden');
ok(await page.getByText('Code read: see below.').isVisible().catch(() => false), 'camera: pauses after the first code');
await page.getByRole('button', { name: 'Scan another' }).click();
await page.waitForTimeout(1500);
ok(await page.locator('section[aria-label^="Camera, "]').count() === 1, 'camera: the same code is not added twice');
await page.getByRole('button', { name: 'Stop camera' }).click();

// Phones.
for (const width of [320, 390]) {
  await page.setViewportSize({ width, height: 800 });
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${width} px: no horizontal scroll (${over} px too wide)`);
  const wide = await page.evaluate(() => [...document.querySelectorAll('article, section, aside')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).map((e) => e.getAttribute('aria-label') || e.className).slice(0, 3));
  ok(wide.length === 0, `${width} px: every card fits (${wide.join(', ')})`);
}
await page.setViewportSize({ width: 1280, height: 900 });

// Removing and clearing.
const before = await page.locator('section[data-status]').count();
await source('wifi.png').getByRole('button', { name: 'Remove wifi.png' }).click();
ok(await page.locator('section[data-status]').count() === before - 1, 'Remove takes one result away');
await page.getByRole('button', { name: 'Clear all' }).click();
ok(await page.locator('section[data-status]').count() === 0, 'Clear all empties the results');

// The home page has the card.
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
ok(await page.locator('a[href="/qr-reader/main"]').count() === 1, 'the home page links to the reader');

ok(workers.some((u) => !/pdf.worker/.test(u)), `the codes are read in a worker of their own: ${workers.join(', ')}`);
ok(errors.length === 0, `no errors on the page: ${errors.slice(0, 3).join(' | ')}`);
ok(outside.length === 0, `no requests to other sites: ${outside.slice(0, 3).join(', ')}`);

await browser.close();
rmSync(work, { recursive: true, force: true });
console.log(failures.join('\n'));
console.log(`${passed} passed, ${failures.length} failed.`);
process.exit(failures.length ? 1 : 0);
