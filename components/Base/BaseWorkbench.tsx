import React from 'react';

import {
  detectPrefixRadix,
  formatBigIntInBase,
  formatInBase,
  parseInBase,
} from '../../lib/base/convert';
import {
  DEFAULT_BOARD_BASES,
  describeAllowedDigits,
  isCaseSensitive,
  SAMPLE_VALUES,
} from '../../lib/base/presets';
import {
  isParsedNumber,
  isParseError,
  type BaseSpec,
  type FormatOptions,
  type GroupingMode,
  type LetterCase,
  type ParseError,
} from '../../lib/base/types';
import type { BaseExamplePreset } from '../../lib/toolExamples/presets';
import { TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/BaseConverter.module.css';
import BaseSelector, { getBaseDisplayName } from './BaseSelector';
import BitInspector from './BitInspector';
import MultiBaseBoard from './MultiBaseBoard';
import StepsPanel from './StepsPanel';

interface BaseWorkbenchProps {
  quickMode: boolean;
  teachingMode: boolean;
  exampleRequest?: { preset: BaseExamplePreset; seq: number } | null;
}

const FRAC_PRECISION_OPTIONS = [8, 16, 32, 64] as const;

export default function BaseWorkbench({
  quickMode,
  teachingMode,
  exampleRequest = null,
}: BaseWorkbenchProps) {
  const { t } = useI18n();

  const [fromSpec, setFromSpec] = React.useState<BaseSpec>({
    radix: 10,
    alphabetId: 'standard',
  });
  const [toSpec, setToSpec] = React.useState<BaseSpec>({
    radix: 16,
    alphabetId: 'standard',
  });
  const [inputText, setInputText] = React.useState('255');

  const [grouping, setGrouping] = React.useState<GroupingMode>('space');
  const [includePrefix, setIncludePrefix] = React.useState(false);
  const [letterCase, setLetterCase] = React.useState<LetterCase>('upper');
  const [maxFracDigits, setMaxFracDigits] = React.useState<number>(16);

  const [pinnedBases, setPinnedBases] = React.useState<BaseSpec[]>(() => [
    ...DEFAULT_BOARD_BASES,
  ]);
  const [copiedOutput, setCopiedOutput] = React.useState(false);

  const lastExampleSeqRef = React.useRef(0);
  React.useEffect(() => {
    if (!exampleRequest || exampleRequest.seq === lastExampleSeqRef.current) return;
    lastExampleSeqRef.current = exampleRequest.seq;
    setFromSpec(exampleRequest.preset.from);
    setToSpec(exampleRequest.preset.to);
    setInputText(exampleRequest.preset.value);
  }, [exampleRequest]);

  const formatOptions: FormatOptions = React.useMemo(
    () => ({
      grouping,
      letterCase,
      includePrefix,
      maxFracDigits,
    }),
    [grouping, letterCase, includePrefix, maxFracDigits],
  );

  const formatError = React.useCallback(
    (err: ParseError): string => {
      switch (err.code) {
        case 'empty':
          return t('base.error.empty');
        case 'invalidRadix':
          return t('base.error.invalidRadix');
        case 'multipleDots':
          return t('base.error.multipleDots', { pos: err.position ?? 1 });
        case 'invalidChar':
          return t('base.error.invalidChar', {
            char: err.char ?? '',
            pos: err.position ?? 1,
            radix: err.radix,
            allowed: err.allowedPreview,
          });
        case 'noDigits':
          return t('base.error.noDigits', {
            radix: err.radix,
            allowed: err.allowedPreview,
          });
      }
    },
    [t],
  );

  const parseResult = React.useMemo(
    () => parseInBase(inputText, fromSpec.radix, fromSpec.alphabetId),
    [inputText, fromSpec.radix, fromSpec.alphabetId],
  );

  const parsed = isParsedNumber(parseResult) ? parseResult : null;
  const parseError = isParseError(parseResult) && parseResult.code !== 'empty' ? parseResult : null;

  const targetFormatted = React.useMemo(() => {
    if (!parsed) return null;
    return formatInBase(parsed, toSpec.radix, toSpec.alphabetId, formatOptions);
  }, [parsed, toSpec.radix, toSpec.alphabetId, formatOptions]);

  // Detect prefix mismatch (e.g. user pasted 0xDEADBEEF while From Base is 10)
  const prefixHint = React.useMemo(() => {
    const detected = detectPrefixRadix(inputText);
    if (!detected) return null;
    if (detected.radix === fromSpec.radix && fromSpec.alphabetId === 'standard') return null;
    return detected;
  }, [inputText, fromSpec.radix, fromSpec.alphabetId]);

  const handleSwap = () => {
    const nextFrom = toSpec;
    const nextTo = fromSpec;
    setFromSpec(nextFrom);
    setToSpec(nextTo);
    if (targetFormatted) {
      setInputText(targetFormatted.raw);
    }
  };

  const handleCopyOutput = async () => {
    if (!targetFormatted) return;
    try {
      await navigator.clipboard.writeText(targetFormatted.formatted);
      setCopiedOutput(true);
      window.setTimeout(() => setCopiedOutput(false), 1600);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleEditFromBoard = (spec: BaseSpec, rawValue: string) => {
    setFromSpec(spec);
    setInputText(rawValue);
  };

  const handleApplyBitInteger = (nextValue: bigint) => {
    const sign = nextValue < 0n ? '-' : '';
    const absVal = nextValue < 0n ? -nextValue : nextValue;
    const digits = formatBigIntInBase(absVal, fromSpec.radix, fromSpec.alphabetId, letterCase);
    setInputText(`${sign}${digits}`);
  };

  const fromName = getBaseDisplayName(fromSpec, t);
  const toName = getBaseDisplayName(toSpec, t);
  const fromAllowed = describeAllowedDigits(fromSpec.radix, fromSpec.alphabetId);
  const fromCaseSensitive = isCaseSensitive(fromSpec.radix, fromSpec.alphabetId);
  const toCaseSensitive = isCaseSensitive(toSpec.radix, toSpec.alphabetId);

  return (
    <div className={styles.workbenchStack}>
      {/* Primary Direct Converter Card */}
      <section className={styles.card} aria-label={t('base.tab.converter')}>
        <div className={styles.converterGrid}>
          {/* Source Column */}
          <div className={styles.converterCol}>
            <div className={styles.colTopHeader}>
              <label htmlFor="base-source-input" className={styles.colRoleLabel}>
                {t('base.fromLabel')} · {fromName}
              </label>
              <span className={styles.colMetaInline}>Base {fromSpec.radix}</span>
            </div>

            <BaseSelector
              idPrefix="from"
              spec={fromSpec}
              onChange={(next) => {
                setFromSpec(next);
              }}
            />

            <div className={styles.valueFieldWrap}>
              <textarea
                id="base-source-input"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t('base.inputPlaceholder')}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                aria-invalid={parseError !== null}
                className={[
                  styles.valueTextarea,
                  parseError !== null ? styles.valueTextareaError : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />

              {prefixHint && (
                <div className={styles.prefixBanner} role="status">
                  <span>
                    {t('base.prefixDetected', {
                      prefix: prefixHint.prefix,
                      radix: prefixHint.radix,
                    })}
                  </span>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    onClick={() =>
                      setFromSpec({ radix: prefixHint.radix, alphabetId: 'standard' })
                    }
                  >
                    {t('base.switchToBase', { radix: prefixHint.radix })}
                  </button>
                </div>
              )}

              {parseError && (
                <div className={styles.errorBox} role="alert">
                  {formatError(parseError)}
                </div>
              )}

              <div className={styles.fieldFooterRow}>
                <div className={styles.metaTextLine}>
                  <span>{t('base.allowedDigits', { digits: fromAllowed })}</span>
                  {fromCaseSensitive && (
                    <>
                      <span className={styles.metaSep} aria-hidden="true">
                        ·
                      </span>
                      <span className={styles.metaAccent}>{t('base.caseSensitiveHint')}</span>
                    </>
                  )}
                </div>

                <div className={styles.fieldActions}>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    disabled={!inputText}
                    onClick={() => setInputText('')}
                  >
                    {t('base.clear')}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Swap Button Column */}
          <div className={styles.swapCol}>
            <button
              type="button"
              className={styles.swapBtn}
              aria-label={t('base.swapAria')}
              title={t('base.swapLabel')}
              onClick={handleSwap}
            >
              ⇄
            </button>
          </div>

          {/* Target Column */}
          <div className={styles.converterCol}>
            <div className={styles.colTopHeader}>
              <span className={styles.colRoleLabel}>
                {t('base.toLabel')} · {toName}
              </span>
              <span className={styles.colMetaInline}>Base {toSpec.radix}</span>
            </div>

            <BaseSelector
              idPrefix="to"
              spec={toSpec}
              onChange={(next) => {
                setToSpec(next);
              }}
            />

            <div className={styles.valueFieldWrap}>
              <output
                htmlFor="base-source-input"
                aria-label={t('base.outputLabel')}
                aria-live="polite"
                className={[
                  styles.outputSurface,
                  !targetFormatted ? styles.outputSurfaceEmpty : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {targetFormatted ? targetFormatted.formatted : t('base.error.empty')}
              </output>

              <div className={styles.fieldFooterRow}>
                <div className={styles.metaTextLine}>
                  {targetFormatted && (
                    <>
                      <span>{t('base.digitsCount', { count: targetFormatted.digitCount })}</span>
                      {parsed?.hasFraction && (
                        <>
                          <span className={styles.metaSep} aria-hidden="true">
                            ·
                          </span>
                          <span
                            className={
                              targetFormatted.exact ? styles.metaAccent : styles.metaWarn
                            }
                          >
                            {targetFormatted.exact
                              ? t('base.exactFraction')
                              : t('base.repeatingFraction', { digits: maxFracDigits })}
                          </span>
                        </>
                      )}
                      {toCaseSensitive && (
                        <>
                          <span className={styles.metaSep} aria-hidden="true">
                            ·
                          </span>
                          <span>{t('base.caseSensitiveHint')}</span>
                        </>
                      )}
                    </>
                  )}
                </div>

                <div className={styles.fieldActions}>
                  <button
                    type="button"
                    className={[
                      styles.primaryButton,
                      copiedOutput ? styles.copyBtnCopied : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={!targetFormatted}
                    onClick={handleCopyOutput}
                  >
                    {copiedOutput ? t('base.copied') : t('base.copy')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Formatting Controls & Quick Examples */}
        <div className={styles.optionsDivider}>
          <div className={styles.optionsBar}>
            <div className={styles.optionGroup}>
              <span className={styles.optionLabel}>{t('base.opt.grouping')}</span>
              <div className={styles.segmented} role="group" aria-label={t('base.opt.grouping')}>
                {(['none', 'space', 'underscore'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={[styles.segBtn, grouping === mode ? styles.segBtnActive : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={grouping === mode}
                    onClick={() => setGrouping(mode)}
                  >
                    {mode === 'none'
                      ? t('base.opt.groupNone')
                      : mode === 'space'
                        ? t('base.opt.groupSpace')
                        : t('base.opt.groupUnderscore')}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.optionGroup}>
              <span className={styles.optionLabel}>{t('base.opt.case')}</span>
              <div className={styles.segmented} role="group" aria-label={t('base.opt.case')}>
                <button
                  type="button"
                  className={[
                    styles.segBtn,
                    letterCase === 'upper' ? styles.segBtnActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={letterCase === 'upper'}
                  onClick={() => setLetterCase('upper')}
                >
                  {t('base.opt.caseUpper')}
                </button>
                <button
                  type="button"
                  className={[
                    styles.segBtn,
                    letterCase === 'lower' ? styles.segBtnActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={letterCase === 'lower'}
                  onClick={() => setLetterCase('lower')}
                >
                  {t('base.opt.caseLower')}
                </button>
              </div>
            </div>

            <label className={styles.inlineCheck}>
              <input
                type="checkbox"
                checked={includePrefix}
                onChange={(e) => setIncludePrefix(e.target.checked)}
              />
              <span>{t('base.opt.prefix')}</span>
            </label>

            <div className={styles.optionGroup}>
              <label htmlFor="base-frac-precision" className={styles.optionLabel}>
                {t('base.opt.fracDigits')}
              </label>
              <select
                id="base-frac-precision"
                className={styles.compactSelect}
                value={maxFracDigits}
                onChange={(e) => setMaxFracDigits(Number(e.target.value))}
              >
                {FRAC_PRECISION_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.samplesRow}>
            <span className={styles.optionLabel}>{t('base.samplesLabel')}</span>
            {SAMPLE_VALUES.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className={styles.sampleBtn}
                onClick={() => {
                  setFromSpec({ radix: sample.radix, alphabetId: sample.alphabetId });
                  setInputText(sample.value);
                  if (sample.radix === toSpec.radix && sample.alphabetId === toSpec.alphabetId) {
                    setToSpec({ radix: sample.radix === 16 ? 10 : 16, alphabetId: 'standard' });
                  }
                }}
              >
                {t(sample.labelKey as TranslationKey)}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Simultaneous Live Multi-Base Board */}
      <MultiBaseBoard
        parsed={parsed}
        formatOptions={formatOptions}
        fromSpec={fromSpec}
        toSpec={toSpec}
        pinnedBases={pinnedBases}
        onPinnedBasesChange={setPinnedBases}
        onEditFromBoard={handleEditFromBoard}
        onSetTargetSpec={setToSpec}
        formatError={formatError}
      />

      {/* Interactive Bit Inspector (Standard & Teaching modes) */}
      {!quickMode && parsed && (
        <BitInspector parsed={parsed} onApplyInteger={handleApplyBitInteger} />
      )}

      {/* Step-by-Step Math Explainer (Standard & Teaching modes) */}
      {!quickMode && parsed && fromSpec.radix !== toSpec.radix && (
        <StepsPanel
          parsed={parsed}
          fromSpec={fromSpec}
          toSpec={toSpec}
          defaultOpen={teachingMode}
        />
      )}
    </div>
  );
}
