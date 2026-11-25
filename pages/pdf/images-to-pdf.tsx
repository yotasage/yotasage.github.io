import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/UI/Fields';
import { baseName, download, errorMessage, formatBytes, isImage, OutputFile, safeFileName, uid, zipFiles } from '../../lib/pdf/files';
import { imagesToPdf, ImagesToPdfOptions, PAGE_SIZES, PageSizeId } from '../../lib/pdf/images';
import { IMAGES_TO_PDF } from '../../lib/pdf/tools';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

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
  const { t } = useI18n();
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
  const [result, setResult] = React.useState<{ name: string; bytes: Uint8Array; type: string; count: number; pdfs: OutputFile[] } | null>(null);

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
    setNotice(images.length < files.length ? t('pdf.p.i2p.skippedNonImg', { n: files.length - images.length }) : null);
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
        setResult({ name, bytes: pdfs[0], type: 'application/pdf', count: 1, pdfs: [{ name, bytes: pdfs[0] }] });
      } else {
        const pdfFiles: OutputFile[] = pdfs.map((bytes, i) => ({ name: `${baseName(items[i].file.name)}.pdf`, bytes }));
        const zip = zipFiles(pdfFiles);
        setResult({ name: `${safeFileName(fileName, 'images')}.zip`, bytes: zip, type: 'application/zip', count: pdfs.length, pdfs: pdfFiles });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const pageSizeOptions: [PageSizeId, string][] = React.useMemo(() => [
    ['image', t('pdf.p.i2p.sameAsImage')],
    ...PAGE_SIZE_OPTIONS.slice(1),
  ], [t]);

  return (
    <PdfPage title={IMAGES_TO_PDF.title} showHub lead={t('pdf.p.i2p.lead')}>
      <ToolWorkspace
        tool={IMAGES_TO_PDF}
        accept="image/*"
        selectLabel={t('pdf.p.i2p.selectImages')}
        dropLabel={t('pdf.p.i2p.dropImages')}
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <>
            <button type="button" className={styles.buttonSmall} onClick={() => setItems((l) => [...l].sort((a, b) => a.file.name.localeCompare(b.file.name, undefined, { numeric: true })))}>{t('pdf.p.sortAZ')}</button>
            <button type="button" className={styles.buttonSmall} onClick={() => setItems((l) => [...l].sort((a, b) => a.file.lastModified - b.file.lastModified))}>{t('pdf.p.i2p.sortDate')}</button>
            <button type="button" className={styles.buttonSmall} onClick={() => changeItems([])}>{t('pdf.p.removeAll')}</button>
          </>
        }
        sidebar={
          <>
            <div className={styles.options}>
              <Field label={t('pdf.p.i2p.pageSize')}>
                <Select value={pageSize} onChange={setPageSize} options={pageSizeOptions} />
              </Field>
              {pageSize !== 'image' && (
                <div className={styles.optionRow}>
                  <Field label={t('pdf.p.orientation')}>
                    <Select value={orientation} onChange={setOrientation} options={[['auto', t('pdf.p.auto')], ['portrait', t('pdf.p.portrait')], ['landscape', t('pdf.p.landscape')]]} />
                  </Field>
                  <Field label={t('pdf.p.i2p.imageSize')}>
                    <Select value={placement} onChange={setPlacement} options={[['fit', t('pdf.p.i2p.fitPage')], ['original', t('pdf.p.i2p.actualSize')]]} />
                  </Field>
                </div>
              )}
              <div className={styles.optionRow}>
                <Field label={t('pdf.p.i2p.marginMm')}><NumberInput value={marginMm} onChange={setMarginMm} min={0} max={100} /></Field>
                {usesDpi && <Field label={t('pdf.p.i2p.imageDpi')}><NumberInput value={dpi} onChange={setDpi} min={10} max={1200} /></Field>}
              </div>
              {usesDpi && <p className={styles.note}>{t('pdf.p.i2p.dpiNote')}</p>}
              <Field label={t('pdf.p.output')}>
                <Select value={output} onChange={setOutput} options={[['single', t('pdf.p.i2p.outSingle')], ['separate', t('pdf.p.i2p.outSeparate')]]} />
              </Field>
              {!(output === 'separate' && items.length === 1) && (
                <Field label={output === 'single' ? t('pdf.ff.fileName') : t('pdf.p.zipFileName')}>
                  <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
                </Field>
              )}
            </div>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={!canConvert} onClick={convert}>{t('pdf.p.i2p.action')}</button>
            {busy && <Progress fraction={progress} label={t('pdf.p.i2p.busy')} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>{result.count === 1 ? t('pdf.p.pdfReady') : t('pdf.p.pdfsReady', { n: result.count })}</h3>
                <p>{formatBytes(result.bytes.length)}</p>
                <button type="button" className={styles.primary} onClick={() => download(result.bytes, result.name, result.type)}>{t('pdf.ff.downloadNamed', { name: result.name })}</button>
                <ContinueWith currentToolId={IMAGES_TO_PDF.id} files={result.pdfs} />
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
                  <button type="button" className={styles.iconButton} title={t('pdf.p.rotLeftAria')} aria-label={t('pdf.p.rotLeftAria')} onClick={() => rotate(item.id, -90)}>&#x21BA;</button>
                  <button type="button" className={styles.iconButton} title={t('pdf.p.rotRightAria')} aria-label={t('pdf.p.rotRightAria')} onClick={() => rotate(item.id, 90)}>&#x21BB;</button>
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
                  onError={() => update(item.id, { error: t('pdf.p.i2p.badImg') })}
                />
              )}
            </FileCard>
          )}
        />
      </ToolWorkspace>
    </PdfPage>
  );
}
