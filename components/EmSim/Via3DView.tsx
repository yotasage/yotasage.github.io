// The Via section's 3D view, opened (step M5.1): this file and three.js (via3dRender.ts) are one chunk the page loads
// only when "3D view" is opened (Via3D.tsx). The scene follows the via (the live via of a drag too; the renderer builds
// at most every few frames); the colours follow the page's theme; with "Show the fields" on, the Via section's two
// finished maps (the Export feed's viaSide and viaTop) lie on their planes, their scale bars below the view. Closing
// disposes the renderer and its WebGL context.

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { viaScene } from '../../lib/emsim/scene3d';
import type { Stackup } from '../../lib/emsim/stackup';
import type { ViaStructure } from '../../lib/emsim/via';
import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTrace.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import { useExportFeed } from './exportFeed';
import * as fieldPaint from './fieldPaint';
import type { Painted } from './fieldPaint';
import { FieldScaleBar } from './FieldView';
import { colorsOf, createVia3D, followTheme } from './via3dRender';
import type { FieldPlane, Via3D } from './via3dRender';
import { viaDriveText } from './useViaField';
import type { ViaFieldSettings } from './useViaField';
import { Whys } from './Why';

const planeOf = (p: Painted | null): FieldPlane | null => (p && p.image ? { image: p.image, x0: p.grid.view.x0, x1: p.grid.view.x1, z0: p.grid.view.z0, z1: p.grid.view.z1 } : null);

function save(blob: Blob, file: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Props { s: Stackup; v: ViaStructure; traceW: number; fields: ViaFieldSettings; t0: number }

export default function Via3DView({ s, v, traceW, fields, t0 }: Props) {
  const fieldsOn = fields.on;
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Via3D | null>(null);
  const [err, setErr] = useState('');
  const [openMs, setOpenMs] = useState(NaN);
  const [cut, setCut] = useState(false);
  const [laminate, setLaminate] = useState(true);
  const [scale, setScale] = useState(2);
  const [saved, setSaved] = useState('');
  const scene = useMemo(() => viaScene(s, v, traceW), [s, v, traceW]);
  const feed = useExportFeed();
  const side = fieldsOn ? feed.viaSide : null, top = fieldsOn ? feed.viaTop : null;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true, made: Via3D | null = null;
    createVia3D(el).then((x) => {
      if (!live) { x.dispose(); return; }
      made = x;
      (el as unknown as { emsimVia3d?: Via3D }).emsimVia3d = x;
      x.onFrame = () => setOpenMs(performance.now() - t0);
      x.setColors(colorsOf(el));
      setView(x);
    }, (e: unknown) => { if (live) setErr(`The 3D view needs WebGL, which this browser did not give (${e instanceof Error ? e.message : String(e)}).`); });
    return () => { live = false; made?.dispose(); };
    // t0 is the click that opened the view; it does not change while the view is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { view?.setScene(scene); }, [view, scene]);
  useEffect(() => { view?.setCut(cut); }, [view, cut]);
  useEffect(() => { view?.setLaminate(laminate); }, [view, laminate]);
  useEffect(() => { view?.setFields(planeOf(side), planeOf(top)); }, [view, side, top]);
  // The theme: the page's root switches data-theme, the system its scheme.
  useEffect(() => {
    const el = host.current;
    if (!view || !el) return;
    return followTheme(el, view);
  }, [view]);

  const png = () => {
    if (!view) return;
    setSaved('');
    view.png(scale).then((b) => { save(b, scale > 1 ? `via-3d@${scale}x.png` : 'via-3d.png'); setSaved(`${Math.round(b.size / 1024)} kB`); }, (e: unknown) => setErr(String(e)));
  };
  const n = (k: string) => scene.counts[k as keyof typeof scene.counts] ?? 0;

  return (
    <div className={vcss.v3d} data-via3d data-via3d-ready={!!view && Number.isFinite(openMs)} data-open-ms={Number.isFinite(openMs) ? openMs.toFixed(0) : ''} data-fields={side || top ? 'on' : 'off'}>
      <div ref={host} className={vcss.v3dHost} aria-label="The via in 3D: drag to turn, wheel or pinch to zoom, right-drag or two fingers to pan" role="img" />
      {err && <p className={css.refused} role="alert" data-via3d-error>{err}</p>}
      <div className={vcss.viewTools}>
        <button type="button" className={base.button} data-via3d-reset onClick={() => view?.reset()}>Reset view</button>
        <button type="button" className={base.button} aria-pressed={cut} data-via3d-cut onClick={() => setCut((c) => !c)}>Cut away half</button>
        <button type="button" className={base.button} aria-pressed={!laminate} data-via3d-laminate onClick={() => setLaminate((l) => !l)}>Hide the laminate</button>
      </div>
      <Whys ks="via-3d-reset via-3d-cut via-3d-laminate" />
      <div className={vcss.viewTools}>
        <div className={base.seg} role="group" aria-label="PNG size">
          {[1, 2].map((k) => <button key={k} type="button" aria-pressed={scale === k} data-via3d-scale={k} onClick={() => setScale(k)}>{k}×</button>)}
        </div>
        <button type="button" className={base.button} data-via3d-png disabled={!view} onClick={png}>Save PNG</button>
        {saved && <span className={vcss.dim} data-via3d-saved>{saved}</span>}
      </div>
      <Whys ks="via-3d-png" />
      {(side || top) && (
        <div data-via3d-fields>
          {side && <><p className={vcss.dim}>Side plane, through the barrels</p><FieldScaleBar mod={fieldPaint} painted={side} drive={viaDriveText('side', fields, !!v.pitch)} /></>}
          {top && <><p className={vcss.dim}>Top plane, between two planes</p><FieldScaleBar mod={fieldPaint} painted={top} drive={viaDriveText('top', fields, !!v.pitch)} /></>}
        </div>
      )}
      {fieldsOn && <Whys ks="via-3d-fields" />}
      <p className={css.caption} data-via3d-counts={JSON.stringify(scene.counts)} data-via3d-drilled={scene.drilled.length}>
        Copper: {n('barrel')} barrel{n('barrel') > 1 ? 's' : ''}, {n('pad')} pads, {n('plane')} plane{n('plane') === 1 ? '' : 's'} with their antipads, {n('return')} return via{n('return') === 1 ? '' : 's'}, {n('feed')} feed{n('feed') === 1 ? '' : 's'}; the laminate see-through{scene.drilled.length ? ', the backdrilled hole pale' : ''}.
        {fieldsOn && !side && !top ? ' The fields appear on their planes once the maps above are done.' : ''}
      </p>
    </div>
  );
}
