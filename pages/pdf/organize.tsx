import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PageGrid, PageGridItem, PageSelectionBar } from '../../components/PdfTools/PageGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, Select } from '../../components/UI/Fields';
import { baseName, download, errorMessage, formatBytes, isPasswordError, isPdf, readBytes, safeFileName, uid } from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { PAGE_SIZES } from '../../lib/pdf/images';
import { normalizeRotation, PageSpec } from '../../lib/pdf/pages';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { ORGANIZE } from '../../lib/pdf/tools';
import { runBuildPdfFromPages } from '../../lib/pdf/workerClient';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

const SOURCE_COLORS = ['#4da3ff', '#6fdc9c', '#f0a83a', '#d87bf0', '#ff7a9e', '#34d3c5'];

interface SourceDoc {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  defaultSize: { width: number; height: number };
  pool: PdfThumbPool;
  color: string;
  password?: string;
}

interface PendingLockedPdf {
  name: string;
  bytes: Uint8Array;
}

type OrganizeEntry =
  | {
      id: string;
      kind: 'page';
      sourceId: string;
      pageIndex: number;
      rotation: 0 | 90 | 180 | 270;
    }
  | {
      id: string;
      kind: 'blank';
      width: number;
      height: number;
      sizeLabel: string;
      rotation: 0 | 90 | 180 | 270;
    };

type BlankSizeChoice = 'match' | keyof typeof PAGE_SIZES;

const BLANK_SIZE_OPTIONS: [BlankSizeChoice, string][] = [
  ['match', 'Match document size'],
  ...(Object.keys(PAGE_SIZES) as (keyof typeof PAGE_SIZES)[]).map((k) => [k, PAGE_SIZES[k].label] as [BlankSizeChoice, string]),
];

function rotationTag(deg: number): string {
  const n = normalizeRotation(deg);
  if (n === 90) return '+90°';
  if (n === 180) return '180°';
  if (n === 270) return '−90°';
  return '';
}

export default function OrganizePdfPage() {
  const { t } = useI18n();
  const [sources, setSources] = React.useState<SourceDoc[]>([]);
  const [entries, setEntries] = React.useState<OrganizeEntry[]>([]);
  const [undoStack, setUndoStack] = React.useState<OrganizeEntry[][]>([]);
  const [redoStack, setRedoStack] = React.useState<OrganizeEntry[][]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [blankSize, setBlankSize] = React.useState<BlankSizeChoice>('match');
  const [blankOrientation, setBlankOrientation] = React.useState<'portrait' | 'landscape'>('portrait');
  const [fileName, setFileName] = React.useState('organized');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ bytes: Uint8Array; pages: number } | null>(null);
  const [pendingLocked, setPendingLocked] = React.useState<PendingLockedPdf[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const sourcesRef = React.useRef<SourceDoc[]>([]);
  sourcesRef.current = sources;
  React.useEffect(() => () => {
    for (const s of sourcesRef.current) s.pool.dispose();
  }, []);

  React.useEffect(() => setResult(null), [entries, sources]);

  const sourceMap = React.useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  function commitEntries(next: OrganizeEntry[] | ((prev: OrganizeEntry[]) => OrganizeEntry[])) {
    setEntries((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      if (resolved === prev) return prev;
      setUndoStack((u) => [...u.slice(-29), prev]);
      setRedoStack([]);
      return resolved;
    });
  }

  function undo() {
    setUndoStack((u) => {
      if (!u.length) return u;
      const prev = u[u.length - 1];
      setEntries((cur) => {
        setRedoStack((r) => [...r.slice(-29), cur]);
        return prev;
      });
      return u.slice(0, -1);
    });
  }

  function redo() {
    setRedoStack((r) => {
      if (!r.length) return r;
      const next = r[r.length - 1];
      setEntries((cur) => {
        setUndoStack((u) => [...u.slice(-29), cur]);
        return next;
      });
      return r.slice(0, -1);
    });
  }

  async function openSource(name: string, bytes: Uint8Array, colorIndex: number, password?: string): Promise<{ source: SourceDoc; entries: OrganizeEntry[] }> {
    const pool = new PdfThumbPool(bytes, { password });
    try {
      const pageCount = await pool.open();
      const defaultSize = await pool.getPageSize(0).catch(() => ({ width: PAGE_SIZES.a4.w, height: PAGE_SIZES.a4.h }));
      const id = uid();
      const color = SOURCE_COLORS[colorIndex % SOURCE_COLORS.length];
      const source: SourceDoc = { id, name, bytes, pageCount, defaultSize, pool, color, password };
      const addedEntries: OrganizeEntry[] = Array.from({ length: pageCount }, (_, p) => ({
        id: uid(),
        kind: 'page',
        sourceId: id,
        pageIndex: p,
        rotation: 0,
      }));
      return { source, entries: addedEntries };
    } catch (e) {
      pool.dispose();
      throw e;
    }
  }

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
    if (!pdfs.length) return;
    setError(null);
    setLoading(true);
    try {
      const existingCount = sourcesRef.current.length;
      const addedSources: SourceDoc[] = [];
      const addedEntries: OrganizeEntry[] = [];
      const lockedBatch: PendingLockedPdf[] = [];
      for (let i = 0; i < pdfs.length; i++) {
        const file = pdfs[i];
        const bytes = await readBytes(file);
        try {
          const opened = await openSource(file.name, bytes, existingCount + addedSources.length);
          addedSources.push(opened.source);
          addedEntries.push(...opened.entries);
        } catch (e) {
          if (isPasswordError(e)) {
            lockedBatch.push({ name: file.name, bytes });
          } else {
            setError(errorMessage(e));
          }
        }
      }
      if (addedSources.length) {
        if (existingCount === 0 && addedSources.length === 1) {
          setFileName(`${baseName(addedSources[0].name)}-organized`);
        }
        setSources((prev) => [...prev, ...addedSources]);
        commitEntries((prev) => [...prev, ...addedEntries]);
      }
      if (lockedBatch.length) {
        setPendingLocked((prev) => [...prev, ...lockedBatch]);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void addFiles(handoffToFiles(handoff));
  }, []);

  async function unlockPending(password: string) {
    const head = pendingLocked[0];
    if (!head) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const existingCount = sourcesRef.current.length;
      const opened = await openSource(head.name, head.bytes, existingCount, password);
      if (existingCount === 0) {
        setFileName(`${baseName(head.name)}-organized`);
      }
      setSources((prev) => [...prev, opened.source]);
      commitEntries((prev) => [...prev, ...opened.entries]);
      setPendingLocked((prev) => prev.slice(1));
    } catch (e) {
      if (isPasswordError(e)) {
        setPwError(t('pdf.ff.wrongPw'));
      } else {
        setError(errorMessage(e));
        setPendingLocked((prev) => prev.slice(1));
      }
    } finally {
      setPwBusy(false);
    }
  }

  function cancelUnlock() {
    setPendingLocked((prev) => prev.slice(1));
    setPwError(null);
  }

  function clearAll() {
    for (const s of sources) s.pool.dispose();
    setSources([]);
    setEntries([]);
    setUndoStack([]);
    setRedoStack([]);
    setSelectedIds(new Set());
    setPendingLocked([]);
    setPwError(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  function resolveBlankDimensions(): { width: number; height: number; sizeLabel: string } {
    if (blankSize === 'match') {
      const firstSrc = sources[0];
      if (firstSrc) {
        const { width, height } = firstSrc.defaultSize;
        const swap = (blankOrientation === 'landscape') !== (width > height);
        return {
          width: swap ? height : width,
          height: swap ? width : height,
          sizeLabel: blankOrientation === 'landscape' ? t('pdf.p.org.blankLandscape') : t('pdf.p.org.blankMatch'),
        };
      }
    }
    const key: keyof typeof PAGE_SIZES = blankSize === 'match' ? 'a4' : blankSize;
    const sz = PAGE_SIZES[key];
    const landscape = blankOrientation === 'landscape';
    return {
      width: landscape ? sz.h : sz.w,
      height: landscape ? sz.w : sz.h,
      sizeLabel: t('pdf.p.org.blankSize', { size: key.toUpperCase() }),
    };
  }

  function insertBlank(afterIndex?: number) {
    const dim = resolveBlankDimensions();
    const blank: OrganizeEntry = {
      id: uid(),
      kind: 'blank',
      width: dim.width,
      height: dim.height,
      sizeLabel: dim.sizeLabel,
      rotation: 0,
    };
    commitEntries((prev) => {
      let insertAt = prev.length;
      if (afterIndex !== undefined) {
        insertAt = afterIndex + 1;
      } else if (selectedIds.size > 0) {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (selectedIds.has(prev[i].id)) {
            insertAt = i + 1;
            break;
          }
        }
      }
      const out = prev.slice();
      out.splice(insertAt, 0, blank);
      return out;
    });
  }

  function duplicateAt(index: number) {
    commitEntries((prev) => {
      const copy = { ...prev[index], id: uid() };
      const out = prev.slice();
      out.splice(index + 1, 0, copy);
      return out;
    });
  }

  function duplicateSelected() {
    if (!selectedIds.size) return;
    commitEntries((prev) => {
      const out: OrganizeEntry[] = [];
      for (const e of prev) {
        out.push(e);
        if (selectedIds.has(e.id)) out.push({ ...e, id: uid() });
      }
      return out;
    });
  }

  function removeAt(index: number) {
    const removedId = entries[index]?.id;
    commitEntries((prev) => prev.filter((_, i) => i !== index));
    if (removedId && selectedIds.has(removedId)) {
      const next = new Set(selectedIds);
      next.delete(removedId);
      setSelectedIds(next);
    }
  }

  function removeSelected() {
    if (!selectedIds.size) return;
    commitEntries((prev) => prev.filter((e) => !selectedIds.has(e.id)));
    setSelectedIds(new Set());
  }

  function rotateAt(index: number, delta: number) {
    commitEntries((prev) => prev.map((e, i) => (
      i === index ? { ...e, rotation: normalizeRotation(e.rotation + delta) } : e
    )));
  }

  function rotateTarget(delta: number) {
    const useSel = selectedIds.size > 0;
    commitEntries((prev) => prev.map((e) => (
      !useSel || selectedIds.has(e.id) ? { ...e, rotation: normalizeRotation(e.rotation + delta) } : e
    )));
  }

  function reverseOrder() {
    commitEntries((prev) => [...prev].reverse());
  }

  const gridItems: PageGridItem[] = React.useMemo(() => {
    const multiSource = sources.length > 1;
    return entries.map((e) => {
      if (e.kind === 'blank') {
        const rot = rotationTag(e.rotation);
        return {
          id: e.id,
          pool: null,
          pageIndex: -1,
          rotation: e.rotation,
          blankAspect: e.width / Math.max(1, e.height),
          label: e.sizeLabel,
          meta: rot ? t('pdf.p.turned', { rot }) : `${Math.round(e.width * 25.4 / 72)} × ${Math.round(e.height * 25.4 / 72)} mm`,
        };
      }
      const src = sourceMap.get(e.sourceId);
      const rot = rotationTag(e.rotation);
      return {
        id: e.id,
        pool: src?.pool ?? null,
        pageIndex: e.pageIndex,
        rotation: e.rotation,
        label: t('pdf.ff.pageN', { n: e.pageIndex + 1 }),
        meta: [multiSource ? src?.name : null, rot ? t('pdf.p.turned', { rot }) : null].filter(Boolean).join(' · ') || undefined,
        sourceTag: multiSource && src ? { label: src.name, color: src.color } : undefined,
      };
    });
  }, [entries, sourceMap, sources.length, t]);

  function handleReorder(nextGrid: PageGridItem[]) {
    const byId = new Map(entries.map((e) => [e.id, e]));
    commitEntries(nextGrid.map((g) => byId.get(g.id)!).filter(Boolean));
  }

  const outputName = `${safeFileName(fileName, 'organized').replace(/\.pdf$/i, '')}.pdf`;
  const canSave = entries.length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    setProgress({ fraction: 0, label: '' });
    try {
      const sourceIndexById = new Map(sources.map((s, i) => [s.id, i]));
      const specs: PageSpec[] = entries.map((e) => {
        if (e.kind === 'blank') {
          const swap = e.rotation % 180 !== 0;
          return { kind: 'blank', width: swap ? e.height : e.width, height: swap ? e.width : e.height };
        }
        return {
          kind: 'page',
          sourceIndex: sourceIndexById.get(e.sourceId)!,
          pageIndex: e.pageIndex,
          rotation: e.rotation,
        };
      });
      const bytes = await runBuildPdfFromPages(
        sources.map((s) => ({ bytes: s.bytes, password: s.password })),
        specs,
        (fraction, label) => setProgress({ fraction, label }),
      );
      setResult({ bytes, pages: entries.length });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const targetLabel = selectedIds.size > 0 ? t('pdf.p.org.selected', { n: selectedIds.size }) : t('pdf.p.allPages');
  const blankSizeOptions: [BlankSizeChoice, string][] = React.useMemo(() => [
    ['match', t('pdf.p.org.matchSize')],
    ...BLANK_SIZE_OPTIONS.slice(1),
  ], [t]);

  return (
    <PdfPage
      title={ORGANIZE.title}
      showHub
      lead={t('pdf.p.org.lead')}
    >
      {pendingLocked.length > 0 && (
        <PasswordPrompt
          fileName={pendingLocked[0].name}
          error={pwError}
          busy={pwBusy}
          remaining={pendingLocked.length - 1}
          onSubmit={unlockPending}
          onCancel={cancelUnlock}
        />
      )}
      {error && !sources.length && <div className={styles.error} style={{ marginBottom: '1rem' }}>{error}</div>}
      {loading && !sources.length && !pendingLocked.length && <Progress fraction={0.4} label={t('pdf.p.opening')} />}
      <ToolWorkspace
        tool={ORGANIZE}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.dropOneOrMore')}
        addLabel={t('pdf.p.addPdfs')}
        hasFiles={sources.length > 0}
        onFiles={addFiles}
        toolbar={
          <>
            <button type="button" className={styles.buttonSmall} onClick={() => insertBlank()}>{t('pdf.p.org.blankBtn')}</button>
            <button type="button" className={styles.buttonSmall} disabled={entries.length < 2} onClick={reverseOrder}>{t('pdf.p.org.reverse')}</button>
            <button type="button" className={styles.buttonSmall} disabled={!undoStack.length} onClick={undo}>{t('pdf.p.undo')}</button>
            <button type="button" className={styles.buttonSmall} disabled={!redoStack.length} onClick={redo}>{t('pdf.p.redo')}</button>
            <button type="button" className={styles.buttonSmall} onClick={clearAll}>{t('pdf.ff.clearAll')}</button>
          </>
        }
        sidebar={
          <>
            <div className={styles.options}>
              <h3>{t('pdf.p.org.rotateHeading', { target: targetLabel })}</h3>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.buttonSmall} disabled={!entries.length} onClick={() => rotateTarget(-90)}>{t('pdf.p.rotLeft')}</button>
                <button type="button" className={styles.buttonSmall} disabled={!entries.length} onClick={() => rotateTarget(90)}>{t('pdf.p.rotRight')}</button>
                <button type="button" className={styles.buttonSmall} disabled={!entries.length} onClick={() => rotateTarget(180)}>180°</button>
              </div>

              {selectedIds.size > 0 && (
                <>
                  <h3>{t('pdf.p.org.selectionHeading', { n: selectedIds.size })}</h3>
                  <div className={styles.buttonRow}>
                    <button type="button" className={styles.buttonSmall} onClick={duplicateSelected}>{t('pdf.p.duplicate')}</button>
                    <button type="button" className={styles.buttonSmall} onClick={removeSelected}>{t('pdf.p.delete')}</button>
                  </div>
                </>
              )}

              <h3>{t('pdf.p.org.insertBlankHeading')}</h3>
              <Field label={t('pdf.p.org.blankPageSize')}>
                <Select value={blankSize} onChange={setBlankSize} options={blankSizeOptions} />
              </Field>
              <Field label={t('pdf.p.orientation')}>
                <Select
                  value={blankOrientation}
                  onChange={setBlankOrientation}
                  options={[['portrait', t('pdf.p.portrait')], ['landscape', t('pdf.p.landscape')]]}
                />
              </Field>
              <button type="button" className={styles.button} onClick={() => insertBlank()}>
                {selectedIds.size > 0 ? t('pdf.p.org.insertAfterSel') : t('pdf.p.org.insertAtEnd')}
              </button>

              <Field label={t('pdf.ff.fileName')}>
                <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
              </Field>
            </div>

            <p className={styles.note}>
              {t('pdf.p.org.summary', {
                sources: t(sources.length === 1 ? 'pdf.p.org.srcOne' : 'pdf.p.org.srcMany', { n: sources.length }),
                pages: t(entries.length === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: entries.length }),
              })}
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {entries.length === 0 && sources.length > 0 && <p className={fieldStyles.warning}>{t('pdf.p.org.emptyWarn')}</p>}
            <button type="button" className={styles.primary} disabled={!canSave} onClick={save}>
              {t('pdf.p.org.save')}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>{t('pdf.p.pdfReady')}</h3>
                <p>{t(result.pages === 1 ? 'pdf.p.pagesAndSizeOne' : 'pdf.p.pagesAndSizeMany', { n: result.pages, size: formatBytes(result.bytes.length) })}</p>
                <button type="button" className={styles.primary} onClick={() => download(result.bytes, outputName)}>
                  {t('pdf.ff.downloadNamed', { name: outputName })}
                </button>
                <ContinueWith currentToolId={ORGANIZE.id} files={[{ name: outputName, bytes: result.bytes }]} />
              </div>
            )}
          </>
        }
      >
        {sources.length > 0 && (
          <>
            <div className={styles.fileBanner}>
              {sources.map((s) => (
                <span key={s.id} className={styles.sourceRow}>
                  {sources.length > 1 && <span className={styles.sourceDot} style={{ backgroundColor: s.color }} />}
                  <strong>{s.name}</strong>
                  <span className={styles.fileBannerMeta}>{t('pdf.p.org.pagesShort', { n: s.pageCount })}</span>
                </span>
              ))}
              {loading && <span className={styles.fileBannerMeta}>{t('pdf.p.org.adding')}</span>}
            </div>
            <PageSelectionBar
              items={gridItems}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              rangePlaceholder={t('pdf.p.org.rangePh')}
            />
            <PageGrid
              items={gridItems}
              onReorder={handleReorder}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              renderTopActions={(item, index) => (
                <button
                  type="button"
                  className={styles.iconButton}
                  title={t('pdf.p.org.deletePage')}
                  aria-label={t('pdf.p.org.deleteAria', { label: item.label })}
                  onClick={() => removeAt(index)}
                >
                  &times;
                </button>
              )}
              renderActions={(_, index) => (
                <>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={t('pdf.p.rotLeftTitle')}
                    aria-label={t('pdf.p.rotLeftAria')}
                    onClick={() => rotateAt(index, -90)}
                  >
                    &#x21BA;
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={t('pdf.p.rotRightTitle')}
                    aria-label={t('pdf.p.rotRightAria')}
                    onClick={() => rotateAt(index, 90)}
                  >
                    &#x21BB;
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={t('pdf.p.org.dupPage')}
                    aria-label={t('pdf.p.org.dupPage')}
                    onClick={() => duplicateAt(index)}
                  >
                    &#x29C9;
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={t('pdf.p.org.insertAfter')}
                    aria-label={t('pdf.p.org.insertAfter')}
                    onClick={() => insertBlank(index)}
                  >
                    +
                  </button>
                </>
              )}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
