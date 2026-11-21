import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, NumberInput, Select } from '../../components/UI/Fields';
import { PdfSizeBreakdown } from '../../lib/pdf/breakdown';
import { CompressColorMode, CompressOptions } from '../../lib/pdf/compress';
import { baseName, download, errorMessage, formatBytes, isPasswordError, isPdf, OutputFile, readBytes, uid, zipFiles } from '../../lib/pdf/files';
import { GhostscriptCompressPreset } from '../../lib/pdf/ghostscript';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { COMPRESS } from '../../lib/pdf/tools';
import { runCompressPdf, runInspectPdfSizeBreakdown } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface CompressItem {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  error: string | null;
  password?: string;
  locked?: boolean;
  breakdown: PdfSizeBreakdown | null;
}

interface ItemResult {
  bytes: Uint8Array;
  // The compressed file was not smaller, so the original is returned.
  kept: boolean;
  images: number;
  duplicatesMerged: number;
  qpdfSavedBytes: number;
  error?: string;
}

type Level = 'lossless' | 'recommended' | 'strong' | 'ghostscript' | 'custom';

const LEVELS: { id: Level; title: string; text: string; dpi: number; quality: number }[] = [
  { id: 'lossless', title: 'Lossless', text: 'Removes unused objects and recompresses streams. Nothing visible changes.', dpi: 150, quality: 75 },
  { id: 'recommended', title: 'Recommended', text: 'Images at up to 150 DPI, JPEG quality 75 %. Good for screens and office printing.', dpi: 150, quality: 75 },
  { id: 'strong', title: 'Strong', text: 'Images at up to 96 DPI, JPEG quality 50 %. Smallest files, visibly softer images.', dpi: 96, quality: 50 },
  {
    id: 'ghostscript',
    title: 'Ghostscript (maximum)',
    text: 'Deep vector-preserving compression with Ghostscript WebAssembly. Keeps selectable text and vector graphics; loaded locally on demand.',
    dpi: 150,
    quality: 75,
  },
  { id: 'custom', title: 'Custom', text: 'Choose the image resolution and JPEG quality yourself.', dpi: 150, quality: 75 },
];

const GS_PRESETS: [GhostscriptCompressPreset, string][] = [
  ['screen', 'Screen — 72 DPI (smallest)'],
  ['ebook', 'eBook — 150 DPI (balanced)'],
  ['printer', 'Printer — 300 DPI (high quality)'],
  ['prepress', 'Prepress — 300 DPI (archival color)'],
];

const COLOR_MODES: [CompressColorMode, string][] = [
  ['original', 'Keep original'],
  ['grayscale', 'Grayscale'],
  ['bw1bit', '1-bit B&W (best for scans)'],
];

function savedPercent(before: number, after: number): string {
  const pct = (1 - after / before) * 100;
  if (pct < 0.1) return '<0.1 %';
  return pct < 1 ? `${pct.toFixed(1)} %` : `${Math.round(pct)} %`;
}

function summarizeDetails(images: number, duplicatesMerged: number, qpdfSavedBytes: number): string {
  const parts: string[] = [];
  if (images > 0) parts.push(`${images} image${images === 1 ? '' : 's'} compressed`);
  if (duplicatesMerged > 0) parts.push(`${duplicatesMerged} duplicate object${duplicatesMerged === 1 ? '' : 's'} merged`);
  if (qpdfSavedBytes > 0) parts.push(`QPDF saved ${formatBytes(qpdfSavedBytes)}`);
  return parts.join(' · ');
}

function SizeBreakdownCard({ name, breakdown }: { name: string; breakdown: PdfSizeBreakdown }) {
  const visible = breakdown.categories.filter((c) => c.bytes > 0);
  const sum = Math.max(1, visible.reduce((s, c) => s + c.bytes, 0));
  return (
    <section className={styles.report}>
      <h3>Size breakdown — {name} ({formatBytes(breakdown.totalBytes)})</h3>
      <div className={styles.breakdownBar} role="img" aria-label={`File size breakdown for ${name}`}>
        {visible.map((c) => (
          <div
            key={c.id}
            style={{ width: `${(c.bytes / sum) * 100}%`, backgroundColor: c.color }}
            title={`${c.label}: ${formatBytes(c.bytes)} (${Math.round((c.bytes / sum) * 100)}%)`}
          />
        ))}
      </div>
      <div className={styles.breakdownLegend}>
        {visible.map((c) => {
          const pct = (c.bytes / sum) * 100;
          const pctLabel = pct < 1 ? '<1%' : `${Math.round(pct)}%`;
          return (
            <span key={c.id} className={styles.breakdownItem}>
              <span style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c.color, flexShrink: 0 }} />
              <span>{c.label}: <strong>{formatBytes(c.bytes)}</strong> ({pctLabel})</span>
            </span>
          );
        })}
      </div>
    </section>
  );
}

export default function CompressPdf() {
  const [items, setItems] = React.useState<CompressItem[]>([]);
  const [level, setLevel] = React.useState<Level>('recommended');
  const [customDpi, setCustomDpi] = React.useState(150);
  const [customQuality, setCustomQuality] = React.useState(75);
  const [colorMode, setColorMode] = React.useState<CompressColorMode>('original');
  const [gsPreset, setGsPreset] = React.useState<GhostscriptCompressPreset>('ebook');
  const [gsGrayscale, setGsGrayscale] = React.useState(false);
  const [rasterize, setRasterize] = React.useState(false);
  const [removeMetadata, setRemoveMetadata] = React.useState(false);
  const [deduplicateObjects, setDeduplicateObjects] = React.useState(true);
  const [qpdfOptimize, setQpdfOptimize] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const preset = LEVELS.find((l) => l.id === level);
  const dpi = level === 'custom' ? customDpi : preset.dpi;
  const quality = level === 'custom' ? customQuality : preset.quality;
  const lossless = level === 'lossless';
  const isGhostscript = level === 'ghostscript';

  const ids = items.map((it) => it.id).join();
  React.useEffect(
    () => setResults({}),
    [ids, level, dpi, quality, colorMode, gsPreset, gsGrayscale, rasterize, removeMetadata, deduplicateObjects, qpdfOptimize],
  );

  const update = (id: string, patch: Partial<CompressItem>) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
    const added = await Promise.all(pdfs.map(async (file): Promise<CompressItem> => ({
      id: uid(), name: file.name, bytes: await readBytes(file), pageCount: null, thumb: null, error: null, breakdown: null,
    })));
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      pdfPreview(item.bytes)
        .then((p) => {
          update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail });
          return runInspectPdfSizeBreakdown(item.bytes)
            .then((breakdown) => update(item.id, { breakdown }))
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
      update(activeLocked.id, { pageCount: p.pageCount, thumb: p.thumbnail, password, locked: false, error: null });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      void runInspectPdfSizeBreakdown(activeLocked.bytes, password)
        .then((breakdown) => update(activeLocked.id, { breakdown }))
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

  async function compress() {
    setBusy(true);
    setResults({});
    const baseOpts: CompressOptions = isGhostscript
      ? {
          images: false,
          maxDpi: dpi,
          quality,
          rasterize: false,
          removeMetadata,
          deduplicateObjects: false,
          colorMode: gsGrayscale ? 'grayscale' : 'original',
          qpdfOptimize,
          ghostscriptPreset: gsPreset,
        }
      : {
          images: !lossless,
          maxDpi: dpi,
          quality,
          rasterize: rasterize && !lossless,
          removeMetadata,
          deduplicateObjects,
          colorMode: lossless ? 'original' : colorMode,
          qpdfOptimize,
        };
    const out: Record<string, ItemResult> = {};
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      const report = (f: number, label: string) => setProgress({ fraction: (i + f) / ready.length, label: `${item.name}: ${label}` });
      try {
        const r = await runCompressPdf(item.bytes, { ...baseOpts, password: item.password }, report);
        const kept = r.bytes.length >= item.bytes.length;
        const duplicatesMerged = (r.duplicateImagesMerged ?? 0) + (r.duplicateFontsMerged ?? 0);
        out[item.id] = {
          bytes: kept ? item.bytes : r.bytes,
          kept,
          images: r.imagesRecompressed,
          duplicatesMerged,
          qpdfSavedBytes: r.qpdfSavedBytes ?? 0,
        };
      } catch (e) {
        out[item.id] = { bytes: item.bytes, kept: true, images: 0, duplicatesMerged: 0, qpdfSavedBytes: 0, error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id] && !results[it.id].error);
  const outputs: OutputFile[] = succeeded.map((it) => ({ name: `${baseName(it.name)}-compressed.pdf`, bytes: results[it.id].bytes }));
  const before = succeeded.reduce((s, it) => s + it.bytes.length, 0);
  const after = outputs.reduce((s, o) => s + o.bytes.length, 0);
  const totalImages = succeeded.reduce((s, it) => s + results[it.id].images, 0);
  const totalDuplicates = succeeded.reduce((s, it) => s + results[it.id].duplicatesMerged, 0);
  const totalQpdfSaved = succeeded.reduce((s, it) => s + results[it.id].qpdfSavedBytes, 0);
  const summaryDetail = summarizeDetails(totalImages, totalDuplicates, totalQpdfSaved);
  const done = !busy && outputs.length > 0;

  return (
    <PdfPage title={COMPRESS.title} showHub lead="Reduce the file size of PDFs while keeping text, links and bookmarks. Images are downsampled to their on-page size and re-encoded; duplicate objects and streams are repacked losslessly.">
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
              {isGhostscript ? (
                <>
                  <Field label="Ghostscript preset">
                    <Select<GhostscriptCompressPreset>
                      value={gsPreset}
                      onChange={setGsPreset}
                      options={GS_PRESETS}
                    />
                  </Field>
                  <Checkbox
                    label="Convert colours to grayscale"
                    checked={gsGrayscale}
                    onChange={setGsGrayscale}
                  />
                </>
              ) : (
                <>
                  <Field label="Colour mode">
                    <Select<CompressColorMode>
                      value={lossless ? 'original' : colorMode}
                      disabled={lossless}
                      onChange={setColorMode}
                      options={COLOR_MODES}
                    />
                  </Field>
                  <Checkbox
                    label={`Convert every page to an image at ${dpi} DPI (best for scans; removes selectable text, links and forms)`}
                    checked={rasterize && !lossless}
                    disabled={lossless}
                    onChange={setRasterize}
                  />
                  <Checkbox label="Merge duplicate fonts & images" checked={deduplicateObjects} onChange={setDeduplicateObjects} />
                </>
              )}
              <Checkbox label="Remove document metadata (title, author, XMP)" checked={removeMetadata} onChange={setRemoveMetadata} />
              <Checkbox label="Deep structure optimization (QPDF WebAssembly)" checked={qpdfOptimize} onChange={setQpdfOptimize} />
            </div>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={busy || ready.length === 0} onClick={compress}>
              Compress {ready.length > 1 ? `${ready.length} PDFs` : 'PDF'}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {done && (
              <div className={styles.result}>
                <h3>{after < before ? `Saved ${savedPercent(before, after)}` : 'No savings'}</h3>
                <p>{formatBytes(before)} &rarr; {formatBytes(after)}</p>
                {summaryDetail && <p className={styles.hint}>{summaryDetail}</p>}
                {outputs.length === 1
                  ? <button type="button" className={styles.primary} onClick={() => download(outputs[0].bytes, outputs[0].name)}>Download</button>
                  : <button type="button" className={styles.primary} onClick={() => download(zipFiles(outputs), 'compressed-pdfs.zip', 'application/zip')}>Download all (ZIP)</button>}
                <ContinueWith currentToolId={COMPRESS.id} files={outputs} />
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
            const name = `${baseName(item.name)}-compressed.pdf`;
            const cardDetail = r && !r.error ? summarizeDetails(r.images, r.duplicatesMerged, r.qpdfSavedBytes) : '';
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${item.locked ? 'Password protected' : item.pageCount === null ? '…' : `${item.pageCount} page${item.pageCount === 1 ? '' : 's'}`} · ${formatBytes(item.bytes.length)}`}
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
                    {cardDetail && <div>{cardDetail}</div>}
                  </div>
                )}
              </FileCard>
            );
          }}
        />
        {items.map((item) => item.breakdown && (
          <SizeBreakdownCard key={item.id} name={item.name} breakdown={item.breakdown} />
        ))}
      </ToolWorkspace>
    </PdfPage>
  );
}
