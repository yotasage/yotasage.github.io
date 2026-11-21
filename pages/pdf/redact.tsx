import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { RedactCanvas } from '../../components/PdfTools/RedactCanvas';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, Select } from '../../components/QrGen/fields';
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
  applyRedactions,
  extractPageTextSpans,
  findTextRedactMatches,
  nextRedactId,
  parseHexRgb,
  PII_PRESETS,
  PiiPresetId,
  RedactBox,
  TextSpanBox,
} from '../../lib/pdf/redact';
import { REDACT } from '../../lib/pdf/tools';
import redactStyles from '../../styles/PdfRedact.module.css';
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

interface RedactOutput {
  bytes: Uint8Array;
  redactedPages: number[];
  boxesApplied: number;
  metadataSanitized: boolean;
  verifiedZeroText: boolean;
  remainingTextItems: number;
}

const MAX_HISTORY = 60;

const FILL_SWATCHES = [
  { label: 'Black', hex: '#000000' },
  { label: 'White', hex: '#ffffff' },
  { label: 'Charcoal', hex: '#222222' },
];

function boxesOverlapHeavily(a: RedactBox, b: RedactBox): boolean {
  if (a.pageIndex !== b.pageIndex) return false;
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return false;
  const inter = (x1 - x0) * (y1 - y0);
  const minArea = Math.min(a.width * a.height, b.width * b.height);
  return minArea > 0 && inter / minArea > 0.82;
}

export default function RedactPdfPage() {
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [pdfProxy, setPdfProxy] = React.useState<PDFDocumentProxy | null>(null);
  const closeProxyRef = React.useRef<(() => Promise<void>) | null>(null);
  const spansCacheRef = React.useRef<Map<number, TextSpanBox[]>>(new Map());
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageJump, setPageJump] = React.useState('1');

  const [boxes, setBoxes] = React.useState<RedactBox[]>([]);
  const [history, setHistory] = React.useState<RedactBox[][]>([]);
  const [future, setFuture] = React.useState<RedactBox[][]>([]);
  const dragSnapshotRef = React.useRef<RedactBox[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [previewFinal, setPreviewFinal] = React.useState(false);

  const [searchText, setSearchText] = React.useState('');
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [useRegex, setUseRegex] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [scanStatus, setScanStatus] = React.useState<string | null>(null);

  const [fillColor, setFillColor] = React.useState('#000000');
  const [overlayText, setOverlayText] = React.useState('');
  const [dpi, setDpi] = React.useState<'150' | '200' | '300'>('200');
  const [sanitizeMetadata, setSanitizeMetadata] = React.useState(true);
  const [fileName, setFileName] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<{ fraction: number; label: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RedactOutput | null>(null);

  const closeCurrentProxy = React.useCallback(() => {
    const closer = closeProxyRef.current;
    closeProxyRef.current = null;
    setPdfProxy(null);
    spansCacheRef.current.clear();
    if (closer) void closer().catch(() => undefined);
  }, []);

  React.useEffect(() => () => closeCurrentProxy(), [closeCurrentProxy]);

  React.useEffect(() => {
    setPageJump(String(pageIndex + 1));
  }, [pageIndex]);

  React.useEffect(() => {
    setResult(null);
  }, [doc, boxes, fillColor, overlayText, dpi, sanitizeMetadata]);

  const commitBoxes = React.useCallback((updater: (prev: RedactBox[]) => RedactBox[], prevOverride?: RedactBox[]) => {
    setBoxes((prev) => {
      const next = updater(prev);
      const snapshot = prevOverride ?? prev;
      setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), snapshot]);
      setFuture([]);
      return next;
    });
  }, []);

  const handleUndo = React.useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const previous = h[h.length - 1];
      setBoxes((curr) => {
        setFuture((f) => [curr, ...f.slice(0, MAX_HISTORY - 1)]);
        return previous;
      });
      setSelectedId(null);
      return h.slice(0, -1);
    });
  }, []);

  const handleRedo = React.useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setBoxes((curr) => {
        setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), curr]);
        return next;
      });
      setSelectedId(null);
      return f.slice(1);
    });
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setScanStatus(null);
    setLoading(true);
    try {
      const handle = await openPdf(bytes, password);
      closeCurrentProxy();
      closeProxyRef.current = handle.close;
      setPdfProxy(handle.doc);
      setLocked(null);
      setDoc({ name, bytes, pageCount: handle.doc.numPages, password });
      setPageIndex(0);
      setBoxes([]);
      setHistory([]);
      setFuture([]);
      setSelectedId(null);
      setPreviewFinal(false);
      setFileName(`${baseName(name)}-redacted`);
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
    setNotice(files.length > 1 ? 'Only the first PDF was opened. Redact PDF works on one file at a time.' : null);
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
    setBoxes([]);
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setResult(null);
    setError(null);
    setNotice(null);
    setScanStatus(null);
  }

  const pageCount = doc?.pageCount ?? 0;
  const currentPageBoxes = React.useMemo(
    () => boxes.filter((b) => b.pageIndex === pageIndex),
    [boxes, pageIndex],
  );
  const selectedBox = React.useMemo(
    () => boxes.find((b) => b.id === selectedId) ?? null,
    [boxes, selectedId],
  );

  const [r, g, b] = parseHexRgb(fillColor);
  const overlayTextColor = r * 0.299 + g * 0.587 + b * 0.114 > 140 ? '#000000' : '#ffffff';

  const handleAddBox = React.useCallback(
    (partial: Omit<RedactBox, 'id'>) => {
      const created: RedactBox = { ...partial, id: nextRedactId('man') };
      commitBoxes((prev) => [...prev, created]);
      setSelectedId(created.id);
    },
    [commitBoxes],
  );

  const handleUpdateBox = React.useCallback(
    (id: string, rect: { x: number; y: number; width: number; height: number }, commit: boolean) => {
      if (!commit) {
        setBoxes((prev) => {
          if (!dragSnapshotRef.current) dragSnapshotRef.current = prev;
          return prev.map((box) => (box.id === id ? { ...box, ...rect } : box));
        });
      } else {
        const snapshot = dragSnapshotRef.current;
        dragSnapshotRef.current = null;
        commitBoxes(
          (prev) => prev.map((box) => (box.id === id ? { ...box, ...rect } : box)),
          snapshot ?? undefined,
        );
      }
    },
    [commitBoxes],
  );

  const handleDeleteBox = React.useCallback(
    (id: string) => {
      commitBoxes((prev) => prev.filter((box) => box.id !== id));
      setSelectedId((curr) => (curr === id ? null : curr));
    },
    [commitBoxes],
  );

  function applySelectedToAllPages() {
    if (!selectedBox || !doc || doc.pageCount <= 1) return;
    commitBoxes((prev) => {
      const additions: RedactBox[] = [];
      for (let p = 0; p < doc.pageCount; p++) {
        if (p === selectedBox.pageIndex) continue;
        const candidate: RedactBox = {
          id: nextRedactId('dup'),
          pageIndex: p,
          x: selectedBox.x,
          y: selectedBox.y,
          width: selectedBox.width,
          height: selectedBox.height,
          source: selectedBox.source,
          matchedText: selectedBox.matchedText,
        };
        if (!prev.some((existing) => boxesOverlapHeavily(existing, candidate))) {
          additions.push(candidate);
        }
      }
      return additions.length ? [...prev, ...additions] : prev;
    });
  }

  async function getCachedSpans(proxy: PDFDocumentProxy, pIndex: number): Promise<TextSpanBox[]> {
    const cached = spansCacheRef.current.get(pIndex);
    if (cached) return cached;
    const page = await proxy.getPage(pIndex + 1);
    try {
      const spans = await extractPageTextSpans(page);
      spansCacheRef.current.set(pIndex, spans);
      return spans;
    } finally {
      try {
        page.cleanup();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  async function runAutoMark(query: { text?: string; caseSensitive?: boolean; regex?: boolean; preset?: PiiPresetId }, label: string) {
    if (!pdfProxy || !doc) return;
    setError(null);
    setScanStatus(`Scanning ${doc.pageCount} page${doc.pageCount === 1 ? '' : 's'} for ${label}…`);
    setScanning(true);
    try {
      const found: RedactBox[] = [];
      let totalSpans = 0;
      for (let p = 0; p < doc.pageCount; p++) {
        const spans = await getCachedSpans(pdfProxy, p);
        totalSpans += spans.length;
        const pageMatches = findTextRedactMatches(p, spans, query);
        found.push(...pageMatches);
      }

      if (found.length === 0) {
        if (totalSpans === 0) {
          setScanStatus('No selectable text layer found (scanned PDF). Draw redaction boxes directly on the page.');
        } else {
          setScanStatus(`No matches found for ${label}.`);
        }
        return;
      }

      let addedCount = 0;
      let firstAdded: RedactBox | null = null;
      commitBoxes((prev) => {
        const next = prev.slice();
        for (const cand of found) {
          if (!next.some((existing) => boxesOverlapHeavily(existing, cand))) {
            next.push(cand);
            addedCount += 1;
            if (!firstAdded) firstAdded = cand;
          }
        }
        return next;
      });

      if (addedCount > 0) {
        setScanStatus(`Marked ${addedCount} match${addedCount === 1 ? '' : 'es'} for ${label}.`);
        if (firstAdded) {
          setPageIndex((firstAdded as RedactBox).pageIndex);
          setSelectedId((firstAdded as RedactBox).id);
        }
      } else {
        setScanStatus(`All ${found.length} match${found.length === 1 ? '' : 'es'} for ${label} are already marked.`);
      }
    } catch (e) {
      setError(errorMessage(e));
      setScanStatus(null);
    } finally {
      setScanning(false);
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = searchText.trim();
    if (!q) return;
    void runAutoMark({ text: q, caseSensitive, regex: useRegex }, `"${q}"`);
  }

  function jumpToPage(raw: string) {
    setPageJump(raw);
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) {
      setPageIndex(n - 1);
    }
  }

  const outputName = `${safeFileName(fileName, 'redacted').replace(/\.pdf$/i, '')}.pdf`;

  async function handleApplyRedactions() {
    if (!doc || boxes.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setProgress({ fraction: 0.04, label: 'Preparing redactions…' });

    try {
      const res = await applyRedactions(doc.bytes, boxes, {
        fillColor,
        overlayText,
        overlayTextColor,
        dpi: Number(dpi),
        sanitizeMetadata,
        password: doc.password,
        onProgress: (fraction, label) => setProgress({ fraction: fraction * 0.9, label }),
      });

      setProgress({ fraction: 0.94, label: 'Verifying redacted pages contain zero text…' });
      let remainingTextItems = 0;
      const verifyHandle = await openPdf(res.bytes);
      try {
        for (const pageNum of res.redactedPages) {
          const vPage = await verifyHandle.doc.getPage(pageNum);
          try {
            const content = await vPage.getTextContent();
            for (const item of content.items) {
              if (item && typeof item === 'object' && 'str' in item && String((item as { str: unknown }).str).trim()) {
                remainingTextItems += 1;
              }
            }
          } finally {
            try {
              vPage.cleanup();
            } catch {
              // Ignore cleanup errors.
            }
          }
        }
      } finally {
        await verifyHandle.close().catch(() => undefined);
      }

      setResult({
        bytes: res.bytes,
        redactedPages: res.redactedPages,
        boxesApplied: res.boxesApplied,
        metadataSanitized: res.metadataSanitized,
        verifiedZeroText: remainingTextItems === 0,
        remainingTextItems,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const redactedPageCount = React.useMemo(() => new Set(boxes.map((b) => b.pageIndex)).size, [boxes]);

  return (
    <PdfPage
      title={REDACT.title}
      showHub
      lead="Permanently burn sensitive text, PII and regions out of your PDF by rasterizing redacted pages to pixels and scrubbing hidden metadata. Everything stays in your browser."
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
      {loading && !doc && !locked && <Progress fraction={0.45} label="Loading PDF pages…" />}

      <ToolWorkspace
        tool={REDACT}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel="Select a PDF file"
        dropLabel="or drop a PDF here"
        addLabel="Replace PDF"
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <div className={redactStyles.toolbarGroup}>
            <div className={styles.canvasNav}>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              >
                &larr; Prev
              </button>
              <input
                type="number"
                className={styles.pageNavInput}
                min={1}
                max={Math.max(1, pageCount)}
                aria-label="Current page number"
                value={pageJump}
                onChange={(e) => jumpToPage(e.target.value)}
                onBlur={() => setPageJump(String(pageIndex + 1))}
              />
              <span className={styles.canvasPageInfo}>/ {pageCount}</span>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={pageIndex >= pageCount - 1}
                onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
              >
                Next &rarr;
              </button>
            </div>

            <button
              type="button"
              className={redactStyles.toggleBtn}
              disabled={history.length === 0}
              onClick={handleUndo}
              title="Undo (Ctrl+Z)"
            >
              Undo
            </button>
            <button
              type="button"
              className={redactStyles.toggleBtn}
              disabled={future.length === 0}
              onClick={handleRedo}
              title="Redo (Ctrl+Y)"
            >
              Redo
            </button>
            <button
              type="button"
              aria-pressed={previewFinal}
              className={[redactStyles.toggleBtn, previewFinal ? redactStyles.toggleBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setPreviewFinal((v) => !v)}
            >
              {previewFinal ? 'Preview: Final' : 'Preview final'}
            </button>
            {selectedBox && pageCount > 1 && (
              <button
                type="button"
                className={redactStyles.toggleBtn}
                onClick={applySelectedToAllPages}
              >
                Apply selected to all pages
              </button>
            )}
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              Close
            </button>
          </div>
        }
        sidebar={
          <>
            <div className={redactStyles.sectionBlock}>
              <h3 className={redactStyles.sectionTitle}>Search &amp; auto-mark</h3>
              <form className={redactStyles.searchRow} onSubmit={handleSearchSubmit}>
                <input
                  type="text"
                  className={redactStyles.searchInput}
                  placeholder={useRegex ? 'Regex pattern…' : 'Find text across all pages…'}
                  aria-label="Search text to redact"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <button
                  type="submit"
                  className={styles.buttonSmall}
                  disabled={scanning || !searchText.trim()}
                >
                  Find &amp; mark
                </button>
              </form>

              <div className={redactStyles.searchFlags}>
                <Checkbox label="Case-sensitive" checked={caseSensitive} onChange={setCaseSensitive} />
                <Checkbox label="Regex" checked={useRegex} onChange={setUseRegex} />
              </div>

              <div className={redactStyles.piiGrid} role="group" aria-label="One-click PII presets">
                {PII_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={redactStyles.piiBtn}
                    title={preset.description}
                    disabled={scanning}
                    onClick={() => void runAutoMark({ preset: preset.id }, preset.label)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {scanStatus && <p className={redactStyles.scanStatus}>{scanStatus}</p>}
            </div>

            <div className={redactStyles.sectionBlock}>
              <div className={redactStyles.matchHeader}>
                <h3 className={redactStyles.sectionTitle}>
                  Marked redactions ({boxes.length})
                </h3>
                {boxes.length > 0 && (
                  <div className={redactStyles.matchHeaderActions}>
                    {currentPageBoxes.length > 0 && (
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        onClick={() => {
                          commitBoxes((prev) => prev.filter((item) => item.pageIndex !== pageIndex));
                          setSelectedId(null);
                        }}
                      >
                        Clear page
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => {
                        commitBoxes(() => []);
                        setSelectedId(null);
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              {boxes.length === 0 ? (
                <p className={styles.note}>
                  Drag directly on the page to draw redaction boxes, or use Search / PII presets above.
                </p>
              ) : (
                <div className={redactStyles.matchList}>
                  {boxes.map((box, idx) => (
                    <div
                      key={box.id}
                      className={[
                        redactStyles.matchItem,
                        box.id === selectedId ? redactStyles.matchItemSelected : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <button
                        type="button"
                        className={redactStyles.matchSelectBtn}
                        onClick={() => {
                          setPageIndex(box.pageIndex);
                          setSelectedId(box.id);
                        }}
                      >
                        <span className={redactStyles.matchPageTag}>p.{box.pageIndex + 1}</span>
                        <span className={redactStyles.matchLabel}>
                          {box.matchedText
                            ? box.matchedText
                            : `Manual box #${idx + 1}`}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={redactStyles.matchRemoveBtn}
                        aria-label={`Remove redaction on page ${box.pageIndex + 1}`}
                        onClick={() => handleDeleteBox(box.id)}
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={redactStyles.sectionBlock}>
              <h3 className={redactStyles.sectionTitle}>Redaction options</h3>

              <div className={redactStyles.colorGroup} role="group" aria-label="Redaction fill colour">
                <span className={redactStyles.colorGroupLabel}>Fill colour</span>
                <div className={redactStyles.swatchRow}>
                  {FILL_SWATCHES.map((sw) => (
                    <button
                      key={sw.hex}
                      type="button"
                      className={[
                        redactStyles.swatch,
                        fillColor.toLowerCase() === sw.hex ? redactStyles.swatchActive : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setFillColor(sw.hex)}
                    >
                      <span className={redactStyles.swatchChip} style={{ backgroundColor: sw.hex }} />
                      {sw.label}
                    </button>
                  ))}
                  <label className={redactStyles.colorPickerWrap}>
                    <span>Custom</span>
                    <input
                      type="color"
                      aria-label="Custom redaction fill colour"
                      className={redactStyles.colorPicker}
                      value={fillColor}
                      onChange={(e) => setFillColor(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <Field label="Overlay text (optional)" help="Centered text burned into each redaction box.">
                <input
                  className={qrStyles.input}
                  value={overlayText}
                  placeholder="REDACTED"
                  onChange={(e) => setOverlayText(e.target.value)}
                />
              </Field>

              <Field label="Render DPI" help="Resolution used to permanently flatten redacted pages.">
                <Select
                  value={dpi}
                  onChange={setDpi}
                  options={[
                    ['150', '150 DPI (smaller file)'],
                    ['200', '200 DPI (recommended)'],
                    ['300', '300 DPI (high detail)'],
                  ]}
                />
              </Field>

              <Checkbox
                label="Strip metadata & hidden data"
                checked={sanitizeMetadata}
                onChange={setSanitizeMetadata}
              />

              <Field label="File name">
                <input
                  className={qrStyles.input}
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </Field>
            </div>

            <p className={redactStyles.privacyNote}>
              <strong>Irreversible redaction:</strong> pages with redaction boxes are flattened to pixels so underlying
              text and graphics cannot be selected or recovered. Untouched pages are copied losslessly.
            </p>

            {notice && <p className={qrStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}
            {progress && <Progress fraction={progress.fraction} label={progress.label} />}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !doc || boxes.length === 0}
              onClick={handleApplyRedactions}
            >
              {busy
                ? 'Applying redactions…'
                : `Apply ${boxes.length} redaction${boxes.length === 1 ? '' : 's'}`}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>PDF redacted</h3>
                <div
                  className={[
                    redactStyles.verifyBadge,
                    result.verifiedZeroText ? '' : redactStyles.verifyBadgeWarn,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {result.verifiedZeroText
                    ? `Verified: 0 text items remain on ${result.redactedPages.length} redacted page${result.redactedPages.length === 1 ? '' : 's'}.`
                    : `Warning: ${result.remainingTextItems} text item(s) still detected on redacted pages.`}
                  {result.metadataSanitized ? ' Metadata & hidden data scrubbed.' : ''}
                </div>
                <p>
                  {result.boxesApplied} redaction{result.boxesApplied === 1 ? '' : 's'} applied across page
                  {result.redactedPages.length === 1 ? '' : 's'} {result.redactedPages.join(', ')} ·{' '}
                  {formatBytes(result.bytes.length)}.
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result.bytes, outputName)}
                >
                  Download {outputName}
                </button>
                <ContinueWith currentToolId={REDACT.id} files={[{ name: outputName, bytes: result.bytes }]} />
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
              <span className={redactStyles.pageCountBadge}>
                Page {pageIndex + 1}: {currentPageBoxes.length} box{currentPageBoxes.length === 1 ? '' : 'es'} · Total:{' '}
                {boxes.length} ({redactedPageCount} page{redactedPageCount === 1 ? '' : 's'})
              </span>
            </div>

            <p className={styles.canvasTip}>
              Drag on the page to draw a redaction box. Click a box to move, resize, nudge with arrow keys (Shift for
              5&times;), or press Delete to remove.
            </p>

            <RedactCanvas
              doc={pdfProxy}
              pageIndex={pageIndex}
              boxes={currentPageBoxes}
              selectedId={selectedId}
              previewFinal={previewFinal}
              fillColor={fillColor}
              overlayText={overlayText}
              overlayTextColor={overlayTextColor}
              onSelect={setSelectedId}
              onAddBox={handleAddBox}
              onUpdateBox={handleUpdateBox}
              onDeleteBox={handleDeleteBox}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
