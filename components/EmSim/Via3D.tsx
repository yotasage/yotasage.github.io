// The Via section's "3D view" switch (step M5.1). Closed, it is only this button: Via3DView.tsx and three.js are loaded
// with import() when it is first opened (one chunk), and closing unmounts the view, which disposes its WebGL context.
// The click's time goes to the view, which reports the time to its first frame (data-open-ms).

import React, { Suspense, lazy, useRef, useState } from 'react';

import type { Stackup } from '../../lib/emsim/stackup';
import type { ViaStructure } from '../../lib/emsim/via';
import base from '../../styles/EmSim.module.css';
import vcss from '../../styles/EmSimVia.module.css';
import type ViewComponent from './Via3DView';
import type { ViaFieldSettings } from './useViaField';
import { Whys } from './Why';
import { useI18n } from '../../lib/ui/i18n';

const View = lazy(
  // @ts-expect-error TS2835: Turbopack resolves the path without an extension (CLAUDE.md, tsconfig bullet).
  () => import('./Via3DView') as Promise<{ default: typeof ViewComponent }>,
);

interface Props { s: Stackup; v: ViaStructure; traceW: number; fields: ViaFieldSettings }

export default function Via3D({ s, v, traceW, fields }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const t0 = useRef(0);
  return (
    <div className={vcss.v3dShell} data-via3d-shell>
      <button type="button" className={base.button} aria-expanded={open} aria-pressed={open} data-via3d-open onClick={() => { t0.current = performance.now(); setOpen((o) => !o); }}>
        {t(open ? 'em.via.3d.close' : 'em.via.3d.open')}
      </button>
      <Whys ks="via-3d" />
      {open && (
        <Suspense fallback={<p className={vcss.dim} data-via3d-loading>{t('em.via.3d.loading')}</p>}>
          <View s={s} v={v} traceW={traceW} fields={fields} t0={t0.current} />
        </Suspense>
      )}
    </div>
  );
}
