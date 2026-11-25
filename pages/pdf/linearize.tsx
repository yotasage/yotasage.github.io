import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox } from '../../components/UI/Fields';
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
import { inspectLinearization, LinearizeInspection, linearizePdf } from '../../lib/pdf/linearize';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { LINEARIZE } from '../../lib/pdf/tools';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface LinearizeItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  password?: string;
  locked?: boolean;
  inspection: LinearizeInspection | null;
}

interface ItemResult {
  bytes: Uint8Array;
  isLinearized: boolean;
  warnings: string[];
  beforeBytes: number;
  afterBytes: number;
  error?: string;
}

function sizeDeltaLabel(before: number, after: number, sameLabel: string): string {
  const diff = after - before;
  if (diff === 0) return sameLabel;
  const pct = (Math.abs(diff) / Math.max(1, before)) * 100;
  const pctStr = pct < 0.1 ? '<0.1 %' : pct < 1 ? `${pct.toFixed(1)} %` : `${Math.round(pct)} %`;
  return diff < 0 ? `−${formatBytes(-diff)} (−${pctStr})` : `+${formatBytes(diff)} (+${pctStr})`;
}

export default function LinearizePdfPage() {
  const { t } = useI18n();
  const [items, setItems] = React.useState<LinearizeItem[]>([]);
  const [objectStreams, setObjectStreams] = React.useState(true);
  const [recompressStreams, setRecompressStreams] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const ids = items.map((it) => it.id).join();
  React.useEffect(() => setResults({}), [ids, objectStreams, recompressStreams]);

  const update = (id: string, patch: Partial<LinearizeItem>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
    const added = await Promise.all(
      pdfs.map(async (file): Promise<LinearizeItem> => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        pageCount: null,
        thumb: null,
        error: null,
        inspection: null,
      })),
    );
    setItems((list) => [...list, ...added]);

    for (const item of added) {
      pdfPreview(item.bytes)
        .then((p) => {
          update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail });
          return inspectLinearization(item.bytes)
            .then((inspection) => update(item.id, { inspection }))
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
      const p = await pdfPreview(activeLocked.bytes, 240, password);
      update(activeLocked.id, {
        pageCount: p.pageCount,
        thumb: p.thumbnail,
        password,
        locked: false,
        error: null,
      });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      void inspectLinearization(activeLocked.bytes, password)
        .then((inspection) => update(activeLocked.id, { inspection }))
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

  const ready = items.filter((it) => !it.error && !it.locked);

  async function optimizeAll() {
    if (ready.length === 0) return;
    setBusy(true);
    setResults({});
    const out: Record<string, ItemResult> = {};
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setProgress({ fraction: i / ready.length, label: t('pdf.p.lin.busy', { name: item.name }) });
      await nextFrame();
      try {
        const res = await linearizePdf(item.bytes, {
          password: item.password,
          objectStreams,
          recompressStreams,
        });
        out[item.id] = res;
      } catch (e) {
        out[item.id] = {
          bytes: item.bytes,
          isLinearized: false,
          warnings: [],
          beforeBytes: item.bytes.length,
          afterBytes: item.bytes.length,
          error: errorMessage(e),
        };
      }
      setResults({ ...out });
    }
    setProgress({ fraction: 1, label: t('pdf.p.done') });
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id] && !results[it.id].error);
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-web.pdf`,
    bytes: results[it.id].bytes,
  }));
  const beforeTotal = succeeded.reduce((sum, it) => sum + results[it.id].beforeBytes, 0);
  const afterTotal = succeeded.reduce((sum, it) => sum + results[it.id].afterBytes, 0);
  const verifiedCount = succeeded.filter((it) => results[it.id].isLinearized).length;
  const done = !busy && outputs.length > 0;

  return (
    <PdfPage
      title={LINEARIZE.title}
      showHub
      lead={t('pdf.p.lin.lead')}
    >
      <ToolWorkspace
        tool={LINEARIZE}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.dropPdfs')}
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button
            type="button"
            className={styles.buttonSmall}
            onClick={() => {
              setItems([]);
              setResults({});
              setPasswordQueue([]);
            }}
          >
            {t('pdf.p.removeAll')}
          </button>
        }
        sidebar={
          <>
            <div className={styles.options}>
              <Checkbox
                label={t('pdf.p.lin.objStreams')}
                checked={objectStreams}
                onChange={setObjectStreams}
              />
              <Checkbox
                label={t('pdf.p.lin.recompress')}
                checked={recompressStreams}
                onChange={setRecompressStreams}
              />
            </div>

            <p className={styles.note}>
              {t('pdf.p.lin.note')}
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || ready.length === 0}
              onClick={optimizeAll}
            >
              {ready.length > 1 ? t('pdf.p.lin.btnMany', { n: ready.length }) : t('pdf.p.lin.btnOne')}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {verifiedCount === outputs.length
                    ? t('pdf.p.lin.verifiedAll')
                    : t('pdf.p.lin.verifiedSome', { done: verifiedCount, total: outputs.length })}
                </h3>
                <p>
                  {formatBytes(beforeTotal)} &rarr; {formatBytes(afterTotal)} ({sizeDeltaLabel(beforeTotal, afterTotal, t('pdf.p.sameSize'))})
                </p>
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
                    onClick={() => download(zipFiles(outputs), 'web-optimized-pdfs.zip', 'application/zip')}
                  >
                    {t('pdf.p.downloadAllZip')}
                  </button>
                )}
                <ContinueWith currentToolId={LINEARIZE.id} files={outputs} />
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
            const outName = `${baseName(item.name)}-web.pdf`;
            const insp = item.inspection;

            const statusBadge = r && !r.error ? (
              <span className={r.isLinearized ? styles.statusDone : styles.statusLeft}>
                {r.isLinearized ? t('pdf.p.lin.badgeVerified') : t('pdf.p.lin.badgeNotLinSaved')}
              </span>
            ) : item.locked ? (
              <span className={styles.statusLeft}>{t('pdf.p.pwReqShort')}</span>
            ) : !insp ? (
              <span className={styles.statusKept}>{t('pdf.p.inspecting')}</span>
            ) : insp.isLinearized ? (
              <span className={styles.statusDone}>{t('pdf.p.lin.badgeAlready')}</span>
            ) : (
              <span className={styles.statusPending}>{t('pdf.p.lin.badgeNotLin')}</span>
            );

            const metaParts = [
              item.locked
                ? t('pdf.p.pwProtected')
                : item.pageCount === null
                  ? '…'
                  : t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount }),
              insp?.pdfVersion ? `PDF ${insp.pdfVersion}` : null,
              formatBytes(item.bytes.length),
            ].filter(Boolean);

            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={metaParts.join(' · ')}
                error={item.error ?? r?.error}
                controls={controls}
                actions={
                  r &&
                  !r.error && (
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => download(r.bytes, outName)}
                    >
                      {t('pdf.p.download')}
                    </button>
                  )
                }
              >
                {!item.error && <div className={styles.badgeRow}>{statusBadge}</div>}
                {r && !r.error && (
                  <div className={styles.fileMeta}>
                    <span className={r.afterBytes <= r.beforeBytes ? styles.saved : undefined}>
                      {formatBytes(r.afterBytes)} ({sizeDeltaLabel(r.beforeBytes, r.afterBytes, t('pdf.p.sameSize'))})
                    </span>
                    {r.warnings.length > 0 && (
                      <div>{t(r.warnings.length === 1 ? 'pdf.p.lin.warnOne' : 'pdf.p.lin.warnMany', { n: r.warnings.length })}</div>
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
