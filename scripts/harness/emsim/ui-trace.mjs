// The EM simulation page's Trace section in the installed Edge (step M2.1b): the default (C39 on the 3313A preset,
// 51.50 ± 0.05 Ω) solved in the worker; every structure preset opens with a finite result and an error, equal to the
// engine's own solve of the same setup in Node (lines.ts solveSetup); the owner's 50R_SE (carrier) and LVDS_100R
// (mezzanine) opened from their .kicad_pro as structures on the preset (C39 51.50, C41 103.36 Ω) and on their own
// boards' stackups as read (51.37 and 103.64 Ω; facts-cases.md C39/C41; skipped with a note if the files are missing);
// a typed width (the stale state seen, then the engine's new value), undo, a refusal, the link round trip in a fresh
// context, the keyboard (kind by arrow key, details by Enter) and touch (a tap opens the matrices); the matrices'
// size; no horizontal scroll at 320, 390 and 1440 px in both themes and screenshots at 390 and 1440 px (downscaled to
// at most 1000 px wide).
//   tsx ui-trace.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedPresets from '../../../lib/emsim/presets.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStructure from '../../../lib/emsim/structure.ts';
import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedKicad from '../../../lib/emsim/kicad.ts';
import * as importedTrace from '../../../components/EmSim/trace.ts';

const P = importedPresets.default ?? importedPresets;
const ST = importedSetup.default ?? importedSetup;
const STR = importedStructure.default ?? importedStructure;
const LN = importedLines.default ?? importedLines;
const K = importedKicad.default ?? importedKicad;
const T = importedTrace.default ?? importedTrace;

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
const PCB = 'E:/OneDrive - NTNU/ULDAC/PCB';
const CARRIER = [`${PCB}/ARTI-CARRIER-PICO2/ARTI-CARRIER-PICO2.kicad_pcb`, `${PCB}/ARTI-CARRIER-PICO2/ARTI-CARRIER-PICO2.kicad_pro`];
const MEZZ = [`${PCB}/2026_ARTIFICER_TC1/2026_ARTIFICER_TC1.kicad_pcb`, `${PCB}/2026_ARTIFICER_TC1/2026_ARTIFICER_TC1.kicad_pro`];

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const same = (a, b) => Math.abs(Number(a) - b) <= 1e-9 * Math.max(1, Math.abs(b));

// The engine's main value of a setup: Z0 of one line, Zdiff of a pair.
const engine = (setup) => {
  const r = LN.solveSetup(setup);
  if (!r.ok) return { ok: false, reason: r.reason };
  const q = r.n === 2 ? r.pair.zdiff : r.lines[0].z0;
  return { ok: true, key: r.n === 2 ? 'zdiff' : 'z0', v: q.v, e: q.e };
};

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  const results = (p = page) => p.locator('[data-results]');
  // Settled: the newest solve is in (the stale mark is set in the same task as the edit, so it is never missed).
  const solved = async (p = page) => {
    await p.waitForTimeout(30);
    await p.waitForSelector('[data-results]:not([data-stale="true"])', { timeout: 30000 });
  };
  const shown = async (key, p = page) => {
    const el = p.locator(`[data-results] [data-q="${key}"]`);
    if (!(await el.count())) return null;
    return { v: Number(await el.getAttribute('data-v')), e: Number(await el.getAttribute('data-e')), text: (await el.locator('dd').innerText()).replace(/\s+/g, ' ') };
  };
  const matches = async (setup, what, p = page) => {
    const x = engine(setup);
    if (!x.ok) { check(false, `${what}: the engine refuses (${x.reason})`); return null; }
    const s = await shown(x.key, p);
    check(s && same(s.v, x.v) && same(s.e, x.e) && Number.isFinite(s.v) && s.e > 0, `${what}: ${x.key} ${s?.v} ± ${s?.e} equals the engine's ${x.v} ± ${x.e}`);
    return s;
  };

  // ---- the default: C39 on the 3313A preset, in the worker ----
  await page.goto(URL0);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved();
  let cur = ST.defaultSetup();
  const d = await matches(cur, 'default C39');
  check(d && Math.abs(d.v - 51.50) <= 0.005 && d.e <= 0.06 && d.text.startsWith('51.50 ± 0.05'), `C39 on the preset shows 51.50 ± 0.05 Ω (${d?.text})`);
  check(await results().getAttribute('data-where') === 'worker', `solved in the worker (${await results().getAttribute('data-where')})`);
  check(await page.locator('[data-trace-drawing] svg polygon[data-conductor]').count() === 1 && await page.locator('[data-plane="below"]').count() === 1, 'drawing: one conductor and the plane below');
  check(await page.locator('nav a[href="#trace"]').count() === 1, 'section link in the nav');

  // ---- every preset ----
  for (const k of T.KINDS) {
    const next = T.withKind(cur.trace, cur.stackup, k.kind);
    if (!next) { check(false, `${k.kind}: no preset on the default stackup`); continue; }
    await page.selectOption('[data-trace-kind]', k.kind);
    await solved();
    cur = { ...cur, trace: next };
    const s = await matches(cur, `preset ${k.kind}`);
    const n = Number(await results().getAttribute('data-n'));
    const conductors = Number(await page.locator('[data-trace-drawing]').getAttribute('data-conductors'));
    check(n === k.signals && conductors >= k.signals && (await page.locator('[data-trace-controls]').getAttribute('data-kind')) === k.kind, `preset ${k.kind}: ${n} lines, ${conductors} conductors drawn`);
    check(s && / ± /.test(s.text), `preset ${k.kind} shows its error (${s?.text})`);
  }

  // ---- typing a width: the stale state, then the engine's value; undo; a refusal ----
  await page.selectOption('[data-trace-kind]', 'pair-microstrip');
  await solved();
  cur = { ...cur, trace: T.withKind(cur.trace, cur.stackup, 'pair-microstrip') };
  const before = await shown('zdiff');
  await page.evaluate(() => {
    const el = document.querySelector('[data-results]');
    window.__stale = 0;
    new MutationObserver(() => { if (el.getAttribute('data-stale') === 'true') window.__stale++; }).observe(el, { attributes: true, attributeFilter: ['data-stale'] });
  });
  const w = page.locator('[data-field="trace.w"] input').first();
  await w.fill('0.15');
  await solved();
  check(await page.evaluate(() => window.__stale) > 0, 'typing a width: the stale state was shown');
  cur = { ...cur, trace: { ...cur.trace, w: { ...cur.trace.w, v: 0.15, src: { kind: 'typed' } } } };
  const typed = await matches(cur, 'typed width 0.15');
  check(typed && before && typed.v < before.v, `a wider trace lowers Zdiff (${before?.v} → ${typed?.v})`);
  await w.fill('0.15x');
  check(await page.locator('[data-field="trace.w"] [role="alert"]').count() === 1, 'unreadable width refused with its reason');
  await w.press('Escape');
  await w.blur();

  // ---- the link round trip ----
  const url = page.url();
  const ctx2 = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(url);
  await p2.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved(p2);
  const back = await shown('zdiff', p2);
  check(back && typed && back.v === typed.v && (await p2.locator('[data-trace-controls]').getAttribute('data-kind')) === 'pair-microstrip' && (await p2.locator('[data-field="trace.w"] input').first().inputValue()) === '0.15', `link round trip (${back?.v})`);
  await ctx2.close();

  await page.click('[data-undo]');
  await solved();
  const undone = await shown('zdiff');
  check(undone && before && undone.v === before.v, `undo restores the width (${undone?.v})`);

  // ---- keyboard: the kind by arrow key, the details by Enter ----
  await page.focus('[data-trace-kind]');
  const k0 = await page.locator('[data-trace-kind]').inputValue();
  await page.keyboard.press('ArrowDown');
  await solved();
  const k1 = await page.locator('[data-trace-kind]').inputValue();
  check(k1 !== k0 && (await page.locator('[data-trace-controls]').getAttribute('data-kind')) === k1, `keyboard changes the kind (${k0} → ${k1})`);
  await page.selectOption('[data-trace-kind]', 'pair-microstrip');
  await solved();
  await page.focus('[data-other-definitions] summary');
  await page.keyboard.press('Enter');
  check(await page.locator('[data-other-definitions]').evaluate((e) => e.open) && await page.locator('[data-q="ztdr"]').isVisible(), 'Enter opens the other definitions');
  await page.focus('[data-matrices] summary');
  await page.keyboard.press('Enter');
  check(await page.locator('[data-matrix="C"] td').count() === 4 && await page.locator('[data-matrix="L"] td').count() === 4 && await page.locator('[data-matrix="Zc"] td').count() === 4, 'matrices C, L, Zc 2 × 2 on demand');

  // ---- the owner's classes: on the preset, then on their boards as read ----
  const projectOf = (f) => K.readKicadProject(readFileSync(f, 'utf8'), f);
  const boardOf = (f) => K.readKicadStackup(readFileSync(f, 'utf8'), f).stackup;
  const pick = async (file, cls, which, stackup, what) => {
    await page.locator('[data-kicad-input]').setInputFiles(file);
    await page.waitForSelector(`[data-class-structure="${cls}:${which}"]`, { timeout: 15000 });
    await page.click(`[data-class-structure="${cls}:${which}"]`);
    await solved();
    const nc = projectOf(Array.isArray(file) ? file[1] : file).classes.find((c) => c.name === cls);
    const st = STR.structuresFromClass(stackup, nc)[which];
    const s = await matches({ ...ST.defaultSetup(), stackup, trace: st }, what);
    check(await page.locator(`[data-class-structure="${cls}:${which}"]`).getAttribute('aria-pressed') === 'true', `${what}: its button pressed`);
    return s;
  };
  if (CARRIER.every(existsSync) && MEZZ.every(existsSync)) {
    const pre = P.presetStackup(P.DEFAULT_PRESET);
    await page.selectOption('[data-preset]', P.DEFAULT_PRESET);
    const a = await pick(CARRIER[1], '50R_SE', 'single', pre, 'carrier 50R_SE on the preset');
    check(a && Math.abs(a.v - 51.50) <= 0.005 && a.text.startsWith('51.50 ± 0.05'), `C39 51.50 ± 0.05 Ω (${a?.text})`);
    const b = await pick(MEZZ[1], 'LVDS_100R', 'pair', pre, 'mezzanine LVDS_100R on the preset');
    check(b && Math.abs(b.v - 103.36) <= 0.005 && b.text.startsWith('103.36 ± 0.1'), `C41 Zdiff 103.36 ± 0.15 Ω (${b?.text})`);
    const c = await pick(CARRIER, '50R_SE', 'single', boardOf(CARRIER[0]), 'carrier 50R_SE on its board');
    check(c && Math.abs(c.v - 51.37) <= 0.005, `C39 on the KiCad stackup as read: 51.37 Ω (${c?.text})`);
    const m = await pick(MEZZ, 'LVDS_100R', 'pair', boardOf(MEZZ[0]), 'mezzanine LVDS_100R on its board');
    check(m && Math.abs(m.v - 103.64) <= 0.005, `C41 on the KiCad stackup as read: 103.64 Ω (${m?.text})`);
  } else console.log('NOTE the owner\'s board files were not found: the 50R_SE and LVDS_100R checks are skipped');

  // ---- touch: a tap opens the matrices ----
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const tp = await tctx.newPage();
  await tp.goto(page.url());
  await tp.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved(tp);
  await tp.locator('[data-matrices] summary').scrollIntoViewIfNeeded();
  await tp.tap('[data-matrices] summary');
  check(await tp.locator('[data-matrices]').evaluate((e) => e.open), 'a tap opens the matrices');
  await tp.tap('[data-trace-widen]');
  check(await tp.locator('[data-trace-drawing]').getAttribute('data-widen') === 'true', 'a tap widens the thin layers');
  await tctx.close();

  // ---- widths, themes, screenshots ----
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
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(200);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme} (${sw})`);
      if (shots && width !== 320) {
        // The whole page scrolled to the top, clipped to the section (the sticky bar stays outside the clip).
        await page.evaluate(() => window.scrollTo(0, 0));
        const box = await page.locator('#trace').boundingBox();
        writeFileSync(join(shots, `emsim-trace-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true, clip: { x: 0, y: box.y, width, height: box.height } })));
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-trace: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
