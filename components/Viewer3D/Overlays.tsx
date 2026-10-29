import React from 'react';
import { Vector3 } from 'three';

import type { AxisMark, Viewer } from '../../lib/viewer3d/viewer';
import styles from '../../styles/Viewer3D.module.css';

const COLORS = { x: '#e5534b', y: '#4caf50', z: '#3d8bfd' };
const SIZE = 92;
const LENGTH = 30;

// Re-renders the component after every frame of the view.
function useFrame(viewer: Viewer, read: () => void) {
  const latest = React.useRef(read);
  latest.current = read;
  React.useEffect(() => viewer.addFrameListener(() => latest.current()), [viewer]);
}

// The X, Y and Z axes as the camera sees them. Clicking the end of an axis looks along it at the model.
export function AxisGizmo({ viewer }: { viewer: Viewer }) {
  const [axes, setAxes] = React.useState<AxisMark[]>(() => viewer.axes());
  useFrame(viewer, () => setAxes(viewer.axes()));
  const c = SIZE / 2;
  // Drawn from the back to the front.
  const ordered = [...axes].sort((a, b) => a.z - b.z);
  const lookAlong = (m: AxisMark) => {
    const dir = new Vector3();
    dir[m.axis] = m.positive ? 1 : -1;
    viewer.viewAlong(dir);
  };
  return (
    <svg className={styles.gizmo} width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="group" aria-label="Axes: click an axis to look along it">
      <circle cx={c} cy={c} r={c - 2} className={styles.gizmoBack} />
      {ordered.map((m) => {
        const x = c + m.x * LENGTH;
        const y = c + m.y * LENGTH;
        const name = `${m.positive ? '+' : '−'}${m.axis.toUpperCase()}`;
        return (
          <g
            key={name}
            role="button"
            tabIndex={0}
            aria-label={`View from ${name}`}
            className={styles.gizmoAxis}
            onClick={() => lookAlong(m)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                lookAlong(m);
              }
            }}
          >
            <title>{`View from ${name}`}</title>
            {m.positive && <line x1={c} y1={c} x2={x} y2={y} stroke={COLORS[m.axis]} strokeWidth={2.5} />}
            <circle
              cx={x}
              cy={y}
              r={m.positive ? 9 : 6.5}
              fill={m.positive ? COLORS[m.axis] : '#2a2d33'}
              stroke={COLORS[m.axis]}
              strokeWidth={m.positive ? 0 : 2}
              opacity={m.z < -0.2 ? 0.75 : 1}
            />
            {m.positive && <text x={x} y={y} dy="0.35em" textAnchor="middle" className={styles.gizmoLabel}>{m.axis.toUpperCase()}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// The measured distance, next to the middle of the line between the two points.
export function MeasureLabel({ viewer, points, text }: { viewer: Viewer; points: Vector3[]; text: string }) {
  const [position, setPosition] = React.useState<{ x: number; y: number; visible: boolean } | null>(null);
  const middle = points.length === 2 ? points[0].clone().add(points[1]).multiplyScalar(0.5) : null;
  useFrame(viewer, () => setPosition(middle ? viewer.project(middle) : null));
  React.useEffect(() => {
    setPosition(middle ? viewer.project(middle) : null);
    // The points are replaced, never changed, so comparing the array is enough.
  }, [points]);
  if (!middle || !position?.visible) return null;
  return <div className={styles.measureLabel} style={{ left: position.x, top: position.y }}>{text}</div>;
}
