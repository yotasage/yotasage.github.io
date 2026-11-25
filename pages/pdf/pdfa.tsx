import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, Select } from '../../components/UI/Fields';
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
import {
  convertToPdfA,
  inspectPdfA,
  PdfACheckItem,
  PdfAColorStrategy,
  PdfAComplianceReport,
  PdfAConvertResult,
  PdfALevel,
} from '../../lib/pdf/pdfa';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { PDFA } from '../../lib/pdf/tools';
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface PdfAItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  password?: string;
  locked?: boolean;
  report: PdfAComplianceReport | null;
}

interface ItemResult {
  res?: PdfAConvertResult;
  error?: string;
}

const LEVELS: { id: PdfALevel; titleKey: TranslationKey; textKey: TranslationKey }[] = [
  { id: '2b', titleKey: 'pdf.p.pa.lvl2b', textKey: 'pdf.p.pa.lvl2bDesc' },
  { id: '1b', titleKey: 'pdf.p.pa.lvl1b', textKey: 'pdf.p.pa.lvl1bDesc' },
  { id: '3b', titleKey: 'pdf.p.pa.lvl3b', textKey: 'pdf.p.pa.lvl3bDesc' },
];

function sizeDeltaLabel(before: number, after: number, sameLabel: string): string {
  const diff = after - before;
  if (diff === 0) return sameLabel;
  const pct = (Math.abs(diff) / Math.max(1, before)) * 100;
  const pctStr = pct < 0.1 ? '<0.1 %' : pct < 1 ? `${pct.toFixed(1)} %` : `${Math.round(pct)} %`;
  return diff < 0 ? `−${formatBytes(-diff)} (−${pctStr})` : `+${formatBytes(diff)} (+${pctStr})`;
}

function pdfALabel(report: PdfAComplianceReport): string {
  if (report.pdfaidPart && report.pdfaidConformance) {
    return `PDF/A-${report.pdfaidPart}${report.pdfaidConformance.toLowerCase()}`;
  }
  return 'PDF/A';
}

function CheckStatusPill({ status }: { status: PdfACheckItem['status'] }) {
  const { t } = useI18n();
  if (status === 'pass') return <span className={styles.statusDone}>{t('pdf.p.pa.pass')}</span>;
  if (status === 'warn') return <span className={styles.statusPending}>{t('pdf.p.pa.notice')}</span>;
  return <span className={styles.statusLeft}>{t('pdf.p.pa.needsFix')}</span>;
}

function ComplianceReportCard({ item, result }: { item: PdfAItem; result?: ItemResult }) {
  const { t } = useI18n();
  const converted = result?.res;
  const activeReport = converted ? converted.afterReport : item.report;
  const headingSuffix = converted
    ? t('pdf.p.pa.postVer', { label: converted.afterReport.isPdfA ? pdfALabel(converted.afterReport) : `PDF/A-${converted.level}` })
    : t('pdf.p.pa.preAudit');

  return (
    <section className={styles.report}>
      <h3>
        {item.name} — {headingSuffix}
      </h3>
      {item.error && <div className={styles.error}>{item.error}</div>}
      {!item.error && item.locked && (
        <p className={styles.note}>{t('pdf.p.pa.pwAudit')}</p>
      )}
      {!item.error && !item.locked && !activeReport && <p className={styles.note}>{t('pdf.p.pa.inspecting')}</p>}
      {activeReport && (
        <table className={styles.reportTable}>
          <tbody>
            {activeReport.checks.map((chk) => (
              <tr key={chk.id}>
                <th>{chk.label}</th>
                <td>{chk.detail}</td>
                <td>
                  <CheckStatusPill status={chk.status} />
                </td>
              </tr>
            ))}
            {converted && (
              <tr>
                <th>{t('pdf.p.pa.qpdfRow')}</th>
                <td>
                  {converted.qpdfOk
                    ? t('pdf.p.pa.qpdfClean')
                    : t('pdf.p.pa.qpdfIssues')}
                </td>
                <td>
                  <span className={converted.qpdfOk ? styles.statusDone : styles.statusLeft}>
                    {converted.qpdfOk ? t('pdf.p.pa.verified') : t('pdf.p.pa.warning')}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {converted && converted.warnings.length > 0 && (
        <p className={styles.note}>
          {t(converted.warnings.length === 1 ? 'pdf.p.pa.noticesOne' : 'pdf.p.pa.noticesMany', { n: converted.warnings.length })}
          {converted.warnings.slice(0, 3).join(' · ')}
        </p>
      )}
      {result?.error && <div className={styles.error}>{result.error}</div>}
    </section>
  );
}

export default function PdfToPdfAPage() {
  const { t } = useI18n();
  const [items, setItems] = React.useState<PdfAItem[]>([]);
  const [level, setLevel] = React.useState<PdfALevel>('2b');
  const [colorStrategy, setColorStrategy] = React.useState<PdfAColorStrategy>('RGB');
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const ids = items.map((it) => it.id).join();
  React.useEffect(() => setResults({}), [ids, level, colorStrategy, title]);

  const update = (id: string, patch: Partial<PdfAItem>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
    const added = await Promise.all(
      pdfs.map(async (file): Promise<PdfAItem> => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        pageCount: null,
        thumb: null,
        error: null,
        report: null,
      })),
    );
    setItems((list) => [...list, ...added]);

    for (const item of added) {
      pdfPreview(item.bytes)
        .then((p) => {
          update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail });
          return inspectPdfA(item.bytes)
            .then((report) => update(item.id, { report }))
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
      void inspectPdfA(activeLocked.bytes, password)
        .then((report) => update(activeLocked.id, { report }))
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

  async function convertAll() {
    if (ready.length === 0) return;
    setBusy(true);
    setResults({});
    const out: Record<string, ItemResult> = {};
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setProgress({
        fraction: i / ready.length,
        label: t('pdf.p.pa.converting', { name: item.name, level }),
      });
      await nextFrame();
      try {
        const res = await convertToPdfA(item.bytes, {
          level,
          colorStrategy,
          title: title.trim() || undefined,
          password: item.password,
        });
        out[item.id] = { res };
      } catch (e) {
        out[item.id] = { error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setProgress({ fraction: 1, label: t('pdf.p.done') });
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id]?.res);
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-pdfa-${level}.pdf`,
    bytes: results[it.id].res!.bytes,
  }));
  const beforeTotal = succeeded.reduce((sum, it) => sum + results[it.id].res!.beforeBytes, 0);
  const afterTotal = succeeded.reduce((sum, it) => sum + results[it.id].res!.afterBytes, 0);
  const compliantCount = succeeded.filter((it) => results[it.id].res!.afterReport.isPdfA).length;
  const qpdfCount = succeeded.filter((it) => results[it.id].res!.qpdfOk).length;
  const done = !busy && outputs.length > 0;

  const colorOptions: [PdfAColorStrategy, string][] = React.useMemo(() => [
    ['RGB', t('pdf.p.pa.colRgb')],
    ['Gray', t('pdf.p.grayscale')],
    ['CMYK', 'CMYK'],
  ], [t]);

  return (
    <PdfPage
      title={PDFA.title}
      showHub
      lead={t('pdf.p.pa.lead')}
    >
      <ToolWorkspace
        tool={PDFA}
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
            <div className={styles.levelList} role="radiogroup" aria-label={t('pdf.p.pa.levelAria')}>
              {LEVELS.map((opt) => (
                <label
                  key={opt.id}
                  className={[styles.level, level === opt.id ? styles.levelSelected : ''].join(' ')}
                >
                  <input
                    type="radio"
                    name="pdfa-level"
                    checked={level === opt.id}
                    onChange={() => setLevel(opt.id)}
                  />
                  <span>
                    <strong>{t(opt.titleKey)}</strong>
                    <small>{t(opt.textKey)}</small>
                  </span>
                </label>
              ))}
            </div>

            <div className={styles.options}>
              <Field label={t('pdf.p.pa.colorSpace')}>
                <Select value={colorStrategy} onChange={setColorStrategy} options={colorOptions} disabled={busy} />
              </Field>
              <Field label={t('pdf.p.pa.docTitle')} help={t('pdf.p.pa.docTitleHelp')}>
                <input
                  type="text"
                  className={fieldStyles.input}
                  value={title}
                  disabled={busy}
                  placeholder={t('pdf.p.pa.docTitlePh')}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
            </div>

            <p className={styles.note}>
              {t('pdf.p.pa.note')}
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || ready.length === 0}
              onClick={convertAll}
            >
              {ready.length > 1
                ? t('pdf.p.pa.btnMany', { n: ready.length, level })
                : t('pdf.p.pa.btnOne', { level })}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {compliantCount === outputs.length
                    ? t('pdf.p.pa.resAll', { level })
                    : t('pdf.p.pa.resSome', { done: compliantCount, total: outputs.length, level })}
                </h3>
                <p>
                  {formatBytes(beforeTotal)} &rarr; {formatBytes(afterTotal)} ({sizeDeltaLabel(beforeTotal, afterTotal, t('pdf.p.sameSize'))})
                  {qpdfCount === outputs.length ? t('pdf.p.pa.qpdfVerSuffix') : ''}
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
                    onClick={() => download(zipFiles(outputs), `pdfa-${level}-pdfs.zip`, 'application/zip')}
                  >
                    {t('pdf.p.downloadAllZip')}
                  </button>
                )}
                <ContinueWith currentToolId={PDFA.id} files={outputs} />
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
            const outName = `${baseName(item.name)}-pdfa-${level}.pdf`;
            const rep = item.report;

            const badges = res ? (
              <>
                <span className={res.afterReport.isPdfA ? styles.statusDone : styles.statusLeft}>
                  {res.afterReport.isPdfA ? t('pdf.p.pa.badgeVer', { label: pdfALabel(res.afterReport) }) : t('pdf.p.pa.badgeSavedCheck')}
                </span>
                {res.afterReport.unembeddedFonts.length === 0 && (
                  <span className={styles.statusDone}>{t('pdf.p.pa.fontsEmb')}</span>
                )}
                {res.afterReport.hasOutputIntent && (
                  <span className={styles.statusDone}>ICC OutputIntent</span>
                )}
                {res.qpdfOk && <span className={styles.statusDone}>QPDF OK</span>}
              </>
            ) : item.locked ? (
              <span className={styles.statusLeft}>{t('pdf.p.pwReqShort')}</span>
            ) : !rep ? (
              <span className={styles.statusKept}>{t('pdf.p.inspecting')}</span>
            ) : rep.isPdfA ? (
              <span className={styles.statusDone}>{t('pdf.p.pa.already', { label: pdfALabel(rep) })}</span>
            ) : (
              <>
                <span className={styles.statusPending}>{t('pdf.p.pa.notPdfa')}</span>
                {rep.unembeddedFonts.length > 0 && (
                  <span className={styles.statusLeft}>
                    {t(rep.unembeddedFonts.length === 1 ? 'pdf.p.pa.unembOne' : 'pdf.p.pa.unembMany', { n: rep.unembeddedFonts.length })}
                  </span>
                )}
              </>
            );

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
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => download(res.bytes, outName)}
                    >
                      {t('pdf.p.download')}
                    </button>
                  )
                }
              >
                {!item.error && <div className={styles.badgeRow}>{badges}</div>}
                {res && (
                  <div className={styles.fileMeta}>
                    <span className={res.afterBytes <= res.beforeBytes ? styles.saved : undefined}>
                      {formatBytes(res.afterBytes)} ({sizeDeltaLabel(res.beforeBytes, res.afterBytes, t('pdf.p.sameSize'))})
                    </span>
                  </div>
                )}
              </FileCard>
            );
          }}
        />
        {items.map((item) => (
          <ComplianceReportCard key={item.id} item={item} result={results[item.id]} />
        ))}
      </ToolWorkspace>
    </PdfPage>
  );
}
