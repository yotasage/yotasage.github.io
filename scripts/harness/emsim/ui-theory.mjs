// The EM simulation page's Theory and References sections in the installed Edge (step M2.4c): the Theory chunk and
// KaTeX are not in the first load (no first-load script holds KaTeX's or the theory's text) and load when the nav's
// Theory link is followed; every topic and sub-anchor exists and the contents links reach them; every citation links
// to a References entry and the numbers follow the first citation on the page; the live equations equal
// lib/emsim/eqvalues.ts's emBinding in Node for the linked setup on the default microstrip and the default pair (at
// least 10 numbers from different equations each); a typed width updates the live numbers; the field figures draw;
// no horizontal scroll at 320/390/1440 in both themes; screenshots `emsim-theory-*` of two topics with equations and
// a figure at 390 and 1440 in both themes.
//   tsx ui-theory.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { chromium } from 'playwright-core';

import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedStructure from '../../../lib/emsim/structure.ts';
import * as importedCf from '../../../lib/emsim/closedform.ts';
import * as importedEv from '../../../lib/emsim/eqvalues.ts';

const d = (m) => m.default ?? m;
const LN = d(importedLines), LK = d(importedLink), SU = d(importedSetup), S = d(importedStackup), ST = d(importedStructure);
const CF = d(importedCf), EV = d(importedEv);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

const ANCHORS = ['how-to-use', 'transmission-lines', 'field-solver', 'pairs', 'pair-definitions', 'coupling', 'two-speeds',
  'structures', 'trapezoid', 'solder-mask', 'coplanar-ground', 'copper-thickness', 'calculators', 'closed-forms',
  'jlcpcb-calculator', 'tolerances', 'references'];

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const rel = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300));
const linked = (p) => LK.decodeLink(new URL(p.url()).search).setup;
const urlOf = (s) => `${URL0}?${LK.encodeLink(s)}`;
const pairSetup = () => { const s = SU.defaultSetup(); s.trace = { ...ST.presetStructure('pair-microstrip', s.stackup, 0.11), s: S.val(0.2) }; return s; };

// Node's numbers for a setup, as Theory.tsx builds them (the page solves with the worker's default options).
function nodeBinding(s) {
  const r = LN.solveSetup(s);
  const cf = CF.closedForms(s);
  const key = r.n === 2 ? 'zdiff' : 'z0';
  const field = r.n === 2 ? r.pair?.zdiff.v : r.lines[0]?.z0.v;
  const f = r.n <= 2 ? cf.results.find((x) => x.values[key] !== undefined) : undefined;
  return EV.emBinding({ result: r, kind: s.trace.kind, reduced: cf.reduced, formula: f && field !== undefined ? { value: f.values[key], field } : undefined });
}

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const scripts = () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'script' || e.name.endsWith('.js')).map((e) => e.name));
  const textOf = (u) => page.evaluate(async (x) => (await fetch(x)).text(), u);
  const solved = async () => { await page.waitForTimeout(30); await page.waitForSelector('[data-results]:not([data-stale="true"])', { timeout: 30000 }); };

  // ---- the first load: no theory, no KaTeX ----
  await page.goto(URL0);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved();
  const first = await scripts();
  let inFirst = [];
  for (const u of first) {
    const t = await textOf(u);
    if (/KaTeX parse error|Telegrapher|Kirschning and Jansen’s coupled/.test(t)) inFirst.push(u);
  }
  check((await page.locator('#theory').getAttribute('data-loaded')) === 'false' && (await page.locator('[data-theory]').count()) === 0, 'theory not loaded before it is near');
  check(inFirst.length === 0, `no first-load script holds KaTeX or the theory (${inFirst.join(', ')})`);

  // ---- loaded by the nav's link ----
  await page.click('nav[aria-label="Sections"] a[href="#theory"]');
  await page.waitForSelector('[data-theory]', { timeout: 30000 });
  const later = (await scripts()).filter((u) => !first.includes(u));
  let gz = 0, hasKatex = false;
  for (const u of later) { const t = await textOf(u); gz += gzipSync(t, { level: 9 }).length; if (/KaTeX parse error/.test(t)) hasKatex = true; }
  check(hasKatex, `KaTeX arrives with the theory (${later.length} scripts, ${(gz / 1000).toFixed(1)} kB gzip)`);
  console.log(`theory chunks: ${later.length} scripts, ${(gz / 1000).toFixed(1)} kB gzip (with KaTeX and the equations)`);

  // ---- anchors and contents ----
  for (const id of ANCHORS) check(await page.locator(`[id="${id}"]`).count() === 1, `anchor #${id} exists`);
  const hrefs = await page.$$eval('[data-theory-contents] a', (as) => as.map((a) => a.getAttribute('href')));
  check(hrefs.length === ANCHORS.length - 1, `contents has ${hrefs.length} links`);
  check((await page.evaluate((hs) => hs.every((h) => !!document.getElementById(h.slice(1))), hrefs)), 'every contents link has its target');
  for (const id of ['coupling', 'jlcpcb-calculator', 'tolerances']) {
    await page.click(`[data-theory-contents] a[href="#${id}"]`);
    await page.waitForTimeout(150);
    const top = await page.evaluate((x) => document.getElementById(x).getBoundingClientRect().top, id);
    check(top >= 0 && top < 160, `contents link reaches #${id} (top ${top.toFixed(0)} px)`);
  }

  // ---- citations: every one resolves, numbered by first citation ----
  const cites = await page.$$eval('[data-theory] [data-cite]', (as) => as.map((a) => ({ key: a.getAttribute('data-cite'), href: a.getAttribute('href'), n: Number(/\[(\d+)/.exec(a.textContent)[1]) })));
  const refs = await page.$$eval('[data-references] li', (ls) => ls.map((l) => l.id));
  const order = [];
  for (const c of cites) if (!order.includes(c.key)) order.push(c.key);
  check(cites.length >= 40, `${cites.length} citations in the theory`);
  check(cites.every((c) => c.href === `#ref-${c.key}` && refs.includes(`ref-${c.key}`)), 'every citation links to its References entry');
  check(cites.every((c) => c.n === order.indexOf(c.key) + 1), 'citations numbered by first citation');
  check(refs.length === order.length && refs.every((id, i) => id === `ref-${order[i]}`), `References lists the ${refs.length} cited sources in that order`);

  // ---- live numbers against Node ----
  const liveCheck = async (what, s, want) => {
    const b = nodeBinding(s);
    const got = await page.$$eval('[data-eq][data-live="true"] [data-sym][data-v]', (es) => es.map((e) => ({ id: e.closest('[data-eq]').getAttribute('data-eq'), sym: e.getAttribute('data-sym'), v: Number(e.getAttribute('data-v')) })));
    const ids = new Set(got.map((g) => g.id));
    let worst = 0, bad = [];
    for (const g of got) { const x = Math.abs(g.v - b[g.sym]) < 1e-12 ? 0 : rel(g.v, b[g.sym]); worst = Math.max(worst, x); if (!(x <= 1e-9)) bad.push(`${g.id}:${g.sym} ${g.v} vs ${b[g.sym]}`); }
    check(bad.length === 0, `${what}: ${got.length} live numbers of ${ids.size} equations equal Node (worst ${worst.toExponential(1)}) ${bad.slice(0, 4).join('; ')}`);
    check(ids.size >= 10, `${what}: at least 10 live equations (${[...ids].join(', ')})`);
    for (const id of want) check(ids.has(id), `${what}: ${id} is live`);
    return got;
  };
  await page.waitForSelector('[data-eq="z0-lc"][data-live="true"]', { timeout: 30000 });
  await liveCheck('default microstrip', linked(page), ['z0-lc', 'delay-lc', 'eeff-c', 'l-c0', 'v-eeff', 'lambda-eeff', 'getsinger', 'getsinger-limit', 'order', 'pct-diff']);
  for (const id of ['zodd-sym', 'kb', 'sens', 'parts-sum']) check((await page.locator(`[data-eq="${id}"]`).getAttribute('data-live')) === 'false', `default microstrip: ${id} printed without numbers`);
  const nowV = async () => Number(await page.locator('[data-theory-now] [data-v]').getAttribute('data-v'));
  const z1 = await nowV();
  check(rel(z1, LN.solveSetup(linked(page)).lines[0].z0.v) < 1e-12, `"your structure now" ${z1} equals Node`);

  // a typed width updates the live numbers
  const wIn = page.locator('[data-field="trace.w"] input').first();
  await wIn.fill('0.2');
  await wIn.press('Tab');
  await solved();
  let z2 = z1;
  for (let i = 0; i < 50 && z2 === z1; i++) { await page.waitForTimeout(100); z2 = await nowV(); }
  check(z2 !== z1 && rel(z2, LN.solveSetup(linked(page)).lines[0].z0.v) < 1e-12, `a typed width updates the theory (${z1} → ${z2})`);
  await liveCheck('microstrip 0.2 mm', linked(page), ['z0-lc', 'getsinger']);

  // the default pair, opened by a link into the theory
  await page.goto(`${urlOf(pairSetup())}#pairs`);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await page.waitForSelector('[data-eq="zodd-sym"][data-live="true"]', { timeout: 30000 });
  const top = await page.evaluate(() => document.getElementById('pairs').getBoundingClientRect().top);
  check(top >= 0 && top < 160, `a link to #pairs opens the theory there (top ${top.toFixed(0)} px)`);
  await liveCheck('default pair', linked(page), ['zodd-sym', 'zeven-sym', 'zdiff-zodd', 'zdd-zc', 'zcc-zc', 'zdiff-b', 'ztdr', 'kb', 'kf', 'fext-pulse', 'eeff-mode', 'mode-skew']);
  check((await page.locator('[data-eq="z0-lc"]').getAttribute('data-live')) === 'false', 'default pair: z0-lc printed without numbers');

  // ---- the figures draw (scrolled through so each mounts) ----
  await page.goto(URL0);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await page.click('nav[aria-label="Sections"] a[href="#theory"]');
  await page.waitForSelector('[data-theory]', { timeout: 30000 });
  for (const f of ['field-lines', 'pair-modes', 'mask']) {
    await page.locator(`[data-figure="${f}"]`).scrollIntoViewIfNeeded();
    let states = [];
    for (let i = 0; i < 120; i++) {
      states = await page.$$eval(`[data-figure="${f}"] [data-field-state]`, (es) => es.map((e) => e.getAttribute('data-field-state')));
      if (states.length && states.every((x) => x === 'done')) break;
      await page.waitForTimeout(250);
    }
    check(states.length >= 1 && states.every((x) => x === 'done'), `figure ${f} drawn (${states.join(', ')})`);
  }
  for (const f of ['ladder', 'parts', 'ranking']) check(await page.locator(`[data-figure="${f}"] svg`).count() >= 1, `figure ${f} present`);
  check((await page.locator('[data-figure="parts"] [data-bar]').count()) === 5, 'the parts figure has four parts and the sum');

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
  // the pair's page for its topic's screenshots (live numbers); the bar is hidden so it does not cover an element shot
  const pp = await ctx.newPage();
  pp.on('pageerror', (e) => errors.push(String(e)));
  await pp.goto(`${urlOf(pairSetup())}#pair-definitions`);
  await pp.waitForSelector('[data-eq="zodd-sym"][data-live="true"]', { timeout: 30000 });
  for (const p of [page, pp]) await p.addStyleTag({ content: 'header { visibility: hidden !important; }' });
  const shoot = async (p, id, width, scheme) => {
    const el = p.locator(`[id="${id}"]`);
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    for (let i = 0; i < 120; i++) {
      const st = await el.evaluate((e) => [...e.querySelectorAll('[data-field-state]')].map((x) => x.getAttribute('data-field-state')));
      if (st.every((x) => x === 'done')) break;
      await p.waitForTimeout(250);
    }
    writeFileSync(join(shots, `emsim-theory-${id}-${width}-${scheme}.png`), await shrink(await el.screenshot()));
  };
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await pp.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme}, theory open (${sw})`);
      if (shots && width !== 320) {
        await shoot(page, 'transmission-lines', width, scheme);
        await pp.setViewportSize({ width, height: 900 });
        await shoot(pp, 'pair-definitions', width, scheme);
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-theory: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
