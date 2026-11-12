// Drives /smith-chart/main in the installed Edge (or Chrome) and checks the grid layer from the DOM: every arc read
// back from the path data and mapped to Γ lies on a circle of the r, x, g or b family (centres and radii of facts.md)
// to 1e-9 and inside the unit disc, at the whole chart, 16× and 256×; no two label boxes (getBBox through getCTM, an
// independent polygon test) overlap at five zoom levels; Z, Y and ZY share one Γ plane (D13); both themes; no
// horizontal scroll at 320 px; the time to rebuild the layer on a zoom change. Uses the dev server on port 3020 if it
// runs, else starts one and stops it again.
//   tsx ui-grid.mjs [screenshot folder] [base URL]      (npm run ui runs it without screenshots, then ui-chart.mjs)

import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const shots = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : null;
const base = process.argv[3] ?? 'http://localhost:3020';

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

let passed = 0;
const failures = [];
let failed = 0;
const ok = (condition, what) => { if (condition) passed++; else if (failed++ < 60) failures.push(what); };

// The five centres M2.1b's page offered; the view is set through the chart's controller (M2.2 replaced the controls).
const CENTRES = [[0, 0], [0.5, 0.3], [-0.95, 0], [0.95, 0], [0, 0.97]];
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
async function setView(page, { zoom, centre, mode }) {
  if (mode) await page.getByRole('radio', { name: mode, exact: true }).check();
  if (zoom !== undefined || centre !== undefined) {
    await page.evaluate(([z, c]) => {
      const v = document.querySelector('[data-chart]').smithChart;
      v.setView(c ? c[0] : v.cx, c ? c[1] : v.cy, z === null ? v.k : v.kFit * z);
    }, [zoom ?? null, centre === undefined ? null : CENTRES[centre]]);
  }
  await frame(page);
}
async function open(context) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${base}/smith-chart/main`, { waitUntil: 'networkidle' });
  await page.waitForSelector('svg[data-level]');
  return page;
}

// ---------- geometry read back from the path data ----------

const readPaths = (page) => page.evaluate(() => {
  const svg = document.querySelector('svg[data-level]');
  const parts = {};
  for (const p of svg.querySelectorAll('path')) parts[p.dataset.part] = p.getAttribute('d');
  return { parts, kq: Number(svg.dataset.kq), ox: Number(svg.dataset.ox), oy: Number(svg.dataset.oy) };
});

/** Subpaths of `d` as {S, cmd, R, large, sweep, E} in user units (y down). */
function subpaths(d) {
  const out = [];
  const tokens = d.match(/[MAL]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0, cur = null;
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const c = tokens[i++];
    if (c === 'M') cur = [num(), num()];
    else if (c === 'L') { const E = [num(), num()]; out.push({ cmd: 'L', S: cur, E }); cur = E; }
    else if (c === 'A') {
      const R = num(); num(); num(); const large = num(), sweep = num(); const E = [num(), num()];
      out.push({ cmd: 'A', S: cur, E, R, large, sweep }); cur = E;
    } else throw new Error(`unexpected ${c}`);
  }
  return out;
}

/** Centre and midpoint of an SVG arc (rx = ry, no rotation) by the endpoint-to-centre conversion of the SVG spec. */
function arcCentre(S, E, R, large, sweep) {
  const x1p = (S[0] - E[0]) / 2, y1p = (S[1] - E[1]) / 2, d2 = x1p * x1p + y1p * y1p;
  let r = R;
  if (d2 > r * r) r = Math.sqrt(d2);
  // a half circle (the two halves of a full one): the centre is the chord's midpoint, not a rounding error away
  const coef = r * r - d2 <= 1e-12 * r * r ? 0 : (large !== sweep ? 1 : -1) * Math.sqrt((r * r - d2) / d2);
  const cxp = coef * y1p, cyp = -coef * x1p;
  const C = [cxp + (S[0] + E[0]) / 2, cyp + (S[1] + E[1]) / 2];
  const t1 = Math.atan2(y1p - cyp, x1p - cxp);
  let dt = Math.atan2(-y1p - cyp, -x1p - cxp) - t1;
  if (sweep === 0 && dt > 0) dt -= 2 * Math.PI;
  if (sweep === 1 && dt < 0) dt += 2 * Math.PI;
  const tm = t1 + dt / 2;
  return { C, M: [C[0] + r * Math.cos(tm), C[1] + r * Math.sin(tm)], r };
}

// z = (1 + Γ) / (1 − Γ)
const zOf = (g) => { const dr = 1 - g[0], di = -g[1], q = dr * dr + di * di; return [((1 + g[0]) * dr + g[1] * di) / q, (g[1] * dr - (1 + g[0]) * di) / q]; };
const yOf = (g) => zOf([-g[0], -g[1]]);

let arcsChecked = 0;
function checkGeometry(data, what) {
  const { parts, kq, ox, oy } = data;
  const G = (p) => [p[0] / kq + ox, oy - p[1] / kq];
  const counts = {};
  for (const name of ['axis', 'z-major', 'z-minor', 'y-major', 'y-minor']) {
    const subs = subpaths(parts[name] ?? '');
    counts[name] = subs.length;
    const zFam = name.startsWith('z'), yFam = name.startsWith('y');
    for (const s of subs) {
      arcsChecked++;
      const S = G(s.S), E = G(s.E);
      const inDisc = Math.hypot(S[0], S[1]) <= 1 + 1e-9 && Math.hypot(E[0], E[1]) <= 1 + 1e-9;
      if (s.cmd === 'L') {
        if (name === 'axis') { ok(inDisc && Math.abs(S[1]) <= 1e-12 && Math.abs(E[1]) <= 1e-12, `${what}: the real axis on y = 0 inside the disc`); continue; }
        // a flat arc drawn straight: both ends on one circle of the family (same Re or Im of z, or of y)
        const f = zFam ? zOf : yOf, a = f(S), b = f(E);
        const same = (u, v) => Math.abs(u - v) <= 1e-9 * Math.max(1, Math.abs(u));
        ok(inDisc && (same(a[0], b[0]) || same(a[1], b[1])), `${what}: ${name} straight segment ends on one circle ${S} ${E}`);
        continue;
      }
      const R = s.R / kq;
      const { C, M } = arcCentre(s.S, s.E, s.R, s.large, s.sweep);
      const Cg = G(C), Mg = G(M);
      const cands = [];
      if (zFam || name === 'axis') cands.push([1 - R, 0], [1, R], [1, -R]);
      if (yFam || name === 'axis') cands.push([R - 1, 0], [-1, R], [-1, -R]);
      let best = null, bestD = Infinity;
      for (const c of cands) { const dd = Math.hypot(c[0] - Cg[0], c[1] - Cg[1]); if (dd < bestD) { bestD = dd; best = c; } }
      const tolR = 1e-9 * Math.max(1, R);
      const on = (P, tol) => Math.abs(Math.hypot(P[0] - best[0], P[1] - best[1]) - R) <= tol;
      ok(bestD <= tolR && on(S, 1e-9) && on(E, 1e-9) && on(Mg, tolR),
        `${what}: ${name} arc R ${R} centre ${Cg} not on a family circle (off by ${bestD}) or ends off it`);
      ok(inDisc && Math.hypot(Mg[0], Mg[1]) <= 1 + 1e-9, `${what}: ${name} arc leaves the unit disc (flags) mid ${Mg}`);
    }
  }
  return counts;
}

// ---------- labels: oriented boxes and an overlap test ----------

const readBoxes = (page) => page.evaluate(() => {
  const svg = document.querySelector('svg[data-level]');
  return [...svg.querySelectorAll('text')].map((t) => {
    const b = t.getBBox(), m = t.getCTM();
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]];
    return { text: t.textContent, w: b.width, s: Math.hypot(m.a, m.b), q: pts.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]) };
  });
});

/** Depth of overlap of two convex polygons (separating axis test); ≤ 0 when they do not overlap. */
function overlap(p, q) {
  let depth = Infinity;
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const nx = a[1] - b[1], ny = b[0] - a[0], len = Math.hypot(nx, ny);
      let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
      for (const v of p) { const d = (v[0] * nx + v[1] * ny) / len; p0 = Math.min(p0, d); p1 = Math.max(p1, d); }
      for (const v of q) { const d = (v[0] * nx + v[1] * ny) / len; q0 = Math.min(q0, d); q1 = Math.max(q1, d); }
      depth = Math.min(depth, Math.min(p1, q1) - Math.max(p0, q0));
      if (depth <= 0) return depth;
    }
  }
  return depth;
}

// r and g labels sit on the real axis, x and b labels at the rim (M2.1a): a window that holds neither has none.
function checkLabels(boxes, what, expectLabels = true) {
  if (expectLabels) ok(boxes.length > 0, `${what}: labels drawn`);
  let worst = 0, pair = '';
  for (let i = 0; i < boxes.length; i++) {
    // the grid sizes boxes at 0.6 em per character + 2 px: the real text must not be wider
    ok(boxes[i].w <= boxes[i].text.length * 0.6 * 11 + 2 + 0.5, `${what}: label "${boxes[i].text}" ${boxes[i].w} px wider than its estimate`);
    for (let j = i + 1; j < boxes.length; j++) {
      const d = overlap(boxes[i].q, boxes[j].q);
      if (d > worst) { worst = d; pair = `"${boxes[i].text}" and "${boxes[j].text}"`; }
    }
  }
  ok(worst <= 0.5, `${what}: labels ${pair} overlap by ${worst.toFixed(2)} px`);
  return boxes.length;
}

// ---------- the checks ----------

const light = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
const page = await open(light);

// geometry at the whole chart, 16× and 256× (five centres when zoomed), in Z, Y and ZY
for (const mode of ['Z', 'Y', 'ZY']) {
  for (const zoom of [1, 16, 256]) {
    for (const centre of zoom === 1 ? [0] : [0, 1, 2, 3, 4]) {
      await setView(page, { mode, zoom, centre });
      const counts = checkGeometry(await readPaths(page), `${mode} ${zoom}× centre ${centre}`);
      const zLines = counts['z-major'] + counts['z-minor'], yLines = counts['y-major'] + counts['y-minor'];
      ok(mode === 'Y' ? zLines === 0 && yLines > 0 : mode === 'Z' ? yLines === 0 && zLines > 0 : zLines > 0 && yLines > 0,
        `${mode} ${zoom}× centre ${centre}: the mode's families are drawn (z ${zLines}, y ${yLines})`);
    }
  }
}

// labels at five zoom levels, three centres, three modes
let labelsSeen = 0;
for (const mode of ['Z', 'Y', 'ZY']) {
  for (const zoom of [1, 2, 8, 64, 256]) {
    for (const centre of [0, 1, 3]) {
      await setView(page, { mode, zoom, centre });
      labelsSeen += checkLabels(await readBoxes(page), `${mode} ${zoom}× centre ${centre}`, zoom <= 8 || centre !== 1);
    }
  }
}

// D13: the modes share one Γ plane; the screen position of Γ points does not change with the mode
const screenOf = (pg) => pg.evaluate(() => {
  const svg = document.querySelector('svg[data-level]'), g = svg.firstElementChild, m = g.getScreenCTM();
  const kq = Number(svg.dataset.kq), ox = Number(svg.dataset.ox), oy = Number(svg.dataset.oy);
  const pts = [[0, 0], [1, 0], [0, 1], [-0.5, -0.5], [0.6, 0.2]];
  return pts.map(([x, y]) => { const u = (x - ox) * kq, v = (oy - y) * kq; return [m.a * u + m.c * v + m.e, m.b * u + m.d * v + m.f]; });
});
for (const [zoom, centre] of [[1, 0], [8, 1]]) {
  await setView(page, { mode: 'Z', zoom, centre });
  const ref = await screenOf(page);
  const rimRef = await page.locator('path[data-part=axis]').boundingBox();
  for (const mode of ['Y', 'ZY', 'Z']) {
    await setView(page, { mode });
    const pts = await screenOf(page);
    ok(pts.every((p, i) => Math.hypot(p[0] - ref[i][0], p[1] - ref[i][1]) < 1e-6), `D13 ${zoom}×: Γ points stay put in ${mode}`);
    const rim = await page.locator('path[data-part=axis]').boundingBox();
    ok(['x', 'y', 'width', 'height'].every((key) => Math.abs(rim[key] - rimRef[key]) < 0.01), `D13 ${zoom}×: the rim and axis stay put in ${mode}`);
  }
}

// rebuild time on zoom changes: through all levels and back at Γ = 0.5 + j0.3, ZY
await setView(page, { mode: 'ZY', zoom: 1, centre: 1 });
const times = [];
let zoomSteps = 0;
const steps = [];
for (let z = 0; z <= 10; z += 0.25) steps.push(z);
for (const z of [...steps, ...steps.slice().reverse()]) {
  const before = await page.evaluate(() => Number(document.querySelector('svg[data-level]').dataset.builds));
  await setView(page, { zoom: 2 ** z });
  zoomSteps++;
  const d = await page.evaluate(() => { const s = document.querySelector('svg[data-level]').dataset; return { b: Number(s.builds), build: Number(s.buildMs), dom: Number(s.domMs) }; });
  if (d.b !== before) times.push(d);
}
ok(times.length > 0, 'the layer rebuilds when zooming');
const stat = (xs) => { const s = xs.slice().sort((a, b) => a - b); return `median ${s[s.length >> 1].toFixed(2)}, max ${s[s.length - 1].toFixed(2)}`; };
ok(page.errors.length === 0, `no errors in the console: ${page.errors.join(' | ')}`);

// themes
const dark = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
const pageDark = await open(dark);
await setView(page, { mode: 'ZY', zoom: 1, centre: 0 });
await setView(pageDark, { mode: 'ZY' });
const look = (pg) => pg.evaluate(() => {
  const css = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop];
  return { body: css('body', 'backgroundColor'), minor: css('path[data-part=z-minor]', 'stroke'), y: css('path[data-part=y-major]', 'stroke'),
    text: css('svg[data-level] text', 'fill'), nonScaling: css('path[data-part=z-minor]', 'vectorEffect'), labels: document.querySelectorAll('svg[data-level] text').length };
});
const L = await look(page), D = await look(pageDark);
ok(D.body === 'rgb(43, 43, 43)', `dark page background #2b2b2b: ${D.body}`);
ok(L.body !== D.body && L.minor !== D.minor && L.y !== D.y && L.text !== D.text, `light and dark differ: ${JSON.stringify(L)} ${JSON.stringify(D)}`);
ok(L.nonScaling === 'non-scaling-stroke', `strokes do not scale: ${L.nonScaling}`);
ok(D.labels > 0 && D.labels === L.labels, `dark theme has the same labels: ${D.labels} ${L.labels}`);
ok(pageDark.errors.length === 0, `no errors in the dark page: ${pageDark.errors.join(' | ')}`);

// 320 px: no horizontal scroll, the chart fits
const narrow = await browser.newContext({ viewport: { width: 320, height: 640 }, colorScheme: 'light' });
const pageNarrow = await open(narrow);
for (const mode of ['Z', 'ZY']) {
  await setView(pageNarrow, { mode, zoom: 1, centre: 0 });
  const sc = await pageNarrow.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(sc.sw <= sc.cw, `no horizontal scroll at 320 px in ${mode}: ${sc.sw} > ${sc.cw}`);
  checkLabels(await readBoxes(pageNarrow), `320 px ${mode}`);
}

// screenshots: 390 px dark, 1440 px light, at most 1000 px wide
if (shots) {
  mkdirSync(shots, { recursive: true });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const pp = await open(phone);
  await setView(pp, { mode: 'Z' });
  await pp.screenshot({ path: join(shots, 'grid-390-dark.png') });
  const wide = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 0.625, colorScheme: 'light' });
  const pw = await open(wide);
  await setView(pw, { mode: 'ZY', zoom: 1, centre: 0 });
  await pw.screenshot({ path: join(shots, 'grid-1440-light.png') });
}

await browser.close();
stopServer();
for (const failure of failures) console.log(`FAIL ${failure}`);
console.log(`grid layer: ${arcsChecked} arcs read back, ${labelsSeen} labels at 45 views, ${zoomSteps} zoom steps with ${times.length} rebuilds`);
console.log(`rebuild on a zoom change (ms): grid data ${stat(times.map((t) => t.build))}; DOM ${stat(times.map((t) => t.dom))}; both ${stat(times.map((t) => t.build + t.dom))}`);
console.log(`smith page: ${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
