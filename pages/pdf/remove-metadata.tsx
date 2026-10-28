import React from 'react';

import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { baseName, download, errorMessage, formatBytes, isPdf, nextFrame, OutputFile, readBytes, uid, zipFiles } from '../../lib/pdf/files';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { CLEAN_OPTIONS, CleanOption, CleanOptions, cleanPdf, Finding, FindingId, inspectPdf, PRESETS } from '../../lib/pdf/sanitize';
import { REMOVE_METADATA } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface Item {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  findings: Finding[] | null;
}

interface ItemResult {
  bytes: Uint8Array;
  // What an inspection of the cleaned file still finds.
  after: Finding[];
  error?: string;
}

function Status({ id, opts, result }: { id: FindingId; opts: CleanOptions; result?: ItemResult }) {
  const willGo = id === 'history' || opts[id];
  if (!result || result.error) return willGo ? <span className={styles.statusPending}>Will be removed</span> : <span className={styles.statusKept}>Kept</span>;
  if (id === 'id' && opts.id) return <span className={styles.statusDone}>Replaced</span>;
  if (!result.after.some((f) => f.id === id)) return <span className={styles.statusDone}>Removed</span>;
  return willGo ? <span className={styles.statusLeft}>Partly left</span> : <span className={styles.statusKept}>Kept</span>;
}

function Report({ item, opts, result }: { item: Item; opts: CleanOptions; result?: ItemResult }) {
  return (
    <section className={styles.report}>
      <h3>{item.name}</h3>
      {item.error && <div className={styles.error}>{item.error}</div>}
      {!item.error && !item.findings && <p className={styles.note}>Inspecting…</p>}
      {item.findings?.length === 0 && <p className={styles.note}>No metadata or hidden data found.</p>}
      {!!item.findings?.length && (
        <table className={styles.reportTable}>
          <tbody>
            {item.findings.map((f) => (
              <tr key={f.id}>
                <th>{f.label}</th>
                <td><ul>{f.details.map((d, i) => <li key={i}>{d}</li>)}</ul></td>
                <td><Status id={f.id} opts={opts} result={result} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result?.error && <div className={styles.error}>{result.error}</div>}
    </section>
  );
}

export default function RemoveMetadata() {
  const [items, setItems] = React.useState<Item[]>([]);
  const [opts, setOpts] = React.useState<CleanOptions>(PRESETS.find((p) => p.id === 'anonymize').options);
  const [neutralNames, setNeutralNames] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});

  const preset = PRESETS.find((p) => CLEAN_OPTIONS.every((o) => p.options[o.id] === opts[o.id]))?.id ?? 'custom';
  const ids = items.map((it) => it.id).join();
  React.useEffect(() => setResults({}), [ids, opts]);

  const update = (id: string, patch: Partial<Item>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
    const added = await Promise.all(pdfs.map(async (file): Promise<Item> => ({
      id: uid(), name: file.name, bytes: await readBytes(file), pageCount: null, thumb: null, error: null, findings: null,
    })));
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      inspectPdf(item.bytes)
        .then((findings) => update(item.id, { findings }))
        .catch((e) => update(item.id, { error: errorMessage(e) }));
      pdfPreview(item.bytes)
        .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
        .catch(() => undefined);
    }
  }

  const ready = items.filter((it) => !it.error);

  async function clean() {
    setBusy(true);
    setResults({});
    const out: Record<string, ItemResult> = {};
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setProgress({ fraction: i / ready.length, label: item.name });
      await nextFrame();
      try {
        const bytes = await cleanPdf(item.bytes, opts);
        out[item.id] = { bytes, after: await inspectPdf(bytes) };
      } catch (e) {
        out[item.id] = { bytes: item.bytes, after: [], error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id] && !results[it.id].error);
  const outputs: OutputFile[] = succeeded.map((it, i) => ({
    name: neutralNames ? `document${succeeded.length > 1 ? `-${i + 1}` : ''}.pdf` : `${baseName(it.name)}-clean.pdf`,
    bytes: results[it.id].bytes,
  }));
  const done = !busy && outputs.length > 0;
  const toggle = (id: CleanOption, on: boolean) => setOpts((o) => ({ ...o, [id]: on }));

  const optionList = (changesContent: boolean) => (
    <div className={styles.checkList}>
      {CLEAN_OPTIONS.filter((o) => !!o.changesContent === changesContent).map((o) => (
        <label key={o.id} className={styles.check}>
          <input type="checkbox" checked={opts[o.id]} onChange={(e) => toggle(o.id, e.target.checked)} />
          <span><strong>{o.label}</strong><small>{o.help}</small></span>
        </label>
      ))}
    </div>
  );

  return (
    <PdfPage
      title={REMOVE_METADATA.title}
      showHub
      lead="See what a PDF reveals about who made it and how, then remove it. Each file is inspected when you add it, and inspected again after cleaning to confirm what is gone."
    >
      <ToolWorkspace
        tool={REMOVE_METADATA}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>Remove all</button>}
        sidebar={
          <>
            <div className={styles.levelList} role="radiogroup" aria-label="Preset">
              {PRESETS.map((p) => (
                <label key={p.id} className={[styles.level, preset === p.id ? styles.levelSelected : ''].join(' ')}>
                  <input type="radio" name="preset" checked={preset === p.id} onChange={() => setOpts(p.options)} />
                  <span><strong>{p.title}</strong><small>{p.text}</small></span>
                </label>
              ))}
              <label className={[styles.level, preset === 'custom' ? styles.levelSelected : ''].join(' ')}>
                <input type="radio" name="preset" checked={preset === 'custom'} readOnly />
                <span><strong>Custom</strong><small>Pick exactly what to remove below.</small></span>
              </label>
            </div>
            <h3>Hidden data</h3>
            {optionList(false)}
            <h3>Content</h3>
            {optionList(true)}
            <p className={styles.note}>
              Earlier revisions and unused objects are always removed, since the file is written anew.
              Visible text and images are never changed, so names written on the pages stay.
            </p>
            <label className={styles.check}>
              <input type="checkbox" checked={neutralNames} onChange={(e) => setNeutralNames(e.target.checked)} />
              <span><strong>Neutral file names</strong><small>Save as document.pdf (document-1.pdf, … for several files) instead of the original names.</small></span>
            </label>
            {notice && <p className={qrStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={busy || ready.length === 0} onClick={clean}>
              Clean {ready.length > 1 ? `${ready.length} PDFs` : 'PDF'}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {done && (
              <div className={styles.result}>
                <h3>{outputs.length === 1 ? 'Your PDF is clean' : `${outputs.length} PDFs are clean`}</h3>
                <p>See the report next to the files for what was removed.</p>
                {outputs.length === 1
                  ? <button type="button" className={styles.primary} onClick={() => download(outputs[0].bytes, outputs[0].name)}>Download {outputs[0].name}</button>
                  : <button type="button" className={styles.primary} onClick={() => download(zipFiles(outputs), 'cleaned-pdfs.zip', 'application/zip')}>Download all (ZIP)</button>}
              </div>
            )}
          </>
        }
      >
        <FileGrid
          items={items}
          onChange={setItems}
          sortable={false}
          renderCard={(item, _index, controls) => {
            const r = results[item.id];
            const output = outputs[succeeded.indexOf(item)];
            const count = item.findings?.length;
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${item.pageCount === null ? '…' : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`} · ${formatBytes(item.bytes.length)}`}
                error={item.error ?? r?.error}
                controls={controls}
                actions={output && <button type="button" className={styles.buttonSmall} onClick={() => download(output.bytes, output.name)}>Download</button>}
              >
                {!item.error && (
                  <div className={styles.fileMeta}>
                    {r && !r.error
                      ? <span className={styles.saved}>Cleaned · {formatBytes(r.bytes.length)}</span>
                      : count === undefined ? 'Inspecting…' : count === 0 ? 'Nothing found' : `${count} kind${count === 1 ? '' : 's'} of data found`}
                  </div>
                )}
              </FileCard>
            );
          }}
        />
        {items.map((item) => <Report key={item.id} item={item} opts={opts} result={results[item.id]} />)}
      </ToolWorkspace>
    </PdfPage>
  );
}
