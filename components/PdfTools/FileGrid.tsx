import React from 'react';

import { moveItem } from '../../lib/pdf/files';
import styles from '../../styles/PdfTools.module.css';

// A grid of cards that can be reordered by dragging, or with the arrow buttons on each card.
export function FileGrid<T extends { id: string }>({ items, onChange, sortable = true, renderCard }: {
  items: T[];
  onChange: (items: T[]) => void;
  sortable?: boolean;
  renderCard: (item: T, index: number, controls: CardControls) => React.ReactNode;
}) {
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [target, setTarget] = React.useState<{ index: number; after: boolean } | null>(null);
  // Selecting text in a field on a card must not drag the card.
  const pressedOnControl = React.useRef(false);

  const controls = (index: number): CardControls => ({
    sortable,
    canMoveBack: index > 0,
    canMoveForward: index < items.length - 1,
    moveBack: () => onChange(moveItem(items, index, index - 1)),
    moveForward: () => onChange(moveItem(items, index, index + 1)),
    remove: () => onChange(items.filter((_, i) => i !== index)),
  });

  const finish = () => {
    setDragIndex(null);
    setTarget(null);
  };

  return (
    <ul className={styles.fileGrid}>
      {items.map((item, index) => {
        const dropClass = target?.index === index && dragIndex !== null && dragIndex !== index ? (target.after ? styles.dropAfter : styles.dropBefore) : '';
        return (
          <li
            key={item.id}
            className={[styles.fileCard, dragIndex === index ? styles.dragging : '', dropClass].join(' ')}
            draggable={sortable}
            onPointerDown={(e) => {
              pressedOnControl.current = !!(e.target as HTMLElement).closest('input, textarea, select, button');
            }}
            onDragStart={(e) => {
              if (pressedOnControl.current) {
                e.preventDefault();
                return;
              }
              setDragIndex(index);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', item.id);
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              setTarget({ index, after: e.clientX > rect.left + rect.width / 2 });
            }}
            onDrop={(e) => {
              if (dragIndex === null || !target) return;
              e.preventDefault();
              let to = target.index + (target.after ? 1 : 0);
              if (dragIndex < to) to -= 1;
              onChange(moveItem(items, dragIndex, Math.min(to, items.length - 1)));
              finish();
            }}
            onDragEnd={finish}
          >
            {renderCard(item, index, controls(index))}
          </li>
        );
      })}
    </ul>
  );
}

export interface CardControls {
  sortable: boolean;
  canMoveBack: boolean;
  canMoveForward: boolean;
  moveBack: () => void;
  moveForward: () => void;
  remove: () => void;
}

export function FileCard({ index, thumb, thumbRotation = 0, name, meta, error, controls, actions, children }: {
  index?: number;
  thumb: string | null;
  thumbRotation?: number;
  name: string;
  meta?: React.ReactNode;
  error?: string | null;
  controls: CardControls;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className={styles.thumb}>
        {thumb
          ? <img
              src={thumb}
              alt=""
              draggable={false}
              className={thumbRotation % 180 ? styles.sideways : undefined}
              style={thumbRotation ? { transform: `rotate(${thumbRotation}deg)` } : undefined}
            />
          : <span className={styles.thumbPlaceholder}>{error ? 'No preview' : 'Loading…'}</span>}
      </div>
      {index !== undefined && <span className={styles.badge}>{index + 1}</span>}
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconButton} title="Remove" aria-label="Remove" onClick={controls.remove}>&times;</button>
      </div>
      <div className={styles.fileName} title={name}>{name}</div>
      {meta && <div className={styles.fileMeta}>{meta}</div>}
      {error && <div className={styles.fileError}>{error}</div>}
      {children}
      {(controls.sortable || actions) && (
        <div className={styles.cardFooter}>
          {controls.sortable && (
            <>
              <button type="button" className={styles.iconButton} title="Move earlier" aria-label="Move earlier" disabled={!controls.canMoveBack} onClick={controls.moveBack}>&larr;</button>
              <button type="button" className={styles.iconButton} title="Move later" aria-label="Move later" disabled={!controls.canMoveForward} onClick={controls.moveForward}>&rarr;</button>
            </>
          )}
          <span className={styles.toolbarSpacer} />
          {actions}
        </div>
      )}
    </>
  );
}
