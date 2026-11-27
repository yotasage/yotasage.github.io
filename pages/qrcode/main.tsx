import React from 'react';

import PageHead from '../../components/PageHead';
import ContentForm from '../../components/QrGen/ContentForm';
import DecryptBox from '../../components/QrGen/DecryptBox';
import { Checkbox, Field, NumberInput, Select } from '../../components/UI/Fields';
import SegmentEditor from '../../components/QrGen/SegmentEditor';
import SymbolInfo from '../../components/QrGen/SymbolInfo';
import SymbolPreview from '../../components/QrGen/SymbolPreview';
import ExamplesGallery from '../../components/UI/ExamplesGallery';
import PillTabs, { PillTabItem } from '../../components/UI/PillTabs';
import TeachingCallout from '../../components/UI/TeachingCallout';
import ToolHeader, { WorkspaceTab } from '../../components/UI/ToolHeader';
import { Charset, CHARSET_LABELS, encodeString } from '../../lib/qr/charsets';
import { QR_GEN_EXAMPLES, type QrGenExampleId } from '../../lib/qr/examples';
import {
  EcLevel,
  ecLevelsFor,
  ecRow,
  encode,
  EncodeOptions,
  ManualSegment,
  ModeOption,
  QrEncodeError,
  QrSymbol,
  structuredAppendParity,
  Symbology,
  SYMBOLOGY_LABELS,
  versionName,
  versionRange,
} from '../../lib/qr/encoder';
import { CONTENT_TYPES, initialValues, Payload, Values } from '../../lib/qr/payloads';
import {
  drawToCanvas,
  jpegWithDpi,
  logoCoverage,
  ModuleShape,
  pngWithDpi,
  RenderOptions,
  toPdf,
  toSvg,
} from '../../lib/qr/render';
import { RMQR_SIZES } from '../../lib/qr/tables';
import { useI18n } from '../../lib/ui/i18n';
import { useExperienceMode } from '../../lib/ui/mode';
import { useDesignSystemPage } from '../../lib/ui/theme';
import styles from '../../styles/QrGen.module.css';

type WorkspaceId = 'workbench' | 'examples' | 'guide';
type ControlTabId = 'content' | 'symbol' | 'encoding' | 'style' | 'decrypt';

// Proprietary Denso Wave formats, listed so it is clear why they cannot be produced here.
const UNAVAILABLE_SYMBOLOGIES = ['SQRC', 'Frame QR', 'iQR Code'];

const STANDARD_QUIET_ZONE: Record<Symbology, number> = { qr2: 4, qr1: 4, micro: 2, rmqr: 2 };

const EC_LABELS: Record<EcLevel, string> = { L: 'L (≈7 %)', M: 'M (≈15 %)', Q: 'Q (≈25 %)', H: 'H (≈30 %)' };

const EC_ORDER: EcLevel[] = ['L', 'M', 'Q', 'H'];

interface LoadedLogo {
  dataUrl: string;
  image: HTMLImageElement;
  aspect: number;
}

function range(lo: number, hi: number) {
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
}

function versionLabel(sym: Symbology, v: number) {
  if (sym === 'rmqr') return versionName(sym, v);
  const size = sym === 'micro' ? 9 + 2 * v : 17 + 4 * v;
  return `${versionName(sym, v)} (${size} × ${size})`;
}

// The closest available level that is not stronger than the requested one (or the weakest available).
function effectiveEcLevel(requested: EcLevel, available: EcLevel[]): EcLevel {
  const lower = available.filter((l) => EC_ORDER.indexOf(l) <= EC_ORDER.indexOf(requested));
  return lower.length ? lower[lower.length - 1] : available[0];
}

function splitData(
  data: string | Uint8Array,
  parts: number,
  errMsg: (count: number, parts: number) => string,
): (string | Uint8Array)[] {
  const units = typeof data === 'string' ? [...data] : Array.from(data);
  if (units.length < parts) throw new QrEncodeError(errMsg(units.length, parts));
  const size = Math.ceil(units.length / parts);
  const out: (string | Uint8Array)[] = [];
  for (let i = 0; i < units.length; i += size) {
    const chunk = units.slice(i, i + size);
    out.push(typeof data === 'string' ? (chunk as string[]).join('') : Uint8Array.from(chunk as number[]));
  }
  return out;
}

function describePayload(data: string | Uint8Array): string {
  if (typeof data !== 'string') return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join(' ');
  return data.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

function download(data: string | Uint8Array, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasBytes(canvas: HTMLCanvasElement, type: string, quality: number | undefined, errText: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) reject(new Error(errText));
      else resolve(new Uint8Array(await blob.arrayBuffer()));
    }, type, quality);
  });
}

export default function QrCodeGenerator() {
  useDesignSystemPage('#d97706', '#e8b23a');
  const { t } = useI18n();
  const { mode: expMode, setMode: setExpMode } = useExperienceMode();

  const [workspace, setWorkspace] = React.useState<WorkspaceId>('workbench');
  const [controlTab, setControlTab] = React.useState<ControlTabId>('content');

  // Content
  const [typeId, setTypeId] = React.useState('url');
  const [valuesByType, setValuesByType] = React.useState<Record<string, Values>>(
    () => Object.fromEntries(CONTENT_TYPES.map((ct) => [ct.id, initialValues(ct)])),
  );
  const type = CONTENT_TYPES.find((ct) => ct.id === typeId);
  const values = valuesByType[typeId];
  const [payload, setPayload] = React.useState<Payload | null>(null);
  const [payloadError, setPayloadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const prefill = new URLSearchParams(window.location.search).get('url')?.trim();
    if (!prefill) return;
    setTypeId('url');
    setValuesByType((prev) => ({
      ...prev,
      url: { ...prev.url, url: prefill },
    }));
  }, []);

  // Symbol
  const [symbology, setSymbology] = React.useState<Symbology>('qr2');
  const [version, setVersion] = React.useState<'auto' | number>('auto');
  const [minVersion, setMinVersion] = React.useState(1);
  const [rmqrHeight, setRmqrHeight] = React.useState<'auto' | number>('auto');
  const [rmqrWidth, setRmqrWidth] = React.useState<'auto' | number>('auto');
  const [rmqrPreference, setRmqrPreference] = React.useState<'area' | 'height' | 'width'>('area');
  const [ecLevel, setEcLevel] = React.useState<EcLevel>('M');
  const [boostEc, setBoostEc] = React.useState(false);
  const [mask, setMask] = React.useState<'auto' | number>('auto');

  // Encoding
  const [mode, setMode] = React.useState<ModeOption>('auto');
  const [manualSegments, setManualSegments] = React.useState<ManualSegment[]>([]);
  const [allowKanji, setAllowKanji] = React.useState(true);
  const [charset, setCharset] = React.useState<Charset>('utf-8');
  const [eciChoice, setEciChoice] = React.useState<'auto' | 'none' | 'custom'>('auto');
  const [eciValue, setEciValue] = React.useState(26);
  const [fnc1, setFnc1] = React.useState<'none' | 'gs1' | 'aim'>('none');
  const [aimIndicator, setAimIndicator] = React.useState('01');
  const [saEnabled, setSaEnabled] = React.useState(false);
  const [saTotal, setSaTotal] = React.useState(2);

  // Appearance and output
  const [quietZone, setQuietZone] = React.useState(4);
  const [foreground, setForeground] = React.useState('#000000');
  const [background, setBackground] = React.useState('#ffffff');
  const [transparent, setTransparent] = React.useState(false);
  const [shape, setShape] = React.useState<ModuleShape>('square');
  const [squareFunctionPatterns, setSquareFunctionPatterns] = React.useState(true);
  const [logoImage, setLogoImage] = React.useState<LoadedLogo | null>(null);
  const [logoScale, setLogoScale] = React.useState(20);
  const [logoClear, setLogoClear] = React.useState(true);
  const [logoPadding, setLogoPadding] = React.useState(1);
  const [logoBackdrop, setLogoBackdrop] = React.useState(true);
  const [pxPerModule, setPxPerModule] = React.useState(10);
  const [moduleMm, setModuleMm] = React.useState(0.5);
  const [jpegQuality, setJpegQuality] = React.useState(92);
  const [fileName, setFileName] = React.useState('qrcode');
  const [selected, setSelected] = React.useState(0);
  const [exportError, setExportError] = React.useState<string | null>(null);

  // Build the payload; some content types (encryption) are asynchronous.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await type.build(values);
        if (!cancelled) {
          setPayload(p);
          setPayloadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPayload(null);
          setPayloadError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, values]);

  function changeSymbology(s: Symbology) {
    setSymbology(s);
    setVersion('auto');
    setMinVersion(1);
    setMask('auto');
    setQuietZone(STANDARD_QUIET_ZONE[s]);
    if (s !== 'qr2') setSaEnabled(false);
  }

  const ecChoices = ecLevelsFor(symbology, version);
  const effectiveEc = effectiveEcLevel(ecLevel, ecChoices);
  const gs1FromContent = payload?.fnc1 === 'gs1';
  const effectiveFnc1 = gs1FromContent ? 'gs1' : fnc1;

  const result = React.useMemo((): { symbols: QrSymbol[]; error: string | null } => {
    if (!payload) return { symbols: [], error: null };
    const opts: EncodeOptions = {
      symbology,
      version,
      minVersion: version === 'auto' ? minVersion : undefined,
      rmqrHeight,
      rmqrWidth,
      rmqrPreference,
      ecLevel: effectiveEc,
      boostEc,
      mask,
      mode,
      manualSegments,
      allowKanji,
      charset,
      eci: eciChoice === 'custom' ? eciValue : eciChoice,
      fnc1: effectiveFnc1,
      aimIndicator,
    };
    try {
      if (saEnabled && symbology === 'qr2') {
        if (mode === 'manual') throw new QrEncodeError(t('qrgen.err.saManual'));
        let bytes: ArrayLike<number>;
        try {
          bytes = typeof payload.data === 'string' ? encodeString(payload.data, charset) : payload.data;
        } catch {
          bytes = typeof payload.data === 'string' ? new TextEncoder().encode(payload.data) : payload.data;
        }
        const parity = structuredAppendParity(bytes);
        const parts = splitData(payload.data, saTotal, (count, p) => t('qrgen.err.splitTooShort', { count, parts: p }));
        return {
          symbols: parts.map((part, index) => encode(part, { ...opts, structuredAppend: { index, total: parts.length, parity } })),
          error: null,
        };
      }
      return { symbols: [encode(mode === 'manual' ? '' : payload.data, opts)], error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { symbols: [], error: e instanceof QrEncodeError ? message : t('qrgen.err.unexpected', { msg: message }) };
    }
  }, [
    payload, symbology, version, minVersion, rmqrHeight, rmqrWidth, rmqrPreference, effectiveEc, boostEc, mask, mode,
    manualSegments, allowKanji, charset, eciChoice, eciValue, effectiveFnc1, aimIndicator, saEnabled, saTotal, t,
  ]);

  const symbols = result.symbols;
  const current = symbols[Math.min(selected, symbols.length - 1)] ?? null;

  const renderOptions = React.useMemo((): RenderOptions => ({
    quietZone,
    foreground,
    background,
    transparent,
    shape,
    squareFunctionPatterns,
    logo: logoImage ? { ...logoImage, scale: logoScale / 100, clear: logoClear, padding: logoPadding, backdrop: logoBackdrop } : null,
  }), [quietZone, foreground, background, transparent, shape, squareFunctionPatterns, logoImage, logoScale, logoClear, logoPadding, logoBackdrop]);

  const warnings: string[] = [];
  if (payload?.note) warnings.push(payload.note);
  if (current) {
    warnings.push(...current.warnings);
    if (symbology === 'qr1') warnings.push(t('qrgen.warn.qr1'));
    if (symbology === 'micro' || symbology === 'rmqr') warnings.push(t('qrgen.warn.microRmqr', { sym: SYMBOLOGY_LABELS[symbology] }));
    if (quietZone < STANDARD_QUIET_ZONE[symbology]) warnings.push(t('qrgen.warn.quietZone', { std: STANDARD_QUIET_ZONE[symbology] }));
    if (renderOptions.logo) {
      const cov = logoCoverage(current, renderOptions.logo);
      const row = ecRow(current.symbology, current.version, current.ecLevel ?? 'L');
      const recoverable = current.ecLevel ? row[0] / 2 / (row[0] + row[2]) : 0;
      const coveredPct = (100 * cov.covered) / cov.dataModules;
      warnings.push(t('qrgen.warn.logoCov', { covered: coveredPct.toFixed(1), rec: (100 * recoverable).toFixed(0) }));
      if (cov.covered / cov.dataModules > recoverable * 0.6) warnings.push(t('qrgen.warn.logoMargin'));
      if (cov.functionCovered > 0) warnings.push(t('qrgen.warn.logoFunc'));
    }
    if (foreground.toLowerCase() === background.toLowerCase()) warnings.push(t('qrgen.warn.sameColor'));
  }

  const dpi = pxPerModule / (moduleMm / 25.4);
  const totalModules = current ? [current.width + 2 * quietZone, current.height + 2 * quietZone] : [0, 0];

  function exportName(ext: string) {
    const base = (fileName.trim() || 'qrcode').replace(/[\\/:*?"<>|]/g, '_');
    return symbols.length > 1 ? `${base}-${selected + 1}of${symbols.length}.${ext}` : `${base}.${ext}`;
  }

  async function exportAs(format: 'png' | 'jpg' | 'svg' | 'pdf') {
    if (!current) return;
    setExportError(null);
    const blobErr = t('qrgen.err.canvasBlob');
    try {
      if (format === 'svg') {
        const [w, h] = totalModules.map((m) => `${Number((m * moduleMm).toFixed(3))}mm`);
        download(toSvg(current, renderOptions, { width: w, height: h }), 'image/svg+xml', exportName('svg'));
      } else if (format === 'pdf') {
        let logoJpeg = null;
        if (renderOptions.logo) {
          // PDF images are embedded as JPEG, so transparency is flattened onto the background colour.
          const img = renderOptions.logo.image;
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || 512;
          c.height = img.naturalHeight || 512;
          const ctx = c.getContext('2d');
          ctx.fillStyle = transparent ? '#ffffff' : background;
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          logoJpeg = { jpeg: await canvasBytes(c, 'image/jpeg', 0.92, blobErr), width: c.width, height: c.height };
        }
        download(toPdf(current, renderOptions, moduleMm, logoJpeg, fileName || 'QR code'), 'application/pdf', exportName('pdf'));
      } else {
        const canvas = document.createElement('canvas');
        drawToCanvas(canvas, current, renderOptions, pxPerModule, format === 'jpg');
        if (format === 'png') download(pngWithDpi(await canvasBytes(canvas, 'image/png', undefined, blobErr), dpi), 'image/png', exportName('png'));
        else download(jpegWithDpi(await canvasBytes(canvas, 'image/jpeg', jpegQuality / 100, blobErr), dpi), 'image/jpeg', exportName('jpg'));
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  function loadLogo(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onload = () => setLogoImage({ dataUrl, image, aspect: (image.naturalWidth || 1) / (image.naturalHeight || 1) });
      image.onerror = () => setExportError(t('qrgen.err.logoRead'));
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  const symbologyOptions: [string, string][] = [
    ['qr2', t('qrgen.sym.qr2')],
    ['qr1', t('qrgen.sym.qr1')],
    ['micro', t('qrgen.sym.micro')],
    ['rmqr', t('qrgen.sym.rmqr')],
  ];
  const [vLo, vHi] = versionRange(symbology);
  const versionOptions: [string, string][] = [['auto', t('qrgen.sym.versionAuto')], ...range(vLo, vHi).map((v) => [String(v), versionLabel(symbology, v)] as [string, string])];
  const maskCount = symbology === 'micro' ? 4 : 8;
  const rmqrHeights = Array.from(new Set(RMQR_SIZES.map(([, h]) => h)));
  const rmqrWidths = Array.from(new Set(RMQR_SIZES.map(([w]) => w))).sort((a, b) => a - b);
  const eciSupported = symbology === 'qr2' || symbology === 'rmqr';
  const fnc1Supported = symbology === 'qr2' || symbology === 'rmqr';

  const workspaces: readonly WorkspaceTab<WorkspaceId>[] = React.useMemo(
    () => [
      { id: 'workbench', label: t('qrgen.workbench') },
      { id: 'examples', label: t('ex.tab') },
      { id: 'guide', label: t('qrgen.guide') },
    ],
    [t],
  );

  const loadExample = (id: QrGenExampleId) => {
    const ex = QR_GEN_EXAMPLES.find((item) => item.id === id);
    if (!ex) return;
    const ct = CONTENT_TYPES.find((c) => c.id === ex.typeId);
    setTypeId(ex.typeId);
    if (ct) setValuesByType((prev) => ({ ...prev, [ex.typeId]: { ...initialValues(ct), ...ex.values } }));
    changeSymbology(ex.symbology);
    setEcLevel(ex.ecLevel);
    if (ex.foreground) setForeground(ex.foreground);
    if (ex.background) setBackground(ex.background);
    if (ex.shape) setShape(ex.shape);
    setControlTab('content');
    setWorkspace('workbench');
  };

  const controlTabs: readonly PillTabItem<ControlTabId>[] = React.useMemo(() => {
    if (expMode === 'quick') {
      return [
        { id: 'content', label: t('qrgen.tab.content') },
        { id: 'style', label: t('qrgen.tab.style') },
      ];
    }
    return [
      { id: 'content', label: t('qrgen.tab.content') },
      { id: 'symbol', label: t('qrgen.tab.symbol') },
      { id: 'encoding', label: t('qrgen.tab.encoding') },
      { id: 'style', label: t('qrgen.tab.style') },
      { id: 'decrypt', label: t('qrgen.tab.decrypt') },
    ];
  }, [expMode, t]);

  const activeControlTab: ControlTabId =
    expMode === 'quick' && controlTab !== 'content' && controlTab !== 'style' ? 'content' : controlTab;

  const openGuide = () => setWorkspace('guide');

  return (
    <div className={styles.page} data-ds="v2">
      <PageHead
        title={t('qrgen.pageTitle')}
        description={t('qrgen.metaDesc')}
        path="/qrcode/main"
        ogImage="/og/qr-tools.png"
        ogAlt={t('qrgen.title')}
      />

      <ToolHeader<WorkspaceId>
        title={t('qrgen.title')}
        workspaces={workspaces}
        activeWorkspace={workspace}
        onWorkspaceChange={setWorkspace}
        showExperienceMode
        allowWideView
      />

      <main className={styles.main}>
        {/* Workbench Workspace */}
        <div className={styles.workspacePanel} hidden={workspace !== 'workbench'}>
          <div className={styles.layout}>
            {/* Left / Primary Controls Column */}
            <div className={styles.controls}>
              {expMode === 'quick' && (
                <div className={styles.quickBanner} role="region" aria-label={t('qrgen.quick.badge')}>
                  <div className={styles.quickBannerText}>
                    <span className={styles.quickBadge}>{t('qrgen.quick.badge')}</span>
                    <span>{t('qrgen.quick.bannerText')}</span>
                  </div>
                  <div className={styles.quickActions}>
                    <button type="button" className={styles.buttonSmall} onClick={() => setExpMode('standard')}>
                      {t('qrgen.quick.switchStandard')}
                    </button>
                    <button type="button" className={styles.buttonSmall} onClick={() => setExpMode('teaching')}>
                      {t('qrgen.quick.switchTeaching')}
                    </button>
                  </div>
                </div>
              )}

              <div className={styles.tabBarWrap}>
                <PillTabs<ControlTabId>
                  items={controlTabs}
                  value={activeControlTab}
                  onChange={setControlTab}
                  ariaLabel={t('qrgen.tabsAria')}
                  idPrefix="qrgen"
                />
              </div>

              {/* Panel 1: Content */}
              <div
                id="qrgen-panel-content"
                role="tabpanel"
                aria-labelledby="qrgen-tab-content"
                className={styles.tabPanel}
                hidden={activeControlTab !== 'content'}
              >
                <section className={styles.card}>
                  <h2>{t('qrgen.tab.content')}</h2>
                  <div className={styles.fieldGrid}>
                    <Field label={t('qrgen.content.typeLabel')} help={t(`qrgen.ct.${type.id}.desc`)} wide>
                      <Select
                        value={typeId}
                        onChange={setTypeId}
                        options={CONTENT_TYPES.map((ct) => [ct.id, t(`qrgen.ct.${ct.id}.label`)] as [string, string])}
                      />
                    </Field>
                  </div>
                  <h3>{t(`qrgen.ct.${type.id}.label`)}</h3>
                  <ContentForm type={type} values={values} onChange={(v) => setValuesByType({ ...valuesByType, [typeId]: v })} />
                  {payloadError && <p className={styles.warning}>{payloadError}</p>}
                  {payload && (
                    <>
                      <h3>
                        {t('qrgen.content.payloadTitle', {
                          size: typeof payload.data === 'string'
                            ? t('qrgen.content.chars', { n: [...payload.data].length })
                            : t('qrgen.content.bytes', { n: payload.data.length }),
                        })}
                      </h3>
                      <pre className={[styles.payload, styles.mono].join(' ')}>{describePayload(payload.data) || t('qrgen.content.empty')}</pre>
                    </>
                  )}
                </section>

                <TeachingCallout
                  title={t('qrgen.teaching.ecTitle')}
                  onTheoryClick={openGuide}
                  className={styles.fullWidth}
                >
                  {t('qrgen.teaching.ecBody')}
                </TeachingCallout>
              </div>

              {/* Panel 2: Symbol */}
              <div
                id="qrgen-panel-symbol"
                role="tabpanel"
                aria-labelledby="qrgen-tab-symbol"
                className={styles.tabPanel}
                hidden={activeControlTab !== 'symbol'}
              >
                <section className={styles.card}>
                  <h2>{t('qrgen.tab.symbol')}</h2>
                  <div className={styles.fieldGrid}>
                    <Field label={t('qrgen.sym.typeLabel')}>
                      <select className={styles.select} value={symbology} onChange={(e) => changeSymbology(e.target.value as Symbology)}>
                        {symbologyOptions.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                        {UNAVAILABLE_SYMBOLOGIES.map((name) => <option key={name} disabled>{t('qrgen.sym.proprietary', { name })}</option>)}
                      </select>
                    </Field>
                    <Field label={t('qrgen.sym.versionLabel')}>
                      <Select value={String(version)} onChange={(v) => setVersion(v === 'auto' ? 'auto' : Number(v))} options={versionOptions} />
                    </Field>
                    {version === 'auto' && symbology !== 'rmqr' && (
                      <Field label={t('qrgen.sym.minVersionLabel')}>
                        <Select
                          value={String(minVersion)}
                          onChange={(v) => setMinVersion(Number(v))}
                          options={range(vLo, vHi).map((v) => [String(v), versionName(symbology, v)] as [string, string])}
                        />
                      </Field>
                    )}
                    {version === 'auto' && symbology === 'rmqr' && (
                      <>
                        <Field label={t('qrgen.sym.heightLabel')}>
                          <Select
                            value={String(rmqrHeight)}
                            onChange={(v) => setRmqrHeight(v === 'auto' ? 'auto' : Number(v))}
                            options={[['auto', t('qrgen.sym.any')], ...rmqrHeights.map((h) => [String(h), t('qrgen.sym.nModules', { n: h })] as [string, string])]}
                          />
                        </Field>
                        <Field label={t('qrgen.sym.widthLabel')}>
                          <Select
                            value={String(rmqrWidth)}
                            onChange={(v) => setRmqrWidth(v === 'auto' ? 'auto' : Number(v))}
                            options={[['auto', t('qrgen.sym.any')], ...rmqrWidths.map((w) => [String(w), t('qrgen.sym.nModules', { n: w })] as [string, string])]}
                          />
                        </Field>
                        <Field label={t('qrgen.sym.preferLabel')}>
                          <Select
                            value={rmqrPreference}
                            onChange={setRmqrPreference}
                            options={[
                              ['area', t('qrgen.sym.prefArea')],
                              ['height', t('qrgen.sym.prefHeight')],
                              ['width', t('qrgen.sym.prefWidth')],
                            ]}
                          />
                        </Field>
                      </>
                    )}
                    <Field label={t('qrgen.sym.ecLabel')}>
                      <Select
                        value={effectiveEc}
                        onChange={setEcLevel}
                        options={ecChoices.map((l) => [l, symbology === 'micro' && version === 1 ? t('qrgen.sym.ecM1') : EC_LABELS[l]] as [EcLevel, string])}
                      />
                    </Field>
                    <Field label={t('qrgen.sym.maskLabel')} help={symbology === 'rmqr' ? t('qrgen.sym.maskHelpRmqr') : t('qrgen.sym.maskHelpAuto')}>
                      <Select
                        value={String(mask)}
                        disabled={symbology === 'rmqr'}
                        onChange={(v) => setMask(v === 'auto' ? 'auto' : Number(v))}
                        options={[['auto', t('qrgen.sym.maskAuto')], ...range(0, maskCount - 1).map((m) => [String(m), t('qrgen.sym.maskNum', { n: m })] as [string, string])]}
                      />
                    </Field>
                    <Checkbox wide label={t('qrgen.sym.boostEc')} checked={boostEc} onChange={setBoostEc} />
                  </div>
                </section>

                <TeachingCallout
                  title={t('qrgen.teaching.familyTitle')}
                  onTheoryClick={openGuide}
                  className={styles.fullWidth}
                >
                  {t('qrgen.teaching.familyBody')}
                </TeachingCallout>
              </div>

              {/* Panel 3: Encoding */}
              <div
                id="qrgen-panel-encoding"
                role="tabpanel"
                aria-labelledby="qrgen-tab-encoding"
                className={styles.tabPanel}
                hidden={activeControlTab !== 'encoding'}
              >
                <section className={styles.card}>
                  <h2>{t('qrgen.tab.encoding')}</h2>
                  <div className={styles.fieldGrid}>
                    <Field label={t('qrgen.enc.modeLabel')} help={t('qrgen.enc.modeHelp')}>
                      <Select
                        value={mode}
                        onChange={setMode}
                        options={[
                          ['auto', t('qrgen.enc.modeAuto')],
                          ['numeric', t('qrgen.enc.modeNumeric')],
                          ['alphanumeric', t('qrgen.enc.modeAlpha')],
                          ['byte', t('qrgen.enc.modeByte')],
                          ['kanji', t('qrgen.enc.modeKanji')],
                          ['manual', t('qrgen.enc.modeManual')],
                        ]}
                      />
                    </Field>
                    <Field label={t('qrgen.enc.charsetLabel')}>
                      <Select
                        value={charset}
                        onChange={setCharset}
                        options={(Object.keys(CHARSET_LABELS) as Charset[]).map((c) => [c, CHARSET_LABELS[c]] as [Charset, string])}
                      />
                    </Field>
                    <Field label={t('qrgen.enc.eciLabel')} help={eciSupported ? t('qrgen.enc.eciHelp') : t('qrgen.enc.notAvail')}>
                      <Select
                        value={eciChoice}
                        disabled={!eciSupported}
                        onChange={setEciChoice}
                        options={[
                          ['auto', t('qrgen.enc.eciAuto')],
                          ['none', t('qrgen.enc.eciNone')],
                          ['custom', t('qrgen.enc.eciCustom')],
                        ]}
                      />
                    </Field>
                    {eciChoice === 'custom' && eciSupported && (
                      <Field label={t('qrgen.enc.eciNumLabel')} help={t('qrgen.enc.eciNumHelp')}>
                        <NumberInput value={eciValue} onChange={setEciValue} min={0} max={999999} />
                      </Field>
                    )}
                    <Field label={t('qrgen.enc.fnc1Label')} help={gs1FromContent ? t('qrgen.enc.fnc1Gs1Help') : fnc1Supported ? undefined : t('qrgen.enc.notAvail')}>
                      <Select
                        value={effectiveFnc1}
                        disabled={gs1FromContent || !fnc1Supported}
                        onChange={setFnc1}
                        options={[
                          ['none', t('qrgen.enc.fnc1None')],
                          ['gs1', t('qrgen.enc.fnc1Gs1')],
                          ['aim', t('qrgen.enc.fnc1Aim')],
                        ]}
                      />
                    </Field>
                    {effectiveFnc1 === 'aim' && (
                      <Field label={t('qrgen.enc.aimLabel')} help={t('qrgen.enc.aimHelp')}>
                        <input className={styles.input} value={aimIndicator} maxLength={2} onChange={(e) => setAimIndicator(e.target.value)} />
                      </Field>
                    )}
                    <Checkbox wide label={t('qrgen.enc.allowKanji')} checked={allowKanji} onChange={setAllowKanji} />
                    {symbology === 'qr2' && (
                      <>
                        <Checkbox wide label={t('qrgen.enc.saLabel')} checked={saEnabled} onChange={setSaEnabled} />
                        {saEnabled && (
                          <Field label={t('qrgen.enc.saTotal')}>
                            <NumberInput value={saTotal} onChange={setSaTotal} min={2} max={16} />
                          </Field>
                        )}
                      </>
                    )}
                    {mode === 'manual' && (
                      <SegmentEditor
                        segments={manualSegments}
                        onChange={setManualSegments}
                        onFill={() => setManualSegments([{ mode: 'byte', text: typeof payload?.data === 'string' ? payload.data : '' }])}
                      />
                    )}
                  </div>
                </section>

                <TeachingCallout
                  title={t('qrgen.teaching.encodingTitle')}
                  onTheoryClick={openGuide}
                  className={styles.fullWidth}
                >
                  {t('qrgen.teaching.encodingBody')}
                </TeachingCallout>
              </div>

              {/* Panel 4: Style & Export */}
              <div
                id="qrgen-panel-style"
                role="tabpanel"
                aria-labelledby="qrgen-tab-style"
                className={styles.tabPanel}
                hidden={activeControlTab !== 'style'}
              >
                <section className={styles.card}>
                  <h2>{t('qrgen.tab.style')}</h2>
                  <div className={styles.fieldGrid}>
                    <Field label={t('qrgen.style.fg')}><input className={styles.color} type="color" value={foreground} onChange={(e) => setForeground(e.target.value)} /></Field>
                    <Field label={t('qrgen.style.bg')}><input className={styles.color} type="color" value={background} disabled={transparent} onChange={(e) => setBackground(e.target.value)} /></Field>
                    <Field label={t('qrgen.style.shape')}>
                      <Select
                        value={shape}
                        onChange={setShape}
                        options={[
                          ['square', t('qrgen.style.shapeSquare')],
                          ['rounded', t('qrgen.style.shapeRounded')],
                          ['dots', t('qrgen.style.shapeDots')],
                        ]}
                      />
                    </Field>
                    <Field label={t('qrgen.style.quietZone', { std: STANDARD_QUIET_ZONE[symbology] })}>
                      <NumberInput value={quietZone} onChange={setQuietZone} min={0} max={20} />
                    </Field>
                    <Checkbox wide label={t('qrgen.style.transparent')} checked={transparent} onChange={setTransparent} />
                    <Checkbox wide label={t('qrgen.style.squareFunc')} checked={squareFunctionPatterns} onChange={setSquareFunctionPatterns} />
                  </div>

                  <h3>{t('qrgen.style.logoHeading')}</h3>
                  <div className={styles.fieldGrid}>
                    <Field label={t('qrgen.style.logoFile')} wide help={t('qrgen.style.logoHelp')}>
                      <input className={styles.input} type="file" accept="image/*" onChange={(e) => loadLogo(e.target.files?.[0])} />
                    </Field>
                    {logoImage && (
                      <>
                        <Field label={t('qrgen.style.logoHeight')}><NumberInput value={logoScale} onChange={setLogoScale} min={5} max={60} /></Field>
                        <Field label={t('qrgen.style.logoMargin')}><NumberInput value={logoPadding} onChange={setLogoPadding} min={0} max={10} /></Field>
                        <Checkbox label={t('qrgen.style.logoClear')} checked={logoClear} onChange={setLogoClear} />
                        <Checkbox label={t('qrgen.style.logoBackdrop')} checked={logoBackdrop} onChange={setLogoBackdrop} />
                        <div className={styles.fieldWide}>
                          <button type="button" className={styles.buttonSmall} onClick={() => setLogoImage(null)}>{t('qrgen.style.logoRemove')}</button>
                        </div>
                      </>
                    )}
                  </div>

                  <hr className={styles.sectionDivider} />

                  <h3>{t('qrgen.style.exportHeading')}</h3>
                  <div className={styles.fieldGrid}>
                    <Field label={t('qrgen.style.fileName')}><input className={styles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} /></Field>
                    <Field label={t('qrgen.style.pxPerMod')}><NumberInput value={pxPerModule} onChange={setPxPerModule} min={1} max={100} /></Field>
                    <Field label={t('qrgen.style.modMm')}><NumberInput value={moduleMm} onChange={setModuleMm} min={0.05} max={50} step={0.05} /></Field>
                    <Field label={t('qrgen.style.jpgQuality')}><NumberInput value={jpegQuality} onChange={setJpegQuality} min={10} max={100} /></Field>
                  </div>
                </section>

                <TeachingCallout
                  title={t('qrgen.teaching.quietTitle')}
                  onTheoryClick={openGuide}
                  className={styles.fullWidth}
                >
                  {t('qrgen.teaching.quietBody')}
                </TeachingCallout>
              </div>

              {/* Panel 5: Decrypt */}
              <div
                id="qrgen-panel-decrypt"
                role="tabpanel"
                aria-labelledby="qrgen-tab-decrypt"
                className={styles.tabPanel}
                hidden={activeControlTab !== 'decrypt'}
              >
                <DecryptBox />
              </div>
            </div>

            {/* Right / Sticky Preview & Export Column */}
            <aside className={styles.output} aria-label={t('qrgen.preview.title')}>
              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2>{t('qrgen.preview.title')}</h2>
                  {current && (
                    <span className={styles.statChip}>
                      <strong>{current.versionName}</strong> · {current.ecLevel ?? 'M1'}
                    </span>
                  )}
                </div>

                {result.error && <div className={styles.error}>{result.error}</div>}
                {!result.error && symbols.length > 0 && (
                  <SymbolPreview symbols={symbols} opts={renderOptions} selected={Math.min(selected, symbols.length - 1)} onSelect={setSelected} />
                )}

                {current && (
                  <div className={styles.summaryStrip}>
                    <span className={styles.statChip}>{SYMBOLOGY_LABELS[current.symbology]}</span>
                    <span className={styles.statChip}>{current.width} × {current.height} {t('qrgen.preview.modules')}</span>
                    <span className={styles.statChip}>{totalModules[0] * pxPerModule} × {totalModules[1] * pxPerModule} px</span>
                    <span className={styles.statChip}>{(totalModules[0] * moduleMm).toFixed(1)} × {(totalModules[1] * moduleMm).toFixed(1)} mm</span>
                  </div>
                )}

                {warnings.map((w, i) => <p key={i} className={styles.warning}>{w}</p>)}

                <h3>{t('qrgen.preview.download')}</h3>
                {current && (
                  <p className={styles.help}>
                    {t('qrgen.preview.exportSummary', {
                      pxW: totalModules[0] * pxPerModule,
                      pxH: totalModules[1] * pxPerModule,
                      dpi: dpi.toFixed(0),
                      mmW: (totalModules[0] * moduleMm).toFixed(1),
                      mmH: (totalModules[1] * moduleMm).toFixed(1),
                    })}
                    {symbols.length > 1 && t('qrgen.preview.exportSelected')}
                  </p>
                )}
                <div className={styles.exportBar}>
                  <button type="button" className={styles.primaryButton} disabled={!current} onClick={() => exportAs('png')}>PNG</button>
                  <button type="button" className={styles.button} disabled={!current} onClick={() => exportAs('svg')}>SVG</button>
                  <button type="button" className={styles.button} disabled={!current} onClick={() => exportAs('jpg')}>JPG</button>
                  <button type="button" className={styles.button} disabled={!current} onClick={() => exportAs('pdf')}>PDF</button>
                </div>
                {exportError && <p className={styles.warning}>{exportError}</p>}
              </section>

              {current && expMode !== 'quick' && (
                <section className={styles.card}>
                  <h2>{t('qrgen.preview.detailsTitle')}</h2>
                  <SymbolInfo sym={current} />
                </section>
              )}
            </aside>
          </div>
        </div>

        {/* Examples Workspace */}
        <div className={styles.workspacePanel} hidden={workspace !== 'examples'}>
          <ExamplesGallery<QrGenExampleId>
            title={t('ex.qrgen.title')}
            subtitle={t('ex.qrgen.lead')}
            items={QR_GEN_EXAMPLES.map((ex) => ({ id: ex.id, tag: t(ex.tagKey), code: ex.code, title: t(ex.titleKey), description: t(ex.descKey) }))}
            defaultActionLabel={t('ex.qrgen.action')}
            onSelect={loadExample}
          />
        </div>

        {/* Guide & Theory Workspace */}
        <div className={styles.workspacePanel} hidden={workspace !== 'guide'}>
          <div className={styles.guideLayout}>
            <div className={styles.guideHeader}>
              <h2>{t('qrgen.guide.title')}</h2>
              <p className={styles.lead}>{t('qrgen.guide.lead')}</p>
            </div>

            <section className={styles.card}>
              <h2>{t('qrgen.guide.familyTitle')}</h2>
              <dl className={styles.typeList}>
                <dt>{t('qrgen.guide.qr2Dt')}</dt>
                <dd>{t('qrgen.guide.qr2Dd')}</dd>
                <dt>{t('qrgen.guide.qr1Dt')}</dt>
                <dd>{t('qrgen.guide.qr1Dd')}</dd>
                <dt>{t('qrgen.guide.microDt')}</dt>
                <dd>{t('qrgen.guide.microDd')}</dd>
                <dt>{t('qrgen.guide.rmqrDt')}</dt>
                <dd>{t('qrgen.guide.rmqrDd')}</dd>
                <dt className={styles.unavailable}>{t('qrgen.guide.sqrcDt')}</dt>
                <dd>{t('qrgen.guide.sqrcDd')}</dd>
                <dt className={styles.unavailable}>{t('qrgen.guide.frameDt')}</dt>
                <dd>{t('qrgen.guide.frameDd')}</dd>
                <dt className={styles.unavailable}>{t('qrgen.guide.iqrDt')}</dt>
                <dd>{t('qrgen.guide.iqrDd')}</dd>
              </dl>
              <p className={styles.help} style={{ marginTop: 14 }}>
                {t('qrgen.guide.bgPrefix')}
                <a href="https://www.qrcode.com/en/codes/" target="_blank" rel="noopener noreferrer">{t('qrgen.guide.bgLink')}</a>
                {t('qrgen.guide.bgSuffix')}
              </p>
            </section>

            <div className={styles.guideGrid}>
              <section className={styles.card}>
                <h2>{t('qrgen.guide.ecTitle')}</h2>
                <p>{t('qrgen.guide.ecIntro')}</p>
                <table className={styles.guideTable}>
                  <thead>
                    <tr>
                      <th>{t('qrgen.guide.thLevel')}</th>
                      <th>{t('qrgen.guide.thRecovery')}</th>
                      <th>{t('qrgen.guide.thTypicalUse')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td><strong>L</strong></td><td className={styles.mono}>~7 %</td><td>{t('qrgen.guide.useL')}</td></tr>
                    <tr><td><strong>M</strong></td><td className={styles.mono}>~15 %</td><td>{t('qrgen.guide.useM')}</td></tr>
                    <tr><td><strong>Q</strong></td><td className={styles.mono}>~25 %</td><td>{t('qrgen.guide.useQ')}</td></tr>
                    <tr><td><strong>H</strong></td><td className={styles.mono}>~30 %</td><td>{t('qrgen.guide.useH')}</td></tr>
                  </tbody>
                </table>
                <p className={styles.help} style={{ marginTop: 10 }}>
                  <strong>{t('qrgen.guide.logoRuleLead')}</strong>
                  {t('qrgen.guide.logoRuleBody')}
                </p>
              </section>

              <section className={styles.card}>
                <h2>{t('qrgen.guide.quietTitle')}</h2>
                <p>{t('qrgen.guide.quietIntro')}</p>
                <dl className={styles.typeList}>
                  <dt>{t('qrgen.guide.quietStdDt')}</dt>
                  <dd>{t('qrgen.guide.quietStdDd')}</dd>
                  <dt>{t('qrgen.guide.modesDt')}</dt>
                  <dd>{t('qrgen.guide.modesDd')}</dd>
                  <dt>{t('qrgen.guide.fnc1Dt')}</dt>
                  <dd>{t('qrgen.guide.fnc1Dd')}</dd>
                </dl>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
