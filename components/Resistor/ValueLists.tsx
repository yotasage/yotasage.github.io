import React from 'react';

import {
  LINK_LIST_MAX, LIST_PRESETS, ListPreset, MAX_LISTS, MAX_LIST_NAME, ParsedList, StoredList, formatOhms, presetText, withoutEntry,
} from '../../lib/resistor';
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

const plural = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

function Editor({ item, inUse, onChange, onUse, onDone, onDelete }: {
  item: ReadList;
  inUse: boolean;
  onChange: (patch: Partial<StoredList>) => void;
  onUse: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const { list, parsed } = item;
  const unread = parsed.rejected.length;
  return (
    <div className={css.editor}>
      <div className={css.editorHead}>
        <label className={styles.label} htmlFor="list-name">Name</label>
        <input id="list-name" className={css.nameInput} value={list.name} maxLength={MAX_LIST_NAME} onChange={(event) => onChange({ name: event.target.value })} />
      </div>
      <label className={styles.label} htmlFor="list-text">Values</label>
      <textarea
        id="list-text"
        className={css.listText}
        value={list.text}
        rows={5}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoFocus
        placeholder="Paste or type: 10R 22R 4k7 10k 1M"
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <p className={css.hint}>
        Any notation the field at the top reads: <span className={styles.num}>4k7</span>, <span className={styles.num}>4.7 kΩ</span>, <span className={styles.num}>4700</span>, <span className={styles.num}>0R1</span>, separated by spaces, lines, semicolons or commas.
        A comma between digits is a decimal comma when spaces or lines separate the entries (<span className={styles.num}>4,7k 10k 22k</span>); in a list separated by commas alone it separates (<span className={styles.num}>10k,22k,47k</span>). The chips show how each entry was read.
      </p>
      <div className={css.editorCount} aria-live="polite">
        <b>{plural(parsed.values.length, 'value')}</b>
        {unread > 0 && <span className={css.bad}>{unread} not read</span>}
        {parsed.duplicates > 0 && <span>{parsed.duplicates} entered twice</span>}
      </div>
      {parsed.entries.length > 0 && (
        <ul className={css.chips} aria-label="The values as they were read">
          {parsed.entries.map((entry) => (
            <li key={entry.start} className={css.valueChip} data-bad={entry.ohms === null} data-twice={entry.duplicate}>
              <span className={styles.num} title={entry.ohms === null ? `“${entry.text}” is not read as a resistance` : `Read from “${entry.text}”${entry.duplicate ? ', which is in the list already' : ''}`}>
                {entry.ohms === null ? entry.text : formatOhms(entry.ohms)}
              </span>
              <button type="button" aria-label={`Remove ${entry.text}`} title="Remove from the list" onClick={() => onChange({ text: withoutEntry(list.text, entry.start, entry.end) })}>
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      )}
      {parsed.values.length > LINK_LIST_MAX && (
        <p className={css.limit}>
          Too long for a link: a link carries a list of up to {LINK_LIST_MAX} values, and this one has {parsed.values.length.toLocaleString('en-US')}. It works here, but a link you share will not bring it along.
        </p>
      )}
      <div className={css.editorActions}>
        {inUse
          ? <span className={styles.tag} style={{ marginLeft: 0 }}>In use</span>
          : <button type="button" className={css.button} data-primary onClick={onUse} disabled={!parsed.values.length}>Search with this list</button>}
        <button type="button" className={css.button} onClick={onDone}>Done</button>
        <span className={css.space} />
        <button type="button" className={css.button} data-quiet onClick={onDelete}>Delete list</button>
      </div>
    </div>
  );
}

// "My values": the visitor's own lists of the values they have, kept in the browser.
export default function ValueLists({ lists, inUse, shared, editing, onEditing, onLists, onUse, onKeep, kept }: Props) {
  const stored = lists.map((item) => item.list);
  const full = lists.length >= MAX_LISTS;

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
  const preset = (p: ListPreset) => add(p.name, presetText(p));

  return (
    <div className={[styles.block, css.combos].join(' ')} id="my-values">
      <div className={styles.blockHead}>
        <h3>My values</h3>
        <span className={styles.blockMeta}>{kept ? 'kept in this browser' : 'this browser keeps nothing: the lists last until the page is closed'}</span>
      </div>
      <p className={css.intro}>The values you have at hand. With a list in use, the search combines only those.</p>

      <div className={css.lists} role="list">
        {shared && (
          <div className={css.listRow} role="listitem" data-used="true">
            <span className={css.listName}>{shared.name}<span className={css.listFrom}>from the link, not kept here</span></span>
            <span className={[styles.num, css.listCount].join(' ')}>{plural(shared.values.length, 'value')}</span>
            <span className={css.listActions}>
              <span className={styles.tag}>In use</span>
              <button type="button" className={css.button} onClick={onKeep} disabled={full}>Keep</button>
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
                <button type="button" className={css.listName} onClick={() => onEditing(open ? null : list.id)} aria-expanded={open} title="Edit this list">
                  {list.name || 'Unnamed'}
                </button>
                <span className={[styles.num, css.listCount].join(' ')}>
                  {plural(parsed.values.length, 'value')}
                  {parsed.rejected.length > 0 && <span className={css.bad}> · {parsed.rejected.length} not read</span>}
                </span>
                <span className={css.listActions}>
                  {used
                    ? <button type="button" className={css.button} data-on onClick={() => onUse(null)} title="Search the series again">In use</button>
                    : <button type="button" className={css.button} onClick={() => onUse(list.id)} disabled={!parsed.values.length}>Use</button>}
                  <button type="button" className={css.button} onClick={() => onEditing(open ? null : list.id)}>{open ? 'Close' : 'Edit'}</button>
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
        {!lists.length && !shared && <p className={css.none}>No list yet. Start an empty one and paste your values, or start from a series and take out what you lack.</p>}
      </div>

      <div className={css.starts}>
        <button type="button" className={css.button} data-primary onClick={() => add('My values', '')} disabled={full}>New list</button>
        <span className={css.startsLabel}>or start from</span>
        {LIST_PRESETS.map((p) => (
          <button key={p.name} type="button" className={styles.chip} onClick={() => preset(p)} disabled={full} title={`A new list with every ${p.series} value from 10 Ω to 1 MΩ`}>{p.name}</button>
        ))}
      </div>
    </div>
  );
}
