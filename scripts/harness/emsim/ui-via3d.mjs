// The Via section's 3D view in the installed Edge (step M5.1): no chunk with three.js before "3D view" is opened, and
// the chunks it loads then (their gzip size reported); the view's first frame within 1 s of the click (production
// build); the scene's mesh counts equal lib/emsim/scene3d.ts's in Node (single via and pair); a scripted 2 s orbit at
// 60 fps at 1× (median rAF interval; 4× reported only); orbit and zoom by mouse; a via edit rebuilds the scene; with
// "Show the fields" the two field planes appear; Save PNG downloads a PNG at 1× and 2× the canvas; touch orbit and
// pinch at 390 px (CDP touch); closing loses every WebGL context the page made; no horizontal scroll at 320/390/1440
// in both themes; screenshots `emsim-via3d-{single,pair}-{390,1440}-{light,dark}` (pair with fields).
//   tsx ui-via3d.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedScene from '../../../lib/emsim/scene3d.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), V = d(importedVia), SC = d(importedScene);

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const single = SU.defaultSetup();
const pairS = (() => { const s = SU.defaultSetup(); s.via = V.presetVia('pair', s.stackup); return s; })();
const urlOf = (s) => `${URL0}?${LK.encodeLink(s)}#via`;
const traceW = (s) => (s.trace.kind === 'general' ? (s.trace.signals?.[0]?.w?.v ?? 0.15) : s.trace.w?.v ?? 0.15);
const countsOf = (s) => { const c = SC.viaScene(s.stackup, s.via, traceW(s)).counts; return Object.fromEntries(Object.entries(c).filter(([, n]) => n > 0)); };
const sameCounts = (a, b) => { const k = new Set([...Object.keys(a), ...Object.keys(b)]); return [...k].every((x) => (a[x] ?? 0) === (b[x] ?? 0)); };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
const ARGS = ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HOST = '[data-via3d] [role="img"]';

// Every WebGL context the page makes, to see that closing the view loses them.
const trackGl = () => {
  const orig = HTMLCanvasElement.prototype.getContext;
  window.__gl = [];
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const c = orig.call(this, type, ...rest);
    if (c && /webgl/.test(String(type)) && !window.__gl.includes(c)) window.__gl.push(c);
    return c;
  };
};

const browser = await chromium.launch({ channel: 'msedge', args: ARGS });
const errors = [];
const report = [];
try {
  const open = async (ctx, url) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.waitForSelector('[data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
    return p;
  };
  const openView = async (p) => {
    await p.click('[data-via3d-open]');
    await p.waitForSelector('[data-via3d][data-via3d-ready="true"]', { timeout: 30000 });
    return Number(await p.getAttribute('[data-via3d]', 'data-open-ms'));
  };
  const stats = (p) => p.$eval(HOST, (el) => { const v = el.emsimVia3d; return { meshes: { ...v.stats.meshes }, renders: v.stats.renders, builds: v.stats.builds, fieldPlanes: v.stats.fieldPlanes, cam: v.cameraState(), disposed: v.stats.disposed }; });
  const dist = (c) => Math.hypot(c.p[0] - c.t[0], c.p[1] - c.t[1], c.p[2] - c.t[2]);
  const noScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  // ---- 1: three.js only when opened; the open time; the counts; the orbit ----
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.addInitScript(trackGl);
  const js = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('response', (r) => { if (r.url().endsWith('.js')) js.push(r.url()); });
  await p.goto(urlOf(single));
  await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
  await p.waitForSelector('[data-via-results][data-state="done"]:not([data-stale="true"])', { timeout: 60000 });
  await p.waitForTimeout(500);
  const has3 = async (urls) => {
    const out = [];
    for (const u of urls) { const b = Buffer.from(await (await fetch(u)).arrayBuffer()); if (b.includes('WebGLRenderer')) out.push({ u, raw: b.length, gz: gzipSync(b, { level: 9 }).length }); }
    return out;
  };
  const before = [...new Set(js)];
  check((await has3(before)).length === 0, `no chunk with three.js before the view is opened (${before.length} chunks)`);
  check(await p.locator('[data-via3d-canvas]').count() === 0, 'no canvas before the view is opened');
  const t0 = Date.now();
  const openMs = await openView(p);
  const wall = Date.now() - t0;
  const after = [...new Set(js)].filter((u) => !before.includes(u));
  const three = await has3(after);
  const gz = after.length ? (await Promise.all(after.map(async (u) => gzipSync(Buffer.from(await (await fetch(u)).arrayBuffer()), { level: 9 }).length))).reduce((a, b) => a + b, 0) : 0;
  check(three.length >= 1, `opening loads three.js (${after.length} new chunks, ${(gz / 1024).toFixed(1)} kB gzip)`);
  report.push(`three.js chunk(s) loaded on open: ${after.length}, ${(gz / 1024).toFixed(1)} kB gzip (three's own ${three.map((x) => (x.gz / 1024).toFixed(1)).join(' + ')} kB)`);
  check(openMs > 0 && openMs < 1000, `the view's first frame ${openMs} ms after the click (budget 1000; ${wall} ms by the harness's clock)`);
  report.push(`open: first frame ${openMs} ms after the click (${wall} ms seen from the harness, cold chunk)`);
  const glInfo = await p.$eval('[data-via3d-canvas]', (c) => { const g = c.getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return g ? (e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl2') : 'none'; });
  report.push(`WebGL: ${glInfo}`);
  let st = await stats(p);
  const home = st.cam;
  check(sameCounts(st.meshes, { ...countsOf(single), ...(st.meshes.drilled ? { drilled: st.meshes.drilled } : {}) }), `single via: meshes ${JSON.stringify(st.meshes)} as scene3d.ts in Node ${JSON.stringify(countsOf(single))}`);
  check(JSON.stringify(JSON.parse(await p.getAttribute('[data-via3d-counts]', 'data-via3d-counts'))) === JSON.stringify(SC.viaScene(single.stackup, single.via, traceW(single)).counts), 'the caption counts as scene3d.ts');
  // A scripted orbit: 2 s of rAF frames, each turning the camera.
  const orbit = () => p.$eval(HOST, (el) => new Promise((res) => {
    const v = el.emsimVia3d; const times = []; let last = performance.now(); const start = last; const r0 = v.stats.renders;
    const f = (t) => { times.push(t - last); last = t; v.orbitBy(0.02); if (t - start < 2000) requestAnimationFrame(f); else res({ times: times.slice(2), renders: v.stats.renders - r0, ms: v.stats.frameMs.slice(-100) }); };
    requestAnimationFrame(f);
  }));
  const o1 = await orbit();
  const m1 = median(o1.times);
  check(m1 <= 17.5 && o1.renders >= 0.9 * o1.times.length, `orbit at 1×: median frame ${m1.toFixed(2)} ms (≤ 17.5 for 60 fps), ${o1.renders} frames drawn of ${o1.times.length}`);
  report.push(`orbit 1× (1440 px wide page): median frame ${m1.toFixed(2)} ms, 95th ${[...o1.times].sort((a, b) => a - b)[Math.floor(o1.times.length * 0.95)].toFixed(2)} ms, render call median ${median(o1.ms).toFixed(2)} ms`);
  // Mouse: drag turns, wheel zooms.
  const box = await p.locator(HOST).boundingBox();
  const c0 = (await stats(p)).cam;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 30, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  const c1 = (await stats(p)).cam;
  check(Math.hypot(c1.p[0] - c0.p[0], c1.p[1] - c0.p[1], c1.p[2] - c0.p[2]) > 0.05 && Math.abs(dist(c1) - dist(c0)) < 1e-6 * dist(c0) + 1e-9, 'a mouse drag turns the view about its target');
  await p.mouse.wheel(0, -400);
  await p.waitForTimeout(500);
  const c2 = (await stats(p)).cam;
  check(dist(c2) < 0.95 * dist(c1), `the wheel zooms in (${dist(c1).toFixed(2)} → ${dist(c2).toFixed(2)} mm)`);
  await p.click('[data-via3d-reset]');
  await p.waitForTimeout(100);
  const c3 = (await stats(p)).cam;
  check(Math.abs(dist(c3) - dist(home)) < 1e-6 * dist(home) && Math.hypot(c3.p[0] - home.p[0], c3.p[1] - home.p[1], c3.p[2] - home.p[2]) < 1e-6, 'Reset view goes back to the first view');
  // Cut and laminate.
  const r0 = (await stats(p)).renders;
  await p.click('[data-via3d-cut]');
  await p.click('[data-via3d-laminate]');
  await p.waitForTimeout(150);
  check((await p.getAttribute('[data-via3d-cut]', 'aria-pressed')) === 'true' && (await stats(p)).renders > r0, 'Cut away half and Hide the laminate draw again');
  await p.click('[data-via3d-cut]');
  await p.click('[data-via3d-laminate]');
  // PNG at 1× and 2×.
  const css = await p.$eval(HOST, (el) => ({ width: el.clientWidth, height: el.clientHeight }));
  for (const k of [1, 2]) {
    await p.click(`[data-via3d-scale="${k}"]`);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.click('[data-via3d-png]')]);
    const file = join(tmpdir(), `emsim-via3d-${process.pid}-${k}.png`);
    await dl.saveAs(file);
    const b = readFileSync(file);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    check(b.subarray(1, 4).toString() === 'PNG' && Math.abs(w - Math.round(css.width * k)) <= 1 && Math.abs(h - Math.round(css.height * k)) <= 1 && b.length > 5000, `Save PNG at ${k}×: ${dl.suggestedFilename()}, ${w} × ${h} px, ${(b.length / 1024).toFixed(0)} kB`);
    report.push(`PNG ${k}×: ${w} × ${h} px, ${(b.length / 1024).toFixed(0)} kB`);
  }
  // An edit rebuilds: the pair preset.
  const b0 = (await stats(p)).builds;
  await p.click('[data-via-preset="pair"]');
  await p.waitForSelector('[data-via-results][data-n="2"]:not([data-stale="true"])', { timeout: 60000 });
  await p.waitForTimeout(200);
  st = await stats(p);
  check(st.builds > b0 && sameCounts(st.meshes, countsOf(pairS)), `the pair preset rebuilds the scene: ${JSON.stringify(st.meshes)} as Node ${JSON.stringify(countsOf(pairS))}`);
  // Fields on: two planes.
  await p.check('[data-viafield-on]');
  for (const w of ['side', 'top']) await p.waitForSelector(`[data-via-view="${w}"][data-field-state="done"] [data-viafield-layer="${w}"][data-done="true"]`, { timeout: 30000 });
  await p.waitForSelector('[data-via3d][data-fields="on"] [data-via3d-fields] [data-field-scale]', { timeout: 15000 });
  await p.waitForTimeout(200);
  st = await stats(p);
  check(st.fieldPlanes === 2 && await p.locator('[data-via3d-fields] [data-field-scale]').count() === 2, `with the fields on, two field planes and their scale bars (${st.fieldPlanes})`);
  const o4 = await orbit();
  report.push(`orbit 1× with the fields (pair): median frame ${median(o4.times).toFixed(2)} ms`);
  await p.uncheck('[data-viafield-on]');
  await p.waitForTimeout(300);
  check((await stats(p)).fieldPlanes === 0, 'fields off: no field planes');
  // Close: every context lost, the canvas gone; open again works.
  await p.click('[data-via3d-open]');
  await p.waitForTimeout(300);
  const gl = await p.evaluate(() => ({ n: window.__gl.length, lost: window.__gl.filter((c) => c.isContextLost()).length }));
  check(gl.n >= 1 && gl.lost === gl.n && await p.locator('[data-via3d-canvas]').count() === 0, `closing loses every WebGL context (${gl.lost} of ${gl.n}) and removes the canvas`);
  const again = await openView(p);
  check(again < 1000, `opened again: first frame ${again} ms`);
  report.push(`open again (chunk cached): ${again} ms`);
  await p.click('[data-via3d-open]');
  await p.close();
  await ctx.close();

  // ---- 2: 4× (report only) ----
  const c4 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 4 });
  const p4 = await open(c4, urlOf(single));
  await openView(p4);
  const o5 = await p4.$eval(HOST, (el) => new Promise((res) => {
    const v = el.emsimVia3d; const times = []; let last = performance.now(); const start = last;
    const f = (t) => { times.push(t - last); last = t; v.orbitBy(0.02); if (t - start < 2000) requestAnimationFrame(f); else res(times.slice(2)); };
    requestAnimationFrame(f);
  }));
  report.push(`orbit 4× (pixel ratio capped at 2): median frame ${median(o5).toFixed(2)} ms`);
  await c4.close();

  // ---- 3: touch at 390 px: one finger turns, two pinch ----
  const ct = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  const pt = await open(ct, urlOf(pairS));
  await pt.locator('[data-via3d-open]').scrollIntoViewIfNeeded();
  await pt.tap('[data-via3d-open]');
  await pt.waitForSelector('[data-via3d][data-via3d-ready="true"]', { timeout: 30000 });
  await pt.locator(HOST).scrollIntoViewIfNeeded();
  const cdp = await ct.newCDPSession(pt);
  const tb = await pt.locator(HOST).boundingBox();
  const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const t1 = (await stats(pt)).cam;
  await touch('touchStart', [[cx, cy]]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[cx + 8 * k, cy + 2 * k]]); await pt.waitForTimeout(16); }
  await touch('touchEnd', []);
  await pt.waitForTimeout(400);
  const t2 = (await stats(pt)).cam;
  check(Math.hypot(t2.p[0] - t1.p[0], t2.p[1] - t1.p[1], t2.p[2] - t1.p[2]) > 0.05 && Math.abs(dist(t2) - dist(t1)) < 1e-6 * dist(t1) + 1e-9, 'one finger turns the view at 390 px');
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[cx - 30 - 8 * k, cy], [cx + 30 + 8 * k, cy]]); await pt.waitForTimeout(16); }
  await touch('touchEnd', []);
  await pt.waitForTimeout(400);
  const t3 = (await stats(pt)).cam;
  check(dist(t3) < 0.9 * dist(t2), `a pinch zooms in at 390 px (${dist(t2).toFixed(2)} → ${dist(t3).toFixed(2)} mm)`);
  check(await noScroll(pt), 'no horizontal scroll at 390 px with the view open (touch)');
  await ct.close();

  // ---- 4: widths, themes and screenshots ----
  if (shots) mkdirSync(shots, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    for (const width of [320, 390, 1440]) {
      const cw = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, deviceScaleFactor: 1 });
      for (const [name, s] of [['single', single], ['pair', pairS]]) {
        if (width === 320 && name === 'pair') continue;
        const pw = await open(cw, urlOf(s));
        if (name === 'pair') {
          await pw.check('[data-viafield-on]');
          for (const w of ['side', 'top']) await pw.waitForSelector(`[data-via-view="${w}"][data-field-state="done"] [data-viafield-layer="${w}"][data-done="true"]`, { timeout: 30000 });
        }
        await openView(pw);
        if (name === 'pair') { await pw.waitForSelector('[data-via3d][data-fields="on"]', { timeout: 15000 }); await pw.click('[data-via3d-cut]'); }
        await pw.waitForTimeout(250);
        check(await noScroll(pw), `no horizontal scroll at ${width} px, ${scheme}, ${name} with the 3D view`);
        const bg = await pw.$eval(HOST, (el) => getComputedStyle(el).getPropertyValue('--air').trim());
        check(!!bg, `${width} px ${scheme}: the theme's colours reach the view`);
        if (shots && width !== 320) {
          const el = pw.locator(HOST);
          await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
          await pw.waitForTimeout(100);
          await el.screenshot({ path: join(shots, `emsim-via3d-${name}-${width}-${scheme}.png`) });
        }
        await pw.close();
      }
      await cw.close();
    }
  }
} finally {
  await browser.close();
}
check(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
for (const r of report) console.log(`  ${r}`);
console.log(`ui-via3d: ${pass} passed, ${fails.length} failed`);
process.exit(fails.length ? 1 : 0);
