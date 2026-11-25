import React from 'react';

import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Base64Image.module.css';

type Facing = 'environment' | 'user';
type CaptureFormat = 'image/jpeg' | 'image/png';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

function cameraErrorText(err: unknown, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const name = (err as { name?: string })?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return t('base64.cam.errDenied');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return t('base64.cam.errNotFound');
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return t('base64.cam.errInUse');
  }
  return err instanceof Error && err.message
    ? t('base64.cam.errStartMsg', { msg: err.message })
    : t('base64.cam.errStart');
}

function timestampName(ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `camera-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const { t } = useI18n();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const nativeInputRef = React.useRef<HTMLInputElement | null>(null);

  const [facing, setFacing] = React.useState<Facing>('environment');
  const [devices, setDevices] = React.useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = React.useState('');
  const [format, setFormat] = React.useState<CaptureFormat>('image/jpeg');
  const [starting, setStarting] = React.useState(true);
  const [capturing, setCapturing] = React.useState(false);
  const [resolution, setResolution] = React.useState<{ w: number; h: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [torchSupported, setTorchSupported] = React.useState(false);
  const [torchOn, setTorchOn] = React.useState(false);

  const stopStream = React.useCallback(() => {
    const s = streamRef.current;
    streamRef.current = null;
    if (s) {
      for (const track of s.getTracks()) track.stop();
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchSupported(false);
    setTorchOn(false);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setStarting(true);
    setError(null);
    setResolution(null);

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError(t('base64.cam.errUnavailable'));
        setStarting(false);
        return;
      }

      stopStream();
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => undefined);
          if (!cancelled && video.videoWidth > 0 && video.videoHeight > 0) {
            setResolution({ w: video.videoWidth, h: video.videoHeight });
          }
        }

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as { torch?: boolean };
          setTorchSupported(Boolean(caps?.torch));
        }

        if (navigator.mediaDevices.enumerateDevices) {
          const all = await navigator.mediaDevices.enumerateDevices().catch(() => []);
          if (!cancelled) {
            setDevices(all.filter((d) => d.kind === 'videoinput'));
          }
        }
      } catch (e) {
        if (!cancelled) setError(cameraErrorText(e, t));
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    void start();

    const onVisibility = () => {
      if (document.hidden) {
        stopStream();
        onClose();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      stopStream();
    };
  }, [facing, deviceId, stopStream, onClose]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  }

  async function handleCapture() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0 || capturing) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context unavailable');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, format, format === 'image/jpeg' ? 0.92 : undefined),
      );
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error('Could not encode camera frame');

      const ext = format === 'image/png' ? 'png' : 'jpg';
      const file = new File([blob], timestampName(ext), { type: format });
      stopStream();
      onCapture(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('base64.cam.errCapture'));
      setCapturing(false);
    }
  }

  function handleNativeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stopStream();
    onCapture(file);
  }

  const ready = !starting && !error;

  return (
    <div className={styles.cameraCard} role="region" aria-label={t('base64.camera.title')}>
      <div className={styles.cameraHeader}>
        <div className={styles.cameraTitleWrap}>
          <span className={styles.cameraTitle}>{t('base64.camera.title')}</span>
          {resolution && (
            <span className={styles.cameraMeta}>{resolution.w} × {resolution.h} px</span>
          )}
        </div>
        <button type="button" className={styles.buttonSmall} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      {!error && (
        <div className={styles.cameraViewport}>
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth > 0 && v.videoHeight > 0) {
                setResolution({ w: v.videoWidth, h: v.videoHeight });
              }
            }}
            className={[
              styles.cameraVideo,
              !deviceId && facing === 'user' ? styles.cameraVideoMirrored : '',
            ].join(' ')}
          />
          {starting && (
            <div className={styles.cameraOverlay}>{t('base64.camera.starting')}</div>
          )}
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.cameraControls}>
        {ready && (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={capturing}
            onClick={() => void handleCapture()}
          >
            {capturing ? t('base64.camera.capturing') : t('base64.camera.capture')}
          </button>
        )}

        {!error && (
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => {
              setDeviceId('');
              setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
            }}
          >
            {t('base64.camera.switch')}
          </button>
        )}

        {torchSupported && (
          <button
            type="button"
            className={styles.buttonSmall}
            aria-pressed={torchOn}
            onClick={() => void toggleTorch()}
          >
            {torchOn ? t('base64.camera.torchOff') : t('base64.camera.torchOn')}
          </button>
        )}

        {ready && (
          <select
            aria-label={t('base64.camera.format')}
            className={styles.cameraSelect}
            value={format}
            onChange={(e) => setFormat(e.target.value as CaptureFormat)}
          >
            <option value="image/jpeg">{t('base64.cam.fmtJpeg')}</option>
            <option value="image/png">{t('base64.cam.fmtPng')}</option>
          </select>
        )}

        {devices.length > 1 && !error && (
          <select
            aria-label={t('base64.camera.selectCamera')}
            className={styles.cameraSelect}
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
          >
            <option value="">{facing === 'environment' ? t('base64.camera.rear') : t('base64.camera.front')}</option>
            {devices.map((d, idx) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || t('base64.cam.cameraNum', { n: idx + 1 })}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          className={styles.buttonSmall}
          onClick={() => nativeInputRef.current?.click()}
        >
          {t('base64.camera.nativePicker')}
        </button>
        <input
          ref={nativeInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className={styles.visuallyHidden}
          tabIndex={-1}
          onChange={handleNativeFile}
        />
      </div>

      <p className={styles.help}>{t('base64.camera.localHint')}</p>
    </div>
  );
}
