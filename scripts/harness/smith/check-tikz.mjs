// Checks of the TikZ export (step M8.1b, milestones.md "Checks of the LaTeX export"), called from check.mjs.
//
// - Structure, on every preset size × detail × colour mode (27) and 20 random option sets: the emitted TikZ is parsed
//   here (its own small reader) and read back against the figure model: every circle, arc and coordinate to 1e-6 mm,
//   arcs' centres and ends recomputed from the start point, start angle, delta and radius; large arcs (Béziers of
//   their visible part) with their ends on the circle, control points of the exact construction and the curve's
//   middle on the circle; polylines point by point; every stroke's colour, width and dash as figureStyle.ts; marks;
//   every text as a node at its place, rotation, anchor, size and colour. B&w: only black and white defined;
//   greyscale: only greys. Text at the smallest width ≥ 6 pt in the TikZ. `\linewidth`: the unit and the same body.
// - Compile (TeX Live; "skipped: no pdflatex" without it): all 47 standalone documents with pdflatex -halt-on-error,
//   a few at a time, no overfull box or missing character in the log; MediaBox width and height equal the figure's mm
//   to 0.1 mm; the `\linewidth` form inside minipages of 70 and 160 mm scales to them; one document with xelatex and
//   lualatex.
// - Pixels: a few presets with text off, the PDF rendered by pdftoppm and the standalone SVG by Edge (Chrome), both
//   at 600 dpi: under 0.5 % of pixels differ by more than a quarter of the grey range, a 1-px edge band excepted.
// - Timing: the writer on a Full figure at 180 mm with a 10,000-point trace.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { inflateSync } from 'node:zlib';
import * as importedFigure from '../../../lib/smith/figure.ts';
import * as importedStyle from '../../../lib/smith/figureStyle.ts';
import * as importedSvg from '../../../lib/smith/figureSvg.ts';
import * as importedTikz from '../../../lib/smith/figureTikz.ts';
import * as importedSweep from '../../../lib/smith/sweep.ts';
import * as importedParts from '../../../lib/smith/parts.ts';
import * as importedState from '../../../lib/smith/state.ts';
import * as importedSolve from '../../../lib/smith/solve.ts';
import { retried } from './timing.mjs';

const F = importedFigure.default ?? importedFigure;
const ST = importedStyle.default ?? importedStyle;
const SV = importedSvg.default ?? importedSvg;
const TZ = importedTikz.default ?? importedTikz;
const S = importedSweep.default ?? importedSweep;
const P = importedParts.default ?? importedParts;
const STATE = importedState.default ?? importedState;
const SOLVE = importedSolve.default ?? importedSolve;
const { buildFigure, DETAIL_NAMES, SIZE_PRESETS, MIN_PT, MIN_WIDTH } = F;
const { strokeOf, inkOf, COLOUR_MODES, ROLE_NAMES } = ST;
const { figureSvg } = SV;
const { figureTikz, texLabel, ARC_MAX_MM, VISIBLE_PAD, POLY_CHUNK } = TZ;
const { sweepCircuit, Trace, runSweep, defaultBand, markersAt } = S;
const { SERIES_R, SERIES_L, SERIES_C, SHUNT_R, SHUNT_L, SHUNT_C, QUARTER } = P;
const { defaultCircuit } = STATE;
const { solve } = SOLVE;
const TAU = 2 * Math.PI;
const MM_BP = 72 / 25.4;
const TOL = 1e-6;               // mm: the read-back
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

// ---------------------------------------------------------------------------------------------------------------
// A reader of the TikZ figureTikz.ts writes (written here from TikZ's syntax, not from the writer).

const NUM = '(-?\\d+(?:\\.\\d+)?)';
const STATEMENT = new RegExp('\\\\begin\\{scope\\}|\\\\end\\{scope\\}|\\\\(useasboundingbox|clip|filldraw|draw|fill|node)(?:\\[([^\\]]*)\\])?([^;]*);', 'g');
const PATH_TOKEN = new RegExp(`\\(${NUM},${NUM}\\)|circle\\[radius=${NUM}\\]|arc\\[start angle=${NUM}, delta angle=${NUM}, radius=${NUM}\\]|--|\\.\\. controls|and|\\.\\.|cycle|(\\S+)`, 'g');

function readStyle(def) {
  const out = { draw: null, fill: null, text: null, width: null, dash: [], size: null, height: null, depth: null };
  const m = (re) => { const r = re.exec(def); return r ? r[1] : null; };
  out.draw = m(/draw=(\w+)/); out.fill = m(/fill=(\w+)/); out.text = m(/text=(\w+)/);
  const w = m(/line width=([\d.]+)mm/); out.width = w === null ? null : Number(w);
  const d = m(/dash pattern=([^,}]*)/);
  if (d) for (const x of d.matchAll(/(?:on|off) ([\d.]+)mm/g)) out.dash.push(Number(x[1]));
  const f = /\\fontsize\{([\d.]+)\}\{([\d.]+)\}/.exec(def);
  if (f) out.size = Number(f[1]);
  const h = m(/text height=([\d.]+)pt/); out.height = h === null ? null : Number(h);
  const dp = m(/text depth=([\d.]+)pt/); out.depth = dp === null ? null : Number(dp);
  return out;
}

/** Parses a path's text into subpaths: { x, y, segs: [{ t: 'line'|'arc'|'bez', … }], circle, closed }. */
function readPath(text) {
  const subs = [];
  let cur = null, op = null, cs = [], bad = null;
  for (const m of text.matchAll(PATH_TOKEN)) {
    if (m[1] !== undefined) {
      const x = Number(m[1]), y = Number(m[2]);
      if (op === '--') { cur.segs.push({ t: 'line', x, y }); cur.ex = x; cur.ey = y; op = null; }
      else if (op === 'controls' || op === 'and') cs.push([x, y]);
      else if (op === '..') { cur.segs.push({ t: 'bez', c1: cs[0], c2: cs[1], x, y, x0: cur.ex, y0: cur.ey }); cur.ex = x; cur.ey = y; cs = []; op = null; }
      else { cur = { x, y, ex: x, ey: y, segs: [], circle: null, closed: false }; subs.push(cur); }
    } else if (m[3] !== undefined) cur.circle = Number(m[3]);
    else if (m[4] !== undefined) {
      const a = Number(m[4]) * Math.PI / 180, d = Number(m[5]) * Math.PI / 180, r = Number(m[6]);
      const cx = cur.ex - r * Math.cos(a), cy = cur.ey - r * Math.sin(a);
      const ex = cx + r * Math.cos(a + d), ey = cy + r * Math.sin(a + d);
      cur.segs.push({ t: 'arc', a, d, r, cx, cy, x: ex, y: ey, x0: cur.ex, y0: cur.ey }); cur.ex = ex; cur.ey = ey;
    } else if (m[0] === '--') op = '--';
    else if (m[0] === '.. controls') op = 'controls';
    else if (m[0] === 'and') op = 'and';
    else if (m[0] === '..') op = '..';
    else if (m[0] === 'cycle') { cur.closed = true; op = null; }
    else bad = m[0];
  }
  return { subs, bad };
}

/** The picture read: colours, styles, unit, bounding box, and the items in order (subpaths, marks, nodes). */
function readTikz(src) {
  const colours = new Map();
  for (const m of src.matchAll(/\\definecolor\{(\w+)\}\{HTML\}\{([0-9A-F]{6})\}%/g)) colours.set(m[1], `#${m[2].toLowerCase()}`);
  const styles = new Map();
  for (const m of src.matchAll(/^ {2}(\w+)\/\.style=\{(.*)\}(?:,|\])$/gm)) styles.set(m[1], readStyle(m[2]));
  const head = /\\begin\{tikzpicture\}\[x=([^,]+), y=([^,]+),/.exec(src);
  const body = src.slice(src.indexOf('\\useasboundingbox'));
  const items = [];
  let box = null, boxClip = null, clipR = null, depth = 0;
  const problems = [];
  const clips = [];
  for (const m of body.matchAll(STATEMENT)) {
    if (m[0] === '\\begin{scope}') { depth++; clips.push(null); continue; }
    if (m[0] === '\\end{scope}') { depth--; clips.pop(); continue; }
    const cmd = m[1], opts = (m[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean), rest = m[3];
    if (cmd === 'node') {
      const t = /^ at \(([-\d.]+),([-\d.]+)\) \{(.*)\}$/.exec(rest);
      if (!t) { problems.push(`node "${rest}"`); continue; }
      const o = { style: opts[0], anchor: 'center', rotate: 0 };
      for (const s of opts.slice(1)) { const [k, v] = s.split('='); if (k === 'anchor') o.anchor = v; else if (k === 'rotate') o.rotate = Number(v); else problems.push(`node option ${s}`); }
      items.push({ kind: 'node', ...o, x: Number(t[1]), y: Number(t[2]), text: t[3], clip: clips.includes('disk') });
      continue;
    }
    const rect = /^ \(([-\d.]+),([-\d.]+)\) rectangle \(([-\d.]+),([-\d.]+)\)$/.exec(rest);
    if (rect) {
      const r = { x0: Number(rect[1]), y0: Number(rect[2]), x1: Number(rect[3]), y1: Number(rect[4]) };
      if (cmd === 'useasboundingbox') box = r;
      else if (cmd === 'clip') { clips[clips.length - 1] = 'box'; boxClip = r; }
      else problems.push(`${cmd} rectangle`);
      continue;
    }
    const path = readPath(rest);
    if (path.bad) problems.push(`path token "${path.bad}"`);
    if (cmd === 'useasboundingbox' || cmd === 'clip') {
      const s = path.subs[0];
      if (cmd === 'clip' && s && s.circle !== null && s.x === 0 && s.y === 0) { clips[clips.length - 1] = 'disk'; clipR = s.circle; }
      else problems.push(`${cmd}${rest}`);
      continue;
    }
    if (opts.length !== 1) problems.push(`${cmd} options ${opts.join(',')}`);
    const clip = clips.includes('disk');
    if (opts[0]?.startsWith('mk')) items.push({ kind: 'mark', cmd, style: opts[0], subs: path.subs, clip });
    else for (const sub of path.subs) items.push({ kind: 'sub', cmd, style: opts[0], sub, clip, statement: rest });
  }
  return { colours, styles, unit: head ? head[1] : null, unitY: head ? head[2] : null, box, boxClip, items, problems, depth, clipR };
}

// ---------------------------------------------------------------------------------------------------------------
// The read-back against the model

const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

function checkReadBack(fig, src, what, ok, stats) {
  const t = readTikz(src), errs = [];
  const err = (s) => { if (errs.length < 6) errs.push(s); };
  if (t.problems.length) err(`unread: ${t.problems.slice(0, 3).join('; ')}`);
  if (t.depth !== 0) err(`scopes unbalanced (${t.depth})`);
  const b = fig.box;
  if (!t.boxClip || Math.max(Math.abs(t.boxClip.x0 - b.x0), Math.abs(t.boxClip.y0 - b.y0), Math.abs(t.boxClip.x1 - b.x1), Math.abs(t.boxClip.y1 - b.y1)) > TOL) err('box clip');
  if (!t.box || Math.max(Math.abs(t.box.x0 - b.x0), Math.abs(t.box.y0 - b.y0), Math.abs(t.box.x1 - b.x1), Math.abs(t.box.y1 - b.y1)) > TOL) err('bounding box');
  if (Math.abs(t.clipR - fig.clipR) > TOL) err(`clip radius ${t.clipR}`);
  const colourOf = (name) => t.colours.get(name);
  const sameStroke = (st, s) => st && colourOf(st.draw) === s.colour && Math.abs(st.width - s.width) <= TOL
    && st.dash.length === s.dash.length && st.dash.every((v, i) => Math.abs(v - s.dash[i]) <= TOL);
  const boxRho = Math.max(Math.hypot(b.x0, b.y0), Math.hypot(b.x1, b.y0), Math.hypot(b.x0, b.y1), Math.hypot(b.x1, b.y1)) + VISIBLE_PAD;
  const items = t.items;
  let k = 0, worst = 0;
  const near = (a, e, scale = 1) => { const d = Math.abs(a - e); worst = Math.max(worst, d / scale); return d <= TOL * scale; };
  /** A Bézier on the circle: ends on it, control points of the construction, its middle on the circle. */
  const bezOk = (s, cx, cy, r) => {
    const a0 = Math.atan2(s.y0 - cy, s.x0 - cx), a1 = Math.atan2(s.y - cy, s.x - cx), d = angDiff(a1, a0);
    if (Math.abs(d) > Math.PI / 2 + 1e-9) return 'piece over a quarter turn';
    const kk = (4 / 3) * Math.tan(d / 4) * r;
    const p1 = [s.x0 - kk * Math.sin(a0), s.y0 + kk * Math.cos(a0)], p2 = [s.x + kk * Math.sin(a1), s.y - kk * Math.cos(a1)];
    if (!near(Math.hypot(s.x0 - cx, s.y0 - cy), r) || !near(Math.hypot(s.x - cx, s.y - cy), r)) return 'end off the circle';
    if (Math.hypot(p1[0] - s.c1[0], p1[1] - s.c1[1]) > 2 * TOL || Math.hypot(p2[0] - s.c2[0], p2[1] - s.c2[1]) > 2 * TOL) return 'control points';
    const mx = (s.x0 + 3 * s.c1[0] + 3 * s.c2[0] + s.x) / 8, my = (s.y0 + 3 * s.c1[1] + 3 * s.c2[1] + s.y) / 8;
    if (!near(Math.hypot(mx - cx, my - cy), r)) return 'middle off the circle';
    return null;
  };
  /** Consumes the subpaths of a large circle or arc. */
  const large = (p, s, isArc) => {
    const rho = p.clip ? fig.clipR + VISIBLE_PAD : boxRho;
    const lo = isArc ? Math.min(p.start, p.start + p.sweep) : -Infinity, hi = isArc ? Math.max(p.start, p.start + p.sweep) : Infinity;
    const inRange = (x, y) => {
      if (!isArc) return true;
      const a = Math.atan2(y - p.cy, x - p.cx);
      for (let q = Math.floor((lo - a) / TAU) - 1; q <= Math.ceil((hi - a) / TAU) + 1; q++) { const v = a + q * TAU, e = 2e-9 + 2e-6 / p.r; if (v >= lo - e && v <= hi + e) return true; }
      return false;
    };
    const atEnd = (x, y) => (isArc && (Math.hypot(x - p.x0, y - p.y0) <= TOL || Math.hypot(x - p.x1, y - p.y1) <= TOL)) || Math.hypot(x, y) >= rho - 1e-6;
    let n = 0;
    while (k < items.length) {
      const it = items[k];
      if (it.kind !== 'sub' || it.clip !== p.clip || !sameStroke(t.styles.get(it.style), s)) break;
      const sub = it.sub;
      if (sub.circle !== null) {
        if (isArc || Math.max(Math.abs(sub.x - p.cx), Math.abs(sub.y - p.cy), Math.abs(sub.circle - p.r)) > TOL) break;
        k++; n++; continue;
      }
      if (!sub.segs.length || !(Math.abs(Math.hypot(sub.x - p.cx, sub.y - p.cy) - p.r) <= TOL * Math.max(1, p.r * 1e-12))) break;
      for (const g of sub.segs) {
        if (g.t === 'bez') { const e = bezOk(g, p.cx, p.cy, p.r); if (e) err(`${ROLE_NAMES[p.role]} large arc r ${p.r.toFixed(0)}: ${e}`); }
        else if (g.t === 'line') { if (!near(Math.hypot(g.x - p.cx, g.y - p.cy), p.r)) err('large arc: flat piece off the circle'); }
        else err('large arc as an arc');
        if (!inRange(g.x, g.y)) err(`${ROLE_NAMES[p.role]} large arc: piece outside the arc`);
      }
      if (!atEnd(sub.x, sub.y) || !atEnd(sub.ex, sub.ey)) err(`${ROLE_NAMES[p.role]} large arc: a piece ends inside the visible disc`);
      k++; n++; stats.large++;
    }
    return n;
  };
  for (const [pi, p] of fig.prims.entries()) {
    const it = items[k];
    if (p.type === 'text') {
      if (!it || it.kind !== 'node') { err(`prim ${pi}: text "${p.text}" missing`); continue; }
      k++;
      const st = t.styles.get(it.style);
      if (!near(it.x, p.x) || !near(it.y, p.y)) err(`text "${p.text}" at (${it.x}, ${it.y}), wanted (${p.x}, ${p.y})`);
      if (Math.abs(it.rotate - p.rotate) > 1e-6) err(`text "${p.text}" rotated ${it.rotate}, wanted ${p.rotate}`);
      if (it.anchor !== (p.anchor === 'start' ? 'west' : 'center')) err(`text "${p.text}" anchor ${it.anchor}`);
      if (!st || st.size !== Number(p.pt.toFixed(6)) || Math.abs(st.height - 0.7 * p.pt) > TOL || st.depth !== 0) err(`text "${p.text}" size ${st?.size}, wanted ${p.pt}`);
      if (!st || colourOf(st.text) !== inkOf(fig.colour, p.role, p.sub)) err(`text "${p.text}" colour`);
      if (it.text !== texLabel(p.text) || /[^\x20-\x7e]/.test(it.text)) err(`text "${p.text}" written "${it.text}"`);
      if (it.clip) err(`text "${p.text}" clipped to the disk`);
      stats.texts++;
      continue;
    }
    const s = strokeOf(fig.colour, p.role, p.sub, p.index);
    if (p.type === 'mark') {
      const h = p.size / 2, need = p.shape === 'target' ? 2 : 1, got = items.slice(k, k + need);
      k += need;
      if (got.length < need || got.some((g) => g.kind !== 'mark')) { err(`prim ${pi}: ${p.shape} mark missing`); continue; }
      const st = t.styles.get(got[0].style), stroke = p.shape === 'cross' ? s.width * 1.6 : s.width;
      if (!st || colourOf(st.draw) !== s.colour || colourOf(st.fill) !== (s.fill || s.colour) || Math.abs(st.width - stroke) > TOL) err(`${p.shape} mark style`);
      const c = got[0].subs;
      let good = true;
      if (p.shape === 'dot') good = got[0].cmd === 'fill' && c.length === 1 && near(c[0].x, p.x) && near(c[0].y, p.y) && near(c[0].circle, h);
      else if (p.shape === 'target') {
        const d = got[1].subs;
        good = got[0].cmd === 'draw' && got[1].cmd === 'fill' && near(c[0].x, p.x) && near(c[0].y, p.y) && near(c[0].circle, h - s.width / 2) && near(d[0].x, p.x) && near(d[0].y, p.y) && near(d[0].circle, h * 0.3);
      } else if (p.shape === 'cross') {
        const q = h * 0.8;
        good = c.length === 2 && c.every((sub) => sub.segs.length === 1 && near(Math.abs(sub.x - p.x), q) && near(Math.abs(sub.y - p.y), q) && near(sub.segs[0].x + sub.x, 2 * p.x, 2) && near(sub.segs[0].y + sub.y, 2 * p.y, 2));
      } else if (p.shape === 'triangle') {
        const q = h * 1.1, v = c[0] ? [[c[0].x, c[0].y], ...c[0].segs.map((g) => [g.x, g.y])] : [];
        const want = [[p.x, p.y + q], [p.x + q * 0.866, p.y - q / 2], [p.x - q * 0.866, p.y - q / 2]];
        good = got[0].cmd === 'filldraw' && c.length === 1 && c[0].closed && v.length === 3 && v.every(([x, y], i) => near(x, want[i][0]) && near(y, want[i][1]));
      }
      if (!good) err(`${p.shape} mark at (${p.x}, ${p.y}) read back wrong`);
      stats.marks++;
      continue;
    }
    // paths
    if (p.type === 'circle' && p.r > ARC_MAX_MM) { large(p, s, false); stats.circles++; continue; }
    if (p.type === 'arc' && p.r > ARC_MAX_MM) { large(p, s, true); stats.arcs++; continue; }
    if (p.type === 'poly') {
      let i = 0;
      const pts = p.pts;
      while (i < p.n && !(Number.isFinite(pts[2 * i]) && Number.isFinite(pts[2 * i + 1]))) i++;
      let first = true, chunks = 0;
      while (i < p.n - 1 && k < items.length) {
        const g = items[k];
        if (g.kind !== 'sub' || g.clip !== p.clip || !sameStroke(t.styles.get(g.style), s)) { err(`poly at point ${i}: style or clip`); break; }
        const sub = g.sub, v = [[sub.x, sub.y], ...sub.segs.map((q) => [q.x, q.y])];
        if (sub.segs.some((q) => q.t !== 'line')) err('poly with curves');
        if (v.length > POLY_CHUNK) err(`a chunk of ${v.length} points`);
        for (let j = 0; j < v.length; j++) {
          const q = i + j;
          if (!(q < p.n) || !near(v[j][0], pts[2 * q]) || !near(v[j][1], pts[2 * q + 1])) { err(`poly point ${q} off`); break; }
        }
        if (!first && v.length < 2) err('empty chunk');
        i += v.length - 1; first = false; chunks++; k++;
        stats.points += v.length - 1;
      }
      if (i !== p.n - 1) err(`poly: ${i + 1} of ${p.n} points read`);
      stats.polys++;
      continue;
    }
    if (!it || it.kind !== 'sub') { err(`prim ${pi} (${p.type}, ${ROLE_NAMES[p.role]}) missing`); continue; }
    k++;
    if (it.clip !== p.clip) err(`prim ${pi}: clip ${it.clip}`);
    if (!sameStroke(t.styles.get(it.style), s)) err(`prim ${pi} (${ROLE_NAMES[p.role]}): stroke ${JSON.stringify(t.styles.get(it.style))} for ${JSON.stringify(s)}`);
    const sub = it.sub;
    if (p.type === 'circle') {
      if (!(sub.circle !== null && near(sub.x, p.cx) && near(sub.y, p.cy) && near(sub.circle, p.r))) err(`circle ${pi} read back off`);
      stats.circles++;
    } else if (p.type === 'line') {
      if (!(sub.segs.length === 1 && sub.segs[0].t === 'line' && near(sub.x, p.x0) && near(sub.y, p.y0) && near(sub.segs[0].x, p.x1) && near(sub.segs[0].y, p.y1))) err(`line ${pi} read back off`);
      stats.lines++;
    } else if (p.type === 'arc') {
      const g = sub.segs[0];
      if (sub.segs.length !== 1 || !near(sub.x, p.x0) || !near(sub.y, p.y0)) { err(`arc ${pi}: start or pieces`); continue; }
      if (g.t === 'line') {
        const half = Math.min(Math.abs(p.sweep), Math.PI) / 2;
        if (!(p.r * (1 - Math.cos(half)) < 1e-5 && near(g.x, p.x1) && near(g.y, p.y1))) err(`arc ${pi} written flat`);
      } else if (g.t === 'arc') {
        if (!(near(g.r, p.r) && near(g.cx, p.cx) && near(g.cy, p.cy) && near(g.x, p.x1) && near(g.y, p.y1) && near(g.d * p.r, p.sweep * p.r) && near(g.a * p.r, p.start * p.r))) err(`arc ${pi} (${ROLE_NAMES[p.role]}, r ${p.r}) read back off: r ${g.r - p.r} c ${g.cx - p.cx},${g.cy - p.cy} end ${g.x - p.x1},${g.y - p.y1} d ${(g.d - p.sweep) * p.r} a ${(g.a - p.start) * p.r}`);
      } else err(`arc ${pi} as ${g.t}`);
      stats.arcs++;
    }
  }
  if (k !== items.length) err(`${items.length - k} items left over after the prims`);
  ok(errs.length === 0, `${what}: ${errs.join('; ')}`);
  stats.worst = Math.max(stats.worst, worst);
  return t;
}

// ---------------------------------------------------------------------------------------------------------------
// Tools: TeX Live, PDFs, images

function findTex() {
  const exe = process.platform === 'win32' ? '.exe' : '';
  const dirs = [process.env.TEXBIN, ...(process.env.PATH ?? '').split(delimiter), 'C:\\texlive\\2026\\bin\\windows'].filter(Boolean);
  for (const d of dirs) if (existsSync(join(d, `pdflatex${exe}`))) return (name) => join(d, `${name}${exe}`);
  return null;
}

function run(cmd, args, cwd, timeout = 120_000) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1, stderr: 'timed out' }); }, timeout);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stderr }); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: -1, stderr: String(e) }); });
  });
}

/** Runs jobs a few at a time. */
async function pool(jobs, width) {
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); }
  }));
  return out;
}

/** The first page's MediaBox [x0 y0 x1 y1] in bp, from the raw file or its Flate streams (object streams). */
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

function readPgm(buf) {
  const m = /^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(buf.subarray(0, 64).toString('latin1'));
  return { w: Number(m[1]), h: Number(m[2]), data: buf.subarray(m[0].length) };
}

/** A PNG (8-bit RGB or RGBA, not interlaced) as grey levels. */
function pngGrey(buf) {
  let p = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error('PNG: not 8-bit or interlaced'); }
    else if (kind === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : type === 0 ? 1 : 0;
  if (!bpp) throw new Error(`PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = new Uint8Array(w * h);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = x * bpp;
      out[y * w + x] = bpp === 1 ? cur[o] : Math.round(0.299 * cur[o] + 0.587 * cur[o + 1] + 0.114 * cur[o + 2]);
    }
    [prev, cur] = [cur, prev];
  }
  return { w, h, data: out };
}

// ---------------------------------------------------------------------------------------------------------------

export async function runTikzChecks({ section, ok, random }) {
  const t0 = performance.now();
  const pick = (a) => a[Math.floor(random() * a.length)];
  const logU = (lo, hi) => lo * (hi / lo) ** random();
  const stats = { sets: 0, texts: 0, marks: 0, polys: 0, points: 0, circles: 0, arcs: 0, lines: 0, large: 0, worst: 0, kB: 0 };

  function randomCircuit(maxParts) {
    const z0 = pick([50, 50, 75, 100]), f0 = logU(1e6, 1e10), w0 = TAU * f0;
    const count = 1 + Math.floor(random() * maxParts), parts = [];
    for (let k = 0; k < count; k++) {
      const kind = Math.floor(random() * 10), a = logU(0.05, 20);
      switch (kind) {
        case SERIES_R: parts.push({ kind, value: a * z0 }); break;
        case SHUNT_R: parts.push({ kind, value: z0 / a }); break;
        case SERIES_L: parts.push({ kind, value: (a * z0) / w0 }); break;
        case SERIES_C: parts.push({ kind, value: 1 / (w0 * a * z0) }); break;
        case SHUNT_L: parts.push({ kind, value: z0 / (w0 * a) }); break;
        case SHUNT_C: parts.push({ kind, value: a / (w0 * z0) }); break;
        case QUARTER: parts.push({ kind, value: 20 + 100 * random() }); break;
        default: parts.push({ kind, value: 0.02 + 0.96 * random(), zc: 20 + 100 * random() });
      }
    }
    return { z0, f0, loadR: logU(1, 500), loadX: (random() - 0.5) * 600, parts };
  }
  function inputOf(c, points = 401) {
    const sc = sweepCircuit(c), trace = new Trace();
    runSweep(trace, defaultBand(c.f0, 0.5, points), sc);
    const markers = markersAt(sc, [c.f0 * 0.8, c.f0, c.f0 * 1.2]);
    let solveResult = null;
    if (c.parts.length >= 2) {
      const unknowns = [{ part: 0, param: 'value' }, { part: 1, param: 'value' }], goal = { kind: 'point' };
      try { solveResult = solve({ ...c, ask: { unknowns, goal } }, unknowns, goal); } catch { solveResult = null; }
      c = { ...c, ask: { unknowns, goal } };
    }
    return { circuit: c, trace, markers, solve: solveResult };
  }

  // The 27 presets on the start circuit (with a solve) and 20 random sets.
  const start = inputOf(defaultCircuit());
  const sets = [];
  for (const [size, width] of Object.entries(SIZE_PRESETS)) for (const detail of DETAIL_NAMES) for (const colour of COLOUR_MODES) {
    sets.push({ name: `${size} ${detail} ${colour}`, input: start, options: { width, detail, colour } });
  }
  for (let i = 0; i < 20; i++) {
    const input = random() < 0.15 ? { circuit: null } : inputOf(randomCircuit(8), 101 + Math.floor(random() * 500));
    const detail = { preset: pick(DETAIL_NAMES) };
    for (const k of ['gridLabels', 'scales', 'path', 'nodes', 'nodeLabels', 'loci', 'goal', 'construction', 'solutions', 'trace', 'markers', 'legend']) if (random() < 0.4) detail[k] = random() < 0.5;
    if (random() < 0.5) detail.density = pick(['coarse', 'normal', 'fine']);
    if (random() < 0.5) detail.grid = pick(['z', 'y', 'zy']);
    let view = null;
    if (random() < 0.4) { const cx = random() * 1.6 - 0.8, cy = random() * 1.6 - 0.8, h = logU(0.02, 0.8), a = 0.5 + random(); view = { x0: cx - h * a, x1: cx + h * a, y0: cy - h, y1: cy + h }; }
    const options = { width: logU(40, 300), detail, colour: pick(COLOUR_MODES), fontPt: random() < 0.3 ? 6 + 4 * random() : undefined, view };
    sets.push({ name: `random set ${i}`, input, options });
  }

  // ---------------------------------------------------------------------------------------------------------------
  section('tikz read-back');
  for (const set of sets) {
    let fig, tikz;
    try { fig = buildFigure(set.input, set.options); tikz = figureTikz(fig); } catch (e) { ok(false, `${set.name}: ${e.stack}`); continue; }
    set.fig = fig; set.tikz = tikz;
    stats.sets++;
    const t = checkReadBack(fig, tikz.picture, set.name, ok, stats);
    ok(t.unit === '1mm' && t.unitY === '1mm', `${set.name}: unit ${t.unit}, ${t.unitY}`);
    ok(tikz.document.includes(tikz.picture.trimEnd()) && /\\documentclass\[tikz, border=0pt\]\{standalone\}/.test(tikz.document), `${set.name}: the document holds the picture`);
    ok(!/[^\x00-\x7e]/.test(tikz.document), `${set.name}: the TikZ is ASCII`);
    ok(!/\\usetikzlibrary|\\usepackage\{(?!tikz\})/.test(tikz.document), `${set.name}: no library or other package`);
    const values = [...t.colours.values()];
    if (fig.colour === 'bw') ok(values.every((c) => c === '#000000' || c === '#ffffff'), `${set.name}: b&w colours ${values.join(' ')}`);
    if (fig.colour === 'grey') ok(values.every((c) => c.slice(1, 3) === c.slice(3, 5) && c.slice(3, 5) === c.slice(5, 7)), `${set.name}: greyscale colours ${values.join(' ')}`);
    // digits: 1e-6 mm, but 1e-7 for an arc's start and a Bézier's points ("(x,y) arc[", "(x,y) ..", "controls (x,y)",
    // "and (x,y)", ".. (x,y)")
    const src = tikz.picture;
    const over = [...src.matchAll(/\((-?\d+(?:\.(\d+))?),(-?\d+(?:\.(\d+))?)\)/g)].filter((m) => {
      const d = Math.max((m[2] ?? '').length, (m[4] ?? '').length);
      if (d <= 6) return false;
      const before = src.slice(Math.max(0, m.index - 9), m.index), after = src.slice(m.index + m[0].length, m.index + m[0].length + 5);
      return d > 7 || !(after === ' arc[' || after.startsWith(' ..') || /(controls |and |\.\. )$/.test(before));
    });
    ok(over.length === 0, `${set.name}: ${over.length} coordinates with more decimals than 1e-6 mm (1e-7 on arcs), as ${over[0]?.[0]}`);
  }

  section('tikz text and linewidth');
  for (const detail of DETAIL_NAMES) for (const colour of COLOUR_MODES) {
    const fig = buildFigure(start, { width: MIN_WIDTH, detail, colour }), t = readTikz(figureTikz(fig).picture);
    const texts = fig.prims.filter((p) => p.type === 'text'), nodes = t.items.filter((i) => i.kind === 'node');
    ok(texts.length > 0 && texts.every((p) => p.pt >= MIN_PT), `${MIN_WIDTH} mm ${detail} ${colour}: model text ≥ ${MIN_PT} pt`);
    ok(nodes.length === texts.length && nodes.every((n, i) => t.styles.get(n.style).size >= MIN_PT && t.styles.get(n.style).size === Number(texts[i].pt.toFixed(6))),
      `${MIN_WIDTH} mm ${detail} ${colour}: ${nodes.length} nodes for ${texts.length} texts, each at its size ≥ ${MIN_PT} pt`);
  }
  const lineSets = [];
  for (const W of [160, 120]) {
    const fixed = buildFigure(start, { width: W, detail: 'full' }), lw = buildFigure(start, { width: W, linewidth: true, detail: 'full' });
    const a = figureTikz(fixed).picture, b = figureTikz(lw).picture, tb = readTikz(b);
    ok(tb.unit === `\\linewidth/${W}` && tb.unitY === `\\linewidth/${W}`, `\\linewidth at ${W}: unit ${tb.unit}`);
    const bodyOf = (s) => s.slice(s.indexOf('\n  sk') + 1);
    ok(bodyOf(a) === bodyOf(b), `\\linewidth at ${W}: the same styles and body as ${W} mm`);
    ok(/\\begin\{minipage\}\{\d+(\.\d+)?mm\}\\noindent/.test(figureTikz(lw).document), `\\linewidth at ${W}: its document sets \\linewidth`);
    lineSets.push({ W, fig: lw, tikz: figureTikz(lw) });
  }
  // text off: no nodes, the rest unchanged
  {
    const fig = buildFigure(start, { width: 88, detail: 'full' }), on = figureTikz(fig).picture, off = figureTikz(fig, { text: false }).picture;
    ok(on.includes('\\node') && !off.includes('\\node'), 'text off: no nodes');
    checkReadBack({ ...fig, prims: fig.prims.filter((p) => p.type !== 'text') }, off, 'text off', ok, stats);
  }

  // timing of the writer
  section('tikz timing');
  {
    const c = defaultCircuit(), sc = sweepCircuit(c), trace = new Trace();
    runSweep(trace, { start: c.f0 * 0.2, stop: c.f0 * 5, points: 10_000, log: true }, sc, null);
    const fig = buildFigure({ circuit: c, trace, markers: markersAt(sc, [c.f0]), solve: start.solve }, { width: 180, detail: 'full' });
    let out;
    const m = retried(() => { const t = []; for (let i = 0; i < 15; i++) { const a = performance.now(); out = figureTikz(fig); t.push(performance.now() - a); } return median(t); }, (v) => v <= 30);
    ok(m.value <= 30, `TikZ of a Full figure at 180 mm with a 10,000-point trace: ${m.value.toFixed(2)} ms (≤ 30)${m.note}`);
    stats.writeMs = m.value; stats.kB = out.document.length / 1024;
    const t = readTikz(out.picture);
    const longest = Math.max(...t.items.filter((i) => i.kind === 'sub').map((i) => i.sub.segs.length));
    ok(longest < POLY_CHUNK, `the trace is split: longest subpath ${longest} segments`);
    stats.bigFig = { fig, tikz: out };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Compiles
  const tex = process.env.SMITH_NO_TEX ? null : findTex();
  section('tikz compile');
  if (!tex) {
    console.log('tikz compile: skipped: no pdflatex');
    console.log(`tikz: ${stats.sets} sets read back (worst ${stats.worst.toExponential(1)} mm), ${stats.texts} texts, ${stats.marks} marks, ${stats.arcs} arcs, ${stats.circles} circles, ${stats.large} large-arc pieces, ${stats.points} trace points; writer ${stats.writeMs.toFixed(2)} ms (${stats.kB.toFixed(0)} kB)`);
    return;
  }
  const keep = process.env.SMITH_TIKZ_OUT;
  const root = keep ? (mkdirSync(keep, { recursive: true }), keep) : mkdtempSync(join(tmpdir(), 'smith-tikz-'));
  const tc = performance.now();
  try {
    const jobs = [];
    const job = (name, source, engine = 'pdflatex', render = false) => {
      const dir = join(root, name.replace(/[^\w-]+/g, '_'));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'f.tex'), source);
      const entry = { name, dir, engine, render };
      jobs.push(async () => {
        const r = await run(tex(engine), ['-halt-on-error', '-interaction=nonstopmode', '-no-shell-escape', 'f.tex'], dir);
        entry.code = r.code;
        entry.log = existsSync(join(dir, 'f.log')) ? readFileSync(join(dir, 'f.log'), 'latin1') : '';
        entry.pdf = existsSync(join(dir, 'f.pdf')) ? readFileSync(join(dir, 'f.pdf')) : null;
        if (render && entry.pdf) {
          const rr = await run(tex('pdftoppm'), ['-r', '600', '-gray', '-singlefile', 'f.pdf', 'page'], dir);
          entry.pgm = rr.code === 0 && existsSync(join(dir, 'page.pgm')) ? readPgm(readFileSync(join(dir, 'page.pgm'))) : null;
        }
        return entry;
      });
      return entry;
    };
    const entries = sets.filter((s) => s.tikz).map((s) => ({ set: s, e: job(s.name, s.tikz.document) }));
    // \linewidth inside minipages, and the linewidth form's own document
    const lw = lineSets[0];
    const minipage = (mm) => `\\RequirePackage{fix-cm}\n\\documentclass[border=0pt]{standalone}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{minipage}{${mm}mm}\\noindent\n${lw.tikz.picture.trimEnd()}\n\\end{minipage}\n\\end{document}\n`;
    const mini = [70, 160].map((mm) => ({ mm, e: job(`minipage ${mm}`, minipage(mm)) }));
    const ownLw = lineSets.map((l) => ({ l, e: job(`linewidth doc ${l.W}`, l.tikz.document) }));
    // other engines
    const full = sets.find((s) => s.name === 'text full colour');
    const engines = ['xelatex', 'lualatex'].map((engine) => ({ engine, e: job(`${engine} full`, full.tikz.document, engine) }));
    // the 10,000-point trace
    const big = job('trace 10000', stats.bigFig.tikz.document);
    // pixels: text off
    const pixelNames = ['column minimal bw', 'text standard colour', 'page full grey', 'random set 3'];
    const pixel = pixelNames.map((n) => sets.find((s) => s.name === n)).filter((s) => s?.fig)
      .map((s) => ({ s, e: job(`pixels ${s.name}`, figureTikz(s.fig, { text: false }).document, 'pdflatex', true) }));
    await pool(jobs, Math.max(2, Math.min(8, cpus().length >> 1)));
    stats.compileS = (performance.now() - tc) / 1000;
    stats.compiles = jobs.length;

    const logOk = (e) => {
      const bad = [];
      if (e.code !== 0) bad.push(`exit ${e.code}: ${(/^! .*$/m.exec(e.log) ?? [''])[0]}`);
      if (/Overfull \\[hv]box/.test(e.log)) bad.push((/Overfull \\[hv]box.*$/m.exec(e.log))[0]);
      if (/Missing character/.test(e.log)) bad.push((/Missing character.*$/m.exec(e.log))[0]);
      if (/Font Warning|Size substitutions/.test(e.log)) bad.push('font size substitution');
      return bad;
    };
    const sizeOk = (e, w, h, what) => {
      const box = e.pdf ? mediaBox(e.pdf) : null;
      if (!box) { ok(false, `${what}: no MediaBox`); return; }
      const bw = (box[2] - box[0]) / MM_BP, bh = (box[3] - box[1]) / MM_BP;
      ok(Math.abs(bw - w) <= 0.1 && Math.abs(bh - h) <= 0.1, `${what}: MediaBox ${bw.toFixed(3)} × ${bh.toFixed(3)} mm, wanted ${w.toFixed(3)} × ${h.toFixed(3)}`);
      stats.sizeWorst = Math.max(stats.sizeWorst ?? 0, Math.abs(bw - w), Math.abs(bh - h));
    };
    for (const { set, e } of entries) {
      const bad = logOk(e);
      ok(bad.length === 0, `${set.name} with pdflatex: ${bad.join('; ')}`);
      sizeOk(e, set.fig.width, set.fig.box.y1 - set.fig.box.y0, set.name);
    }
    const H = lw.fig.box.y1 - lw.fig.box.y0;
    for (const { mm, e } of mini) {
      const bad = logOk(e);
      ok(bad.length === 0, `\\linewidth picture in a ${mm} mm minipage: ${bad.join('; ')}`);
      sizeOk(e, mm, (H * mm) / lw.W, `\\linewidth picture in a ${mm} mm minipage`);
    }
    for (const { l, e } of ownLw) {
      ok(logOk(e).length === 0, `\\linewidth document (${l.W} mm): ${logOk(e).join('; ')}`);
      sizeOk(e, l.W, l.fig.box.y1 - l.fig.box.y0, `\\linewidth document (${l.W} mm)`);
    }
    for (const { engine, e } of engines) {
      const bad = logOk(e);
      ok(bad.length === 0, `${engine}: ${bad.join('; ')}`);
      sizeOk(e, full.fig.width, full.fig.box.y1 - full.fig.box.y0, engine);
    }
    ok(logOk(big).length === 0, `a Full figure with a 10,000-point trace: ${logOk(big).join('; ')}`);

    // ---------------------------------------------------------------------------------------------------------------
    section('tikz pixels');
    let browser = null;
    try {
      const { chromium } = await import('playwright-core');
      for (const channel of ['msedge', 'chrome']) {
        try { browser = await chromium.launch({ channel }); break; } catch { /* Try the next browser. */ }
      }
    } catch { browser = null; }
    if (!browser) console.log('tikz pixels: skipped: no Edge or Chrome');
    else {
      try {
        const page = await browser.newPage({ deviceScaleFactor: 1 });
        stats.pixels = [];
        for (const { s, e } of pixel) {
          const fig = s.fig, pgm = e.pgm;
          ok(e.code === 0 && pgm, `${s.name}: compiled and rendered by pdftoppm`);
          if (!pgm) continue;
          const wpx = (fig.width / 25.4) * 600, hpx = ((fig.box.y1 - fig.box.y0) / 25.4) * 600;
          const svg = figureSvg(fig, { id: 'px' }).replace(/<text[^>]*>[^<]*<\/text>/g, '')
            .replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${wpx}" height="${hpx}" style="display:block"`);
          await page.setViewportSize({ width: Math.ceil(wpx), height: Math.ceil(hpx) });
          await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`);
          const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: Math.ceil(wpx), height: Math.ceil(hpx) } });
          if (keep) writeFileSync(join(e.dir, 'browser.png'), shot);
          const png = pngGrey(shot);
          const w = Math.min(png.w, pgm.w), h = Math.min(png.h, pgm.h);
          ok(Math.abs(png.w - pgm.w) <= 1 && Math.abs(png.h - pgm.h) <= 1, `${s.name}: image sizes ${png.w}×${png.h} and ${pgm.w}×${pgm.h}`);
          let differ = 0, count = 0;
          for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            count++;
            if (Math.abs(png.data[y * png.w + x] - pgm.data[y * pgm.w + x]) > 64) differ++;
          }
          const share = (100 * differ) / count;
          stats.pixels.push(`${s.name} ${share.toFixed(3)} %`);
          ok(share < 0.5, `${s.name}: ${share.toFixed(3)} % of pixels differ between pdftoppm and the browser (< 0.5)`);
        }
        await page.close();
      } finally { await browser.close(); }
    }
  } finally {
    if (!keep) rmSync(root, { recursive: true, force: true });
  }
  console.log(`tikz: ${stats.sets} sets read back (worst ${stats.worst.toExponential(1)} mm), ${stats.texts} texts, ${stats.marks} marks, ${stats.arcs} arcs, ${stats.circles} circles, ${stats.large} large-arc pieces, ${stats.points} trace points; writer ${stats.writeMs.toFixed(2)} ms (${stats.kB.toFixed(0)} kB); ${stats.compiles} compiles in ${stats.compileS.toFixed(1)} s, MediaBox within ${(stats.sizeWorst ?? 0).toFixed(4)} mm; pixels: ${(stats.pixels ?? []).join(', ')}; ${((performance.now() - t0) / 1000).toFixed(1)} s in all`);
}
