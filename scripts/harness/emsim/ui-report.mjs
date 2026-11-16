// The Export section's Report group in the browser (step M8.2b): Print report builds the report (window.print stubbed
// to count its calls), and with print media emulated the report alone shows (the app's #__next hidden), light whatever
// the page's theme; it holds every stackup row, the trace's Z0 equal to the page's (value, error and text), the via's
// barrel Z equal to the Via section's, the drawings and the plots as SVG; the calculators join once run; an unchecked
// part leaves; Chromium's PDF of it has A4's or Letter's page size and at least one page, in both page themes; keys
// and taps reach Print; no horizontal scroll at 320/390/1440 in both themes. With a screenshot folder: the A4 and
// Letter PDFs and the first page of the A4 one as PNG (pdftoppm, or a screenshot of the print view without it).
//   tsx ui-report.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedSetup from '../../../lib/emsim/setup.ts';

const d = (m) => m.default ?? m;
const SU = d(importedSetup);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const errors = [];

const PT = { a4: [595.28, 841.89], letter: [612, 792] }; // page sizes in points

/** Page sizes (MediaBox) and the page count of a PDF Chromium wrote. */
function pdfPages(buf) {
  const t = buf.toString('latin1');
  const boxes = [...t.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])]);
  const pages = (t.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  return { boxes, pages };
}

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const open = async (ctx, url) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.locator('#export').scrollIntoViewIfNeeded();
    await p.waitForSelector('[data-report-ready]', { timeout: 30000 });
    await p.evaluate(() => { window.__prints = 0; window.print = () => { window.__prints++; }; });
    return p;
  };
  const prints = (p) => p.evaluate(() => window.__prints);
  const solveAll = async (p) => {
    await p.waitForSelector('[data-results][data-state="done"][data-stale="false"]', { timeout: 60000 });
    await p.locator('#via').scrollIntoViewIfNeeded();
    await p.waitForSelector('[data-via-plots][data-stale="false"]', { timeout: 60000 });
    await p.locator('#export').scrollIntoViewIfNeeded();
    await p.waitForFunction(() => /plots/.test(document.querySelector('[data-report-ready]').dataset.parts), null, { timeout: 30000 });
  };
  const printWith = async (p, paper) => {
    await p.emulateMedia({ media: 'screen' });
    await p.click(`[data-report-paper="${paper}"]`);
    const n = await prints(p);
    await p.click('[data-report-print]');
    await p.waitForSelector(`[data-report][data-paper="${paper}"]`, { state: 'attached', timeout: 10000 });
    check(await prints(p) === n + 1, `Print report calls the browser's print (${paper})`);
    await p.emulateMedia({ media: 'print' });
  };
  const pdfCheck = async (p, paper, label) => {
    const buf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
    const { boxes, pages } = pdfPages(buf);
    const [w, h] = PT[paper];
    check(pages >= 1 && boxes.length >= 1 && boxes.every(([bw, bh]) => Math.abs(bw - w) < 3 && Math.abs(bh - h) < 3), `the ${label} PDF is ${paper} (${pages} pages, ${boxes.slice(0, 1).map((b) => b.map((x) => x.toFixed(1)).join(' × ')).join('')} pt)`);
    return { buf, pages };
  };
  const light = (p) => p.evaluate(() => {
    const r = document.querySelector('[data-report]');
    const cs = getComputedStyle(r), b = getComputedStyle(document.body);
    return { bg: cs.backgroundColor, ink: cs.color, body: b.backgroundColor };
  });

  // ---- 1: light page, A4 and Letter ----
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const p = await open(ctx, `${URL0}#export`);
  check(await p.locator('[data-report]').count() === 0, 'the report is not built before Print (nothing costs while dragging)');
  await solveAll(p);
  // The calculators: run them, and the report offers them.
  await p.locator('[data-tool-tab="calc"]').scrollIntoViewIfNeeded();
  await p.click('[data-tool-tab="calc"]');
  await p.waitForSelector('[data-tool="calc"][data-state="done"]', { timeout: 60000 });
  await p.locator('#export').scrollIntoViewIfNeeded();
  await p.waitForFunction(() => /calc/.test(document.querySelector('[data-report-ready]').dataset.parts), null, { timeout: 30000 });
  check(!(await p.locator('[data-report-part="calc"]').isDisabled()), 'Calculators can be included once they have run');

  await printWith(p, 'a4');
  check(await p.locator('[data-report]').isVisible(), 'in print the report shows');
  check(!(await p.locator('#__next').isVisible()) && !(await p.locator('#__next header').first().isVisible()), 'in print the page (bar, nav, controls, short lines, status note, footer) is hidden');
  const layers = SU.defaultSetup().stackup.layers.length;
  check(await p.locator('tr[data-report-layer]').count() === layers, `the stackup table has every layer (${layers})`);
  check(await p.locator('[data-report-sources] li').count() >= 1, 'the stackup\'s sources are listed');
  const pageQ = await p.evaluate(() => {
    const el = document.querySelector('[data-results] [data-q="z0"]');
    const err = el.querySelector('dd span:nth-child(2)');
    return { v: el.dataset.v, e: el.dataset.e, text: `${el.querySelector('dd span').textContent}${err && /±/.test(err.textContent) ? err.textContent : ''}` };
  });
  const repQ = await p.evaluate(() => { const el = document.querySelector('[data-report-q="z0"]'); return el && { v: el.dataset.v, e: el.dataset.e, text: el.querySelector('[data-report-text]').textContent }; });
  check(!!repQ && repQ.v === pageQ.v && repQ.e === pageQ.e && repQ.text === pageQ.text.trim(), `the report's Z0 equals the page's (${repQ && repQ.text} | ${pageQ.text.trim()})`);
  const pageV = await p.evaluate(() => { const el = document.querySelector('[data-via-results] [data-via-q="barrel-z"]'); return el && { v: el.dataset.v, e: el.dataset.e, text: el.querySelector('dd').textContent.replace(/\s+Ω.*$/, '').trim() }; });
  const repV = await p.evaluate(() => { const el = document.querySelector('[data-report-via="barrel-z"]'); return el && { v: el.dataset.v, e: el.dataset.e, text: el.querySelector('[data-report-text]').textContent }; });
  check(!!repV && !!pageV && repV.v === pageV.v && repV.e === pageV.e && repV.text === pageV.text, `the report's barrel Z equals the Via section's (${repV && repV.text} | ${pageV && pageV.text})`);
  const figs = await p.$$eval('[data-report-fig]', (els) => els.map((e) => [e.dataset.reportFig, !!e.querySelector('svg')]));
  const ids = figs.map((f) => f[0]);
  check(['stackup', 'section', 'via-side', 'via-top', 'via-tdr', 'via-tdt', 'via-s'].every((k) => ids.includes(k)) && figs.every((f) => f[1]), `the drawings and plots are SVG (${ids.join(', ')})`);
  check(await p.$$eval('[data-report-fig] svg', (els) => els.every((s) => /mm$/.test(s.getAttribute('width')) && s.getBoundingClientRect().width > 50)), 'each figure is laid out at its size in mm');
  check(await p.locator('[data-report-calc] tr').count() >= 3, 'the calculators\' comparison is in the report');
  check(await p.locator('[data-report-via-flags]').count() === 1 && await p.locator('[data-report-about]').count() === 1, 'the via\'s flags and assumptions and the line on what the numbers are');
  check(/\?/.test(await p.textContent('[data-report-link]')), 'the setup\'s link is in the report as text');
  const l1 = await light(p);
  check(l1.bg === 'rgb(255, 255, 255)' && l1.body === 'rgb(255, 255, 255)' && l1.ink === 'rgb(29, 28, 25)', `the report is light (${l1.bg}, ${l1.ink}, body ${l1.body})`);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'the print view has no horizontal scroll');
  const a4 = await pdfCheck(p, 'a4', 'A4');
  if (shots) {
    const f = join(shots, 'emsim-report-a4.pdf');
    writeFileSync(f, a4.buf);
    const r = spawnSync('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', f, join(shots, 'emsim-report-a4-page1')], { encoding: 'utf8' });
    if (r.status !== 0) writeFileSync(join(shots, 'emsim-report-a4-page1.png'), await p.screenshot({ fullPage: false }));
  }
  await printWith(p, 'letter');
  const le = await pdfCheck(p, 'letter', 'Letter');
  if (shots) writeFileSync(join(shots, 'emsim-report-letter.pdf'), le.buf);

  // An unchecked part leaves the report. (Chromium's PDF fires beforeprint and afterprint as a real print does.)
  await p.emulateMedia({ media: 'screen' });
  await p.click('[data-report-part="via"]');
  await p.waitForFunction(() => !/\bvia\b/.test(document.querySelector('[data-report-ready]').dataset.parts), null, { timeout: 5000 });
  await p.click('[data-report-print]'); // page.pdf() fires afterprint, which dropped the report
  const left = await p.locator('[data-report] section[data-report-part]').evaluateAll((e) => e.map((x) => x.dataset.reportPart));
  check(!left.includes('via') && left.includes('trace'), `an unchecked part is left out (${left.join(', ')})`);
  await p.click('[data-report-part="via"]');

  // The browser's own Print (beforeprint) builds it too, and afterprint drops it.
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await p.waitForSelector('[data-report]', { state: 'detached', timeout: 5000 });
  await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  check(await p.locator('[data-report]').count() === 1, 'the browser\'s own Print (beforeprint) builds the report at once');
  await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));

  // Keys reach Print.
  await p.locator('[data-report-print]').focus();
  let n0 = await prints(p);
  await p.keyboard.press('Enter');
  await p.keyboard.press('Space');
  check(await prints(p) === n0 + 2, 'Enter and Space on Print report print');
  await p.locator('[data-report-paper="a4"]').focus();
  await p.keyboard.press('Enter');
  check(await p.getAttribute('[data-report-ready]', 'data-paper') === 'a4', 'the paper is chosen by key');
  await p.close();
  await ctx.close();

  // ---- 2: dark page: the report stays light ----
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
  const q = await open(c2, `${URL0}#export`);
  await solveAll(q);
  await printWith(q, 'a4');
  const l2 = await light(q);
  check(l2.bg === 'rgb(255, 255, 255)' && l2.body === 'rgb(255, 255, 255)' && l2.ink === 'rgb(29, 28, 25)', `with the page dark the report stays light (${l2.bg}, ${l2.ink}, body ${l2.body})`);
  await pdfCheck(q, 'a4', 'A4 (dark page)');
  await printWith(q, 'letter');
  await pdfCheck(q, 'letter', 'Letter (dark page)');
  await q.close();
  await c2.close();

  // ---- 3: taps, and no horizontal scroll ----
  for (const scheme of ['light', 'dark']) {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, hasTouch: true, isMobile: true });
    const t = await open(c3, `${URL0}#export`);
    if (scheme === 'light') {
      await t.locator('[data-report-paper="letter"]').scrollIntoViewIfNeeded();
      await t.tap('[data-report-paper="letter"]');
      await t.tap('[data-report-print]');
      check(await prints(t) === 1 && await t.getAttribute('[data-report-ready]', 'data-paper') === 'letter', 'taps choose the paper and print');
      await t.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    }
    for (const width of [320, 390, 1440]) {
      await t.setViewportSize({ width, height: 900 });
      await t.waitForTimeout(250);
      const sw = await t.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px with the Report group, ${scheme} (${sw})`);
    }
    await t.close();
    await c3.close();
  }
  check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-report: ${pass} passed, ${fails.length} failed${shots ? `; PDFs and the first page in ${shots}` : ''}`);
if (fails.length) process.exit(1);
