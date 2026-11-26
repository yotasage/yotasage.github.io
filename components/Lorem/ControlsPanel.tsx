import React from 'react';

import { clampInt, LIMITS, LOREM_PRESETS, normalizeSeed } from '../../lib/lorem/generate';
import type { LoremFormat, LoremMode, LoremOptions, LoremPreset, LoremStyle } from '../../lib/lorem/types';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Lorem.module.css';

interface ControlsPanelProps {
  options: LoremOptions;
  quickMode: boolean;
  onUpdate: (patch: Partial<LoremOptions>) => void;
  onApplyPreset: (preset: LoremPreset) => void;
  onReset: () => void;
}

interface NumberSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  sliderMax?: number;
  step?: number;
  help?: string;
  onChange: (value: number) => void;
}

function NumberSlider({
  id,
  label,
  value,
  min,
  max,
  sliderMax = max,
  step = 1,
  help,
  onChange,
}: NumberSliderProps) {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = clampInt(parsed, min, max);
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <div className={styles.numberControl}>
      <div className={styles.numberHeader}>
        <label htmlFor={id} className={styles.fieldLabel}>
          {label}
        </label>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepBtn}
            aria-label={`Decrease ${label}`}
            disabled={value <= min}
            onClick={() => onChange(clampInt(value - step, min, max))}
          >
            −
          </button>
          <input
            id={id}
            type="number"
            className={styles.numberInput}
            min={min}
            max={max}
            step={step}
            value={draft}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              const parsed = Number.parseInt(raw, 10);
              if (!Number.isNaN(parsed) && parsed >= min && parsed <= max) {
                onChange(parsed);
              }
            }}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commit((e.target as HTMLInputElement).value);
              }
            }}
          />
          <button
            type="button"
            className={styles.stepBtn}
            aria-label={`Increase ${label}`}
            disabled={value >= max}
            onClick={() => onChange(clampInt(value + step, min, max))}
          >
            +
          </button>
        </div>
      </div>
      <input
        type="range"
        className={styles.rangeInput}
        aria-label={`${label} slider`}
        min={min}
        max={sliderMax}
        step={step}
        value={Math.min(value, sliderMax)}
        onChange={(e) => onChange(clampInt(Number(e.target.value), min, max))}
      />
      {help && <p className={styles.fieldHelp}>{help}</p>}
    </div>
  );
}

const MODES: readonly { id: LoremMode; labelKey: TranslationKey }[] = [
  { id: 'paragraphs', labelKey: 'lorem.mode.paragraphs' },
  { id: 'words', labelKey: 'lorem.mode.words' },
  { id: 'sentences', labelKey: 'lorem.mode.sentences' },
  { id: 'list', labelKey: 'lorem.mode.list' },
  { id: 'characters', labelKey: 'lorem.mode.characters' },
];

const FORMATS: readonly { id: LoremFormat; labelKey: TranslationKey }[] = [
  { id: 'plain', labelKey: 'lorem.format.plain' },
  { id: 'html', labelKey: 'lorem.format.html' },
  { id: 'markdown', labelKey: 'lorem.format.markdown' },
  { id: 'json', labelKey: 'lorem.format.json' },
  { id: 'latex', labelKey: 'lorem.format.latex' },
];

const STYLES: readonly { id: LoremStyle; labelKey: TranslationKey }[] = [
  { id: 'classic', labelKey: 'lorem.style.classic' },
  { id: 'cicero', labelKey: 'lorem.style.cicero' },
  { id: 'english', labelKey: 'lorem.style.english' },
  { id: 'norwegian', labelKey: 'lorem.style.norwegian' },
];

export default function ControlsPanel({
  options,
  quickMode,
  onUpdate,
  onApplyPreset,
  onReset,
}: ControlsPanelProps) {
  const { t } = useI18n();
  const [seedDraft, setSeedDraft] = React.useState(String(options.seed));

  React.useEffect(() => {
    setSeedDraft(String(options.seed));
  }, [options.seed]);

  const commitSeed = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setSeedDraft(String(options.seed));
      return;
    }
    const next = normalizeSeed(parsed);
    setSeedDraft(String(next));
    onUpdate({ seed: next });
  };

  return (
    <section className={styles.card} aria-label={t('lorem.controls.title')}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('lorem.controls.title')}</h2>
        <button type="button" className={styles.buttonSmall} onClick={onReset}>
          {t('lorem.controls.reset')}
        </button>
      </div>

      <div className={styles.controlsStack}>
        {/* Mode selector */}
        <div className={styles.sectionBlock}>
          <span className={styles.sectionLabel} id="lorem-mode-label">
            {t('lorem.controls.modeLabel')}
          </span>
          <div className={styles.segmented} role="group" aria-labelledby="lorem-mode-label">
            {MODES.map((m) => {
              const active = options.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  className={[styles.segBtn, active ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => onUpdate({ mode: m.id })}
                >
                  {t(m.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Context-aware length controls */}
        <div className={[styles.sectionBlock, styles.sectionDivider].join(' ')}>
          {options.mode === 'paragraphs' && (
            <>
              <NumberSlider
                id="lorem-paragraphs"
                label={t('lorem.field.paragraphs')}
                value={options.paragraphs}
                min={LIMITS.paragraphs.min}
                max={LIMITS.paragraphs.max}
                sliderMax={20}
                onChange={(paragraphs) => onUpdate({ paragraphs })}
              />
              <NumberSlider
                id="lorem-words-per-para"
                label={t('lorem.field.wordsPerParagraph')}
                value={options.wordsPerParagraph}
                min={LIMITS.wordsPerParagraph.min}
                max={LIMITS.wordsPerParagraph.max}
                sliderMax={150}
                step={5}
                onChange={(wordsPerParagraph) => onUpdate({ wordsPerParagraph })}
              />
              <div className={styles.checkRow}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkInput}
                    checked={options.varyParagraphLength}
                    onChange={(e) => onUpdate({ varyParagraphLength: e.target.checked })}
                  />
                  <span>{t('lorem.field.varyParagraphLength')}</span>
                </label>
                <span className={styles.checkHelp}>{t('lorem.field.varyParagraphHelp')}</span>
              </div>
            </>
          )}

          {options.mode === 'words' && (
            <>
              <NumberSlider
                id="lorem-total-words"
                label={t('lorem.field.totalWords')}
                value={options.totalWords}
                min={LIMITS.totalWords.min}
                max={LIMITS.totalWords.max}
                sliderMax={500}
                step={5}
                onChange={(totalWords) => onUpdate({ totalWords })}
              />
              <NumberSlider
                id="lorem-word-paragraphs"
                label={t('lorem.field.wordParagraphs')}
                value={options.wordParagraphs}
                min={LIMITS.wordParagraphs.min}
                max={LIMITS.wordParagraphs.max}
                sliderMax={12}
                help={t('lorem.field.wordParagraphsHelp')}
                onChange={(wordParagraphs) => onUpdate({ wordParagraphs })}
              />
            </>
          )}

          {options.mode === 'sentences' && (
            <>
              <NumberSlider
                id="lorem-sentences"
                label={t('lorem.field.sentences')}
                value={options.sentences}
                min={LIMITS.sentences.min}
                max={LIMITS.sentences.max}
                sliderMax={30}
                onChange={(sentences) => onUpdate({ sentences })}
              />
              <NumberSlider
                id="lorem-words-per-sentence"
                label={t('lorem.field.wordsPerSentence')}
                value={options.wordsPerSentence}
                min={LIMITS.wordsPerSentence.min}
                max={LIMITS.wordsPerSentence.max}
                onChange={(wordsPerSentence) => onUpdate({ wordsPerSentence })}
              />
            </>
          )}

          {options.mode === 'list' && (
            <>
              <NumberSlider
                id="lorem-list-items"
                label={t('lorem.field.listItems')}
                value={options.listItems}
                min={LIMITS.listItems.min}
                max={LIMITS.listItems.max}
                sliderMax={25}
                onChange={(listItems) => onUpdate({ listItems })}
              />
              <NumberSlider
                id="lorem-words-per-item"
                label={t('lorem.field.wordsPerItem')}
                value={options.wordsPerItem}
                min={LIMITS.wordsPerItem.min}
                max={LIMITS.wordsPerItem.max}
                onChange={(wordsPerItem) => onUpdate({ wordsPerItem })}
              />
            </>
          )}

          {options.mode === 'characters' && (
            <NumberSlider
              id="lorem-characters"
              label={t('lorem.field.characters')}
              value={options.characters}
              min={LIMITS.characters.min}
              max={LIMITS.characters.max}
              sliderMax={1000}
              step={10}
              help={t('lorem.field.charactersHelp')}
              onChange={(characters) => onUpdate({ characters })}
            />
          )}
        </div>

        {/* Style & Format options (hidden in Quick mode) */}
        {!quickMode && (
          <div className={[styles.sectionBlock, styles.sectionDivider].join(' ')}>
            <span className={styles.sectionLabel}>{t('lorem.options.heading')}</span>

            <div className={styles.styleSeedGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="lorem-style" className={styles.fieldLabel}>
                  {t('lorem.field.style')}
                </label>
                <select
                  id="lorem-style"
                  className={styles.selectInput}
                  value={options.style}
                  onChange={(e) => onUpdate({ style: e.target.value as LoremStyle })}
                >
                  {STYLES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t(s.labelKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="lorem-seed" className={styles.fieldLabel}>
                  {t('lorem.field.seed')}
                </label>
                <input
                  id="lorem-seed"
                  type="number"
                  className={styles.seedInput}
                  title={t('lorem.field.seedHelp')}
                  min={1}
                  max={999999999}
                  value={seedDraft}
                  onChange={(e) => {
                    setSeedDraft(e.target.value);
                    const parsed = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(parsed) && parsed > 0) {
                      onUpdate({ seed: normalizeSeed(parsed) });
                    }
                  }}
                  onBlur={(e) => commitSeed(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitSeed((e.target as HTMLInputElement).value);
                    }
                  }}
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel} id="lorem-format-label">
                {t('lorem.field.format')}
              </span>
              <div className={styles.formatGrid} role="group" aria-labelledby="lorem-format-label">
                {FORMATS.map((f) => {
                  const active = options.format === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={active}
                      className={[styles.formatBtn, active ? styles.formatBtnActive : ''].filter(Boolean).join(' ')}
                      onClick={() => onUpdate({ format: f.id })}
                    >
                      {t(f.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>

            {(options.style === 'classic' || options.style === 'cicero') && (
              <div className={styles.checkRow}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkInput}
                    checked={options.startWithLorem}
                    onChange={(e) => onUpdate({ startWithLorem: e.target.checked })}
                  />
                  <span>
                    {options.style === 'cicero'
                      ? t('lorem.field.startWithCicero')
                      : t('lorem.field.startWithLorem')}
                  </span>
                </label>
              </div>
            )}

            {options.mode === 'paragraphs' && (
              <div className={styles.checkRow}>
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    className={styles.checkInput}
                    checked={options.includeHeadings}
                    onChange={(e) => onUpdate({ includeHeadings: e.target.checked })}
                  />
                  <span>{t('lorem.field.includeHeadings')}</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Quick presets */}
        <div className={[styles.sectionBlock, styles.sectionDivider].join(' ')}>
          <span className={styles.sectionLabel}>{t('lorem.presets.label')}</span>
          <div className={styles.presetsGrid}>
            {LOREM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={styles.presetBtn}
                onClick={() => onApplyPreset(preset)}
              >
                <span className={styles.presetTitle}>
                  {t(`lorem.preset.${preset.id}` as TranslationKey)}
                </span>
                <span className={styles.presetMeta}>
                  {t(`lorem.preset.${preset.id}Meta` as TranslationKey)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
