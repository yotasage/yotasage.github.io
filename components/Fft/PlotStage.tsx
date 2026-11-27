// Headline KPI strip + interactive Matplotlib-look plot stage + figure export bar.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../lib/ui/i18n';
import type { AnalysisResult, PlotTabId, PlotThemeId, YAxisUnit } from '../../lib/fft/types';
import {
  buildPlotSpec,
  layoutPlot,
  renderPlotToCanvas,
  snapHoverPoint,
  type HoverReadout,
} from '../../lib/fft/plot/engine';
import {
  exportPlotMatplotlibZip,
  exportPlotPdf,
  exportPlotPng,
  exportPlotSvg,
  exportPlotTikz,
} from '../../lib/fft/plot/exporters';
import { formatSi } from '../../lib/fft/metrics/analyze';
import styles from '../../styles/Fft.module.css';

export interface PlotStageProps {
  result: AnalysisResult;
  plotTab: PlotTabId;
  yUnit: YAxisUnit;
  xScale: 'linear' | 'log';
  plotTheme: PlotThemeId;
  showMarkers: boolean;
  showIdealFloor: boolean;
  showNoiseFloor: boolean;
  onChangePlotTab: (tab: PlotTabId) => void;
  onChangeYUnit: (u: YAxisUnit) => void;
  onChangeXScale: (s: 'linear' | 'log') => void;
  onChangePlotTheme: (th: PlotThemeId) => void;
  onToggleMarkers: () => void;
  onToggleIdealFloor: () => void;
  onToggleNoiseFloor: () => void;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function PlotStage({
  result,
  plotTab,
  yUnit,
  xScale,
  plotTheme,
  showMarkers,
  showIdealFloor,
  showNoiseFloor,
  onChangePlotTab,
  onChangeYUnit,
  onChangeXScale,
  onChangePlotTheme,
  onToggleMarkers,
  onToggleIdealFloor,
  onToggleNoiseFloor,
}: PlotStageProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(760);
  const [hover, setHover] = useState<HoverReadout | null>(null);
  const [exportBusy, setExportBusy] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 240) setCanvasW(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canvasH = Math.max(320, Math.min(540, Math.round(canvasW * 0.62)));

  const spec = useMemo(
    () =>
      buildPlotSpec(result, plotTab, {
        yUnit,
        xScale,
        themeId: plotTheme,
        showMarkers,
        showIdealFloor,
        showNoiseFloor,
      }),
    [result, plotTab, yUnit, xScale, plotTheme, showMarkers, showIdealFloor, showNoiseFloor],
  );

  const layout = useMemo(() => layoutPlot(spec, canvasW, canvasH), [spec, canvasW, canvasH]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvasW * dpr);
    canvas.height = Math.round(canvasH * dpr);
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderPlotToCanvas(ctx, layout, dpr, { hover });
  }, [layout, canvasW, canvasH, hover]);

  const metricById = useMemo(
    () => new Map(result.metrics.map((m) => [m.id, m])),
    [result.metrics],
  );
  const sndr = metricById.get('M-SNDR');
  const enob = metricById.get('M-ENOB');
  const sfdr = metricById.get('M-SFDR');
  const thd = metricById.get('M-THD');
  const snr = metricById.get('M-SNR');

  const safeSlug = result.datasetName.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 32) || 'fft';

  const handleExport = async (fmt: 'png' | 'svg' | 'pdf' | 'tikz' | 'mpl') => {
    setExportBusy(fmt);
    try {
      if (fmt === 'png') {
        const blob = await exportPlotPng(spec, 300, false);
        triggerDownload(blob, `${safeSlug}_${plotTab}.png`);
      } else if (fmt === 'svg') {
        const svg = exportPlotSvg(spec, 768, 576, false);
        triggerDownload(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${safeSlug}_${plotTab}.svg`);
      } else if (fmt === 'pdf') {
        const bytes = await exportPlotPdf(spec);
        triggerDownload(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }), `${safeSlug}_${plotTab}.pdf`);
      } else if (fmt === 'tikz') {
        const tex = exportPlotTikz(spec);
        triggerDownload(new Blob([tex], { type: 'text/x-tex;charset=utf-8' }), `${safeSlug}_${plotTab}.tex`);
      } else {
        const zip = exportPlotMatplotlibZip(spec);
        triggerDownload(new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' }), `${safeSlug}_${plotTab}_matplotlib.zip`);
      }
    } finally {
      setExportBusy(null);
    }
  };

  const tabs: { id: PlotTabId; label: string }[] = [
    { id: 'spectrum', label: t('fft.plot.tabSpectrum') },
    { id: 'time', label: t('fft.plot.tabTime') },
    { id: 'harmonics', label: t('fft.plot.tabHarmonics') },
    { id: 'window', label: t('fft.plot.tabWindow') },
    { id: 'intnoise', label: t('fft.plot.tabIntNoise') },
  ];

  return (
    <>
      <div className={styles.kpiStrip} aria-label="Headline figures of merit">
        <div className={styles.kpiCell}>
          <div className={styles.kpiLabel}>SNDR / SINAD</div>
          <div className={styles.kpiValue}>
            {sndr ? `${sndr.formatted} ${sndr.unit}` : '—'}
          </div>
          <div className={styles.kpiSub}>{result.resolvedWindow}</div>
        </div>
        <div className={styles.kpiCell}>
          <div className={styles.kpiLabel}>ENOB</div>
          <div className={styles.kpiValue}>
            {enob ? `${enob.formatted} ${enob.unit}` : '—'}
          </div>
          <div className={styles.kpiSub}>{enob?.convention ?? ''}</div>
        </div>
        <div className={styles.kpiCell}>
          <div className={styles.kpiLabel}>SFDR</div>
          <div className={styles.kpiValue}>
            {sfdr ? `${sfdr.formatted} ${sfdr.unit}` : '—'}
          </div>
          <div className={styles.kpiSub}>
            {result.worstSpur
              ? `${result.worstSpur.label} @ ${formatSi(result.worstSpur.freqHz, 'Hz', 3)}`
              : (sfdr?.secondary ?? '')}
          </div>
        </div>
        <div className={styles.kpiCell}>
          <div className={styles.kpiLabel}>THD</div>
          <div className={styles.kpiValue}>
            {thd ? `${thd.formatted} ${thd.unit}` : '—'}
          </div>
          <div className={styles.kpiSub}>{thd?.secondary ?? ''}</div>
        </div>
        <div className={styles.kpiCell}>
          <div className={styles.kpiLabel}>SNR</div>
          <div className={styles.kpiValue}>
            {snr ? `${snr.formatted} ${snr.unit}` : '—'}
          </div>
          <div className={styles.kpiSub}>{snr?.convention ?? ''}</div>
        </div>
        <div className={styles.kpiCell}>
          <div className={styles.kpiLabel}>Fundamental f₀</div>
          <div className={styles.kpiValue}>{formatSi(result.tone.refinedFreqHz, 'Hz', 4)}</div>
          <div
            className={`${styles.kpiSub} ${result.tone.isCoherent ? styles.statusGood : styles.statusWarn}`}
          >
            {result.tone.isCoherent
              ? `${t('fft.kpi.coherent')} · M=${Math.round(result.tone.cycles)}`
              : `${t('fft.kpi.nonCoherent')} · ${result.tone.cycles.toFixed(1)} cyc`}
          </div>
        </div>
      </div>

      <section className={styles.card} aria-label="Plot stage">
        <div className={styles.plotToolbar}>
          <div className={styles.plotTabs} role="tablist">
            {tabs.map((tb) => (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={plotTab === tb.id}
                className={`${styles.plotTab} ${plotTab === tb.id ? styles.plotTabActive : ''}`}
                onClick={() => {
                  setHover(null);
                  onChangePlotTab(tb.id);
                }}
              >
                {tb.label}
              </button>
            ))}
          </div>

          <div className={styles.plotControls}>
            {plotTab === 'spectrum' && (
              <>
                <select
                  aria-label={t('fft.plot.yUnit')}
                  className={styles.select}
                  style={{ width: 'auto' }}
                  value={yUnit}
                  onChange={(e) => onChangeYUnit(e.target.value as YAxisUnit)}
                >
                  <option value="dBFS">dBFS</option>
                  <option value="dBV">dBV</option>
                  <option value="dBm">dBm</option>
                  <option value="nsd">NSD (dBFS/Hz)</option>
                  <option value="asd">ASD (dB/√Hz)</option>
                </select>
                <select
                  aria-label={t('fft.plot.xScale')}
                  className={styles.select}
                  style={{ width: 'auto' }}
                  value={xScale}
                  onChange={(e) => onChangeXScale(e.target.value as 'linear' | 'log')}
                >
                  <option value="linear">{t('fft.plot.lin')}</option>
                  <option value="log">{t('fft.plot.log')}</option>
                </select>
              </>
            )}

            <select
              aria-label={t('fft.plot.theme')}
              className={styles.select}
              style={{ width: 'auto' }}
              value={plotTheme}
              onChange={(e) => onChangePlotTheme(e.target.value as PlotThemeId)}
            >
              <option value="mpl-default">{t('fft.plot.themeDefault')}</option>
              <option value="mpl-grid">{t('fft.plot.themeGrid')}</option>
              <option value="mpl-dark">{t('fft.plot.themeDark')}</option>
            </select>

            {plotTab === 'spectrum' && (
              <>
                <label className={styles.checkLabel}>
                  <input type="checkbox" checked={showMarkers} onChange={onToggleMarkers} />
                  {t('fft.plot.markers')}
                </label>
                <label className={styles.checkLabel}>
                  <input type="checkbox" checked={showIdealFloor} onChange={onToggleIdealFloor} />
                  {t('fft.plot.idealFloor')}
                </label>
                <label className={styles.checkLabel}>
                  <input type="checkbox" checked={showNoiseFloor} onChange={onToggleNoiseFloor} />
                  {t('fft.plot.noiseFloor')}
                </label>
              </>
            )}
          </div>
        </div>

        <div ref={wrapRef} className={styles.canvasWrap}>
          <canvas
            ref={canvasRef}
            className={styles.plotCanvas}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = e.clientX - rect.left;
              const py = e.clientY - rect.top;
              setHover(snapHoverPoint(layout, px, py));
            }}
            onMouseLeave={() => setHover(null)}
          />
        </div>

        <div className={styles.plotFooter}>
          <div className={styles.cursorReadout}>
            {hover
              ? `x = ${
                  spec.xTickFormatter === 'si-hz'
                    ? formatSi(hover.snappedX, 'Hz', 5)
                    : spec.xTickFormatter === 'si-s'
                      ? formatSi(hover.snappedX, 's', 5)
                      : hover.snappedX.toPrecision(5)
                }   y = ${hover.snappedY.toFixed(3)} ${spec.yUnit ?? ''}`
              : t('fft.plot.hoverEmpty')}
          </div>

          <div className={styles.exportRow}>
            <span className={styles.exportLabel}>{t('fft.plot.exportLabel')}</span>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              disabled={exportBusy !== null}
              onClick={() => handleExport('png')}
            >
              {t('fft.plot.exportPng')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              disabled={exportBusy !== null}
              onClick={() => handleExport('svg')}
            >
              {t('fft.plot.exportSvg')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              disabled={exportBusy !== null}
              onClick={() => handleExport('pdf')}
            >
              {t('fft.plot.exportPdf')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              disabled={exportBusy !== null}
              onClick={() => handleExport('tikz')}
            >
              {t('fft.plot.exportTikz')}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              disabled={exportBusy !== null}
              onClick={() => handleExport('mpl')}
            >
              {t('fft.plot.exportMpl')}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
