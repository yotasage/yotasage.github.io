import React from 'react';

import { errorMessage, moveItem } from '../../lib/pdf/files';
import { parsePageRanges } from '../../lib/pdf/merge';
import { formatPageRanges } from '../../lib/pdf/pages';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import styles from '../../styles/PdfTools.module.css';

export interface PageGridItem {
  id: string;
  // Null for synthetic blank pages (e.g. inserted in Organize).
  pool: PdfThumbPool | null;
  // Zero-based index inside `pool`, or -1 for a blank page.
  pageIndex: number;
  // Additional clockwise degrees (0, 90, 180, 270) for preview rotation.
  rotation?: number;
  label: string;
  meta?: string;
  sourceTag?: { label: string; color: string };
  blankAspect?: number;
}

interface ThumbObserver {
  observe: (el: Element, onVisible: (visible: boolean) => void) => () => void;
}

function useThumbObserver(): ThumbObserver {
  const callbacks = React.useRef(new Map<Element, (visible: boolean) => void>());
  const observer = React.useRef<IntersectionObserver | null>(null);

  React.useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          callbacks.current.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin: '320px 0px' },
    );
    observer.current = obs;
    for (const el of callbacks.current.keys()) obs.observe(el);
    return () => {
      obs.disconnect();
      observer.current = null;
    };
  }, []);

  return React.useMemo<ThumbObserver>(() => ({
    observe(el, onVisible) {
      callbacks.current.set(el, onVisible);
      if (observer.current) {
        observer.current.observe(el);
      } else {
        onVisible(true);
      }
      return () => {
        callbacks.current.delete(el);
        observer.current?.unobserve(el);
      };
    },
  }), []);
}

const PageThumb = React.memo(function PageThumb({
  pool,
  pageIndex,
  rotation = 0,
  blankAspect,
  observer,
}: {
  pool: PdfThumbPool | null;
  pageIndex: number;
  rotation?: number;
  blankAspect?: number;
  observer: ThumbObserver;
}) {
  const boxRef = React.useRef<HTMLDivElement>(null);
  const visibleRef = React.useRef(false);
  const [url, setUrl] = React.useState<string | null>(() => (pool ? pool.getCached(pageIndex) : null));

  React.useEffect(() => {
    if (!pool || pageIndex < 0) {
      setUrl(null);
      return;
    }
    setUrl(pool.getCached(pageIndex));
    const unsub = pool.subscribe(pageIndex, (nextUrl) => {
      setUrl(nextUrl);
      if (nextUrl === null && visibleRef.current) {
        void pool.request(pageIndex, () => visibleRef.current);
      }
    });
    const el = boxRef.current;
    const unobs = el
      ? observer.observe(el, (vis) => {
          visibleRef.current = vis;
          if (vis && !pool.getCached(pageIndex)) {
            void pool.request(pageIndex, () => visibleRef.current);
          }
        })
      : () => undefined;
    return () => {
      visibleRef.current = false;
      unobs();
      unsub();
    };
  }, [pool, pageIndex, observer]);

  if (!pool || pageIndex < 0) {
    const aspect = blankAspect && blankAspect > 0 ? blankAspect : 210 / 297;
    const landscape = (rotation % 180 !== 0) ? aspect < 1 : aspect > 1;
    return (
      <div ref={boxRef} className={styles.thumb}>
        <div
          className={styles.blankPage}
          style={landscape ? { width: '158px', height: '112px' } : undefined}
        >
          Blank page
        </div>
      </div>
    );
  }

  return (
    <div ref={boxRef} className={styles.thumb}>
      {url
        ? (
          <img
            src={url}
            alt=""
            draggable={false}
            className={rotation % 180 ? styles.sideways : undefined}
            style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
          />
        )
        : <span className={styles.thumbPlaceholder}>Page {pageIndex + 1}</span>}
    </div>
  );
});

export interface PageReorderControls {
  canMoveBack: boolean;
  canMoveForward: boolean;
  moveBack: () => void;
  moveForward: () => void;
}

export function PageGrid<T extends PageGridItem>({
  items,
  onReorder,
  selectedIds,
  onSelectChange,
  selectionStyle = 'select',
  splitAfter,
  renderBadgeExtra,
  renderActions,
}: {
  items: T[];
  onReorder?: (next: T[]) => void;
  selectedIds?: Set<string>;
  onSelectChange?: (next: Set<string>) => void;
  selectionStyle?: 'select' | 'remove';
  splitAfter?: Set<number>;
  renderBadgeExtra?: (item: T, index: number) => React.ReactNode;
  renderActions?: (item: T, index: number, reorder?: PageReorderControls) => React.ReactNode;
}) {
  const observer = useThumbObserver();
  const listRef = React.useRef<HTMLUListElement>(null);
  const anchorRef = React.useRef<number | null>(null);
  const suppressClickRef = React.useRef(false);
  const itemsRef = React.useRef(items);
  itemsRef.current = items;
  const onReorderRef = React.useRef(onReorder);
  onReorderRef.current = onReorder;

  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [target, setTarget] = React.useState<{ index: number; after: boolean } | null>(null);
  const dragStateRef = React.useRef<{
    pointerId: number;
    fromIndex: number;
    startX: number;
    startY: number;
    active: boolean;
    fromHandle: boolean;
    target: { index: number; after: boolean } | null;
  } | null>(null);

  const selectable = !!selectedIds && !!onSelectChange;
  const sortable = !!onReorder;

  // Pointer-event reordering: works immediately for mouse drags on the card and touch/pen drags on
  // the drag handle without hijacking vertical touch scrolling on mobile.
  React.useEffect(() => {
    if (!sortable) return;

    function hitTest(clientX: number, clientY: number): { index: number; after: boolean } | null {
      const list = listRef.current;
      if (!list) return null;
      const children = Array.from(list.children) as HTMLElement[];
      let best: { index: number; after: boolean; dist: number } | null = null;
      for (let i = 0; i < children.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          return { index: i, after: clientX > rect.left + rect.width / 2 };
        }
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(clientX - cx, clientY - cy);
        if (!best || dist < best.dist) {
          best = { index: i, after: clientX > cx, dist };
        }
      }
      return best ? { index: best.index, after: best.after } : null;
    }

    function onMove(e: PointerEvent) {
      const st = dragStateRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      const dist = Math.hypot(e.clientX - st.startX, e.clientY - st.startY);
      if (!st.active) {
        const threshold = st.fromHandle ? 4 : 8;
        if (dist < threshold) return;
        st.active = true;
        setDragIndex(st.fromIndex);
      }
      e.preventDefault();
      const hit = hitTest(e.clientX, e.clientY);
      st.target = hit;
      setTarget(hit);
    }

    function onUp(e: PointerEvent) {
      const st = dragStateRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      dragStateRef.current = null;
      if (st.active) {
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        if (st.target && onReorderRef.current) {
          const list = itemsRef.current;
          let to = st.target.index + (st.target.after ? 1 : 0);
          if (st.fromIndex < to) to -= 1;
          to = Math.max(0, Math.min(to, list.length - 1));
          if (to !== st.fromIndex) onReorderRef.current(moveItem(list, st.fromIndex, to));
        }
      }
      setDragIndex(null);
      setTarget(null);
    }

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [sortable]);

  function startPointer(e: React.PointerEvent, index: number, fromHandle: boolean) {
    if (!sortable) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (!fromHandle) {
      // Touch dragging starts only from the dedicated handle so normal vertical scrolling works.
      if (e.pointerType !== 'mouse') return;
      if ((e.target as HTMLElement).closest('button, input, textarea, select, a')) return;
    } else {
      e.stopPropagation();
    }
    dragStateRef.current = {
      pointerId: e.pointerId,
      fromIndex: index,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      fromHandle,
      target: null,
    };
  }

  function handleCardClick(e: React.MouseEvent, item: T, index: number) {
    if (!selectable || !selectedIds || !onSelectChange) return;
    if (suppressClickRef.current) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a')) return;

    const next = new Set(selectedIds);
    if (e.shiftKey && anchorRef.current !== null && anchorRef.current < items.length) {
      const from = Math.min(anchorRef.current, index);
      const to = Math.max(anchorRef.current, index);
      const shouldSelect = !selectedIds.has(item.id);
      for (let i = from; i <= to; i++) {
        if (shouldSelect) next.add(items[i].id);
        else next.delete(items[i].id);
      }
    } else {
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      anchorRef.current = index;
    }
    onSelectChange(next);
  }

  return (
    <ul ref={listRef} className={styles.fileGrid}>
      {items.map((item, index) => {
        const isSelected = selectedIds?.has(item.id) ?? false;
        const dropClass = target?.index === index && dragIndex !== null && dragIndex !== index
          ? (target.after ? styles.dropAfter : styles.dropBefore)
          : '';
        const selectedClass = isSelected
          ? (selectionStyle === 'remove' ? styles.pageCardRemove : styles.pageCardSelected)
          : '';
        const splitClass = splitAfter?.has(index) ? styles.pageCardSplitAfter : '';
        const reorderControls: PageReorderControls | undefined = sortable
          ? {
              canMoveBack: index > 0,
              canMoveForward: index < items.length - 1,
              moveBack: () => onReorder!(moveItem(items, index, index - 1)),
              moveForward: () => onReorder!(moveItem(items, index, index + 1)),
            }
          : undefined;
        const actions = renderActions?.(item, index, reorderControls);

        return (
          <li
            key={item.id}
            data-card-index={index}
            aria-selected={selectable ? isSelected : undefined}
            className={[
              styles.pageCard,
              selectable ? styles.pageCardSelectable : '',
              sortable ? styles.pageCardSortable : '',
              selectedClass,
              dragIndex === index ? styles.dragging : '',
              dropClass,
              splitClass,
            ].join(' ')}
            onPointerDown={(e) => startPointer(e, index, false)}
            onClick={(e) => handleCardClick(e, item, index)}
          >
            <PageThumb
              pool={item.pool}
              pageIndex={item.pageIndex}
              rotation={item.rotation}
              blankAspect={item.blankAspect}
              observer={observer}
            />
            <span className={isSelected && selectionStyle === 'remove' ? styles.badgeRemove : isSelected ? styles.badge : styles.badgeMuted}>
              {index + 1}
            </span>
            {renderBadgeExtra?.(item, index)}
            <div className={styles.sourceRow}>
              {item.sourceTag && (
                <span
                  className={styles.sourceDot}
                  style={{ backgroundColor: item.sourceTag.color }}
                  title={item.sourceTag.label}
                />
              )}
              <div className={styles.fileName} title={item.label}>{item.label}</div>
            </div>
            {item.meta && <div className={styles.fileMeta}>{item.meta}</div>}
            {(sortable || actions) && (
              <div className={styles.cardFooter}>
                {sortable && reorderControls && (
                  <>
                    <button
                      type="button"
                      className={styles.dragHandle}
                      title="Drag to reorder"
                      aria-label={`Drag ${item.label} to reorder`}
                      onPointerDown={(e) => startPointer(e, index, true)}
                    >
                      &#x283F;
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title="Move earlier"
                      aria-label="Move earlier"
                      disabled={!reorderControls.canMoveBack}
                      onClick={reorderControls.moveBack}
                    >
                      &larr;
                    </button>
                    <button
                      type="button"
                      className={styles.iconButton}
                      title="Move later"
                      aria-label="Move later"
                      disabled={!reorderControls.canMoveForward}
                      onClick={reorderControls.moveForward}
                    >
                      &rarr;
                    </button>
                  </>
                )}
                <span className={styles.toolbarSpacer} />
                {actions}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// Reusable bulk selection bar (All, None, Invert, Odd, Even + synced range input) for page grids.
export function PageSelectionBar<T extends { id: string }>({
  items,
  selectedIds,
  onChange,
  rangePlaceholder = 'Ranges, e.g. 1-3, 5, 8-',
}: {
  items: T[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
  rangePlaceholder?: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [rangeError, setRangeError] = React.useState<string | null>(null);

  const syncedText = React.useMemo(() => {
    const indices: number[] = [];
    items.forEach((it, i) => {
      if (selectedIds.has(it.id)) indices.push(i);
    });
    return formatPageRanges(indices);
  }, [items, selectedIds]);

  const selectBy = (pred: (index: number, item: T) => boolean) => {
    setRangeError(null);
    const next = new Set<string>();
    items.forEach((it, i) => {
      if (pred(i, it)) next.add(it.id);
    });
    onChange(next);
  };

  function handleRangeInput(val: string) {
    setDraft(val);
    if (!val.trim()) {
      setRangeError(null);
      onChange(new Set());
      return;
    }
    try {
      const indices = parsePageRanges(val, items.length);
      setRangeError(null);
      onChange(new Set(indices.map((i) => items[i].id)));
    } catch (e) {
      setRangeError(errorMessage(e));
    }
  }

  return (
    <div className={styles.selectionBar}>
      <div className={styles.selectionButtons}>
        <button type="button" className={styles.buttonSmall} onClick={() => selectBy(() => true)}>All</button>
        <button type="button" className={styles.buttonSmall} onClick={() => selectBy(() => false)}>None</button>
        <button type="button" className={styles.buttonSmall} onClick={() => selectBy((_, it) => !selectedIds.has(it.id))}>Invert</button>
        <button type="button" className={styles.buttonSmall} onClick={() => selectBy((i) => i % 2 === 0)}>Odd</button>
        <button type="button" className={styles.buttonSmall} onClick={() => selectBy((i) => i % 2 === 1)}>Even</button>
      </div>
      <div style={{ flex: '1 1 180px', minWidth: 160 }}>
        <input
          className={styles.rangeInput}
          placeholder={rangePlaceholder}
          aria-label="Page ranges"
          value={editing ? draft : syncedText}
          onFocus={() => {
            setEditing(true);
            setDraft(syncedText);
          }}
          onBlur={() => {
            setEditing(false);
            setRangeError(null);
          }}
          onChange={(e) => handleRangeInput(e.target.value)}
        />
        {rangeError && <div className={styles.fileError}>{rangeError}</div>}
      </div>
    </div>
  );
}
