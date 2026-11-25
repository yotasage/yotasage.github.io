import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PageGrid, PageGridItem, PageSelectionBar } from '../../components/PdfTools/PageGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field, Select } from '../../components/UI/Fields';
import { baseName, download, errorMessage, formatBytes, isPasswordError, isPdf, readBytes, safeFileName, zipFiles } from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { EXTRACT_PAGES } from '../../lib/pdf/tools';
import { runExtractPagesPdf } from '../../lib/pdf/workerClient';
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

export default function ExtractPagesPage() {
  const { t } = useI18n();
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<'single' | 'separate'>('single');
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ name: string; bytes: Uint8Array; type: string; count: number; pages: number } | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);

  const poolRef = React.useRef<PdfThumbPool | null>(null);
  React.useEffect(() => () => poolRef.current?.dispose(), []);
  React.useEffect(() => setResult(null), [doc, selectedIds, mode, fileName]);

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
      setFileName(`${baseName(name)}-extracted`);
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

  const canRun = !!doc && !busy && selectedIndices.length > 0;

  async function applyExtract() {
    if (!doc || !canRun) return;
    setBusy(true);
    setError(null);
    setProgress({ fraction: 0, label: '' });
    try {
      const files = await runExtractPagesPdf(
        doc.bytes,
        selectedIndices,
        {
          separate: mode === 'separate',
          sourceName: doc.name,
          outputName: safeFileName(fileName, 'extracted'),
          password: doc.password,
        },
        (fraction, label) => setProgress({ fraction, label }),
      );
      if (files.length === 1) {
        setResult({
          name: files[0].name,
          bytes: files[0].bytes,
          type: 'application/pdf',
          count: 1,
          pages: selectedIndices.length,
        });
      } else {
        const zip = zipFiles(files);
        setResult({
          name: `${safeFileName(fileName, 'extracted').replace(/\.zip$/i, '')}.zip`,
          bytes: zip,
          type: 'application/zip',
          count: files.length,
          pages: selectedIndices.length,
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
      title={EXTRACT_PAGES.title}
      showHub
      lead={t('pdf.p.ext.lead')}
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
        tool={EXTRACT_PAGES}
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
              <Field label={t('pdf.p.output')}>
                <Select
                  value={mode}
                  onChange={setMode}
                  options={[
                    ['single', t('pdf.p.ext.modeSingle')],
                    ['separate', t('pdf.p.ext.modeSeparate')],
                  ]}
                />
              </Field>
              <Field label={mode === 'single' || selectedIndices.length <= 1 ? t('pdf.ff.fileName') : t('pdf.p.zipFileName')}>
                <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
              </Field>
            </div>
            <p className={styles.note}>
              {t((doc?.pageCount ?? 0) === 1 ? 'pdf.p.ext.selectedOne' : 'pdf.p.ext.selectedMany', { n: selectedIndices.length, total: doc?.pageCount ?? 0 })}
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={!canRun} onClick={applyExtract}>
              {selectedIndices.length === 0
                ? t('pdf.p.ext.btnEmpty')
                : t(selectedIndices.length === 1 ? 'pdf.p.ext.btnOne' : 'pdf.p.ext.btnMany', { n: selectedIndices.length })}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>{result.count === 1 ? t('pdf.p.pdfReady') : t('pdf.p.pdfsReady', { n: result.count })}</h3>
                <p>{t(result.pages === 1 ? 'pdf.p.pagesAndSizeOne' : 'pdf.p.pagesAndSizeMany', { n: result.pages, size: formatBytes(result.bytes.length) })}</p>
                <button type="button" className={styles.primary} onClick={() => download(result.bytes, result.name, result.type)}>
                  {t('pdf.ff.downloadNamed', { name: result.name })}
                </button>
                {result.count === 1 && (
                  <ContinueWith currentToolId={EXTRACT_PAGES.id} files={[{ name: result.name, bytes: result.bytes }]} />
                )}
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
              rangePlaceholder={t('pdf.p.ext.rangePh')}
            />
            <PageGrid
              items={items}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              renderBadgeExtra={(item) => (
                selectedIds.has(item.id) ? <span className={styles.pillAccent}>{t('pdf.p.ext.badge')}</span> : null
              )}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
