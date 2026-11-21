import React from 'react';

import { Checkbox, Field } from '../QrGen/fields';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

export interface SignatureAsset {
  id: string;
  label: string;
  pngBytes: Uint8Array;
  dataUrl: string;
  width: number;
  height: number;
  source: 'draw' | 'type' | 'upload';
}

export const SIGNATURE_INK_COLORS: ReadonlyArray<{ hex: string; label: string }> = [
  { hex: '#111827', label: 'Ink black' },
  { hex: '#1d4ed8', label: 'Royal blue' },
  { hex: '#0f766e', label: 'Deep teal' },
  { hex: '#991b1b', label: 'Crimson' },
];

type PadMode = 'draw' | 'type' | 'upload';

interface DrawPoint {
  x: number;
  y: number;
}

interface DrawStroke {
  color: string;
  width: number;
  points: DrawPoint[];
}

interface TypeStylePreset {
  id: string;
  name: string;
  fontFamily: string;
  fontStyle: 'italic' | 'normal';
  fontWeight: number;
}

const TYPE_STYLES: TypeStylePreset[] = [
  {
    id: 'script',
    name: 'Fluid Script',
    fontFamily: "'Brush Script MT', 'Segoe Script', 'Apple Chancery', 'Snell Roundhand', cursive",
    fontStyle: 'italic',
    fontWeight: 500,
  },
  {
    id: 'handwriting',
    name: 'Handwritten',
    fontFamily: "'Lucida Handwriting', 'Bradley Hand', 'URW Chancery L', 'Comic Sans MS', cursive",
    fontStyle: 'italic',
    fontWeight: 400,
  },
  {
    id: 'classic-serif',
    name: 'Classic Serif',
    fontFamily: "'Georgia', 'Palatino Linotype', 'Times New Roman', serif",
    fontStyle: 'italic',
    fontWeight: 400,
  },
  {
    id: 'editorial',
    name: 'Editorial Bold',
    fontFamily: "'Palatino Linotype', 'Book Antiqua', 'Georgia', serif",
    fontStyle: 'italic',
    fontWeight: 700,
  },
];

// Fixed logical coordinate system for drawn strokes so resizing never distorts ink.
const PAD_W = 640;
const PAD_H = 200;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

async function canvasToPngAsset(
  source: HTMLCanvasElement,
  pad = 12,
): Promise<{ pngBytes: Uint8Array; dataUrl: string; width: number; height: number } | null> {
  const sw = source.width;
  const sh = source.height;
  if (sw <= 0 || sh <= 0) return null;
  const sctx = source.getContext('2d', { willReadFrequently: true });
  if (!sctx) return null;

  const imgData = sctx.getImageData(0, 0, sw, sh);
  const data = imgData.data;

  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < sh; y++) {
    const rowOffset = y * sw * 4;
    for (let x = 0; x < sw; x++) {
      if (data[rowOffset + x * 4 + 3] > 6) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

  const cropX = Math.max(0, minX - pad);
  const cropY = Math.max(0, minY - pad);
  const cropW = Math.min(sw - cropX, maxX - minX + 1 + pad * 2);
  const cropH = Math.min(sh - cropY, maxY - minY + 1 + pad * 2);

  const out = document.createElement('canvas');
  out.width = Math.max(1, cropW);
  out.height = Math.max(1, cropH);
  const octx = out.getContext('2d');
  if (!octx) return null;
  octx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  const pngBytes = new Uint8Array(await blob.arrayBuffer());
  const dataUrl = out.toDataURL('image/png');

  out.width = 0;
  out.height = 0;

  return { pngBytes, dataUrl, width: cropW, height: cropH };
}

function renderStrokes(ctx: CanvasRenderingContext2D, strokes: DrawStroke[], scale: number) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const stroke of strokes) {
    const pts = stroke.points;
    if (pts.length === 0) continue;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.width;

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const midX = (pts[i].x + pts[i + 1].x) / 2;
        const midY = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawTypedCanvas(
  text: string,
  preset: TypeStylePreset,
  color: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1120;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const trimmed = text.trim();
  if (!trimmed) return canvas;

  let fontSize = 116;
  const makeFont = (sz: number) =>
    `${preset.fontStyle} ${preset.fontWeight} ${sz}px ${preset.fontFamily}`;

  ctx.font = makeFont(fontSize);
  const measured = ctx.measureText(trimmed).width;
  const maxWidth = canvas.width - 96;
  if (measured > maxWidth && measured > 0) {
    fontSize = Math.max(28, Math.floor(fontSize * (maxWidth / measured)));
    ctx.font = makeFont(fontSize);
  }

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2);
  return canvas;
}

function processUploadedImage(
  img: HTMLImageElement,
  removeBg: boolean,
  threshold: number,
): HTMLCanvasElement {
  const maxDim = 1200;
  const srcW = Math.max(1, img.naturalWidth || img.width || 400);
  const srcH = Math.max(1, img.naturalHeight || img.height || 160);
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(img, 0, 0, w, h);

  if (removeBg) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const ramp = 36;
    const lower = Math.max(0, threshold - ramp);

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a === 0) continue;
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (luma >= threshold) {
        data[i + 3] = 0;
      } else if (luma > lower) {
        const factor = (threshold - luma) / Math.max(1, threshold - lower);
        data[i + 3] = Math.round(a * factor);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas;
}

function imageHasTransparency(img: HTMLImageElement): boolean {
  const w = Math.min(120, Math.max(1, img.naturalWidth || 120));
  const h = Math.min(120, Math.max(1, img.naturalHeight || 120));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 245) return true;
  }
  return false;
}

export interface SignaturePadProps {
  onCreate: (asset: SignatureAsset) => void;
  onCancel?: () => void;
  defaultLabel?: string;
}

export function SignaturePad({ onCreate, onCancel, defaultLabel }: SignaturePadProps) {
  const [mode, setMode] = React.useState<PadMode>('draw');
  const [inkColor, setInkColor] = React.useState<string>(SIGNATURE_INK_COLORS[0].hex);
  const [label, setLabel] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);
  const [padError, setPadError] = React.useState<string | null>(null);

  // Draw state
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [penWidth, setPenWidth] = React.useState(3);
  const [strokes, setStrokes] = React.useState<DrawStroke[]>([]);
  const activeStrokeRef = React.useRef<{ pointerId: number; stroke: DrawStroke } | null>(null);
  const strokesRef = React.useRef<DrawStroke[]>([]);
  strokesRef.current = strokes;

  // Type state
  const [typedText, setTypedText] = React.useState('');
  const [typeStyleId, setTypeStyleId] = React.useState<string>(TYPE_STYLES[0].id);

  // Upload state
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploadedImg, setUploadedImg] = React.useState<HTMLImageElement | null>(null);
  const [uploadedName, setUploadedName] = React.useState<string>('');
  const [removeBg, setRemoveBg] = React.useState(true);
  const [bgThreshold, setBgThreshold] = React.useState(220);
  const [uploadPreviewUrl, setUploadPreviewUrl] = React.useState<string | null>(null);

  // Initialize and redraw the HiDPI draw canvas whenever strokes change or mode switches back to draw.
  const redrawPad = React.useCallback((list: DrawStroke[], liveStroke?: DrawStroke) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);
    const targetW = Math.round(PAD_W * dpr);
    const targetH = Math.round(PAD_H * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderStrokes(ctx, liveStroke ? [...list, liveStroke] : list, dpr);
  }, []);

  React.useEffect(() => {
    if (mode === 'draw') redrawPad(strokes);
  }, [mode, strokes, redrawPad]);

  // Recompute upload preview whenever image, removeBg, or bgThreshold changes.
  React.useEffect(() => {
    let cancelled = false;
    if (!uploadedImg) {
      setUploadPreviewUrl(null);
      return;
    }
    const processed = processUploadedImage(uploadedImg, removeBg, bgThreshold);
    void canvasToPngAsset(processed, 10).then((res) => {
      processed.width = 0;
      processed.height = 0;
      if (cancelled) return;
      setUploadPreviewUrl(res ? res.dataUrl : null);
    });
    return () => {
      cancelled = true;
    };
  }, [uploadedImg, removeBg, bgThreshold]);

  function clientToPad(e: React.PointerEvent<HTMLCanvasElement>): DrawPoint {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / Math.max(1, rect.width)) * PAD_W;
    const y = ((e.clientY - rect.top) / Math.max(1, rect.height)) * PAD_H;
    return {
      x: Math.max(0, Math.min(PAD_W, x)),
      y: Math.max(0, Math.min(PAD_H, y)),
    };
  }

  function handlePadPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    setPadError(null);
    const pt = clientToPad(e);
    const stroke: DrawStroke = {
      color: inkColor,
      width: penWidth,
      points: [pt],
    };
    activeStrokeRef.current = { pointerId: e.pointerId, stroke };
    e.currentTarget.setPointerCapture(e.pointerId);
    redrawPad(strokesRef.current, stroke);
  }

  function handlePadPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeStrokeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    const pt = clientToPad(e);
    const pts = active.stroke.points;
    const prev = pts[pts.length - 1];
    if (Math.hypot(pt.x - prev.x, pt.y - prev.y) < 1.2) return;
    pts.push(pt);
    redrawPad(strokesRef.current, active.stroke);
  }

  function finishStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    const active = activeStrokeRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    activeStrokeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer was already released.
    }
    setStrokes((prev) => [...prev, active.stroke]);
  }

  function handleUploadFile(file: File | undefined) {
    if (!file) return;
    setPadError(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setUploadedImg(img);
      const base = file.name.replace(/\.[^.]+$/, '');
      setUploadedName(base);
      const hasAlpha = imageHasTransparency(img);
      setRemoveBg(!hasAlpha);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setPadError('Could not decode that image. Please choose a PNG, JPG, WebP, or SVG file.');
    };
    img.src = url;
  }

  async function handleSave() {
    setPadError(null);
    setSaving(true);
    try {
      let offscreen: HTMLCanvasElement | null = null;
      let autoLabel = defaultLabel || 'Signature';

      if (mode === 'draw') {
        if (strokes.length === 0) {
          setPadError('Draw your signature on the pad first.');
          return;
        }
        offscreen = document.createElement('canvas');
        const exportScale = 2;
        offscreen.width = PAD_W * exportScale;
        offscreen.height = PAD_H * exportScale;
        const ctx = offscreen.getContext('2d');
        if (ctx) renderStrokes(ctx, strokes, exportScale);
      } else if (mode === 'type') {
        if (!typedText.trim()) {
          setPadError('Enter your name or initials to generate a typed signature.');
          return;
        }
        const preset = TYPE_STYLES.find((s) => s.id === typeStyleId) ?? TYPE_STYLES[0];
        offscreen = drawTypedCanvas(typedText, preset, inkColor);
        autoLabel = typedText.trim();
      } else {
        if (!uploadedImg) {
          setPadError('Choose a signature image to upload first.');
          return;
        }
        offscreen = processUploadedImage(uploadedImg, removeBg, bgThreshold);
        autoLabel = uploadedName || 'Uploaded signature';
      }

      const trimmed = await canvasToPngAsset(offscreen, 12);
      offscreen.width = 0;
      offscreen.height = 0;

      if (!trimmed) {
        setPadError('The signature image is completely transparent. Try lowering the background threshold or drawing again.');
        return;
      }

      onCreate({
        id: makeId('sig'),
        label: label.trim() || autoLabel,
        pngBytes: trimmed.pngBytes,
        dataUrl: trimmed.dataUrl,
        width: trimmed.width,
        height: trimmed.height,
        source: mode,
      });

      // Reset transient inputs for clean subsequent creation.
      setStrokes([]);
      setLabel('');
    } catch (e) {
      setPadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    mode === 'draw'
      ? strokes.length > 0
      : mode === 'type'
        ? typedText.trim().length > 0
        : Boolean(uploadedImg && uploadPreviewUrl);

  return (
    <div className={styles.sigPadCard}>
      <div className={styles.sigPadHeader}>
        <h3>Create signature or initials</h3>
        {onCancel && (
          <button type="button" className={styles.miniBtn} onClick={onCancel}>
            Close
          </button>
        )}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Signature creation mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'draw'}
          className={[styles.tab, mode === 'draw' ? styles.tabActive : ''].join(' ')}
          onClick={() => {
            setMode('draw');
            setPadError(null);
          }}
        >
          Draw
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'type'}
          className={[styles.tab, mode === 'type' ? styles.tabActive : ''].join(' ')}
          onClick={() => {
            setMode('type');
            setPadError(null);
          }}
        >
          Type
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'upload'}
          className={[styles.tab, mode === 'upload' ? styles.tabActive : ''].join(' ')}
          onClick={() => {
            setMode('upload');
            setPadError(null);
          }}
        >
          Upload
        </button>
      </div>

      {mode === 'draw' && (
        <div className={styles.sigPadBody}>
          <div className={styles.sigControlsRow}>
            <div className={styles.sigSwatchGroup} role="group" aria-label="Ink color">
              {SIGNATURE_INK_COLORS.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  aria-label={swatch.label}
                  aria-pressed={inkColor === swatch.hex}
                  className={[
                    styles.sigSwatch,
                    inkColor === swatch.hex ? styles.sigSwatchActive : '',
                  ].join(' ')}
                  style={{ backgroundColor: swatch.hex }}
                  onClick={() => setInkColor(swatch.hex)}
                />
              ))}
            </div>
            <label className={styles.sigRangeLabel}>
              <span>Pen {penWidth.toFixed(1)}px</span>
              <input
                type="range"
                min={1.5}
                max={8}
                step={0.5}
                value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
              />
            </label>
            <div className={styles.sigMiniActions}>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={strokes.length === 0}
                onClick={() => setStrokes((prev) => prev.slice(0, -1))}
              >
                Undo stroke
              </button>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={strokes.length === 0}
                onClick={() => setStrokes([])}
              >
                Clear
              </button>
            </div>
          </div>

          <div className={styles.sigDrawWrap}>
            <canvas
              ref={canvasRef}
              className={styles.sigDrawCanvas}
              aria-label="Signature drawing pad"
              onPointerDown={handlePadPointerDown}
              onPointerMove={handlePadPointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
            />
            <div className={styles.sigBaseline} aria-hidden="true" />
            {strokes.length === 0 && (
              <span className={styles.sigDrawPlaceholder} aria-hidden="true">
                Sign here with mouse, touch, or stylus
              </span>
            )}
          </div>
        </div>
      )}

      {mode === 'type' && (
        <div className={styles.sigPadBody}>
          <div className={styles.sigControlsRow}>
            <div className={styles.sigTypeInputWrap}>
              <input
                className={qrStyles.input}
                type="text"
                value={typedText}
                maxLength={64}
                placeholder="Type your full name or initials…"
                aria-label="Typed signature text"
                onChange={(e) => {
                  setTypedText(e.target.value);
                  setPadError(null);
                }}
              />
            </div>
            <div className={styles.sigSwatchGroup} role="group" aria-label="Ink color">
              {SIGNATURE_INK_COLORS.map((swatch) => (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  aria-label={swatch.label}
                  aria-pressed={inkColor === swatch.hex}
                  className={[
                    styles.sigSwatch,
                    inkColor === swatch.hex ? styles.sigSwatchActive : '',
                  ].join(' ')}
                  style={{ backgroundColor: swatch.hex }}
                  onClick={() => setInkColor(swatch.hex)}
                />
              ))}
            </div>
          </div>

          <div className={styles.sigStyleGrid} role="radiogroup" aria-label="Signature font style">
            {TYPE_STYLES.map((preset) => {
              const selected = preset.id === typeStyleId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={[
                    styles.sigStyleCard,
                    selected ? styles.sigStyleCardActive : '',
                  ].join(' ')}
                  onClick={() => setTypeStyleId(preset.id)}
                >
                  <span
                    className={styles.sigStyleSample}
                    style={{
                      fontFamily: preset.fontFamily,
                      fontStyle: preset.fontStyle,
                      fontWeight: preset.fontWeight,
                      color: inkColor,
                    }}
                  >
                    {typedText.trim() || 'Ada Lovelace'}
                  </span>
                  <span className={styles.sigStyleName}>{preset.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'upload' && (
        <div className={styles.sigPadBody}>
          <div className={styles.sigControlsRow}>
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={() => uploadInputRef.current?.click()}
            >
              {uploadedImg ? 'Choose another image' : 'Select signature image'}
            </button>
            <span className={styles.note}>PNG, JPG, WebP or SVG — processed locally.</span>
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
              className={styles.visuallyHidden}
              tabIndex={-1}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                handleUploadFile(file);
              }}
            />
          </div>

          {uploadedImg && (
            <>
              <div className={styles.sigControlsRow}>
                <Checkbox
                  label="Remove light background"
                  checked={removeBg}
                  onChange={setRemoveBg}
                />
                {removeBg && (
                  <label className={styles.sigRangeLabel}>
                    <span>Threshold {bgThreshold}</span>
                    <input
                      type="range"
                      min={140}
                      max={250}
                      step={2}
                      value={bgThreshold}
                      onChange={(e) => setBgThreshold(Number(e.target.value))}
                    />
                  </label>
                )}
              </div>

              <div className={styles.sigUploadPreview}>
                {uploadPreviewUrl ? (
                  <img src={uploadPreviewUrl} alt="Processed signature preview" />
                ) : (
                  <span className={styles.note}>No visible pixels at current threshold.</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.sigPadFooter}>
        <div className={styles.sigLabelInput}>
          <Field label="Label (optional)">
            <input
              className={qrStyles.input}
              type="text"
              value={label}
              maxLength={40}
              placeholder={defaultLabel || 'Signature'}
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
        </div>
        <button
          type="button"
          className={styles.primary}
          disabled={saving || !canSave}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save signature'}
        </button>
      </div>

      {padError && <p className={qrStyles.warning}>{padError}</p>}
    </div>
  );
}
