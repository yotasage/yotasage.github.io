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

const LEVELS: { id: PdfALevel; title: string; text: string }[] = [
  {
    id: '2b',
    title: 'PDF/A-2b (Recommended)',
    text: 'ISO 19005-2 (PDF 1.7). Preserves transparency and modern compression while guaranteeing archival visual fidelity.',
  },
  {
    id: '1b',
    title: 'PDF/A-1b (Classic 1.4)',
    text: 'ISO 19005-1 (PDF 1.4). Strict legacy archival standard accepted by older repositories; flattens transparency.',
  },
  {
    id: '3b',
    title: 'PDF/A-3b (Attachments allowed)',
    text: 'ISO 19005-3 (PDF 1.7). Same archival guarantees as PDF/A-2b while permitting embedded source files.',
  },
];

const COLOR_OPTIONS: [PdfAColorStrategy, string][] = [
  ['RGB', 'sRGB (recommended)'],
  ['Gray', 'Grayscale'],
  ['CMYK', 'CMYK'],
];

function sizeDeltaLabel(before: number, after: number): string {
  const diff = after - before;
  if (diff === 0) return 'Same size';
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
  if (status === 'pass') return <span className={styles.statusDone}>Pass</span>;
  if (status === 'warn') return <span className={styles.statusPending}>Notice</span>;
  return <span className={styles.statusLeft}>Needs fix</span>;
}

function ComplianceReportCard({ item, result }: { item: PdfAItem; result?: ItemResult }) {
  const converted = result?.res;
  const activeReport = converted ? converted.afterReport : item.report;
  const headingSuffix = converted
    ? `Post-conversion verification (${converted.afterReport.isPdfA ? pdfALabel(converted.afterReport) : `PDF/A-${converted.level}`})`
    : 'Pre-flight compliance audit';

  return (
    <section className={styles.report}>
      <h3>
        {item.name} — {headingSuffix}
      </h3>
      {item.error && <div className={styles.error}>{item.error}</div>}
      {!item.error && item.locked && (
        <p className={styles.note}>Password protected — enter the password above to run the pre-flight audit.</p>
      )}
      {!item.error && !item.locked && !activeReport && <p className={styles.note}>Inspecting PDF/A compliance…</p>}
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
                <th>Structural integrity (QPDF)</th>
                <td>
                  {converted.qpdfOk
                    ? 'Verified clean structure with QPDF'
                    : 'QPDF reported structural issues in the converted output'}
                </td>
                <td>
                  <span className={converted.qpdfOk ? styles.statusDone : styles.statusLeft}>
                    {converted.qpdfOk ? 'Verified' : 'Warning'}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {converted && converted.warnings.length > 0 && (
        <p className={styles.note}>
          {converted.warnings.length} Ghostscript/QPDF notice{converted.warnings.length === 1 ? '' : 's'}:{' '}
          {converted.warnings.slice(0, 3).join(' · ')}
        </p>
      )}
      {result?.error && <div className={styles.error}>{result.error}</div>}
    </section>
  );
}

export default function PdfToPdfAPage() {
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
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
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
        label: `Converting ${item.name} to PDF/A-${level}…`,
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
    setProgress({ fraction: 1, label: 'Done' });
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

  return (
    <PdfPage
      title={PDFA.title}
      showHub
      lead="Convert PDFs to ISO-compliant archival PDF/A-1b, PDF/A-2b, or PDF/A-3b locally in your browser with embedded fonts, ICC OutputIntent, and XMP metadata."
    >
      <ToolWorkspace
        tool={PDFA}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
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
            Remove all
          </button>
        }
        sidebar={
          <>
            <div className={styles.levelList} role="radiogroup" aria-label="PDF/A conformance level">
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
                    <strong>{opt.title}</strong>
                    <small>{opt.text}</small>
                  </span>
                </label>
              ))}
            </div>

            <div className={styles.options}>
              <Field label="Colour space">
                <Select value={colorStrategy} onChange={setColorStrategy} options={COLOR_OPTIONS} disabled={busy} />
              </Field>
              <Field label="Document title (optional)" help="Leave blank to keep the original document title.">
                <input
                  type="text"
                  className={fieldStyles.input}
                  value={title}
                  disabled={busy}
                  placeholder="Keep original title"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
            </div>

            <p className={styles.note}>
              Powered by self-hosted Ghostscript 10.08.0 WebAssembly in a Web Worker. Unembedded fonts are substituted
              and embedded, an ICC OutputIntent is attached, and ISO XMP metadata is written without uploading your files.
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || ready.length === 0}
              onClick={convertAll}
            >
              {ready.length > 1
                ? `Convert ${ready.length} PDFs to PDF/A-${level}`
                : `Convert to PDF/A-${level}`}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {compliantCount === outputs.length
                    ? `Verified PDF/A-${level}`
                    : `${compliantCount} of ${outputs.length} verified PDF/A-${level}`}
                </h3>
                <p>
                  {formatBytes(beforeTotal)} &rarr; {formatBytes(afterTotal)} ({sizeDeltaLabel(beforeTotal, afterTotal)})
                  {qpdfCount === outputs.length ? ' · QPDF verified' : ''}
                </p>
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
                    onClick={() => download(zipFiles(outputs), `pdfa-${level}-pdfs.zip`, 'application/zip')}
                  >
                    Download all (ZIP)
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
                  {res.afterReport.isPdfA ? `${pdfALabel(res.afterReport)} verified` : `Saved (check audit)`}
                </span>
                {res.afterReport.unembeddedFonts.length === 0 && (
                  <span className={styles.statusDone}>Fonts embedded</span>
                )}
                {res.afterReport.hasOutputIntent && (
                  <span className={styles.statusDone}>ICC OutputIntent</span>
                )}
                {res.qpdfOk && <span className={styles.statusDone}>QPDF OK</span>}
              </>
            ) : item.locked ? (
              <span className={styles.statusLeft}>Password required</span>
            ) : !rep ? (
              <span className={styles.statusKept}>Inspecting…</span>
            ) : rep.isPdfA ? (
              <span className={styles.statusDone}>Already {pdfALabel(rep)}</span>
            ) : (
              <>
                <span className={styles.statusPending}>Not PDF/A</span>
                {rep.unembeddedFonts.length > 0 && (
                  <span className={styles.statusLeft}>
                    {rep.unembeddedFonts.length} unembedded font{rep.unembeddedFonts.length === 1 ? '' : 's'}
                  </span>
                )}
              </>
            );

            const metaParts = [
              item.locked
                ? 'Password protected'
                : item.pageCount === null
                  ? '…'
                  : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`,
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
                      Download
                    </button>
                  )
                }
              >
                {!item.error && <div className={styles.badgeRow}>{badges}</div>}
                {res && (
                  <div className={styles.fileMeta}>
                    <span className={res.afterBytes <= res.beforeBytes ? styles.saved : undefined}>
                      {formatBytes(res.afterBytes)} ({sizeDeltaLabel(res.beforeBytes, res.afterBytes)})
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
