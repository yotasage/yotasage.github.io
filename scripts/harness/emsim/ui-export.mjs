// The Export section in the installed Edge (step M8.1b): every figure kind is offered when its source exists and not
// otherwise (field maps after "Show the fields", the sweep's plots after a sweep, the via's plots after its solve); the
// preview's width in CSS mm equals the chosen width (column, text, page, \linewidth, a typed width) within 0.5 mm;
// Save of SVG, PNG, TeX and ZIP gives downloads equal to the figure model in Node for the same inputs (the SVG and the
// TikZ byte for byte, the ZIP's .tex and its PNG files, the PNG's size = mm × scale × 96/25.4 within 1 px); Copy
// writes the clipboard (TikZ picture, SVG, PNG or the reason); a field-map figure; the black-and-white mask's hatch and
// the labels' white boxes; keyboard and touch; no horizontal scroll at 320/390/1440 in both themes; screenshots
// `emsim-export-{390,1440}-{light,dark}`. Downloads go to a temporary folder.
//   tsx ui-export.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { unzipSync, strFromU8 } from 'fflate';
import { chromium } from 'playwright-core';

import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedBoard from '../../../lib/emsim/figure/board.ts';
import * as importedPlot from '../../../lib/emsim/figure/plot.ts';
import * as importedSvg from '../../../lib/emsim/figure/svg.ts';
import * as importedTikz from '../../../lib/emsim/figure/tikz.ts';
import * as importedFormat from '../../../components/EmSim/format.ts';

const d = (m) => m.default ?? m;
const SU = d(importedSetup), LN = d(importedLines), B = d(importedBoard), PL = d(importedPlot), SV = d(importedSvg), TZ = d(importedTikz), FM = d(importedFormat);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const PX = 96 / 25.4;
let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const dl = mkdtempSync(join(tmpdir(), 'emsim-export-'));

// ---- the same figure in Node ----
const setup = SU.defaultSetup();
const sec = LN.setupSection(setup);
const len = (mm) => FM.lenText(mm, 'mm', 3), num = (v) => FM.numText(v, 3);
const revive = (x) => {
  if (Array.isArray(x)) return x.map(revive);
  if (x && typeof x === 'object') {
    if (x.ta && Array.isArray(x.a)) return new globalThis[x.ta](x.a);
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, revive(v)]));
  }
  return x;
};
function nodeFigure(args) {
  const a = revive(args), o = { width: a.width, colour: a.colour };
  const bo = { ...o, len, num, ...(a.map ? { map: a.map } : {}) };
  if (a.spec) return PL.plotFigure(a.spec, o);
  const w = setup.trace.w.v;
  switch (a.id.replace(/-map$/, '')) {
    case 'stackup': return B.stackupFigure(setup.stackup, bo);
    case 'section': return B.sectionFigure(setup.stackup, setup.trace, sec, bo);
    case 'via-side': return B.viaSideFigure(setup.stackup, setup.via, w, bo);
    case 'via-top': return B.viaTopFigure(setup.stackup, setup.via, w, bo);
    default: throw new Error(`unknown figure ${a.id}`);
  }
}
const pngSize = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });

const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
  const open = async (url, c = ctx) => {
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.locator('#export').scrollIntoViewIfNeeded();
    await p.waitForSelector('[data-export-ready] [data-export-preview]', { timeout: 30000 });
    return p;
  };
  const options = (p) => p.$$eval('[data-export-figure] option', (os) => os.map((o) => o.value));
  const args = (p) => p.evaluate(() => document.querySelector('[data-export-ready]').emsimExport.args());
  const pick = async (p, id) => { await p.selectOption('[data-export-figure]', id); await p.waitForSelector(`[data-export-ready][data-figure="${id}"]`); };
  const save = async (p, how = 'click') => {
    const [d0] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), how === 'tap' ? p.tap('[data-export-save]') : p.click('[data-export-save]')]);
    const path = join(dl, `${Date.now()}-${d0.suggestedFilename()}`);
    await d0.saveAs(path);
    return { name: d0.suggestedFilename(), buf: readFileSync(path) };
  };
  const sameAsNode = async (p, what) => {
    const a = await args(p), fig = nodeFigure(a), svg = SV.figureSvg(fig, { id: 'emx' });
    const head = svg.slice(0, svg.indexOf('>')), attr = (h, k) => (h.match(new RegExp(` ${k}="([^"]*)"`)) ?? [])[1];
    const shown = await p.$eval('[data-export-preview] svg', (el) => ({ w: el.getAttribute('width'), h: el.getAttribute('height'), n: el.querySelectorAll('[data-i]').length }));
    check(shown.w === attr(head, 'width') && shown.h === attr(head, 'height') && shown.n === (svg.match(/ data-i="/g) ?? []).length, `${what}: the preview is the model's SVG (${shown.w} × ${shown.h}, ${shown.n} shapes)`);
    return { a, fig, svg };
  };

  // ---- 1: the figures offered with nothing computed beyond the default solve ----
  const p = await open(`${URL0}#export`);
  let ids = await options(p);
  check(['stackup', 'section', 'via-side', 'via-top'].every((k) => ids.includes(k)), `the drawings are offered (${ids.join(', ')})`);
  check(!ids.some((k) => k.endsWith('-map') || k.startsWith('sweep-')), 'no field map and no sweep before they exist');
  check(await p.locator('[data-export-maps-note]').count() === 1, 'the note says how to get a field map');
  await p.locator('#via').scrollIntoViewIfNeeded();
  await p.waitForSelector('[data-via-plots][data-stale="false"]', { timeout: 60000 });
  await p.locator('#export').scrollIntoViewIfNeeded();
  await p.waitForFunction(() => document.querySelectorAll('[data-export-figure] option[value^="via-"]').length >= 5, null, { timeout: 30000 });
  ids = await options(p);
  check(['via-tdr', 'via-tdt', 'via-s'].every((k) => ids.includes(k)), `the via's plots after its solve (${ids.join(', ')})`);
  check(await p.$eval('[data-export-ready]', (el) => el.getAttribute('data-figure')) === 'section', 'the cross-section is shown first');

  // ---- 2: true size ----
  for (const [size, mm] of [['column', 88], ['text', 160], ['page', 180], ['linewidth', 160]]) {
    await p.selectOption('[data-export-size]', size);
    await p.waitForTimeout(80);
    const wpx = await p.$eval('[data-export-preview] svg', (s) => s.getBoundingClientRect().width);
    check(Math.abs(wpx / PX - mm) <= 0.5, `${size}: the preview is ${(wpx / PX).toFixed(2)} mm wide, wanted ${mm}`);
  }
  await p.selectOption('[data-export-size]', 'custom');
  await p.fill('[data-export-width]', '12 cm');
  await p.waitForTimeout(80);
  check(Math.abs((await p.$eval('[data-export-preview] svg', (s) => s.getBoundingClientRect().width)) / PX - 120) <= 0.5, 'a typed 12 cm gives a 120 mm preview');
  await p.fill('[data-export-width]', '5 mm');
  check(await p.locator('[data-export-reason]').count() === 1 && await p.locator('[data-export-save]').isDisabled(), 'a width under 40 mm gives its reason and no Save');
  await p.selectOption('[data-export-size]', 'column');

  // ---- 3: Save in every format equals the model ----
  for (const colour of ['colour', 'grey', 'bw']) {
    await p.click(`[data-export-colour="${colour}"]`);
    const { fig, svg } = await sameAsNode(p, `section ${colour}`);
    await p.click('[data-export-format="svg"]');
    const s = await save(p);
    check(s.name === 'section.svg' && s.buf.toString('utf8') === svg, `section ${colour}: the saved SVG equals the model's (${s.name})`);
    await p.click('[data-export-format="tikz"]');
    const t = await save(p);
    check(t.name === 'section.tex' && t.buf.toString('utf8') === TZ.figureTikz(fig).document, `section ${colour}: the saved .tex equals the model's document`);
    if (colour === 'bw') {
      const masks = fig.prims.map((q, i) => (q.role === 'mask' ? i : -1)).filter((i) => i >= 0);
      check(masks.length > 0 && masks.every((i) => svg.includes(`data-h="${i}"`)), 'black and white: the mask is hatched, unlike the air');
      const labels = fig.prims.filter((q, i) => q.t === 'text' && /^(w|h) /.test(q.text) && fig.prims[i - 1]?.role === 'paper');
      check(labels.length >= 2, `black and white: the dimension labels sit on white boxes (${labels.length})`);
    }
  }
  await p.click('[data-export-colour="colour"]');
  await p.click('[data-export-format="png"]');
  for (const k of [1, 3]) {
    await p.selectOption('[data-export-scale]', String(k));
    const { fig } = await sameAsNode(p, `png ${k}×`);
    const s = await save(p);
    const { w, h } = pngSize(s.buf);
    const ww = fig.width * k * PX, hh = fig.height * k * PX;
    check(s.name === 'section.png' && s.buf.subarray(1, 4).toString() === 'PNG' && Math.abs(w - ww) <= 1 && Math.abs(h - hh) <= 1, `PNG at ${k}×: ${w} × ${h} px, wanted ${ww.toFixed(1)} × ${hh.toFixed(1)}`);
  }
  await p.fill('[data-export-name]', 'my figure');
  const named = await save(p);
  check(named.name === 'my-figure.png', `the file name is used (${named.name})`);
  await p.fill('[data-export-name]', '');

  // ---- 4: Copy ----
  await p.click('[data-export-format="svg"]');
  await p.click('[data-export-copy]');
  await p.waitForFunction(() => document.querySelector('[data-export-msg]').textContent.length > 0);
  const { svg: secSvg, fig: secFig } = await sameAsNode(p, 'copy');
  const clip = () => p.evaluate(() => navigator.clipboard.readText()).then((t) => t.replace(/\r\n/g, '\n')); // Windows' clipboard has CR LF
  const clipSvg = await clip();
  check(clipSvg === secSvg, `Copy puts the SVG on the clipboard (${clipSvg.length} of ${secSvg.length} characters; ${await p.textContent('[data-export-msg]')})`);
  await p.click('[data-export-format="tikz"]');
  await p.click('[data-export-copy]');
  await p.waitForFunction(() => /TikZ/.test(document.querySelector('[data-export-msg]').textContent));
  check(await clip() === TZ.figureTikz(secFig).picture, 'Copy puts the TikZ picture on the clipboard');
  await p.click('[data-export-format="png"]');
  await p.click('[data-export-copy]');
  await p.waitForFunction(() => /PNG|pictures|allow/.test(document.querySelector('[data-export-msg]').textContent), null, { timeout: 15000 });
  const pngCopied = await p.evaluate(async () => { try { const items = await navigator.clipboard.read(); return items.some((i) => i.types.includes('image/png')); } catch { return false; } });
  const msg = await p.textContent('[data-export-msg]');
  check(pngCopied || /does not copy|did not allow/.test(msg), `Copy of the PNG: on the clipboard or the reason (${msg})`);

  // ---- 5: a plot, then the sweep's plot ----
  await pick(p, 'via-tdr');
  await p.click('[data-export-format="svg"]');
  const tdr = await sameAsNode(p, 'via TDR');
  check((await save(p)).buf.toString('utf8') === tdr.svg && tdr.a.spec.series[0].xs.length > 10, 'the via TDR plot saved as the model draws it');
  await pick(p, 'via-s');
  await sameAsNode(p, 'via S-parameters');
  await p.locator('[data-tool-tab="sweep"]').scrollIntoViewIfNeeded();
  await p.click('[data-tool-tab="sweep"]');
  await p.click('[data-sweep-run]');
  await p.waitForSelector('[data-sweep-result][data-state="done"]', { timeout: 60000 });
  await p.locator('#export').scrollIntoViewIfNeeded();
  await p.waitForFunction(() => !!document.querySelector('[data-export-figure] option[value^="sweep-"]'), null, { timeout: 10000 });
  const sw = (await options(p)).find((k) => k.startsWith('sweep-'));
  await pick(p, sw);
  const swf = await sameAsNode(p, 'sweep');
  await p.click('[data-export-format="tikz"]');
  const swt = await save(p);
  check(swt.buf.toString('utf8') === TZ.figureTikz(swf.fig).document, `the sweep's plot ${sw} saved as .tex`);

  // ---- 6: the field map ----
  await p.locator('[data-field-on]').scrollIntoViewIfNeeded();
  await p.check('[data-field-on]');
  await p.waitForFunction(() => document.querySelector('[data-trace-view]')?.getAttribute('data-field-state') === 'done', null, { timeout: 60000 });
  await p.locator('#export').scrollIntoViewIfNeeded();
  await p.waitForFunction(() => !!document.querySelector('[data-export-figure] option[value="section-map"]'), null, { timeout: 15000 });
  check(await p.locator('[data-export-maps-note]').count() === 0, 'the note goes once a map exists');
  await pick(p, 'section-map');
  const mf = await sameAsNode(p, 'section map');
  const tz = TZ.figureTikz(mf.fig);
  check(tz.files.length >= 1 && (await p.textContent('[data-export-save]')).includes('.zip'), `the map's TikZ needs its PNG files (${tz.files.map((f) => f.name).join(', ')})`);
  const z = await save(p);
  const zip = unzipSync(new Uint8Array(z.buf));
  const names = Object.keys(zip);
  check(z.name === 'section-map.zip' && names.includes('section-map.tex') && tz.files.every((f) => names.includes(f.name)), `the ZIP holds the .tex and its PNG files (${names.join(', ')})`);
  check(strFromU8(zip['section-map.tex']) === tz.document && tz.files.every((f) => Buffer.compare(Buffer.from(zip[f.name]), Buffer.from(f.bytes)) === 0), 'the ZIP\'s files equal the model\'s');
  await p.click('[data-export-format="svg"]');
  check((await save(p)).buf.toString('utf8') === mf.svg && mf.svg.includes('data:image/png;base64,'), 'the map figure as SVG, the map inside it');
  check(errors.length === 0, `no page errors so far (${errors.slice(0, 2).join(' | ')})`);

  // ---- 7: keyboard ----
  await pick(p, 'section');
  await p.focus('[data-export-figure]');
  await p.keyboard.press('ArrowUp');
  await p.waitForTimeout(80);
  check(await p.$eval('[data-export-ready]', (el) => el.getAttribute('data-figure')) === 'stackup', 'the figure chosen by keys');
  await p.focus('[data-export-colour="grey"]');
  await p.keyboard.press('Enter');
  check(await p.getAttribute('[data-export-colour="grey"]', 'aria-pressed') === 'true', 'a colour chosen by keys');
  await p.focus('[data-export-format="svg"]');
  await p.keyboard.press('Space');
  await p.focus('[data-export-save]');
  const [kd] = await Promise.all([p.waitForEvent('download'), p.keyboard.press('Enter')]);
  check(kd.suggestedFilename() === 'stackup.svg', `Save by keys (${kd.suggestedFilename()})`);
  await p.close();

  // ---- 8: touch ----
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'light', acceptDownloads: true });
  const ph = await open(`${URL0}#export`, phone);
  await ph.locator('[data-export-colour="bw"]').scrollIntoViewIfNeeded();
  await ph.tap('[data-export-colour="bw"]');
  await ph.tap('[data-export-format="png"]');
  check(await ph.getAttribute('[data-export-colour="bw"]', 'aria-pressed') === 'true' && await ph.getAttribute('[data-export-format="png"]', 'aria-pressed') === 'true', 'colour and format by taps');
  await ph.locator('[data-export-save]').scrollIntoViewIfNeeded();
  const tp = await save(ph, 'tap');
  check(tp.name === 'section.png' && pngSize(tp.buf).w > 0, `Save by a tap (${tp.name})`);
  const box = await ph.$eval('[data-export-preview]', (el) => ({ cw: el.clientWidth, sw: el.scrollWidth }));
  check(box.sw > box.cw, 'at phone width the 88 mm preview scrolls inside its box');
  await phone.close();

  // ---- 9: no horizontal scroll, screenshots ----
  const shrink = async (buf, c) => {
    const s = await c.newPage();
    const b64 = await s.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      return cv.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await s.close();
    return Buffer.from(b64, 'base64');
  };
  if (shots) mkdirSync(shots, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
    const page = await open(`${URL0}#export`, c2);
    await page.selectOption('[data-export-size]', 'page');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw2 <= width, `no horizontal scroll at ${width} px with a 180 mm preview, ${scheme} (${sw2})`);
      if (shots && width !== 320) {
        await page.locator('#export').scrollIntoViewIfNeeded();
        const b = await page.$eval('#export', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height }; });
        writeFileSync(join(shots, `emsim-export-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true, clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 1600) } }), c2));
      }
    }
    await page.close();
    await c2.close();
  }
  check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
} finally {
  await browser.close();
  rmSync(dl, { recursive: true, force: true });
}
console.log(`ui-export: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
if (fails.length) process.exit(1);
