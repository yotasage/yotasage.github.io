// The stackup drawn to scale (M2.1a): a cross-section, top up, in the colours a PCB designer expects (copper, core and
// prepreg laminate, solder mask, air). Vertical positions are exact (px per mm); the horizontal is a sketch: outer
// copper as bare laminate, a pour, two traces and a pour, so the mask's three thicknesses show (on laminate, over
// copper, between features). Inner copper as planes. "Widen thin layers" gives every layer at least MIN px; the
// positions inside a layer then stay linear, so the mask still follows the copper.

import React, { useMemo } from 'react';

import { stackThickness, stackZ } from '../../lib/emsim/stackup';
import type { Layer, MaskLayer, Stackup } from '../../lib/emsim/stackup';
import type { LengthUnit } from '../../lib/emsim/units';
import { useI18n } from '../../lib/ui/i18n';
import {
  localizeEmLayerName,
  localizeEmMaterial,
  localizeEmStackupName,
} from '../../lib/ui/localizeEmStackup';
import css from '../../styles/EmSimStackup.module.css';
import { lenText, numText } from './format';

const BODY = 300; // px of board at true scale
const AIR = 26; // px of air above and below
const MIN = 9; // px per layer when widened
const GAP = 15; // px between label centres
// Outer copper features across the sketch (x in 0…100): bare laminate first, then pour, trace, trace, pour.
const FEATURES: readonly [number, number][] = [[14, 34], [44, 52], [60, 68], [78, 100]];
const BARE = 14;

interface Geometry {
  H: number;
  top: number[]; // y of each layer's top
  h: number[]; // drawn height of each layer
  y: (z: number) => number; // z (mm, up, 0 at the bottom) to y (px, down)
  k: number; // px per mm at true scale (0 when widened)
  labels: number[]; // y of each layer's label
}

function geometry(s: Stackup, widen: boolean): Geometry {
  const L = s.layers;
  const n = L.length;
  const z = stackZ(s);
  const t = L.map((l) => Math.max(0, stackThickness(l)));
  const total = z[0] > 0 ? z[0] : 1;
  let k = BODY / total;
  if (widen) {
    if (n * MIN >= BODY) k = 0;
    else {
      let lo = 0, hi = BODY / total;
      for (let it = 0; it < 60; it++) {
        const mid = (lo + hi) / 2;
        let sum = 0;
        for (const ti of t) sum += Math.max(ti * mid, MIN);
        if (sum > BODY) hi = mid; else lo = mid;
      }
      k = lo;
    }
  }
  const h = t.map((ti) => (widen ? Math.max(ti * k, MIN) : ti * k));
  const top: number[] = new Array(n + 1);
  top[0] = AIR;
  for (let i = 0; i < n; i++) top[i + 1] = top[i] + h[i];
  const scaleOf = (i: number) => (t[i] > 0 ? h[i] / t[i] : k || MIN / 0.01);
  const y = (zz: number): number => {
    if (n === 0) return AIR;
    if (zz >= z[0]) return AIR - (zz - z[0]) * scaleOf(0);
    if (zz <= z[n]) return top[n] + (z[n] - zz) * scaleOf(n - 1);
    let i = 0;
    while (i < n - 1 && zz < z[i + 1]) i++;
    return t[i] > 0 ? top[i] + ((z[i] - zz) / t[i]) * h[i] : top[i];
  };
  let H = top[n] + AIR;
  // Labels at their layers' centres, pushed apart to GAP; the drawing grows if they do not fit.
  const labels = L.map((_, i) => top[i] + h[i] / 2);
  for (let i = 1; i < n; i++) labels[i] = Math.max(labels[i], labels[i - 1] + GAP);
  if (n && labels[n - 1] > H - 8) H = Math.max(H, labels[n - 1] + 8);
  for (let i = n - 2; i >= 0; i--) labels[i] = Math.min(labels[i], labels[i + 1] - GAP);
  for (let i = 0; i < n; i++) labels[i] = Math.max(labels[i], 8 + i * GAP);
  return { H, top, h, y, k: widen ? 0 : k, labels };
}

// The outer copper layers with their masks: copper index, mask index (or -1) and the side.
function outerCoppers(L: Layer[]): { c: number; m: number; up: boolean }[] {
  const out: { c: number; m: number; up: boolean }[] = [];
  const first = L.findIndex((l) => l.kind === 'copper');
  if (first < 0) return out;
  let last = -1;
  for (let i = L.length - 1; i >= 0; i--) if (L[i].kind === 'copper') { last = i; break; }
  const onlyMasks = (a: number, b: number) => { for (let i = a; i < b; i++) if (L[i].kind !== 'mask') return false; return true; };
  if (onlyMasks(0, first)) out.push({ c: first, m: first > 0 ? first - 1 : -1, up: true });
  if (last !== first && onlyMasks(last + 1, L.length)) out.push({ c: last, m: last + 1 < L.length ? last + 1 : -1, up: false });
  return out;
}

const r = (v: number) => Math.round(v * 100) / 100;

// The nice length of the scale bar: the smallest of 1-2-5 steps that is at least 28 px.
function scaleLength(k: number): number {
  for (const e of [0.001, 0.01, 0.1, 1, 10]) for (const m of [1, 2, 5]) if (e * m * k >= 28) return e * m;
  return 10;
}

export default function StackupDrawing({ s, unit, digits, widen, active }: { s: Stackup; unit: LengthUnit; digits: number; widen: boolean; active: number }) {
  const { t, locale } = useI18n();
  const g = useMemo(() => geometry(s, widen), [s, widen]);
  const L = s.layers;
  const z = useMemo(() => stackZ(s), [s]);
  const outer = useMemo(() => outerCoppers(L), [L]);
  const conformal = new Set<number>();
  for (const o of outer) { conformal.add(o.c); if (o.m >= 0) conformal.add(o.m); }

  const shapes: React.ReactNode[] = [];
  L.forEach((l, i) => {
    if (conformal.has(i)) return;
    const fill = l.kind === 'copper' ? 'var(--copper)' : l.kind === 'mask' ? 'var(--mask)' : l.role === 'core' ? 'var(--core)' : 'var(--prepreg)';
    shapes.push(<rect key={`b${i}`} x={0} y={r(g.top[i])} width={100} height={r(g.h[i])} fill={fill} />);
    if (l.kind === 'dielectric' && i > 0 && L[i - 1].kind === 'dielectric') {
      shapes.push(<line key={`e${i}`} x1={0} x2={100} y1={r(g.top[i])} y2={r(g.top[i])} stroke="var(--laminate-edge)" strokeWidth={1} vectorEffect="non-scaling-stroke" />);
    }
  });
  for (const o of outer) {
    const zCuOut = o.up ? z[o.c] : z[o.c + 1]; // the copper's outer face
    const zLam = o.up ? z[o.c + 1] : z[o.c]; // the laminate's surface
    const dir = o.up ? 1 : -1;
    if (o.m >= 0) {
      const m = L[o.m] as MaskLayer;
      const lev: [number, number, number][] = [[0, BARE, zLam + dir * m.onLaminate.v]];
      FEATURES.forEach(([a, b], j) => {
        lev.push([a, b, zCuOut + dir * m.onCopper.v]);
        if (j + 1 < FEATURES.length) lev.push([b, FEATURES[j + 1][0], zLam + dir * m.between.v]);
      });
      const pts: string[] = [`0,${r(g.y(zLam))}`];
      for (const [a, b, zz] of lev) pts.push(`${a},${r(g.y(zz))}`, `${b},${r(g.y(zz))}`);
      pts.push(`100,${r(g.y(zLam))}`);
      shapes.push(<polygon key={`m${o.m}`} points={pts.join(' ')} fill="var(--mask)" stroke="var(--mask-edge)" strokeWidth={0.75} vectorEffect="non-scaling-stroke" />);
    }
    const y1 = g.y(Math.max(zCuOut, zLam)), y2 = g.y(Math.min(zCuOut, zLam));
    for (const [a, b] of FEATURES) shapes.push(<rect key={`c${o.c}-${a}`} x={a} y={r(y1)} width={b - a} height={r(y2 - y1)} fill="var(--copper)" />);
  }
  if (active >= 0 && active < L.length) {
    shapes.push(<rect key="act" x={0} y={r(g.top[active])} width={3} height={r(Math.max(g.h[active], 2))} fill="var(--accent)" />);
  }

  const nameOf = (l: Layer) =>
    l.kind === 'dielectric'
      ? l.material && l.material !== l.name
        ? localizeEmMaterial(l.material, locale)
        : l.role === 'core'
          ? t('em.stkDraw.core')
          : t('em.stkDraw.prepreg')
      : localizeEmLayerName(l.name, locale);
  const detailOf = (l: Layer) => {
    if (l.kind === 'dielectric') return `${lenText(l.t.v, unit, digits)} · εr ${numText(l.er.v, digits)}`;
    if (l.kind === 'mask') return lenText(l.onLaminate.v, unit, digits);
    return lenText(l.t.v, unit, digits);
  };
  const bar = g.k > 0 ? scaleLength(g.k) : 0;
  return (
    <figure className={css.figure} data-drawing data-widen={widen} data-px-per-mm={g.k}>
      <div className={css.drawing} style={{ height: g.H }}>
        <div className={css.bands}>
          <svg viewBox={`0 0 100 ${r(g.H)}`} preserveAspectRatio="none" height={g.H} role="img" aria-label={t('em.stkDraw.aria', { name: s.name ? localizeEmStackupName(s.name, locale) : t('em.stkDraw.theStackup'), scale: widen ? t('em.stkDraw.widened') : t('em.stkDraw.toScale') })}>
            <rect x={0} y={0} width={100} height={r(g.H)} fill="var(--air)" />
            {shapes}
          </svg>
          <span className={css.airLabel} style={{ top: 6 }}>{t('em.stkDraw.air')}</span>
          <span className={css.airLabel} style={{ bottom: 6 }}>{t('em.stkDraw.air')}</span>
        </div>
        <div className={css.leaders} aria-hidden="true">
          <svg viewBox={`0 0 18 ${r(g.H)}`} preserveAspectRatio="none" height={g.H}>
            {L.map((_, i) => (
              <line key={i} x1={0} x2={18} y1={r(g.top[i] + g.h[i] / 2)} y2={r(g.labels[i])} stroke={i === active ? 'var(--accent)' : 'var(--ink-4)'} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
        </div>
        <div className={css.labels} aria-hidden="true">
          {L.map((l, i) => (
            <div key={l.id} className={css.label} style={{ top: g.labels[i] }} data-active={i === active}>
              <b>{nameOf(l)}</b>{detailOf(l)}
            </div>
          ))}
        </div>
      </div>
      <div className={css.caption}>
        <span className={css.key} style={{ background: 'var(--copper)' }} />{t('em.stkDraw.copper')}
        <span className={css.key} style={{ background: 'var(--core)' }} />{t('em.stkDraw.core')}
        <span className={css.key} style={{ background: 'var(--prepreg)' }} />{t('em.stkDraw.prepreg')}
        <span className={css.key} style={{ background: 'var(--mask)' }} />{t('em.stkDraw.mask')}
        <span className={css.key} style={{ background: 'var(--air)' }} />{t('em.stkDraw.air')}
      </div>
      {g.k > 0 ? (
        <div className={css.caption}>
          <span className={css.scale}><span className={css.scaleBar} style={{ width: Math.round(bar * g.k) }} />{lenText(bar, unit, 3)}</span>
          {t('em.stkDraw.scaleNote')}
        </div>
      ) : (
        <div className={css.caption}>{t('em.stkDraw.widenedNote', { min: MIN })}</div>
      )}
    </figure>
  );
}
