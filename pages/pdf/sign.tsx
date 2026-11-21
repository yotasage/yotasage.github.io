import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { SignCanvas } from '../../components/PdfTools/SignCanvas';
import { SIGNATURE_INK_COLORS, SignatureAsset, SignaturePad } from '../../components/PdfTools/SignaturePad';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/QrGen/fields';
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
import {
  ApplySignaturesResult,
  SignatureImagePlacement,
  SignaturePlacement,
  SignatureTextFont,
  SignatureTextPlacement,
} from '../../lib/pdf/sign';
import { SIGN } from '../../lib/pdf/tools';
import { runApplySignatures } from '../../lib/pdf/workerClient';
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

type ArmedTool =
  | { kind: 'signature'; assetId: string }
  | { kind: 'date' }
  | { kind: 'text' };

interface HistoryState {
  past: SignaturePlacement[][];
  present: SignaturePlacement[];
  future: SignaturePlacement[][];
}

const EMPTY_HISTORY: HistoryState = { past: [], present: [], future: [] };
const MAX_HISTORY = 60;

function makePlacementId(): string {
  return `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export default function SignPdfPage() {
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [pdfProxy, setPdfProxy] = React.useState<PDFDocumentProxy | null>(null);
  const closeProxyRef = React.useRef<(() => Promise<void>) | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number }>({
    width: 595.28,
    height: 841.89,
  });

  // Session signature library & creator UI
  const [library, setLibrary] = React.useState<SignatureAsset[]>([]);
  const [activeAssetId, setActiveAssetId] = React.useState<string | null>(null);
  const [showPad, setShowPad] = React.useState(true);

  // Placements + undo/redo history
  const [history, setHistory] = React.useState<HistoryState>(EMPTY_HISTORY);
  // Live drag overlay overrides without pushing history every frame.
  const [liveOverrides, setLiveOverrides] = React.useState<Record<string, Partial<SignaturePlacement>>>({});
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [armed, setArmed] = React.useState<ArmedTool | null>(null);

  const [fileName, setFileName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<ApplySignaturesResult | null>(null);

  const closeCurrentProxy = React.useCallback(() => {
    const closer = closeProxyRef.current;
    closeProxyRef.current = null;
    setPdfProxy(null);
    if (closer) void closer().catch(() => undefined);
  }, []);

  React.useEffect(() => () => closeCurrentProxy(), [closeCurrentProxy]);

  const placements = React.useMemo<SignaturePlacement[]>(() => {
    if (Object.keys(liveOverrides).length === 0) return history.present;
    return history.present.map((p) => {
      const ov = liveOverrides[p.id];
      return ov ? ({ ...p, ...ov } as SignaturePlacement) : p;
    });
  }, [history.present, liveOverrides]);

  const assetPreviews = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const item of library) map[item.id] = item.dataUrl;
    return map;
  }, [library]);

  const countsByPage = React.useMemo(() => {
    const map = new Map<number, number>();
    for (const p of history.present) {
      map.set(p.pageIndex, (map.get(p.pageIndex) ?? 0) + 1);
    }
    return map;
  }, [history.present]);

  const currentPageCount = countsByPage.get(pageIndex) ?? 0;
  const totalCount = history.present.length;
  const selectedPlacement = React.useMemo(
    () => placements.find((p) => p.id === selectedId) ?? null,
    [placements, selectedId],
  );

  React.useEffect(() => {
    setResult(null);
  }, [doc, history.present]);

  const commitPlacements = React.useCallback(
    (updater: (prev: SignaturePlacement[]) => SignaturePlacement[]) => {
      setLiveOverrides({});
      setHistory((prev) => {
        const next = updater(prev.present);
        if (next === prev.present) return prev;
        const past = [...prev.past, prev.present].slice(-MAX_HISTORY);
        return { past, present: next, future: [] };
      });
    },
    [],
  );

  const handleUndo = React.useCallback(() => {
    setLiveOverrides({});
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future].slice(0, MAX_HISTORY),
      };
    });
  }, []);

  const handleRedo = React.useCallback(() => {
    setLiveOverrides({});
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        past: [...prev.past, prev.present].slice(-MAX_HISTORY),
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  // Global keyboard undo/redo when not editing a text input.
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape' && armed) {
        setArmed(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, armed]);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const handle = await openPdf(bytes, password);
      closeCurrentProxy();
      closeProxyRef.current = handle.close;
      setPdfProxy(handle.doc);
      setLocked(null);
      setDoc({ name, bytes, pageCount: handle.doc.numPages, password });
      setPageIndex(0);
      setHistory(EMPTY_HISTORY);
      setLiveOverrides({});
      setSelectedId(null);
      setArmed(null);
      setFileName(`${baseName(name)}-signed`);
    } catch (e) {
      if (isPasswordError(e)) {
        setLocked({
          name,
          bytes,
          error: password !== undefined ? 'Incorrect password. Try again.' : null,
          busy: false,
        });
      } else {
        setLocked(null);
        setError(errorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadFile(files: File[]) {
    const pdf = files.find(isPdf);
    if (!pdf) {
      setNotice('Please select a PDF file.');
      return;
    }
    setNotice(files.length > 1 ? 'Only the first PDF was opened. Sign PDF works on one file at a time.' : null);
    setLocked(null);
    try {
      const bytes = await readBytes(pdf);
      await openBytes(pdf.name, bytes);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void loadFile(handoffToFiles(handoff));
  }, []);

  function clearDoc() {
    closeCurrentProxy();
    setDoc(null);
    setLocked(null);
    setHistory(EMPTY_HISTORY);
    setLiveOverrides({});
    setSelectedId(null);
    setArmed(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  function buildImagePlacement(asset: SignatureAsset, centerX: number, centerY: number): SignatureImagePlacement {
    const targetNormW = 0.24;
    const aspect = asset.height / Math.max(1, asset.width);
    const pageAspect = pageSize.width / Math.max(1, pageSize.height);
    let normW = targetNormW;
    let normH = normW * aspect * pageAspect;
    if (normH > 0.22) {
      normH = 0.22;
      normW = normH / Math.max(0.05, aspect * pageAspect);
    }
    normW = clamp(normW, 0.06, 0.7);
    normH = clamp(normH, 0.03, 0.4);
    const left = clamp(centerX - normW / 2, 0, Math.max(0, 1 - normW));
    const top = clamp(centerY - normH / 2, 0, Math.max(0, 1 - normH));
    return {
      id: makePlacementId(),
      pageIndex,
      kind: 'image',
      assetId: asset.id,
      imageBytes: asset.pngBytes,
      imageType: 'png',
      left,
      top,
      width: normW,
      height: normH,
      opacity: 1,
    };
  }

  function buildTextPlacement(
    text: string,
    centerX: number,
    centerY: number,
    opts?: { font?: SignatureTextFont; fontSize?: number; widthFrac?: number },
  ): SignatureTextPlacement {
    const normW = opts?.widthFrac ?? 0.22;
    const fontSize = opts?.fontSize ?? 13;
    const normH = clamp((fontSize * 1.55) / Math.max(1, pageSize.height), 0.028, 0.14);
    const left = clamp(centerX - normW / 2, 0, Math.max(0, 1 - normW));
    const top = clamp(centerY - normH / 2, 0, Math.max(0, 1 - normH));
    return {
      id: makePlacementId(),
      pageIndex,
      kind: 'text',
      text,
      font: opts?.font ?? 'helvetica',
      fontSize,
      color: '#111827',
      left,
      top,
      width: normW,
      height: normH,
      opacity: 1,
    };
  }

  function handleSignatureCreated(asset: SignatureAsset) {
    setLibrary((prev) => [...prev, asset]);
    setActiveAssetId(asset.id);
    setShowPad(false);
    setArmed({ kind: 'signature', assetId: asset.id });
    setNotice(null);
  }

  function handleDeleteAsset(assetId: string) {
    setLibrary((prev) => {
      const next = prev.filter((item) => item.id !== assetId);
      if (activeAssetId === assetId) {
        setActiveAssetId(next[0]?.id ?? null);
      }
      if (next.length === 0) setShowPad(true);
      return next;
    });
    setArmed((prev) => (prev?.kind === 'signature' && prev.assetId === assetId ? null : prev));
  }

  function handlePlaceAt(normX: number, normY: number) {
    if (!armed) return;
    let created: SignaturePlacement | null = null;
    if (armed.kind === 'signature') {
      const asset = library.find((item) => item.id === armed.assetId);
      if (!asset) {
        setArmed(null);
        return;
      }
      created = buildImagePlacement(asset, normX, normY);
    } else if (armed.kind === 'date') {
      created = buildTextPlacement(formatTodayIso(), normX, normY, { widthFrac: 0.18, fontSize: 12 });
    } else {
      const activeAsset = library.find((item) => item.id === activeAssetId);
      const defaultName = activeAsset && activeAsset.source === 'type' ? activeAsset.label : 'Full Name';
      created = buildTextPlacement(defaultName, normX, normY, { widthFrac: 0.24, fontSize: 13 });
    }

    if (created) {
      const nextItem = created;
      commitPlacements((prev) => [...prev, nextItem]);
      setSelectedId(nextItem.id);
      setArmed(null);
    }
  }

  function handleQuickPlaceSignature() {
    const asset = library.find((item) => item.id === activeAssetId) ?? library[0] ?? null;
    if (!asset) {
      setShowPad(true);
      setNotice('Create a signature first using the Draw, Type, or Upload pad.');
      return;
    }
    setActiveAssetId(asset.id);
    setArmed((prev) =>
      prev?.kind === 'signature' && prev.assetId === asset.id
        ? null
        : { kind: 'signature', assetId: asset.id },
    );
  }

  function handleQuickAddDate() {
    const offset = (currentPageCount % 5) * 0.03;
    const item = buildTextPlacement(formatTodayIso(), 0.78 - offset, 0.85 - offset, {
      widthFrac: 0.18,
      fontSize: 12,
    });
    commitPlacements((prev) => [...prev, item]);
    setSelectedId(item.id);
    setArmed(null);
  }

  function handleQuickAddText() {
    const activeAsset = library.find((item) => item.id === activeAssetId);
    const defaultName = activeAsset && activeAsset.source === 'type' ? activeAsset.label : 'Printed Name';
    const offset = (currentPageCount % 5) * 0.03;
    const item = buildTextPlacement(defaultName, 0.35 + offset, 0.85 - offset, {
      widthFrac: 0.24,
      fontSize: 13,
    });
    commitPlacements((prev) => [...prev, item]);
    setSelectedId(item.id);
    setArmed(null);
  }

  function handleApplySelectedToAllPages() {
    if (!doc || !selectedPlacement || doc.pageCount <= 1) return;
    const source = selectedPlacement;
    const clones: SignaturePlacement[] = [];
    for (let idx = 0; idx < doc.pageCount; idx++) {
      if (idx === source.pageIndex) continue;
      clones.push({
        ...source,
        id: makePlacementId(),
        pageIndex: idx,
      });
    }
    if (clones.length === 0) return;
    commitPlacements((prev) => [...prev, ...clones]);
    setNotice(`Copied selected item to ${clones.length} other page${clones.length === 1 ? '' : 's'}.`);
  }

  function handleDuplicateSelected() {
    if (!selectedPlacement) return;
    const clone: SignaturePlacement = {
      ...selectedPlacement,
      id: makePlacementId(),
      left: clamp(selectedPlacement.left + 0.025, 0, Math.max(0, 1 - selectedPlacement.width)),
      top: clamp(selectedPlacement.top + 0.025, 0, Math.max(0, 1 - selectedPlacement.height)),
    };
    commitPlacements((prev) => [...prev, clone]);
    setSelectedId(clone.id);
  }

  const handleLiveChange = React.useCallback((id: string, patch: Partial<SignaturePlacement>) => {
    setLiveOverrides((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? {}), ...patch },
    }));
  }, []);

  const handleCommitChange = React.useCallback(
    (id: string, patch: Partial<SignaturePlacement>) => {
      commitPlacements((prev) =>
        prev.map((item) => (item.id === id ? ({ ...item, ...patch } as SignaturePlacement) : item)),
      );
    },
    [commitPlacements],
  );

  const handleDeletePlacement = React.useCallback(
    (id: string) => {
      commitPlacements((prev) => prev.filter((item) => item.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [commitPlacements],
  );

  function handleClearCurrentPage() {
    if (currentPageCount === 0) return;
    commitPlacements((prev) => prev.filter((item) => item.pageIndex !== pageIndex));
    if (selectedPlacement?.pageIndex === pageIndex) setSelectedId(null);
  }

  function handleClearAll() {
    if (totalCount === 0) return;
    commitPlacements(() => []);
    setSelectedId(null);
  }

  const armedHint = React.useMemo(() => {
    if (!armed) return null;
    if (armed.kind === 'signature') {
      const asset = library.find((item) => item.id === armed.assetId);
      return asset ? { label: asset.label } : null;
    }
    return { label: armed.kind === 'date' ? "Today's date" : 'Text stamp' };
  }, [armed, library]);

  const outputName = `${safeFileName(fileName, 'signed').replace(/\.pdf$/i, '')}.pdf`;

  async function handleSavePdf() {
    if (!doc || totalCount === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runApplySignatures(doc.bytes, history.present, doc.password);
      setResult(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const pageCount = doc?.pageCount ?? 0;

  return (
    <PdfPage
      title={SIGN.title}
      showHub
      lead="Draw, type or upload a handwritten signature, place signatures, dates and text stamps anywhere on your PDF, and save locally without uploading a single byte."
    >
      {locked && (
        <PasswordPrompt
          fileName={locked.name}
          error={locked.error}
          busy={locked.busy}
          onSubmit={(pw) => {
            setLocked((prev) => (prev ? { ...prev, busy: true, error: null } : null));
            return openBytes(locked.name, locked.bytes, pw);
          }}
          onCancel={() => setLocked(null)}
        />
      )}
      {error && !doc && <div className={styles.error} style={{ marginBottom: '1rem' }}>{error}</div>}
      {loading && !doc && !locked && <Progress fraction={0.45} label="Opening PDF…" />}

      <ToolWorkspace
        tool={SIGN}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel="Select a PDF file"
        dropLabel="or drop a PDF here"
        addLabel="Replace PDF"
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <>
            <div className={styles.canvasNav}>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={pageIndex <= 0}
                onClick={() => {
                  setPageIndex((i) => Math.max(0, i - 1));
                  setSelectedId(null);
                }}
              >
                &larr; Prev
              </button>
              <select
                className={styles.signPageSelect}
                aria-label="Select page"
                value={pageIndex}
                onChange={(e) => {
                  setPageIndex(Number(e.target.value));
                  setSelectedId(null);
                }}
              >
                {Array.from({ length: pageCount }, (_, idx) => {
                  const cnt = countsByPage.get(idx) ?? 0;
                  return (
                    <option key={idx} value={idx}>
                      Page {idx + 1} / {pageCount}
                      {cnt > 0 ? ` (${cnt})` : ''}
                    </option>
                  );
                })}
              </select>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={pageIndex >= pageCount - 1}
                onClick={() => {
                  setPageIndex((i) => Math.min(pageCount - 1, i + 1));
                  setSelectedId(null);
                }}
              >
                Next &rarr;
              </button>
            </div>
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              Close
            </button>
          </>
        }
        sidebar={
          <>
            <div className={styles.signLibSection}>
              <div className={styles.signLibHeader}>
                <span className={styles.signSectionTitle}>Your signatures ({library.length})</span>
                <button
                  type="button"
                  className={styles.miniBtn}
                  onClick={() => setShowPad((v) => !v)}
                >
                  {showPad ? 'Hide pad' : '+ New signature'}
                </button>
              </div>

              {library.length === 0 ? (
                <p className={styles.note}>
                  Create a signature or initials using the pad on the left to add it to your session library.
                </p>
              ) : (
                <div className={styles.signLibList}>
                  {library.map((asset) => {
                    const isActive = asset.id === activeAssetId;
                    const isArmed = armed?.kind === 'signature' && armed.assetId === asset.id;
                    return (
                      <div
                        key={asset.id}
                        className={[
                          styles.signLibCard,
                          isActive ? styles.signLibCardActive : '',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          className={styles.signLibPickBtn}
                          onClick={() => {
                            setActiveAssetId(asset.id);
                            setArmed({ kind: 'signature', assetId: asset.id });
                          }}
                        >
                          <div className={styles.signLibThumb}>
                            <img src={asset.dataUrl} alt={asset.label} />
                          </div>
                          <span className={styles.signLibMeta}>
                            <strong>{asset.label}</strong>
                            <small>{isArmed ? 'Click page to place' : 'Click to place'}</small>
                          </span>
                        </button>
                        <button
                          type="button"
                          className={[styles.miniBtn, styles.miniBtnDanger].join(' ')}
                          aria-label={`Delete ${asset.label}`}
                          title="Delete from library"
                          onClick={() => handleDeleteAsset(asset.id)}
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedPlacement && (
              <div className={styles.inspectorBox}>
                <div className={styles.inspectorHeader}>
                  <span>
                    {selectedPlacement.kind === 'image' ? 'Selected signature' : 'Selected text stamp'}
                  </span>
                  <span className={styles.inspectorMeta}>Page {selectedPlacement.pageIndex + 1}</span>
                </div>

                {selectedPlacement.kind === 'text' && (
                  <>
                    <Field label="Text">
                      <textarea
                        rows={2}
                        className={styles.formTextarea}
                        value={selectedPlacement.text}
                        onChange={(e) =>
                          handleCommitChange(selectedPlacement.id, { text: e.target.value })
                        }
                      />
                    </Field>

                    <div className={styles.signInspectorGrid}>
                      <Field label="Font">
                        <Select<SignatureTextFont>
                          value={selectedPlacement.font ?? 'helvetica'}
                          onChange={(font) => handleCommitChange(selectedPlacement.id, { font })}
                          options={[
                            ['helvetica', 'Helvetica'],
                            ['helvetica-bold', 'Helvetica Bold'],
                            ['times', 'Times'],
                            ['times-italic', 'Times Italic'],
                            ['courier', 'Courier'],
                          ]}
                        />
                      </Field>
                      <Field label="Size (pt)">
                        <NumberInput
                          value={selectedPlacement.fontSize ?? 13}
                          min={6}
                          max={144}
                          step={1}
                          onChange={(fontSize) => handleCommitChange(selectedPlacement.id, { fontSize })}
                        />
                      </Field>
                    </div>

                    <div className={styles.sigControlsRow}>
                      <span className={styles.note}>Color</span>
                      <div className={styles.sigSwatchGroup}>
                        {SIGNATURE_INK_COLORS.map((swatch) => (
                          <button
                            key={swatch.hex}
                            type="button"
                            title={swatch.label}
                            aria-label={swatch.label}
                            className={[
                              styles.sigSwatch,
                              (selectedPlacement.color ?? '#111827') === swatch.hex
                                ? styles.sigSwatchActive
                                : '',
                            ].join(' ')}
                            style={{ backgroundColor: swatch.hex }}
                            onClick={() => handleCommitChange(selectedPlacement.id, { color: swatch.hex })}
                          />
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <label className={styles.sigRangeLabel}>
                  <span>Opacity {Math.round((selectedPlacement.opacity ?? 1) * 100)}%</span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={selectedPlacement.opacity ?? 1}
                    onChange={(e) =>
                      handleCommitChange(selectedPlacement.id, { opacity: Number(e.target.value) })
                    }
                  />
                </label>

                <div className={styles.presetRow}>
                  {pageCount > 1 && (
                    <button
                      type="button"
                      className={styles.presetBtn}
                      onClick={handleApplySelectedToAllPages}
                    >
                      Apply to all pages
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.presetBtn}
                    onClick={handleDuplicateSelected}
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className={[styles.presetBtn, styles.miniBtnDanger].join(' ')}
                    onClick={() => handleDeletePlacement(selectedPlacement.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span>Placed on this page</span>
                <strong>{currentPageCount}</strong>
              </div>
              <div className={styles.summaryRow}>
                <span>Total across document</span>
                <strong>
                  {totalCount} item{totalCount === 1 ? '' : 's'} ({countsByPage.size} page
                  {countsByPage.size === 1 ? '' : 's'})
                </strong>
              </div>
            </div>

            <Field label="File name">
              <input className={qrStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>

            {notice && <p className={qrStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !doc || totalCount === 0}
              onClick={() => void handleSavePdf()}
            >
              {busy
                ? 'Embedding signatures…'
                : totalCount === 0
                  ? 'Place a signature or stamp to save'
                  : `Sign & save PDF (${totalCount} item${totalCount === 1 ? '' : 's'})`}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>PDF signed</h3>
                <p>
                  Embedded <strong>{result.placedCount}</strong> item{result.placedCount === 1 ? '' : 's'} across{' '}
                  <strong>{result.pagesModified}</strong> page{result.pagesModified === 1 ? '' : 's'} ·{' '}
                  {formatBytes(result.bytes.length)}.
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result.bytes, outputName)}
                >
                  Download {outputName}
                </button>
                <ContinueWith currentToolId={SIGN.id} files={[{ name: outputName, bytes: result.bytes }]} />
              </div>
            )}
          </>
        }
      >
        {doc && (
          <>
            <div className={styles.fileBanner}>
              <strong>{doc.name}</strong>
              <span className={styles.fileBannerMeta}>
                {pageCount} page{pageCount === 1 ? '' : 's'} · {formatBytes(doc.bytes.length)}
              </span>
              {currentPageCount > 0 && (
                <span className={[styles.previewBadge, styles.previewBadgeInfo].join(' ')}>
                  {currentPageCount} item{currentPageCount === 1 ? '' : 's'} on page {pageIndex + 1}
                </span>
              )}
            </div>

            <div className={styles.signActionBar}>
              <button
                type="button"
                className={[
                  styles.buttonSmall,
                  armed?.kind === 'signature' ? styles.signBtnArmed : '',
                ].join(' ')}
                onClick={handleQuickPlaceSignature}
              >
                {armed?.kind === 'signature' ? 'Cancel place' : 'Place signature'}
              </button>
              <button type="button" className={styles.buttonSmall} onClick={handleQuickAddDate}>
                + Today&apos;s date
              </button>
              <button type="button" className={styles.buttonSmall} onClick={handleQuickAddText}>
                + Text stamp
              </button>
              {pageCount > 1 && (
                <button
                  type="button"
                  className={styles.buttonSmall}
                  disabled={!selectedPlacement}
                  onClick={handleApplySelectedToAllPages}
                >
                  Apply selected to all pages
                </button>
              )}
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={history.past.length === 0}
                onClick={handleUndo}
              >
                Undo
              </button>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={history.future.length === 0}
                onClick={handleRedo}
              >
                Redo
              </button>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={currentPageCount === 0}
                onClick={handleClearCurrentPage}
              >
                Clear page
              </button>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={totalCount === 0}
                onClick={handleClearAll}
              >
                Clear all
              </button>
            </div>

            {showPad && (
              <SignaturePad
                defaultLabel={`Signature ${library.length + 1}`}
                onCreate={handleSignatureCreated}
                onCancel={library.length > 0 ? () => setShowPad(false) : undefined}
              />
            )}

            <p className={styles.canvasTip}>
              {armedHint
                ? `Click on the page to place "${armedHint.label}", or press Escape to cancel.`
                : 'Drag any placed signature or stamp to reposition, drag corners to resize, double-click text to edit inline, or use arrow keys / Delete.'}
            </p>

            <SignCanvas
              doc={pdfProxy}
              pageIndex={pageIndex}
              placements={placements}
              assetPreviews={assetPreviews}
              selectedId={selectedId}
              armedHint={armedHint}
              onSelect={setSelectedId}
              onPlaceAt={handlePlaceAt}
              onLiveChange={handleLiveChange}
              onCommitChange={handleCommitChange}
              onDelete={handleDeletePlacement}
              onCancelArm={() => setArmed(null)}
              onPageSize={setPageSize}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
