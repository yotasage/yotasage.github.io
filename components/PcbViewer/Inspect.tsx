import React from 'react';

import { Catalog, Description, HighlightTarget, NetEntry, PartEntry, sameTarget } from '../../lib/pcb/inspect';
import styles from '../../styles/PcbViewer.module.css';
import qrStyles from '../../styles/QrGen.module.css';

// What a click or tap is on, over the board: the description, stepping through what lies there, and highlighting its
// net or component.
export function InspectPanel({ desc, index, count, highlight, onStep, onClose, onHighlight }: {
  desc: Description;
  index: number;
  count: number;
  highlight: HighlightTarget | null;
  onStep: (by: number) => void;
  onClose: () => void;
  onHighlight: (t: HighlightTarget | null) => void;
}) {
  const netTarget: HighlightTarget | null = desc.net ? { kind: 'net', net: desc.net } : null;
  const compTarget: HighlightTarget | null = desc.component ? { kind: 'component', ...desc.component } : null;
  const toggle = (t: HighlightTarget) => onHighlight(sameTarget(highlight, t) ? null : t);
  return (
    <section className={styles.inspect} aria-label="What is here" aria-live="polite">
      <div className={styles.inspectHead}>
        <h3 className={styles.inspectTitle} title={desc.title}>{desc.title}</h3>
        {count > 1 && (
          <span className={styles.inspectStep}>
            <button type="button" className={styles.inspectButton} onClick={() => onStep(-1)} aria-label="Previous item here">‹</button>
            <span>{index + 1}/{count}</span>
            <button type="button" className={styles.inspectButton} onClick={() => onStep(1)} aria-label="Next item here">›</button>
          </span>
        )}
        <button type="button" className={styles.inspectButton} onClick={onClose} aria-label="Close">×</button>
      </div>
      <div className={styles.inspectBody}>
        <table className={styles.inspectTable}>
          <tbody>
            {desc.rows.map(([k, v], i) => (
              <tr key={`${k}-${i}`}>
                <th>{k}</th>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(netTarget || compTarget) && (
        <div className={styles.inspectActions}>
          {netTarget && (
            <button type="button" className={styles.toolButton} aria-pressed={sameTarget(highlight, netTarget)} onClick={() => toggle(netTarget)} title="Show this net on every layer">
              Highlight net {desc.net}
            </button>
          )}
          {compTarget && (
            <button type="button" className={styles.toolButton} aria-pressed={sameTarget(highlight, compTarget)} onClick={() => toggle(compTarget)} title="Show this component's pads, graphics and text">
              Highlight {desc.component.ref}
            </button>
          )}
        </div>
      )}
      {count > 1 && (
        <p className={styles.inspectHint}>
          <span className={styles.mouseHint}>{`Click the same spot again for the next of the ${count} things here.`}</span>
          <span className={styles.touchHint}>{`Tap the same spot again for the next of the ${count} things here.`}</span>
        </p>
      )}
    </section>
  );
}

// How many entries a list shows at most; typing narrows it.
const LIMIT = 300;

// How well a name matches the search: 0 the same, 1 starts with it, 2 contains it; other texts that contain it 3;
// -1 no match.
function rank(q: string, name: string, ...others: (string | undefined)[]): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return others.some((t) => t && t.toLowerCase().includes(q)) ? 3 : -1;
}

// The entries that match, the best matches first (the list order within each).
function search<T>(list: T[], q: string, score: (e: T) => number): T[] {
  if (!q) return list;
  const scored = list.map((e) => ({ e, s: score(e) })).filter((x) => x.s >= 0);
  return scored.sort((a, b) => a.s - b.s).map((x) => x.e);
}

export function targetLabel(t: HighlightTarget): string {
  return t.kind === 'net' ? `net ${t.net}` : t.ref;
}

// Components and nets of the board, searchable; picking one highlights it and zooms to it.
export function PartsCard({ catalog, highlight, onPick, onClear, fromX2 }: {
  catalog: Catalog;
  highlight: HighlightTarget | null;
  onPick: (t: HighlightTarget) => void;
  onClear: () => void;
  // The lists come from the X2 attributes of Gerber files.
  fromX2: boolean;
}) {
  const [tab, setTab] = React.useState<'parts' | 'nets'>(catalog.parts.length ? 'parts' : 'nets');
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const parts = React.useMemo(() => search(catalog.parts, q, (p) => rank(q, p.ref, p.value, p.footprint)), [catalog, q]);
  const nets = React.useMemo(() => search(catalog.nets, q, (n) => rank(q, n.name)), [catalog, q]);
  const list: (PartEntry | NetEntry)[] = tab === 'parts' ? parts : nets;
  const partTarget = (p: PartEntry): HighlightTarget => ({ kind: 'component', ref: p.ref, ...(p.index !== undefined ? { index: p.index } : {}) });
  const isOn = (t: HighlightTarget) => sameTarget(highlight, t);
  return (
    <>
      <div className={styles.segmented} role="group" aria-label="List">
        <button type="button" className={styles.toolButton} aria-pressed={tab === 'parts'} onClick={() => setTab('parts')}>
          Components ({q ? `${parts.length.toLocaleString('en-US')} of ` : ''}{catalog.parts.length.toLocaleString('en-US')})
        </button>
        <button type="button" className={styles.toolButton} aria-pressed={tab === 'nets'} onClick={() => setTab('nets')}>
          Nets ({q ? `${nets.length.toLocaleString('en-US')} of ` : ''}{catalog.nets.length.toLocaleString('en-US')})
        </button>
      </div>
      <input
        className={[qrStyles.input, styles.search].join(' ')}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === 'parts' ? 'Designator, value or footprint' : 'Net name'}
        aria-label={tab === 'parts' ? 'Search components' : 'Search nets'}
      />
      {list.length ? (
        <ul className={styles.partList} aria-label={tab === 'parts' ? 'Components' : 'Nets'}>
          {list.slice(0, LIMIT).map((e) => {
            if ('ref' in e) {
              const t = partTarget(e);
              const meta = [e.value, e.footprint?.replace(/^[^:]*:/, ''), e.side === 'bottom' ? 'bottom' : undefined].filter(Boolean).join(' · ');
              return (
                <li key={e.key}>
                  <button type="button" className={[styles.partItem, isOn(t) ? styles.partItemOn : ''].join(' ')} aria-pressed={isOn(t)} onClick={() => onPick(t)} title={e.footprint}>
                    <span className={styles.partName}>{e.ref}</span>
                    <span className={styles.partMeta}>{meta || (e.pads ? `${e.pads} pads` : '')}</span>
                  </button>
                </li>
              );
            }
            const t: HighlightTarget = { kind: 'net', net: e.name };
            return (
              <li key={e.name}>
                <button type="button" className={[styles.partItem, isOn(t) ? styles.partItemOn : ''].join(' ')} aria-pressed={isOn(t)} onClick={() => onPick(t)}>
                  <span className={styles.partName}>{e.name}</span>
                  <span className={styles.partMeta}>{e.pads === 1 ? '1 pad' : `${e.pads.toLocaleString('en-US')} pads`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={qrStyles.help}>{q ? 'Nothing matches.' : tab === 'parts' ? 'No components.' : 'No nets.'}</p>
      )}
      {list.length > LIMIT && <p className={styles.detailNote}>{`The first ${LIMIT} of ${list.length.toLocaleString('en-US')}; type to narrow the list.`}</p>}
      {highlight && (
        <div className={qrStyles.buttonRow}>
          <button type="button" className={qrStyles.buttonSmall} onClick={onClear}>Clear the highlight</button>
        </div>
      )}
      <p className={qrStyles.help}>
        Pick one to highlight it on every layer and zoom to it.{fromX2 ? ' The lists come from the X2 attributes of the Gerber files.' : ''}
      </p>
    </>
  );
}
