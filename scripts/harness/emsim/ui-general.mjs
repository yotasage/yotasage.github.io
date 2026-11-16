// The Trace section's general editor in the installed Edge (step M2.1d): "Edit as general" on a microstrip, an
// edge-coupled pair and a coplanar waveguide with ground gives the preset's values (equal within the error, and the
// engine's own solve in Node of the linked setup); a general structure of 3 traces and 2 grounds built by click,
// keyboard and touch; a trace's position, a ground's edge and a width moved by mouse, touch and keys (each the engine's
// value, one undo step); an overlap refused with its reason; a trace removed and undone; the 9th trace refused; tap
// selection; the link round trip in a fresh context; the M2.1c fixes (the section fills at least half its box at 390 px
// with "widen" off; a plane label never under a handle); no horizontal scroll at 320, 390 and 1440 px in both themes;
// screenshots of the editor at 390 and 1440 px in both themes.
//   tsx ui-general.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLines from '../../../lib/emsim/lines.ts';
import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';

const LN = importedLines.default ?? importedLines;
const LK = importedLink.default ?? importedLink;
const ST = importedSetup.default ?? importedSetup;

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const same = (a, b) => Math.abs(Number(a) - b) <= 1e-9 * Math.max(1, Math.abs(b));

// The main value of a solve: Z0 for one line, Zdiff for a pair, line 1's Z0 for more.
const mainOf = (r) => (r.n === 1 ? ['z0', r.lines[0].z0] : r.n === 2 ? ['zdiff', r.pair.zdiff] : ['z0.1', r.lines[0].z0]);
const engine = (setup) => {
  const r = LN.solveSetup(setup);
  if (!r.ok) return { ok: false, reason: r.reason };
  const [key, q] = mainOf(r);
  return { ok: true, key, v: q.v, e: q.e, n: r.n };
};
const linked = (p) => LK.decodeLink(new URL(p.url()).search).setup;
const valueOf = (setup, key) => {
  const m = /^(sig|gnd)\.(\d+)\.([wuab])$/.exec(key);
  const g = m && (m[1] === 'sig' ? setup.trace.signals : setup.trace.grounds)[Number(m[2])];
  return g && g[m[3]] ? g[m[3]].v : null;
};

const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
const open = async (opt = {}, url = URL0) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', hasTouch: true, ...opt });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url);
  await page.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await solved(page);
  return page;
};
async function solved(p) {
  try { await solved0(p); } catch (e) { console.log('not settled (state, stale, quick, dragging, refusal):', await p.evaluate(() => { const r = document.querySelector('[data-results]'); const a = document.querySelector('[data-dragging]'); return [r?.getAttribute('data-state'), r?.getAttribute('data-stale'), r?.getAttribute('data-quick'), a?.getAttribute('data-dragging'), document.querySelector('[data-handle-refused]')?.textContent]; })); throw e; }
}
async function solved0(p) {
  await p.waitForTimeout(30);
  await p.waitForSelector('[data-results]:not([data-stale="true"]):not([data-quick="true"])', { timeout: 30000 });
  await p.waitForSelector('[data-dragging="false"]', { timeout: 30000 });
}
const shown = async (p, key) => {
  const el = p.locator(`[data-results] [data-q="${key}"]`);
  if (!(await el.count())) return null;
  return { v: Number(await el.getAttribute('data-v')), e: Number(await el.getAttribute('data-e')) };
};
async function matches(p, what) {
  await solved(p);
  const x = engine(linked(p));
  if (!x.ok) { check(false, `${what}: the engine refuses (${x.reason})`); return null; }
  const s = await shown(p, x.key);
  check(s && same(s.v, x.v) && same(s.e, x.e), `${what}: ${x.key} ${s?.v} ± ${s?.e} equals the engine's ${x.v} ± ${x.e}`);
  return s ? { ...s, key: x.key } : null;
}
const centre = async (p, key) => {
  const h = p.locator(`[data-handle="${key}"] circle`).first();
  await h.scrollIntoViewIfNeeded();
  const b = await h.boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
const kpx = async (p) => Number(await p.locator('[data-trace-drawing]').getAttribute('data-px-per-mm'));
async function mouseDrag(p, key, dx) {
  const [x, y] = await centre(p, key);
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) { await p.mouse.move(x + (dx * i) / 12, y); await p.waitForTimeout(20); }
  await p.mouse.up();
}
async function touchDrag(p, key, dx) {
  const [x, y] = await centre(p, key);
  const cdp = await p.context().newCDPSession(p);
  const pt = (px, py) => [{ x: px, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y) });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x + (dx * i) / 12, y) }); await p.waitForTimeout(20); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function dragCase(p, what, key, how, sign) {
  await solved(p);
  const s0 = linked(p), v0 = valueOf(s0, key), z0 = engine(s0);
  await how();
  await solved(p);
  const v1 = valueOf(linked(p), key);
  check(v1 !== null && Math.sign(v1 - v0) === sign, `${what}: ${key} ${v0} → ${v1} (${sign > 0 ? 'up' : 'down'})`);
  const r = await matches(p, what);
  check(r && z0.ok && r.v !== z0.v, `${what}: the impedance moved (${z0.v} → ${r?.v})`);
  await p.click('[data-undo]');
  await solved(p);
  check(valueOf(linked(p), key) === v0, `${what}: one undo returns ${key} to ${v0}`);
  await p.click('[data-redo]');
  await solved(p);
}
const counts = (p) => { const t = linked(p).trace; return [t.kind, t.signals.length, t.grounds.length]; };
const boxOf = async (loc) => loc.boundingBox();
const meets = (a, b) => a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

try {
  const page = await open();

  // ---- "Edit as general" equals the preset ----
  for (const k of ['microstrip', 'pair-microstrip', 'cpwg']) {
    await page.selectOption('[data-trace-kind]', k);
    await solved(page);
    const pre = engine(linked(page));
    const a = await shown(page, pre.key);
    await page.click('[data-trace-to-general]');
    await solved(page);
    const [kind] = counts(page);
    const b = await matches(page, `${k} as general`);
    check(kind === 'general' && await page.locator('[data-gen-editor]').count() === 1, `${k}: "Edit as general" opens the general editor`);
    check(a && b && b.key === pre.key && Math.abs(b.v - a.v) <= Math.max(a.e, b.e), `${k}: as general ${b?.key} ${b?.v} equals the preset's ${a?.v} within ± ${a?.e}`);
    await page.click('[data-undo]');
    await solved(page);
    check(counts(page)[0] === k, `${k}: one undo returns to the preset`);
  }

  // ---- build 3 traces and 2 grounds: click, keyboard, touch ----
  await page.selectOption('[data-trace-kind]', 'microstrip');
  await solved(page);
  await page.click('[data-trace-to-general]');
  await solved(page);
  await page.click('[data-gen-add="signal"]');
  await solved(page);
  await page.focus('[data-gen-add="signal"]');
  await page.keyboard.press('Enter');
  await solved(page);
  await page.tap('[data-gen-add="ground"]');
  await solved(page);
  await page.click('[data-gen-add="ground"]');
  await solved(page);
  const [, ns, ng] = counts(page);
  check(ns === 3 && ng === 2, `3 traces (click, Enter) and 2 grounds (tap, click) added (${ns}, ${ng})`);
  check(await page.locator('[data-gen-row]').count() === 5, 'five rows in the editor');
  const t = linked(page).trace;
  check(t.grounds[0].b === null && t.grounds[1].a === null, 'the grounds run to the right and the left edge');
  check(await page.locator('[data-results]').getAttribute('data-n') === '3', 'the results are for 3 lines');
  await matches(page, '3 traces, 2 grounds');
  check(await page.locator('[data-results] [data-q="eeff.3"]').count() === 1 && await page.locator('[data-results] [data-q="mode3.eeff"]').count() === 1, 'per-line εeff and the modes are shown for 3 lines');
  await page.click('[data-matrices] summary');
  const mx = page.locator('[data-matrix]').first();
  check(await mx.locator('tr').count() === 3 && await mx.locator('tr').first().locator('td').count() === 3, 'the matrices are 3 × 3');

  // ---- selection ----
  await page.click('[data-gen-select="sig.1"]');
  check(await page.locator('[data-trace-drawing]').getAttribute('data-selected') === 'sig.1' && await page.locator('[data-sel-outline="sig.1"]').count() === 1, 'a row selects and outlines its trace');
  await page.locator('[data-trace-drawing]').scrollIntoViewIfNeeded();
  const c = await page.locator('[data-conductor="3"]').boundingBox();
  await page.mouse.click(c.x + 0.2 * c.width, c.y + c.height / 2);
  await page.waitForTimeout(100);
  check(await page.locator('[data-trace-drawing]').getAttribute('data-selected') === 'sig.2' && await page.locator('[data-gen-row="sig.2"]').getAttribute('data-selected') === 'true', 'a click on trace 3 in the drawing selects its row');

  // ---- handles ----
  const k = await kpx(page);
  check(await page.locator('[data-handle^="sig."]').count() === 6 && await page.locator('[data-handle^="gnd."]').count() === 2, 'every trace has a width and a position handle, every finite ground edge one');
  await dragCase(page, 'mouse: trace 1 position', 'sig.0.u', () => mouseDrag(page, 'sig.0.u', -0.06 * k), -1);
  await dragCase(page, 'mouse: ground 1 left edge', 'gnd.0.a', () => mouseDrag(page, 'gnd.0.a', 0.1 * k), 1);
  await dragCase(page, 'touch: trace 3 position', 'sig.2.u', () => touchDrag(page, 'sig.2.u', -0.1 * k), -1);
  await dragCase(page, 'keys: trace 2 width', 'sig.1.w', async () => { await page.focus('[data-handle="sig.1.w"]'); await page.keyboard.press('ArrowRight'); }, 1);
  {
    const v0 = valueOf(linked(page), 'sig.0.u');
    // One jump straight into trace 2 (a slow drag would stop micrometres short of it, which solves slowly: BL100).
    const [hx, hy] = await centre(page, 'sig.0.u');
    await page.mouse.move(hx, hy); await page.mouse.down(); await page.mouse.move(hx + 0.35 * k, hy); await page.waitForTimeout(100); await page.mouse.up();
    await solved(page);
    const alert = (await page.locator('[data-handle-refused]').textContent().catch(() => '')) ?? '';
    const v1 = valueOf(linked(page), 'sig.0.u');
    check(/overlap|touch/i.test(alert), `a trace dragged onto its neighbour is refused with its reason ("${alert}")`);
    if (!/overlap|touch/i.test(alert)) console.log(JSON.stringify(linked(page).trace.signals.map((g) => [g.u.v, g.w.v])));
    check(v1 === v0, `the trace stays at its last valid place (${v0} → ${v1})`);
    if (v1 !== v0) { await page.click('[data-undo]'); await solved(page); }
  }

  // ---- remove, undo ----
  await page.click('[data-gen-select="sig.2"]');
  await page.click('[data-gen-remove]');
  await solved(page);
  check(counts(page)[1] === 2, 'trace 3 removed');
  await matches(page, 'after the removal');
  await page.click('[data-undo]');
  await solved(page);
  check(counts(page)[1] === 3, 'one undo brings it back');

  // ---- the link in a fresh context ----
  {
    const url = page.url();
    const p2 = await open({ viewport: { width: 1000, height: 900 } }, url);
    check(ST.sameSetup(linked(p2), linked(page)), 'the link gives the same setup in a fresh context');
    const a = await shown(page, 'z0.1'), b = await matches(p2, 'fresh context');
    check(a && b && a.v === b.v, `and the same Z0 of line 1 (${a?.v}, ${b?.v})`);
    check(await p2.locator('[data-gen-row]').count() === 5, 'and the same five rows');
    await p2.context().close();
  }

  // ---- the 9th trace refused ----
  {
    const p3 = await open({ viewport: { width: 1000, height: 900 } });
    await p3.click('[data-trace-to-general]');
    await solved(p3);
    for (let i = 0; i < 7; i++) await p3.click('[data-gen-add="signal"]');
    await solved(p3);
    check(counts(p3)[1] === 8, `8 traces added (${counts(p3)[1]})`);
    await p3.click('[data-gen-add="signal"]', { force: true });
    const why = (await p3.locator('[data-gen-refused]').textContent().catch(() => '')) ?? '';
    check(/at most 8/.test(why) && counts(p3)[1] === 8, `the 9th trace is refused ("${why}")`);
    await matches(p3, '8 traces');
    await p3.context().close();
  }

  // ---- the M2.1c fixes at 390 px: the section fills its box; plane labels clear of handles ----
  {
    const p4 = await open({ viewport: { width: 390, height: 844 }, isMobile: true });
    for (const kd of ['microstrip', 'pair-microstrip', 'cpwg', 'stripline']) {
      await p4.selectOption('[data-trace-kind]', kd);
      await solved(p4);
      if (kd === 'cpwg') { await p4.locator('[data-field="trace.gw"] input').first().fill('0.3'); await solved(p4); }
      const fig = p4.locator('[data-trace-drawing]');
      const ch = Number(await fig.getAttribute('data-content-h')), bh = Number(await fig.getAttribute('data-box-h'));
      check(ch >= 0.5 * bh && bh >= 170 && bh <= 340, `${kd} at 390 px: the section is ${ch} of ${bh} px (at least half, box 170–340)`);
      const labels = p4.locator('[data-plane-label]');
      let clear = true;
      for (let i = 0; i < await labels.count(); i++) {
        const lb = await boxOf(labels.nth(i));
        const hs = p4.locator('[data-handle] circle:nth-of-type(2)');
        for (let j = 0; j < await hs.count(); j++) if (meets(lb, await boxOf(hs.nth(j)))) clear = false;
      }
      check(clear, `${kd} at 390 px: no plane label under a handle`);
    }
    await p4.context().close();
  }

  // ---- widths, themes, screenshots ----
  if (shots) mkdirSync(shots, { recursive: true });
  const shrink = async (buf) => {
    const p = await page.context().newPage();
    const b64 = await p.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      return cv.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await p.close();
    return Buffer.from(b64, 'base64');
  };
  await page.click('[data-gen-select="gnd.0"]');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(250);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `general editor: no horizontal scroll at ${width} px, ${scheme} (${sw})`);
      if (shots && width !== 320) {
        const el = page.locator('#trace');
        await el.scrollIntoViewIfNeeded();
        writeFileSync(join(shots, `emsim-general-${width}-${scheme}.png`), await shrink(await el.screenshot()));
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-general: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
