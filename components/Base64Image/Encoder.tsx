import React from 'react';

import { Alphabet, base64DataUrl, bytesToBase64, formatBase64, percentDataUrl } from '../../lib/base64image/base64';
import { copyText } from '../../lib/base64image/clipboard';
import { detectFormat, FileFormat, formatForMime } from '../../lib/base64image/formats';
import { ConvertType, convertImage, imageSize, loadImage } from '../../lib/base64image/image';
import { baseName, download, errorMessage, formatBytes, isImage, readBytes, safeFileName } from '../../lib/pdf/files';
import { groupDigits } from '../../lib/simsetup/numbers';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Base64Image.module.css';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import { Checkbox, Field, NumberInput, Select } from '../UI/Fields';
import CameraCapture from './CameraCapture';

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
  const { t } = useI18n();
  const outputOptions: [Output, string][] = [
    ['dataUrl', t('base64.opt.dataUrl')],
    ['base64', t('base64.opt.base64')],
    ['html', t('base64.opt.html')],
    ['css', t('base64.opt.css')],
    ['markdown', t('base64.opt.markdown')],
  ];
  const imageOptions: [ImageMode, string][] = [
    ['original', t('base64.opt.imgOriginal')],
    ['png', t('base64.opt.imgPng')],
    ['jpeg', t('base64.opt.imgJpeg')],
    ['webp', t('base64.opt.imgWebp')],
  ];
  const [source, setSource] = React.useState<Source | null>(null);
  const [cameraOpen, setCameraOpen] = React.useState(false);
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
    <DropTarget onFiles={(files) => load(files[0])} className={[styles.card, styles.panel].join(' ')} overClassName={styles.dropOver}>
      <h2>{t('base64.encoder.title')}</h2>
      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            setCameraOpen(false);
            void load(file);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}

      {!source && !cameraOpen && (
        <div className={styles.empty}>
          <div className={styles.emptyActions}>
            <FilePickerButton accept="image/*" multiple={false} onFiles={(files) => load(files[0])} className={styles.primaryButton}>
              {t('base64.encoder.selectImage')}
            </FilePickerButton>
            <button type="button" className={styles.button} onClick={() => setCameraOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                <circle cx="12" cy="13" r="3" />
              </svg>
              {t('base64.encoder.useCamera')}
            </button>
          </div>
          <span className={styles.help}>{t('base64.encoder.dropHint')}</span>
        </div>
      )}
      {loadError && <div className={styles.error}>{loadError}</div>}

      {source && !cameraOpen && (
        <>
          <div className={styles.preview}>
            {source.image
              ? <img src={source.url} alt="" className={styles.image} />
              : <span className={styles.noPreview}>{source.format.image ? t('base64.enc.noPreviewFmt', { name: source.format.name }) : t('base64.enc.notImage')}</span>}
          </div>
          <table className={styles.info}>
            <tbody>
              <tr><th>{t('base64.enc.thFile')}</th><td className={styles.breakAll}>{source.name}</td></tr>
              <tr><th>{t('base64.enc.thType')}</th><td>{source.format.name} ({source.format.mime})</td></tr>
              {source.image && <tr><th>{t('base64.enc.thSize')}</th><td>{source.width} × {source.height} px</td></tr>}
              <tr><th>{t('base64.enc.thFileSize')}</th><td>{formatBytes(source.bytes.length)} ({count(source.bytes.length)} {t('base64.enc.bytesUnit')})</td></tr>
            </tbody>
          </table>
          <div className={styles.buttonRow}>
            <FilePickerButton accept="image/*" multiple={false} onFiles={(files) => load(files[0])} className={styles.buttonSmall}>
              {t('base64.encoder.chooseAnother')}
            </FilePickerButton>
            <button type="button" className={styles.buttonSmall} onClick={() => setCameraOpen(true)}>
              {t('base64.encoder.takePhoto')}
            </button>
            <button type="button" className={styles.buttonSmall} onClick={() => setSource(null)}>
              {t('base64.encoder.remove')}
            </button>
          </div>

          <h3>{t('base64.encoder.imageSection')}</h3>
          <div className={styles.fieldGrid}>
            <Field label={t('base64.enc.imageDataLabel')} help={canConvert ? t('base64.enc.imageDataHelp') : t('base64.enc.imageDataNoOpen')}>
              <Select value={canConvert ? imageMode : 'original'} disabled={!canConvert} onChange={setImageMode} options={imageOptions} />
            </Field>
            {converting && (
              <>
                <Field label={t('base64.enc.widthLabel', { height })}>
                  <NumberInput value={width} onChange={setWidth} min={1} max={16384} />
                </Field>
                {imageMode !== 'png' && (
                  <Field label={t('base64.enc.qualityLabel')}><NumberInput value={quality} onChange={setQuality} min={1} max={100} /></Field>
                )}
                {imageMode === 'jpeg' && (
                  <Field label={t('base64.enc.bgLabel')}>
                    <input className={styles.color} type="color" value={background} onChange={(e) => setBackground(e.target.value)} />
                  </Field>
                )}
              </>
            )}
          </div>
          {converting && data && data.format.mime !== `image/${imageMode}` && (
            <p className={styles.warning}>{t('base64.enc.cantWriteFmt', { wanted: imageMode.toUpperCase(), actual: data.format.name })}</p>
          )}
          {converting && data && (
            <p className={styles.help}>
              {t('base64.enc.convertedSummary', {
                name: data.format.name,
                w: data.width,
                h: data.height,
                size: formatBytes(data.bytes.length),
                delta: data.bytes.length <= source.bytes.length
                  ? t('base64.enc.smaller', { pct: Math.round(100 - (100 * data.bytes.length) / source.bytes.length) })
                  : t('base64.enc.larger', { pct: Math.round((100 * data.bytes.length) / source.bytes.length - 100) }),
              })}
              {' '}<button type="button" className={styles.linkButton} onClick={() => download(data.bytes, `${name}.${data.format.ext}`, data.format.mime)}>{t('base64.enc.downloadIt')}</button>
            </p>
          )}
          {convertError && <div className={styles.error}>{convertError}</div>}

          <h3>{t('base64.encoder.outputSection')}</h3>
          <div className={styles.fieldGrid}>
            <Field label={t('base64.enc.formatLabel')}>
              <Select value={output} onChange={setOutput} options={outputOptions} />
            </Field>
            {isSvg && output !== 'base64' && (
              <Field label={t('base64.enc.svgInUrlLabel')} help={svgSizes ? t('base64.enc.svgSizesHelp', { percent: count(svgSizes.percent), base64: count(svgSizes.base64) }) : undefined}>
                <Select value={svgEncoding} onChange={setSvgEncoding} options={[['base64', 'Base64'], ['percent', t('base64.opt.svgPercent')]]} />
              </Field>
            )}
            {output === 'base64' && (
              <>
                <Field label={t('base64.enc.alphabetLabel')}>
                  <Select value={alphabet} onChange={setAlphabet} options={[['standard', t('base64.opt.alphaStd')], ['url', t('base64.opt.alphaUrl')]]} />
                </Field>
                <Field label={t('base64.enc.lineLengthLabel')}>
                  <Select value={lineLength} onChange={setLineLength} options={[['0', t('base64.opt.lineOne')], ['64', t('base64.opt.line64')], ['76', t('base64.opt.line76')]]} />
                </Field>
                <Checkbox label={t('base64.enc.paddingLabel')} checked={padding} onChange={setPadding} />
              </>
            )}
          </div>

          {data ? (
            <>
              <textarea
                className={[styles.textarea, styles.spaced].join(' ')}
                readOnly
                spellCheck={false}
                aria-label={t('base64.encoder.outputSection')}
                value={text.length > SHOWN_CHARACTERS ? `${text.slice(0, SHOWN_CHARACTERS)}…` : text}
                onFocus={(e) => e.currentTarget.select()}
              />
              <p className={styles.help}>
                {t('base64.enc.outputStats', { chars: count(text.length), bytes: count(data.bytes.length) })}
                {data.bytes.length > 0 && t('base64.enc.longerPct', { pct: Math.round((100 * text.length) / data.bytes.length - 100) })}.
                {text.length > SHOWN_CHARACTERS && t('base64.enc.truncated', { shown: count(SHOWN_CHARACTERS) })}
              </p>
              <div className={styles.buttonRow}>
                <button type="button" className={styles.primaryButton} onClick={copy}>
                  {copied ? t('base64.encoder.copied') : t('base64.encoder.copy')}
                </button>
                <button type="button" className={styles.button} onClick={() => download(new Blob([text], { type: 'text/plain' }), `${name}.txt`)}>
                  {t('base64.encoder.downloadTxt')}
                </button>
              </div>
              {copyError && <p className={styles.warning}>{copyError}</p>}
            </>
          ) : (
            !convertError && <p className={styles.help}>{t('base64.enc.converting')}</p>
          )}
        </>
      )}
    </DropTarget>
  );
}
