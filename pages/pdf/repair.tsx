import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/UI/Fields';
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
import {
  diagnosePdf,
  PdfDiagnosis,
  repairPdf,
  RepairResult,
  RepairStrategy,
  RepairStrategyUsed,
} from '../../lib/pdf/repair';
import { REPAIR } from '../../lib/pdf/tools';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface RepairItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  previewFailed: boolean;
  password?: string;
  locked?: boolean;
  diagnosis: PdfDiagnosis | null;
}

interface ItemResult extends Partial<RepairResult> {
  error?: string;
}

const STRATEGIES: { id: RepairStrategy; titleKey: TranslationKey; textKey: TranslationKey }[] = [
  { id: 'auto', titleKey: 'pdf.p.rep.sAuto', textKey: 'pdf.p.rep.sAutoDesc' },
  { id: 'qpdf', titleKey: 'pdf.p.rep.sQpdf', textKey: 'pdf.p.rep.sQpdfDesc' },
  { id: 'pdflib', titleKey: 'pdf.p.rep.sPdflib', textKey: 'pdf.p.rep.sPdflibDesc' },
  { id: 'raster', titleKey: 'pdf.p.rep.sRaster', textKey: 'pdf.p.rep.sRasterDesc' },
];

const STRATEGY_LABEL_KEYS: Record<RepairStrategyUsed, TranslationKey> = {
  qpdf: 'pdf.p.rep.sQpdf',
  pdflib: 'pdf.p.rep.sPdflib',
  raster: 'pdf.p.rep.sRaster',
};

function damagedPreviewDataUrl(line1: string, line2: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200" viewBox="0 0 160 200">' +
        '<rect width="160" height="200" rx="8" fill="#252525" stroke="#555" stroke-width="2"/>' +
        '<path d="M52 46h40l16 16v64H52z" fill="none" stroke="#e59a3a" stroke-width="4" stroke-linejoin="round"/>' +
        '<path d="M92 46v16h16" fill="none" stroke="#e59a3a" stroke-width="4" stroke-linejoin="round"/>' +
        '<path d="M80 76v24M80 110v4" stroke="#e59a3a" stroke-width="5" stroke-linecap="round"/>' +
        `<text x="80" y="154" text-anchor="middle" fill="#c8c8c8" font-family="sans-serif" font-size="11">${esc(line1)}</text>` +
        `<text x="80" y="172" text-anchor="middle" fill="#e59a3a" font-family="sans-serif" font-size="11">${esc(line2)}</text>` +
      '</svg>',
    )
  );
}

function diagnosisNeedsPassword(diag: PdfDiagnosis): boolean {
  return diag.isEncrypted && !diag.qpdfOk && diag.errors.some((e) => /invalid password/i.test(e));
}

export default function RepairPdfPage() {
  const { t } = useI18n();
  const [items, setItems] = React.useState<RepairItem[]>([]);
  const [strategy, setStrategy] = React.useState<RepairStrategy>('auto');
  const [rasterDpi, setRasterDpi] = React.useState('150');
  const [rasterQuality, setRasterQuality] = React.useState(85);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const ids = items.map((it) => it.id).join();
  React.useEffect(() => setResults({}), [ids, strategy, rasterDpi, rasterQuality]);

  const update = (id: string, patch: Partial<RepairItem>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  function queuePassword(id: string) {
    update(id, { locked: true });
    setPasswordQueue((q) => (q.includes(id) ? q : [...q, id]));
  }

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
    const added = await Promise.all(
      pdfs.map(async (file): Promise<RepairItem> => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        pageCount: null,
        thumb: null,
        previewFailed: false,
        diagnosis: null,
      })),
    );
    setItems((list) => [...list, ...added]);

    for (const item of added) {
      // Run diagnosis unconditionally; corrupt PDFs often fail preview but are still repairable.
      diagnosePdf(item.bytes)
        .then((diagnosis) => {
          update(item.id, { diagnosis });
          if (diagnosisNeedsPassword(diagnosis)) {
            queuePassword(item.id);
          }
        })
        .catch(() => {
          const msg = t('pdf.p.rep.unableInspect');
          update(item.id, {
            diagnosis: {
              hasHeader: false,
              headerOffset: -1,
              hasEof: false,
              trailingGarbageBytes: 0,
              qpdfOk: false,
              isEncrypted: false,
              warnings: [],
              errors: [msg],
              issues: [msg],
              needsRepair: true,
            },
          });
        });

      pdfPreview(item.bytes)
        .then((p) => {
          update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail, previewFailed: false });
        })
        .catch((e) => {
          if (isPasswordError(e)) {
            queuePassword(item.id);
          } else {
            // Never mark the file un-repairable just because preview failed!
            update(item.id, { previewFailed: true });
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
      const diag = await diagnosePdf(activeLocked.bytes, password);
      if (diagnosisNeedsPassword(diag)) {
        setPwError(t('pdf.ff.wrongPw'));
        return;
      }
      update(activeLocked.id, { password, locked: false, diagnosis: diag });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      void pdfPreview(activeLocked.bytes, 240, password)
        .then((p) => update(activeLocked.id, { pageCount: p.pageCount, thumb: p.thumbnail, previewFailed: false }))
        .catch(() => update(activeLocked.id, { previewFailed: true }));
    } catch (e) {
      if (isPasswordError(e)) {
        setPwError(t('pdf.ff.wrongPw'));
      } else {
        update(activeLocked.id, { password, locked: false, previewFailed: true });
        setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      }
    } finally {
      setPwBusy(false);
    }
  }

  function cancelUnlock() {
    if (!activeLocked) return;
    update(activeLocked.id, { locked: false, previewFailed: true });
    setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    setPwError(null);
  }

  const ready = items.filter((it) => !it.locked);

  async function repairAll() {
    if (ready.length === 0) return;
    setBusy(true);
    setResults({});
    const out: Record<string, ItemResult> = {};
    const parsedDpi = Number(rasterDpi) || 150;

    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      const report = (f: number, label: string) =>
        setProgress({ fraction: (i + f) / ready.length, label: `${item.name}: ${label}` });
      await nextFrame();
      try {
        const res = await repairPdf(item.bytes, {
          password: item.password,
          strategy,
          rasterDpi: parsedDpi,
          rasterQuality,
          onProgress: report,
        });
        out[item.id] = res;
        // Generate a fresh thumbnail from the repaired bytes if the original preview failed.
        if (!item.thumb || item.previewFailed) {
          void pdfPreview(res.bytes, 240, item.password)
            .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail, previewFailed: false }))
            .catch(() => undefined);
        }
      } catch (e) {
        out[item.id] = { error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setProgress({ fraction: 1, label: t('pdf.p.done') });
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id]?.bytes && !results[it.id]?.error);
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-repaired.pdf`,
    bytes: results[it.id].bytes!,
  }));
  const totalPagesRecovered = succeeded.reduce((sum, it) => sum + (results[it.id].pagesRecovered ?? 0), 0);
  const done = !busy && outputs.length > 0;

  const rasterDpiOptions: [string, string][] = React.useMemo(() => [
    ['150', t('pdf.p.rep.dpi150')],
    ['200', t('pdf.p.rep.dpi200')],
    ['300', t('pdf.p.rep.dpi300')],
  ], [t]);

  const damagedThumbUrl = React.useMemo(
    () => damagedPreviewDataUrl(t('pdf.p.rep.previewUnavail'), t('pdf.p.rep.readyToRepair')),
    [t],
  );

  return (
    <PdfPage
      title={REPAIR.title}
      showHub
      lead={t('pdf.p.rep.lead')}
    >
      <ToolWorkspace
        tool={REPAIR}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.rep.dropLabel')}
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
            <div className={styles.levelList} role="radiogroup" aria-label={t('pdf.p.rep.stratAria')}>
              {STRATEGIES.map((s) => (
                <label
                  key={s.id}
                  className={[styles.level, strategy === s.id ? styles.levelSelected : ''].join(' ')}
                >
                  <input
                    type="radio"
                    name="repair-strategy"
                    checked={strategy === s.id}
                    onChange={() => setStrategy(s.id)}
                  />
                  <span>
                    <strong>{t(s.titleKey)}</strong>
                    <small>{t(s.textKey)}</small>
                  </span>
                </label>
              ))}
            </div>

            {strategy === 'raster' && (
              <div className={styles.optionRow}>
                <Field label={t('pdf.p.renderDpi')}>
                  <Select value={rasterDpi} onChange={setRasterDpi} options={rasterDpiOptions} />
                </Field>
                <Field label={t('pdf.p.jpegQuality')}>
                  <NumberInput value={rasterQuality} onChange={setRasterQuality} min={30} max={100} />
                </Field>
              </div>
            )}

            <p className={styles.note}>
              {t('pdf.p.rep.note')}
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || ready.length === 0}
              onClick={repairAll}
            >
              {ready.length > 1 ? t('pdf.p.rep.btnMany', { n: ready.length }) : t('pdf.p.rep.btnOne')}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1 ? t('pdf.p.rep.doneOne') : t('pdf.p.rep.doneMany', { n: outputs.length })}
                </h3>
                <p>
                  {succeeded.length === 1 && results[succeeded[0].id].strategyUsed
                    ? t(totalPagesRecovered === 1 ? 'pdf.p.rep.recoveredViaOne' : 'pdf.p.rep.recoveredViaMany', {
                        n: totalPagesRecovered,
                        strategy: t(STRATEGY_LABEL_KEYS[results[succeeded[0].id].strategyUsed!]),
                      })
                    : t(totalPagesRecovered === 1 ? 'pdf.p.rep.recoveredOne' : 'pdf.p.rep.recoveredMany', {
                        n: totalPagesRecovered,
                      })}
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
                    onClick={() => download(zipFiles(outputs), 'repaired-pdfs.zip', 'application/zip')}
                  >
                    {t('pdf.p.downloadAllZip')}
                  </button>
                )}
                <ContinueWith currentToolId={REPAIR.id} files={outputs} />
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
            const outName = `${baseName(item.name)}-repaired.pdf`;
            const diag = item.diagnosis;
            const thumbSrc = item.thumb ?? (item.previewFailed ? damagedThumbUrl : null);

            const statusBadge = r?.bytes && !r.error ? (
              <span className={r.verifiedOk ? styles.statusDone : styles.statusLeft}>
                {r.verifiedOk ? t('pdf.p.rep.badgeVerified') : t('pdf.p.rep.badgeWarn')}
              </span>
            ) : item.locked ? (
              <span className={styles.statusLeft}>{t('pdf.p.pwReqShort')}</span>
            ) : !diag ? (
              <span className={styles.statusKept}>{t('pdf.p.rep.diagnosing')}</span>
            ) : diag.needsRepair ? (
              <span className={styles.statusLeft}>
                {t(diag.issues.length === 1 ? 'pdf.p.rep.issuesOne' : 'pdf.p.rep.issuesMany', { n: diag.issues.length })}
              </span>
            ) : (
              <span className={styles.statusDone}>{t('pdf.p.rep.noErrors')}</span>
            );

            const pageLabel =
              r?.pagesRecovered !== undefined
                ? t(r.pagesRecovered === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: r.pagesRecovered })
                : item.locked
                  ? t('pdf.p.pwProtected')
                  : item.pageCount !== null
                    ? t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount })
                    : item.previewFailed
                      ? t('pdf.p.rep.damagedStruct')
                      : '…';

            return (
              <FileCard
                thumb={thumbSrc}
                name={item.name}
                meta={`${pageLabel} · ${formatBytes(r?.bytes ? r.bytes.length : item.bytes.length)}`}
                error={r?.error}
                controls={controls}
                actions={
                  r?.bytes &&
                  !r.error && (
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => download(r.bytes!, outName)}
                    >
                      {t('pdf.p.download')}
                    </button>
                  )
                }
              >
                <div className={styles.badgeRow}>{statusBadge}</div>
                {r?.bytes && !r.error && r.strategyUsed && (
                  <div className={styles.fileMeta}>
                    <div className={styles.saved}>{t(STRATEGY_LABEL_KEYS[r.strategyUsed])}</div>
                    <div>
                      {t(r.pagesRecovered === 1 ? 'pdf.p.rep.cardRecOne' : 'pdf.p.rep.cardRecMany', { n: r.pagesRecovered ?? 0 })}
                      {r.issuesFound && r.issuesFound.length > 0
                        ? ` · ${t(r.issuesFound.length === 1 ? 'pdf.p.rep.resolvedOne' : 'pdf.p.rep.resolvedMany', { n: r.issuesFound.length })}`
                        : ''}
                    </div>
                  </div>
                )}
              </FileCard>
            );
          }}
        />

        {items.map((item) => {
          const diag = item.diagnosis;
          const r = results[item.id];
          if (!diag && !r) return null;
          return (
            <section key={item.id} className={styles.report}>
              <h3>{t('pdf.p.rep.reportTitle', { name: item.name })}</h3>
              <table className={styles.reportTable}>
                <tbody>
                  {diag && (
                    <tr>
                      <th>{t('pdf.p.rep.structCheck')}</th>
                      <td>
                        {diag.issues.length === 0 ? (
                          t('pdf.p.rep.noErrorsDot')
                        ) : (
                          <ul>
                            {diag.issues.map((issue, idx) => (
                              <li key={idx}>{issue}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>
                        <span className={diag.needsRepair ? styles.statusLeft : styles.statusDone}>
                          {diag.needsRepair ? t('pdf.p.rep.needsRepair') : t('pdf.p.rep.healthy')}
                        </span>
                      </td>
                    </tr>
                  )}
                  {r && !r.error && r.strategyUsed && (
                    <tr>
                      <th>{t('pdf.p.rep.recResult')}</th>
                      <td>
                        <ul>
                          <li>{t('pdf.p.rep.strategyRow', { strategy: t(STRATEGY_LABEL_KEYS[r.strategyUsed]) })}</li>
                          <li>
                            {t('pdf.p.rep.pagesAndSize', { n: r.pagesRecovered ?? 0, size: formatBytes(r.bytes?.length ?? 0) })}
                          </li>
                          {r.warnings?.map((w, idx) => (
                            <li key={idx}>{t('pdf.p.rep.warningRow', { msg: w })}</li>
                          ))}
                        </ul>
                      </td>
                      <td>
                        <span className={r.verifiedOk ? styles.statusDone : styles.statusLeft}>
                          {r.verifiedOk ? t('pdf.p.rep.verifiedOk') : t('pdf.p.rep.warnings')}
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          );
        })}
      </ToolWorkspace>
    </PdfPage>
  );
}
