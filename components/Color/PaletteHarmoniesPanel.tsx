import { useMemo, useState } from 'react';

import { pickReadableInk } from '../../lib/color/accessibility';
import {
  buildMixRamp,
  exportPalette,
  generateOklchScale,
  generateTintsShadesTones,
  getHarmonyColors,
  type PaletteExportFormat,
  type SwatchStep,
} from '../../lib/color/palette';
import { formatHex, parseColorString } from '../../lib/color/parse';
import type { HarmonyKind, MixSpace, RGBA } from '../../lib/color/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Color.module.css';

export interface PaletteHarmoniesPanelProps {
  color: RGBA;
  uppercaseHex: boolean;
  harmonyKind: HarmonyKind;
  onHarmonyKindChange: (kind: HarmonyKind) => void;
  onSelectColor: (next: RGBA) => void;
  onSaveColors: (colors: readonly RGBA[]) => void;
}

type PaletteSubTab = 'harmonies' | 'scale' | 'tints' | 'mixer';

const HARMONY_KINDS: readonly HarmonyKind[] = [
  'complementary',
  'analogous',
  'triadic',
  'split',
  'tetradic',
  'monochromatic',
];

const MIX_SPACES: readonly { id: MixSpace; label: string }[] = [
  { id: 'oklch', label: 'OKLCH (Perceptual)' },
  { id: 'lab', label: 'CIE Lab' },
  { id: 'hsl', label: 'HSL' },
  { id: 'srgb', label: 'sRGB' },
];

const EXPORT_FORMATS: readonly { id: PaletteExportFormat; label: string }[] = [
  { id: 'css', label: 'CSS' },
  { id: 'tailwind', label: 'Tailwind' },
  { id: 'scss', label: 'SCSS' },
  { id: 'json', label: 'JSON' },
  { id: 'svg', label: 'SVG' },
];

export default function PaletteHarmoniesPanel({
  color,
  uppercaseHex,
  harmonyKind,
  onHarmonyKindChange,
  onSelectColor,
  onSaveColors,
}: PaletteHarmoniesPanelProps) {
  const { t } = useI18n();
  const [subTab, setSubTab] = useState<PaletteSubTab>('harmonies');
  const [mixEnd, setMixEnd] = useState<RGBA>({ r: 236, g: 72, b: 153, a: 1 });
  const [mixEndDraft, setMixEndDraft] = useState<string>('#EC4899');
  const [mixSteps, setMixSteps] = useState<number>(7);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<PaletteExportFormat>('css');
  const [exportPrefix, setExportPrefix] = useState<string>('brand');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);

  const harmonySwatches = useMemo(
    () => getHarmonyColors(color, harmonyKind),
    [color, harmonyKind],
  );
  const oklchScale = useMemo(() => generateOklchScale(color), [color]);
  const tintsShadesTones = useMemo(() => generateTintsShadesTones(color, 7), [color]);

  const mixerRamps = useMemo(() => {
    return MIX_SPACES.map((sp) => ({
      ...sp,
      swatches: buildMixRamp(color, mixEnd, mixSteps, sp.id),
    }));
  }, [color, mixEnd, mixSteps]);

  const activeExportSwatches = useMemo<readonly SwatchStep[]>(() => {
    if (subTab === 'scale') return oklchScale;
    if (subTab === 'tints') return [...tintsShadesTones.tints, ...tintsShadesTones.shades.slice(1)];
    if (subTab === 'mixer') return mixerRamps[0].swatches;
    return harmonySwatches;
  }, [harmonySwatches, mixerRamps, oklchScale, subTab, tintsShadesTones]);

  const exportedText = useMemo(
    () => exportPalette(activeExportSwatches, exportFormat, exportPrefix),
    [activeExportSwatches, exportFormat, exportPrefix],
  );

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1300);
  };

  const handleDownloadSvg = () => {
    const svg = exportPalette(activeExportSwatches, 'svg', exportPrefix);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportPrefix || 'palette'}-swatches.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveCurrentSet = () => {
    onSaveColors(activeExportSwatches.map((s) => s.color));
    setSavedFeedback(true);
    window.setTimeout(() => setSavedFeedback(false), 1200);
  };

  const formatDisplayHex = (c: RGBA) => formatHex(c, { uppercase: uppercaseHex });

  return (
    <section className={styles.card} aria-labelledby="palette-panel-heading">
      <div className={styles.cardHeader}>
        <h2 id="palette-panel-heading" className={styles.cardTitle}>
          {t('color.palette.heading')}
        </h2>
        <div className={styles.segmented} role="tablist" aria-label={t('color.palette.subtabAria')}>
          {(
            [
              ['harmonies', t('color.palette.tabHarmonies')],
              ['scale', t('color.palette.tabScale')],
              ['tints', t('color.palette.tabTints')],
              ['mixer', t('color.palette.tabMixer')],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              className={[styles.segBtn, subTab === id ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setSubTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Harmonies Tab */}
      {subTab === 'harmonies' && (
        <div>
          <div className={styles.paletteToolbar}>
            <div className={styles.segmented} role="group" aria-label={t('color.palette.harmonyAria')}>
              {HARMONY_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={harmonyKind === kind}
                  className={[styles.segBtn, harmonyKind === kind ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => onHarmonyKindChange(kind)}
                >
                  {t(`color.palette.harmony.${kind}`)}
                </button>
              ))}
            </div>
            <div className={styles.toolbarGroup}>
              <button
                type="button"
                className={[styles.buttonSmall, savedFeedback ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
                onClick={handleSaveCurrentSet}
              >
                {savedFeedback ? t('color.picker.saved') : t('color.palette.addAll')}
              </button>
              <button type="button" className={styles.buttonSmall} onClick={() => setExportOpen((v) => !v)}>
                {t('color.palette.export')}
              </button>
            </div>
          </div>

          <div className={styles.harmonyStrip}>
            {harmonySwatches.map((sw) => {
              const hex = formatDisplayHex(sw.color);
              const ink = pickReadableInk(sw.color);
              return (
                <button
                  key={`${sw.label}-${hex}`}
                  type="button"
                  className={styles.swatchCardBtn}
                  style={{ backgroundColor: hex, color: ink }}
                  onClick={() => onSelectColor(sw.color)}
                >
                  <span className={styles.swatchCardLabel}>{sw.label}</span>
                  <span className={styles.swatchCardHex}>{hex}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 50-950 OKLCH UI Scale Tab */}
      {subTab === 'scale' && (
        <div>
          <div className={styles.paletteToolbar}>
            <span className={styles.emptyHint}>{t('color.palette.scaleNote')}</span>
            <div className={styles.toolbarGroup}>
              <button
                type="button"
                className={[styles.buttonSmall, savedFeedback ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
                onClick={handleSaveCurrentSet}
              >
                {savedFeedback ? t('color.picker.saved') : t('color.palette.addAll')}
              </button>
              <button type="button" className={styles.buttonSmall} onClick={() => setExportOpen((v) => !v)}>
                {t('color.palette.export')}
              </button>
            </div>
          </div>

          <div className={styles.scaleStrip}>
            {oklchScale.map((sw) => {
              const hex = formatDisplayHex(sw.color);
              const ink = pickReadableInk(sw.color);
              return (
                <button
                  key={sw.label}
                  type="button"
                  className={styles.scaleCellBtn}
                  style={{ backgroundColor: hex, color: ink }}
                  onClick={() => onSelectColor(sw.color)}
                  title={`${sw.label}: ${hex}`}
                >
                  <span className={styles.swatchCardLabel}>{sw.label}</span>
                  <span className={styles.swatchCardHex}>{hex.slice(1)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tints, Shades & Tones Tab */}
      {subTab === 'tints' && (
        <div className={styles.tintsStack}>
          {(
            [
              ['tints', t('color.palette.tints'), tintsShadesTones.tints],
              ['shades', t('color.palette.shades'), tintsShadesTones.shades],
              ['tones', t('color.palette.tones'), tintsShadesTones.tones],
            ] as const
          ).map(([key, label, items]) => (
            <div key={key}>
              <h3 className={styles.subHeading}>{label}</h3>
              <div className={styles.tintStrip}>
                {items.map((sw) => {
                  const hex = formatDisplayHex(sw.color);
                  const ink = pickReadableInk(sw.color);
                  return (
                    <button
                      key={`${key}-${sw.label}`}
                      type="button"
                      className={styles.scaleCellBtn}
                      style={{ backgroundColor: hex, color: ink, minHeight: 58 }}
                      onClick={() => onSelectColor(sw.color)}
                    >
                      <span className={styles.swatchCardLabel}>{sw.label}</span>
                      <span className={styles.swatchCardHex}>{hex.slice(1)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Multi-Space Color Mixer Tab */}
      {subTab === 'mixer' && (
        <div>
          <div className={styles.mixerControls}>
            <label className={styles.inlineColorPick}>
              <span className={styles.sliderLabel}>{t('color.palette.mixerEndLabel')}</span>
              <input
                type="color"
                value={formatHex({ ...mixEnd, a: 1 }, { includeAlpha: false })}
                onChange={(e) => {
                  const parsed = parseColorString(e.target.value);
                  if (parsed) {
                    setMixEnd(parsed);
                    setMixEndDraft(formatHex(parsed, { uppercase: uppercaseHex }));
                  }
                }}
                className={styles.nativeColorInput}
                aria-label={t('color.palette.mixerEndLabel')}
              />
              <input
                type="text"
                value={mixEndDraft}
                onChange={(e) => {
                  setMixEndDraft(e.target.value);
                  const parsed = parseColorString(e.target.value);
                  if (parsed) setMixEnd(parsed);
                }}
                className={styles.numInput}
                style={{ width: 92, textAlign: 'left' }}
                aria-label={t('color.palette.mixerEndLabel')}
              />
            </label>

            <div className={styles.segmented} role="group" aria-label={t('color.palette.mixerSteps')}>
              {[5, 7, 9, 11].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={mixSteps === n}
                  className={[styles.segBtn, mixSteps === n ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setMixSteps(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={styles.buttonSmall}
              onClick={() => {
                const prevStart = color;
                onSelectColor(mixEnd);
                setMixEnd(prevStart);
                setMixEndDraft(formatHex(prevStart, { uppercase: uppercaseHex }));
              }}
            >
              {t('color.palette.mixerSwap')}
            </button>

            <button
              type="button"
              className={[styles.buttonSmall, copiedId === 'grad' ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
              onClick={() => {
                const stops = mixerRamps[0].swatches.map((s) => s.hex).join(', ');
                copyText('grad', `background: linear-gradient(90deg, ${stops});`);
              }}
            >
              {copiedId === 'grad' ? t('color.formats.copied') : t('color.palette.mixerCopyCss')}
            </button>
          </div>

          <div className={styles.mixerSpaceList}>
            {mixerRamps.map((row) => (
              <div key={row.id} className={styles.mixerSpaceRow}>
                <div className={styles.mixerSpaceHead}>
                  <span>{row.label}</span>
                </div>
                <div className={styles.mixerRamp}>
                  {row.swatches.map((sw, idx) => {
                    const hex = formatDisplayHex(sw.color);
                    const ink = pickReadableInk(sw.color);
                    return (
                      <button
                        key={`${row.id}-${idx}`}
                        type="button"
                        className={styles.mixerCell}
                        style={{ backgroundColor: hex, color: ink }}
                        onClick={() => onSelectColor(sw.color)}
                        title={`${row.label} ${sw.label}: ${hex}`}
                      >
                        {mixSteps <= 7 ? hex.slice(1) : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline Export Drawer */}
      {exportOpen && (
        <div className={styles.exportBox}>
          <div className={styles.paletteToolbar} style={{ marginBottom: 0 }}>
            <div className={styles.toolbarGroup}>
              <span className={styles.subHeading} style={{ margin: 0 }}>
                {t('color.palette.exportTitle')}
              </span>
              <div className={styles.segmented} role="group" aria-label={t('color.palette.exportTitle')}>
                {EXPORT_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={exportFormat === f.id}
                    className={[styles.segBtn, exportFormat === f.id ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setExportFormat(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.toolbarGroup}>
              <input
                type="text"
                value={exportPrefix}
                onChange={(e) => setExportPrefix(e.target.value)}
                aria-label={t('color.palette.exportPrefix')}
                className={styles.numInput}
                style={{ width: 96, textAlign: 'left' }}
              />
              <button
                type="button"
                className={[styles.buttonSmall, copiedId === 'export' ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
                onClick={() => copyText('export', exportedText)}
              >
                {copiedId === 'export' ? t('color.formats.copied') : t('color.formats.copy')}
              </button>
              <button type="button" className={styles.buttonSmall} onClick={handleDownloadSvg}>
                {t('color.palette.exportDownloadSvg')}
              </button>
              <button type="button" className={styles.buttonSmall} onClick={() => setExportOpen(false)}>
                {t('color.palette.exportClose')}
              </button>
            </div>
          </div>

          <pre className={styles.exportPre}>
            <code>{exportedText}</code>
          </pre>
        </div>
      )}
    </section>
  );
}
