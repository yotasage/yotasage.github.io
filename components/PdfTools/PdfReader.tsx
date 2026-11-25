import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import React from 'react';

import { download, formatBytes } from '../../lib/pdf/files';
import {
  extractPageLinks,
  extractPageSearchText,
  extractPageTextLayout,
  findTextMatches,
  formatPageDimensions,
  OutlineNode,
  PageLinkItem,
  PageMatchSpan,
  PdfDocInfo,
  PositionedTextItem,
  readDocInfo,
  readOutlineTree,
  resolveDestinationPage,
  SearchMatch,
  splitItemWithMatches,
} from '../../lib/pdf/reader';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { useI18n } from '../../lib/ui/i18n';
import rStyles from '../../styles/PdfReader.module.css';
import { ContinueWith } from './ContinueWith';
import { DropTarget, FilePickerButton } from './ToolPage';

type SidebarTab = 'thumbnails' | 'contents' | 'info';
type ViewMode = 'continuous' | 'single' | 'two-page';
type ZoomMode = 'fit-width' | 'fit-page' | 'custom';
type ExtraRotation = 0 | 90 | 180 | 270;

interface PageDims {
  width: number;
  height: number;
}

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.85, 1, 1.15, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const PRESET_SCALES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const MAX_ACTIVE_CANVASES = 12;
const MAX_CANVAS_PIXELS = 16_777_216; // 16 MP cap to stay safe on mobile Safari/Chrome
const DEFAULT_PAGE_DIMS: PageDims = { width: 612, height: 792 };

let measureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(str: string, fontSize: number, fontFamily: string): number {
  if (typeof document === 'undefined' || !str) return 0;
  if (!measureCtx) {
    const c = document.createElement('canvas');
    measureCtx = c.getContext('2d');
  }
  if (!measureCtx) return 0;
  measureCtx.font = `${fontSize}px ${fontFamily}`;
  return measureCtx.measureText(str).width;
}

function clampScale(s: number): number {
  return Math.max(0.25, Math.min(4, s));
}

function rotatedDims(dims: PageDims, rotation: ExtraRotation): PageDims {
  return rotation === 90 || rotation === 270
    ? { width: dims.height, height: dims.width }
    : dims;
}

export interface PdfReaderProps {
  docId: string;
  fileName: string;
  bytes: Uint8Array;
  doc: PDFDocumentProxy;
  pool: PdfThumbPool;
  numPages: number;
  onOpenFiles: (files: File[]) => void;
}

export function PdfReader({
  docId,
  fileName,
  bytes,
  doc,
  pool,
  numPages,
  onOpenFiles,
}: PdfReaderProps) {
  const { t } = useI18n();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const slotRefs = React.useRef<Map<number, HTMLDivElement>>(new Map());
  const programmaticScrollUntilRef = React.useRef<number>(0);

  // Print iframe / URL cleanup refs
  const printCleanupRef = React.useRef<(() => void) | null>(null);

  // Layout & navigation state
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState<SidebarTab>('thumbnails');
  const [currentPage, setCurrentPage] = React.useState(1);
  const [pageInput, setPageInput] = React.useState('1');
  const [zoomMode, setZoomMode] = React.useState<ZoomMode>('fit-width');
  const [customScale, setCustomScale] = React.useState(1);
  const [viewMode, setViewMode] = React.useState<ViewMode>('continuous');
  const [extraRotation, setExtraRotation] = React.useState<ExtraRotation>(0);
  const [darkPaper, setDarkPaper] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [viewportSize, setViewportSize] = React.useState<{ width: number; height: number }>({ width: 800, height: 600 });

  // Per-page base dimensions (scale 1, extraRotation 0)
  const [pageDimsMap, setPageDimsMap] = React.useState<Map<number, PageDims>>(() => new Map());
  const [defaultDims, setDefaultDims] = React.useState<PageDims>(DEFAULT_PAGE_DIMS);

  // Document metadata & outline
  const [outline, setOutline] = React.useState<OutlineNode[]>([]);
  const [outlineLoaded, setOutlineLoaded] = React.useState(false);
  const [docInfo, setDocInfo] = React.useState<PdfDocInfo | null>(null);

  // Virtualisation: pages within IntersectionObserver rootMargin
  const [nearPages, setNearPages] = React.useState<Set<number>>(() => new Set([1]));

  // Search state
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [searching, setSearching] = React.useState(false);
  const [matches, setMatches] = React.useState<SearchMatch[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = React.useState(0);
  const searchTextCacheRef = React.useRef<Map<number, string>>(new Map());
  const searchRunIdRef = React.useRef(0);

  // Open sidebar by default on desktop after mount (avoids SSR hydration mismatch)
  React.useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 900) {
      setSidebarOpen(true);
    }
  }, []);

  // Reset per-document state whenever a new PDF is opened
  React.useEffect(() => {
    setCurrentPage(1);
    setPageInput('1');
    setExtraRotation(0);
    setPageDimsMap(new Map());
    setDefaultDims(DEFAULT_PAGE_DIMS);
    setNearPages(new Set([1]));
    setOutline([]);
    setOutlineLoaded(false);
    setDocInfo(null);
    setMatches([]);
    setActiveMatchIdx(0);
    setSearching(false);
    searchTextCacheRef.current.clear();
    searchRunIdRef.current += 1;

    if (viewportRef.current) {
      viewportRef.current.scrollTop = 0;
      viewportRef.current.scrollLeft = 0;
    }

    let cancelled = false;
    void readOutlineTree(doc).then((tree) => {
      if (!cancelled) {
        setOutline(tree);
        setOutlineLoaded(true);
      }
    });
    void readDocInfo(doc).then((info) => {
      if (cancelled) return;
      setDocInfo(info);
      if (info.pageWidthPt && info.pageHeightPt) {
        const d = { width: info.pageWidthPt, height: info.pageHeightPt };
        setDefaultDims(d);
        setPageDimsMap((prev) => {
          const next = new Map(prev);
          next.set(1, d);
          return next;
        });
      }
    });

    return () => {
      cancelled = true;
      printCleanupRef.current?.();
      printCleanupRef.current = null;
    };
  }, [docId, doc]);

  // Keep pageInput synced when currentPage changes
  React.useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // Measure scrollable viewport container
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync fullscreen state
  React.useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === rootRef.current));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Clean up any active print iframe/URL on unmount
  React.useEffect(() => {
    return () => {
      printCleanupRef.current?.();
      printCleanupRef.current = null;
    };
  }, []);

  const isNarrowSpread = viewportSize.width < 700;
  const effectiveViewMode: ViewMode = viewMode === 'two-page' && isNarrowSpread ? 'single' : viewMode;

  // Compute effective zoom scale
  const effectiveScale = React.useMemo(() => {
    if (zoomMode === 'custom') return clampScale(customScale);
    const refBase = pageDimsMap.get(currentPage) ?? defaultDims;
    const ref = rotatedDims(refBase, extraRotation);
    const padX = viewportSize.width <= 600 ? 16 : 32;
    const padY = viewportSize.width <= 600 ? 16 : 32;
    const availW = Math.max(180, viewportSize.width - padX);
    const availH = Math.max(200, viewportSize.height - padY);
    const widthBudget = effectiveViewMode === 'two-page' ? Math.max(140, (availW - 16) / 2) : availW;

    if (zoomMode === 'fit-width') {
      return clampScale(widthBudget / Math.max(1, ref.width));
    }
    return clampScale(Math.min(widthBudget / Math.max(1, ref.width), availH / Math.max(1, ref.height)));
  }, [zoomMode, customScale, pageDimsMap, currentPage, defaultDims, extraRotation, viewportSize, effectiveViewMode]);

  // Visible pages list for Single / Two-page modes
  const spreadPages = React.useMemo(() => {
    if (effectiveViewMode === 'single') {
      return [currentPage];
    }
    if (effectiveViewMode === 'two-page') {
      const start = currentPage % 2 === 1 ? currentPage : currentPage - 1;
      return start + 1 <= numPages ? [start, start + 1] : [start];
    }
    return [];
  }, [effectiveViewMode, currentPage, numPages]);

  // Jump to a 1-based page
  const jumpToPage = React.useCallback(
    (targetPage: number, smooth = false) => {
      const clamped = Math.max(1, Math.min(numPages, Math.round(targetPage)));
      setCurrentPage(clamped);
      if (effectiveViewMode === 'continuous') {
        const slot = slotRefs.current.get(clamped);
        const vp = viewportRef.current;
        if (slot && vp) {
          programmaticScrollUntilRef.current = Date.now() + 450;
          const top = slot.offsetTop - 12;
          vp.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
        }
      } else if (viewportRef.current) {
        viewportRef.current.scrollTop = 0;
      }
    },
    [numPages, effectiveViewMode],
  );

  const stepPage = React.useCallback(
    (delta: number) => {
      const step = effectiveViewMode === 'two-page' ? delta * 2 : delta;
      jumpToPage(currentPage + step, false);
    },
    [effectiveViewMode, currentPage, jumpToPage],
  );

  const zoomIn = React.useCallback(() => {
    const next = ZOOM_STEPS.find((s) => s > effectiveScale + 0.02) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    setZoomMode('custom');
    setCustomScale(next);
  }, [effectiveScale]);

  const zoomOut = React.useCallback(() => {
    const prev = [...ZOOM_STEPS].reverse().find((s) => s < effectiveScale - 0.02) ?? ZOOM_STEPS[0];
    setZoomMode('custom');
    setCustomScale(prev);
  }, [effectiveScale]);

  // Track visible pages in continuous mode via IntersectionObserver
  React.useEffect(() => {
    if (effectiveViewMode !== 'continuous') return;
    const vp = viewportRef.current;
    if (!vp || typeof IntersectionObserver === 'undefined') return;

    const visibleSet = new Set<number>();
    const io = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const p = Number((entry.target as HTMLElement).dataset.page);
          if (!Number.isFinite(p)) continue;
          if (entry.isIntersecting) {
            if (!visibleSet.has(p)) {
              visibleSet.add(p);
              changed = true;
            }
          } else if (visibleSet.has(p)) {
            visibleSet.delete(p);
            changed = true;
          }
        }
        if (changed) {
          setNearPages(new Set(visibleSet));
        }
      },
      { root: vp, rootMargin: '600px 0px', threshold: 0 },
    );

    for (const el of slotRefs.current.values()) {
      io.observe(el);
    }

    return () => io.disconnect();
  }, [effectiveViewMode, numPages, docId]);

  // Track current page on scroll in continuous mode
  React.useEffect(() => {
    if (effectiveViewMode !== 'continuous') return;
    const vp = viewportRef.current;
    if (!vp) return;

    let raf = 0;
    const handleScroll = () => {
      if (Date.now() < programmaticScrollUntilRef.current) return;
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const vpTop = vp.scrollTop;
        const anchor = vpTop + vp.clientHeight * 0.28;
        let bestPage = 1;
        let bestDist = Infinity;

        for (let p = 1; p <= numPages; p++) {
          const el = slotRefs.current.get(p);
          if (!el) continue;
          const top = el.offsetTop;
          const bottom = top + el.offsetHeight;
          if (anchor >= top && anchor <= bottom) {
            bestPage = p;
            break;
          }
          const dist = Math.min(Math.abs(anchor - top), Math.abs(anchor - bottom));
          if (dist < bestDist) {
            bestDist = dist;
            bestPage = p;
          }
        }
        setCurrentPage((prev) => (prev === bestPage ? prev : bestPage));
      });
    };

    vp.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      vp.removeEventListener('scroll', handleScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [effectiveViewMode, numPages, docId]);

  // Bounded set of pages allowed to hold active rendered canvases (~12 max)
  const activeRenderPages = React.useMemo(() => {
    if (effectiveViewMode !== 'continuous') {
      return new Set<number>(spreadPages);
    }
    const candidates = new Set<number>(nearPages);
    candidates.add(currentPage);
    if (currentPage > 1) candidates.add(currentPage - 1);
    if (currentPage < numPages) candidates.add(currentPage + 1);

    const sorted = Array.from(candidates).sort(
      (a, b) => Math.abs(a - currentPage) - Math.abs(b - currentPage),
    );
    return new Set<number>(sorted.slice(0, MAX_ACTIVE_CANVASES));
  }, [effectiveViewMode, spreadPages, nearPages, currentPage, numPages]);

  const handleMeasurePage = React.useCallback((pageNumber: number, width: number, height: number) => {
    setPageDimsMap((prev) => {
      const existing = prev.get(pageNumber);
      if (existing && Math.abs(existing.width - width) < 0.5 && Math.abs(existing.height - height) < 0.5) {
        return prev;
      }
      const next = new Map(prev);
      next.set(pageNumber, { width, height });
      return next;
    });
  }, []);

  const handleCachePageText = React.useCallback((pageNumber: number, fullText: string) => {
    searchTextCacheRef.current.set(pageNumber, fullText);
  }, []);

  // In-document search with lazy extraction + cancellation token
  React.useEffect(() => {
    const query = searchQuery;
    const runId = ++searchRunIdRef.current;

    if (!searchOpen || !query) {
      setMatches([]);
      setActiveMatchIdx(0);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const collected: SearchMatch[] = [];
        let firstJumpDone = false;

        for (let p = 1; p <= numPages; p++) {
          if (searchRunIdRef.current !== runId) return;
          let text = searchTextCacheRef.current.get(p);
          if (text === undefined) {
            try {
              text = await extractPageSearchText(doc, p);
              if (searchRunIdRef.current !== runId) return;
              searchTextCacheRef.current.set(p, text);
            } catch {
              text = '';
            }
          }
          const found = findTextMatches(text, query, caseSensitive, p);
          if (found.length > 0) {
            collected.push(...found);
            if (!firstJumpDone && p >= currentPage) {
              firstJumpDone = true;
              const idx = collected.length - found.length;
              setMatches(collected.slice());
              setActiveMatchIdx(idx);
              jumpToPage(p, true);
            }
          }
          if (p % 8 === 0 && searchRunIdRef.current === runId) {
            setMatches(collected.slice());
          }
        }

        if (searchRunIdRef.current !== runId) return;
        setMatches(collected);
        setSearching(false);
        if (collected.length > 0 && !firstJumpDone) {
          setActiveMatchIdx(0);
          jumpToPage(collected[0].pageNumber, true);
        } else if (collected.length === 0) {
          setActiveMatchIdx(0);
        }
      })();
    }, 140);

    return () => {
      window.clearTimeout(timer);
    };
    // Intentionally exclude currentPage & jumpToPage so scrolling doesn't re-run search
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen, searchQuery, caseSensitive, doc, numPages]);

  const navigateMatch = React.useCallback(
    (delta: number) => {
      if (matches.length === 0) return;
      const nextIdx = (activeMatchIdx + delta + matches.length) % matches.length;
      setActiveMatchIdx(nextIdx);
      const target = matches[nextIdx];
      jumpToPage(target.pageNumber, true);
    },
    [matches, activeMatchIdx, jumpToPage],
  );

  // Scroll active highlight <mark> into view when it renders
  React.useEffect(() => {
    if (!searchOpen || matches.length === 0) return;
    const raf = window.requestAnimationFrame(() => {
      const mark = viewportRef.current?.querySelector('mark[data-active-match="true"]');
      if (mark && typeof (mark as HTMLElement).scrollIntoView === 'function') {
        (mark as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [activeMatchIdx, searchOpen, matches]);

  // Group search matches by 1-based page number
  const matchesByPage = React.useMemo(() => {
    const map = new Map<number, PageMatchSpan[]>();
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      let arr = map.get(m.pageNumber);
      if (!arr) {
        arr = [];
        map.set(m.pageNumber, arr);
      }
      arr.push({ start: m.start, end: m.end, globalIndex: i });
    }
    return map;
  }, [matches]);

  const openSearch = React.useCallback(() => {
    setSearchOpen(true);
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, []);

  const closeSearch = React.useCallback(() => {
    setSearchOpen(false);
  }, []);

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        openSearch();
        return;
      }
      if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        closeSearch();
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (
        active &&
        (active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.tagName === 'SELECT' ||
          active.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepPage(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepPage(1);
      } else if (e.key === 'PageUp' && effectiveViewMode !== 'continuous') {
        e.preventDefault();
        stepPage(-1);
      } else if (e.key === 'PageDown' && effectiveViewMode !== 'continuous') {
        e.preventDefault();
        stepPage(1);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        setZoomMode('fit-width');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSearch, closeSearch, searchOpen, stepPage, effectiveViewMode, zoomIn, zoomOut]);

  // Internal link destination jump
  const handleInternalDest = React.useCallback(
    async (dest: unknown) => {
      const target = await resolveDestinationPage(doc, dest);
      if (target !== null) {
        jumpToPage(target, true);
      }
    },
    [doc, jumpToPage],
  );

  // Clean Blob URL iframe print
  const handlePrint = React.useCallback(() => {
    printCleanupRef.current?.();
    printCleanupRef.current = null;

    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    iframe.style.pointerEvents = 'none';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.src = url;

    let cleaned = false;
    let fallbackTimer: number | null = null;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
      iframe.remove();
      URL.revokeObjectURL(url);
      if (printCleanupRef.current === cleanup) printCleanupRef.current = null;
    };
    printCleanupRef.current = cleanup;

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow;
        if (win) {
          win.addEventListener('afterprint', cleanup, { once: true });
          win.focus();
          win.print();
        }
      } catch {
        // Fallback if browser blocks scripted print on PDF iframe
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      fallbackTimer = window.setTimeout(cleanup, 60_000);
    };

    document.body.appendChild(iframe);
  }, [bytes]);

  const handleToggleFullscreen = React.useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen?.();
    } else if (typeof el.requestFullscreen === 'function') {
      void el.requestFullscreen();
    }
  }, []);

  const commitPageInput = () => {
    const parsed = parseInt(pageInput.trim(), 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= numPages) {
      jumpToPage(parsed, false);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const zoomSelectValue =
    zoomMode === 'fit-width'
      ? 'fit-width'
      : zoomMode === 'fit-page'
        ? 'fit-page'
        : PRESET_SCALES.some((s) => Math.abs(s - customScale) < 0.005)
          ? String(PRESET_SCALES.find((s) => Math.abs(s - customScale) < 0.005))
          : 'custom';

  const handleZoomSelect = (val: string) => {
    if (val === 'fit-width' || val === 'fit-page') {
      setZoomMode(val);
    } else {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) {
        setZoomMode('custom');
        setCustomScale(clampScale(n));
      }
    }
  };

  const handleSidebarJump = React.useCallback(
    (pageNumber: number) => {
      jumpToPage(pageNumber, false);
      if (typeof window !== 'undefined' && window.innerWidth < 900) {
        setSidebarOpen(false);
      }
    },
    [jumpToPage],
  );

  const handoffFiles = React.useMemo(() => [{ name: fileName, bytes }], [fileName, bytes]);

  const pagesToRenderList = React.useMemo(() => {
    if (effectiveViewMode === 'continuous') {
      return Array.from({ length: numPages }, (_, i) => i + 1);
    }
    return spreadPages;
  }, [effectiveViewMode, numPages, spreadPages]);

  const setSlotRef = React.useCallback((pageNumber: number, el: HTMLDivElement | null) => {
    if (el) slotRefs.current.set(pageNumber, el);
    else slotRefs.current.delete(pageNumber);
  }, []);

  return (
    <div ref={rootRef}>
      <DropTarget
        onFiles={onOpenFiles}
        className={rStyles.readerShell}
        overClassName={rStyles.readerDropOver}
      >
        {/* Top Toolbar */}
        <div className={rStyles.toolbar} role="toolbar" aria-label={t('pdf.rd.controlsAria')}>
          <div className={rStyles.toolGroup}>
            <button
              type="button"
              className={[rStyles.toolBtn, sidebarOpen ? rStyles.toolBtnActive : ''].join(' ')}
              aria-pressed={sidebarOpen}
              aria-label={t('pdf.rd.toggleSidebarAria')}
              title={t('pdf.rd.sidebarTitle')}
              onClick={() => setSidebarOpen((v) => !v)}
            >
              ☰ <span className={rStyles.hideOnPhone}>{t('pdf.rd.sidebar')}</span>
            </button>
          </div>

          <span className={rStyles.toolSep} aria-hidden />

          <div className={rStyles.toolGroup}>
            <button
              type="button"
              className={rStyles.toolBtnIcon}
              aria-label={t('pdf.rd.prevPageAria')}
              title={t('pdf.rd.prevPageTitle')}
              disabled={currentPage <= 1}
              onClick={() => stepPage(-1)}
            >
              ←
            </button>
            <input
              type="text"
              inputMode="numeric"
              className={rStyles.pageInput}
              aria-label={t('pdf.rd.currPageAria')}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={commitPageInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitPageInput();
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
            />
            <span className={rStyles.pageTotal}>/ {numPages}</span>
            <button
              type="button"
              className={rStyles.toolBtnIcon}
              aria-label={t('pdf.rd.nextPageAria')}
              title={t('pdf.rd.nextPageTitle')}
              disabled={currentPage >= numPages}
              onClick={() => stepPage(1)}
            >
              →
            </button>
          </div>

          <span className={rStyles.toolSep} aria-hidden />

          <div className={rStyles.toolGroup}>
            <button
              type="button"
              className={rStyles.toolBtnIcon}
              aria-label={t('pdf.canvas.zoomOut')}
              title={t('pdf.rd.zoomOutTitle')}
              onClick={zoomOut}
            >
              −
            </button>
            <select
              className={rStyles.toolSelect}
              aria-label={t('pdf.rd.zoomLevelAria')}
              value={zoomSelectValue}
              onChange={(e) => handleZoomSelect(e.target.value)}
            >
              <option value="fit-width">{t('pdf.rd.fitWidth')}</option>
              <option value="fit-page">{t('pdf.rd.fitPage')}</option>
              {zoomSelectValue === 'custom' && (
                <option value="custom">{Math.round(effectiveScale * 100)}%</option>
              )}
              {PRESET_SCALES.map((s) => (
                <option key={s} value={String(s)}>
                  {Math.round(s * 100)}%
                </option>
              ))}
            </select>
            <button
              type="button"
              className={rStyles.toolBtnIcon}
              aria-label={t('pdf.canvas.zoomIn')}
              title={t('pdf.rd.zoomInTitle')}
              onClick={zoomIn}
            >
              +
            </button>
          </div>

          <span className={rStyles.toolSep} aria-hidden />

          <div className={rStyles.toolGroup}>
            <select
              className={rStyles.toolSelect}
              aria-label={t('pdf.rd.pageLayoutAria')}
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
            >
              <option value="continuous">{t('pdf.rd.continuous')}</option>
              <option value="single">{t('pdf.rd.singlePage')}</option>
              <option value="two-page">{t('pdf.rd.twoPage')}</option>
            </select>
            <button
              type="button"
              className={rStyles.toolBtn}
              aria-label={t('pdf.rd.rotateAria')}
              title={t('pdf.rd.rotateTitle')}
              onClick={() => setExtraRotation((r) => (((r + 90) % 360) as ExtraRotation))}
            >
              ↻ 90°
            </button>
            <button
              type="button"
              className={[rStyles.toolBtn, darkPaper ? rStyles.toolBtnActive : ''].join(' ')}
              aria-pressed={darkPaper}
              aria-label={t('pdf.rd.darkAria')}
              title={t('pdf.rd.darkTitle')}
              onClick={() => setDarkPaper((v) => !v)}
            >
              ☾ <span className={rStyles.hideOnPhone}>{t('pdf.rd.dark')}</span>
            </button>
          </div>

          <span className={rStyles.toolSpacer} />

          <div className={rStyles.toolGroup}>
            <button
              type="button"
              className={[rStyles.toolBtn, searchOpen ? rStyles.toolBtnActive : ''].join(' ')}
              aria-pressed={searchOpen}
              aria-label={t('pdf.rd.findAria')}
              title={t('pdf.rd.findTitle')}
              onClick={() => (searchOpen ? closeSearch() : openSearch())}
            >
              {t('pdf.rd.find')}
            </button>
            <button
              type="button"
              className={rStyles.toolBtn}
              aria-label={t('pdf.rd.printAria')}
              title={t('pdf.rd.printAria')}
              onClick={handlePrint}
            >
              {t('pdf.rd.print')}
            </button>
            <button
              type="button"
              className={rStyles.toolBtn}
              aria-label={t('pdf.rd.downloadAria')}
              title={t('pdf.rd.downloadAria')}
              onClick={() => download(bytes, fileName)}
            >
              {t('pdf.rd.download')}
            </button>
            <button
              type="button"
              className={[rStyles.toolBtn, isFullscreen ? rStyles.toolBtnActive : ''].join(' ')}
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? t('pdf.rd.exitFsAria') : t('pdf.rd.enterFsAria')}
              title={isFullscreen ? t('pdf.rd.exitFsAria') : t('pdf.rd.fsTitle')}
              onClick={handleToggleFullscreen}
            >
              {isFullscreen ? t('pdf.rd.exit') : '⛶'}
            </button>
            <FilePickerButton
              accept=".pdf,application/pdf"
              multiple={false}
              onFiles={onOpenFiles}
              className={rStyles.toolBtn}
            >
              {t('pdf.rd.openPdf')}
            </FilePickerButton>
          </div>
        </div>

        {/* Search Bar */}
        {searchOpen && (
          <div className={rStyles.searchBar} role="search" aria-label={t('pdf.rd.findAria')}>
            <input
              ref={searchInputRef}
              type="search"
              className={rStyles.searchInput}
              placeholder={t('pdf.rd.findPlaceholder')}
              aria-label={t('pdf.rd.searchQueryAria')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  navigateMatch(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeSearch();
                }
              }}
            />
            <button
              type="button"
              className={[rStyles.toolBtn, caseSensitive ? rStyles.toolBtnActive : ''].join(' ')}
              aria-pressed={caseSensitive}
              title={t('pdf.rd.matchCase')}
              onClick={() => setCaseSensitive((v) => !v)}
            >
              Aa
            </button>
            <span className={rStyles.searchCount} aria-live="polite">
              {!searchQuery
                ? ''
                : matches.length > 0
                  ? `${activeMatchIdx + 1} / ${matches.length}${searching ? '…' : ''}`
                  : searching
                    ? t('pdf.rd.searching')
                    : t('pdf.rd.zeroMatches')}
            </span>
            <button
              type="button"
              className={rStyles.toolBtnIcon}
              aria-label={t('pdf.rd.prevMatchAria')}
              title={t('pdf.rd.prevMatchTitle')}
              disabled={matches.length === 0}
              onClick={() => navigateMatch(-1)}
            >
              ↑
            </button>
            <button
              type="button"
              className={rStyles.toolBtnIcon}
              aria-label={t('pdf.rd.nextMatchAria')}
              title={t('pdf.rd.nextMatchTitle')}
              disabled={matches.length === 0}
              onClick={() => navigateMatch(1)}
            >
              ↓
            </button>
            <button
              type="button"
              className={rStyles.toolBtnIcon}
              aria-label={t('pdf.rd.closeSearchAria')}
              title={t('pdf.rd.closeSearchTitle')}
              onClick={closeSearch}
            >
              ×
            </button>
          </div>
        )}

        {/* Body: Collapsible Sidebar + Virtualised Page Viewport */}
        <div className={rStyles.body}>
          {sidebarOpen && (
            <>
              <button
                type="button"
                className={rStyles.sidebarBackdrop}
                aria-label={t('pdf.rd.closeSidebarAria')}
                onClick={() => setSidebarOpen(false)}
              />
              <aside className={rStyles.sidebar} aria-label={t('pdf.rd.sidebarAria')}>
                <div className={rStyles.sidebarTabs} role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sidebarTab === 'thumbnails'}
                    className={[
                      rStyles.sidebarTab,
                      sidebarTab === 'thumbnails' ? rStyles.sidebarTabActive : '',
                    ].join(' ')}
                    onClick={() => setSidebarTab('thumbnails')}
                  >
                    {t('pdf.rd.tabThumbs')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sidebarTab === 'contents'}
                    className={[
                      rStyles.sidebarTab,
                      sidebarTab === 'contents' ? rStyles.sidebarTabActive : '',
                    ].join(' ')}
                    onClick={() => setSidebarTab('contents')}
                  >
                    {t('pdf.rd.tabContents')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={sidebarTab === 'info'}
                    className={[
                      rStyles.sidebarTab,
                      sidebarTab === 'info' ? rStyles.sidebarTabActive : '',
                    ].join(' ')}
                    onClick={() => setSidebarTab('info')}
                  >
                    {t('pdf.rd.tabInfo')}
                  </button>
                </div>

                <div className={rStyles.sidebarContent}>
                  {sidebarTab === 'thumbnails' && (
                    <ul className={rStyles.thumbList}>
                      {Array.from({ length: numPages }, (_, i) => (
                        <SidebarThumb
                          key={`${docId}-t-${i}`}
                          pool={pool}
                          pageIndex={i}
                          active={currentPage === i + 1}
                          onSelect={handleSidebarJump}
                        />
                      ))}
                    </ul>
                  )}

                  {sidebarTab === 'contents' && (
                    !outlineLoaded ? (
                      <div className={rStyles.emptyTab}>{t('pdf.rd.loadingToc')}</div>
                    ) : outline.length === 0 ? (
                      <div className={rStyles.emptyTab}>{t('pdf.rd.noToc')}</div>
                    ) : (
                      <OutlineTree nodes={outline} onJump={handleSidebarJump} />
                    )
                  )}

                  {sidebarTab === 'info' && (
                    <div className={rStyles.infoSection}>
                      <dl className={rStyles.infoList}>
                        <div className={rStyles.infoItem}>
                          <dt>{t('pdf.rd.infoFile')}</dt>
                          <dd>{fileName}</dd>
                        </div>
                        <div className={rStyles.infoItem}>
                          <dt>{t('pdf.rd.infoSize')}</dt>
                          <dd>{formatBytes(bytes.byteLength)}</dd>
                        </div>
                        <div className={rStyles.infoItem}>
                          <dt>{t('pdf.rd.infoPages')}</dt>
                          <dd>{numPages}</dd>
                        </div>
                        {docInfo?.pageWidthPt && docInfo?.pageHeightPt && (
                          <div className={rStyles.infoItem}>
                            <dt>{t('pdf.rd.infoPageSize')}</dt>
                            <dd>{formatPageDimensions(docInfo.pageWidthPt, docInfo.pageHeightPt)}</dd>
                          </div>
                        )}
                        {docInfo?.pdfVersion && (
                          <div className={rStyles.infoItem}>
                            <dt>{t('pdf.rd.infoPdfVer')}</dt>
                            <dd>{docInfo.pdfVersion}</dd>
                          </div>
                        )}
                        {docInfo?.title && (
                          <div className={rStyles.infoItem}>
                            <dt>{t('pdf.rd.infoTitle')}</dt>
                            <dd>{docInfo.title}</dd>
                          </div>
                        )}
                        {docInfo?.author && (
                          <div className={rStyles.infoItem}>
                            <dt>{t('pdf.rd.infoAuthor')}</dt>
                            <dd>{docInfo.author}</dd>
                          </div>
                        )}
                        {docInfo?.subject && (
                          <div className={rStyles.infoItem}>
                            <dt>{t('pdf.rd.infoSubject')}</dt>
                            <dd>{docInfo.subject}</dd>
                          </div>
                        )}
                        {docInfo?.creator && (
                          <div className={rStyles.infoItem}>
                            <dt>{t('pdf.rd.infoCreator')}</dt>
                            <dd>{docInfo.creator}</dd>
                          </div>
                        )}
                        {docInfo?.producer && (
                          <div className={rStyles.infoItem}>
                            <dt>{t('pdf.rd.infoProducer')}</dt>
                            <dd>{docInfo.producer}</dd>
                          </div>
                        )}
                      </dl>
                      <hr className={rStyles.infoDivider} />
                      <ContinueWith currentToolId="reader" files={handoffFiles} />
                    </div>
                  )}
                </div>
              </aside>
            </>
          )}

          {/* Page Viewport */}
          <div ref={viewportRef} className={rStyles.viewport} tabIndex={0} aria-label={t('pdf.rd.pagesAria')}>
            <div className={effectiveViewMode === 'two-page' ? rStyles.spreadRow : rStyles.pageColumn}>
              {pagesToRenderList.map((pageNum) => {
                const baseDims = pageDimsMap.get(pageNum) ?? defaultDims;
                const rotDims = rotatedDims(baseDims, extraRotation);
                const displayWidth = Math.max(1, Math.round(rotDims.width * effectiveScale));
                const displayHeight = Math.max(1, Math.round(rotDims.height * effectiveScale));
                const pageMatches = searchOpen && searchQuery ? (matchesByPage.get(pageNum) ?? EMPTY_MATCHES) : EMPTY_MATCHES;

                return (
                  <ReaderPageView
                    key={`${docId}-p-${pageNum}`}
                    doc={doc}
                    pageNumber={pageNum}
                    width={displayWidth}
                    height={displayHeight}
                    scale={effectiveScale}
                    extraRotation={extraRotation}
                    darkPaper={darkPaper}
                    shouldRender={activeRenderPages.has(pageNum)}
                    pageMatches={pageMatches}
                    activeMatchIdx={activeMatchIdx}
                    slotRef={setSlotRef}
                    onMeasure={handleMeasurePage}
                    onCacheText={handleCachePageText}
                    onInternalDest={handleInternalDest}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </DropTarget>
    </div>
  );
}

const EMPTY_MATCHES: PageMatchSpan[] = [];

// Lazily rendered sidebar thumbnail item using PdfThumbPool + IntersectionObserver.
const SidebarThumb = React.memo(function SidebarThumb({
  pool,
  pageIndex,
  active,
  onSelect,
}: {
  pool: PdfThumbPool;
  pageIndex: number;
  active: boolean;
  onSelect: (pageNumber: number) => void;
}) {
  const { t } = useI18n();
  const ref = React.useRef<HTMLLIElement>(null);
  const visibleRef = React.useRef(false);
  const [url, setUrl] = React.useState<string | null>(() => pool.getCached(pageIndex));

  React.useEffect(() => {
    setUrl(pool.getCached(pageIndex));
    const unsub = pool.subscribe(pageIndex, (nextUrl) => setUrl(nextUrl));
    return unsub;
  }, [pool, pageIndex]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      visibleRef.current = true;
      void pool.request(pageIndex, () => visibleRef.current);
      return () => {
        visibleRef.current = false;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        const isVis = entries.some((e) => e.isIntersecting);
        visibleRef.current = isVis;
        if (isVis) {
          void pool.request(pageIndex, () => visibleRef.current);
        }
      },
      { rootMargin: '200px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => {
      visibleRef.current = false;
      io.disconnect();
    };
  }, [pool, pageIndex]);

  React.useEffect(() => {
    if (active && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest' });
    }
  }, [active]);

  return (
    <li ref={ref}>
      <button
        type="button"
        className={[rStyles.thumbButton, active ? rStyles.thumbButtonActive : ''].join(' ')}
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect(pageIndex + 1)}
      >
        <div className={rStyles.thumbBox}>
          {url ? (
            <img src={url} alt={t('pdf.rd.thumbAlt', { n: pageIndex + 1 })} />
          ) : (
            <span className={rStyles.thumbPlaceholder}>{t('pdf.ff.pageN', { n: pageIndex + 1 })}</span>
          )}
        </div>
        <span>{pageIndex + 1}</span>
      </button>
    </li>
  );
});

// Recursive outline / table of contents tree.
function OutlineTree({
  nodes,
  onJump,
  nested = false,
}: {
  nodes: OutlineNode[];
  onJump: (pageNumber: number) => void;
  nested?: boolean;
}) {
  return (
    <ul className={nested ? rStyles.outlineNested : rStyles.outlineList}>
      {nodes.map((node) => (
        <OutlineBranch key={node.id} node={node} onJump={onJump} />
      ))}
    </ul>
  );
}

function OutlineBranch({
  node,
  onJump,
}: {
  node: OutlineNode;
  onJump: (pageNumber: number) => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = React.useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div className={rStyles.outlineRow}>
        {hasChildren ? (
          <button
            type="button"
            className={rStyles.outlineToggle}
            aria-label={expanded ? t('pdf.rd.collapseSec') : t('pdf.rd.expandSec')}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className={rStyles.outlineSpacer} aria-hidden />
        )}

        {node.url && node.pageNumber === null ? (
          <a
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
            className={rStyles.outlineBtn}
          >
            <span className={rStyles.outlineBtnTitle}>{node.title}</span>
          </a>
        ) : (
          <button
            type="button"
            className={rStyles.outlineBtn}
            disabled={node.pageNumber === null}
            onClick={() => {
              if (node.pageNumber !== null) onJump(node.pageNumber);
            }}
          >
            <span className={rStyles.outlineBtnTitle}>{node.title}</span>
            {node.pageNumber !== null && (
              <span className={rStyles.outlinePageNum}>{node.pageNumber}</span>
            )}
          </button>
        )}
      </div>

      {hasChildren && expanded && (
        <OutlineTree nodes={node.children} onJump={onJump} nested />
      )}
    </li>
  );
}

// Single virtualised page slot: HiDPI canvas + selectable text layer + search highlights + link annotations.
const ReaderPageView = React.memo(function ReaderPageView({
  doc,
  pageNumber,
  width,
  height,
  scale,
  extraRotation,
  darkPaper,
  shouldRender,
  pageMatches,
  activeMatchIdx,
  slotRef,
  onMeasure,
  onCacheText,
  onInternalDest,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  extraRotation: ExtraRotation;
  darkPaper: boolean;
  shouldRender: boolean;
  pageMatches: readonly PageMatchSpan[];
  activeMatchIdx: number;
  slotRef: (pageNumber: number, el: HTMLDivElement | null) => void;
  onMeasure: (pageNumber: number, width: number, height: number) => void;
  onCacheText: (pageNumber: number, fullText: string) => void;
  onInternalDest: (dest: unknown) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = React.useState(false);
  const [textItems, setTextItems] = React.useState<PositionedTextItem[]>([]);
  const [links, setLinks] = React.useState<PageLinkItem[]>([]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!shouldRender) {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      setRendered(false);
      setTextItems([]);
      setLinks([]);
      return;
    }

    let cancelled = false;
    let renderTask: ReturnType<PDFPageProxy['render']> | null = null;
    let activePage: PDFPageProxy | null = null;

    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) {
          page.cleanup();
          return;
        }
        activePage = page;

        // Report base scale=1 dimensions for accurate layout across mixed-size documents
        const baseVp = page.getViewport({ scale: 1 });
        onMeasure(pageNumber, baseVp.width, baseVp.height);

        const totalRotation = (page.rotate + extraRotation) % 360;
        const cssVp = page.getViewport({ scale, rotation: totalRotation });
        const rawDpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
        const rawPixels = cssVp.width * rawDpr * (cssVp.height * rawDpr);
        const safeDpr =
          rawPixels > MAX_CANVAS_PIXELS ? rawDpr * Math.sqrt(MAX_CANVAS_PIXELS / rawPixels) : rawDpr;
        const renderVp = page.getViewport({ scale: scale * safeDpr, rotation: totalRotation });

        const targetCanvas = canvasRef.current;
        if (!targetCanvas || cancelled) return;

        targetCanvas.width = Math.max(1, Math.round(renderVp.width));
        targetCanvas.height = Math.max(1, Math.round(renderVp.height));
        targetCanvas.style.width = `${cssVp.width}px`;
        targetCanvas.style.height = `${cssVp.height}px`;

        renderTask = page.render({
          canvas: targetCanvas,
          viewport: renderVp,
          background: '#ffffff',
        });
        await renderTask.promise;
        if (cancelled) return;
        setRendered(true);

        const [textData, pageLinks] = await Promise.all([
          extractPageTextLayout(page, scale, extraRotation),
          extractPageLinks(page, scale, extraRotation),
        ]);
        if (cancelled) return;

        onCacheText(pageNumber, textData.fullText);
        setTextItems(textData.items);
        setLinks(pageLinks);
      } catch (e) {
        if (!cancelled && (e as { name?: string })?.name !== 'RenderingCancelledException') {
          // Ignore benign cancellations; keep placeholder on unexpected page errors.
        }
      } finally {
        if (activePage) {
          activePage.cleanup();
          activePage = null;
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // Already finished or cancelled
        }
      }
    };
  }, [doc, pageNumber, scale, extraRotation, shouldRender, onMeasure, onCacheText]);

  // Ensure canvas memory is zeroed on unmount
  React.useEffect(() => {
    const canvas = canvasRef.current;
    return () => {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, []);

  const refCallback = React.useCallback(
    (el: HTMLDivElement | null) => {
      slotRef(pageNumber, el);
    },
    [slotRef, pageNumber],
  );

  return (
    <div
      ref={refCallback}
      data-page={pageNumber}
      className={[rStyles.pageSlot, darkPaper ? rStyles.pageSlotDark : ''].join(' ')}
      style={{ width, height }}
    >
      <canvas
        ref={canvasRef}
        className={[rStyles.pageCanvas, darkPaper ? rStyles.pageCanvasDark : ''].join(' ')}
        aria-label={t('pdf.ff.pageN', { n: pageNumber })}
      />
      {!rendered && <div className={rStyles.pagePlaceholder}>{t('pdf.ff.pageN', { n: pageNumber })}</div>}

      {/* Selectable Text Layer + Search Highlights */}
      {shouldRender && textItems.length > 0 && (
        <div className={rStyles.textLayer}>
          {textItems.map((item, idx) => {
            const measured = measureTextWidth(item.str, item.fontSize, item.fontFamily);
            let scaleX = 1;
            if (item.targetWidth > 0 && measured > 0.5) {
              scaleX = Math.max(0.2, Math.min(4, item.targetWidth / measured));
            }
            const transform =
              Math.abs(item.angle) > 0.001
                ? `rotate(${item.angle}rad) scaleX(${scaleX.toFixed(4)})`
                : Math.abs(scaleX - 1) > 0.01
                  ? `scaleX(${scaleX.toFixed(4)})`
                  : undefined;

            const segments = splitItemWithMatches(item, pageMatches);

            return (
              <span
                key={idx}
                className={rStyles.textSpan}
                style={{
                  left: item.left,
                  top: item.top,
                  fontSize: item.fontSize,
                  fontFamily: item.fontFamily,
                  transform,
                }}
              >
                {segments.length === 1 && segments[0].matchIndex === null
                  ? segments[0].text
                  : segments.map((seg, sIdx) =>
                      seg.matchIndex === null ? (
                        <React.Fragment key={sIdx}>{seg.text}</React.Fragment>
                      ) : (
                        <mark
                          key={sIdx}
                          className={
                            seg.matchIndex === activeMatchIdx
                              ? rStyles.searchMarkActive
                              : rStyles.searchMark
                          }
                          data-active-match={seg.matchIndex === activeMatchIdx ? 'true' : undefined}
                        >
                          {seg.text}
                        </mark>
                      ),
                    )}
              </span>
            );
          })}
        </div>
      )}

      {/* Link Annotations Layer */}
      {shouldRender && links.length > 0 && (
        <div className={rStyles.annotationLayer}>
          {links.map((link) =>
            link.url ? (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={rStyles.linkAnnot}
                title={link.title}
                aria-label={link.title}
                style={{
                  left: link.left,
                  top: link.top,
                  width: link.width,
                  height: link.height,
                }}
              />
            ) : (
              <button
                key={link.id}
                type="button"
                className={rStyles.linkAnnot}
                title={link.title}
                aria-label={link.title}
                style={{
                  left: link.left,
                  top: link.top,
                  width: link.width,
                  height: link.height,
                }}
                onClick={() => void onInternalDest(link.dest)}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
});
