import React, { useEffect, useMemo, useState } from 'react';

import { findNearestNamedColor } from '../../lib/color/convert';
import { getAllFormats, getCodeSnippets, parseColorString } from '../../lib/color/parse';
import type { ColorFormatItem, RGBA } from '../../lib/color/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Color.module.css';

export interface ColorFormatsPanelProps {
  color: RGBA;
  uppercaseHex: boolean;
  onUppercaseHexChange: (next: boolean) => void;
  onChange: (next: RGBA, commitPrevious?: boolean) => void;
  quickMode?: boolean;
}

const CORE_FORMAT_IDS = new Set<ColorFormatItem['id']>(['hex', 'rgb', 'hsl', 'hsv', 'cmyk', 'oklch']);

export default function ColorFormatsPanel({
  color,
  uppercaseHex,
  onUppercaseHexChange,
  onChange,
  quickMode = false,
}: ColorFormatsPanelProps) {
  const { t } = useI18n();
  const [universalDraft, setUniversalDraft] = useState<string>('');
  const [universalError, setUniversalError] = useState<boolean>(false);
  const [editingRow, setEditingRow] = useState<{ id: string; value: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllFormats, setShowAllFormats] = useState<boolean>(!quickMode);

  useEffect(() => {
    setShowAllFormats(!quickMode);
  }, [quickMode]);

  const formats = useMemo(() => getAllFormats(color, uppercaseHex), [color, uppercaseHex]);
  const visibleFormats = useMemo(
    () => (showAllFormats ? formats : formats.filter((f) => CORE_FORMAT_IDS.has(f.id))),
    [formats, showAllFormats],
  );
  const nearest = useMemo(() => findNearestNamedColor(color), [color]);
  const snippets = useMemo(() => getCodeSnippets(color, uppercaseHex), [color, uppercaseHex]);

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((cur) => (cur === id ? null : cur));
      }, 1300);
    } catch {
      // Fallback for non-secure contexts
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopiedId(id);
        window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1300);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  const handleUniversalChange = (value: string) => {
    setUniversalDraft(value);
    if (!value.trim()) {
      setUniversalError(false);
      return;
    }
    const parsed = parseColorString(value);
    if (parsed) {
      setUniversalError(false);
      onChange(parsed, true);
    } else {
      setUniversalError(true);
    }
  };

  const handleUniversalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!universalDraft.trim()) {
      setUniversalError(false);
      return;
    }
    const parsed = parseColorString(universalDraft);
    if (parsed) {
      setUniversalError(false);
      onChange(parsed, true);
    } else {
      setUniversalError(true);
    }
  };

  const handleRowChange = (id: string, raw: string) => {
    setEditingRow({ id, value: raw });
    const parsed = parseColorString(raw);
    if (parsed) {
      onChange(parsed, false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="color-formats-heading">
      <div className={styles.cardHeader}>
        <h2 id="color-formats-heading" className={styles.cardTitle}>
          {t('color.formats.heading')}
        </h2>
        <div className={styles.toolbarGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={uppercaseHex}
              onChange={(e) => onUppercaseHexChange(e.target.checked)}
            />
            <span>{t('color.formats.uppercaseHex')}</span>
          </label>
          <div className={styles.segmented} role="group" aria-label={t('color.formats.heading')}>
            <button
              type="button"
              aria-pressed={!showAllFormats}
              className={[styles.segBtn, !showAllFormats ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setShowAllFormats(false)}
            >
              {t('color.formats.showCoreFormats')}
            </button>
            <button
              type="button"
              aria-pressed={showAllFormats}
              className={[styles.segBtn, showAllFormats ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setShowAllFormats(true)}
            >
              {t('color.formats.showMoreFormats')}
            </button>
          </div>
        </div>
      </div>

      {/* Universal Smart Input */}
      <form onSubmit={handleUniversalSubmit} className={styles.universalInputGroup} noValidate>
        <label htmlFor="color-universal-input" className={styles.sliderLabel}>
          {t('color.formats.inputLabel')}
        </label>
        <div className={styles.universalRow}>
          <input
            id="color-universal-input"
            data-testid="universal-color-input"
            type="text"
            value={universalDraft}
            onChange={(e) => handleUniversalChange(e.target.value)}
            placeholder={t('color.formats.inputPlaceholder')}
            className={[styles.textInput, universalError ? styles.textInputError : ''].filter(Boolean).join(' ')}
            aria-invalid={universalError}
            spellCheck={false}
            autoComplete="off"
          />
          {universalDraft && (
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setUniversalDraft('');
                setUniversalError(false);
              }}
            >
              ×
            </button>
          )}
        </div>
        {universalError && (
          <p className={styles.errorText} role="alert">
            {t('color.formats.inputError')}
          </p>
        )}
      </form>

      {/* Live Bi-Directional Conversion Table */}
      <ul className={styles.formatList} aria-label={t('color.formats.heading')}>
        {visibleFormats.map((item) => {
          const isEditing = editingRow?.id === item.id;
          const displayValue = isEditing ? editingRow.value : item.value;
          const isCopied = copiedId === item.id;
          return (
            <li key={item.id} className={styles.formatRow}>
              <span className={styles.formatLabel}>
                {item.label}
                {item.shortNote ? ` (${item.shortNote})` : ''}
              </span>
              <input
                type="text"
                value={displayValue}
                onFocus={() => setEditingRow({ id: item.id, value: item.value })}
                onChange={(e) => handleRowChange(item.id, e.target.value)}
                onBlur={() => setEditingRow(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    setEditingRow(null);
                    e.currentTarget.blur();
                  }
                }}
                aria-label={item.label}
                className={styles.formatValueInput}
                spellCheck={false}
              />
              <button
                type="button"
                className={[styles.buttonSmall, styles.formatAction, isCopied ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
                onClick={() => copyText(item.id, item.value)}
                aria-label={t('color.formats.copyAria', { label: item.label })}
              >
                {isCopied ? t('color.formats.copied') : t('color.formats.copy')}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Nearest CSS Named Color with ΔE2000 */}
      <div className={styles.formatMetaRow}>
        <div className={styles.nearestWrap}>
          <span>{t('color.formats.nearestName')}:</span>
          <span className={styles.nearestDot} style={{ backgroundColor: nearest.hex }} aria-hidden="true" />
          <span className={styles.nearestName}>{nearest.name}</span>
          <span className={styles.metaMuted}>
            {nearest.deltaE < 0.05
              ? t('color.formats.exactMatch')
              : t('color.formats.deltaE', { value: nearest.deltaE.toFixed(1) })}
          </span>
        </div>
        {nearest.deltaE >= 0.05 && (
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => onChange({ ...nearest.rgb, a: color.a }, true)}
          >
            {t('color.formats.applyNearest')}
          </button>
        )}
      </div>

      {/* Developer Code Snippets */}
      {!quickMode && (
        <div className={styles.snippetsSection}>
          <h3 className={styles.subHeading}>{t('color.formats.snippetsHeading')}</h3>
          <div className={styles.snippetGrid}>
            {snippets.map((sn) => {
              const isCopied = copiedId === `sn-${sn.id}`;
              return (
                <div key={sn.id} className={styles.snippetItem}>
                  <div className={styles.snippetText}>
                    <span className={styles.snippetLabel}>{sn.label}</span>
                    <code className={styles.snippetCode} title={sn.code}>
                      {sn.code}
                    </code>
                  </div>
                  <button
                    type="button"
                    className={[styles.buttonSmall, isCopied ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
                    onClick={() => copyText(`sn-${sn.id}`, sn.code)}
                    aria-label={t('color.formats.copyAria', { label: sn.label })}
                  >
                    {isCopied ? t('color.formats.copied') : t('color.formats.copy')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
