// The sweep's marker table (step M7.2b): each marker's frequency, Z, Γ, VSWR and return loss on the committed circuit,
// from sweep.ts markerAt (the point engine's Γ, exactly as the sweep gives it), in the readout's number format and the
// page's digits setting. It follows the page's markers and circuit, so it changes when a drag ends; while the circuit
// is dragged the results' `data-state="coarse"` dims it.

import React, { memo, useMemo } from 'react';

import { ROUNDING_FLOOR, formatAmount, formatReturnLoss } from '../../lib/quantity';
import { gammaAngle, toDegrees } from '../../lib/smith/convert';
import type { Circuit } from '../../lib/smith/network';
import { markersAt, sweepCircuit } from '../../lib/smith/sweep';
import css from '../../styles/SmithSweep.module.css';
import { complexText, gammaPolarText } from './readout';
import { Why } from './Why';

export interface MarkerTableProps {
  circuit: Circuit;
  markers: readonly number[];
  digits: number;
}

/** A marker's texts in the table's column order: f, Z, Γ, VSWR, return loss. */
export function markerTexts(circuit: Circuit, markers: readonly number[], digits: number): string[][] {
  if (!markers.length) return [];
  const pts = markersAt(sweepCircuit(circuit), markers);
  return pts.map((p) => [
    formatAmount(p.f, 'Hz', digits, true),
    complexText(p.zr, p.zi, 'Ω', digits, ROUNDING_FLOOR * circuit.z0),
    gammaPolarText(p.mag, toDegrees(gammaAngle(p.gr, p.gi)), digits),
    formatAmount(p.vswr, '', digits, true),
    formatReturnLoss(p.rl, digits),
  ]);
}

const HEADS = ['f', 'Z', 'Γ', 'VSWR', 'Return loss'];

function MarkerTable({ circuit, markers, digits }: MarkerTableProps) {
  const rows = useMemo(() => markerTexts(circuit, markers, digits), [circuit, markers, digits]);
  return (
    <div data-marker-table="">
      <h3 className={css.sub}>Markers <Why k="sweep-table" /></h3>
      {rows.length === 0 ? (
        <p className={css.hint}>No markers yet: tap or click the trace or the plot, or use Add marker.</p>
      ) : (
        <div className={css.tableWrap} tabIndex={0} role="region" aria-label="Marker table">
          <table className={css.table}>
            <thead><tr><th scope="col">#</th>{HEADS.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} data-marker-row={i}>
                  <th scope="row">M{i + 1}</th>
                  {r.map((t, j) => <td key={j} data-col={j}>{t}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default memo(MarkerTable);
