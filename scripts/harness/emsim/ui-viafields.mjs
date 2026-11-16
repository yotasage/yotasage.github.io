// The Via section's field maps and target in the installed Edge (step M3.2b): with "Show the fields" both maps draw
// (an image, done), the scale bars' top equals the engine's map in Node for the same window (viafield.ts with the page's
// grid, colormap.ts's 99.5th percentile) within 2 %; the probe's φ and |E| at two points of each view equal the engine
// at those points (axiField for the side view, the cut's field for the top view) within the grid's interpolation; zoom,
// pan and an edit draw a new map; the first and the full picture's times (budget 50 / 300 ms at 1440 px); the probe
// by keys and by a tap on a phone; the pair's top view differential (φ zero on the middle line); the target: the
// single via's 50 Ω by its antipad and the pair's Zdiff 85 Ω equal viaTarget in Node, 90 Ω shows the engine's
// reason (the model's jump, BL121), C45's Zdiff 100 Ω by the antipad
// shows the engine's reason with its range, "Use this" and undo; no horizontal scroll at 320/390/1440 in both themes;
// screenshots `emsim-viafields-{single,pair}-{390,1440}-{light,dark}`.
//   tsx ui-viafields.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedModel from '../../../lib/emsim/viamodel.ts';
import * as importedVF from '../../../lib/emsim/viafield.ts';
import * as importedVC from '../../../lib/emsim/viacut.ts';
import * as importedAX from '../../../lib/emsim/axisym.ts';
import * as importedF from '../../../lib/emsim/fields.ts';
import * as importedCM from '../../../lib/emsim/colormap.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), V = d(importedVia), VM = d(importedModel), VF = d(importedVF), VC = d(importedVC), AX = d(importedAX), F = d(importedF), CM = d(importedCM);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const single = SU.defaultSetup();
const pairS = (() => { const s = SU.defaultSetup(); s.via = V.presetVia('pair', s.stackup); return s; })();
const urlOf = (s) => `${URL0}?${LK.encodeLink(s)}#via`;
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-30);

const browser = await chromium.launch({ channel: 'msedge' });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const open = async (url, c = ctx) => {
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.waitForSelector('[data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
    return p;
  };
  const view = (p, w) => p.locator(`[data-via-view="${w}"]`);
  const fig = (p, w) => p.locator('figure', { has: p.locator(`[data-via-view="${w}"]`) });
  const paints = (p, w) => view(p, w).evaluate((el) => (el.emsimViaField ? el.emsimViaField.paints.map((x) => ({ ...x })) : []));
  const mapsDone = async (p) => {
    await p.waitForTimeout(60);
    for (const w of ['side', 'top']) await p.waitForSelector(`[data-via-view="${w}"][data-field-state="done"] [data-viafield-layer="${w}"][data-done="true"]`, { timeout: 30000 });
  };
  const scaleOf = async (p, w) => {
    const el = fig(p, w).locator('[data-field-scale]');
    return { view: JSON.parse(await el.getAttribute('data-view')), lo: Number(await el.getAttribute('data-lo')), hi: Number(await el.getAttribute('data-hi')), qty: await el.getAttribute('data-qty') };
  };
  const probeOf = async (p, w) => {
    const el = p.locator(`[data-viafield-probe="${w}"]`);
    return { state: await el.getAttribute('data-state'), x: Number(await el.getAttribute('data-x')), z: Number(await el.getAttribute('data-z')), phi: Number(await el.getAttribute('data-phi')), f: Number(await el.getAttribute('data-f')), cls: Number(await el.getAttribute('data-cls')), text: await el.innerText() };
  };
  // The engine's field at a point: the side view's axisymmetric solution (|x| as r), the top view's cut.
  const engineAt = (s, w, x, z, drive) => {
    if (w === 'side') { const sd = VF.viaSide(s.stackup, s.via); const o = [0, 0, 0]; AX.axiField(sd.lv, Math.abs(x), z, o); return { phi: o[0], f: Math.hypot(o[1], o[2]) }; }
    const src = VF.topSource(VC.viaCut(s.stackup, s.via, { estimate: false }), drive);
    const q = F.pointField(src, x, z);
    return { phi: q.phi, f: q.f };
  };

  // ---- 1: both maps, their scales against the engine ----
  const p = await open(urlOf(single));
  check(await p.locator('[data-viafield-layer]').count() === 0, 'fields off by default');
  await p.check('[data-viafield-on]');
  await mapsDone(p);
  for (const w of ['side', 'top']) {
    const href = await p.locator(`[data-viafield-layer="${w}"] image`).getAttribute('href');
    check(href && href.startsWith('data:image/png') && href.length > 2000, `${w}: the map is an image (${href ? href.length : 0} characters)`);
    const sc = await scaleOf(p, w);
    const r = (() => { const g = VF.viaFieldJob(single.stackup, single.via, { which: w, view: sc.view, drive: [1] }); for (;;) { const st = g.next(); if (st.done) return st.value; } })();
    const sk = CM.scaleOf(F.magnitude(r.grid), 'linear', { cls: r.grid.cls });
    check(r.ok && rel(sc.hi, sk.hi) < 0.02 && sc.qty === 'E', `${w}: scale top ${sc.hi} V/m vs the engine's ${sk.hi} (${(rel(sc.hi, sk.hi) * 100).toFixed(2)} %)`);
    console.log(`  ${w}: grid ${sc.view.nx} × ${sc.view.ny}, |E| scale top ${sc.hi.toFixed(0)} V/m (engine ${sk.hi.toFixed(0)})`);
  }
  check((await fig(p, 'side').innerText()).includes('coaxial wall'), 'the side view says what it shows');

  // ---- 2: the probe by hover at two points per view against the engine ----
  for (const [w, pts] of [['side', [[0.36, 0.55], [0.3, 0.3]]], ['top', [[0.56, 0.5], [0.62, 0.38]]]]) {
    await view(p, w).scrollIntoViewIfNeeded();
    const bb = await view(p, w).boundingBox();
    for (const [fx, fy] of pts) {
      await p.mouse.move(bb.x + fx * bb.width, bb.y + fy * bb.height);
      await p.waitForTimeout(120);
      const pr = await probeOf(p, w);
      const e = engineAt(single, w, pr.x, pr.z, [1]);
      const sc = await scaleOf(p, w);
      const ok = pr.state === 'value' && Math.abs(pr.phi - e.phi) <= 0.02 && (pr.cls < 0 || Math.abs(pr.f - e.f) <= 0.05 * e.f + 0.02 * sc.hi);
      check(ok, `${w} probe at (${pr.x.toFixed(4)}, ${pr.z.toFixed(4)}) class ${pr.cls}: φ ${pr.phi} vs ${e.phi}, |E| ${pr.f} vs ${e.f}`);
      console.log(`  probe ${w} (${pr.x.toFixed(3)}, ${pr.z.toFixed(3)}): φ ${pr.phi.toFixed(4)} / ${e.phi.toFixed(4)} V, |E| ${pr.f.toFixed(0)} / ${e.f.toFixed(0)} V/m`);
    }
  }

  // ---- 3: times, every map not from the client's cache: a new quantity, zoom, pan and back ----
  for (const step of ['qty:phi', '+', 'ArrowLeft', '0', 'qty:E', '+', 'ArrowUp', '0']) {
    if (step.startsWith('qty:')) await p.selectOption('[data-viafield-qty]', step.slice(4));
    else { await view(p, 'side').focus(); await p.keyboard.press(step); await view(p, 'top').focus(); await p.keyboard.press(step); }
    await p.waitForTimeout(300);
    await mapsDone(p);
  }
  const times = [];
  for (const w of ['side', 'top']) {
    let first = null;
    for (const x of await paints(p, w)) {
      if (x.drag) continue;
      if (first === null) first = x.ms;
      if (x.kind === 'done') { if (!x.cached) times.push({ w, first, done: x.ms, nx: x.nx, ny: x.ny }); first = null; }
    }
  }
  for (const w of ['side', 'top']) {
    const t = times.filter((x) => x.w === w).slice(1); // the first map loads fieldPaint.ts
    const first = Math.max(...t.map((x) => x.first)), done = Math.max(...t.map((x) => x.done));
    check(t.length >= 2 && first <= 50, `${w}: first picture within 50 ms (${t.map((x) => x.first.toFixed(0)).join(', ')} ms)`);
    check(t.length >= 2 && done <= 300, `${w}: full picture within 300 ms (${t.map((x) => x.done.toFixed(0)).join(', ')} ms)`);
    console.log(`  times ${w} at 1440 px: first ${t.map((x) => x.first.toFixed(0)).join(', ')} ms, full ${t.map((x) => x.done.toFixed(0)).join(', ')} ms`);
  }

  // ---- 4: zoom, pan and an edit draw new maps ----
  const v0 = (await scaleOf(p, 'side')).view;
  await view(p, 'side').focus();
  await p.keyboard.press('+');
  await p.waitForTimeout(400);
  await mapsDone(p);
  const v1 = (await scaleOf(p, 'side')).view;
  check(v1.x1 - v1.x0 < 0.9 * (v0.x1 - v0.x0), `zoom: the side map's window ${(v0.x1 - v0.x0).toFixed(3)} → ${(v1.x1 - v1.x0).toFixed(3)} mm`);
  await p.keyboard.press('ArrowLeft');
  await p.waitForTimeout(400);
  await mapsDone(p);
  const v2 = (await scaleOf(p, 'side')).view;
  check(Math.abs(v2.x0 - v1.x0) > 1e-4, `pan: the side map's window moves (${v1.x0.toFixed(4)} → ${v2.x0.toFixed(4)})`);
  await p.keyboard.press('0');
  const t0 = (await scaleOf(p, 'top')).hi;
  const before = (await paints(p, 'top')).length;
  const drill = p.locator('[data-field="via.drill"] input').first();
  await drill.fill('0.4');
  await drill.press('Enter');
  await p.waitForTimeout(300);
  await mapsDone(p);
  const t1 = (await scaleOf(p, 'top')).hi;
  check((await paints(p, 'top')).length > before && rel(t1, t0) > 0.01, `an edit (drill 0.4 mm) draws a new top map (scale top ${t0.toFixed(0)} → ${t1.toFixed(0)} V/m)`);
  await p.click('[data-undo]');
  await p.waitForTimeout(300);

  // ---- 5: the probe by keys ----
  await p.click('[data-viafield-probe-mode]');
  await view(p, 'top').focus();
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(80);
  const k1 = await probeOf(p, 'top');
  await p.keyboard.press('ArrowRight');
  await p.waitForTimeout(80);
  const k2 = await probeOf(p, 'top');
  const kpx = Number(await view(p, 'top').locator('svg').first().getAttribute('data-px-per-mm'));
  check(Math.abs(k2.x - k1.x - 8 / kpx) < 1e-6 && Math.abs(k2.z - k1.z) < 1e-9, `keys move the probe 8 px (${((k2.x - k1.x) * kpx).toFixed(3)} px)`);
  await p.keyboard.press('Shift+ArrowUp');
  await p.waitForTimeout(80);
  const k3 = await probeOf(p, 'top');
  check(Math.abs(k3.z - k2.z - 1 / kpx) < 1e-6, 'Shift+↑ moves it 1 px up');
  await p.click('[data-viafield-probe-mode]');

  // ---- 6: the target on the single via: 50 Ω by the antipad, "Use this", undo ----
  const target = async (pg, value, vary, key) => {
    if (key) await pg.selectOption('[data-via-target-key]', key);
    await pg.selectOption('[data-via-target-vary]', vary);
    const inp = pg.locator('#via-target');
    await inp.fill(value);
    await inp.press('Enter');
    const runs = Number(await pg.locator('[data-via-target]').getAttribute('data-runs'));
    await pg.click('[data-via-target-solve]');
    await pg.waitForSelector(`[data-via-target][data-runs="${runs + 1}"]:not([data-state="running"])`, { timeout: 60000 });
  };
  const apBefore = await p.locator('[data-field="via.antipad-all"] input').first().inputValue();
  await target(p, '50 Ω', 'antipad');
  const res = p.locator('[data-via-target-result]');
  const tx = Number(await res.getAttribute('data-x')), tv = Number(await res.getAttribute('data-value'));
  const eng = VM.viaTarget(single.stackup, single.via, null, 'z', 50, 'antipad', { tdr: false, nf: 2 });
  check(eng.reached && rel(tx, eng.x) < 1e-6 && rel(tv, eng.value) < 1e-6, `single 50 Ω by the antipad: Ø${tx} mm, ${tv} Ω vs the engine's Ø${eng.x}, ${eng.value}`);
  console.log(`  target single 50 Ω: antipad Ø${tx.toFixed(4)} mm, ${tv.toFixed(4)} ± ${Number(await res.getAttribute('data-err')).toFixed(3)} Ω (${eng.solves} solves) — "${(await res.innerText()).slice(0, 90)}"`);
  await p.click('[data-via-target-use]');
  await p.waitForTimeout(200);
  const apUsed = await p.locator('[data-field="via.antipad-all"] input').first().inputValue();
  check(Math.abs(Number(apUsed) - eng.x) < 2e-3 && (await p.locator('[data-via-target-used]').count()) === 1, `"Use this" sets every antipad (${apBefore} → ${apUsed})`);
  await p.click('[data-undo]');
  await p.waitForTimeout(200);
  check(await p.locator('[data-field="via.antipad-all"] input').first().inputValue() === apBefore, 'undo gives the antipad back in one step');
  await p.close();

  // ---- 7: the pair: C45 Zdiff 100 Ω by the antipad out of reach, 90 Ω reached; the top view differential ----
  const q = await open(urlOf(pairS));
  await target(q, '100', 'antipad', 'zdiff');
  const why = await q.locator('[data-via-target-reason]').innerText().catch(() => '');
  const e100 = VM.viaTarget(pairS.stackup, pairS.via, null, 'zdiff', 100, 'antipad', { tdr: false, nf: 2 });
  check(!e100.reached && why.includes(e100.reason) && /outside .*Ω over .*mm/.test(why), `C45 Zdiff 100 Ω: "${why}"`);
  console.log(`  target pair 100 Ω: ${why}`);
  // 90 Ω lies in the jump of the via model where the pads' wall changes from the returns' equivalent to the rule
  // (BL121): the page shows the engine's own reason; 85 Ω is reached.
  await target(q, '90', 'antipad', 'zdiff');
  const why90 = await q.locator('[data-via-target-reason]').innerText().catch(() => '');
  const e90 = VM.viaTarget(pairS.stackup, pairS.via, null, 'zdiff', 90, 'antipad', { tdr: false, nf: 2 });
  check(e90.reached ? (await q.locator('[data-via-target-result]').count()) === 1 : why90.includes(e90.reason), `pair Zdiff 90 Ω as the engine: "${why90 || 'reached'}"`);
  console.log(`  target pair 90 Ω: ${why90 || 'reached'}`);
  await target(q, '85', 'antipad', 'zdiff');
  const r85 = q.locator('[data-via-target-result]');
  const e85 = VM.viaTarget(pairS.stackup, pairS.via, null, 'zdiff', 85, 'antipad', { tdr: false, nf: 2 });
  const x85 = Number(await r85.getAttribute('data-x')), v85 = Number(await r85.getAttribute('data-value'));
  check(e85.reached && rel(x85, e85.x) < 1e-6 && rel(v85, e85.value) < 1e-6, `pair Zdiff 85 Ω: Ø${x85}, ${v85} Ω vs the engine's Ø${e85.x}, ${e85.value}`);
  console.log(`  target pair 85 Ω: antipad Ø${x85.toFixed(4)} mm, ${v85.toFixed(4)} ± ${Number(await r85.getAttribute('data-err')).toFixed(3)} Ω`);
  await q.check('[data-viafield-on]');
  await q.selectOption('[data-viafield-drive]', 'differential');
  await q.selectOption('[data-viafield-qty]', 'phi');
  await mapsDone(q);
  const sd = await scaleOf(q, 'top');
  check(sd.lo < 0 && sd.hi > 0 && Math.abs(sd.lo + sd.hi) < 0.05 * sd.hi, `pair differential: φ's scale symmetric about 0 V (${sd.lo} to ${sd.hi})`);
  const mid = await (async () => {
    const svg = view(q, 'top');
    await svg.scrollIntoViewIfNeeded();
    const bb = await svg.boundingBox();
    await q.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
    await q.waitForTimeout(120);
    return probeOf(q, 'top');
  })();
  const em = engineAt(pairS, 'top', mid.x, mid.z, [0.5, -0.5]);
  check(Math.abs(mid.phi - em.phi) <= 0.02, `pair differential probe: φ ${mid.phi} vs the engine's ${em.phi}`);
  check((await q.locator('[data-viafield-drive]').count()) === 1 && (await fig(q, 'side').innerText()).includes('one via of the pair'), 'the pair: drive for the top view, the side view says it is one via');
  await q.close();

  // ---- 8: a tap on a phone moves the probe ----
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'light' });
  const ph = await open(urlOf(single), phone);
  await ph.check('[data-viafield-on]');
  await mapsDone(ph);
  const bt = await view(ph, 'top').boundingBox();
  await view(ph, 'top').scrollIntoViewIfNeeded();
  const bt2 = await view(ph, 'top').boundingBox();
  await ph.touchscreen.tap(bt2.x + bt.width * 0.6, bt2.y + bt.height * 0.45);
  await ph.waitForTimeout(150);
  const tp = await probeOf(ph, 'top');
  check(tp.state === 'value' && Number.isFinite(tp.f), `a tap on a phone reads the field (${tp.text.slice(0, 80)})`);
  await phone.close();

  // ---- 9: no horizontal scroll, screenshots ----
  const shrink = async (buf) => {
    const s = await ctx.newPage();
    const b64 = await s.evaluate(async (src) => {
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
    await s.close();
    return Buffer.from(b64, 'base64');
  };
  if (shots) mkdirSync(shots, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
    for (const [kind, s] of [['single', single], ['pair', pairS]]) {
      const page = await open(urlOf(s), c2);
      await page.check('[data-viafield-on]');
      if (kind === 'pair') await page.selectOption('[data-viafield-drive]', 'differential');
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(300);
        await mapsDone(page);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        check(sw <= width, `${kind}: no horizontal scroll at ${width} px with the fields, ${scheme} (${sw})`);
        if (shots && width !== 320) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(100);
          const b = await page.locator('[data-via-dragging]').boundingBox();
          writeFileSync(join(shots, `emsim-viafields-${kind}-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true, clip: { x: b.x, y: b.y, width: b.width, height: b.height } })));
        }
      }
      await page.close();
    }
    await c2.close();
  }
  check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-viafields: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
if (fails.length) process.exitCode = 1;
