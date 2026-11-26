import { formatCssRgba, formatHex } from '../../lib/color/parse';
import type { RGBA, SavedSwatch } from '../../lib/color/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Color.module.css';

export interface SavedSwatchesBarProps {
  saved: readonly SavedSwatch[];
  recent: readonly RGBA[];
  uppercaseHex: boolean;
  onSelect: (color: RGBA) => void;
  onRemoveSaved: (id: string) => void;
  onClearSaved: () => void;
}

export default function SavedSwatchesBar({
  saved,
  recent,
  uppercaseHex,
  onSelect,
  onRemoveSaved,
  onClearSaved,
}: SavedSwatchesBarProps) {
  const { t } = useI18n();

  return (
    <section className={styles.swatchBarCard} aria-label={t('color.swatches.saved')}>
      <div className={styles.swatchBarGrid}>
        {/* Saved Swatches */}
        <div className={styles.swatchGroup}>
          <div className={styles.swatchGroupHeader}>
            <h2 className={styles.subHeading} style={{ margin: 0 }}>
              {t('color.swatches.saved')} ({saved.length})
            </h2>
            {saved.length > 0 && (
              <button type="button" className={styles.buttonSmall} onClick={onClearSaved}>
                {t('color.swatches.clearSaved')}
              </button>
            )}
          </div>

          {saved.length === 0 ? (
            <p className={styles.emptyHint}>{t('color.swatches.empty')}</p>
          ) : (
            <div className={styles.swatchChipRow} data-testid="saved-swatches-list">
              {saved.map((sw) => {
                const hex = formatHex(sw.color, { uppercase: uppercaseHex });
                return (
                  <div key={sw.id} className={styles.swatchChip}>
                    <button
                      type="button"
                      className={styles.swatchChipBtn}
                      onClick={() => onSelect(sw.color)}
                    >
                      <span
                        className={[styles.swatchTile, styles.checkerboard].join(' ')}
                        style={{ position: 'relative', overflow: 'hidden' }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundColor: formatCssRgba(sw.color),
                          }}
                        />
                      </span>
                      <span>{hex}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.swatchRemoveBtn}
                      aria-label={t('color.swatches.removeAria', { hex })}
                      onClick={() => onRemoveSaved(sw.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Colors */}
        <div className={styles.swatchGroup}>
          <div className={styles.swatchGroupHeader}>
            <h2 className={styles.subHeading} style={{ margin: 0 }}>
              {t('color.swatches.recent')}
            </h2>
          </div>
          <div className={styles.swatchChipRow}>
            {recent.map((c, idx) => {
              const hex = formatHex(c, { uppercase: uppercaseHex });
              return (
                <button
                  key={`${hex}-${idx}`}
                  type="button"
                  className={styles.swatchTile}
                  style={{ backgroundColor: formatCssRgba(c), width: 28, height: 28, cursor: 'pointer' }}
                  onClick={() => onSelect(c)}
                  title={hex}
                  aria-label={hex}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
