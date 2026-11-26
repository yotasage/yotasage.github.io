import { useMemo, useState } from 'react';

import {
  compositeOver,
  evaluateContrast,
  findAccessibleForeground,
  pickReadableInk,
  simulateCvd,
} from '../../lib/color/accessibility';
import { getHarmonyColors } from '../../lib/color/palette';
import { formatCssRgba, formatHex, parseColorString } from '../../lib/color/parse';
import type { CvdKind, HarmonyKind, RGBA } from '../../lib/color/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Color.module.css';

export interface ContrastCvdPanelProps {
  color: RGBA;
  uppercaseHex: boolean;
  harmonyKind: HarmonyKind;
  onChangeColor: (next: RGBA) => void;
}

const CVD_MODES: readonly CvdKind[] = [
  'protanopia',
  'deuteranopia',
  'tritanopia',
  'achromatopsia',
];

export default function ContrastCvdPanel({
  color,
  uppercaseHex,
  harmonyKind,
  onChangeColor,
}: ContrastCvdPanelProps) {
  const { t } = useI18n();
  const [bgColor, setBgColor] = useState<RGBA>({ r: 255, g: 255, b: 255, a: 1 });
  const [bgDraft, setBgDraft] = useState<string>('#FFFFFF');

  const result = useMemo(() => evaluateContrast(color, bgColor), [color, bgColor]);
  const previewFg = useMemo(() => compositeOver(color, bgColor), [color, bgColor]);
  const harmonySwatches = useMemo(() => getHarmonyColors(color, harmonyKind), [color, harmonyKind]);

  const setBg = (next: RGBA) => {
    const opaque: RGBA = { ...next, a: 1 };
    setBgColor(opaque);
    setBgDraft(formatHex(opaque, { uppercase: uppercaseHex, includeAlpha: false }));
  };

  const handleSwap = () => {
    const oldFg = { ...color, a: 1 };
    onChangeColor(bgColor);
    setBg(oldFg);
  };

  const handleAutoFix = (target: number) => {
    const fixed = findAccessibleForeground(color, bgColor, target);
    onChangeColor({ ...fixed, a: color.a });
  };

  const bgHex = formatHex(bgColor, { uppercase: uppercaseHex, includeAlpha: false });
  const fgHex = formatHex(previewFg, { uppercase: uppercaseHex, includeAlpha: false });
  const btnInk = pickReadableInk(previewFg);

  return (
    <section className={styles.card} aria-labelledby="contrast-cvd-heading">
      <div className={styles.cardHeader}>
        <h2 id="contrast-cvd-heading" className={styles.cardTitle}>
          {t('color.contrast.heading')}
        </h2>
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => setBg({ r: 255, g: 255, b: 255, a: 1 })}
          >
            {t('color.contrast.presetLight')}
          </button>
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => setBg({ r: 15, g: 23, b: 42, a: 1 })}
          >
            {t('color.contrast.presetDark')}
          </button>
          <button type="button" className={styles.buttonSmall} onClick={handleSwap}>
            {t('color.contrast.swap')}
          </button>
        </div>
      </div>

      {/* Background Picker Control */}
      <div className={styles.contrastControls}>
        <label className={styles.inlineColorPick}>
          <span className={styles.sliderLabel}>{t('color.contrast.bg')}</span>
          <input
            type="color"
            value={bgHex}
            onChange={(e) => {
              const parsed = parseColorString(e.target.value);
              if (parsed) setBg(parsed);
            }}
            className={styles.nativeColorInput}
            aria-label={t('color.contrast.bg')}
          />
          <input
            type="text"
            value={bgDraft}
            onChange={(e) => {
              setBgDraft(e.target.value);
              const parsed = parseColorString(e.target.value);
              if (parsed) setBgColor({ ...parsed, a: 1 });
            }}
            className={styles.numInput}
            style={{ width: 92, textAlign: 'left' }}
            aria-label={t('color.contrast.bg')}
          />
        </label>

        <div className={styles.toolbarGroup}>
          {!result.aaNormal && (
            <button type="button" className={styles.buttonSmall} onClick={() => handleAutoFix(4.5)}>
              {t('color.contrast.autoFixAA')}
            </button>
          )}
          {!result.aaaNormal && (
            <button type="button" className={styles.buttonSmall} onClick={() => handleAutoFix(7.0)}>
              {t('color.contrast.autoFixAAA')}
            </button>
          )}
        </div>
      </div>

      {/* WCAG 2.1 Ratio & APCA Lc Score */}
      <div className={styles.contrastScores}>
        <div className={styles.scoreBox}>
          <div className={styles.scoreLabel}>{t('color.contrast.wcagRatio')}</div>
          <div className={styles.scoreBig} data-testid="wcag-ratio-value">
            {result.ratio.toFixed(2)}:1
          </div>
          <div className={styles.scoreSub}>
            {fgHex} / {bgHex}
          </div>
        </div>

        <div className={styles.scoreBox}>
          <div className={styles.scoreLabel}>{t('color.contrast.apcaScore')}</div>
          <div className={styles.scoreBig}>Lc {result.apcaLc.toFixed(1)}</div>
          <div className={styles.scoreSub}>{t(`color.contrast.apca.${result.apcaLevel}`)}</div>
        </div>
      </div>

      {/* WCAG Pass/Fail Matrix */}
      <div className={styles.wcagMatrix}>
        {(
          [
            ['aaNormal', t('color.contrast.aaNormal'), result.aaNormal],
            ['aaaNormal', t('color.contrast.aaaNormal'), result.aaaNormal],
            ['aaLarge', t('color.contrast.aaLarge'), result.aaLarge],
            ['aaUi', t('color.contrast.aaUi'), result.aaUi],
          ] as const
        ).map(([id, label, pass]) => (
          <div key={id} className={styles.wcagRow}>
            <span>{label}</span>
            <span className={pass ? styles.statusPass : styles.statusFail}>
              {pass ? t('color.contrast.pass') : t('color.contrast.fail')}
            </span>
          </div>
        ))}
      </div>

      {/* Live Readable UI Preview */}
      <div className={styles.contrastPreview} style={{ backgroundColor: bgHex, color: formatCssRgba(color) }}>
        <p className={styles.previewTitle}>{t('color.contrast.previewHeadline')}</p>
        <p className={styles.previewBody}>{t('color.contrast.previewBody')}</p>
        <div className={styles.previewActionRow}>
          <span
            className={styles.previewFakeBtn}
            style={{ backgroundColor: fgHex, color: btnInk }}
          >
            {t('color.contrast.previewBtn')}
          </span>
        </div>
      </div>

      {/* Color Vision Deficiency (CVD) Simulation */}
      <div className={styles.cvdSection}>
        <h3 className={styles.subHeading}>{t('color.contrast.cvdHeading')}</h3>
        <div className={styles.cvdGrid}>
          {CVD_MODES.map((kind) => (
            <div key={kind} className={styles.cvdRow}>
              <span className={styles.cvdName}>{t(`color.contrast.cvd.${kind}`)}</span>
              <div className={styles.cvdSwatches}>
                {harmonySwatches.map((sw, idx) => {
                  const sim = simulateCvd(sw.color, kind);
                  const hex = formatHex(sim, { uppercase: uppercaseHex });
                  return (
                    <span
                      key={`${kind}-${idx}`}
                      className={styles.cvdTile}
                      style={{ backgroundColor: hex }}
                      title={`${sw.hex} → ${hex}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
