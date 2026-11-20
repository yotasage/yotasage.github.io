import Link from 'next/link';
import React from 'react';

import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field, NumberInput } from '../../components/QrGen/fields';
import { ExtractedImage } from '../../lib/pdf/extractImages';
import { baseName, download, errorMessage, formatBytes, isPasswordError, isPdf, readBytes, safeFileName, uid, zipFiles } from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { formatPageRanges } from '../../lib/pdf/pages';
import { EXTRACT_IMAGES } from '../../lib/pdf/tools';
import { runExtractImagesFromPdf } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import qrStyles from '../../styles/QrGen.module.css';

interface SourcePdf {
  id: string;
  name: string;
  bytes: Uint8Array;
  imageCount: number;
  skipped: number;
  error: string | null;
  scanning: boolean;
  password?: string;
  locked?: boolean;
}

interface ImageCardItem extends ExtractedImage {
  sourceId: string;
  sourceName: string;
  url: string;
}

export default function ExtractImagesPage() {
  const [sources, setSources] = React.useState<SourcePdf[]>([]);
  const [images, setImages] = React.useState<ImageCardItem[]>([]);
  const [skipTiny, setSkipTiny] = React.useState(true);
  const [minPx, setMinPx] = React.useState(16);
  const [appliedMinSize, setAppliedMinSize] = React.useState(16);
  const [zipName, setZipName] = React.useState('extracted-images');
  const [zipNameEdited, setZipNameEdited] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [passwordQueue, setPasswordQueue] = React.useState<string[]>([]);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwBusy, setPwBusy] = React.useState(false);

  const urlsRef = React.useRef<Set<string>>(new Set());
  const epochRef = React.useRef(0);
  const activeScansRef = React.useRef(0);
  const sourcesRef = React.useRef<SourcePdf[]>(sources);
  sourcesRef.current = sources;

  const createUrl = React.useCallback((bytes: Uint8Array, mime: string) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    urlsRef.current.add(url);
    return url;
  }, []);

  const revokeUrl = React.useCallback((url: string) => {
    if (urlsRef.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  const revokeAllUrls = React.useCallback(() => {
    for (const url of urlsRef.current) URL.revokeObjectURL(url);
    urlsRef.current.clear();
  }, []);

  React.useEffect(() => () => {
    epochRef.current += 1;
    revokeAllUrls();
  }, [revokeAllUrls]);

  // Debounce numeric threshold edits so typing a multi-digit number does not re-scan on every keystroke.
  React.useEffect(() => {
    const target = skipTiny ? minPx : 1;
    if (target === appliedMinSize) return;
    const timer = setTimeout(() => setAppliedMinSize(target), skipTiny ? 220 : 0);
    return () => clearTimeout(timer);
  }, [skipTiny, minPx, appliedMinSize]);

  const scanSources = React.useCallback(async (targets: SourcePdf[], minSize: number, replaceExisting: boolean) => {
    const scannable = targets.filter((s) => !s.locked);
    if (!scannable.length) return;
    if (replaceExisting) {
      epochRef.current += 1;
      setImages((prev) => {
        for (const it of prev) revokeUrl(it.url);
        return [];
      });
      setSources((prev) => prev.map((s) => (
        s.locked ? s : { ...s, scanning: true, error: null, imageCount: 0, skipped: 0 }
      )));
    }

    const epoch = epochRef.current;
    activeScansRef.current += 1;
    setBusy(true);
    setProgress({ fraction: 0, label: 'Scanning PDFs…' });

    try {
      for (let i = 0; i < scannable.length; i++) {
        if (epochRef.current !== epoch) return;
        const src = scannable[i];
        const currentSrc = sourcesRef.current.find((s) => s.id === src.id);
        if (!currentSrc || currentSrc.locked) continue;
        try {
          const res = await runExtractImagesFromPdf(
            src.bytes,
            { sourceName: src.name, minSize, password: currentSrc.password },
            (f, label) => {
              if (epochRef.current === epoch) {
                setProgress({ fraction: (i + f) / scannable.length, label: `${src.name}: ${label}` });
              }
            },
          );
          if (epochRef.current !== epoch || !sourcesRef.current.some((s) => s.id === src.id)) continue;
          const cards: ImageCardItem[] = res.images.map((img) => ({
            ...img,
            sourceId: src.id,
            sourceName: src.name,
            url: createUrl(img.bytes, img.mime),
          }));
          setImages((prev) => [...prev, ...cards]);
          setSources((prev) => prev.map((s) => (
            s.id === src.id
              ? { ...s, scanning: false, locked: false, error: null, imageCount: cards.length, skipped: res.skipped }
              : s
          )));
        } catch (e) {
          if (epochRef.current !== epoch) return;
          if (isPasswordError(e)) {
            setSources((prev) => prev.map((s) => (
              s.id === src.id
                ? { ...s, scanning: false, locked: true, error: null, imageCount: 0, skipped: 0 }
                : s
            )));
            setPasswordQueue((q) => (q.includes(src.id) ? q : [...q, src.id]));
          } else {
            setSources((prev) => prev.map((s) => (
              s.id === src.id
                ? { ...s, scanning: false, error: errorMessage(e), imageCount: 0, skipped: 0 }
                : s
            )));
          }
        }
      }
    } finally {
      activeScansRef.current = Math.max(0, activeScansRef.current - 1);
      if (activeScansRef.current === 0) setBusy(false);
    }
  }, [createUrl, revokeUrl]);

  // Re-scan currently loaded PDFs whenever the applied min-size filter changes.
  const prevMinSizeRef = React.useRef(appliedMinSize);
  React.useEffect(() => {
    if (prevMinSizeRef.current === appliedMinSize) return;
    prevMinSizeRef.current = appliedMinSize;
    if (sourcesRef.current.length > 0) {
      void scanSources(sourcesRef.current, appliedMinSize, true);
    }
  }, [appliedMinSize, scanSources]);

  async function addFiles(files: File[]) {
    const pdfs = files.filter(isPdf);
    setNotice(pdfs.length < files.length ? `${files.length - pdfs.length} file(s) were skipped because they are not PDFs.` : null);
    if (!pdfs.length) return;

    const added: SourcePdf[] = await Promise.all(pdfs.map(async (file) => ({
      id: uid(),
      name: file.name,
      bytes: await readBytes(file),
      imageCount: 0,
      skipped: 0,
      error: null,
      scanning: true,
    })));

    const wasEmpty = sourcesRef.current.length === 0;
    const nextSources = [...sourcesRef.current, ...added];
    sourcesRef.current = nextSources;
    setSources(nextSources);
    if (wasEmpty && !zipNameEdited) {
      setZipName(added.length === 1 ? `${baseName(added[0].name)}-images` : 'extracted-images');
    }

    await scanSources(added, appliedMinSize, false);
  }

  React.useEffect(() => {
    const handoff = consumeHandoff();
    if (handoff?.length) void addFiles(handoffToFiles(handoff));
  }, []);

  const activeLocked = React.useMemo(
    () => passwordQueue.map((id) => sources.find((s) => s.id === id && s.locked)).find(Boolean) ?? null,
    [passwordQueue, sources],
  );
  const remainingLocked = React.useMemo(
    () => passwordQueue.filter((id) => id !== activeLocked?.id && sources.some((s) => s.id === id && s.locked)).length,
    [passwordQueue, sources, activeLocked],
  );

  async function unlockActive(password: string) {
    if (!activeLocked) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const res = await runExtractImagesFromPdf(activeLocked.bytes, {
        sourceName: activeLocked.name,
        minSize: appliedMinSize,
        password,
      });
      const cards: ImageCardItem[] = res.images.map((img) => ({
        ...img,
        sourceId: activeLocked.id,
        sourceName: activeLocked.name,
        url: createUrl(img.bytes, img.mime),
      }));
      setImages((prev) => [...prev, ...cards]);
      const updated = sourcesRef.current.map((s) => (
        s.id === activeLocked.id
          ? { ...s, password, locked: false, scanning: false, error: null, imageCount: cards.length, skipped: res.skipped }
          : s
      ));
      sourcesRef.current = updated;
      setSources(updated);
      setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    } catch (e) {
      if (isPasswordError(e)) {
        setPwError('Incorrect password. Try again.');
      } else {
        const updated = sourcesRef.current.map((s) => (
          s.id === activeLocked.id
            ? { ...s, locked: false, scanning: false, error: errorMessage(e), imageCount: 0, skipped: 0 }
            : s
        ));
        sourcesRef.current = updated;
        setSources(updated);
        setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
      }
    } finally {
      setPwBusy(false);
    }
  }

  function cancelUnlock() {
    if (!activeLocked) return;
    const updated = sourcesRef.current.map((s) => (
      s.id === activeLocked.id
        ? { ...s, locked: false, scanning: false, error: 'Password required to open this PDF.' }
        : s
    ));
    sourcesRef.current = updated;
    setSources(updated);
    setPasswordQueue((q) => q.filter((id) => id !== activeLocked.id));
    setPwError(null);
  }

  function removeSource(id: string) {
    sourcesRef.current = sourcesRef.current.filter((s) => s.id !== id);
    setSources((prev) => prev.filter((s) => s.id !== id));
    setPasswordQueue((q) => q.filter((x) => x !== id));
    setImages((prev) => {
      const kept: ImageCardItem[] = [];
      for (const it of prev) {
        if (it.sourceId === id) revokeUrl(it.url);
        else kept.push(it);
      }
      return kept;
    });
  }

  function clearAll() {
    epochRef.current += 1;
    revokeAllUrls();
    sourcesRef.current = [];
    setSources([]);
    setImages([]);
    setPasswordQueue([]);
    setPwError(null);
    setBusy(false);
    setNotice(null);
    setZipName('extracted-images');
    setZipNameEdited(false);
  }

  const jpgCount = React.useMemo(() => images.filter((img) => img.mime === 'image/jpeg').length, [images]);
  const pngCount = images.length - jpgCount;
  const totalBytes = React.useMemo(() => images.reduce((sum, img) => sum + img.bytes.length, 0), [images]);
  const totalSkipped = React.useMemo(() => sources.reduce((sum, s) => sum + s.skipped, 0), [sources]);

  function downloadAll() {
    if (!images.length) return;
    if (images.length === 1) {
      download(images[0].bytes, images[0].name, images[0].mime);
      return;
    }
    const zip = zipFiles(images.map((img) => ({ name: img.name, bytes: img.bytes })));
    const outName = `${safeFileName(zipName, 'extracted-images').replace(/\.zip$/i, '')}.zip`;
    download(zip, outName, 'application/zip');
  }

  return (
    <PdfPage
      title={EXTRACT_IMAGES.title}
      showHub
      lead="Extract embedded images straight from one or more PDFs. JPEGs are saved untouched; raw, indexed and transparent images are exported as lossless PNGs."
    >
      <ToolWorkspace
        tool={EXTRACT_IMAGES}
        accept="application/pdf,.pdf"
        selectLabel="Select PDF files"
        dropLabel="or drop PDFs here"
        addLabel="+ Add PDFs"
        hasFiles={sources.length > 0}
        onFiles={addFiles}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={clearAll}>Remove all</button>}
        sidebar={
          <>
            <div className={styles.options}>
              <Checkbox
                label="Skip tiny images (spacers & icons)"
                checked={skipTiny}
                onChange={setSkipTiny}
              />
              {skipTiny && (
                <Field
                  label="Minimum dimension (px)"
                  help="Images narrower or shorter than this are ignored."
                >
                  <NumberInput value={minPx} onChange={setMinPx} min={1} max={1000} />
                </Field>
              )}
              {images.length > 1 && (
                <Field label="ZIP file name">
                  <input
                    className={qrStyles.input}
                    value={zipName}
                    onChange={(e) => {
                      setZipName(e.target.value);
                      setZipNameEdited(true);
                    }}
                  />
                </Field>
              )}
            </div>

            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span>Extracted images</span>
                <span>{images.length}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Original JPG</span>
                <span>{jpgCount}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Lossless PNG</span>
                <span>{pngCount}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>Total size</span>
                <span>{formatBytes(totalBytes)}</span>
              </div>
            </div>

            {totalSkipped > 0 && (
              <p className={styles.note}>
                {totalSkipped} unsupported image{totalSkipped === 1 ? '' : 's'} (e.g. CMYK, JPEG 2000, JBIG2 or 1-bit masks) {totalSkipped === 1 ? 'was' : 'were'} skipped.
              </p>
            )}
            {notice && <p className={qrStyles.warning}>{notice}</p>}

            <button
              type="button"
              className={styles.primary}
              disabled={busy || images.length === 0}
              onClick={downloadAll}
            >
              {images.length === 1
                ? 'Download image'
                : `Download all (${images.length} images, ZIP)`}
            </button>

            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
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
        <div className={styles.sourceChipList}>
          {sources.map((src) => (
            <div key={src.id} className={[styles.sourceChip, src.error ? styles.sourceChipError : ''].join(' ')}>
              <span className={styles.sourceChipName} title={src.name}>{src.name}</span>
              <span className={styles.sourceChipMeta}>
                {src.scanning
                  ? 'Scanning…'
                  : src.locked
                    ? 'Password protected'
                    : src.error
                      ? src.error
                      : `${src.imageCount} image${src.imageCount === 1 ? '' : 's'}`}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                title={`Remove ${src.name}`}
                aria-label={`Remove ${src.name}`}
                onClick={() => removeSource(src.id)}
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        {!busy && images.length === 0 && (
          <p className={styles.note}>
            No extractable images were found{skipTiny ? ` at least ${appliedMinSize} px on each side` : ''}.
            {totalSkipped > 0 ? ' Some embedded images use unsupported encodings (such as CMYK or JPEG 2000).' : ''}
            {' '}To rasterize entire pages instead, use{' '}
            <Link href="/pdf/pdf-to-images" className={styles.textLink}>PDF to images</Link>.
          </p>
        )}

        {images.length > 0 && (
          <ul className={styles.fileGrid}>
            {images.map((item) => {
              const pageList = formatPageRanges(item.pages.map((p) => p - 1));
              const isJpeg = item.mime === 'image/jpeg';
              return (
                <li key={item.id} className={styles.fileCard}>
                  <div className={[styles.thumb, isJpeg ? '' : styles.thumbCheckered].join(' ')}>
                    <img src={item.url} alt={item.name} loading="lazy" />
                  </div>
                  <span className={isJpeg ? styles.badgeJpg : styles.badgePng}>
                    {isJpeg ? 'Original JPG' : 'Lossless PNG'}
                  </span>
                  <div className={styles.fileName} title={item.name}>{item.name}</div>
                  <div className={styles.fileMeta}>
                    {item.width} &times; {item.height} &middot; {formatBytes(item.bytes.length)}
                  </div>
                  <div className={styles.fileMeta}>
                    {item.pages.length === 1 ? `Page ${pageList}` : `Pages ${pageList}`}
                    {sources.length > 1 ? ` · ${item.sourceName}` : ''}
                  </div>
                  <div className={styles.cardFooter}>
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      style={{ width: '100%' }}
                      onClick={() => download(item.bytes, item.name, item.mime)}
                    >
                      Download
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
