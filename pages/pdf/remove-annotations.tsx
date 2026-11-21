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

const SUBTYPE_LABELS: Record<string, string> = {
  Text: 'Text comments',
  FreeText: 'Text boxes',
  Highlight: 'Highlights',
  Underline: 'Underlines',
  StrikeOut: 'Strikethroughs',
  Squiggly: 'Squiggly lines',
  Link: 'Links',
  Widget: 'Form widgets',
  Stamp: 'Stamps',
  Ink: 'Freehand ink',
  Line: 'Lines',
  Square: 'Rectangles',
  Circle: 'Ellipses',
  Polygon: 'Polygons',
  PolyLine: 'Polylines',
  Caret: 'Carets',
  Popup: 'Comment popups',
  FileAttachment: 'Attachments',
  Sound: 'Audio',
  Movie: 'Movies',
  Screen: 'Media screens',
  Redact: 'Redactions',
  Watermark: 'Watermarks',
  TrapNet: 'Trap networks',
  PrinterMark: 'Printer marks',
  '3D': '3D annotations',
  RichMedia: 'Rich media',
};

function subtypeLabel(subtype: string): string {
  return SUBTYPE_LABELS[subtype] ?? subtype;
}

function subtypesForPreset(preset: Exclude<PresetId, 'custom'>, summary: AnnotationSummary): Set<string> {
  const present = summary.subtypes.map((s) => s.subtype);
  if (preset === 'all') return new Set(present);
  if (preset === 'comments') return new Set(present.filter((s) => s !== 'Link' && s !== 'Widget'));
  return new Set(present.filter((s) => s === 'Link'));
}

export default function RemoveAnnotationsPage() {
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
          error: password !== undefined ? 'Incorrect password. Try again.' : null,
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
      setNotice('Please select a PDF file.');
      return;
    }
    setNotice(files.length > 1 ? 'Only the first PDF was opened. Remove annotations works on one PDF at a time.' : null);
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
      lead="Inspect every annotation subtype inside a PDF and selectively strip comments, highlights, links, or form widgets across all or chosen pages."
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
      {loading && !doc && !locked && <Progress fraction={0.4} label="Inspecting annotations…" />}

      <ToolWorkspace
        tool={REMOVE_ANNOTATIONS}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel="Select a PDF file"
        dropLabel="or drop a PDF here"
        addLabel="Replace PDF"
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
                  Select all
                </button>
                <button
                  type="button"
                  className={styles.buttonSmall}
                  onClick={() => {
                    setPreset('custom');
                    setSelectedSubtypes(new Set());
                  }}
                >
                  Select none
                </button>
              </>
            )}
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              Close
            </button>
          </>
        }
        sidebar={
          <>
            <div className={styles.levelList} role="radiogroup" aria-label="Annotation removal preset">
              <label className={[styles.level, preset === 'all' ? styles.levelSelected : ''].join(' ')}>
                <input type="radio" name="annotPreset" checked={preset === 'all'} onChange={() => applyPreset('all')} />
                <span>
                  <strong>All annotations</strong>
                  <small>Remove every annotation subtype found in the document.</small>
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
                  <strong>Comments &amp; markup only</strong>
                  <small>Strip comments, highlights, stamps and shapes while keeping links and form widgets.</small>
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
                  <strong>Links only</strong>
                  <small>Remove clickable hyperlink annotations while keeping comments and forms.</small>
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
                  <strong>Custom selection</strong>
                  <small>Toggle individual annotation subtypes in the breakdown card.</small>
                </span>
              </label>
            </div>

            <Field
              label="Page range (optional)"
              help={
                pageRange.trim()
                  ? pageRangeValidation.ok
                    ? `Applies to ${pageRangeValidation.count} of ${doc?.summary.pageCount ?? 0} page${
                        pageRangeValidation.count === 1 ? '' : 's'
                      }.`
                    : undefined
                  : 'Leave blank for all pages (e.g. 1-3, 5, 8-).'
              }
            >
              <input
                className={fieldStyles.input}
                placeholder="All pages (e.g. 1-3, 5)"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
              />
            </Field>
            {pageRangeValidation.error && <div className={styles.fileError}>{pageRangeValidation.error}</div>}

            <Checkbox
              label="Also remove empty AcroForm dictionary"
              checked={removeAcroFormIfEmpty}
              onChange={setRemoveAcroFormIfEmpty}
            />

            <Field label="File name">
              <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
            </Field>

            {doc && doc.summary.totalCount > 0 && selectedSubtypes.size === 0 && (
              <p className={styles.note}>No matching annotation subtypes selected for removal.</p>
            )}
            {notice && <p className={fieldStyles.warning}>{notice}</p>}
            {error && <div className={styles.error}>{error}</div>}

            <button type="button" className={styles.primary} disabled={!canRun} onClick={runRemove}>
              {busy
                ? 'Removing…'
                : targetedAnnotationCount > 0
                  ? `Remove ${targetedAnnotationCount} annotation${targetedAnnotationCount === 1 ? '' : 's'}`
                  : 'Remove annotations'}
            </button>

            {result && (
              <div className={styles.result}>
                <h3>Annotations updated</h3>
                <p>
                  Removed <strong>{result.removedCount}</strong> annotation{result.removedCount === 1 ? '' : 's'};{' '}
                  <strong>{result.remainingCount}</strong> remaining · {formatBytes(result.bytes.length)}.
                </p>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => download(result.bytes, outputName)}
                >
                  Download {outputName}
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
                {doc.summary.pageCount} page{doc.summary.pageCount === 1 ? '' : 's'} · {formatBytes(doc.bytes.length)}
              </span>
              <span className={doc.summary.totalCount > 0 ? styles.statusPending : styles.statusKept}>
                {doc.summary.totalCount} annotation{doc.summary.totalCount === 1 ? '' : 's'} on{' '}
                {doc.summary.pagesWithAnnotations} page{doc.summary.pagesWithAnnotations === 1 ? '' : 's'}
              </span>
              {doc.summary.hasAcroForm && (
                <span className={styles.statusLeft}>
                  AcroForm ({doc.summary.acroFormFieldCount} field{doc.summary.acroFormFieldCount === 1 ? '' : 's'})
                </span>
              )}
            </div>

            <div className={styles.metaCard}>
              <h3>Annotation breakdown</h3>
              {doc.summary.subtypes.length === 0 ? (
                <p className={styles.note}>
                  No annotations were found on any page of this PDF.
                  {doc.summary.hasAcroForm
                    ? ' An AcroForm dictionary is still present in the catalog and can be removed with the option in the sidebar.'
                    : ''}
                </p>
              ) : (
                <>
                  <p className={styles.note}>
                    Checked subtypes will be removed (along with any child comment popups tied to removed annotations).
                  </p>
                  <div className={styles.chipGrid}>
                    {doc.summary.subtypes.map(({ subtype, count }) => {
                      const checked = selectedSubtypes.has(subtype);
                      const label = subtypeLabel(subtype);
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
