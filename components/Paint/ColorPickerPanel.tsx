import React, { useEffect, useRef, useState } from 'react';

import {
  BLACK,
  clampByte,
  DEFAULT_PALETTE,
  hexToRgba,
  hsvToRgb,
  isValidHexInput,
  rgbaToCss,
  rgbaToHex,
  rgbToHsv,
  WHITE,
} from '../../lib/paint/color';
import type { RGBA } from '../../lib/paint/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PaintPanels.module.css';

export interface ColorPickerPanelProps {
  primary: RGBA;
  secondary: RGBA;
  activeSlot: 'primary' | 'secondary';
  recentColors: readonly RGBA[];
  onSelectSlot: (slot: 'primary' | 'secondary') => void;
  onChangePrimary: (color: RGBA) => void;
  onChangeSecondary: (color: RGBA) => void;
  onSwap: () => void;
  onResetBW: () => void;
}

export default function ColorPickerPanel({
  primary,
  secondary,
  activeSlot,
  recentColors,
  onSelectSlot,
  onChangePrimary,
  onChangeSecondary,
  onSwap,
  onResetBW,
}: ColorPickerPanelProps) {
  const { t } = useI18n();
  const activeColor = activeSlot === 'primary' ? primary : secondary;
  const setActiveColor = activeSlot === 'primary' ? onChangePrimary : onChangeSecondary;

  // Keep hue stable when S or V hits 0 so dragging along bottom/left doesn't jump hue
  const [hue, setHue] = useState<number>(() => rgbToHsv(activeColor).h);
  const [hexDraft, setHexDraft] = useState<string>(() => rgbaToHex(activeColor));
  const [expanded, setExpanded] = useState<boolean>(true);
  const svBoxRef = useRef<HTMLDivElement | null>(null);

  const hsv = rgbToHsv(activeColor);
  const effectiveHue = hsv.s > 0 && hsv.v > 0 ? hsv.h : hue;

  useEffect(() => {
    setHexDraft(rgbaToHex(activeColor));
    const nextHsv = rgbToHsv(activeColor);
    if (nextHsv.s > 0 && nextHsv.v > 0) {
      setHue(nextHsv.h);
    }
  }, [activeColor]);

  const updateSvFromPointer = (clientX: number, clientY: number) => {
    const box = svBoxRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const s = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const v = Math.max(0, Math.min(100, (1 - (clientY - rect.top) / rect.height) * 100));
    setActiveColor(hsvToRgb({ h: effectiveHue, s, v, a: activeColor.a }));
  };

  const handleSvPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    updateSvFromPointer(e.clientX, e.clientY);

    const onMove = (ev: PointerEvent) => updateSvFromPointer(ev.clientX, ev.clientY);
    const onUp = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {
        // ignore
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleHueChange = (nextHue: number) => {
    setHue(nextHue);
    setActiveColor(hsvToRgb({ h: nextHue, s: hsv.s, v: hsv.v, a: activeColor.a }));
  };

  const handleHexCommit = (raw: string) => {
    setHexDraft(raw);
    if (isValidHexInput(raw)) {
      const parsed = hexToRgba(raw, activeColor.a);
      setActiveColor(parsed);
    }
  };

  const huePureCss = `hsl(${effectiveHue}, 100%, 50%)`;

  return (
    <div className={styles.colorPanel}>
      {/* Dual Primary / Secondary Swatch + Swap & Reset */}
      <div className={styles.swatchRow}>
        <div className={styles.dualSwatches}>
          <button
            type="button"
            className={[styles.swatchBtn, styles.swatchSecondary, activeSlot === 'secondary' ? styles.swatchActive : ''].join(' ')}
            style={{ backgroundColor: rgbaToCss(secondary) }}
            onClick={() => onSelectSlot('secondary')}
            aria-label={`${t('paint.color.secondary')}: ${rgbaToHex(secondary)}`}
            title={`${t('paint.color.secondary')} (${rgbaToHex(secondary)})`}
          />
          <button
            type="button"
            className={[styles.swatchBtn, styles.swatchPrimary, activeSlot === 'primary' ? styles.swatchActive : ''].join(' ')}
            style={{ backgroundColor: rgbaToCss(primary) }}
            onClick={() => onSelectSlot('primary')}
            aria-label={`${t('paint.color.primary')}: ${rgbaToHex(primary)}`}
            title={`${t('paint.color.primary')} (${rgbaToHex(primary)})`}
          />
        </div>

        <div className={styles.swatchMeta}>
          <div className={styles.slotTabs} role="group" aria-label={t('paint.color.slotAria')}>
            <button
              type="button"
              className={[styles.miniTab, activeSlot === 'primary' ? styles.miniTabActive : ''].join(' ')}
              onClick={() => onSelectSlot('primary')}
              aria-pressed={activeSlot === 'primary'}
            >
              {t('paint.color.primary')}
            </button>
            <button
              type="button"
              className={[styles.miniTab, activeSlot === 'secondary' ? styles.miniTabActive : ''].join(' ')}
              onClick={() => onSelectSlot('secondary')}
              aria-pressed={activeSlot === 'secondary'}
            >
              {t('paint.color.secondary')}
            </button>
          </div>
          <div className={styles.swatchQuickBtns}>
            <button type="button" className={styles.tinyBtn} onClick={onSwap} title={t('paint.color.swap')}>
              ⇄
            </button>
            <button
              type="button"
              className={styles.tinyBtn}
              onClick={onResetBW}
              title={t('paint.color.reset')}
              aria-label={t('paint.color.reset')}
            >
              B/W
            </button>
            <button
              type="button"
              className={styles.tinyBtn}
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? t('paint.color.less') : t('paint.color.more')}
            </button>
          </div>
        </div>
      </div>

      {/* 2D Saturation / Value Picker */}
      <div
        ref={svBoxRef}
        className={styles.svBox}
        style={{ backgroundColor: huePureCss }}
        onPointerDown={handleSvPointerDown}
        role="application"
        aria-label={t('paint.color.svAria')}
      >
        <div className={styles.svWhite} />
        <div className={styles.svBlack} />
        <div
          className={styles.svThumb}
          style={{
            left: `${hsv.s}%`,
            top: `${100 - hsv.v}%`,
            backgroundColor: rgbaToCss({ ...activeColor, a: 255 }),
          }}
        />
      </div>

      {/* Hue Slider */}
      <div className={styles.sliderRow}>
        <span className={styles.sliderLabel}>H</span>
        <input
          type="range"
          min={0}
          max={359}
          value={effectiveHue}
          onChange={(e) => handleHueChange(Number(e.target.value))}
          className={styles.hueRange}
          aria-label={t('paint.color.hueSliderAria')}
        />
        <input
          type="number"
          min={0}
          max={359}
          value={effectiveHue}
          onChange={(e) => {
            const v = Math.max(0, Math.min(359, Math.round(Number(e.target.value) || 0)));
            handleHueChange(v);
          }}
          className={styles.sliderNumInput}
          aria-label={t('paint.color.hueAria')}
        />
        <span className={styles.sliderUnit}>°</span>
      </div>

      {/* Alpha Slider */}
      <div className={styles.sliderRow}>
        <span className={styles.sliderLabel}>A</span>
        <input
          type="range"
          min={0}
          max={255}
          value={activeColor.a}
          onChange={(e) => setActiveColor({ ...activeColor, a: clampByte(Number(e.target.value)) })}
          className={styles.alphaRange}
          aria-label={`${t('paint.color.alpha')} slider`}
        />
        <input
          type="number"
          min={0}
          max={255}
          value={activeColor.a}
          onChange={(e) => setActiveColor({ ...activeColor, a: clampByte(Number(e.target.value)) })}
          className={styles.sliderNumInput}
          aria-label={t('paint.color.alpha')}
        />
      </div>

      {/* Hex & Optional RGB Inputs */}
      <div className={styles.hexRow}>
        <label className={styles.hexLabel}>
          <span>{t('paint.color.hex')}</span>
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => handleHexCommit(e.target.value)}
            onBlur={() => setHexDraft(rgbaToHex(activeColor))}
            className={styles.hexInput}
            spellCheck={false}
            maxLength={9}
            aria-label={t('paint.color.hex')}
          />
        </label>
        <button
          type="button"
          className={styles.tinyBtn}
          onClick={() => setActiveColor(BLACK)}
          title="#000000"
          aria-label={t('paint.color.setBlackAria')}
        >
          <span className={styles.miniDot} style={{ background: '#000' }} />
        </button>
        <button
          type="button"
          className={styles.tinyBtn}
          onClick={() => setActiveColor(WHITE)}
          title="#FFFFFF"
          aria-label={t('paint.color.setWhiteAria')}
        >
          <span className={styles.miniDot} style={{ background: '#fff' }} />
        </button>
      </div>

      {expanded && (
        <div className={styles.rgbGrid}>
          {(['r', 'g', 'b', 'a'] as const).map((channel) => (
            <label key={channel} className={styles.rgbCell}>
              <span>{channel.toUpperCase()}</span>
              <input
                type="number"
                min={0}
                max={255}
                value={activeColor[channel]}
                onChange={(e) =>
                  setActiveColor({
                    ...activeColor,
                    [channel]: clampByte(Number(e.target.value)),
                  })
                }
                className={styles.rgbInput}
              />
            </label>
          ))}
        </div>
      )}

      {/* 32-Swatch Paint.NET Palette */}
      <div className={styles.paletteSection}>
        <div className={styles.subLabel}>{t('paint.color.palette')}</div>
        <div className={styles.paletteGrid}>
          {DEFAULT_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              className={styles.paletteSwatch}
              style={{ backgroundColor: hex }}
              title={`${hex} (Left: Primary · Right: Secondary)`}
              aria-label={`Color ${hex}`}
              onClick={() => setActiveColor(hexToRgba(hex, activeColor.a))}
              onContextMenu={(e) => {
                e.preventDefault();
                onChangeSecondary(hexToRgba(hex, secondary.a));
              }}
            />
          ))}
        </div>
      </div>

      {/* Recent Colors */}
      {recentColors.length > 0 && (
        <div className={styles.paletteSection}>
          <div className={styles.subLabel}>{t('paint.color.recent')}</div>
          <div className={styles.recentGrid}>
            {recentColors.map((c, idx) => {
              const hex = rgbaToHex(c);
              return (
                <button
                  key={`${hex}-${idx}`}
                  type="button"
                  className={styles.paletteSwatch}
                  style={{ backgroundColor: rgbaToCss(c) }}
                  title={hex}
                  aria-label={`Recent color ${hex}`}
                  onClick={() => setActiveColor({ ...c })}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
