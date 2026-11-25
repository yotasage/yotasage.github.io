import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { RedactCanvas } from '../../components/PdfTools/RedactCanvas';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, Select } from '../../components/UI/Fields';
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
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import redactStyles from '../../styles/PdfRedact.module.css';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

const PII_KEYS: Record<PiiPresetId, [TranslationKey, TranslationKey]> = {
  emails: ['pdf.red.pii.emails', 'pdf.red.pii.emailsDesc'],
  phones: ['pdf.red.pii.phones', 'pdf.red.pii.phonesDesc'],
  urls: ['pdf.red.pii.urls', 'pdf.red.pii.urlsDesc'],
  cards: ['pdf.red.pii.cards', 'pdf.red.pii.cardsDesc'],
  dates: ['pdf.red.pii.dates', 'pdf.red.pii.datesDesc'],
  ipv4: ['pdf.red.pii.ipv4', 'pdf.red.pii.ipv4Desc'],
};

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

const FILL_SWATCHES: { key: TranslationKey; hex: string }[] = [
  { key: 'pdf.red.black', hex: '#000000' },
  { key: 'pdf.red.white', hex: '#ffffff' },
  { key: 'pdf.red.charcoal', hex: '#222222' },
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
  const { t } = useI18n();
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [pdfProxy, setPdfProxy] = React.useState<PDFDocumentProxy | null>(null);
  const closeProxyRef = React.useRef<(() => Promise<void>) | null>(null);
  const spansCacheRef = React.useRef<Map<number, TextSpanBox[]>>(new Map());
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageJump, setPageJump] = React.useState('1');

  const [boxes, setBoxes] = React.useState<RedactBox[]>([]);
  const boxesRef = React.useRef<RedactBox[]>(boxes);
  boxesRef.current = boxes;
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
          error: password !== undefined ? t('pdf.ff.wrongPw') : null,
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
      setNotice(t('pdf.ff.pickPdf'));
      return;
    }
    setNotice(files.length > 1 ? t('pdf.red.onlyFirst') : null);
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
    setScanStatus(t(doc.pageCount === 1 ? 'pdf.red.scanOne' : 'pdf.red.scanMany', { n: doc.pageCount, label }));
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
          setScanStatus(t('pdf.red.noTextLayer'));
        } else {
          setScanStatus(t('pdf.red.noMatches', { label }));
        }
        return;
      }

      const currentBoxes = boxesRef.current;
      const toAdd: RedactBox[] = [];
      for (const cand of found) {
        const alreadyExists =
          currentBoxes.some((existing) => boxesOverlapHeavily(existing, cand)) ||
          toAdd.some((existing) => boxesOverlapHeavily(existing, cand));
        if (!alreadyExists) {
          toAdd.push(cand);
        }
      }

      if (toAdd.length > 0) {
        commitBoxes((prev) => {
          const next = prev.slice();
          for (const cand of toAdd) {
            if (!next.some((existing) => boxesOverlapHeavily(existing, cand))) {
              next.push(cand);
            }
          }
          return next;
        });
        setScanStatus(t(toAdd.length === 1 ? 'pdf.red.markedOne' : 'pdf.red.markedMany', { n: toAdd.length, label }));
        setPageIndex(toAdd[0].pageIndex);
        setSelectedId(toAdd[0].id);
      } else {
        setScanStatus(t(found.length === 1 ? 'pdf.red.alreadyOne' : 'pdf.red.alreadyMany', { n: found.length, label }));
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
    setProgress({ fraction: 0.04, label: t('pdf.red.preparing') });

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

      setProgress({ fraction: 0.94, label: t('pdf.red.verifying') });
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
      lead={t('pdf.red.lead')}
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
      {loading && !doc && !locked && <Progress fraction={0.45} label={t('pdf.p.loadingPdfPages')} />}

      <ToolWorkspace
        tool={REDACT}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel={t('pdf.p.selectPdfFile')}
        dropLabel={t('pdf.p.dropPdf')}
        addLabel={t('pdf.p.replacePdf')}
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
                {t('pdf.p.prev')}
              </button>
              <input
                type="number"
                className={styles.pageNavInput}
                min={1}
                max={Math.max(1, pageCount)}
                aria-label={t('pdf.crop.curPageAria')}
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
                {t('pdf.p.next')}
              </button>
            </div>

            <button
              type="button"
              className={redactStyles.toggleBtn}
              disabled={history.length === 0}
              onClick={handleUndo}
              title={t('pdf.red.undoTitle')}
            >
              {t('pdf.p.undo')}
            </button>
            <button
              type="button"
              className={redactStyles.toggleBtn}
              disabled={future.length === 0}
              onClick={handleRedo}
              title={t('pdf.red.redoTitle')}
            >
              {t('pdf.p.redo')}
            </button>
            <button
              type="button"
              aria-pressed={previewFinal}
              className={[redactStyles.toggleBtn, previewFinal ? redactStyles.toggleBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => setPreviewFinal((v) => !v)}
            >
              {t(previewFinal ? 'pdf.red.previewOn' : 'pdf.red.previewOff')}
            </button>
            {selectedBox && pageCount > 1 && (
              <button
                type="button"
                className={redactStyles.toggleBtn}
                onClick={applySelectedToAllPages}
              >
                {t('pdf.red.applyAll')}
              </button>
            )}
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              {t('pdf.ff.close')}
            </button>
          </div>
        }
        sidebar={
          <>
            <div className={redactStyles.sectionBlock}>
              <h3 className={redactStyles.sectionTitle}>{t('pdf.red.searchHeading')}</h3>
              <form className={redactStyles.searchRow} onSubmit={handleSearchSubmit}>
                <input
                  type="text"
                  className={redactStyles.searchInput}
                  placeholder={t(useRegex ? 'pdf.red.regexPh' : 'pdf.red.findPh')}
                  aria-label={t('pdf.red.searchAria')}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                <button
                  type="submit"
                  className={styles.buttonSmall}
                  disabled={scanning || !searchText.trim()}
                >
                  {t('pdf.red.findMark')}
                </button>
              </form>

              <div className={redactStyles.searchFlags}>
                <Checkbox label={t('pdf.red.caseSens')} checked={caseSensitive} onChange={setCaseSensitive} />
                <Checkbox label={t('pdf.red.regex')} checked={useRegex} onChange={setUseRegex} />
              </div>

              <div className={redactStyles.piiGrid} role="group" aria-label={t('pdf.red.piiGroupAria')}>
                {PII_PRESETS.map((preset) => {
                  const [labelKey, descKey] = PII_KEYS[preset.id];
                  const label = t(labelKey);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={redactStyles.piiBtn}
                      title={t(descKey)}
                      disabled={scanning}
                      onClick={() => void runAutoMark({ preset: preset.id }, label)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {scanStatus && <p className={redactStyles.scanStatus}>{scanStatus}</p>}
            </div>

            <div className={redactStyles.sectionBlock}>
              <div className={redactStyles.matchHeader}>
                <h3 className={redactStyles.sectionTitle}>
                  {t('pdf.red.markedHeading', { n: boxes.length })}
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
                        {t('pdf.red.clearPage')}
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
                      {t('pdf.ff.clearAll')}
                    </button>
                  </div>
                )}
              </div>

              {boxes.length === 0 ? (
                <p className={styles.note}>{t('pdf.red.emptyNote')}</p>
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
                        <span className={redactStyles.matchPageTag}>{t('pdf.red.pageTag', { n: box.pageIndex + 1 })}</span>
                        <span className={redactStyles.matchLabel}>
                          {box.matchedText
                            ? box.matchedText
                            : t('pdf.red.manualBox', { n: idx + 1 })}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={redactStyles.matchRemoveBtn}
                        aria-label={t('pdf.red.removeAria', { n: box.pageIndex + 1 })}
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
              <h3 className={redactStyles.sectionTitle}>{t('pdf.red.optsHeading')}</h3>

              <div className={redactStyles.colorGroup} role="group" aria-label={t('pdf.red.fillAria')}>
                <span className={redactStyles.colorGroupLabel}>{t('pdf.red.fillLabel')}</span>
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
                      {t(sw.key)}
                    </button>
                  ))}
                  <label className={redactStyles.colorPickerWrap}>
                    <span>{t('pdf.red.custom')}</span>
                    <input
                      type="color"
                      aria-label={t('pdf.red.customFillAria')}
                      className={redactStyles.colorPicker}
                      value={fillColor}
                      onChange={(e) => setFillColor(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <Field label={t('pdf.red.overlayLabel')} help={t('pdf.red.overlayHelp')}>
                <input
                  className={fieldStyles.input}
                  value={overlayText}
                  placeholder={t('pdf.red.overlayPh')}
                  onChange={(e) => setOverlayText(e.target.value)}
                />
              </Field>

              <Field label={t('pdf.p.renderDpi')} help={t('pdf.red.dpiHelp')}>
                <Select
                  value={dpi}
                  onChange={setDpi}
                  options={[
                    ['150', t('pdf.red.dpi150')],
                    ['200', t('pdf.red.dpi200')],
                    ['300', t('pdf.red.dpi300')],
                  ]}
                />
              </Field>

              <Checkbox
                label={t('pdf.red.stripMeta')}
                checked={sanitizeMetadata}
                onChange={setSanitizeMetadata}
              />

              <Field label={t('pdf.ff.fileName')}>
                <input
                  className={fieldStyles.input}
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </Field>
            </div>

            <p className={redactStyles.privacyNote}>
              <strong>{t('pdf.red.privacyBold')}</strong>
              {t('pdf.red.privacyBody')}
            </p>

            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}
            {progress && <Progress fraction={progress.fraction} label={progress.label} />}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !doc || boxes.length === 0}
              onClick={handleApplyRedactions}
            >
              {busy
                ? t('pdf.red.applying')
                : t(boxes.length === 1 ? 'pdf.red.applyOne' : 'pdf.red.applyMany', { n: boxes.length })}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>{t('pdf.red.doneTitle')}</h3>
                <div
                  className={[
                    redactStyles.verifyBadge,
                    result.verifiedZeroText ? '' : redactStyles.verifyBadgeWarn,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {result.verifiedZeroText
                    ? t(result.redactedPages.length === 1 ? 'pdf.red.verifiedOne' : 'pdf.red.verifiedMany', { n: result.redactedPages.length })
                    : t('pdf.red.warnRemaining', { n: result.remainingTextItems })}
                  {result.metadataSanitized ? t('pdf.red.metaScrubbed') : ''}
                </div>
                <p>
                  {t(
                    result.boxesApplied === 1
                      ? result.redactedPages.length === 1
                        ? 'pdf.red.appliedSummaryOne'
                        : 'pdf.red.appliedSummaryOneMulti'
                      : result.redactedPages.length === 1
                        ? 'pdf.red.appliedSummaryManyOne'
                        : 'pdf.red.appliedSummaryMany',
                    {
                      boxes: result.boxesApplied,
                      pages: result.redactedPages.join(', '),
                      size: formatBytes(result.bytes.length),
                    },
                  )}
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result.bytes, outputName)}
                >
                  {t('pdf.ff.downloadNamed', { name: outputName })}
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
                {t(pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: pageCount })} · {formatBytes(doc.bytes.length)}
              </span>
              <span className={redactStyles.pageCountBadge}>
                {t('pdf.red.bannerCount', {
                  page: pageIndex + 1,
                  pageBoxes: t(currentPageBoxes.length === 1 ? 'pdf.red.boxOne' : 'pdf.red.boxMany', { n: currentPageBoxes.length }),
                  total: boxes.length,
                  pages: t(redactedPageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: redactedPageCount }),
                })}
              </span>
            </div>

            <p className={styles.canvasTip}>{t('pdf.red.tip')}</p>

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
