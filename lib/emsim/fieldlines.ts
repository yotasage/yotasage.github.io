// Equipotentials and field lines of the 2D fields (step M1.5, engine.md §9).
//
// - Equipotentials (`contours`): marching squares on a grid (fields.ts `fieldGrid`), the saddle cells decided by the
//   cell's mean; segments in section coordinates. On an H grid the contours of Az are the H lines.
// - Field lines (`fieldLines`): seeded on the conductors' positively charged faces at equal steps of free charge
//   (`perCharge` C/m per line, so the density of lines shows the strength, and the same perCharge gives comparable
//   pictures across drives), each started just outside the copper on the side the field leaves, and integrated along
//   E/|E| by the explicit midpoint rule with step control: the step's error estimate is h·|k2 − k1| (Euler against
//   midpoint), accepted below tol·diagonal (default 10⁻³), the next step h·min(2, max(0.3, 0.9·√(tol·d/err))), within
//   [10⁻⁵, 2 × 10⁻²]·diagonal. A line stops in copper (the end point bisected onto the surface), at the view's edge
//   (clipped to it), where the field vanishes, or after maxSteps.

import type { FieldGrid, Source, View } from './fields';
import { classify, evalField, forView, surface } from './fields';

export interface Contour { level: number; segs: Float32Array } // x0, z0, x1, z1 per segment

/** Evenly spaced levels strictly between lo and hi. */
export function levelsBetween(lo: number, hi: number, n: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= n; k++) out.push(lo + ((hi - lo) * k) / (n + 1));
  return out;
}

/** Contour segments of a grid's values (default φ, or Az of an H grid) at the given levels. */
export function contours(g: FieldGrid | { view: View; phi: ArrayLike<number> }, levels: number[], values: ArrayLike<number> = g.phi): Contour[] {
  const { nx, ny, x0, x1, z0, z1 } = g.view;
  const dx = (x1 - x0) / (nx - 1);
  const dz = (z1 - z0) / (ny - 1);
  const nl = levels.length;
  const bufs: number[][] = levels.map(() => []);
  const P = new Float64Array(8); // up to two segments: (i, j) in grid units
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const k = j * nx + i;
      const va = values[k], vb = values[k + 1], vc = values[k + nx + 1], vd = values[k + nx]; // corners 00 10 11 01
      let mn = va, mx = va;
      if (vb < mn) mn = vb; else if (vb > mx) mx = vb;
      if (vc < mn) mn = vc; else if (vc > mx) mx = vc;
      if (vd < mn) mn = vd; else if (vd > mx) mx = vd;
      if (!(mx > mn)) continue; // flat, or NaN
      for (let q = 0; q < nl; q++) {
        const L = levels[q];
        if (!(L >= mn && L < mx)) continue;
        const a = va - L, b = vb - L, c = vc - L, d = vd - L;
        const idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
        if (idx === 0 || idx === 15) continue;
        // crossings: bottom (B), right (R), top (T), left (Lf), as (x, z) in grid units
        let ns = 1;
        const put = (o: number, side: number) => {
          if (side === 0) { P[o] = i + a / (a - b); P[o + 1] = j; }
          else if (side === 1) { P[o] = i + 1; P[o + 1] = j + b / (b - c); }
          else if (side === 2) { P[o] = i + d / (d - c); P[o + 1] = j + 1; }
          else { P[o] = i; P[o + 1] = j + a / (a - d); }
        };
        switch (idx) {
          case 1: case 14: put(0, 3); put(2, 0); break;
          case 2: case 13: put(0, 0); put(2, 1); break;
          case 3: case 12: put(0, 3); put(2, 1); break;
          case 4: case 11: put(0, 1); put(2, 2); break;
          case 6: case 9: put(0, 0); put(2, 2); break;
          case 7: case 8: put(0, 3); put(2, 2); break;
          default: { // 5, 10: saddle, decided by the cell's mean
            ns = 2;
            if ((idx === 5) === (a + b + c + d > 0)) { put(0, 3); put(2, 2); put(4, 0); put(6, 1); } else { put(0, 3); put(2, 0); put(4, 1); put(6, 2); }
          }
        }
        const buf = bufs[q];
        for (let e = 0; e < 4 * ns; e += 2) buf.push(x0 + P[e] * dx, z0 + P[e + 1] * dz);
      }
    }
  }
  return levels.map((level, q) => ({ level, segs: Float32Array.from(bufs[q]) }));
}

export interface LineOptions {
  view: { x0: number; x1: number; z0: number; z1: number };
  count?: number; // lines for the whole positive charge (default 24), unless perCharge is given
  perCharge?: number; // C/m per line
  tol?: number; // step error per step / view diagonal (default 1e-3)
  maxSteps?: number; // per line (default 4000)
}

export interface FieldLines { lines: Float32Array[]; perCharge: number; seeds: number; evaluations: number; ms: number }

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Field lines of an E source (for H, draw the contours of Az instead). */
export function fieldLines(src: Source, opt: LineOptions): FieldLines {
  const t0 = now();
  const v = opt.view;
  src = forView(src, v);
  const diag = Math.hypot(v.x1 - v.x0, v.z1 - v.z0);
  const tol = (opt.tol ?? 1e-3) * diag;
  const hMin = 1e-5 * diag, hMax = 2e-2 * diag;
  const maxSteps = opt.maxSteps ?? 4000;
  const media = src.model.media;
  const sf = surface(src);
  const nc = sf.x.length;
  let qPos = 0;
  for (let j = 0; j < nc; j++) if (sf.density[j] > 0) qPos += sf.density[j] * sf.len[j] / 1000;
  const per = opt.perCharge ?? (qPos > 0 ? qPos / (opt.count ?? 24) : 1);
  const o = [0, 0, 0];
  let evaluations = 0;
  // the direction field; NaN in copper
  const dir = (x: number, z: number, out: number[]): number => {
    evaluations++;
    const c = evalField(src, x, z, o);
    if (c < 0) return c;
    const m = Math.hypot(o[1], o[2]);
    if (!(m > 0)) { out[0] = 0; out[1] = 0; return 0; }
    out[0] = o[1] / m; out[1] = o[2] / m;
    return 0;
  };
  const inView = (x: number, z: number) => x >= v.x0 && x <= v.x1 && z >= v.z0 && z <= v.z1;
  const inCopper = (x: number, z: number) => (media ? classify(media, x, z) < 0 : false);
  const lines: Float32Array[] = [];
  let seeds = 0;
  let acc = 0.5 * per; // the next seed at this much charge along the positive faces
  let run = 0;
  const k1 = [0, 0], k2 = [0, 0];
  for (let j = 0; j < nc; j++) {
    const d = sf.density[j];
    if (!(d > 0)) continue;
    const q = d * sf.len[j] / 1000;
    while (acc < run + q) {
      const f = (acc - run) / q; // position along the panel
      acc += per;
      seeds++;
      const L = sf.len[j];
      // panel direction in the section frame: normal (nx, nz) turned back
      const tx = -sf.nz[j], tz = sf.nx[j];
      const px = sf.x[j] + (f - 0.5) * L * tx, pz = sf.z[j] + (f - 0.5) * L * tz;
      if (!inView(px, pz)) continue;
      // start just outside the copper, on the side the field leaves
      const off = 0.02 * L + 1e-9 * diag;
      let sx = NaN, sz = NaN;
      for (const sgn of [1, -1]) {
        const x = px + sgn * off * sf.nx[j], z = pz + sgn * off * sf.nz[j];
        if (dir(x, z, k1) < 0) continue;
        if (k1[0] * sf.nx[j] * sgn + k1[1] * sf.nz[j] * sgn > 0) { sx = x; sz = z; break; }
      }
      if (sx !== sx) continue;
      const pts: number[] = [px, pz, sx, sz];
      let x = sx, z = sz, h = Math.min(hMax, Math.max(hMin, 0.5 * L)), len = 0;
      for (let step = 0; step < maxSteps; step++) {
        if (dir(x, z, k1) < 0 || (k1[0] === 0 && k1[1] === 0)) break;
        let nxp = 0, nzp = 0, hit = false;
        for (;;) {
          const mx = x + 0.5 * h * k1[0], mz = z + 0.5 * h * k1[1];
          const cm = dir(mx, mz, k2);
          if (cm < 0) { if (h > hMin) { h = Math.max(hMin, h / 4); continue; } hit = true; nxp = mx; nzp = mz; break; }
          const err = h * Math.hypot(k2[0] - k1[0], k2[1] - k1[1]);
          if (err > tol && h > hMin) { h = Math.max(hMin, h * Math.max(0.3, 0.9 * Math.sqrt(tol / err))); continue; }
          nxp = x + h * k2[0]; nzp = z + h * k2[1];
          const next = h * Math.min(2, Math.max(0.3, err > 0 ? 0.9 * Math.sqrt(tol / err) : 2));
          len += h;
          h = Math.min(hMax, Math.max(hMin, next));
          break;
        }
        if (hit || inCopper(nxp, nzp)) {
          // bisect onto the copper's surface
          let ax = x, az = z, bx = nxp, bz = nzp;
          for (let b = 0; b < 30; b++) {
            const cx = (ax + bx) / 2, cz = (az + bz) / 2;
            if (inCopper(cx, cz)) { bx = cx; bz = cz; } else { ax = cx; az = cz; }
          }
          pts.push(bx, bz);
          break;
        }
        if (!inView(nxp, nzp)) {
          // clip to the view's edge
          let t = 1;
          const ddx = nxp - x, ddz = nzp - z;
          if (nxp < v.x0) t = Math.min(t, (v.x0 - x) / ddx);
          if (nxp > v.x1) t = Math.min(t, (v.x1 - x) / ddx);
          if (nzp < v.z0) t = Math.min(t, (v.z0 - z) / ddz);
          if (nzp > v.z1) t = Math.min(t, (v.z1 - z) / ddz);
          pts.push(x + t * ddx, z + t * ddz);
          break;
        }
        pts.push(nxp, nzp);
        x = nxp; z = nzp;
        if (len > 8 * diag) break;
      }
      lines.push(Float32Array.from(pts));
    }
    run += q;
  }
  return { lines, perCharge: per, seeds, evaluations, ms: now() - t0 };
}
