import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, NumberInput, Select } from '../../components/UI/Fields';
import { PageBoxInfo } from '../../lib/pdf/crop';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  readBytes,
  safeFileName,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { parsePageRanges } from '../../lib/pdf/merge';
import {
  BookletOptions,
  computeBookletOrder,
  NupOptions,
  NupPerSheet,
  NupReadingOrder,
  SheetPaperSize,
} from '../../lib/pdf/nup';
import { RESIZE_PRESETS, ResizeUnit, toPoints } from '../../lib/pdf/resize';
import { NUP } from '../../lib/pdf/tools';
import { runBookletPdf, runGetPageBoxes, runNupPdf } from '../../lib/pdf/workerClient';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

type ImposeMode = 'nup' | 'booklet';
type PerSheetChoice = '2' | '4' | '6' | '9' | '16' | 'custom';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  boxes: PageBoxInfo[];
  password?: string;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

function resolveSheetPaper(
  paperSize: SheetPaperSize,
  customW: number,
  customH: number,
  customUnit: ResizeUnit,
): { shortSide: number; longSide: number; error: string | null } {
  if (paperSize === 'custom') {
    try {
      const w = toPoints(customW, customUnit);
      const h = toPoints(customH, customUnit);
      return { shortSide: Math.min(w, h), longSide: Math.max(w, h), error: null };
    } catch (e) {
      return { shortSide: 595.28, longSide: 841.89, error: errorMessage(e) };
    }
  }
  const spec = RESIZE_PRESETS[paperSize];
  return { shortSide: Math.min(spec.widthPt, spec.heightPt), longSide: Math.max(spec.widthPt, spec.heightPt), error: null };
}

function slotToColRow(slot: number, cols: number, rows: number, order: NupReadingOrder): { col: number; rowFromTop: number } {
  if (order === 'rl-tb') return { col: cols - 1 - (slot % cols), rowFromTop: Math.floor(slot / cols) };
  if (order === 'tb-lr') return { col: Math.floor(slot / rows), rowFromTop: slot % rows };
  if (order === 'tb-rl') return { col: cols - 1 - Math.floor(slot / rows), rowFromTop: slot % rows };
  return { col: slot % cols, rowFromTop: Math.floor(slot / cols) };
}

function resolveNupPreviewLayout(
  perSheetChoice: PerSheetChoice,
  customCols: number,
  customRows: number,
  orientation: 'auto' | 'portrait' | 'landscape',
  dominantLandscape: boolean,
  shortSide: number,
  longSide: number,
): { cols: number; rows: number; sheetW: number; sheetH: number; landscape: boolean } {
  if (perSheetChoice === 'custom') {
    const cols = Math.max(1, Math.min(8, Math.round(customCols)));
    const rows = Math.max(1, Math.min(8, Math.round(customRows)));
    let landscape: boolean;
    if (orientation === 'landscape') landscape = true;
    else if (orientation === 'portrait') landscape = false;
    else {
      const srcAspect = dominantLandscape ? 1.414 : 1 / 1.414;
      const fitPortrait = Math.min(shortSide / cols / srcAspect, longSide / rows);
      const fitLandscape = Math.min(longSide / cols / srcAspect, shortSide / rows);
      landscape = fitLandscape > fitPortrait;
    }
    return {
      cols,
      rows,
      sheetW: landscape ? longSide : shortSide,
      sheetH: landscape ? shortSide : longSide,
      landscape,
    };
  }

  const perSheet = Number(perSheetChoice) as NupPerSheet;
  let landscape: boolean;
  if (orientation === 'landscape') landscape = true;
  else if (orientation === 'portrait') landscape = false;
  else if (perSheet === 2 || perSheet === 6) landscape = !dominantLandscape;
  else landscape = dominantLandscape;

  let cols: number;
  let rows: number;
  if (perSheet === 2) {
    cols = landscape ? 2 : 1;
    rows = landscape ? 1 : 2;
  } else if (perSheet === 4) {
    cols = 2;
    rows = 2;
  } else if (perSheet === 6) {
    cols = landscape ? 3 : 2;
    rows = landscape ? 2 : 3;
  } else if (perSheet === 9) {
    cols = 3;
    rows = 3;
  } else {
    cols = 4;
    rows = 4;
  }

  return {
    cols,
    rows,
    sheetW: landscape ? longSide : shortSide,
    sheetH: landscape ? shortSide : longSide,
    landscape,
  };
}

function BookletSideSvg({
  leftPage,
  rightPage,
  sheetW,
  sheetH,
  margin,
  gutter,
  drawFoldMark,
  drawBorder,
  flip180,
}: {
  leftPage: number | null;
  rightPage: number | null;
  sheetW: number;
  sheetH: number;
  margin: number;
  gutter: number;
  drawFoldMark: boolean;
  drawBorder: boolean;
  flip180: boolean;
}) {
  const { t } = useI18n();
  const svgW = 240;
  const scale = svgW / Math.max(1, sheetW);
  const svgH = Math.max(100, Math.round(sheetH * scale));
  const m = Math.min(margin * scale, svgH * 0.25);
  const g = Math.min(gutter * scale, svgW * 0.2);
  const cellW = Math.max(8, (svgW - m * 2 - g) / 2);
  const cellH = Math.max(8, svgH - m * 2);
  const leftX = m;
  const rightX = m + cellW + g;

  const renderHalf = (x: number, pageNum: number | null) => {
    const cx = x + cellW / 2;
    const cy = m + cellH / 2;
    return (
      <g>
        <rect
          x={x}
          y={m}
          width={cellW}
          height={cellH}
          fill={pageNum === null ? '#e6e6e6' : 'rgba(240, 124, 58, 0.16)'}
          stroke={drawBorder ? '#666' : pageNum === null ? '#bbb' : '#f07c3a'}
          strokeWidth={drawBorder ? 1.2 : 1}
          strokeDasharray={pageNum === null ? '3 3' : undefined}
          rx={2}
        />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fill={pageNum === null ? '#777' : '#222'}
          fontSize={pageNum === null ? 10 : 14}
          fontWeight={700}
        >
          {pageNum === null ? t('pdf.nup.blank') : t('pdf.nup.pageAbbr', { n: pageNum })}
        </text>
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      width={svgW}
      height={svgH}
      className={styles.diagramSvg}
      role="img"
      aria-label={t(flip180 ? 'pdf.nup.bookletSvgAriaRot' : 'pdf.nup.bookletSvgAria', {
        left: leftPage ?? t('pdf.nup.blank').toLowerCase(),
        right: rightPage ?? t('pdf.nup.blank').toLowerCase(),
      })}
    >
      <rect x={1} y={1} width={svgW - 2} height={svgH - 2} fill="#f7f7f7" stroke="#888" strokeWidth={1.2} rx={3} />
      <g transform={flip180 ? `rotate(180 ${svgW / 2} ${svgH / 2})` : undefined}>
        {renderHalf(leftX, leftPage)}
        {renderHalf(rightX, rightPage)}
        <line
          x1={svgW / 2}
          y1={4}
          x2={svgW / 2}
          y2={svgH - 4}
          stroke="#999"
          strokeWidth={0.8}
          strokeDasharray="3 3"
        />
        {drawFoldMark && (
          <>
            <line x1={svgW / 2} y1={2} x2={svgW / 2} y2={11} stroke="#333" strokeWidth={1.5} />
            <line x1={svgW / 2} y1={svgH - 11} x2={svgW / 2} y2={svgH - 2} stroke="#333" strokeWidth={1.5} />
          </>
        )}
      </g>
    </svg>
  );
}

export default function NupBookletPage() {
  const { t } = useI18n();
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [mode, setMode] = React.useState<ImposeMode>('nup');
  const [paperSize, setPaperSize] = React.useState<SheetPaperSize>('a4');
  const [customWidth, setCustomWidth] = React.useState(210);
  const [customHeight, setCustomHeight] = React.useState(297);
  const [customUnit, setCustomUnit] = React.useState<ResizeUnit>('mm');
  const [margin, setMargin] = React.useState(18);
  const [gutter, setGutter] = React.useState(12);
  const [drawBorder, setDrawBorder] = React.useState(false);
  const [pageRange, setPageRange] = React.useState('');

  // N-up specific
  const [perSheetChoice, setPerSheetChoice] = React.useState<PerSheetChoice>('4');
  const [customCols, setCustomCols] = React.useState(2);
  const [customRows, setCustomRows] = React.useState(2);
  const [readingOrder, setReadingOrder] = React.useState<NupReadingOrder>('lr-tb');
  const [orientation, setOrientation] = React.useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [previewSheetIndex, setPreviewSheetIndex] = React.useState(0);

  // Booklet specific
  const [binding, setBinding] = React.useState<'left' | 'right'>('left');
  const [duplexEdge, setDuplexEdge] = React.useState<'short-edge' | 'long-edge'>('short-edge');
  const [drawFoldMark, setDrawFoldMark] = React.useState(true);

  const [fileName, setFileName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ bytes: Uint8Array; sheetCount: number } | null>(null);

  React.useEffect(() => {
    setResult(null);
  }, [
    doc,
    mode,
    paperSize,
    customWidth,
    customHeight,
    customUnit,
    margin,
    gutter,
    drawBorder,
    pageRange,
    perSheetChoice,
    customCols,
    customRows,
    readingOrder,
    orientation,
    binding,
    duplexEdge,
    drawFoldMark,
  ]);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const boxes = await runGetPageBoxes(bytes, password);
      setLocked(null);
      setDoc({ name, bytes, boxes, password });
      setPreviewSheetIndex(0);
      setPageRange('');
      setFileName(`${baseName(name)}-${mode === 'booklet' ? 'booklet' : 'nup'}`);
    } catch (e) {
      if (isPasswordError(e)) {
        setLocked({
          name,
          bytes,
          error: password !== undefined ? t('pdf.ff.wrongPw') : null,
          busy: false,
        });
      } else {
        setLocked(null);
        setError(errorMessage(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadFile(files: File[]) {
    const pdf = files.find(isPdf);
    if (!pdf) {
      setNotice(t('pdf.ff.pickPdf'));
      return;
    }
    setNotice(files.length > 1 ? t('pdf.nup.onlyFirst') : null);
    setLocked(null);
    try {
      const bytes = await readBytes(pdf);
      await openBytes(pdf.name, bytes);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void loadFile(handoffToFiles(handoff));
  }, []);

  React.useEffect(() => {
    if (!doc) return;
    setFileName(`${baseName(doc.name)}-${mode === 'booklet' ? 'booklet' : 'nup'}`);
  }, [mode, doc]);

  function clearDoc() {
    setDoc(null);
    setLocked(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  const pageCount = doc?.boxes.length ?? 0;

  const selectedState = React.useMemo<{ indices: number[]; error: string | null }>(() => {
    if (!doc) return { indices: [], error: null };
    if (!pageRange.trim()) {
      return { indices: doc.boxes.map((_, i) => i), error: null };
    }
    try {
      return { indices: parsePageRanges(pageRange, pageCount), error: null };
    } catch (e) {
      return { indices: [], error: errorMessage(e) };
    }
  }, [doc, pageRange, pageCount]);

  const dominantLandscape = React.useMemo(() => {
    if (!doc || !selectedState.indices.length) return false;
    let votes = 0;
    for (const idx of selectedState.indices) {
      const b = doc.boxes[idx];
      if (b && b.visualWidth > b.visualHeight) votes++;
    }
    return votes > selectedState.indices.length / 2;
  }, [doc, selectedState.indices]);

  const paper = React.useMemo(
    () => resolveSheetPaper(paperSize, customWidth, customHeight, customUnit),
    [paperSize, customWidth, customHeight, customUnit],
  );

  const nupLayout = React.useMemo(
    () =>
      resolveNupPreviewLayout(
        perSheetChoice,
        customCols,
        customRows,
        orientation,
        dominantLandscape,
        paper.shortSide,
        paper.longSide,
      ),
    [perSheetChoice, customCols, customRows, orientation, dominantLandscape, paper],
  );

  const nupCapacity = nupLayout.cols * nupLayout.rows;
  const nupSheetCount = Math.max(1, Math.ceil(selectedState.indices.length / Math.max(1, nupCapacity)));
  const safeSheetIdx = Math.min(previewSheetIndex, nupSheetCount - 1);

  React.useEffect(() => {
    if (previewSheetIndex >= nupSheetCount) setPreviewSheetIndex(0);
  }, [previewSheetIndex, nupSheetCount]);

  const bookletSides = React.useMemo(
    () => computeBookletOrder(selectedState.indices.length, binding),
    [selectedState.indices.length, binding],
  );
  const bookletSheetCount = bookletSides.length / 2;
  const paddedTotal = bookletSides.length * 2;
  const blankCount = Math.max(0, paddedTotal - selectedState.indices.length);

  // Build N-up SVG geometry for the active preview sheet.
  const nupSvg = React.useMemo(() => {
    const maxW = 380;
    const maxH = 260;
    const scale = Math.min(maxW / nupLayout.sheetW, maxH / nupLayout.sheetH);
    const w = Math.round(nupLayout.sheetW * scale);
    const h = Math.round(nupLayout.sheetH * scale);
    const m = Math.min(margin * scale, Math.min(w, h) * 0.25);
    const g = Math.min(gutter * scale, Math.min(w, h) * 0.12);
    const cellW = Math.max(8, (w - m * 2 - g * (nupLayout.cols - 1)) / nupLayout.cols);
    const cellH = Math.max(8, (h - m * 2 - g * (nupLayout.rows - 1)) / nupLayout.rows);

    const start = safeSheetIdx * nupCapacity;
    const cells: Array<{ slot: number; x: number; y: number; pageNum: number | null }> = [];
    for (let slot = 0; slot < nupCapacity; slot++) {
      const { col, rowFromTop } = slotToColRow(slot, nupLayout.cols, nupLayout.rows, readingOrder);
      const srcIdx = selectedState.indices[start + slot];
      cells.push({
        slot,
        x: m + col * (cellW + g),
        y: m + rowFromTop * (cellH + g),
        pageNum: srcIdx !== undefined ? srcIdx + 1 : null,
      });
    }
    return { w, h, cellW, cellH, cells };
  }, [nupLayout, margin, gutter, safeSheetIdx, nupCapacity, readingOrder, selectedState.indices]);

  const canBuild = !!doc && !paper.error && !selectedState.error && selectedState.indices.length > 0;
  const outputName = `${safeFileName(fileName, mode === 'booklet' ? 'booklet' : 'nup').replace(/\.pdf$/i, '')}.pdf`;

  async function buildPdf() {
    if (!doc || !canBuild) return;
    setBusy(true);
    setError(null);
    try {
      const customWidthPt = paperSize === 'custom' ? toPoints(customWidth, customUnit) : undefined;
      const customHeightPt = paperSize === 'custom' ? toPoints(customHeight, customUnit) : undefined;

      let bytes: Uint8Array;
      let sheetCount: number;
      if (mode === 'nup') {
        const opts: NupOptions = {
          perSheet: perSheetChoice === 'custom' ? undefined : (Number(perSheetChoice) as NupPerSheet),
          cols: perSheetChoice === 'custom' ? customCols : undefined,
          rows: perSheetChoice === 'custom' ? customRows : undefined,
          paperSize,
          customWidthPt,
          customHeightPt,
          orientation,
          readingOrder,
          margin,
          gutter,
          drawBorder,
          pageRange: pageRange.trim() || undefined,
        };
        bytes = await runNupPdf(doc.bytes, opts, doc.password);
        sheetCount = nupSheetCount;
      } else {
        const opts: BookletOptions = {
          binding,
          duplexEdge,
          paperSize,
          customWidthPt,
          customHeightPt,
          margin,
          gutter,
          drawFoldMark,
          drawBorder,
          pageRange: pageRange.trim() || undefined,
        };
        bytes = await runBookletPdf(doc.bytes, opts, doc.password);
        sheetCount = bookletSides.length;
      }
      setResult({ bytes, sheetCount });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const displayedBookletSheets = Math.min(bookletSheetCount, 6);

  return (
    <PdfPage
      title={NUP.title}
      showHub
      lead={t('pdf.nup.lead')}
    >
      {locked && (
        <PasswordPrompt
          fileName={locked.name}
          error={locked.error}
          busy={locked.busy}
          onSubmit={(pw) => {
            setLocked((prev) => (prev ? { ...prev, busy: true, error: null } : null));
            return openBytes(locked.name, locked.bytes, pw);
          }}
          onCancel={() => setLocked(null)}
        />
      )}
      {error && !doc && <div className={styles.error} style={{ marginBottom: '1rem' }}>{error}</div>}
      {loading && !doc && !locked && <Progress fraction={0.45} label={t('pdf.p.inspectingPdfPages')} />}

      <ToolWorkspace
        tool={NUP}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel={t('pdf.p.selectPdfFile')}
        dropLabel={t('pdf.p.dropPdf')}
        addLabel={t('pdf.p.replacePdf')}
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
            {t('pdf.ff.close')}
          </button>
        }
        sidebar={
          <>
            <div className={styles.tabBar} style={{ marginBottom: '0.2rem', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                className={[styles.tab, mode === 'nup' ? styles.tabActive : ''].join(' ')}
                onClick={() => setMode('nup')}
              >
                {t('pdf.nup.tabNup')}
              </button>
              <button
                type="button"
                className={[styles.tab, mode === 'booklet' ? styles.tabActive : ''].join(' ')}
                onClick={() => setMode('booklet')}
              >
                {t('pdf.nup.tabBooklet')}
              </button>
            </div>

            {mode === 'nup' ? (
              <>
                <Field label={t('pdf.nup.tabNup')}>
                  <Select
                    value={perSheetChoice}
                    onChange={setPerSheetChoice}
                    options={[
                      ['2', t('pdf.nup.per2')],
                      ['4', t('pdf.nup.per4')],
                      ['6', t('pdf.nup.per6')],
                      ['9', t('pdf.nup.per9')],
                      ['16', t('pdf.nup.per16')],
                      ['custom', t('pdf.nup.perCustom')],
                    ]}
                  />
                </Field>

                {perSheetChoice === 'custom' && (
                  <div className={styles.optionRow}>
                    <Field label={t('pdf.nup.cols')}>
                      <NumberInput value={customCols} min={1} max={8} step={1} onChange={setCustomCols} />
                    </Field>
                    <Field label={t('pdf.nup.rows')}>
                      <NumberInput value={customRows} min={1} max={8} step={1} onChange={setCustomRows} />
                    </Field>
                  </div>
                )}

                <Field label={t('pdf.nup.readingOrder')}>
                  <Select
                    value={readingOrder}
                    onChange={setReadingOrder}
                    options={[
                      ['lr-tb', t('pdf.nup.ordLrTb')],
                      ['rl-tb', t('pdf.nup.ordRlTb')],
                      ['tb-lr', t('pdf.nup.ordTbLr')],
                      ['tb-rl', t('pdf.nup.ordTbRl')],
                    ]}
                  />
                </Field>

                <Field label={t('pdf.nup.sheetOrient')}>
                  <Select
                    value={orientation}
                    onChange={setOrientation}
                    options={[
                      ['auto', t('pdf.nup.orientAuto')],
                      ['portrait', t('pdf.p.portrait')],
                      ['landscape', t('pdf.p.landscape')],
                    ]}
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label={t('pdf.nup.bindingEdge')}>
                  <Select
                    value={binding}
                    onChange={setBinding}
                    options={[
                      ['left', t('pdf.nup.bindLeft')],
                      ['right', t('pdf.nup.bindRight')],
                    ]}
                  />
                </Field>

                <Field label={t('pdf.nup.duplexFlip')}>
                  <Select
                    value={duplexEdge}
                    onChange={setDuplexEdge}
                    options={[
                      ['short-edge', t('pdf.nup.flipShort')],
                      ['long-edge', t('pdf.nup.flipLong')],
                    ]}
                  />
                </Field>
              </>
            )}

            <Field label={t('pdf.nup.outputPaper')}>
              <Select
                value={paperSize}
                onChange={setPaperSize}
                options={[
                  ['a4', t('pdf.p.paperA4')],
                  ['a3', t('pdf.p.paperA3')],
                  ['letter', t('pdf.p.paperLetter')],
                  ['legal', t('pdf.p.paperLegal')],
                  ['custom', t('pdf.p.customDims')],
                ]}
              />
            </Field>

            {paperSize === 'custom' && (
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

            <div className={styles.optionRow}>
              <Field label={t('pdf.nup.outerMargin')}>
                <NumberInput value={margin} min={0} max={144} step={2} onChange={setMargin} />
              </Field>
              <Field label={mode === 'booklet' ? t('pdf.nup.spineGutter') : t('pdf.nup.cellGutter')}>
                <NumberInput value={gutter} min={0} max={144} step={2} onChange={setGutter} />
              </Field>
            </div>

            {mode === 'booklet' && (
              <Checkbox label={t('pdf.nup.drawFoldMark')} checked={drawFoldMark} onChange={setDrawFoldMark} />
            )}
            <Checkbox label={t('pdf.nup.drawBorder')} checked={drawBorder} onChange={setDrawBorder} />

            <Field label={t('pdf.p.pageRangeOpt')} help={t('pdf.nup.rangeHelp')}>
              <input
                className={fieldStyles.input}
                value={pageRange}
                placeholder={t('pdf.p.allPages')}
                onChange={(e) => setPageRange(e.target.value)}
              />
            </Field>

            {paper.error && <p className={fieldStyles.warning}>{paper.error}</p>}
            {selectedState.error && <p className={fieldStyles.warning}>{selectedState.error}</p>}

            <Field label={t('pdf.ff.fileName')}>
              <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>

            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || !canBuild}
              onClick={buildPdf}
            >
              {busy
                ? t('pdf.nup.building')
                : mode === 'booklet'
                  ? t(bookletSheetCount === 1 ? 'pdf.nup.btnBookletOne' : 'pdf.nup.btnBookletMany', {
                      n: bookletSheetCount,
                    })
                  : t(nupSheetCount === 1 ? 'pdf.nup.btnNupOne' : 'pdf.nup.btnNupMany', {
                      cols: nupLayout.cols,
                      rows: nupLayout.rows,
                      n: nupSheetCount,
                    })}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>{mode === 'booklet' ? t('pdf.nup.bookletReady') : t('pdf.nup.nupReady')}</h3>
                <p>
                  {t(result.sheetCount === 1 ? 'pdf.nup.createdOne' : 'pdf.nup.createdMany', {
                    n: result.sheetCount,
                    size: formatBytes(result.bytes.length),
                  })}
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result.bytes, outputName)}
                >
                  {t('pdf.ff.downloadNamed', { name: outputName })}
                </button>
                <ContinueWith currentToolId={NUP.id} files={[{ name: outputName, bytes: result.bytes }]} />
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
                {t(pageCount === 1 ? 'pdf.p.pagesAndSizeOne' : 'pdf.p.pagesAndSizeMany', {
                  n: pageCount,
                  size: formatBytes(doc.bytes.length),
                })}
              </span>
              {mode === 'nup' ? (
                <span className={[styles.previewBadge, styles.previewBadgeInfo].join(' ')}>
                  {t(nupSheetCount === 1 ? 'pdf.nup.badgeNupOne' : 'pdf.nup.badgeNupMany', {
                    pages: selectedState.indices.length,
                    sheets: nupSheetCount,
                    cols: nupLayout.cols,
                    rows: nupLayout.rows,
                  })}
                </span>
              ) : (
                <span className={[styles.previewBadge, styles.previewBadgeInfo].join(' ')}>
                  {t(bookletSheetCount === 1 ? 'pdf.nup.badgeBookletOne' : 'pdf.nup.badgeBookletMany', {
                    pages: selectedState.indices.length,
                    total: paddedTotal,
                    sheets: bookletSheetCount,
                  })}
                  {blankCount > 0 ? t('pdf.nup.blankSuffix', { n: blankCount }) : ''}
                </span>
              )}
            </div>

            {mode === 'nup' ? (
              <div className={styles.diagramCard}>
                <div className={styles.diagramHeader}>
                  <h3>
                    {t('pdf.nup.sheetTitle', {
                      idx: safeSheetIdx + 1,
                      total: nupSheetCount,
                      orient: nupLayout.landscape ? t('pdf.p.landscape') : t('pdf.p.portrait'),
                      paper: paperSize.toUpperCase(),
                    })}
                  </h3>
                  {nupSheetCount > 1 && (
                    <div className={styles.canvasNav}>
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        disabled={safeSheetIdx <= 0}
                        onClick={() => setPreviewSheetIndex((i) => Math.max(0, i - 1))}
                      >
                        {t('pdf.p.prev')}
                      </button>
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        disabled={safeSheetIdx >= nupSheetCount - 1}
                        onClick={() => setPreviewSheetIndex((i) => Math.min(nupSheetCount - 1, i + 1))}
                      >
                        {t('pdf.p.next')}
                      </button>
                    </div>
                  )}
                </div>
                <div className={styles.diagramStage}>
                  <svg
                    viewBox={`0 0 ${nupSvg.w} ${nupSvg.h}`}
                    width={nupSvg.w}
                    height={nupSvg.h}
                    className={styles.diagramSvg}
                    role="img"
                    aria-label={t('pdf.nup.nupSvgAria', {
                      idx: safeSheetIdx + 1,
                      cols: nupLayout.cols,
                      rows: nupLayout.rows,
                    })}
                  >
                    <rect
                      x={1}
                      y={1}
                      width={nupSvg.w - 2}
                      height={nupSvg.h - 2}
                      fill="#f7f7f7"
                      stroke="#888"
                      strokeWidth={1.2}
                      rx={3}
                    />
                    {nupSvg.cells.map((cell) => (
                      <g key={cell.slot}>
                        <rect
                          x={cell.x}
                          y={cell.y}
                          width={nupSvg.cellW}
                          height={nupSvg.cellH}
                          fill={cell.pageNum === null ? '#e8e8e8' : 'rgba(77, 163, 255, 0.18)'}
                          stroke={drawBorder ? '#555' : cell.pageNum === null ? '#bbb' : '#0070f3'}
                          strokeWidth={drawBorder ? 1.2 : 1}
                          strokeDasharray={cell.pageNum === null ? '3 3' : undefined}
                          rx={2}
                        />
                        <text
                          x={cell.x + nupSvg.cellW / 2}
                          y={cell.y + nupSvg.cellH / 2 + 4}
                          textAnchor="middle"
                          fill={cell.pageNum === null ? '#888' : '#1b1b1b'}
                          fontSize={Math.max(9, Math.min(15, Math.min(nupSvg.cellW, nupSvg.cellH) * 0.34))}
                          fontWeight={700}
                        >
                          {cell.pageNum === null ? '—' : cell.pageNum}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>
            ) : (
              <div className={styles.diagramCard}>
                <div className={styles.diagramHeader}>
                  <h3>{t('pdf.nup.bookletPreviewTitle')}</h3>
                  <span className={styles.fileBannerMeta}>
                    {t(bookletSheetCount === 1 ? 'pdf.nup.bookletSummaryOne' : 'pdf.nup.bookletSummaryMany', {
                      pages: selectedState.indices.length,
                      total: paddedTotal,
                      sheets: bookletSheetCount,
                      pdfPages: bookletSides.length,
                    })}
                  </span>
                </div>
                <p className={styles.canvasTip} style={{ marginBottom: 0 }}>
                  {duplexEdge === 'short-edge' ? t('pdf.nup.duplexTipShort') : t('pdf.nup.duplexTipLong')}
                </p>
                <div className={styles.bookletSheetList}>
                  {Array.from({ length: displayedBookletSheets }, (_, s) => {
                    const front = bookletSides[s * 2];
                    const back = bookletSides[s * 2 + 1];
                    const mapNum = (n: number | null) =>
                      n === null ? null : (selectedState.indices[n - 1] ?? n - 1) + 1;
                    return (
                      <div key={s} className={styles.bookletSheetCard}>
                        <div className={styles.bookletSheetTitle}>
                          <span>
                            {t('pdf.nup.physSheet', { idx: s + 1, total: bookletSheetCount })}
                          </span>
                          <span className={styles.fileBannerMeta}>
                            {t('pdf.nup.outPdfPages', { a: s * 2 + 1, b: s * 2 + 2 })}
                          </span>
                        </div>
                        <div className={styles.bookletPairGrid}>
                          <div className={styles.bookletSideBox}>
                            <span className={styles.bookletSideLabel}>
                              {t('pdf.nup.frontLabel', { n: s * 2 + 1 })}
                            </span>
                            <BookletSideSvg
                              leftPage={mapNum(front[0])}
                              rightPage={mapNum(front[1])}
                              sheetW={paper.longSide}
                              sheetH={paper.shortSide}
                              margin={margin}
                              gutter={gutter}
                              drawFoldMark={drawFoldMark}
                              drawBorder={drawBorder}
                              flip180={false}
                            />
                          </div>
                          <div className={styles.bookletSideBox}>
                            <span className={styles.bookletSideLabel}>
                              {t(duplexEdge === 'long-edge' ? 'pdf.nup.backLabelRot' : 'pdf.nup.backLabel', {
                                n: s * 2 + 2,
                              })}
                            </span>
                            <BookletSideSvg
                              leftPage={mapNum(back[0])}
                              rightPage={mapNum(back[1])}
                              sheetW={paper.longSide}
                              sheetH={paper.shortSide}
                              margin={margin}
                              gutter={gutter}
                              drawFoldMark={drawFoldMark}
                              drawBorder={drawBorder}
                              flip180={duplexEdge === 'long-edge'}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {bookletSheetCount > displayedBookletSheets && (
                    <p className={styles.note}>
                      {t('pdf.nup.moreSheetsNote', {
                        shown: displayedBookletSheets,
                        total: bookletSheetCount,
                        pdfPages: bookletSides.length,
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
