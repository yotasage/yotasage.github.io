// The EM simulation page's Stackup section in the installed Edge (step M2.1a): the default preset and its link, a
// preset loaded, a value typed (the total follows, the source becomes "typed"), unreadable text refused with its reason
// and Escape, a tolerance typed, undo and redo by button and keys, the unit switch, the link round trip in a fresh
// browser context (preset, edits, tolerance, unit), the owner's carrier board and project (facts-cases.md C38–C43: 13
// layers, 1.657 mm, 50R_SE 0.1377, Default 0.2 / 0.25) and the mezzanine's project (LVDS_100R 0.11 / 0.2) opened from
// where they are (skipped with a note if missing), the KiCad stackup's link round trip, the widen switch, the theme
// switch and its localStorage, no horizontal scroll and screenshots at 320, 390 and 1440 px in both themes (downscaled
// to at most 1000 px wide).
//   tsx ui-stackup.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedPresets from '../../../lib/emsim/presets.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';

const P = importedPresets.default ?? importedPresets;
const S = importedStackup.default ?? importedStackup;
const L = importedLink.default ?? importedLink;
const ST = importedSetup.default ?? importedSetup;

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const PCB = 'E:/OneDrive - NTNU/ULDAC/PCB';
const CARRIER = [`${PCB}/ARTI-CARRIER-PICO2/ARTI-CARRIER-PICO2.kicad_pcb`, `${PCB}/ARTI-CARRIER-PICO2/ARTI-CARRIER-PICO2.kicad_pro`];
const MEZZ_PRO = `${PCB}/2026_ARTIFICER_TC1/2026_ARTIFICER_TC1.kicad_pro`;

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
  const summary = (p = page) => p.locator('[data-stackup-summary]');
  const attr = (name, p = page) => summary(p).getAttribute(name);
  const ready = async (p) => { await p.waitForSelector('[data-ready="true"]', { timeout: 30000 }); };
  const settle = (p = page) => p.waitForTimeout(80);

  // ---- the default ----
  await page.goto(URL0);
  await ready(page);
  await settle();
  const def = P.presetStackup(P.DEFAULT_PRESET);
  check(await attr('data-preset-id') === P.DEFAULT_PRESET, 'default preset shown');
  check(Number(await attr('data-layers')) === def.layers.length, 'default layer count');
  check(near(await attr('data-total'), S.totalThickness(def)), 'default total');
  check(page.url().endsWith(`?${L.encodeLink(ST.defaultSetup())}`), `default link written (${page.url()})`);

  // ---- a preset, a typed value, a refusal, a tolerance ----
  const PID = 'JLC04161H-7628';
  await page.selectOption('[data-preset]', PID);
  await settle();
  const pre = P.presetStackup(PID);
  check(await attr('data-preset-id') === PID && near(await attr('data-total'), S.totalThickness(pre)), 'preset loaded with its total');
  const di = pre.layers.findIndex((l) => l.kind === 'dielectric');
  const did = pre.layers[di].id;
  const field = page.locator(`[data-field="${did}.t"]`);
  const value = field.locator('input').nth(0), tol = field.locator('input').nth(1);
  const edited = S.cloneStackup(pre);
  edited.layers[di].t.v = 0.25;
  await value.fill('0.25');
  await settle();
  check(near(await attr('data-total'), S.totalThickness(edited)), 'typed thickness changes the total');
  check(await attr('data-edited') === 'true', 'stackup marked edited');
  check((await field.locator('[data-kind]').textContent()) === 'typed', 'typed value shows source "typed"');
  await value.fill('abc');
  await settle();
  const alert = field.locator('[role="alert"]');
  check((await alert.count()) === 1 && /not a number/.test(await alert.textContent()), 'unreadable text says why');
  check(near(await attr('data-total'), S.totalThickness(edited)), 'unreadable text leaves the setup alone');
  await value.press('Escape');
  check((await value.inputValue()) === '0.25' && (await alert.count()) === 0, 'Escape puts the value back');
  await value.fill('-1');
  await settle();
  check((await alert.count()) === 1, 'negative thickness refused with a reason');
  await value.press('Escape');
  await tol.fill('±5 %');
  await tol.press('Enter');
  await settle();
  check((await tol.inputValue()) === '±5 %', 'tolerance typed');

  // ---- undo and redo ----
  const shown = String(Number(pre.layers[di].t.v.toPrecision(4)));
  await page.click('[data-undo]');
  await settle();
  check((await tol.inputValue()) === '', 'undo removes the tolerance');
  await page.click('[data-undo]');
  await settle();
  check((await value.inputValue()) === shown, `undo restores the preset value (${await value.inputValue()} vs ${shown})`);
  await page.click('[data-redo]');
  await settle();
  check((await value.inputValue()) === '0.25', 'redo brings the value back');
  await page.locator('[data-stackup-summary]').click();
  await page.keyboard.press('Control+Shift+Z');
  await settle();
  check((await tol.inputValue()) === '±5 %', 'Ctrl+Shift+Z redoes');
  await page.keyboard.press('Control+Z');
  await settle();
  check((await tol.inputValue()) === '', 'Ctrl+Z undoes');
  await page.keyboard.press('Control+Y');
  await settle();
  check((await tol.inputValue()) === '±5 %', 'Ctrl+Y redoes');

  // ---- units ----
  await page.click('[data-unit="mil"]');
  await settle();
  const mil = String(Number((0.25 / 0.0254).toPrecision(4)));
  check((await value.inputValue()) === mil, `unit mil shown in the field (${await value.inputValue()})`);
  check(/[?&]u=mil(&|$)/.test(page.url()), 'unit in the link');

  // ---- the link round trip in a fresh context (no localStorage) ----
  const url = page.url();
  const dec = L.decodeLink(url);
  check(dec.issues.length === 0 || dec.issues.every((x) => x.where === 'u'), 'the link decodes in node');
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push(String(e)));
  await p2.goto(url);
  await ready(p2);
  await settle(p2);
  const f2 = p2.locator(`[data-field="${did}.t"] input`);
  check(await attr('data-preset-id', p2) === PID && (await attr('data-edited', p2)) === 'true', 'round trip: preset, edited');
  check(near(await attr('data-total', p2), S.totalThickness(edited)), 'round trip: total');
  check((await f2.nth(0).inputValue()) === mil && (await f2.nth(1).inputValue()) === '±5 %', 'round trip: value in mil and tolerance');
  check((await p2.locator('[data-unit="mil"]').getAttribute('aria-pressed')) === 'true', 'round trip: unit');
  check(p2.url() === url, 'round trip: the link is written back unchanged');
  await ctx2.close();
  await page.click('[data-unit="mm"]');

  // ---- the widen switch ----
  await page.click('[data-widen-toggle]');
  await settle();
  check((await page.locator('[data-drawing]').getAttribute('data-widen')) === 'true' && Number(await page.locator('[data-drawing]').getAttribute('data-px-per-mm')) === 0, 'widen switch');
  await page.click('[data-widen-toggle]');
  await settle();
  check(Number(await page.locator('[data-drawing]').getAttribute('data-px-per-mm')) > 0, 'to scale again');

  // ---- the owner's boards ----
  if (CARRIER.every(existsSync)) {
    await page.locator('[data-kicad-input]').setInputFiles(CARRIER);
    await page.waitForSelector('[data-stackup-summary][data-source="kicad"]', { timeout: 30000 });
    await page.waitForSelector('[data-class="50R_SE"]', { timeout: 30000 });
    check(Number(await attr('data-layers')) === 13 && Number(await attr('data-copper')) === 6, 'C38: 13 layers, 6 copper');
    check(near(await attr('data-total'), 1.657, 1e-9), `C38: total 1.657 (${await attr('data-total')})`);
    const cls = async (name, key) => page.locator(`[data-class="${name}"]`).getAttribute(key);
    check(near(await cls('50R_SE', 'data-track'), 0.1377), 'C39: 50R_SE track 0.1377');
    check(near(await cls('Default', 'data-pair-width'), 0.2) && near(await cls('Default', 'data-pair-gap'), 0.25) && near(await cls('Default', 'data-clearance'), 0.2), 'C43: Default 0.2 / 0.25, clearance 0.2 (carrier)');
    check((await page.locator('[data-kicad-board] [data-issue]').count()) > 0, 'KiCad issues shown (placeholders, masks without εr)');
    const kurl = page.url();
    const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const p3 = await ctx3.newPage();
    p3.on('pageerror', (e) => errors.push(String(e)));
    await p3.goto(kurl);
    await ready(p3);
    await settle(p3);
    check(Number(await attr('data-layers', p3)) === 13 && near(await attr('data-total', p3), 1.657) && (await attr('data-source', p3)) === 'kicad', 'KiCad stackup round-trips through the link');
    await ctx3.close();
    if (existsSync(MEZZ_PRO)) {
      await page.locator('[data-kicad-input]').setInputFiles([MEZZ_PRO]);
      await page.waitForSelector('[data-class="LVDS_100R"]', { timeout: 30000 });
      check(near(await cls('LVDS_100R', 'data-pair-width'), 0.11) && near(await cls('LVDS_100R', 'data-pair-gap'), 0.2), 'C41: LVDS_100R 0.11 / 0.2');
      check(near(await cls('Default', 'data-clearance'), 0.1), 'C43: Default clearance 0.1 (mezzanine)');
      await page.locator('[data-kicad-input]').setInputFiles([CARRIER[1]]);
      await page.waitForSelector('[data-class="50R_SE"]', { timeout: 30000 });
    } else console.log(`NOTE ${MEZZ_PRO} not found: the LVDS_100R check is skipped`);
  } else console.log('NOTE the carrier board files were not found: the KiCad checks are skipped');

  // ---- the theme switch (Design System v2) ----
  const themeState = () => page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-ds-theme'),
    stored: localStorage.getItem('site.theme'),
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await settle();
  let ts = await themeState();
  check(ts.theme === 'dark' && ts.stored === 'dark' && ts.bg === 'rgb(9, 9, 11)', `theme switch to dark, kept (${JSON.stringify(ts)})`);
  await page.getByRole('button', { name: 'High contrast', exact: true }).click();
  await settle();
  ts = await themeState();
  check(ts.theme === 'hc' && ts.stored === 'hc' && ts.bg === 'rgb(0, 0, 0)', `theme switch to high contrast (${JSON.stringify(ts)})`);
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await settle();
  ts = await themeState();
  check(ts.theme === 'light' && ts.stored === 'light' && ts.bg === 'rgb(245, 247, 251)', `theme switch back to light (${JSON.stringify(ts)})`);

  // ---- widths and themes ----
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
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.getByRole('button', { name: scheme === 'dark' ? 'Dark' : 'Light', exact: true }).click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme} (${sw})`);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      check(bg === (scheme === 'dark' ? 'rgb(9, 9, 11)' : 'rgb(245, 247, 251)'), `page background in ${scheme} (${bg})`);
      if (shots) {
        await page.evaluate(() => window.scrollTo(0, 0));
        writeFileSync(join(shots, `emsim-stackup-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true })));
        if (width < 1000) {
          // Readable views of a phone: the top, and the drawing with the first rows of the table.
          await page.evaluate(() => window.scrollTo(0, 0));
          writeFileSync(join(shots, `emsim-stackup-${width}-${scheme}-top.png`), await page.screenshot());
          await page.locator('[data-drawing]').scrollIntoViewIfNeeded();
          writeFileSync(join(shots, `emsim-stackup-${width}-${scheme}-drawing.png`), await page.screenshot());
        }
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-stackup: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
