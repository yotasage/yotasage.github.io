import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, Select } from '../../components/QrGen/fields';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  nextFrame,
  OutputFile,
  readBytes,
  uid,
  zipFiles,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { ocrPdf, OcrResult } from '../../lib/pdf/ocr';
import { OCR_LANGUAGES } from '../../lib/pdf/ocrRuntime';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { OCR } from '../../lib/pdf/tools';
import ocrStyles from '../../styles/PdfOcr.module.css';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface OcrItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  password?: string;
  locked?: boolean;
}

interface CustomLangEntry {
  code: string;
  fileName: string;
  bytes: Uint8Array;
}

interface ItemResult {
  res?: OcrResult;
  error?: string;
}

const DPI_OPTIONS: [string, string][] = [
  ['150', '150 DPI — fast'],
  ['200', '200 DPI — recommended'],
  ['300', '300 DPI — small print'],
];

function deriveLangCodeFromFileName(fileName: string): string {
  const cleaned = fileName
    .trim()
    .replace(/\.gz$/i, '')
    .replace(/\.traineddata$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '');
  return cleaned || 'custom';
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  return (err as { name?: unknown }).name === 'AbortError';
}

function formatApproxMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export default function OcrPdfPage() {
  const [items, setItems] = React.useState<OcrItem[]>([]);
  const [selectedLangs, setSelectedLangs] = React.useState<string[]>(['eng']);
  const [customLangs, setCustomLangs] = React.useState<CustomLangEntry[]>([]);
  const [pageRange, setPageRange] = React.useState('');
  const [dpi, setDpi] = React.useState('200');
  const [skipPagesWithText, setSkipPagesWithText] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [showTextPreview, setShowTextPreview] = React.useState(true);
  const [copied, setCopied] = React.useState(false);
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const abortRef = React.useRef<AbortController | null>(null);
  const customFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const ids = items.map((it) => it.id).join();
  const langKey = selectedLangs.join('+');
  const customKey = customLangs.map((c) => `${c.code}:${c.bytes.length}`).join(',');
  React.useEffect(() => {
    setResults({});
    setCopied(false);
  }, [ids, langKey, customKey, pageRange, dpi, skipPagesWithText]);

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const update = (id: string, patch: Partial<OcrItem>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(
      pdfs.length < files.length
        ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.`
        : null,
    );
    const added = await Promise.all(
      pdfs.map(async (file): Promise<OcrItem> => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        pageCount: null,
        thumb: null,
        error: null,
      })),
    );
    setItems((list) => [...list, ...added]);

    for (const item of added) {
      pdfPreview(item.bytes)
        .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
        .catch((e) => {
          if (isPasswordError(e)) {
            update(item.id, { locked: true, error: null });
            setPasswordQueue((q) => (q.includes(item.id) ? q : [...q, item.id]));
          } else {
            update(item.id, { error: errorMessage(e) });
          }
        });
    }
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void addFiles(handoffToFiles(handoff));
  }, []);

  const activeLocked = React.useMemo(
    () => passwordQueue.map((id) => items.find((it) => it.id === id && it.locked)).find(Boolean) ?? null,
    [passwordQueue, items],
  );
  const remainingLocked = React.useMemo(
    () =>
      passwordQueue.filter(
        (id) => id !== activeLocked?.id && items.some((it) => it.id === id && it.locked),
      ).length,
    [passwordQueue, items, activeLocked],
  );

  async function unlockActive(password: string) {
    if (!activeLocked) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const p = await pdfPreview(activeLocked.bytes, 240, password);
      update(activeLocked.id, {
        pageCount: p.pageCount,
        thumb: p.thumbnail,
        password,
        locked: false,
        error: null,
      });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    } catch (e) {
      if (isPasswordError(e)) {
        setPwError('Incorrect password. Try again.');
      } else {
        update(activeLocked.id, { locked: false, error: errorMessage(e) });
        setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      }
    } finally {
      setPwBusy(false);
    }
  }

  function cancelUnlock() {
    if (!activeLocked) return;
    update(activeLocked.id, { locked: false, error: 'Password required to open this PDF.' });
    setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    setPwError(null);
  }

  function toggleBundledLang(code: string) {
    setSelectedLangs((prev) => {
      if (prev.includes(code)) {
        return prev.filter((c) => c !== code);
      }
      return [...prev, code];
    });
  }

  async function handleCustomLangFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const addedEntries: CustomLangEntry[] = [];
    for (const file of files) {
      const code = deriveLangCodeFromFileName(file.name);
      const bytes = await readBytes(file);
      if (bytes.length === 0) continue;
      addedEntries.push({ code, fileName: file.name, bytes });
    }
    if (addedEntries.length === 0) return;

    setCustomLangs((prev) => {
      const byCode = new Map<string, CustomLangEntry>();
      for (const entry of prev) byCode.set(entry.code, entry);
      for (const entry of addedEntries) byCode.set(entry.code, entry);
      return Array.from(byCode.values());
    });
    setSelectedLangs((prev) => {
      const next = new Set(prev);
      for (const entry of addedEntries) next.add(entry.code);
      return Array.from(next);
    });
  }

  function removeCustomLang(code: string) {
    setCustomLangs((prev) => prev.filter((c) => c.code !== code));
    setSelectedLangs((prev) => prev.filter((c) => c !== code));
  }

  const activeLanguages = React.useMemo(() => {
    const validCustom = new Set(customLangs.map((c) => c.code));
    const validBundled = new Set(OCR_LANGUAGES.map((l) => l.code));
    return selectedLangs.filter((code) => validBundled.has(code) || validCustom.has(code));
  }, [selectedLangs, customLangs]);

  const totalModelBytes = React.useMemo(() => {
    let sum = 0;
    for (const code of activeLanguages) {
      const bundled = OCR_LANGUAGES.find((l) => l.code === code);
      if (bundled) {
        sum += bundled.approxBytes;
        continue;
      }
      const custom = customLangs.find((c) => c.code === code);
      if (custom) sum += custom.bytes.length;
    }
    return sum;
  }, [activeLanguages, customLangs]);

  const ready = items.filter((it) => !it.error && !it.locked);

  async function runOcrAll() {
    if (ready.length === 0 || activeLanguages.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setNotice(null);
    setCopied(false);
    setResults({});

    const customMap = new Map<string, Uint8Array>();
    for (const entry of customLangs) {
      if (activeLanguages.includes(entry.code)) {
        customMap.set(entry.code, entry.bytes);
      }
    }

    const parsedDpi = Number(dpi) || 200;
    const out: Record<string, ItemResult> = {};
    let cancelled = false;

    try {
      for (let i = 0; i < ready.length; i++) {
        if (controller.signal.aborted) {
          cancelled = true;
          break;
        }
        const item = ready[i];
        setProgress({
          fraction: i / ready.length,
          label: `Starting ${item.name}…`,
        });
        await nextFrame();

        try {
          const res = await ocrPdf(item.bytes, {
            languages: activeLanguages,
            customLangFiles: customMap.size > 0 ? customMap : undefined,
            dpi: parsedDpi,
            pageRange: pageRange.trim() || undefined,
            skipPagesWithText,
            password: item.password,
            signal: controller.signal,
            onProgress: (info) => {
              const wordSuffix =
                typeof info.wordsSoFar === 'number' && info.wordsSoFar > 0
                  ? ` · ${info.wordsSoFar} words`
                  : '';
              const prefix = ready.length > 1 ? `${item.name}: ` : '';
              setProgress({
                fraction: (i + info.fraction) / ready.length,
                label: `${prefix}${info.label}${wordSuffix}`,
              });
            },
          });
          out[item.id] = { res };
        } catch (e) {
          if (isAbortError(e) || controller.signal.aborted) {
            cancelled = true;
            break;
          }
          out[item.id] = { error: errorMessage(e) };
        }
        setResults({ ...out });
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      if (cancelled) {
        setNotice('OCR cancelled.');
      } else {
        setProgress({ fraction: 1, label: 'Done' });
      }
    }
  }

  function cancelOcr() {
    abortRef.current?.abort();
  }

  const succeeded = ready.filter((it) => results[it.id]?.res);
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-ocr.pdf`,
    bytes: results[it.id].res!.bytes,
  }));

  const combinedText = React.useMemo(() => {
    if (succeeded.length === 0) return '';
    if (succeeded.length === 1) return results[succeeded[0].id].res!.extractedText;
    return succeeded
      .map((it) => `===== ${it.name} =====\n${results[it.id].res!.extractedText}`)
      .join('\n\n');
  }, [succeeded, results]);

  const totalPagesOcred = succeeded.reduce((sum, it) => sum + results[it.id].res!.pagesOcred, 0);
  const totalPagesSkipped = succeeded.reduce((sum, it) => sum + results[it.id].res!.pagesSkipped, 0);
  const totalWords = succeeded.reduce((sum, it) => sum + results[it.id].res!.totalWords, 0);
  const weightedConf = React.useMemo(() => {
    let wSum = 0;
    let cSum = 0;
    for (const it of succeeded) {
      const r = results[it.id].res!;
      if (r.totalWords > 0) {
        wSum += r.totalWords;
        cSum += r.avgConfidence * r.totalWords;
      }
    }
    return wSum > 0 ? Math.round((cSum / wSum) * 10) / 10 : 0;
  }, [succeeded, results]);

  const done = !busy && outputs.length > 0;

  async function copyExtractedText() {
    if (!combinedText) return;
    try {
      await navigator.clipboard.writeText(combinedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice('Could not copy to clipboard automatically.');
    }
  }

  function downloadTxt(text: string, fileName: string) {
    const encoded = new TextEncoder().encode(text);
    download(encoded, fileName, 'text/plain;charset=utf-8');
  }

  return (
    <PdfPage
      title={OCR.title}
      showHub
      lead="Turn scanned PDFs into searchable, selectable documents with self-hosted Tesseract OCR. Everything runs locally in your browser."
    >
      <ToolWorkspace
        tool={OCR}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop scanned PDFs here"
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button
            type="button"
            className={styles.buttonSmall}
            disabled={busy}
            onClick={() => {
              setItems([]);
              setResults({});
              setPasswordQueue([]);
              setNotice(null);
            }}
          >
            Remove all
          </button>
        }
        sidebar={
          <>
            <div className={ocrStyles.langSection} role="group" aria-label="OCR languages">
              <div className={ocrStyles.langHeader}>
                <span className={ocrStyles.langTitle}>Recognition languages</span>
                <span className={ocrStyles.langMeta}>
                  {activeLanguages.length} selected · ~{formatApproxMb(totalModelBytes)}
                </span>
              </div>

              <div className={ocrStyles.langGrid}>
                {OCR_LANGUAGES.map((lang) => {
                  const checked = selectedLangs.includes(lang.code);
                  return (
                    <label
                      key={lang.code}
                      className={[ocrStyles.langChip, checked ? ocrStyles.langChipSelected : ''].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy}
                        onChange={() => toggleBundledLang(lang.code)}
                      />
                      <span className={ocrStyles.langChipBody}>
                        <span className={ocrStyles.langChipName}>{lang.label}</span>
                        <span className={ocrStyles.langChipSize}>
                          {lang.code} · {formatApproxMb(lang.approxBytes)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className={ocrStyles.customLangRow}>
                <input
                  ref={customFileInputRef}
                  type="file"
                  accept=".traineddata,.gz"
                  multiple
                  className={ocrStyles.hiddenFileInput}
                  onChange={handleCustomLangFiles}
                />
                <button
                  type="button"
                  className={styles.buttonSmall}
                  disabled={busy}
                  onClick={() => customFileInputRef.current?.click()}
                >
                  Load custom .traineddata
                </button>
              </div>

              {customLangs.length > 0 && (
                <div className={ocrStyles.customLangChips}>
                  {customLangs.map((entry) => (
                    <span key={entry.code} className={ocrStyles.customChip} title={entry.fileName}>
                      <span className={ocrStyles.customChipLabel}>
                        {entry.code} ({formatBytes(entry.bytes.length)})
                      </span>
                      <button
                        type="button"
                        className={ocrStyles.customChipRemove}
                        disabled={busy}
                        aria-label={`Remove custom language ${entry.code}`}
                        onClick={() => removeCustomLang(entry.code)}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {activeLanguages.length === 0 && (
                <p className={qrStyles.warning}>Select at least one language to run OCR.</p>
              )}
            </div>

            <div className={styles.options}>
              <Field label="Pages" help="Leave blank for all pages (e.g. 1-5, 8).">
                <input
                  type="text"
                  className={qrStyles.input}
                  value={pageRange}
                  disabled={busy}
                  placeholder="All pages"
                  onChange={(e) => setPageRange(e.target.value)}
                />
              </Field>

              <Field label="Render DPI">
                <Select value={dpi} onChange={setDpi} options={DPI_OPTIONS} disabled={busy} />
              </Field>

              <Checkbox
                label="Skip pages that already have selectable text"
                checked={skipPagesWithText}
                disabled={busy}
                onChange={setSkipPagesWithText}
                wide
              />
            </div>

            <p className={styles.note}>
              Self-hosted Tesseract.js OCR runs offline in a Web Worker. Recognized words are embedded as an
              invisible text layer (<code>3 Tr</code>) directly over your original page artwork without rasterizing
              or uploading your PDF.
            </p>
            {notice && <p className={qrStyles.warning}>{notice}</p>}

            <div className={ocrStyles.actionRow}>
              <button
                type="button"
                className={styles.primary}
                disabled={busy || ready.length === 0 || activeLanguages.length === 0}
                onClick={runOcrAll}
              >
                {busy
                  ? 'Running OCR…'
                  : ready.length > 1
                    ? `Run OCR on ${ready.length} PDFs`
                    : 'Run OCR'}
              </button>
              {busy && (
                <button type="button" className={ocrStyles.cancelButton} onClick={cancelOcr}>
                  Cancel
                </button>
              )}
            </div>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1 ? 'Searchable PDF ready' : `${outputs.length} searchable PDFs ready`}
                </h3>

                <div className={ocrStyles.statsRow}>
                  <span className={ocrStyles.statPill}>
                    {totalPagesOcred} page{totalPagesOcred === 1 ? '' : 's'} OCR&apos;d
                  </span>
                  {totalPagesSkipped > 0 && (
                    <span className={ocrStyles.statPill}>
                      {totalPagesSkipped} skipped (existing text)
                    </span>
                  )}
                  <span className={ocrStyles.statPill}>{totalWords} words</span>
                  {totalWords > 0 && <span className={ocrStyles.statPill}>{weightedConf}% confidence</span>}
                </div>

                {outputs.length === 1 ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(outputs[0].bytes, outputs[0].name)}
                  >
                    Download {outputs[0].name}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(zipFiles(outputs), 'ocr-pdfs.zip', 'application/zip')}
                  >
                    Download all PDFs (ZIP)
                  </button>
                )}

                <div className={ocrStyles.downloadRow}>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    disabled={!combinedText}
                    onClick={() =>
                      downloadTxt(
                        combinedText,
                        succeeded.length === 1 ? `${baseName(succeeded[0].name)}-ocr.txt` : 'ocr-extracted-text.txt',
                      )
                    }
                  >
                    Download .txt
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    disabled={!combinedText}
                    onClick={copyExtractedText}
                  >
                    {copied ? 'Copied!' : 'Copy text'}
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    onClick={() => setShowTextPreview((v) => !v)}
                  >
                    {showTextPreview ? 'Hide text' : 'Show text'}
                  </button>
                </div>

                {showTextPreview && (
                  <div className={ocrStyles.textPreviewWrap}>
                    <div className={ocrStyles.textPreviewHeader}>
                      <span>Extracted text</span>
                      <span>{combinedText.length} chars</span>
                    </div>
                    <pre className={ocrStyles.textPreviewPre}>
                      {combinedText || '(No text recognized on the selected pages.)'}
                    </pre>
                  </div>
                )}

                <ContinueWith currentToolId={OCR.id} files={outputs} />
              </div>
            )}
          </>
        }
      >
        {activeLocked && (
          <PasswordPrompt
            fileName={activeLocked.name}
            error={pwError}
            busy={pwBusy}
            remaining={remainingLocked}
            onSubmit={unlockActive}
            onCancel={cancelUnlock}
          />
        )}

        <FileGrid
          items={items}
          onChange={setItems}
          sortable={false}
          renderCard={(item, _index, controls) => {
            const r = results[item.id];
            const res = r?.res;
            const outPdfName = `${baseName(item.name)}-ocr.pdf`;
            const outTxtName = `${baseName(item.name)}-ocr.txt`;

            const metaParts = [
              item.locked
                ? 'Password protected'
                : item.pageCount === null
                  ? '…'
                  : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`,
              formatBytes(item.bytes.length),
            ];

            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={metaParts.join(' · ')}
                error={item.error ?? r?.error}
                controls={controls}
                actions={
                  res && (
                    <>
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        onClick={() => download(res.bytes, outPdfName)}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        disabled={!res.extractedText}
                        onClick={() => downloadTxt(res.extractedText, outTxtName)}
                      >
                        .txt
                      </button>
                    </>
                  )
                }
              >
                {!item.error && (
                  <div className={styles.badgeRow}>
                    {res ? (
                      <>
                        <span className={styles.statusDone}>
                          {res.pagesOcred} OCR&apos;d
                          {res.pagesSkipped > 0 ? ` · ${res.pagesSkipped} skipped` : ''}
                        </span>
                        <span className={styles.statusKept}>{res.totalWords} words</span>
                        {res.totalWords > 0 && (
                          <span className={styles.statusDone}>{res.avgConfidence}% conf</span>
                        )}
                      </>
                    ) : item.locked ? (
                      <span className={styles.statusLeft}>Password required</span>
                    ) : (
                      <span className={styles.statusPending}>Ready for OCR</span>
                    )}
                  </div>
                )}
              </FileCard>
            );
          }}
        />
      </ToolWorkspace>
    </PdfPage>
  );
}
