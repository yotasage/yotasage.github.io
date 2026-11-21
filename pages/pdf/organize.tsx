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
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
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
        setPwError('Incorrect password. Try again.');
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
          sizeLabel: blankOrientation === 'landscape' ? 'Blank (landscape)' : 'Blank (match)',
        };
      }
    }
    const key: keyof typeof PAGE_SIZES = blankSize === 'match' ? 'a4' : blankSize;
    const sz = PAGE_SIZES[key];
    const landscape = blankOrientation === 'landscape';
    return {
      width: landscape ? sz.h : sz.w,
      height: landscape ? sz.w : sz.h,
      sizeLabel: `Blank (${key.toUpperCase()})`,
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
          meta: rot ? `Turned ${rot}` : `${Math.round(e.width * 25.4 / 72)} × ${Math.round(e.height * 25.4 / 72)} mm`,
        };
      }
      const src = sourceMap.get(e.sourceId);
      const rot = rotationTag(e.rotation);
      return {
        id: e.id,
        pool: src?.pool ?? null,
        pageIndex: e.pageIndex,
        rotation: e.rotation,
        label: `Page ${e.pageIndex + 1}`,
        meta: [multiSource ? src?.name : null, rot ? `Turned ${rot}` : null].filter(Boolean).join(' · ') || undefined,
        sourceTag: multiSource && src ? { label: src.name, color: src.color } : undefined,
      };
    });
  }, [entries, sourceMap, sources.length]);

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

  const targetLabel = selectedIds.size > 0 ? `${selectedIds.size} selected` : 'all pages';

  return (
    <PdfPage
      title={ORGANIZE.title}
      showHub
      lead="Drag pages into any order, combine pages from multiple PDFs, rotate, duplicate, delete or insert blank pages. Use the drag handle or arrows on touch screens."
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
      {loading && !sources.length && !pendingLocked.length && <Progress fraction={0.4} label="Opening PDF…" />}
      <ToolWorkspace
        tool={ORGANIZE}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop one or more PDFs here"
        addLabel="+ Add PDFs"
        hasFiles={sources.length > 0}
        onFiles={addFiles}
        toolbar={
          <>
            <button type="button" className={styles.buttonSmall} onClick={() => insertBlank()}>+ Blank page</button>
            <button type="button" className={styles.buttonSmall} disabled={entries.length < 2} onClick={reverseOrder}>Reverse</button>
            <button type="button" className={styles.buttonSmall} disabled={!undoStack.length} onClick={undo}>Undo</button>
            <button type="button" className={styles.buttonSmall} disabled={!redoStack.length} onClick={redo}>Redo</button>
            <button type="button" className={styles.buttonSmall} onClick={clearAll}>Clear all</button>
          </>
        }
        sidebar={
          <>
            <div className={styles.options}>
              <h3>Rotate ({targetLabel})</h3>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.buttonSmall} disabled={!entries.length} onClick={() => rotateTarget(-90)}>↺ Left</button>
                <button type="button" className={styles.buttonSmall} disabled={!entries.length} onClick={() => rotateTarget(90)}>↻ Right</button>
                <button type="button" className={styles.buttonSmall} disabled={!entries.length} onClick={() => rotateTarget(180)}>180°</button>
              </div>

              {selectedIds.size > 0 && (
                <>
                  <h3>Selection ({selectedIds.size})</h3>
                  <div className={styles.buttonRow}>
                    <button type="button" className={styles.buttonSmall} onClick={duplicateSelected}>Duplicate</button>
                    <button type="button" className={styles.buttonSmall} onClick={removeSelected}>Delete</button>
                  </div>
                </>
              )}

              <h3>Insert blank page</h3>
              <Field label="Blank page size">
                <Select value={blankSize} onChange={setBlankSize} options={BLANK_SIZE_OPTIONS} />
              </Field>
              <Field label="Orientation">
                <Select
                  value={blankOrientation}
                  onChange={setBlankOrientation}
                  options={[['portrait', 'Portrait'], ['landscape', 'Landscape']]}
                />
              </Field>
              <button type="button" className={styles.button} onClick={() => insertBlank()}>
                + Insert blank page {selectedIds.size > 0 ? 'after selection' : 'at end'}
              </button>

              <Field label="File name">
                <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
              </Field>
            </div>

            <p className={styles.note}>
              {sources.length} source PDF{sources.length === 1 ? '' : 's'} · <strong>{entries.length}</strong> page{entries.length === 1 ? '' : 's'} in output.
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {entries.length === 0 && sources.length > 0 && <p className={fieldStyles.warning}>Add a page or click Undo before saving.</p>}
            <button type="button" className={styles.primary} disabled={!canSave} onClick={save}>
              Save organized PDF
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>Your PDF is ready</h3>
                <p>{result.pages} page{result.pages === 1 ? '' : 's'}, {formatBytes(result.bytes.length)}.</p>
                <button type="button" className={styles.primary} onClick={() => download(result.bytes, outputName)}>
                  Download {outputName}
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
                  <span className={styles.fileBannerMeta}>({s.pageCount}p)</span>
                </span>
              ))}
              {loading && <span className={styles.fileBannerMeta}>Adding PDF…</span>}
            </div>
            <PageSelectionBar
              items={gridItems}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              rangePlaceholder="Select pages, e.g. 1-3, 5, 8-"
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
                  title="Delete page"
                  aria-label={`Delete ${item.label}`}
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
                    title="Rotate left 90°"
                    aria-label="Rotate left"
                    onClick={() => rotateAt(index, -90)}
                  >
                    &#x21BA;
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="Rotate right 90°"
                    aria-label="Rotate right"
                    onClick={() => rotateAt(index, 90)}
                  >
                    &#x21BB;
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="Duplicate page"
                    aria-label="Duplicate page"
                    onClick={() => duplicateAt(index)}
                  >
                    &#x29C9;
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="Insert blank page after"
                    aria-label="Insert blank page after"
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
