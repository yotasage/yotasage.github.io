// The EM simulation page's short lines in the installed Edge (step M2.4d; components/EmSim/whys.ts, Why.tsx, from
// docs/em-sim/theory-lines.md). Every key of whys.ts is on the page exactly once, with its text and its link, in the
// states that show it (the default microstrip with the picker, the fields and all four tools open; a pair with the
// field drive on one line; the pair as a general structure, unequal, then three traces, with the Calculators; a
// broadside pair; a coplanar line with ground; a stripline pair, whose modes are not resolved; a link with an unknown
// unit and a mask εr under 1; a plane above below the trace; the Via section's default via and pair (M3.1a); the
// owner's KiCad board and project where they are), and
// no key is left unseen. The links: one of every topic followed by mouse (the theory loads, the topic is the target, in
// view and highlighted; a second click replays the highlight), the Calculators panel's links likewise, by keyboard
// (Tab reaches a link, Enter follows it) and by touch at 390 px. The bar's switch hides and shows every line and is
// remembered. No horizontal scroll at 320/390/1440 in both themes; screenshots `emsim-why-trace-*` of the Trace section.
//   tsx ui-why.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedStructure from '../../../lib/emsim/structure.ts';
import * as importedWhys from '../../../components/EmSim/whys.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), S = d(importedStackup), ST = d(importedStructure);
const { WHYS, TOPIC_TITLE } = d(importedWhys);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const PCB = 'E:/OneDrive - NTNU/ULDAC/PCB';
const CARRIER = [`${PCB}/ARTI-CARRIER-PICO2/ARTI-CARRIER-PICO2.kicad_pcb`, `${PCB}/ARTI-CARRIER-PICO2/ARTI-CARRIER-PICO2.kicad_pro`];
const KICAD_KEYS = ['kicad-board', 'net-classes'];

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const urlOf = (s) => `${URL0}?${LK.encodeLink(s)}`;
const withTrace = (kind, w) => { const s = SU.defaultSetup(); s.trace = ST.presetStructure(kind, s.stackup, w); return s; };
const pairSetup = () => { const s = withTrace('pair-microstrip', 0.11); s.trace = { ...s.trace, s: S.val(0.2) }; return s; };

// ---- the data ----
const keys = Object.keys(WHYS);
check(keys.length === 196, `${keys.length} short lines (195 of theory-lines.md and the switch's own)`);
check(keys.every((k) => WHYS[k].text && WHYS[k].label && (WHYS[k].topic === null || TOPIC_TITLE[WHYS[k].topic])), 'every line has a label, a text and a known topic or none');
check(keys.every((k) => WHYS[k].text.split(/\s+/).length <= 22), 'every line at most about 20 words');
const fullText = (k) => `${WHYS[k].text}${WHYS[k].topic ? ' → theory' : ''}`;

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const open = async (url) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await solved(p);
    return p;
  };
  const solved = async (p) => { await p.waitForTimeout(40); await p.waitForSelector('[data-results]:not([data-stale="true"])', { timeout: 60000 }); };
  const seen = new Map(); // key → the state it was first seen in
  const lines = (p) => p.$$eval('[data-why]', (es) => es.map((e) => ({ k: e.getAttribute('data-why'), t: e.textContent.replace(/\u00a0/g, ' '), href: e.querySelector('a')?.getAttribute('href') ?? null })));
  const state = async (p, what, want = []) => {
    const got = await lines(p);
    const n = new Map();
    for (const g of got) n.set(g.k, (n.get(g.k) ?? 0) + 1);
    const twice = [...n].filter(([, c]) => c > 1).map(([k]) => k);
    check(twice.length === 0, `${what}: no line twice (${twice.join(', ')})`);
    const unknown = got.filter((g) => !WHYS[g.k]).map((g) => g.k);
    check(unknown.length === 0, `${what}: no unknown key (${unknown.join(', ')})`);
    const wrong = got.filter((g) => WHYS[g.k] && !(g.t === fullText(g.k) || g.t === `${WHYS[g.k].label}: ${fullText(g.k)}`)).map((g) => `${g.k}: "${g.t}"`);
    check(wrong.length === 0, `${what}: every line says what was written (${wrong.slice(0, 3).join('; ')})`);
    const badLink = got.filter((g) => WHYS[g.k] && g.href !== (WHYS[g.k].topic ? `#${WHYS[g.k].topic}` : null)).map((g) => g.k);
    check(badLink.length === 0, `${what}: every link points at its topic, lines without a topic have none (${badLink.join(', ')})`);
    const missing = want.filter((k) => !n.has(k));
    check(missing.length === 0, `${what}: ${want.length} expected lines there (missing ${missing.join(', ')})`);
    for (const g of got) if (!seen.has(g.k)) seen.set(g.k, what);
    console.log(`  ${what}: ${got.length} lines`);
  };
  const tool = async (p, k) => {
    await p.click(`[data-tool-tab="${k}"]`);
    await p.waitForSelector(`[data-tool="${k}"]`, { timeout: 30000 });
  };
  const fieldsOn = async (p) => { await p.check('[data-field-on]'); await p.waitForSelector('[data-field-qty]'); };

  // ---- 1: the default microstrip, picker, fields and every tool open ----
  const page = await open(URL0);
  await page.click('[data-jlc-open]');
  await page.waitForSelector('[data-jlc-picker][data-loaded="true"]', { timeout: 30000 });
  await fieldsOn(page);
  for (const k of ['target', 'sweep', 'tolerance', 'calc']) await tool(page, k);
  await page.click('[data-eq-open="z0"]');
  await page.waitForSelector('[data-eq-panel="z0-lc"] [data-eq-derive]', { timeout: 30000 });
  await state(page, 'default microstrip', ['eq-open', 'eq-derive', 'status', 'home', 'nav', 'undo', 'whys', 'theme', 'units', 'digits', 'copy-link', 'preset', 'jlc-open', 'kicad',
    'summary', 'stackup-drawing', 'stackup-widen', 'diel-t', 'er', 'tand', 'er-freq', 'cu-t', 'calc-t', 'etch', 'mask-laminate', 'mask-copper',
    'mask-between', 'mask-er', 'tol', 'src', 'sources', 'jlc-filter', 'jlc-withdrawn', 'jlc-row', 'structure', 'to-general', 'class-structure',
    'trace-view', 'handles', 'trace-reset', 'trace-widen', 'layer', 'plane', 'width', 'masked', 'field-on', 'field-qty', 'field-scale-kind',
    'probe-keys', 'field-scale', 'probe', 'z0', 'eeff', 'delay', 'err', 'solve-status', 'quick', 'matrices', 'tools', 'target-key',
    'target-vary', 'target-input', 'target-result', 'target-use', 'sweep-input', 'sweep-range', 'sweep-outs', 'plot', 'plot-cursor',
    'sweep-table', 'cancel', 'tol-note', 'tol-corners', 'mc', 'mc-stats', 'rank', 'calc-field', 'calc-jlc', 'calc-stated', 'calc-use',
    'calc-parts', 'calc-reduced', 'cf', 'calc-kj', 'calc-neglect']);

  // ---- 2: the pair, one line driven; then as general, unequal, then three traces, with the Calculators ----
  const pp = await open(urlOf(pairSetup()));
  await fieldsOn(pp);
  await pp.selectOption('[data-field-drive]', 'line');
  await pp.waitForSelector('[data-field-line]');
  await state(pp, 'pair', ['gap', 'zdiff', 'zcm', 'zodd', 'zeven', 'modes', 'zdiff-b', 'ztdr', 'kb', 'kf', 'zc-kk', 'field-drive', 'field-line']);
  await pp.click('[data-trace-to-general]');
  await pp.waitForSelector('[data-gen-editor]');
  const w2 = pp.locator('[data-field="gen.sig.1.w"] input').first();
  await w2.fill('0.15');
  await w2.press('Enter');
  await pp.waitForSelector('[data-q="zdc"]', { timeout: 60000 });
  await solved(pp);
  await state(pp, 'unequal pair as general', ['gen-layer', 'gen-add', 'gen-remove', 'gen-position', 'width', 'gen-edges', 'zdc']);
  await pp.click('[data-gen-add="signal"]');
  await pp.waitForSelector('[data-results][data-n="3"]', { timeout: 60000 });
  await solved(pp);
  await tool(pp, 'calc');
  await state(pp, 'three traces', ['lines-each', 'modes', 'calc-none']);
  await pp.close();

  // ---- 3: broadside, coplanar with ground, stripline pair, issues ----
  const one = async (s, what, want, suffix = '') => { const p = await open(urlOf(s) + suffix); await state(p, what, want); await p.close(); };
  await one(withTrace('broadside'), 'broadside pair', ['layer2', 'offset']);
  await one(withTrace('cpwg'), 'coplanar with ground', ['ground-gap', 'ground-width']);
  await one(withTrace('pair-stripline'), 'stripline pair', ['flags']);
  const bad = SU.defaultSetup();
  const mask = bad.stackup.layers.find((l) => l.kind === 'mask');
  mask.er = { ...mask.er, v: 0.5 };
  await one(bad, 'unknown unit, mask εr 0.5', ['link-issues', 'stackup-issues'], '&u=furlong');
  const above = SU.defaultSetup();
  above.trace = { ...above.trace, above: above.trace.below };
  await one(above, 'plane above below the trace', ['structure-issues']);
  // ---- 4: the Via section (M3.1a): the default via with its issues, then the pair ----
  const vp = await open(`${URL0}#via`);
  await vp.waitForSelector('[data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
  await state(vp, 'default via', ['via-kind', 'via-preset', 'via-use-trace', 'via-barrel', 'via-signal', 'via-drill', 'via-plating', 'via-layer-table',
    'via-pad', 'via-plane', 'via-antipad', 'via-shape', 'via-antipad-all', 'via-returns', 'via-return-add', 'via-return-remove', 'via-return-planes',
    'via-backdrill', 'via-feeds', 'via-side', 'via-top', 'via-handles', 'via-reset', 'via-add-tap', 'via-remove-sel', 'via-issues', 'via-solve', 'via-barrel-z', 'via-section-z', 'via-delay', 'via-lc',
    'via-segments', 'via-crossings', 'via-stubs', 'via-feed-z', 'via-valid', 'via-flags', 'via-assumptions', 'via-next',
    'eq-via-open', 'via-tdr', 'via-tr', 'via-port', 'via-tdt', 'via-s', 'via-s-ports', 'via-cursor', 'via-fields', 'via-target', 'via-target-vary', 'via-target-use']);
  await vp.click('[data-via-preset="pair"]');
  await vp.waitForSelector('[data-via-results][data-n="2"]:not([data-stale="true"])', { timeout: 60000 });
  await vp.waitForSelector('[data-via-plots][data-stale="false"] [data-via-s-mode]', { timeout: 60000 });
  await state(vp, 'via pair', ['via-pitch', 'via-tdr-mode', 'via-s-mode']);
  await vp.check('[data-viafield-on]');
  await vp.waitForSelector('[data-viafield-qty]');
  await state(vp, 'via fields', ['via-field-qty', 'via-field-drive', 'via-field-scale', 'via-field-probe-keys', 'via-field-probe', 'via-field-side']);
  await vp.close();
  // ---- 5: the Export section (M8.1b) ----
  const ep = await open(`${URL0}#export`);
  await ep.waitForSelector('[data-export-ready] [data-export-preview]', { timeout: 30000 });
  await state(ep, 'export', ['export-figure', 'export-size', 'export-colour', 'export-format', 'export-scale', 'export-name', 'export-copy', 'export-save', 'export-preview', 'data-set', 'data-format', 'data-numbers', 'data-copy', 'data-save', 'project-save', 'project-open', 'project-link']);
  await ep.close();
  let kicadSeen = false;
  if (CARRIER.every(existsSync)) {
    const p = await open(URL0);
    await p.locator('[data-kicad-input]').setInputFiles(CARRIER);
    await p.waitForSelector('[data-stackup-summary][data-source="kicad"]', { timeout: 30000 });
    await p.waitForSelector('[data-kicad-project]', { timeout: 30000 });
    await state(p, 'KiCad board and project', KICAD_KEYS);
    await p.close();
    kicadSeen = true;
  } else console.log(`NOTE ${CARRIER[0]} not found: the KiCad lines are not checked`);
  const unseen = keys.filter((k) => !seen.has(k) && (kicadSeen || !KICAD_KEYS.includes(k)));
  check(unseen.length === 0, `every line of whys.ts seen on the page (${seen.size} of ${keys.length}; unseen ${unseen.join(', ')})`);

  // ---- the links: one of every topic by mouse ----
  const reached = async (p, topic, what) => {
    let r = null;
    for (let i = 0; i < 120; i++) {
      r = await p.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const top = el.getBoundingClientRect().top;
        return { top, target: el.matches(':target'), anim: el.getAnimations().length, hash: location.hash };
      }, topic);
      if (r && r.target && r.top >= -2 && r.top < 220) break;
      await p.waitForTimeout(125);
    }
    check(!!r && r.hash === `#${topic}` && r.target && r.top >= -2 && r.top < 220 && r.anim > 0, `${what} reaches #${topic}: in view and highlighted (${JSON.stringify(r)})`);
  };
  const visibleLinks = await page.$$eval('[data-why-link]', (as) => as.filter((a) => a.offsetParent !== null).map((a) => ({ k: a.getAttribute('data-why-link'), href: a.getAttribute('href') })));
  const byTopic = new Map();
  for (const l of visibleLinks) if (!byTopic.has(l.href)) byTopic.set(l.href, l.k);
  check(byTopic.size >= 10, `${byTopic.size} topics among the visible lines' links`);
  let first = true;
  for (const [href, k] of byTopic) {
    await page.locator(`[data-why-link="${k}"]`).click();
    if (first) { await page.waitForSelector('#theory[data-loaded="true"]', { timeout: 30000 }); first = false; }
    await reached(page, href.slice(1), `the line ${k}'s link`);
  }
  check(await page.evaluate((ids) => ids.every((id) => !!document.getElementById(id)), Object.keys(TOPIC_TITLE)), 'every topic a line can link to exists in the theory');
  // a second click of the same link replays the highlight
  const [lastHref, lastK] = [...byTopic].pop();
  await page.evaluate((id) => { const el = document.getElementById(id); el.getAnimations().forEach((a) => a.finish()); }, lastHref.slice(1));
  await page.locator(`[data-why-link="${lastK}"]`).click();
  await page.waitForTimeout(100);
  check(await page.evaluate((id) => document.getElementById(id).getAnimations().length > 0, lastHref.slice(1)), `a second click of ${lastK}'s link replays the highlight`);

  // ---- the Calculators panel's links (on the pair: the Kirschning–Jansen note and the copper sentence too) ----
  const cp = await open(urlOf(pairSetup()));
  await tool(cp, 'calc');
  await cp.waitForSelector('[data-calc-kj]', { timeout: 60000 });
  const calcLinks = await cp.$$eval('[data-calc-link]', (as) => [...new Set(as.map((a) => a.getAttribute('data-calc-link')))]);
  const wantCalc = ['solder-mask', 'trapezoid', 'field-solver', 'copper-thickness', 'closed-forms'];
  check(wantCalc.every((t) => calcLinks.includes(t)), `the Calculators panel links to ${wantCalc.join(', ')} (${calcLinks.join(', ')})`);
  check(await cp.locator('[data-calc-kj] [data-calc-link="copper-thickness"]').count() === 1 && await cp.locator('[data-calc-reduced] [data-calc-link="field-solver"]').count() === 1
    && await cp.locator('[data-cf-range] [data-calc-link="closed-forms"]').count() >= 1, 'the links sit in the Kirschning–Jansen note, the reduction paragraph and the ranges');
  for (const t of calcLinks) {
    await cp.locator(`[data-calc-link="${t}"]`).first().click();
    await reached(cp, t, `the Calculators link`);
  }
  await cp.close();

  // ---- keyboard: Tab reaches a line's link, Enter follows it ----
  const kp = await open(URL0);
  await kp.focus('[data-copy-link]');
  let k = null;
  for (let i = 0; i < 40 && !k; i++) {
    await kp.keyboard.press('Tab');
    k = await kp.evaluate(() => document.activeElement?.getAttribute('data-why-link') ?? null);
  }
  check(!!k, `Tab from Copy link reaches a line's link (${k})`);
  if (k) {
    await kp.keyboard.press('Enter');
    await reached(kp, WHYS[k].topic, `Enter on ${k}'s link`);
  }

  // ---- the switch: hides and shows every line, remembered ----
  const visible = (p) => p.$$eval('[data-why]', (es) => es.filter((e) => e.offsetParent !== null).length);
  check(await visible(kp) > 40 && (await kp.getAttribute('[data-whys-toggle]', 'aria-pressed')) === 'true', 'the lines are shown by default');
  await kp.click('[data-whys-toggle]');
  check(await visible(kp) === 0 && (await kp.getAttribute('[data-whys-toggle]', 'aria-pressed')) === 'false', 'the switch hides every line');
  await kp.reload();
  await kp.waitForSelector('[data-ready="true"]');
  await kp.waitForTimeout(100);
  check(await visible(kp) === 0 && (await kp.getAttribute('[data-whys]', 'data-whys')) === 'off', 'hidden lines stay hidden after a reload');
  await kp.click('[data-whys-toggle]');
  check(await visible(kp) > 40, 'the switch shows them again');
  await kp.reload();
  await kp.waitForSelector('[data-ready="true"]');
  await kp.waitForTimeout(100);
  check(await visible(kp) > 40 && await kp.evaluate(() => localStorage.getItem('emsim.whys')) === null, 'shown again after a reload (nothing stored)');
  await kp.close();

  // ---- touch at 390 px ----
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'dark' });
  const tp = await tctx.newPage();
  tp.on('pageerror', (e) => errors.push(String(e)));
  await tp.goto(URL0);
  await tp.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved(tp);
  await tp.locator('[data-why-link="width"]').scrollIntoViewIfNeeded();
  await tp.locator('[data-why-link="width"]').tap();
  await reached(tp, 'trapezoid', 'a tap on the width line\'s link');
  await tctx.close();

  // ---- widths, themes, screenshots of the Trace section ----
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
  const sp = await open(URL0);
  await sp.click('[data-jlc-open]');
  await sp.waitForSelector('[data-jlc-picker][data-loaded="true"]', { timeout: 30000 });
  await fieldsOn(sp);
  for (const t of ['target', 'tolerance', 'calc']) await tool(sp, t);
  await sp.addStyleTag({ content: 'header { visibility: hidden !important; }' });
  for (const scheme of ['light', 'dark']) {
    await sp.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await sp.setViewportSize({ width, height: 900 });
      await sp.waitForTimeout(250);
      const sw = await sp.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme}, lines shown (${sw})`);
      if (shots && width !== 320) {
        await sp.click(`[data-tool-tab="calc"]`); // closes the tool: the Trace section without the panel
        const el = sp.locator('#trace');
        await el.scrollIntoViewIfNeeded();
        await sp.waitForTimeout(400);
        writeFileSync(join(shots, `emsim-why-trace-${width}-${scheme}.png`), await shrink(await el.screenshot()));
        await sp.click(`[data-tool-tab="calc"]`);
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-why: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
if (fails.length) process.exit(1);
