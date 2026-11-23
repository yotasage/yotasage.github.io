import React from 'react';

import type { PcbStats } from '../../lib/pcb/stats';
import fieldStyles from '../../styles/Fields.module.css';
import styles from '../../styles/PcbViewer.module.css';
import { formatLength, Units } from './Workspace';

function fmtSmall(mm: number | null, units: Units): string {
  if (mm === null || !Number.isFinite(mm)) return '—';
  const dec = units === 'in' ? 4 : 3;
  return `${formatLength(mm, units, dec)} ${units}`;
}

function fmtRange(minMm: number | null, maxMm: number | null, units: Units): string {
  if (minMm === null || maxMm === null) return '—';
  const dec = units === 'in' ? 4 : 3;
  if (Math.abs(maxMm - minMm) < 1e-4) {
    return `${formatLength(minMm, units, dec)} ${units}`;
  }
  return `${formatLength(minMm, units, dec)} – ${formatLength(maxMm, units, dec)} ${units}`;
}

function fmtArea(areaMm2: number | null, units: Units): string {
  if (areaMm2 === null || !Number.isFinite(areaMm2)) return '—';
  if (units === 'in') {
    return `${(areaMm2 / (25.4 * 25.4)).toFixed(2)} in²`;
  }
  return `${(areaMm2 / 100).toFixed(2)} cm²`;
}

function fmtRoutedLength(lengthMm: number | null, units: Units): string {
  if (lengthMm === null || !Number.isFinite(lengthMm)) return '—';
  if (units === 'in') return `${(lengthMm / 25.4).toFixed(1)} in`;
  if (lengthMm >= 1000) return `${(lengthMm / 1000).toFixed(2)} m`;
  return `${lengthMm.toFixed(1)} mm`;
}

export default function BoardStats({ stats, units }: { stats: PcbStats; units: Units }) {
  const { vias, drills, tracks, components, pads } = stats;
  const nonThroughVias = vias.byType.blind + vias.byType.buried + vias.byType.micro;

  const drillParts: string[] = [];
  if (drills.plated > 0) drillParts.push(`${drills.plated.toLocaleString('en-US')} PTH`);
  if (drills.nonPlated > 0) drillParts.push(`${drills.nonPlated.toLocaleString('en-US')} NPTH`);
  if (drills.slots > 0) drillParts.push(`${drills.slots.toLocaleString('en-US')} slot${drills.slots === 1 ? '' : 's'}`);

  const compParts: string[] = [];
  if (components) {
    compParts.push(`${components.top} top / ${components.bottom} bottom`);
    if (components.smd > 0 || components.tht > 0) {
      compParts.push(`${components.smd} SMD / ${components.tht} THT`);
    }
  }

  const padParts: string[] = [];
  if (pads) {
    if (pads.smd > 0) padParts.push(`${pads.smd} SMD`);
    if (pads.tht > 0) padParts.push(`${pads.tht} THT`);
    if (pads.npth > 0) padParts.push(`${pads.npth} NPTH`);
  }

  return (
    <div className={styles.statsWrap}>
      <table className={[fieldStyles.infoTable, styles.info, styles.statsTable].join(' ')}>
        <tbody>
          {stats.areaMm2 !== null && (
            <tr>
              <th>Board area</th>
              <td>{fmtArea(stats.areaMm2, units)}</td>
            </tr>
          )}
          <tr>
            <th>Vias</th>
            <td>
              {vias.count > 0 ? (
                <>
                  {vias.count.toLocaleString('en-US')}
                  {vias.uniqueSizes > 0 && ` (${vias.uniqueSizes} size${vias.uniqueSizes === 1 ? '' : 's'})`}
                  {nonThroughVias > 0 &&
                    ` · ${[
                      vias.byType.blind && `${vias.byType.blind} blind`,
                      vias.byType.buried && `${vias.byType.buried} buried`,
                      vias.byType.micro && `${vias.byType.micro} micro`,
                    ]
                      .filter(Boolean)
                      .join(', ')}`}
                </>
              ) : (
                'None detected'
              )}
            </td>
          </tr>
          {vias.count > 0 && (
            <>
              <tr>
                <th>Smallest via (outer)</th>
                <td>{fmtSmall(vias.minOuterMm, units)}</td>
              </tr>
              <tr>
                <th>Largest via (outer)</th>
                <td>{fmtSmall(vias.maxOuterMm, units)}</td>
              </tr>
              <tr>
                <th>Smallest via drill</th>
                <td>{fmtSmall(vias.minDrillMm, units)}</td>
              </tr>
              <tr>
                <th>Largest via drill</th>
                <td>{fmtSmall(vias.maxDrillMm, units)}</td>
              </tr>
              {vias.minAnnularRingMm !== null && (
                <tr>
                  <th>Min annular ring</th>
                  <td>{fmtSmall(vias.minAnnularRingMm, units)}</td>
                </tr>
              )}
            </>
          )}

          {drills.total > 0 && (
            <>
              <tr>
                <th>Drill holes</th>
                <td>
                  {drills.total.toLocaleString('en-US')}
                  {drillParts.length > 0 && ` (${drillParts.join(', ')})`}
                </td>
              </tr>
              <tr>
                <th>Drill Ø range</th>
                <td>
                  {fmtRange(drills.minDiameterMm, drills.maxDiameterMm, units)}
                  {drills.uniqueDiameters > 0 && ` · ${drills.uniqueDiameters} tool${drills.uniqueDiameters === 1 ? '' : 's'}`}
                </td>
              </tr>
            </>
          )}

          {tracks.segmentCount > 0 && (
            <>
              <tr>
                <th>Track width</th>
                <td>{fmtRange(tracks.minWidthMm, tracks.maxWidthMm, units)}</td>
              </tr>
              <tr>
                <th>Routed tracks</th>
                <td>
                  {fmtRoutedLength(tracks.totalLengthMm, units)} ({tracks.segmentCount.toLocaleString('en-US')} segs)
                </td>
              </tr>
            </>
          )}

          {stats.zonesCount !== null && stats.zonesCount > 0 && (
            <tr>
              <th>Copper zones</th>
              <td>{stats.zonesCount.toLocaleString('en-US')}</td>
            </tr>
          )}

          {components && (
            <tr>
              <th>Components</th>
              <td>
                {components.total.toLocaleString('en-US')} ({compParts.join(' · ')})
              </td>
            </tr>
          )}

          {pads && (
            <tr>
              <th>Pads</th>
              <td>
                {pads.total.toLocaleString('en-US')}
                {padParts.length > 0 && ` (${padParts.join(', ')})`}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {vias.count > 0 && vias.source === 'gerber-inferred' && (
        <p className={fieldStyles.help}>
          Via sizes were inferred by matching small plated drill holes to overlapping copper pads (the Gerber files did not include X2 via attributes).
        </p>
      )}
    </div>
  );
}
