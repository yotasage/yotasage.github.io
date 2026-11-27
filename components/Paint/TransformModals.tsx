import { useEffect, useState } from 'react';

import { computeRotatedDimensions, computeScaledDimensions } from '../../lib/paint/geometry';
import {
  type AnchorPosition,
  type ColorStyleId,
  MAX_CANVAS_DIM,
  MIN_CANVAS_DIM,
  type ResampleQuality,
} from '../../lib/paint/types';
import { type TranslationKey, useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Paint.module.css';
import type { ModalId } from './ToolBar';

export interface TransformModalsProps {
  modal: ModalId;
  activeDocName?: string;
  canvasWidth: number;
  canvasHeight: number;
  onClose: () => void;
  onNewCanvas: (w: number, h: number, bg: 'white' | 'transparent' | 'black') => void;
  onResize: (w: number, h: number, quality: ResampleQuality) => void;
  onScaleDown: (w: number, h: number, quality: ResampleQuality) => void;
  onCanvasSize: (w: number, h: number, anchor: AnchorPosition) => void;
  onRotate: (angleDeg: number, expandCanvas: boolean, allLayers: boolean) => void;
  onFlip: (dir: 'horizontal' | 'vertical', allLayers: boolean) => void;
  onApplyColorStyle: (
    style: ColorStyleId,
    opts: { threshold: number; posterizeLevels: number; allLayers: boolean },
  ) => void;
  onApplyAdjustments: (opts: {
    brightness: number;
    contrast: number;
    hue: number;
    saturation: number;
    allLayers: boolean;
  }) => void;
  onApplyQuickFilter: (kind: 'blur' | 'sharpen', allLayers: boolean) => void;
  onExportImage: (format: 'png' | 'jpeg' | 'webp', quality: number, filename: string) => void;
  onSaveProject: (filename: string) => void;
}

const ANCHOR_GRID: readonly AnchorPosition[] = [
  'tl', 'tc', 'tr',
  'ml', 'mc', 'mr',
  'bl', 'bc', 'br',
];

const COLOR_STYLES: readonly ColorStyleId[] = [
  'bw-threshold',
  'bw-dither',
  'grayscale',
  'sepia',
  'invert',
  'high-contrast',
  'posterize',
  'warm',
  'cool',
];

export default function TransformModals({
  modal,
  activeDocName,
  canvasWidth,
  canvasHeight,
  onClose,
  onNewCanvas,
  onResize,
  onScaleDown,
  onCanvasSize,
  onRotate,
  onFlip,
  onApplyColorStyle,
  onApplyAdjustments,
  onApplyQuickFilter,
  onExportImage,
  onSaveProject,
}: TransformModalsProps) {
  const { t } = useI18n();

  // New Canvas state
  const [newW, setNewW] = useState(960);
  const [newH, setNewH] = useState(640);
  const [newBg, setNewBg] = useState<'white' | 'transparent' | 'black'>('white');

  // Resize state
  const [resW, setResW] = useState(canvasWidth);
  const [resH, setResH] = useState(canvasHeight);
  const [lockAspect, setLockAspect] = useState(true);
  const [quality, setQuality] = useState<ResampleQuality>('smooth');

  // Scale down state
  const [scaleMode, setScaleMode] = useState<'percent' | 'maxEdge'>('percent');
  const [scalePct, setScalePct] = useState(50);
  const [maxEdge, setMaxEdge] = useState(1280);
  const [scaleQuality, setScaleQuality] = useState<ResampleQuality>('smooth');

  // Canvas size state
  const [csW, setCsW] = useState(canvasWidth);
  const [csH, setCsH] = useState(canvasHeight);
  const [anchor, setAnchor] = useState<AnchorPosition>('mc');

  // Rotate state
  const [angle, setAngle] = useState(15);
  const [expandCanvas, setExpandCanvas] = useState(true);
  const [allLayers, setAllLayers] = useState(true);

  // Color styles state
  const [selectedStyle, setSelectedStyle] = useState<ColorStyleId>('bw-threshold');
  const [bwThreshold, setBwThreshold] = useState(128);
  const [posterizeLevels, setPosterizeLevels] = useState(4);

  // Adjustments state
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(0);

  // Export state
  const [exportFmt, setExportFmt] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [exportQuality, setExportQuality] = useState(92);
  const [exportName, setExportName] = useState('artwork');

  useEffect(() => {
    if (!modal) return;
    setResW(canvasWidth);
    setResH(canvasHeight);
    setCsW(canvasWidth);
    setCsH(canvasHeight);
    setBrightness(0);
    setContrast(0);
    setHue(0);
    setSaturation(0);
    if (modal === 'export' && activeDocName) {
      setExportName(activeDocName);
    }
  }, [modal, activeDocName, canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, onClose]);

  if (!modal) return null;

  const clampDim = (v: number) => Math.max(MIN_CANVAS_DIM, Math.min(MAX_CANVAS_DIM, Math.round(v) || 1));

  const scaleResult = computeScaledDimensions(
    canvasWidth,
    canvasHeight,
    scaleMode === 'percent'
      ? { percent: scalePct, preventUpscale: true }
      : { maxEdge, preventUpscale: true },
  );
  const pixelPct = Math.round(((scaleResult.width * scaleResult.height) / Math.max(1, canvasWidth * canvasHeight)) * 100);

  const rotPreview = expandCanvas
    ? computeRotatedDimensions(canvasWidth, canvasHeight, angle)
    : { width: canvasWidth, height: canvasHeight };

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="paint-modal-title">
        {modal === 'new' && (
          <>
            <h2 id="paint-modal-title" className={styles.modalTitle}>{t('paint.modal.newTitle')}</h2>
            <div className={styles.presetRow}>
              {[
                { label: '800×600', w: 800, h: 600 },
                { label: '960×640', w: 960, h: 640 },
                { label: '1280×720', w: 1280, h: 720 },
                { label: '1920×1080', w: 1920, h: 1080 },
                { label: '1024×1024', w: 1024, h: 1024 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={styles.presetBtn}
                  onClick={() => { setNewW(p.w); setNewH(p.h); }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className={styles.modalGrid2}>
              <label className={styles.modalField}>
                <span>{t('paint.modal.width')}</span>
                <input type="number" min={1} max={MAX_CANVAS_DIM} value={newW} onChange={(e) => setNewW(Number(e.target.value))} />
              </label>
              <label className={styles.modalField}>
                <span>{t('paint.modal.height')}</span>
                <input type="number" min={1} max={MAX_CANVAS_DIM} value={newH} onChange={(e) => setNewH(Number(e.target.value))} />
              </label>
            </div>
            <div className={styles.modalField}>
              <span>{t('paint.modal.bgColor')}</span>
              <div className={styles.presetRow}>
                {(['white', 'transparent', 'black'] as const).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    className={[styles.presetBtn, newBg === bg ? styles.presetBtnActive : ''].join(' ')}
                    onClick={() => setNewBg(bg)}
                  >
                    {t(`paint.modal.bg${bg[0].toUpperCase()}${bg.slice(1)}` as TranslationKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.cmdBtn} onClick={onClose}>{t('paint.modal.cancel')}</button>
              <button
                type="button"
                className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')}
                onClick={() => {
                  onNewCanvas(clampDim(newW), clampDim(newH), newBg);
                  onClose();
                }}
              >
                {t('paint.modal.apply')}
              </button>
            </div>
          </>
        )}

        {modal === 'resize' && (
          <>
            <h2 id="paint-modal-title" className={styles.modalTitle}>{t('paint.modal.resizeTitle')}</h2>
            <p className={styles.modalNote}>Current: {canvasWidth} × {canvasHeight} px</p>
            <div className={styles.modalGrid2}>
              <label className={styles.modalField}>
                <span>{t('paint.modal.width')}</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_CANVAS_DIM}
                  value={resW}
                  onChange={(e) => {
                    const next = clampDim(Number(e.target.value));
                    setResW(next);
                    if (lockAspect && canvasWidth > 0) {
                      setResH(clampDim((next * canvasHeight) / canvasWidth));
                    }
                  }}
                />
              </label>
              <label className={styles.modalField}>
                <span>{t('paint.modal.height')}</span>
                <input
                  type="number"
                  min={1}
                  max={MAX_CANVAS_DIM}
                  value={resH}
                  onChange={(e) => {
                    const next = clampDim(Number(e.target.value));
                    setResH(next);
                    if (lockAspect && canvasHeight > 0) {
                      setResW(clampDim((next * canvasWidth) / canvasHeight));
                    }
                  }}
                />
              </label>
            </div>
            <label className={styles.modalCheck}>
              <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
              <span>{t('paint.modal.lockAspect')}</span>
            </label>
            <label className={styles.modalField}>
              <span>{t('paint.modal.quality')}</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value as ResampleQuality)}>
                <option value="smooth">{t('paint.modal.smooth')}</option>
                <option value="pixelated">{t('paint.modal.pixelated')}</option>
              </select>
            </label>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.cmdBtn} onClick={onClose}>{t('paint.modal.cancel')}</button>
              <button
                type="button"
                className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')}
                onClick={() => {
                  onResize(clampDim(resW), clampDim(resH), quality);
                  onClose();
                }}
              >
                {t('paint.modal.apply')}
              </button>
            </div>
          </>
        )}

        {modal === 'scaleDown' && (
          <>
            <h2 id="paint-modal-title" className={styles.modalTitle}>{t('paint.modal.scaleDownTitle')}</h2>
            <p className={styles.modalNote}>{t('paint.modal.scaleDownHint')}</p>

            <div className={styles.modalField}>
              <span>{t('paint.modal.scalePercent')}</span>
              <div className={styles.presetRow}>
                {[75, 50, 33, 25, 10].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    className={[styles.presetBtn, scaleMode === 'percent' && scalePct === pct ? styles.presetBtnActive : ''].join(' ')}
                    onClick={() => { setScaleMode('percent'); setScalePct(pct); }}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <div className={styles.modalSliderRow}>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={scalePct}
                  onChange={(e) => { setScaleMode('percent'); setScalePct(Number(e.target.value)); }}
                  aria-label={`${t('paint.modal.scalePercent')} slider`}
                />
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={scalePct}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 1)));
                    setScaleMode('percent');
                    setScalePct(v);
                  }}
                  className={styles.modalNumSm}
                  aria-label={t('paint.modal.scalePercent')}
                />
                <span>%</span>
              </div>
            </div>

            <div className={styles.modalField}>
              <span>{t('paint.modal.scaleMaxEdge')}</span>
              <div className={styles.presetRow}>
                {[1920, 1280, 800, 512, 256].map((edge) => (
                  <button
                    key={edge}
                    type="button"
                    className={[styles.presetBtn, scaleMode === 'maxEdge' && maxEdge === edge ? styles.presetBtnActive : ''].join(' ')}
                    onClick={() => { setScaleMode('maxEdge'); setMaxEdge(edge); }}
                  >
                    ≤ {edge}px
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={16}
                max={MAX_CANVAS_DIM}
                value={maxEdge}
                onChange={(e) => { setScaleMode('maxEdge'); setMaxEdge(Math.max(16, Number(e.target.value) || 16)); }}
              />
            </div>

            <label className={styles.modalField}>
              <span>{t('paint.modal.quality')}</span>
              <select value={scaleQuality} onChange={(e) => setScaleQuality(e.target.value as ResampleQuality)}>
                <option value="smooth">{t('paint.modal.smooth')}</option>
                <option value="pixelated">{t('paint.modal.pixelated')}</option>
              </select>
            </label>

            <p className={styles.modalSummary}>
              {t('paint.modal.scalePreview', {
                w: scaleResult.width,
                h: scaleResult.height,
                pct: pixelPct,
              })}
            </p>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.cmdBtn} onClick={onClose}>{t('paint.modal.cancel')}</button>
              <button
                type="button"
                className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')}
                onClick={() => {
                  onScaleDown(scaleResult.width, scaleResult.height, scaleQuality);
                  onClose();
                }}
              >
                {t('paint.modal.apply')}
              </button>
            </div>
          </>
        )}

        {modal === 'canvasSize' && (
          <>
            <h2 id="paint-modal-title" className={styles.modalTitle}>{t('paint.modal.canvasSizeTitle')}</h2>
            <div className={styles.modalGrid2}>
              <label className={styles.modalField}>
                <span>{t('paint.modal.width')}</span>
                <input type="number" min={1} max={MAX_CANVAS_DIM} value={csW} onChange={(e) => setCsW(clampDim(Number(e.target.value)))} />
              </label>
              <label className={styles.modalField}>
                <span>{t('paint.modal.height')}</span>
                <input type="number" min={1} max={MAX_CANVAS_DIM} value={csH} onChange={(e) => setCsH(clampDim(Number(e.target.value)))} />
              </label>
            </div>
            <div className={styles.modalField}>
              <span>{t('paint.modal.anchor')}</span>
              <div className={styles.anchorGrid} role="group" aria-label={t('paint.modal.anchor')}>
                {ANCHOR_GRID.map((pos) => (
                  <button
                    key={pos}
                    type="button"
                    className={[styles.anchorCell, anchor === pos ? styles.anchorCellActive : ''].join(' ')}
                    onClick={() => setAnchor(pos)}
                    aria-label={`Anchor ${pos}`}
                    aria-pressed={anchor === pos}
                  >
                    ●
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.cmdBtn} onClick={onClose}>{t('paint.modal.cancel')}</button>
              <button
                type="button"
                className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')}
                onClick={() => {
                  onCanvasSize(clampDim(csW), clampDim(csH), anchor);
                  onClose();
                }}
              >
                {t('paint.modal.apply')}
              </button>
            </div>
          </>
        )}

        {modal === 'rotate' && (
          <>
            <h2 id="paint-modal-title" className={styles.modalTitle}>{t('paint.modal.rotateTitle')}</h2>
            <div className={styles.modalField}>
              <span>{t('paint.modal.rotateQuick')}</span>
              <div className={styles.presetRow}>
                <button type="button" className={styles.presetBtn} onClick={() => { onRotate(90, true, allLayers); onClose(); }}>
                  {t('paint.modal.rot90cw')}
                </button>
                <button type="button" className={styles.presetBtn} onClick={() => { onRotate(-90, true, allLayers); onClose(); }}>
                  {t('paint.modal.rot90ccw')}
                </button>
                <button type="button" className={styles.presetBtn} onClick={() => { onRotate(180, true, allLayers); onClose(); }}>
                  {t('paint.modal.rot180')}
                </button>
                <button type="button" className={styles.presetBtn} onClick={() => { onFlip('horizontal', allLayers); onClose(); }}>
                  {t('paint.modal.flipH')}
                </button>
                <button type="button" className={styles.presetBtn} onClick={() => { onFlip('vertical', allLayers); onClose(); }}>
                  {t('paint.modal.flipV')}
                </button>
              </div>
            </div>

            <div className={styles.modalField}>
              <span>{t('paint.modal.customAngle')}</span>
              <div className={styles.modalSliderRow}>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                  aria-label={`${t('paint.modal.customAngle')} slider`}
                />
                <input
                  type="number"
                  min={-180}
                  max={180}
                  value={angle}
                  onChange={(e) => setAngle(Math.max(-180, Math.min(180, Math.round(Number(e.target.value) || 0))))}
                  className={styles.modalNumSm}
                  aria-label={t('paint.modal.customAngle')}
                />
                <span>°</span>
              </div>
            </div>

            <label className={styles.modalCheck}>
              <input type="checkbox" checked={expandCanvas} onChange={(e) => setExpandCanvas(e.target.checked)} />
              <span>{t('paint.modal.expandCanvas')} ({rotPreview.width} × {rotPreview.height} px)</span>
            </label>

            <label className={styles.modalCheck}>
              <input type="checkbox" checked={allLayers} onChange={(e) => setAllLayers(e.target.checked)} />
              <span>{allLayers ? t('paint.modal.applyAllLayers') : t('paint.modal.applyActiveOnly')}</span>
            </label>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.cmdBtn} onClick={onClose}>{t('paint.modal.cancel')}</button>
              <button
                type="button"
                className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')}
                onClick={() => {
                  onRotate(angle, expandCanvas, allLayers);
                  onClose();
                }}
              >
                {t('paint.modal.apply')}
              </button>
            </div>
          </>
        )}

        {modal === 'colorStyles' && (
          <>
            <h2 id="paint-modal-title" className={styles.modalTitle}>{t('paint.modal.colorStylesTitle')}</h2>
            <div className={styles.styleGrid}>
              {COLOR_STYLES.map((styleId) => (
                <button
                  key={styleId}
                  type="button"
                  className={[styles.styleCard, selectedStyle === styleId ? styles.styleCardActive : ''].join(' ')}
                  onClick={() => setSelectedStyle(styleId)}
                  aria-pressed={selectedStyle === styleId}
                >
                  {t(`paint.style.${styleId}` as TranslationKey)}
                </button>
              ))}
            </div>

            {(selectedStyle === 'bw-threshold' || selectedStyle === 'bw-dither') && (
              <div className={styles.modalField}>
                <span>{t('paint.modal.threshold')}</span>
                <div className={styles.modalSliderRow}>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={bwThreshold}
                    onChange={(e) => setBwThreshold(Number(e.target.value))}
                    aria-label={`${t('paint.modal.threshold')} slider`}
                  />
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={bwThreshold}
                    onChange={(e) => setBwThreshold(Math.max(0, Math.min(255, Math.round(Number(e.target.value) || 0))))}
                    className={styles.modalNumSm}
                    aria-label={t('paint.modal.threshold')}
                  />
                </div>
              </div>
            )}

            {selectedStyle === 'posterize' && (
              <div className={styles.modalField}>
                <span>{t('paint.modal.posterizeLevels')}</span>
                <div className={styles.modalSliderRow}>
                  <input
                    type="range"
                    min={2}
                    max={16}
                    value={posterizeLevels}
                    onChange={(e) => setPosterizeLevels(Number(e.target.value))}
                    aria-label={`${t('paint.modal.posterizeLevels')} slider`}
                  />
                  <input
                    type="number"
                    min={2}
                    max={16}
                    value={posterizeLevels}
                    onChange={(e) => setPosterizeLevels(Math.max(2, Math.min(16, Math.round(Number(e.target.value) || 2))))}
                    className={styles.modalNumSm}
                    aria-label={t('paint.modal.posterizeLevels')}
                  />
                </div>
              </div>
            )}

            <label className={styles.modalCheck}>
              <input type="checkbox" checked={allLayers} onChange={(e) => setAllLayers(e.target.checked)} />
              <span>{allLayers ? t('paint.modal.applyAllLayers') : t('paint.modal.applyActiveOnly')}</span>
            </label>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.cmdBtn} onClick={onClose}>{t('paint.modal.cancel')}</button>
              <button
                type="button"
                className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')}
                onClick={() => {
                  onApplyColorStyle(selectedStyle, {
                    threshold: bwThreshold,
                    posterizeLevels,
                    allLayers,
                  });
                  onClose();
                }}
              >
                {t('paint.modal.apply')}
              </button>
            </div>
          </>
        )}

        {modal === 'adjustments' && (
          <>
            <h2 id="paint-modal-title" className={styles.modalTitle}>{t('paint.modal.adjustmentsTitle')}</h2>
            <div className={styles.modalField}>
              <span>{t('paint.adj.brightness')}</span>
              <div className={styles.modalSliderRow}>
                <input type="range" min={-100} max={100} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} aria-label={`${t('paint.adj.brightness')} slider`} />
                <input type="number" min={-100} max={100} value={brightness} onChange={(e) => setBrightness(Math.max(-100, Math.min(100, Math.round(Number(e.target.value) || 0))))} className={styles.modalNumSm} aria-label={t('paint.adj.brightness')} />
              </div>
            </div>
            <div className={styles.modalField}>
              <span>{t('paint.adj.contrast')}</span>
              <div className={styles.modalSliderRow}>
                <input type="range" min={-100} max={100} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} aria-label={`${t('paint.adj.contrast')} slider`} />
                <input type="number" min={-100} max={100} value={contrast} onChange={(e) => setContrast(Math.max(-100, Math.min(100, Math.round(Number(e.target.value) || 0))))} className={styles.modalNumSm} aria-label={t('paint.adj.contrast')} />
              </div>
            </div>
            <div className={styles.modalField}>
              <span>{t('paint.adj.hue')}</span>
              <div className={styles.modalSliderRow}>
                <input type="range" min={-180} max={180} value={hue} onChange={(e) => setHue(Number(e.target.value))} aria-label={`${t('paint.adj.hue')} slider`} />
                <input type="number" min={-180} max={180} value={hue} onChange={(e) => setHue(Math.max(-180, Math.min(180, Math.round(Number(e.target.value) || 0))))} className={styles.modalNumSm} aria-label={t('paint.adj.hue')} />
                <span>°</span>
              </div>
            </div>
            <div className={styles.modalField}>
              <span>{t('paint.adj.saturation')}</span>
              <div className={styles.modalSliderRow}>
                <input type="range" min={-100} max={100} value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} aria-label={`${t('paint.adj.saturation')} slider`} />
                <input type="number" min={-100} max={100} value={saturation} onChange={(e) => setSaturation(Math.max(-100, Math.min(100, Math.round(Number(e.target.value) || 0))))} className={styles.modalNumSm} aria-label={t('paint.adj.saturation')} />
              </div>
            </div>
            <div className={styles.modalField}>
              <span>{t('paint.adj.quickEffects')}</span>
              <div className={styles.presetRow}>
                <button type="button" className={styles.presetBtn} onClick={() => { onApplyQuickFilter('blur', allLayers); onClose(); }}>
                  {t('paint.adj.blur')}
                </button>
                <button type="button" className={styles.presetBtn} onClick={() => { onApplyQuickFilter('sharpen', allLayers); onClose(); }}>
                  {t('paint.adj.sharpen')}
                </button>
              </div>
            </div>
            <label className={styles.modalCheck}>
              <input type="checkbox" checked={allLayers} onChange={(e) => setAllLayers(e.target.checked)} />
              <span>{allLayers ? t('paint.modal.applyAllLayers') : t('paint.modal.applyActiveOnly')}</span>
            </label>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.cmdBtn} onClick={onClose}>{t('paint.modal.cancel')}</button>
              <button
                type="button"
                className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')}
                onClick={() => {
                  onApplyAdjustments({ brightness, contrast, hue, saturation, allLayers });
                  onClose();
                }}
              >
                {t('paint.modal.apply')}
              </button>
            </div>
          </>
        )}

        {modal === 'export' && (
          <>
            <h2 id="paint-modal-title" className={styles.modalTitle}>{t('paint.modal.exportTitle')}</h2>
            <label className={styles.modalField}>
              <span>{t('paint.modal.filename')}</span>
              <input type="text" value={exportName} onChange={(e) => setExportName(e.target.value)} />
            </label>
            <div className={styles.modalField}>
              <span>{t('paint.modal.format')}</span>
              <div className={styles.presetRow}>
                {(['png', 'jpeg', 'webp'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    className={[styles.presetBtn, exportFmt === fmt ? styles.presetBtnActive : ''].join(' ')}
                    onClick={() => setExportFmt(fmt)}
                  >
                    {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {exportFmt !== 'png' && (
              <div className={styles.modalField}>
                <span>{t('paint.modal.jpegQuality')}</span>
                <div className={styles.modalSliderRow}>
                  <input type="range" min={10} max={100} value={exportQuality} onChange={(e) => setExportQuality(Number(e.target.value))} aria-label={`${t('paint.modal.jpegQuality')} slider`} />
                  <input type="number" min={10} max={100} value={exportQuality} onChange={(e) => setExportQuality(Math.max(10, Math.min(100, Math.round(Number(e.target.value) || 10))))} className={styles.modalNumSm} aria-label={t('paint.modal.jpegQuality')} />
                  <span>%</span>
                </div>
              </div>
            )}
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cmdBtn}
                onClick={() => {
                  onSaveProject(exportName.trim() || 'artwork');
                  onClose();
                }}
              >
                {t('paint.action.saveProject')} (.img.json)
              </button>
              <button type="button" className={styles.cmdBtn} onClick={onClose}>{t('paint.modal.cancel')}</button>
              <button
                type="button"
                className={[styles.cmdBtn, styles.cmdBtnPrimary].join(' ')}
                onClick={() => {
                  onExportImage(exportFmt, exportQuality / 100, exportName.trim() || 'artwork');
                  onClose();
                }}
              >
                {t('paint.modal.download')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
