// The "Layout" menu button of the playground's toolbar (desktop only): the six presets and Custom as
// menuitemradio items, then "Reset layout". Arrow keys, Home/End, Enter/Space, Esc (focus back on the
// button), and a click outside closes it.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { PRESET_IDS } from '../../../lib/python/layout/presets';
import type { LayoutMode } from '../../../lib/python/layout/storage';
import { useI18n } from '../../../lib/ui/i18n';
import pyStyles from '../../../styles/Python.module.css';
import layoutStyles from '../../../styles/PythonLayout.module.css';

interface Props {
  readonly mode: LayoutMode;
  readonly hasCustom: boolean;
  readonly onChoose: (mode: LayoutMode) => void;
  readonly onReset: () => void;
}

const MODES: readonly LayoutMode[] = [...PRESET_IDS, 'custom'];
const MODE_KEYS = {
  classic: 'python.layoutPreset.classic',
  consoleBelow: 'python.layoutPreset.consoleBelow',
  wideOutput: 'python.layoutPreset.wideOutput',
  sideBySide: 'python.layoutPreset.sideBySide',
  editorFocus: 'python.layoutPreset.editorFocus',
  displayFocus: 'python.layoutPreset.displayFocus',
  custom: 'python.layoutPreset.custom',
} as const satisfies Record<LayoutMode, string>;

export default function LayoutMenu({ mode, hasCustom, onChoose, onReset }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items = useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? []),
    [],
  );

  const close = useCallback((focusButton: boolean) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const checked = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]');
    (checked ?? items()[0])?.focus();
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, items]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (at + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    } else if (e.key === 'Tab') {
      close(false);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    list[next]?.focus();
  };

  return (
    <div ref={wrapRef} className={layoutStyles.menuWrap}>
      <button
        ref={buttonRef}
        type="button"
        className={pyStyles.secondaryBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('python.layoutButtonTitle')}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        data-testid="python-layout-btn"
      >
        {t('python.layoutButton')} <span aria-hidden="true">&#9662;</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('python.layoutMenuAria')}
          className={layoutStyles.menu}
          onKeyDown={onMenuKey}
          data-testid="python-layout-menu"
        >
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="menuitemradio"
              aria-checked={mode === m}
              disabled={m === 'custom' && !hasCustom}
              tabIndex={-1}
              className={layoutStyles.menuItem}
              onClick={() => {
                onChoose(m);
                close(true);
              }}
              data-testid={`python-layout-${m}`}
            >
              <span className={layoutStyles.menuCheck} aria-hidden="true">
                {mode === m ? '✓' : ''}
              </span>
              {t(MODE_KEYS[m])}
            </button>
          ))}
          <div role="separator" className={layoutStyles.menuSep} />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={layoutStyles.menuItem}
            onClick={() => {
              onReset();
              close(true);
            }}
            data-testid="python-layout-reset"
          >
            <span className={layoutStyles.menuCheck} aria-hidden="true" />
            {t('python.layoutReset')}
          </button>
        </div>
      )}
    </div>
  );
}
