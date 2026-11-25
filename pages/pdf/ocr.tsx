import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, Select } from '../../components/UI/Fields';
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
import { useI18n } from '../../lib/ui/i18n';
import ocrStyles from '../../styles/PdfOcr.module.css';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

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
  const { t } = useI18n();
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
        ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length })
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
        setPwError(t('pdf.ff.wrongPw'));
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
    update(activeLocked.id, { locked: false, error: t('pdf.p.pwRequired') });
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
          label: t('pdf.p.ocr.starting', { name: item.name }),
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
                  ? t('pdf.p.ocr.wordsSuffix', { n: info.wordsSoFar })
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
        setNotice(t('pdf.p.ocr.cancelled'));
      } else {
        setProgress({ fraction: 1, label: t('pdf.p.done') });
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
      setNotice(t('pdf.p.ocr.copyFail'));
    }
  }

  function downloadTxt(text: string, fileName: string) {
    const encoded = new TextEncoder().encode(text);
    download(encoded, fileName, 'text/plain;charset=utf-8');
  }

  const dpiOptions: [string, string][] = React.useMemo(() => [
    ['150', t('pdf.p.ocr.dpi150')],
    ['200', t('pdf.p.ocr.dpi200')],
    ['300', t('pdf.p.ocr.dpi300')],
  ], [t]);

  return (
    <PdfPage
      title={OCR.title}
      showHub
      lead={t('pdf.p.ocr.lead')}
    >
      <ToolWorkspace
        tool={OCR}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.ocr.dropLabel')}
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
            {t('pdf.p.removeAll')}
          </button>
        }
        sidebar={
          <>
            <div className={ocrStyles.langSection} role="group" aria-label={t('pdf.p.ocr.langsAria')}>
              <div className={ocrStyles.langHeader}>
                <span className={ocrStyles.langTitle}>{t('pdf.p.ocr.langsTitle')}</span>
                <span className={ocrStyles.langMeta}>
                  {t('pdf.p.ocr.langsMeta', { n: activeLanguages.length, size: formatApproxMb(totalModelBytes) })}
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
                  {t('pdf.p.ocr.loadCustom')}
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
                        aria-label={t('pdf.p.ocr.removeLangAria', { code: entry.code })}
                        onClick={() => removeCustomLang(entry.code)}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {activeLanguages.length === 0 && (
                <p className={fieldStyles.warning}>{t('pdf.p.ocr.needLang')}</p>
              )}
            </div>

            <div className={styles.options}>
              <Field label={t('pdf.p.ocr.pagesLabel')} help={t('pdf.p.ocr.pagesHelp')}>
                <input
                  type="text"
                  className={fieldStyles.input}
                  value={pageRange}
                  disabled={busy}
                  placeholder={t('pdf.p.ocr.pagesPh')}
                  onChange={(e) => setPageRange(e.target.value)}
                />
              </Field>

              <Field label={t('pdf.p.renderDpi')}>
                <Select value={dpi} onChange={setDpi} options={dpiOptions} disabled={busy} />
              </Field>

              <Checkbox
                label={t('pdf.p.ocr.skipExisting')}
                checked={skipPagesWithText}
                disabled={busy}
                onChange={setSkipPagesWithText}
                wide
              />
            </div>

            <p className={styles.note}>
              {t('pdf.p.ocr.noteBefore')}<code>3 Tr</code>{t('pdf.p.ocr.noteAfter')}
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <div className={ocrStyles.actionRow}>
              <button
                type="button"
                className={styles.primary}
                disabled={busy || ready.length === 0 || activeLanguages.length === 0}
                onClick={runOcrAll}
              >
                {busy
                  ? t('pdf.p.ocr.running')
                  : ready.length > 1
                    ? t('pdf.p.ocr.runMany', { n: ready.length })
                    : t('pdf.p.ocr.runOne')}
              </button>
              {busy && (
                <button type="button" className={ocrStyles.cancelButton} onClick={cancelOcr}>
                  {t('pdf.p.cancel')}
                </button>
              )}
            </div>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1 ? t('pdf.p.ocr.readyOne') : t('pdf.p.ocr.readyMany', { n: outputs.length })}
                </h3>

                <div className={ocrStyles.statsRow}>
                  <span className={ocrStyles.statPill}>
                    {t(totalPagesOcred === 1 ? 'pdf.p.ocr.pagesOcredOne' : 'pdf.p.ocr.pagesOcredMany', { n: totalPagesOcred })}
                  </span>
                  {totalPagesSkipped > 0 && (
                    <span className={ocrStyles.statPill}>
                      {t('pdf.p.ocr.skippedExisting', { n: totalPagesSkipped })}
                    </span>
                  )}
                  <span className={ocrStyles.statPill}>{t('pdf.p.ocr.wordsCount', { n: totalWords })}</span>
                  {totalWords > 0 && <span className={ocrStyles.statPill}>{t('pdf.p.ocr.confPct', { pct: weightedConf })}</span>}
                </div>

                {outputs.length === 1 ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(outputs[0].bytes, outputs[0].name)}
                  >
                    {t('pdf.ff.downloadNamed', { name: outputs[0].name })}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(zipFiles(outputs), 'ocr-pdfs.zip', 'application/zip')}
                  >
                    {t('pdf.p.ocr.downloadAllPdfs')}
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
                    {t('pdf.p.ocr.downloadTxt')}
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    disabled={!combinedText}
                    onClick={copyExtractedText}
                  >
                    {copied ? t('pdf.p.ocr.copied') : t('pdf.p.ocr.copyText')}
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    onClick={() => setShowTextPreview((v) => !v)}
                  >
                    {showTextPreview ? t('pdf.p.ocr.hideText') : t('pdf.p.ocr.showText')}
                  </button>
                </div>

                {showTextPreview && (
                  <div className={ocrStyles.textPreviewWrap}>
                    <div className={ocrStyles.textPreviewHeader}>
                      <span>{t('pdf.p.ocr.extractedText')}</span>
                      <span>{t('pdf.p.ocr.charsCount', { n: combinedText.length })}</span>
                    </div>
                    <pre className={ocrStyles.textPreviewPre}>
                      {combinedText || t('pdf.p.ocr.noText')}
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
                ? t('pdf.p.pwProtected')
                : item.pageCount === null
                  ? '…'
                  : t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount }),
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
                          {t('pdf.p.ocr.cardOcred', { n: res.pagesOcred })}
                          {res.pagesSkipped > 0 ? t('pdf.p.ocr.cardSkipped', { n: res.pagesSkipped }) : ''}
                        </span>
                        <span className={styles.statusKept}>{t('pdf.p.ocr.wordsCount', { n: res.totalWords })}</span>
                        {res.totalWords > 0 && (
                          <span className={styles.statusDone}>{t('pdf.p.ocr.cardConf', { pct: res.avgConfidence })}</span>
                        )}
                      </>
                    ) : item.locked ? (
                      <span className={styles.statusLeft}>{t('pdf.p.pwReqShort')}</span>
                    ) : (
                      <span className={styles.statusPending}>{t('pdf.p.ocr.readyBadge')}</span>
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
