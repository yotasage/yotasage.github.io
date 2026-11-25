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
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
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

const LEVELS: { id: Level; titleKey: TranslationKey; textKey: TranslationKey; dpi: number; quality: number }[] = [
  { id: 'lossless', titleKey: 'pdf.p.cmp.lvlLossless', textKey: 'pdf.p.cmp.lvlLosslessDesc', dpi: 150, quality: 75 },
  { id: 'recommended', titleKey: 'pdf.p.cmp.lvlRec', textKey: 'pdf.p.cmp.lvlRecDesc', dpi: 150, quality: 75 },
  { id: 'strong', titleKey: 'pdf.p.cmp.lvlStrong', textKey: 'pdf.p.cmp.lvlStrongDesc', dpi: 96, quality: 50 },
  { id: 'ghostscript', titleKey: 'pdf.p.cmp.lvlGs', textKey: 'pdf.p.cmp.lvlGsDesc', dpi: 150, quality: 75 },
  { id: 'custom', titleKey: 'pdf.p.cmp.lvlCustom', textKey: 'pdf.p.cmp.lvlCustomDesc', dpi: 150, quality: 75 },
];

function savedPercent(before: number, after: number): string {
  const pct = (1 - after / before) * 100;
  if (pct < 0.1) return '<0.1 %';
  return pct < 1 ? `${pct.toFixed(1)} %` : `${Math.round(pct)} %`;
}

function SizeBreakdownCard({ name, breakdown }: { name: string; breakdown: PdfSizeBreakdown }) {
  const { t } = useI18n();
  const visible = breakdown.categories.filter((c) => c.bytes > 0);
  const sum = Math.max(1, visible.reduce((s, c) => s + c.bytes, 0));
  return (
    <section className={styles.report}>
      <h3>{t('pdf.p.cmp.breakdownTitle', { name, size: formatBytes(breakdown.totalBytes) })}</h3>
      <div className={styles.breakdownBar} role="img" aria-label={t('pdf.p.cmp.breakdownAria', { name })}>
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
  const { t } = useI18n();
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
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
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
  function summarizeDetails(images: number, duplicatesMerged: number, qpdfSavedBytes: number): string {
    const parts: string[] = [];
    if (images > 0) parts.push(t(images === 1 ? 'pdf.p.cmp.imgCompOne' : 'pdf.p.cmp.imgCompMany', { n: images }));
    if (duplicatesMerged > 0) parts.push(t(duplicatesMerged === 1 ? 'pdf.p.cmp.dupOne' : 'pdf.p.cmp.dupMany', { n: duplicatesMerged }));
    if (qpdfSavedBytes > 0) parts.push(t('pdf.p.cmp.qpdfSaved', { size: formatBytes(qpdfSavedBytes) }));
    return parts.join(' · ');
  }

  const gsPresets: [GhostscriptCompressPreset, string][] = React.useMemo(() => [
    ['screen', t('pdf.p.cmp.gsScreen')],
    ['ebook', t('pdf.p.cmp.gsEbook')],
    ['printer', t('pdf.p.cmp.gsPrinter')],
    ['prepress', t('pdf.p.cmp.gsPrepress')],
  ], [t]);

  const colorModes: [CompressColorMode, string][] = React.useMemo(() => [
    ['original', t('pdf.p.cmp.cmOrig')],
    ['grayscale', t('pdf.p.grayscale')],
    ['bw1bit', t('pdf.p.cmp.cmBw')],
  ], [t]);

  const summaryDetail = summarizeDetails(totalImages, totalDuplicates, totalQpdfSaved);
  const done = !busy && outputs.length > 0;

  return (
    <PdfPage title={COMPRESS.title} showHub lead={t('pdf.p.cmp.lead')}>
      <ToolWorkspace
        tool={COMPRESS}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.dropPdfs')}
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>{t('pdf.p.removeAll')}</button>}
        sidebar={
          <>
            <div className={styles.levelList} role="radiogroup" aria-label={t('pdf.p.cmp.levelAria')}>
              {LEVELS.map((l) => (
                <label key={l.id} className={[styles.level, level === l.id ? styles.levelSelected : ''].join(' ')}>
                  <input type="radio" name="level" checked={level === l.id} onChange={() => setLevel(l.id)} />
                  <span><strong>{t(l.titleKey)}</strong><small>{t(l.textKey)}</small></span>
                </label>
              ))}
            </div>
            {level === 'custom' && (
              <div className={styles.optionRow}>
                <Field label={t('pdf.p.cmp.maxDpi')}><NumberInput value={customDpi} onChange={setCustomDpi} min={30} max={600} /></Field>
                <Field label={t('pdf.p.jpegQuality')}><NumberInput value={customQuality} onChange={setCustomQuality} min={5} max={100} /></Field>
              </div>
            )}
            <div className={styles.options}>
              {isGhostscript ? (
                <>
                  <Field label={t('pdf.p.cmp.gsPreset')}>
                    <Select<GhostscriptCompressPreset>
                      value={gsPreset}
                      onChange={setGsPreset}
                      options={gsPresets}
                    />
                  </Field>
                  <Checkbox
                    label={t('pdf.p.cmp.gsGray')}
                    checked={gsGrayscale}
                    onChange={setGsGrayscale}
                  />
                </>
              ) : (
                <>
                  <Field label={t('pdf.p.cmp.colorMode')}>
                    <Select<CompressColorMode>
                      value={lossless ? 'original' : colorMode}
                      disabled={lossless}
                      onChange={setColorMode}
                      options={colorModes}
                    />
                  </Field>
                  <Checkbox
                    label={t('pdf.p.cmp.rasterize', { dpi })}
                    checked={rasterize && !lossless}
                    disabled={lossless}
                    onChange={setRasterize}
                  />
                  <Checkbox label={t('pdf.p.cmp.dedup')} checked={deduplicateObjects} onChange={setDeduplicateObjects} />
                </>
              )}
              <Checkbox label={t('pdf.p.cmp.remMeta')} checked={removeMetadata} onChange={setRemoveMetadata} />
              <Checkbox label={t('pdf.p.cmp.qpdfOpt')} checked={qpdfOptimize} onChange={setQpdfOptimize} />
            </div>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={busy || ready.length === 0} onClick={compress}>
              {ready.length > 1 ? t('pdf.p.cmp.btnMany', { n: ready.length }) : t('pdf.p.cmp.btnOne')}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {done && (
              <div className={styles.result}>
                <h3>{after < before ? t('pdf.p.cmp.savedPct', { pct: savedPercent(before, after) }) : t('pdf.p.cmp.noSavings')}</h3>
                <p>{formatBytes(before)} &rarr; {formatBytes(after)}</p>
                {summaryDetail && <p className={styles.hint}>{summaryDetail}</p>}
                {outputs.length === 1
                  ? <button type="button" className={styles.primary} onClick={() => download(outputs[0].bytes, outputs[0].name)}>{t('pdf.p.download')}</button>
                  : <button type="button" className={styles.primary} onClick={() => download(zipFiles(outputs), 'compressed-pdfs.zip', 'application/zip')}>{t('pdf.p.downloadAllZip')}</button>}
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
            const pageLabel = item.locked
              ? t('pdf.p.pwProtected')
              : item.pageCount === null
                ? '…'
                : t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount });
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${pageLabel} · ${formatBytes(item.bytes.length)}`}
                error={item.error ?? r?.error}
                controls={controls}
                actions={r && !r.error && (
                  <button type="button" className={styles.buttonSmall} onClick={() => download(r.bytes, name)}>{t('pdf.p.download')}</button>
                )}
              >
                {r && !r.error && (
                  <div className={styles.fileMeta}>
                    {r.kept
                      ? t('pdf.p.cmp.alreadyOpt')
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
