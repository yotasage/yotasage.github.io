import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field } from '../../components/UI/Fields';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  readBytes,
  safeFileName,
  uid,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { PdfMetadata, PdfMetadataEdit } from '../../lib/pdf/metadata';
import { pdfPreview } from '../../lib/pdf/pdfjs';
import { EDIT_METADATA } from '../../lib/pdf/tools';
import { runReadPdfMetadata, runWritePdfMetadata } from '../../lib/pdf/workerClient';
import { useI18n } from '../../lib/ui/i18n';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number | null;
  meta: PdfMetadata;
  password?: string;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

interface CustomRow {
  id: string;
  key: string;
  value: string;
}

const STANDARD_KEYS = new Set([
  'Title',
  'Author',
  'Subject',
  'Keywords',
  'Creator',
  'Producer',
  'CreationDate',
  'ModDate',
  'Trapped',
]);

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function nowLocalInput(): string {
  return isoToLocalInput(new Date().toISOString());
}

export default function EditMetadataPage() {
  const { t } = useI18n();
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [title, setTitle] = React.useState('');
  const [author, setAuthor] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [keywords, setKeywords] = React.useState('');
  const [creator, setCreator] = React.useState('');
  const [producer, setProducer] = React.useState('');
  const [creationDate, setCreationDate] = React.useState('');
  const [modificationDate, setModificationDate] = React.useState('');
  const [customRows, setCustomRows] = React.useState<CustomRow[]>([]);
  const [clearXmp, setClearXmp] = React.useState(true);
  const [fileName, setFileName] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ bytes: Uint8Array; verified: PdfMetadata } | null>(null);

  function populateForm(meta: PdfMetadata) {
    setTitle(meta.title);
    setAuthor(meta.author);
    setSubject(meta.subject);
    setKeywords(meta.keywords);
    setCreator(meta.creator);
    setProducer(meta.producer);
    setCreationDate(isoToLocalInput(meta.creationDate));
    setModificationDate(isoToLocalInput(meta.modificationDate));
    setCustomRows(meta.customFields.map((f) => ({ id: uid(), key: f.key, value: f.value })));
    setClearXmp(true);
  }

  React.useEffect(() => {
    setResult(null);
  }, [doc, title, author, subject, keywords, creator, producer, creationDate, modificationDate, customRows, clearXmp]);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const meta = await runReadPdfMetadata(bytes, password);
      setLocked(null);
      setDoc({ name, bytes, pageCount: null, meta, password });
      populateForm(meta);
      setFileName(`${baseName(name)}-metadata`);
      void pdfPreview(bytes, 160, password)
        .then((p) => setDoc((prev) => (prev && prev.bytes === bytes ? { ...prev, pageCount: p.pageCount } : prev)))
        .catch(() => undefined);
    } catch (e) {
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
    setNotice(files.length > 1 ? t('pdf.edm.onlyFirst') : null);
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
    setDoc(null);
    setLocked(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  function clearAllFields() {
    setTitle('');
    setAuthor('');
    setSubject('');
    setKeywords('');
    setCreator('');
    setProducer('');
    setCreationDate('');
    setModificationDate('');
    setCustomRows([]);
  }

  function addCustomRow() {
    setCustomRows((rows) => [...rows, { id: uid(), key: '', value: '' }]);
  }

  function updateCustomRow(id: string, field: 'key' | 'value', val: string) {
    setCustomRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  }

  function removeCustomRow(id: string) {
    setCustomRows((rows) => rows.filter((r) => r.id !== id));
  }

  const collidingKeys = customRows
    .map((r) => r.key.trim())
    .filter((k) => k && STANDARD_KEYS.has(k));

  const outputName = `${safeFileName(fileName, 'metadata').replace(/\.pdf$/i, '')}.pdf`;

  async function saveMetadata() {
    if (!doc) return;
    setBusy(true);
    setError(null);
    try {
      const origCreateLocal = isoToLocalInput(doc.meta.creationDate);
      const origModLocal = isoToLocalInput(doc.meta.modificationDate);
      const edit: PdfMetadataEdit = {
        title,
        author,
        subject,
        keywords,
        creator,
        producer,
        creationDate: creationDate === origCreateLocal ? doc.meta.creationDate : localInputToIso(creationDate),
        modificationDate: modificationDate === origModLocal ? doc.meta.modificationDate : localInputToIso(modificationDate),
        customFields: customRows
          .map((r) => ({ key: r.key.trim(), value: r.value }))
          .filter((r) => r.key && !STANDARD_KEYS.has(r.key) && r.value !== ''),
        clearXmp,
      };
      const bytes = await runWritePdfMetadata(doc.bytes, edit, doc.password);
      const verified = await runReadPdfMetadata(bytes);
      setResult({ bytes, verified });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const filledStandardCount = [title, author, subject, keywords, creator, producer, creationDate, modificationDate].filter(
    (v) => v.trim().length > 0,
  ).length;
  const activeCustomCount = customRows.filter((r) => r.key.trim() && !STANDARD_KEYS.has(r.key.trim()) && r.value !== '').length;

  return (
    <PdfPage
      title={EDIT_METADATA.title}
      showHub
      lead={t('pdf.edm.lead')}
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
      {loading && !doc && !locked && <Progress fraction={0.4} label={t('pdf.edm.reading')} />}

      <ToolWorkspace
        tool={EDIT_METADATA}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel={t('pdf.p.selectPdfFile')}
        dropLabel={t('pdf.p.dropPdf')}
        addLabel={t('pdf.p.replacePdf')}
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <>
            <button
              type="button"
              className={styles.buttonSmall}
              onClick={() => doc && populateForm(doc.meta)}
            >
              {t('pdf.edm.resetEdits')}
            </button>
            <button type="button" className={styles.buttonSmall} onClick={clearAllFields}>
              {t('pdf.edm.clearAllFields')}
            </button>
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              {t('pdf.ff.close')}
            </button>
          </>
        }
        sidebar={
          <>
            <div className={styles.summaryBox}>
              <div className={styles.summaryRow}>
                <span>{t('pdf.edm.stdFields')}</span>
                <span>{filledStandardCount} / 8</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('pdf.edm.customFields')}</span>
                <span>{activeCustomCount}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('pdf.edm.xmpStream')}</span>
                <span>{t(doc?.meta.hasXmp ? 'pdf.edm.present' : 'pdf.edm.none')}</span>
              </div>
            </div>

            <Checkbox
              label={t('pdf.edm.clearXmpLabel')}
              checked={clearXmp}
              onChange={setClearXmp}
            />
            <p className={styles.note}>{t('pdf.edm.clearXmpNote')}</p>

            <Field label={t('pdf.ff.fileName')}>
              <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>

            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}

            <button type="button" className={styles.primary} disabled={busy || !doc} onClick={saveMetadata}>
              {t(busy ? 'pdf.edm.saving' : 'pdf.edm.saveBtn')}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>{t('pdf.edm.doneTitle')}</h3>
                <p>
                  {t(result.verified.customFields.length === 1 ? 'pdf.edm.verifiedOne' : 'pdf.edm.verifiedMany', {
                    title: result.verified.title ? `“${result.verified.title}”` : t('pdf.edm.untitled'),
                    n: result.verified.customFields.length,
                    xmp: t(result.verified.hasXmp ? 'pdf.edm.xmpKept' : 'pdf.edm.xmpStripped'),
                    size: formatBytes(result.bytes.length),
                  })}
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result.bytes, outputName)}
                >
                  {t('pdf.ff.downloadNamed', { name: outputName })}
                </button>
                <ContinueWith
                  currentToolId={EDIT_METADATA.id}
                  files={[{ name: outputName, bytes: result.bytes }]}
                />
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
                {doc.pageCount !== null ? `${t(doc.pageCount === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany', { n: doc.pageCount })} · ` : ''}
                {formatBytes(doc.bytes.length)}
              </span>
              {doc.meta.hasXmp ? (
                <span className={styles.statusLeft}>{t('pdf.edm.xmpPresent')}</span>
              ) : (
                <span className={styles.statusKept}>{t('pdf.edm.noXmp')}</span>
              )}
            </div>

            <div className={styles.metaCard}>
              <h3>{t('pdf.edm.stdPropsHeading')}</h3>
              <div className={styles.metaGrid}>
                <Field label={t('pdf.edm.title')}>
                  <input
                    className={fieldStyles.input}
                    value={title}
                    placeholder={t('pdf.edm.titlePh')}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field label={t('pdf.edm.author')}>
                  <input
                    className={fieldStyles.input}
                    value={author}
                    placeholder={t('pdf.edm.authorPh')}
                    onChange={(e) => setAuthor(e.target.value)}
                  />
                </Field>
                <Field label={t('pdf.edm.subject')} wide>
                  <input
                    className={fieldStyles.input}
                    value={subject}
                    placeholder={t('pdf.edm.subjectPh')}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </Field>
                <Field label={t('pdf.edm.keywords')} help={t('pdf.edm.keywordsHelp')} wide>
                  <input
                    className={fieldStyles.input}
                    value={keywords}
                    placeholder={t('pdf.edm.keywordsPh')}
                    onChange={(e) => setKeywords(e.target.value)}
                  />
                </Field>
                <Field label={t('pdf.edm.creator')}>
                  <input
                    className={fieldStyles.input}
                    value={creator}
                    placeholder={t('pdf.edm.creatorPh')}
                    onChange={(e) => setCreator(e.target.value)}
                  />
                </Field>
                <Field label={t('pdf.edm.producer')}>
                  <input
                    className={fieldStyles.input}
                    value={producer}
                    placeholder={t('pdf.edm.producerPh')}
                    onChange={(e) => setProducer(e.target.value)}
                  />
                </Field>
                <Field label={t('pdf.edm.creationDate')}>
                  <div className={styles.dateInputRow}>
                    <input
                      type="datetime-local"
                      className={fieldStyles.input}
                      value={creationDate}
                      onChange={(e) => setCreationDate(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => setCreationDate(nowLocalInput())}
                    >
                      {t('pdf.edm.now')}
                    </button>
                    {creationDate && (
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        onClick={() => setCreationDate('')}
                      >
                        {t('pdf.ff.clear')}
                      </button>
                    )}
                  </div>
                </Field>
                <Field label={t('pdf.edm.modDate')}>
                  <div className={styles.dateInputRow}>
                    <input
                      type="datetime-local"
                      className={fieldStyles.input}
                      value={modificationDate}
                      onChange={(e) => setModificationDate(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.buttonSmall}
                      onClick={() => setModificationDate(nowLocalInput())}
                    >
                      {t('pdf.edm.now')}
                    </button>
                    {modificationDate && (
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        onClick={() => setModificationDate('')}
                      >
                        {t('pdf.ff.clear')}
                      </button>
                    )}
                  </div>
                </Field>
              </div>
            </div>

            <div className={styles.metaCard} style={{ marginTop: '1rem' }}>
              <div className={styles.customFieldHeader}>
                <h3>{t('pdf.edm.customHeading')}</h3>
                <button type="button" className={styles.buttonSmall} onClick={addCustomRow}>
                  {t('pdf.edm.addField')}
                </button>
              </div>
              {customRows.length === 0 ? (
                <p className={styles.note}>{t('pdf.edm.noCustom')}</p>
              ) : (
                <div className={styles.customFieldList}>
                  {customRows.map((row) => (
                    <div key={row.id} className={styles.customFieldRow}>
                      <input
                        className={fieldStyles.input}
                        placeholder={t('pdf.edm.keyPh')}
                        aria-label={t('pdf.edm.keyAria')}
                        value={row.key}
                        onChange={(e) => updateCustomRow(row.id, 'key', e.target.value)}
                      />
                      <input
                        className={fieldStyles.input}
                        placeholder={t('pdf.edm.valPh')}
                        aria-label={t('pdf.edm.valAria')}
                        value={row.value}
                        onChange={(e) => updateCustomRow(row.id, 'value', e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.buttonSmall}
                        aria-label={t('pdf.edm.removeAria', { key: row.key || t('pdf.edm.customFieldFallback') })}
                        onClick={() => removeCustomRow(row.id)}
                      >
                        {t('pdf.edm.remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {collidingKeys.length > 0 && (
                <p className={fieldStyles.warning}>
                  {t(collidingKeys.length === 1 ? 'pdf.edm.collideOne' : 'pdf.edm.collideMany', { keys: collidingKeys.join(', ') })}
                </p>
              )}
            </div>
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
