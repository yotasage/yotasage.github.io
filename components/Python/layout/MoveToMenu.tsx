// The "Move to…" menu of a dock panel (docs/python/notes-L1.md §8): opened from the group's Move button,
// a drag handle, Shift+F10 / the context-menu key or a right-click on a tab. The places come from
// moveTargets (DockLayout.tsx labels them). Page UI in a portal on <body> with position: fixed, so no
// group's overflow clips it and nothing a program draws covers it. Arrow keys, Home/End, Enter/Space,
// Esc (focus back on the opener), Tab and a click outside close it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

import type { DropTarget } from '../../../lib/python/layout/model';
import layoutStyles from '../../../styles/PythonLayout.module.css';

export interface MoveItem {
  readonly key: string;
  readonly label: string;
  readonly target: DropTarget;
}

interface Props {
  readonly anchor: HTMLElement;
  readonly label: string;
  readonly items: readonly MoveItem[];
  readonly onPick: (target: DropTarget) => void;
  /** Closes the menu; `restoreFocus` puts focus back on the opener (Esc). */
  readonly onClose: (restoreFocus: boolean) => void;
}

const MARGIN = 8;

export default function MoveToMenu({ anchor, label, items, onPick, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const a = anchor.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    let top = a.bottom + 4;
    if (top + m.height > vh - MARGIN && a.top - 4 - m.height >= MARGIN) top = a.top - 4 - m.height;
    const left = Math.max(MARGIN, Math.min(a.left, vw - m.width - MARGIN));
    setPos({ left, top: Math.max(MARGIN, top) });
  }, [anchor, items]);

  const buttons = useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
    [],
  );

  useEffect(() => {
    buttons()[0]?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (t instanceof Node && (menuRef.current?.contains(t) || anchor.contains(t))) return;
      onClose(false);
    };
    const onScrollOrResize = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      onClose(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [anchor, buttons, onClose]);

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = buttons();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (at + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
      return;
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onClose(true);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    list[next]?.focus();
  };

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className={[layoutStyles.menu, layoutStyles.moveMenu].join(' ')}
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
      onKeyDown={onKey}
      data-testid="python-move-menu"
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          tabIndex={-1}
          className={layoutStyles.menuItem}
          onClick={() => onPick(it.target)}
          data-move={it.key}
        >
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
