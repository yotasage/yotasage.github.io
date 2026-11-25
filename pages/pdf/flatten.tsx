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
import { useI18n } from '../../lib/ui/i18n';
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
  const { t } = useI18n();
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
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
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
      lead={t('pdf.flt.lead')}
    >
      <ToolWorkspace
        tool={FLATTEN}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.dropPdfs')}
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>
            {t('pdf.p.removeAll')}
          </button>
        }
        sidebar={
          <>
            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span>{t('pdf.flt.formFieldsDetected')}</span>
                <span>{totalsBefore.formFields}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('pdf.flt.visualAnnots')}</span>
                <span>{totalsBefore.nonWidgetAnnots}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('pdf.flt.links')}</span>
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
                  <strong>{t('pdf.flt.flattenForms')}</strong>
                  <small>{t('pdf.flt.flattenFormsDesc')}</small>
                </span>
              </label>

              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={flattenAnnotations}
                  onChange={(e) => setFlattenAnnotations(e.target.checked)}
                />
                <span>
                  <strong>{t('pdf.flt.flattenAnnots')}</strong>
                  <small>{t('pdf.flt.flattenAnnotsDesc')}</small>
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
                  <strong>{t('pdf.flt.keepLinks')}</strong>
                  <small>{t('pdf.flt.keepLinksDesc')}</small>
                </span>
              </label>
            </div>

            {!flattenForms && !flattenAnnotations && (
              <p className={styles.note}>{t('pdf.flt.pickOne')}</p>
            )}
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !canFlatten}
              onClick={runFlatten}
            >
              {ready.length > 1 ? t('pdf.flt.btnMany', { n: ready.length }) : t('pdf.flt.btnOne')}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1 ? t('pdf.flt.doneOne') : t('pdf.flt.doneMany', { n: outputs.length })}
                </h3>
                <p>
                  {t('pdf.flt.summaryLine', {
                    fields: t(
                      totalsAfter.fields === 1 ? 'pdf.flt.summaryFieldsOne' : 'pdf.flt.summaryFieldsMany',
                      { n: totalsAfter.fields },
                    ),
                    annots: t(
                      totalsAfter.annots === 1 ? 'pdf.flt.summaryAnnotsOne' : 'pdf.flt.summaryAnnotsMany',
                      { n: totalsAfter.annots },
                    ),
                    kept:
                      totalsAfter.kept > 0
                        ? t(totalsAfter.kept === 1 ? 'pdf.flt.summaryKeptOne' : 'pdf.flt.summaryKeptMany', {
                            n: totalsAfter.kept,
                          })
                        : '',
                  })}
                </p>
                {totalsAfter.skipped > 0 && (
                  <p className={styles.note}>
                    {t(totalsAfter.skipped === 1 ? 'pdf.flt.skippedOne' : 'pdf.flt.skippedMany', {
                      n: totalsAfter.skipped,
                    })}
                  </p>
                )}
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
                    onClick={() => download(zipFiles(outputs), 'flattened-pdfs.zip', 'application/zip')}
                  >
                    {t('pdf.p.downloadAllZip')}
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
                    ? t('pdf.p.pwProtected')
                    : item.pageCount === null
                      ? '…'
                      : t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount })
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
                      {t('pdf.p.download')}
                    </button>
                  )
                }
              >
                {!item.error && !item.locked && (
                  <div className={styles.fileMeta}>
                    {r?.res ? (
                      <span className={styles.saved}>
                        {t('pdf.flt.cardDone', {
                          fields: t(
                            r.res.flattenedFormFields === 1 ? 'pdf.flt.cardFieldOne' : 'pdf.flt.cardFieldMany',
                            { n: r.res.flattenedFormFields },
                          ),
                          annots: t(
                            r.res.flattenedAnnotations === 1 ? 'pdf.flt.cardAnnotOne' : 'pdf.flt.cardAnnotMany',
                            { n: r.res.flattenedAnnotations },
                          ),
                          skipped:
                            r.res.skippedWithoutAppearance > 0
                              ? t('pdf.flt.cardSkipped', { n: r.res.skippedWithoutAppearance })
                              : '',
                        })}
                      </span>
                    ) : !s ? (
                      t('pdf.p.inspecting')
                    ) : s.acroFormFieldCount === 0 && s.totalCount === 0 ? (
                      t('pdf.flt.cardNone')
                    ) : (
                      `${t(
                        s.acroFormFieldCount === 1 ? 'pdf.flt.summaryFieldsOne' : 'pdf.flt.summaryFieldsMany',
                        { n: s.acroFormFieldCount },
                      )} · ${t(
                        s.totalCount === 1 ? 'pdf.flt.summaryAnnotsOne' : 'pdf.flt.summaryAnnotsMany',
                        { n: s.totalCount },
                      )}`
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
