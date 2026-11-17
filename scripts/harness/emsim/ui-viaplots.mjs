// The Via section's plots in the installed Edge (step M3.2a): on the default via (2 mm feeds) the TDR, TDT, |S11| and
// |S21| points equal the engine's viaModel in Node with the page's options (three times, three frequencies, in dB), with
// the port and trace lines, the faded range beyond the model's validity and the note that 2 mm feeds are too short for
// their flat part at 35 ps; with 25 mm feeds the flat parts before and after the via equal the trace's Z0 within the
// record's stated error (the milestone's "done when"); the rise time (presets and typed, a refused one) changes the
// TDR as the engine does and the peak moves toward the via's lumped √(L/C) at slower edges; the port impedance typed;
// the pair's differential and common TDR and its mixed-mode terms (Sdd, Scc, Scd) equal the engine's; the cursor
// shared by the TDR and TDT and another by the S plots (pointer, arrow keys, tap on a phone); no horizontal scroll at
// 320/390/1440 in both themes; screenshots `emsim-viaplots-{single,pair}-{390,1440}-{light,dark}`.
//   tsx ui-viaplots.mjs [screenshot folder | -] [base URL]      (part of npm run ui)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from 'playwright-core';

import * as importedLink from '../../../lib/emsim/link.ts';
import * as importedSetup from '../../../lib/emsim/setup.ts';
import * as importedStackup from '../../../lib/emsim/stackup.ts';
import * as importedVia from '../../../lib/emsim/via.ts';
import * as importedModel from '../../../lib/emsim/viamodel.ts';
import * as importedPlot from '../../../lib/emsim/plot.ts';

const d = (m) => m.default ?? m;
const LK = d(importedLink), SU = d(importedSetup), S = d(importedStackup), V = d(importedVia), VM = d(importedModel), PL = d(importedPlot);
const C0 = 299792458;
const optOf = (tr = 35e-12, z0 = 50) => ({ tr, z0, nf: 401 }); // ViaSection's viaOpt(tr, z0)

const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3022';
const URL0 = `${base}/em-sim/main`;

let pass = 0;
const fails = [];
const check = (ok, what) => { if (ok) pass++; else { fails.push(what); console.log(`FAIL ${what}`); } };
const same = (a, b, rel = 1e-12) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= rel * Math.max(1e-30, Math.abs(b));
const urlOf = (s) => `${URL0}?${LK.encodeLink(s)}#via`;
const engineOf = (s, tr, z0) => VM.viaModel(s.stackup, s.via, s.trace, optOf(tr, z0));
const sDb = (np, k, i, j) => { const o = 2 * ((k * np.ports + i) * np.ports + j); return PL.dbOf(np.s[o], np.s[o + 1]); };

const single = SU.defaultSetup();
const longFeeds = SU.defaultSetup();
longFeeds.via.feeds = longFeeds.via.feeds.map((f) => ({ ...f, length: S.val(25) }));
const pairS = SU.defaultSetup();
pairS.via = V.presetVia('pair', pairS.stackup);

const browser = await chromium.launch({ channel: 'msedge' });
try {
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  const watch = (p) => p.on('pageerror', (e) => errors.push(String(e)));
  const plotted = async (p, attrs = '') => {
    await p.waitForTimeout(40);
    await p.waitForSelector(`[data-via-plots][data-stale="false"]${attrs}`, { timeout: 60000 });
  };
  const open = async (url, c = ctx) => {
    const p = await c.newPage();
    watch(p);
    await p.goto(url);
    await p.waitForSelector('[data-ready="true"]', { timeout: 30000 });
    await plotted(p);
    return p;
  };
  const plot = (p, name) => p.locator(`[data-plot="${name}"]`);
  const reading = async (p, name) => {
    const el = plot(p, name).locator('[data-plot-readout]');
    return { x: Number(await el.getAttribute('data-cursor')), v: Number((await el.getAttribute('data-values')).split(' ')[0]), text: await el.innerText() };
  };
  // The cursor on point m of a plot by keys: Home, then Shift+→ (ten points) and → (one).
  const cursorTo = async (p, name, m) => {
    await plot(p, name).locator('[data-plot-box]').focus();
    await p.keyboard.press('Home');
    for (let i = 0; i < Math.floor(m / 10); i++) await p.keyboard.press('Shift+ArrowRight');
    for (let i = 0; i < m % 10; i++) await p.keyboard.press('ArrowRight');
    return reading(p, name);
  };
  const tdrAt = async (p, E, ms, what, T = E.tdr) => {
    for (const m of ms) {
      const a = await cursorTo(p, 'via-tdr', m), b = await reading(p, 'via-tdt');
      check(a.x === T.t[m] && same(a.v, T.z[m]), `${what}: the TDR at ${(T.t[m] * 1e12).toFixed(1)} ps is the engine's ${T.z[m].toFixed(4)} Ω (page ${a.v})`);
      check(b.x === T.t[m] && (same(b.v, T.tdt[m]) || Math.abs(b.v - T.tdt[m]) <= 1e-14), `${what}: the TDT at the shared cursor is the engine's ${T.tdt[m].toFixed(5)} (page ${b.v})`);
    }
  };
  const sAt = async (p, np, ks, ij, names, what) => {
    for (const k of ks) {
      const a = await cursorTo(p, 'via-s11', k - 1), b = await reading(p, 'via-s21'); // the plots leave DC out
      const e1 = sDb(np, k, ...ij[0]), e2 = sDb(np, k, ...ij[1]);
      // dB to 10⁻⁹ dB: the browser's and Node's last bits of S differ (near 0 dB that is beyond a relative 10⁻¹²)
      check(same(a.x, np.f[k] / 1e9) && Math.abs(a.v - e1) <= 1e-9 && Math.abs(b.v - e2) <= 1e-9, `${what}: at ${(np.f[k] / 1e9).toFixed(2)} GHz ${names[0]} ${e1.toFixed(3)} dB and ${names[1]} ${e2.toFixed(3)} dB as the engine (off by ${Math.abs(a.v - e1).toExponential(1)}, ${Math.abs(b.v - e2).toExponential(1)} dB)`);
    }
  };

  // ---- 1: the default via, 2 mm feeds ----
  const p = await open(urlOf(single));
  const E = engineOf(single);
  check(E.ok && E.tdr && E.nport, 'the engine solves the default via with its TDR and sweep');
  await tdrAt(p, E, [100, 160, 250], 'default via');
  await sAt(p, E.nport, [20, 120, 300], [[0, 0], [1, 0]], ['S11', 'S21'], 'default via');
  const refs = await p.$$eval('[data-plot="via-tdr"] [data-ref-line]', (es) => es.map((e) => ({ n: e.getAttribute('data-ref-line'), y: Number(e.getAttribute('data-y')) })));
  check(refs.length === 2 && refs[0].y === 50 && same(refs[1].y, E.feeds[0].z0) && refs[1].n === `Traces ${E.feeds[0].z0.toFixed(2)} Ω`, `the TDR's lines: the port 50 Ω and the traces ${E.feeds[0].z0.toFixed(4)} Ω (${refs.map((r) => r.n).join(', ')})`);
  check(Math.abs(E.feeds[0].z0 - 51.4976) < 1e-4, `the feed trace's Z0 is 51.50 Ω (${E.feeds[0].z0.toFixed(4)})`);
  const fade = Number(await plot(p, 'via-s11').locator('[data-fade]').getAttribute('data-fade'));
  check(same(fade, E.nport.valid.fMax / 1e9) && await p.locator(`[data-via-s-fade="${E.nport.valid.fMax}"]`).count() === 1, `the S plots fade from ${(E.nport.valid.fMax / 1e9).toFixed(2)} GHz with the reason`);
  const errShown = Number(await p.locator('[data-via-tdr-err]').getAttribute('data-via-tdr-err'));
  check(same(errShown, E.tdr.err.z, 1e-3), `the record's stated error ${E.tdr.err.z.toExponential(3)} Ω is shown (${errShown.toExponential(3)}: a bound from the record's last digits)`);
  check(await p.locator('[data-via-tdr-short]').count() === 1, 'with 2 mm feeds at 35 ps the page says the feeds are too short for a flat part');
  const s11Text = (await reading(p, 'via-s11')).text;
  check(/GHz: S11 −\d+\.\d\d dB ∠ −?\d+\.\d°/.test(s11Text.replace(/−(?=\d+\.\d°)/, '-')), `the S11 readout in dB and phase ("${s11Text}")`);

  // ---- 2: the rise time and the port ----
  const lumped = E.lumped.z;
  const peakOf = (R) => { let best = 0, at = 0; for (let m = 0; m < R.tdr.z.length; m++) { const e = Math.abs(R.tdr.z[m] - R.z0); if (e > best) { best = e; at = m; } } return at; };
  const dist = {};
  for (const tr of [15e-12, 100e-12, 35e-12]) {
    await p.click(`[data-via-tr-preset="${Math.round(tr * 1e12)}"]`);
    await plotted(p, `[data-tr="${tr}"]`);
    const R = engineOf(single, tr);
    const m = peakOf(R);
    const a = await cursorTo(p, 'via-tdr', m);
    check(a.x === R.tdr.t[m] && same(a.v, R.tdr.z[m]), `${(tr * 1e12).toFixed(0)} ps: the TDR's peak ${R.tdr.z[m].toFixed(3)} Ω at ${(R.tdr.t[m] * 1e12).toFixed(1)} ps as the engine (page ${a.v.toFixed(3)})`);
    dist[tr] = Math.abs(R.tdr.z[m] - R.z0);
  }
  check(dist[15e-12] > dist[35e-12] && dist[35e-12] > dist[100e-12], `the peak softens toward the port at slower edges (the via's √(L/C) ${lumped.toFixed(2)} Ω, shorter than the edge) (${[15, 35, 100].map((t) => dist[t * 1e-12].toFixed(3)).join(' > ')} Ω away)`);
  await p.fill('#via-tr', '0.1 ns');
  await plotted(p, '[data-tr="1e-10"]');
  check(await p.locator('[data-via-tr-preset="100"][aria-pressed="true"]').count() === 1, 'typed "0.1 ns" is the 100 ps preset');
  await p.fill('#via-tr', '2 ps');
  await p.waitForTimeout(100);
  check(await p.locator('[data-field="via.tr"] [role="alert"]').count() === 1 && await p.locator('[data-via-plots][data-tr="1e-10"]').count() === 1, 'a rise time of 2 ps is refused with its reason and the plots stay');
  await p.fill('#via-tr', '35');
  await plotted(p, '[data-tr="3.5e-11"]');
  await p.fill('#via-port', '75');
  await plotted(p, '[data-z0="75"]');
  const E75 = engineOf(single, 35e-12, 75);
  await tdrAt(p, E75, [200], 'port 75 Ω');
  check(await p.locator('[data-plot="via-tdr"] [data-ref-line="Port 75.00 Ω"]').count() === 1, 'the port line follows the typed port');
  await p.fill('#via-port', '50');
  await plotted(p, '[data-z0="50"]');

  // ---- 3: the shared cursors: pointer and keys ----
  const box = await plot(p, 'via-tdr').locator('svg').boundingBox();
  await p.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await p.waitForTimeout(60);
  const pt = await reading(p, 'via-tdr'), pt2 = await reading(p, 'via-tdt'), ps1 = await reading(p, 'via-s11');
  check(Number.isFinite(pt.x) && pt.x === pt2.x && same(pt.v, PL.readAt(E.tdr.t, E.tdr.z, pt.x), 1e-9), `the pointer puts one cursor on the TDR and TDT (${(pt.x * 1e12).toFixed(2)} ps, Z ${pt.v.toFixed(3)} Ω between points as the engine's record)`);
  const sBefore = ps1.x;
  await plot(p, 'via-tdt').locator('[data-plot-box]').focus();
  await p.keyboard.press('ArrowLeft');
  const k1 = await reading(p, 'via-tdr');
  check(k1.x < pt.x && k1.x === (await reading(p, 'via-tdt')).x && (await reading(p, 'via-s11')).x === sBefore, 'an arrow key on the TDT moves the TDR\'s cursor too, not the S plots\'');
  await p.close();

  // ---- 4: 25 mm feeds: the flat parts are the trace's Z0 (done when) ----
  const pl = await open(urlOf(longFeeds));
  const L = engineOf(longFeeds);
  const z0f = L.feeds[0].z0, T = L.tdr, dt = T.t[1] - T.t[0];
  const RING = 0.01; // since M6.5 the feeds' runs over the antipads (84 Ω for 0.6 mm) ring down after the via by a few mΩ
  const one = (f) => (f.length * 1e-3 * Math.sqrt(f.eeff)) / C0;
  const tIn = one(L.feeds[0]), tOut = 2 * L.span - one(L.feeds[1]);
  for (const [t, what] of [[tIn, 'before the via (the entry feed)'], [tOut, 'after the via (the exit feed)']]) {
    const m = Math.round((t - T.t[0]) / dt);
    const a = await cursorTo(pl, 'via-tdr', m);
    check(Math.abs(a.v - z0f) <= Math.max(T.err.z, RING) && same(a.v, T.z[m]), `25 mm feeds: the flat part ${what} at ${(T.t[m] * 1e12).toFixed(0)} ps is ${a.v.toFixed(6)} Ω, the trace's ${z0f.toFixed(6)} Ω within the stated ${T.err.z.toExponential(1)} Ω or the via's ring-down ${RING} Ω`);
  }
  check(await pl.locator('[data-via-tdr-short]').count() === 0, '25 mm feeds: no note about short feeds');
  await pl.close();

  // ---- 5: the pair: differential and common TDR, mixed-mode terms ----
  const pp = await open(urlOf(pairS));
  const P = engineOf(pairS);
  check(P.ok && P.n === 2 && P.mixed && P.tdrCommon, 'the engine solves the pair with both TDRs and the mixed-mode sweep');
  check(await pp.locator('#via-port').inputValue() === '100', 'the pair\'s port is typed as the differential 100 Ω');
  await tdrAt(pp, P, [90, 200], 'pair, differential');
  const dRefs = await pp.$$eval('[data-plot="via-tdr"] [data-ref-line]', (es) => es.map((e) => Number(e.getAttribute('data-y'))));
  check(dRefs[0] === 100 && same(dRefs[1], 2 * P.feeds[0].z0), `the differential lines: port 100 Ω, traces ${(2 * P.feeds[0].z0).toFixed(2)} Ω (each via fed by its own trace)`);
  await pp.click('[data-via-tdr-mode-set="common"]');
  await pp.waitForTimeout(80);
  await tdrAt(pp, P, [90, 200], 'pair, common', P.tdrCommon);
  const cRefs = await pp.$$eval('[data-plot="via-tdr"] [data-ref-line]', (es) => es.map((e) => Number(e.getAttribute('data-y'))));
  check(cRefs[0] === 25 && same(cRefs[1], P.feeds[0].z0 / 2), 'the common lines: port 25 Ω, traces Z0/2');
  const MODES = { dd: [[[0, 0], [1, 0]], ['Sdd11', 'Sdd21']], cc: [[[2, 2], [3, 2]], ['Scc11', 'Scc21']], cd: [[[2, 0], [3, 0]], ['Scd11', 'Scd21']] };
  for (const [m, [ij, names]] of Object.entries(MODES)) {
    await pp.click(`[data-via-s-mode-set="${m}"]`);
    await pp.waitForTimeout(80);
    await sAt(pp, P.mixed, [30, 150, 280], ij, names, `pair, ${m}`);
  }
  await pp.click('[data-via-s-mode-set="dd"]');
  await pp.click('[data-via-tdr-mode-set="diff"]');

  // ---- 6: no horizontal scroll, screenshots ----
  const shrink = async (buf) => {
    const q = await ctx.newPage();
    const b64 = await q.evaluate(async (src) => {
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
    await q.close();
    return Buffer.from(b64, 'base64');
  };
  if (shots) mkdirSync(shots, { recursive: true });
  for (const scheme of ['light', 'dark']) {
    const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: scheme });
    for (const [kind, s] of [['single', single], ['pair', pairS]]) {
      const page = await open(urlOf(s), c2);
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(250);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        check(sw <= width, `${kind}: no horizontal scroll at ${width} px, ${scheme} (${sw})`);
        if (shots && width !== 320) {
          await plot(page, 'via-tdr').locator('[data-plot-box]').focus();
          await page.keyboard.press('Home');
          for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+ArrowRight');
          await page.evaluate(() => window.scrollTo(0, 0)); // the sticky bar stays at the top of the full page
          await page.waitForTimeout(100);
          const b = await page.locator('[data-via-plots]').boundingBox();
          writeFileSync(join(shots, `emsim-viaplots-${kind}-${width}-${scheme}.png`), await shrink(await page.screenshot({ fullPage: true, clip: { x: b.x, y: b.y, width: b.width, height: b.height } })));
        }
      }
      await page.close();
    }
    await c2.close();
  }

  // ---- 7: a tap on a phone ----
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, colorScheme: 'light' });
  const tp = await open(urlOf(single), phone);
  const sb = plot(tp, 'via-s21').locator('svg');
  await sb.scrollIntoViewIfNeeded();
  const b2 = await sb.boundingBox();
  await tp.touchscreen.tap(b2.x + b2.width * 0.5, b2.y + b2.height / 2);
  await tp.waitForTimeout(80);
  const t21 = await reading(tp, 'via-s21'), t11 = await reading(tp, 'via-s11'), tt = await reading(tp, 'via-tdr');
  check(Number.isFinite(t21.x) && t21.x === t11.x && !Number.isFinite(tt.x), `a tap on |S21| puts the S plots' cursor at ${t21.x.toFixed(2)} GHz on both, the TDR's stays (${t21.text})`);
  await phone.close();

  check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
} finally {
  await browser.close();
}
console.log(`ui-viaplots: ${pass} passed, ${fails.length} failed${shots ? `; screenshots in ${shots}` : ''}`);
process.exit(fails.length ? 1 : 0);
