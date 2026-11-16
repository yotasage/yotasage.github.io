// The Stackup section's list of every JLCPCB stackup in the installed Edge (step M1.8c): the list's chunk is not in the
// first load and is fetched only when the picker opens; the counts and order equal jlcFilter / jlcSort in Node; a
// filtered pick (8 layers, 1.6 mm, 1 / ½ oz) gives the summary, drawing, sources and link of jlcStackup in Node; undo;
// the link by key opens the same stackup in a fresh context; a link of layers is unedited or edited against the list;
// an unknown key gives an issue and the default; keyboard (open, filter, choose, Escape) and touch; no horizontal scroll
// at 320, 390 and 1440 px in both themes with the picker open, and screenshots of it at 390 and 1440 (downscaled to at
// most 1000 px wide).
//   tsx ui-jlcpcb.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedPresets from '../../../lib/emsim/presets.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedJlc from '../../../lib/emsim/jlcpcb.ts';

const P = importedPresets.default ?? importedPresets;
const S = importedStackup.default ?? importedStackup;
const L = importedLink.default ?? importedLink;
const G = importedJlc.default ?? importedJlc;

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const data = JSON.parse(readFileSync(new URL('../../../lib/emsim/jlcpcbStackups.json', import.meta.url), 'utf8'));
const resolve = (key) => { const e = G.jlcFind(data, key); return e ? G.jlcStackup(e, data) : null; };
const hand = new Set(Object.values(P.PRESET_KEYS));
// A template id that only the list has (not a hand preset): its text must not be in the first load.
const ONLY_LIST = data.stackups.find((e) => e.layers === 16).id;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const near = (a, b, tol = 1e-9) => Math.abs(Number(a) - b) <= tol;

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const js = []; // [url, body, opened]
  let opened = false;
  page.on('response', async (r) => {
    if (!/\.js(\?|$)/.test(r.url())) return;
    const when = opened;
    try { js.push([r.url(), await r.text(), when]); } catch { /* redirected or gone */ }
  });
  const summary = (p = page) => p.locator('[data-stackup-summary]');
  const attr = (name, p = page) => summary(p).getAttribute(name);
  const ready = (p) => p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  const loaded = (p) => p.waitForSelector('[data-jlc-picker][data-loaded="true"]', { timeout: 30000 });
  const keys = (p = page) => p.locator('[data-jlc-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-jlc-key')));
  const count = async (p = page) => Number(await p.locator('[data-jlc-count]').getAttribute('data-jlc-count'));
  const active = (p = page) => p.evaluate(() => { const a = document.activeElement; return a ? [...a.attributes].map((x) => x.name).join(' ') : ''; });

  // ---- first load: no list ----
  await page.goto(URL0);
  await ready(page);
  await page.waitForLoadState('networkidle');
  check((await page.locator('[data-jlc-picker]').count()) === 0, 'the picker is closed at first');
  const first = js.filter((x) => !x[2]);
  check(first.length > 0 && first.every((x) => !x[1].includes(ONLY_LIST)), `the first load (${first.length} scripts) does not hold the list`);

  // ---- open: the list is fetched, counts and order as in Node ----
  opened = true;
  await page.click('[data-jlc-open]');
  await loaded(page);
  await page.waitForLoadState('networkidle');
  const chunk = js.filter((x) => x[1].includes(ONLY_LIST));
  check(chunk.length === 1 && chunk[0][2] && !first.some((x) => x[0] === chunk[0][0]), `the list comes in its own chunk when the picker opens (${chunk.map((x) => `${x[0].split('/').pop()} ${x[1].length} B`).join(', ')})`);
  check((await page.locator('[data-jlc-open]').getAttribute('aria-expanded')) === 'true', 'the open button says it is expanded');
  const rigid = G.jlcFilter(data.stackups, { board: 'rigid' });
  const visible = G.jlcSort(G.jlcFilter(rigid, { withdrawn: false }));
  check(await count() === visible.length && (await keys()).join() === visible.map(G.jlcKey).join(), `withdrawn hidden: ${visible.length} rows in jlcSort order`);
  const nHand = visible.filter((e) => hand.has(G.jlcKey(e))).length;
  check(nHand >= hand.size - 1 && (await keys()).slice(0, nHand).every((k) => hand.has(k)), `the hand presets come first (${nHand} of ${hand.size} not withdrawn)`);
  await page.check('[data-jlc-withdrawn]');
  check(await count() === rigid.length, `withdrawn shown: ${rigid.length} rows`);
  await page.uncheck('[data-jlc-withdrawn]');

  // ---- filter 8 layers, 1.6 mm, 1 / ½ oz and pick ----
  await page.selectOption('[data-jlc-filter="layers"]', '8');
  await page.selectOption('[data-jlc-filter="thickness"]', '1.6');
  await page.selectOption('[data-jlc-filter="outer"]', '1');
  await page.selectOption('[data-jlc-filter="inner"]', '0.5');
  const want = G.jlcSort(G.jlcFilter(rigid, { layers: 8, thickness: 1.6, outer: 1, inner: 0.5, withdrawn: false }));
  check(want.length > 1 && (await keys()).join() === want.map(G.jlcKey).join(), `8 layers, 1.6 mm, 1 / ½ oz: ${want.length} rows as in Node`);
  const e8 = want.find((e) => !hand.has(G.jlcKey(e)));
  const k8 = G.jlcKey(e8), s8 = G.jlcStackup(e8, data);
  await page.click(`[data-jlc-key="${k8}"]`);
  await page.waitForTimeout(150);
  check((await page.locator('[data-jlc-picker]').count()) === 0 && (await active()).includes('data-jlc-open'), 'choosing closes the picker and gives the focus back');
  check(await attr('data-preset-id') === k8 && await attr('data-list') === 'true' && await attr('data-edited') === 'false', `summary: ${k8}, a list stackup, not edited`);
  check(Number(await attr('data-layers')) === s8.layers.length && near(await attr('data-total'), S.totalThickness(s8)), `summary: ${s8.layers.length} layers, total ${S.totalThickness(s8).toFixed(4)} as jlcStackup`);
  check((await page.locator('[data-drawing] [data-active]').count()) === s8.layers.length, 'the drawing has a label per layer');
  check(/pcb-impedance-calculator/.test(await page.locator('[data-sources]').textContent()) && (await page.locator('[data-sources]').textContent()).includes(data.fetched.to), 'sources: JLCPCB with its date');
  const url8 = page.url();
  check(url8.includes(`s=${k8}&`) || url8.endsWith(`s=${k8}`), `the link carries the key (${url8.slice(url8.indexOf('?'), url8.indexOf('?') + 90)})`);
  const dec = L.decodeLink(url8, resolve);
  check(dec.issues.length === 0 && S.sameStackup(dec.setup.stackup, s8), 'the link decodes in Node to jlcStackup of the entry');
  check((await page.locator('[data-preset]').inputValue()) === '', 'the quick select shows the list stackup by name');

  // ---- undo, redo ----
  await page.click('[data-undo]');
  await page.waitForTimeout(100);
  check(await attr('data-preset-id') === P.DEFAULT_PRESET, 'undo brings the default preset back');
  await page.click('[data-redo]');
  await page.waitForTimeout(100);
  check(await attr('data-preset-id') === k8, 'redo brings the list stackup back');

  // ---- the link in a fresh context ----
  const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.goto(url8);
  await ready(p2);
  await p2.waitForTimeout(150);
  check(await attr('data-preset-id', p2) === k8 && await attr('data-edited', p2) === 'false' && near(await attr('data-total', p2), S.totalThickness(s8)), 'the link opens the same list stackup in a fresh context');
  check((await p2.locator('[data-link-issues]').count()) === 0 && p2.url() === url8, 'no issues, the link written back unchanged');
  // A link of layers (written without the list): unedited, then edited, judged against the list once it is loaded.
  const x8 = dec.setup;
  await p2.goto(`${URL0}?${L.encodeLink(x8)}`);
  await ready(p2);
  await p2.waitForFunction(() => document.querySelector('[data-stackup-summary]')?.getAttribute('data-list') === 'true', null, { timeout: 15000 });
  await p2.waitForTimeout(400);
  check(await attr('data-edited', p2) === 'false', 'a link of the list stackup\'s layers is not edited');
  const ed = { ...x8, stackup: S.cloneStackup(s8) };
  ed.stackup.layers[2].t = { v: 0.25, tol: null, src: { kind: 'typed' } };
  await p2.goto(`${URL0}?${L.encodeLink(ed, resolve)}`);
  await ready(p2);
  await p2.waitForFunction(() => document.querySelector('[data-stackup-summary]')?.getAttribute('data-edited') === 'true', null, { timeout: 15000 }).catch(() => {});
  check(await attr('data-edited', p2) === 'true' && await attr('data-preset-id', p2) === k8, 'an edited list stackup opens from its layers, marked edited');
  // An unknown key: an issue and the default.
  await p2.goto(`${URL0}?v=1&s=rigid_JLC9999_1.6_1_1`);
  await ready(p2);
  check(/not in JLCPCB/.test(await p2.locator('[data-link-issues]').textContent()) && await attr('data-preset-id', p2) === P.DEFAULT_PRESET, 'an unknown key gives an issue and the default stackup');
  await ctx2.close();

  // ---- keyboard: open, filter, choose, Escape ----
  await page.focus('[data-jlc-open]');
  await page.keyboard.press('Enter');
  await loaded(page);
  check((await active()).includes('data-jlc-filter'), 'Enter opens the picker with the focus on the first filter');
  await page.selectOption('[data-jlc-filter="thickness"]', '');
  await page.selectOption('[data-jlc-filter="outer"]', '');
  await page.selectOption('[data-jlc-filter="inner"]', '');
  await page.focus('[data-jlc-filter="layers"]');
  const before = await count();
  await page.keyboard.press('ArrowUp'); // 8 → 6 layers
  await page.waitForTimeout(100);
  const layersNow = await page.locator('[data-jlc-filter="layers"]').inputValue();
  check(layersNow === '6' && await count() === G.jlcFilter(rigid, { layers: 6, withdrawn: false }).length && await count() !== before, `the arrow key filters (${layersNow} layers, ${await count()} rows)`);
  let tabs = 0;
  while (!(await active()).includes('data-jlc-key') && tabs < 20) { await page.keyboard.press('Tab'); tabs += 1; }
  const kk = (await keys())[0];
  check((await active()).includes('data-jlc-key'), `Tab reaches the first row (${tabs} presses)`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const kh = P.PRESET_IDS.find((id) => P.PRESET_KEYS[id] === kk);
  check(await attr('data-preset-id') === (kh ?? kk) && (await page.locator('[data-jlc-picker]').count()) === 0, `Enter chooses the row (${kh ?? kk})`);
  await page.keyboard.press('Enter');
  await loaded(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  check((await page.locator('[data-jlc-picker]').count()) === 0 && (await active()).includes('data-jlc-open'), 'Escape closes the picker and gives the focus back');

  // ---- touch ----
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p3 = await ctx3.newPage();
  p3.on('pageerror', (e) => errors.push(String(e)));
  await p3.goto(URL0);
  await ready(p3);
  await p3.locator('[data-jlc-open]').tap();
  await loaded(p3);
  const k3 = (await keys(p3)).find((k) => !hand.has(k) && k.includes('JLC04'));
  await p3.locator(`[data-jlc-key="${k3}"]`).scrollIntoViewIfNeeded();
  await p3.locator(`[data-jlc-key="${k3}"]`).tap();
  await p3.waitForTimeout(150);
  check(await attr('data-preset-id', p3) === k3, `a tap chooses a row (${k3})`);
  await ctx3.close();

  // ---- widths and themes with the picker open ----
  if (shots) mkdirSync(shots, { recursive: true });
  const shrink = async (buf) => {
    const p = await ctx.newPage();
    const b64 = await p.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await p.close();
    return Buffer.from(b64, 'base64');
  };
  await page.click('[data-jlc-open]');
  await loaded(page);
  await page.selectOption('[data-jlc-filter="layers"]', '8');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px with the picker open, ${scheme} (${sw})`);
      if (shots && width !== 320) {
        await page.locator('[data-jlc-picker]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.evaluate(() => window.scrollBy(0, -70));
        writeFileSync(join(shots, `emsim-jlcpcb-${width}-${scheme}.png`), await shrink(await page.screenshot()));
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-jlcpcb: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
