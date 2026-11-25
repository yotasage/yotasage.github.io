import React from 'react';

import {
  LINK_LIST_MAX, LIST_PRESETS, ListPreset, MAX_LISTS, MAX_LIST_NAME, ParsedList, StoredList, formatOhms, presetText, withoutEntry,
} from '../../lib/resistor';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Resistor.module.css';
import css from '../../styles/ResistorCombos.module.css';
import { CloseIcon } from './parts';

export interface ReadList {
  list: StoredList;
  parsed: ParsedList;
}

interface Props {
  lists: ReadList[];
  // The id of the list the search uses.
  inUse: string | null;
  // A list that came with the link and is not kept in this browser.
  shared: { name: string; values: number[] } | null;
  editing: string | null;
  onEditing: (id: string | null) => void;
  onLists: (lists: StoredList[]) => void;
  onUse: (id: string | null) => void;
  onKeep: () => void;
  // False when the browser does not let the page keep anything.
  kept: boolean;
}

function Editor({ item, inUse, onChange, onUse, onDone, onDelete }: {
  item: ReadList;
  inUse: boolean;
  onChange: (patch: Partial<StoredList>) => void;
  onUse: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const { list, parsed } = item;
  const unread = parsed.rejected.length;
  const valCount = (n: number) => (n === 1 ? t('res.c.value1', { n: n.toLocaleString('en-US') }) : t('res.c.valuesN', { n: n.toLocaleString('en-US') }));
  return (
    <div className={css.editor}>
      <div className={css.editorHead}>
        <label className={styles.label} htmlFor="list-name">{t('res.vl.name')}</label>
        <input id="list-name" className={css.nameInput} value={list.name} maxLength={MAX_LIST_NAME} onChange={(event) => onChange({ name: event.target.value })} />
      </div>
      <label className={styles.label} htmlFor="list-text">{t('res.c.values')}</label>
      <textarea
        id="list-text"
        className={css.listText}
        value={list.text}
        rows={5}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoFocus
        placeholder={t('res.vl.placeholder')}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <p className={css.hint}>
        {t('res.vl.hint1')}<span className={styles.num}>4k7</span>, <span className={styles.num}>4.7 kΩ</span>, <span className={styles.num}>4700</span>, <span className={styles.num}>0R1</span>{t('res.vl.hint2')}<span className={styles.num}>4,7k 10k 22k</span>{t('res.vl.hint3')}<span className={styles.num}>10k,22k,47k</span>{t('res.vl.hint4')}
      </p>
      <div className={css.editorCount} aria-live="polite">
        <b>{valCount(parsed.values.length)}</b>
        {unread > 0 && <span className={css.bad}>{t('res.vl.notRead', { n: unread })}</span>}
        {parsed.duplicates > 0 && <span>{t('res.vl.twice', { n: parsed.duplicates })}</span>}
      </div>
      {parsed.entries.length > 0 && (
        <ul className={css.chips} aria-label={t('res.vl.chipsAria')}>
          {parsed.entries.map((entry) => (
            <li key={entry.start} className={css.valueChip} data-bad={entry.ohms === null} data-twice={entry.duplicate}>
              <span className={styles.num} title={entry.ohms === null ? t('res.vl.notResist', { text: entry.text }) : `${t('res.vl.readFrom', { text: entry.text })}${entry.duplicate ? t('res.vl.alreadyInList') : ''}`}>
                {entry.ohms === null ? entry.text : formatOhms(entry.ohms)}
              </span>
              <button type="button" aria-label={t('res.vl.removeAria', { text: entry.text })} title={t('res.vl.removeTitle')} onClick={() => onChange({ text: withoutEntry(list.text, entry.start, entry.end) })}>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {parsed.values.length > LINK_LIST_MAX && (
        <p className={css.limit}>
          {t('res.vl.tooLong', { max: LINK_LIST_MAX, count: parsed.values.length.toLocaleString('en-US') })}
        </p>
      )}
      <div className={css.editorActions}>
        {inUse
          ? <span className={styles.tag} style={{ marginLeft: 0 }}>{t('res.vl.inUse')}</span>
          : <button type="button" className={css.button} data-primary onClick={onUse} disabled={!parsed.values.length}>{t('res.vl.searchWith')}</button>}
        <button type="button" className={css.button} onClick={onDone}>{t('res.vl.done')}</button>
        <span className={css.space} />
        <button type="button" className={css.button} data-quiet onClick={onDelete}>{t('res.vl.deleteList')}</button>
      </div>
    </div>
  );
}

// "My values": the visitor's own lists of the values they have, kept in the browser.
export default function ValueLists({ lists, inUse, shared, editing, onEditing, onLists, onUse, onKeep, kept }: Props) {
  const { t } = useI18n();
  const stored = lists.map((item) => item.list);
  const full = lists.length >= MAX_LISTS;
  const valCount = (n: number) => (n === 1 ? t('res.c.value1', { n: n.toLocaleString('en-US') }) : t('res.c.valuesN', { n: n.toLocaleString('en-US') }));

  const add = (name: string, text: string) => {
    let unique = name;
    for (let n = 2; stored.some((l) => l.name === unique); n++) unique = `${name} (${n})`;
    const id = Math.random().toString(36).slice(2, 9);
    onLists([...stored, { id, name: unique, text }]);
    onEditing(id);
  };
  const change = (id: string, patch: Partial<StoredList>) => onLists(stored.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const remove = (id: string) => {
    if (inUse === id) onUse(null);
    if (editing === id) onEditing(null);
    onLists(stored.filter((l) => l.id !== id));
  };
  const preset = (p: ListPreset) => add(t('res.vl.presetName', { series: p.series }), presetText(p));

  return (
    <div className={[styles.block, css.combos].join(' ')} id="my-values">
      <div className={styles.blockHead}>
        <h3>{t('res.c.myValues')}</h3>
        <span className={styles.blockMeta}>{kept ? t('res.vl.kept') : t('res.vl.notKept')}</span>
      </div>
      <p className={css.intro}>{t('res.vl.intro')}</p>

      <div className={css.lists} role="list">
        {shared && (
          <div className={css.listRow} role="listitem" data-used="true">
            <span className={css.listName}>{shared.name}<span className={css.listFrom}>{t('res.vl.fromLinkNotKept')}</span></span>
            <span className={[styles.num, css.listCount].join(' ')}>{valCount(shared.values.length)}</span>
            <span className={css.listActions}>
              <span className={styles.tag}>{t('res.vl.inUse')}</span>
              <button type="button" className={css.button} onClick={onKeep} disabled={full}>{t('res.vl.keep')}</button>
            </span>
          </div>
        )}
        {lists.map((item) => {
          const { list, parsed } = item;
          const used = inUse === list.id;
          const open = editing === list.id;
          return (
            <React.Fragment key={list.id}>
              <div className={css.listRow} role="listitem" data-used={used} data-open={open}>
                <button type="button" className={css.listName} onClick={() => onEditing(open ? null : list.id)} aria-expanded={open} title={t('res.vl.editTitle')}>
                  {list.name || t('res.c.unnamed')}
                </button>
                <span className={[styles.num, css.listCount].join(' ')}>
                  {valCount(parsed.values.length)}
                  {parsed.rejected.length > 0 && <span className={css.bad}> · {t('res.vl.notRead', { n: parsed.rejected.length })}</span>}
                </span>
                <span className={css.listActions}>
                  {used
                    ? <button type="button" className={css.button} data-on onClick={() => onUse(null)} title={t('res.vl.searchSeriesTitle')}>{t('res.vl.inUse')}</button>
                    : <button type="button" className={css.button} onClick={() => onUse(list.id)} disabled={!parsed.values.length}>{t('res.vl.use')}</button>}
                  <button type="button" className={css.button} onClick={() => onEditing(open ? null : list.id)}>{open ? t('res.vl.close') : t('res.vl.edit')}</button>
                </span>
              </div>
              {open && (
                <Editor
                  item={item}
                  inUse={used}
                  onChange={(patch) => change(list.id, patch)}
                  onUse={() => onUse(list.id)}
                  onDone={() => onEditing(null)}
                  onDelete={() => remove(list.id)}
                />
              )}
            </React.Fragment>
          );
        })}
        {!lists.length && !shared && <p className={css.none}>{t('res.vl.noneYet')}</p>}
      </div>

      <div className={css.starts}>
        <button type="button" className={css.button} data-primary onClick={() => add(t('res.c.myValues'), '')} disabled={full}>{t('res.vl.newList')}</button>
        <span className={css.startsLabel}>{t('res.vl.orStartFrom')}</span>
        {LIST_PRESETS.map((p) => (
          <button key={p.name} type="button" className={styles.chip} onClick={() => preset(p)} disabled={full} title={t('res.vl.presetTitle', { series: p.series })}>
            {t('res.vl.presetName', { series: p.series })}
          </button>
        ))}
      </div>
    </div>
  );
}
