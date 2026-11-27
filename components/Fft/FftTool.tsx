// Main orchestrator for the FFT / Spectrum Analyzer workbench.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BibEntry } from '../../lib/bibtex';
import type {
  AnalysisResult,
  ParsedDataset,
  PlotTabId,
  PlotThemeId,
  Setup,
  SignalDef,
  YAxisUnit,
} from '../../lib/fft/types';
import { generateBuiltinPreset, type BuiltinPresetId } from '../../lib/fft/data/presets';
import { parseTextDataset, parseUploadedFile } from '../../lib/fft/data/parsers';
import { analyzeDataset, createDefaultSetup } from '../../lib/fft/metrics/analyze';
import { runAnalysisAsync } from '../../lib/fft/worker/client';
import {
  decodeSettingsHash,
  deleteUserPreset,
  encodeSettingsHash,
  loadSavedPresets,
  parseSimSetupQuery,
  saveUserPreset,
  type SavedUserPreset,
} from '../../lib/fft/state/settings';
import DataPanel from './DataPanel';
import SetupPanel from './SetupPanel';
import PlotStage from './PlotStage';
import ResultsAndChecks from './ResultsAndChecks';
import CompareWorkspace from './CompareWorkspace';
import TheoryWorkspace from './TheoryWorkspace';
import styles from '../../styles/Fft.module.css';

export type FftWorkspaceId = 'analyzer' | 'compare' | 'theory';

export interface FftToolProps {
  workspace: FftWorkspaceId;
  wideView: boolean;
  references: BibEntry[];
}

function defaultSignalFor(ds: ParsedDataset): SignalDef {
  return {
    kind: ds.defaultKind,
    timeCol: ds.defaultTimeCol,
    colA: ds.defaultSigACol,
    colB: ds.defaultSigBCol,
    gain: 1,
    offset: 0,
    unit: ds.columns[ds.defaultSigACol]?.unit === 'A' ? 'A' : 'V',
  };
}

function defaultSetupFor(ds: ParsedDataset): Setup {
  return createDefaultSetup({
    fs: ds.defaultFs ?? 1e6,
    start: 0,
    n: Math.min(ds.rows, 65536),
    fullScale: ds.defaultFullScale,
    bits: ds.defaultBits,
    band: ds.defaultBand,
    interleaveChannels: ds.defaultInterleaveChannels ?? 1,
    twoToneMode: ds.defaultTwoTone ?? false,
  });
}

export default function FftTool({ workspace, wideView, references }: FftToolProps) {
  const initialDs = useMemo(() => generateBuiltinPreset('adc-12bit'), []);
  const [datasets, setDatasets] = useState<ParsedDataset[]>([initialDs]);
  const [activeId, setActiveId] = useState<string>(initialDs.id);
  const [activePresetId, setActivePresetId] = useState<BuiltinPresetId | null>('adc-12bit');
  const [compareIds, setCompareIds] = useState<string[]>([initialDs.id]);

  const [signal, setSignal] = useState<SignalDef>(() => defaultSignalFor(initialDs));
  const [setup, setSetup] = useState<Setup>(() => defaultSetupFor(initialDs));

  const [plotTab, setPlotTab] = useState<PlotTabId>('spectrum');
  const [yUnit, setYUnit] = useState<YAxisUnit>('dBFS');
  const [xScale, setXScale] = useState<'linear' | 'log'>('linear');
  const [plotTheme, setPlotTheme] = useState<PlotThemeId>('mpl-grid');
  const [showMarkers, setShowMarkers] = useState(true);
  const [showIdealFloor, setShowIdealFloor] = useState(true);
  const [showNoiseFloor, setShowNoiseFloor] = useState(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [savedPresets, setSavedPresets] = useState<SavedUserPreset[]>([]);

  // Initial synchronous analysis for immediate first-paint rendering
  const [result, setResult] = useState<AnalysisResult>(() =>
    analyzeDataset(initialDs, defaultSignalFor(initialDs), defaultSetupFor(initialDs)),
  );

  // Hydrate #s= hash, ?fs=&f0=&n= query bridge, and saved presets on mount
  useEffect(() => {
    setSavedPresets(loadSavedPresets());
    const fromHash = decodeSettingsHash(window.location.hash);
    if (fromHash) {
      setSetup((prev) => ({ ...prev, ...fromHash.setup }));
      if (fromHash.yUnit) setYUnit(fromHash.yUnit);
      if (fromHash.xScale) setXScale(fromHash.xScale);
      if (fromHash.plotTheme) setPlotTheme(fromHash.plotTheme);
    }
    const q = parseSimSetupQuery(window.location.search);
    if (q.fs || q.f0 || q.n) {
      setSetup((prev) => ({
        ...prev,
        fs: q.fs ?? prev.fs,
        f0Hint: q.f0 ?? prev.f0Hint,
        n: q.n ? Math.min(prev.n, Math.max(16, Math.round(q.n))) : prev.n,
      }));
    }
  }, []);

  const activeDs = useMemo(
    () => datasets.find((d) => d.id === activeId) ?? datasets[0],
    [datasets, activeId],
  );

  // Run analysis whenever active dataset, signal, or setup changes (Worker-backed for large N)
  const reqIdRef = useRef(0);
  useEffect(() => {
    if (!activeDs) return;
    const reqId = ++reqIdRef.current;
    let cancelled = false;
    runAnalysisAsync(activeDs, signal, setup)
      .then((res) => {
        if (!cancelled && reqId === reqIdRef.current) {
          setResult(res);
        }
      })
      .catch(() => {
        // Fallback already handled inside runAnalysisAsync
      });
    return () => {
      cancelled = true;
    };
  }, [activeDs, signal, setup]);

  const activateDataset = useCallback((ds: ParsedDataset, presetId: BuiltinPresetId | null = null) => {
    setActiveId(ds.id);
    setActivePresetId(presetId);
    setSignal(defaultSignalFor(ds));
    setSetup(defaultSetupFor(ds));
    setParseError(null);
  }, []);

  const handleLoadPreset = useCallback(
    (id: BuiltinPresetId) => {
      const existing = datasets.find((d) => d.id === `preset-${id}`);
      if (existing) {
        activateDataset(existing, id);
        return;
      }
      const ds = generateBuiltinPreset(id);
      setDatasets((prev) => [...prev, ds]);
      setCompareIds((prev) => (prev.includes(ds.id) ? prev : [...prev, ds.id]));
      activateDataset(ds, id);
    },
    [datasets, activateDataset],
  );

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      setParseError(null);
      const list = Array.from(files);
      const parsed: ParsedDataset[] = [];
      for (const f of list) {
        try {
          const uid = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const ds = await parseUploadedFile(f, uid);
          parsed.push(ds);
        } catch (err) {
          setParseError(err instanceof Error ? err.message : `Could not parse ${f.name}`);
        }
      }
      if (parsed.length > 0) {
        setDatasets((prev) => [...prev, ...parsed]);
        setCompareIds((prev) => [...prev, ...parsed.map((d) => d.id)]);
        activateDataset(parsed[0], null);
      }
    },
    [activateDataset],
  );

  const handlePasteText = useCallback(
    (text: string) => {
      try {
        setParseError(null);
        const uid = `paste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const ds = parseTextDataset(text, `Pasted (${new Date().toLocaleTimeString()})`, uid);
        setDatasets((prev) => [...prev, ds]);
        setCompareIds((prev) => [...prev, ds.id]);
        activateDataset(ds, null);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Could not parse pasted text');
      }
    },
    [activateDataset],
  );

  const handleSelectDataset = useCallback(
    (id: string) => {
      const ds = datasets.find((d) => d.id === id);
      if (!ds) return;
      const pid = id.startsWith('preset-') ? (id.slice('preset-'.length) as BuiltinPresetId) : null;
      activateDataset(ds, pid);
    },
    [datasets, activateDataset],
  );

  const handleRemoveDataset = useCallback(
    (id: string) => {
      setDatasets((prev) => {
        const next = prev.filter((d) => d.id !== id);
        if (next.length === 0) return prev;
        if (id === activeId) {
          const fallback = next[0];
          setActiveId(fallback.id);
          setSignal(defaultSignalFor(fallback));
          setSetup(defaultSetupFor(fallback));
        }
        return next;
      });
      setCompareIds((prev) => prev.filter((cid) => cid !== id));
    },
    [activeId],
  );

  const handleToggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleSnapIntegerCycles = useCallback(() => {
    if (!result || !activeDs) return;
    const f0 = result.tone.refinedFreqHz;
    if (!Number.isFinite(f0) || f0 <= 0) return;
    const cyclesFloat = (f0 * setup.n) / setup.fs;
    const targetCycles = Math.max(1, Math.round(cyclesFloat));
    const idealN = Math.round((targetCycles * setup.fs) / f0);
    const clampedN = Math.max(16, Math.min(activeDs.rows - setup.start, idealN));
    setSetup((prev) => ({ ...prev, n: clampedN }));
  }, [result, activeDs, setup.n, setup.fs, setup.start]);

  const handleCopySettingsLink = useCallback(async () => {
    try {
      const hash = encodeSettingsHash({
        v: 1,
        setup,
        yUnit,
        xScale,
        plotTheme,
      });
      const url = `${window.location.origin}${window.location.pathname}${hash}`;
      window.history.replaceState(null, '', hash);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      }
      return true;
    } catch {
      return false;
    }
  }, [setup, yUnit, xScale, plotTheme]);

  const handleSaveUserPreset = useCallback(
    (name: string) => {
      const next = saveUserPreset(name, { v: 1, setup, yUnit, xScale, plotTheme });
      setSavedPresets(next);
    },
    [setup, yUnit, xScale, plotTheme],
  );

  const handleLoadUserPreset = useCallback((preset: SavedUserPreset) => {
    setSetup((prev) => ({ ...prev, ...preset.settings.setup }));
    if (preset.settings.yUnit) setYUnit(preset.settings.yUnit);
    if (preset.settings.xScale) setXScale(preset.settings.xScale);
    if (preset.settings.plotTheme) setPlotTheme(preset.settings.plotTheme);
  }, []);

  const handleDeleteUserPreset = useCallback((id: string) => {
    setSavedPresets(deleteUserPreset(id));
  }, []);

  // Multi-dataset comparison results (computed lazily when Compare workspace is open)
  const compareResults = useMemo(() => {
    if (workspace !== 'compare') return [];
    const selected = datasets.filter((d) => compareIds.includes(d.id));
    return selected.map((ds) => {
      if (ds.id === activeId) return result;
      return analyzeDataset(ds, defaultSignalFor(ds), defaultSetupFor(ds));
    });
  }, [workspace, datasets, compareIds, activeId, result]);

  const handleAddPresetToCompare = useCallback(
    (id: BuiltinPresetId) => {
      const existing = datasets.find((d) => d.id === `preset-${id}`);
      if (existing) {
        setCompareIds((prev) => (prev.includes(existing.id) ? prev : [...prev, existing.id]));
        return;
      }
      const ds = generateBuiltinPreset(id);
      setDatasets((prev) => [...prev, ds]);
      setCompareIds((prev) => (prev.includes(ds.id) ? prev : [...prev, ds.id]));
    },
    [datasets],
  );

  return (
    <div className={`${styles.shell} ${wideView ? styles.shellWide : ''}`}>
      {workspace === 'analyzer' && (
        <div className={styles.workbenchGrid}>
          <aside className={styles.sidebar}>
            <DataPanel
              datasets={datasets}
              activeId={activeId}
              compareIds={compareIds}
              signal={signal}
              activePresetId={activePresetId}
              parseError={parseError}
              onSelectDataset={handleSelectDataset}
              onRemoveDataset={handleRemoveDataset}
              onToggleCompare={handleToggleCompare}
              onUploadFiles={handleUploadFiles}
              onPasteText={handlePasteText}
              onLoadPreset={handleLoadPreset}
              onChangeSignal={setSignal}
            />
            <SetupPanel
              setup={setup}
              maxRows={activeDs?.rows ?? 16384}
              result={result}
              onChange={setSetup}
              onSnapIntegerCycles={handleSnapIntegerCycles}
            />
          </aside>

          <main className={styles.mainColumn}>
            <PlotStage
              result={result}
              plotTab={plotTab}
              yUnit={yUnit}
              xScale={xScale}
              plotTheme={plotTheme}
              showMarkers={showMarkers}
              showIdealFloor={showIdealFloor}
              showNoiseFloor={showNoiseFloor}
              onChangePlotTab={setPlotTab}
              onChangeYUnit={setYUnit}
              onChangeXScale={setXScale}
              onChangePlotTheme={setPlotTheme}
              onToggleMarkers={() => setShowMarkers((v) => !v)}
              onToggleIdealFloor={() => setShowIdealFloor((v) => !v)}
              onToggleNoiseFloor={() => setShowNoiseFloor((v) => !v)}
            />
            <ResultsAndChecks
              result={result}
              savedPresets={savedPresets}
              onCopySettingsLink={handleCopySettingsLink}
              onSaveUserPreset={handleSaveUserPreset}
              onLoadUserPreset={handleLoadUserPreset}
              onDeleteUserPreset={handleDeleteUserPreset}
            />
          </main>
        </div>
      )}

      {workspace === 'compare' && (
        <CompareWorkspace
          results={compareResults}
          yUnit={yUnit}
          xScale={xScale}
          plotTheme={plotTheme}
          onChangeXScale={setXScale}
          onAddPresetToCompare={handleAddPresetToCompare}
        />
      )}

      {workspace === 'theory' && <TheoryWorkspace references={references} />}
    </div>
  );
}
