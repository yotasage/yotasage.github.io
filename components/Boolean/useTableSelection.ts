import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Boolean.module.css';
import dStyles from '../../styles/BooleanDiagrams.module.css';

export interface CellCoord {
  readonly r: number;
  readonly c: number;
}

export interface SelectionRange {
  readonly anchor: CellCoord;
  readonly focus: CellCoord;
}

export interface SelectionBounds {
  readonly minR: number;
  readonly maxR: number;
  readonly minC: number;
  readonly maxC: number;
  readonly rows: number;
  readonly cols: number;
  readonly count: number;
}

export type CopiedState = 'selection' | 'all' | null;

export interface CellSelectionProps {
  readonly 'data-copy-value': string;
  readonly 'data-sel-cell': '1';
  readonly onMouseDown: (e: MouseEvent) => void;
  readonly onMouseEnter: () => void;
}

export interface TableSelectionApi {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly selection: SelectionRange | null;
  readonly bounds: SelectionBounds | null;
  readonly copiedState: CopiedState;
  readonly copiedDims: { readonly rows: number; readonly cols: number } | null;
  readonly rowCount: number;
  readonly colCount: number;
  readonly onKeyDown: (e: KeyboardEvent) => void;
  readonly getCellProps: (r: number, c: number) => CellSelectionProps;
  readonly getCellClassName: (r: number, c: number, baseClass?: string) => string;
  readonly consumeDidDrag: () => boolean;
  readonly copySelection: () => Promise<boolean>;
  readonly copyAll: () => Promise<boolean>;
  readonly selectAll: () => void;
  readonly clearSelection: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function gridToTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.join('\t')).join('\n');
}

function gridToHtmlTable(rows: readonly (readonly string[])[], includesHeaderRow: boolean): string {
  const trs = rows.map((row, idx) => {
    const tag = includesHeaderRow && idx === 0 ? 'th' : 'td';
    const cells = row.map((val) => `<${tag}>${escapeHtml(val)}</${tag}>`).join('');
    return `<tr>${cells}</tr>`;
  });
  return `<table><tbody>${trs.join('')}</tbody></table>`;
}

async function writeExcelClipboard(
  rows: readonly (readonly string[])[],
  includesHeaderRow: boolean,
): Promise<boolean> {
  if (rows.length === 0) return false;
  const tsv = gridToTsv(rows);
  const html = gridToHtmlTable(rows, includesHeaderRow);

  try {
    if (
      typeof ClipboardItem !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === 'function'
    ) {
      const item = new ClipboardItem({
        'text/plain': new Blob([tsv], { type: 'text/plain' }),
        'text/html': new Blob([html], { type: 'text/html' }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {
    // Fall back to plain TSV text copy
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(tsv);
      return true;
    }
  } catch {
    // Ignore clipboard failure
  }
  return false;
}

export function useTableSelection(
  grid: readonly (readonly string[])[],
): TableSelectionApi {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [copiedState, setCopiedState] = useState<CopiedState>(null);
  const [copiedDims, setCopiedDims] = useState<{ rows: number; cols: number } | null>(null);
  const [flashCopied, setFlashCopied] = useState<CopiedState>(null);

  const isDraggingRef = useRef(false);
  const didDragRef = useRef(false);
  const copiedTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);

  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 0;

  useEffect(() => {
    setSelection((prev) => {
      if (!prev) return prev;
      if (
        rowCount === 0 ||
        colCount === 0 ||
        prev.anchor.r >= rowCount ||
        prev.focus.r >= rowCount ||
        prev.anchor.c >= colCount ||
        prev.focus.c >= colCount
      ) {
        return null;
      }
      return prev;
    });
  }, [rowCount, colCount]);

  useEffect(() => {
    const handleWindowMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!selection) return;
    const handleOutsideMouseDown = (e: globalThis.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (e.target instanceof Node && !container.contains(e.target)) {
        setSelection(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
    };
  }, [selection]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  const bounds = useMemo<SelectionBounds | null>(() => {
    if (!selection || rowCount === 0 || colCount === 0) return null;
    const minR = Math.max(0, Math.min(selection.anchor.r, selection.focus.r));
    const maxR = Math.min(rowCount - 1, Math.max(selection.anchor.r, selection.focus.r));
    const minC = Math.max(0, Math.min(selection.anchor.c, selection.focus.c));
    const maxC = Math.min(colCount - 1, Math.max(selection.anchor.c, selection.focus.c));
    const rows = maxR - minR + 1;
    const cols = maxC - minC + 1;
    return { minR, maxR, minC, maxC, rows, cols, count: rows * cols };
  }, [selection, rowCount, colCount]);

  const triggerCopiedFeedback = useCallback((kind: 'selection' | 'all', rows: number, cols: number) => {
    setCopiedState(kind);
    setCopiedDims({ rows, cols });
    setFlashCopied(kind);

    if (copiedTimerRef.current !== null) window.clearTimeout(copiedTimerRef.current);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);

    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedState(null);
      copiedTimerRef.current = null;
    }, 1600);

    flashTimerRef.current = window.setTimeout(() => {
      setFlashCopied(null);
      flashTimerRef.current = null;
    }, 550);
  }, []);

  const copyAll = useCallback(async () => {
    if (rowCount === 0 || colCount === 0) return false;
    const ok = await writeExcelClipboard(grid, true);
    if (ok) triggerCopiedFeedback('all', rowCount, colCount);
    return ok;
  }, [grid, rowCount, colCount, triggerCopiedFeedback]);

  const copySelection = useCallback(async () => {
    if (!bounds) return copyAll();
    const slice = grid
      .slice(bounds.minR, bounds.maxR + 1)
      .map((row) => row.slice(bounds.minC, bounds.maxC + 1));
    const ok = await writeExcelClipboard(slice, bounds.minR === 0);
    if (ok) triggerCopiedFeedback('selection', bounds.rows, bounds.cols);
    return ok;
  }, [bounds, grid, copyAll, triggerCopiedFeedback]);

  const selectAll = useCallback(() => {
    if (rowCount === 0 || colCount === 0) return;
    setSelection({
      anchor: { r: 0, c: 0 },
      focus: { r: rowCount - 1, c: colCount - 1 },
    });
    containerRef.current?.focus({ preventScroll: true });
  }, [rowCount, colCount]);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const handleCellMouseDown = useCallback(
    (r: number, c: number, e: MouseEvent) => {
      if (e.button !== 0) return;
      if (e.target instanceof Element) {
        if (e.target.closest('input, select, textarea, a')) return;
        const btn = e.target.closest('button');
        if (btn && !btn.hasAttribute('data-sel-cell-btn')) return;
      }

      if (e.shiftKey) e.preventDefault();
      containerRef.current?.focus({ preventScroll: true });

      isDraggingRef.current = true;
      if (e.shiftKey) {
        didDragRef.current = true;
        setSelection((prev) =>
          prev
            ? { anchor: prev.anchor, focus: { r, c } }
            : { anchor: { r, c }, focus: { r, c } },
        );
      } else {
        didDragRef.current = false;
        setSelection({ anchor: { r, c }, focus: { r, c } });
      }
    },
    [],
  );

  const handleCellMouseEnter = useCallback((r: number, c: number) => {
    if (!isDraggingRef.current) return;
    setSelection((prev) => {
      if (!prev) return prev;
      if (prev.anchor.r !== r || prev.anchor.c !== c) {
        didDragRef.current = true;
      }
      if (prev.focus.r === r && prev.focus.c === c) return prev;
      return { anchor: prev.anchor, focus: { r, c } };
    });
  }, []);

  const consumeDidDrag = useCallback(() => {
    const dragged = didDragRef.current;
    didDragRef.current = false;
    return dragged;
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'c') {
        e.preventDefault();
        void copySelection();
      } else if (mod && key === 'a') {
        e.preventDefault();
        selectAll();
      } else if (e.key === 'Escape' && selection !== null) {
        e.preventDefault();
        clearSelection();
      }
    },
    [copySelection, selectAll, clearSelection, selection],
  );

  const getCellProps = useCallback(
    (r: number, c: number): CellSelectionProps => ({
      'data-copy-value': grid[r]?.[c] ?? '',
      'data-sel-cell': '1',
      onMouseDown: (e: MouseEvent) => handleCellMouseDown(r, c, e),
      onMouseEnter: () => handleCellMouseEnter(r, c),
    }),
    [grid, handleCellMouseDown, handleCellMouseEnter],
  );

  const getCellClassName = useCallback(
    (r: number, c: number, baseClass?: string): string => {
      const classes: string[] = [];
      if (baseClass) classes.push(baseClass);
      classes.push(dStyles.cellSelectable);

      if (
        bounds &&
        r >= bounds.minR &&
        r <= bounds.maxR &&
        c >= bounds.minC &&
        c <= bounds.maxC
      ) {
        classes.push(dStyles.cellSelected);
        if (r === bounds.minR) classes.push(dStyles.cellSelTop);
        if (r === bounds.maxR) classes.push(dStyles.cellSelBottom);
        if (c === bounds.minC) classes.push(dStyles.cellSelLeft);
        if (c === bounds.maxC) classes.push(dStyles.cellSelRight);
        if (selection && r === selection.anchor.r && c === selection.anchor.c) {
          classes.push(dStyles.cellSelAnchor);
        }
        if (r === bounds.maxR && c === bounds.maxC) {
          classes.push(dStyles.cellSelCorner);
        }
        if (flashCopied === 'selection') {
          classes.push(dStyles.cellCopiedFlash);
        }
      }

      if (flashCopied === 'all') {
        classes.push(dStyles.cellCopiedFlash);
      }

      return classes.join(' ');
    },
    [bounds, selection, flashCopied],
  );

  return {
    containerRef,
    selection,
    bounds,
    copiedState,
    copiedDims,
    rowCount,
    colCount,
    onKeyDown,
    getCellProps,
    getCellClassName,
    consumeDidDrag,
    copySelection,
    copyAll,
    selectAll,
    clearSelection,
  };
}

export interface TableSelectionBarProps {
  readonly selection: TableSelectionApi;
  readonly compact?: boolean;
  readonly compactHint?: boolean;
  readonly showIdleCopy?: boolean;
}

export function TableSelectionBar({
  selection,
  compact = false,
  compactHint = false,
  showIdleCopy = false,
}: TableSelectionBarProps) {
  const { t } = useI18n();
  const { bounds, copiedState, copiedDims, rowCount, colCount } = selection;

  if (rowCount === 0 || colCount === 0) return null;

  const isCopied = copiedState !== null;

  if (bounds) {
    const statusText =
      isCopied && copiedDims
        ? t('boolean.table.copiedRange', { rows: copiedDims.rows, cols: copiedDims.cols })
        : bounds.count === 1
          ? t('boolean.table.selectedSingle')
          : t('boolean.table.selectedRange', { rows: bounds.rows, cols: bounds.cols });

    const allSelected = bounds.rows === rowCount && bounds.cols === colCount;

    return createElement(
      'div',
      {
        className: [
          dStyles.selBar,
          isCopied ? dStyles.selBarCopied : dStyles.selBarActive,
          compact ? dStyles.selBarCompact : '',
        ]
          .filter(Boolean)
          .join(' '),
        'data-sel-bar': '1',
        'data-testid': 'table-selection-bar',
      },
      createElement('span', { className: dStyles.selBarStatus }, statusText),
      createElement(
        'div',
        { className: dStyles.selBarActions },
        createElement(
          'button',
          {
            type: 'button',
            className: [styles.btnPrimary, styles.btnSmall].join(' '),
            onClick: () => {
              void selection.copySelection();
            },
          },
          isCopied ? t('boolean.table.copiedExcel') : t('boolean.table.copyExcel'),
        ),
        !allSelected &&
          createElement(
            'button',
            {
              type: 'button',
              className: [styles.btnGhost, styles.btnSmall].join(' '),
              onClick: selection.selectAll,
            },
            t('boolean.table.selectAll'),
          ),
        createElement(
          'button',
          {
            type: 'button',
            className: [styles.btnGhost, styles.btnSmall].join(' '),
            onClick: selection.clearSelection,
          },
          t('boolean.table.clear'),
        ),
      ),
    );
  }

  if (copiedState === 'all') {
    return createElement(
      'div',
      {
        className: [
          dStyles.selBar,
          dStyles.selBarCopied,
          compact ? dStyles.selBarCompact : '',
        ]
          .filter(Boolean)
          .join(' '),
        'data-sel-bar': '1',
        'data-testid': 'table-selection-bar',
      },
      createElement(
        'span',
        { className: dStyles.selBarStatus },
        copiedDims
          ? t('boolean.table.copiedRange', { rows: copiedDims.rows, cols: copiedDims.cols })
          : t('boolean.table.copiedExcel'),
      ),
    );
  }

  if (compactHint) {
    if (!showIdleCopy) return null;
    return createElement(
      'div',
      {
        className: [dStyles.selBar, compact ? dStyles.selBarCompact : '']
          .filter(Boolean)
          .join(' '),
        'data-sel-bar': '1',
        'data-testid': 'table-selection-bar',
      },
      createElement(
        'button',
        {
          type: 'button',
          className: [styles.btnGhost, styles.btnSmall].join(' '),
          onClick: () => {
            void selection.copyAll();
          },
        },
        t('boolean.table.copyExcel'),
      ),
    );
  }

  return createElement(
    'div',
    {
      className: [dStyles.selBar, compact ? dStyles.selBarCompact : '']
        .filter(Boolean)
        .join(' '),
      'data-sel-bar': '1',
      'data-testid': 'table-selection-bar',
    },
    createElement('span', { className: dStyles.selBarHint }, t('boolean.table.dragHint')),
    showIdleCopy &&
      createElement(
        'button',
        {
          type: 'button',
          className: [styles.btnGhost, styles.btnSmall].join(' '),
          onClick: () => {
            void selection.copyAll();
          },
        },
        t('boolean.table.copyExcel'),
      ),
  );
}
