import React from 'react';

import { PageGrid, PageGridItem, PageSelectionBar } from '../../components/PdfTools/PageGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field } from '../../components/QrGen/fields';
import { baseName, download, errorMessage, formatBytes, isPdf, readBytes, safeFileName } from '../../lib/pdf/files';
import { normalizeRotation, rotatePdf } from '../../lib/pdf/pages';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { ROTATE } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  pool: PdfThumbPool;
}

interface RotatePageItem extends PageGridItem {
  rotation: 0 | 90 | 180 | 270;
}

function rotationLabel(deg: number): string {
  const n = normalizeRotation(deg);
  if (n === 90) return '+90°';
  if (n === 180) return '180°';
  if (n === 270) return '−90°';
  return '';
}

export default function RotatePdfPage() {
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [rotations, setRotations] = React.useState<number[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Uint8Array | null>(null);

  const poolRef = React.useRef<PdfThumbPool | null>(null);
  React.useEffect(() => () => poolRef.current?.dispose(), []);
  React.useEffect(() => setResult(null), [doc, rotations]);

  async function loadFile(files: File[]) {
    const pdf = files.find(isPdf);
    if (!pdf) {
      setNotice('Please select a PDF file.');
      return;
    }
    setNotice(files.length > 1 ? 'Only the first PDF was opened. Rotate works on one PDF at a time.' : null);
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
      setRotations(new Array(pageCount).fill(0));
      setSelectedIds(new Set());
      setFileName(`${baseName(pdf.name)}-rotated`);
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
    setRotations([]);
    setSelectedIds(new Set());
    setResult(null);
    setError(null);
    setNotice(null);
  }

  const items: RotatePageItem[] = React.useMemo(() => {
    if (!doc) return [];
    return rotations.map((rot, i) => ({
      id: `p-${i}`,
      pool: doc.pool,
      pageIndex: i,
      rotation: normalizeRotation(rot),
      label: `Page ${i + 1}`,
      meta: rotationLabel(rot) ? `Turned ${rotationLabel(rot)}` : undefined,
    }));
  }, [doc, rotations]);

  const rotateOne = (index: number, delta: number) => {
    setRotations((prev) => prev.map((r, i) => (i === index ? normalizeRotation(r + delta) : r)));
  };

  const rotateTarget = (delta: number) => {
    const useSelection = selectedIds.size > 0;
    setRotations((prev) => prev.map((r, i) => (
      !useSelection || selectedIds.has(`p-${i}`) ? normalizeRotation(r + delta) : r
    )));
  };

  const resetRotations = () => {
    const useSelection = selectedIds.size > 0;
    setRotations((prev) => prev.map((r, i) => (!useSelection || selectedIds.has(`p-${i}`) ? 0 : r)));
  };

  const changedCount = rotations.filter((r) => normalizeRotation(r) !== 0).length;
  const outputName = `${safeFileName(fileName, 'rotated').replace(/\.pdf$/i, '')}.pdf`;

  async function save() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    setProgress({ fraction: 0, label: '' });
    try {
      const bytes = await rotatePdf(doc.bytes, rotations, undefined, (fraction, label) => setProgress({ fraction, label }));
      setResult(bytes);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const targetLabel = selectedIds.size > 0 ? `${selectedIds.size} selected page${selectedIds.size === 1 ? '' : 's'}` : 'all pages';

  return (
    <PdfPage
      title={ROTATE.title}
      showHub
      lead="Rotate individual pages or the whole PDF without re-encoding anything. Click cards (or Shift-click) to target a subset such as odd or even pages."
    >
      {error && !doc && <div className={styles.error} style={{ marginBottom: '1rem' }}>{error}</div>}
      {loading && !doc && <Progress fraction={0.4} label="Opening PDF…" />}
      <ToolWorkspace
        tool={ROTATE}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel="Select a PDF file"
        dropLabel="or drop a PDF here"
        addLabel="Replace PDF"
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <>
            <button type="button" className={styles.buttonSmall} onClick={() => rotateTarget(-90)}>↺ Left</button>
            <button type="button" className={styles.buttonSmall} onClick={() => rotateTarget(90)}>↻ Right</button>
            <button type="button" className={styles.buttonSmall} onClick={() => rotateTarget(180)}>180°</button>
            <button type="button" className={styles.buttonSmall} disabled={changedCount === 0} onClick={resetRotations}>Reset</button>
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>Close</button>
          </>
        }
        sidebar={
          <>
            <p className={styles.note}>
              Applies to <strong>{targetLabel}</strong>. Click cards or use the selection bar to rotate only specific pages (for example, even pages from a duplex scan).
            </p>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.button} onClick={() => rotateTarget(-90)}>↺ 90° left</button>
              <button type="button" className={styles.button} onClick={() => rotateTarget(90)}>↻ 90° right</button>
              <button type="button" className={styles.button} onClick={() => rotateTarget(180)}>180°</button>
            </div>
            <Field label="File name">
              <input className={qrStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>
            <p className={styles.note}>
              {changedCount === 0
                ? 'No pages rotated yet.'
                : `${changedCount} of ${doc?.pageCount ?? 0} page${changedCount === 1 ? '' : 's'} rotated.`}
            </p>
            {notice && <p className={qrStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={busy || !doc || changedCount === 0} onClick={save}>
              Save rotated PDF
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>Your PDF is ready</h3>
                <p>{doc?.pageCount} pages, {formatBytes(result.length)}.</p>
                <button type="button" className={styles.primary} onClick={() => download(result, outputName)}>
                  Download {outputName}
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
              rangePlaceholder="Select pages to rotate, e.g. 2, 4-6"
            />
            <PageGrid
              items={items}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              renderBadgeExtra={(item) => {
                const label = rotationLabel(item.rotation);
                return label ? <span className={styles.pillAccent}>{label}</span> : null;
              }}
              renderActions={(_, index) => (
                <>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="Rotate left 90°"
                    aria-label={`Rotate page ${index + 1} left`}
                    onClick={() => rotateOne(index, -90)}
                  >
                    &#x21BA;
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title="Rotate right 90°"
                    aria-label={`Rotate page ${index + 1} right`}
                    onClick={() => rotateOne(index, 90)}
                  >
                    &#x21BB;
                  </button>
                </>
              )}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
