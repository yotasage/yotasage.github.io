import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { AnnotationSummary, FlattenResult } from '../../lib/pdf/annotations';
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
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { FLATTEN } from '../../lib/pdf/tools';
import { runFlattenPdf, runInspectAnnotations } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface Item {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  summary: AnnotationSummary | null;
  password?: string;
  locked?: boolean;
}

interface ItemResult {
  res?: FlattenResult;
  error?: string;
}

export default function FlattenPdfPage() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [flattenForms, setFlattenForms] = React.useState(true);
  const [flattenAnnotations, setFlattenAnnotations] = React.useState(true);
  const [keepLinks, setKeepLinks] = React.useState(true);

  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const ids = items.map((it) => it.id).join();
  React.useEffect(() => {
    setResults({});
  }, [ids, flattenForms, flattenAnnotations, keepLinks]);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
    const added = await Promise.all(
      pdfs.map(async (file): Promise<Item> => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        pageCount: null,
        thumb: null,
        error: null,
        summary: null,
      })),
    );
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      runInspectAnnotations(item.bytes)
        .then((summary) => {
          update(item.id, { summary, pageCount: summary.pageCount });
          void pdfPreview(item.bytes)
            .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
            .catch(() => undefined);
        })
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
      const summary = await runInspectAnnotations(activeLocked.bytes, password);
      update(activeLocked.id, {
        summary,
        pageCount: summary.pageCount,
        password,
        locked: false,
        error: null,
      });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      void pdfPreview(activeLocked.bytes, 240, password)
        .then((p) => update(activeLocked.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
        .catch(() => undefined);
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

  const ready = items.filter((it) => !it.error && !it.locked && it.summary !== null);
  const canFlatten = (flattenForms || flattenAnnotations) && ready.length > 0;

  const totalsBefore = React.useMemo(() => {
    let formFields = 0;
    let nonWidgetAnnots = 0;
    let links = 0;
    for (const it of ready) {
      if (!it.summary) continue;
      formFields += it.summary.acroFormFieldCount;
      for (const s of it.summary.subtypes) {
        if (s.subtype === 'Link') links += s.count;
        else if (s.subtype !== 'Widget' && s.subtype !== 'Popup') nonWidgetAnnots += s.count;
      }
    }
    return { formFields, nonWidgetAnnots, links };
  }, [ready]);

  async function runFlatten() {
    if (!canFlatten) return;
    setBusy(true);
    setResults({});
    const out: Record<string, ItemResult> = {};
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setProgress({ fraction: i / ready.length, label: item.name });
      await nextFrame();
      try {
        const res = await runFlattenPdf(
          item.bytes,
          { flattenForms, flattenAnnotations, keepLinks },
          item.password,
        );
        out[item.id] = { res };
      } catch (e) {
        out[item.id] = { error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id]?.res);
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-flattened.pdf`,
    bytes: results[it.id].res!.bytes,
  }));
  const done = !busy && outputs.length > 0;

  const totalsAfter = React.useMemo(() => {
    let fields = 0;
    let annots = 0;
    let skipped = 0;
    let kept = 0;
    for (const it of succeeded) {
      const r = results[it.id]?.res;
      if (!r) continue;
      fields += r.flattenedFormFields;
      annots += r.flattenedAnnotations;
      skipped += r.skippedWithoutAppearance;
      kept += r.keptAnnotations;
    }
    return { fields, annots, skipped, kept };
  }, [succeeded, results]);

  return (
    <PdfPage
      title={FLATTEN.title}
      showHub
      lead="Bake interactive form fields and visual annotations into static page content so values cannot be edited and render consistently across viewers."
    >
      <ToolWorkspace
        tool={FLATTEN}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>
            Remove all
          </button>
        }
        sidebar={
          <>
            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span>Form fields detected</span>
                <span>{totalsBefore.formFields}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Visual annotations</span>
                <span>{totalsBefore.nonWidgetAnnots}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Links</span>
                <span>{totalsBefore.links}</span>
              </div>
            </div>

            <div className={styles.checkList}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flattenForms}
                  onChange={(e) => setFlattenForms(e.target.checked)}
                />
                <span>
                  <strong>Flatten form fields</strong>
                  <small>Bake text inputs, checkboxes, radio buttons and dropdowns permanently into the page.</small>
                </span>
              </label>

              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flattenAnnotations}
                  onChange={(e) => setFlattenAnnotations(e.target.checked)}
                />
                <span>
                  <strong>Flatten annotations &amp; markup</strong>
                  <small>Draw highlights, stamps, comments and freehand drawings into the page content stream.</small>
                </span>
              </label>

              <label className={[styles.check, styles.subCheck].join(' ')}>
                <input
                  type="checkbox"
                  checked={keepLinks}
                  disabled={!flattenAnnotations}
                  onChange={(e) => setKeepLinks(e.target.checked)}
                />
                <span>
                  <strong>Keep clickable links</strong>
                  <small>Preserve URL and internal page link annotations.</small>
                </span>
              </label>
            </div>

            {!flattenForms && !flattenAnnotations && (
              <p className={styles.note}>Select at least one option to flatten.</p>
            )}
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !canFlatten}
              onClick={runFlatten}
            >
              Flatten {ready.length > 1 ? `${ready.length} PDFs` : 'PDF'}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1 ? 'Your PDF is flattened' : `${outputs.length} PDFs are flattened`}
                </h3>
                <p>
                  Flattened <strong>{totalsAfter.fields}</strong> form field{totalsAfter.fields === 1 ? '' : 's'} and{' '}
                  <strong>{totalsAfter.annots}</strong> annotation{totalsAfter.annots === 1 ? '' : 's'}
                  {totalsAfter.kept > 0
                    ? ` (${totalsAfter.kept} annotation${totalsAfter.kept === 1 ? '' : 's'} kept)`
                    : ''}
                  .
                </p>
                {totalsAfter.skipped > 0 && (
                  <p className={styles.note}>
                    {totalsAfter.skipped} annotation{totalsAfter.skipped === 1 ? ' had' : 's had'} no embedded
                    appearance stream and {totalsAfter.skipped === 1 ? 'was' : 'were'} kept intact to avoid losing
                    content.
                  </p>
                )}
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
                    onClick={() => download(zipFiles(outputs), 'flattened-pdfs.zip', 'application/zip')}
                  >
                    Download all (ZIP)
                  </button>
                )}
                <ContinueWith currentToolId={FLATTEN.id} files={outputs} />
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
            const output = outputs[succeeded.indexOf(item)];
            const s = item.summary;
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${
                  item.locked
                    ? 'Password protected'
                    : item.pageCount === null
                      ? '…'
                      : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`
                } · ${formatBytes(r?.res ? r.res.bytes.length : item.bytes.length)}`}
                error={item.error ?? r?.error}
                controls={controls}
                actions={
                  output && (
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => download(output.bytes, output.name)}
                    >
                      Download
                    </button>
                  )
                }
              >
                {!item.error && !item.locked && (
                  <div className={styles.fileMeta}>
                    {r?.res ? (
                      <span className={styles.saved}>
                        Flattened: {r.res.flattenedFormFields} field{r.res.flattenedFormFields === 1 ? '' : 's'},{' '}
                        {r.res.flattenedAnnotations} annot{r.res.flattenedAnnotations === 1 ? '' : 's'}
                        {r.res.skippedWithoutAppearance > 0 ? ` · ${r.res.skippedWithoutAppearance} skipped` : ''}
                      </span>
                    ) : !s ? (
                      'Inspecting…'
                    ) : s.acroFormFieldCount === 0 && s.totalCount === 0 ? (
                      'No forms or annotations'
                    ) : (
                      `${s.acroFormFieldCount} form field${s.acroFormFieldCount === 1 ? '' : 's'} · ${s.totalCount} annotation${
                        s.totalCount === 1 ? '' : 's'
                      }`
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
