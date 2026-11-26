import React from 'react';

import { CHMOD_PRESETS } from '../../lib/chmod/permissions';
import type { ChmodPreset, PresetCategory } from '../../lib/chmod/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Chmod.module.css';

type FilterId = 'all' | PresetCategory;

const FILTER_IDS: readonly FilterId[] = ['all', 'files', 'directories', 'private', 'special'] as const;

interface PresetsSectionProps {
  activePresetId: string | null;
  onSelectPreset: (preset: ChmodPreset) => void;
}

export default function PresetsSection({ activePresetId, onSelectPreset }: PresetsSectionProps) {
  const { t } = useI18n();
  const [filter, setFilter] = React.useState<FilterId>('all');

  const visiblePresets = React.useMemo(() => {
    if (filter === 'all') return CHMOD_PRESETS;
    return CHMOD_PRESETS.filter((preset) => preset.category === filter);
  }, [filter]);

  return (
    <section className={styles.card} aria-labelledby="chmod-presets-heading">
      <div className={styles.presetsHeader}>
        <div>
          <h2 id="chmod-presets-heading" className={styles.cardTitle}>
            {t('chmod.presets.title')}
          </h2>
          <p className={styles.cardSub}>{t('chmod.presets.subtitle')}</p>
        </div>

        <div
          className={styles.segmented}
          role="group"
          aria-label={t('chmod.presets.filterAria')}
        >
          {FILTER_IDS.map((id) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                className={[styles.segBtn, active ? styles.segBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setFilter(id)}
              >
                {t(`chmod.presets.filter.${id}` as const)}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.presetsGrid}>
        {visiblePresets.map((preset) => {
          const active = activePresetId === preset.id;
          const isCaution = preset.safety === 'caution';
          const title = t(`chmod.preset.${preset.id}.title` as 'chmod.preset.755.title');
          const desc = t(`chmod.preset.${preset.id}.desc` as 'chmod.preset.755.desc');
          const safetyLabel = t(`chmod.presets.safety.${preset.safety}` as const);

          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectPreset(preset)}
              className={[
                styles.presetCard,
                isCaution ? styles.presetCardCaution : '',
                active ? (isCaution ? styles.presetCardCautionActive : styles.presetCardActive) : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className={styles.presetTopRow}>
                <span className={styles.presetCodeGroup}>
                  <span
                    className={[
                      styles.presetOctal,
                      isCaution ? styles.presetOctalCaution : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {preset.octal}
                  </span>
                  <span className={styles.presetSymbolic}>{preset.symbolic}</span>
                </span>
                <span
                  className={[
                    styles.presetMeta,
                    isCaution ? styles.presetMetaCaution : '',
                    active && !isCaution ? styles.presetMetaActive : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {active ? `${t('chmod.presets.active')} · ${safetyLabel}` : safetyLabel}
                </span>
              </span>

              <span className={styles.presetTitle}>{title}</span>
              <span className={styles.presetDesc}>{desc}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
