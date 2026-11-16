// The EM simulation page's equation panel in the installed Edge (step M4.3a; components/EmSim/eqLinks.tsx, EqPanel.tsx,
// components/Equations/DerivationDialog.tsx). The first load holds neither KaTeX nor the registry nor the panel. For the
// default microstrip, the default pair and the default via (C44) every result number with an equation is a button that
// opens its panel: the entry's relation for that number is evaluated here in Node by the shared engine on the binding
// the panel shows (data-eq-bind) and equals the engine's number in the results within 1e-9, as does the page's own
// evaluation, and the shown number to its digits; the panel's result is the number's own. A derivation opens with the
// focus on Next step; Next, Back and Show all reveal the steps; Escape closes it and gives the focus back to Derivation,
// a second Escape closes the panel and gives it back to the number. An edit of the width updates the panel's numbers.
// Keyboard (Tab to a number, Enter, Escape) and touch at 390 px (the panel below the results, the dialog the whole
// screen); at 1440 px the panel is beside the results. No horizontal scroll at 320/390/1440 in both themes with the
// panel and the dialog open. With a screenshot folder: emsim-eq-{panel,derive}-{390,1440}-{light,dark}.png.
//   tsx ui-equations.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedEq from '../../../lib/emsim/equations.ts';
import * as importedCompile from '../../../lib/equations/compile.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedStructure from '../../../lib/emsim/structure.ts';

const d = (m) => m.default ?? m;
const EQ = d(importedEq), CO = d(importedCompile), LK = d(importedLink), SU = d(importedSetup), S = d(importedStackup), ST = d(importedStructure);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300));
const urlOf = (s) => `${URL0}?${LK.encodeLink(s)}`;
const pairSetup = () => { const s = SU.defaultSetup(); s.trace = { ...ST.presetStructure('pair-microstrip', s.stackup, 0.11), s: S.val(0.2) }; return s; };
const lhsOf = (t) => (t.t === 'eq' && t.xs[0].t === 'id' ? String(t.xs[0].v) : null);
/** x rounded as the results round it, to the decimals of `text`. */
const asShown = (x, text) => {
  const t = text.replace('−', '-');
  const dec = t.includes('.') ? t.length - t.indexOf('.') - 1 : 0;
  return (Math.round(x * 10 ** dec) / 10 ** dec).toFixed(dec).replace('-', '−');
};

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const open = async (url, c = ctx) => {
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.waitForTimeout(30);
    await p.waitForSelector('[data-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
    return p;
  };
  const scripts = (p) => p.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'script' || e.name.endsWith('.js')).map((e) => e.name));
  const textOf = (p, u) => p.evaluate(async (x) => (await fetch(x)).text(), u);
  const PANEL_TEXT = /KaTeX parse error|Effective permittivity of a mode|This number is not in the results now/;

  // ---- the first load ----
  const page = await open(URL0);
  const first = await scripts(page);
  const inFirst = [];
  for (const u of first) if (PANEL_TEXT.test(await textOf(page, u))) inFirst.push(u);
  check(inFirst.length === 0, `no first-load script holds KaTeX, the registry or the panel (${inFirst.join(', ')})`);
  check(await page.locator('[data-eq-panel]').count() === 0, 'no panel before a number is opened');

  // ---- every number of a state against Node ----
  const numbers = async (p, scope, want) => {
    const names = await p.$$eval(`${scope} [data-eq-open]`, (es) => es.map((e) => e.getAttribute('data-eq-open')));
    check(want.every((w) => names.includes(w)), `${scope}: the numbers with an equation include ${want.join(', ')} (${names.join(', ')})`);
    let live = 0, worst = 0;
    const plain = [];
    for (const name of names) {
      const btn = p.locator(`${scope} [data-eq-open="${name}"]`).first();
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      const panel = p.locator(`[data-eq-panel][data-eq-name="${name}"]`);
      await panel.waitFor({ timeout: 30000 });
      const id = await panel.getAttribute('data-eq-panel');
      const eq = EQ.EM_EQUATION_BY_ID.get(id);
      check(!!eq, `${name}: opens a registry entry (${id})`);
      check(await btn.getAttribute('aria-expanded') === 'true', `${name}: its button is marked open`);
      if (await panel.getAttribute('data-eq-live') !== 'true') { plain.push(`${name} (${id})`); check(await panel.locator('[data-eq-symbols]').count() === 1, `${name}: printed without numbers says so`); continue; }
      live++;
      const v = Number(await btn.getAttribute('data-v')), scale = Number(await btn.getAttribute('data-scale')), text = (await btn.textContent()).trim();
      const res = panel.locator('[data-eq-result]');
      check(await res.count() === 1, `${name}: one result line`);
      const pv = Number(await res.getAttribute('data-v')), pe = Number(await res.getAttribute('data-eval'));
      const sym = await panel.locator('[data-eq-mine]').getAttribute('data-eq-rel');
      const tree = [eq.tree, ...eq.where.map((w) => w.tree)].find((t) => lhsOf(t) === sym);
      const binding = JSON.parse(await panel.getAttribute('data-eq-bind'));
      const sides = CO.evaluate(tree, binding);
      const node = sides[sides.length - 1][0];
      worst = Math.max(worst, rel(node, v));
      check(rel(pv, v) <= 1e-12, `${name}: the panel's result is the results' number (${pv} vs ${v})`);
      check(rel(node, v) <= 1e-9, `${name}: ${id} evaluated in Node equals the engine (${node} vs ${v}, ${rel(node, v).toExponential(1)})`);
      check(rel(pe, v) <= 1e-9, `${name}: the page's evaluation equals the engine (${pe} vs ${v})`);
      check(asShown(node * scale, text) === text, `${name}: the equation's value to the shown digits is the number shown (${asShown(node * scale, text)} vs ${text})`);
    }
    console.log(`  ${scope}: ${names.length} numbers with an equation, ${live} with numbers (worst ${worst.toExponential(1)})${plain.length ? `; symbols only: ${plain.join(', ')}` : ''}`);
    return { names, live };
  };

  // default microstrip
  await page.click('[data-matrices] > summary');
  const ms = await numbers(page, '[data-results]', ['z0', 'eeff', 'delay', 'L.1.1', 'Zc.1.1']);
  check(ms.live === ms.names.length, 'default microstrip: every number with an equation has its numbers');
  const later = (await scripts(page)).filter((u) => !first.includes(u));
  let katex = false;
  for (const u of later) if (/KaTeX parse error/.test(await textOf(page, u))) katex = true;
  check(katex, `KaTeX arrives with the panel (${later.length} scripts)`);

  // the derivation of Z0
  await page.click('[data-results] [data-eq-open="z0"]');
  const panel = page.locator('[data-eq-panel="z0-lc"]');
  await panel.waitFor();
  check(await page.evaluate(() => document.activeElement?.hasAttribute('data-eq-panel')), 'the opened panel has the focus');
  await panel.locator('[data-eq-derive]').click();
  const dlg = page.locator('dialog[data-derive="z0-lc"][open]');
  await dlg.waitFor({ timeout: 10000 });
  const n = EQ.EM_EQUATION_BY_ID.get('z0-lc').steps.length;
  const shown = async () => Number(await page.locator('dialog[data-derive]').getAttribute('data-derive-shown'));
  check(await shown() === 1 && await dlg.locator('[data-derive-step]').count() === 1, 'the derivation opens at its first step');
  check(await page.evaluate(() => document.activeElement?.hasAttribute('data-derive-next')), 'the focus is on Next step');
  await dlg.locator('[data-derive-next]').click();
  check(await shown() === 2 && await dlg.locator('[data-derive-step]').count() === 2, 'Next step shows the second step');
  await dlg.locator('[data-derive-back]').click();
  check(await shown() === 1, 'Back goes back to the first');
  await dlg.locator('[data-derive-all]').click();
  check(await shown() === n && await dlg.locator('[data-derive-step]').count() === n, `Show all shows the ${n} steps`);
  check(await dlg.locator('[data-derive-count]').textContent() === `Step ${n} of ${n}`, 'the count says so');
  check(await dlg.locator('[data-derive-nums]').count() === 0, 'Z0’s steps have no numbers (ω, β, V and I are not the result’s)');
  check(await dlg.locator('math').count() >= 2 * n, 'every step is maths');
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog[data-derive]:not([open])', { state: 'attached' });
  check(await page.evaluate(() => document.activeElement?.hasAttribute('data-eq-derive')), 'Escape closes the derivation and gives the focus back to Derivation');
  check(await panel.count() === 1, 'the panel stays open under the dialog');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-eq-panel]', { state: 'detached' });
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-eq-open') === 'z0'), 'a second Escape closes the panel and gives the focus back to the number');

  // a derivation with numbers: L from the vacuum capacitance (c₀, L and C₀ are all bound)
  await page.click('[data-results] [data-eq-open="L.1.1"]');
  await page.waitForSelector('[data-eq-panel="l-c0"]');
  await page.locator('[data-eq-derive]').click();
  await page.waitForSelector('dialog[data-derive="l-c0"][open]');
  await page.locator('[data-derive-all]').click();
  const nl = await page.locator('dialog[data-derive] [data-derive-nums]').count();
  check(nl >= 1 && await page.locator('dialog[data-derive] [data-derive-nums] math').count() >= 1, `L's steps with the shown result's numbers (${nl} of ${EQ.EM_EQUATION_BY_ID.get('l-c0').steps.length})`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog[data-derive]:not([open])', { state: 'attached' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-eq-panel]', { state: 'detached' });

  // an edit updates the panel
  await page.click('[data-results] [data-eq-open="z0"]');
  await panel.waitFor();
  const before = Number(await panel.locator('[data-eq-result]').getAttribute('data-v'));
  const w = page.locator('[data-field="trace.w"] input').first();
  await w.fill('0.2');
  await w.press('Enter');
  await page.waitForFunction((b) => {
    const r = document.querySelector('[data-eq-panel="z0-lc"] [data-eq-result]');
    const s = document.querySelector('[data-results]');
    return r && s && s.getAttribute('data-stale') === 'false' && s.getAttribute('data-state') === 'done' && Number(r.getAttribute('data-v')) !== b;
  }, before, { timeout: 60000 });
  const after = Number(await panel.locator('[data-eq-result]').getAttribute('data-v'));
  const shownZ = Number(await page.locator('[data-results] [data-eq-open="z0"]').getAttribute('data-v'));
  check(after !== before && rel(after, shownZ) <= 1e-12 && after < before, `a wider trace updates the panel (Z0 ${before.toFixed(3)} → ${after.toFixed(3)} Ω, the results' number)`);
  const binding = JSON.parse(await panel.getAttribute('data-eq-bind'));
  const z = CO.evaluate(EQ.EM_EQUATION_BY_ID.get('z0-lc').tree, binding);
  check(rel(z[z.length - 1][0], shownZ) <= 1e-9, 'and its binding still gives the engine\'s Z0 in Node');
  await page.keyboard.press('Escape');

  // keyboard: Tab to a number, Enter, Escape
  await page.goto(URL0);
  await page.waitForSelector('[data-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
  await page.locator('[data-results] h3').first().evaluate((e) => { e.tabIndex = -1; e.focus(); });
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.getAttribute('data-eq-open') === 'z0');
  }
  check(reached, 'Tab reaches the Z0 number');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-eq-panel="z0-lc"]');
  check(await page.evaluate(() => document.activeElement?.hasAttribute('data-eq-panel')), 'Enter opens its panel with the focus in it');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-eq-panel]', { state: 'detached' });
  check(await page.evaluate(() => document.activeElement?.getAttribute('data-eq-open') === 'z0'), 'Escape gives the focus back');

  // beside the results at 1440
  await page.click('[data-results] [data-eq-open="z0"]');
  await page.waitForSelector('[data-eq-panel="z0-lc"]');
  const bx = await page.evaluate(() => {
    const r = document.querySelector('[data-results]').getBoundingClientRect(), q = document.querySelector('[data-eq-panel]').getBoundingClientRect();
    return { rr: r.right, ql: q.left, rt: r.top, qt: q.top };
  });
  check(bx.ql >= bx.rr && Math.abs(bx.qt - bx.rt) < 4, `at 1440 px the panel is beside the results (${JSON.stringify(bx)})`);

  // ---- the default pair ----
  const pp = await open(urlOf(pairSetup()));
  await pp.click('[data-other-definitions] > summary');
  const pr = await numbers(pp, '[data-results]', ['zdiff', 'zcm', 'zodd', 'zeven', 'zdiffB', 'zcmB', 'ztdr', 'kb', 'kf', 'mode1.eeff', 'mode2.eeff']);
  check(pr.live === pr.names.length, 'default pair: every number with an equation has its numbers');
  await pp.close();

  // ---- the default via (C44) ----
  const vp = await open(`${URL0}#via`);
  await vp.waitForSelector('[data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
  const vr = await numbers(vp, '[data-via-results]', ['barrel-z', 'section-z', 'delay', 'L', 'C', 'dcsum', 'valid', 'band']);
  check(vr.live >= 8, `default via: at least 8 numbers with their numbers (${vr.live} of ${vr.names.length})`);
  check(!(await vp.locator('[data-via-results] [data-via-q="barrel-z"] [data-eq-open]').count() === 0), 'the barrel Z is a button');
  check(await vp.locator('[data-via-crossings] [data-eq-open]').count() === 0, 'ΔC per crossing has no equation of its own: not a button');

  // ---- touch at 390 ----
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'light' });
  const tp = await open(URL0, tctx);
  await tp.locator('[data-results] [data-eq-open="z0"]').tap();
  await tp.waitForSelector('[data-eq-panel="z0-lc"]');
  const below = await tp.evaluate(() => document.querySelector('[data-eq-panel]').getBoundingClientRect().top >= document.querySelector('[data-results]').getBoundingClientRect().bottom);
  check(below, 'at 390 px the panel is below the results');
  await tp.locator('[data-eq-derive]').tap();
  await tp.waitForSelector('dialog[data-derive="z0-lc"][open]');
  const dw = await tp.evaluate(() => document.querySelector('dialog[data-derive]').getBoundingClientRect().width);
  check(Math.abs(dw - 390) <= 1, `the derivation takes the whole width on a phone (${dw})`);
  await tp.locator('[data-derive-next]').tap();
  check(Number(await tp.locator('dialog[data-derive]').getAttribute('data-derive-shown')) === 2, 'a tap on Next step shows the second step');
  await tp.locator('[data-derive-close]').tap();
  await tp.waitForSelector('dialog[data-derive]:not([open])', { state: 'attached' });
  await tp.locator('[data-eq-close]').tap();
  await tp.waitForSelector('[data-eq-panel]', { state: 'detached' });
  check(true, 'taps close the dialog and the panel');
  await tctx.close();

  // ---- widths and themes ----
  const shrink = async (buf) => {
    const p = await ctx.newPage();
    const b64 = await p.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await p.close();
    return Buffer.from(b64, 'base64');
  };
  await page.click('[data-results] [data-eq-open="z0"]');
  await page.waitForSelector('[data-eq-panel="z0-lc"]');
  await page.addStyleTag({ content: 'header { visibility: hidden !important; }' });
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme}, panel open (${sw})`);
      if (shots && width !== 320) {
        const area = page.locator('[data-eq-layout]').first();
        await area.scrollIntoViewIfNeeded();
        writeFileSync(join(shots, `emsim-eq-panel-${width}-${scheme}.png`), await shrink(await area.screenshot()));
      }
      await page.locator('[data-eq-derive]').click();
      await page.waitForSelector('dialog[data-derive][open]');
      await page.locator('[data-derive-all]').click();
      await page.waitForTimeout(150);
      const sd = await page.evaluate(() => document.documentElement.scrollWidth);
      const inner = await page.evaluate(() => { const b = document.querySelector('[data-derive-body]'); return b.scrollWidth <= b.clientWidth + 1; });
      check(sd <= width && inner, `no horizontal scroll at ${width} px, ${scheme}, derivation open (page ${sd}, body fits: ${inner})`);
      if (shots && width !== 320) writeFileSync(join(shots, `emsim-eq-derive-${width}-${scheme}.png`), await shrink(await page.screenshot()));
      await page.keyboard.press('Escape');
      await page.waitForSelector('dialog[data-derive]:not([open])', { state: 'attached' });
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-equations: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
if (fails.length) process.exit(1);
