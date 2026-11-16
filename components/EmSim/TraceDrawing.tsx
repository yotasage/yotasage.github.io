// The trace's cross-section drawn to scale (M2.1b): exactly the polygons the solver gets (lib/emsim/geometry.ts
// `section`): copper trapezoids, laminate, mask following the copper, air, and the reference planes (the section's
// zLo / zHi faces, drawn with their stackup thickness; the layers beyond them do not change the result and are left
// out). Both axes share one scale; "widen" stretches thin layers top to bottom (each at least MIN px) and says so.
//
// For M2.1c (handles) and M2.2 (field map): `traceView` is the mapping, x = W/2 + u·k (u in mm, 0 at the structure's
// centre) and y = view.y(z) (z in mm up from the stack's bottom, piecewise linear when widened, linear with k
// otherwise); its inverse for a drag is u = (x − W/2)/k and view.z(y).

import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { Section } from '../../lib/emsim/geometry';
import { layerIndex, stackZ } from '../../lib/emsim/stackup';
import type { DielectricLayer, Stackup } from '../../lib/emsim/stackup';
import type { Structure } from '../../lib/emsim/structure';
import type { LengthUnit } from '../../lib/emsim/units';
import css from '../../styles/EmSimTrace.module.css';
import { lenText } from './format';

const MAXH = 340; // px: the drawing's height at most (more board is shown across instead)
const MINH = 170; // px: and at least, while the copper still fits across
const MIN = 9; // px per layer when widened
const W0 = 640; // px: the width before the first measurement (the static page)

export interface TraceView {
  W: number;
  H: number;
  k: number; // px per mm across (and top to bottom when not widened)
  U: number; // mm: the view spans u in [−U, U]
  zBottom: number;
  zTop: number;
  y: (z: number) => number;
  z: (y: number) => number;
  widened: boolean;
}

// The view of a section in a box W px wide.
export function traceView(s: Stackup, st: Structure, sec: Section, W: number, widen: boolean): TraceView {
  const z = stackZ(s);
  const thick = (id: string) => { const i = layerIndex(s, id); return i >= 0 ? z[i] - z[i + 1] : 0; };
  // The copper's extent across (grounds that run to the edge count by their inner edge).
  let ext = 0;
  for (const c of sec.conductors) {
    for (let i = 0; i < c.pts.length; i += 2) if (Math.abs(c.pts[i]) < sec.ext * (1 - 1e-9)) ext = Math.max(ext, Math.abs(c.pts[i]));
  }
  let lo = Infinity, hi = -Infinity;
  for (const sk of sec.skins) {
    for (let i = 1; i < sk.surface.length; i += 2) { lo = Math.min(lo, sk.surface[i]); hi = Math.max(hi, sk.surface[i]); }
    lo = Math.min(lo, sk.z0); hi = Math.max(hi, sk.z0);
  }
  for (const c of sec.conductors) for (let i = 1; i < c.pts.length; i += 2) { lo = Math.min(lo, c.pts[i]); hi = Math.max(hi, c.pts[i]); }
  const zb0 = sec.planeBelow !== null ? sec.zLo - thick(st.below) : lo;
  const zt0 = sec.planeAbove !== null ? sec.zHi + thick(st.above) : hi;
  const span = Math.max(zt0 - zb0, 1e-3);
  const pad = Math.max(0.3 * span, 0.04);
  const zBottom = sec.planeBelow !== null ? zb0 : Math.max(zb0 - pad, sec.zLo);
  const zTop = sec.planeAbove !== null ? zt0 : Math.min(zt0 + pad, sec.zHi);
  const vh = zTop - zBottom;
  const need = Math.max(ext * 1.25, ext + 0.03);
  let U = Math.max(ext * 1.3, ext + 1.4 * span);
  let k = W / (2 * U);
  if (vh * k > MAXH) { k = MAXH / vh; U = W / (2 * k); }
  else if (vh * k < MINH) { const k2 = Math.min(MINH / vh, W / (2 * need)); if (k2 > k) { k = k2; U = W / (2 * k); } }
  // Breakpoints top to bottom: the stack's boundaries inside the view. Inside the board a widened layer is at least
  // MIN px; air stays at k.
  const zs: number[] = [zTop];
  for (let i = 0; i < z.length; i++) if (z[i] < zTop - 1e-12 && z[i] > zBottom + 1e-12) zs.push(z[i]);
  zs.push(zBottom);
  const ys: number[] = [0];
  for (let i = 1; i < zs.length; i++) {
    const dz = zs[i - 1] - zs[i];
    const inBoard = zs[i - 1] <= z[0] + 1e-12 && zs[i] >= z[z.length - 1] - 1e-12;
    ys.push(ys[i - 1] + (widen && inBoard ? Math.max(dz * k, MIN) : dz * k));
  }
  const H = ys[ys.length - 1];
  const y = (zz: number): number => {
    if (zz >= zs[0]) return (zs[0] - zz) * k;
    for (let i = 1; i < zs.length; i++) {
      if (zz >= zs[i]) { const dz = zs[i - 1] - zs[i]; return dz > 0 ? ys[i - 1] + ((zs[i - 1] - zz) / dz) * (ys[i] - ys[i - 1]) : ys[i]; }
    }
    return H + (zs[zs.length - 1] - zz) * k;
  };
  const zOf = (yy: number): number => {
    if (yy <= 0) return zs[0] - yy / k;
    for (let i = 1; i < ys.length; i++) {
      if (yy <= ys[i]) { const dy = ys[i] - ys[i - 1]; return dy > 0 ? zs[i - 1] - ((yy - ys[i - 1]) / dy) * (zs[i - 1] - zs[i]) : zs[i]; }
    }
    return zs[zs.length - 1] - (yy - H) / k;
  };
  return { W, H, k, U, zBottom, zTop, y, z: zOf, widened: widen };
}

const r = (v: number) => Math.round(v * 100) / 100;

// A 1-2-5 length of at least 48 px.
function barLength(k: number): number {
  const want = 48 / k;
  const p = 10 ** Math.floor(Math.log10(want));
  for (const m of [1, 2, 5, 10]) if (m * p >= want) return m * p;
  return 10 * p;
}

interface Props {
  s: Stackup;
  st: Structure;
  sec: Section | null;
  reason: string;
  unit: LengthUnit;
  digits: number;
  widen: boolean;
}

export default function TraceDrawing({ s, st, sec, reason, unit, digits, widen }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(W0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { const w = Math.floor(el.clientWidth); if (w > 0) setW(w); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const v = useMemo(() => (sec ? traceView(s, st, sec, W, widen) : null), [s, st, sec, W, widen]);

  const body: React.ReactNode[] = [];
  const labels: React.ReactNode[] = [];
  if (sec && v) {
    const x = (u: number) => r(W / 2 + u * v.k);
    const pts = (p: Float64Array) => {
      let t = '';
      for (let i = 0; i < p.length; i += 2) t += `${x(p[i])},${r(v.y(p[i + 1]))} `;
      return t;
    };
    sec.regions.forEach((g, i) => {
      const m = sec.materials[g.mat];
      if (!m || m.kind === 'air') return; // the background is air
      const fill = m.kind === 'mask' ? 'var(--mask)' : (s.layers[m.layer] as DielectricLayer)?.role === 'core' ? 'var(--core)' : 'var(--prepreg)';
      body.push(<polygon key={`r${i}`} points={pts(g.pts)} fill={fill} stroke={m.kind === 'mask' ? 'var(--mask-edge)' : fill} strokeWidth={m.kind === 'mask' ? 0.75 : 0.5} strokeLinejoin="round" />);
    });
    // Boundaries between two dielectric layers.
    const z = stackZ(s);
    for (let i = 1; i < s.layers.length; i++) {
      if (s.layers[i].kind !== 'dielectric' || s.layers[i - 1].kind !== 'dielectric') continue;
      if (z[i] <= v.zBottom || z[i] >= v.zTop) continue;
      const yy = r(v.y(z[i]));
      body.push(<line key={`e${i}`} x1={0} x2={W} y1={yy} y2={yy} stroke="var(--laminate-edge)" strokeWidth={1} />);
    }
    const plane = (id: string, face: number, dir: 1 | -1, what: string) => {
      const i = layerIndex(s, id);
      if (i < 0) return;
      const t = z[i] - z[i + 1];
      const y1 = v.y(face), y2 = v.y(face + dir * t);
      body.push(<rect key={`p${id}`} x={0} width={W} y={r(Math.min(y1, y2))} height={r(Math.max(Math.abs(y2 - y1), 1))} fill="var(--copper)" stroke="var(--copper-edge)" strokeWidth={0.75} data-plane={what} />);
      labels.push(<text key={`l${id}`} x={W - 6} y={r(dir < 0 ? Math.min(y1, y2) - 4 : Math.max(y1, y2) + 12)} textAnchor="end">{`${s.layers[i].name} · plane`}</text>);
    };
    if (sec.planeBelow !== null && st.below) plane(st.below, sec.zLo, -1, 'below');
    if (sec.planeAbove !== null && st.above) plane(st.above, sec.zHi, 1, 'above');
    let sigTop = Infinity;
    for (const c of sec.conductors) {
      body.push(<polygon key={`c${c.id}-${c.pts[0]}`} points={pts(c.pts)} fill="var(--copper)" stroke="var(--copper-edge)" strokeWidth={0.75} strokeLinejoin="round" data-conductor={c.id} />);
      if (c.id > 0) {
        let u0 = Infinity, u1 = -Infinity, zt = -Infinity;
        for (let i = 0; i < c.pts.length; i += 2) { u0 = Math.min(u0, c.pts[i]); u1 = Math.max(u1, c.pts[i]); zt = Math.max(zt, c.pts[i + 1]); }
        sigTop = Math.min(sigTop, v.y(zt));
        if (sec.signals > 1) labels.push(<text key={`n${c.id}`} x={x((u0 + u1) / 2)} y={r(Math.max(v.y(zt) - 6, 11))} textAnchor="middle" className={css.sigNum}>{c.id}</text>);
      }
    }
    const sigLayer = s.layers[layerIndex(s, st.layer)];
    if (sigLayer && Number.isFinite(sigTop)) labels.push(<text key="sig" x={6} y={14}>{`${sigLayer.name} · signal`}</text>);
  }
  const bar = v ? barLength(v.k) : 0;
  return (
    <figure className={css.figure} data-trace-drawing data-widen={widen} data-px-per-mm={v ? v.k : 0} data-view-u={v ? v.U : 0} data-conductors={sec ? sec.conductors.length : 0}>
      <div ref={box} className={css.drawing}>
        {sec && v ? (
          <svg width={W} height={r(v.H)} viewBox={`0 0 ${W} ${r(v.H)}`} role="img" aria-label={`Cross-section of the ${st.kind} as the solver sees it${widen ? ', thin layers widened' : ', to scale'}`}>
            <rect x={0} y={0} width={W} height={r(v.H)} fill="var(--air)" />
            {body}
            <g className={css.svgLabels}>{labels}</g>
          </svg>
        ) : (
          <p className={css.noDrawing} data-no-drawing>{reason || 'Nothing to draw.'}</p>
        )}
      </div>
      <div className={css.caption}>
        <span className={css.key} style={{ background: 'var(--copper)' }} />copper
        <span className={css.key} style={{ background: 'var(--core)' }} />core
        <span className={css.key} style={{ background: 'var(--prepreg)' }} />prepreg
        <span className={css.key} style={{ background: 'var(--mask)' }} />mask
        <span className={css.key} style={{ background: 'var(--air)' }} />air
      </div>
      {v && (
        <div className={css.caption}>
          <span className={css.scale}><span className={css.scaleBar} style={{ width: Math.round(bar * v.k) }} />{lenText(bar, unit, Math.max(3, digits - 1))}</span>
          {' '}· {widen ? 'across to scale; thin layers widened top to bottom' : 'to scale both ways'}. Layers beyond the reference planes do not change the result and are not drawn.
        </div>
      )}
    </figure>
  );
}
