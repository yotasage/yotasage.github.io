import React, { useCallback, useRef } from 'react';

import styles from '../../styles/DesignSystem.module.css';

export interface PillTabItem<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface PillTabsProps<T extends string = string> {
  items: readonly PillTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  size?: 'sm' | 'md';
  variant?: 'segmented' | 'subtle';
  className?: string;
  idPrefix?: string;
  /** Extra attributes and handlers for each tab button (drag and drop, context menu). Its onKeyDown runs first; calling preventDefault there skips the arrow-key handling. */
  tabProps?: (id: T, index: number) => PillTabExtraProps;
}

export type PillTabExtraProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type' | 'role' | 'disabled'> & {
  [data: `data-${string}`]: string | undefined;
};

export default function PillTabs<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  variant = 'segmented',
  className,
  idPrefix,
  tabProps,
}: PillTabsProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const enabledIndices = items
        .map((item, idx) => (item.disabled ? -1 : idx))
        .filter((idx) => idx !== -1);
      if (enabledIndices.length <= 1) return;

      const pos = enabledIndices.indexOf(index);
      if (pos === -1) return;

      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight') {
        nextIndex = enabledIndices[(pos + 1) % enabledIndices.length];
      } else if (event.key === 'ArrowLeft') {
        nextIndex = enabledIndices[(pos - 1 + enabledIndices.length) % enabledIndices.length];
      } else if (event.key === 'Home') {
        nextIndex = enabledIndices[0];
      } else if (event.key === 'End') {
        nextIndex = enabledIndices[enabledIndices.length - 1];
      }

      if (nextIndex === null) return;
      event.preventDefault();
      const target = items[nextIndex];
      if (!target) return;
      onChange(target.id);
      buttonRefs.current[nextIndex]?.focus();
    },
    [items, onChange],
  );

  const listClass = [
    styles.pillTabs,
    variant === 'subtle' ? styles.pillTabsSubtle : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div role="tablist" aria-label={ariaLabel} className={listClass}>
      {items.map((item, index) => {
        const active = item.id === value;
        const tabClass = [
          styles.pillTab,
          size === 'sm' ? styles.pillTabSm : '',
          active ? styles.pillTabActive : '',
          active && variant === 'subtle' ? styles.pillTabSubtleActive : '',
        ]
          .filter(Boolean)
          .join(' ');
        const extra = tabProps?.(item.id, index);

        return (
          <button
            key={item.id}
            {...extra}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={idPrefix ? `${idPrefix}-panel-${item.id}` : undefined}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            className={extra?.className ? `${tabClass} ${extra.className}` : tabClass}
            onClick={() => {
              if (!item.disabled && item.id !== value) onChange(item.id);
            }}
            onKeyDown={(e) => {
              extra?.onKeyDown?.(e);
              if (!e.defaultPrevented) handleKeyDown(e, index);
            }}
          >
            {item.icon && <span className={styles.pillTabIcon} aria-hidden="true">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge !== '' && (
              <span className={styles.pillTabBadge}>{item.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
