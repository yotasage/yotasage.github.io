import React, { useLayoutEffect, useRef } from 'react';

import styles from '../../styles/Smith.module.css';
import { GridLayer } from './gridSvg';

export interface GridProps {
  cx: number;     // Γ at the centre of the box
  cy: number;
  k: number;      // px per unit Γ
  width: number;  // box size in px
  height: number;
  mode: number;   // MODE_Z, MODE_Y or MODE_ZY
  /** Receives the layer once it exists, for callers that drive it directly (the frame loop of M2.2). */
  onLayer?: (layer: GridLayer) => void;
}

/** The grid layer: its own <svg>, filled imperatively by GridLayer (React renders no children into it). */
export default function Grid({ cx, cy, k, width, height, mode, onLayer }: GridProps) {
  const svg = useRef<SVGSVGElement>(null);
  const layer = useRef<GridLayer | null>(null);
  useLayoutEffect(() => {
    if (!layer.current) {
      layer.current = new GridLayer(svg.current);
      onLayer?.(layer.current);
    }
    layer.current.update(cx, cy, k, width, height, mode);
  }, [cx, cy, k, width, height, mode, onLayer]);
  return <svg ref={svg} className={styles.grid} role="img" aria-label="Smith chart grid" />;
}
