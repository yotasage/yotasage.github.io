// Multi-dataset comparison workspace: overlaid spectra + side-by-side FoM table + batch export.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../lib/ui/i18n';
import type { AnalysisResult, PlotThemeId, YAxisUnit } from '../../lib/fft/types';
import { BUILTIN_PRESETS, type BuiltinPresetId } from '../../lib/fft/data/presets';
import { buildPlotSpec, layoutPlot, renderPlotToCanvas } from '../../lib/fft/plot/engine';
import { exportBatchCompareCsv, exportBatchCompareLatex } from '../../lib/fft/export/results';
import styles from '../../styles/Fft.module.css';

export interface CompareWorkspaceProps {
  results: AnalysisResult[];
  yUnit: YAxisUnit;
  xScale: 'linear' | 'log';
  plotTheme: PlotThemeId;
  onChangeXScale: (scale: 'linear' | 'log') => void;
  onAddPresetToCompare: (id: BuiltinPresetId) => void;
}

function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function CompareWorkspace({
  results,
  yUnit,
  xScale,
  plotTheme,
  onChangeXScale,
  onAddPresetToCompare,
}: CompareWorkspaceProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canvasW, setCanvasW] = useState(860);

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

  const canvasH = Math.max(320, Math.min(480, Math.round(canvasW * 0.5)));

  const spec = useMemo(() => {
    if (results.length === 0) return null;
    return buildPlotSpec(results[0], 'spectrum', {
      yUnit,
      xScale,
      themeId: plotTheme,
      showMarkers: false,
      showIdealFloor: false,
      showNoiseFloor: false,
      compareResults: results.slice(1),
    });
  }, [results, yUnit, xScale, plotTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !spec) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvasW * dpr);
    canvas.height = Math.round(canvasH * dpr);
    canvas.style.width = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const layout = layoutPlot(spec, canvasW, canvasH);
    renderPlotToCanvas(ctx, layout, dpr);
  }, [spec, canvasW, canvasH]);

  const valOf = (r: AnalysisResult, id: string) =>
    r.metrics.find((m) => m.id === id)?.formatted ?? '—';

  return (
    <div className={styles.mainColumn}>
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>{t('fft.compare.title')}</h2>
            <p className={styles.cardSub}>{t('fft.compare.subtitle')}</p>
          </div>
          {results.length > 0 && (
            <div className={styles.exportRow}>
              <select
                className={styles.select}
                style={{ width: 'auto', padding: '3px 8px', fontSize: '0.76rem' }}
                aria-label={t('fft.plot.xScale')}
                value={xScale}
                onChange={(e) => onChangeXScale(e.target.value as 'linear' | 'log')}
              >
                <option value="linear">{t('fft.plot.lin')}</option>
                <option value="log">{t('fft.plot.log')}</option>
              </select>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSmall}`}
                onClick={() =>
                  downloadText(exportBatchCompareCsv(results), 'fft_compare.csv', 'text/csv;charset=utf-8')
                }
              >
                {t('fft.compare.exportCsv')}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSmall}`}
                onClick={() =>
                  downloadText(exportBatchCompareLatex(results), 'fft_compare.tex', 'text/x-tex;charset=utf-8')
                }
              >
                {t('fft.compare.exportLatex')}
              </button>
            </div>
          )}
        </div>

        <div className={styles.rowActions} style={{ marginBottom: 12 }}>
          <span className={styles.exportLabel}>{t('fft.compare.addPreset')}:</span>
          {BUILTIN_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`${styles.btn} ${styles.btnSmall}`}
              onClick={() => onAddPresetToCompare(p.id)}
            >
              + {p.label}
            </button>
          ))}
        </div>

        {results.length === 0 ? (
          <p className={styles.cardSub}>{t('fft.compare.empty')}</p>
        ) : (
          <>
            <div ref={wrapRef} className={styles.canvasWrap} style={{ marginBottom: 14 }}>
              <canvas ref={canvasRef} className={styles.plotCanvas} />
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Dataset</th>
                    <th>Window</th>
                    <th style={{ textAlign: 'right' }}>SNDR (dB)</th>
                    <th style={{ textAlign: 'right' }}>ENOB</th>
                    <th style={{ textAlign: 'right' }}>SNR (dB)</th>
                    <th style={{ textAlign: 'right' }}>THD (dBc)</th>
                    <th style={{ textAlign: 'right' }}>SFDR (dBc)</th>
                    <th>Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={`${r.datasetName}-${i}`}>
                      <td><strong>{r.datasetName}</strong></td>
                      <td className={styles.mono}>{r.resolvedWindow}</td>
                      <td className={styles.numCell}>{valOf(r, 'M-SNDR')}</td>
                      <td className={styles.numCell}>{valOf(r, 'M-ENOB')}</td>
                      <td className={styles.numCell}>{valOf(r, 'M-SNR')}</td>
                      <td className={styles.numCell}>{valOf(r, 'M-THD')}</td>
                      <td className={styles.numCell}>{valOf(r, 'M-SFDR')}</td>
                      <td className={styles.convCell}>
                        {r.checks.length === 0 ? 'OK' : r.checks.map((c) => c.id).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
