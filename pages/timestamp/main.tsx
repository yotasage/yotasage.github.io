import React from 'react';

import PageHead from '../../components/PageHead';
import BatchPanel from '../../components/Timestamp/BatchPanel';
import DateBuilderCard from '../../components/Timestamp/DateBuilderCard';
import DifferencePanel from '../../components/Timestamp/DifferencePanel';
import FormatsPanel from '../../components/Timestamp/FormatsPanel';
import LiveClockBar from '../../components/Timestamp/LiveClockBar';
import SmartInputCard from '../../components/Timestamp/SmartInputCard';
import TimestampGuide from '../../components/Timestamp/TimestampGuide';
import WorldZonesCard from '../../components/Timestamp/WorldZonesCard';
import ExamplesGallery from '../../components/UI/ExamplesGallery';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import {
  floorDivBigInt,
  NS_PER_MS,
  NS_PER_SEC,
  parseTimestampInput,
} from '../../lib/timestamp/parse';
import {
  epochNsToZonedParts,
  getLocalTimezone,
  zonedPartsToEpochNs,
} from '../../lib/timestamp/timezone';
import type { EpochUnit } from '../../lib/timestamp/types';
import { TIMESTAMP_EXAMPLES } from '../../lib/toolExamples/presets';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/Timestamp.module.css';

type WorkspaceId = 'converter' | 'difference' | 'batch' | 'examples' | 'guide';

// Deterministic SSR fallback before client mount so static export is reproducible.
const FALLBACK_NOW_MS = 1_795_635_565_000; // 2026-11-26T19:39:25.000Z

export default function TimestampConverterPage() {
  useDesignSystemPage('#0e7490', '#22d3ee');
  const { t } = useI18n();
  const { mode, setMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('converter');
  const [nowMs, setNowMs] = React.useState<number>(FALLBACK_NOW_MS);
  const [clockPaused, setClockPaused] = React.useState(false);

  const [localZone, setLocalZone] = React.useState<string>('UTC');
  const [selectedZone, setSelectedZone] = React.useState<string>('UTC');

  const [rawInput, setRawInput] = React.useState<string>(() =>
    String(Math.floor(FALLBACK_NOW_MS / 1000)),
  );
  const [unitOverride, setUnitOverride] = React.useState<EpochUnit>('auto');
  const [lastValidEpochNs, setLastValidEpochNs] = React.useState<bigint>(
    () => BigInt(Math.floor(FALLBACK_NOW_MS / 1000)) * NS_PER_SEC,
  );

  // Sync real current clock & detected local timezone on mount.
  React.useEffect(() => {
    const initialMs = Date.now();
    const detectedTz = getLocalTimezone();
    setNowMs(initialMs);
    setLocalZone(detectedTz);
    setSelectedZone(detectedTz);
    const initialSec = Math.floor(initialMs / 1000);
    setRawInput(String(initialSec));
    setLastValidEpochNs(BigInt(initialSec) * NS_PER_SEC);
  }, []);

  React.useEffect(() => {
    if (clockPaused) return;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [clockPaused]);

  const parseResult = React.useMemo(
    () => parseTimestampInput(rawInput, unitOverride),
    [rawInput, unitOverride],
  );

  React.useEffect(() => {
    if (parseResult.ok) {
      setLastValidEpochNs(parseResult.epochNs);
    }
  }, [parseResult]);

  const activeEpochNs = parseResult.ok ? parseResult.epochNs : lastValidEpochNs;

  const loadEpochNs = React.useCallback((nextNs: bigint, displayOverride?: string) => {
    setLastValidEpochNs(nextNs);
    setUnitOverride('auto');
    if (displayOverride !== undefined) {
      setRawInput(displayOverride);
    } else if (nextNs % NS_PER_SEC === 0n) {
      setRawInput(floorDivBigInt(nextNs, NS_PER_SEC).toString());
    } else if (nextNs % NS_PER_MS === 0n) {
      setRawInput(floorDivBigInt(nextNs, NS_PER_MS).toString());
    } else {
      setRawInput(nextNs.toString());
    }
  }, []);

  const handleLoadNow = React.useCallback(() => {
    const ms = Date.now();
    setNowMs(ms);
    const sec = Math.floor(ms / 1000);
    loadEpochNs(BigInt(sec) * NS_PER_SEC, String(sec));
  }, [loadEpochNs]);

  const handleNudgeSeconds = React.useCallback(
    (deltaSec: bigint) => {
      loadEpochNs(activeEpochNs + deltaSec * NS_PER_SEC);
    },
    [activeEpochNs, loadEpochNs],
  );

  const handleSetStartOfDayUtc = React.useCallback(() => {
    const utc = epochNsToZonedParts(activeEpochNs, 'UTC');
    const sod = zonedPartsToEpochNs(
      {
        year: utc.year,
        month: utc.month,
        day: utc.day,
        hour: 0,
        minute: 0,
        second: 0,
        nanosecond: 0,
      },
      'UTC',
    );
    if (sod !== null) {
      loadEpochNs(sod);
    }
  }, [activeEpochNs, loadEpochNs]);

  const handleWorkspaceChange = React.useCallback((next: WorkspaceId) => {
    setWorkspace(next);
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, []);

  const handleOpenInConverter = React.useCallback(
    (nextNs: bigint) => {
      loadEpochNs(nextNs);
      handleWorkspaceChange('converter');
    },
    [loadEpochNs, handleWorkspaceChange],
  );

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = [
    { id: 'converter', label: t('ts.tab.converter') },
    { id: 'difference', label: t('ts.tab.difference') },
    { id: 'batch', label: t('ts.tab.batch') },
    { id: 'examples', label: t('ex.tab') },
    { id: 'guide', label: t('ts.tab.guide') },
  ];

  const exampleItems = React.useMemo(
    () =>
      TIMESTAMP_EXAMPLES.map((ex) => ({
        id: ex.id,
        tag: t(ex.tagKey as TranslationKey),
        code: ex.code,
        title: t(ex.titleKey as TranslationKey),
        description: t(ex.descKey as TranslationKey),
      })),
    [t],
  );

  const handleSelectExample = React.useCallback(
    (id: string) => {
      const ex = TIMESTAMP_EXAMPLES.find((item) => item.id === id);
      if (!ex) return;
      setUnitOverride(ex.unitOverride ?? 'auto');
      if (ex.rawInput !== undefined) setRawInput(ex.rawInput);
      if (ex.selectedZone) setSelectedZone(ex.selectedZone);
      handleWorkspaceChange(ex.targetWorkspace);
    },
    [handleWorkspaceChange],
  );

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('ts.pageTitle')}
        description={t('ts.metaDescription')}
        path="/timestamp/main"
        ogImage="/og/home.png"
        ogAlt="yotasage.github.io browser engineering and document tools overview"
      />

      <ToolHeader<WorkspaceId>
        title={t('ts.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        {/* Primary Converter Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'converter'}
          aria-label={t('ts.tab.converter')}
        >
          <p className={styles.lead}>{t('ts.lead')}</p>

          {mode === 'quick' && (
            <div className={styles.quickBanner}>
              <div className={styles.quickBannerText}>
                <span className={styles.quickBadge}>{t('ts.quick.badge')}</span>
                <span>{t('ts.quick.bannerText')}</span>
              </div>
              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('standard')}
                >
                  {t('ts.quick.switchStandard')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => setMode('teaching')}
                >
                  {t('ts.quick.switchTeaching')}
                </button>
              </div>
            </div>
          )}

          <div className={styles.stack}>
            <LiveClockBar
              nowMs={nowMs}
              paused={clockPaused}
              onTogglePause={() => setClockPaused((p) => !p)}
              onLoadNow={handleLoadNow}
            />

            <div className={styles.twoCol}>
              <SmartInputCard
                rawInput={rawInput}
                unitOverride={unitOverride}
                parseResult={parseResult}
                onRawInputChange={setRawInput}
                onUnitChange={setUnitOverride}
                onNudgeSeconds={handleNudgeSeconds}
                onSetStartOfDayUtc={handleSetStartOfDayUtc}
                onSelectPreset={(ns, display) => loadEpochNs(ns, display)}
                onSetNow={handleLoadNow}
              />

              <DateBuilderCard
                epochNs={activeEpochNs}
                selectedZone={selectedZone}
                localZone={localZone}
                onZoneChange={setSelectedZone}
                onEpochChange={(ns) => loadEpochNs(ns)}
              />
            </div>

            <FormatsPanel
              epochNs={activeEpochNs}
              nowMs={nowMs}
              selectedZone={selectedZone}
              quickMode={mode === 'quick'}
            />

            {mode !== 'quick' && (
              <WorldZonesCard
                epochNs={activeEpochNs}
                selectedZone={selectedZone}
                localZone={localZone}
                onSelectZone={setSelectedZone}
              />
            )}
          </div>

          {mode === 'teaching' && (
            <div className={styles.teachingGrid}>
              <TeachingCallout
                title={t('ts.teaching.unitsTitle')}
                onTheoryClick={() => handleWorkspaceChange('guide')}
              >
                {t('ts.teaching.unitsBody')}
              </TeachingCallout>
              <TeachingCallout
                title={t('ts.teaching.y2038Title')}
                onTheoryClick={() => handleWorkspaceChange('guide')}
              >
                {t('ts.teaching.y2038Body')}
              </TeachingCallout>
            </div>
          )}
        </section>

        {/* Difference & Offset Math Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'difference'}
          aria-label={t('ts.tab.difference')}
        >
          <DifferencePanel
            currentEpochNs={activeEpochNs}
            nowMs={nowMs}
            selectedZone={selectedZone}
            onOpenInConverter={handleOpenInConverter}
          />
        </section>

        {/* Batch Conversion Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'batch'}
          aria-label={t('ts.tab.batch')}
        >
          <BatchPanel
            selectedZone={selectedZone}
            onOpenInConverter={handleOpenInConverter}
          />
        </section>

        {/* Examples Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'examples'}
          aria-label={t('ex.tab')}
        >
          <ExamplesGallery
            title={t('ex.ts.title')}
            subtitle={t('ex.ts.lead')}
            items={exampleItems}
            defaultActionLabel={t('ex.ts.action')}
            onSelect={handleSelectExample}
          />
        </section>

        {/* Developer Guide Workspace */}
        <section
          className={styles.workspacePanel}
          hidden={workspace !== 'guide'}
          aria-label={t('ts.tab.guide')}
        >
          <TimestampGuide />
        </section>
      </main>
    </div>
  );
}
