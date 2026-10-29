import React from 'react';

import { Alphabet, base64DataUrl, bytesToBase64, formatBase64, percentDataUrl } from '../../lib/base64image/base64';
import { copyText } from '../../lib/base64image/clipboard';
import { detectFormat, FileFormat, formatForMime } from '../../lib/base64image/formats';
import { ConvertType, convertImage, imageSize, loadImage } from '../../lib/base64image/image';
import { baseName, download, errorMessage, formatBytes, isImage, readBytes, safeFileName } from '../../lib/pdf/files';
import { groupDigits } from '../../lib/simsetup/numbers';
import styles from '../../styles/Base64Image.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import { Checkbox, Field, NumberInput, Select } from '../QrGen/fields';

type Output = 'dataUrl' | 'base64' | 'html' | 'css' | 'markdown';

type ImageMode = 'original' | 'png' | 'jpeg' | 'webp';

interface Source {
  name: string;
  bytes: Uint8Array;
  format: FileFormat;
  url: string;
  // Null when this browser cannot open the image, so it can only be encoded as it is.
  image: HTMLImageElement | null;
  width: number;
  height: number;
  // The text of an SVG file, for the percent-encoded data URL.
  svgText: string | null;
}

interface ImageData {
  bytes: Uint8Array;
  format: FileFormat;
  width: number;
  height: number;
}

const OUTPUT_OPTIONS: [Output, string][] = [
  ['dataUrl', 'Data URL'],
  ['base64', 'Base64 only'],
  ['html', 'HTML <img> tag'],
  ['css', 'CSS background-image'],
  ['markdown', 'Markdown image'],
];

const IMAGE_OPTIONS: [ImageMode, string][] = [
  ['original', 'Original file, unchanged'],
  ['png', 'Convert to PNG'],
  ['jpeg', 'Convert to JPEG'],
  ['webp', 'Convert to WebP'],
];

// A text box with many megabytes of text makes the page slow, so long outputs are shown cut short.
const SHOWN_CHARACTERS = 1_000_000;

const count = (n: number) => groupDigits(String(n), 'space');

function utf8OrNull(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export default function Encoder() {
  const [source, setSource] = React.useState<Source | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [imageMode, setImageMode] = React.useState<ImageMode>('original');
  const [width, setWidth] = React.useState(256);
  const [quality, setQuality] = React.useState(85);
  const [background, setBackground] = React.useState('#ffffff');
  const [converted, setConverted] = React.useState<(ImageData & { from: Source; key: string }) | null>(null);
  const [convertError, setConvertError] = React.useState<string | null>(null);
  const [output, setOutput] = React.useState<Output>('dataUrl');
  const [svgEncoding, setSvgEncoding] = React.useState<'base64' | 'percent'>('base64');
  const [alphabet, setAlphabet] = React.useState<Alphabet>('standard');
  const [padding, setPadding] = React.useState(true);
  const [lineLength, setLineLength] = React.useState('0');
  const [copied, setCopied] = React.useState(false);
  const [copyError, setCopyError] = React.useState<string | null>(null);

  // The preview URL of the previous file is released.
  React.useEffect(() => () => {
    if (source) URL.revokeObjectURL(source.url);
  }, [source]);

  // Only the last file chosen is shown, also when an earlier one takes longer to open.
  const loading = React.useRef(0);
  async function load(file: File) {
    const id = ++loading.current;
    setLoadError(null);
    try {
      const bytes = await readBytes(file);
      const format = detectFormat(bytes) ?? formatForMime(file.type || 'application/octet-stream');
      const blob = new Blob([bytes as BlobPart], { type: format.mime });
      const image = format.image ? await loadImage(blob).catch((): null => null) : null;
      if (id !== loading.current) return;
      const size = image ? imageSize(image) : { width: 0, height: 0 };
      setSource({
        name: file.name,
        bytes,
        format,
        url: URL.createObjectURL(blob),
        image,
        ...size,
        svgText: format.mime === 'image/svg+xml' ? utf8OrNull(bytes) : null,
      });
      if (image) setWidth(size.width);
    } catch (e) {
      if (id === loading.current) setLoadError(errorMessage(e));
    }
  }

  // An image pasted anywhere on the page (but not into a text field) is loaded here.
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if ((e.target as Element | null)?.closest?.('input, textarea')) return;
      const file = Array.from(e.clipboardData?.files ?? []).find(isImage);
      if (!file) return;
      e.preventDefault();
      load(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const canConvert = !!source?.image;
  const converting = canConvert && imageMode !== 'original';
  const height = source?.width ? Math.max(1, Math.round((width * source.height) / source.width)) : 0;
  const convertKey = [imageMode, width, height, quality, background].join('|');

  React.useEffect(() => {
    setConvertError(null);
    if (!converting) return;
    let cancelled = false;
    const type = `image/${imageMode}` as ConvertType;
    convertImage(source.image, { type, width, height, quality, background })
      .then((bytes) => {
        if (!cancelled) setConverted({ bytes, format: detectFormat(bytes) ?? formatForMime(type), width, height, from: source, key: convertKey });
      })
      .catch((e) => {
        if (!cancelled) setConvertError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [source, converting, convertKey]);

  const data: ImageData | null = !source
    ? null
    : !converting
      ? source
      : converted?.from === source && converted.key === convertKey ? converted : null;
  const isSvg = !converting && source?.svgText != null;
  const percent = isSvg && output !== 'base64' && svgEncoding === 'percent';

  const base64 = React.useMemo(() => (data ? bytesToBase64(data.bytes) : ''), [data?.bytes]);
  const text = React.useMemo(() => {
    if (!data) return '';
    if (output === 'base64') return formatBase64(base64, { alphabet, padding, lineLength: Number(lineLength) });
    const url = percent ? percentDataUrl(data.format.mime, source.svgText) : base64DataUrl(data.format.mime, base64);
    // An SVG without a size of its own gets no width and height.
    const sized = converting || !!source.image?.naturalWidth;
    if (output === 'html') return `<img src="${url}"${sized ? ` width="${data.width}" height="${data.height}"` : ''} alt="">`;
    if (output === 'css') return `background-image: url("${url}");`;
    // Spaces and brackets in a percent-encoded SVG are allowed in a Markdown link written as <…>.
    if (output === 'markdown') return `![${baseName(source.name).replace(/[[\]\\]/g, '')}](${percent ? `<${url}>` : url})`;
    return url;
  }, [source, data, base64, converting, output, percent, alphabet, padding, lineLength]);

  React.useEffect(() => {
    setCopied(false);
    setCopyError(null);
  }, [text]);

  async function copy() {
    try {
      await copyText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setCopyError(errorMessage(e));
    }
  }

  const name = source ? safeFileName(baseName(source.name), 'image') : 'image';
  const svgSizes = isSvg && output !== 'base64'
    ? { percent: percentDataUrl(source.format.mime, source.svgText).length, base64: base64DataUrl(source.format.mime, base64).length }
    : null;

  return (
    <DropTarget onFiles={(files) => load(files[0])} className={[qrStyles.card, styles.panel].join(' ')} overClassName={styles.dropOver}>
      <h2>Image to Base64</h2>
      {!source && (
        <div className={styles.empty}>
          <FilePickerButton accept="image/*" multiple={false} onFiles={(files) => load(files[0])} className={qrStyles.button}>Select image</FilePickerButton>
          <span className={qrStyles.help}>or drop an image here, or paste one (Ctrl+V)</span>
        </div>
      )}
      {loadError && <div className={qrStyles.error}>{loadError}</div>}

      {source && (
        <>
          <div className={qrStyles.preview}>
            {source.image
              ? <img src={source.url} alt="" className={styles.image} />
              : <span className={styles.noPreview}>{source.format.image ? `This browser cannot show ${source.format.name} images.` : 'Not an image.'}</span>}
          </div>
          <table className={[qrStyles.infoTable, styles.info].join(' ')}>
            <tbody>
              <tr><th>File</th><td className={styles.breakAll}>{source.name}</td></tr>
              <tr><th>Type</th><td>{source.format.name} ({source.format.mime})</td></tr>
              {source.image && <tr><th>Size</th><td>{source.width} × {source.height} px</td></tr>}
              <tr><th>File size</th><td>{formatBytes(source.bytes.length)} ({count(source.bytes.length)} bytes)</td></tr>
            </tbody>
          </table>
          <div className={qrStyles.buttonRow}>
            <FilePickerButton accept="image/*" multiple={false} onFiles={(files) => load(files[0])} className={qrStyles.buttonSmall}>Choose another image</FilePickerButton>
            <button type="button" className={qrStyles.buttonSmall} onClick={() => setSource(null)}>Remove</button>
          </div>

          <h3>Image</h3>
          <div className={qrStyles.fieldGrid}>
            <Field label="Image data" help={canConvert ? 'Converting can make the text much shorter, and removes metadata such as EXIF and GPS.' : 'This browser cannot open the file, so it can only be encoded as it is.'}>
              <Select value={canConvert ? imageMode : 'original'} disabled={!canConvert} onChange={setImageMode} options={IMAGE_OPTIONS} />
            </Field>
            {converting && (
              <>
                <Field label={`Width in px (height ${height} px)`}>
                  <NumberInput value={width} onChange={setWidth} min={1} max={16384} />
                </Field>
                {imageMode !== 'png' && (
                  <Field label="Quality (%)"><NumberInput value={quality} onChange={setQuality} min={1} max={100} /></Field>
                )}
                {imageMode === 'jpeg' && (
                  <Field label="Background (for transparent areas)">
                    <input className={qrStyles.color} type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
                  </Field>
                )}
              </>
            )}
          </div>
          {converting && data && data.format.mime !== `image/${imageMode}` && (
            <p className={qrStyles.warning}>This browser cannot write {imageMode.toUpperCase()} images, so it made a {data.format.name} image.</p>
          )}
          {converting && data && (
            <p className={qrStyles.help}>
              Converted: {data.format.name}, {data.width} × {data.height} px, {formatBytes(data.bytes.length)}
              {' '}({data.bytes.length <= source.bytes.length ? `${Math.round(100 - (100 * data.bytes.length) / source.bytes.length)} % smaller` : `${Math.round((100 * data.bytes.length) / source.bytes.length - 100)} % larger`} than the original).
              {' '}<button type="button" className={styles.linkButton} onClick={() => download(data.bytes, `${name}.${data.format.ext}`, data.format.mime)}>Download it</button>
            </p>
          )}
          {convertError && <div className={qrStyles.error}>{convertError}</div>}

          <h3>Output</h3>
          <div className={qrStyles.fieldGrid}>
            <Field label="Format">
              <Select value={output} onChange={setOutput} options={OUTPUT_OPTIONS} />
            </Field>
            {isSvg && output !== 'base64' && (
              <Field label="SVG in the data URL" help={svgSizes && `${count(svgSizes.percent)} characters percent-encoded, ${count(svgSizes.base64)} as Base64.`}>
                <Select value={svgEncoding} onChange={setSvgEncoding} options={[['base64', 'Base64'], ['percent', 'Text, percent-encoded']]} />
              </Field>
            )}
            {output === 'base64' && (
              <>
                <Field label="Alphabet">
                  <Select value={alphabet} onChange={setAlphabet} options={[['standard', 'Standard (+ /)'], ['url', 'URL-safe (- _)']]} />
                </Field>
                <Field label="Line length">
                  <Select value={lineLength} onChange={setLineLength} options={[['0', 'One line'], ['64', '64 characters (PEM)'], ['76', '76 characters (MIME)']]} />
                </Field>
                <Checkbox label="Padding (= at the end)" checked={padding} onChange={setPadding} />
              </>
            )}
          </div>

          {data ? (
            <>
              <textarea
                className={[qrStyles.textarea, styles.text, styles.spaced].join(' ')}
                readOnly
                spellCheck={false}
                aria-label="Output"
                value={text.length > SHOWN_CHARACTERS ? `${text.slice(0, SHOWN_CHARACTERS)}…` : text}
                onFocus={(e) => e.currentTarget.select()}
              />
              <p className={qrStyles.help}>
                {count(text.length)} characters for {count(data.bytes.length)} bytes
                {data.bytes.length > 0 && ` (${Math.round((100 * text.length) / data.bytes.length - 100)} % longer)`}.
                {text.length > SHOWN_CHARACTERS && ` The box shows the first ${count(SHOWN_CHARACTERS)}; Copy and Download use all of it.`}
              </p>
              <div className={qrStyles.buttonRow}>
                <button type="button" className={qrStyles.button} onClick={copy}>{copied ? 'Copied ✓' : 'Copy'}</button>
                <button type="button" className={qrStyles.button} onClick={() => download(new Blob([text], { type: 'text/plain' }), `${name}.txt`)}>Download .txt</button>
              </div>
              {copyError && <p className={qrStyles.warning}>{copyError}</p>}
            </>
          ) : (
            !convertError && <p className={qrStyles.help}>Converting…</p>
          )}
        </>
      )}
    </DropTarget>
  );
}
