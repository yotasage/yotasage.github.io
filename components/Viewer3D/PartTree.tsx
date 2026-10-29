import React from 'react';
import type { Object3D } from 'three';

import { isHelper } from '../../lib/viewer3d/stats';
import styles from '../../styles/Viewer3D.module.css';

export interface TreeNode {
  object: Object3D;
  name: string;
  children: TreeNode[];
}

// Large assemblies are shown in parts, so the page stays quick.
const MAX_CHILDREN = 300;

const TYPE_NAMES: Record<string, string> = {
  Mesh: 'Mesh', SkinnedMesh: 'Mesh', InstancedMesh: 'Mesh', Points: 'Points', Line: 'Line', LineSegments: 'Lines', LineLoop: 'Line',
};

const isDrawable = (o: Object3D) => o.type in TYPE_NAMES;

// The parts of a model as a tree. Bones, lights, cameras and empty groups are left out, and an unnamed group with a
// single entry is shown as that entry.
export function buildTree(object: Object3D): TreeNode[] {
  const out: TreeNode[] = [];
  for (const child of object.children) {
    if (isHelper(child) || child.type === 'Bone' || 'isLight' in child || 'isCamera' in child) continue;
    const children = buildTree(child);
    const drawable = isDrawable(child);
    if (!drawable && !children.length) continue;
    if (!drawable && !child.name && children.length === 1) {
      out.push(children[0]);
      continue;
    }
    out.push({ object: child, name: child.name || TYPE_NAMES[child.type] || 'Group', children });
  }
  return out;
}

export function countParts(nodes: TreeNode[]): number {
  return nodes.reduce((n, node) => n + (isDrawable(node.object) ? 1 : 0) + countParts(node.children), 0);
}

interface TreeContext {
  expanded: Set<string>;
  selected: Object3D | null;
  selectedRow: React.RefObject<HTMLDivElement>;
  toggleOpen: (o: Object3D) => void;
  toggleVisible: (o: Object3D) => void;
  select: (o: Object3D) => void;
}

function Row({ node, depth, ctx }: { node: TreeNode; depth: number; ctx: TreeContext }) {
  const open = ctx.expanded.has(node.object.uuid);
  const selected = ctx.selected === node.object;
  const hidden = node.children.length - MAX_CHILDREN;
  return (
    <li>
      <div
        ref={selected ? ctx.selectedRow : undefined}
        className={[styles.treeRow, selected ? styles.treeSelected : '', node.object.visible ? '' : styles.treeHidden].join(' ')}
        style={{ paddingLeft: `${depth * 0.9}rem` }}
      >
        {node.children.length ? (
          <button type="button" className={styles.treeToggle} aria-expanded={open} aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`} onClick={() => ctx.toggleOpen(node.object)}>
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className={styles.treeToggle} />
        )}
        <input type="checkbox" checked={node.object.visible} aria-label={`Show ${node.name}`} onChange={() => ctx.toggleVisible(node.object)} />
        <button type="button" className={styles.treeName} title={node.name} onClick={() => ctx.select(node.object)}>{node.name}</button>
      </div>
      {open && node.children.length > 0 && (
        <ul>
          {node.children.slice(0, MAX_CHILDREN).map((child) => <Row key={child.object.uuid} node={child} depth={depth + 1} ctx={ctx} />)}
          {hidden > 0 && <li className={styles.treeMore} style={{ paddingLeft: `${(depth + 1) * 0.9 + 1.4}rem` }}>and {hidden} more</li>}
        </ul>
      )}
    </li>
  );
}

export default function PartTree({ nodes, selected, onSelect, onToggleVisible }: {
  nodes: TreeNode[];
  selected: Object3D | null;
  onSelect: (o: Object3D) => void;
  onToggleVisible: (o: Object3D) => void;
}) {
  // The first two levels start open.
  const [expanded, setExpanded] = React.useState(() => new Set(nodes.flatMap((n) => [n, ...n.children]).map((n) => n.object.uuid)));
  const selectedRow = React.useRef<HTMLDivElement>(null);
  const list = React.useRef<HTMLUListElement>(null);

  // A part picked in the view is shown in the tree: its groups open, and the list scrolls to it.
  React.useEffect(() => {
    if (!selected) return;
    const ancestors: string[] = [];
    for (let o = selected.parent; o; o = o.parent) ancestors.push(o.uuid);
    setExpanded((prev) => (ancestors.every((id) => prev.has(id)) ? prev : new Set([...prev, ...ancestors])));
  }, [selected]);
  // Scrolls the list only; scrollIntoView would also scroll the page away from the view.
  React.useEffect(() => {
    const row = selectedRow.current;
    const box = list.current;
    if (!row || !box) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [selected, expanded]);

  const ctx: TreeContext = {
    expanded,
    selected,
    selectedRow,
    toggleOpen: (o) => setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(o.uuid)) next.add(o.uuid);
      return next;
    }),
    toggleVisible: onToggleVisible,
    select: onSelect,
  };

  return (
    <ul ref={list} className={styles.tree} aria-label="Parts">
      {nodes.slice(0, MAX_CHILDREN).map((node) => <Row key={node.object.uuid} node={node} depth={0} ctx={ctx} />)}
    </ul>
  );
}
