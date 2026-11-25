import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { FileCard, FileGrid } from '../../components/PdfTools/FileGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/UI/Fields';
import { PageBoxInfo } from '../../lib/pdf/crop';
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
import { parsePageRanges } from '../../lib/pdf/merge';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import {
  PageOrientation,
  RESIZE_PRESETS,
  ResizeFitMode,
  ResizeOptions,
  ResizePresetKey,
  ResizeUnit,
  toPoints,
} from '../../lib/pdf/resize';
import { RESIZE } from '../../lib/pdf/tools';
import { runGetPageBoxes, runResizePdf } from '../../lib/pdf/workerClient';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface Item {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  thumb: string | null;
  boxes: PageBoxInfo[] | null;
  error: string | null;
  password?: string;
  locked?: boolean;
}

interface ItemResult {
  bytes?: Uint8Array;
  boxes?: PageBoxInfo[];
  error?: string;
}

const PT_TO_MM = 25.4 / 72;

function fmtMm(pt: number): string {
  return `${Math.round(pt * PT_TO_MM)}`;
}

function summarizeBoxes(boxes: PageBoxInfo[], locale: Locale): string {
  if (!boxes.length) return translate(locale, 'pdf.rsz.empty');
  const first = boxes[0];
  const same = boxes.every(
    (b) => Math.abs(b.visualWidth - first.visualWidth) < 1 && Math.abs(b.visualHeight - first.visualHeight) < 1,
  );
  const dims = `${fmtMm(first.visualWidth)} × ${fmtMm(first.visualHeight)} mm`;
  return same ? dims : translate(locale, 'pdf.rsz.mixed', { dims });
}

export default function ResizePdfPage() {
  const { locale, t } = useI18n();
  const [items, setItems] = React.useState<Item[]>([]);
  const [preset, setPreset] = React.useState<ResizePresetKey>('a4');
  const [customWidth, setCustomWidth] = React.useState(210);
  const [customHeight, setCustomHeight] = React.useState(297);
  const [customUnit, setCustomUnit] = React.useState<ResizeUnit>('mm');
  const [orientation, setOrientation] = React.useState<PageOrientation>('auto');
  const [fitMode, setFitMode] = React.useState<ResizeFitMode>('fit');
  const [margin, setMargin] = React.useState(0);
  const [pageRange, setPageRange] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, ItemResult>>({});
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const ids = items.map((it) => it.id).join();
  React.useEffect(() => {
    setResults({});
  }, [ids, preset, customWidth, customHeight, customUnit, orientation, fitMode, margin, pageRange]);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? t('pdf.p.skippedNonPdf', { n: files.length - pdfs.length }) : null);
    const added = await Promise.all(
      pdfs.map(async (file): Promise<Item> => ({
        id: uid(),
        name: file.name,
        bytes: await readBytes(file),
        pageCount: null,
        thumb: null,
        boxes: null,
        error: null,
      })),
    );
    setItems((list) => [...list, ...added]);
    for (const item of added) {
      runGetPageBoxes(item.bytes)
        .then((boxes) => {
          update(item.id, { boxes, pageCount: boxes.length });
          void pdfPreview(item.bytes)
            .then((p) => update(item.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
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
      const boxes = await runGetPageBoxes(activeLocked.bytes, password);
      update(activeLocked.id, {
        boxes,
        pageCount: boxes.length,
        password,
        locked: false,
        error: null,
      });
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      void pdfPreview(activeLocked.bytes, 240, password)
        .then((p) => update(activeLocked.id, { pageCount: p.pageCount, thumb: p.thumbnail }))
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

  const ready = items.filter((it) => !it.error && !it.locked && it.boxes !== null);
  const sampleBox = ready[0]?.boxes?.[0] ?? null;
  const srcW = sampleBox?.visualWidth ?? 612;
  const srcH = sampleBox?.visualHeight ?? 792;

  const baseDims = React.useMemo(() => {
    if (preset === 'custom') {
      try {
        return {
          width: toPoints(customWidth, customUnit),
          height: toPoints(customHeight, customUnit),
          error: null as string | null,
        };
      } catch (e) {
        return { width: 595.28, height: 841.89, error: errorMessage(e) };
      }
    }
    const spec = RESIZE_PRESETS[preset];
    return { width: spec.widthPt, height: spec.heightPt, error: null as string | null };
  }, [preset, customWidth, customHeight, customUnit]);

  const targetDims = React.useMemo(() => {
    const shortSide = Math.min(baseDims.width, baseDims.height);
    const longSide = Math.max(baseDims.width, baseDims.height);
    if (orientation === 'portrait') return { w: shortSide, h: longSide };
    if (orientation === 'landscape') return { w: longSide, h: shortSide };
    return srcW > srcH ? { w: longSide, h: shortSide } : { w: shortSide, h: longSide };
  }, [baseDims, orientation, srcW, srcH]);

  const rangeError = React.useMemo(() => {
    if (items.length !== 1 || !ready[0]?.pageCount || !pageRange.trim()) return null;
    try {
      parsePageRanges(pageRange, ready[0].pageCount);
      return null;
    } catch (e) {
      return errorMessage(e);
    }
  }, [items.length, ready, pageRange]);

  const canResize = ready.length > 0 && !baseDims.error && !rangeError;

  async function runResize() {
    if (!canResize) return;
    setBusy(true);
    setResults({});
    const out: Record<string, ItemResult> = {};
    const opts: ResizeOptions = {
      preset,
      customWidth: preset === 'custom' ? customWidth : undefined,
      customHeight: preset === 'custom' ? customHeight : undefined,
      customUnit: preset === 'custom' ? customUnit : undefined,
      orientation,
      fitMode,
      margin,
      pageRange: items.length === 1 && pageRange.trim() ? pageRange.trim() : undefined,
    };

    for (let i = 0; i < ready.length; i++) {
      const item = ready[i];
      setProgress({ fraction: i / ready.length, label: item.name });
      await nextFrame();
      try {
        const bytes = await runResizePdf(item.bytes, opts, item.password);
        const boxes = await runGetPageBoxes(bytes);
        out[item.id] = { bytes, boxes };
      } catch (e) {
        out[item.id] = { error: errorMessage(e) };
      }
      setResults({ ...out });
    }
    setBusy(false);
  }

  const succeeded = ready.filter((it) => results[it.id]?.bytes);
  const outputs: OutputFile[] = succeeded.map((it) => ({
    name: `${baseName(it.name)}-resized.pdf`,
    bytes: results[it.id].bytes!,
  }));
  const done = !busy && outputs.length > 0;

  // Live SVG layout preview geometry.
  const diagram = React.useMemo(() => {
    const svgW = 360;
    const svgH = 220;
    const pad = 22;
    const scale = Math.min((svgW - pad * 2) / targetDims.w, (svgH - pad * 2) / targetDims.h);
    const sheetW = targetDims.w * scale;
    const sheetH = targetDims.h * scale;
    const sheetX = (svgW - sheetW) / 2;
    const sheetY = (svgH - sheetH) / 2;

    const safeMarginPt = Math.max(0, Math.min(margin, Math.min(targetDims.w, targetDims.h) / 2 - 1));
    const availWPt = Math.max(1, targetDims.w - safeMarginPt * 2);
    const availHPt = Math.max(1, targetDims.h - safeMarginPt * 2);

    let xScale: number;
    let yScale: number;
    if (fitMode === 'fill') {
      const s = Math.max(availWPt / srcW, availHPt / srcH);
      xScale = s;
      yScale = s;
    } else if (fitMode === 'stretch') {
      xScale = availWPt / srcW;
      yScale = availHPt / srcH;
    } else if (fitMode === 'center') {
      xScale = 1;
      yScale = 1;
    } else {
      const s = Math.min(availWPt / srcW, availHPt / srcH);
      xScale = s;
      yScale = s;
    }

    const drawW = srcW * xScale * scale;
    const drawH = srcH * yScale * scale;
    const marginPx = safeMarginPt * scale;
    const availW = availWPt * scale;
    const availH = availHPt * scale;
    const contentX = sheetX + marginPx + (availW - drawW) / 2;
    const contentY = sheetY + marginPx + (availH - drawH) / 2;

    return {
      svgW,
      svgH,
      sheetX,
      sheetY,
      sheetW,
      sheetH,
      marginPx,
      availX: sheetX + marginPx,
      availY: sheetY + marginPx,
      availW,
      availH,
      contentX,
      contentY,
      drawW,
      drawH,
      clipped: drawW > availW + 0.5 || drawH > availH + 0.5,
    };
  }, [targetDims, margin, fitMode, srcW, srcH]);

  const fitModeLabel =
    fitMode === 'fit'
      ? t('pdf.rsz.fitNameFit')
      : fitMode === 'fill'
        ? t('pdf.rsz.fitNameFill')
        : fitMode === 'stretch'
          ? t('pdf.rsz.fitNameStretch')
          : t('pdf.rsz.fitNameCenter');

  return (
    <PdfPage
      title={RESIZE.title}
      showHub
      lead={t('pdf.rsz.lead')}
    >
      <ToolWorkspace
        tool={RESIZE}
        accept="application/pdf,.pdf"
        selectLabel={t('pdf.p.selectPdfs')}
        dropLabel={t('pdf.p.dropPdfs')}
        hasFiles={items.length > 0}
        onFiles={addFiles}
        toolbar={
          <button type="button" className={styles.buttonSmall} onClick={() => setItems([])}>
            {t('pdf.p.removeAll')}
          </button>
        }
        sidebar={
          <>
            <Field label={t('pdf.rsz.targetSize')}>
              <Select
                value={preset}
                onChange={setPreset}
                options={[
                  ['a4', t('pdf.p.paperA4')],
                  ['a3', t('pdf.p.paperA3')],
                  ['a5', t('pdf.p.paperA5')],
                  ['letter', t('pdf.p.paperLetter')],
                  ['legal', t('pdf.p.paperLegal')],
                  ['tabloid', t('pdf.p.paperTabloid')],
                  ['custom', t('pdf.p.customDims')],
                ]}
              />
            </Field>

            {preset === 'custom' && (
              <>
                <div className={styles.optionRow}>
                  <Field label={t('pdf.p.widthUnit', { u: customUnit })}>
                    <NumberInput value={customWidth} min={1} max={10000} step="any" onChange={setCustomWidth} />
                  </Field>
                  <Field label={t('pdf.p.heightUnit', { u: customUnit })}>
                    <NumberInput value={customHeight} min={1} max={10000} step="any" onChange={setCustomHeight} />
                  </Field>
                </div>
                <Field label={t('pdf.p.unit')}>
                  <Select
                    value={customUnit}
                    onChange={setCustomUnit}
                    options={[
                      ['mm', t('pdf.p.unitMm')],
                      ['in', t('pdf.p.unitIn')],
                      ['pt', t('pdf.p.unitPt')],
                    ]}
                  />
                </Field>
              </>
            )}

            <Field label={t('pdf.p.orientation')}>
              <Select
                value={orientation}
                onChange={setOrientation}
                options={[
                  ['auto', t('pdf.rsz.orientAuto')],
                  ['portrait', t('pdf.p.portrait')],
                  ['landscape', t('pdf.p.landscape')],
                ]}
              />
            </Field>

            <Field label={t('pdf.rsz.fitMode')}>
              <Select
                value={fitMode}
                onChange={setFitMode}
                options={[
                  ['fit', t('pdf.rsz.fitContain')],
                  ['fill', t('pdf.rsz.fitFill')],
                  ['stretch', t('pdf.rsz.fitStretch')],
                  ['center', t('pdf.rsz.fitCenter')],
                ]}
              />
            </Field>

            <Field label={t('pdf.rsz.uniformMargin')} help="72 pt = 1 in ≈ 25.4 mm">
              <NumberInput value={margin} min={0} max={240} step={2} onChange={setMargin} />
            </Field>

            {items.length === 1 && (
              <Field label={t('pdf.p.pageRangeOpt')} help={t('pdf.rsz.rangeHelp')}>
                <input
                  className={fieldStyles.input}
                  value={pageRange}
                  placeholder={t('pdf.p.allPages')}
                  onChange={(e) => setPageRange(e.target.value)}
                />
              </Field>
            )}

            {baseDims.error && <p className={fieldStyles.warning}>{baseDims.error}</p>}
            {rangeError && <p className={fieldStyles.warning}>{rangeError}</p>}
            {notice && <p className={fieldStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !canResize}
              onClick={runResize}
            >
              {ready.length > 1 ? t('pdf.rsz.btnMany', { n: ready.length }) : t('pdf.rsz.btnOne')}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}

            {done && (
              <div className={styles.result}>
                <h3>
                  {outputs.length === 1 ? t('pdf.rsz.doneOne') : t('pdf.rsz.doneMany', { n: outputs.length })}
                </h3>
                <p>
                  {t('pdf.rsz.targetSummary', {
                    wMm: fmtMm(targetDims.w),
                    hMm: fmtMm(targetDims.h),
                    wPt: Math.round(targetDims.w),
                    hPt: Math.round(targetDims.h),
                    mode: fitModeLabel,
                  })}
                </p>
                {outputs.length === 1 ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(outputs[0].bytes, outputs[0].name)}
                  >
                    {t('pdf.ff.downloadNamed', { name: outputs[0].name })}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => download(zipFiles(outputs), 'resized-pdfs.zip', 'application/zip')}
                  >
                    {t('pdf.p.downloadAllZip')}
                  </button>
                )}
                <ContinueWith currentToolId={RESIZE.id} files={outputs} />
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

        <div className={styles.diagramCard}>
          <div className={styles.diagramHeader}>
            <h3>{t('pdf.rsz.layoutPreview')}</h3>
            <span className={styles.fileBannerMeta}>
              {fmtMm(srcW)}×{fmtMm(srcH)} mm &rarr; {fmtMm(targetDims.w)}×{fmtMm(targetDims.h)} mm
            </span>
          </div>
          <div className={styles.diagramStage}>
            <svg
              viewBox={`0 0 ${diagram.svgW} ${diagram.svgH}`}
              width={diagram.svgW}
              height={diagram.svgH}
              className={styles.diagramSvg}
              role="img"
              aria-label={t('pdf.rsz.svgAria', {
                mode: fitModeLabel,
                w: fmtMm(targetDims.w),
                h: fmtMm(targetDims.h),
              })}
            >
              <defs>
                <clipPath id="resize-avail-clip">
                  <rect x={diagram.availX} y={diagram.availY} width={diagram.availW} height={diagram.availH} />
                </clipPath>
              </defs>
              {/* Target paper sheet */}
              <rect
                x={diagram.sheetX}
                y={diagram.sheetY}
                width={diagram.sheetW}
                height={diagram.sheetH}
                fill="#f5f5f5"
                stroke="#888"
                strokeWidth={1.2}
                rx={2}
              />
              {/* Overflow ghost when fill or center clips */}
              {diagram.clipped && (
                <rect
                  x={diagram.contentX}
                  y={diagram.contentY}
                  width={diagram.drawW}
                  height={diagram.drawH}
                  fill="rgba(229, 154, 58, 0.14)"
                  stroke="#e59a3a"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              )}
              {/* Clipped placed source page */}
              <g clipPath="url(#resize-avail-clip)">
                <rect
                  x={diagram.contentX}
                  y={diagram.contentY}
                  width={diagram.drawW}
                  height={diagram.drawH}
                  fill="rgba(47, 174, 107, 0.25)"
                  stroke="#2fae6b"
                  strokeWidth={1.5}
                />
                {/* Symbolic content lines inside placed page */}
                <line
                  x1={diagram.contentX + diagram.drawW * 0.14}
                  y1={diagram.contentY + diagram.drawH * 0.25}
                  x2={diagram.contentX + diagram.drawW * 0.86}
                  y2={diagram.contentY + diagram.drawH * 0.25}
                  stroke="#1c7a47"
                  strokeWidth={1.5}
                />
                <line
                  x1={diagram.contentX + diagram.drawW * 0.14}
                  y1={diagram.contentY + diagram.drawH * 0.42}
                  x2={diagram.contentX + diagram.drawW * 0.72}
                  y2={diagram.contentY + diagram.drawH * 0.42}
                  stroke="#1c7a47"
                  strokeWidth={1.5}
                />
                <line
                  x1={diagram.contentX + diagram.drawW * 0.14}
                  y1={diagram.contentY + diagram.drawH * 0.59}
                  x2={diagram.contentX + diagram.drawW * 0.8}
                  y2={diagram.contentY + diagram.drawH * 0.59}
                  stroke="#1c7a47"
                  strokeWidth={1.5}
                />
              </g>
              {/* Margin box */}
              {diagram.marginPx > 0.5 && (
                <rect
                  x={diagram.availX}
                  y={diagram.availY}
                  width={diagram.availW}
                  height={diagram.availH}
                  fill="none"
                  stroke="#4da3ff"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              )}
              <text
                x={diagram.svgW / 2}
                y={diagram.sheetY + diagram.sheetH + 15}
                textAnchor="middle"
                fill="#b8b8b8"
                fontSize={11}
              >
                {Math.round(targetDims.w)} × {Math.round(targetDims.h)} pt
                {diagram.clipped ? t('pdf.rsz.overflowClipped') : ''}
              </text>
            </svg>
          </div>
        </div>

        <FileGrid
          items={items}
          onChange={setItems}
          sortable={false}
          renderCard={(item, _index, controls) => {
            const r = results[item.id];
            const output = outputs[succeeded.indexOf(item)];
            return (
              <FileCard
                thumb={item.thumb}
                name={item.name}
                meta={`${
                  item.locked
                    ? t('pdf.p.pwProtected')
                    : item.pageCount === null
                      ? '…'
                      : t(item.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: item.pageCount })
                } · ${formatBytes(r?.bytes ? r.bytes.length : item.bytes.length)}`}
                error={item.error ?? r?.error}
                controls={controls}
                actions={
                  output && (
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => download(output.bytes, output.name)}
                    >
                      {t('pdf.p.download')}
                    </button>
                  )
                }
              >
                {!item.error && !item.locked && (
                  <div className={styles.fileMeta}>
                    {r?.boxes ? (
                      <span className={styles.saved}>
                        {t('pdf.rsz.nowMeta', { dims: summarizeBoxes(r.boxes, locale) })}
                      </span>
                    ) : item.boxes ? (
                      t('pdf.rsz.srcMeta', { dims: summarizeBoxes(item.boxes, locale) })
                    ) : (
                      t('pdf.p.inspecting')
                    )}
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
