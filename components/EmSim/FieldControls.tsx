// The field view's controls (M2.2), under the cross-section: on or off (off by default, so the page's first picture
// and the drag budgets stay as they were), the quantity, the drive for two lines or more (named drives; one line
// driven with its number), linear or log scale, and the probe's keys.

import React from 'react';

import base from '../../styles/EmSim.module.css';
import css from '../../styles/EmSimTrace.module.css';
import type { FieldDrive, FieldQty, FieldSettings } from './fieldTypes';
import { DRIVE_LABEL, QTY_LABEL } from './fieldTypes';
import { Why, Whys } from './Why';

interface Props { f: FieldSettings; n: number; set: (f: FieldSettings) => void }

export default function FieldControls({ f, n, set }: Props) {
  const surfaceQ = f.qty === 'charge' || f.qty === 'current';
  return (
    <div className={css.fieldControls} data-field-controls>
      <label className={css.check}>
        <input type="checkbox" checked={f.on} data-field-on onChange={(e) => set({ ...f, on: e.target.checked })} />
        Show the fields
      </label>
      <Why k="field-on" bare />
      {f.on && (
        <div className={css.selects}>
          <label className={css.ctl}>
            Quantity
            <select className={base.select} data-field-qty value={f.qty} onChange={(e) => set({ ...f, qty: e.target.value as FieldQty })}>
              {(Object.keys(QTY_LABEL) as FieldQty[]).map((q) => <option key={q} value={q}>{QTY_LABEL[q]}</option>)}
            </select>
          </label>
          {n > 1 && (
            <label className={css.ctl}>
              Drive
              <select className={base.select} data-field-drive value={f.drive} onChange={(e) => set({ ...f, drive: e.target.value as FieldDrive })}>
                {(Object.keys(DRIVE_LABEL) as FieldDrive[]).map((d) => <option key={d} value={d}>{DRIVE_LABEL[d]}{n > 2 && (d === 'odd' || d === 'differential') ? ', lines 1 and 2' : ''}</option>)}
              </select>
            </label>
          )}
          {n > 1 && f.drive === 'line' && (
            <label className={css.ctl}>
              Driven line
              <select className={base.select} data-field-line value={Math.min(n, f.line)} onChange={(e) => set({ ...f, line: Number(e.target.value) })}>
                {Array.from({ length: n }, (_, i) => <option key={i} value={i + 1}>Line {i + 1}</option>)}
              </select>
            </label>
          )}
          <label className={css.ctl}>
            Colour scale
            <select className={base.select} data-field-scale-kind value={f.scale} disabled={surfaceQ} onChange={(e) => set({ ...f, scale: e.target.value as FieldSettings['scale'] })}>
              <option value="linear">Linear</option>
              <option value="log">Logarithmic (3 decades)</option>
            </select>
          </label>
          <div className={css.ctl}>
            Probe keys
            <button type="button" className={base.button} aria-pressed={f.probe} data-field-probe-mode onClick={() => set({ ...f, probe: !f.probe })} title="When on, the arrow keys on the focused drawing move the probe instead of panning">
              {f.probe ? 'Arrows move the probe' : 'Arrows pan'}
            </button>
          </div>
        </div>
      )}
      {f.on && <Whys ks={`field-qty${n > 1 ? ' field-drive' : ''}${n > 1 && f.drive === 'line' ? ' field-line' : ''} field-scale-kind probe-keys field-scale probe`} />}
    </div>
  );
}
