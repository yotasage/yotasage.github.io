// The graded Cartesian mesh of the full-wave solver (step M6.1, docs/em-sim/fullwave.md §2, §5), one axis at a time.
//
// Fixed lines are taken by rank (0 copper edges, faces and ports; 1 dielectric interfaces; 2 measurement planes and
// trace centres): a line closer than HMIN to one already taken is dropped (rank 1, 2: thin layers are averaged into
// the edges, §3) or, for copper, reported as moved. Each gap between fixed lines gets n cells: at least its share of
// the count rules (4 across a trace or the dielectric under it, 3 across a gap, 2 across other layers), at most
// G/HMIN, none above the largest cell (λ/15) or, in a barrel block, its uniform cell. Sweeps over the gaps give each
// the fewest cells (from its count rule up) that can fill it within RATIO of its neighbours' end cells (`fill`); where
// none can, even after the neighbours have moved, the gap takes fewer cells than its count rule asks (`relaxed`: RATIO and HMIN win over the count rules, e.g. 3 cells in 0.092 mm of prepreg
// between two 0.035 mm copper cells). Then CPML_CELLS cells of the last size on each open side.

import { CPML_CELLS, HMIN, RATIO } from './model';
import type { Block, Fixed, Model, Note, Span } from './model';

export interface AxisSpec {
  lo: number; hi: number; open: boolean;
  fixed: Fixed[]; spans: Span[]; blocks: Block[];
  hmax: number; hmin?: number; ratio?: number;
}
export interface AxisMesh {
  lines: Float64Array; // every mesh line, CPML included (mm)
  cpml: number; // CPML cells on each side (0: PEC walls at the domain's ends)
  fixed: Float64Array; // the fixed lines taken
  dropped: Fixed[]; // too close to a line taken (averaged)
  moved: { why: string; from: number; to: number }[]; // copper lines that had to give way
  gaps: { a: number; b: number; n: number; nmin: number; cap: number; relaxed: boolean }[]; // relaxed: fewer than nmin, as RATIO and HMIN allow no more
}
export interface Mesh { x: AxisMesh; y: AxisMesh; z: AxisMesh; hmax: number; notes: Note[] }

const EPS = 1e-9;

export function buildAxis(sp: AxisSpec): AxisMesh {
  const hmin = sp.hmin ?? HMIN, r = sp.ratio ?? RATIO;
  const cand: Fixed[] = [{ c: sp.lo, rank: 0, why: 'domain end' }, { c: sp.hi, rank: 0, why: 'domain end' }];
  for (const b of sp.blocks) {
    const n = Math.round((b.hi - b.lo) / b.h);
    for (let k = 0; k <= n; k++) cand.push({ c: b.lo + k * b.h, rank: 0, why: 'barrel block' });
  }
  for (const f of sp.fixed) if (Number.isFinite(f.c)) cand.push(f);
  cand.sort((a, b) => a.rank - b.rank || (a.why === 'domain end' ? -1 : 0) - (b.why === 'domain end' ? -1 : 0) || a.c - b.c);
  const taken: number[] = [];
  const dropped: Fixed[] = [], moved: AxisMesh['moved'] = [];
  const nearest = (c: number) => {
    let lo = 0, hi = taken.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (taken[mid] < c) lo = mid + 1; else hi = mid; }
    let best = -1, bd = Infinity;
    for (const k of [lo - 1, lo]) if (k >= 0 && k < taken.length && Math.abs(taken[k] - c) < bd) { bd = Math.abs(taken[k] - c); best = k; }
    return { k: best, d: bd, at: lo };
  };
  for (const f of cand) {
    if (f.c < sp.lo - EPS || f.c > sp.hi + EPS) { dropped.push(f); continue; }
    const q = nearest(f.c);
    if (q.d < EPS) continue;
    if (q.d < hmin - EPS) { if (f.rank === 0) moved.push({ why: f.why, from: f.c, to: taken[q.k] }); else dropped.push(f); continue; }
    taken.splice(q.at, 0, f.c);
  }
  const F = taken;
  const G = F.length - 1;
  const inBlock = (a: number, b: number) => sp.blocks.find((k) => a >= k.lo - EPS && b <= k.hi + EPS);
  const gaps = Array.from({ length: G }, (_, g) => {
    const a = F[g], b = F[g + 1], len = b - a;
    const blk = inBlock(a, b);
    const cap = Math.min(sp.hmax, blk ? blk.h * (1 + 1e-9) : Infinity);
    let nmin = 1;
    for (const s of sp.spans) if (s.a <= a + EPS && s.b >= b - EPS && s.b > s.a) nmin = Math.max(nmin, Math.ceil((s.n * len) / (s.b - s.a) - 1e-6));
    const nmax = blk ? 1 : Math.max(1, Math.floor(len / hmin + 1e-9));
    nmin = blk ? 1 : Math.min(nmin, nmax);
    return { a, b, len, cap, nmin, nmax, n: 1, u: [] as number[], relaxed: false };
  });
  // Cells of a gap with n cells between neighbour end cells cL, cR (NaN: none): every cell within ratio r of its
  // neighbours, in [HMIN, cap]. lb_j = max(HMIN, cL/r^(j+1), cR/r^(n−j)) and ub_j = min(cap, cL·r^(j+1), cR·r^(n−j))
  // each keep the ratio, and so does every mix (1 − λ)·lb + λ·ub: λ is set so the cells fill the gap exactly.
  const bounds = (q: (typeof gaps)[number], n: number, cL: number, cR: number) => {
    const lb = new Array<number>(n), ub = new Array<number>(n);
    let smin = 0, smax = 0, ok = true;
    for (let j = 0; j < n; j++) {
      lb[j] = Math.max(hmin, cL > 0 ? cL / r ** (j + 1) : 0, cR > 0 ? cR / r ** (n - j) : 0);
      ub[j] = Math.min(q.cap, cL > 0 ? cL * r ** (j + 1) : Infinity, cR > 0 ? cR * r ** (n - j) : Infinity);
      if (lb[j] > ub[j] * (1 + 1e-12)) ok = false;
      smin += lb[j]; smax += ub[j];
    }
    return { lb, ub, smin, smax, ok: ok && smin <= q.len * (1 + 1e-12) && smax >= q.len * (1 - 1e-12) };
  };
  const cells = gaps.map((q) => [q.len]);
  const fill = (g: number, relax: boolean) => {
    const q = gaps[g];
    if (q.nmax === 1 && q.nmin === 1) { cells[g] = [q.len]; q.n = 1; return true; }
    const cL = g > 0 ? cells[g - 1][cells[g - 1].length - 1] : NaN, cR = g < G - 1 ? cells[g + 1][0] : NaN;
    let n = q.nmin, bd = bounds(q, n, cL, cR);
    while (!bd.ok && bd.smax < q.len && n < q.nmax) { n++; bd = bounds(q, n, cL, cR); }
    if (!bd.ok && relax && bd.smin > q.len) {
      for (let k = n - 1; k >= 1; k--) { const b2 = bounds(q, k, cL, cR); if (b2.ok) { n = k; bd = b2; q.relaxed = true; break; } }
    }
    q.n = n;
    if (!bd.ok) { // the neighbours must move: the nearest mix, scaled to the gap
      const base = bd.smin > q.len ? bd.lb : bd.ub, s0 = base.reduce((a, x) => a + x, 0);
      cells[g] = base.map((x) => (x * q.len) / s0);
      return false;
    }
    const lam = bd.smax > bd.smin ? (q.len - bd.smin) / (bd.smax - bd.smin) : 0;
    const c = bd.lb.map((x, j) => x + lam * (bd.ub[j] - x));
    const s1 = c.reduce((a, x) => a + x, 0);
    cells[g] = c.map((x) => (x * q.len) / s1);
    return true;
  };
  // start from the count rules, uniform; then sweep until every gap is feasible with its neighbours as they are
  for (const q of gaps) { q.n = Math.min(q.nmax, Math.max(q.nmin, Math.ceil(q.len / q.cap - 1e-9))); }
  gaps.forEach((q, g) => (cells[g] = new Array(q.n).fill(q.len / q.n)));
  for (let sweep = 0; sweep < 400; sweep++) {
    let all = true;
    const relax = sweep >= 40;
    if (sweep % 2 === 0) { for (let g = 0; g < G; g++) all = fill(g, relax) && all; }
    else for (let g = G - 1; g >= 0; g--) all = fill(g, relax) && all;
    if (all && sweep >= 1) break;
  }
  gaps.forEach((q, g) => (q.u = cells[g].map(Math.log)));
  const out: number[] = [F[0]];
  for (const q of gaps) {
    let x = q.a;
    for (let j = 0; j < q.n - 1; j++) { x += Math.exp(q.u[j]); out.push(x); }
    out.push(q.b);
  }
  const nc = sp.open ? CPML_CELLS : 0;
  if (nc) {
    const c0 = out[1] - out[0], c1 = out[out.length - 1] - out[out.length - 2];
    const lo: number[] = [], hi: number[] = [];
    for (let k = nc; k >= 1; k--) lo.push(out[0] - k * c0);
    for (let k = 1; k <= nc; k++) hi.push(out[out.length - 1] + k * c1);
    out.unshift(...lo); out.push(...hi);
  }
  return {
    lines: Float64Array.from(out), cpml: nc, fixed: Float64Array.from(F), dropped, moved,
    gaps: gaps.map((q) => ({ a: q.a, b: q.b, n: q.n, nmin: q.nmin, cap: q.cap, relaxed: q.relaxed })),
  };
}

/** The mesh of a model. */
export function buildMesh(m: Model): Mesh {
  const notes: Note[] = [];
  const axis = (k: 'x' | 'y' | 'z') => {
    const a = buildAxis({ lo: m.extent[k][0], hi: m.extent[k][1], open: m.open[k], fixed: m.fixed[k], spans: m.spans[k], blocks: k === 'z' ? [] : m.blocks[k], hmax: m.hmax });
    for (const mv of a.moved) notes.push({ level: 'warning', code: 'moved', message: `${k}: the ${mv.why} at ${mv.from.toFixed(4)} mm is meshed at ${mv.to.toFixed(4)} mm (closer than ${HMIN} mm to another copper line).` });
    for (const g of a.gaps) if (g.n < g.nmin) notes.push({ level: 'warning', code: 'cells', message: `${k}: ${g.n} cells in ${g.a.toFixed(4)}…${g.b.toFixed(4)} mm, fewer than ${g.nmin}.` });
    return a;
  };
  return { x: axis('x'), y: axis('y'), z: axis('z'), hmax: m.hmax, notes };
}

/** Grid coordinates with the ghost node at index 0 (the spike's convention): n = lines + 1 nodes. */
export function gridOf(a: AxisMesh): Float64Array {
  const L = a.lines, g = new Float64Array(L.length + 1);
  g.set(L, 1);
  g[0] = L[0] - (L[1] - L[0]);
  return g;
}

/** Smallest cell of an axis (mm). */
export function minCell(a: AxisMesh): number {
  let m = Infinity;
  for (let i = 1; i < a.lines.length; i++) m = Math.min(m, a.lines[i] - a.lines[i - 1]);
  return m;
}
