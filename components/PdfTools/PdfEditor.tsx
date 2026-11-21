import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import {
  computeArrowGeometry,
  PdfEditFont,
  PdfEditItem,
  PdfEditTextItem,
} from '../../lib/pdf/editPdf';
import { renderPage } from '../../lib/pdf/pdfjs';
import styles from '../../styles/PdfTools.module.css';

export type EditorTool =
  | 'select'
  | 'text'
  | 'highlight'
  | 'ink'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'image';

export interface EditorStyleDefaults {
  color: string;
  highlightColor: string;
  strokeColor: string;
  fillColor: string | null;
  textBgColor: string | null;
  strokeWidth: number;
  opacity: number;
  highlightOpacity: number;
  font: PdfEditFont;
  fontSize: number;
}

type CornerHandle = 'nw' | 'ne' | 'se' | 'sw';
type EndpointHandle = 'p1' | 'p2';

interface PdfEditorProps {
  doc: PDFDocumentProxy | null;
  pageIndex: number;
  zoom: number;
  activeTool: EditorTool;
  defaults: EditorStyleDefaults;
  items: PdfEditItem[];
  assetPreviews: Record<string, string>;
  hasArmedImage: boolean;
  selectedId: string | null;
  autoEditId: string | null;
  onConsumeAutoEdit: () => void;
  onSelect: (id: string | null) => void;
  onCreateItem: (item: PdfEditItem, openInlineText?: boolean) => void;
  onPlaceTextAt: (normX: number, normY: number) => void;
  onPlaceImageAt: (normX: number, normY: number) => void;
  onLiveChange: (id: string, patch: Partial<PdfEditItem>) => void;
  onCommitChange: (id: string, patch: Partial<PdfEditItem>) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onPageSize?: (size: { width: number; height: number }) => void;
}

type DraftShape =
  | { kind: 'highlight'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'ellipse'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'arrow'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'ink'; points: Array<{ x: number; y: number }> };

type PointerInteraction =
  | {
      mode: 'draw';
      pointerId: number;
      tool: 'highlight' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'ink';
      startX: number;
      startY: number;
    }
  | {
      mode: 'move-box';
      id: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      origLeft: number;
      origTop: number;
      width: number;
      height: number;
      moved: boolean;
    }
  | {
      mode: 'resize-box';
      id: string;
      corner: CornerHandle;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      origLeft: number;
      origTop: number;
      origWidth: number;
      origHeight: number;
      moved: boolean;
    }
  | {
      mode: 'move-line';
      id: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      moved: boolean;
    }
  | {
      mode: 'drag-endpoint';
      id: string;
      endpoint: EndpointHandle;
      pointerId: number;
      moved: boolean;
    }
  | {
      mode: 'move-ink';
      id: string;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      origPoints: Array<{ x: number; y: number }>;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      moved: boolean;
    }
  | {
      mode: 'resize-ink';
      id: string;
      corner: CornerHandle;
      pointerId: number;
      startClientX: number;
      startClientY: number;
      origPoints: Array<{ x: number; y: number }>;
      origLeft: number;
      origTop: number;
      origWidth: number;
      origHeight: number;
      moved: boolean;
    };

const CORNERS: Array<{ corner: CornerHandle; className: string; label: string }> = [
  { corner: 'nw', className: styles.signHandleNw, label: 'Resize top-left corner' },
  { corner: 'ne', className: styles.signHandleNe, label: 'Resize top-right corner' },
  { corner: 'se', className: styles.signHandleSe, label: 'Resize bottom-right corner' },
  { corner: 'sw', className: styles.signHandleSw, label: 'Resize bottom-left corner' },
];

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function makeEditId(): string {
  return `ed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function cssFontForEdit(font: PdfEditFont): React.CSSProperties {
  switch (font) {
    case 'helvetica-bold':
      return { fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 700, fontStyle: 'normal' };
    case 'times':
      return { fontFamily: "'Times New Roman', Georgia, serif", fontWeight: 400, fontStyle: 'normal' };
    case 'times-bold':
      return { fontFamily: "'Times New Roman', Georgia, serif", fontWeight: 700, fontStyle: 'normal' };
    case 'courier':
      return { fontFamily: "'Courier New', Courier, monospace", fontWeight: 400, fontStyle: 'normal' };
    case 'helvetica':
    default:
      return { fontFamily: 'Helvetica, Arial, sans-serif', fontWeight: 400, fontStyle: 'normal' };
  }
}

function getInkBounds(points: Array<{ x: number; y: number }>): {
  left: number;
  top: number;
  width: number;
  height: number;
  rawMinX: number;
  rawMinY: number;
  rawMaxX: number;
  rawMaxY: number;
} {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const pt of points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }
  const pad = 0.012;
  const left = clamp(minX - pad, 0, 0.96);
  const top = clamp(minY - pad, 0, 0.96);
  const right = clamp(maxX + pad, left + 0.03, 1);
  const bottom = clamp(maxY + pad, top + 0.03, 1);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    rawMinX: minX,
    rawMinY: minY,
    rawMaxX: maxX,
    rawMaxY: maxY,
  };
}

function toolHintLabel(tool: EditorTool, hasArmedImage: boolean): string | null {
  switch (tool) {
    case 'text':
      return 'Click anywhere on the page to place a text box';
    case 'highlight':
      return 'Drag across the page to add a highlight';
    case 'ink':
      return 'Draw freely on the page';
    case 'rect':
      return 'Drag to draw a rectangle';
    case 'ellipse':
      return 'Drag to draw an ellipse';
    case 'line':
      return 'Drag to draw a straight line';
    case 'arrow':
      return 'Drag from tail to head to draw an arrow';
    case 'image':
      return hasArmedImage
        ? 'Click anywhere on the page to place the image'
        : 'Upload an image from the sidebar to place it on the page';
    case 'select':
    default:
      return null;
  }
}

export function PdfEditor({
  doc,
  pageIndex,
  zoom,
  activeTool,
  defaults,
  items,
  assetPreviews,
  hasArmedImage,
  selectedId,
  autoEditId,
  onConsumeAutoEdit,
  onSelect,
  onCreateItem,
  onPlaceTextAt,
  onPlaceImageAt,
  onLiveChange,
  onCommitChange,
  onDuplicate,
  onDelete,
  onPageSize,
}: PdfEditorProps) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const interactionRef = React.useRef<PointerInteraction | null>(null);
  const latestPatchRef = React.useRef<{ id: string; patch: Partial<PdfEditItem> } | null>(null);
  const draftRef = React.useRef<DraftShape | null>(null);

  const [stageWidth, setStageWidth] = React.useState(640);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number }>({
    width: 595.28,
    height: 841.89,
  });
  const [rendering, setRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<DraftShape | null>(null);
  const [editingTextId, setEditingTextId] = React.useState<string | null>(null);
  const [editingTextValue, setEditingTextValue] = React.useState('');

  const pageItems = React.useMemo(
    () => items.filter((item) => item.pageIndex === pageIndex),
    [items, pageIndex],
  );

  // Measure available inner width of stage container.
  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const inner = Math.max(200, Math.floor(el.clientWidth - padX));
      setStageWidth((prev) => (Math.abs(prev - inner) > 2 ? inner : prev));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Automatically open inline text editing for newly placed text boxes.
  React.useEffect(() => {
    if (!autoEditId) return;
    const item = pageItems.find((it): it is PdfEditTextItem => it.id === autoEditId && it.kind === 'text');
    if (item) {
      setEditingTextId(item.id);
      setEditingTextValue(item.text);
      onConsumeAutoEdit();
    }
  }, [autoEditId, pageItems, onConsumeAutoEdit]);

  // Close inline text editing when selection leaves or page changes.
  React.useEffect(() => {
    if (editingTextId && editingTextId !== selectedId) {
      setEditingTextId(null);
    }
  }, [selectedId, editingTextId]);

  React.useEffect(() => {
    setEditingTextId(null);
    setDraft(null);
    draftRef.current = null;
  }, [pageIndex]);

  const cssWidth = Math.max(200, Math.round((stageWidth - 4) * zoom));
  const cssHeight = Math.max(120, Math.round((cssWidth * pageSize.height) / Math.max(1, pageSize.width)));

  // Debounce canvas rerender slightly on resize/zoom changes so layout stays snappy.
  const [renderCssWidth, setRenderCssWidth] = React.useState(cssWidth);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setRenderCssWidth(cssWidth), 90);
    return () => window.clearTimeout(timer);
  }, [cssWidth]);

  // Render HiDPI PDF page onto canvas.
  React.useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    setRendering(true);
    setRenderError(null);

    (async () => {
      try {
        const page = await doc.getPage(pageIndex + 1);
        if (cancelled) return;
        const baseVp = page.getViewport({ scale: 1 });
        const nextSize = { width: baseVp.width, height: baseVp.height };
        setPageSize(nextSize);
        onPageSize?.(nextSize);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (renderCssWidth * dpr) / Math.max(1, baseVp.width);
        const rendered = await renderPage(page, scale);
        if (cancelled) return;

        const target = canvasRef.current;
        if (!target) return;
        target.width = rendered.width;
        target.height = rendered.height;
        const ctx = target.getContext('2d');
        if (ctx) ctx.drawImage(rendered, 0, 0);
      } catch (e) {
        if (!cancelled) {
          setRenderError(e instanceof Error ? e.message : 'Could not render this page.');
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, pageIndex, renderCssWidth, onPageSize]);

  const clientToNorm = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = overlayRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const commitInlineText = React.useCallback(
    (id: string, nextValue: string) => {
      setEditingTextId(null);
      onCommitChange(id, { text: nextValue } as Partial<PdfEditItem>);
    },
    [onCommitChange],
  );

  // Overlay background pointer down: place text/image, draw shape/highlight/ink, or deselect.
  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (e.target !== overlayRef.current) return;

    const pt = clientToNorm(e.clientX, e.clientY);
    if (!pt) return;

    if (activeTool === 'select') {
      onSelect(null);
      return;
    }

    if (activeTool === 'text') {
      e.preventDefault();
      onPlaceTextAt(pt.x, pt.y);
      return;
    }

    if (activeTool === 'image') {
      e.preventDefault();
      if (hasArmedImage) onPlaceImageAt(pt.x, pt.y);
      return;
    }

    // Drawing tools: highlight, rect, ellipse, line, arrow, ink.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: 'draw',
      pointerId: e.pointerId,
      tool: activeTool,
      startX: pt.x,
      startY: pt.y,
    };

    let initialDraft: DraftShape;
    if (activeTool === 'ink') {
      initialDraft = { kind: 'ink', points: [pt] };
    } else if (activeTool === 'line' || activeTool === 'arrow') {
      initialDraft = { kind: activeTool, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
    } else {
      initialDraft = { kind: activeTool, x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y };
    }
    draftRef.current = initialDraft;
    setDraft(initialDraft);
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const inter = interactionRef.current;
    if (!inter || inter.pointerId !== e.pointerId) return;

    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (inter.mode === 'draw') {
      const pt = {
        x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
      };
      const prev = draftRef.current;
      if (!prev) return;
      let next: DraftShape;
      if (prev.kind === 'ink') {
        const last = prev.points[prev.points.length - 1];
        if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 0.0025) return;
        next = { kind: 'ink', points: [...prev.points, pt] };
      } else if (prev.kind === 'line' || prev.kind === 'arrow') {
        next = { ...prev, x2: pt.x, y2: pt.y };
      } else {
        next = { ...prev, x1: pt.x, y1: pt.y };
      }
      draftRef.current = next;
      setDraft(next);
      return;
    }

    if (inter.mode === 'move-box') {
      const dx = (e.clientX - inter.startClientX) / rect.width;
      const dy = (e.clientY - inter.startClientY) / rect.height;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) inter.moved = true;
      const left = clamp(inter.origLeft + dx, 0, Math.max(0, 1 - inter.width));
      const top = clamp(inter.origTop + dy, 0, Math.max(0, 1 - inter.height));
      const patch = { left, top } as Partial<PdfEditItem>;
      latestPatchRef.current = { id: inter.id, patch };
      onLiveChange(inter.id, patch);
      return;
    }

    if (inter.mode === 'resize-box') {
      const dx = (e.clientX - inter.startClientX) / rect.width;
      const dy = (e.clientY - inter.startClientY) / rect.height;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) inter.moved = true;

      let left = inter.origLeft;
      let top = inter.origTop;
      let right = inter.origLeft + inter.origWidth;
      let bottom = inter.origTop + inter.origHeight;
      const minW = 0.02;
      const minH = 0.015;

      if (inter.corner === 'nw' || inter.corner === 'sw') {
        left = clamp(inter.origLeft + dx, 0, right - minW);
      } else {
        right = clamp(inter.origLeft + inter.origWidth + dx, left + minW, 1);
      }
      if (inter.corner === 'nw' || inter.corner === 'ne') {
        top = clamp(inter.origTop + dy, 0, bottom - minH);
      } else {
        bottom = clamp(inter.origTop + inter.origHeight + dy, top + minH, 1);
      }

      const patch = {
        left,
        top,
        width: right - left,
        height: bottom - top,
      } as Partial<PdfEditItem>;
      latestPatchRef.current = { id: inter.id, patch };
      onLiveChange(inter.id, patch);
      return;
    }

    if (inter.mode === 'move-line') {
      const dx = (e.clientX - inter.startClientX) / rect.width;
      const dy = (e.clientY - inter.startClientY) / rect.height;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) inter.moved = true;

      const minX = Math.min(inter.x1, inter.x2);
      const maxX = Math.max(inter.x1, inter.x2);
      const minY = Math.min(inter.y1, inter.y2);
      const maxY = Math.max(inter.y1, inter.y2);
      const cdx = clamp(dx, -minX, 1 - maxX);
      const cdy = clamp(dy, -minY, 1 - maxY);

      const patch = {
        x1: inter.x1 + cdx,
        y1: inter.y1 + cdy,
        x2: inter.x2 + cdx,
        y2: inter.y2 + cdy,
      } as Partial<PdfEditItem>;
      latestPatchRef.current = { id: inter.id, patch };
      onLiveChange(inter.id, patch);
      return;
    }

    if (inter.mode === 'drag-endpoint') {
      const pt = {
        x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
      };
      inter.moved = true;
      const patch = (
        inter.endpoint === 'p1' ? { x1: pt.x, y1: pt.y } : { x2: pt.x, y2: pt.y }
      ) as Partial<PdfEditItem>;
      latestPatchRef.current = { id: inter.id, patch };
      onLiveChange(inter.id, patch);
      return;
    }

    if (inter.mode === 'move-ink') {
      const dx = (e.clientX - inter.startClientX) / rect.width;
      const dy = (e.clientY - inter.startClientY) / rect.height;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) inter.moved = true;
      const cdx = clamp(dx, -inter.minX, 1 - inter.maxX);
      const cdy = clamp(dy, -inter.minY, 1 - inter.maxY);
      const points = inter.origPoints.map((p) => ({ x: p.x + cdx, y: p.y + cdy }));
      const patch = { points } as Partial<PdfEditItem>;
      latestPatchRef.current = { id: inter.id, patch };
      onLiveChange(inter.id, patch);
      return;
    }

    if (inter.mode === 'resize-ink') {
      const dx = (e.clientX - inter.startClientX) / rect.width;
      const dy = (e.clientY - inter.startClientY) / rect.height;
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) inter.moved = true;

      let left = inter.origLeft;
      let top = inter.origTop;
      let right = inter.origLeft + inter.origWidth;
      let bottom = inter.origTop + inter.origHeight;
      const minW = 0.025;
      const minH = 0.025;

      if (inter.corner === 'nw' || inter.corner === 'sw') {
        left = clamp(inter.origLeft + dx, 0, right - minW);
      } else {
        right = clamp(inter.origLeft + inter.origWidth + dx, left + minW, 1);
      }
      if (inter.corner === 'nw' || inter.corner === 'ne') {
        top = clamp(inter.origTop + dy, 0, bottom - minH);
      } else {
        bottom = clamp(inter.origTop + inter.origHeight + dy, top + minH, 1);
      }

      const newW = right - left;
      const newH = bottom - top;
      const origW = Math.max(0.001, inter.origWidth);
      const origH = Math.max(0.001, inter.origHeight);

      const points = inter.origPoints.map((p) => ({
        x: clamp(left + ((p.x - inter.origLeft) / origW) * newW, 0, 1),
        y: clamp(top + ((p.y - inter.origTop) / origH) * newH, 0, 1),
      }));
      const patch = { points } as Partial<PdfEditItem>;
      latestPatchRef.current = { id: inter.id, patch };
      onLiveChange(inter.id, patch);
    }
  };

  const finishInteraction = (e: React.PointerEvent<HTMLDivElement>) => {
    const inter = interactionRef.current;
    if (!inter || inter.pointerId !== e.pointerId) return;
    interactionRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore if capture already released
    }

    if (inter.mode === 'draw') {
      const currentDraft = draftRef.current;
      draftRef.current = null;
      setDraft(null);
      if (!currentDraft) return;

      if (currentDraft.kind === 'ink') {
        if (currentDraft.points.length === 0) return;
        onCreateItem({
          id: makeEditId(),
          pageIndex,
          kind: 'ink',
          points: currentDraft.points,
          strokeColor: defaults.strokeColor,
          strokeWidth: defaults.strokeWidth,
          opacity: defaults.opacity,
        });
        return;
      }

      if (currentDraft.kind === 'line' || currentDraft.kind === 'arrow') {
        const dist = Math.hypot(currentDraft.x2 - currentDraft.x1, currentDraft.y2 - currentDraft.y1);
        if (dist < 0.01) return;
        onCreateItem({
          id: makeEditId(),
          pageIndex,
          kind: currentDraft.kind,
          x1: currentDraft.x1,
          y1: currentDraft.y1,
          x2: currentDraft.x2,
          y2: currentDraft.y2,
          strokeColor: defaults.strokeColor,
          strokeWidth: defaults.strokeWidth,
          opacity: defaults.opacity,
        });
        return;
      }

      // Highlight, Rect, Ellipse
      let left = Math.min(currentDraft.x0, currentDraft.x1);
      let top = Math.min(currentDraft.y0, currentDraft.y1);
      let width = Math.abs(currentDraft.x1 - currentDraft.x0);
      let height = Math.abs(currentDraft.y1 - currentDraft.y0);

      // Provide a friendly default size if user clicked instead of dragging far.
      if (width < 0.012 && height < 0.012) {
        if (currentDraft.kind === 'highlight') {
          width = 0.24;
          height = 0.032;
        } else {
          width = 0.18;
          height = 0.1;
        }
        left = clamp(left - width / 2, 0, 1 - width);
        top = clamp(top - height / 2, 0, 1 - height);
      } else {
        width = Math.max(0.012, width);
        height = Math.max(0.01, height);
        left = clamp(left, 0, 1 - width);
        top = clamp(top, 0, 1 - height);
      }

      if (currentDraft.kind === 'highlight') {
        onCreateItem({
          id: makeEditId(),
          pageIndex,
          kind: 'highlight',
          left,
          top,
          width,
          height,
          color: defaults.highlightColor,
          opacity: defaults.highlightOpacity,
        });
      } else {
        onCreateItem({
          id: makeEditId(),
          pageIndex,
          kind: currentDraft.kind,
          left,
          top,
          width,
          height,
          strokeColor: defaults.strokeColor,
          strokeWidth: defaults.strokeWidth,
          fillColor: defaults.fillColor,
          opacity: defaults.opacity,
        });
      }
      return;
    }

    const latest = latestPatchRef.current;
    latestPatchRef.current = null;
    if (inter.moved && latest) {
      onCommitChange(latest.id, latest.patch);
    }
  };

  // Start dragging a box item (text, highlight, rect, ellipse, image).
  const startBoxMove = (
    e: React.PointerEvent<HTMLDivElement>,
    item: Extract<PdfEditItem, { left: number; top: number; width: number; height: number }>,
  ) => {
    if (e.button !== 0 || activeTool !== 'select' || editingTextId === item.id) return;
    e.stopPropagation();
    onSelect(item.id);
    overlayRef.current?.setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: 'move-box',
      id: item.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLeft: item.left,
      origTop: item.top,
      width: item.width,
      height: item.height,
      moved: false,
    };
  };

  const startBoxResize = (
    e: React.PointerEvent<HTMLSpanElement>,
    item: Extract<PdfEditItem, { left: number; top: number; width: number; height: number }>,
    corner: CornerHandle,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(item.id);
    overlayRef.current?.setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: 'resize-box',
      id: item.id,
      corner,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origLeft: item.left,
      origTop: item.top,
      origWidth: item.width,
      origHeight: item.height,
      moved: false,
    };
  };

  const startLineMove = (
    e: React.PointerEvent<HTMLDivElement>,
    item: Extract<PdfEditItem, { kind: 'line' | 'arrow' }>,
  ) => {
    if (e.button !== 0 || activeTool !== 'select') return;
    e.stopPropagation();
    onSelect(item.id);
    overlayRef.current?.setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: 'move-line',
      id: item.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      x1: item.x1,
      y1: item.y1,
      x2: item.x2,
      y2: item.y2,
      moved: false,
    };
  };

  const startEndpointDrag = (
    e: React.PointerEvent<HTMLSpanElement>,
    item: Extract<PdfEditItem, { kind: 'line' | 'arrow' }>,
    endpoint: EndpointHandle,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(item.id);
    overlayRef.current?.setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: 'drag-endpoint',
      id: item.id,
      endpoint,
      pointerId: e.pointerId,
      moved: false,
    };
  };

  const startInkMove = (
    e: React.PointerEvent<HTMLDivElement>,
    item: Extract<PdfEditItem, { kind: 'ink' }>,
  ) => {
    if (e.button !== 0 || activeTool !== 'select') return;
    e.stopPropagation();
    onSelect(item.id);
    const bounds = getInkBounds(item.points);
    overlayRef.current?.setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: 'move-ink',
      id: item.id,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPoints: item.points,
      minX: bounds.rawMinX,
      minY: bounds.rawMinY,
      maxX: bounds.rawMaxX,
      maxY: bounds.rawMaxY,
      moved: false,
    };
  };

  const startInkResize = (
    e: React.PointerEvent<HTMLSpanElement>,
    item: Extract<PdfEditItem, { kind: 'ink' }>,
    corner: CornerHandle,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect(item.id);
    const bounds = getInkBounds(item.points);
    overlayRef.current?.setPointerCapture(e.pointerId);
    interactionRef.current = {
      mode: 'resize-ink',
      id: item.id,
      corner,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPoints: item.points,
      origLeft: bounds.left,
      origTop: bounds.top,
      origWidth: bounds.width,
      origHeight: bounds.height,
      moved: false,
    };
  };

  const ptToPxScale = cssWidth / Math.max(1, pageSize.width);
  const bannerText = toolHintLabel(activeTool, hasArmedImage);
  const vw = pageSize.width;
  const vh = pageSize.height;

  const renderSvgArrow = (
    key: string,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    strokeWidth: number,
    opacity: number,
    dashed = false,
  ) => {
    const px1 = x1 * vw;
    const py1 = y1 * vh;
    const px2 = x2 * vw;
    const py2 = y2 * vh;
    const geom = computeArrowGeometry(px1, py1, px2, py2, strokeWidth);
    if (!geom) return null;
    const pts = `${geom.headTip[0]},${geom.headTip[1]} ${geom.headLeft[0]},${geom.headLeft[1]} ${geom.headRight[0]},${geom.headRight[1]}`;
    return (
      <g key={key} opacity={opacity}>
        <line
          x1={px1}
          y1={py1}
          x2={geom.shaftEndX}
          y2={geom.shaftEndY}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={dashed ? '5 4' : undefined}
        />
        <polygon points={pts} fill={color} />
      </g>
    );
  };

  return (
    <div ref={stageRef} className={styles.editStage}>
      <div
        className={styles.editWrap}
        style={{ width: `${cssWidth}px`, height: `${cssHeight}px` }}
      >
        <canvas
          ref={canvasRef}
          className={styles.editCanvas}
          style={{ width: `${cssWidth}px`, height: `${cssHeight}px` }}
        />

        {/* Vector SVG layer: highlights (Multiply), shapes, lines, arrows, ink, and active draw draft */}
        <svg
          className={styles.editSvgOverlay}
          viewBox={`0 0 ${vw} ${vh}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {pageItems.map((item) => {
            if (item.kind === 'highlight') {
              return (
                <rect
                  key={item.id}
                  x={item.left * vw}
                  y={item.top * vh}
                  width={item.width * vw}
                  height={item.height * vh}
                  fill={item.color}
                  fillOpacity={item.opacity ?? 0.38}
                  style={{ mixBlendMode: 'multiply' }}
                />
              );
            }
            if (item.kind === 'rect') {
              return (
                <rect
                  key={item.id}
                  x={item.left * vw}
                  y={item.top * vh}
                  width={item.width * vw}
                  height={item.height * vh}
                  fill={item.fillColor ?? 'none'}
                  stroke={item.strokeWidth > 0 ? item.strokeColor : 'none'}
                  strokeWidth={item.strokeWidth}
                  opacity={item.opacity ?? 1}
                />
              );
            }
            if (item.kind === 'ellipse') {
              return (
                <ellipse
                  key={item.id}
                  cx={(item.left + item.width / 2) * vw}
                  cy={(item.top + item.height / 2) * vh}
                  rx={(item.width / 2) * vw}
                  ry={(item.height / 2) * vh}
                  fill={item.fillColor ?? 'none'}
                  stroke={item.strokeWidth > 0 ? item.strokeColor : 'none'}
                  strokeWidth={item.strokeWidth}
                  opacity={item.opacity ?? 1}
                />
              );
            }
            if (item.kind === 'line') {
              return (
                <line
                  key={item.id}
                  x1={item.x1 * vw}
                  y1={item.y1 * vh}
                  x2={item.x2 * vw}
                  y2={item.y2 * vh}
                  stroke={item.strokeColor}
                  strokeWidth={item.strokeWidth}
                  strokeLinecap="round"
                  opacity={item.opacity ?? 1}
                />
              );
            }
            if (item.kind === 'arrow') {
              return renderSvgArrow(
                item.id,
                item.x1,
                item.y1,
                item.x2,
                item.y2,
                item.strokeColor,
                item.strokeWidth,
                item.opacity ?? 1,
              );
            }
            if (item.kind === 'ink') {
              if (item.points.length === 0) return null;
              if (item.points.length === 1) {
                return (
                  <circle
                    key={item.id}
                    cx={item.points[0].x * vw}
                    cy={item.points[0].y * vh}
                    r={Math.max(1, item.strokeWidth / 2)}
                    fill={item.strokeColor}
                    opacity={item.opacity ?? 1}
                  />
                );
              }
              const pts = item.points.map((p) => `${p.x * vw},${p.y * vh}`).join(' ');
              return (
                <polyline
                  key={item.id}
                  points={pts}
                  fill="none"
                  stroke={item.strokeColor}
                  strokeWidth={item.strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={item.opacity ?? 1}
                />
              );
            }
            return null;
          })}

          {/* Live drawing preview */}
          {draft && draft.kind === 'highlight' && (
            <rect
              x={Math.min(draft.x0, draft.x1) * vw}
              y={Math.min(draft.y0, draft.y1) * vh}
              width={Math.abs(draft.x1 - draft.x0) * vw}
              height={Math.abs(draft.y1 - draft.y0) * vh}
              fill={defaults.highlightColor}
              fillOpacity={defaults.highlightOpacity}
              stroke="#0070f3"
              strokeWidth={1}
              strokeDasharray="4 3"
              style={{ mixBlendMode: 'multiply' }}
            />
          )}
          {draft && draft.kind === 'rect' && (
            <rect
              x={Math.min(draft.x0, draft.x1) * vw}
              y={Math.min(draft.y0, draft.y1) * vh}
              width={Math.abs(draft.x1 - draft.x0) * vw}
              height={Math.abs(draft.y1 - draft.y0) * vh}
              fill={defaults.fillColor ?? 'none'}
              stroke={defaults.strokeWidth > 0 ? defaults.strokeColor : '#0070f3'}
              strokeWidth={Math.max(1, defaults.strokeWidth)}
              strokeDasharray="5 4"
              opacity={defaults.opacity}
            />
          )}
          {draft && draft.kind === 'ellipse' && (
            <ellipse
              cx={((draft.x0 + draft.x1) / 2) * vw}
              cy={((draft.y0 + draft.y1) / 2) * vh}
              rx={(Math.abs(draft.x1 - draft.x0) / 2) * vw}
              ry={(Math.abs(draft.y1 - draft.y0) / 2) * vh}
              fill={defaults.fillColor ?? 'none'}
              stroke={defaults.strokeWidth > 0 ? defaults.strokeColor : '#0070f3'}
              strokeWidth={Math.max(1, defaults.strokeWidth)}
              strokeDasharray="5 4"
              opacity={defaults.opacity}
            />
          )}
          {draft && draft.kind === 'line' && (
            <line
              x1={draft.x1 * vw}
              y1={draft.y1 * vh}
              x2={draft.x2 * vw}
              y2={draft.y2 * vh}
              stroke={defaults.strokeColor}
              strokeWidth={defaults.strokeWidth}
              strokeLinecap="round"
              strokeDasharray="5 4"
              opacity={defaults.opacity}
            />
          )}
          {draft &&
            draft.kind === 'arrow' &&
            renderSvgArrow(
              'draft-arrow',
              draft.x1,
              draft.y1,
              draft.x2,
              draft.y2,
              defaults.strokeColor,
              defaults.strokeWidth,
              defaults.opacity,
              true,
            )}
          {draft && draft.kind === 'ink' && draft.points.length > 1 && (
            <polyline
              points={draft.points.map((p) => `${p.x * vw},${p.y * vh}`).join(' ')}
              fill="none"
              stroke={defaults.strokeColor}
              strokeWidth={defaults.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={defaults.opacity}
            />
          )}
        </svg>

        {/* Interactive HTML overlay: text boxes, images, selection hit boxes, handles, inline textarea */}
        <div
          ref={overlayRef}
          className={[
            styles.editHtmlOverlay,
            activeTool !== 'select' ? styles.editOverlayCrosshair : '',
          ].join(' ')}
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={finishInteraction}
          onPointerCancel={finishInteraction}
        >
          {bannerText && <div className={styles.signArmedBanner}>{bannerText}</div>}

          {pageItems.map((item) => {
            const isSelected = item.id === selectedId;
            const interactive = activeTool === 'select';

            if (item.kind === 'line' || item.kind === 'arrow') {
              const px1 = item.x1 * cssWidth;
              const py1 = item.y1 * cssHeight;
              const px2 = item.x2 * cssWidth;
              const py2 = item.y2 * cssHeight;
              const len = Math.hypot(px2 - px1, py2 - py1);
              const angle = (Math.atan2(py2 - py1, px2 - px1) * 180) / Math.PI;
              const midX = (item.x1 + item.x2) / 2;
              const topY = Math.min(item.y1, item.y2);

              return (
                <React.Fragment key={item.id}>
                  <div
                    role="button"
                    tabIndex={interactive ? 0 : -1}
                    aria-label={`${item.kind === 'arrow' ? 'Arrow' : 'Line'} edit`}
                    className={[
                      styles.editLineHit,
                      isSelected ? styles.editLineHitSelected : '',
                    ].join(' ')}
                    style={{
                      left: `${px1}px`,
                      top: `${py1 - 10}px`,
                      width: `${Math.max(18, len)}px`,
                      transform: `rotate(${angle}deg)`,
                      pointerEvents: interactive ? 'auto' : 'none',
                    }}
                    onPointerDown={(e) => startLineMove(e, item)}
                  />
                  {isSelected && interactive && (
                    <>
                      <span
                        role="slider"
                        aria-label="Move start point"
                        aria-valuenow={Math.round(item.x1 * 100)}
                        className={styles.editEndpointHandle}
                        style={{ left: `${item.x1 * 100}%`, top: `${item.y1 * 100}%` }}
                        onPointerDown={(e) => startEndpointDrag(e, item, 'p1')}
                      />
                      <span
                        role="slider"
                        aria-label="Move end point"
                        aria-valuenow={Math.round(item.x2 * 100)}
                        className={styles.editEndpointHandle}
                        style={{ left: `${item.x2 * 100}%`, top: `${item.y2 * 100}%` }}
                        onPointerDown={(e) => startEndpointDrag(e, item, 'p2')}
                      />
                      <div
                        className={styles.editFloatingActions}
                        style={{
                          left: `${clamp(midX * 100, 12, 88)}%`,
                          top: `${Math.max(3, topY * 100 - 4)}%`,
                        }}
                      >
                        <button
                          type="button"
                          className={styles.signBoxActionBtn}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(item.id);
                          }}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className={[styles.signBoxActionBtn, styles.signBoxActionDanger].join(' ')}
                          aria-label="Delete item"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </>
                  )}
                </React.Fragment>
              );
            }

            if (item.kind === 'ink') {
              const bounds = getInkBounds(item.points);
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={interactive ? 0 : -1}
                  aria-label="Freehand drawing"
                  className={[
                    styles.editBox,
                    styles.editBoxVector,
                    isSelected ? styles.editBoxSelected : '',
                  ].join(' ')}
                  style={{
                    left: `${bounds.left * 100}%`,
                    top: `${bounds.top * 100}%`,
                    width: `${bounds.width * 100}%`,
                    height: `${bounds.height * 100}%`,
                    pointerEvents: interactive ? 'auto' : 'none',
                  }}
                  onPointerDown={(e) => startInkMove(e, item)}
                >
                  {isSelected && interactive && (
                    <>
                      <div className={styles.signBoxActions}>
                        <button
                          type="button"
                          className={styles.signBoxActionBtn}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(item.id);
                          }}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className={[styles.signBoxActionBtn, styles.signBoxActionDanger].join(' ')}
                          aria-label="Delete item"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(item.id);
                          }}
                        >
                          ×
                        </button>
                      </div>
                      {CORNERS.map(({ corner, className, label }) => (
                        <span
                          key={corner}
                          role="slider"
                          aria-label={label}
                          aria-valuenow={Math.round(bounds.width * 100)}
                          className={[styles.signHandle, className].join(' ')}
                          onPointerDown={(e) => startInkResize(e, item, corner)}
                        />
                      ))}
                    </>
                  )}
                </div>
              );
            }

            // Box items: text, image, highlight, rect, ellipse
            const isEditingThisText = item.kind === 'text' && editingTextId === item.id;
            const textFontPx =
              item.kind === 'text' ? Math.max(7, item.fontSize * ptToPxScale) : 14;
            const textPadX =
              item.kind === 'text'
                ? Math.min(4, Math.max(1.5, item.fontSize * 0.2)) * ptToPxScale
                : 0;
            const textPadY =
              item.kind === 'text'
                ? Math.min(3, Math.max(1.5, item.fontSize * 0.15)) * ptToPxScale
                : 0;

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={interactive ? 0 : -1}
                aria-label={`${item.kind} edit`}
                className={[
                  styles.editBox,
                  item.kind === 'highlight' || item.kind === 'rect' || item.kind === 'ellipse'
                    ? styles.editBoxVector
                    : '',
                  isSelected ? styles.editBoxSelected : '',
                ].join(' ')}
                style={{
                  left: `${item.left * 100}%`,
                  top: `${item.top * 100}%`,
                  width: `${item.width * 100}%`,
                  height: `${item.height * 100}%`,
                  pointerEvents: interactive || isEditingThisText ? 'auto' : 'none',
                  backgroundColor:
                    item.kind === 'text' && item.backgroundColor ? item.backgroundColor : undefined,
                  opacity: item.kind === 'text' || item.kind === 'image' ? (item.opacity ?? 1) : 1,
                }}
                onPointerDown={(e) => startBoxMove(e, item)}
                onDoubleClick={(e) => {
                  if (item.kind !== 'text') return;
                  e.stopPropagation();
                  onSelect(item.id);
                  setEditingTextId(item.id);
                  setEditingTextValue(item.text);
                }}
              >
                {item.kind === 'image' && (
                  assetPreviews[item.assetId] ? (
                    <img
                      src={assetPreviews[item.assetId]}
                      alt="Placed image"
                      className={styles.signBoxImg}
                      draggable={false}
                    />
                  ) : (
                    <span className={styles.signBoxFallback}>Image</span>
                  )
                )}

                {item.kind === 'text' &&
                  (isEditingThisText ? (
                    <textarea
                      autoFocus
                      className={styles.editInlineTextarea}
                      value={editingTextValue}
                      placeholder="Type text…"
                      style={{
                        ...cssFontForEdit(item.font),
                        color: item.color,
                        fontSize: `${textFontPx}px`,
                        padding: `${textPadY}px ${textPadX}px`,
                        background: item.backgroundColor || 'rgba(255, 255, 255, 0.92)',
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingTextValue(e.target.value)}
                      onBlur={() => commitInlineText(item.id, editingTextValue)}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                          e.preventDefault();
                          commitInlineText(item.id, editingTextValue);
                        }
                      }}
                    />
                  ) : (
                    <div
                      className={styles.editTextContent}
                      style={{
                        ...cssFontForEdit(item.font),
                        color: item.color,
                        fontSize: `${textFontPx}px`,
                        padding: `${textPadY}px ${textPadX}px`,
                      }}
                    >
                      {item.text || (item.backgroundColor ? '' : 'Double-click to edit')}
                    </div>
                  ))}

                {isSelected && !isEditingThisText && interactive && (
                  <>
                    <div className={styles.signBoxActions}>
                      {item.kind === 'text' && (
                        <button
                          type="button"
                          className={styles.signBoxActionBtn}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTextId(item.id);
                            setEditingTextValue(item.text);
                          }}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.signBoxActionBtn}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDuplicate(item.id);
                        }}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className={[styles.signBoxActionBtn, styles.signBoxActionDanger].join(' ')}
                        aria-label="Delete item"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(item.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                    {CORNERS.map(({ corner, className, label }) => (
                      <span
                        key={corner}
                        role="slider"
                        aria-label={label}
                        aria-valuenow={Math.round(item.width * 100)}
                        className={[styles.signHandle, className].join(' ')}
                        onPointerDown={(e) => startBoxResize(e, item, corner)}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {rendering && <div className={styles.figureLoading}>Rendering page…</div>}
        {renderError && <div className={styles.figureLoading}>{renderError}</div>}
      </div>
    </div>
  );
}
