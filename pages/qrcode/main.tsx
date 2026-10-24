import Head from 'next/head';
import Link from 'next/link';
import React from 'react';

import HomeIcon from '../../components/icons/home';
import ContentForm from '../../components/QrGen/ContentForm';
import DecryptBox from '../../components/QrGen/DecryptBox';
import { Checkbox, Field, NumberInput, Select } from '../../components/QrGen/fields';
import SegmentEditor from '../../components/QrGen/SegmentEditor';
import SymbolInfo from '../../components/QrGen/SymbolInfo';
import SymbolPreview from '../../components/QrGen/SymbolPreview';
import { Charset, CHARSET_LABELS, encodeString } from '../../lib/qr/charsets';
import {
  EcLevel, ecLevelsFor, ecRow, encode, EncodeOptions, ManualSegment, ModeOption, QrEncodeError, QrSymbol, structuredAppendParity,
  Symbology, SYMBOLOGY_LABELS, versionName, versionRange,
} from '../../lib/qr/encoder';
import { CONTENT_TYPES, initialValues, Payload, Values } from '../../lib/qr/payloads';
import { drawToCanvas, logoCoverage, ModuleShape, pngWithDpi, jpegWithDpi, RenderOptions, toPdf, toSvg } from '../../lib/qr/render';
import { RMQR_SIZES } from '../../lib/qr/tables';
import styles from '../../styles/QrGen.module.css';

const SYMBOLOGY_OPTIONS: [string, string][] = [
  ['qr2', 'QR Code Model 2'],
  ['qr1', 'QR Code Model 1'],
  ['micro', 'Micro QR Code'],
  ['rmqr', 'rMQR Code (rectangular)'],
];

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

function splitData(data: string | Uint8Array, parts: number): (string | Uint8Array)[] {
  const units = typeof data === 'string' ? [...data] : Array.from(data);
  if (units.length < parts) throw new QrEncodeError(`There are only ${units.length} characters, which cannot be split into ${parts} symbols.`);
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

function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) reject(new Error('The browser could not create the image.'));
      else resolve(new Uint8Array(await blob.arrayBuffer()));
    }, type, quality);
  });
}

export default function QrCodeGenerator() {
  // Content
  const [typeId, setTypeId] = React.useState('url');
  const [valuesByType, setValuesByType] = React.useState<Record<string, Values>>(
    () => Object.fromEntries(CONTENT_TYPES.map((t) => [t.id, initialValues(t)])),
  );
  const type = CONTENT_TYPES.find((t) => t.id === typeId);
  const values = valuesByType[typeId];
  const [payload, setPayload] = React.useState<Payload | null>(null);
  const [payloadError, setPayloadError] = React.useState<string | null>(null);

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
        if (mode === 'manual') throw new QrEncodeError('Structured Append splits the content form data; it cannot be combined with manual segments.');
        let bytes: ArrayLike<number>;
        try {
          bytes = typeof payload.data === 'string' ? encodeString(payload.data, charset) : payload.data;
        } catch {
          bytes = typeof payload.data === 'string' ? new TextEncoder().encode(payload.data) : payload.data;
        }
        const parity = structuredAppendParity(bytes);
        const parts = splitData(payload.data, saTotal);
        return {
          symbols: parts.map((part, index) => encode(part, { ...opts, structuredAppend: { index, total: parts.length, parity } })),
          error: null,
        };
      }
      return { symbols: [encode(mode === 'manual' ? '' : payload.data, opts)], error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { symbols: [], error: e instanceof QrEncodeError ? message : `Unexpected error: ${message}` };
    }
  }, [payload, symbology, version, minVersion, rmqrHeight, rmqrWidth, rmqrPreference, effectiveEc, boostEc, mask, mode, manualSegments,
    allowKanji, charset, eciChoice, eciValue, effectiveFnc1, aimIndicator, saEnabled, saTotal]);

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
    if (symbology === 'qr1') warnings.push('Model 1 is obsolete. Most phone cameras and apps cannot read it; zxing-cpp based readers can.');
    if (symbology === 'micro' || symbology === 'rmqr') warnings.push(`Many phone cameras do not read ${SYMBOLOGY_LABELS[symbology]} yet. Test with the reader that will be used.`);
    if (quietZone < STANDARD_QUIET_ZONE[symbology]) warnings.push(`The quiet zone is smaller than the ${STANDARD_QUIET_ZONE[symbology]} modules the standard requires.`);
    if (renderOptions.logo) {
      const cov = logoCoverage(current, renderOptions.logo);
      const row = ecRow(current.symbology, current.version, current.ecLevel ?? 'L');
      const recoverable = current.ecLevel ? row[0] / 2 / (row[0] + row[2]) : 0;
      const coveredPct = (100 * cov.covered) / cov.dataModules;
      warnings.push(`The logo hides ${coveredPct.toFixed(1)} % of the data modules; this level can restore about ${(100 * recoverable).toFixed(0)} % of the codewords.`);
      if (cov.covered / cov.dataModules > recoverable * 0.6) warnings.push('That leaves little or no margin. Use a smaller logo or a higher error correction level, and test the symbol.');
      if (cov.functionCovered > 0) warnings.push('The logo covers finder, timing or alignment patterns, which readers need to locate the symbol.');
    }
    if (foreground.toLowerCase() === background.toLowerCase()) warnings.push('Foreground and background colours are the same.');
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
          logoJpeg = { jpeg: await canvasBytes(c, 'image/jpeg', 0.92), width: c.width, height: c.height };
        }
        download(toPdf(current, renderOptions, moduleMm, logoJpeg, fileName || 'QR code'), 'application/pdf', exportName('pdf'));
      } else {
        const canvas = document.createElement('canvas');
        drawToCanvas(canvas, current, renderOptions, pxPerModule, format === 'jpg');
        if (format === 'png') download(pngWithDpi(await canvasBytes(canvas, 'image/png'), dpi), 'image/png', exportName('png'));
        else download(jpegWithDpi(await canvasBytes(canvas, 'image/jpeg', jpegQuality / 100), dpi), 'image/jpeg', exportName('jpg'));
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
      image.onerror = () => setExportError('The logo file could not be read as an image.');
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  const [vLo, vHi] = versionRange(symbology);
  const versionOptions: [string, string][] = [['auto', 'Auto (smallest that fits)'], ...range(vLo, vHi).map((v) => [String(v), versionLabel(symbology, v)] as [string, string])];
  const maskCount = symbology === 'micro' ? 4 : 8;
  const rmqrHeights = Array.from(new Set(RMQR_SIZES.map(([, h]) => h)));
  const rmqrWidths = Array.from(new Set(RMQR_SIZES.map(([w]) => w))).sort((a, b) => a - b);
  const eciSupported = symbology === 'qr2' || symbology === 'rmqr';
  const fnc1Supported = symbology === 'qr2' || symbology === 'rmqr';

  return (
    <div className={styles.page}>
      <Head>
        <title>QR code generator</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0;
          background: #2b2b2b;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>

      <header className={styles.header}>
        <Link href="/" className={styles.homeLink} aria-label="Home"><HomeIcon /></Link>
        <h1 className={styles.title}>QR code generator</h1>
      </header>
      <p className={styles.lead}>
        Model 1, Model 2, Micro QR and rMQR symbols with full control over version, error correction, mask and encoding.
        Everything runs in your browser; nothing you enter leaves this page.
      </p>

      <div className={styles.layout}>
        <div className={styles.controls}>
          <section className={styles.card}>
            <h2>Content</h2>
            <div className={styles.fieldGrid}>
              <Field label="Content type" help={type.description} wide>
                <Select value={typeId} onChange={setTypeId} options={CONTENT_TYPES.map((t) => [t.id, t.label] as [string, string])} />
              </Field>
            </div>
            <h3>{type.label}</h3>
            <ContentForm type={type} values={values} onChange={(v) => setValuesByType({ ...valuesByType, [typeId]: v })} />
            {payloadError && <p className={styles.warning}>{payloadError}</p>}
            {payload && (
              <>
                <h3>Encoded payload ({typeof payload.data === 'string' ? `${[...payload.data].length} characters` : `${payload.data.length} bytes`})</h3>
                <pre className={[styles.payload, styles.mono].join(' ')}>{describePayload(payload.data) || '(empty)'}</pre>
              </>
            )}
          </section>

          <section className={styles.card}>
            <h2>Symbol</h2>
            <div className={styles.fieldGrid}>
              <Field label="Symbol type">
                <select className={styles.select} value={symbology} onChange={(e) => changeSymbology(e.target.value as Symbology)}>
                  {SYMBOLOGY_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  {UNAVAILABLE_SYMBOLOGIES.map((name) => <option key={name} disabled>{name} (proprietary, see below)</option>)}
                </select>
              </Field>
              <Field label="Version">
                <Select value={String(version)} onChange={(v) => setVersion(v === 'auto' ? 'auto' : Number(v))} options={versionOptions} />
              </Field>
              {version === 'auto' && symbology !== 'rmqr' && (
                <Field label="Smallest version allowed">
                  <Select value={String(minVersion)} onChange={(v) => setMinVersion(Number(v))} options={range(vLo, vHi).map((v) => [String(v), versionName(symbology, v)] as [string, string])} />
                </Field>
              )}
              {version === 'auto' && symbology === 'rmqr' && (
                <>
                  <Field label="Height">
                    <Select value={String(rmqrHeight)} onChange={(v) => setRmqrHeight(v === 'auto' ? 'auto' : Number(v))}
                      options={[['auto', 'Any'], ...rmqrHeights.map((h) => [String(h), `${h} modules`] as [string, string])]} />
                  </Field>
                  <Field label="Width">
                    <Select value={String(rmqrWidth)} onChange={(v) => setRmqrWidth(v === 'auto' ? 'auto' : Number(v))}
                      options={[['auto', 'Any'], ...rmqrWidths.map((w) => [String(w), `${w} modules`] as [string, string])]} />
                  </Field>
                  <Field label="Prefer">
                    <Select value={rmqrPreference} onChange={setRmqrPreference}
                      options={[['area', 'Smallest area'], ['height', 'Lowest height'], ['width', 'Shortest width']]} />
                  </Field>
                </>
              )}
              <Field label="Error correction level">
                <Select
                  value={effectiveEc}
                  onChange={setEcLevel}
                  options={ecChoices.map((l) => [l, symbology === 'micro' && version === 1 ? 'Detection only (M1)' : EC_LABELS[l]] as [EcLevel, string])}
                />
              </Field>
              <Field label="Data mask" help={symbology === 'rmqr' ? 'rMQR always uses the same mask.' : 'Auto evaluates every mask with the rules from the standard.'}>
                <Select
                  value={String(mask)}
                  disabled={symbology === 'rmqr'}
                  onChange={(v) => setMask(v === 'auto' ? 'auto' : Number(v))}
                  options={[['auto', 'Auto (best score)'], ...range(0, maskCount - 1).map((m) => [String(m), `Mask ${m}`] as [string, string])]}
                />
              </Field>
              <Checkbox wide label="Raise the error correction level as long as the data still fits in the chosen version" checked={boostEc} onChange={setBoostEc} />
            </div>
          </section>

          <section className={styles.card}>
            <h2>Encoding</h2>
            <div className={styles.fieldGrid}>
              <Field label="Mode" help="Auto finds the mix of numeric, alphanumeric, byte and Kanji segments with the fewest bits.">
                <Select value={mode} onChange={setMode} options={[
                  ['auto', 'Auto (optimal segments)'], ['numeric', 'Numeric only'], ['alphanumeric', 'Alphanumeric only'], ['byte', 'Byte only'], ['kanji', 'Kanji only'], ['manual', 'Manual segments'],
                ]} />
              </Field>
              <Field label="Byte mode character set">
                <Select value={charset} onChange={setCharset} options={(Object.keys(CHARSET_LABELS) as Charset[]).map((c) => [c, CHARSET_LABELS[c]] as [Charset, string])} />
              </Field>
              <Field label="ECI designator" help={eciSupported ? 'Tells the reader which character set byte mode uses. Auto adds it only for non-ASCII text.' : 'Not available for this symbol type.'}>
                <Select value={eciChoice} disabled={!eciSupported} onChange={setEciChoice} options={[['auto', 'Auto'], ['none', 'Never'], ['custom', 'Custom assignment number']]} />
              </Field>
              {eciChoice === 'custom' && eciSupported && (
                <Field label="ECI assignment number" help="3 = ISO-8859-1, 20 = Shift JIS, 26 = UTF-8, 899 = binary">
                  <NumberInput value={eciValue} onChange={setEciValue} min={0} max={999999} />
                </Field>
              )}
              <Field label="FNC1 / application" help={gs1FromContent ? 'Set by the GS1 content type.' : fnc1Supported ? undefined : 'Not available for this symbol type.'}>
                <Select value={effectiveFnc1} disabled={gs1FromContent || !fnc1Supported} onChange={setFnc1}
                  options={[['none', 'None'], ['gs1', 'GS1 (FNC1 in first position)'], ['aim', 'AIM application (FNC1 in second position)']]} />
              </Field>
              {effectiveFnc1 === 'aim' && (
                <Field label="Application indicator" help="Two digits or one letter.">
                  <input className={styles.input} value={aimIndicator} maxLength={2} onChange={(e) => setAimIndicator(e.target.value)} />
                </Field>
              )}
              <Checkbox wide label="Allow Kanji mode in Auto (13 bits per Shift JIS character instead of 24 bits of UTF-8)" checked={allowKanji} onChange={setAllowKanji} />
              {symbology === 'qr2' && (
                <>
                  <Checkbox wide label="Split the data over several symbols (Structured Append)" checked={saEnabled} onChange={setSaEnabled} />
                  {saEnabled && (
                    <Field label="Number of symbols">
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

          <section className={styles.card}>
            <h2>Appearance</h2>
            <div className={styles.fieldGrid}>
              <Field label="Foreground"><input className={styles.color} type="color" value={foreground} onChange={(e) => setForeground(e.target.value)} /></Field>
              <Field label="Background"><input className={styles.color} type="color" value={background} disabled={transparent} onChange={(e) => setBackground(e.target.value)} /></Field>
              <Field label="Module shape">
                <Select value={shape} onChange={setShape} options={[['square', 'Square'], ['rounded', 'Rounded squares'], ['dots', 'Dots']]} />
              </Field>
              <Field label={`Quiet zone (modules, standard ${STANDARD_QUIET_ZONE[symbology]})`}>
                <NumberInput value={quietZone} onChange={setQuietZone} min={0} max={20} />
              </Field>
              <Checkbox wide label="Transparent background (PNG, SVG and PDF; JPG uses white)" checked={transparent} onChange={setTransparent} />
              <Checkbox wide label="Keep finder, timing and alignment patterns square" checked={squareFunctionPatterns} onChange={setSquareFunctionPatterns} />
            </div>

            <h3>Logo</h3>
            <div className={styles.fieldGrid}>
              <Field label="Image file" wide help="Drawn over the centre and relies on error correction to stay readable.">
                <input className={styles.input} type="file" accept="image/*" onChange={(e) => loadLogo(e.target.files?.[0])} />
              </Field>
              {logoImage && (
                <>
                  <Field label="Logo height (% of the symbol)"><NumberInput value={logoScale} onChange={setLogoScale} min={5} max={60} /></Field>
                  <Field label="Cleared margin (modules)"><NumberInput value={logoPadding} onChange={setLogoPadding} min={0} max={10} /></Field>
                  <Checkbox label="Remove the data modules under the logo" checked={logoClear} onChange={setLogoClear} />
                  <Checkbox label="Background colour behind the logo" checked={logoBackdrop} onChange={setLogoBackdrop} />
                  <div className={styles.fieldWide}>
                    <button type="button" className={styles.buttonSmall} onClick={() => setLogoImage(null)}>Remove logo</button>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>

        <div className={styles.output}>
          <section className={styles.card}>
            <h2>Preview</h2>
            {result.error && <div className={styles.error}>{result.error}</div>}
            {!result.error && symbols.length > 0 && (
              <SymbolPreview symbols={symbols} opts={renderOptions} selected={Math.min(selected, symbols.length - 1)} onSelect={setSelected} />
            )}
            {warnings.map((w, i) => <p key={i} className={styles.warning}>{w}</p>)}

            <h3>Export</h3>
            <div className={styles.fieldGrid}>
              <Field label="File name"><input className={styles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} /></Field>
              <Field label="Pixels per module (PNG, JPG)"><NumberInput value={pxPerModule} onChange={setPxPerModule} min={1} max={100} /></Field>
              <Field label="Module size in mm (SVG, PDF, print DPI)"><NumberInput value={moduleMm} onChange={setModuleMm} min={0.05} max={50} step={0.05} /></Field>
              <Field label="JPG quality (%)"><NumberInput value={jpegQuality} onChange={setJpegQuality} min={10} max={100} /></Field>
            </div>
            {current && (
              <p className={styles.help}>
                PNG/JPG: {totalModules[0] * pxPerModule} × {totalModules[1] * pxPerModule} px at {dpi.toFixed(0)} DPI.
                SVG/PDF: {(totalModules[0] * moduleMm).toFixed(1)} × {(totalModules[1] * moduleMm).toFixed(1)} mm.
                {symbols.length > 1 && ' Exports the selected symbol.'}
              </p>
            )}
            <div className={styles.buttonRow}>
              {(['png', 'jpg', 'svg', 'pdf'] as const).map((f) => (
                <button key={f} type="button" className={styles.button} disabled={!current} onClick={() => exportAs(f)}>{f.toUpperCase()}</button>
              ))}
            </div>
            {exportError && <p className={styles.warning}>{exportError}</p>}
          </section>

          {current && (
            <section className={styles.card}>
              <h2>Details</h2>
              <SymbolInfo sym={current} />
            </section>
          )}
        </div>
      </div>

      <div className={styles.fullWidth}>
        <DecryptBox />
      </div>

      <section className={[styles.card, styles.fullWidth].join(' ')}>
        <h2>About the QR code family</h2>
        <dl className={styles.typeList}>
          <dt>QR Code Model 2</dt>
          <dd>The QR code everyone knows (ISO/IEC 18004). Versions 1 to 40, from 21 × 21 to 177 × 177 modules, up to 7089 digits or 2953 bytes. Supports ECI, Structured Append and FNC1 (GS1).</dd>
          <dt>QR Code Model 1</dt>
          <dd>The original 1994 design, versions 1 to 14 (up to 73 × 73 modules). It has extension patterns along the right and bottom edges instead of alignment patterns, and no ECI. Kept for completeness; few readers support it.</dd>
          <dt>Micro QR Code</dt>
          <dd>A single finder pattern and a 2 module quiet zone, versions M1 to M4 (11 × 11 to 17 × 17 modules), for very small amounts of data such as part numbers. M1 holds up to 5 digits and only detects errors.</dd>
          <dt>rMQR Code</dt>
          <dd>Rectangular Micro QR (ISO/IEC 23941), 32 sizes from R7x43 to R17x139, for narrow spaces such as cables, tubes and the edge of a label. Levels M and H only.</dd>
          <dt className={styles.unavailable}>SQRC (not available)</dt>
          <dd>A QR code with a public part and a private part that only readers with the right cryptographic key can read. The format and keys are proprietary to Denso Wave and need their licensed software and readers. The <em>Password-protected text</em> content type is an open alternative: the cipher text is readable by any scanner, but only this page (with the password) can decrypt it.</dd>
          <dt className={styles.unavailable}>Frame QR (not available)</dt>
          <dd>A QR code with an empty canvas area for pictures. It is a proprietary Denso Wave format readable only with Frame QR aware apps. A logo with a cleared area (Appearance → Logo) gives a similar look on a standard symbol, paid for with error correction.</dd>
          <dt className={styles.unavailable}>iQR Code (not available)</dt>
          <dd>A larger, square or rectangular Denso Wave format without a published specification.</dd>
        </dl>
        <p className={styles.help}>
          Background: <a href="https://www.qrcode.com/en/codes/" target="_blank" rel="noopener noreferrer">qrcode.com – types of QR codes</a>.
          The encoder was checked against zxing-cpp, segno and reference symbols.
        </p>
      </section>
    </div>
  );
}
