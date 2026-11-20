import React from 'react';

import { PageGrid, PageGridItem, PageSelectionBar } from '../../components/PdfTools/PageGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/QrGen/fields';
import { baseName, download, errorMessage, formatBytes, isPdf, readBytes, safeFileName, zipFiles } from '../../lib/pdf/files';
import { pdfToImages } from '../../lib/pdf/pdfToImages';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { PDF_TO_IMAGES } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  pool: PdfThumbPool;
}

type ImageFormat = 'jpeg' | 'png';
type DpiPreset = '72' | '150' | '300' | 'custom';

export default function PdfToImagesPage() {
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [format, setFormat] = React.useState<ImageFormat>('jpeg');
  const [dpiPreset, setDpiPreset] = React.useState<DpiPreset>('150');
  const [customDpi, setCustomDpi] = React.useState(200);
  const [quality, setQuality] = React.useState(85);
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ name: string; bytes: Uint8Array; type: string; count: number } | null>(null);

  const poolRef = React.useRef<PdfThumbPool | null>(null);
  React.useEffect(() => () => poolRef.current?.dispose(), []);

  const dpi = dpiPreset === 'custom' ? customDpi : Number(dpiPreset);

  React.useEffect(() => setResult(null), [doc, selectedIds, format, dpi, quality, fileName]);

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
      setFileName(`${baseName(pdf.name)}-images`);
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

  const targetCount = selectedIndices.length > 0 ? selectedIndices.length : (doc?.pageCount ?? 0);
  const canRun = !!doc && !busy && targetCount > 0;

  async function renderImages() {
    if (!doc || !canRun) return;
    setBusy(true);
    setError(null);
    setProgress({ fraction: 0, label: '' });
    try {
      const files = await pdfToImages(
        doc.bytes,
        {
          format,
          dpi,
          quality,
          pages: selectedIndices.length > 0 ? selectedIndices : null,
          sourceName: doc.name,
        },
        (fraction, label) => setProgress({ fraction, label }),
      );
      if (!files.length) throw new Error('No pages were rendered.');

      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const defaultStem = `${baseName(doc.name)}-images`;

      if (files.length === 1) {
        const customName = fileName.trim();
        const outName = customName && customName !== defaultStem
          ? `${safeFileName(customName, 'page').replace(/\.(jpe?g|png|zip)$/i, '')}.${ext}`
          : files[0].name;
        setResult({
          name: outName,
          bytes: files[0].bytes,
          type: mime,
          count: 1,
        });
      } else {
        const zip = zipFiles(files);
        setResult({
          name: `${safeFileName(fileName, defaultStem).replace(/\.zip$/i, '')}.zip`,
          bytes: zip,
          type: 'application/zip',
          count: files.length,
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
      title={PDF_TO_IMAGES.title}
      showHub
      lead="Render every page of a PDF—or just the pages you select—into JPG or lossless PNG images at the resolution you choose."
    >
      {error && !doc && <div className={styles.error} style={{ marginBottom: '1rem' }}>{error}</div>}
      {loading && !doc && <Progress fraction={0.4} label="Opening PDF…" />}
      <ToolWorkspace
        tool={PDF_TO_IMAGES}
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
              <Field label="Image format">
                <Select
                  value={format}
                  onChange={setFormat}
                  options={[
                    ['jpeg', 'JPG (smaller files)'],
                    ['png', 'PNG (lossless)'],
                  ]}
                />
              </Field>
              <Field label="Resolution">
                <Select
                  value={dpiPreset}
                  onChange={setDpiPreset}
                  options={[
                    ['72', '72 DPI (screen)'],
                    ['150', '150 DPI (standard)'],
                    ['300', '300 DPI (print)'],
                    ['custom', 'Custom DPI'],
                  ]}
                />
              </Field>
              {dpiPreset === 'custom' && (
                <Field label="Custom DPI (36–600)">
                  <NumberInput value={customDpi} onChange={setCustomDpi} min={36} max={600} />
                </Field>
              )}
              {format === 'jpeg' && (
                <Field label="JPEG quality (%)">
                  <NumberInput value={quality} onChange={setQuality} min={10} max={100} />
                </Field>
              )}
              <Field label={targetCount === 1 ? 'File name' : 'ZIP file name'}>
                <input className={qrStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
              </Field>
            </div>
            <p className={styles.note}>
              {selectedIndices.length > 0
                ? <>Rendering <strong>{selectedIndices.length}</strong> of {doc?.pageCount ?? 0} selected page{selectedIndices.length === 1 ? '' : 's'} at {dpi} DPI.</>
                : <>All <strong>{doc?.pageCount ?? 0}</strong> page{doc?.pageCount === 1 ? '' : 's'} will be rendered at {dpi} DPI. Click pages to convert only a selection.</>}
            </p>
            {notice && <p className={qrStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={!canRun} onClick={renderImages}>
              Convert {targetCount} page{targetCount === 1 ? '' : 's'} to {format === 'jpeg' ? 'JPG' : 'PNG'}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>{result.count === 1 ? 'Your image is ready' : `${result.count} images are ready`}</h3>
                <p>{formatBytes(result.bytes.length)}.</p>
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
              rangePlaceholder="Optional pages to convert, e.g. 1-3, 5 (empty = all)"
            />
            <PageGrid
              items={items}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              renderBadgeExtra={(item) => (
                selectedIds.has(item.id) ? <span className={styles.pillAccent}>Export</span> : null
              )}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
