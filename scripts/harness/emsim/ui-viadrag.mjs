// The Via section's drag handles, pan and zoom in the installed Edge (step M3.1b): on the default via (C44) the side
// view's antipad, pad and drill and the top view's return via dragged by mouse, touch and keys, the backdrill's depth
// with the exit on L3; on the pair (C45) the pitch, the antipads and a return via; after each the shown values equal
// the engine's viaModel in Node on the setup the link holds, and one undo returns the whole drag. A return via dragged
// onto the barrel or onto another return via is refused with its reason; return vias added by a tap (mouse, touch) and
// by keys (Enter at a free spot, then arrows), removed by Delete, by the button after a click and after a tap; pan
// (drag), zoom (wheel, keys) and reset; the drag budget at 1× and 4× CPU throttle (main-thread work per drag frame,
// script time per frame, new results per frame, the fast path) as a table; handles are named sliders; no horizontal
// scroll at 320, 390 and 1440 px in both themes; screenshots `emsim-viadrag-{390,1440}-{light,dark}` of the top view.
//   tsx ui-viadrag.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedModel from '../../../lib/emsim/viamodel.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), V = d(importedVia), VM = d(importedModel);
const OPT = { tdr: false, nf: 2 }; // the values ViaResults shows do not depend on the TDR or the sweep that ViaSection's viaOpt adds (M3.2a)
const BUDGET = { 1: 8, 4: 12 }; // ms of main-thread work per drag frame (engine.md §10)

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const same = (a, b, rel = 1e-9) => Number.isFinite(Number(a)) && Math.abs(Number(a) - b) <= rel * Math.max(1e-30, Math.abs(b));
const core = (r) => r.pieces.filter((p) => p.part === 'through').sort((a, b) => b.zTop - b.zBot - (a.zTop - a.zBot))[0];
const H = (key) => `[data-via-handle="${key}"]`;

const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const settled = async (p) => {
    await p.waitForTimeout(60);
    await p.waitForSelector('[data-via-solves][data-dragging="false"][data-quick="false"] [data-via-results]:not([data-stale="true"])', { timeout: 60000 });
  };
  const open = async (url = `${URL0}#via`) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.waitForSelector('[data-via-results]', { timeout: 30000 });
    await settled(p);
    return p;
  };
  const linked = async (p) => { await p.waitForTimeout(150); return LK.decodeLink(new URL(p.url()).search.slice(1)).setup; };
  const qv = async (p, name) => { const el = p.locator(`[data-via-results] [data-via-q="${name}"]`); return (await el.count()) ? Number(await el.getAttribute('data-v')) : NaN; };
  // The page's section and barrel impedances against the engine on the setup the link holds.
  const matches = async (p, what) => {
    const s = await linked(p);
    const r = VM.viaModel(s.stackup, s.via, s.trace, OPT);
    if (!r.ok) { check(false, `${what}: the engine refuses (${r.reason})`); return null; }
    const c = core(r);
    if (r.n === 1) {
      const bz = await qv(p, 'barrel-z'), sz = await qv(p, 'section-z');
      check(same(bz, c.z0) && same(sz, r.lumped.z), `${what}: barrel ${bz.toFixed(3)} Ω, section ${sz.toFixed(3)} Ω equal the engine's ${c.z0.toFixed(3)}, ${r.lumped.z.toFixed(3)}`);
      return sz;
    }
    const bz = await qv(p, 'barrel-zdiff'), sz = await qv(p, 'section-zdiff');
    check(same(bz, c.zdiff) && same(sz, r.lumped.zdiff), `${what}: barrel Zdiff ${bz.toFixed(3)} Ω, section ${sz.toFixed(3)} Ω equal the engine's ${c.zdiff.toFixed(3)}, ${r.lumped.zdiff.toFixed(3)}`);
    return sz;
  };
  const centre = async (p, sel) => {
    const el = p.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const hc = (p, key) => centre(p, `${H(key)} circle`);
  async function mouseDrag(p, key, dx, dy, to = null) {
    const [x, y] = await hc(p, key);
    const [tx, ty] = to ?? [x + dx, y + dy];
    await p.mouse.move(x, y);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) { await p.mouse.move(x + ((tx - x) * i) / 12, y + ((ty - y) * i) / 12); await p.waitForTimeout(20); }
    await p.mouse.up();
  }
  const touch = async (p, pts) => {
    const cdp = await p.context().newCDPSession(p);
    const pt = ([x, y]) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(pts[0]) });
    for (const q of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(q) }); await p.waitForTimeout(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  };
  async function touchDrag(p, key, dx, dy) {
    const [x, y] = await hc(p, key);
    await touch(p, [[x, y], ...Array.from({ length: 12 }, (_, i) => [x + (dx * (i + 1)) / 12, y + (dy * (i + 1)) / 12])]);
  }
  async function keys(p, key, press, n) {
    await p.focus(H(key));
    for (let i = 0; i < n; i++) await p.keyboard.press(press);
  }
  const undo = async (p) => { await p.click('[data-undo]'); await settled(p); };
  const redo = async (p) => { await p.click('[data-redo]'); await settled(p); };

  // One case: the drag moves the value the expected way, the results are the engine's, one undo returns it all.
  async function dragCase(p, what, get, how, sign) {
    await settled(p);
    const s0 = await linked(p), v0 = get(s0.via), z0 = await matches(p, `${what} (before)`);
    await how();
    await settled(p);
    const v1 = get((await linked(p)).via);
    check(Number.isFinite(v1) && Math.sign(v1 - v0) === sign, `${what}: ${v0} → ${v1} (${sign > 0 ? 'up' : 'down'})`);
    const z1 = await matches(p, what);
    check(z1 !== z0, `${what}: the result moved (${z0?.toFixed(3)} → ${z1?.toFixed(3)} Ω)`);
    await undo(p);
    const back = get((await linked(p)).via);
    check(back === v0, `${what}: one undo returns ${v0} (${back})`);
    await redo(p);
  }
  const ap = (L) => (v) => v.antipads.find((a) => a.layer === L)?.d.v;
  const pad = (L) => (v) => v.pads.find((a) => a.layer === L)?.d?.v;
  const retX = (k) => (v) => v.returns[k]?.x.v;
  const retY = (k) => (v) => v.returns[k]?.y.v;
  const nRet = async (p) => Number(await p.locator('[data-via-top]').getAttribute('data-returns'));
  const kOf = async (p, which) => Number(await p.locator(`[data-via-${which}]`).getAttribute('data-px-per-mm'));
  const refusedText = async (p, which) => { const el = p.locator(`[data-via-handle-refused="${which}"]`); return (await el.count()) ? await el.innerText() : ''; };

  // ---- the single via (C44) ----
  const page = await open();
  const apKey = await page.locator('[data-via-handle^="ap:"]').first().getAttribute('data-via-handle');
  const L = apKey.slice(3);
  const sl = page.locator('[data-via-handle]');
  check(await sl.count() >= 8 && (await sl.evaluateAll((es) => es.every((e) => e.getAttribute('role') === 'slider' && e.getAttribute('aria-label') && e.getAttribute('tabindex') === '0'))), `handles are focusable sliders with names (${await sl.count()})`);
  await dragCase(page, `side antipad on ${L}, mouse`, ap(L), () => mouseDrag(page, apKey, 30, 0), 1);
  await dragCase(page, 'side pad on L1, touch', pad('L1'), () => touchDrag(page, 'pad:L1', 12, 0), 1);
  await dragCase(page, 'side drill, keys', (v) => v.drill.v, () => keys(page, 'drill', 'ArrowRight', 3), 1);
  {
    // The top view's antipad handle sits on a free direction: dragged outwards from via A.
    const [ax, ay] = await centre(page, '[data-via-top] [data-via-pad="A"]'), [hx, hy] = await hc(page, 'top-ap');
    const n = Math.hypot(hx - ax, hy - ay);
    await dragCase(page, 'top antipads, mouse', ap(L), () => mouseDrag(page, 'top-ap', (16 * (hx - ax)) / n, (16 * (hy - ay)) / n), 1);
  }
  await dragCase(page, 'return via 1, mouse', retX(0), () => mouseDrag(page, 'ret:0', 25, 0), 1);
  await dragCase(page, 'return via 1, touch', retX(0), () => touchDrag(page, 'ret:0', -20, 0), -1);
  await dragCase(page, 'return via 1, keys (x)', retX(0), () => keys(page, 'ret:0', 'ArrowLeft', 2), -1);
  await dragCase(page, 'return via 1, keys (y)', retY(0), () => keys(page, 'ret:0', 'ArrowUp', 2), 1);
  {
    // Refused: onto the barrel, then onto the other return via.
    const s0 = await linked(page);
    await mouseDrag(page, 'ret:0', 0, 0, await centre(page, '[data-via-top] [data-via-pad="A"]'));
    await settled(page);
    const why = await refusedText(page, 'top');
    const s1 = await linked(page);
    const errs = V.viaIssues(s1.stackup, s1.via).filter((x) => x.level === 'error');
    check(/overlaps the signal via/.test(why) && errs.length === 0, `a return via dragged onto the barrel is refused: "${why}", kept at (${s1.via.returns[0].x.v}, ${s1.via.returns[0].y.v})`);
    await mouseDrag(page, 'ret:0', 0, 0, await hc(page, 'ret:1'));
    await settled(page);
    const why2 = await refusedText(page, 'top');
    const s2 = await linked(page);
    const r0 = s2.via.returns[0], r1 = s2.via.returns[1];
    check(/would overlap return via 2/.test(why2) && Math.hypot(r0.x.v - r1.x.v, r0.y.v - r1.y.v) >= (r0.pad.v + r1.pad.v) / 2, `onto return via 2 is refused: "${why2}"`);
    // Back to the start for the next cases.
    const page2 = page;
    await page2.goto(`${URL0}?${LK.encodeLink(s0)}#via`);
    await page2.waitForSelector('[data-via-results]', { timeout: 30000 });
    await settled(page2);
  }
  // Backdrill (exit on L3 without its feed, as ui-via; bottom backdrill): the depth dragged down; then the start again.
  {
    const start = page.url();
    await page.click('[data-via-feed-remove="2"]'); await settled(page);
    await page.selectOption('[data-via-exit]', 'L3'); await settled(page);
    await page.check('[data-via-backdrill-on]'); await settled(page);
    await dragCase(page, 'side backdrill depth, mouse', (v) => v.backdrill?.depth.v, () => mouseDrag(page, 'bd', 0, 15), -1);
    await page.goto(start);
    await page.waitForSelector('[data-via-results]', { timeout: 30000 });
    await settled(page);
  }

  // ---- adding and removing return vias ----
  {
    const n0 = await nRet(page);
    await page.click('[data-via-add-mode]');
    await page.locator('[data-via-view="top"]').scrollIntoViewIfNeeded();
    const top = await page.locator('[data-via-view="top"]').boundingBox();
    await page.mouse.click(top.x + 30, top.y + 30);
    await settled(page);
    check(await nRet(page) === n0 + 1 && await page.locator('[data-via-add-mode]').getAttribute('aria-pressed') === 'false', `a click with "Add by tap" adds a return via (${n0} → ${await nRet(page)}) and the mode ends`);
    await matches(page, 'added by a click');
    await undo(page);
    check(await nRet(page) === n0, 'one undo removes it');
    await page.click('[data-via-add-mode]');
    await page.locator('[data-via-view="top"]').scrollIntoViewIfNeeded();
    const top2 = await page.locator('[data-via-view="top"]').boundingBox();
    await touch(page, [[top2.x + top2.width - 30, top2.y + 30]]);
    await settled(page);
    check(await nRet(page) === n0 + 1, `a tap with "Add by tap" adds one (${await nRet(page)})`);
    const nk = await nRet(page);
    // Keys: Enter on the button, Enter on the view (a free spot), the new handle has the focus and moves by arrows.
    await page.focus('[data-via-add-mode]');
    await page.keyboard.press('Enter');
    await page.focus('[data-via-view="top"]');
    await page.keyboard.press('Enter');
    await settled(page);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-via-handle'));
    check(await nRet(page) === nk + 1 && focused === `ret:${nk}`, `Enter adds one at a free spot and focuses it (${focused})`);
    const x0 = retX(nk)((await linked(page)).via);
    await page.keyboard.press('ArrowRight');
    await settled(page);
    check(retX(nk)((await linked(page)).via) > x0, 'the new return via moves by keys');
    await matches(page, 'added by keys');
    await page.keyboard.press('Delete');
    await settled(page);
    check(await nRet(page) === nk, `Delete on its handle removes it (${await nRet(page)})`);
    // Remove by a click and the button, then by a tap and the button.
    const [cx, cy] = await hc(page, `ret:${nk - 1}`);
    await page.mouse.click(cx, cy);
    check(/Remove return via \d/.test(await page.locator('[data-via-remove-sel]').innerText()), 'a click selects the return via');
    await page.click('[data-via-remove-sel]');
    await settled(page);
    check(await nRet(page) === nk - 1, `the button removes it (${await nRet(page)})`);
    await touch(page, [await hc(page, 'ret:1')]);
    await page.waitForTimeout(100);
    const rb = await centre(page, '[data-via-remove-sel]');
    check(await page.locator('[data-via-remove-sel]').isEnabled(), 'a tap selects a return via');
    await touch(page, [rb]);
    await settled(page);
    check(await nRet(page) === nk - 2, `a tap on the button removes it (${await nRet(page)})`);
    await matches(page, 'after removing');
  }

  // ---- pan, zoom, reset ----
  {
    const k0 = await kOf(page, 'top');
    const [tx, ty] = await centre(page, '[data-via-view="top"]');
    await page.mouse.move(tx, ty);
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);
    const k1 = await kOf(page, 'top');
    check(k1 > k0 * 1.2 && await page.locator('[data-via-view="top"]').getAttribute('data-at-fit') === 'false', `the wheel zooms the top view (${k0.toFixed(1)} → ${k1.toFixed(1)} px/mm)`);
    await page.click('[data-via-reset="top"]');
    await page.waitForTimeout(100);
    check(Math.abs(await kOf(page, 'top') - k0) < 1e-3 && await page.locator('[data-via-view="top"]').getAttribute('data-at-fit') === 'true', 'reset shows the whole top view');
    const ks = await kOf(page, 'side');
    await page.focus('[data-via-view="side"]');
    await page.keyboard.press('+');
    await page.keyboard.press('+');
    await page.waitForTimeout(400);
    const ks1 = await kOf(page, 'side');
    check(ks1 > ks * 1.5, `+ zooms the side view (${ks.toFixed(1)} → ${ks1.toFixed(1)})`);
    await page.locator('[data-via-view="side"]').scrollIntoViewIfNeeded();
    const sb = await page.locator('[data-via-view="side"]').boundingBox();
    await page.mouse.move(sb.x + 12, sb.y + sb.height - 12);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(sb.x + 12 + 6 * i, sb.y + sb.height - 12 - 2 * i);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const sx = await page.locator('[data-via-barrel="A"] rect').first().boundingBox();
    check(await kOf(page, 'side') === ks1 && sx, 'a drag on the side view pans without zooming');
    await page.focus('[data-via-view="side"]');
    await page.keyboard.press('0');
    await page.waitForTimeout(400);
    check(Math.abs(await kOf(page, 'side') - ks) < 1e-3, '0 shows the whole side view again');
  }

  // ---- the pair (C45) ----
  await page.click('[data-via-preset="pair"]');
  await page.waitForSelector('[data-via-results][data-n="2"]', { timeout: 60000 });
  await settled(page);
  const pairAp = await page.locator('[data-via-handle^="ap:"]').first().getAttribute('data-via-handle');
  await dragCase(page, 'pair pitch, mouse', (v) => v.pitch.v, () => mouseDrag(page, 'pitch', 0, -20), 1);
  await dragCase(page, 'pair antipads (top), keys', ap(pairAp.slice(3)), () => keys(page, 'top-ap', 'ArrowRight', 2), 1);
  await dragCase(page, `pair antipad on ${pairAp.slice(3)} (side), touch`, ap(pairAp.slice(3)), () => touchDrag(page, pairAp, 20, 0), 1);
  await dragCase(page, 'pair drill, mouse', (v) => v.drill.v, () => mouseDrag(page, 'drill', -4, 0), -1);
  await dragCase(page, 'pair return via 1, mouse', retX(0), () => mouseDrag(page, 'ret:0', 18, 0), 1);

  // ---- the drag budget: synthetic pointer moves on a handle for 2 s, every 8 ms ----
  async function timing(p, view, key, rate) {
    await settled(p);
    const [hx, hy] = await hc(p, key);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await p.waitForTimeout(300);
    const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
    const t0 = await task();
    const res = await p.evaluate(([view, key, hx, hy]) => new Promise((done) => {
      const box = document.querySelector(`[data-via-view="${view}"]`), stat = box.emsimDrag;
      const area = document.querySelector('[data-via-solves]');
      const hit = document.querySelector(`[data-via-handle="${key}"] circle`);
      const ev = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
      const f0 = stat.frames, m0 = stat.ms.length, n0 = Number(area.getAttribute('data-via-solves'));
      let quick = 0;
      const stamps = [];
      let x = hx;
      ev(hit, 'pointerdown', hx, hy);
      const start = performance.now();
      const tick = (t) => {
        stamps.push(t);
        if (area.getAttribute('data-quick') === 'true') quick++;
        if (t - start < 2000) requestAnimationFrame(tick);
        else { ev(box, 'pointerup', x, hy); done({ stamps, ms: stat.ms.slice(m0), frames: stat.frames - f0, solves: Number(area.getAttribute('data-via-solves')) - n0, quick }); }
      };
      requestAnimationFrame(tick);
      const send = () => {
        const t = performance.now() - start;
        if (t >= 2000) return;
        x = hx + 20 * Math.sin((t / 2000) * 4 * Math.PI);
        ev(box, 'pointermove', x, hy);
        setTimeout(send, 8);
      };
      send();
    }), [view, key, hx, hy]);
    const t1 = await task();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    await settled(p);
    const ws = res.ms.slice().sort((a, b) => a - b);
    const q = (xs, f) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(f * xs.length))] : NaN);
    return { rate, frames: res.frames, p50: q(ws, 0.5), p95: q(ws, 0.95), task: ((t1 - t0) * 1000) / res.stamps.length, perFrame: res.frames ? res.solves / res.frames : 0, solves: res.solves, quick: res.quick > 0 };
  }
  const rows = [];
  const tp = await open();
  const tKey = await tp.locator('[data-via-handle^="ap:"]').first().getAttribute('data-via-handle');
  for (const [label, view, key, pair] of [['single, side antipad', 'side', tKey, false], ['single, return via', 'top', 'ret:0', false], ['pair, top antipads', 'top', 'top-ap', true]]) {
    if (pair) { await tp.click('[data-via-preset="pair"]'); await tp.waitForSelector('[data-via-results][data-n="2"]', { timeout: 60000 }); }
    for (const rate of [1, 4]) {
      const runs = [];
      for (let i = 0; i < 2; i++) runs.push(await timing(tp, view, key, rate));
      const r = runs.sort((a, b) => a.p95 - b.p95)[0];
      rows.push({ label, ...r });
    }
  }
  console.log('  drag budget (main-thread work per drag frame, ms; script time per frame; new results per frame):');
  console.log('  | drag | CPU | frames | work p50 | work p95 | task/frame | results/frame | fast path |');
  for (const r of rows) {
    console.log(`  | ${r.label} | ${r.rate}× | ${r.frames} | ${r.p50.toFixed(2)} | ${r.p95.toFixed(2)} | ${r.task.toFixed(2)} | ${r.perFrame.toFixed(2)} (${r.solves}) | ${r.quick ? 'yes' : 'no'} |`);
    check(r.frames > 20 && r.p95 <= BUDGET[r.rate], `${r.label} at ${r.rate}×: work p95 ${r.p95.toFixed(2)} ms per frame (budget ${BUDGET[r.rate]})`);
    check(r.solves > 0, `${r.label} at ${r.rate}×: results arrive during the drag (${r.solves})`);
  }
  await tp.close();

  // ---- widths, themes, screenshots of the top view with a handle focused ----
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
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1];
    }, `data:image/png;base64,${buf.toString('base64')}`);
    await p.close();
    return Buffer.from(b64, 'base64');
  };
  await page.click('[data-via-preset="single"]');
  await settled(page);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(300);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme} (${sw})`);
      if (shots && width !== 320) {
        await page.focus(H('top-ap'));
        await page.waitForTimeout(100);
        const fig = page.locator('figure:has([data-via-view="top"])');
        writeFileSync(join(shots, `emsim-viadrag-${width}-${scheme}.png`), await shrink(await fig.screenshot()));
      }
    }
  }
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-viadrag: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
