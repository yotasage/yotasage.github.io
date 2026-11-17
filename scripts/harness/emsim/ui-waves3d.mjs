// The Waves section's 3D view in the installed Edge with WebGPU on (step M7.2b), on the LVDS via pair (C45 with the
// fixture's feeds, as ui-player.mjs):
// (1) no chunk with three.js in the first load nor after a run with the player (the Waves chunk), and none until
//     "3D view" is opened; then the chunks it loads (gzip reported) and the first frame's time;
// (2) each plane's texture at a frame equals lib/emsim/wavesPlayer.ts in Node (trackOf on entry A's and entry B's
//     frames, the fixed scale from all frames, rasterOf on the plane's box at the texture's size, framePixels: byte for
//     byte) in three drives and fields; the scale bars' ends are those scales';
// (3) the planes sit where the slices are: barrel A's centre projected to the screen, then picked back off the side
//     plane (and, the side plane off, the cavity plane) lands on barrel A's place in the slice's own mm;
// (4) one clock: a step of the 2D slider shows that frame in 3D, the 3D slider's keys move the 2D player, 3D Play
//     plays both, and during play every frame the 2D player draws is drawn in 3D (the same index);
// (5) playback at 1× (and 2×, a new frame every display frame) at 1440 and 390 px (dpr 3) with both views: rAF
//     intervals and main-thread work per frame (the 2D and 3D pictures and the 3D draw), budget at 1×: interval p95
//     ≤ 20 ms and work p95 ≤ 8 ms; 4× CPU throttle reported, not checked;
// (6) mouse drag turns, the wheel zooms, keys turn and zoom and Home resets, Reset view; at 390 px touch turns and
//     pinches; the planes' switches hide and show a plane; the loop rests while both views are off screen and runs
//     with only the 3D view in view; under reduced motion nothing plays by itself;
// (7) five open/close cycles: every WebGL context lost, the canvas gone, the renderer's geometries and textures back
//     to zero; a new run during 3D playback closes the view, and its cancel frees every frame (the planes' combined
//     ones too) and the GPU buffers stay as at each run's start;
// (8) no horizontal scroll at 320/390/1440 in both themes with the view open; screenshots `emsim-waves3d-390-dark` and
//     `emsim-waves3d-1440-light`;
// (9) a microstrip section: its planes (above, along, across: the player's two views from above, Ez and |E| on planes
//     11 µm apart, are one), at first from above and across without a cut; screenshot `emsim-waves3d-trace-1440-dark` (the view alone).
//   tsx ui-waves3d.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedWp from '../../../lib/emsim/wavesPlayer.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), V = d(importedVia), WP = d(importedWp);
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=d3d11', '--ignore-gpu-blocklist'];

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;
let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) { pass++; console.log(`ok   ${what}`); } else { fails.push(what); console.log(`FAIL ${what}`); } };
const pairS = SU.defaultSetup();
const preset = V.presetVia('pair', pairS.stackup);
pairS.via = { ...preset, feeds: [{ ...preset.feeds[0], angle: 180 }, { ...preset.feeds[1], angle: 0 }] };
const URL1 = `${URL0}?${LK.encodeLink(pairS)}#waves`;
const P = '[data-waves-player]', W = '[data-waves3d]', HOST = '[data-waves3d-host]';
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };

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
  const newPage = async (opt, url = URL1, js = null) => {
    const c = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', ...opt });
    await c.addInitScript(trackGl);
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(String(e)));
    if (js) p.on('response', (r) => { if (r.url().endsWith('.js')) js.push(r.url()); });
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await p.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
    await p.waitForTimeout(300);
    return p;
  };
  const runToPlayer = async (p) => {
    await p.click('[data-waves-run]');
    await p.waitForSelector(`[data-waves-results][data-stale="false"] ${P}`, { timeout: 180000 });
    await p.locator(P).scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
  };
  const open3d = async (p) => {
    await p.click('[data-waves3d-open]');
    await p.waitForSelector(`${W}[data-waves3d-ready="true"]`, { timeout: 30000 });
    return Number(await p.getAttribute(W, 'data-open-ms'));
  };
  const close3d = async (p) => { await p.click('[data-waves3d-open]'); await p.waitForTimeout(100); };
  const A = (p, a) => p.locator(P).getAttribute(a);
  const frame = async (p) => Number(await A(p, 'data-player-frame'));
  const frame3 = async (p) => Number(await p.getAttribute(W, 'data-waves3d-frame'));
  const pause = async (p) => { if ((await A(p, 'data-player-playing')) === 'true') await p.click('[data-player-play]'); await p.waitForTimeout(50); };
  const play = async (p) => { if ((await A(p, 'data-player-playing')) !== 'true') await p.click('[data-player-play]'); };
  const seek = (p, k) => p.evaluate((k) => document.querySelector('[data-waves-player]').emsimPlayer.seek(k), k);
  const v3 = (p, f, arg) => p.$eval(HOST, f, arg);
  const cam = (p) => v3(p, (el) => el.emsimWaves3d.view.cameraState());
  const dist = (c) => Math.hypot(c.p[0] - c.t[0], c.p[1] - c.t[1], c.p[2] - c.t[2]);
  const has3 = async (urls) => {
    const out = [];
    for (const u of urls) { const b = Buffer.from(await (await fetch(u)).arrayBuffer()); if (b.includes('WebGLRenderer')) out.push({ u, gz: gzipSync(b, { level: 9 }).length }); }
    return out;
  };

  // ---- 1: three.js only when the 3D view opens ----
  const js = [];
  const page = await newPage({}, URL1, js);
  const first = [...new Set(js)];
  check((await has3(first)).length === 0, `no chunk with three.js in the first load (${first.length} chunks)`);
  await runToPlayer(page);
  const withPlayer = [...new Set(js)];
  check((await has3(withPlayer)).length === 0 && await page.locator('[data-waves3d-canvas]').count() === 0, `none after a run with the player shown (${withPlayer.length} chunks), no 3D canvas`);
  await pause(page);
  const openMs = await open3d(page);
  const after = [...new Set(js)].filter((u) => !withPlayer.includes(u));
  const three = await has3(after);
  const gz = (await Promise.all(after.map(async (u) => gzipSync(Buffer.from(await (await fetch(u)).arrayBuffer()), { level: 9 }).length))).reduce((a, b) => a + b, 0);
  check(three.length >= 1, `opening loads three.js (${after.length} new chunks, ${(gz / 1024).toFixed(1)} kB gzip)`);
  report.push(`3D view chunks on open: ${after.length}, ${(gz / 1024).toFixed(1)} kB gzip (with three.js: ${three.map((x) => (x.gz / 1024).toFixed(1)).join(' + ')} kB)`);
  check(openMs > 0 && openMs < 2000, `the view's first frame ${openMs} ms after the click (budget 2000, cold chunk)`);
  const nPl = Number(await page.getAttribute(W, 'data-waves3d-planes'));
  const plNames = await page.$$eval('[data-waves3d-plane]', (es) => es.map((e) => e.getAttribute('data-waves3d-plane')));
  check(nPl === 4 && plNames.join() === 'side,entry,cavity,exit' && Number(await page.getAttribute(W, 'data-waves3d-shown')) === 4, `four planes, all on: ${plNames.join(', ')}`);

  // ---- 2: the textures against Node ----
  const info = await page.evaluate(() => {
    const r = window.__emsimWaves.result.snap;
    return { slices: r.slices.map((s) => ({ comp: s.comp, normal: s.normal, at: s.at, nu: s.nu, nv: s.nv, u: Array.from(s.u), v: Array.from(s.v) })), max: r.max };
  });
  const slices = info.slices.map((s) => ({ ...s, u: Float32Array.from(s.u), v: Float32Array.from(s.v) }));
  // both runs' frames, every slice, once (about 24 MiB)
  const raw = await page.evaluate(() => {
    const e = document.querySelector('[data-waves-player]').emsimPlayer;
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    const pack = (fs) => fs.map((f) => ({ t: f.t, step: f.step, scale: Array.from(f.scale), data: f.data.map((x) => b64(new Uint8Array(x.buffer, x.byteOffset, x.byteLength))), signed: f.data.map((x) => x instanceof Int8Array) }));
    return { A: pack(e.store.frames), B: pack(e.store.pair) };
  });
  const unpack = (fs) => fs.map((f) => ({ step: f.step, t: f.t, scale: Float32Array.from(f.scale), data: f.data.map((b, k) => { const buf = Buffer.from(b, 'base64'); const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.length); return f.signed[k] ? new Int8Array(u8.buffer, u8.byteOffset, u8.length) : u8.slice(); }) }));
  const RA = unpack(raw.A), RB = unpack(raw.B);
  const n = RA.length;
  const planesOf = (p) => v3(p, (el) => {
    const w = el.emsimWaves3d, on = w.on();
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    return w.planes().map((pl, k) => ({ view: pl.view.view, comp: pl.comp, src: pl.src, key: pl.key, box: pl.place.box, tw: pl.place.tw, th: pl.place.th, top: pl.ps.top, on: on[k],
      px: on[k] ? b64(new Uint8Array(pl.px.buffer, pl.px.byteOffset, pl.px.byteLength)) : '' }));
  });
  const nodeTex = (pl, mode, k) => {
    const tk = WP.trackOf([RA, RB], pl.src, pl.comp, mode, info.max);
    const ps = WP.playScale(tk.frames, tk.si, pl.comp, tk.max);
    const r = WP.rasterOf(slices[pl.src[0]], pl.tw, pl.th, pl.box);
    const out = new Uint32Array(pl.tw * pl.th);
    WP.framePixels(r, tk.frames[k].data[tk.si], tk.frames[k].scale[tk.si], ps, out);
    return { bytes: new Uint8Array(out.buffer), top: ps.top, scale: ps.scale };
  };
  for (const [v, c, m, k] of [['side', 'E', 'single', 60], ['side', 'E', 'diff', 95], ['entry', 'Ez', 'common', 130], ['side', 'Ex', 'diff', 75]]) {
    await page.click(`[data-player-view-set="${v}"]`);
    if (v === 'side') await page.click(`[data-player-comp-set="${c}"]`);
    await page.click(`[data-player-mode-set="${m}"]`);
    await seek(page, k);
    await page.waitForTimeout(80);
    const pls = await planesOf(page);
    const f3 = await frame3(page);
    const res = pls.map((pl) => {
      const nd = nodeTex(pl, m, k), mine = nd.bytes, theirs = Buffer.from(pl.px, 'base64');
      let diff = mine.length === theirs.length ? 0 : -1;
      if (diff === 0) for (let i = 0; i < mine.length; i++) if (mine[i] !== theirs[i]) diff++;
      return { view: pl.view, comp: pl.comp, diff, bytes: mine.length, top: pl.top === nd.top, size: `${pl.tw}×${pl.th}`, lo: nd.scale.lo, hi: nd.scale.hi };
    });
    const bars = await page.$$eval('[data-waves3d-scale]', (es) => es.map((e) => ({ v: e.getAttribute('data-waves3d-scale'), lo: Number(e.getAttribute('data-lo')), hi: Number(e.getAttribute('data-hi')), c: e.getAttribute('data-comp') })));
    const barsOk = res.every((r) => bars.some((b) => b.v === r.view && b.c === r.comp && b.lo === r.lo && b.hi === r.hi));
    const want = res.map((r) => r.comp).join();
    check(f3 === k && res.every((r) => r.diff === 0 && r.top) && barsOk, `${m} drive, ${c} chosen, frame ${k}: every plane's texture equals Node byte for byte (${res.map((r) => `${r.view} ${r.comp} ${r.size}: ${r.diff} of ${r.bytes} differ`).join('; ')}), scales and bars as Node's`);
    if (k === 60) check(want === 'E,Ez,Ez,Ez', `with |E| chosen the side plane shows |E|, the top planes Ez (${want})`);
  }

  // ---- 3: the planes sit where the slices are ----
  await page.locator(W).scrollIntoViewIfNeeded();
  await page.click('[data-waves3d-reset]');
  await page.waitForTimeout(300);
  const geo = await page.evaluate(() => { const m = window.__emsimWaves.preview.geom; const a = m.cyl.find((c) => c.name === 'A'); return { ax: a.x, ay: a.y, thick: m.thick }; });
  const pls0 = await planesOf(page);
  const sideP = pls0.find((x) => x.view === 'side'), cav = pls0.find((x) => x.view === 'cavity');
  const sliceAt = (v) => slices[pls0.find((x) => x.view === v).src[0]].at;
  const pick = async (pt, key) => v3(page, (el, [pt, key]) => { const v = el.emsimWaves3d.view; const [x, y] = v.project(pt); const h = v.probe(x, y); return h && h.key === key ? { ...h, x, y } : { miss: true, h, x, y }; }, [pt, key]);
  const texel = (pl) => Math.max((pl.box.u1 - pl.box.u0) / pl.tw, (pl.box.v1 - pl.box.v0) / pl.th);
  const zMid = geo.thick / 2;
  const hs = await pick([geo.ax, sliceAt('side'), zMid], '0');
  const us = sideP.box.u0 + hs.s * (sideP.box.u1 - sideP.box.u0), vs = sideP.box.v1 - hs.t * (sideP.box.v1 - sideP.box.v0);
  check(!hs.miss && Math.abs(us - geo.ax) < 2 * texel(sideP) && Math.abs(vs - zMid) < 2 * texel(sideP), `barrel A's centre at mid-board, projected (${hs.x?.toFixed(0)}, ${hs.y?.toFixed(0)} px) and picked off the side plane, is at u ${us.toFixed(4)} mm, z ${vs.toFixed(4)} mm in the slice (barrel A at x ${geo.ax}, z ${zMid.toFixed(4)}; a texel ${texel(sideP).toFixed(4)} mm)`);
  check((await page.getAttribute('[data-waves3d-cut]', 'aria-pressed')) === 'true', 'the cut along the side plane is on at first');
  await page.click('[data-waves3d-cut]');
  await page.waitForTimeout(50);
  const hx = await pick([geo.ax, sliceAt('side'), zMid], '1');
  check(!hx.miss, `with the cut off the same point is behind the plane at the entry feed (picked: ${hx.miss ? JSON.stringify(hx.h) : 'entry'})`);
  await page.click('[data-waves3d-cut]');
  await page.click('[data-waves3d-plane="side"]');
  const yb = geo.ay + 0.05; // just behind the cut
  const hc = await pick([geo.ax, yb, sliceAt('cavity')], '2');
  const uc = cav.box.u0 + hc.s * (cav.box.u1 - cav.box.u0), vc = cav.box.v1 - hc.t * (cav.box.v1 - cav.box.v0);
  check(!hc.miss && Math.abs(uc - geo.ax) < 2 * texel(cav) && Math.abs(vc - yb) < 2 * texel(cav), `with the side plane off, the point 0.05 mm behind barrel A's centre picked off the cavity plane is at (${uc.toFixed(4)}, ${vc.toFixed(4)}) mm (wanted (${geo.ax}, ${yb}))`);
  // the 2D player's side view is the same slice: its box holds the plane's u range around barrel A
  const box2d = JSON.parse(await (async () => { await page.click('[data-player-view-set="side"]'); return A(page, 'data-player-box'); })());
  check(box2d.u0 <= geo.ax && box2d.u1 >= geo.ax && Math.abs(box2d.u0 - sideP.box.u0) < 1 && Math.abs(box2d.v0 - sideP.box.v0) < 1, `the 2D side view's box ${JSON.stringify(box2d)} and the 3D side plane's ${JSON.stringify(sideP.box)} are of the same slice`);
  const hidden = await planesOf(page);
  check(Number(await page.getAttribute(W, 'data-waves3d-shown')) === 3 && hidden.find((x) => x.view === 'side').on === false && await page.locator('[data-waves3d-scale="side"]').count() === 0, 'the side plane\'s switch hides it and its scale bar');
  await page.click('[data-waves3d-plane="side"]');
  await page.waitForTimeout(50);
  check(Number(await page.getAttribute(W, 'data-waves3d-shown')) === 4, 'and shows it again');

  // ---- 4: one clock ----
  await page.click('[data-player-mode-set="single"]'); await page.click('[data-player-comp-set="E"]');
  await page.locator('[data-player-time]').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(50);
  const wf = await v3(page, (el) => el.emsimWaves3d.view.stats.waveFrame);
  check(await frame(page) === 4 && await frame3(page) === 4 && wf === 4 && Number(await page.inputValue('[data-waves3d-time]')) === 4, `the 2D slider's keys (Home, → × 4) show frame 4 in 3D (drawn ${wf}, its slider ${await page.inputValue('[data-waves3d-time]')})`);
  await page.locator('[data-waves3d-time]').focus();
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageUp');
  await page.waitForTimeout(50);
  const f2 = await frame(page), f3b = await frame3(page);
  check(f2 === f3b && f2 > 11 && Number(await page.inputValue('[data-player-time]')) === f2 && (await page.locator('[data-player-time-text]').textContent()) === (await page.locator('[data-waves3d-time-text]').textContent()),
    `the 3D slider's keys (→ × 7, Page Up) move the 2D player to the same frame (${f2} and ${f3b}), the same time shown`);
  await page.click('[data-player-speed-set="1"]');
  await page.click('[data-waves3d-play]');
  await page.waitForTimeout(600);
  const pl3 = await A(page, 'data-player-playing'), btn = await page.locator('[data-waves3d-play]').textContent();
  const sync = await page.evaluate(async () => {
    const e = document.querySelector('[data-waves-player]').emsimPlayer, v = document.querySelector('[data-waves3d-host]').emsimWaves3d.view;
    const out = [];
    for (let i = 0; i < 40; i++) { await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); out.push([e.shown, v.stats.waveFrame]); }
    return out;
  });
  await page.click('[data-waves3d-play]');
  check(pl3 === 'true' && btn === 'Pause' && (await A(page, 'data-player-playing')) === 'false' && sync.every(([a, b]) => a === b) && sync[39][0] !== sync[0][0], `3D Play plays both views (the 2D player playing, the button "${btn}"), and after each of 40 display frames the 3D frame is the 2D one (${sync[0].join('/')} … ${sync[39].join('/')}); Pause stops both`);

  // ---- 5: playback with both views ----
  const timing = async (p, rate, speed) => {
    await p.click('[data-player-view-set="side"]'); await p.click('[data-player-comp-set="E"]'); await p.click('[data-player-mode-set="diff"]');
    await p.click(`[data-player-speed-set="${speed}"]`);
    await p.evaluate(() => { const h = document.querySelector('[data-waves3d-host]'); window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 120); });
    await play(p);
    const cdp = await p.context().newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await p.waitForTimeout(300);
    const s0 = await p.evaluate(() => { const s = document.querySelector('[data-waves-player]').emsimPlayer.stats, v = document.querySelector('[data-waves3d-host]').emsimWaves3d.view.stats; return { i: s.intervals.length, w: s.work.length, d: s.draws, d3: v.waveDraws }; });
    await p.waitForTimeout(3000);
    const s = await p.evaluate((s0) => {
      const e = document.querySelector('[data-waves-player]').emsimPlayer, st = e.stats, v = document.querySelector('[data-waves3d-host]').emsimWaves3d.view;
      return { iv: st.intervals.slice(-(st.intervals.length - s0.i)), wk: st.work.slice(-(st.work.length - s0.w)), draws: st.draws - s0.d, draws3: v.stats.waveDraws - s0.d3, same: e.shown === v.stats.waveFrame,
        running: e.running, canvas: v.renderer.domElement.width + 'x' + v.renderer.domElement.height };
    }, s0);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await cdp.detach();
    await pause(p);
    await p.click('[data-player-speed-set="1"]');
    return { rate, speed, frames: s.iv.length, draws: s.draws, draws3: s.draws3, same: s.same, p50: q(s.iv, 0.5), p95: q(s.iv, 0.95), dropped: s.iv.filter((x) => x > 25).length, w50: q(s.wk, 0.5), w95: q(s.wk, 0.95), canvas: s.canvas };
  };
  const rows = [];
  for (const [r, sp] of [[1, 1], [1, 2], [4, 1]]) rows.push({ label: '1440 px', ...(await timing(page, r, sp)) });
  const phone = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  await runToPlayer(phone);
  await pause(phone);
  await open3d(phone);
  for (const [r, sp] of [[1, 1], [1, 2], [4, 1]]) rows.push({ label: '390 px, dpr 3', ...(await timing(phone, r, sp)) });
  console.log('  playback with the 2D player and the 3D view (four planes), 3 s, side |E| in the differential drive; ms:');
  console.log('  | width | CPU | speed | 3D canvas | ticks | 2D draws | 3D draws | interval p50 | interval p95 | over 25 ms | work p50 | work p95 |');
  for (const r of rows) {
    const line = `| ${r.label} | ${r.rate}× | ${r.speed}× | ${r.canvas} | ${r.frames} | ${r.draws} | ${r.draws3} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.dropped} | ${r.w50.toFixed(2)} | ${r.w95.toFixed(2)} |`;
    console.log(`  ${line}`);
    report.push(line);
    if (r.rate === 1) check(r.frames > 120 && r.p95 <= 20 && r.w95 <= 8 && r.draws3 === r.draws && r.draws >= (r.speed === 1 ? 0.8 * 3 * WP.FPS_1X : 100) && r.same,
      `${r.label} at ${r.speed}× speed: interval p95 ${r.p95.toFixed(1)} ms (budget 20), work p95 ${r.w95.toFixed(2)} ms (budget 8), ${r.draws} 2D frames and ${r.draws3} 3D frames drawn, the same index at the end`);
    else check(r.frames > 30 && r.draws3 === r.draws, `${r.label} at ${r.rate}× CPU: it keeps playing (${r.frames} ticks, ${r.draws3} of ${r.draws} frames in 3D, work p95 ${r.w95.toFixed(2)} ms)`);
  }

  // ---- 6: mouse, keys, touch; off screen; reduced motion ----
  await page.locator(W).scrollIntoViewIfNeeded();
  await page.click('[data-waves3d-reset]');
  await page.waitForTimeout(300);
  const c0 = await cam(page);
  const hb = await page.locator(HOST).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(hb.x + hb.width / 2 + 12 * k, hb.y + hb.height / 2 + 2 * k);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const c1 = await cam(page);
  check(Math.hypot(c1.p[0] - c0.p[0], c1.p[1] - c0.p[1]) > 0.05 * dist(c0) && Math.abs(dist(c1) - dist(c0)) < 0.02 * dist(c0), 'a mouse drag turns the view about its target');
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  const c2 = await cam(page);
  check(dist(c2) < 0.95 * dist(c1), `the wheel zooms in (${dist(c1).toFixed(2)} → ${dist(c2).toFixed(2)} mm)`);
  await page.locator(HOST).focus();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  const c3 = await cam(page);
  await page.keyboard.press('-');
  await page.waitForTimeout(100);
  const c4 = await cam(page);
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  const c5 = await cam(page);
  check(Math.hypot(c3.p[0] - c2.p[0], c3.p[1] - c2.p[1], c3.p[2] - c2.p[2]) > 0.05 * dist(c2) && dist(c4) > 1.15 * dist(c3) && Math.hypot(c5.p[0] - c0.p[0], c5.p[1] - c0.p[1], c5.p[2] - c0.p[2]) < 1e-3 * dist(c0),
    'keys: arrows turn, − zooms out, Home resets to the first view');
  await page.mouse.move(hb.x + 30, hb.y + 30); await page.mouse.down(); await page.mouse.move(hb.x + 120, hb.y + 60); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.click('[data-waves3d-reset]');
  await page.waitForTimeout(300);
  const c6 = await cam(page);
  check(Math.hypot(c6.p[0] - c0.p[0], c6.p[1] - c0.p[1], c6.p[2] - c0.p[2]) < 1e-3 * dist(c0), 'Reset view goes back to the first view');
  // touch at 390 px
  await phone.click('[data-waves3d-reset]');
  await phone.evaluate(() => { const h = document.querySelector('[data-waves3d-host]'); window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 80); });
  await phone.waitForTimeout(300);
  const t0 = await cam(phone);
  const pb = await phone.locator(HOST).boundingBox();
  const tcdp = await phone.context().newCDPSession(phone);
  const touch = (type, pts) => tcdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const cx = pb.x + pb.width / 2, cy = pb.y + pb.height / 2;
  await touch('touchStart', [[cx, cy]]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[cx + 8 * k, cy + 2 * k]]); await phone.waitForTimeout(16); }
  await touch('touchEnd', []);
  await phone.waitForTimeout(400);
  const t1 = await cam(phone);
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[cx - 30 - 8 * k, cy], [cx + 30 + 8 * k, cy]]); await phone.waitForTimeout(16); }
  await touch('touchEnd', []);
  await phone.waitForTimeout(400);
  const t2 = await cam(phone);
  await tcdp.detach();
  const turned = Math.hypot(t1.p[0] - t0.p[0], t1.p[1] - t0.p[1]);
  check(turned > 0.03 * dist(t0) && dist(t2) < 0.95 * dist(t1), `390 px: one finger turns (${turned.toFixed(2)} mm), two pinch to zoom (${dist(t1).toFixed(2)} → ${dist(t2).toFixed(2)} mm)`);
  await phone.context().close();
  // off screen: both views out of view rest the loop (and the renderer's idle loop); the 3D view alone keeps it going
  await play(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const offA = await A(page, 'data-player-running'), offL = await v3(page, (el) => el.emsimWaves3d.view.looping), offF = await frame3(page);
  await page.waitForTimeout(400);
  check(offA === 'false' && offL === false && await frame3(page) === offF && (await A(page, 'data-player-playing')) === 'true', 'with both views off screen the loop rests (still set to play) and the 3D renderer\'s idle loop too');
  await page.evaluate(() => { const h = document.querySelector('[data-waves3d-host]'); window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 10); });
  await page.waitForTimeout(400);
  const fig = await page.locator('[data-player-canvas]').boundingBox();
  const vis2d = fig.y + fig.height > 0 && fig.y < 1000;
  const runA = await A(page, 'data-player-running'), runF = await frame3(page);
  await page.waitForTimeout(300);
  check(!vis2d && runA === 'true' && await frame3(page) !== runF && await v3(page, (el) => el.emsimWaves3d.view.looping), 'with only the 3D view in view it plays on');
  await pause(page);
  const rm = await newPage({ reducedMotion: 'reduce' });
  await runToPlayer(rm);
  await open3d(rm);
  await rm.waitForTimeout(600);
  check((await A(rm, 'data-player-playing')) === 'false' && await frame3(rm) === 0 && await frame(rm) === 0, 'under reduced motion nothing plays by itself with the 3D view open (frame 0 in both)');
  await rm.context().close();

  // ---- 7: closing disposes; a new run during 3D playback frees everything ----
  const gls = [];
  for (let k = 0; k < 5; k++) {
    if (k > 0) await open3d(page);
    await page.waitForTimeout(150);
    await close3d(page);
    const g = await page.evaluate(() => {
      const r = document.querySelector('[data-waves-player]');
      const z = r.emsimWaves3dGone;
      return { n: window.__gl.length, lost: window.__gl.filter((c) => c.isContextLost()).length, mem: z?.memory, made: z?.texMade, freed: z?.texFreed, canvas: document.querySelectorAll('[data-waves3d-canvas]').length, listeners: r.emsimPlayer.listeners.size, more: (r.emsimPlayer.store.more ?? []).length };
    });
    gls.push(g);
  }
  const lastGl = gls[gls.length - 1];
  check(lastGl.n >= 5 && gls.every((g) => g.lost === g.n && g.canvas === 0 && g.mem && g.mem.geometries === 0 && g.mem.textures <= 1 && g.made >= 4 && g.freed === g.made && g.listeners === 0 && g.more === 0),
    `five open/close cycles: every WebGL context lost (${lastGl.lost} of ${lastGl.n}), the canvas gone, every wave texture disposed (${lastGl.freed} of ${lastGl.made}), the renderer's geometries at zero and its textures ${lastGl.mem?.textures} (three.js's own DFG table of the standard materials, gone with the context), the engine's listener and the planes' combined frames gone`);
  const cdp = await page.context().newCDPSession(page);
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); await page.waitForTimeout(100); await cdp.send('HeapProfiler.collectGarbage'); const h = await cdp.send('Runtime.getHeapUsage'); return h.usedSize + (h.backingStorageSize ?? 0); };
  const helds = [];
  const runAndCancel = async (what) => {
    await open3d(page);
    await page.click('[data-player-mode-set="diff"]');
    await page.waitForTimeout(200);
    await page.click('[data-waves3d-play]');
    await page.waitForTimeout(400);
    const w = await page.evaluate(() => {
      const e = document.querySelector('[data-waves-player]').emsimPlayer, s = e.store;
      const more = s.more ?? [];
      window.__weak = [new WeakRef(s.frames), new WeakRef(s.pair[0].data[0]), ...more.map((m) => new WeakRef(m.frames)), ...more.map((m) => new WeakRef(m.frames[5].data[0]))];
      const of = (fs) => fs.reduce((a, f) => a + f.data.reduce((b, x) => b + x.byteLength, 0), 0);
      return { more: more.length, weak: window.__weak.length, bytes: of(s.frames) + of(s.pair) + more.reduce((a, m) => a + of(m.frames), 0) };
    });
    const playing = await A(page, 'data-player-playing');
    const h1 = await heap();
    await page.click('[data-waves-run]');
    await page.waitForSelector('[data-waves-held]:not([data-waves-held=""])', { timeout: 60000 });
    const gone = await page.locator(W).count() === 0 && await page.locator(P).count() === 0;
    await page.waitForFunction(() => Number(document.querySelector('[data-waves-progress]')?.getAttribute('data-waves-progress')) > 0.05, null, { timeout: 60000 });
    helds.push(await page.locator('[data-waves]').getAttribute('data-waves-held'));
    await page.click('[data-waves-cancel]');
    await page.waitForTimeout(800);
    const h2 = await heap();
    const left = await page.evaluate(() => window.__weak.filter((x) => x.deref() !== undefined).length);
    const g = await page.evaluate(() => ({ n: window.__gl.length, lost: window.__gl.filter((c) => c.isContextLost()).length }));
    check(playing === 'true' && w.more >= 4 && gone && left === 0 && g.lost === g.n && h1 - h2 >= 0.8 * w.bytes,
      `${what}: a new run during 3D playback closes the view, and after its cancel no frame is reachable (${left} of ${w.weak} watched, the planes' ${w.more} combined tracks among them), every WebGL context lost (${g.lost} of ${g.n}), the heap falls by ${((h1 - h2) / 1048576).toFixed(1)} MiB (held ${(w.bytes / 1048576).toFixed(1)} MiB)`);
    await runToPlayer(page);
    await pause(page);
  };
  await runAndCancel('cancel during 3D playback');
  await runAndCancel('again');
  check(helds.length === 2 && Number(helds[0].split('/')[0]) > 0 && helds[0] === helds[1], `the GPU buffers held at each run's start stay the same (${helds.join(', ')})`);
  await cdp.detach();
  await page.context().close();

  // ---- 8: widths, themes, screenshots ----
  if (shots) mkdirSync(shots, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    const p = await newPage({ colorScheme: scheme });
    await runToPlayer(p);
    await pause(p);
    await open3d(p);
    for (const width of [320, 390, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      await p.waitForTimeout(300);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      check(sw <= width, `no horizontal scroll at ${width} px, ${scheme}, with the 3D view open (${sw})`);
      if (shots && ((width === 390 && scheme === 'dark') || (width === 1440 && scheme === 'light'))) {
        await p.click('[data-player-view-set="side"]'); await p.click('[data-player-comp-set="E"]'); await p.click('[data-player-mode-set="diff"]');
        await p.click('[data-waves3d-reset]');
        await seek(p, 60);
        // the whole view below the page's sticky header: a window tall enough, the view 110 px from its top
        const hh = await p.$eval(W, (e) => e.getBoundingClientRect().height);
        await p.setViewportSize({ width, height: Math.ceil(hh) + 160 });
        await p.evaluate(() => { const e = document.querySelector('[data-waves3d]'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 110); });
        await p.waitForTimeout(500);
        const bb = await p.locator(W).boundingBox();
        const buf = await p.screenshot({ clip: { x: 0, y: Math.max(0, bb.y - 8), width, height: bb.height + 16 } });
        await p.setViewportSize({ width, height: 900 });
        const small = await p.evaluate(async (src) => {
          const img = new Image(); img.src = src; await img.decode();
          const w = Math.min(1000, img.width), h = Math.round((img.height * w) / img.width);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, h);
          return c.toDataURL('image/png').split(',')[1];
        }, `data:image/png;base64,${buf.toString('base64')}`);
        writeFileSync(join(shots, `emsim-waves3d-${width}-${scheme}.png`), Buffer.from(small, 'base64'));
      }
    }
    await p.context().close();
  }
  // ---- 9: a microstrip section: its planes, the cut along the trace, a screenshot ----
  const tp = await newPage({ colorScheme: 'dark', reducedMotion: 'reduce' }, `${URL0}#waves`);
  await tp.click('[data-waves-kind-set="trace"]');
  await tp.waitForTimeout(300);
  await tp.waitForSelector('[data-waves-estimate="ready"]', { timeout: 60000 });
  await runToPlayer(tp);
  await open3d(tp);
  const tnames = await tp.$$eval('[data-waves3d-plane]', (es) => es.map((e) => e.getAttribute('data-waves3d-plane')));
  const tcomps = await tp.$$eval('[data-waves3d-scale]', (es) => es.map((e) => e.getAttribute('data-comp')));
  const tview = await tp.locator('[data-player-views]').getAttribute('data-player-views');
  check(tnames.join() === 'above,along,across' && tcomps.join() === 'Ez,E' && (await tp.getAttribute('[data-waves3d-cut]', 'aria-pressed')) === 'false'
    && (await tp.getAttribute('[data-waves3d-plane="along"]', 'aria-pressed')) === 'false',
    `a microstrip section: planes ${tnames.join(', ')} (the player's ${tview} views: Ez and |E| from above are one plane), at first from above and across (fields ${tcomps.join(', ')} with Ez chosen), the plane along the trace off and no cut`);
  await tp.click('[data-waves3d-plane="along"]'); await tp.click('[data-waves3d-cut]');
  await tp.waitForTimeout(100);
  const tcomps2 = await tp.$$eval('[data-waves3d-scale]', (es) => es.map((e) => e.getAttribute('data-comp')));
  check(tcomps2.join() === 'Ez,E,E', `with the plane along the trace on: fields ${tcomps2.join(', ')}`);
  await tp.click('[data-waves3d-plane="along"]'); await tp.click('[data-waves3d-cut]');
  if (shots) {
    await seek(tp, 70);
    const hh = await tp.$eval(HOST, (e) => e.getBoundingClientRect().height);
    await tp.evaluate(() => { const e = document.querySelector('[data-waves3d-host]'); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - 110); });
    await tp.waitForTimeout(500);
    const bb = await tp.locator(HOST).boundingBox();
    writeFileSync(join(shots, 'emsim-waves3d-trace-1440-dark.png'), await tp.screenshot({ clip: { x: bb.x, y: bb.y, width: bb.width, height: Math.min(hh, bb.height) } }));
  }
  await tp.context().close();
  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
for (const r of report) console.log(`  ${r}`);
console.log(`ui-waves3d: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
