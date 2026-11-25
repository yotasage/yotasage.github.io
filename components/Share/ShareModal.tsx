import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getPageMeta, getProjectMeta } from '../../lib/citation';
import type { QrSymbol } from '../../lib/qr/encoder';
import { drawToCanvas, pngWithDpi } from '../../lib/qr/render';
import {
  buildShareChannels,
  buildShareFilename,
  buildShareQr,
  formatShareSnippet,
  makeShareRenderOptions,
  renderShareCardCanvas,
  resolveShareTarget,
  type ShareChannel,
  type ShareEcLevel,
  type ShareHostMode,
  type ShareQrStyle,
  type ShareScope,
  type ShareSnippetFormat,
} from '../../lib/share';
import { useI18n } from '../../lib/ui/i18n';
import { useShareModal } from '../../lib/ui/shareModal';
import styles from '../../styles/ShareModal.module.css';
import PillTabs, { type PillTabItem } from '../UI/PillTabs';

const SNIPPET_FORMATS: readonly ShareSnippetFormat[] = ['url', 'markdown', 'html', 'latex', 'message'];
const QR_STYLES: readonly ShareQrStyle[] = ['square', 'rounded', 'dots'];
const EC_LEVELS: readonly ShareEcLevel[] = ['M', 'Q', 'H'];

async function copyTextToClipboard(text: string, container?: HTMLElement | null): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for restricted clipboard contexts.
    }
  }
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  const host = container ?? document.body;
  host.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  host.removeChild(textarea);
  return copied;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function fmtCoord(n: number): string {
  return Number(n.toFixed(4)).toString();
}

function buildSymbolPaths(symbol: QrSymbol, style: ShareQrStyle): {
  viewBox: string;
  width: number;
  height: number;
  squarePath: string;
  styledPath: string;
} {
  const q = 4;
  const W = symbol.width + 2 * q;
  const H = symbol.height + 2 * q;
  const squareSet = new Set<number>();
  const styled: Array<{ x: number; y: number }> = [];

  for (let y = 0; y < symbol.height; y++) {
    for (let x = 0; x < symbol.width; x++) {
      const idx = y * symbol.width + x;
      if (!symbol.modules[idx]) continue;
      const isFunc = symbol.functionModules[idx] === 1;
      if (isFunc || style === 'square') {
        squareSet.add(idx);
      } else {
        styled.push({ x, y });
      }
    }
  }

  const squares: string[] = [];
  for (let y = 0; y < symbol.height; y++) {
    for (let x = 0; x < symbol.width; x++) {
      if (!squareSet.has(y * symbol.width + x)) continue;
      let run = 1;
      while (x + run < symbol.width && squareSet.has(y * symbol.width + x + run)) run++;
      squares.push(`M${x + q} ${y + q}h${run}v1h-${run}z`);
      x += run - 1;
    }
  }

  const others: string[] = [];
  if (style === 'rounded') {
    const r = 0.35;
    for (const m of styled) {
      const x = m.x + q;
      const y = m.y + q;
      others.push(
        `M${fmtCoord(x + r)} ${y}h${fmtCoord(1 - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${fmtCoord(1 - 2 * r)}a${r} ${r} 0 0 1 -${r} ${r}h-${fmtCoord(1 - 2 * r)}a${r} ${r} 0 0 1 -${r} -${r}v-${fmtCoord(1 - 2 * r)}a${r} ${r} 0 0 1 ${r} -${r}z`,
      );
    }
  } else if (style === 'dots') {
    const r = 0.45;
    for (const m of styled) {
      const x = m.x + q;
      const y = m.y + q;
      others.push(
        `M${fmtCoord(x + 0.5 - r)} ${fmtCoord(y + 0.5)}a${r} ${r} 0 1 0 ${fmtCoord(2 * r)} 0a${r} ${r} 0 1 0 -${fmtCoord(2 * r)} 0z`,
      );
    }
  }

  return {
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    squarePath: squares.join(''),
    styledPath: others.join(''),
  };
}

function QrPreviewSvg({
  symbol,
  style,
  ariaLabel,
}: {
  symbol: QrSymbol;
  style: ShareQrStyle;
  ariaLabel: string;
}) {
  const geom = useMemo(() => buildSymbolPaths(symbol, style), [symbol, style]);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={geom.viewBox}
      role="img"
      aria-label={ariaLabel}
    >
      <rect width={geom.width} height={geom.height} fill="#ffffff" />
      {geom.squarePath && <path fill="#0f172a" shapeRendering="crispEdges" d={geom.squarePath} />}
      {geom.styledPath && <path fill="#0f172a" d={geom.styledPath} />}
    </svg>
  );
}

function QrBadgeIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3z" />
      <path d="M20 14v3h-1" />
      <path d="M14 20h3" />
      <path d="M20 20h1" />
    </svg>
  );
}

function CopyIcon({ copied }: { copied: boolean }) {
  if (copied) {
    return (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    );
  }
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="M9 21H3v-6" />
      <path d="m21 3-7 7" />
      <path d="m3 21 7-7" />
    </svg>
  );
}

function ChannelIcon({ id }: { id: ShareChannel['id'] }) {
  switch (id) {
    case 'email':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case 'bluesky':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 12c-2.5-4.5-6.5-7-8.5-5.5C1.5 8 2.5 13 5 15c1.6 1.3 3.4 1.3 4.5.8-.7 1.7-2 2.7-3.5 3.2 2.5.8 5-.5 6-3 1 2.5 3.5 3.8 6 3-1.5-.5-2.8-1.5-3.5-3.2 1.1.5 2.9.5 4.5-.8 2.5-2 3.5-7 1.5-8.5C18.5 5 14.5 7.5 12 12Z" />
        </svg>
      );
    case 'reddit':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="14" r="7" />
          <circle cx="9.5" cy="13.5" r="0.8" fill="currentColor" />
          <circle cx="14.5" cy="13.5" r="0.8" fill="currentColor" />
          <path d="M9.5 17c1.4 1 3.6 1 5 0" />
          <path d="M12 7 14 3l4 1" />
          <circle cx="19" cy="4.2" r="1.2" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M8 11v5" />
          <path d="M8 8v.01" />
          <path d="M12 16v-5" />
          <path d="M16 16v-3a2 2 0 0 0-4 0" />
        </svg>
      );
    case 'x':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4l16 16" />
          <path d="M20 4 4 20" />
        </svg>
      );
    case 'hackernews':
      return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="m8 7 4 6 4-6" />
          <path d="M12 13v5" />
        </svg>
      );
  }
}

export default function ShareModal() {
  const { pathname } = useRouter();
  const { locale, t } = useI18n();
  const { open, closeShareModal, triggerRef } = useShareModal();

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const wasOpenRef = useRef(false);
  const lastRouteRef = useRef(pathname);
  const feedbackTimerRef = useRef<number | null>(null);

  const [scope, setScope] = useState<ShareScope>('page');
  const [hostMode, setHostMode] = useState<ShareHostMode>('public');
  const [includePageState, setIncludePageState] = useState(true);
  const [snippetFormat, setSnippetFormat] = useState<ShareSnippetFormat>('markdown');
  const [qrStyle, setQrStyle] = useState<ShareQrStyle>('rounded');
  const [ecLevel, setEcLevel] = useState<ShareEcLevel>('M');
  const [presenterMode, setPresenterMode] = useState(false);

  const [currentUrl, setCurrentUrl] = useState('');
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [canCopyImage, setCanCopyImage] = useState(false);
  const [feedbackId, setFeedbackId] = useState<string | null>(null);

  const page = useMemo(() => getPageMeta(pathname), [pathname]);
  const project = useMemo(() => getProjectMeta(), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      const href = window.location.href;
      setCurrentUrl(href);
      setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
      setCanCopyImage(
        typeof navigator !== 'undefined' &&
          typeof navigator.clipboard?.write === 'function' &&
          typeof ClipboardItem !== 'undefined',
      );
      setPresenterMode(false);

      if (page.kind === 'project' || page.route === '/') {
        setScope('home');
      } else if (lastRouteRef.current !== pathname) {
        setScope('page');
      }
      lastRouteRef.current = pathname;

      if (!dialog.open) {
        dialog.showModal();
      }
      surfaceRef.current?.focus({ preventScroll: true });
      wasOpenRef.current = true;
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        const trigger = triggerRef.current;
        if (trigger && trigger.isConnected) {
          trigger.focus();
        }
      }
    }
  }, [open, pathname, page.kind, page.route, triggerRef]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const flashFeedback = useCallback((id: string) => {
    setFeedbackId(id);
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedbackId((curr) => (curr === id ? null : curr));
      feedbackTimerRef.current = null;
    }, 2000);
  }, []);

  const target = useMemo(
    () =>
      resolveShareTarget({
        page,
        project,
        scope: page.kind === 'project' || page.route === '/' ? 'home' : scope,
        hostMode,
        includePageState,
        currentUrl: currentUrl || undefined,
      }),
    [page, project, scope, hostMode, includePageState, currentUrl],
  );

  const qr = useMemo(() => {
    if (!open) return { symbol: null, svg: null, error: null };
    return buildShareQr(target.url, ecLevel, qrStyle);
  }, [open, target.url, ecLevel, qrStyle]);

  const snippet = useMemo(
    () => formatShareSnippet(target, snippetFormat, locale),
    [target, snippetFormat, locale],
  );

  const channels = useMemo(() => buildShareChannels(target, locale), [target, locale]);

  const scopeItems = useMemo<readonly PillTabItem<ShareScope>[]>(
    () => [
      { id: 'page', label: page.kind === 'tool' ? t('share.scopeTool') : t('share.scopePage') },
      { id: 'home', label: t('share.scopeHome') },
    ],
    [page.kind, t],
  );

  const hostItems = useMemo<readonly PillTabItem<ShareHostMode>[]>(
    () => [
      { id: 'public', label: target.publicHostLabel },
      { id: 'current', label: t('share.hostCurrent', { host: target.currentHostLabel }) },
    ],
    [target.publicHostLabel, target.currentHostLabel, t],
  );

  const snippetItems = useMemo<readonly PillTabItem<ShareSnippetFormat>[]>(
    () =>
      SNIPPET_FORMATS.map((id) => ({
        id,
        label: t(`share.format.${id}`),
      })),
    [t],
  );

  const handleCopyText = useCallback(
    async (id: string, text: string) => {
      const ok = await copyTextToClipboard(text, dialogRef.current);
      if (ok) flashFeedback(id);
    },
    [flashFeedback],
  );

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: target.title,
        text: target.description,
        url: target.url,
      });
    } catch {
      // Ignore AbortError when user cancels OS share sheet.
    }
  }, [target.title, target.description, target.url]);

  const handleDownloadSvg = useCallback(() => {
    if (!qr.svg) return;
    const blob = new Blob([qr.svg], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, buildShareFilename(target, 'qr-svg'));
    flashFeedback('svg');
  }, [qr.svg, target, flashFeedback]);

  const buildQrPngBlob = useCallback(async (): Promise<Blob | null> => {
    if (!qr.symbol || typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    const opts = makeShareRenderOptions(qrStyle);
    const totalMods = qr.symbol.width + 2 * opts.quietZone;
    const scale = Math.max(8, Math.round(1024 / totalMods));
    drawToCanvas(canvas, qr.symbol, opts, scale, true);
    const rawBlob = await canvasToPngBlob(canvas);
    if (!rawBlob) return null;
    const bytes = new Uint8Array(await rawBlob.arrayBuffer());
    const withDpi = pngWithDpi(bytes, 300);
    return new Blob([withDpi.buffer as ArrayBuffer], { type: 'image/png' });
  }, [qr.symbol, qrStyle]);

  const handleDownloadPng = useCallback(async () => {
    const blob = await buildQrPngBlob();
    if (!blob) return;
    downloadBlob(blob, buildShareFilename(target, 'qr-png'));
    flashFeedback('png');
  }, [buildQrPngBlob, target, flashFeedback]);

  const handleCopyQrPng = useCallback(async () => {
    if (!canCopyImage) return;
    const blob = await buildQrPngBlob();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      flashFeedback('copyQr');
    } catch {
      // Clipboard image write denied; silently ignore.
    }
  }, [canCopyImage, buildQrPngBlob, flashFeedback]);

  const handleDownloadShareCard = useCallback(async () => {
    if (!qr.symbol || typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    const computedAccent =
      getComputedStyle(document.documentElement).getPropertyValue('--ds-accent-light').trim() || '#2563eb';
    renderShareCardCanvas(canvas, qr.symbol, target, qrStyle, {
      tagline: t('footer.localOnly'),
      scanHint: t('share.cardScanHint'),
      accentColor: computedAccent,
    });
    const rawBlob = await canvasToPngBlob(canvas);
    if (!rawBlob) return;
    const bytes = new Uint8Array(await rawBlob.arrayBuffer());
    const withDpi = pngWithDpi(bytes, 300);
    downloadBlob(new Blob([withDpi.buffer as ArrayBuffer], { type: 'image/png' }), buildShareFilename(target, 'share-card'));
    flashFeedback('card');
  }, [qr.symbol, target, qrStyle, t, flashFeedback]);

  const handleDialogClose = useCallback(() => {
    if (open) closeShareModal();
  }, [open, closeShareModal]);

  const handleBackdropClick = useCallback(
    (event: React.MouseEvent<HTMLDialogElement>) => {
      if (event.target === dialogRef.current) {
        closeShareModal();
      }
    },
    [closeShareModal],
  );

  const modalTitle =
    page.kind === 'project' || page.route === '/'
      ? t('share.modalTitleHome')
      : page.kind === 'tool'
        ? t('share.modalTitleTool')
        : t('share.modalTitlePage');

  const showScopeToggle = page.kind !== 'project' && page.route !== '/';
  const showStateToggle = !target.isHome && target.hasPageState;
  const showContextBar = showScopeToggle || target.hasDifferentHost || showStateToggle;

  const qrGenHref = `/qrcode/main?url=${encodeURIComponent(target.url)}`;
  const hardExit = pathname.startsWith('/python');

  return (
    <dialog
      ref={dialogRef}
      data-ds="v2"
      className={styles.dialog}
      aria-labelledby="share-modal-title"
      onClose={handleDialogClose}
      onClick={handleBackdropClick}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {open && (
        <div ref={surfaceRef} tabIndex={-1} className={styles.surface}>
          <header className={styles.header}>
            <div className={styles.headingGroup}>
              <span className={styles.headingIcon} aria-hidden="true">
                <QrBadgeIcon />
              </span>
              <div className={styles.titleWrap}>
                <h2 id="share-modal-title" className={styles.title}>
                  {modalTitle}
                </h2>
                <p className={styles.subtitle}>{t('share.modalSubtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              onClick={closeShareModal}
              aria-label={t('common.close')}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </header>

          <div className={styles.body}>
            {showContextBar && !presenterMode && (
              <div className={styles.contextBar}>
                <div className={styles.contextGroup}>
                  {showScopeToggle && (
                    <PillTabs<ShareScope>
                      items={scopeItems}
                      value={scope}
                      onChange={setScope}
                      ariaLabel={t('share.scopeAria')}
                      size="sm"
                      idPrefix="share-scope"
                    />
                  )}
                  {target.hasDifferentHost && (
                    <PillTabs<ShareHostMode>
                      items={hostItems}
                      value={hostMode}
                      onChange={setHostMode}
                      ariaLabel={t('share.hostAria')}
                      size="sm"
                      idPrefix="share-host"
                    />
                  )}
                </div>

                {showStateToggle && (
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={includePageState}
                      onChange={(e) => setIncludePageState(e.target.checked)}
                    />
                    <span>{t('share.opt.pageState')}</span>
                  </label>
                )}
              </div>
            )}

            {presenterMode ? (
              <div className={styles.presenter} data-testid="share-presenter-view">
                <div className={styles.presenterQr}>
                  {qr.symbol ? (
                    <QrPreviewSvg
                      symbol={qr.symbol}
                      style={qrStyle}
                      ariaLabel={t('share.qrAlt', { url: target.url })}
                    />
                  ) : (
                    <p className={styles.qrError}>{qr.error || t('share.qrError')}</p>
                  )}
                </div>
                <h3 className={styles.presenterTitle}>{target.shortTitle}</h3>
                <p className={styles.presenterUrl}>{target.url}</p>
                <div className={styles.presenterActions}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setPresenterMode(false)}
                  >
                    {t('share.exitEnlarge')}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => void handleCopyText('presenterUrl', target.url)}
                  >
                    <CopyIcon copied={feedbackId === 'presenterUrl'} />
                    <span>{feedbackId === 'presenterUrl' ? t('common.copied') : t('share.copyLink')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.columns}>
                {/* Left column: QR Code Studio */}
                <section className={styles.qrColumn} aria-label={t('share.qrSectionAria')}>
                  <button
                    type="button"
                    className={styles.qrFrameBtn}
                    onClick={() => setPresenterMode(true)}
                    disabled={!qr.symbol}
                    aria-label={t('share.enlargeAria')}
                    title={t('share.enlarge')}
                    data-testid="share-qr-preview"
                  >
                    {qr.symbol ? (
                      <span className={styles.qrSvgWrap}>
                        <QrPreviewSvg
                          symbol={qr.symbol}
                          style={qrStyle}
                          ariaLabel={t('share.qrAlt', { url: target.url })}
                        />
                      </span>
                    ) : (
                      <p className={styles.qrError}>{qr.error || t('share.qrError')}</p>
                    )}
                    {qr.symbol && (
                      <span className={styles.qrZoomHint} aria-hidden="true">
                        <ExpandIcon />
                        <span>{t('share.enlarge')}</span>
                      </span>
                    )}
                  </button>

                  {qr.symbol && (
                    <p className={styles.qrMeta} data-testid="share-qr-meta">
                      <span>{`QR v${qr.symbol.version}`}</span>
                      <span className={styles.qrMetaDot} aria-hidden="true">·</span>
                      <span>{`${qr.symbol.width}×${qr.symbol.height}`}</span>
                      <span className={styles.qrMetaDot} aria-hidden="true">·</span>
                      <span>{`EC ${qr.symbol.ecLevel ?? ecLevel}`}</span>
                      <span className={styles.qrMetaDot} aria-hidden="true">·</span>
                      <span>{t('share.charsCount', { count: target.url.length })}</span>
                    </p>
                  )}

                  <div className={styles.qrControls}>
                    <div className={styles.qrControlRow}>
                      <span className={styles.qrControlLabel}>{t('share.styleLabel')}</span>
                      <div className={styles.miniSeg} role="group" aria-label={t('share.styleLabel')}>
                        {QR_STYLES.map((style) => {
                          const active = qrStyle === style;
                          return (
                            <button
                              key={style}
                              type="button"
                              aria-pressed={active}
                              className={[styles.miniSegBtn, active ? styles.miniSegBtnActive : '']
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => setQrStyle(style)}
                            >
                              {t(`share.style.${style}`)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className={styles.qrControlRow}>
                      <span className={styles.qrControlLabel}>{t('share.ecLabel')}</span>
                      <div className={styles.miniSeg} role="group" aria-label={t('share.ecLabel')}>
                        {EC_LEVELS.map((level) => {
                          const active = ecLevel === level;
                          return (
                            <button
                              key={level}
                              type="button"
                              aria-pressed={active}
                              className={[styles.miniSegBtn, active ? styles.miniSegBtnActive : '']
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => setEcLevel(level)}
                              title={t(`share.ec.${level}`)}
                            >
                              {level}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className={styles.qrActions}>
                    <button
                      type="button"
                      className={styles.qrActionBtn}
                      disabled={!qr.symbol}
                      onClick={() => setPresenterMode(true)}
                    >
                      <ExpandIcon />
                      <span>{t('share.enlarge')}</span>
                    </button>

                    {canCopyImage ? (
                      <button
                        type="button"
                        className={styles.qrActionBtn}
                        disabled={!qr.symbol}
                        onClick={() => void handleCopyQrPng()}
                      >
                        <CopyIcon copied={feedbackId === 'copyQr'} />
                        <span>{feedbackId === 'copyQr' ? t('common.copied') : t('share.copyQr')}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.qrActionBtn}
                        disabled={!qr.svg}
                        onClick={handleDownloadSvg}
                      >
                        <DownloadIcon />
                        <span>{feedbackId === 'svg' ? t('share.saved') : 'SVG'}</span>
                      </button>
                    )}

                    {canCopyImage && (
                      <button
                        type="button"
                        className={styles.qrActionBtn}
                        disabled={!qr.svg}
                        onClick={handleDownloadSvg}
                      >
                        <DownloadIcon />
                        <span>{feedbackId === 'svg' ? t('share.saved') : 'SVG'}</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className={styles.qrActionBtn}
                      disabled={!qr.symbol}
                      onClick={() => void handleDownloadPng()}
                    >
                      <DownloadIcon />
                      <span>{feedbackId === 'png' ? t('share.saved') : 'PNG'}</span>
                    </button>

                    <button
                      type="button"
                      className={[styles.qrActionBtn, styles.qrActionBtnWide].join(' ')}
                      disabled={!qr.symbol}
                      onClick={() => void handleDownloadShareCard()}
                    >
                      <DownloadIcon />
                      <span>{feedbackId === 'card' ? t('share.saved') : t('share.downloadCard')}</span>
                    </button>
                  </div>
                </section>

                {/* Right column: Direct Link, Snippets & Share Channels */}
                <div className={styles.shareColumn}>
                  <section className={styles.section} aria-labelledby="share-link-heading">
                    <div className={styles.sectionHead}>
                      <h3 id="share-link-heading" className={styles.sectionTitle}>
                        {t('share.linkHeading')}
                      </h3>
                    </div>

                    <div className={styles.linkRow}>
                      <input
                        type="text"
                        readOnly
                        value={target.url}
                        aria-label={t('share.linkInputAria')}
                        className={styles.urlInput}
                        onFocus={(e) => e.currentTarget.select()}
                        onClick={(e) => e.currentTarget.select()}
                      />
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        onClick={() => void handleCopyText('link', target.url)}
                      >
                        <CopyIcon copied={feedbackId === 'link'} />
                        <span>{feedbackId === 'link' ? t('common.copied') : t('share.copyLink')}</span>
                      </button>
                    </div>

                    {canNativeShare && (
                      <button
                        type="button"
                        className={[styles.secondaryBtn, styles.nativeShareBtn].join(' ')}
                        onClick={() => void handleNativeShare()}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                          <polyline points="16 6 12 2 8 6" />
                          <line x1="12" x2="12" y1="2" y2="15" />
                        </svg>
                        <span>{t('share.nativeShare')}</span>
                      </button>
                    )}
                  </section>

                  <section className={styles.section} aria-labelledby="share-snippet-heading">
                    <div className={styles.sectionHead}>
                      <h3 id="share-snippet-heading" className={styles.sectionTitle}>
                        {t('share.snippetHeading')}
                      </h3>
                    </div>

                    <div className={styles.formatTabsWrap}>
                      <PillTabs<ShareSnippetFormat>
                        items={snippetItems}
                        value={snippetFormat}
                        onChange={setSnippetFormat}
                        ariaLabel={t('share.snippetFormatAria')}
                        size="sm"
                        idPrefix="share-snippet"
                      />
                    </div>

                    <div
                      className={styles.snippetBox}
                      role="tabpanel"
                      id={`share-snippet-panel-${snippetFormat}`}
                      aria-labelledby={`share-snippet-tab-${snippetFormat}`}
                    >
                      <pre className={styles.snippetCode}>
                        <code>{snippet}</code>
                      </pre>
                      <button
                        type="button"
                        className={styles.snippetCopyBtn}
                        onClick={() => void handleCopyText(`snippet-${snippetFormat}`, snippet)}
                      >
                        <CopyIcon copied={feedbackId === `snippet-${snippetFormat}`} />
                        <span>
                          {feedbackId === `snippet-${snippetFormat}` ? t('common.copied') : t('common.copy')}
                        </span>
                      </button>
                    </div>
                  </section>

                  <section className={styles.section} aria-labelledby="share-channels-heading">
                    <div className={styles.sectionHead}>
                      <h3 id="share-channels-heading" className={styles.sectionTitle}>
                        {t('share.channelsHeading')}
                      </h3>
                    </div>

                    <div className={styles.channelsGrid}>
                      {channels.map((ch) => (
                        <a
                          key={ch.id}
                          href={ch.href}
                          className={styles.channelLink}
                          target={ch.external ? '_blank' : undefined}
                          rel={ch.external ? 'noopener noreferrer' : undefined}
                        >
                          <ChannelIcon id={ch.id} />
                          <span>{ch.label}</span>
                        </a>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}
          </div>

          <footer className={styles.footer}>
            <p className={styles.privacyNote}>{t('share.privacyNote')}</p>
            {pathname !== '/qrcode/main' &&
              (hardExit ? (
                <a href={qrGenHref} className={styles.qrGenLink} onClick={closeShareModal}>
                  <span>{t('share.openInQrGen')}</span>
                  <span aria-hidden="true">&rarr;</span>
                </a>
              ) : (
                <Link href={qrGenHref} className={styles.qrGenLink} onClick={closeShareModal}>
                  <span>{t('share.openInQrGen')}</span>
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              ))}
          </footer>
        </div>
      )}
    </dialog>
  );
}
