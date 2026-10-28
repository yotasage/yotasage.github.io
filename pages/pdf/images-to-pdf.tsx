import React from 'react';

import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/QrGen/fields';
import { baseName, download, errorMessage, formatBytes, isImage, safeFileName, uid, zipFiles } from '../../lib/pdf/files';
import { imagesToPdf, ImagesToPdfOptions, PAGE_SIZES, PageSizeId } from '../../lib/pdf/images';
import { IMAGES_TO_PDF } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface ImageItem {
  id: string;
  file: File;
  url: string;
  rotation: number;
  size: string | null;
  error: string | null;
}

const PAGE_SIZE_OPTIONS: [PageSizeId, string][] = [
  ['image', 'Same as the image'],
  ...(Object.keys(PAGE_SIZES) as (keyof typeof PAGE_SIZES)[]).map((k) => [k, PAGE_SIZES[k].label] as [PageSizeId, string]),
];

export default function ImagesToPdf() {
  const [items, setItems] = React.useState<ImageItem[]>([]);
  const [pageSize, setPageSize] = React.useState<PageSizeId>('a4');
  const [orientation, setOrientation] = React.useState<ImagesToPdfOptions['orientation']>('auto');
  const [placement, setPlacement] = React.useState<ImagesToPdfOptions['placement']>('fit');
  const [marginMm, setMarginMm] = React.useState(0);
  const [dpi, setDpi] = React.useState(150);
  const [output, setOutput] = React.useState<'single' | 'separate'>('single');
  const [fileName, setFileName] = React.useState('images');
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ name: string; bytes: Uint8Array; type: string; count: number } | null>(null);

  const usesDpi = pageSize === 'image' || placement === 'original';
  React.useEffect(() => setResult(null), [items, pageSize, orientation, placement, marginMm, dpi, output, fileName]);

  // Object URLs of removed images are released.
  const latest = React.useRef(items);
  latest.current = items;
  React.useEffect(() => () => latest.current.forEach((it) => URL.revokeObjectURL(it.url)), []);
  function changeItems(next: ImageItem[]) {
    const keep = new Set(next.map((it) => it.id));
    items.filter((it) => !keep.has(it.id)).forEach((it) => URL.revokeObjectURL(it.url));
    setItems(next);
  }

  const update = (id: string, patch: Partial<ImageItem>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const rotate = (id: string, by: number) => setItems((list) => list.map((it) => (it.id === id ? { ...it, rotation: (it.rotation + by + 360) % 360 } : it)));

  function addFiles(files: File[]) {
    const images = files.filter(isImage);
    setNotice(images.length < files.length ? `${files.length - images.length} file(s) were skipped because they are not images.` : null);
    setItems((list) => [...list, ...images.map((file) => ({ id: uid(), file, url: URL.createObjectURL(file), rotation: 0, size: null, error: null }))]);
  }

  const canConvert = items.length > 0 && !busy && !items.some((it) => it.error);

  async function convert() {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const opts: ImagesToPdfOptions = { pageSize, orientation, placement, marginMm, dpi };
      const pdfs = await imagesToPdf(items.map((it) => ({ file: it.file, rotation: it.rotation })), opts, output === 'separate', (d, t) => setProgress(d / t));
      if (pdfs.length === 1) {
        const name = output === 'separate' ? `${baseName(items[0].file.name)}.pdf` : `${safeFileName(fileName, 'images').replace(/\.pdf$/i, '')}.pdf`;
        setResult({ name, bytes: pdfs[0], type: 'application/pdf', count: 1 });
      } else {
        const zip = zipFiles(pdfs.map((bytes, i) => ({ name: `${baseName(items[i].file.name)}.pdf`, bytes })));
        setResult({ name: `${safeFileName(fileName, 'images')}.zip`, bytes: zip, type: 'application/zip', count: pdfs.length });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PdfPage title={IMAGES_TO_PDF.title} showHub lead="Convert images to PDF. JPG and PNG files are embedded without re-encoding, so there is no loss of quality; other formats are converted first.">
      <ToolWorkspace
        tool={IMAGES_TO_PDF}
        accept="image/*"
        selectLabel="Select images"
        dropLabel="or drop images here"
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <>
            <button type="button" className={styles.buttonSmall} onClick={() => setItems((l) => [...l].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })))}>Sort A → Z</button>
            <button type="button" className={styles.buttonSmall} onClick={() => setItems((l) => [...l].sort((a, b) => a.file.lastModified - b.file.lastModified))}>Sort by date</button>
            <button type="button" className={styles.buttonSmall} onClick={() => changeItems([])}>Remove all</button>
          </>
        }
        sidebar={
          <>
            <div className={styles.options}>
              <Field label="Page size">
                <Select value={pageSize} onChange={setPageSize} options={PAGE_SIZE_OPTIONS} />
              </Field>
              {pageSize !== 'image' && (
                <div className={styles.optionRow}>
                  <Field label="Orientation">
                    <Select value={orientation} onChange={setOrientation} options={[['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]} />
                  </Field>
                  <Field label="Image size">
                    <Select value={placement} onChange={setPlacement} options={[['fit', 'Fit to page'], ['original', 'Actual size']]} />
                  </Field>
                </div>
              )}
              <div className={styles.optionRow}>
                <Field label="Margin (mm)"><NumberInput value={marginMm} onChange={setMarginMm} min={0} max={100} /></Field>
                {usesDpi && <Field label="Image DPI"><NumberInput value={dpi} onChange={setDpi} min={10} max={1200} /></Field>}
              </div>
              {usesDpi && <p className={styles.note}>The DPI decides the printed size: a 3000 px wide image at 150 DPI is 20 inches (508 mm) wide.</p>}
              <Field label="Output">
                <Select value={output} onChange={setOutput} options={[['single', 'One PDF with all images'], ['separate', 'One PDF per image (ZIP)']]} />
              </Field>
              {!(output === 'separate' && items.length === 1) && (
                <Field label={output === 'single' ? 'File name' : 'ZIP file name'}>
                  <input className={qrStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
                </Field>
              )}
            </div>
            {notice && <p className={qrStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={!canConvert} onClick={convert}>Convert to PDF</button>
            {busy && <Progress fraction={progress} label="Converting…" />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>{result.count === 1 ? 'Your PDF is ready' : `${result.count} PDFs are ready`}</h3>
                <p>{formatBytes(result.bytes.length)}</p>
                <button type="button" className={styles.primary} onClick={() => download(result.bytes, result.name, result.type)}>Download {result.name}</button>
              </div>
            )}
          </>
        }
      >
        <FileGrid
          items={items}
          onChange={changeItems}
          renderCard={(item, index, controls) => (
            <FileCard
              index={index}
              thumb={item.error ? null : item.url}
              thumbRotation={item.rotation}
              name={item.file.name}
              meta={[item.size, formatBytes(item.file.size)].filter(Boolean).join(' · ')}
              error={item.error}
              controls={controls}
              actions={
                <>
                  <button type="button" className={styles.iconButton} title="Rotate left" aria-label="Rotate left" onClick={() => rotate(item.id, -90)}>&#x21BA;</button>
                  <button type="button" className={styles.iconButton} title="Rotate right" aria-label="Rotate right" onClick={() => rotate(item.id, 90)}>&#x21BB;</button>
                </>
              }
            >
              {/* Reads the pixel size, and finds formats this browser cannot decode. */}
              {item.size === null && !item.error && (
                <img
                  src={item.url}
                  alt=""
                  hidden
                  onLoad={(e) => update(item.id, { size: `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px` })}
                  onError={() => update(item.id, { error: 'This browser cannot open this image format.' })}
                />
              )}
            </FileCard>
          )}
        />
      </ToolWorkspace>
    </PdfPage>
  );
}
