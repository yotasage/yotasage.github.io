import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PageGrid, PageGridItem } from '../../components/PdfTools/PageGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput } from '../../components/UI/Fields';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  OutputFile,
  readBytes,
  safeFileName,
  zipFiles,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import {
  BookmarkSplit,
  formatOrderedRanges,
  parseSplitGroups,
  readTopLevelBookmarks,
  splitAfterFromParts,
  splitByBookmarks,
  splitByBreakPoints,
  splitByEveryN,
  SplitPart,
} from '../../lib/pdf/split';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { SPLIT } from '../../lib/pdf/tools';
import { runSplitPdfBySize, runSplitPdfParts } from '../../lib/pdf/workerClient';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

type SplitMode = 'ranges' | 'everyN' | 'size' | 'bookmarks';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  pool: PdfThumbPool;
  password?: string;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

interface SplitResult {
  files: OutputFile[];
  zipBytes: Uint8Array | null;
  downloadName: string;
  downloadType: string;
  oversizedPages: number[];
}

const MODES: { id: SplitMode; titleKey: TranslationKey; textKey: TranslationKey }[] = [
  { id: 'ranges', titleKey: 'pdf.p.split.mRanges', textKey: 'pdf.p.split.mRangesDesc' },
  { id: 'everyN', titleKey: 'pdf.p.split.mEveryN', textKey: 'pdf.p.split.mEveryNDesc' },
  { id: 'size', titleKey: 'pdf.p.split.mSize', textKey: 'pdf.p.split.mSizeDesc' },
  { id: 'bookmarks', titleKey: 'pdf.p.split.mBookmarks', textKey: 'pdf.p.split.mBookmarksDesc' },
];

const EMPTY_SELECTION = new Set<string>();

export default function SplitPdfPage() {
  const { t } = useI18n();
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [mode, setMode] = React.useState<SplitMode>('ranges');

  // Mode: ranges / split points
  const [breakAfter, setBreakAfter] = React.useState<Set<number>>(new Set());
  const [usingCustomText, setUsingCustomText] = React.useState(false);
  const [customText, setCustomText] = React.useState('');

  // Mode: every N pages
  const [everyN, setEveryN] = React.useState(1);

  // Mode: by file size (MB)
  const [maxSizeMb, setMaxSizeMb] = React.useState(2);
  const [sizeParts, setSizeParts] = React.useState<SplitPart[] | null>(null);

  // Mode: by bookmarks
  const [bookmarks, setBookmarks] = React.useState<BookmarkSplit[]>([]);
  const [bookmarksLoading, setBookmarksLoading] = React.useState(false);
  const [bookmarksError, setBookmarksError] = React.useState<string | null>(null);

  // General state
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SplitResult | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);

  const poolRef = React.useRef<PdfThumbPool | null>(null);
  const loadSeqRef = React.useRef(0);
  React.useEffect(() => () => poolRef.current?.dispose(), []);
  React.useEffect(() => setResult(null), [doc, mode, breakAfter, usingCustomText, customText, everyN, maxSizeMb, fileName]);
  React.useEffect(() => setSizeParts(null), [doc, maxSizeMb]);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setSizeParts(null);
    setLoading(true);
    const seq = ++loadSeqRef.current;
    const pool = new PdfThumbPool(bytes, { password });

    try {
      const pageCount = await pool.open();
      if (seq !== loadSeqRef.current) {
        pool.dispose();
        return;
      }
      poolRef.current?.dispose();
      poolRef.current = pool;
      setLocked(null);
      setDoc({ name, bytes, pageCount, pool, password });
      setBreakAfter(new Set());
      setUsingCustomText(false);
      setCustomText('');
      setEveryN((prev) => Math.max(1, Math.min(pageCount, prev)));
      setFileName(`${baseName(name)}-split`);

      // Automatically read top-level bookmarks in the background.
      setBookmarks([]);
      setBookmarksError(null);
      setBookmarksLoading(true);
      readTopLevelBookmarks(bytes, password)
        .then((list) => {
          if (seq !== loadSeqRef.current) return;
          setBookmarks(list);
        })
        .catch((e) => {
          if (seq !== loadSeqRef.current) return;
          setBookmarksError(errorMessage(e));
        })
        .finally(() => {
          if (seq === loadSeqRef.current) setBookmarksLoading(false);
        });
    } catch (e) {
      pool.dispose();
      if (seq !== loadSeqRef.current) return;
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
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  async function loadFile(files: File[]) {
    const pdf = files.find(isPdf);
    if (!pdf) {
      setNotice(t('pdf.ff.pickPdf'));
      return;
    }
    setNotice(files.length > 1 ? t('pdf.p.onlyFirst') : null);
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
    loadSeqRef.current += 1;
    poolRef.current?.dispose();
    poolRef.current = null;
    setDoc(null);
    setLocked(null);
    setBreakAfter(new Set());
    setUsingCustomText(false);
    setCustomText('');
    setBookmarks([]);
    setBookmarksError(null);
    setBookmarksLoading(false);
    setSizeParts(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  // Compute live parts and validation errors for the active mode.
  const preview = React.useMemo<{ parts: SplitPart[] | null; parseError: string | null }>(() => {
    if (!doc) return { parts: null, parseError: null };
    if (mode === 'ranges') {
      if (usingCustomText) {
        try {
          return { parts: parseSplitGroups(customText, doc.pageCount), parseError: null };
        } catch (e) {
          return { parts: null, parseError: errorMessage(e) };
        }
      }
      return { parts: splitByBreakPoints(doc.pageCount, breakAfter), parseError: null };
    }
    if (mode === 'everyN') {
      return { parts: splitByEveryN(doc.pageCount, everyN), parseError: null };
    }
    if (mode === 'bookmarks') {
      return { parts: splitByBookmarks(doc.pageCount, bookmarks), parseError: null };
    }
    return { parts: sizeParts, parseError: null };
  }, [doc, mode, usingCustomText, customText, breakAfter, everyN, bookmarks, sizeParts]);

  const syncedRangeText = React.useMemo(() => {
    if (!doc) return '';
    const parts = splitByBreakPoints(doc.pageCount, breakAfter);
    return parts.map((p) => formatOrderedRanges(p.pages)).join(', ');
  }, [doc, breakAfter]);

  const splitAfter = React.useMemo<Set<number> | undefined>(() => {
    if (!doc || !preview.parts || preview.parts.length <= 1) return undefined;
    return splitAfterFromParts(preview.parts, doc.pageCount);
  }, [doc, preview.parts]);

  // Map each 0-based page index to the 1-based part number(s) it belongs to for card badges.
  const pagePartNumbers = React.useMemo(() => {
    const map = new Map<number, number[]>();
    if (!preview.parts) return map;
    preview.parts.forEach((part, idx) => {
      for (const p of part.pages) {
        let list = map.get(p);
        if (!list) {
          list = [];
          map.set(p, list);
        }
        if (!list.includes(idx + 1)) list.push(idx + 1);
      }
    });
    return map;
  }, [preview.parts]);

  const items: PageGridItem[] = React.useMemo(() => {
    if (!doc) return [];
    return Array.from({ length: doc.pageCount }, (_, i) => ({
      id: `p-${i}`,
      pool: doc.pool,
      pageIndex: i,
      label: t('pdf.ff.pageN', { n: i + 1 }),
    }));
  }, [doc, t]);

  function toggleBreakAfter(pageIndex: number) {
    if (!doc || pageIndex < 0 || pageIndex >= doc.pageCount - 1) return;
    const base = usingCustomText && preview.parts
      ? splitAfterFromParts(preview.parts, doc.pageCount)
      : breakAfter;
    const next = new Set(base);
    if (next.has(pageIndex)) next.delete(pageIndex);
    else next.add(pageIndex);
    setUsingCustomText(false);
    setBreakAfter(next);
  }

  function handleGridClick(nextSelected: Set<string>) {
    if (!doc || mode !== 'ranges') return;
    const clicked: number[] = [];
    for (const id of nextSelected) {
      const idx = Number(id.slice(2));
      if (Number.isInteger(idx) && idx >= 0 && idx < doc.pageCount - 1) clicked.push(idx);
    }
    if (!clicked.length) return;
    const base = usingCustomText && preview.parts
      ? splitAfterFromParts(preview.parts, doc.pageCount)
      : breakAfter;
    const next = new Set(base);
    for (const idx of clicked) {
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
    }
    setUsingCustomText(false);
    setBreakAfter(next);
  }

  function handleCustomRangeChange(val: string) {
    setUsingCustomText(true);
    setCustomText(val);
    if (!doc) return;
    try {
      const parsed = parseSplitGroups(val, doc.pageCount);
      setBreakAfter(splitAfterFromParts(parsed, doc.pageCount));
    } catch {
      // Wait for user to finish typing a valid range.
    }
  }

  function splitEveryPage() {
    if (!doc) return;
    const all = new Set<number>();
    for (let i = 0; i < doc.pageCount - 1; i++) all.add(i);
    setUsingCustomText(false);
    setBreakAfter(all);
  }

  function clearSplits() {
    setUsingCustomText(false);
    setCustomText('');
    setBreakAfter(new Set());
  }

  const canRun = React.useMemo(() => {
    if (!doc || busy) return false;
    if (mode === 'size') return Number.isFinite(maxSizeMb) && maxSizeMb >= 0.1;
    if (mode === 'bookmarks') return !bookmarksLoading && !!preview.parts && preview.parts.length > 0;
    return !preview.parseError && !!preview.parts && preview.parts.length > 0;
  }, [doc, busy, mode, maxSizeMb, bookmarksLoading, preview]);

  async function applySplit() {
    if (!doc || !canRun) return;
    setBusy(true);
    setError(null);
    setProgress({ fraction: 0, label: '' });

    try {
      let files: OutputFile[];
      let oversizedPages: number[] = [];

      if (mode === 'size') {
        const maxBytes = Math.round(maxSizeMb * 1024 * 1024);
        const out = await runSplitPdfBySize(
          doc.bytes,
          maxBytes,
          { sourceName: doc.name, password: doc.password },
          (fraction, label) => setProgress({ fraction, label }),
        );
        files = out.files;
        oversizedPages = out.oversizedPages;
        setSizeParts(out.parts);
      } else {
        if (!preview.parts || !preview.parts.length) throw new Error(t('pdf.p.split.noParts'));
        files = await runSplitPdfParts(
          doc.bytes,
          preview.parts,
          { sourceName: doc.name, password: doc.password },
          (fraction, label) => setProgress({ fraction, label }),
        );
      }

      if (files.length === 1) {
        const cleanBase = safeFileName(fileName, baseName(doc.name) || 'split').replace(/\.pdf$/i, '');
        setResult({
          files,
          zipBytes: null,
          downloadName: `${cleanBase}.pdf`,
          downloadType: 'application/pdf',
          oversizedPages,
        });
      } else {
        const zip = zipFiles(files);
        const cleanBase = safeFileName(fileName, `${baseName(doc.name)}-split`).replace(/\.zip$/i, '');
        setResult({
          files,
          zipBytes: zip,
          downloadName: `${cleanBase}.zip`,
          downloadType: 'application/zip',
          oversizedPages,
        });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const splitButtonLabel = mode === 'size'
    ? t('pdf.p.split.splitUnder', { mb: maxSizeMb })
    : preview.parts
      ? t(preview.parts.length === 1 ? 'pdf.p.split.splitIntoOne' : 'pdf.p.split.splitIntoMany', { n: preview.parts.length })
      : t('pdf.p.split.splitIntoGeneric');

  return (
    <PdfPage
      title={SPLIT.title}
      showHub
      lead={t('pdf.p.split.lead')}
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
      {loading && !doc && !locked && <Progress fraction={0.4} label={t('pdf.p.opening')} />}

      <ToolWorkspace
        tool={SPLIT}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel={t('pdf.p.selectPdf')}
        dropLabel={t('pdf.p.dropPdf')}
        addLabel={t('pdf.p.replacePdf')}
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={clearDoc}>{t('pdf.ff.close')}</button>}
        sidebar={
          <>
            <div className={styles.levelList} role="radiogroup" aria-label={t('pdf.p.split.modeAria')}>
              {MODES.map((m) => (
                <label key={m.id} className={[styles.level, mode === m.id ? styles.levelSelected : ''].join(' ')}>
                  <input type="radio" name="splitMode" checked={mode === m.id} onChange={() => setMode(m.id)} />
                  <span><strong>{t(m.titleKey)}</strong><small>{t(m.textKey)}</small></span>
                </label>
              ))}
            </div>

            {mode === 'ranges' && (
              <div className={styles.options}>
                <Field
                  label={t('pdf.p.split.rangeGroups')}
                  help={t('pdf.p.split.rangeHelp')}
                >
                  <textarea
                    className={fieldStyles.input}
                    rows={3}
                    style={{ resize: 'vertical', minHeight: '4.5rem' }}
                    placeholder={t('pdf.p.split.rangePh')}
                    value={usingCustomText ? customText : syncedRangeText}
                    onFocus={() => {
                      if (!usingCustomText) setCustomText(syncedRangeText);
                    }}
                    onChange={(e) => handleCustomRangeChange(e.target.value)}
                  />
                </Field>
                {preview.parseError && <div className={styles.fileError}>{preview.parseError}</div>}
              </div>
            )}

            {mode === 'everyN' && (
              <div className={styles.options}>
                <Field label={t('pdf.p.split.pagesPerFile')}>
                  <NumberInput
                    value={everyN}
                    onChange={(v) => setEveryN(Math.max(1, Math.round(v)))}
                    min={1}
                    max={Math.max(1, doc?.pageCount ?? 1)}
                    step={1}
                  />
                </Field>
              </div>
            )}

            {mode === 'size' && (
              <div className={styles.options}>
                <Field
                  label={t('pdf.p.split.maxSize')}
                  help={doc ? t('pdf.p.split.maxSizeHelp', { size: formatBytes(doc.bytes.length) }) : undefined}
                >
                  <NumberInput
                    value={maxSizeMb}
                    onChange={setMaxSizeMb}
                    min={0.1}
                    max={500}
                    step={0.5}
                  />
                </Field>
              </div>
            )}

            {mode === 'bookmarks' && (
              <div className={styles.options}>
                {bookmarksLoading ? (
                  <p className={styles.note}>{t('pdf.p.split.readingBm')}</p>
                ) : bookmarksError ? (
                  <p className={fieldStyles.warning}>{t('pdf.p.split.bmError', { error: bookmarksError })}</p>
                ) : bookmarks.length === 0 ? (
                  <p className={fieldStyles.warning}>
                    {t('pdf.p.split.noBm')}
                  </p>
                ) : (
                  <p className={styles.note}>
                    {t(bookmarks.length === 1 ? 'pdf.p.split.foundBmOne' : 'pdf.p.split.foundBmMany', { n: bookmarks.length })}
                  </p>
                )}
              </div>
            )}

            {preview.parts && preview.parts.length > 0 && (
              <div className={styles.options}>
                <p className={styles.note}>
                  {t(preview.parts.length === 1 ? 'pdf.p.split.outPreviewOne' : 'pdf.p.split.outPreviewMany', { n: preview.parts.length })}
                </p>
                <div className={styles.splitPreviewList}>
                  {preview.parts.map((part, idx) => (
                    <div key={`${idx}-${part.label}`} className={styles.splitPreviewItem}>
                      <span title={part.label}>{idx + 1}. {part.label}</span>
                      <span>
                        {mode === 'bookmarks' ? `${t('pdf.p.split.pShort')} ${formatOrderedRanges(part.pages)} · ` : ''}
                        {part.pages.length} {t('pdf.p.split.pShort')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.options}>
              <Field label={preview.parts && preview.parts.length === 1 ? t('pdf.ff.fileName') : t('pdf.p.zipFileName')}>
                <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
              </Field>
            </div>

            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button type="button" className={styles.primary} disabled={!canRun} onClick={applySplit}>
              {splitButtonLabel}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}

            {result && (
              <div className={styles.result}>
                <h3>
                  {result.files.length === 1
                    ? t('pdf.p.pdfReady')
                    : t('pdf.p.pdfsReady', { n: result.files.length })}
                </h3>
                <p>
                  {result.zipBytes
                    ? t('pdf.p.zipArchive', { size: formatBytes(result.zipBytes.length) })
                    : `${formatBytes(result.files[0].bytes.length)}.`}
                </p>
                {result.oversizedPages.length > 0 && (
                  <p className={fieldStyles.warning}>
                    {t(result.oversizedPages.length === 1 ? 'pdf.p.split.oversizedOne' : 'pdf.p.split.oversizedMany', {
                      ranges: formatOrderedRanges(result.oversizedPages),
                      mb: maxSizeMb,
                    })}
                  </p>
                )}
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(
                    result.zipBytes ?? result.files[0].bytes,
                    result.downloadName,
                    result.downloadType,
                  )}
                >
                  {t('pdf.ff.downloadNamed', { name: result.downloadName })}
                </button>
                {result.files.length === 1 && (
                  <ContinueWith currentToolId={SPLIT.id} files={[{ name: result.downloadName, bytes: result.files[0].bytes }]} />
                )}
                {result.files.length > 1 && (
                  <details>
                    <summary className={styles.note} style={{ cursor: 'pointer' }}>
                      {t('pdf.p.split.downloadParts', { n: result.files.length })}
                    </summary>
                    <div className={styles.splitPreviewList} style={{ marginTop: '0.45rem' }}>
                      {result.files.map((f) => (
                        <div key={f.name} className={styles.splitPreviewItem} style={{ alignItems: 'center' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                            {f.name}
                          </span>
                          <button
                            type="button"
                            className={styles.buttonSmall}
                            onClick={() => download(f.bytes, f.name, 'application/pdf')}
                          >
                            {formatBytes(f.bytes.length)}
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
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
                {t(doc.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: doc.pageCount })} · {formatBytes(doc.bytes.length)}
              </span>
            </div>

            {mode === 'ranges' && doc.pageCount > 1 && (
              <div className={styles.selectionBar}>
                <div className={styles.selectionButtons}>
                  <button type="button" className={styles.buttonSmall} onClick={splitEveryPage}>
                    {t('pdf.p.split.everyPage')}
                  </button>
                  <button type="button" className={styles.buttonSmall} onClick={clearSplits}>
                    {t('pdf.p.split.clearSplits')}
                  </button>
                </div>
                <span className={styles.note}>
                  {t('pdf.p.split.clickHint')}
                </span>
              </div>
            )}

            <PageGrid
              items={items}
              selectedIds={mode === 'ranges' ? EMPTY_SELECTION : undefined}
              onSelectChange={mode === 'ranges' ? handleGridClick : undefined}
              splitAfter={splitAfter}
              renderBadgeExtra={(_item, index) => {
                const nums = pagePartNumbers.get(index);
                if (!nums || !nums.length) {
                  return preview.parts ? <span className={styles.pillRemove}>{t('pdf.p.split.skipped')}</span> : null;
                }
                const label = nums.length === 1 ? t('pdf.p.split.partN', { n: nums[0] }) : t('pdf.p.split.partsList', { list: nums.join(',') });
                return (
                  <span className={splitAfter?.has(index) ? styles.pillAccent : styles.pillExtra}>
                    {label}
                  </span>
                );
              }}
              renderActions={mode === 'ranges' ? (_item, index) => (
                index < doc.pageCount - 1 ? (
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    onClick={() => toggleBreakAfter(index)}
                  >
                    {splitAfter?.has(index) ? t('pdf.p.split.removeSplit') : t('pdf.p.split.splitAfter')}
                  </button>
                ) : null
              ) : undefined}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
