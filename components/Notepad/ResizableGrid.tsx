import React, { useRef } from 'react';

import styles from '../../styles/Notepad.module.css';

export interface ResizableGridProps {
  rows: number;
  cols: number;
  colSizes: readonly number[];
  rowSizes: readonly number[];
  onChangeColSizes: (next: number[]) => void;
  onChangeRowSizes: (next: number[]) => void;
  renderPane: (paneIdx: number) => React.ReactNode;
}

const MIN_COL_PCT = 12;
const MIN_ROW_PCT = 14;
const SPLITTER_PX = 6;

export default function ResizableGrid({
  rows,
  cols,
  colSizes,
  rowSizes,
  onChangeColSizes,
  onChangeRowSizes,
  renderPane,
}: ResizableGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const safeCols =
    colSizes.length === cols ? colSizes : Array.from({ length: cols }, () => 100 / cols);
  const safeRows =
    rowSizes.length === rows ? rowSizes : Array.from({ length: rows }, () => 100 / rows);

  // Interleave content tracks (fr) with fixed 6px splitter tracks
  const gridTemplateColumns = safeCols
    .map((pct, i) => (i < cols - 1 ? `minmax(0, ${pct}fr) ${SPLITTER_PX}px` : `minmax(0, ${pct}fr)`))
    .join(' ');
  const gridTemplateRows = safeRows
    .map((pct, i) => (i < rows - 1 ? `minmax(0, ${pct}fr) ${SPLITTER_PX}px` : `minmax(0, ${pct}fr)`))
    .join(' ');

  const startColDrag = (colIdx: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);

    const rect = el.getBoundingClientRect();
    const usableW = Math.max(100, rect.width - (cols - 1) * SPLITTER_PX);
    const startX = e.clientX;
    const initial = safeCols.slice();
    const pairSum = initial[colIdx] + initial[colIdx + 1];

    const onMove = (ev: PointerEvent) => {
      const deltaPct = ((ev.clientX - startX) / usableW) * 100;
      const minA = Math.min(MIN_COL_PCT, pairSum * 0.35);
      const nextA = Math.max(minA, Math.min(pairSum - minA, initial[colIdx] + deltaPct));
      const nextB = pairSum - nextA;
      const updated = initial.slice();
      updated[colIdx] = Number(nextA.toFixed(2));
      updated[colIdx + 1] = Number(nextB.toFixed(2));
      onChangeColSizes(updated);
    };

    const onUp = () => {
      target.releasePointerCapture?.(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const startRowDrag = (rowIdx: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);

    const rect = el.getBoundingClientRect();
    const usableH = Math.max(100, rect.height - (rows - 1) * SPLITTER_PX);
    const startY = e.clientY;
    const initial = safeRows.slice();
    const pairSum = initial[rowIdx] + initial[rowIdx + 1];

    const onMove = (ev: PointerEvent) => {
      const deltaPct = ((ev.clientY - startY) / usableH) * 100;
      const minA = Math.min(MIN_ROW_PCT, pairSum * 0.35);
      const nextA = Math.max(minA, Math.min(pairSum - minA, initial[rowIdx] + deltaPct));
      const nextB = pairSum - nextA;
      const updated = initial.slice();
      updated[rowIdx] = Number(nextA.toFixed(2));
      updated[rowIdx + 1] = Number(nextB.toFixed(2));
      onChangeRowSizes(updated);
    };

    const onUp = () => {
      target.releasePointerCapture?.(e.pointerId);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const cells: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const paneIdx = r * cols + c;
      cells.push(
        <div
          key={`cell-${r}-${c}`}
          className={styles.gridCell}
          style={{ gridRow: r * 2 + 1, gridColumn: c * 2 + 1 }}
        >
          {renderPane(paneIdx)}
        </div>,
      );
    }
  }

  // Vertical column splitters spanning all rows
  const colSplitters: React.ReactNode[] = [];
  for (let c = 0; c < cols - 1; c++) {
    colSplitters.push(
      <div
        key={`col-split-${c}`}
        className={styles.gridColHandle}
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize grid columns ${c + 1} and ${c + 2}`}
        data-testid={`grid-col-handle-${c}`}
        style={{
          gridColumn: c * 2 + 2,
          gridRow: `1 / ${rows * 2}`,
        }}
        onPointerDown={startColDrag(c)}
      />,
    );
  }

  // Horizontal row splitters spanning all columns
  const rowSplitters: React.ReactNode[] = [];
  for (let r = 0; r < rows - 1; r++) {
    rowSplitters.push(
      <div
        key={`row-split-${r}`}
        className={styles.gridRowHandle}
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize grid rows ${r + 1} and ${r + 2}`}
        data-testid={`grid-row-handle-${r}`}
        style={{
          gridRow: r * 2 + 2,
          gridColumn: `1 / ${cols * 2}`,
        }}
        onPointerDown={startRowDrag(r)}
      />,
    );
  }

  return (
    <div
      ref={containerRef}
      className={styles.layoutCustomGrid}
      data-testid="notepad-grid-layout"
      data-grid-dims={`${rows}x${cols}`}
      style={{ gridTemplateColumns, gridTemplateRows }}
    >
      {cells}
      {colSplitters}
      {rowSplitters}
    </div>
  );
}
