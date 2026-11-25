import React from 'react';

import { PageGrid, PageGridItem, PageSelectionBar } from '../../components/PdfTools/PageGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, NumberInput, Select } from '../../components/UI/Fields';
import { baseName, download, errorMessage, formatBytes, isPasswordError, isPdf, readBytes, safeFileName, zipFiles } from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { pdfToImages } from '../../lib/pdf/pdfToImages';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { PDF_TO_IMAGES } from '../../lib/pdf/tools';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  pool: PdfThumbPool;
  password?: string;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

type ImageFormat = 'jpeg' | 'png';
type DpiPreset = '72' | '150' | '300' | 'custom';

export default function PdfToImagesPage() {
  const { t } = useI18n();
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [format, setFormat] = React.useState<ImageFormat>('jpeg');
  const [dpiPreset, setDpiPreset] = React.useState<DpiPreset>('150');
  const [customDpi, setCustomDpi] = React.useState(200);
  const [quality, setQuality] = React.useState(85);
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ name: string; bytes: Uint8Array; type: string; count: number } | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);

  const poolRef = React.useRef<PdfThumbPool | null>(null);
  React.useEffect(() => () => poolRef.current?.dispose(), []);

  const dpi = dpiPreset === 'custom' ? customDpi : Number(dpiPreset);

  React.useEffect(() => setResult(null), [doc, selectedIds, format, dpi, quality, fileName]);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setLoading(true);
    const pool = new PdfThumbPool(bytes, { password });
    try {
      const pageCount = await pool.open();
      poolRef.current?.dispose();
      poolRef.current = pool;
      setLocked(null);
      setDoc({ name, bytes, pageCount, pool, password });
      setSelectedIds(new Set());
      setFileName(`${baseName(name)}-images`);
    } catch (e) {
      pool.dispose();
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
    setNotice(files.length > 1 ? t('pdf.p.onlyFirst') : null);
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

  function clearDoc() {
    poolRef.current?.dispose();
    poolRef.current = null;
    setDoc(null);
    setLocked(null);
    setSelectedIds(new Set());
    setResult(null);
    setError(null);
    setNotice(null);
  }

  const items: PageGridItem[] = React.useMemo(() => {
    if (!doc) return [];
    return Array.from({ length: doc.pageCount }, (_, i) => ({
      id: `p-${i}`,
      pool: doc.pool,
      pageIndex: i,
      label: t('pdf.ff.pageN', { n: i + 1 }),
    }));
  }, [doc, t]);

  const selectedIndices = React.useMemo(() => {
    if (!doc) return [];
    const out: number[] = [];
    for (let i = 0; i < doc.pageCount; i++) {
      if (selectedIds.has(`p-${i}`)) out.push(i);
    }
    return out;
  }, [doc, selectedIds]);

  const targetCount = selectedIndices.length > 0 ? selectedIndices.length : (doc?.pageCount ?? 0);
  const canRun = !!doc && !busy && targetCount > 0;

  async function renderImages() {
    if (!doc || !canRun) return;
    setBusy(true);
    setError(null);
    setProgress({ fraction: 0, label: '' });
    try {
      const files = await pdfToImages(
        doc.bytes,
        {
          format,
          dpi,
          quality,
          pages: selectedIndices.length > 0 ? selectedIndices : null,
          sourceName: doc.name,
          password: doc.password,
        },
        (fraction, label) => setProgress({ fraction, label }),
      );
      if (!files.length) throw new Error(t('pdf.p.p2i.noRendered'));

      const ext = format === 'jpeg' ? 'jpg' : 'png';
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const defaultStem = `${baseName(doc.name)}-images`;

      if (files.length === 1) {
        const customName = fileName.trim();
        const outName = customName && customName !== defaultStem
          ? `${safeFileName(customName, 'page').replace(/\.(jpe?g|png|zip)$/i, '')}.${ext}`
          : files[0].name;
        setResult({
          name: outName,
          bytes: files[0].bytes,
          type: mime,
          count: 1,
        });
      } else {
        const zip = zipFiles(files);
        setResult({
          name: `${safeFileName(fileName, defaultStem).replace(/\.zip$/i, '')}.zip`,
          bytes: zip,
          type: 'application/zip',
          count: files.length,
        });
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PdfPage
      title={PDF_TO_IMAGES.title}
      showHub
      lead={t('pdf.p.p2i.lead')}
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
      {loading && !doc && !locked && <Progress fraction={0.4} label={t('pdf.p.opening')} />}
      <ToolWorkspace
        tool={PDF_TO_IMAGES}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel={t('pdf.p.selectPdf')}
        dropLabel={t('pdf.p.dropPdf')}
        addLabel={t('pdf.p.replacePdf')}
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={<button type="button" className={styles.buttonSmall} onClick={clearDoc}>{t('pdf.ff.close')}</button>}
        sidebar={
          <>
            <div className={styles.options}>
              <Field label={t('pdf.p.p2i.format')}>
                <Select
                  value={format}
                  onChange={setFormat}
                  options={[
                    ['jpeg', t('pdf.p.p2i.fmtJpg')],
                    ['png', t('pdf.p.p2i.fmtPng')],
                  ]}
                />
              </Field>
              <Field label={t('pdf.p.p2i.resolution')}>
                <Select
                  value={dpiPreset}
                  onChange={setDpiPreset}
                  options={[
                    ['72', t('pdf.p.p2i.dpi72')],
                    ['150', t('pdf.p.p2i.dpi150')],
                    ['300', t('pdf.p.p2i.dpi300')],
                    ['custom', t('pdf.p.p2i.dpiCustom')],
                  ]}
                />
              </Field>
              {dpiPreset === 'custom' && (
                <Field label={t('pdf.p.p2i.customDpiLabel')}>
                  <NumberInput value={customDpi} onChange={setCustomDpi} min={36} max={600} />
                </Field>
              )}
              {format === 'jpeg' && (
                <Field label={t('pdf.p.jpegQuality')}>
                  <NumberInput value={quality} onChange={setQuality} min={10} max={100} />
                </Field>
              )}
              <Field label={targetCount === 1 ? t('pdf.ff.fileName') : t('pdf.p.zipFileName')}>
                <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
              </Field>
            </div>
            <p className={styles.note}>
              {selectedIndices.length > 0
                ? t(selectedIndices.length === 1 ? 'pdf.p.p2i.noteSelOne' : 'pdf.p.p2i.noteSelMany', { n: selectedIndices.length, total: doc?.pageCount ?? 0, dpi })
                : t((doc?.pageCount ?? 0) === 1 ? 'pdf.p.p2i.noteAllOne' : 'pdf.p.p2i.noteAllMany', { n: doc?.pageCount ?? 0, dpi })}
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={!canRun} onClick={renderImages}>
              {t(targetCount === 1 ? 'pdf.p.p2i.btnOne' : 'pdf.p.p2i.btnMany', { n: targetCount, fmt: format === 'jpeg' ? 'JPG' : 'PNG' })}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>{result.count === 1 ? t('pdf.p.p2i.readyOne') : t('pdf.p.p2i.readyMany', { n: result.count })}</h3>
                <p>{formatBytes(result.bytes.length)}.</p>
                <button type="button" className={styles.primary} onClick={() => download(result.bytes, result.name, result.type)}>
                  {t('pdf.ff.downloadNamed', { name: result.name })}
                </button>
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
                {t(doc.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: doc.pageCount })} · {formatBytes(doc.bytes.length)}
              </span>
            </div>
            <PageSelectionBar
              items={items}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
              rangePlaceholder={t('pdf.p.p2i.rangePh')}
            />
            <PageGrid
              items={items}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              renderBadgeExtra={(item) => (
                selectedIds.has(item.id) ? <span className={styles.pillAccent}>{t('pdf.p.p2i.badge')}</span> : null
              )}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
