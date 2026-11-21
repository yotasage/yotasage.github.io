import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field } from '../../components/UI/Fields';
import { download, errorMessage, formatBytes, isPasswordError, isPdf, readBytes, safeFileName, uid } from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { parsePageRanges } from '../../lib/pdf/merge';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { MERGE } from '../../lib/pdf/tools';
import { runMergePdfs } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface MergeItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  range: string;
  password?: string;
  locked?: boolean;
}

// The selected pages of an item, null for all of them, or an error message.
function selection(item: MergeItem): { pages: number[] | null; error: string | null } {
  if (!item.range.trim()) return { pages: null, error: null };
  if (item.pageCount === null) return { pages: null, error: null };
  try {
    return { pages: parsePageRanges(item.range, item.pageCount), error: null };
  } catch (e) {
    return { pages: null, error: errorMessage(e) };
  }
}

export default function MergePdf() {
  const [items, setItems] = React.useState<MergeItem[]>([]);
  const [fileName, setFileName] = React.useState('merged');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ bytes: Uint8Array; pages: number } | null>(null);
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  React.useEffect(() => setResult(null), [items]);

  const update = (id: string, patch: Partial<MergeItem>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
    const added = await Promise.all(pdfs.map(async (file): Promise<MergeItem> => ({
      id: uid(), name: file.name, bytes: await readBytes(file), pageCount: null, thumb: null, error: null, range: '',
    })));
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
    () => passwordQueue.filter((id) => id !== activeLocked?.id && items.some((it) => it.id === id && it.locked)).length,
    [passwordQueue, items, activeLocked],
  );

  async function unlockActive(password: string) {
    if (!activeLocked) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const p = await pdfPreview(activeLocked.bytes, 240, password);
      update(activeLocked.id, { pageCount: p.pageCount, thumb: p.thumbnail, password, locked: false, error: null });
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

  const selections = items.map(selection);
  const totalPages = items.reduce((sum, it, i) => sum + (selections[i].pages?.length ?? it.pageCount ?? 0), 0);
  const blocked = items.some((it, i) => it.error || it.locked || selections[i].error || (it.range.trim() && it.pageCount === null));
  const canMerge = items.length >= 2 && !blocked && !busy;

  async function merge() {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const bytes = await runMergePdfs(
        items.map((it, i) => ({ bytes: it.bytes, pages: selections[i].pages, password: it.password })),
        (done, total) => setProgress(done / total),
      );
      setResult({ bytes, pages: totalPages });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const outputName = `${safeFileName(fileName, 'merged').replace(/\.pdf$/i, '')}.pdf`;

  return (
    <PdfPage title={MERGE.title} showHub lead="Combine PDFs into a single document. Drag the files into the order you want and optionally pick which pages to take from each.">
      <ToolWorkspace
        tool={MERGE}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <>
            <button type="button" className={styles.buttonSmall} onClick={() => setItems((l) => [...l].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })))}>Sort A → Z</button>
            <button type="button" className={styles.buttonSmall} onClick={() => setItems((l) => [...l].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })))}>Sort Z → A</button>
            <button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>Remove all</button>
          </>
        }
        sidebar={
          <>
            <p className={styles.note}>
              Leave <em>Pages</em> empty to include the whole file. Use ranges such as <code>1-3, 5, 8-</code> or <code>end-1</code> to reverse.
              Bookmarks and form fields of the source files are not kept.
            </p>
            <Field label="File name">
              <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>
            <p className={styles.note}>{items.length} files, {totalPages} pages in total.</p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {items.length < 2 && <p className={fieldStyles.warning}>Add at least two PDFs to merge.</p>}
            <button type="button" className={styles.primary} disabled={!canMerge} onClick={merge}>Merge PDF</button>
            {busy && <Progress fraction={progress} label="Merging…" />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>Your PDF is ready</h3>
                <p>{result.pages} pages, {formatBytes(result.bytes.length)}.</p>
                <button type="button" className={styles.primary} onClick={() => download(result.bytes, outputName)}>Download {outputName}</button>
                <ContinueWith currentToolId={MERGE.id} files={[{ name: outputName, bytes: result.bytes }]} />
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
          renderCard={(item, index, controls) => {
            const sel = selections[index];
            return (
              <FileCard
                index={index}
                thumb={item.thumb}
                name={item.name}
                meta={`${item.locked ? 'Password protected' : item.pageCount === null ? '…' : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`} · ${formatBytes(item.bytes.length)}`}
                error={item.error}
                controls={controls}
              >
                <input
                  className={styles.rangeInput}
                  placeholder="Pages: all"
                  aria-label={`Pages to take from ${item.name}`}
                  value={item.range}
                  onChange={(e) => update(item.id, { range: e.target.value })}
                />
                {sel.error && <div className={styles.fileError}>{sel.error}</div>}
              </FileCard>
            );
          }}
        />
      </ToolWorkspace>
    </PdfPage>
  );
}
