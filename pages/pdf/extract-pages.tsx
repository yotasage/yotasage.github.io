import React from 'react';

import { PageGrid, PageGridItem, PageSelectionBar } from '../../components/PdfTools/PageGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, Select } from '../../components/QrGen/fields';
import { baseName, download, errorMessage, formatBytes, isPdf, readBytes, safeFileName, zipFiles } from '../../lib/pdf/files';
import { extractPagesPdf } from '../../lib/pdf/pages';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { EXTRACT_PAGES } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  pool: PdfThumbPool;
}

export default function ExtractPagesPage() {
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<'single' | 'separate'>('single');
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ name: string; bytes: Uint8Array; type: string; count: number; pages: number } | null>(null);

  const poolRef = React.useRef<PdfThumbPool | null>(null);
  React.useEffect(() => () => poolRef.current?.dispose(), []);
  React.useEffect(() => setResult(null), [doc, selectedIds, mode, fileName]);

  async function loadFile(files: File[]) {
    const pdf = files.find(isPdf);
    if (!pdf) {
      setNotice('Please select a PDF file.');
      return;
    }
    setNotice(files.length > 1 ? 'Only the first PDF was opened.' : null);
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const bytes = await readBytes(pdf);
      const pool = new PdfThumbPool(bytes);
      const pageCount = await pool.open();
      poolRef.current?.dispose();
      poolRef.current = pool;
      setDoc({ name: pdf.name, bytes, pageCount, pool });
      setSelectedIds(new Set());
      setFileName(`${baseName(pdf.name)}-extracted`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function clearDoc() {
    poolRef.current?.dispose();
    poolRef.current = null;
    setDoc(null);
    setSelectedIds(new Set());
    setResult(null);
    setError(null);
    setNotice(null);
  }

  const items: PageGridItem[] = React.useMemo(() => {
    if (!doc) return [];
    return Array.from({ length: doc.pageCount }, (_, i) => ({
      id: `p-${i}`,
      pool: doc.pool,
      pageIndex: i,
      label: `Page ${i + 1}`,
    }));
  }, [doc]);

  const selectedIndices = React.useMemo(() => {
    if (!doc) return [];
    const out: number[] = [];
    for (let i = 0; i < doc.pageCount; i++) {
      if (selectedIds.has(`p-${i}`)) out.push(i);
    }
    return out;
  }, [doc, selectedIds]);

  const canRun = !!doc && !busy && selectedIndices.length > 0;

  async function applyExtract() {
    if (!doc || !canRun) return;
    setBusy(true);
    setError(null);
    setProgress({ fraction: 0, label: '' });
    try {
      const files = await extractPagesPdf(
        doc.bytes,
        selectedIndices,
        {
          separate: mode === 'separate',
          sourceName: doc.name,
          outputName: safeFileName(fileName, 'extracted'),
        },
        (fraction, label) => setProgress({ fraction, label }),
      );
      if (files.length === 1) {
        setResult({
          name: files[0].name,
          bytes: files[0].bytes,
          type: 'application/pdf',
          count: 1,
          pages: selectedIndices.length,
        });
      } else {
        const zip = zipFiles(files);
        setResult({
          name: `${safeFileName(fileName, 'extracted').replace(/\.zip$/i, '')}.zip`,
          bytes: zip,
          type: 'application/zip',
          count: files.length,
          pages: selectedIndices.length,
        });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PdfPage
      title={EXTRACT_PAGES.title}
      showHub
      lead="Pick the pages you want to pull out of a PDF (click, Shift-click, or type ranges) and save them as one PDF or a ZIP with one PDF per page."
    >
      {error && !doc && <div className={styles.error} style={{ marginBottom: '1rem' }}>{error}</div>}
      {loading && !doc && <Progress fraction={0.4} label="Opening PDF…" />}
      <ToolWorkspace
        tool={EXTRACT_PAGES}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel="Select a PDF file"
        dropLabel="or drop a PDF here"
        addLabel="Replace PDF"
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={clearDoc}>Close</button>}
        sidebar={
          <>
            <div className={styles.options}>
              <Field label="Output">
                <Select
                  value={mode}
                  onChange={setMode}
                  options={[
                    ['single', 'One PDF with selected pages'],
                    ['separate', 'One PDF per page (ZIP)'],
                  ]}
                />
              </Field>
              <Field label={mode === 'single' || selectedIndices.length <= 1 ? 'File name' : 'ZIP file name'}>
                <input className={qrStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
              </Field>
            </div>
            <p className={styles.note}>
              Selected <strong>{selectedIndices.length}</strong> of {doc?.pageCount ?? 0} page{doc?.pageCount === 1 ? '' : 's'}.
            </p>
            {notice && <p className={qrStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={!canRun} onClick={applyExtract}>
              Extract {selectedIndices.length || ''} page{selectedIndices.length === 1 ? '' : 's'}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>{result.count === 1 ? 'Your PDF is ready' : `${result.count} PDFs are ready`}</h3>
                <p>{result.pages} page{result.pages === 1 ? '' : 's'}, {formatBytes(result.bytes.length)}.</p>
                <button type="button" className={styles.primary} onClick={() => download(result.bytes, result.name, result.type)}>
                  Download {result.name}
                </button>
              </div>
            )}
          </>
        }
      >
        {doc && (
          <>
            <div className={styles.fileBanner}>
              <strong>{doc.name}</strong>
              <span className={styles.fileBannerMeta}>
                {doc.pageCount} page{doc.pageCount === 1 ? '' : 's'} · {formatBytes(doc.bytes.length)}
              </span>
            </div>
            <PageSelectionBar
              items={items}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              rangePlaceholder="Pages to extract, e.g. 1-3, 5, 8-"
            />
            <PageGrid
              items={items}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              renderBadgeExtra={(item) => (
                selectedIds.has(item.id) ? <span className={styles.pillAccent}>Keep</span> : null
              )}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
