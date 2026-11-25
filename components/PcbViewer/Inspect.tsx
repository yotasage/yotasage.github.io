import React from 'react';

import { Catalog, Description, HighlightTarget, NetEntry, PartEntry, sameTarget } from '../../lib/pcb/inspect';
import { Locale, translate, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PcbViewer.module.css';
import fieldStyles from '../../styles/Fields.module.css';

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
  const { t } = useI18n();
  const netTarget: HighlightTarget | null = desc.net ? { kind: 'net', net: desc.net } : null;
  const compTarget: HighlightTarget | null = desc.component ? { kind: 'component', ...desc.component } : null;
  const toggle = (target: HighlightTarget) => onHighlight(sameTarget(highlight, target) ? null : target);
  return (
    <section className={styles.inspect} aria-label={t('pcb.insp.aria')} aria-live="polite">
      <div className={styles.inspectHead}>
        <h3 className={styles.inspectTitle} title={desc.title}>{desc.title}</h3>
        {count > 1 && (
          <span className={styles.inspectStep}>
            <button type="button" className={styles.inspectButton} onClick={() => onStep(-1)} aria-label={t('pcb.insp.prev')}>‹</button>
            <span>{index + 1}/{count}</span>
            <button type="button" className={styles.inspectButton} onClick={() => onStep(1)} aria-label={t('pcb.insp.next')}>›</button>
          </span>
        )}
        <button type="button" className={styles.inspectButton} onClick={onClose} aria-label={t('pcb.insp.close')}>×</button>
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
            <button type="button" className={styles.toolButton} aria-pressed={sameTarget(highlight, netTarget)} onClick={() => toggle(netTarget)} title={t('pcb.insp.hlNetTitle')}>
              {t('pcb.insp.hlNet', { net: desc.net })}
            </button>
          )}
          {compTarget && (
            <button type="button" className={styles.toolButton} aria-pressed={sameTarget(highlight, compTarget)} onClick={() => toggle(compTarget)} title={t('pcb.insp.hlCompTitle')}>
              {t('pcb.insp.hlComp', { ref: desc.component.ref })}
            </button>
          )}
        </div>
      )}
      {count > 1 && (
        <p className={styles.inspectHint}>
          <span className={styles.mouseHint}>{t('pcb.insp.clickAgain', { count })}</span>
          <span className={styles.touchHint}>{t('pcb.insp.tapAgain', { count })}</span>
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

export function targetLabel(target: HighlightTarget, locale: Locale = 'en'): string {
  return target.kind === 'net' ? translate(locale, 'pcb.insp.netTarget', { net: target.net }) : target.ref;
}

// Components and nets of the board, searchable; picking one highlights it and zooms to it.
export function PartsCard({ catalog, highlight, onPick, onClear, source }: {
  catalog: Catalog;
  highlight: HighlightTarget | null;
  onPick: (t: HighlightTarget) => void;
  onClear: () => void;
  // Where the lists come from, when not from a design file (the X2 attributes of Gerber files, pick-and-place files).
  source?: string;
}) {
  const { t, locale } = useI18n();
  const fmt = (n: number) => n.toLocaleString(locale === 'nb' ? 'nb-NO' : 'en-US');
  const [tab, setTab] = React.useState<'parts' | 'nets'>(catalog.parts.length ? 'parts' : 'nets');
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const parts = React.useMemo(() => search(catalog.parts, q, (p) => rank(q, p.ref, p.value, p.footprint)), [catalog, q]);
  const nets = React.useMemo(() => search(catalog.nets, q, (n) => rank(q, n.name)), [catalog, q]);
  const list: (PartEntry | NetEntry)[] = tab === 'parts' ? parts : nets;
  const partTarget = (p: PartEntry): HighlightTarget => ({ kind: 'component', ref: p.ref, ...(p.index !== undefined ? { index: p.index } : {}) });
  const isOn = (target: HighlightTarget) => sameTarget(highlight, target);
  return (
    <>
      <div className={styles.segmented} role="group" aria-label={t('pcb.parts.listAria')}>
        <button type="button" className={styles.toolButton} aria-pressed={tab === 'parts'} onClick={() => setTab('parts')}>
          {t('pcb.info.components')} ({q ? t('pcb.parts.of', { n: fmt(parts.length) }) : ''}{fmt(catalog.parts.length)})
        </button>
        <button type="button" className={styles.toolButton} aria-pressed={tab === 'nets'} onClick={() => setTab('nets')}>
          {t('pcb.info.nets')} ({q ? t('pcb.parts.of', { n: fmt(nets.length) }) : ''}{fmt(catalog.nets.length)})
        </button>
      </div>
      <input
        className={[fieldStyles.input, styles.search].join(' ')}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={tab === 'parts' ? t('pcb.parts.searchPartsPh') : t('pcb.parts.searchNetsPh')}
        aria-label={tab === 'parts' ? t('pcb.parts.searchPartsAria') : t('pcb.parts.searchNetsAria')}
      />
      {list.length ? (
        <ul className={styles.partList} aria-label={tab === 'parts' ? t('pcb.info.components') : t('pcb.info.nets')}>
          {list.slice(0, LIMIT).map((e) => {
            if ('ref' in e) {
              const target = partTarget(e);
              const meta = [e.value, e.footprint?.replace(/^[^:]*:/, ''), e.side === 'bottom' ? t('pcb.parts.bottom') : undefined].filter(Boolean).join(' · ');
              return (
                <li key={e.key}>
                  <button type="button" className={[styles.partItem, isOn(target) ? styles.partItemOn : ''].join(' ')} aria-pressed={isOn(target)} onClick={() => onPick(target)} title={e.footprint}>
                    <span className={styles.partName}>{e.ref}</span>
                    <span className={styles.partMeta}>{meta || (e.pads ? (e.pads === 1 ? t('pcb.parts.padOne') : t('pcb.parts.padMany', { n: fmt(e.pads) })) : '')}</span>
                  </button>
                </li>
              );
            }
            const target: HighlightTarget = { kind: 'net', net: e.name };
            return (
              <li key={e.name}>
                <button type="button" className={[styles.partItem, isOn(target) ? styles.partItemOn : ''].join(' ')} aria-pressed={isOn(target)} onClick={() => onPick(target)}>
                  <span className={styles.partName}>{e.name}</span>
                  <span className={styles.partMeta}>{e.pads === 1 ? t('pcb.parts.padOne') : t('pcb.parts.padMany', { n: fmt(e.pads) })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={fieldStyles.help}>{q ? t('pcb.parts.noMatch') : tab === 'parts' ? t('pcb.parts.noParts') : t('pcb.parts.noNets')}</p>
      )}
      {list.length > LIMIT && <p className={styles.detailNote}>{t('pcb.parts.limitNote', { limit: LIMIT, total: fmt(list.length) })}</p>}
      {highlight && (
        <div className={fieldStyles.buttonRow}>
          <button type="button" className={fieldStyles.buttonSmall} onClick={onClear}>{t('pcb.ws.clearHl')}</button>
        </div>
      )}
      <p className={fieldStyles.help}>
        {t('pcb.parts.pickHelp')}{source ? ` ${source}` : ''}
      </p>
    </>
  );
}
