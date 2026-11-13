// Browser checks of the Smith chart's report and its print layout (step M7.3), in Edge (or Chrome):
// - the band figures' words (bandText.ts) for an interval inside the band, open at one end, open at both, and none;
// - the report's numbers (Z0, f0, the load, every part, the input and every node at f0, the band figures, the marker
//   table, the link) equal the engine's for three circuits, with and without a sweep;
// - the print-media DOM (emulateMedia print at the paper's width, after beforeprint): nothing interactive shown,
//   nothing wider than the page box, the chart's copy and the plot's (SVG) present, light colours in both themes;
// - page.pdf() at A4 and Letter in the light and the dark theme: a sane page count, the PDF's text (pdftotext) holds the
//   link and every report value and nothing of the page's controls; with pdftoppm the first page of each size as PNG;
// - 320 and 390 px: the report fits, no table cell is cut by its box unless that box scrolls and takes the focus;
// - the Print report button calls window.print with the figures made.
//   npx tsx ui-report.mjs [output folder for the PDFs and PNGs, '-' for the temp folder] [base URL]

import { spawn, execSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';
import * as importedConvert from '../../../lib/smith/convert.ts';
import * as importedQuantity from '../../../lib/quantity.ts';
import * as importedReadout from '../../../components/Smith/readout.ts';
import * as importedBandText from '../../../components/Smith/bandText.ts';

const S = importedState.default ?? importedState;
const SW = importedSweep.default ?? importedSweep;
const N = importedNetwork.default ?? importedNetwork;
const C = importedConvert.default ?? importedConvert;
const Q = importedQuantity.default ?? importedQuantity;
const R = importedReadout.default ?? importedReadout;
const BT = importedBandText.default ?? importedBandText;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const outArg = process.argv[2];
const out = outArg && outArg !== '-' ? resolve(outArg) : join(tmpdir(), 'smith-report');
mkdirSync(out, { recursive: true });
const base = process.argv[3] ?? 'http://localhost:3020';
const TEX = 'C:\\texlive\\2026\\bin\\windows';
const tool = (name) => { const p = join(TEX, `${name}.exe`); return existsSync(p) ? p : null; };

const up = async () => { try { return (await fetch(`${base}/smith-chart/main`)).ok; } catch { return false; } };
let server = null;
const agentsBefore = existsSync(join(repo, 'AGENTS.md'));
if (!(await up())) {
  server = spawn('npm', ['run', 'dev'], { cwd: repo, shell: true, stdio: 'ignore' });
  const until = Date.now() + 180000;
  while (!(await up())) {
    if (Date.now() > until) { console.error('The dev server did not start.'); process.exit(1); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
const stopServer = () => {
  if (server) {
    try { execSync(process.platform === 'win32' ? `taskkill /pid ${server.pid} /T /F` : `kill ${server.pid}`, { stdio: 'ignore' }); } catch { /* gone */ }
  }
  if (!agentsBefore && existsSync(join(repo, 'AGENTS.md'))) rmSync(join(repo, 'AGENTS.md'));
};

let browser;
for (const channel of ['msedge', 'chrome']) {
  try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
}
if (!browser) { console.error('Neither Edge nor Chrome could be started.'); stopServer(); process.exit(1); }

let passed = 0, failed = 0;
const failures = [];
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(typeof what === 'function' ? what() : what); };
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const squeeze = (s) => s.replace(/\s+/g, '');

const TEN = '?v=1&z0=50&f0=100e6&zl=25:25&p=cs:31.83e-12,lp:79.58e-9,tl:0.3:75,so:0.1:50,rs:10,ls:20n,cp:5p,ss:0.2:60,qw:35,rp:200&u=1,5';
const START = `?${S.encodeCircuit(S.defaultCircuit())}`;
const CASES = [
  ['start circuit, no sweep', START],
  ['10 parts, log sweep, VSWR, limit 6 dB, three markers', `${TEN}&sw=1e6:1e9:1001:log&sl=6&sp=vswr&mk=10e6,100e6,500e6`],
  ['λ/4 transformer, linear sweep, limit 20 dB, a marker', '?v=1&z0=50&f0=1e9&zl=200:0&p=qw:100&sw=0.2e9:1.8e9:2001&sl=20&mk=1.1e9'],
];
const D = 4;

/** The report's texts in Node, from the engine: the circuit, every node (z, Z, Γ, VSWR, RL), the sweep's figures and markers. */
function expected(c, sweep) {
  const parts = c.parts.map((p) => {
    const vals = S.formsOf(p.kind).filter((f) => f.id !== 'n').map((f) => {
      const v = S.formValue(f.id, p, c);
      return `${f.label} = ${f.unit === 'λ' ? `${Q.formatAmount(v, '', D)} λ` : f.unit === '°' ? `${Q.formatAmount(v, '', D)}°` : Q.formatAmount(v, f.unit, D)}`;
    });
    return `${S.KIND_NAMES[p.kind]}: ${vals.join(', ')}`;
  });
  const { metrics } = N.evaluateCircuit(c);
  const nodes = [];
  for (let k = 0, m = 0; k <= c.parts.length; k++, m += N.METRIC_STRIDE) {
    const zr = metrics[m + N.M_ZR], zi = metrics[m + N.M_ZI];
    nodes.push([R.complexText(zr, zi, '', D), R.complexText(zr * c.z0, zi * c.z0, 'Ω', D, Q.ROUNDING_FLOOR * c.z0),
      R.gammaPolarText(metrics[m + N.M_MAG], C.toDegrees(metrics[m + N.M_ANGLE]), D), Q.formatAmount(metrics[m + N.M_VSWR], '', D, true),
      Q.formatReturnLoss(metrics[m + N.M_RL], D)]);
  }
  const want = {
    z0: Q.formatAmount(c.z0, 'Ω', D), f0: BT.hzText(c.f0, D), load: R.complexText(c.loadR, c.loadX, 'Ω', D, Q.ROUNDING_FLOOR * c.z0),
    parts, nodes, figs: null, markers: [],
  };
  if (sweep) {
    const sc = SW.sweepCircuit(c), tr = new SW.Trace();
    SW.runSweep(tr, sweep.band, sc);
    const limit = sweep.limit ?? S.SWEEP_LIMIT_DB;
    const t = BT.figureTexts(SW.bandFigures(tr, sc, C.magFromReturnLoss(limit)), c.f0, limit, D);
    const two = ([v, at]) => (at ? `${v} ${at}` : v);
    want.figs = { worst: two(t.worst), best: two(t.best), vswr: two(t.vswr), intervals: t.intervals.join(''), f0: two(t.f0), q: two(t.q) };
    want.markers = sweep.markers.map((f) => {
      const p = SW.markerAt(sc, f);
      return [Q.formatAmount(p.f, 'Hz', D, true), R.complexText(p.zr, p.zi, 'Ω', D, Q.ROUNDING_FLOOR * c.z0),
        R.gammaPolarText(p.mag, C.toDegrees(C.gammaAngle(p.gr, p.gi)), D), Q.formatAmount(p.vswr, '', D, true), Q.formatReturnLoss(p.rl, D)];
    });
  }
  return want;
}
/** Every value of the report as a flat list (for the PDF's text). */
const allValues = (w) => [w.z0, w.f0, w.load, ...w.parts, ...w.nodes.flat(), ...(w.figs ? Object.values(w.figs) : []), ...w.markers.flat()];

const pageReport = (page) => page.evaluate(() => {
  const r = document.querySelector('[data-report]');
  const t = (s) => r.querySelector(s)?.textContent ?? null;
  const rows = (s) => [...r.querySelectorAll(s)].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
  const figs = {};
  for (const e of r.querySelectorAll('[data-r-fig]')) figs[e.getAttribute('data-r-fig')] = e.querySelector('dd').textContent;
  return {
    z0: t('[data-r="z0"]'), f0: t('[data-r="f0"]'), load: t('[data-r="load"]'),
    parts: [...r.querySelectorAll('[data-r-part]')].map((e) => e.textContent),
    input: ['z', 'Z', 'gamma', 'vswr', 'rl'].map((k) => t(`[data-r="${k}"]`)),
    nodes: rows('[data-r-node]'), markers: rows('[data-r-marker]'), figs: Object.keys(figs).length ? figs : null,
    link: t('[data-r="link"]'), sweep: !!r.querySelector('[data-report-sweep]'),
  };
});

async function open(context, search) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${search}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-report]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  if (search.includes('&sw=')) await page.waitForFunction(() => document.querySelector('[data-sweep-results]')?.getAttribute('data-state') === 'full' && !!document.querySelector('[data-r-figures]'), null, { timeout: 15000 });
  await frame(page);
  return page;
}

/** The print-media DOM at a paper's content width: what shows that should not, what is wider than the page. */
const printState = (page, width) => page.evaluate((width) => {
  const shown = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const interactive = [...document.querySelectorAll('button, input, select, textarea, summary, a[href], [role="slider"], [data-why-wrap], [data-handle], [data-snap]')].filter(shown);
  const wide = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!shown(e) || e.closest('[data-print-chart]')) continue;
    const r = e.getBoundingClientRect();
    // (an empty 1 px live region off the left edge is not content)
    if (r.width > 1 && (r.right > width + 0.5 || r.left < -0.5)) wide.push(`${e.tagName}.${e.className?.baseVal ?? e.className} “${e.textContent.slice(0, 40)}” ${r.left.toFixed(1)}–${r.right.toFixed(1)}`);
  }
  const frameEl = document.querySelector('[data-print-chart]')?.parentElement;
  const fr = frameEl?.getBoundingClientRect();
  const report = document.querySelector('[data-report]');
  return {
    interactive: interactive.map((e) => `${e.tagName} ${e.textContent.trim().slice(0, 30)}`),
    wide: wide.slice(0, 5), nWide: wide.length,
    chartSvgs: document.querySelectorAll('[data-report-chart] [data-print-chart] > svg').length,
    chartFrame: fr ? { left: fr.left, right: fr.right, w: fr.width, h: fr.height } : null,
    plot: !!document.querySelector('[data-report-plot] svg[data-print-plot] [data-plot-trace]'),
    plotBox: (() => { const b = document.querySelector('[data-report-plot]')?.getBoundingClientRect(); return b ? { w: b.width, h: b.height } : null; })(),
    onlyReport: [...document.querySelectorAll('main > *, [id="tool"] > *')].filter(shown).every((e) => e.id === 'tool' || e.hasAttribute('data-report')),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(report).color,
    chartBg: getComputedStyle(document.querySelector('[data-print-chart]') ?? report).getPropertyValue('--chart-bg').trim(),
  };
}, width);

/** Table cells cut by a box that clips them: a cell outside an ancestor that clips, unless it scrolls and is focusable. */
const cutCells = (page) => page.evaluate(() => {
  const bad = [];
  for (const td of document.querySelectorAll('[data-marker-table] td, [data-report] td')) {
    if (!td.getClientRects().length) continue;
    const r = td.getBoundingClientRect();
    for (let a = td.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowX === 'visible') continue;
      const b = a.getBoundingClientRect();
      if (r.left < b.left - 0.5 || r.right > b.right + 0.5) {
        if (!(a.scrollWidth > a.clientWidth && a.tabIndex >= 0)) bad.push(`${td.textContent} (${r.left.toFixed(0)}–${r.right.toFixed(0)} in ${b.left.toFixed(0)}–${b.right.toFixed(0)})`);
      }
      break;
    }
    if (r.right > document.documentElement.clientWidth + 0.5) bad.push(`${td.textContent} past the screen`);
  }
  return bad;
});

const pages = (pdf) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

try {
  // ---------- the band figures' words ----------
  const iv = (lo, hi, openLo = false, openHi = false) => ({ lo, hi, openLo, openHi });
  const fig = (intervals, atF0, q) => ({
    start: 50e6, stop: 150e6, worst: { f: 50e6 }, best: { f: 100e6 }, worstRL: 3, bestRL: 30, maxVswr: 6, threshold: C.magFromReturnLoss(10),
    intervals, atF0, fractional: atF0 ? (atF0.hi - atF0.lo) / 100e6 : NaN, q,
  });
  let t = BT.figureTexts(fig([iv(90e6, 110e6)], iv(90e6, 110e6), { f: 100e6, mag: 0.01, lo: 95e6, hi: 105e6, q: 10, openLo: false, openHi: false }), 100e6, 10, 4);
  ok(t.intervals[0] === '90.00 MHz – 110.0 MHz', `words: an interval inside the band (${t.intervals[0]})`);
  ok(t.f0.join(' ') === '90.00 MHz – 110.0 MHz: 20.00 MHz wide, 20.00 % of f0', `words: around f0 inside (${t.f0.join(' ')})`);
  ok(t.q.join(' ') === '10.00 at 100.0 MHz', `words: loaded Q (${t.q.join(' ')})`);
  t = BT.figureTexts(fig([iv(79.5e6, 150e6, false, true)], iv(79.5e6, 150e6, false, true), { f: 140e6, mag: 0.01, lo: 120e6, hi: 150e6, q: 4.667, openLo: false, openHi: true }), 100e6, 10, 4);
  ok(t.intervals[0] === 'from 79.50 MHz to past the band’s end (150.0 MHz)', `words: open at the end (${t.intervals[0]})`);
  ok(t.f0.join(' ') === 'from 79.50 MHz to past the band’s end (150.0 MHz): at least 70.50 MHz wide, at least 70.50 % of f0', `words: around f0 open at the end (${t.f0.join(' ')})`);
  ok(t.q[0] === 'at most 4.667' && t.q[1].startsWith('at 140.0 MHz; the band ends before the power falls to half,'), `words: loaded Q open (${t.q.join(' ')})`);
  t = BT.figureTexts(fig([iv(50e6, 120e6, true, false)], iv(50e6, 120e6, true, false), null), 100e6, 10, 4);
  ok(t.intervals[0] === 'from before the band’s start (50.00 MHz) to 120.0 MHz', `words: open at the start (${t.intervals[0]})`);
  ok(t.q.join(' ') === 'none: no power is delivered at the best match', `words: no loaded Q (${t.q.join(' ')})`);
  t = BT.figureTexts(fig([iv(50e6, 150e6, true, true)], iv(50e6, 150e6, true, true), { f: 100e6, mag: 0.5, lo: 50e6, hi: 150e6, q: 1, openLo: true, openHi: true }), 100e6, 10, 4);
  ok(t.intervals[0] === 'the whole band (50.00 MHz – 150.0 MHz), perhaps beyond both ends', `words: open at both ends (${t.intervals[0]})`);
  ok(t.f0[1] === 'at least 100.0 MHz wide, at least 100.0 % of f0' && t.q[1].includes('on both sides'), `words: around f0 and Q open at both ends (${t.f0[1]} | ${t.q[1]})`);
  t = BT.figureTexts(fig([], null, null), 100e6, 10, 4);
  ok(t.intervals[0] === 'nowhere in the band' && t.f0.join(' ') === 'none: the match at f0 is worse than the limit', `words: none (${t.intervals[0]} | ${t.f0.join(' ')})`);
  t = BT.figureTexts(fig([iv(60e6, 70e6)], null, null), 200e6, 10, 4);
  ok(t.f0.join(' ') === 'none: f0 (200.0 MHz) is outside the band', `words: f0 outside the band (${t.f0.join(' ')})`);

  // ---------- the report's numbers equal the engine's ----------
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const wants = [];
  for (const [name, search] of CASES) {
    const p = await open(desk, search);
    const d = S.decodeCircuit(new URL(p.url()).search);
    const w = expected(d.circuit, d.sweep);
    wants.push(w);
    const got = await pageReport(p);
    ok(got.z0 === w.z0 && got.f0 === w.f0 && got.load === w.load, () => `${name}: Z0, f0, load (${got.z0}, ${got.f0}, ${got.load})`);
    ok(JSON.stringify(got.parts) === JSON.stringify(w.parts), () => `${name}: the parts (${got.parts.join(' | ')} ≠ ${w.parts.join(' | ')})`);
    ok(JSON.stringify(got.nodes) === JSON.stringify(w.nodes), () => `${name}: every node at f0 (${JSON.stringify(got.nodes[0])} ≠ ${JSON.stringify(w.nodes[0])})`);
    ok(JSON.stringify(got.input) === JSON.stringify(w.nodes[w.nodes.length - 1]), () => `${name}: the input at f0 (${got.input})`);
    ok(got.sweep === !!d.sweep, `${name}: the sweep's part ${d.sweep ? 'shown' : 'absent'}`);
    if (d.sweep) {
      for (const k of Object.keys(w.figs)) ok(got.figs?.[k] === w.figs[k], () => `${name}: band figure ${k} (${got.figs?.[k]} ≠ ${w.figs[k]})`);
      ok(JSON.stringify(got.markers) === JSON.stringify(w.markers), () => `${name}: the marker table (${JSON.stringify(got.markers)})`);
    }
    ok(got.link === p.url(), () => `${name}: the link is the page's (${got.link} ≠ ${p.url()})`);
    ok(p.errors.length === 0, () => `${name}: no errors (${p.errors.join(' | ')})`);
    await p.close();
  }

  // ---------- print: the DOM in print media, page.pdf at A4 and Letter in both themes ----------
  const PAPER = { A4: 186 * 96 / 25.4, Letter: (215.9 - 24) * 96 / 25.4 };
  const pdftotext = tool('pdftotext'), pdftoppm = tool('pdftoppm');
  const texts = {};
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const p = await open(ctx, CASES[1][1]);
    const w = wants[1], link = await p.$eval('[data-r="link"]', (e) => e.textContent);
    ok(await p.evaluate(() => getComputedStyle(document.body).backgroundColor) === (scheme === 'dark' ? 'rgb(43, 43, 43)' : 'rgb(246, 244, 238)'), `${scheme}: the page is in its theme on screen`);
    for (const [paper, width] of Object.entries(PAPER)) {
      const tag = `${scheme} ${paper}`;
      await p.setViewportSize({ width: Math.floor(width), height: 1000 });
      await frame(p);
      await p.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      await p.emulateMedia({ media: 'print' });
      const s = await printState(p, Math.floor(width));
      ok(s.interactive.length === 0, () => `${tag}: nothing interactive shown in print (${s.interactive.slice(0, 6).join(' | ')})`);
      ok(s.nWide === 0, () => `${tag}: nothing wider than the page (${s.nWide}: ${s.wide.join(' | ')})`);
      ok(s.onlyReport, `${tag}: only the report is printed`);
      ok(s.chartSvgs === 2 && s.chartFrame && Math.abs(s.chartFrame.w - 150 * 96 / 25.4) < 1 && s.chartFrame.h > 300, () => `${tag}: the chart's copy, two SVGs, 150 mm wide (${s.chartSvgs}, ${JSON.stringify(s.chartFrame)})`);
      ok(s.plot && s.plotBox && Math.abs(s.plotBox.w / s.plotBox.h - 680 / 240) < 0.02, () => `${tag}: the plot's SVG copy at 680:240 (${JSON.stringify(s.plotBox)})`);
      ok(s.bodyBg === 'rgb(255, 255, 255)' && s.ink === 'rgb(29, 28, 25)' && s.chartBg === '#fff', () => `${tag}: light colours (${s.bodyBg}, ${s.ink}, ${s.chartBg})`);
      const pdf = await p.pdf({ format: paper, preferCSSPageSize: false });
      const file = join(out, `report-${scheme}-${paper}.pdf`);
      writeFileSync(file, pdf);
      const n = pages(pdf);
      ok(n >= 2 && n <= 4, `${tag}: ${n} pages`);
      console.log(`${tag}: ${n} pages, ${file}`);
      if (pdftotext) {
        const txt = execFileSync(pdftotext, ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' });
        texts[tag] = squeeze(txt);
        const missing = allValues(w).filter((v) => !texts[tag].includes(squeeze(v)));
        ok(missing.length === 0, () => `${tag}: the PDF's text holds every report value (${missing.length} missing: ${missing.slice(0, 4).join(' | ')})`);
        // pdftotext joins a line ending in a hyphen to the next without it (the link breaks anywhere): hyphens left out.
        ok(texts[tag].replace(/-/g, '').includes(squeeze(link).replace(/-/g, '')), `${tag}: the PDF's text holds the link`);
        ok(link.includes('sl=6') && link.includes('sp=vswr') && link.includes('sw=') && link.includes('mk='), `${tag}: the link has the sweep, the limit, the plot's kind and the markers`);
        const controls = ['Print report', 'Add marker', 'Undo', 'Learn', 'Fit', 'Readout', 'More'].filter((c) => txt.includes(c));
        ok(controls.length === 0, `${tag}: none of the page's controls in the PDF (${controls})`);
        ok(txt.includes('Smith chart report'), `${tag}: the print title`);
      } else ok(false, 'pdftotext not found under C:\\texlive');
      if (pdftoppm && scheme === 'light') {
        execFileSync(pdftoppm, ['-png', '-r', '80', '-f', '1', '-l', String(n), file, join(out, `report-${paper}`)]);
        console.log(`${tag}: PNG pages in ${out}\\report-${paper}-*.png`);
      }
      await p.emulateMedia({ media: 'screen' });
      await p.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    }
    ok(p.errors.length === 0, () => `${scheme} print: no errors (${p.errors.join(' | ')})`);
    // The button: window.print is called with the figures made.
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.evaluate(() => { window.__printed = -1; window.print = () => { window.__printed = document.querySelectorAll('[data-print-chart], [data-print-plot]').length; }; });
    await p.click('[data-print-report]');
    ok(await p.evaluate(() => window.__printed) === 2, `${scheme}: Print report calls window.print with the chart and the plot made`);
    await ctx.close();
  }
  if (texts['light A4'] && texts['dark A4']) ok(texts['light A4'].replace(/\d{1,2}\/\d{1,2}\/\d{4},?\d{1,2}:\d{2}:\d{2}(AM|PM)?/g, '') === texts['dark A4'].replace(/\d{1,2}\/\d{1,2}\/\d{4},?\d{1,2}:\d{2}:\d{2}(AM|PM)?/g, ''), 'the light and the dark theme print the same text');

  // ---------- 320 and 390 px on screen ----------
  for (const [width, scheme] of [[390, 'light'], [320, 'dark']]) {
    const phone = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true, colorScheme: scheme });
    const p = await open(phone, CASES[1][1]);
    await p.$eval('[data-report]', (e) => e.scrollIntoView());
    await frame(p);
    const fits = await p.evaluate(() => { const r = document.querySelector('[data-report]').getBoundingClientRect(); return r.left >= 0 && r.right <= document.documentElement.clientWidth + 0.5; });
    ok(fits, `${width} px: the report fits the width`);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${width} px: no horizontal scroll`);
    const cut = await cutCells(p);
    ok(cut.length === 0, () => `${width} px: no table cell cut (${cut.slice(0, 4).join(' | ')})`);
    if (outArg && outArg !== '-') await p.screenshot({ path: join(out, `report-${width}.png`) });
    ok(p.errors.length === 0, () => `${width} px: no errors (${p.errors.join(' | ')})`);
    await phone.close();
  }
} catch (e) {
  failed++;
  failures.push(`threw: ${e.stack ?? e}`);
} finally {
  await browser.close();
  stopServer();
}

console.log(`ui-report: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failed ? 1 : 0);
