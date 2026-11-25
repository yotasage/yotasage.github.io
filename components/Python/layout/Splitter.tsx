// A splitter between two children of a dock split (docs/python/notes-L1.md §8): a focusable
// role="separator". Pointer drags move the two cells' flex-grow directly (no React render per move) and
// commit on release; arrows move 2 % (Shift: 10 %), Home/End go to the minimums, Enter or a double-click
// restores the preset's default sizes. Minimum sizes (model.ts) clamp every move.
import { useCallback, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { MIN_FRACTION, resizeBoundary, SPLITTER_PX } from '../../../lib/python/layout/model';
import type { SplitDir } from '../../../lib/python/layout/model';
import layoutStyles from '../../../styles/PythonLayout.module.css';

interface Props {
  readonly splitId: string;
  readonly dir: SplitDir;
  /** Boundary between child `index - 1` and child `index`. */
  readonly index: number;
  readonly sizes: readonly number[];
  /** Minimum size of each child along the split, in px. */
  readonly minPx: readonly number[];
  readonly label: string;
  readonly getSplit: () => HTMLElement | null;
  readonly getCell: (i: number) => HTMLElement | null;
  readonly onCommit: (sizes: number[]) => void;
  readonly onReset: () => void;
}

export default function Splitter({ splitId, dir, index, sizes, minPx, label, getSplit, getCell, onCommit, onReset }: Props) {
  const dragRef = useRef<{ start: number; total: number; sizes: readonly number[]; latest: number[] } | null>(null);
  const a = index - 1;

  /** Length available to the children (the split minus its splitters), and the minimums as fractions of it. */
  const measure = useCallback(() => {
    const el = getSplit();
    const len = el ? (dir === 'row' ? el.clientWidth : el.clientHeight) : 0;
    const total = Math.max(1, len - (sizes.length - 1) * SPLITTER_PX);
    return { total, minFr: minPx.map((m) => m / total) };
  }, [getSplit, dir, sizes.length, minPx]);

  const applyLive = useCallback(
    (next: readonly number[]) => {
      const ca = getCell(a);
      const cb = getCell(index);
      if (ca) ca.style.flexGrow = String(next[a]);
      if (cb) cb.style.flexGrow = String(next[index]);
    },
    [getCell, a, index],
  );

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const { total } = measure();
      dragRef.current = { start: dir === 'row' ? e.clientX : e.clientY, total, sizes, latest: sizes.slice() };
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture is best effort.
      }
      e.currentTarget.focus({ preventScroll: true });
    },
    [measure, dir, sizes],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const pos = dir === 'row' ? e.clientX : e.clientY;
      const next = resizeBoundary(d.sizes, a, (pos - d.start) / d.total, minPx.map((m) => m / d.total));
      d.latest = next;
      applyLive(next);
    },
    [dir, a, minPx, applyLive],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Already released.
      }
      if (commit && d.latest.some((v, i) => Math.abs(v - d.sizes[i]) > 1e-4)) onCommit(d.latest);
      else applyLive(d.sizes);
    },
    [onCommit, applyLive],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      let delta: number | null = null;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') delta = -step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') delta = step;
      else if (e.key === 'Home') delta = -1;
      else if (e.key === 'End') delta = 1;
      else if (e.key === 'Enter') {
        e.preventDefault();
        onReset();
        return;
      }
      if (delta === null) return;
      e.preventDefault();
      const { minFr } = measure();
      onCommit(resizeBoundary(sizes, a, delta, minFr));
    },
    [measure, sizes, a, onCommit, onReset],
  );

  const now = Math.round((sizes[a] ?? 0) * 100);
  const max = Math.round(((sizes[a] ?? 0) + (sizes[index] ?? 0) - MIN_FRACTION) * 100);
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
      aria-valuenow={now}
      aria-valuemin={Math.round(MIN_FRACTION * 100)}
      aria-valuemax={max}
      aria-label={label}
      className={layoutStyles.splitter}
      data-dir={dir}
      data-testid={`python-splitter-${splitId}-${index}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, true)}
      onPointerCancel={(e) => endDrag(e, false)}
      onLostPointerCapture={(e) => endDrag(e, true)}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
