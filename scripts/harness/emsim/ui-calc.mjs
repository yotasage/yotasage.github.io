// The Trace section's "Calculators" tool in the installed Edge (step M2.3b): on the owner's C39 (the default) the
// field value 51.50 ± 0.05 Ω, the line "as JLCPCB's calculator" equal to lib/emsim/jlcCalc.ts + solveSetup in Node,
// the one-at-a-time breakdown and every closed form equal to Node, JLCPCB's stated number; a formula out of its range
// marked (w 0.4 mm: IPC-2141's w/h); C41 (pair 0.11 / 0.2) the same with Kirschning–Jansen's note; "Use JLCPCB's
// calculator inputs" by keyboard applies the variant as one undo step (summary edited, link equal to Node), Target
// 50 Ω then gives JLCPCB's width (about 5.42 mil), undo returns; a general arrangement says no formula covers it; touch
// at 390 px; no horizontal scroll at 320/390/1440 in both themes; screenshots `emsim-calc-*`.
//   tsx ui-calc.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedStructure from '../../../lib/emsim/structure.ts';
import * as importedCf from '../../../lib/emsim/closedform.ts';
import * as importedJlc from '../../../lib/emsim/jlcCalc.ts';

const LN = importedLines.default ?? importedLines;
const LK = importedLink.default ?? importedLink;
const SU = importedSetup.default ?? importedSetup;
const S = importedStackup.default ?? importedStackup;
const ST = importedStructure.default ?? importedStructure;
const CF = importedCf.default ?? importedCf;
const J = importedJlc.default ?? importedJlc;

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const MIL = 0.0254;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const same = (a, b, tol = 1e-9) => Math.abs(Number(a) - b) <= tol * Math.max(1, Math.abs(b));
const linked = (p) => LK.decodeLink(new URL(p.url()).search).setup;
const mainOf = (r, n) => (!r || !r.ok ? null : n === 2 ? r.pair.zdiff : r.lines[0].z0);
const urlOf = (s) => `${URL0}?${LK.encodeLink(s)}`;
const msAt = (w) => { const s = SU.defaultSetup(); s.trace = { ...s.trace, w: S.val(w) }; return s; };
const pairAt = (w, sp) => { const s = SU.defaultSetup(); s.trace = { ...ST.presetStructure('pair-microstrip', s.stackup, w), s: S.val(sp) }; return s; };

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const attr = (sel, a, p = page) => p.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [sel, a]);
  const solved = async (p = page) => {
    await p.waitForTimeout(30);
    await p.waitForSelector('[data-results]:not([data-stale="true"])', { timeout: 30000 });
  };
  const calcDone = async (p = page) => {
    await p.waitForTimeout(30);
    await p.waitForSelector('[data-tool="calc"][data-state="done"]', { timeout: 60000 });
  };
  const open = async (url, p = page) => {
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await solved(p);
  };
  const openTool = async (k, p = page) => {
    if ((await attr(`[data-tool-tab="${k}"]`, 'aria-pressed', p)) !== 'true') await p.click(`[data-tool-tab="${k}"]`);
    await p.waitForSelector(`[data-tool="${k}"]`, { state: 'visible', timeout: 30000 });
  };

  // The panel against Node for the setup the link holds.
  const panelCheck = async (what) => {
    const s = linked(page);
    const n = s.trace.kind === 'pair-microstrip' ? 2 : 1;
    const fieldN = mainOf(LN.solveSetup(s, { M: 2 }), n);
    const jl = J.asJlcpcbCalculator(s).setup;
    const jlN = mainOf(LN.solveSetup(jl, { M: 2 }), n);
    const g = async (sel, a) => Number(await attr(sel, a));
    const fv = await g('[data-calc-row="field"]', 'data-v'), fe = await g('[data-calc-row="field"]', 'data-e');
    check(same(fv, fieldN.v, 1e-9) && same(fe, fieldN.e, 1e-6), `${what}: field value ${fv} ± ${fe} equals Node ${fieldN.v} ± ${fieldN.e}`);
    check(same(fv, Number(await attr(`[data-results] [data-q="${n === 2 ? 'zdiff' : 'z0'}"]`, 'data-v')), 1e-12), `${what}: field value equals the results panel`);
    const jv = await g('[data-calc-row="jlc"]', 'data-v'), je = await g('[data-calc-row="jlc"]', 'data-e');
    check(same(jv, jlN.v, 1e-9) && same(je, jlN.e, 1e-6), `${what}: as JLCPCB's calculator ${jv} ± ${je} equals the helper in Node ${jlN.v} ± ${jlN.e}`);
    // breakdown
    let bad = 0;
    for (const p of J.jlcPartsThatChange(s)) {
      const d = await g(`[data-calc-part="${p}"]`, 'data-d');
      const dn = mainOf(LN.solveSetup(J.jlcAllBut(s, p), { M: 2 }), n).v - jlN.v;
      if (!same(d, dn, 1e-7)) { bad++; console.log(`  ${p}: ${d} vs ${dn}`); }
    }
    check(bad === 0, `${what}: each input's change equals Node`);
    // closed forms
    const cf = CF.closedForms(s);
    const ids = await page.$$eval('[data-cf]', (es) => es.map((e) => [e.getAttribute('data-cf'), e.getAttribute('data-v'), e.getAttribute('data-inside')]));
    const key = n === 2 ? 'zdiff' : 'z0';
    check(ids.length === cf.results.length && cf.results.every((r, i) => ids[i][0] === r.id && same(ids[i][1], r.values[key], 1e-12) && ids[i][2] === String(r.validity.inside)),
      `${what}: the closed forms equal closedForms in Node (${ids.map((x) => `${x[0]} ${Number(x[1]).toFixed(2)}${x[2] === 'false' ? ' outside' : ''}`).join(', ')})`);
    return { fv, fe, jv, je, s, cf };
  };

  // ---- C39 (the default), keyboard ----
  await open(URL0);
  await page.locator('[data-tool-tab="calc"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-tool="calc"]', { state: 'visible', timeout: 30000 });
  check((await attr('[data-tool-tab="calc"]', 'aria-pressed')) === 'true', 'the Calculators tool opens by keyboard');
  await calcDone();
  const c39 = await panelCheck('C39');
  check((await page.locator('[data-calc-row="field"] dd').textContent()).includes('51.50 ± 0.05 Ω'), 'C39 shows 51.50 ± 0.05 Ω');
  check((await attr('[data-calc-stated]', 'data-calc-stated')) === 'C39', 'C39: JLCPCB\'s stated 50 Ω at 5.42 mil is shown');
  check(await page.locator('[data-calc-part]').count() === 5, 'C39: four inputs and their sum');
  console.log(`  C39: field ${c39.fv.toFixed(3)} ± ${c39.fe.toFixed(3)} Ω, as JLCPCB's calculator ${c39.jv.toFixed(3)} ± ${c39.je.toFixed(3)} Ω`);

  // "Use JLCPCB's calculator inputs" by keyboard, then Target 50 Ω, then undo
  const s0 = linked(page);
  await page.locator('[data-calc-use]').focus();
  await page.keyboard.press('Enter');
  await solved();
  const s1 = linked(page);
  check(S.sameStackup(s1.stackup, J.asJlcpcbCalculator(s0).setup.stackup) && ST.sameStructure(s1.trace, s0.trace), 'the button applies the helper\'s stackup; the trace is kept');
  check((await attr('[data-stackup-summary]', 'data-edited')) === 'true', 'the stackup summary shows it edited');
  await calcDone();
  check(await page.locator('[data-calc-applied]').count() === 1, 'the panel says the inputs are applied');
  check(same(await attr('[data-calc-row="field"]', 'data-v'), c39.jv, 1e-9), 'the field value is now the calculator line\'s');
  const srcText = await page.locator('body').textContent();
  check(/Polar Si9000/.test(srcText) && /read 2026-11-16/.test(srcText), 'the sources name JLCPCB\'s calculator and the date');
  await openTool('target');
  await page.locator('[data-target-input]').fill('50');
  await page.locator('[data-target-input]').press('Enter');
  await page.waitForSelector('[data-target-result][data-reached="true"]', { timeout: 60000 });
  const wT = Number(await attr('[data-target-result]', 'data-w'));
  check(Math.abs(wT / MIL - 5.42) <= 0.03, `Target 50 Ω with JLCPCB's inputs: ${(wT / MIL).toFixed(3)} mil (${wT.toFixed(4)} mm), JLCPCB 5.42`);
  console.log(`  Target 50 Ω as JLCPCB's calculator: ${(wT / MIL).toFixed(3)} mil = ${wT.toFixed(4)} mm (the page's own stackup: 5.77 mil)`);
  await page.click('[data-undo]');
  await solved();
  check(S.sameStackup(linked(page).stackup, s0.stackup) && (await attr('[data-stackup-summary]', 'data-edited')) === 'false', 'one undo returns the preset');

  // ---- out of range: w 0.4 mm (w/h 4.3 > IPC-2141's 3) ----
  await open(urlOf(msAt(0.4)));
  await openTool('calc');
  await calcDone();
  const wide = await panelCheck('w 0.4 mm');
  check((await attr('[data-cf="ipc-microstrip"]', 'data-inside')) === 'false' && /w\/h/.test(await attr('[data-cf="ipc-microstrip"]', 'data-outside')), 'IPC-2141 is marked outside its range at w/h 4.3');
  check(/Outside its range/.test(await page.locator('[data-cf="ipc-microstrip"] [data-cf-range]').textContent()), 'and says so in words');
  check(await page.locator('[data-calc-stated]').count() === 0, 'no JLCPCB number at another width');
  void wide;

  // ---- C41 ----
  await open(urlOf(pairAt(0.11, 0.2)));
  await openTool('calc');
  await calcDone();
  const c41 = await panelCheck('C41');
  check((await attr('[data-calc-stated]', 'data-calc-stated')) === 'C41', 'C41: JLCPCB\'s stated 100 Ω is shown');
  check(await page.locator('[data-calc-kj]').count() === 1 && await page.locator('[data-cf="kj"]').count() === 1, 'C41: Kirschning–Jansen with its zero-thickness note');
  check(Math.abs(c41.jv - 100.01) <= c41.je, `C41 as JLCPCB's calculator ${c41.jv.toFixed(2)} ± ${c41.je.toFixed(2)} (100.01)`);
  console.log(`  C41: field ${c41.fv.toFixed(3)} ± ${c41.fe.toFixed(3)} Ω, as JLCPCB's calculator ${c41.jv.toFixed(3)} ± ${c41.je.toFixed(3)} Ω`);

  // ---- a general arrangement: no formula ----
  await page.click('[data-trace-to-general]');
  await solved();
  await calcDone();
  check(await page.locator('[data-calc-none]').count() === 1 && /No closed form/.test(await page.locator('[data-calc-none]').textContent()), 'a general arrangement says no closed form covers it');
  check(await page.locator('[data-cf]').count() === 0, 'and lists no formula');
  await page.click('[data-undo]');
  await solved();

  // ---- touch at 390 px ----
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tp = await tctx.newPage();
  tp.on('pageerror', (e) => errors.push(String(e)));
  await open(URL0, tp);
  await tp.locator('[data-tool-tab="calc"]').scrollIntoViewIfNeeded();
  await tp.tap('[data-tool-tab="calc"]');
  await calcDone(tp);
  await tp.locator('[data-calc-use]').scrollIntoViewIfNeeded();
  await tp.tap('[data-calc-use]');
  await solved(tp);
  check((await attr('[data-stackup-summary]', 'data-edited', tp)) === 'true' && J.isJlcpcbCalculator(linked(tp)), 'touch: a tap applies JLCPCB\'s inputs');
  await tp.tap('[data-undo]');
  await solved(tp);
  check(!J.isJlcpcbCalculator(linked(tp)), 'touch: a tap on undo returns');
  await tctx.close();

  // ---- widths, themes, screenshots (C39) ----
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
  await open(URL0);
  await openTool('calc');
  await calcDone();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme} (${sw})`);
      if (shots && width !== 320) {
        await page.evaluate(() => window.scrollTo(0, 0));
        const b = await page.locator('[data-tools]').boundingBox();
        writeFileSync(join(shots, `emsim-calc-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true, clip: { x: 0, y: b.y, width, height: b.height } })));
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-calc: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
