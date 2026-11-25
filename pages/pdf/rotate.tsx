import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PageGrid, PageGridItem, PageSelectionBar } from '../../components/PdfTools/PageGrid';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Field } from '../../components/UI/Fields';
import { baseName, download, errorMessage, formatBytes, isPasswordError, isPdf, readBytes, safeFileName } from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { normalizeRotation } from '../../lib/pdf/pages';
import { PdfThumbPool } from '../../lib/pdf/thumbs';
import { ROTATE } from '../../lib/pdf/tools';
import { runRotatePdf } from '../../lib/pdf/workerClient';
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

interface RotatePageItem extends PageGridItem {
  rotation: 0 | 90 | 180 | 270;
}

function rotationLabel(deg: number): string {
  const n = normalizeRotation(deg);
  if (n === 90) return '+90°';
  if (n === 180) return '180°';
  if (n === 270) return '−90°';
  return '';
}

export default function RotatePdfPage() {
  const { t } = useI18n();
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [rotations, setRotations] = React.useState<number[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [fileName, setFileName] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState({ fraction: 0, label: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Uint8Array | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);

  const poolRef = React.useRef<PdfThumbPool | null>(null);
  React.useEffect(() => () => poolRef.current?.dispose(), []);
  React.useEffect(() => setResult(null), [doc, rotations]);

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
      setRotations(new Array(pageCount).fill(0));
      setSelectedIds(new Set());
      setFileName(`${baseName(name)}-rotated`);
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
    setNotice(files.length > 1 ? t('pdf.p.rot.onlyFirst') : null);
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
    setRotations([]);
    setSelectedIds(new Set());
    setResult(null);
    setError(null);
    setNotice(null);
  }

  const items: RotatePageItem[] = React.useMemo(() => {
    if (!doc) return [];
    return rotations.map((rot, i) => ({
      id: `p-${i}`,
      pool: doc.pool,
      pageIndex: i,
      rotation: normalizeRotation(rot),
      label: t('pdf.ff.pageN', { n: i + 1 }),
      meta: rotationLabel(rot) ? t('pdf.p.turned', { rot: rotationLabel(rot) }) : undefined,
    }));
  }, [doc, rotations, t]);

  const rotateOne = (index: number, delta: number) => {
    setRotations((prev) => prev.map((r, i) => (i === index ? normalizeRotation(r + delta) : r)));
  };

  const rotateTarget = (delta: number) => {
    const useSelection = selectedIds.size > 0;
    setRotations((prev) => prev.map((r, i) => (
      !useSelection || selectedIds.has(`p-${i}`) ? normalizeRotation(r + delta) : r
    )));
  };

  const resetRotations = () => {
    const useSelection = selectedIds.size > 0;
    setRotations((prev) => prev.map((r, i) => (!useSelection || selectedIds.has(`p-${i}`) ? 0 : r)));
  };

  const changedCount = rotations.filter((r) => normalizeRotation(r) !== 0).length;
  const outputName = `${safeFileName(fileName, 'rotated').replace(/\.pdf$/i, '')}.pdf`;

  async function save() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    setProgress({ fraction: 0, label: '' });
    try {
      const bytes = await runRotatePdf(doc.bytes, rotations, { password: doc.password }, (fraction, label) => setProgress({ fraction, label }));
      setResult(bytes);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const targetLabel = selectedIds.size > 0
    ? t(selectedIds.size === 1 ? 'pdf.p.rot.selOne' : 'pdf.p.rot.selMany', { n: selectedIds.size })
    : t('pdf.p.allPages');

  return (
    <PdfPage
      title={ROTATE.title}
      showHub
      lead={t('pdf.p.rot.lead')}
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
        tool={ROTATE}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel={t('pdf.p.selectPdf')}
        dropLabel={t('pdf.p.dropPdf')}
        addLabel={t('pdf.p.replacePdf')}
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <>
            <button type="button" className={styles.buttonSmall} onClick={() => rotateTarget(-90)}>{t('pdf.p.rotLeft')}</button>
            <button type="button" className={styles.buttonSmall} onClick={() => rotateTarget(90)}>{t('pdf.p.rotRight')}</button>
            <button type="button" className={styles.buttonSmall} onClick={() => rotateTarget(180)}>180°</button>
            <button type="button" className={styles.buttonSmall} disabled={changedCount === 0} onClick={resetRotations}>{t('pdf.p.reset')}</button>
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>{t('pdf.ff.close')}</button>
          </>
        }
        sidebar={
          <>
            <p className={styles.note}>
              {t('pdf.p.rot.applies', { target: targetLabel })}
            </p>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.button} onClick={() => rotateTarget(-90)}>{t('pdf.p.rotLeft90')}</button>
              <button type="button" className={styles.button} onClick={() => rotateTarget(90)}>{t('pdf.p.rotRight90')}</button>
              <button type="button" className={styles.button} onClick={() => rotateTarget(180)}>180°</button>
            </div>
            <Field label={t('pdf.ff.fileName')}>
              <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>
            <p className={styles.note}>
              {changedCount === 0
                ? t('pdf.p.rot.noneYet')
                : t(changedCount === 1 ? 'pdf.p.rot.countOne' : 'pdf.p.rot.countMany', { n: changedCount, total: doc?.pageCount ?? 0 })}
            </p>
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            <button type="button" className={styles.primary} disabled={busy || !doc || changedCount === 0} onClick={save}>
              {t('pdf.p.rot.save')}
            </button>
            {busy && <Progress fraction={progress.fraction} label={progress.label} />}
            {error && <div className={styles.error}>{error}</div>}
            {result && (
              <div className={styles.result}>
                <h3>{t('pdf.p.pdfReady')}</h3>
                <p>{t((doc?.pageCount ?? 0) === 1 ? 'pdf.p.pagesAndSizeOne' : 'pdf.p.pagesAndSizeMany', { n: doc?.pageCount ?? 0, size: formatBytes(result.length) })}</p>
                <button type="button" className={styles.primary} onClick={() => download(result, outputName)}>
                  {t('pdf.ff.downloadNamed', { name: outputName })}
                </button>
                <ContinueWith currentToolId={ROTATE.id} files={[{ name: outputName, bytes: result }]} />
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
              rangePlaceholder={t('pdf.p.rot.rangePh')}
            />
            <PageGrid
              items={items}
              selectedIds={selectedIds}
              onSelectChange={setSelectedIds}
              renderBadgeExtra={(item) => {
                const label = rotationLabel(item.rotation);
                return label ? <span className={styles.pillAccent}>{label}</span> : null;
              }}
              renderActions={(_, index) => (
                <>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={t('pdf.p.rotLeftTitle')}
                    aria-label={t('pdf.p.rot.pageLeftAria', { n: index + 1 })}
                    onClick={() => rotateOne(index, -90)}
                  >
                    &#x21BA;
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    title={t('pdf.p.rotRightTitle')}
                    aria-label={t('pdf.p.rot.pageRightAria', { n: index + 1 })}
                    onClick={() => rotateOne(index, 90)}
                  >
                    &#x21BB;
                  </button>
                </>
              )}
            />
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
