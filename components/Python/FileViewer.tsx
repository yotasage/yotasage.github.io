// Hardened inline file viewer for /python/main (Image + SVG-via-<img>, PDF, CSV/TSV, JSON, HTML).
// Security rules (docs/python/security.md §4):
// - Framed & clearly labelled "Program output".
// - Zero innerHTML / dangerouslySetInnerHTML for anything from the workspace.
// - SVG rendered strictly through <img src={blobUrl}> (never inline <svg>, <object>, or <iframe>).
// - HTML rendered in <iframe sandbox=""> by default; opt-in scripts uses sandbox="allow-scripts"
//   (NEVER allow-same-origin / allow-top-navigation / allow-popups) + strict zero-connect meta CSP,
//   and resets to OFF automatically on file path change.
// - Guaranteed URL.revokeObjectURL cleanup on file change and unmount.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fileExtension, formatByteSize } from '../../lib/python/paths';
import { buildSandboxedHtmlSrcDoc } from '../../lib/python/sandboxHtml';
import { useI18n } from '../../lib/ui/i18n';
import plotStyles from '../../styles/PythonPlots.module.css';
import DataTableViewer from './DataTableViewer';
import type { FileViewerKind } from './fileHelpers';
import PdfPreview from './PdfPreview';

export interface FileViewerProps {
  path: string;
  kind: Exclude<FileViewerKind, null>;
  size: number;
  fileVersion: number;
  readFileBytes: (path: string) => Promise<Uint8Array | null>;
  getLiveText?: (path: string) => string | null;
  onDownload?: (path: string) => void;
}

const IMAGE_MIME_MAP: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export default function FileViewer({
  path,
  kind,
  size,
  fileVersion,
  readFileBytes,
  getLiveText,
  onDownload,
}: FileViewerProps) {
  const { t } = useI18n();
  const encoderRef = useRef<TextEncoder | null>(null);
  const decoderRef = useRef<TextDecoder | null>(null);

  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [text, setText] = useState<string>('');
  const [loadedKey, setLoadedKey] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const requestKey = `${path}::${fileVersion}`;
  const loading = loadedKey !== requestKey;

  // Image / SVG controls
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [checkerboard, setCheckerboard] = useState(true);
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [zoom, setZoom] = useState(1);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // HTML sandbox scripts opt-in (strictly defaults to false and resets on every path change)
  const [allowHtmlScripts, setAllowHtmlScripts] = useState(false);

  useEffect(() => {
    setAllowHtmlScripts(false);
    setZoomMode('fit');
    setZoom(1);
    setNaturalSize(null);
  }, [path]);

  // Load file bytes / live editor text whenever path or fileVersion changes
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    const isTextKind =
      kind === 'svg' || kind === 'html' || kind === 'csv' || kind === 'tsv' || kind === 'json';

    const live = isTextKind ? getLiveText?.(path) ?? null : null;
    if (live !== null) {
      if (!encoderRef.current) encoderRef.current = new TextEncoder();
      setText(live);
      setBytes(kind === 'svg' ? encoderRef.current.encode(live) : null);
      setLoadedKey(requestKey);
      return;
    }

    void readFileBytes(path)
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setLoadError(t('python.viewerReadFailed'));
          setBytes(null);
          setText('');
          setLoadedKey(requestKey);
          return;
        }
        setBytes(raw);
        if (isTextKind) {
          if (!decoderRef.current) decoderRef.current = new TextDecoder('utf-8');
          setText(decoderRef.current.decode(raw));
        } else {
          setText('');
        }
        setLoadedKey(requestKey);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(t('python.viewerReadFailed'));
          setLoadedKey(requestKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, kind, requestKey, readFileBytes, getLiveText, t]);

  // Create & revoke Blob URL for Image / SVG files strictly inside effect cleanup
  useEffect(() => {
    if ((kind !== 'image' && kind !== 'svg') || !bytes) {
      setBlobUrl(null);
      return;
    }
    const mime = IMAGE_MIME_MAP[fileExtension(path)] ?? 'application/octet-stream';
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const url = URL.createObjectURL(new Blob([copy], { type: mime }));
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [kind, path, bytes]);

  const htmlSrcDoc = useMemo(() => {
    if (kind !== 'html') return '';
    return buildSandboxedHtmlSrcDoc(text, allowHtmlScripts);
  }, [kind, text, allowHtmlScripts]);

  const handleDownload = useCallback(() => {
    onDownload?.(path);
  }, [onDownload, path]);

  return (
    <div
      className={plotStyles.viewerFrame}
      aria-label={t('python.programOutput')}
      data-testid="python-viewer-frame"
      data-viewer-kind={kind}
    >
      {/* Trusted viewer header outside rendered file content */}
      <div className={plotStyles.viewerHeader}>
        <div className={plotStyles.viewerHeaderLeft}>
          <span className={plotStyles.viewerOutputBadge} data-testid="python-viewer-output-label">
            {t('python.programOutput')}
          </span>
          <span className={plotStyles.viewerPathChip} title={path}>
            {path}
          </span>
          <span className={plotStyles.viewerMeta}>{formatByteSize(size)}</span>
          {naturalSize && (
            <span className={plotStyles.viewerMeta} data-testid="python-viewer-dims">
              {naturalSize.w}&times;{naturalSize.h} px
            </span>
          )}
        </div>
        <div className={plotStyles.viewerHeaderRight}>
          {onDownload && kind !== 'pdf' && (
            <button
              type="button"
              className={plotStyles.toolBtn}
              onClick={handleDownload}
              data-testid="python-viewer-download"
            >
              {t('python.filesDownload')}
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className={plotStyles.emptyState}>
          <div className={plotStyles.emptyDesc}>{t('python.viewerLoading')}</div>
        </div>
      )}

      {!loading && loadError && (
        <div className={plotStyles.errorBanner} role="alert">
          {loadError}
        </div>
      )}

      {/* 1. Image & SVG (SVG strictly via <img src={blobUrl}>, never inline <svg>/<object>/<iframe>) */}
      {!loading && !loadError && (kind === 'image' || kind === 'svg') && blobUrl && (
        <>
          <div className={plotStyles.stageToolbar}>
            <div className={plotStyles.stageToolbarGroup}>
              <button
                type="button"
                className={[
                  plotStyles.toolBtn,
                  zoomMode === 'fit' ? plotStyles.toolBtnActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setZoomMode('fit');
                  setZoom(1);
                }}
              >
                {t('python.viewerFit')}
              </button>
              <button
                type="button"
                className={[
                  plotStyles.toolBtn,
                  zoomMode === 'manual' && zoom === 1 ? plotStyles.toolBtnActive : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setZoomMode('manual');
                  setZoom(1);
                }}
              >
                100%
              </button>
              <button
                type="button"
                className={plotStyles.toolBtn}
                onClick={() => {
                  setZoomMode('manual');
                  setZoom((z) => Math.max(0.25, Math.round(z * 80) / 100));
                }}
                aria-label={t('python.viewerZoomOut')}
              >
                &minus;
              </button>
              <span className={plotStyles.zoomReadout}>
                {zoomMode === 'fit' ? t('python.viewerFit') : `${Math.round(zoom * 100)}%`}
              </span>
              <button
                type="button"
                className={plotStyles.toolBtn}
                onClick={() => {
                  setZoomMode('manual');
                  setZoom((z) => Math.min(6, Math.round(z * 125) / 100));
                }}
                aria-label={t('python.viewerZoomIn')}
              >
                +
              </button>
            </div>
            <div className={plotStyles.stageToolbarGroup}>
              <button
                type="button"
                className={[plotStyles.toolBtn, checkerboard ? plotStyles.toolBtnActive : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={checkerboard}
                onClick={() => setCheckerboard((c) => !c)}
                data-testid="python-viewer-checkerboard"
              >
                {t('python.viewerCheckerboard')}
              </button>
            </div>
          </div>

          <div
            className={[
              plotStyles.imageStage,
              checkerboard ? plotStyles.checkerboard : '',
              zoomMode === 'manual' ? plotStyles.imageStageZoomed : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="python-image-stage"
          >
            <img
              src={blobUrl}
              alt={path}
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalWidth > 0 && el.naturalHeight > 0) {
                  setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
                }
              }}
              className={[
                zoomMode === 'fit' ? plotStyles.stageImgFit : plotStyles.stageImgZoomed,
                plotStyles.stageImgTransparent,
              ].join(' ')}
              style={
                zoomMode === 'manual' && naturalSize
                  ? {
                      width: `${Math.round(naturalSize.w * zoom)}px`,
                      height: `${Math.round(naturalSize.h * zoom)}px`,
                    }
                  : undefined
              }
              data-testid="python-viewer-img"
            />
          </div>
        </>
      )}

      {/* 2. Canvas-only PDF viewer via lib/pdf/pdfjs.ts */}
      {!loading && !loadError && kind === 'pdf' && bytes && (
        <PdfPreview bytes={bytes} path={path} onDownload={onDownload ? handleDownload : undefined} />
      )}

      {/* 3. Pure React CSV/TSV table & JSON viewer */}
      {!loading && !loadError && (kind === 'csv' || kind === 'tsv' || kind === 'json') && (
        <DataTableViewer kind={kind} text={text} path={path} />
      )}

      {/* 4. Sandboxed HTML viewer (sandbox="" by default; opt-in allow-scripts + zero-connect CSP) */}
      {!loading && !loadError && kind === 'html' && (
        <>
          <div
            className={[
              plotStyles.htmlNoticeBar,
              allowHtmlScripts ? plotStyles.htmlNoticeWarn : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-testid="python-html-sandbox-notice"
          >
            <span>
              {allowHtmlScripts ? t('python.htmlScriptsOnNotice') : t('python.htmlScriptsOffNotice')}
            </span>
            <label className={plotStyles.htmlToggleLabel}>
              <input
                type="checkbox"
                checked={allowHtmlScripts}
                onChange={(e) => setAllowHtmlScripts(e.target.checked)}
                data-testid="python-html-allow-scripts"
              />
              <span>{t('python.htmlAllowScriptsLabel')}</span>
            </label>
          </div>
          <iframe
            key={`${path}:${allowHtmlScripts ? 'scripts' : 'static'}`}
            title={path}
            className={plotStyles.htmlIframe}
            sandbox={allowHtmlScripts ? 'allow-scripts' : ''}
            srcDoc={htmlSrcDoc}
            referrerPolicy="no-referrer"
            data-testid="python-html-iframe"
          />
        </>
      )}
    </div>
  );
}
