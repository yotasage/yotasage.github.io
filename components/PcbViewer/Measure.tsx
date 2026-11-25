import React from 'react';

import { Pt } from '../../lib/pcb/model';
import { nearestPoint, PointKind, pointIndex } from '../../lib/pcb/points';
import { BoardView } from '../../lib/pcb/render/view';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PcbViewer.module.css';
import fieldStyles from '../../styles/Fields.module.css';

export interface MeasurePoint {
  p: Pt;
  // What it snapped to; 'free' when nothing was near.
  kind: PointKind | 'free';
}

// How far (CSS pixels) a click or tap snaps to a pad or hole centre or a line end.
const SNAP_MOUSE = 10;
const SNAP_TOUCH = 22;

// The point to measure from a click: the nearest pad or hole centre or line end of the layers in the picture.
export function snapPoint(view: BoardView, p: Pt, pointerType: string): MeasurePoint {
  const px = pointerType === 'mouse' ? SNAP_MOUSE : SNAP_TOUCH;
  const found = nearestPoint(view.pictureLayers().map(pointIndex), p, px * view.mmPerPixel);
  return found ? { p: found.p, kind: found.kind } : { p, kind: 'free' };
}

const MIL = 0.0254;

export function mm(v: number): string {
  return `${v.toFixed(3).replace('-', '−')} mm`;
}

export function mil(v: number): string {
  return `${(v / MIL).toFixed(1).replace('-', '−')} mil`;
}

const KIND_KEYS: Record<MeasurePoint['kind'], TranslationKey> = {
  pad: 'pcb.meas.pad',
  hole: 'pcb.meas.hole',
  end: 'pcb.meas.end',
  free: 'pcb.meas.free',
};

// Re-renders when the view moves, so overlays stay on the board.
function useViewChanges(view: BoardView): void {
  const [, bump] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => view.listenView(bump), [view]);
}

// The measurement drawn over the canvas: the snap target under the mouse, the points, the line and the distance.
export function MeasureOverlay({ view, points, hover }: { view: BoardView; points: MeasurePoint[]; hover: MeasurePoint | null }) {
  useViewChanges(view);
  const css = points.map((m) => view.cssPoint(m.p));
  const h = hover ? view.cssPoint(hover.p) : null;
  const [a, b] = css;
  const d = points.length === 2 ? Math.hypot(points[1].p.x - points[0].p.x, points[1].p.y - points[0].p.y) : null;
  const marker = (p: { x: number; y: number }, kind: MeasurePoint['kind'], key: string, className: string) => (
    <g key={key} className={className}>
      {kind === 'free' ? (
        <path d={`M${p.x - 7} ${p.y}H${p.x + 7}M${p.x} ${p.y - 7}V${p.y + 7}`} />
      ) : (
        <>
          <circle cx={p.x} cy={p.y} r={6} />
          <path d={`M${p.x - 3} ${p.y}H${p.x + 3}M${p.x} ${p.y - 3}V${p.y + 3}`} />
        </>
      )}
    </g>
  );
  return (
    <>
      <svg className={styles.measureSvg} aria-hidden>
        {a && b && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={styles.measureLine} />}
        {h && hover.kind !== 'free' && marker(h, hover.kind, 'hover', styles.measureHover)}
        {css.map((p, i) => marker(p, points[i].kind, String(i), styles.measurePoint))}
      </svg>
      {a && b && d !== null && (
        // Above a flat line, beside a steep one, so it does not cover the points.
        <div
          className={[styles.measureLabel, Math.abs(b.y - a.y) > Math.abs(b.x - a.x) ? styles.measureLabelSide : ''].join(' ')}
          style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 }}
        >
          {`${mm(d)} · ${mil(d)}`}
        </div>
      )}
    </>
  );
}

export function MeasureCard({ measuring, points, onToggle, onClear }: {
  measuring: boolean;
  points: MeasurePoint[];
  onToggle: () => void;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const [a, b] = points;
  const rows: [string, number, boolean][] = a && b ? [
    [t('pcb.meas.distance'), Math.hypot(b.p.x - a.p.x, b.p.y - a.p.y), true],
    [t('pcb.meas.alongX'), Math.abs(b.p.x - a.p.x), false],
    [t('pcb.meas.alongY'), Math.abs(b.p.y - a.p.y), false],
  ] : [];
  return (
    <>
      <p className={fieldStyles.help}>
        {measuring ? t('pcb.meas.helpOn') : t('pcb.meas.helpOff')}
      </p>
      {rows.length > 0 && (
        <table className={[fieldStyles.infoTable, styles.info].join(' ')}>
          <tbody>
            {rows.map(([label, v, isDist]) => (
              <tr key={label}>
                <th>{label}</th>
                <td className={isDist ? styles.strong : undefined}>{mm(v)}<br />{mil(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {points.length > 0 && (
        <p className={styles.detailNote}>
          {points.map((m, i) => t(i ? 'pcb.meas.toPt' : 'pcb.meas.fromPt', {
            kind: t(KIND_KEYS[m.kind]),
            x: m.p.x.toFixed(3),
            y: m.p.y.toFixed(3),
          })).join('; ')}.
        </p>
      )}
      <div className={fieldStyles.buttonRow}>
        <button type="button" className={fieldStyles.buttonSmall} aria-pressed={measuring} onClick={onToggle}>
          {measuring ? t('pcb.meas.stop') : t('pcb.meas.start')}
        </button>
        {points.length > 0 && <button type="button" className={fieldStyles.buttonSmall} onClick={onClear}>{t('pcb.meas.clear')}</button>}
      </div>
    </>
  );
}
