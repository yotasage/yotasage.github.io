// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the Export section (step M8.3a, plan.md D18):
// - the figure model the page builds equals the on-screen chart's geometry read from the DOM in the same view, to 1e-9
//   of the chart's radius (Γ units): every grid circle both draw (centre and radius), every part's arc of the path (its
//   ends, and every drawn piece of the chart's arc on the model's circle) and every node in the view, for 3 circuits at
//   2 zooms (milestones.md M8, moved here from M8.1b);
// - the preview's frame is the chosen width in CSS mm at 88, 160 and 180 mm (getBoundingClientRect against 96/25.4 px
//   per mm), and every option reaches the preview: after each change the preview's SVG equals, element by element,
//   figureSvg of the figure the harness builds in Node from the link with the page's options;
// - the saved SVG equals figureSvg, the copied and the saved TikZ equal figureTikz (picture and document), the PNG at
//   1×, 2× and 8× has the pixel size of the figure's mm at 96 dpi times the factor and decodes to a drawing;
// - keyboard alone: the toolbar's Export link, an option and a save; no horizontal scroll at 320 and 390 px (fit to
//   screen on and off); no errors in the console;
// - an interleaved A/B of a 4× CPU handle drag (2 pairs): the page whose Export section was never near the screen
//   against one where it was built and then scrolled away: the main thread per frame may grow by at most 0.3 ms.
//   tsx ui-export.mjs [screenshot folder] [base URL]      (part of npm run ui)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import * as importedState from '../../../lib/smith/state.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedFigure from '../../../lib/smith/figure.ts';
import * as importedStyle from '../../../lib/smith/figureStyle.ts';
import * as importedSvg from '../../../lib/smith/figureSvg.ts';
import * as importedTikz from '../../../lib/smith/figureTikz.ts';
import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedNetwork from '../../../lib/smith/network.ts';

const S = importedState.default ?? importedState;
const P = importedParts.default ?? importedParts;
const F = importedFigure.default ?? importedFigure;
const ST = importedStyle.default ?? importedStyle;
const SV = importedSvg.default ?? importedSvg;
const TZ = importedTikz.default ?? importedTikz;
const SW = importedSweep.default ?? importedSweep;
const N = importedNetwork.default ?? importedNetwork;
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3020';
if (shots) mkdirSync(shots, { recursive: true });

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
const TOL = 1e-9;
const TAU = 2 * Math.PI;
const PX_PER_MM = 96 / 25.4;
// SMITH_EXPORT_AB=1: only the A/B of the drag.
const AB_ONLY = process.env.SMITH_EXPORT_AB === '1';

async function open(context, search = '') {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main${search ? `?${search}` : ''}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-export]');
  await page.waitForFunction(() => window.location.search.includes('v=1'));
  await frame(page);
  return page;
}
const builds = (page) => page.evaluate(() => document.querySelector('[data-export]').smithExport.builds);
/** Runs `act` and waits for the figure to be built again (at most 5 s). */
async function rebuilt(page, act) {
  const b = await builds(page);
  await act();
  await page.waitForFunction((n) => document.querySelector('[data-export]').smithExport.builds > n, b, { timeout: 5000 }).catch(() => {});
  await frame(page);
  return (await builds(page)) > b;
}
async function toExport(page) {
  await page.evaluate(() => document.querySelector('[data-export]').scrollIntoView({ block: 'start' }));
  await page.waitForFunction(() => document.querySelector('[data-export]').smithExport.builds > 0, null, { timeout: 5000 }).catch(() => {});
  await frame(page);
}

// ---------- the Node side: the same figure from the link and the page's options ----------

function inputOf(search) {
  const d = S.decodeCircuit(`?${search}`);
  let trace = null, markers = null;
  if (d.sweep) {
    const sc = SW.sweepCircuit(d.circuit), tr = new SW.Trace(1024);
    SW.runSweep(tr, d.sweep.band, sc);
    trace = tr;
    markers = SW.markersAt(sc, d.sweep.markers);
  }
  return { circuit: d.circuit, solve: null, trace, markers };
}
const probeOf = (page) => page.evaluate(() => {
  const p = document.querySelector('[data-export]').smithExport;
  return { options: p.options, builds: p.builds, solve: !!p.input?.solve, width: p.fig?.width, height: p.fig?.height };
});
const nodeFigure = (search, options) => F.buildFigure(inputOf(search), options);

/** The preview's SVG against a string, element by element (tag, attributes, own text), in the page. */
const samePreview = (page, svg) => page.evaluate((svg) => {
  const a = document.querySelector('[data-export-preview] svg');
  const b = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  if (!a || b.nodeName !== 'svg') return 'no svg';
  const ea = [a, ...a.querySelectorAll('*')], eb = [b, ...b.querySelectorAll('*')];
  if (ea.length !== eb.length) return `${ea.length} elements, ${eb.length} expected`;
  for (let i = 0; i < ea.length; i++) {
    const x = ea[i], y = eb[i];
    if (x.localName !== y.localName) return `element ${i}: ${x.localName} vs ${y.localName}`;
    if (x.attributes.length !== y.attributes.length) return `element ${i} ${x.localName}: ${x.attributes.length} attributes vs ${y.attributes.length}`;
    for (const at of y.attributes) if (x.getAttribute(at.name) !== at.value) return `element ${i} ${x.localName} ${at.name}: ${x.getAttribute(at.name)?.slice(0, 80)} vs ${at.value.slice(0, 80)}`;
    const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.data).join('');
    if (own(x) !== own(y)) return `element ${i} text ${own(x)} vs ${own(y)}`;
  }
  return '';
}, svg);

// ---------- the DOM side: the chart's grid and path in Γ ----------

/** Centre and radius of an SVG arc (rx = ry, no rotation) by the endpoint-to-centre conversion of the SVG spec. */
function arcCentre(S0, E, R, large, sweep) {
  const x1p = (S0[0] - E[0]) / 2, y1p = (S0[1] - E[1]) / 2, d2 = x1p * x1p + y1p * y1p;
  let r = R;
  if (d2 > r * r) r = Math.sqrt(d2);
  const coef = r * r - d2 <= 1e-12 * r * r ? 0 : (large !== sweep ? 1 : -1) * Math.sqrt((r * r - d2) / d2);
  const cxp = coef * y1p, cyp = -coef * x1p;
  const C = [cxp + (S0[0] + E[0]) / 2, cyp + (S0[1] + E[1]) / 2];
  const t1 = Math.atan2(y1p - cyp, x1p - cxp);
  let dt = Math.atan2(-y1p - cyp, -x1p - cxp) - t1;
  if (sweep === 0 && dt > 0) dt -= TAU;
  if (sweep === 1 && dt < 0) dt += TAU;
  const tm = t1 + dt / 2;
  return { C, M: [C[0] + r * Math.cos(tm), C[1] + r * Math.sin(tm)], r };
}
/** Subpaths of `d` as {cmd, S, E, R, large, sweep} in user units. */
function pieces(d) {
  const out = [];
  const tok = d.match(/[MAL]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0, cur = null;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++];
    if (c === 'M') { cur = [num(), num()]; out.push({ cmd: 'M', E: cur }); } else if (c === 'L') { const E = [num(), num()]; out.push({ cmd: 'L', S: cur, E }); cur = E; } else if (c === 'A') {
      const R = num(); num(); num(); const large = num(), sweep = num(); const E = [num(), num()];
      out.push({ cmd: 'A', S: cur, E, R, large, sweep }); cur = E;
    } else break;
  }
  return out;
}
const readChart = (page) => page.evaluate(() => {
  const v = document.querySelector('[data-chart]').smithChart, svg = document.querySelector('svg[data-level]');
  const grid = {};
  for (const p of svg.querySelectorAll('path')) grid[p.dataset.part] = p.getAttribute('d');
  return {
    fx: v.fx, fy: v.fy, fk: v.fk, cx: v.cx, cy: v.cy, k: v.k, w: v.w, h: v.h,
    kq: Number(svg.dataset.kq), ox: Number(svg.dataset.ox), oy: Number(svg.dataset.oy), grid,
    arcs: [...document.querySelectorAll('[data-arc]')].map((e) => ({ i: Number(e.getAttribute('data-arc')), d: e.getAttribute('d') })),
  };
});
const readModel = (page, roles) => page.evaluate((roles) => {
  const f = document.querySelector('[data-export]').smithExport.fig;
  const keep = new Set([roles.grid, roles.part, roles.node]);
  return {
    scale: f.scale, whole: f.whole, view: f.view,
    prims: f.prims.filter((p) => keep.has(p.role) && !p.key).map((p) => ({
      type: p.type, role: p.role, sub: p.sub, index: p.index, cx: p.cx, cy: p.cy, r: p.r, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, x: p.x, y: p.y,
    })),
  };
}, roles);

/** The model against the chart in the same view: grid circles, path arcs, nodes. */
async function modelVsChart(page, search, what) {
  const ch = await readChart(page), m = await readModel(page, { grid: ST.ROLE_GRID, part: ST.ROLE_PART, node: ST.ROLE_NODE });
  const s = m.scale;
  const win = { x0: ch.cx - ch.w / (2 * ch.k), x1: ch.cx + ch.w / (2 * ch.k), y0: ch.cy - ch.h / (2 * ch.k), y1: ch.cy + ch.h / (2 * ch.k) };
  ok(!m.whole && ['x0', 'x1', 'y0', 'y1'].every((k) => m.view[k] === win[k]), () => `${what}: the model's view is the chart's window (${JSON.stringify(m.view)} vs ${JSON.stringify(win)})`);
  // Grid: the circles of both, unique.
  const G = (p) => [p[0] / ch.kq + ch.ox, ch.oy - p[1] / ch.kq];
  const screen = [];
  for (const name of ['axis', 'z-major', 'z-minor', 'y-major', 'y-minor']) {
    for (const q of pieces(ch.grid[name] ?? '')) {
      if (q.cmd !== 'A') continue;
      const { C } = arcCentre(q.S, q.E, q.R, q.large, q.sweep);
      screen.push({ c: G(C), R: q.R / ch.kq, ends: [G(q.S), G(q.E)] });
    }
  }
  const model = m.prims.filter((p) => p.role === ST.ROLE_GRID && (p.type === 'arc' || p.type === 'circle')).map((p) => ({ c: [p.cx / s, p.cy / s], R: p.r / s }));
  const dist = (a, b) => Math.max(Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]), Math.abs(a.R - b.R)) / Math.max(1, a.R);
  let common = 0, worst = 0;
  for (const a of model) {
    let best = Infinity, bi = -1;
    for (let j = 0; j < screen.length; j++) { const d = dist(a, screen[j]); if (d < best) { best = d; bi = j; } }
    if (best > 1e-6) continue;
    common++;
    worst = Math.max(worst, best);
    // the chart's piece ends on the model's circle
    for (const e of screen[bi].ends) worst = Math.max(worst, Math.abs(Math.hypot(e[0] - a.c[0], e[1] - a.c[1]) - a.R) / Math.max(1, a.R));
  }
  ok(common >= 20 && common >= 0.5 * Math.min(model.length, new Set(screen.map((x) => `${x.c[0].toFixed(6)} ${x.c[1].toFixed(6)} ${x.R.toFixed(6)}`)).size),
    () => `${what}: ${common} grid circles in both (model ${model.length})`);
  ok(worst <= TOL, () => `${what}: grid circles equal to ${worst} of the radius`);
  // Path arcs and nodes.
  const c = S.decodeCircuit(`?${search}`).circuit, n = c.parts.length;
  const toG = (u, w) => [u / ch.fk + ch.fx, ch.fy - w / ch.fk];
  const domNodes = [];
  let pathWorst = 0, arcs = 0;
  for (let i = 0; i < n; i++) {
    const a = ch.arcs.find((x) => x.i === i);
    const q = pieces(a?.d ?? '');
    if (!q.length) { ok(false, `${what}: part ${i}: no arc on the chart`); continue; }
    const first = toG(...q[0].E), last = toG(...q[q.length - 1].E);
    domNodes.push(first, last);
    const fa = m.prims.filter((p) => p.role === ST.ROLE_PART && p.sub === ST.SUB_PATH && p.index === i && p.type === 'arc');
    const As = q.filter((x) => x.cmd === 'A');
    if (!fa.length) { ok(!As.length, `${what}: part ${i}: the model has no arc where the chart draws one`); continue; }
    ok(fa.length === 1, `${what}: part ${i}: one arc in the model (${fa.length})`);
    const p = fa[0], R = p.r / s, C = [p.cx / s, p.cy / s];
    arcs++;
    pathWorst = Math.max(pathWorst, Math.hypot(first[0] - p.x0 / s, first[1] - p.y0 / s), Math.hypot(last[0] - p.x1 / s, last[1] - p.y1 / s));
    for (const x of q) {
      if (x.cmd === 'M') continue;
      const e = toG(...x.E);
      pathWorst = Math.max(pathWorst, Math.abs(Math.hypot(e[0] - C[0], e[1] - C[1]) - R) / Math.max(1, R));
      if (x.cmd === 'A') {
        const mid = arcCentre(x.S, x.E, x.R, x.large, x.sweep).M, g = toG(...mid);
        pathWorst = Math.max(pathWorst, Math.abs(Math.hypot(g[0] - C[0], g[1] - C[1]) - R) / Math.max(1, R));
      }
    }
  }
  ok(pathWorst <= TOL, () => `${what}: the path's arcs equal to ${pathWorst} of the radius (${arcs} arcs)`);
  const marks = m.prims.filter((p) => p.role === ST.ROLE_NODE && p.type === 'mark').map((p) => [p.x / s, p.y / s]);
  const inView = (g) => g[0] >= win.x0 && g[0] <= win.x1 && g[1] >= win.y0 && g[1] <= win.y1;
  let nodeWorst = 0, nodesIn = 0;
  for (const g of domNodes) {
    if (!inView(g)) continue;
    nodesIn++;
    nodeWorst = Math.max(nodeWorst, Math.min(...marks.map((x) => Math.hypot(x[0] - g[0], x[1] - g[1]))));
  }
  for (const x of marks) if (inView(x)) nodeWorst = Math.max(nodeWorst, Math.min(...domNodes.map((g) => Math.hypot(x[0] - g[0], x[1] - g[1]))));
  ok(nodesIn > 0 && nodeWorst <= TOL, () => `${what}: ${nodesIn} nodes in view equal to ${nodeWorst} of the radius`);
  return { common, worst, pathWorst, nodeWorst, arcs, nodesIn };
}

// ---------- downloads, PNG ----------

async function download(page, selector) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click(selector)]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: readFileSync(path) };
}
const pngHead = (b) => ({ sig: b.subarray(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const decodePng = (page, b64) => page.evaluate(async (b64) => {
  const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let dark = 0, opaque = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { if (d[i + 3] === 255) opaque++; if (d[i] + d[i + 1] + d[i + 2] < 300) dark++; }
  return { w: bmp.width, h: bmp.height, dark, opaque, samples: Math.ceil(d.length / 28) };
}, b64);

// ---------- the 4× drag (as ui-trace.mjs) ----------

async function dragCost(pt) {
  await pt.evaluate(() => window.scrollTo(0, 0));
  await frame(pt);
  const c = S.decodeCircuit(new URL(pt.url()).search).circuit, nodes = new Float64Array((c.parts.length + 1) * N.NODE_STRIDE), g = [0, 0];
  N.evaluate(nodes, P.packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, c.f0, c.f0);
  N.nodeGamma(g, 0, nodes, 1 * N.NODE_STRIDE);
  const [hx, hy] = await pt.evaluate(([gr, gi]) => {
    const box = document.querySelector('[data-chart]'), v = box.smithChart, r = box.getBoundingClientRect();
    return [r.left + v.screenX(gr), r.top + v.screenY(gi)];
  }, g);
  const cdp = await pt.context().newCDPSession(pt);
  await cdp.send('Performance.enable');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await frame(pt);
  const task = async () => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === 'TaskDuration').value;
  const t0 = await task();
  const res = await pt.evaluate(([hx, hy]) => new Promise((done) => {
    const box = document.querySelector('[data-chart]');
    const ev = (type, x, y) => box.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const stamps = [];
    let x = hx, y = hy;
    ev('pointerdown', hx, hy);
    const start = performance.now();
    const tick = (t) => {
      stamps.push(t);
      if (t - start < 2000) requestAnimationFrame(tick);
      else { ev('pointerup', x, y); done({ ticks: stamps.length }); }
    };
    requestAnimationFrame(tick);
    const send = () => {
      const t = performance.now() - start;
      if (t >= 2000) return;
      const a = (t / 2000) * TAU_IN;
      x = hx + 60 * Math.sin(a); y = hy + 60 * (1 - Math.cos(a));
      ev('pointermove', x, y);
      setTimeout(send, 8);
    };
    const TAU_IN = 2 * Math.PI;
    send();
  }), [hx, hy]);
  const t1 = await task();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.detach();
  return ((t1 - t0) * 1000) / res.ticks;
}

// ---------- the checks ----------

const START = S.encodeCircuit(S.defaultCircuit());
const ALL = (() => { const c = S.defaultCircuit(); return S.encodeCircuit({ ...c, parts: S.KIND_ORDER.map((k) => S.newPart(k, c)) }); })();
const LONG = S.encodeCircuit({ ...S.defaultCircuit(), loadR: 12, loadX: -40, parts: [{ kind: P.LINE, value: 0.65, zc: 75 }, S.newPart(P.SHUNT_C, S.defaultCircuit()), S.newPart(P.SERIES_L, S.defaultCircuit())] });
const SWEPT = `${START}&sw=50e6:150e6:201&mk=90e6,110e6`;

const setPrefs = (page, prefs) => page.evaluate((p) => window.localStorage.setItem('smith.export', JSON.stringify(p)), prefs);
const clearPrefs = (page) => page.evaluate(() => window.localStorage.removeItem('smith.export'));

const results = {};
try {
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', acceptDownloads: true });
  await desk.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });

  // ---------- the model against the on-screen chart: 3 circuits × 2 zooms ----------
  if (!AB_ONLY) {
    const p0 = await open(desk, START);
    // A 180 mm figure with a fine Z grid and every item, of the current view.
    await setPrefs(p0, { area: 'view', size: 'page', detail: { ...F.DETAIL_PRESETS.full, grid: 'z' }, colour: 'colour', fontPt: 7 });
    await p0.close();
    const geo = [];
    for (const [name, search] of [['start', START], ['every kind', ALL], ['long line', LONG]]) {
      for (const zoom of [1, 3]) {
        const page = await open(desk, search);
        const c = S.decodeCircuit(`?${search}`).circuit;
        const e = new Float64Array((c.parts.length + 1) * N.NODE_STRIDE), g = [0, 0];
        N.evaluate(e, P.packParts(c.parts), c.parts.length, c.loadR, c.loadX, c.z0, c.f0, c.f0);
        N.nodeGamma(g, 0, e, Math.min(1, c.parts.length) * N.NODE_STRIDE);
        await page.evaluate(([z, gr, gi]) => { const v = document.querySelector('[data-chart]').smithChart; if (z === 1) v.fit(); else v.setView(gr, gi, v.kFit * z); }, [zoom, g[0], g[1]]);
        await frame(page);
        await frame(page);
        await toExport(page);
        // The poll follows the chart's view; wait until the model's view is the chart's window.
        await page.waitForFunction(() => {
          const v = document.querySelector('[data-chart]').smithChart, f = document.querySelector('[data-export]').smithExport.fig;
          return f && !f.whole && Math.abs(f.view.x0 - (v.cx - v.w / (2 * v.k))) < 1e-15;
        }, null, { timeout: 5000 }).catch(() => {});
        const r = await modelVsChart(page, search, `${name} at ${zoom}×`);
        geo.push(`${name} ${zoom}×: ${r.common} circles ${r.worst.toExponential(1)}, ${r.arcs} arcs ${r.pathWorst.toExponential(1)}, ${r.nodesIn} nodes ${r.nodeWorst.toExponential(1)}`);
        ok(page.errors.length === 0, () => `${name} ${zoom}×: no errors (${page.errors.join(' | ')})`);
        await page.close();
      }
    }
    results.geometry = geo;
  }

  // ---------- frame width, every option, files ----------
  if (!AB_ONLY) {
    const page = await open(desk, SWEPT);
    await clearPrefs(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-export]');
    await toExport(page);
    const widths = [];
    for (const [id, mm] of [['column', 88], ['text', 160], ['page', 180]]) {
      await rebuilt(page, () => page.click(`[data-export-size="${id}"]`));
      const r = await page.evaluate(() => ({ f: document.querySelector('[data-export-frame]').getBoundingClientRect().width, s: document.querySelector('[data-export-preview] svg').getBoundingClientRect().width, fit: !!document.querySelector('[data-export-frame][data-fitted]') }));
      widths.push(`${mm} mm: ${r.f.toFixed(3)} px (${(mm * PX_PER_MM).toFixed(3)})`);
      ok(!r.fit && Math.abs(r.f - mm * PX_PER_MM) <= 0.02 && Math.abs(r.s - mm * PX_PER_MM) <= 0.02, () => `frame at ${mm} mm: ${r.f} px, svg ${r.s} px, ${mm * PX_PER_MM} expected`);
    }
    results.widths = widths;

    // Every option reaches the preview: after each, the preview equals figureSvg of Node's figure for the page's options.
    let compared = 0;
    const check = async (label, act) => {
      const moved = await rebuilt(page, act);
      const pr = await probeOf(page);
      ok(moved, `${label}: the preview was built again`);
      ok(!pr.solve, `${label}: no solve on this circuit`);
      const fig = nodeFigure(SWEPT, pr.options);
      const diff = await samePreview(page, SV.figureSvg(fig, { id: 'smith-export-preview' }));
      ok(diff === '', () => `${label}: the preview differs from figureSvg: ${diff}`);
      compared++;
      return fig;
    };
    await check('detail minimal', () => page.click('[data-export-detail="minimal"]'));
    await check('detail full', () => page.click('[data-export-detail="full"]'));
    await check('detail standard', () => page.click('[data-export-detail="standard"]'));
    for (const c of ['grey', 'bw', 'colour']) await check(`colour ${c}`, () => page.click(`[data-export-colour="${c}"]`));
    await check('size column', () => page.click('[data-export-size="column"]'));
    await check('size other 120 mm', async () => { await page.click('[data-export-size="other"]'); await page.fill('[data-export-other]', '120 mm'); });
    ok((await probeOf(page)).width === 120, 'other: 120 mm read');
    await check('size other 4.5 in', () => page.fill('[data-export-other]', '4.5 in'));
    ok(Math.abs((await probeOf(page)).width - 114.3) < 1e-9, 'other: 4.5 in read as 114.3 mm');
    await check('size \\linewidth', () => page.fill('[data-export-other]', '\\linewidth'));
    const lw = await probeOf(page);
    ok(lw.options.linewidth === true && lw.width === F.LINEWIDTH_MM, () => `\\linewidth: linewidth and the assumed ${F.LINEWIDTH_MM} mm (${JSON.stringify(lw.options)})`);
    const b0 = await builds(page);
    await page.fill('[data-export-other]', '12 parsecs');
    await frame(page);
    ok(await page.$('[data-export-error]') !== null && await builds(page) === b0, 'an unreadable width shows a message and builds nothing');
    await check('size page', () => page.click('[data-export-size="page"]'));
    await page.click('[data-export-items] summary');
    await check('grid zy', () => page.selectOption('[data-export-item="grid"]', 'zy'));
    await check('grid y', () => page.selectOption('[data-export-item="grid"]', 'y'));
    await check('density coarse', () => page.selectOption('[data-export-item="density"]', 'coarse'));
    await check('density fine', () => page.selectOption('[data-export-item="density"]', 'fine'));
    for (const k of ['gridLabels', 'scales', 'path', 'nodes', 'nodeLabels', 'loci', 'goal', 'construction', 'solutions', 'trace', 'markers', 'legend']) {
      const fig = await check(`item ${k}`, () => page.click(`[data-export-item="${k}"]`));
      const want = (await page.isChecked(`[data-export-item="${k}"]`));
      ok(fig.detail[k] === want, `item ${k}: the figure's detail follows the box (${fig.detail[k]})`);
    }
    await check('blank chart', () => page.click('[data-export-blank]'));
    ok(await page.$eval('[data-export-items] summary', (e) => e.textContent.includes('changed')), 'a changed detail says so');
    await check('text 9 pt', () => page.selectOption('[data-export-pt]', '9'));
    await check('detail standard again', () => page.click('[data-export-detail="standard"]'));
    await check('current view', () => page.click('[data-export-area="view"]'));
    ok((await probeOf(page)).options.view !== null, 'current view: a window is passed');
    await check('whole chart', () => page.click('[data-export-area="whole"]'));
    results.options = compared;

    // Files for the standard 180 mm figure with the sweep.
    const pr = await probeOf(page);
    const fig = nodeFigure(SWEPT, pr.options);
    const svgFile = await download(page, '[data-export-svg]');
    ok(svgFile.name === 'smith-chart.svg' && svgFile.bytes.toString('utf8') === SV.figureSvg(fig), () => `the saved SVG equals figureSvg (${svgFile.name}, ${svgFile.bytes.length} bytes)`);
    const tz = TZ.figureTikz(fig);
    await page.click('[data-export-tex="picture"]');
    await frame(page);
    await page.click('[data-export-copy]');
    await page.waitForFunction(() => /Copied/.test(document.querySelector('[data-export-note]').textContent), null, { timeout: 5000 }).catch(() => {});
    // The system clipboard on Windows gives line ends back as CRLF.
    const clip = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    ok(clip === tz.picture, () => `the copied TikZ equals figureTikz's picture (${clip.length} vs ${tz.picture.length})`);
    const texP = await download(page, '[data-export-tex-save]');
    ok(texP.name === 'smith-chart.tex' && texP.bytes.toString('utf8') === tz.picture, 'the saved picture equals figureTikz');
    await page.click('[data-export-tex="document"]');
    await frame(page);
    await page.click('[data-export-copy]');
    await frame(page);
    await page.waitForFunction(() => /document/.test(document.querySelector('[data-export-note]').textContent), null, { timeout: 5000 }).catch(() => {});
    ok((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n') === tz.document, 'the copied document equals figureTikz');
    const texD = await download(page, '[data-export-tex-save]');
    ok(texD.bytes.toString('utf8') === tz.document, 'the saved document equals figureTikz');
    // PNG at 1×, 2×, 8× (88 mm: 333 px a side at 1×).
    await rebuilt(page, () => page.click('[data-export-size="column"]'));
    const small = await probeOf(page);
    const pngs = [];
    for (const f of [1, 2, 8]) {
      await page.selectOption('[data-export-png-factor]', String(f));
      await frame(page);
      const png = await download(page, '[data-export-png]');
      const h = pngHead(png.bytes), want = [Math.round(small.width * PX_PER_MM * f), Math.round(small.height * PX_PER_MM * f)];
      const dec = await decodePng(page, png.bytes.toString('base64'));
      pngs.push(`${f}×: ${h.w} × ${h.h} px, ${(png.bytes.length / 1024).toFixed(0)} kB`);
      ok(png.name === 'smith-chart.png' && h.sig === '89504e470d0a1a0a' && h.w === want[0] && h.h === want[1], () => `PNG ${f}×: ${h.w} × ${h.h}, ${want} expected`);
      ok(dec.w === want[0] && dec.h === want[1] && dec.opaque === dec.samples && dec.dark > 0, () => `PNG ${f}×: decodes to an opaque drawing (${JSON.stringify(dec)})`);
    }
    results.png = pngs;
    // The options are kept.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-export]');
    await frame(page);
    ok(await page.getAttribute('[data-export-size="column"]', 'aria-pressed') === 'true' && await page.getAttribute('[data-export-tex="document"]', 'aria-pressed') === 'true', 'the options are kept after a reload');
    ok(page.errors.length === 0, () => `options page: no errors (${page.errors.join(' | ')})`);
    await page.close();
  }

  // ---------- keyboard alone ----------
  if (!AB_ONLY) {
    const page = await open(desk, START);
    await clearPrefs(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-export]');
    await page.focus('[data-export-link]');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[data-export]').smithExport.builds > 0, null, { timeout: 5000 }).catch(() => {});
    ok(await page.evaluate(() => window.location.hash === '#export' && document.querySelector('#export').getBoundingClientRect().top < window.innerHeight), 'Enter on the toolbar\'s Export link goes to the section');
    const tabTo = async (sel) => {
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press('Tab');
        if (await page.evaluate((s) => document.activeElement?.matches(s), sel)) return true;
      }
      return false;
    };
    ok(await tabTo('[data-export-colour="bw"]'), 'Tab reaches the colour mode');
    await rebuilt(page, () => page.keyboard.press('Enter'));
    ok(await page.getAttribute('[data-export-colour="bw"]', 'aria-pressed') === 'true' && (await probeOf(page)).options.colour === 'bw', 'Enter picks black and white');
    ok(await tabTo('[data-export-svg]'), 'Tab reaches Save SVG');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.keyboard.press('Enter')]);
    ok(dl.suggestedFilename() === 'smith-chart.svg', 'Enter on Save SVG saves the file');
    ok(page.errors.length === 0, () => `keyboard page: no errors (${page.errors.join(' | ')})`);
    if (shots) {
      await page.evaluate(() => document.querySelector('[data-export-colour="colour"]').click());
      await frame(page);
      await page.screenshot({ path: join(shots, 'export-1440-light.png') }).catch(() => {});
    }
    await page.close();
  }

  // ---------- 320 and 390 px ----------
  for (const width of AB_ONLY ? [] : [320, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: width === 390 ? 'dark' : 'light', hasTouch: true, isMobile: true });
    const page = await open(ctx, START);
    await setPrefs(page, { size: 'page', fit: true });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-export]');
    await toExport(page);
    const st = () => page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      frame: document.querySelector('[data-export-frame]').getBoundingClientRect().width,
      wrap: document.querySelector('[data-export-wrap]').getBoundingClientRect().width,
      note: document.querySelector('[data-export-size-note]').textContent, fit: !!document.querySelector('[data-export-fit]'),
    }));
    let s = await st();
    ok(s.sw <= s.cw, `${width} px, fitted: no horizontal scroll (${s.sw} > ${s.cw})`);
    ok(s.fit && s.frame <= s.wrap + 0.5 && /scaled to \d+ %/.test(s.note), () => `${width} px: 180 mm is fitted and says it is scaled (${JSON.stringify(s)})`);
    if (shots) await page.screenshot({ path: join(shots, `export-${width}-${width === 390 ? 'dark' : 'light'}.png`) }).catch(() => {});
    await page.click('[data-export-fit]');
    await frame(page);
    s = await st();
    ok(s.sw <= s.cw, `${width} px, true size: no horizontal scroll (${s.sw} > ${s.cw})`);
    ok(Math.abs(s.frame - 180 * PX_PER_MM) <= 0.02 && /true size/.test(s.note), () => `${width} px: true size when not fitted (${JSON.stringify(s)})`);
    ok(page.errors.length === 0, () => `${width} px: no errors (${page.errors.join(' | ')})`);
    await ctx.close();
  }

  // ---------- A/B: the drag with the section never near the screen (B) and after it was built (A), 2 pairs ----------
  // One page, so both arms have seen the same sections: A with the preview's figure in the DOM (a Full ZY figure
  // at 180 mm with a sweep, the largest preset), B with it taken out; interleaved B, A, B, A.
  {
    const runs = { A: [], B: [] };
    const page = await open(desk, SWEPT);
    await setPrefs(page, { area: 'view', size: 'page', detail: 'full' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-export]');
    ok((await builds(page)) === 0, 'A/B: nothing is built before the section is near the screen');
    await toExport(page);
    ok((await builds(page)) > 0, 'A/B: the figure was built');
    await page.evaluate(() => { window.smithPreviewHtml = document.querySelector('[data-export-preview]').innerHTML; });
    const snap = await page.getAttribute('[data-snap-toggle]', 'aria-pressed');
    if (snap === 'true') { await page.click('[data-snap-toggle]'); await frame(page); }
    for (let pair = 0; pair < 2; pair++) {
      for (const arm of ['B', 'A']) {
        await page.evaluate((a) => { document.querySelector('[data-export-preview]').innerHTML = a === 'A' ? window.smithPreviewHtml : ''; }, arm);
        runs[arm].push(await dragCost(page));
      }
    }
    ok(page.errors.length === 0, () => `A/B page: no errors (${page.errors.join(' | ')})`);
    await page.close();
    const med = (xs) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
    const added = runs.A.reduce((a, x, i) => a + x - runs.B[i], 0) / runs.A.length;
    results.ab = `B ${runs.B.map((x) => x.toFixed(2)).join(', ')} ms, A ${runs.A.map((x) => x.toFixed(2)).join(', ')} ms per frame; added ${added.toFixed(2)} ms (medians ${med(runs.B).toFixed(2)}, ${med(runs.A).toFixed(2)})`;
    ok(added <= 0.3, `A/B 4×: the Export section adds ${added.toFixed(2)} ms per drag frame (at most 0.3)`);
  }
  await desk.close();
} catch (e) {
  ok(false, `exception: ${e.stack ?? e}`);
} finally {
  await browser.close();
  stopServer();
}

for (const [k, v] of Object.entries(results)) console.log(`${k}: ${Array.isArray(v) ? `\n  ${v.join('\n  ')}` : v}`);
console.log(`ui-export: ${passed} passed, ${failed} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failed ? 1 : 0);
