// The export figures (step M8.1a, lib/emsim/figure/, notes-M8.1a.md), called from check.mjs as "Figures (M8.1a)".
//
// - Every builder on the default setups (C39 microstrip, C41 pair, a stripline, a general arrangement, the C44 via
//   and the C45 pair; field maps on the section and both via views; the sweep, TDR, TDT and S-parameter plots) at
//   every size (40, 88, 160, 180 mm and \linewidth) in every colour mode: the SVG and the TikZ are read back here
//   (small readers of their own) against the model, every coordinate to 1e-6 mm; text never under 6 pt and inside
//   the box; b&w only #000000 and #ffffff, greyscale only greys (images too); no NaN; plots' series and ticks inside
//   their frame; the \linewidth form is the 160 mm body with another unit; the SVG self-contained (no external
//   href, a generic font family, images as data URIs); the PNG encoder's bytes inflate back to the pixels.
// - Compile (TeX Live; "skipped: no pdflatex" without it): every figure in every colour mode at 88 mm and in colour at
//   40, 160 and 180 mm, with pdflatex -halt-on-error a few at a time: no overfull box or missing character, MediaBox
//   equal to the figure's mm to 0.1 mm; the \linewidth form inside minipages of 70 and 160 mm.
// - Timing: the biggest figure (the section's field map at 180 mm) built and written.
// Environment: EMSIM_FIG_OUT = a folder to keep the compiled documents in (else a temp folder, removed after).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { inflateSync } from 'node:zlib';
import * as M0 from '../../../lib/emsim/figure/model.ts';
import * as B0 from '../../../lib/emsim/figure/board.ts';
import * as FF0 from '../../../lib/emsim/figure/field.ts';
import * as PF0 from '../../../lib/emsim/figure/plot.ts';
import * as SV0 from '../../../lib/emsim/figure/svg.ts';
import * as TZ0 from '../../../lib/emsim/figure/tikz.ts';
import * as PN0 from '../../../lib/emsim/figure/png.ts';
import * as ST0 from '../../../lib/emsim/figure/style.ts';
import * as SU0 from '../../../lib/emsim/setup.ts';
import * as SR0 from '../../../lib/emsim/structure.ts';
import * as V0 from '../../../lib/emsim/via.ts';
import * as LN0 from '../../../lib/emsim/lines.ts';
import * as F0 from '../../../lib/emsim/fields.ts';
import * as J0 from '../../../lib/emsim/jobs.ts';
import * as VF0 from '../../../lib/emsim/viafield.ts';
import * as VM0 from '../../../lib/emsim/viamodel.ts';
import * as VA0 from '../../../lib/emsim/vary.ts';
import * as CM0 from '../../../lib/emsim/colormap.ts';
import * as PL0 from '../../../lib/emsim/plot.ts';
import * as VG0 from '../../../lib/emsim/viaGeom.ts';

const d = (m) => m.default ?? m;
const M = d(M0), B = d(B0), FF = d(FF0), PF = d(PF0), SV = d(SV0), TZ = d(TZ0), PN = d(PN0), STY = d(ST0), SU = d(SU0), SR = d(SR0), V = d(V0);
const LN = d(LN0), F = d(F0), J = d(J0), VF = d(VF0), VM = d(VM0), VA = d(VA0), CM = d(CM0), PL = d(PL0), VG = d(VG0);

const TOL = 1.01e-6;
const drain = (g) => { for (;;) { const s = g.next(); if (s.done) return s.value; } };

// ---------------------------------------------------------------------------------------------------------------
// Inputs

function inputs() {
  const su = SU.defaultSetup();
  const st = su.stackup;
  const pairOf = (kind, w, s) => { const x = SR.presetStructure(kind, st, w); x.s.v = s; return { ...su, trace: x }; };
  const C41 = pairOf('pair-microstrip', 0.11, 0.2);
  const strip = { ...su, trace: SR.presetStructure('stripline', st, 0.1) };
  const gen = { ...su, trace: SR.toGeneral(st, SR.presetStructure('cpwg', st, 0.2)) };
  const sections = [['C39 microstrip', su], ['C41 pair', C41], ['stripline', strip], ['general', gen]].map(([name, x]) => {
    const sec = LN.setupSection(x);
    if (typeof sec === 'string') throw new Error(`${name}: ${sec}`);
    return { name, setup: x, sec };
  });
  // the section's field (C39, |E| with equipotentials and field lines) and the pair's φ (odd)
  const fieldOf = (x, sec, drive, qty, nx) => {
    const r = drain(J.runJob({ kind: 'field', setup: x, drive, view: F.sectionView(sec, nx) }));
    if (!r.ok) throw new Error(r.reason);
    const values = qty === 'phi' ? r.grid.phi : F.magnitude(r.grid);
    const scale = CM.scaleOf(values, qty === 'phi' ? 'signed' : 'linear', { cls: r.grid.cls });
    return { view: r.grid.view, values, cls: r.grid.cls, scale, unit: qty === 'phi' ? 'V' : 'V/m', label: qty === 'phi' ? 'φ' : '|E|', contours: r.contours, lines: r.lines };
  };
  const mapC39 = fieldOf(su, sections[0].sec, { name: 'line' }, 'E', 241);
  const mapC41 = fieldOf(C41, sections[1].sec, { name: 'odd' }, 'phi', 161);
  const pair = V.presetVia('pair', st);
  const side = VG.sideGeom(st, su.via, su.trace.w.v);
  const th = side.thick;
  const sideRes = VF.viaFieldJob(st, su.via, { which: 'side', view: { x0: side.box.x0, x1: side.box.x1, z0: th - side.box.y1, z1: th - side.box.y0, nx: 141, ny: 81 }, contours: 10 });
  const sres = drain(sideRes);
  if (!sres.ok) throw new Error(`side map: ${sres.reason}`);
  const top = VG.topGeom(st, pair, su.trace.w.v);
  const tres = drain(VF.viaFieldJob(st, pair, { which: 'top', view: { x0: top.box.x0, x1: top.box.x1, z0: -top.box.y1, z1: -top.box.y0, nx: 161, ny: 161 }, drive: [0.5, -0.5], contours: 10, lines: 24 }));
  if (!tres.ok) throw new Error(`top map: ${tres.reason}`);
  const vmap = (r, qty, kind) => {
    const values = qty === 'phi' ? r.grid.phi : F.magnitude(r.grid);
    return { view: r.grid.view, values, cls: r.grid.cls, scale: CM.scaleOf(values, kind, { cls: r.grid.cls }), unit: qty === 'phi' ? 'V' : 'V/m', label: qty === 'phi' ? 'φ' : '|E|', contours: r.contours, lines: r.lines };
  };
  const mapSide = vmap(sres, 'E', 'log'), mapTop = vmap(tres, 'phi', 'signed');
  // plots: the C39 width sweep, the C44 TDR and TDT, |S11| and |S21|, the C45 pair's Sdd
  const xs = Array.from({ length: 31 }, (_, i) => 0.08 + 0.004 * i);
  const sw = drain(VA.sweep(su, 'w', xs));
  const c44 = VM.viaModel(st, su.via, su.trace), c45 = VM.viaModel(st, pair, null);
  const axis = (lo, hi, label, extra = {}) => ({ ...PL.niceAxis(lo, hi, 6), label, ...extra });
  const ext = (...a) => PL.extent(...a);
  const swY = sw.points.map((p) => p.values.z0);
  const tdr = c44.tdr, tz = ext(tdr.z, [50]);
  const tAx = PL.niceAxis(tdr.t[0], tdr.t[tdr.t.length - 1], 6);
  const ts = PL.timeScale(tAx);
  const sOf = (np, i, j) => { const P = np.ports, n = np.f.length, out = new Float64Array(n); for (let k = 0; k < n; k++) { const o = ((k * P + i) * P + j) * 2; out[k] = PL.dbOf(np.s[o], np.s[o + 1]); } return out; };
  const fG = Array.from(c44.nport.f, (f) => f / 1e9);
  const s11 = sOf(c44.nport, 0, 0), s21 = sOf(c44.nport, 1, 0), sdd11 = sOf(c45.mixed, 0, 0), sdd21 = sOf(c45.mixed, 1, 0);
  const fAx = (np) => ({ min: 0, max: PL.niceAxis(0, np.f[np.f.length - 1] / 1e9, 6).max, label: 'f (GHz)' });
  const plots = {
    sweep: { name: 'sweep', what: 'Z0 against the trace width', x: axis(xs[0], xs[xs.length - 1], 'w (mm)', { pad: 0 }), y: axis(...ext(swY), 'Z0 (Ω)'), series: [{ xs, ys: swY, label: 'Z0' }], refs: [{ y: 50, label: '50 Ω' }] },
    tdr: { name: 'tdr', what: 'TDR of the via', x: { ...tAx, label: `t (${ts.unit})`, k: ts.k }, y: axis(tz[0], tz[1], 'Z (Ω)'), series: [{ xs: tdr.t, ys: tdr.z }], refs: [{ y: 50, label: 'port 50 Ω' }] },
    tdt: { name: 'tdt', what: 'TDT of the via', x: { ...tAx, label: `t (${ts.unit})`, k: ts.k }, y: axis(0, 1, 'step through'), series: [{ xs: tdr.t, ys: tdr.tdt }] },
    sparams: { name: 's-params', what: '|S11| and |S21| of the via', x: fAx(c44.nport), y: axis(...ext(s11, s21), '|S| (dB)'), series: [{ xs: fG, ys: s11, label: '|S11|' }, { xs: fG, ys: s21, label: '|S21|' }], refs: [{ x: c44.valid.fMax / 1e9, label: 'lumped model' }] },
    pair: { name: 'sdd', what: 'Sdd of the via pair', x: fAx(c45.mixed), y: { min: -60, max: 0, label: '|S| (dB)' }, series: [{ xs: Array.from(c45.mixed.f, (f) => f / 1e9), ys: sdd11, label: '|Sdd11|' }, { xs: Array.from(c45.mixed.f, (f) => f / 1e9), ys: sdd21, label: '|Sdd21|' }] },
  };
  const S = (x) => x.setup;
  const builders = [
    ['stackup', (o) => B.stackupFigure(st, o)],
    ['stackup to scale', (o) => B.stackupFigure(st, { ...o, widen: false })],
    ...sections.map((s) => [`section ${s.name}`, (o) => B.sectionFigure(S(s).stackup, S(s).trace, s.sec, o)]),
    ['section C39 map', (o) => B.sectionFigure(st, su.trace, sections[0].sec, { ...o, map: mapC39 })],
    ['section C41 phi', (o) => B.sectionFigure(st, C41.trace, sections[1].sec, { ...o, map: mapC41 })],
    ['via side C44', (o) => B.viaSideFigure(st, su.via, su.trace.w.v, o)],
    ['via side C45', (o) => B.viaSideFigure(st, pair, su.trace.w.v, o)],
    ['via side C44 map', (o) => B.viaSideFigure(st, su.via, su.trace.w.v, { ...o, map: mapSide })],
    ['via top C44', (o) => B.viaTopFigure(st, su.via, su.trace.w.v, o)],
    ['via top C45', (o) => B.viaTopFigure(st, pair, su.trace.w.v, o)],
    ['via top C45 map', (o) => B.viaTopFigure(st, pair, su.trace.w.v, { ...o, map: mapTop })],
    ...Object.entries(plots).map(([k, p]) => [`plot ${k}`, (o) => PF.plotFigure(p, o)]),
  ];
  return { builders, mapC39, st, su, sec0: sections[0].sec };
}

// ---------------------------------------------------------------------------------------------------------------
// Readers

const attrs = (s) => { const o = {}; for (const m of s.matchAll(/([\w:-]+)="([^"]*)"/g)) o[m[1]] = m[2]; return o; };
const pathNums = (dd) => (dd.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);

/** The SVG's elements by primitive index. */
function readSvg(svg) {
  const byI = new Map(), hatch = new Map(), colours = new Set();
  for (const m of svg.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{6})"/g)) colours.add(m[1].toLowerCase());
  for (const line of svg.split('\n')) {
    const m = /^(?:<g[^>]*>)?<(rect|circle|path|text|image)\s([^>]*?)\/?>(?:([^<]*)<\/text>)?/.exec(line);
    if (!m) continue;
    const a = attrs(m[2]);
    if (a['data-h'] !== undefined) { hatch.set(+a['data-h'], a); continue; }
    if (a['data-i'] === undefined) continue;
    byI.set(+a['data-i'], { el: m[1], a, text: m[3] });
  }
  return { byI, hatch, colours };
}

/** The TikZ's statements by primitive index. */
function readTikz(src) {
  const byI = new Map(), hatch = new Map(), colours = new Set();
  for (const m of src.matchAll(/\\definecolor\{em\w+\}\{HTML\}\{([0-9A-F]{6})\}/g)) colours.add(`#${m[1].toLowerCase()}`);
  for (const line of src.split('\n')) {
    const m = /%([ph])(\d+)$/.exec(line);
    if (!m) continue;
    const i = +m[2], map = m[1] === 'p' ? byI : hatch;
    if (!map.has(i)) map.set(i, []);
    map.get(i).push(line);
  }
  const body = src.slice(src.indexOf('\\begin{tikzpicture}'));
  return { byI, hatch, colours, body: body.slice(body.indexOf('\n')) };
}
const coords = (line) => [...line.matchAll(/\((-?[\d.]+),(-?[\d.]+)\)/g)].flatMap((m) => [+m[1], +m[2]]);

function close(a, b, what, out) {
  if (a.length !== b.length) { out.push(`${what}: ${a.length} numbers, wanted ${b.length}`); return Infinity; }
  let w = 0;
  for (let i = 0; i < a.length; i++) w = Math.max(w, Math.abs(a[i] - b[i]));
  if (!(w <= TOL)) out.push(`${what}: off by ${w}`);
  return w;
}

/** The model's numbers of a primitive as the writers put them (y up). */
function modelNums(p) {
  switch (p.t) {
    case 'rect': case 'image': return [p.x, p.y, p.x + p.w, p.y + p.h];
    case 'circle': return [p.cx, p.cy, p.r];
    case 'poly': return p.pts;
    case 'segs': return p.s;
    case 'text': return [p.x, p.y];
  }
}

function checkSvg(fig, svg, bad, stats) {
  const r = readSvg(svg);
  let worst = 0;
  fig.prims.forEach((p, i) => {
    const e = r.byI.get(i);
    if (!e) { bad.push(`svg: primitive ${i} (${p.t} ${p.role}) missing`); return; }
    const a = e.a;
    let got;
    switch (p.t) {
      case 'rect': case 'image': got = [+a.x, -(+a.y) - +a.height, +a.x + +a.width, -(+a.y)]; break;
      case 'circle': got = [+a.cx, -a.cy, +a.r]; break;
      case 'text': got = [+a.x, -(+a.y) + 0.35 * +a['font-size']]; if (Math.abs(+a['font-size'] - p.pt * M.PT_MM) > 1e-6) bad.push(`svg text ${i}: size ${a['font-size']}`); break;
      default: { const n = pathNums(a.d); got = n.map((v, k) => (k % 2 ? -v : v)); }
    }
    worst = Math.max(worst, close(got, modelNums(p), `svg ${p.t} ${i} ${p.role}`, bad));
    if (p.t === 'image' && !a['xlink:href'].startsWith('data:image/png;base64,')) bad.push(`svg image ${i}: not a data URI`);
  });
  if (r.byI.size !== fig.prims.length) bad.push(`svg: ${r.byI.size} elements for ${fig.prims.length} primitives`);
  if (/href="(?!data:)/.test(svg) || /url\((?!#)/.test(svg) || /@import|<style|<script/.test(svg)) bad.push('svg: not self-contained');
  if (!/font-family="sans-serif"/.test(svg)) bad.push('svg: no generic font family');
  stats.svgWorst = Math.max(stats.svgWorst, worst);
  return r;
}

function checkTikz(fig, tz, bad, stats) {
  const r = readTikz(tz.picture);
  let worst = 0;
  fig.prims.forEach((p, i) => {
    const ls = r.byI.get(i);
    if (!ls) { bad.push(`tikz: primitive ${i} (${p.t} ${p.role}) missing`); return; }
    let got;
    if (p.t === 'poly' && ls.length > 1) {
      got = [];
      ls.forEach((l, k) => { const c = coords(l); got.push(...(k ? c.slice(2) : c)); });
    } else if (p.t === 'circle') {
      got = [...coords(ls[0]), +(/radius=([\d.]+)/.exec(ls[0])[1])];
    } else if (p.t === 'image') {
      const c = coords(ls[0]);
      const u = (s) => (fig.linewidth ? +s * fig.width : +s);
      const w = u(/width=([\d.]+)/.exec(ls[0])[1]), h = u(/height=([\d.]+)/.exec(ls[0])[1]);
      got = [c[0], c[1], c[0] + w, c[1] + h];
    } else got = ls.flatMap(coords);
    if (p.t === 'text') {
      const fs = /\\fontsize\{([\d.]+)\}/.exec(ls[0]);
      if (!fs || Math.abs(+fs[1] - p.pt) > 1e-6 || +fs[1] < M.MIN_PT) bad.push(`tikz text ${i}: size ${fs && fs[1]}`);
      const rot = /rotate=(-?[\d.]+)/.exec(ls[0]);
      if ((rot ? +rot[1] : 0) !== p.rotate) bad.push(`tikz text ${i}: rotate ${rot && rot[1]}`);
      if (!ls[0].includes(`{${TZ.texText(p.text)}};`)) bad.push(`tikz text ${i}: text`);
      stats.texts++;
    }
    worst = Math.max(worst, close(got, modelNums(p), `tikz ${p.t} ${i} ${p.role}`, bad));
  });
  // hatches: the same lines as the SVG's
  for (const [i, ls] of r.hatch) {
    const p = fig.prims[i], h = STY.paintOf(fig.colour, p.role).hatch;
    const want = M.hatchLines(M.primBox(p), h.angle, h.gap);
    const c = coords(ls[0]);
    const skip = p.t === 'rect' ? 4 : p.t === 'circle' ? 2 : p.pts.length;
    worst = Math.max(worst, close(c.slice(skip), want, `tikz hatch ${i}`, bad));
    stats.hatches++;
  }
  if (/[^\x09\x0a\x0d\x20-\x7e]/.test(tz.document)) bad.push('tikz: not ASCII');
  if (/\\usetikzlibrary|\\usepackage\{(?!tikz\})/.test(tz.document)) bad.push('tikz: a library or another package');
  stats.tikzWorst = Math.max(stats.tikzWorst, worst);
  return r;
}

function checkFigure(fig, name, bad, stats) {
  const t0 = performance.now();
  const svg = SV.figureSvg(fig);
  const tz = TZ.figureTikz(fig);
  stats.writeMs = Math.max(stats.writeMs, performance.now() - t0);
  if (/NaN|Infinity|undefined/.test(svg) || /NaN|Infinity|undefined/.test(tz.document)) bad.push('NaN, Infinity or undefined written');
  const b = fig.box;
  if (!(Math.abs(b.x1 - b.x0 - fig.width) < 1e-9 && b.y1 - b.y0 > 5 && Math.abs(b.y1 - b.y0 - fig.height) < 1e-9)) bad.push(`box ${JSON.stringify(b)}`);
  for (const [i, p] of fig.prims.entries()) {
    const r = M.primBox(p);
    const slack = p.t === 'text' ? 0.6 : 0.05;
    const clipped = p.clip !== undefined;
    if (![r.x0, r.x1, r.y0, r.y1].every(Number.isFinite)) { bad.push(`prim ${i}: not finite`); continue; }
    if (!clipped && (r.x0 < b.x0 - slack || r.x1 > b.x1 + slack || r.y0 < b.y0 - slack || r.y1 > b.y1 + slack)) bad.push(`${p.t} ${i} ${p.role}${p.t === 'text' ? ` "${p.text}"` : ''} outside the box: ${JSON.stringify(r)}`);
    if (p.t === 'text') { if (p.pt < M.MIN_PT) bad.push(`text ${i} at ${p.pt} pt`); stats.minPt = Math.min(stats.minPt, p.pt); }
    if (p.t === 'image') {
      const type = p.png[25];
      if (fig.colour === 'bw' || (fig.colour === 'grey' && type !== 0 && type !== 4) || (fig.colour === 'colour' && type !== 6 && type !== 2)) bad.push(`image ${i}: PNG colour type ${type} in ${fig.colour}`);
    }
  }
  // plots: series and ticks inside the frame
  if (fig.kind === 'plot') {
    const fr = fig.prims.find((p) => p.t === 'rect' && p.role === 'frame');
    const inside = (x, y) => x >= fr.x - 1e-9 && x <= fr.x + fr.w + 1e-9 && y >= fr.y - 1e-9 && y <= fr.y + fr.h + 1e-9;
    for (const p of fig.prims) {
      if ((p.role === 'series' && p.layer !== M.L_NOTE) || p.role === 'grid' || (p.t === 'segs' && p.role === 'frame')) {
        const a = p.t === 'poly' ? p.pts : p.s;
        for (let k = 0; k < a.length; k += 2) if (!inside(a[k], a[k + 1])) { bad.push(`plot ${p.role} point (${a[k]}, ${a[k + 1]}) outside the frame`); break; }
        stats.plotPts += a.length / 2;
      }
    }
  }
  // M8.1b: the mask is told from the air in every mode (b&w: its own hatch), and every label over the drawing (dimensions,
  // via names) has a white box right under it
  const mp = STY.paintOf(fig.colour, 'mask'), ap = STY.paintOf(fig.colour, 'air');
  if (fig.prims.some((p) => p.role === 'mask') && mp.fill === ap.fill && !mp.hatch) bad.push(`mask and air alike in ${fig.colour}`);
  fig.prims.forEach((p, i) => {
    if (p.t !== 'text' || !/^(w|s|h) |^[A-Z]\d?$|^Via|^Return/.test(p.text) || fig.kind === 'plot' || fig.kind === 'stackup') return;
    const k = fig.prims[i - 1], t0 = M.textBox(p), b = { x0: Math.max(0, t0.x0), y0: Math.max(0, t0.y0), x1: Math.min(fig.width, t0.x1), y1: Math.min(fig.height, t0.y1) }; // a box is kept inside the figure
    if (!k || k.t !== 'rect' || k.role !== 'paper' || k.x > b.x0 + 0.05 || k.y > b.y0 + 0.05 || k.x + k.w < b.x1 - 0.05 || k.y + k.h < b.y1 - 0.05) bad.push(`label "${p.text}" without its white box`);
    else stats.knocks = (stats.knocks ?? 0) + 1;
  });
  const rs = checkSvg(fig, svg, bad, stats);
  const rt = checkTikz(fig, tz, bad, stats);
  for (const [what, set] of [['svg', rs.colours], ['tikz', rt.colours]]) {
    for (const c of set) {
      if (fig.colour === 'bw' && c !== '#000000' && c !== '#ffffff') bad.push(`${what}: ${c} in black and white`);
      if (fig.colour === 'grey' && !STY.isGrey(c)) bad.push(`${what}: ${c} in greyscale`);
    }
  }
  return { svg, tz, rt };
}

// ---------------------------------------------------------------------------------------------------------------
// TeX Live

function findTex() {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const dirs = [process.env.TEXBIN, ...(process.env.PATH ?? '').split(delimiter), 'C:\\texlive\\2026\\bin\\windows'].filter(Boolean);
  for (const dd of dirs) if (existsSync(join(dd, `pdflatex${exe}`))) return (name) => join(dd, `${name}${exe}`);
  return null;
}

function exec(cmd, args, cwd, timeout = 120_000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (x) => { stderr += x; });
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, stderr: 'timed out' }); }, timeout);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stderr }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stderr: String(e) }); });
  });
}

async function pool(jobs, width) {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, async () => { while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); } }));
  return out;
}

function mediaBox(pdf) {
  const find = (s) => { const m = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(s); return m ? m.slice(1).map(Number) : null; };
  const raw = pdf.toString('latin1');
  let box = find(raw);
  if (box) return box;
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length, end = raw.indexOf('endstream', start);
    try { box = find(inflateSync(pdf.subarray(start, end)).toString('latin1')); } catch { continue; }
    if (box) return box;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------

export async function run(t) {
  const t0 = performance.now();
  const { builders, mapC39, st, su, sec0 } = inputs();
  const tIn = performance.now() - t0;
  const stats = { sets: 0, prims: 0, texts: 0, hatches: 0, plotPts: 0, svgWorst: 0, tikzWorst: 0, writeMs: 0, minPt: Infinity };
  const SIZES = [40, 88, 160, 180, '\\linewidth'];
  const docs = [];
  for (const [name, build] of builders) {
    for (const width of SIZES) for (const colour of M.COLOUR_MODES) {
      const what = `${name} ${width} ${colour}`;
      const bad = [];
      let fig;
      try { fig = build({ width, colour }); } catch (e) { t.ok(false, `${what}: threw ${e.stack?.split('\n').slice(0, 3).join(' | ')}`); continue; }
      const { tz } = checkFigure(fig, what, bad, stats);
      stats.sets++; stats.prims += fig.prims.length;
      t.ok(bad.length === 0, () => `${what}: ${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` (+${bad.length - 4})` : ''}`);
      if (width === '\\linewidth') {
        const ref = TZ.figureTikz(build({ width: 160, colour }));
        const body = (s) => s.slice(s.indexOf('\n', s.indexOf('\\begin{tikzpicture}'))).replace(/\{[\d.]+\\linewidth\}|[\d.]+\\linewidth|[\d.]+mm(?=[,\]])/g, 'W');
        const strip = (s) => s.replace(/(width|height)=[\d.]+(\\linewidth|mm)/g, '$1=W');
        t.ok(strip(body(tz.picture)) === strip(body(ref.picture)) && tz.picture.includes('x=\\linewidth/160, y=\\linewidth/160'), `${what}: the \\linewidth body is the 160 mm body`);
      }
      if ((width === 88) || (colour === 'colour' && width !== '\\linewidth')) docs.push({ name: what, fig, tz });
      if (width === '\\linewidth' && colour === 'colour' && (name === 'section C39 map' || name === 'plot tdr')) docs.push({ name: `${name} minipages`, fig, tz, minipage: true });
    }
  }
  // the PNG encoder: the bytes inflate back to the pixels
  {
    const px = FF.mapPixels(mapC39, 'colour'), { nx, ny } = mapC39.view;
    const png = PN.encodePng(px, nx, ny);
    let o = 8, idat = [];
    while (o < png.length) { const n = (png[o] << 24 | png[o + 1] << 16 | png[o + 2] << 8 | png[o + 3]) >>> 0, ty = String.fromCharCode(...png.subarray(o + 4, o + 8)); if (ty === 'IDAT') idat.push(png.subarray(o + 8, o + 8 + n)); o += 12 + n; }
    const raw = inflateSync(Buffer.concat(idat));
    let same = raw.length === ny * (1 + 4 * nx);
    for (let y = 0; same && y < ny; y++) { if (raw[y * (1 + 4 * nx)] !== 0) same = false; for (let x = 0; same && x < 4 * nx; x++) if (raw[y * (1 + 4 * nx) + 1 + x] !== px[y * 4 * nx + x]) same = false; }
    t.ok(same && png[25] === 6, 'PNG: the map inflates back to its RGBA pixels');
  }
  // timing: the biggest figure, the section's field map at 180 mm (best of 3)
  const big = builders.find(([n]) => n === 'section C39 map')[1];
  let best = Infinity, bigFig, bigKb = 0;
  for (let k = 0; k < 3; k++) {
    const a = performance.now();
    bigFig = big({ width: 180, colour: 'colour' });
    const svg = SV.figureSvg(bigFig), tz = TZ.figureTikz(bigFig);
    best = Math.min(best, performance.now() - a);
    bigKb = { svg: svg.length / 1024, tex: tz.picture.length / 1024, png: tz.files.reduce((n, f) => n + f.bytes.length, 0) / 1024 };
  }
  t.ok(stats.knocks > 0, `labels over the drawing on their white boxes: ${stats.knocks}`);
  t.ok(best < 500, `the 180 mm field map built and written in ${best.toFixed(1)} ms`);
  t.note(`figures: ${builders.length} figures × ${SIZES.length} sizes × 3 colour modes = ${stats.sets} sets, ${stats.prims} primitives read back from SVG (worst ${stats.svgWorst.toExponential(1)} mm) and TikZ (worst ${stats.tikzWorst.toExponential(1)} mm), ${stats.texts} TikZ texts (smallest ${stats.minPt} pt), ${stats.hatches} hatches, ${stats.plotPts} plot points inside their frames; inputs ${tIn.toFixed(0)} ms; biggest figure (section field map, 180 mm, ${bigFig.prims.length} primitives, map ${mapC39.view.nx} × ${mapC39.view.ny}): ${best.toFixed(1)} ms, SVG ${bigKb.svg.toFixed(0)} kB, TikZ ${bigKb.tex.toFixed(0)} kB + PNG ${bigKb.png.toFixed(0)} kB`);
  // compile
  const tex = process.env.EMSIM_NO_TEX ? null : findTex();
  if (!tex) { t.note('figures compile: skipped: no pdflatex'); return; }
  const keep = process.env.EMSIM_FIG_OUT;
  const root = keep ? (mkdirSync(keep, { recursive: true }), keep) : mkdtempSync(join(tmpdir(), 'emsim-fig-'));
  const tc = performance.now();
  let compiles = 0, sizeWorst = 0;
  try {
    const jobs = [], entries = [];
    const job = (name, source, files, want) => {
      const dir = join(root, name.replace(/[^\w-]+/g, '_'));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'f.tex'), source);
      for (const f of files) writeFileSync(join(dir, f.name), f.bytes);
      const e = { name, dir, want };
      entries.push(e);
      jobs.push(async () => {
        const r = await exec(tex('pdflatex'), ['-halt-on-error', '-interaction=nonstopmode', '-no-shell-escape', 'f.tex'], dir);
        e.code = r.code;
        e.log = existsSync(join(dir, 'f.log')) ? readFileSync(join(dir, 'f.log'), 'latin1') : '';
        e.pdf = existsSync(join(dir, 'f.pdf')) ? readFileSync(join(dir, 'f.pdf')) : null;
      });
    };
    for (const dd of docs) {
      const W = dd.fig.box.x1 - dd.fig.box.x0, H = dd.fig.box.y1 - dd.fig.box.y0;
      if (!dd.minipage) { job(dd.name, dd.tz.document, dd.tz.files, [W, H]); continue; }
      for (const mm of [70, 160]) {
        const src = `\\RequirePackage{fix-cm}\n\\documentclass[border=0pt]{standalone}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{minipage}{${mm}mm}\\noindent\n${dd.tz.picture}\\end{minipage}\n\\end{document}\n`;
        job(`${dd.name} ${mm}`, src, dd.tz.files, [mm, (H * mm) / W]);
      }
    }
    await pool(jobs, Math.max(2, Math.min(6, cpus().length - 1)));
    for (const e of entries) {
      compiles++;
      const bad = [];
      if (e.code !== 0 || !e.pdf) bad.push(`exit ${e.code}: ${(/^!.*$/m.exec(e.log) ?? [''])[0]}`);
      if (/Overfull \\[hv]box/.test(e.log)) bad.push((/Overfull \\[hv]box.*$/m.exec(e.log))[0]);
      if (/Missing character/.test(e.log)) bad.push((/Missing character.*$/m.exec(e.log))[0]);
      if (e.pdf) {
        const box = mediaBox(e.pdf);
        if (!box) bad.push('no MediaBox');
        else {
          const bw = ((box[2] - box[0]) * 25.4) / 72, bh = ((box[3] - box[1]) * 25.4) / 72;
          const off = Math.max(Math.abs(bw - e.want[0]), Math.abs(bh - e.want[1]));
          sizeWorst = Math.max(sizeWorst, off);
          if (off > 0.1) bad.push(`MediaBox ${bw.toFixed(3)} × ${bh.toFixed(3)} mm, wanted ${e.want[0].toFixed(3)} × ${e.want[1].toFixed(3)}`);
        }
      }
      t.ok(bad.length === 0, () => `compile ${e.name}: ${bad.join('; ')}`);
    }
    t.note(`figures compile: ${compiles} documents with pdflatex in ${((performance.now() - tc) / 1000).toFixed(1)} s, MediaBox within ${sizeWorst.toFixed(4)} mm`);
  } finally {
    if (!keep) rmSync(root, { recursive: true, force: true });
  }
}
