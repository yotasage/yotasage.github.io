// Live scanning with the device's camera. Frames are read in the scan worker one at a time (a frame is skipped while
// the one before is still being read), the codes found are outlined on the video, and a new code is handed to the
// page with a snapshot of the frame. By default the camera pauses at the first code; "Keep scanning" adds every
// new code as it comes. Nothing leaves the device: the video is only drawn into a canvas on this page.

import React from 'react';

import { framePixels, snapshot } from '../../lib/qrread/images';
import { busy, scan } from '../../lib/qrread/scanClient';
import type { Detection, FormatSet } from '../../lib/qrread/zxing';
import { hex } from '../../lib/qrread/bytes';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale } from '../../lib/ui/translations';
import styles from '../../styles/QrRead.module.css';

/** Longest side of the frames that are read: enough for a code a third of the view wide, fast on phones. */
const FRAME_SIDE = 1280;

type Status = 'off' | 'starting' | 'on' | 'paused' | 'error';

interface Caps {
  torch: boolean;
  zoom: { min: number; max: number; step: number } | null;
}

export interface CameraHit {
  detections: Detection[];
  previewUrl: string;
  width: number;
  height: number;
}

const keyOf = (d: Detection) => `${d.format}:${hex(d.bytes, '')}`;

function explain(error: unknown, locale: Locale): string {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return translate(locale, 'qrread.cam.errDenied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return translate(locale, 'qrread.cam.errNotFound');
  if (name === 'NotReadableError' || name === 'AbortError') return translate(locale, 'qrread.cam.errInUse');
  return error instanceof Error && error.message
    ? translate(locale, 'qrread.cam.errGenericMsg', { msg: error.message })
    : translate(locale, 'qrread.cam.errGeneric');
}

export default function Camera({ formats, onHit }: { formats: FormatSet; onHit: (hit: CameraHit) => void }) {
  const { t, locale } = useI18n();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const runRef = React.useRef(0);
  const seenRef = React.useRef(new Set<string>());
  const keepRef = React.useRef(false);
  const formatsRef = React.useRef(formats);
  const onHitRef = React.useRef(onHit);
  const [status, setStatus] = React.useState<Status>('off');
  const [error, setError] = React.useState('');
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState('');
  const [caps, setCaps] = React.useState<Caps>({ torch: false, zoom: null });
  const [torch, setTorch] = React.useState(false);
  const [zoom, setZoom] = React.useState(1);
  const [keep, setKeep] = React.useState(false);
  const [overlay, setOverlay] = React.useState<{ ds: Detection[]; w: number; h: number } | null>(null);
  const [count, setCount] = React.useState(0);
  const [fps, setFps] = React.useState(0);

  formatsRef.current = formats;
  onHitRef.current = onHit;
  keepRef.current = keep;

  const stop = React.useCallback((next: Status = 'off') => {
    runRef.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setOverlay(null);
    setTorch(false);
    setStatus(next);
  }, []);

  const loop = React.useCallback((run: number) => {
    const video = videoRef.current;
    if (!video || run !== runRef.current) return;
    canvasRef.current ??= document.createElement('canvas');
    const c = canvasRef.current;
    let frames = 0;
    let since = performance.now();
    let reading = false;
    const next = () => {
      if (run !== runRef.current) return;
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(step);
      else requestAnimationFrame(step);
    };
    const step = async () => {
      if (run !== runRef.current) return;
      if (!reading && !busy()) {
        const img = framePixels(video, c, FRAME_SIDE);
        if (img) {
          reading = true;
          const { width: w, height: h } = img;
          try {
            const ds = await scan(img, { formats: formatsRef.current, thorough: false });
            if (run !== runRef.current) return;
            frames++;
            const now = performance.now();
            if (now - since > 1000) { setFps(Math.round((frames * 1000) / (now - since))); frames = 0; since = now; }
            setOverlay({ ds, w, h });
            const valid = ds.filter((d) => d.valid);
            const fresh = valid.filter((d) => !seenRef.current.has(keyOf(d)));
            if (fresh.length) {
              for (const d of fresh) seenRef.current.add(keyOf(d));
              const previewUrl = await snapshot(c);
              navigator.vibrate?.(40);
              setCount((n) => n + fresh.length);
              onHitRef.current({ detections: keepRef.current ? fresh : valid, previewUrl, width: w, height: h });
              if (!keepRef.current) {
                runRef.current += 1;
                setStatus('paused');
                return;
              }
            }
          } catch {
            /* A failed frame is skipped; the next one is read. */
          } finally {
            reading = false;
          }
        }
      }
      next();
    };
    next();
  }, []);

  const start = React.useCallback(async (id?: string) => {
    stop('starting');
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext
        ? t('qrread.cam.errNoApi')
        : t('qrread.cam.errHttps'));
      setStatus('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: id
          ? { deviceId: { exact: id }, width: { ideal: 1920 }, height: { ideal: 1080 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const track = stream.getVideoTracks()[0];
      const c = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number; step: number } };
      setCaps({ torch: !!c.torch, zoom: c.zoom && c.zoom.max > c.zoom.min ? { min: c.zoom.min, max: c.zoom.max, step: c.zoom.step || 0.1 } : null });
      setZoom(((track.getSettings?.() ?? {}) as { zoom?: number }).zoom ?? 1);
      setDeviceId(track.getSettings?.().deviceId ?? id ?? '');
      // Device names are only given once the camera is allowed.
      setDevices((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput'));
      setStatus('on');
      const run = (runRef.current += 1);
      loop(run);
    } catch (e) {
      stop('error');
      setError(explain(e, locale));
    }
  }, [loop, stop, t, locale]);

  const resume = () => {
    setStatus('on');
    const run = (runRef.current += 1);
    loop(run);
  };

  // The camera is let go when the page is hidden or left.
  React.useEffect(() => {
    const onHide = () => { if (document.hidden && streamRef.current) stop(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      runRef.current += 1;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stop]);

  const track = () => streamRef.current?.getVideoTracks()[0];
  const applyTorch = async (on: boolean) => {
    try {
      await track()?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch(on);
    } catch { /* Some cameras report a torch they cannot switch. */ }
  };
  const applyZoom = async (z: number) => {
    setZoom(z);
    try { await track()?.applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] }); } catch { /* Ignored. */ }
  };

  const live = status === 'on' || status === 'paused';
  return (
    <section className={styles.card} aria-labelledby="camera-title">
      <h2 id="camera-title">{t('qrread.cam.title')}</h2>
      <div className={styles.cameraBox} data-status={status} hidden={!live && status !== 'starting'}>
        <video ref={videoRef} className={styles.video} playsInline muted autoPlay />
        {overlay && (
          <svg className={styles.overlay} viewBox={`0 0 ${overlay.w} ${overlay.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
            {overlay.ds.map((d, i) => (
              <polygon
                key={i}
                points={d.corners.map(([x, y]) => `${x},${y}`).join(' ')}
                className={d.valid ? styles.outlineGood : styles.outlineBad}
                style={{ strokeWidth: Math.max(3, overlay.w / 250) }}
              />
            ))}
          </svg>
        )}
        {status === 'paused' && (
          <div className={styles.pausedBar}>
            <span>{t('qrread.cam.codeRead')}</span>
            <button type="button" className={styles.button} onClick={resume}>{t('qrread.cam.scanAnother')}</button>
          </div>
        )}
      </div>
      {error && <p className={styles.bad} role="alert">{error}</p>}
      <div className={styles.controlRow}>
        {!live && status !== 'starting' && <button type="button" className={styles.primaryButton} onClick={() => start()}>{t('qrread.cam.start')}</button>}
        {status === 'starting' && <span className={styles.muted}>{t('qrread.cam.starting')}</span>}
        {live && <button type="button" className={styles.button} onClick={() => stop()}>{t('qrread.cam.stop')}</button>}
        {live && devices.length > 1 && (
          <label className={styles.inline}>
            <span>{t('qrread.cam.title')}</span>
            <select className={styles.select} value={deviceId} onChange={(e) => start(e.target.value)}>
              {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || t('qrread.cam.cameraNum', { n: i + 1 })}</option>)}
            </select>
          </label>
        )}
        {live && caps.torch && (
          <button type="button" className={styles.button} aria-pressed={torch} onClick={() => applyTorch(!torch)}>{torch ? t('qrread.cam.lightOff') : t('qrread.cam.lightOn')}</button>
        )}
        <label className={styles.checkbox}>
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>{t('qrread.cam.keepScanning')}</span>
        </label>
      </div>
      {live && caps.zoom && (
        <label className={styles.zoom}>
          <span>{t('qrread.cam.zoom', { z: zoom.toFixed(1) })}</span>
          <input type="range" min={caps.zoom.min} max={caps.zoom.max} step={caps.zoom.step} value={zoom} onChange={(e) => applyZoom(Number(e.target.value))} />
        </label>
      )}
      <p className={styles.muted}>
        {live
          ? `${count ? (count === 1 ? t('qrread.cam.countOne') : t('qrread.cam.countMany', { n: count })) : t('qrread.cam.pointPrompt')}${fps ? t('qrread.cam.fps', { fps }) : ''}`
          : t('qrread.cam.idleHint')}
      </p>
    </section>
  );
}
