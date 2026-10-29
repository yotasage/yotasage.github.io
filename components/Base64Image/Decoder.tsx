import React from 'react';

import { DecodeError, decodeInput } from '../../lib/base64image/base64';
import { canCopyImages, canReadText, copyImage } from '../../lib/base64image/clipboard';
import { detectFormat, formatForMime, normalizeMime } from '../../lib/base64image/formats';
import { toPngBlob } from '../../lib/base64image/image';
import { download, errorMessage, formatBytes, isImage, safeFileName } from '../../lib/pdf/files';
import { groupDigits } from '../../lib/simsetup/numbers';
import styles from '../../styles/Base64Image.module.css';
import qrStyles from '../../styles/QrGen.module.css';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import { Field } from '../QrGen/fields';

const count = (n: number) => groupDigits(String(n), 'space');

const UNKNOWN = { mime: 'application/octet-stream', ext: 'bin', name: 'Unknown', image: false };

type Preview = { url: string; width: number; height: number } | { url: string; failed: true };

export default function Decoder() {
  const [text, setText] = React.useState('');
  const [fileName, setFileName] = React.useState('image');
  const [notice, setNotice] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  // Clipboard support is only known in the browser, so the buttons appear after the page has loaded.
  const [clipboard, setClipboard] = React.useState({ read: false, image: false });
  React.useEffect(() => setClipboard({ read: canReadText(), image: canCopyImages() }), []);

  // Decoding megabytes of pasted text takes a moment, so it does not hold up typing.
  const input = React.useDeferredValue(text);
  const result = React.useMemo(() => {
    try {
      return { decoded: decodeInput(input), error: null };
    } catch (e) {
      return { decoded: null, error: e instanceof DecodeError ? e.message : `Could not decode: ${errorMessage(e)}` };
    }
  }, [input]);
  const decoded = result.decoded?.bytes.length ? result.decoded : null;
  const error = result.error ?? (result.decoded && !decoded ? 'The data is empty.' : null);

  const detected = React.useMemo(() => (decoded ? detectFormat(decoded.bytes) : null), [decoded]);
  const declared = decoded?.declaredType ? formatForMime(decoded.declaredType) : null;
  const format = detected ?? declared ?? UNKNOWN;

  const warnings: string[] = [];
  if (decoded) {
    if (detected && declared && normalizeMime(decoded.declaredType) !== detected.mime) {
      warnings.push(`The data URL says ${decoded.declaredType}, but the data is a ${detected.name} file. The preview and the download use ${detected.name}.`);
    }
    if (!detected && declared) warnings.push(`The data was not recognised; it is taken as ${declared.mime} because the data URL says so.`);
    if (!detected && !declared) warnings.push('The data is not an image format this page knows. It can still be downloaded as a .bin file.');
    if (detected && !detected.image) warnings.push(`This is a ${detected.name} file, not an image. It can still be downloaded.`);
  }

  React.useEffect(() => {
    if (!decoded || !format.image) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(new Blob([decoded.bytes as BlobPart], { type: format.mime }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [decoded, format.mime, format.image]);

  React.useEffect(() => {
    setCopied(false);
    setActionError(null);
  }, [decoded]);

  const shown = preview?.url === url ? preview : null;
  const name = safeFileName(fileName, 'image');
  const downloadName = name.toLowerCase().endsWith(`.${format.ext}`) ? name : `${name}.${format.ext}`;

  async function openFile(files: File[]) {
    const file = files[0];
    setNotice(null);
    if (isImage(file)) {
      setNotice(`${file.name} is an image. To turn it into Base64, use Image to Base64.`);
      return;
    }
    setText(await file.text());
  }

  async function paste() {
    try {
      setText(await navigator.clipboard.readText());
    } catch (e) {
      setActionError(`Could not read the clipboard: ${errorMessage(e)}`);
    }
  }

  async function copy() {
    setActionError(null);
    try {
      await copyImage(toPngBlob(new Blob([decoded.bytes as BlobPart], { type: format.mime })));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setActionError(`Could not copy the image: ${errorMessage(e)}`);
    }
  }

  return (
    <DropTarget onFiles={openFile} className={[qrStyles.card, styles.panel].join(' ')} overClassName={styles.dropOver}>
      <h2>Base64 to image</h2>
      <Field label="Base64 or data URL" help="Standard or URL-safe Base64, with or without padding and line breaks, or a data URL. A data URL inside HTML, CSS, Markdown or JSON is found too.">
        <textarea
          className={[qrStyles.textarea, styles.text].join(' ')}
          value={text}
          spellCheck={false}
          autoComplete="off"
          placeholder="data:image/png;base64,iVBORw0KGgo…"
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className={qrStyles.buttonRow}>
        {clipboard.read && <button type="button" className={qrStyles.buttonSmall} onClick={paste}>Paste</button>}
        <FilePickerButton accept="text/*,.txt,.b64,.base64,.json,.html,.css,.md" multiple={false} onFiles={openFile} className={qrStyles.buttonSmall}>Open text file</FilePickerButton>
        <button type="button" className={qrStyles.buttonSmall} disabled={!text} onClick={() => setText('')}>Clear</button>
      </div>
      {notice && <p className={qrStyles.warning}>{notice}</p>}
      {text !== input && <p className={qrStyles.help}>Decoding…</p>}
      {error && text === input && <div className={[qrStyles.error, styles.spaced].join(' ')}>{error}</div>}

      {decoded && (
        <>
          <h3>Image</h3>
          {format.image && (
            <div className={qrStyles.preview}>
              {url && (
                <img
                  key={url}
                  src={url}
                  alt="Decoded image"
                  className={styles.image}
                  onLoad={(e) => setPreview({ url, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                  onError={() => setPreview({ url, failed: true })}
                />
              )}
              {shown && 'failed' in shown && (
                <span className={styles.noPreview}>The data is not a valid {format.name} image, or this browser cannot show {format.name} images.</span>
              )}
            </div>
          )}
          {warnings.map((w) => <p key={w} className={qrStyles.warning}>{w}</p>)}
          <table className={[qrStyles.infoTable, styles.info].join(' ')}>
            <tbody>
              <tr><th>Type</th><td>{format.name} ({format.mime})</td></tr>
              {shown && 'width' in shown && <tr><th>Size</th><td>{shown.width} × {shown.height} px</td></tr>}
              <tr><th>File size</th><td>{formatBytes(decoded.bytes.length)} ({count(decoded.bytes.length)} bytes)</td></tr>
              {decoded.declaredType && <tr><th>Data URL type</th><td>{decoded.declaredType}</td></tr>}
            </tbody>
          </table>
          {decoded.notes.map((n) => <p key={n} className={qrStyles.help}>{n}</p>)}

          <div className={styles.saveRow}>
            <Field label="File name">
              <input className={qrStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>
            <button type="button" className={qrStyles.button} onClick={() => download(decoded.bytes, downloadName, format.mime)}>Download {downloadName}</button>
            {clipboard.image && format.image && shown && 'width' in shown && (
              <button type="button" className={qrStyles.button} onClick={copy}>{copied ? 'Copied ✓' : 'Copy image'}</button>
            )}
          </div>
          {actionError && <p className={qrStyles.warning}>{actionError}</p>}
        </>
      )}
    </DropTarget>
  );
}
