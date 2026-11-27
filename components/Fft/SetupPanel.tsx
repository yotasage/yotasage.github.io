// Analysis Setup Panel: fs, N, snap-to-cycles, estimator, windows, full scale,
// band, interleaving, two-tone, resampling, conventions, and /simsetup/main bridge.
import Link from 'next/link';
import { useI18n } from '../../lib/ui/i18n';
import type { AnalysisResult, EstimatorKind, Setup, WindowKind } from '../../lib/fft/types';
import { WINDOW_CATALOGUE } from '../../lib/fft/dsp/windows';
import { buildSimSetupHref } from '../../lib/fft/state/settings';
import { formatSi } from '../../lib/fft/metrics/analyze';
import styles from '../../styles/Fft.module.css';

export interface SetupPanelProps {
  setup: Setup;
  maxRows: number;
  result: AnalysisResult | null;
  onChange: (next: Setup) => void;
  onSnapIntegerCycles: () => void;
}

export default function SetupPanel({
  setup,
  maxRows,
  result,
  onChange,
  onSnapIntegerCycles,
}: SetupPanelProps) {
  const { t } = useI18n();

  const patch = (partial: Partial<Setup>) => onChange({ ...setup, ...partial });
  const patchConv = (partial: Partial<Setup['conventions']>) =>
    onChange({ ...setup, conventions: { ...setup.conventions, ...partial } });
  const patchWin = (partial: Partial<Setup['windowParams']>) =>
    onChange({ ...setup, windowParams: { ...setup.windowParams, ...partial } });

  const simHref = buildSimSetupHref(setup.fs, result?.tone.refinedFreqHz ?? setup.f0Hint, setup.n);
  const needsResample = result?.timeGrid.kind === 'nonuniform' || result?.timeGrid.kind === 'gaps';

  return (
    <section className={styles.card} aria-label={t('fft.setup.title')}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('fft.setup.title')}</h2>
        {result && (
          <span className={styles.datasetMeta}>
            Δf = {formatSi(result.spectrum.df, 'Hz', 3)}
          </span>
        )}
      </div>

      {needsResample && result?.resample && (
        <div className={styles.noticeBanner}>
          <strong>{result.timeGrid.kind === 'gaps' ? 'Gapped time grid' : 'Variable-step grid'}:</strong>{' '}
          resampled ({result.resample.method}) to {formatSi(result.resample.targetFs, 'Hz', 3)},
          est. bound {result.resample.errorBoundDbBelowSig.toFixed(1)} dB.
        </div>
      )}

      <div className={styles.formGrid}>
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-fs">
            {t('fft.setup.fs')}
          </label>
          <input
            id="fft-fs"
            type="number"
            step="any"
            min="1e-6"
            className={styles.input}
            value={setup.fs}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v > 0) patch({ fs: v });
            }}
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-n">
            {t('fft.setup.n')}
          </label>
          <input
            id="fft-n"
            type="number"
            min={16}
            max={Math.max(16, maxRows)}
            className={styles.input}
            value={setup.n}
            onChange={(e) => {
              const v = Math.floor(Number(e.target.value));
              if (Number.isFinite(v) && v >= 16) patch({ n: Math.min(maxRows, v) });
            }}
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-start">
            {t('fft.setup.start')}
          </label>
          <input
            id="fft-start"
            type="number"
            min={0}
            max={Math.max(0, maxRows - 16)}
            className={styles.input}
            value={setup.start}
            onChange={(e) => {
              const v = Math.max(0, Math.floor(Number(e.target.value)));
              if (Number.isFinite(v)) patch({ start: v });
            }}
          />
        </div>

        <div className={styles.formRow} style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSmall}`}
            onClick={onSnapIntegerCycles}
            style={{ marginTop: 'auto', height: 31 }}
          >
            {t('fft.setup.snapCycles')}
          </button>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-est">
            {t('fft.setup.estimator')}
          </label>
          <select
            id="fft-est"
            className={styles.select}
            value={setup.estimator}
            onChange={(e) => patch({ estimator: e.target.value as EstimatorKind })}
          >
            <option value="dft">{t('fft.setup.estDft')}</option>
            <option value="welch">{t('fft.setup.estWelch')}</option>
            <option value="czt">{t('fft.setup.estCzt')}</option>
          </select>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-window">
            {t('fft.setup.window')}
          </label>
          <select
            id="fft-window"
            className={styles.select}
            value={setup.window}
            onChange={(e) => patch({ window: e.target.value as WindowKind })}
          >
            <option value="auto">
              Auto ({result ? result.resolvedWindow : 'rect / BH4'})
            </option>
            {WINDOW_CATALOGUE.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </select>
        </div>

        {setup.window === 'kaiser' && (
          <div className={`${styles.formRow} ${styles.formRowFull}`}>
            <label className={styles.label} htmlFor="fft-kaiser-beta">
              <span>Kaiser β</span>
              <span className={styles.mono}>{setup.windowParams.kaiserBeta.toFixed(1)}</span>
            </label>
            <input
              id="fft-kaiser-beta"
              type="range"
              min={0}
              max={20}
              step={0.5}
              value={setup.windowParams.kaiserBeta}
              onChange={(e) => patchWin({ kaiserBeta: Number(e.target.value) })}
            />
          </div>
        )}

        {setup.window === 'chebyshev' && (
          <div className={`${styles.formRow} ${styles.formRowFull}`}>
            <label className={styles.label} htmlFor="fft-cheb-db">
              <span>Dolph–Chebyshev sidelobe (dB)</span>
              <span className={styles.mono}>{setup.windowParams.chebyshevDb} dB</span>
            </label>
            <input
              id="fft-cheb-db"
              type="range"
              min={50}
              max={150}
              step={5}
              value={setup.windowParams.chebyshevDb}
              onChange={(e) => patchWin({ chebyshevDb: Number(e.target.value) })}
            />
          </div>
        )}

        {setup.window === 'gaussian' && (
          <div className={`${styles.formRow} ${styles.formRowFull}`}>
            <label className={styles.label} htmlFor="fft-gauss-sigma">
              <span>Gaussian σ</span>
              <span className={styles.mono}>{setup.windowParams.gaussianSigma.toFixed(2)}</span>
            </label>
            <input
              id="fft-gauss-sigma"
              type="range"
              min={0.15}
              max={0.6}
              step={0.05}
              value={setup.windowParams.gaussianSigma}
              onChange={(e) => patchWin({ gaussianSigma: Number(e.target.value) })}
            />
          </div>
        )}

        {setup.window === 'tukey' && (
          <div className={`${styles.formRow} ${styles.formRowFull}`}>
            <label className={styles.label} htmlFor="fft-tukey-alpha">
              <span>Tukey α</span>
              <span className={styles.mono}>{setup.windowParams.tukeyAlpha.toFixed(2)}</span>
            </label>
            <input
              id="fft-tukey-alpha"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={setup.windowParams.tukeyAlpha}
              onChange={(e) => patchWin({ tukeyAlpha: Number(e.target.value) })}
            />
          </div>
        )}

        {setup.estimator === 'welch' && (
          <>
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-w-seg">
                {t('fft.setup.welchSegments')}
              </label>
              <input
                id="fft-w-seg"
                type="number"
                min={2}
                max={64}
                className={styles.input}
                value={setup.welchSegments}
                onChange={(e) => patch({ welchSegments: Math.max(2, Number(e.target.value) || 4) })}
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-w-ov">
                {t('fft.setup.welchOverlap')}
              </label>
              <select
                id="fft-w-ov"
                className={styles.select}
                value={setup.welchOverlap}
                onChange={(e) => patch({ welchOverlap: Number(e.target.value) })}
              >
                <option value={0}>0% (Bartlett)</option>
                <option value={0.25}>25%</option>
                <option value={0.5}>50%</option>
                <option value={0.75}>75%</option>
              </select>
            </div>
          </>
        )}

        {setup.estimator === 'czt' && (
          <>
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-czt-f1">
                CZT f1 (Hz)
              </label>
              <input
                id="fft-czt-f1"
                type="number"
                step="any"
                className={styles.input}
                placeholder="Auto"
                value={setup.cztF1 ?? ''}
                onChange={(e) =>
                  patch({ cztF1: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-czt-f2">
                CZT f2 (Hz)
              </label>
              <input
                id="fft-czt-f2"
                type="number"
                step="any"
                className={styles.input}
                placeholder="Auto"
                value={setup.cztF2 ?? ''}
                onChange={(e) =>
                  patch({ cztF2: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
            </div>
          </>
        )}

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-fs-scale">
            {t('fft.setup.fullScale')}
          </label>
          <input
            id="fft-fs-scale"
            type="number"
            step="any"
            min="0"
            className={styles.input}
            placeholder="None"
            value={setup.fullScale ?? ''}
            onChange={(e) =>
              patch({
                fullScale:
                  e.target.value === ''
                    ? null
                    : Number(e.target.value) > 0
                      ? Number(e.target.value)
                      : null,
              })
            }
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-bits">
            {t('fft.setup.bits')}
          </label>
          <input
            id="fft-bits"
            type="number"
            min={1}
            max={32}
            className={styles.input}
            placeholder="e.g. 12"
            value={setup.bits ?? ''}
            onChange={(e) =>
              patch({
                bits:
                  e.target.value === ''
                    ? null
                    : Math.min(32, Math.max(1, Math.round(Number(e.target.value)))),
              })
            }
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-band-lo">
            Band f1 (Hz)
          </label>
          <input
            id="fft-band-lo"
            type="number"
            step="any"
            min={0}
            className={styles.input}
            placeholder="0"
            value={setup.band ? setup.band[0] : ''}
            onChange={(e) => {
              if (e.target.value === '' && (!setup.band || setup.band[1] >= setup.fs / 2)) {
                patch({ band: null });
              } else {
                const f1 = Math.max(0, Number(e.target.value) || 0);
                const f2 = setup.band ? Math.max(f1 + 1, setup.band[1]) : setup.fs / 2;
                patch({ band: [f1, f2] });
              }
            }}
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="fft-band-hi">
            Band f2 (Hz)
          </label>
          <input
            id="fft-band-hi"
            type="number"
            step="any"
            min={0}
            className={styles.input}
            placeholder={t('fft.setup.bandFull')}
            value={setup.band ? setup.band[1] : ''}
            onChange={(e) => {
              if (e.target.value === '') {
                patch({ band: null });
              } else {
                const f2 = Math.min(setup.fs / 2, Math.max(1, Number(e.target.value) || setup.fs / 2));
                const f1 = setup.band ? Math.min(setup.band[0], f2) : 0;
                patch({ band: [f1, f2] });
              }
            }}
          />
        </div>

        {needsResample && (
          <div className={`${styles.formRow} ${styles.formRowFull}`}>
            <label className={styles.label} htmlFor="fft-rs-method">
              {t('fft.setup.resampleMethod')}
            </label>
            <select
              id="fft-rs-method"
              className={styles.select}
              value={setup.resampleMethod}
              onChange={(e) => patch({ resampleMethod: e.target.value as 'linear' | 'cubic' })}
            >
              <option value="cubic">{t('fft.setup.resampleCubic')}</option>
              <option value="linear">{t('fft.setup.resampleLinear')}</option>
            </select>
          </div>
        )}
      </div>

      <details className={styles.detailsBox}>
        <summary className={styles.detailsSummary}>{t('fft.setup.conventions')}</summary>
        <div className={styles.detailsBody}>
          <div className={styles.formGrid}>
            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-harm-count">
                {t('fft.setup.harmonics')}
              </label>
              <input
                id="fft-harm-count"
                type="number"
                min={2}
                max={50}
                className={styles.input}
                value={setup.conventions.harmonicsCount}
                onChange={(e) =>
                  patchConv({ harmonicsCount: Math.min(50, Math.max(2, Number(e.target.value) || 10)) })
                }
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-interleave">
                {t('fft.setup.interleave')}
              </label>
              <input
                id="fft-interleave"
                type="number"
                min={1}
                max={64}
                className={styles.input}
                value={setup.interleaveChannels}
                onChange={(e) =>
                  patch({ interleaveChannels: Math.min(64, Math.max(1, Number(e.target.value) || 1)) })
                }
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-in-gain">
                {t('fft.setup.inputGain')}
              </label>
              <input
                id="fft-in-gain"
                type="number"
                step="any"
                min="1e-6"
                className={styles.input}
                value={setup.inputGain}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) patch({ inputGain: v });
                }}
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-power">
                {t('fft.setup.powerWatts')}
              </label>
              <input
                id="fft-power"
                type="number"
                step="any"
                min="0"
                className={styles.input}
                placeholder="e.g. 0.001"
                value={setup.powerWatts ?? ''}
                onChange={(e) =>
                  patch({
                    powerWatts:
                      e.target.value === ''
                        ? null
                        : Number(e.target.value) > 0
                          ? Number(e.target.value)
                          : null,
                  })
                }
              />
            </div>

            <div className={styles.formRow}>
              <label className={styles.label} htmlFor="fft-zref">
                {t('fft.setup.convImpedance')}
              </label>
              <input
                id="fft-zref"
                type="number"
                step="any"
                min={1}
                className={styles.input}
                value={setup.conventions.refImpedanceOhm}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) patchConv({ refImpedanceOhm: v });
                }}
              />
            </div>
          </div>

          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={setup.twoToneMode}
              onChange={(e) => patch({ twoToneMode: e.target.checked })}
            />
            {t('fft.setup.twoTone')}
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={setup.conventions.snrExcludesHarmonics}
              onChange={(e) => patchConv({ snrExcludesHarmonics: e.target.checked })}
            />
            {t('fft.setup.convSnrExcl')}
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={setup.conventions.thdNegativeDb}
              onChange={(e) => patchConv({ thdNegativeDb: e.target.checked })}
            />
            {t('fft.setup.convThdNeg')}
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={setup.conventions.enobFsCorrection}
              onChange={(e) => patchConv({ enobFsCorrection: e.target.checked })}
            />
            {t('fft.setup.convEnobFs')}
          </label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={setup.conventions.noiseBinCompensation}
              onChange={(e) => patchConv({ noiseBinCompensation: e.target.checked })}
            />
            {t('fft.setup.convNoiseComp')}
          </label>
        </div>
      </details>

      <Link href={simHref} className={styles.bridgeLink}>
        {t('fft.setup.checkSimsetup')}
      </Link>
    </section>
  );
}
