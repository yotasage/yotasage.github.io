import { useCallback, useEffect, useMemo, useState } from 'react';

import ColorFormatsPanel from '../../components/Color/ColorFormatsPanel';
import ColorGuide from '../../components/Color/ColorGuide';
import ColorPickerStage from '../../components/Color/ColorPickerStage';
import ContrastCvdPanel from '../../components/Color/ContrastCvdPanel';
import ImageColorPicker from '../../components/Color/ImageColorPicker';
import PaletteHarmoniesPanel from '../../components/Color/PaletteHarmoniesPanel';
import SavedSwatchesBar from '../../components/Color/SavedSwatchesBar';
import PageHead from '../../components/PageHead';
import ExamplesGallery from '../../components/UI/ExamplesGallery';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { normalizeRgba } from '../../lib/color/convert';
import { formatHex } from '../../lib/color/parse';
import type { HarmonyKind, RGBA, SavedSwatch } from '../../lib/color/types';
import { COLOR_EXAMPLES } from '../../lib/toolExamples/presets';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Color.module.css';

type WorkspaceId = 'workbench' | 'image' | 'examples' | 'guide';

const STORAGE_KEY_SAVED = 'yotasage.color.savedSwatches.v1';

const INITIAL_COLOR: RGBA = { r: 37, g: 99, b: 235, a: 1 };
const INITIAL_RECENT: readonly RGBA[] = [
  { r: 37, g: 99, b: 235, a: 1 },
  { r: 219, g: 39, b: 119, a: 1 },
  { r: 13, g: 148, b: 136, a: 1 },
  { r: 234, g: 88, b: 12, a: 1 },
  { r: 124, g: 58, b: 237, a: 1 },
  { r: 15, g: 23, b: 42, a: 1 },
];

export default function ColorConverterPage() {
  useDesignSystemPage('#db2777', '#f472b6');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = useState<WorkspaceId>('workbench');
  const [color, setColor] = useState<RGBA>(INITIAL_COLOR);
  const [previousColor, setPreviousColor] = useState<RGBA>({ r: 219, g: 39, b: 119, a: 1 });
  const [uppercaseHex, setUppercaseHex] = useState<boolean>(true);
  const [harmonyKind, setHarmonyKind] = useState<HarmonyKind>('triadic');
  const [recentColors, setRecentColors] = useState<RGBA[]>([...INITIAL_RECENT]);
  const [savedSwatches, setSavedSwatches] = useState<SavedSwatch[]>([]);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Hydrate saved swatches from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_SAVED);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedSwatch[];
        if (Array.isArray(parsed)) {
          setSavedSwatches(parsed.slice(0, 48));
        }
      }
    } catch {
      // ignore storage failures
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(savedSwatches));
    } catch {
      // ignore storage failures
    }
  }, [hydrated, savedSwatches]);

  const pushRecent = useCallback((next: RGBA) => {
    const hex = formatHex(next);
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => formatHex(c) !== hex);
      return [next, ...filtered].slice(0, 12);
    });
  }, []);

  const handleColorChange = useCallback(
    (nextRaw: RGBA, commitPrevious = false) => {
      const next = normalizeRgba(nextRaw);
      setColor((cur) => {
        if (commitPrevious && formatHex(cur) !== formatHex(next)) {
          setPreviousColor(cur);
          pushRecent(next);
        }
        return next;
      });
    },
    [pushRecent],
  );

  const handleRestorePrevious = useCallback(() => {
    setColor((cur) => {
      const target = previousColor;
      setPreviousColor(cur);
      return target;
    });
  }, [previousColor]);

  const handleSaveColors = useCallback((colorsToAdd: readonly RGBA[]) => {
    setSavedSwatches((prev) => {
      const existing = new Set(prev.map((s) => formatHex(s.color)));
      const added: SavedSwatch[] = [];
      for (const c of colorsToAdd) {
        const norm = normalizeRgba(c);
        const hex = formatHex(norm);
        if (existing.has(hex)) continue;
        existing.add(hex);
        added.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          hex,
          color: norm,
        });
      }
      return [...added, ...prev].slice(0, 48);
    });
  }, []);

  const handleSaveCurrent = useCallback(() => {
    handleSaveColors([color]);
    pushRecent(color);
  }, [color, handleSaveColors, pushRecent]);

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'workbench', label: t('color.tab.workbench') },
    { id: 'image', label: t('color.tab.image') },
    { id: 'examples', label: t('ex.tab') },
    { id: 'guide', label: t('color.tab.guide') },
  ];

  const exampleItems = useMemo(
    () =>
      COLOR_EXAMPLES.map((ex) => ({
        id: ex.id,
        tag: t(ex.tagKey as TranslationKey),
        code: ex.code,
        title: t(ex.titleKey as TranslationKey),
        description: t(ex.descKey as TranslationKey),
      })),
    [t],
  );

  const handleSelectExample = useCallback(
    (id: string) => {
      const ex = COLOR_EXAMPLES.find((item) => item.id === id);
      if (!ex) return;
      handleColorChange(ex.color, true);
      setHarmonyKind(ex.harmony);
      setWorkspace('workbench');
    },
    [handleColorChange],
  );

  const isQuick = mode === 'quick';

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('color.pageTitle')}
        description="Convert colors across HEX, RGB, HSL, HSV, HWB, CMYK, OKLCH, and CIE Lab using square, circular wheel, or OKLCH pickers — plus sample pixels and dominant palettes from images and verify WCAG/APCA contrast."
        path="/color/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('color.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        {/* Primary Picker & Converter Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'workbench'}
          aria-label={t('color.tab.workbench')}
        >
          <p className={styles.lead}>{t('color.lead')}</p>

          {isQuick && (
            <div className={styles.quickBanner}>
              <div className={styles.quickBannerText}>
                <span className={styles.quickBadge}>{t('color.quick.badge')}</span>
                <span>{t('color.quick.bannerText')}</span>
              </div>
              <div className={styles.quickActions}>
                <button type="button" className={styles.buttonSmall} onClick={() => setMode('standard')}>
                  {t('color.quick.switchStandard')}
                </button>
                <button type="button" className={styles.buttonSmall} onClick={() => setMode('teaching')}>
                  {t('color.quick.switchTeaching')}
                </button>
              </div>
            </div>
          )}

          <div className={styles.workbenchStack}>
            {/* Row 1: Interactive Picker Stage + Format Conversions */}
            <div className={styles.topGrid}>
              <ColorPickerStage
                color={color}
                previousColor={previousColor}
                uppercaseHex={uppercaseHex}
                harmonyKind={harmonyKind}
                onChange={handleColorChange}
                onRestorePrevious={handleRestorePrevious}
                onSaveSwatch={handleSaveCurrent}
                onOpenImagePicker={() => setWorkspace('image')}
                quickMode={isQuick}
              />

              <ColorFormatsPanel
                color={color}
                uppercaseHex={uppercaseHex}
                onUppercaseHexChange={setUppercaseHex}
                onChange={handleColorChange}
                quickMode={isQuick}
              />
            </div>

            {/* Row 2: Saved Swatches & Recent History */}
            <SavedSwatchesBar
              saved={savedSwatches}
              recent={recentColors}
              uppercaseHex={uppercaseHex}
              onSelect={(c) => handleColorChange(c, true)}
              onRemoveSaved={(id) => setSavedSwatches((prev) => prev.filter((s) => s.id !== id))}
              onClearSaved={() => setSavedSwatches([])}
            />

            {/* Row 3: Harmonies/Scale/Mixer + WCAG/APCA Contrast & CVD */}
            {!isQuick && (
              <div className={styles.secondaryGrid}>
                <PaletteHarmoniesPanel
                  color={color}
                  uppercaseHex={uppercaseHex}
                  harmonyKind={harmonyKind}
                  onHarmonyKindChange={setHarmonyKind}
                  onSelectColor={(c) => handleColorChange(c, true)}
                  onSaveColors={handleSaveColors}
                />

                <ContrastCvdPanel
                  color={color}
                  uppercaseHex={uppercaseHex}
                  harmonyKind={harmonyKind}
                  onChangeColor={(c) => handleColorChange(c, true)}
                />
              </div>
            )}
          </div>

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('color.teaching.oklchTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('color.teaching.oklchBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('color.teaching.contrastTitle')}
                onTheoryClick={() => setWorkspace('guide')}
              >
                {t('color.teaching.contrastBody')}
              </TeachingCallout>
            </div>
          )}
        </section>

        {/* Image Color Picker Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'image'}
          aria-label={t('color.tab.image')}
        >
          <div className={styles.workbenchStack}>
            <ImageColorPicker
              uppercaseHex={uppercaseHex}
              onPickColor={(c) => handleColorChange(c, true)}
              onSaveColors={handleSaveColors}
              onUseInConverter={(c) => {
                handleColorChange(c, true);
                setWorkspace('workbench');
              }}
            />

            <SavedSwatchesBar
              saved={savedSwatches}
              recent={recentColors}
              uppercaseHex={uppercaseHex}
              onSelect={(c) => {
                handleColorChange(c, true);
                setWorkspace('workbench');
              }}
              onRemoveSaved={(id) => setSavedSwatches((prev) => prev.filter((s) => s.id !== id))}
              onClearSaved={() => setSavedSwatches([])}
            />
          </div>
        </section>

        {/* Examples Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'examples'}
          aria-label={t('ex.tab')}
        >
          <ExamplesGallery
            title={t('ex.color.title')}
            subtitle={t('ex.color.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.color.action')}
            onSelect={handleSelectExample}
          />
        </section>

        {/* Color Guide & Theory Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('color.tab.guide')}
        >
          <ColorGuide />
        </section>
      </main>
    </div>
  );
}
