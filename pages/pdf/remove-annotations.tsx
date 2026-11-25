import React from 'react';

import { ContinueWith } from '../../components/PdfTools/ContinueWith';
import { PasswordPrompt } from '../../components/PdfTools/PasswordPrompt';
import { PdfPage, Progress, ToolWorkspace } from '../../components/PdfTools/ToolPage';
import { Checkbox, Field } from '../../components/UI/Fields';
import { AnnotationSummary, RemoveAnnotationsResult } from '../../lib/pdf/annotations';
import {
  baseName,
  download,
  errorMessage,
  formatBytes,
  isPasswordError,
  isPdf,
  readBytes,
  safeFileName,
} from '../../lib/pdf/files';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { parsePageRanges } from '../../lib/pdf/merge';
import { REMOVE_ANNOTATIONS } from '../../lib/pdf/tools';
import { runInspectAnnotations, runRemoveAnnotations } from '../../lib/pdf/workerClient';
import { translate, useI18n } from '../../lib/ui/i18n';
import type { Locale, TranslationKey } from '../../lib/ui/translations';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';

interface LoadedDoc {
  name: string;
  bytes: Uint8Array;
  summary: AnnotationSummary;
  password?: string;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

type PresetId = 'all' | 'comments' | 'links' | 'custom';

const SUBTYPE_KEYS: Record<string, TranslationKey> = {
  Text: 'pdf.rma.st.Text',
  FreeText: 'pdf.rma.st.FreeText',
  Highlight: 'pdf.rma.st.Highlight',
  Underline: 'pdf.rma.st.Underline',
  StrikeOut: 'pdf.rma.st.StrikeOut',
  Squiggly: 'pdf.rma.st.Squiggly',
  Link: 'pdf.rma.st.Link',
  Widget: 'pdf.rma.st.Widget',
  Stamp: 'pdf.rma.st.Stamp',
  Ink: 'pdf.rma.st.Ink',
  Line: 'pdf.rma.st.Line',
  Square: 'pdf.rma.st.Square',
  Circle: 'pdf.rma.st.Circle',
  Polygon: 'pdf.rma.st.Polygon',
  PolyLine: 'pdf.rma.st.PolyLine',
  Caret: 'pdf.rma.st.Caret',
  Popup: 'pdf.rma.st.Popup',
  FileAttachment: 'pdf.rma.st.FileAttachment',
  Sound: 'pdf.rma.st.Sound',
  Movie: 'pdf.rma.st.Movie',
  Screen: 'pdf.rma.st.Screen',
  Redact: 'pdf.rma.st.Redact',
  Watermark: 'pdf.rma.st.Watermark',
  TrapNet: 'pdf.rma.st.TrapNet',
  PrinterMark: 'pdf.rma.st.PrinterMark',
  '3D': 'pdf.rma.st.3D',
  RichMedia: 'pdf.rma.st.RichMedia',
};

function subtypeLabel(subtype: string, locale: Locale): string {
  const key = SUBTYPE_KEYS[subtype];
  return key ? translate(locale, key) : subtype;
}

function subtypesForPreset(preset: Exclude<PresetId, 'custom'>, summary: AnnotationSummary): Set<string> {
  const present = summary.subtypes.map((s) => s.subtype);
  if (preset === 'all') return new Set(present);
  if (preset === 'comments') return new Set(present.filter((s) => s !== 'Link' && s !== 'Widget'));
  return new Set(present.filter((s) => s === 'Link'));
}

export default function RemoveAnnotationsPage() {
  const { locale, t } = useI18n();
  const [doc, setDoc] = React.useState<LoadedDoc | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const [preset, setPreset] = React.useState<PresetId>('all');
  const [selectedSubtypes, setSelectedSubtypes] = React.useState<Set<string>>(new Set());
  const [pageRange, setPageRange] = React.useState('');
  const [removeAcroFormIfEmpty, setRemoveAcroFormIfEmpty] = React.useState(true);
  const [fileName, setFileName] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<RemoveAnnotationsResult | null>(null);

  React.useEffect(() => {
    setResult(null);
  }, [doc, preset, selectedSubtypes, pageRange, removeAcroFormIfEmpty]);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const summary = await runInspectAnnotations(bytes, password);
      setLocked(null);
      setDoc({ name, bytes, summary, password });
      setPreset('all');
      setSelectedSubtypes(new Set(summary.subtypes.map((s) => s.subtype)));
      setPageRange('');
      setRemoveAcroFormIfEmpty(true);
      setFileName(`${baseName(name)}-no-annotations`);
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
    setNotice(files.length > 1 ? t('pdf.rma.onlyFirst') : null);
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

  function applyPreset(next: Exclude<PresetId, 'custom'>) {
    setPreset(next);
    if (doc) setSelectedSubtypes(subtypesForPreset(next, doc.summary));
  }

  function toggleSubtype(subtype: string) {
    setPreset('custom');
    setSelectedSubtypes((prev) => {
      const next = new Set(prev);
      if (next.has(subtype)) next.delete(subtype);
      else next.add(subtype);
      return next;
    });
  }

  const pageRangeValidation = React.useMemo(() => {
    if (!doc || !pageRange.trim()) return { ok: true, count: doc?.summary.pageCount ?? 0, error: null as string | null };
    try {
      const indices = parsePageRanges(pageRange, doc.summary.pageCount);
      return { ok: true, count: new Set(indices).size, error: null as string | null };
    } catch (e) {
      return { ok: false, count: 0, error: errorMessage(e) };
    }
  }, [doc, pageRange]);

  const targetedAnnotationCount = React.useMemo(() => {
    if (!doc) return 0;
    return doc.summary.subtypes.reduce(
      (sum, item) => (selectedSubtypes.has(item.subtype) ? sum + item.count : sum),
      0,
    );
  }, [doc, selectedSubtypes]);

  const canRun =
    !!doc &&
    !busy &&
    pageRangeValidation.ok &&
    (preset === 'all'
      ? doc.summary.totalCount > 0 || (doc.summary.hasAcroForm && removeAcroFormIfEmpty)
      : selectedSubtypes.size > 0);

  const outputName = `${safeFileName(fileName, 'no-annotations').replace(/\.pdf$/i, '')}.pdf`;

  async function runRemove() {
    if (!doc || !canRun) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runRemoveAnnotations(
        doc.bytes,
        {
          subtypes: preset === 'all' ? undefined : Array.from(selectedSubtypes),
          pageRange: pageRange.trim() || undefined,
          removeAcroFormIfEmpty,
        },
        doc.password,
      );
      setResult(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PdfPage
      title={REMOVE_ANNOTATIONS.title}
      showHub
      lead={t('pdf.rma.lead')}
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
      {loading && !doc && !locked && <Progress fraction={0.4} label={t('pdf.rma.inspecting')} />}

      <ToolWorkspace
        tool={REMOVE_ANNOTATIONS}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel={t('pdf.p.selectPdfFile')}
        dropLabel={t('pdf.p.dropPdf')}
        addLabel={t('pdf.p.replacePdf')}
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <>
            {doc && doc.summary.subtypes.length > 0 && (
              <>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => applyPreset('all')}
                >
                  {t('pdf.rma.selectAll')}
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => {
                    setPreset('custom');
                    setSelectedSubtypes(new Set());
                  }}
                >
                  {t('pdf.rma.selectNone')}
                </button>
              </>
            )}
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              {t('pdf.ff.close')}
            </button>
          </>
        }
        sidebar={
          <>
            <div className={styles.levelList} role="radiogroup" aria-label={t('pdf.rma.presetAria')}>
              <label className={[styles.level, preset === 'all' ? styles.levelSelected : ''].join(' ')}>
                <input type="radio" name="annotPreset" checked={preset === 'all'} onChange={() => applyPreset('all')} />
                <span>
                  <strong>{t('pdf.rma.presetAll')}</strong>
                  <small>{t('pdf.rma.presetAllDesc')}</small>
                </span>
              </label>
              <label className={[styles.level, preset === 'comments' ? styles.levelSelected : ''].join(' ')}>
                <input
                  type="radio"
                  name="annotPreset"
                  checked={preset === 'comments'}
                  onChange={() => applyPreset('comments')}
                />
                <span>
                  <strong>{t('pdf.rma.presetComments')}</strong>
                  <small>{t('pdf.rma.presetCommentsDesc')}</small>
                </span>
              </label>
              <label className={[styles.level, preset === 'links' ? styles.levelSelected : ''].join(' ')}>
                <input
                  type="radio"
                  name="annotPreset"
                  checked={preset === 'links'}
                  onChange={() => applyPreset('links')}
                />
                <span>
                  <strong>{t('pdf.rma.presetLinks')}</strong>
                  <small>{t('pdf.rma.presetLinksDesc')}</small>
                </span>
              </label>
              <label className={[styles.level, preset === 'custom' ? styles.levelSelected : ''].join(' ')}>
                <input
                  type="radio"
                  name="annotPreset"
                  checked={preset === 'custom'}
                  onChange={() => setPreset('custom')}
                />
                <span>
                  <strong>{t('pdf.rma.presetCustom')}</strong>
                  <small>{t('pdf.rma.presetCustomDesc')}</small>
                </span>
              </label>
            </div>

            <Field
              label={t('pdf.p.pageRangeOpt')}
              help={
                pageRange.trim()
                  ? pageRangeValidation.ok
                    ? t(
                        pageRangeValidation.count === 1 ? 'pdf.rma.rangeAppliesOne' : 'pdf.rma.rangeAppliesMany',
                        { n: pageRangeValidation.count, total: doc?.summary.pageCount ?? 0 },
                      )
                    : undefined
                  : t('pdf.rma.rangeHelpBlank')
              }
            >
              <input
                className={fieldStyles.input}
                placeholder={t('pdf.rma.rangePlaceholder')}
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
              />
            </Field>
            {pageRangeValidation.error && <div className={styles.fileError}>{pageRangeValidation.error}</div>}

            <Checkbox
              label={t('pdf.rma.removeAcroForm')}
              checked={removeAcroFormIfEmpty}
              onChange={setRemoveAcroFormIfEmpty}
            />

            <Field label={t('pdf.ff.fileName')}>
              <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>

            {doc && doc.summary.totalCount > 0 && selectedSubtypes.size === 0 && (
              <p className={styles.note}>{t('pdf.rma.noneSelected')}</p>
            )}
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}

            <button type="button" className={styles.primary} disabled={!canRun} onClick={runRemove}>
              {busy
                ? t('pdf.rma.removing')
                : targetedAnnotationCount > 0
                  ? t(targetedAnnotationCount === 1 ? 'pdf.rma.btnCountOne' : 'pdf.rma.btnCountMany', {
                      n: targetedAnnotationCount,
                    })
                  : t('pdf.rma.btnDefault')}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>{t('pdf.rma.doneTitle')}</h3>
                <p>
                  {t(result.removedCount === 1 ? 'pdf.rma.doneOne' : 'pdf.rma.doneMany', {
                    removed: result.removedCount,
                    remaining: result.remainingCount,
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
                  currentToolId={REMOVE_ANNOTATIONS.id}
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
                {t(doc.summary.pageCount === 1 ? 'pdf.p.pagesAndSizeOne' : 'pdf.p.pagesAndSizeMany', {
                  n: doc.summary.pageCount,
                  size: formatBytes(doc.bytes.length),
                })}
              </span>
              <span className={doc.summary.totalCount > 0 ? styles.statusPending : styles.statusKept}>
                {t(doc.summary.totalCount === 1 ? 'pdf.rma.bannerAnnotsOne' : 'pdf.rma.bannerAnnotsMany', {
                  n: doc.summary.totalCount,
                  pages: t(
                    doc.summary.pagesWithAnnotations === 1 ? 'pdf.ff.pagesOne' : 'pdf.ff.pagesMany',
                    { n: doc.summary.pagesWithAnnotations },
                  ),
                })}
              </span>
              {doc.summary.hasAcroForm && (
                <span className={styles.statusLeft}>
                  {t(doc.summary.acroFormFieldCount === 1 ? 'pdf.rma.acroFormOne' : 'pdf.rma.acroFormMany', {
                    n: doc.summary.acroFormFieldCount,
                  })}
                </span>
              )}
            </div>

            <div className={styles.metaCard}>
              <h3>{t('pdf.rma.breakdownTitle')}</h3>
              {doc.summary.subtypes.length === 0 ? (
                <p className={styles.note}>
                  {t('pdf.rma.noAnnotsFound')}
                  {doc.summary.hasAcroForm ? t('pdf.rma.acroFormStill') : ''}
                </p>
              ) : (
                <>
                  <p className={styles.note}>{t('pdf.rma.checkedNote')}</p>
                  <div className={styles.chipGrid}>
                    {doc.summary.subtypes.map(({ subtype, count }) => {
                      const checked = selectedSubtypes.has(subtype);
                      const label = subtypeLabel(subtype, locale);
                      return (
                        <label
                          key={subtype}
                          className={[styles.annotChip, checked ? styles.annotChipSelected : ''].join(' ')}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSubtype(subtype)}
                          />
                          <span className={styles.annotChipInfo}>
                            <span className={styles.annotChipTitle}>{label}</span>
                            {label !== subtype && <span className={styles.annotChipSub}>/{subtype}</span>}
                          </span>
                          <span className={styles.annotChipCount}>{count}</span>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </ToolWorkspace>
    </PdfPage>
  );
}
