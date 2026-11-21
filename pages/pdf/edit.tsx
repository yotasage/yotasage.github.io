import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { EditorStyleDefaults, EditorTool, PdfEditor } from '../../components/PdfTools/PdfEditor';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/QrGen/fields';
import {
  ApplyEditsResult,
  PdfEditFont,
  PdfEditImageItem,
  PdfEditItem,
  PdfEditTextItem,
} from '../../lib/pdf/editPdf';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  readBytes,
  safeFileName,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { openPdf } from '../../lib/pdf/pdfjs';
import { EDIT } from '../../lib/pdf/tools';
import { runApplyEdits } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  password?: string;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

interface UploadedImageAsset {
  id: string;
  name: string;
  bytes: Uint8Array;
  imageType: 'png' | 'jpeg';
  width: number;
  height: number;
  dataUrl: string;
}

interface HistoryState {
  past: PdfEditItem[][];
  present: PdfEditItem[];
  future: PdfEditItem[][];
}

const EMPTY_HISTORY: HistoryState = { past: [], present: [], future: [] };
const MAX_HISTORY = 80;

const ZOOM_PRESETS = [0.75, 1, 1.25, 1.5] as const;

const TOOL_BUTTONS: Array<{ id: EditorTool; label: string; short: string }> = [
  { id: 'select', label: 'Select', short: 'Select' },
  { id: 'text', label: 'Text', short: 'Text' },
  { id: 'highlight', label: 'Highlight', short: 'Highlight' },
  { id: 'ink', label: 'Draw', short: 'Draw' },
  { id: 'rect', label: 'Rect', short: 'Rect' },
  { id: 'ellipse', label: 'Ellipse', short: 'Ellipse' },
  { id: 'line', label: 'Line', short: 'Line' },
  { id: 'arrow', label: 'Arrow', short: 'Arrow' },
  { id: 'image', label: 'Image', short: 'Image' },
];

const GENERAL_SWATCHES = [
  { hex: '#111827', name: 'Black' },
  { hex: '#dc2626', name: 'Red' },
  { hex: '#2563eb', name: 'Blue' },
  { hex: '#16a34a', name: 'Green' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#9333ea', name: 'Purple' },
  { hex: '#ffffff', name: 'White' },
];

const HIGHLIGHT_SWATCHES = [
  { hex: '#fde047', name: 'Yellow' },
  { hex: '#86efac', name: 'Green' },
  { hex: '#f9a8d4', name: 'Pink' },
  { hex: '#93c5fd', name: 'Blue' },
  { hex: '#fdba74', name: 'Orange' },
];

const FONT_OPTIONS: [PdfEditFont, string][] = [
  ['helvetica', 'Helvetica'],
  ['helvetica-bold', 'Helvetica Bold'],
  ['times', 'Times Roman'],
  ['times-bold', 'Times Bold'],
  ['courier', 'Courier'],
];

const DEFAULT_STYLES: EditorStyleDefaults = {
  color: '#111827',
  highlightColor: '#fde047',
  strokeColor: '#dc2626',
  fillColor: null,
  textBgColor: null,
  strokeWidth: 2.5,
  opacity: 1,
  highlightOpacity: 0.38,
  font: 'helvetica',
  fontSize: 15,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function makeEditId(): string {
  return `ed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeAssetId(): string {
  return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function uint8ToDataUrl(bytes: Uint8Array, mime: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const blob = new Blob([copy], { type: mime });
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not encode image preview.'));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unsupported or corrupted image file.'));
    img.src = src;
  });
}

async function importImageFile(file: File): Promise<UploadedImageAsset> {
  const mime = file.type.toLowerCase();
  const rawBytes = await readBytes(file);

  // Native PNG / JPEG: keep exact bytes lossless and read natural dimensions.
  if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/jpg') {
    const imageType: 'png' | 'jpeg' = mime === 'image/png' ? 'png' : 'jpeg';
    const dataUrl = await uint8ToDataUrl(rawBytes, imageType === 'png' ? 'image/png' : 'image/jpeg');
    const img = await loadImageElement(dataUrl);
    return {
      id: makeAssetId(),
      name: file.name || 'image',
      bytes: rawBytes,
      imageType,
      width: Math.max(1, img.naturalWidth || 300),
      height: Math.max(1, img.naturalHeight || 200),
      dataUrl,
    };
  }

  // Convert WebP, SVG, GIF, BMP, etc. to PNG via offscreen canvas.
  const objUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objUrl);
    const rawW = img.naturalWidth || 512;
    const rawH = img.naturalHeight || 512;
    const maxDim = 2400;
    const scale = Math.min(1, maxDim / Math.max(rawW, rawH));
    const w = Math.max(1, Math.round(rawW * scale));
    const h = Math.max(1, Math.round(rawH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not convert image to PNG.');
    const pngBytes = new Uint8Array(await blob.arrayBuffer());
    const dataUrl = canvas.toDataURL('image/png');
    return {
      id: makeAssetId(),
      name: file.name || 'image.png',
      bytes: pngBytes,
      imageType: 'png',
      width: w,
      height: h,
      dataUrl,
    };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

function itemSummaryLabel(item: PdfEditItem): { badge: string; title: string } {
  switch (item.kind) {
    case 'text': {
      const clean = item.text.trim().replace(/\s+/g, ' ');
      return {
        badge: item.backgroundColor === '#ffffff' && !clean ? 'Whiteout' : 'Text',
        title: clean ? clean.slice(0, 28) : item.backgroundColor ? 'Background box' : '(Empty text)',
      };
    }
    case 'highlight':
      return { badge: 'Highlight', title: item.color.toUpperCase() };
    case 'rect':
      return {
        badge: item.fillColor === '#ffffff' && item.strokeWidth === 0 ? 'Whiteout' : 'Rect',
        title: `${Math.round(item.width * 100)}% × ${Math.round(item.height * 100)}%`,
      };
    case 'ellipse':
      return {
        badge: 'Ellipse',
        title: `${Math.round(item.width * 100)}% × ${Math.round(item.height * 100)}%`,
      };
    case 'line':
      return { badge: 'Line', title: `${item.strokeWidth.toFixed(1)} pt` };
    case 'arrow':
      return { badge: 'Arrow', title: `${item.strokeWidth.toFixed(1)} pt` };
    case 'ink':
      return { badge: 'Draw', title: `${item.points.length} pts` };
    case 'image':
      return {
        badge: 'Image',
        title: `${Math.round(item.width * 100)}% × ${Math.round(item.height * 100)}%`,
      };
  }
}

export default function EditPdfPage() {
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [pdfProxy, setPdfProxy] = React.useState<PDFDocumentProxy | null>(null);
  const closeProxyRef = React.useRef<(() => Promise<void>) | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [pageIndex, setPageIndex] = React.useState(0);
  const [zoom, setZoom] = React.useState<number>(1);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number }>({
    width: 595.28,
    height: 841.89,
  });

  const [activeTool, setActiveTool] = React.useState<EditorTool>('select');
  const [defaults, setDefaults] = React.useState<EditorStyleDefaults>(DEFAULT_STYLES);

  // Uploaded session image assets (deduplicated in PDF via assetId)
  const [imageAssets, setImageAssets] = React.useState<UploadedImageAsset[]>([]);
  const [activeAssetId, setActiveAssetId] = React.useState<string | null>(null);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);

  // Edit items + Undo/Redo history
  const [history, setHistory] = React.useState<HistoryState>(EMPTY_HISTORY);
  const [liveOverrides, setLiveOverrides] = React.useState<Record<string, Partial<PdfEditItem>>>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [autoEditId, setAutoEditId] = React.useState<string | null>(null);

  const [fileName, setFileName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ApplyEditsResult | null>(null);

  const closeCurrentProxy = React.useCallback(() => {
    const closer = closeProxyRef.current;
    closeProxyRef.current = null;
    setPdfProxy(null);
    if (closer) void closer().catch(() => undefined);
  }, []);

  React.useEffect(() => () => closeCurrentProxy(), [closeCurrentProxy]);

  const items = React.useMemo<PdfEditItem[]>(() => {
    if (Object.keys(liveOverrides).length === 0) return history.present;
    return history.present.map((item) => {
      const ov = liveOverrides[item.id];
      return ov ? ({ ...item, ...ov } as PdfEditItem) : item;
    });
  }, [history.present, liveOverrides]);

  const assetPreviews = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const a of imageAssets) map[a.id] = a.dataUrl;
    return map;
  }, [imageAssets]);

  const countsByPage = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const item of history.present) {
      map.set(item.pageIndex, (map.get(item.pageIndex) ?? 0) + 1);
    }
    return map;
  }, [history.present]);

  const currentPageItems = React.useMemo(
    () => items.filter((item) => item.pageIndex === pageIndex),
    [items, pageIndex],
  );

  const selectedItem = React.useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const pushItems = React.useCallback((updater: (prev: PdfEditItem[]) => PdfEditItem[]) => {
    setHistory((h) => {
      const next = updater(h.present);
      if (next === h.present) return h;
      const past = [...h.past, h.present];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, present: next, future: [] };
    });
    setLiveOverrides({});
    setResult(null);
    setNotice(null);
  }, []);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const undo = React.useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future].slice(0, MAX_HISTORY),
      };
    });
    setLiveOverrides({});
    setResult(null);
  }, []);

  const redo = React.useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const [next, ...rest] = h.future;
      return {
        past: [...h.past, h.present].slice(-MAX_HISTORY),
        present: next,
        future: rest,
      };
    });
    setLiveOverrides({});
    setResult(null);
  }, []);

  const loadWithBytes = React.useCallback(
    async (name: string, bytes: Uint8Array, password?: string) => {
      setError(null);
      setNotice(null);
      setResult(null);
      setLoading(true);
      try {
        const opened = await openPdf(bytes, password);
        closeCurrentProxy();
        closeProxyRef.current = opened.close;
        setPdfProxy(opened.doc);
        setDoc({ name, bytes, pageCount: opened.doc.numPages, password });
        setLocked(null);
        setPageIndex(0);
        setHistory(EMPTY_HISTORY);
        setLiveOverrides({});
        setSelectedId(null);
        setAutoEditId(null);
        setActiveTool('select');
        setFileName(`${baseName(name)}-edited.pdf`);
      } catch (e) {
        if (isPasswordError(e)) {
          closeCurrentProxy();
          setDoc(null);
          setLocked({
            name,
            bytes,
            error: password ? 'Wrong password — please try again.' : null,
            busy: false,
          });
        } else {
          setError(`Could not open ${name}: ${errorMessage(e)}`);
        }
      } finally {
        setLoading(false);
      }
    },
    [closeCurrentProxy],
  );

  const onFiles = React.useCallback(
    async (files: File[]) => {
      const pdfFile = files.find(isPdf);
      if (!pdfFile) {
        setError('Please select a PDF file.');
        return;
      }
      setError(null);
      try {
        const bytes = await readBytes(pdfFile);
        await loadWithBytes(pdfFile.name, bytes);
      } catch (e) {
        setError(`Could not read ${pdfFile.name}: ${errorMessage(e)}`);
      }
    },
    [loadWithBytes],
  );

  // Consume any incoming handoff file from another PDF tool.
  React.useEffect(() => {
    const handed = consumeHandoff();
    if (handed?.length) {
      void onFiles(handoffToFiles(handed));
    }
  }, [onFiles]);

  const handleUnlock = async (password: string) => {
    if (!locked) return;
    setLocked((prev) => (prev ? { ...prev, busy: true, error: null } : null));
    await loadWithBytes(locked.name, locked.bytes, password);
    setLocked((prev) => (prev ? { ...prev, busy: false } : null));
  };

  const handleImageUpload = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    try {
      const asset = await importImageFile(file);
      setImageAssets((prev) => [asset, ...prev]);
      setActiveAssetId(asset.id);
      setActiveTool('image');
    } catch (e) {
      setError(`Could not load image: ${errorMessage(e)}`);
    }
  };

  const handleCreateItem = React.useCallback(
    (item: PdfEditItem, openInlineText = false) => {
      pushItems((prev) => [...prev, item]);
      setSelectedId(item.id);
      if (openInlineText) {
        setAutoEditId(item.id);
      }
    },
    [pushItems],
  );

  const handlePlaceTextAt = React.useCallback(
    (normX: number, normY: number) => {
      const width = 0.28;
      const height = Math.max(0.055, (defaults.fontSize * 2.2) / Math.max(1, pageSize.height));
      const left = clamp(normX - 0.02, 0, Math.max(0, 1 - width));
      const top = clamp(normY - height / 3, 0, Math.max(0, 1 - height));
      const item: PdfEditTextItem = {
        id: makeEditId(),
        pageIndex,
        kind: 'text',
        left,
        top,
        width,
        height,
        text: '',
        font: defaults.font,
        fontSize: defaults.fontSize,
        color: defaults.color,
        backgroundColor: defaults.textBgColor,
        opacity: defaults.opacity,
      };
      setActiveTool('select');
      handleCreateItem(item, true);
    },
    [defaults, pageIndex, pageSize.height, handleCreateItem],
  );

  const handlePlaceImageAt = React.useCallback(
    (normX: number, normY: number) => {
      const asset = imageAssets.find((a) => a.id === activeAssetId) ?? imageAssets[0];
      if (!asset) return;
      const targetW = 0.28;
      const pageAspect = pageSize.width / Math.max(1, pageSize.height);
      const imgAspect = asset.width / Math.max(1, asset.height);
      let width = targetW;
      let height = (width * pageAspect) / Math.max(0.1, imgAspect);
      if (height > 0.45) {
        height = 0.45;
        width = clamp((height * imgAspect) / Math.max(0.1, pageAspect), 0.05, 0.85);
      }
      const left = clamp(normX - width / 2, 0, Math.max(0, 1 - width));
      const top = clamp(normY - height / 2, 0, Math.max(0, 1 - height));
      const item: PdfEditImageItem = {
        id: makeEditId(),
        pageIndex,
        kind: 'image',
        assetId: asset.id,
        imageBytes: asset.bytes,
        imageType: asset.imageType,
        left,
        top,
        width,
        height,
        opacity: defaults.opacity,
      };
      setActiveTool('select');
      handleCreateItem(item);
    },
    [imageAssets, activeAssetId, pageSize, pageIndex, defaults.opacity, handleCreateItem],
  );

  const handleLiveChange = React.useCallback((id: string, patch: Partial<PdfEditItem>) => {
    setLiveOverrides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), ...patch },
    }));
  }, []);

  const handleCommitChange = React.useCallback(
    (id: string, patch: Partial<PdfEditItem>) => {
      pushItems((prev) =>
        prev.map((item) => (item.id === id ? ({ ...item, ...patch } as PdfEditItem) : item)),
      );
    },
    [pushItems],
  );

  const handleDelete = React.useCallback(
    (id: string) => {
      pushItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [pushItems],
  );

  const handleDuplicate = React.useCallback(
    (id: string) => {
      const source = history.present.find((item) => item.id === id);
      if (!source) return;
      const nextId = makeEditId();
      const offset = 0.025;
      let copy: PdfEditItem;
      if (source.kind === 'line' || source.kind === 'arrow') {
        const dx = Math.min(offset, 1 - Math.max(source.x1, source.x2));
        const dy = Math.min(offset, 1 - Math.max(source.y1, source.y2));
        copy = {
          ...source,
          id: nextId,
          x1: source.x1 + dx,
          y1: source.y1 + dy,
          x2: source.x2 + dx,
          y2: source.y2 + dy,
        };
      } else if (source.kind === 'ink') {
        let maxX = 0;
        let maxY = 0;
        for (const p of source.points) {
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const dx = Math.min(offset, 1 - maxX);
        const dy = Math.min(offset, 1 - maxY);
        copy = {
          ...source,
          id: nextId,
          points: source.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        };
      } else {
        copy = {
          ...source,
          id: nextId,
          left: clamp(source.left + offset, 0, Math.max(0, 1 - source.width)),
          top: clamp(source.top + offset, 0, Math.max(0, 1 - source.height)),
        };
      }
      pushItems((prev) => [...prev, copy]);
      setSelectedId(nextId);
      setActiveTool('select');
    },
    [history.present, pushItems],
  );

  const nudgeSelected = React.useCallback(
    (dx: number, dy: number) => {
      if (!selectedId) return;
      const target = history.present.find((it) => it.id === selectedId);
      if (!target) return;
      if (target.kind === 'line' || target.kind === 'arrow') {
        const minX = Math.min(target.x1, target.x2);
        const maxX = Math.max(target.x1, target.x2);
        const minY = Math.min(target.y1, target.y2);
        const maxY = Math.max(target.y1, target.y2);
        const cdx = clamp(dx, -minX, 1 - maxX);
        const cdy = clamp(dy, -minY, 1 - maxY);
        handleCommitChange(target.id, {
          x1: target.x1 + cdx,
          y1: target.y1 + cdy,
          x2: target.x2 + cdx,
          y2: target.y2 + cdy,
        });
      } else if (target.kind === 'ink') {
        let minX = 1;
        let minY = 1;
        let maxX = 0;
        let maxY = 0;
        for (const p of target.points) {
          if (p.x < minX) minX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.x > maxX) maxX = p.x;
          if (p.y > maxY) maxY = p.y;
        }
        const cdx = clamp(dx, -minX, 1 - maxX);
        const cdy = clamp(dy, -minY, 1 - maxY);
        handleCommitChange(target.id, {
          points: target.points.map((p) => ({ x: p.x + cdx, y: p.y + cdy })),
        });
      } else {
        handleCommitChange(target.id, {
          left: clamp(target.left + dx, 0, Math.max(0, 1 - target.width)),
          top: clamp(target.top + dy, 0, Math.max(0, 1 - target.height)),
        });
      }
    },
    [selectedId, history.present, handleCommitChange],
  );

  // Global keyboard shortcuts: Undo, Redo, Delete, Arrow nudge, Escape.
  React.useEffect(() => {
    if (!doc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isField) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'Escape') {
        if (activeTool !== 'select') setActiveTool('select');
        else setSelectedId(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault();
        handleDelete(selectedId);
        return;
      }
      if (
        selectedId &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 0.02 : 0.005;
        if (e.key === 'ArrowUp') nudgeSelected(0, -step);
        if (e.key === 'ArrowDown') nudgeSelected(0, step);
        if (e.key === 'ArrowLeft') nudgeSelected(-step, 0);
        if (e.key === 'ArrowRight') nudgeSelected(step, 0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doc, activeTool, selectedId, undo, redo, handleDelete, nudgeSelected]);

  const handleSave = async () => {
    if (!doc || history.present.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await runApplyEdits(doc.bytes, history.present, doc.password);
      const outName = safeFileName(fileName, `${baseName(doc.name)}-edited.pdf`);
      download(res.bytes, outName);
      setResult(res);
      setNotice(
        `Saved ${res.appliedCount} edit${res.appliedCount === 1 ? '' : 's'} across ${res.pagesModified} page${res.pagesModified === 1 ? '' : 's'} (${formatBytes(res.bytes.byteLength)}).`,
      );
    } catch (e) {
      setError(`Could not save edited PDF: ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  // Determine which contextual inspector section to show (selected item takes precedence over active tool).
  const inspectorKind: EditorTool = selectedItem ? selectedItem.kind : activeTool;

  const applyColorChange = (hex: string) => {
    if (selectedItem) {
      if (selectedItem.kind === 'text' || selectedItem.kind === 'highlight') {
        handleCommitChange(selectedItem.id, { color: hex });
      } else if (
        selectedItem.kind === 'rect' ||
        selectedItem.kind === 'ellipse' ||
        selectedItem.kind === 'line' ||
        selectedItem.kind === 'arrow' ||
        selectedItem.kind === 'ink'
      ) {
        handleCommitChange(selectedItem.id, { strokeColor: hex });
      }
      return;
    }
    if (activeTool === 'text') setDefaults((d) => ({ ...d, color: hex }));
    else if (activeTool === 'highlight') setDefaults((d) => ({ ...d, highlightColor: hex }));
    else setDefaults((d) => ({ ...d, strokeColor: hex }));
  };

  const currentColor = selectedItem
    ? selectedItem.kind === 'text' || selectedItem.kind === 'highlight'
      ? selectedItem.color
      : selectedItem.kind === 'image'
        ? '#111827'
        : selectedItem.strokeColor
    : activeTool === 'text'
      ? defaults.color
      : activeTool === 'highlight'
        ? defaults.highlightColor
        : defaults.strokeColor;

  const currentOpacity = selectedItem
    ? (selectedItem.opacity ?? (selectedItem.kind === 'highlight' ? 0.38 : 1))
    : activeTool === 'highlight'
      ? defaults.highlightOpacity
      : defaults.opacity;

  const applyOpacityChange = (val: number) => {
    const clamped = clamp(val, 0.05, 1);
    if (selectedItem) {
      handleCommitChange(selectedItem.id, { opacity: clamped });
    } else if (activeTool === 'highlight') {
      setDefaults((d) => ({ ...d, highlightOpacity: clamped }));
    } else {
      setDefaults((d) => ({ ...d, opacity: clamped }));
    }
  };

  const currentStrokeWidth =
    selectedItem &&
    (selectedItem.kind === 'rect' ||
      selectedItem.kind === 'ellipse' ||
      selectedItem.kind === 'line' ||
      selectedItem.kind === 'arrow' ||
      selectedItem.kind === 'ink')
      ? selectedItem.strokeWidth
      : defaults.strokeWidth;

  const applyStrokeWidthChange = (val: number) => {
    if (
      selectedItem &&
      (selectedItem.kind === 'rect' ||
        selectedItem.kind === 'ellipse' ||
        selectedItem.kind === 'line' ||
        selectedItem.kind === 'arrow' ||
        selectedItem.kind === 'ink')
    ) {
      handleCommitChange(selectedItem.id, { strokeWidth: val });
    } else {
      setDefaults((d) => ({ ...d, strokeWidth: val }));
    }
  };

  const activeFillValue =
    selectedItem?.kind === 'rect' || selectedItem?.kind === 'ellipse'
      ? selectedItem.fillColor ?? null
      : selectedItem?.kind === 'text'
        ? selectedItem.backgroundColor ?? null
        : activeTool === 'text'
          ? defaults.textBgColor
          : defaults.fillColor;

  const applyFillChange = (nextFill: string | null) => {
    if (selectedItem?.kind === 'rect' || selectedItem?.kind === 'ellipse') {
      handleCommitChange(selectedItem.id, { fillColor: nextFill });
    } else if (selectedItem?.kind === 'text') {
      handleCommitChange(selectedItem.id, { backgroundColor: nextFill });
    } else if (activeTool === 'text') {
      setDefaults((d) => ({ ...d, textBgColor: nextFill }));
    } else {
      setDefaults((d) => ({ ...d, fillColor: nextFill }));
    }
  };

  const applyWhiteoutPreset = () => {
    if (selectedItem?.kind === 'rect') {
      handleCommitChange(selectedItem.id, {
        fillColor: '#ffffff',
        strokeWidth: 0,
        opacity: 1,
      });
    } else if (selectedItem?.kind === 'text') {
      handleCommitChange(selectedItem.id, {
        backgroundColor: '#ffffff',
        opacity: 1,
      });
    } else if (activeTool === 'rect') {
      setDefaults((d) => ({ ...d, fillColor: '#ffffff', strokeWidth: 0, opacity: 1 }));
    } else {
      setDefaults((d) => ({ ...d, textBgColor: '#ffffff', opacity: 1 }));
      setActiveTool('text');
    }
  };

  const hasDoc = Boolean(doc || locked);
  const swatches = inspectorKind === 'highlight' ? HIGHLIGHT_SWATCHES : GENERAL_SWATCHES;
  const outputName = doc ? safeFileName(fileName, `${baseName(doc.name)}-edited.pdf`) : 'edited.pdf';

  return (
    <PdfPage
      title={EDIT.title}
      lead="Add text boxes, Multiply-blended highlights, shapes, arrows, freehand drawings, whiteout blocks, and images directly onto PDF pages — losslessly in your browser."
      showHub
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*"
        className={styles.visuallyHidden}
        tabIndex={-1}
        onChange={(e) => {
          void handleImageUpload(e.target.files);
          e.target.value = '';
        }}
      />

      <ToolWorkspace
        tool={EDIT}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel="Select a PDF"
        dropLabel="or drop a PDF here"
        addLabel="Open another PDF"
        hasFiles={hasDoc}
        onFiles={(files) => void onFiles(files)}
        toolbar={
          doc ? (
            <span className={styles.hint}>
              {doc.name} ({doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'})
            </span>
          ) : null
        }
        sidebar={
          <>
            {/* Contextual Style Inspector */}
            {doc && (
              <div className={styles.inspectorBox}>
                <div className={styles.inspectorHeader}>
                  <span>
                    {selectedItem
                      ? `Selected: ${itemSummaryLabel(selectedItem).badge}`
                      : activeTool === 'select'
                        ? 'Tool & style'
                        : `New ${TOOL_BUTTONS.find((b) => b.id === activeTool)?.label ?? activeTool}`}
                  </span>
                  {selectedItem && (
                    <div className={styles.boxListActions}>
                      <button
                        type="button"
                        className={styles.miniBtn}
                        onClick={() => handleDuplicate(selectedItem.id)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className={[styles.miniBtn, styles.miniBtnDanger].join(' ')}
                        onClick={() => handleDelete(selectedItem.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {inspectorKind === 'select' && !selectedItem && (
                  <p className={styles.hint}>
                    Pick a tool above to draw or place content, or click any item on the page to move, resize, or restyle it.
                  </p>
                )}

                {/* Text-specific controls */}
                {inspectorKind === 'text' && (
                  <>
                    {selectedItem?.kind === 'text' && (
                      <Field label="Text">
                        <textarea
                          className={styles.editSidebarTextarea}
                          rows={3}
                          value={selectedItem.text}
                          placeholder="Type text…"
                          onChange={(e) =>
                            handleCommitChange(selectedItem.id, { text: e.target.value })
                          }
                        />
                      </Field>
                    )}
                    <div className={styles.signInspectorGrid}>
                      <Field label="Font">
                        <Select<PdfEditFont>
                          value={selectedItem?.kind === 'text' ? selectedItem.font : defaults.font}
                          options={FONT_OPTIONS}
                          onChange={(font) => {
                            if (selectedItem?.kind === 'text') {
                              handleCommitChange(selectedItem.id, { font });
                            } else {
                              setDefaults((d) => ({ ...d, font }));
                            }
                          }}
                        />
                      </Field>
                      <Field label="Size (pt)">
                        <NumberInput
                          value={selectedItem?.kind === 'text' ? selectedItem.fontSize : defaults.fontSize}
                          min={6}
                          max={120}
                          step={1}
                          onChange={(fontSize) => {
                            if (selectedItem?.kind === 'text') {
                              handleCommitChange(selectedItem.id, { fontSize });
                            } else {
                              setDefaults((d) => ({ ...d, fontSize }));
                            }
                          }}
                        />
                      </Field>
                    </div>
                  </>
                )}

                {/* Color swatches + picker (all except image & empty select) */}
                {inspectorKind !== 'select' && inspectorKind !== 'image' && (
                  <div className={styles.editControlBlock}>
                    <span className={styles.editControlLabel}>
                      {inspectorKind === 'text'
                        ? 'Text colour'
                        : inspectorKind === 'highlight'
                          ? 'Highlight colour'
                          : 'Stroke colour'}
                    </span>
                    <div className={styles.editSwatchRow}>
                      {swatches.map((s) => (
                        <button
                          key={s.hex}
                          type="button"
                          title={s.name}
                          aria-label={s.name}
                          className={[
                            styles.editSwatch,
                            currentColor.toLowerCase() === s.hex.toLowerCase()
                              ? styles.editSwatchActive
                              : '',
                          ].join(' ')}
                          style={{ backgroundColor: s.hex }}
                          onClick={() => applyColorChange(s.hex)}
                        />
                      ))}
                      <label className={styles.editColorPicker} title="Custom colour">
                        <input
                          type="color"
                          value={currentColor}
                          onChange={(e) => applyColorChange(e.target.value)}
                          aria-label="Custom colour"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* Optional fill / background toggle + Whiteout preset for Text, Rect, Ellipse */}
                {(inspectorKind === 'text' || inspectorKind === 'rect' || inspectorKind === 'ellipse') && (
                  <div className={styles.editControlBlock}>
                    <div className={styles.editFillHeader}>
                      <label className={styles.editCheckboxInline}>
                        <input
                          type="checkbox"
                          checked={Boolean(activeFillValue)}
                          onChange={(e) =>
                            applyFillChange(e.target.checked ? '#ffffff' : null)
                          }
                        />
                        <span>{inspectorKind === 'text' ? 'Background fill' : 'Fill shape'}</span>
                      </label>
                      {(inspectorKind === 'text' || inspectorKind === 'rect') && (
                        <button
                          type="button"
                          className={styles.miniBtn}
                          onClick={applyWhiteoutPreset}
                        >
                          Whiteout (#fff)
                        </button>
                      )}
                    </div>
                    {activeFillValue && (
                      <div className={styles.editSwatchRow}>
                        {['#ffffff', '#fef08a', '#dbeafe', '#fee2e2', '#dcfce7', '#111827'].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            aria-label={`Fill ${hex}`}
                            className={[
                              styles.editSwatch,
                              activeFillValue.toLowerCase() === hex ? styles.editSwatchActive : '',
                            ].join(' ')}
                            style={{ backgroundColor: hex }}
                            onClick={() => applyFillChange(hex)}
                          />
                        ))}
                        <label className={styles.editColorPicker} title="Custom fill colour">
                          <input
                            type="color"
                            value={activeFillValue}
                            onChange={(e) => applyFillChange(e.target.value)}
                            aria-label="Custom fill colour"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                )}

                {/* Stroke width slider */}
                {(inspectorKind === 'rect' ||
                  inspectorKind === 'ellipse' ||
                  inspectorKind === 'line' ||
                  inspectorKind === 'arrow' ||
                  inspectorKind === 'ink') && (
                  <label className={styles.editRangeRow}>
                    <span>
                      Stroke width <strong>{currentStrokeWidth.toFixed(1)} pt</strong>
                    </span>
                    <input
                      type="range"
                      min={inspectorKind === 'rect' || inspectorKind === 'ellipse' ? 0 : 1}
                      max={16}
                      step={0.5}
                      value={currentStrokeWidth}
                      onChange={(e) => applyStrokeWidthChange(Number(e.target.value))}
                    />
                  </label>
                )}

                {/* Image uploader + session image library */}
                {inspectorKind === 'image' && (
                  <div className={styles.editControlBlock}>
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      + Upload image (PNG, JPG, WebP, SVG)
                    </button>
                    {imageAssets.length > 0 && (
                      <div className={styles.editImageGrid}>
                        {imageAssets.map((asset) => (
                          <button
                            key={asset.id}
                            type="button"
                            className={[
                              styles.editImageThumb,
                              activeAssetId === asset.id ? styles.editImageThumbActive : '',
                            ].join(' ')}
                            title={asset.name}
                            onClick={() => {
                              setActiveAssetId(asset.id);
                              setActiveTool('image');
                            }}
                          >
                            <img src={asset.dataUrl} alt={asset.name} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Opacity slider */}
                {inspectorKind !== 'select' && (
                  <label className={styles.editRangeRow}>
                    <span>
                      Opacity <strong>{Math.round(currentOpacity * 100)}%</strong>
                    </span>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={Math.round(currentOpacity * 100)}
                      onChange={(e) => applyOpacityChange(Number(e.target.value) / 100)}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Current page items list */}
            {doc && (
              <div className={styles.signLibSection}>
                <div className={styles.signLibHeader}>
                  <span className={styles.signSectionTitle}>
                    Items on page {pageIndex + 1} ({currentPageItems.length})
                  </span>
                </div>
                {currentPageItems.length === 0 ? (
                  <span className={styles.hint}>No edits on this page yet.</span>
                ) : (
                  <div className={styles.boxList}>
                    {currentPageItems.map((item) => {
                      const info = itemSummaryLabel(item);
                      const isSel = item.id === selectedId;
                      return (
                        <div
                          key={item.id}
                          className={[
                            styles.boxListItem,
                            isSel ? styles.boxListItemSelected : '',
                          ].join(' ')}
                        >
                          <button
                            type="button"
                            className={styles.boxListMain}
                            onClick={() => {
                              setSelectedId(item.id);
                              setActiveTool('select');
                            }}
                          >
                            <span className={styles.boxListTitle}>{info.badge}</span>
                            <span className={styles.boxListMeta}>{info.title}</span>
                          </button>
                          <div className={styles.boxListActions}>
                            <button
                              type="button"
                              className={styles.miniBtn}
                              title="Duplicate"
                              onClick={() => handleDuplicate(item.id)}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className={[styles.miniBtn, styles.miniBtnDanger].join(' ')}
                              title="Delete"
                              onClick={() => handleDelete(item.id)}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Save & Download */}
            {doc && (
              <>
                <Field label="Output file name">
                  <input
                    className={qrStyles.input}
                    type="text"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                  />
                </Field>

                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy || history.present.length === 0}
                  onClick={() => void handleSave()}
                >
                  {busy
                    ? 'Saving PDF…'
                    : `Save & download (${history.present.length} ${history.present.length === 1 ? 'edit' : 'edits'})`}
                </button>
              </>
            )}

            {busy && <Progress fraction={0.65} label="Applying edits losslessly…" />}
            {error && <div className={styles.error}>{error}</div>}
            {notice && <div className={styles.notice}>{notice}</div>}

            {result && doc && (
              <ContinueWith
                currentToolId={EDIT.id}
                files={[{ name: outputName, bytes: result.bytes }]}
              />
            )}
          </>
        }
      >
        {loading && <Progress fraction={0.4} label="Opening PDF…" />}

        {locked && (
          <PasswordPrompt
            fileName={locked.name}
            error={locked.error}
            busy={locked.busy}
            onSubmit={handleUnlock}
            onCancel={() => setLocked(null)}
          />
        )}

        {doc && (
          <>
            {/* Compact responsive drawing tool bar */}
            <div className={styles.editToolbar} role="toolbar" aria-label="PDF editing tools">
              <div className={styles.editToolGroup}>
                {TOOL_BUTTONS.map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    className={[
                      styles.editToolBtn,
                      activeTool === btn.id ? styles.editToolBtnActive : '',
                    ].join(' ')}
                    aria-pressed={activeTool === btn.id}
                    onClick={() => {
                      if (btn.id === 'image' && imageAssets.length === 0) {
                        setActiveTool('image');
                        imageInputRef.current?.click();
                        return;
                      }
                      setActiveTool(btn.id);
                      if (btn.id !== 'select') setSelectedId(null);
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <div className={styles.editToolGroup}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                  onClick={undo}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Shift+Z)"
                  onClick={redo}
                >
                  Redo
                </button>
              </div>
            </div>

            {/* Page navigation, Zoom presets, Clear controls */}
            <div className={styles.canvasToolbar}>
              <div className={styles.canvasNav}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  disabled={pageIndex <= 0}
                  onClick={() => {
                    setSelectedId(null);
                    setPageIndex((i) => Math.max(0, i - 1));
                  }}
                >
                  Prev
                </button>
                <select
                  aria-label="Select page"
                  className={styles.canvasSourceSelect}
                  value={pageIndex}
                  onChange={(e) => {
                    setSelectedId(null);
                    setPageIndex(Number(e.target.value));
                  }}
                >
                  {Array.from({ length: doc.pageCount }, (_, i) => {
                    const count = countsByPage.get(i) ?? 0;
                    return (
                      <option key={i} value={i}>
                        Page {i + 1} / {doc.pageCount}
                        {count > 0 ? ` (${count})` : ''}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  disabled={pageIndex >= doc.pageCount - 1}
                  onClick={() => {
                    setSelectedId(null);
                    setPageIndex((i) => Math.min(doc.pageCount - 1, i + 1));
                  }}
                >
                  Next
                </button>
              </div>

              <div className={styles.editZoomGroup} role="group" aria-label="Zoom">
                {ZOOM_PRESETS.map((z) => (
                  <button
                    key={z}
                    type="button"
                    className={[
                      styles.miniBtn,
                      zoom === z ? styles.editZoomActive : '',
                    ].join(' ')}
                    onClick={() => setZoom(z)}
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>

              <div className={styles.editToolGroup}>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  disabled={currentPageItems.length === 0}
                  onClick={() => {
                    pushItems((prev) => prev.filter((item) => item.pageIndex !== pageIndex));
                    setSelectedId(null);
                  }}
                >
                  Clear page
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  disabled={history.present.length === 0}
                  onClick={() => {
                    pushItems(() => []);
                    setSelectedId(null);
                  }}
                >
                  Clear all
                </button>
              </div>
            </div>

            <PdfEditor
              doc={pdfProxy}
              pageIndex={pageIndex}
              zoom={zoom}
              activeTool={activeTool}
              defaults={defaults}
              items={items}
              assetPreviews={assetPreviews}
              hasArmedImage={imageAssets.length > 0}
              selectedId={selectedId}
              autoEditId={autoEditId}
              onConsumeAutoEdit={() => setAutoEditId(null)}
              onSelect={setSelectedId}
              onCreateItem={handleCreateItem}
              onPlaceTextAt={handlePlaceTextAt}
              onPlaceImageAt={handlePlaceImageAt}
              onLiveChange={handleLiveChange}
              onCommitChange={handleCommitChange}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
              onPageSize={setPageSize}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
