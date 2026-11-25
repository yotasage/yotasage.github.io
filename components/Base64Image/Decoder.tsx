import React from 'react';

import { DecodeError, decodeInput } from '../../lib/base64image/base64';
import { canCopyImages, canReadText, copyImage } from '../../lib/base64image/clipboard';
import { detectFormat, formatForMime, normalizeMime } from '../../lib/base64image/formats';
import { toPngBlob } from '../../lib/base64image/image';
import { download, errorMessage, formatBytes, isImage, safeFileName } from '../../lib/pdf/files';
import { groupDigits } from '../../lib/simsetup/numbers';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/Base64Image.module.css';
import { DropTarget, FilePickerButton } from '../PdfTools/ToolPage';
import { Field } from '../UI/Fields';

const count = (n: number) => groupDigits(String(n), 'space');

const UNKNOWN = { mime: 'application/octet-stream', ext: 'bin', name: 'Unknown', image: false };

type Preview = { url: string; width: number; height: number } | { url: string; failed: true };

export default function Decoder() {
  const { t } = useI18n();
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
      return { decoded: null, error: e instanceof DecodeError ? e.message : t('base64.dec.cantDecode', { msg: errorMessage(e) }) };
    }
  }, [input, t]);
  const decoded = result.decoded?.bytes.length ? result.decoded : null;
  const error = result.error ?? (result.decoded && !decoded ? t('base64.dec.emptyData') : null);

  const detected = React.useMemo(() => (decoded ? detectFormat(decoded.bytes) : null), [decoded]);
  const declared = decoded?.declaredType ? formatForMime(decoded.declaredType) : null;
  const format = detected ?? declared ?? { ...UNKNOWN, name: t('base64.dec.unknown') };

  const warnings: string[] = [];
  if (decoded) {
    if (detected && declared && normalizeMime(decoded.declaredType) !== detected.mime) {
      warnings.push(t('base64.dec.warnMismatch', { declared: decoded.declaredType, detected: detected.name }));
    }
    if (!detected && declared) warnings.push(t('base64.dec.warnUnrecognized', { mime: declared.mime }));
    if (!detected && !declared) warnings.push(t('base64.dec.warnNotImageFmt'));
    if (detected && !detected.image) warnings.push(t('base64.dec.warnNotImage', { name: detected.name }));
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
      setNotice(t('base64.dec.noticeIsImage', { name: file.name }));
      return;
    }
    setText(await file.text());
  }

  async function paste() {
    try {
      setText(await navigator.clipboard.readText());
    } catch (e) {
      setActionError(t('base64.dec.errClipboard', { msg: errorMessage(e) }));
    }
  }

  async function copy() {
    setActionError(null);
    try {
      await copyImage(toPngBlob(new Blob([decoded.bytes as BlobPart], { type: format.mime })));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setActionError(t('base64.dec.errCopy', { msg: errorMessage(e) }));
    }
  }

  return (
    <DropTarget onFiles={openFile} className={[styles.card, styles.panel].join(' ')} overClassName={styles.dropOver}>
      <h2>{t('base64.decoder.title')}</h2>
      <Field label={t('base64.dec.inputLabel')} help={t('base64.dec.inputHelp')}>
        <textarea
          className={styles.textarea}
          value={text}
          spellCheck={false}
          autoComplete="off"
          placeholder="data:image/png;base64,iVBORw0KGgo…"
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div className={styles.buttonRow}>
        {clipboard.read && <button type="button" className={styles.buttonSmall} onClick={paste}>{t('base64.decoder.paste')}</button>}
        <FilePickerButton accept="text/*,.txt,.b64,.base64,.json,.html,.css,.md" multiple={false} onFiles={openFile} className={styles.buttonSmall}>
          {t('base64.decoder.openFile')}
        </FilePickerButton>
        <button type="button" className={styles.buttonSmall} disabled={!text} onClick={() => setText('')}>
          {t('base64.decoder.clear')}
        </button>
      </div>
      {notice && <p className={styles.warning}>{notice}</p>}
      {text !== input && <p className={styles.help}>{t('base64.dec.decoding')}</p>}
      {error && text === input && <div className={styles.error}>{error}</div>}

      {decoded && (
        <>
          <h3>{t('base64.decoder.imageSection')}</h3>
          {format.image && (
            <div className={styles.preview}>
              {url && (
                <img
                  key={url}
                  src={url}
                  alt={t('base64.dec.altDecoded')}
                  className={styles.image}
                  onLoad={(e) => setPreview({ url, width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
                  onError={() => setPreview({ url, failed: true })}
                />
              )}
              {shown && 'failed' in shown && (
                <span className={styles.noPreview}>{t('base64.dec.invalidPreview', { name: format.name })}</span>
              )}
            </div>
          )}
          {warnings.map((w) => <p key={w} className={styles.warning}>{w}</p>)}
          <table className={styles.info}>
            <tbody>
              <tr><th>{t('base64.enc.thType')}</th><td>{format.name} ({format.mime})</td></tr>
              {shown && 'width' in shown && <tr><th>{t('base64.enc.thSize')}</th><td>{shown.width} × {shown.height} px</td></tr>}
              <tr><th>{t('base64.enc.thFileSize')}</th><td>{formatBytes(decoded.bytes.length)} ({count(decoded.bytes.length)} {t('base64.enc.bytesUnit')})</td></tr>
              {decoded.declaredType && <tr><th>{t('base64.dec.thDataUrlType')}</th><td>{decoded.declaredType}</td></tr>}
            </tbody>
          </table>
          {decoded.notes.map((n) => <p key={n} className={styles.help}>{n}</p>)}

          <div className={styles.saveRow}>
            <Field label={t('base64.dec.fileNameLabel')}>
              <input className={styles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>
            <button type="button" className={styles.primaryButton} onClick={() => download(decoded.bytes, downloadName, format.mime)}>
              {t('base64.dec.downloadFile', { name: downloadName })}
            </button>
            {clipboard.image && format.image && shown && 'width' in shown && (
              <button type="button" className={styles.button} onClick={copy}>
                {copied ? t('base64.decoder.copied') : t('base64.decoder.copyImage')}
              </button>
            )}
          </div>
          {actionError && <p className={styles.warning}>{actionError}</p>}
        </>
      )}
    </DropTarget>
  );
}
