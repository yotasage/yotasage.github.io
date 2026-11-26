import React from 'react';

import { formatInBase, parseInBase } from '../../lib/base/convert';
import {
  baseSpecKey,
  DEFAULT_BOARD_BASES,
  MAX_RADIX,
  MIN_RADIX,
  normalizeAlphabetForRadix,
} from '../../lib/base/presets';
import type {
  AlphabetId,
  BaseSpec,
  FormatOptions,
  ParsedNumber,
  ParseError,
} from '../../lib/base/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/BaseConverter.module.css';
import { getBaseDisplayName } from './BaseSelector';

interface MultiBaseBoardProps {
  parsed: ParsedNumber | null;
  formatOptions: FormatOptions;
  fromSpec: BaseSpec;
  toSpec: BaseSpec;
  pinnedBases: readonly BaseSpec[];
  onPinnedBasesChange: (next: BaseSpec[]) => void;
  onEditFromBoard: (spec: BaseSpec, rawValue: string) => void;
  onSetTargetSpec: (spec: BaseSpec) => void;
  formatError: (err: ParseError) => string;
}

export default function MultiBaseBoard({
  parsed,
  formatOptions,
  fromSpec,
  toSpec,
  pinnedBases,
  onPinnedBasesChange,
  onEditFromBoard,
  onSetTargetSpec,
  formatError,
}: MultiBaseBoardProps) {
  const { t } = useI18n();
  const [editingKey, setEditingKey] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState('');
  const [editError, setEditError] = React.useState<string | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const [addRadix, setAddRadix] = React.useState('12');
  const [addAlphabet, setAddAlphabet] = React.useState<AlphabetId>('standard');

  const addRadixNum = Number(addRadix);
  const validAddRadix =
    Number.isInteger(addRadixNum) && addRadixNum >= MIN_RADIX && addRadixNum <= MAX_RADIX;

  const effectiveAddAlpha: AlphabetId = validAddRadix
    ? normalizeAlphabetForRadix(addRadixNum, addAlphabet)
    : 'standard';

  const candidateKey = validAddRadix
    ? baseSpecKey({ radix: addRadixNum, alphabetId: effectiveAddAlpha })
    : '';
  const alreadyPinned = pinnedBases.some((b) => baseSpecKey(b) === candidateKey);

  const handleAddBase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validAddRadix || alreadyPinned) return;
    onPinnedBasesChange([
      ...pinnedBases,
      { radix: addRadixNum, alphabetId: effectiveAddAlpha },
    ]);
  };

  const handleCopy = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1600);
    } catch {
      // Clipboard unavailable in restricted contexts
    }
  };

  const isDefaultList =
    pinnedBases.length === DEFAULT_BOARD_BASES.length &&
    pinnedBases.every((b, idx) => baseSpecKey(b) === baseSpecKey(DEFAULT_BOARD_BASES[idx]));

  return (
    <section className={styles.card} aria-labelledby="multi-base-board-title">
      <div className={styles.cardHeader}>
        <div>
          <h2 id="multi-base-board-title" className={styles.cardTitle}>
            {t('base.board.title')}
          </h2>
          <p className={styles.cardSub}>{t('base.board.sub')}</p>
        </div>

        <form className={styles.addBaseBar} onSubmit={handleAddBase}>
          <div className={styles.radixStepper}>
            <label htmlFor="board-add-radix" className={styles.radixStepperLabel}>
              {t('base.anyBaseLabel')}
            </label>
            <input
              id="board-add-radix"
              type="number"
              inputMode="numeric"
              min={MIN_RADIX}
              max={MAX_RADIX}
              value={addRadix}
              aria-label={t('base.board.addRadixAria')}
              className={styles.radixNumberInput}
              onChange={(e) => {
                setAddRadix(e.target.value);
                const num = Number(e.target.value);
                if (num === 58) setAddAlphabet('base58');
                else if (num === 64) setAddAlphabet('rfc4648');
                else if (num === 32) setAddAlphabet('standard');
                else setAddAlphabet('standard');
              }}
            />
          </div>

          {(addRadixNum === 32 || addRadixNum === 58 || addRadixNum === 64) && (
            <select
              aria-label={t('base.board.addAlphabetAria')}
              className={styles.compactSelect}
              value={effectiveAddAlpha}
              onChange={(e) => setAddAlphabet(e.target.value as AlphabetId)}
            >
              <option value="standard">0–9 A–Z…</option>
              {addRadixNum === 32 && <option value="crockford32">Crockford</option>}
              {addRadixNum === 58 && <option value="base58">Bitcoin</option>}
              {addRadixNum === 64 && <option value="rfc4648">RFC 4648</option>}
            </select>
          )}

          <button
            type="submit"
            className={styles.buttonSmall}
            disabled={!validAddRadix || alreadyPinned}
            title={alreadyPinned ? t('base.board.alreadyPinned') : undefined}
          >
            + {t('base.board.addBtn')}
          </button>

          {!isDefaultList && (
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={() => onPinnedBasesChange([...DEFAULT_BOARD_BASES])}
            >
              {t('base.board.resetBtn')}
            </button>
          )}
        </form>
      </div>

      <div className={styles.boardList}>
        {pinnedBases.map((spec) => {
          const key = baseSpecKey(spec);
          const name = getBaseDisplayName(spec, t);
          const isEditing = editingKey === key;
          const formattedObj = parsed
            ? formatInBase(parsed, spec.radix, spec.alphabetId, formatOptions)
            : null;
          const displayVal = isEditing ? editDraft : (formattedObj?.formatted ?? '');
          const isFrom = baseSpecKey(fromSpec) === key;
          const isTo = baseSpecKey(toSpec) === key;
          const isCopied = copiedKey === key;

          return (
            <div
              key={key}
              className={[
                styles.boardRow,
                isFrom || isTo ? styles.boardRowActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.boardLabelCell}>
                <label htmlFor={`board-input-${key}`} className={styles.boardName}>
                  {name}
                </label>
                <span className={styles.boardMeta}>
                  Base {spec.radix}
                  {formattedObj ? ` · ${t('base.digitsCount', { count: formattedObj.digitCount })}` : ''}
                  {isFrom ? ` · ${t('base.fromLabel')}` : isTo ? ` · ${t('base.toLabel')}` : ''}
                </span>
              </div>

              <div className={styles.boardInputWrap}>
                <input
                  id={`board-input-${key}`}
                  type="text"
                  value={displayVal}
                  spellCheck={false}
                  autoComplete="off"
                  className={[
                    styles.boardInput,
                    isEditing && editError ? styles.boardInputError : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onFocus={() => {
                    setEditingKey(key);
                    setEditDraft(formattedObj?.formatted ?? '');
                    setEditError(null);
                  }}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setEditingKey(key);
                    setEditDraft(nextVal);
                    const check = parseInBase(nextVal, spec.radix, spec.alphabetId);
                    if (check.ok) {
                      setEditError(null);
                      onEditFromBoard(spec, nextVal);
                    } else if (check.code === 'empty') {
                      setEditError(null);
                      onEditFromBoard(spec, '');
                    } else {
                      setEditError(formatError(check));
                    }
                  }}
                  onBlur={() => {
                    setEditingKey(null);
                    setEditError(null);
                  }}
                />
                {isEditing && editError && (
                  <span className={styles.boardRowError} role="alert">
                    {editError}
                  </span>
                )}
              </div>

              <div className={styles.boardActions}>
                {!isTo && (
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    onClick={() => onSetTargetSpec(spec)}
                  >
                    {t('base.toLabel')}
                  </button>
                )}
                <button
                  type="button"
                  className={[styles.buttonSmall, isCopied ? styles.copyBtnCopied : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={t('base.board.copyAria', { name })}
                  disabled={!formattedObj}
                  onClick={() => handleCopy(key, formattedObj?.formatted ?? '')}
                >
                  {isCopied ? t('base.copied') : t('base.copy')}
                </button>
                {pinnedBases.length > 2 && (
                  <button
                    type="button"
                    className={styles.removeRowBtn}
                    aria-label={t('base.board.removeAria', { name })}
                    title={t('base.board.removeAria', { name })}
                    onClick={() =>
                      onPinnedBasesChange(pinnedBases.filter((b) => baseSpecKey(b) !== key))
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
