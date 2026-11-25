import React from 'react';

import {
  AlgorithmGroup,
  DEFAULT_ALGORITHMS,
  DigestEncoding,
  HASH_ALGORITHMS,
  HashAlgorithmId,
} from '../../lib/hash/types';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Hash.module.css';

interface HashToolbarProps {
  selectedAlgorithms: readonly HashAlgorithmId[];
  onToggleAlgorithm: (algo: HashAlgorithmId) => void;
  onSelectAlgorithms: (algos: readonly HashAlgorithmId[]) => void;
  encoding: DigestEncoding;
  onEncodingChange: (encoding: DigestEncoding) => void;
  hmacEnabled: boolean;
  onHmacEnabledChange: (enabled: boolean) => void;
  hmacKey: string;
  onHmacKeyChange: (key: string) => void;
  hashEmpty: boolean;
  onHashEmptyChange: (hashEmpty: boolean) => void;
  quickMode: boolean;
}

const GROUPS: readonly { id: AlgorithmGroup; labelKey: TranslationKey }[] = [
  { id: 'sha2', labelKey: 'hash.toolbar.groupSha2' },
  { id: 'modern', labelKey: 'hash.toolbar.groupModern' },
  { id: 'legacy', labelKey: 'hash.toolbar.groupLegacy' },
  { id: 'checksum', labelKey: 'hash.toolbar.groupChecksum' },
];

const SHA2_PRESET: readonly HashAlgorithmId[] = ['SHA-224', 'SHA-256', 'SHA-384', 'SHA-512'];
const MODERN_PRESET: readonly HashAlgorithmId[] = ['SHA-256', 'SHA3-256', 'SHA3-512', 'BLAKE2b-256', 'BLAKE2s-256'];
const ALL_PRESET: readonly HashAlgorithmId[] = HASH_ALGORITHMS.map((a) => a.id);

export default function HashToolbar({
  selectedAlgorithms,
  onToggleAlgorithm,
  onSelectAlgorithms,
  encoding,
  onEncodingChange,
  hmacEnabled,
  onHmacEnabledChange,
  hmacKey,
  onHmacKeyChange,
  hashEmpty,
  onHashEmptyChange,
  quickMode,
}: HashToolbarProps) {
  const { t } = useI18n();
  const selectedSet = React.useMemo(() => new Set(selectedAlgorithms), [selectedAlgorithms]);

  const visibleGroups = quickMode ? GROUPS.filter((g) => g.id === 'sha2' || g.id === 'legacy') : GROUPS;

  return (
    <section className={styles.card} aria-label={t('hash.toolbar.algorithms')}>
      <div className={styles.toolbarTop}>
        <h2 className={styles.cardTitle}>{t('hash.toolbar.algorithms')}</h2>
        {!quickMode && (
          <div className={styles.presetRow}>
            <button
              type="button"
              className={styles.presetBtn}
              onClick={() => onSelectAlgorithms(DEFAULT_ALGORITHMS)}
            >
              {t('hash.toolbar.presetCommon')}
            </button>
            <button
              type="button"
              className={styles.presetBtn}
              onClick={() => onSelectAlgorithms(SHA2_PRESET)}
            >
              {t('hash.toolbar.presetSha2')}
            </button>
            <button
              type="button"
              className={styles.presetBtn}
              onClick={() => onSelectAlgorithms(MODERN_PRESET)}
            >
              {t('hash.toolbar.presetModern')}
            </button>
            <button
              type="button"
              className={styles.presetBtn}
              onClick={() => onSelectAlgorithms(ALL_PRESET)}
            >
              {t('hash.toolbar.presetAll')}
            </button>
          </div>
        )}
      </div>

      <div className={styles.algoGroups}>
        {visibleGroups.map((group) => {
          const items = HASH_ALGORITHMS.filter((a) => {
            if (a.group !== group.id) return false;
            if (quickMode && (a.id === 'SHA-224' || a.id === 'SHA-384' || a.id === 'RIPEMD-160')) {
              return false;
            }
            return true;
          });

          return (
            <div key={group.id} className={styles.algoGroup}>
              <span className={styles.groupLabel}>{t(group.labelKey)}</span>
              <div className={styles.algoRow} role="group" aria-label={t(group.labelKey)}>
                {items.map((algo) => {
                  const active = selectedSet.has(algo.id);
                  return (
                    <button
                      key={algo.id}
                      type="button"
                      aria-pressed={active}
                      className={[styles.algoToggle, active ? styles.algoToggleActive : ''].filter(Boolean).join(' ')}
                      onClick={() => onToggleAlgorithm(algo.id)}
                    >
                      {algo.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.toolbarOptions}>
        <div className={styles.optionGroup}>
          <span>{t('hash.toolbar.format')}</span>
          <div className={styles.segmented} role="group" aria-label={t('hash.toolbar.format')}>
            {(
              [
                { id: 'hex-lower', label: t('hash.toolbar.hexLower') },
                { id: 'hex-upper', label: t('hash.toolbar.hexUpper') },
                { id: 'base64', label: t('hash.toolbar.base64') },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={encoding === opt.id}
                className={[styles.segBtn, encoding === opt.id ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => onEncodingChange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={hashEmpty}
            onChange={(e) => onHashEmptyChange(e.target.checked)}
          />
          <span>{t('hash.toolbar.hashEmpty')}</span>
        </label>

        {!quickMode && (
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={hmacEnabled}
              onChange={(e) => onHmacEnabledChange(e.target.checked)}
            />
            <span>{t('hash.toolbar.hmacToggle')}</span>
          </label>
        )}
      </div>

      {!quickMode && hmacEnabled && (
        <div className={styles.hmacRow}>
          <input
            type="text"
            className={styles.hmacInput}
            value={hmacKey}
            onChange={(e) => onHmacKeyChange(e.target.value)}
            placeholder={t('hash.toolbar.hmacPlaceholder')}
            aria-label={t('hash.toolbar.hmacToggle')}
            spellCheck={false}
            autoComplete="off"
          />
          <span className={styles.mutedNote}>{t('hash.toolbar.hmacNote')}</span>
        </div>
      )}
    </section>
  );
}
