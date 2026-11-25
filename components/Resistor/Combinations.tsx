import React, { useEffect, useMemo, useState } from 'react';

import {
  CHIP_SIZES, Combination, LISTS_KEY, ParsedList, SERIES, SearchResult, SeriesId, StoredList, cancelSearch, formatCount, formatError, formatOhms,
  formatQuantity, formatRange, formatRkm, formatTolerance, listReach, listsFromStorage, listsToStorage, networkFormula, networkLeaves,
  networkLoad, networkShares, networkTolerance, parseQuantity, parseValueList, readValue, sameValues, saveBlob, searchPlace, series, seriesList,
  startSearch, stopSearchWorker, usualSeries,
} from '../../lib/resistor';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale } from '../../lib/ui/translations';
import styles from '../../styles/Resistor.module.css';
import Bibliography from '../Bibliography';
import css from '../../styles/ResistorCombos.module.css';
import Circuit from './Circuit';
import ValueLists from './ValueLists';
import { Combo } from './combo';
import { CopyButton, DownIcon, InfoIcon, Ohms, SaveIcon, Segmented, UpIcon } from './parts';

interface Props {
  // The current value; undefined when nothing is read.
  ohms: number | undefined;
  // The tolerance of each resistor, in percent.
  tolerance: number;
  combo: Combo;
  onCombo: (patch: Partial<Combo>) => void;
  // Told the lists as they are read, so that the Design section can offer them too.
  onLists?: (lists: { list: StoredList; parsed: ParsedList }[]) => void;
  bib: Bibliography;
}

// How many results the search keeps, how many are shown at first and how many "Show more" adds.
const KEEP = 50;
const FIRST = 8;
const MORE = 14;

const SCALES = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
const scaleFor = (rows: (Combination | null)[]) => {
  const largest = Math.max(0, ...rows.map((c) => (c ? Math.abs(c.errorPct) : 0)));
  return largest === 0 ? 0 : SCALES.find((s) => s >= largest) ?? 100;
};
const pct3 = (value: number) => `${Number(value.toPrecision(3))} %`;

// "4.7 kΩ + (10 kΩ ∥ 22 kΩ) = 11.575 kΩ, +0.2 %"
export function combinationText(c: Combination, locale: Locale = 'en'): string {
  const error = c.exact ? translate(locale, 'res.exact') : formatError(c.errorPct);
  return c.parts === 1 ? `${formatOhms(c.ohms)}, ${error}` : `${networkFormula(c.network)} = ${formatOhms(c.ohms)}, ${error}`;
}

function csv(rows: Combination[], tolerance: number): string {
  const head = ['Rank', 'Resistors', 'Network', 'Value (ohm)', 'Error (%)', 'Error (ohm)', `Worst case at ${tolerance} % (+/- %)`, 'RSS (+/- %)', 'R1 (ohm)', 'R2 (ohm)', 'R3 (ohm)', 'R4 (ohm)'];
  const number = (value: number) => String(Number(value.toPrecision(9)));
  const lines = rows.map((c, i) => {
    const tol = networkTolerance(c.network, tolerance);
    const leaves = networkLeaves(c.network);
    return [
      i + 1, c.parts, `"${networkFormula(c.network)}"`, number(c.ohms), number(c.errorPct), number(c.errorOhms), number(tol.worstPct), number(tol.rssPct),
      ...[0, 1, 2, 3].map((k) => (leaves[k] === undefined ? '' : number(leaves[k]))),
    ].join(',');
  });
  // The mark at the start lets spreadsheets read Ω and ∥.
  return `\uFEFF${[head.join(','), ...lines].join('\r\n')}\r\n`;
}

function ErrorCells({ c, scale }: { c: Combination; scale: number }) {
  const { t } = useI18n();
  const width = scale ? Math.min(50, (Math.abs(c.errorPct) / scale) * 50) : 0;
  return (
    <>
      <span className={[styles.num, styles.error, css.error].join(' ')}>{c.exact ? <span className={styles.exact}>{t('res.exact')}</span> : formatError(c.errorPct)}</span>
      <span className={[styles.errorBar, css.bar].join(' ')} data-exact={c.exact} aria-hidden>
        {c.exact
          ? <span className={styles.errorDot} />
          : <span className={styles.errorFill} style={c.errorPct < 0 ? { right: '50%', width: `${width}%` } : { left: '50%', width: `${width}%` }} />}
      </span>
    </>
  );
}

// A resistance typed as the end of the range; it is taken as soon as it reads and fits.
export function RangeField({ label, ohms, onCommit }: { label: string; ohms: number; onCommit: (ohms: number) => boolean }) {
  const [text, setText] = useState(formatOhms(ohms));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText((current) => (readValue(current) === ohms ? current : formatOhms(ohms)));
    setBad(false);
  }, [ohms]);
  return (
    <input
      className={[styles.numberInput, css.rangeInput].join(' ')}
      aria-label={label}
      aria-invalid={bad || undefined}
      value={text}
      spellCheck={false}
      onChange={(event) => {
        setText(event.target.value);
        const value = readValue(event.target.value);
        setBad(value === null || !onCommit(value));
      }}
      onBlur={() => { setText(formatOhms(ohms)); setBad(false); }}
    />
  );
}

// What each resistor of a network carries, and how far the network can be off.
function Details({ c, tolerance, load, loadText }: { c: Combination; tolerance: number; load: { volts?: number; amps?: number } | null; loadText: string }) {
  const { t } = useI18n();
  const shares = networkShares(c.network);
  const tol = networkTolerance(c.network, tolerance);
  const loaded = load ? networkLoad(c.network, load) : null;
  return (
    <div className={css.details}>
      <p className={css.detailLine}>
        {c.parts > 1 && <><span className={styles.num}>{networkFormula(c.network, { names: true })}</span> · </>}
        {t('res.c.withPartsPre', { tol: formatTolerance(tolerance) })}<Ohms ohms={tol.low} digits={5} /> {t('res.and')} <Ohms ohms={tol.high} digits={5} />{t('res.c.wcRssMid', { rss: pct3(tol.rssPct) })}
        {!c.exact && <> · <span className={styles.num}>{formatOhms(Math.abs(c.errorOhms), 3)}</span> {c.errorOhms > 0 ? t('res.c.aboveTarget') : t('res.c.belowTarget')}</>}
      </p>
      <div className={styles.scroll}>
        <div className={css.shares} role="table" aria-label={t('res.c.sharesAria')} data-load={loaded ? 'true' : undefined}>
          <div className={css.sharesHead} role="row">
            <span className={styles.label} role="columnheader">{t('res.c.part')}</span>
            <span className={styles.label} role="columnheader">{t('res.c.value')}</span>
            <span className={styles.label} role="columnheader">{t('res.c.voltage')}</span>
            <span className={styles.label} role="columnheader">{t('res.c.current')}</span>
            <span className={styles.label} role="columnheader">{t('res.c.power')}</span>
            {loaded && <span className={styles.label} role="columnheader" title={t('res.c.chipTypTitle')}>{t('res.c.chipTyp')}</span>}
          </div>
          {shares.map((share, i) => {
            const part = loaded?.parts[i];
            const chip = part ? CHIP_SIZES.find((size) => size.power >= part.watts * (1 - 1e-9)) : undefined;
            return (
              <div key={i} className={css.sharesRow} role="row">
                <span role="cell" className={styles.num}>R{i + 1}</span>
                <span role="cell"><Ohms ohms={share.ohms} /></span>
                <span role="cell" className={styles.num}>{part && <b>{formatQuantity(part.volts, 'V')}</b>}{' '}<i>{pct3(share.voltage * 100)}</i></span>
                <span role="cell" className={styles.num}>{part && <b>{formatQuantity(part.amps, 'A')}</b>}{' '}<i>{pct3(share.current * 100)}</i></span>
                <span role="cell" className={styles.num}>{part && <b>{formatQuantity(part.watts, 'W')}</b>}{' '}<i>{pct3(share.power * 100)}</i></span>
                {part && (
                  <span role="cell" className={[styles.num, css.sharesChip].join(' ')} data-over={chip ? undefined : 'true'}>
                    {chip ? <><b>{chip.imperial}</b>{' '}<i>{formatQuantity(chip.power, 'W')}</i></> : <b>{t('res.c.above2512W')}</b>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className={css.detailNote}>
        {loaded
          ? <>{t('res.c.loadedNotePre', { loadText })}<span className={styles.num}>{formatQuantity(loaded.volts, 'V')}</span>, <span className={styles.num}>{formatQuantity(loaded.amps, 'A')}</span> {t('res.and')} <span className={styles.num}>{formatQuantity(loaded.watts, 'W')}</span>{t('res.c.loadedNotePost')}</>
          : t('res.c.unloadedNote')}
      </p>
    </div>
  );
}

// The Combinations section: which real resistors, connected how, give the current value.
export default function Combinations({ ohms, tolerance, combo, onCombo, onLists, bib }: Props) {
  const { t, locale } = useI18n();
  const [lists, setLists] = useState<StoredList[]>([]);
  // True once the lists were read from the browser; nothing is searched before.
  const [ready, setReady] = useState(false);
  const [kept, setKept] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  // The link named a list that is kept in another browser.
  const [missing, setMissing] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState<'worker' | 'page' | null>(null);
  const [failed, setFailed] = useState('');
  const [shown, setShown] = useState(FIRST);
  const [open, setOpen] = useState<string | null>(null);

  const resistors = (n: number) => (n === 1 ? t('res.c.resistor1') : t('res.c.resistorsN', { n }));
  const valuesWord = (n: number) => (n === 1 ? t('res.c.value1', { n: n.toLocaleString('en-US') }) : t('res.c.valuesN', { n: n.toLocaleString('en-US') }));

  useEffect(() => {
    try {
      setLists(listsFromStorage(window.localStorage.getItem(LISTS_KEY)));
    } catch { setKept(false); }
    setReady(true);
    return () => stopSearchWorker();
  }, []);

  const saveLists = (next: StoredList[]) => {
    setLists(next);
    try {
      window.localStorage.setItem(LISTS_KEY, listsToStorage(next));
      setKept(true);
    } catch { setKept(false); }
  };

  const read = useMemo(() => lists.map((list) => ({ list, parsed: parseValueList(list.text) })), [lists]);
  useEffect(() => {
    if (ready) onLists?.(read);
  }, [ready, read, onLists]);
  const stored = combo.listId ? read.find((item) => item.list.id === combo.listId) : undefined;
  const shared = combo.list && !combo.listId ? combo.list : null;
  const usingList = combo.listId !== null || combo.list !== null;

  // The list in use follows its text, and a list from a link is found among the lists kept here.
  useEffect(() => {
    if (!ready) return;
    if (combo.listId) {
      if (stored) {
        const list = { name: stored.list.name, values: stored.parsed.values };
        if (!combo.list || combo.list.name !== list.name || !sameValues(combo.list.values, list.values)) onCombo({ list });
      } else {
        if (!combo.list) setMissing(true);
        onCombo({ listId: null });
      }
    } else if (combo.list) {
      const match = read.find((item) => item.list.name === combo.list.name && sameValues(item.parsed.values, combo.list.values));
      if (match) onCombo({ listId: match.list.id });
    }
  }, [ready, combo.listId, combo.list, stored, read, onCombo]);

  const usual = usualSeries(tolerance);
  const seriesId: SeriesId = combo.series ?? usual;
  const listValues = stored ? stored.parsed.values : combo.list?.values;
  const values = useMemo(
    () => (usingList ? listValues ?? null : seriesList(seriesId, combo.min, combo.max)),
    [usingList, listValues, seriesId, combo.min, combo.max],
  );

  const searchable = ready && values !== null && values.length > 0 && ohms !== undefined && ohms > 0;
  useEffect(() => {
    if (!searchable) {
      cancelSearch();
      setResult(null);
      setBusy(false);
      return undefined;
    }
    let stale = false;
    setBusy(true);
    startSearch(ohms, values, { maxParts: combo.parts, connections: combo.connections, reuse: combo.reuse, keep: KEEP })
      .then((found) => {
        if (stale || !found) return;
        setResult(found);
        setBusy(false);
        setFailed('');
        setPlace(searchPlace());
      })
      .catch((error) => {
        if (stale) return;
        setBusy(false);
        setFailed(String(error?.message ?? error));
      });
    return () => { stale = true; };
  }, [searchable, ohms, values, combo.parts, combo.connections, combo.reuse]);

  const pickList = (id: string | null) => {
    setMissing(false);
    const item = read.find((entry) => entry.list.id === id);
    if (item) onCombo({ listId: item.list.id, list: { name: item.list.name, values: item.parsed.values } });
    else onCombo({ listId: null, list: null });
  };
  const keepShared = () => {
    if (!shared) return;
    const id = Math.random().toString(36).slice(2, 9);
    saveLists([...lists, { id, name: shared.name, text: shared.values.map((value) => formatRkm(value, 9)).join(' ') }]);
    onCombo({ listId: id });
  };
  const toMyValues = (id: string | null) => {
    if (id) setEditing(id);
    document.getElementById('my-values')?.scrollIntoView({ block: 'start' });
  };
  const chooseValues = (choice: string) => {
    setMissing(false);
    if (choice === 'shared') return;
    if (choice.startsWith('list:')) pickList(choice.slice(5));
    else onCombo({ listId: null, list: null, series: choice === 'auto' ? null : (choice as SeriesId) });
  };
  const setFilter = (filter: number) => {
    onCombo({ filter });
    setShown(FIRST);
  };

  const loadValue = parseQuantity(combo.load);
  const load = loadValue === null ? null : combo.loadKind === 'i' ? { amps: loadValue } : { volts: loadValue };
  const loadText = loadValue === null ? '' : combo.loadKind === 'i'
    ? t('res.c.aThroughNet', { q: formatQuantity(loadValue, 'A') })
    : t('res.c.vAcrossNet', { q: formatQuantity(loadValue, 'V') });

  const maxParts = result?.options.maxParts ?? combo.parts;
  const filter = combo.filter && combo.filter <= maxParts ? combo.filter : 0;
  const rows = result ? (filter ? result.byParts[filter] ?? [] : result.results) : [];
  const visible = rows.slice(0, shown);
  const best = result ? [1, 2, 3, 4].filter((n) => n <= maxParts).map((n) => ({ n, c: result.best[n] ?? null })) : [];
  const bestScale = scaleFor(best.map((b) => b.c));
  const scale = scaleFor(visible);
  const reach = values ? listReach(values, combo.parts, combo.connections, combo.reuse) : null;
  const outside = reach && ohms > 0 && (ohms < reach.low * (1 - 1e-9) || ohms > reach.high * (1 + 1e-9));
  const sourceName = usingList ? t('res.c.theList', { name: stored?.list.name ?? combo.list?.name ?? '' }) : `${series(seriesId).label}, ${formatRange(combo.min, combo.max)}`;
  const selected = usingList ? (combo.listId ? `list:${combo.listId}` : 'shared') : combo.series ?? 'auto';

  return (
    <>
      <div className={[styles.block, css.combos].join(' ')}>
        <div className={styles.blockHead}>
          <h3>{t('res.c.title')}</h3>
          <span className={styles.blockMeta}>{ohms > 0 ? <>{t('res.c.metaClosest')} <Ohms ohms={ohms} /></> : t('res.c.metaEmpty')}</span>
        </div>

        <div className={styles.optionRow}>
          <span className={styles.label}>{t('res.c.values')}</span>
          <div className={css.control}>
            <select className={styles.select} aria-label={t('res.c.valuesAria')} value={selected} onChange={(event) => chooseValues(event.target.value)}>
              <option value="auto">{t('res.c.autoOpt', { series: series(usual).label, tol: formatTolerance(tolerance) })}</option>
              {SERIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              {(read.length > 0 || shared) && (
                <optgroup label={t('res.c.myValues')}>
                  {shared && <option value="shared">{t('res.c.fromLink', { name: shared.name })}</option>}
                  {read.map(({ list, parsed }) => <option key={list.id} value={`list:${list.id}`} disabled={!parsed.values.length}>{list.name || t('res.c.unnamed')}</option>)}
                </optgroup>
              )}
            </select>
            {!usingList && (
              <span className={css.range}>
                <RangeField label={t('res.c.smallestVal')} ohms={combo.min} onCommit={(value) => value < combo.max && (onCombo({ min: value }), true)} />
                <span>{t('res.to')}</span>
                <RangeField label={t('res.c.largestVal')} ohms={combo.max} onCommit={(value) => value > combo.min && (onCombo({ max: value }), true)} />
              </span>
            )}
            <span className={[styles.num, css.count].join(' ')} data-testid="value-count">{values ? valuesWord(values.length) : ''}</span>
            <button type="button" className={css.linkButton} onClick={() => toMyValues(combo.listId)}>{usingList && combo.listId ? t('res.c.editList') : t('res.c.myValues')}</button>
          </div>
        </div>
        <div className={styles.optionRow}>
          <span className={styles.label}>{t('res.c.resistors')}</span>
          <div className={css.control}>
            <Segmented label={t('res.c.maxPartsAria')} value={combo.parts} onChange={(parts) => { onCombo({ parts, filter: combo.filter > parts ? 0 : combo.filter }); setShown(FIRST); }}
              options={[1, 2, 3, 4].map((n) => ({ value: n, label: n === 1 ? '1' : t('res.c.upToN', { n }) }))} />
          </div>
        </div>
        <div className={styles.optionRow}>
          <span className={styles.label}>{t('res.c.connected')}</span>
          <div className={css.control}>
            <Segmented label={t('res.c.connectedAria')} value={combo.connections} onChange={(connections) => { onCombo({ connections }); setShown(FIRST); }}
              options={[
                { value: 'mixed', label: t('res.c.anyWay'), title: t('res.c.anyWayTitle') },
                { value: 'series', label: t('res.c.seriesOnly'), title: t('res.c.seriesOnlyTitle') },
                { value: 'parallel', label: t('res.c.parallelOnly'), title: t('res.c.parallelOnlyTitle') },
              ]} />
          </div>
        </div>
        <div className={styles.optionRow}>
          <span className={styles.label}>{t('res.c.eachValue')}</span>
          <div className={css.control}>
            <Segmented label={t('res.c.reuseAria')} value={combo.reuse ? 'many' : 'once'} onChange={(reuse) => onCombo({ reuse: reuse === 'many' })}
              options={[
                { value: 'many', label: t('res.c.moreThanOnce'), title: t('res.c.moreThanOnceTitle') },
                { value: 'once', label: t('res.c.once'), title: t('res.c.onceTitle') },
              ]} />
          </div>
        </div>
        <div className={styles.optionRow}>
          <span className={styles.label}>{t('res.c.load')}</span>
          <div className={css.control}>
            <input
              className={[styles.numberInput, css.loadInput].join(' ')}
              aria-label={combo.loadKind === 'i' ? t('res.c.loadCurrentAria') : t('res.c.loadVoltageAria')}
              aria-invalid={combo.load.trim() !== '' && loadValue === null ? true : undefined}
              value={combo.load}
              placeholder={combo.loadKind === 'i' ? t('res.c.loadPhI') : t('res.c.loadPhV')}
              inputMode="decimal"
              spellCheck={false}
              onChange={(event) => onCombo({ load: event.target.value })}
            />
            <Segmented label={t('res.c.loadKindAria')} value={combo.loadKind} onChange={(loadKind) => onCombo({ loadKind })}
              options={[{ value: 'v', label: t('res.c.vAcross') }, { value: 'i', label: t('res.c.aThrough') }]} />
            <span className={css.optional}>{combo.load.trim() !== '' && loadValue === null ? t('res.c.notANumber') : t('res.c.loadOpt')}</span>
          </div>
        </div>

        {missing && (
          <p className={[styles.message, css.note].join(' ')}><InfoIcon /><span>{t('res.c.missingList', { series: series(seriesId).label })}</span></p>
        )}

        {ohms === undefined && <p className={css.empty}>{t('res.c.emptyType')}</p>}
        {ohms === 0 && <p className={css.empty}>{t('res.c.emptyZero')}</p>}
        {ohms > 0 && values !== null && !values.length && (
          <p className={css.empty}>{usingList ? t('res.c.emptyList') : t('res.c.emptyRange', { series: series(seriesId).label, range: formatRange(combo.min, combo.max) })}</p>
        )}

        {ohms > 0 && (values === null || values.length > 0) && (
          <p className={css.status} data-testid="search-status" data-place={place ?? ''} data-busy={busy || !result} aria-live="polite">
            {failed ? t('res.c.failed', { err: failed })
              : !result ? t('res.c.searching')
                : t('res.c.searched', {
                    count: formatCount(result.considered),
                    netWord: result.considered === 1 ? t('res.c.net1') : t('res.c.nets'),
                    partsWord: maxParts === 1 ? t('res.c.oneResistor') : t('res.c.rangeResistors', { n: maxParts }),
                    valWord: valuesWord(result.values),
                    source: sourceName,
                    ms: result.ms < 1 ? t('res.c.under1') : Math.round(result.ms).toLocaleString('en-US'),
                    onPage: place === 'page' ? t('res.c.onPage') : '',
                    note: result.note ? ` ${result.note}` : '',
                  })}
          </p>
        )}

        {result && ohms > 0 && outside && reach && (
          <p className={[styles.message, css.note].join(' ')}>
            <InfoIcon />
            <span>
              <span className={styles.num}>{formatOhms(ohms)}</span>{t('res.c.outsidePre', { parts: combo.parts === 1 ? t('res.c.oneResistor') : t('res.c.upToResistors', { n: combo.parts }) })}
              <span className={styles.num}>{formatOhms(reach.low, 4)}</span> {t('res.to')} <span className={styles.num}>{formatOhms(reach.high, 4)}</span>{t('res.c.outsidePost')}
            </span>
          </p>
        )}
        {result && values?.length === 1 && (
          <p className={css.quietNote}>{t('res.c.singleVal')}<span className={styles.num}>{formatOhms(values[0])}</span>{combo.reuse ? t('res.c.singleValRepeat') : t('res.c.singleValOnce')}</p>
        )}
      </div>

      {result && ohms > 0 && (
        <div className={[styles.block, css.combos].join(' ')}>
          <div className={styles.blockHead}>
            <h3>{t('res.c.bestTitle')}</h3>
            <span className={[styles.blockMeta, styles.num].join(' ')}>{bestScale ? t('res.c.barsScale', { pct: pct3(bestScale) }) : ''}</span>
          </div>
          <div className={css.best} role="table" aria-label={t('res.c.bestAria')}>
            {best.map(({ n, c }) => (
              <div key={n} className={css.bestRow} role="row" data-on={filter === n}>
                <span role="cell">
                  <button type="button" className={css.bestLabel} aria-pressed={filter === n} onClick={() => setFilter(filter === n ? 0 : n)} title={t('res.c.showOnlyTitle', { res: resistors(n) })}>{resistors(n)}</button>
                </span>
                {c ? (
                  <>
                    <span role="cell" className={[styles.num, css.bestFormula].join(' ')}>{networkFormula(c.network)}</span>
                    <span role="cell" className={css.bestValue}><Ohms ohms={c.ohms} /></span>
                    <ErrorCells c={c} scale={bestScale} />
                  </>
                ) : <span role="cell" className={css.bestNone}>{n > 1 && !combo.reuse && values && values.length < n ? t('res.c.tooFewVals') : t('res.c.noNetwork')}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {result && ohms > 0 && (
        <div className={[styles.block, css.combos].join(' ')}>
          <div className={styles.blockHead}>
            <h3>{t('res.c.ranked')}</h3>
            <span className={css.listTools}>
              {maxParts > 1 && (
                <Segmented label={t('res.c.filterAria')} value={filter} onChange={setFilter}
                  options={[{ value: 0, label: t('res.c.all') }, ...[1, 2, 3, 4].filter((n) => n <= maxParts).map((n) => ({ value: n, label: String(n), title: t('res.c.onlyNetTitle', { res: resistors(n) }) }))]} />
              )}
              <button type="button" className={styles.copy} disabled={!rows.length} title={t('res.c.saveCsvTitle', { n: rows.length })}
                onClick={() => saveBlob(new Blob([csv(rows, tolerance)], { type: 'text/csv;charset=utf-8' }), `resistor-combinations-${formatRkm(ohms)}.csv`)}>
                <SaveIcon /><span>CSV</span>
              </button>
            </span>
          </div>
          {!rows.length && <p className={css.empty}>{t('res.c.noNetworkMade', { res: resistors(filter || 1) })}</p>}
          <ol className={css.results} aria-label={t('res.c.resultsAria')}>
            {visible.map((c, i) => {
              const tol = networkTolerance(c.network, tolerance);
              const isOpen = open === c.key;
              return (
                <li key={c.key} className={css.result} data-open={isOpen}>
                  <div className={css.resultMain}>
                    <span className={[styles.num, css.rank].join(' ')}>{i + 1}</span>
                    <div className={css.drawing}><Circuit network={c.network} /></div>
                    <div className={css.what}>
                      <div className={[styles.num, css.formula].join(' ')} data-testid="formula">{networkFormula(c.network)}</div>
                      <div className={css.sub}>
                        {resistors(c.parts)} · {t('res.c.worstCase')} <span className={styles.num}>±{pct3(tol.worstPct)}</span> · RSS <span className={styles.num}>±{pct3(tol.rssPct)}</span>
                      </div>
                    </div>
                    <div className={css.numbers}>
                      <Ohms ohms={c.ohms} className={css.gives} />
                      <ErrorCells c={c} scale={scale} />
                    </div>
                    <div className={css.actions}>
                      <CopyButton text={() => combinationText(c, locale)} label="" title={t('res.c.copyTextTitle', { text: combinationText(c, locale) })} />
                      <button type="button" className={css.toggle} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.key)} title={t('res.c.detailsTitle')} aria-label={t('res.c.detailsAria', { formula: networkFormula(c.network) })}>
                        {isOpen ? <UpIcon /> : <DownIcon />}
                      </button>
                    </div>
                  </div>
                  {isOpen && <Details c={c} tolerance={tolerance} load={load} loadText={loadText} />}
                </li>
              );
            })}
          </ol>
          {rows.length > shown && (
            <button type="button" className={css.more} onClick={() => setShown(shown + MORE)}>{t('res.c.showMore')} <span className={styles.num}>{t('res.c.ofCount', { shown, total: rows.length })}</span></button>
          )}
          <p className={styles.caption}>
            {t('res.c.rankCaptionPre')}<span className={styles.num}>±{pct3(scale || 1)}</span>.
          </p>
          <p className={styles.caption}>
            <b>{t('res.c.wcCaption1')}</b>{t('res.c.wcCaption2', { tol: formatTolerance(tolerance) })}
            <b>{t('res.c.rssCaption1')}</b>{t('res.c.rssCaption2')}{bib.cite('TISNVA112')}{t('res.c.rssCaption3')}
          </p>
        </div>
      )}

      <ValueLists
        lists={read}
        inUse={combo.listId}
        shared={shared}
        editing={editing}
        onEditing={setEditing}
        onLists={saveLists}
        onUse={pickList}
        onKeep={keepShared}
        kept={kept}
      />
    </>
  );
}
