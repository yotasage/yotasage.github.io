import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { pickReadableInk } from '../../lib/color/accessibility';
import {
  clamp,
  cmykToRgb,
  hslToRgb,
  hsvToRgb,
  maxSrgbChromaForOklch,
  normalizeHue,
  oklchToRgb,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  rgbToOklch,
} from '../../lib/color/convert';
import { getHarmonyAngles } from '../../lib/color/palette';
import { formatCssRgba, formatHex } from '../../lib/color/parse';
import type { HarmonyKind, PickerMode, RGBA, SliderSpace } from '../../lib/color/types';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Color.module.css';

export interface ColorPickerStageProps {
  color: RGBA;
  previousColor: RGBA;
  uppercaseHex: boolean;
  harmonyKind: HarmonyKind;
  onChange: (next: RGBA, commitPrevious?: boolean) => void;
  onRestorePrevious: () => void;
  onSaveSwatch: () => void;
  onOpenImagePicker: () => void;
  quickMode?: boolean;
}

interface EyeDropperCtor {
  new (): { open: () => Promise<{ sRGBHex: string }> };
}

function getEyeDropperCtor(): EyeDropperCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { EyeDropper?: EyeDropperCtor };
  return typeof w.EyeDropper === 'function' ? w.EyeDropper : null;
}

export default function ColorPickerStage({
  color,
  previousColor,
  uppercaseHex,
  harmonyKind,
  onChange,
  onRestorePrevious,
  onSaveSwatch,
  onOpenImagePicker,
  quickMode = false,
}: ColorPickerStageProps) {
  const { t } = useI18n();
  const [pickerMode, setPickerMode] = useState<PickerMode>('square');
  const [sliderSpace, setSliderSpace] = useState<SliderSpace>('rgb');
  const [showWheelHarmonies, setShowWheelHarmonies] = useState<boolean>(true);
  const [justSaved, setJustSaved] = useState<boolean>(false);
  const [hasEyeDropper, setHasEyeDropper] = useState<boolean>(false);

  // Preserve hue when saturation/value/chroma hits 0 so dragging along edges never jumps hue
  const hsvNow = useMemo(() => rgbToHsv(color), [color]);
  const oklchNow = useMemo(() => rgbToOklch(color), [color]);
  const [stableHsvHue, setStableHsvHue] = useState<number>(() => hsvNow.h);
  const [stableOkHue, setStableOkHue] = useState<number>(() => oklchNow.h);

  const effectiveHsvHue = hsvNow.s > 0.5 && hsvNow.v > 0.5 ? hsvNow.h : stableHsvHue;
  const effectiveOkHue = oklchNow.c > 0.003 ? oklchNow.h : stableOkHue;

  useEffect(() => {
    setHasEyeDropper(getEyeDropperCtor() !== null);
  }, []);

  useEffect(() => {
    if (hsvNow.s > 0.5 && hsvNow.v > 0.5) setStableHsvHue(hsvNow.h);
  }, [hsvNow.h, hsvNow.s, hsvNow.v]);

  useEffect(() => {
    if (oklchNow.c > 0.003) setStableOkHue(oklchNow.h);
  }, [oklchNow.c, oklchNow.h]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingRef = useRef<boolean>(false);

  // Draw the active picker canvas (Square HSV / Circular Wheel HSV / OKLCH L×C plane)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;

    if (pickerMode === 'square') {
      const cssW = Math.max(240, Math.round(canvas.clientWidth || 360));
      const cssH = 256;
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Base hue fill
      ctx.fillStyle = `hsl(${effectiveHsvHue}, 100%, 50%)`;
      ctx.fillRect(0, 0, cssW, cssH);

      // Horizontal white -> transparent
      const whiteGrad = ctx.createLinearGradient(0, 0, cssW, 0);
      whiteGrad.addColorStop(0, '#ffffff');
      whiteGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = whiteGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      // Vertical transparent -> black
      const blackGrad = ctx.createLinearGradient(0, 0, 0, cssH);
      blackGrad.addColorStop(0, 'rgba(0,0,0,0)');
      blackGrad.addColorStop(1, '#000000');
      ctx.fillStyle = blackGrad;
      ctx.fillRect(0, 0, cssW, cssH);

      // Selection crosshair thumb
      const tx = (hsvNow.s / 100) * cssW;
      const ty = (1 - hsvNow.v / 100) * cssH;
      drawThumb(ctx, tx, ty, formatHex({ ...color, a: 1 }));
    } else if (pickerMode === 'wheel') {
      const size = 268;
      const px = Math.round(size * dpr);
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px;
        canvas.height = px;
      }
      // Render smooth pixel-exact HSV color wheel scaled by current brightness (V)
      const img = ctx.createImageData(px, px);
      const data = img.data;
      const cx = px / 2;
      const cy = px / 2;
      const radius = px / 2 - 2 * dpr;
      const val = Math.max(8, hsvNow.v);

      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.hypot(dx, dy);
          const off = (y * px + x) * 4;
          if (dist <= radius) {
            const angle = normalizeHue((Math.atan2(dy, dx) * 180) / Math.PI);
            const sat = (dist / radius) * 100;
            const rgb = hsvToRgb({ h: angle, s: sat, v: val });
            const edgeAlpha = dist > radius - 1.5 ? clamp((radius - dist) / 1.5, 0, 1) : 1;
            data[off] = rgb.r;
            data[off + 1] = rgb.g;
            data[off + 2] = rgb.b;
            data[off + 3] = Math.round(edgeAlpha * 255);
          } else {
            data[off + 3] = 0;
          }
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.putImageData(img, 0, 0);

      // Draw optional harmony rays & dots
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rCss = size / 2 - 2;
      const cCss = size / 2;

      // Subtle outer ring
      ctx.beginPath();
      ctx.arc(cCss, cCss, rCss, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = 1.25;
      ctx.stroke();

      const activeRad = (effectiveHsvHue * Math.PI) / 180;
      const activeDist = (hsvNow.s / 100) * rCss;

      if (showWheelHarmonies && !quickMode) {
        const angles = getHarmonyAngles(effectiveHsvHue, harmonyKind);
        for (let i = 1; i < angles.length; i++) {
          const aRad = (angles[i] * Math.PI) / 180;
          const hx = cCss + Math.cos(aRad) * activeDist;
          const hy = cCss + Math.sin(aRad) * activeDist;
          ctx.beginPath();
          ctx.moveTo(cCss, cCss);
          ctx.lineTo(hx, hy);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.lineWidth = 1.4;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
          ctx.fillStyle = formatHex(hsvToRgb({ h: angles[i], s: hsvNow.s, v: hsvNow.v }));
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      const tx = cCss + Math.cos(activeRad) * activeDist;
      const ty = cCss + Math.sin(activeRad) * activeDist;
      drawThumb(ctx, tx, ty, formatHex({ ...color, a: 1 }));
    } else {
      // OKLCH perceptual Lightness (Y) × Chroma (X) plane with exact sRGB gamut curve
      const cssW = Math.max(240, Math.round(canvas.clientWidth || 360));
      const cssH = 256;
      const w = Math.round(cssW * dpr);
      const h = Math.round(cssH * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      // Compute pixel buffer at logical CSS resolution for snappy speed, then scale up
      const offCanvas = document.createElement('canvas');
      offCanvas.width = cssW;
      offCanvas.height = cssH;
      const octx = offCanvas.getContext('2d');
      if (octx) {
        const img = octx.createImageData(cssW, cssH);
        const data = img.data;
        const maxCScale = 0.34;
        const maxCByRow = new Float32Array(cssH);

        for (let y = 0; y < cssH; y++) {
          const l = 1 - y / (cssH - 1);
          const maxC = maxSrgbChromaForOklch(l, effectiveOkHue);
          maxCByRow[y] = maxC;
          for (let x = 0; x < cssW; x++) {
            const cVal = (x / (cssW - 1)) * maxCScale;
            const off = (y * cssW + x) * 4;
            if (cVal <= maxC + 0.001) {
              const rgb = oklchToRgb({ l, c: cVal, h: effectiveOkHue });
              data[off] = rgb.r;
              data[off + 1] = rgb.g;
              data[off + 2] = rgb.b;
              data[off + 3] = 255;
            } else {
              // Subtle neutral out-of-gamut region
              const checker = ((x >> 3) + (y >> 3)) & 1;
              const shade = checker ? 226 : 238;
              data[off] = shade;
              data[off + 1] = shade;
              data[off + 2] = shade;
              data[off + 3] = 255;
            }
          }
        }
        octx.putImageData(img, 0, 0);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.drawImage(offCanvas, 0, 0, cssW, cssH);

        // Draw crisp sRGB gamut curve
        ctx.beginPath();
        for (let y = 0; y < cssH; y++) {
          const x = Math.min(cssW - 1, (maxCByRow[y] / maxCScale) * (cssW - 1));
          if (y === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const tx = clamp((oklchNow.c / maxCScale) * cssW, 0, cssW);
        const ty = clamp((1 - oklchNow.l) * cssH, 0, cssH);
        drawThumb(ctx, tx, ty, formatHex({ ...color, a: 1 }));
      }
    }
  }, [color, effectiveHsvHue, effectiveOkHue, harmonyKind, hsvNow.s, hsvNow.v, oklchNow.c, oklchNow.l, pickerMode, quickMode, showWheelHarmonies]);

  const updateFromCanvasPointer = useCallback(
    (clientX: number, clientY: number, commitPrev: boolean) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (pickerMode === 'square') {
        const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
        const v = clamp((1 - (clientY - rect.top) / rect.height) * 100, 0, 100);
        onChange(hsvToRgb({ h: effectiveHsvHue, s, v }, color.a), commitPrev);
      } else if (pickerMode === 'wheel') {
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const radius = Math.min(rect.width, rect.height) / 2 - 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        const dist = Math.min(radius, Math.hypot(dx, dy));
        const h = normalizeHue((Math.atan2(dy, dx) * 180) / Math.PI);
        const s = (dist / radius) * 100;
        setStableHsvHue(h);
        onChange(hsvToRgb({ h, s, v: hsvNow.v }, color.a), commitPrev);
      } else {
        const maxCScale = 0.34;
        const l = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
        const rawC = clamp(((clientX - rect.left) / rect.width) * maxCScale, 0, maxCScale);
        const maxC = maxSrgbChromaForOklch(l, effectiveOkHue);
        onChange(oklchToRgb({ l, c: Math.min(rawC, maxC), h: effectiveOkHue }, color.a), commitPrev);
      }
    },
    [color.a, effectiveHsvHue, effectiveOkHue, hsvNow.v, onChange, pickerMode],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromCanvasPointer(e.clientX, e.clientY, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    updateFromCanvasPointer(e.clientX, e.clientY, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleEyeDropper = async () => {
    const Ctor = getEyeDropperCtor();
    if (!Ctor) return;
    try {
      const dropper = new Ctor();
      const res = await dropper.open();
      if (res?.sRGBHex) {
        const clean = res.sRGBHex.replace('#', '');
        if (clean.length === 6) {
          onChange(
            {
              r: parseInt(clean.slice(0, 2), 16),
              g: parseInt(clean.slice(2, 4), 16),
              b: parseInt(clean.slice(4, 6), 16),
              a: color.a,
            },
            true,
          );
        }
      }
    } catch {
      // User cancelled eyedropper
    }
  };

  const handleRandomColor = () => {
    const h = Math.floor(Math.random() * 360);
    const c = 0.1 + Math.random() * 0.14;
    const l = 0.45 + Math.random() * 0.3;
    onChange(oklchToRgb({ l, c, h }, 1), true);
  };

  const handleSaveClick = () => {
    onSaveSwatch();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1200);
  };

  const hsl = useMemo(() => rgbToHsl(color), [color]);
  const cmyk = useMemo(() => rgbToCmyk(color), [color]);

  const currentHex = formatHex(color, { uppercase: uppercaseHex });
  const prevHex = formatHex(previousColor, { uppercase: uppercaseHex });
  const currentInk = pickReadableInk(color);
  const prevInk = pickReadableInk(previousColor);

  const solidCss = `rgb(${color.r}, ${color.g}, ${color.b})`;

  return (
    <section className={styles.card} aria-labelledby="color-picker-heading">
      <div className={styles.cardHeader}>
        <h2 id="color-picker-heading" className={styles.cardTitle}>
          {t('color.picker.heading')}
        </h2>
        <div className={styles.segmented} role="group" aria-label={t('color.picker.modeAria')}>
          {(['square', 'wheel', 'oklch'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={pickerMode === m}
              className={[styles.segBtn, pickerMode === m ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setPickerMode(m)}
            >
              {m === 'square'
                ? t('color.picker.modeSquare')
                : m === 'wheel'
                  ? t('color.picker.modeWheel')
                  : t('color.picker.modeOklch')}
            </button>
          ))}
        </div>
      </div>

      {/* Main 2D Picker Surface */}
      <div className={styles.pickerCanvasFrame}>
        {pickerMode === 'wheel' ? (
          <div className={styles.wheelRow}>
            <canvas
              ref={canvasRef}
              className={styles.pickerCanvasWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              aria-label={t('color.picker.canvasWheelAria')}
              data-testid="color-picker-canvas"
              data-picker-mode={pickerMode}
            />
            {!quickMode && (
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={showWheelHarmonies}
                  onChange={(e) => setShowWheelHarmonies(e.target.checked)}
                />
                <span>{t('color.picker.showHarmoniesOnWheel')}</span>
              </label>
            )}
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className={styles.pickerCanvasSquare}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            aria-label={
              pickerMode === 'square'
                ? t('color.picker.canvasSquareAria')
                : t('color.picker.canvasOklchAria')
            }
            data-testid="color-picker-canvas"
            data-picker-mode={pickerMode}
          />
        )}
      </div>

      {/* Primary Axis Sliders (Hue / Brightness / OKLCH Hue + Alpha) */}
      <div className={styles.sliderBlock}>
        {pickerMode === 'square' && (
          <div className={styles.sliderRow}>
            <label htmlFor="picker-hue-range" className={styles.sliderLabel}>
              {t('color.picker.hue')}
            </label>
            <div className={styles.sliderTrackWrap}>
              <div
                className={styles.sliderFill}
                style={{
                  background:
                    'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
                }}
              />
              <input
                id="picker-hue-range"
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round(effectiveHsvHue)}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setStableHsvHue(h);
                  onChange(hsvToRgb({ h, s: hsvNow.s, v: hsvNow.v }, color.a), false);
                }}
                className={styles.rangeInput}
              />
            </div>
            <input
              type="number"
              min={0}
              max={360}
              value={Math.round(effectiveHsvHue)}
              onChange={(e) => {
                const h = clamp(Number(e.target.value), 0, 360);
                setStableHsvHue(h);
                onChange(hsvToRgb({ h, s: hsvNow.s, v: hsvNow.v }, color.a), true);
              }}
              aria-label={t('color.picker.hue')}
              className={styles.numInput}
            />
          </div>
        )}

        {pickerMode === 'wheel' && (
          <div className={styles.sliderRow}>
            <label htmlFor="picker-val-range" className={styles.sliderLabel}>
              {t('color.picker.value')}
            </label>
            <div className={styles.sliderTrackWrap}>
              <div
                className={styles.sliderFill}
                style={{
                  background: `linear-gradient(to right, #000000, ${formatHex(hsvToRgb({ h: effectiveHsvHue, s: hsvNow.s, v: 100 }))})`,
                }}
              />
              <input
                id="picker-val-range"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(hsvNow.v)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  onChange(hsvToRgb({ h: effectiveHsvHue, s: hsvNow.s, v }, color.a), false);
                }}
                className={styles.rangeInput}
              />
            </div>
            <input
              type="number"
              min={0}
              max={100}
              value={Math.round(hsvNow.v)}
              onChange={(e) => {
                const v = clamp(Number(e.target.value), 0, 100);
                onChange(hsvToRgb({ h: effectiveHsvHue, s: hsvNow.s, v }, color.a), true);
              }}
              aria-label={t('color.picker.value')}
              className={styles.numInput}
            />
          </div>
        )}

        {pickerMode === 'oklch' && (
          <div className={styles.sliderRow}>
            <label htmlFor="picker-okhue-range" className={styles.sliderLabel}>
              {t('color.picker.oklchHue')}
            </label>
            <div className={styles.sliderTrackWrap}>
              <div
                className={styles.sliderFill}
                style={{
                  background:
                    'linear-gradient(to right, #ff457a 0%, #f07d1b 16%, #a8aa00 33%, #00b876 50%, #00a3e0 67%, #7a73ff 83%, #ff457a 100%)',
                }}
              />
              <input
                id="picker-okhue-range"
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round(effectiveOkHue)}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setStableOkHue(h);
                  onChange(oklchToRgb({ l: oklchNow.l, c: oklchNow.c, h }, color.a), false);
                }}
                className={styles.rangeInput}
              />
            </div>
            <input
              type="number"
              min={0}
              max={360}
              value={Math.round(effectiveOkHue)}
              onChange={(e) => {
                const h = clamp(Number(e.target.value), 0, 360);
                setStableOkHue(h);
                onChange(oklchToRgb({ l: oklchNow.l, c: oklchNow.c, h }, color.a), true);
              }}
              aria-label={t('color.picker.oklchHue')}
              className={styles.numInput}
            />
          </div>
        )}

        {/* Alpha / Opacity Slider */}
        <div className={styles.sliderRow}>
          <label htmlFor="picker-alpha-range" className={styles.sliderLabel}>
            {t('color.picker.alpha')}
          </label>
          <div className={[styles.sliderTrackWrap, styles.checkerboard].join(' ')}>
            <div
              className={styles.sliderFill}
              style={{
                background: `linear-gradient(to right, rgba(${color.r}, ${color.g}, ${color.b}, 0), ${solidCss})`,
              }}
            />
            <input
              id="picker-alpha-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(color.a * 100)}
              onChange={(e) => onChange({ ...color, a: Number(e.target.value) / 100 }, false)}
              className={styles.rangeInput}
            />
          </div>
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(color.a * 100)}
            onChange={(e) => onChange({ ...color, a: clamp(Number(e.target.value), 0, 100) / 100 }, true)}
            aria-label={t('color.picker.alpha')}
            className={styles.numInput}
          />
        </div>
      </div>

      {/* Current vs Previous Split Swatch */}
      <div className={styles.compareBar}>
        <div
          className={[styles.compareSwatch, styles.compareSwatchStatic, styles.checkerboard].join(' ')}
          data-testid="active-color-swatch"
        >
          <div className={styles.compareOverlay} style={{ backgroundColor: formatCssRgba(color) }} />
          <div className={styles.compareText} style={{ color: currentInk }}>
            <span className={styles.compareTag}>{t('color.picker.current')}</span>
            <span className={styles.compareHex}>{currentHex}</span>
          </div>
        </div>
        <button
          type="button"
          className={[styles.compareSwatch, styles.checkerboard].join(' ')}
          onClick={onRestorePrevious}
          title={t('color.picker.restorePrevious')}
          aria-label={`${t('color.picker.restorePrevious')} (${prevHex})`}
        >
          <div className={styles.compareOverlay} style={{ backgroundColor: formatCssRgba(previousColor) }} />
          <div className={styles.compareText} style={{ color: prevInk }}>
            <span className={styles.compareTag}>{t('color.picker.previous')}</span>
            <span className={styles.compareHex}>{prevHex}</span>
          </div>
        </button>
      </div>

      {/* Action Buttons */}
      <div className={styles.pickerActionRow}>
        <button
          type="button"
          className={[styles.primaryButton, justSaved ? styles.buttonCopied : ''].filter(Boolean).join(' ')}
          onClick={handleSaveClick}
        >
          {justSaved ? t('color.picker.saved') : t('color.picker.saveSwatch')}
        </button>
        <button type="button" className={styles.button} onClick={onOpenImagePicker}>
          {t('color.picker.openImagePicker')}
        </button>
        {hasEyeDropper && (
          <button type="button" className={styles.button} onClick={handleEyeDropper}>
            {t('color.picker.eyedropper')}
          </button>
        )}
        <button type="button" className={styles.button} onClick={handleRandomColor}>
          {t('color.picker.random')}
        </button>
      </div>

      {/* Fine-grained Channel Sliders */}
      <div className={styles.channelsSection}>
        <div className={styles.channelsHeader}>
          <span className={styles.subHeading} style={{ margin: 0 }}>
            {t('color.picker.channelsHeading')}
          </span>
          <div className={styles.segmented} role="group" aria-label={t('color.picker.channelSpaceAria')}>
            {(['rgb', 'hsl', 'hsv', 'oklch', 'cmyk'] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                aria-pressed={sliderSpace === sp}
                className={[styles.segBtn, sliderSpace === sp ? styles.segBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => setSliderSpace(sp)}
              >
                {sp.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.sliderBlock} style={{ marginBottom: 0 }}>
          {sliderSpace === 'rgb' && (
            <>
              <ChannelSlider
                id="ch-r"
                label="R"
                value={color.r}
                min={0}
                max={255}
                step={1}
                gradient={`linear-gradient(to right, rgb(0,${color.g},${color.b}), rgb(255,${color.g},${color.b}))`}
                onChange={(v) => onChange({ ...color, r: Math.round(v) }, false)}
              />
              <ChannelSlider
                id="ch-g"
                label="G"
                value={color.g}
                min={0}
                max={255}
                step={1}
                gradient={`linear-gradient(to right, rgb(${color.r},0,${color.b}), rgb(${color.r},255,${color.b}))`}
                onChange={(v) => onChange({ ...color, g: Math.round(v) }, false)}
              />
              <ChannelSlider
                id="ch-b"
                label="B"
                value={color.b}
                min={0}
                max={255}
                step={1}
                gradient={`linear-gradient(to right, rgb(${color.r},${color.g},0), rgb(${color.r},${color.g},255))`}
                onChange={(v) => onChange({ ...color, b: Math.round(v) }, false)}
              />
            </>
          )}

          {sliderSpace === 'hsl' && (
            <>
              <ChannelSlider
                id="ch-hsl-h"
                label="H (°)"
                value={Math.round(hsl.h)}
                min={0}
                max={360}
                step={1}
                gradient="linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)"
                onChange={(v) => onChange(hslToRgb({ ...hsl, h: v }, color.a), false)}
              />
              <ChannelSlider
                id="ch-hsl-s"
                label="S (%)"
                value={Math.round(hsl.s)}
                min={0}
                max={100}
                step={1}
                gradient={`linear-gradient(to right, ${formatHex(hslToRgb({ h: hsl.h, s: 0, l: hsl.l }))}, ${formatHex(hslToRgb({ h: hsl.h, s: 100, l: hsl.l }))})`}
                onChange={(v) => onChange(hslToRgb({ ...hsl, s: v }, color.a), false)}
              />
              <ChannelSlider
                id="ch-hsl-l"
                label="L (%)"
                value={Math.round(hsl.l)}
                min={0}
                max={100}
                step={1}
                gradient={`linear-gradient(to right, #000000, ${formatHex(hslToRgb({ h: hsl.h, s: hsl.s, l: 50 }))}, #ffffff)`}
                onChange={(v) => onChange(hslToRgb({ ...hsl, l: v }, color.a), false)}
              />
            </>
          )}

          {sliderSpace === 'hsv' && (
            <>
              <ChannelSlider
                id="ch-hsv-h"
                label="H (°)"
                value={Math.round(effectiveHsvHue)}
                min={0}
                max={360}
                step={1}
                gradient="linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)"
                onChange={(v) => {
                  setStableHsvHue(v);
                  onChange(hsvToRgb({ h: v, s: hsvNow.s, v: hsvNow.v }, color.a), false);
                }}
              />
              <ChannelSlider
                id="ch-hsv-s"
                label="S (%)"
                value={Math.round(hsvNow.s)}
                min={0}
                max={100}
                step={1}
                gradient={`linear-gradient(to right, ${formatHex(hsvToRgb({ h: effectiveHsvHue, s: 0, v: hsvNow.v }))}, ${formatHex(hsvToRgb({ h: effectiveHsvHue, s: 100, v: hsvNow.v }))})`}
                onChange={(v) => onChange(hsvToRgb({ h: effectiveHsvHue, s: v, v: hsvNow.v }, color.a), false)}
              />
              <ChannelSlider
                id="ch-hsv-v"
                label="V (%)"
                value={Math.round(hsvNow.v)}
                min={0}
                max={100}
                step={1}
                gradient={`linear-gradient(to right, #000000, ${formatHex(hsvToRgb({ h: effectiveHsvHue, s: hsvNow.s, v: 100 }))})`}
                onChange={(v) => onChange(hsvToRgb({ h: effectiveHsvHue, s: hsvNow.s, v }, color.a), false)}
              />
            </>
          )}

          {sliderSpace === 'oklch' && (
            <>
              <ChannelSlider
                id="ch-ok-l"
                label="L (%)"
                value={Math.round(oklchNow.l * 1000) / 10}
                min={0}
                max={100}
                step={0.5}
                gradient={`linear-gradient(to right, #000000, ${formatHex(oklchToRgb({ l: 0.6, c: oklchNow.c, h: effectiveOkHue }))}, #ffffff)`}
                onChange={(v) => onChange(oklchToRgb({ l: v / 100, c: oklchNow.c, h: effectiveOkHue }, color.a), false)}
              />
              <ChannelSlider
                id="ch-ok-c"
                label="C"
                value={Math.round(oklchNow.c * 1000) / 1000}
                min={0}
                max={0.34}
                step={0.002}
                gradient={`linear-gradient(to right, ${formatHex(oklchToRgb({ l: oklchNow.l, c: 0, h: effectiveOkHue }))}, ${formatHex(oklchToRgb({ l: oklchNow.l, c: maxSrgbChromaForOklch(oklchNow.l, effectiveOkHue), h: effectiveOkHue }))})`}
                onChange={(v) => onChange(oklchToRgb({ l: oklchNow.l, c: v, h: effectiveOkHue }, color.a), false)}
              />
              <ChannelSlider
                id="ch-ok-h"
                label="H (°)"
                value={Math.round(effectiveOkHue)}
                min={0}
                max={360}
                step={1}
                gradient="linear-gradient(to right, #ff457a 0%, #f07d1b 16%, #a8aa00 33%, #00b876 50%, #00a3e0 67%, #7a73ff 83%, #ff457a 100%)"
                onChange={(v) => {
                  setStableOkHue(v);
                  onChange(oklchToRgb({ l: oklchNow.l, c: oklchNow.c, h: v }, color.a), false);
                }}
              />
            </>
          )}

          {sliderSpace === 'cmyk' && (
            <>
              <ChannelSlider
                id="ch-cmyk-c"
                label="C (%)"
                value={Math.round(cmyk.c)}
                min={0}
                max={100}
                step={1}
                gradient={`linear-gradient(to right, ${formatHex(cmykToRgb({ ...cmyk, c: 0 }))}, ${formatHex(cmykToRgb({ ...cmyk, c: 100 }))})`}
                onChange={(v) => onChange(cmykToRgb({ ...cmyk, c: v }, color.a), false)}
              />
              <ChannelSlider
                id="ch-cmyk-m"
                label="M (%)"
                value={Math.round(cmyk.m)}
                min={0}
                max={100}
                step={1}
                gradient={`linear-gradient(to right, ${formatHex(cmykToRgb({ ...cmyk, m: 0 }))}, ${formatHex(cmykToRgb({ ...cmyk, m: 100 }))})`}
                onChange={(v) => onChange(cmykToRgb({ ...cmyk, m: v }, color.a), false)}
              />
              <ChannelSlider
                id="ch-cmyk-y"
                label="Y (%)"
                value={Math.round(cmyk.y)}
                min={0}
                max={100}
                step={1}
                gradient={`linear-gradient(to right, ${formatHex(cmykToRgb({ ...cmyk, y: 0 }))}, ${formatHex(cmykToRgb({ ...cmyk, y: 100 }))})`}
                onChange={(v) => onChange(cmykToRgb({ ...cmyk, y: v }, color.a), false)}
              />
              <ChannelSlider
                id="ch-cmyk-k"
                label="K (%)"
                value={Math.round(cmyk.k)}
                min={0}
                max={100}
                step={1}
                gradient={`linear-gradient(to right, ${formatHex(cmykToRgb({ ...cmyk, k: 0 }))}, #000000)`}
                onChange={(v) => onChange(cmykToRgb({ ...cmyk, k: v }, color.a), false)}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function drawThumb(ctx: CanvasRenderingContext2D, x: number, y: number, fillHex: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 8.5, 0, Math.PI * 2);
  ctx.fillStyle = fillHex;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, 9.8, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.stroke();
  ctx.restore();
}

interface ChannelSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  gradient: string;
  onChange: (value: number) => void;
}

function ChannelSlider({ id, label, value, min, max, step, gradient, onChange }: ChannelSliderProps) {
  return (
    <div className={styles.sliderRow}>
      <label htmlFor={id} className={styles.sliderLabel}>
        {label}
      </label>
      <div className={styles.sliderTrackWrap}>
        <div className={styles.sliderFill} style={{ background: gradient }} />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={styles.rangeInput}
        />
      </div>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n, min, max));
        }}
        aria-label={label}
        className={styles.numInput}
      />
    </div>
  );
}
