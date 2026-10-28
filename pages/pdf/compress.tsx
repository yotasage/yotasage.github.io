import React from 'react';

import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, NumberInput } from '../../components/QrGen/fields';
import { compressPdf, CompressOptions } from '../../lib/pdf/compress';
import { baseName, download, errorMessage, formatBytes, isPdf, OutputFile, readBytes, uid, zipFiles } from '../../lib/pdf/files';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { COMPRESS } from '../../lib/pdf/tools';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface CompressItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
}

interface ItemResult {
  bytes: Uint8Array;
  // The compressed file was not smaller, so the original is returned.
  kept: boolean;
  images: number;
  error?: string;
}

type Level = 'lossless' | 'recommended' | 'strong' | 'custom';

const LEVELS: { id: Level; title: string; text: string; dpi: number; quality: number }[] = [
  { id: 'lossless', title: 'Lossless', text: 'Removes unused objects and recompresses streams. Nothing visible changes.', dpi: 150, quality: 75 },
  { id: 'recommended', title: 'Recommended', text: 'Images at up to 150 DPI, JPEG quality 75 %. Good for screens and office printing.', dpi: 150, quality: 75 },
  { id: 'strong', title: 'Strong', text: 'Images at up to 96 DPI, JPEG quality 50 %. Smallest files, visibly softer images.', dpi: 96, quality: 50 },
  { id: 'custom', title: 'Custom', text: 'Choose the image resolution and JPEG quality yourself.', dpi: 150, quality: 75 },
];

function savedPercent(before: number, after: number): string {
  const pct = (1 - after / before) * 100;
  if (pct < 0.1) return '<0.1 %';
  return pct < 1 ? `${pct.toFixed(1)} %` : `${Math.round(pct)} %`;
}

export default function CompressPdf() {
  const [items, setItems] = React.useState<CompressItem[]>([]);
  const [level, setLevel] = React.useState<Level>('recommended');
  const [customDpi, setCustomDpi] = React.useState(150);
  const [customQuality, setCustomQuality] = React.useState(75);
  const [rasterize, setRasterize] = React.useState(false);
  const [removeMetadata, setRemoveMetadata] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});

  const preset = LEVELS.find((l) => l.id === level);
  const dpi = level === 'custom' ? customDpi : preset.dpi;
  const quality = level === 'custom' ? customQuality : preset.quality;
  const lossless = level === 'lossless';

  const ids = items.map((it) => it.id).join();
  React.useEffect(() => setResults({}), [ids, level, dpi, quality, rasterize, removeMetadata]);

  const update = (id: string, patch: Partial<CompressItem>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
    const added = await Promise.all(pdfs.map(async (file): Promise<CompressItem> => ({
      id: uid(), name: file.name, bytes: await readBytes(file), pageCount: null, thumb: null, error: null,
    })));
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      pdfPreview(item.bytes)
        .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
        .catch((e) => update(item.id, { error: errorMessage(e) }));
    }
  }

  const ready = items.filter((it) => !it.error);

  async function compress() {
    setBusy(true);
    setResults({});
    const opts: CompressOptions = { images: !lossless, maxDpi: dpi, quality, rasterize: rasterize && !lossless, removeMetadata };
    const out: Record<string, ItemResult> = {};
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      const report = (f: number, label: string) => setProgress({ fraction: (i + f) / ready.length, label: `${item.name}: ${label}` });
      try {
        const r = await compressPdf(item.bytes, opts, report);
        const kept = r.bytes.length >= item.bytes.length;
        out[item.id] = { bytes: kept ? item.bytes : r.bytes, kept, images: r.imagesRecompressed };
      } catch (e) {
        out[item.id] = { bytes: item.bytes, kept: true, images: 0, error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id] && !results[it.id].error);
  const outputs: OutputFile[] = succeeded.map((it) => ({ name: `${baseName(it.name)}-compressed.pdf`, bytes: results[it.id].bytes }));
  const before = succeeded.reduce((s, it) => s + it.bytes.length, 0);
  const after = outputs.reduce((s, o) => s + o.bytes.length, 0);
  const done = !busy && outputs.length > 0;

  return (
    <PdfPage title={COMPRESS.title} showHub lead="Reduce the file size of PDFs while keeping text, links and bookmarks. Images are downsampled and re-encoded; everything else is repacked losslessly.">
      <ToolWorkspace
        tool={COMPRESS}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>Remove all</button>}
        sidebar={
          <>
            <div className={styles.levelList} role="radiogroup" aria-label="Compression level">
              {LEVELS.map((l) => (
                <label key={l.id} className={[styles.level, level === l.id ? styles.levelSelected : ''].join(' ')}>
                  <input type="radio" name="level" checked={level === l.id} onChange={() => setLevel(l.id)} />
                  <span><strong>{l.title}</strong><small>{l.text}</small></span>
                </label>
              ))}
            </div>
            {level === 'custom' && (
              <div className={styles.optionRow}>
                <Field label="Max image DPI"><NumberInput value={customDpi} onChange={setCustomDpi} min={30} max={600} /></Field>
                <Field label="JPEG quality (%)"><NumberInput value={customQuality} onChange={setCustomQuality} min={5} max={100} /></Field>
              </div>
            )}
            <div className={styles.options}>
              <Checkbox
                label={`Convert every page to an image at ${dpi} DPI (best for scans; removes selectable text, links and forms)`}
                checked={rasterize && !lossless}
                disabled={lossless}
                onChange={setRasterize}
              />
              <Checkbox label="Remove document metadata (title, author, XMP)" checked={removeMetadata} onChange={setRemoveMetadata} />
            </div>
            {notice && <p className={qrStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={busy || ready.length === 0} onClick={compress}>
              Compress {ready.length > 1 ? `${ready.length} PDFs` : 'PDF'}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {done && (
              <div className={styles.result}>
                <h3>{after < before ? `Saved ${savedPercent(before, after)}` : 'No savings'}</h3>
                <p>{formatBytes(before)} &rarr; {formatBytes(after)}</p>
                {outputs.length === 1
                  ? <button type="button" className={styles.primary} onClick={() => download(outputs[0].bytes, outputs[0].name)}>Download</button>
                  : <button type="button" className={styles.primary} onClick={() => download(zipFiles(outputs), 'compressed-pdfs.zip', 'application/zip')}>Download all (ZIP)</button>}
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
            const name = `${baseName(item.name)}-compressed.pdf`;
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${item.pageCount === null ? '…' : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`} · ${formatBytes(item.bytes.length)}`}
                error={item.error ?? r?.error}
                controls={controls}
                actions={r && !r.error && (
                  <button type="button" className={styles.buttonSmall} onClick={() => download(r.bytes, name)}>Download</button>
                )}
              >
                {r && !r.error && (
                  <div className={styles.fileMeta}>
                    {r.kept
                      ? 'Already optimal; the original is kept.'
                      : <span className={styles.saved}>{formatBytes(r.bytes.length)} (−{savedPercent(item.bytes.length, r.bytes.length)})</span>}
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
