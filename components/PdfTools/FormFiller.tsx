import type { PDFDocumentProxy } from 'pdfjs-dist';
import React from 'react';

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
import {
  FillFormResult,
  FormFieldInfo,
  FormFieldValue,
  FormInspection,
  FormWidgetRect,
} from '../../lib/pdf/forms';
import { consumeHandoff, handoffToFiles } from '../../lib/pdf/handoff';
import { openPdf, renderPage } from '../../lib/pdf/pdfjs';
import { FILL_FORMS } from '../../lib/pdf/tools';
import { runFillFormPdf, runInspectFormFields } from '../../lib/pdf/workerClient';
import styles from '../../styles/PdfTools.module.css';
import fieldStyles from '../../styles/Fields.module.css';
import { Checkbox, Field } from '../UI/Fields';
import { ContinueWith } from './ContinueWith';
import { PasswordPrompt } from './PasswordPrompt';
import { Progress, ToolWorkspace } from './ToolPage';

interface LoadedFormDoc {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  password?: string;
  inspection: FormInspection;
}

interface LockedFile {
  name: string;
  bytes: Uint8Array;
  error: string | null;
  busy: boolean;
}

interface PageWidgetItem {
  field: FormFieldInfo;
  widget: FormWidgetRect;
  widgetIndex: number;
}

function buildValueMap(fields: FormFieldInfo[]): Record<string, FormFieldValue> {
  const map: Record<string, FormFieldValue> = {};
  for (const field of fields) {
    if (Array.isArray(field.value)) {
      map[field.name] = [...field.value];
    } else {
      map[field.name] = field.value;
    }
  }
  return map;
}

function valuesEqual(a: FormFieldValue | undefined, b: FormFieldValue | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, idx) => item === b[idx]);
  }
  return a === b;
}

function isFieldFilled(field: FormFieldInfo, value: FormFieldValue | undefined): boolean {
  if (field.type === 'checkbox') return Boolean(value);
  if (field.type === 'optionList') return Array.isArray(value) && value.length > 0;
  return typeof value === 'string' && value.trim().length > 0;
}

function typeLabel(type: FormFieldInfo['type']): string {
  switch (type) {
    case 'text':
      return 'Text';
    case 'multiline':
      return 'Multiline';
    case 'checkbox':
      return 'Checkbox';
    case 'radio':
      return 'Radio';
    case 'dropdown':
      return 'Dropdown';
    case 'optionList':
      return 'List';
  }
}

function firstPageOfField(field: FormFieldInfo): number {
  if (field.widgets.length === 0) return -1;
  let minPage = field.widgets[0].pageIndex;
  for (let i = 1; i < field.widgets.length; i++) {
    if (field.widgets[i].pageIndex < minPage) minPage = field.widgets[i].pageIndex;
  }
  return minPage;
}

export function FormFiller() {
  const [doc, setDoc] = React.useState<LoadedFormDoc | null>(null);
  const [pdfProxy, setPdfProxy] = React.useState<PDFDocumentProxy | null>(null);
  const closeProxyRef = React.useRef<(() => Promise<void>) | null>(null);
  const [locked, setLocked] = React.useState<LockedFile | null>(null);
  const [loading, setLoading] = React.useState(false);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [stageWidth, setStageWidth] = React.useState(620);
  const [renderWidth, setRenderWidth] = React.useState(620);
  const [pageSize, setPageSize] = React.useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = React.useState(false);

  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageJump, setPageJump] = React.useState('1');

  const [initialValues, setInitialValues] = React.useState<Record<string, FormFieldValue>>({});
  const [values, setValues] = React.useState<Record<string, FormFieldValue>>({});
  const [activeField, setActiveField] = React.useState<string | null>(null);
  const [fieldFilter, setFieldFilter] = React.useState<'all' | 'page'>('all');
  const [flatten, setFlatten] = React.useState(false);
  const [fileName, setFileName] = React.useState('');

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<FillFormResult | null>(null);

  const closeCurrentProxy = React.useCallback(() => {
    const closer = closeProxyRef.current;
    closeProxyRef.current = null;
    setPdfProxy(null);
    if (closer) void closer().catch(() => undefined);
  }, []);

  React.useEffect(() => () => closeCurrentProxy(), [closeCurrentProxy]);

  React.useEffect(() => {
    setPageJump(String(pageIndex + 1));
  }, [pageIndex]);

  React.useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const style = window.getComputedStyle(el);
      const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      const inner = Math.max(180, Math.floor(el.clientWidth - padX));
      setStageWidth((prev) => (Math.abs(prev - inner) > 2 ? inner : prev));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  React.useEffect(() => {
    const t = setTimeout(() => setRenderWidth(stageWidth), 120);
    return () => clearTimeout(t);
  }, [stageWidth]);

  React.useEffect(() => {
    let cancelled = false;
    if (!pdfProxy) {
      setPageSize(null);
      setRendering(false);
      if (canvasRef.current) {
        canvasRef.current.width = 0;
        canvasRef.current.height = 0;
      }
      return;
    }

    const pageNum = Math.max(1, Math.min(pdfProxy.numPages, pageIndex + 1));
    setRendering(true);

    (async () => {
      let page: Awaited<ReturnType<PDFDocumentProxy['getPage']>> | null = null;
      let offscreen: HTMLCanvasElement | null = null;
      try {
        page = await pdfProxy.getPage(pageNum);
        if (cancelled) return;
        const baseVp = page.getViewport({ scale: 1 });
        setPageSize({ width: baseVp.width, height: baseVp.height });

        const maxCssW = Math.min(renderWidth, 820);
        const displayScale = Math.min(maxCssW / Math.max(1, baseVp.width), 2);
        const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2.5);
        offscreen = await renderPage(page, Math.max(0.25, displayScale * dpr));
        if (cancelled) return;

        const target = canvasRef.current;
        if (target) {
          target.width = offscreen.width;
          target.height = offscreen.height;
          const ctx = target.getContext('2d');
          if (ctx) ctx.drawImage(offscreen, 0, 0);
        }
      } catch {
        // Ignore transient render errors when switching documents.
      } finally {
        if (offscreen) {
          offscreen.width = 0;
          offscreen.height = 0;
        }
        try {
          page?.cleanup();
        } catch {
          // Ignore cleanup errors.
        }
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfProxy, pageIndex, renderWidth]);

  React.useEffect(() => () => {
    if (canvasRef.current) {
      canvasRef.current.width = 0;
      canvasRef.current.height = 0;
    }
  }, []);

  async function openBytes(name: string, bytes: Uint8Array, password?: string) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const [handle, inspection] = await Promise.all([
        openPdf(bytes, password),
        runInspectFormFields(bytes, password),
      ]);
      closeCurrentProxy();
      closeProxyRef.current = handle.close;
      setPdfProxy(handle.doc);
      setLocked(null);

      const initVals = buildValueMap(inspection.fields);
      setInitialValues(initVals);
      setValues(buildValueMap(inspection.fields));
      setActiveField(null);
      setFlatten(false);
      setDoc({ name, bytes, pageCount: handle.doc.numPages, password, inspection });

      const firstWithField = inspection.fields.reduce<number>((best, f) => {
        const p = firstPageOfField(f);
        if (p < 0) return best;
        return best < 0 || p < best ? p : best;
      }, -1);
      setPageIndex(firstWithField >= 0 ? firstWithField : 0);
      setFileName(`${baseName(name)}-filled`);
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
    setNotice(files.length > 1 ? 'Only the first PDF was opened. Fill PDF forms works on one file at a time.' : null);
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
    closeCurrentProxy();
    setDoc(null);
    setLocked(null);
    setInitialValues({});
    setValues({});
    setActiveField(null);
    setResult(null);
    setError(null);
    setNotice(null);
  }

  const fields = doc?.inspection.fields ?? [];
  const pageCount = doc?.pageCount ?? 0;

  const pageWidgets = React.useMemo<PageWidgetItem[]>(() => {
    const out: PageWidgetItem[] = [];
    for (const field of fields) {
      for (let wi = 0; wi < field.widgets.length; wi++) {
        const widget = field.widgets[wi];
        if (widget.pageIndex === pageIndex) {
          out.push({ field, widget, widgetIndex: wi });
        }
      }
    }
    return out;
  }, [fields, pageIndex]);

  const fieldsOnCurrentPageCount = React.useMemo(() => {
    const names = new Set<string>();
    for (const item of pageWidgets) names.add(item.field.name);
    return names.size;
  }, [pageWidgets]);

  const pagesWithFields = React.useMemo<number[]>(() => {
    const set = new Set<number>();
    for (const f of fields) {
      for (const w of f.widgets) set.add(w.pageIndex);
    }
    return Array.from(set).sort((a, b) => a - b);
  }, [fields]);

  const nextFieldPage = React.useMemo<number | null>(() => {
    if (pagesWithFields.length === 0) return null;
    if (pagesWithFields.length === 1 && pagesWithFields[0] === pageIndex) return null;
    const after = pagesWithFields.find((p) => p > pageIndex);
    return after !== undefined ? after : pagesWithFields[0];
  }, [pagesWithFields, pageIndex]);

  const modifiedCount = React.useMemo(() => {
    let count = 0;
    for (const f of fields) {
      if (!valuesEqual(values[f.name], initialValues[f.name])) count += 1;
    }
    return count;
  }, [fields, values, initialValues]);

  const filledFieldsCount = React.useMemo(() => {
    let count = 0;
    for (const f of fields) {
      if (isFieldFilled(f, values[f.name])) count += 1;
    }
    return count;
  }, [fields, values]);

  // Group fields by their primary page for the sidebar panel.
  const groupedFields = React.useMemo<Array<{ pageIndex: number; items: FormFieldInfo[] }>>(() => {
    const byPage = new Map<number, FormFieldInfo[]>();
    for (const f of fields) {
      if (fieldFilter === 'page') {
        const onPage = f.widgets.some((w) => w.pageIndex === pageIndex);
        if (!onPage) continue;
        const list = byPage.get(pageIndex) ?? [];
        list.push(f);
        byPage.set(pageIndex, list);
      } else {
        const p = firstPageOfField(f);
        const list = byPage.get(p) ?? [];
        list.push(f);
        byPage.set(p, list);
      }
    }
    return Array.from(byPage.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([pIdx, items]) => ({ pageIndex: pIdx, items }));
  }, [fields, fieldFilter, pageIndex]);

  const updateValue = React.useCallback((name: string, nextValue: FormFieldValue) => {
    setValues((prev) => ({ ...prev, [name]: nextValue }));
    setResult(null);
  }, []);

  const toggleOptionListValue = React.useCallback((field: FormFieldInfo, option: string) => {
    setValues((prev) => {
      const current = Array.isArray(prev[field.name]) ? (prev[field.name] as string[]) : [];
      if (field.multiSelect) {
        const next = current.includes(option) ? current.filter((x) => x !== option) : [...current, option];
        return { ...prev, [field.name]: next };
      }
      const next = current.includes(option) ? [] : [option];
      return { ...prev, [field.name]: next };
    });
    setResult(null);
  }, []);

  function resetChanges() {
    if (!doc) return;
    setValues(buildValueMap(doc.inspection.fields));
    setResult(null);
  }

  function clearAllFields() {
    if (!doc) return;
    setValues((prev) => {
      const next = { ...prev };
      for (const f of doc.inspection.fields) {
        if (f.readOnly) continue;
        if (f.type === 'checkbox') next[f.name] = false;
        else if (f.type === 'optionList') next[f.name] = [];
        else next[f.name] = '';
      }
      return next;
    });
    setResult(null);
  }

  function focusField(field: FormFieldInfo) {
    setActiveField(field.name);
    const p = firstPageOfField(field);
    if (p >= 0 && p !== pageIndex) {
      setPageIndex(p);
    }
  }

  function jumpToPage(raw: string) {
    setPageJump(raw);
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= pageCount) {
      setPageIndex(n - 1);
    }
  }

  const outputName = `${safeFileName(fileName, flatten ? 'filled-flat' : 'filled').replace(/\.pdf$/i, '')}.pdf`;

  async function saveForm() {
    if (!doc || fields.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await runFillFormPdf(doc.bytes, values, { flatten }, doc.password);
      setResult(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const cssDisplayW = pageSize ? Math.min(stageWidth, Math.min(pageSize.width * 2, 820)) : undefined;
  const cssDisplayH = pageSize && cssDisplayW ? (cssDisplayW / Math.max(1, pageSize.width)) * pageSize.height : undefined;
  const cssScale = pageSize && cssDisplayW ? cssDisplayW / Math.max(1, pageSize.width) : 1;

  return (
    <>
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
      {loading && !doc && !locked && <Progress fraction={0.45} label="Inspecting PDF form fields…" />}

      <ToolWorkspace
        tool={FILL_FORMS}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel="Select a PDF form"
        dropLabel="or drop a fillable PDF here"
        addLabel="Replace PDF"
        hasFiles={!!doc}
        onFiles={loadFile}
        toolbar={
          <>
            <div className={styles.canvasNav}>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              >
                &larr; Prev
              </button>
              <input
                type="number"
                className={styles.pageNavInput}
                min={1}
                max={Math.max(1, pageCount)}
                aria-label="Page number"
                value={pageJump}
                onChange={(e) => jumpToPage(e.target.value)}
                onBlur={() => setPageJump(String(pageIndex + 1))}
              />
              <span className={styles.canvasPageInfo}>/ {pageCount}</span>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={pageIndex >= pageCount - 1}
                onClick={() => setPageIndex((i) => Math.min(pageCount - 1, i + 1))}
              >
                Next &rarr;
              </button>
            </div>
            <span
              className={[
                styles.previewBadge,
                fieldsOnCurrentPageCount > 0 ? styles.previewBadgeInfo : styles.previewBadgeWarn,
              ].join(' ')}
            >
              {fieldsOnCurrentPageCount > 0
                ? `${fieldsOnCurrentPageCount} field${fieldsOnCurrentPageCount === 1 ? '' : 's'} on page`
                : 'No fields on page'}
            </span>
            {nextFieldPage !== null && (
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => setPageIndex(nextFieldPage)}
                title={`Jump to page ${nextFieldPage + 1}`}
              >
                Next field (p.{nextFieldPage + 1}) &rarr;
              </button>
            )}
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              Close
            </button>
          </>
        }
        sidebar={
          <>
            {doc && fields.length > 0 ? (
              <>
                <div className={styles.formSidebarHead}>
                  <div className={styles.compareToggle} role="tablist" aria-label="Filter form fields">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={fieldFilter === 'all'}
                      className={[
                        styles.compareToggleBtn,
                        fieldFilter === 'all' ? styles.compareToggleBtnActive : '',
                      ].join(' ')}
                      onClick={() => setFieldFilter('all')}
                    >
                      All ({fields.length})
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={fieldFilter === 'page'}
                      className={[
                        styles.compareToggleBtn,
                        fieldFilter === 'page' ? styles.compareToggleBtnActive : '',
                      ].join(' ')}
                      onClick={() => setFieldFilter('page')}
                    >
                      Page {pageIndex + 1} ({fieldsOnCurrentPageCount})
                    </button>
                  </div>
                  <span className={styles.formSidebarMeta}>
                    {filledFieldsCount}/{fields.length} filled
                  </span>
                </div>

                <div className={styles.formFieldList}>
                  {groupedFields.length === 0 ? (
                    <p className={styles.infoNote}>
                      No form fields on page {pageIndex + 1}.
                      {nextFieldPage !== null && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className={styles.formInlineLink}
                            onClick={() => setPageIndex(nextFieldPage)}
                          >
                            Jump to page {nextFieldPage + 1}
                          </button>
                        </>
                      )}
                    </p>
                  ) : (
                    groupedFields.map((group) => (
                      <div key={group.pageIndex} className={styles.formFieldGroup}>
                        {fieldFilter === 'all' && group.pageIndex >= 0 && (
                          <button
                            type="button"
                            className={styles.formGroupHeader}
                            onClick={() => setPageIndex(group.pageIndex)}
                          >
                            <span>Page {group.pageIndex + 1}</span>
                            <span>
                              {group.items.length} field{group.items.length === 1 ? '' : 's'}
                            </span>
                          </button>
                        )}
                        {group.items.map((field) => {
                          const val = values[field.name];
                          const isActive = activeField === field.name;
                          const isDirty = !valuesEqual(val, initialValues[field.name]);

                          return (
                            <div
                              key={field.name}
                              className={[
                                styles.formFieldCard,
                                isActive ? styles.formFieldCardActive : '',
                                isDirty ? styles.formFieldCardDirty : '',
                              ].join(' ')}
                              onClick={() => focusField(field)}
                            >
                              <div className={styles.formFieldCardTop}>
                                <span className={styles.formFieldLabel} title={field.label}>
                                  {field.label}
                                  {field.required && <span className={styles.formReqStar}> *</span>}
                                </span>
                                <span className={styles.formTypePill}>{typeLabel(field.type)}</span>
                              </div>
                              {field.label !== field.name && (
                                <span className={styles.formFieldSubname} title={field.name}>
                                  {field.name}
                                </span>
                              )}
                              {field.readOnly && <span className={styles.formReadOnlyTag}>Read-only</span>}

                              {field.type === 'text' && (
                                <input
                                  type="text"
                                  className={fieldStyles.input}
                                  aria-label={field.label}
                                  value={typeof val === 'string' ? val : ''}
                                  maxLength={field.maxLength}
                                  readOnly={field.readOnly}
                                  disabled={field.readOnly}
                                  placeholder="Enter text…"
                                  onFocus={() => focusField(field)}
                                  onChange={(e) => updateValue(field.name, e.target.value)}
                                />
                              )}

                              {field.type === 'multiline' && (
                                <textarea
                                  className={styles.formTextarea}
                                  rows={3}
                                  aria-label={field.label}
                                  value={typeof val === 'string' ? val : ''}
                                  maxLength={field.maxLength}
                                  readOnly={field.readOnly}
                                  disabled={field.readOnly}
                                  placeholder="Enter text…"
                                  onFocus={() => focusField(field)}
                                  onChange={(e) => updateValue(field.name, e.target.value)}
                                />
                              )}

                              {field.type === 'checkbox' && (
                                <Checkbox
                                  label={Boolean(val) ? 'Checked' : 'Unchecked'}
                                  checked={Boolean(val)}
                                  onChange={(checked) => {
                                    if (!field.readOnly) updateValue(field.name, checked);
                                  }}
                                />
                              )}

                              {field.type === 'radio' && (
                                <div className={styles.formRadioList} role="radiogroup" aria-label={field.label}>
                                  {(field.options ?? []).map((opt) => {
                                    const selected = val === opt;
                                    return (
                                      <button
                                        key={opt}
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        disabled={field.readOnly}
                                        className={[
                                          styles.presetBtn,
                                          selected ? styles.presetBtnActive : '',
                                        ].join(' ')}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          focusField(field);
                                          if (!field.readOnly) updateValue(field.name, opt);
                                        }}
                                      >
                                        {opt}
                                      </button>
                                    );
                                  })}
                                  {typeof val === 'string' && val.length > 0 && !field.readOnly && (
                                    <button
                                      type="button"
                                      className={styles.presetBtn}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateValue(field.name, '');
                                      }}
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              )}

                              {field.type === 'dropdown' && (
                                <select
                                  className={fieldStyles.input}
                                  aria-label={field.label}
                                  value={typeof val === 'string' ? val : ''}
                                  disabled={field.readOnly}
                                  onFocus={() => focusField(field)}
                                  onChange={(e) => updateValue(field.name, e.target.value)}
                                >
                                  <option value="">— Select —</option>
                                  {(field.options ?? []).map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                  {typeof val === 'string' &&
                                    val.length > 0 &&
                                    !(field.options ?? []).includes(val) && (
                                      <option value={val}>{val}</option>
                                    )}
                                </select>
                              )}

                              {field.type === 'optionList' && (
                                <div className={styles.formChecklist} role="group" aria-label={field.label}>
                                  {(field.options ?? []).map((opt) => {
                                    const picked = Array.isArray(val) && val.includes(opt);
                                    return (
                                      <label key={opt} className={styles.formChecklistRow}>
                                        <input
                                          type={field.multiSelect ? 'checkbox' : 'radio'}
                                          name={`optlist-${field.name}`}
                                          checked={picked}
                                          disabled={field.readOnly}
                                          onChange={() => {
                                            focusField(field);
                                            if (!field.readOnly) toggleOptionListValue(field, opt);
                                          }}
                                        />
                                        <span>{opt}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>

                <div className={styles.formUtilityRow}>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    disabled={modifiedCount === 0}
                    onClick={resetChanges}
                  >
                    Reset changes{modifiedCount > 0 ? ` (${modifiedCount})` : ''}
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    onClick={clearAllFields}
                  >
                    Clear all
                  </button>
                </div>

                <Checkbox
                  label="Flatten form on save (bake values into static page content)"
                  checked={flatten}
                  onChange={(checked) => {
                    setFlatten(checked);
                    setResult(null);
                  }}
                />

                <Field label="File name">
                  <input className={fieldStyles.input} value={fileName} onChange={(e) => setFileName(e.target.value)} />
                </Field>

                {notice && <p className={fieldStyles.warning}>{notice}</p>}
                {error && <div className={styles.error}>{error}</div>}

                <button
                  type="button"
                  className={styles.primary}
                  disabled={busy}
                  onClick={saveForm}
                >
                  {busy
                    ? 'Saving PDF…'
                    : flatten
                      ? 'Save flattened PDF'
                      : 'Save filled PDF'}
                </button>

                {result && (
                  <div className={styles.result}>
                    <h3>{result.flattened ? 'Form filled & flattened' : 'Form filled'}</h3>
                    <p>
                      Updated {result.filledCount} field{result.filledCount === 1 ? '' : 's'}
                      {result.flattened ? ' and flattened to static content' : ''} · {formatBytes(result.bytes.length)}.
                    </p>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => download(result.bytes, outputName)}
                    >
                      Download {outputName}
                    </button>
                    <ContinueWith
                      currentToolId={FILL_FORMS.id}
                      files={[{ name: outputName, bytes: result.bytes }]}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className={styles.infoNote}>
                This document has no interactive AcroForm fields to fill. You can open another PDF or continue with another tool.
                {doc && (
                  <div style={{ marginTop: '0.65rem' }}>
                    <ContinueWith
                      currentToolId={FILL_FORMS.id}
                      files={[{ name: doc.name, bytes: doc.bytes }]}
                    />
                  </div>
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
                {pageCount} page{pageCount === 1 ? '' : 's'} · {formatBytes(doc.bytes.length)}
              </span>
              <span
                className={[
                  styles.previewBadge,
                  fields.length > 0 ? styles.previewBadgeInfo : styles.previewBadgeWarn,
                ].join(' ')}
              >
                {fields.length} fillable field{fields.length === 1 ? '' : 's'}
                {doc.inspection.unsupportedCount > 0
                  ? ` (+${doc.inspection.unsupportedCount} button/sig)`
                  : ''}
              </span>
            </div>

            {fields.length === 0 && (
              <div className={styles.formEmptyCard}>
                <h3>No interactive AcroForm fields found</h3>
                <p>
                  This PDF appears to be flat or non-interactive — it does not contain fillable AcroForm fields
                  (text boxes, checkboxes, radio buttons, dropdowns or lists).
                  {doc.inspection.unsupportedCount > 0 &&
                    ` (${doc.inspection.unsupportedCount} non-fillable button or signature field${doc.inspection.unsupportedCount === 1 ? '' : 's'} detected.)`}
                </p>
                <ContinueWith
                  currentToolId={FILL_FORMS.id}
                  files={[{ name: doc.name, bytes: doc.bytes }]}
                />
              </div>
            )}

            <div ref={stageRef} className={styles.previewStage}>
              <div
                className={styles.formStageWrap}
                style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
              >
                <canvas
                  ref={canvasRef}
                  className={styles.previewCanvas}
                  style={cssDisplayW && cssDisplayH ? { width: `${cssDisplayW}px`, height: `${cssDisplayH}px` } : undefined}
                />

                {pageSize && cssDisplayW && cssDisplayH && pageWidgets.length > 0 && (
                  <div className={styles.formOverlayLayer}>
                    {pageWidgets.map(({ field, widget, widgetIndex }) => {
                      const val = values[field.name];
                      const isActive = activeField === field.name;
                      const isDirty = !valuesEqual(val, initialValues[field.name]);
                      const hasVal = isFieldFilled(field, val);
                      const widgetH = widget.height * cssDisplayH;
                      const singleLineFont = Math.max(9, Math.min(18, widgetH * 0.62));
                      const multiFont = Math.max(9, Math.min(14, cssScale * 11));

                      const boxStyle: React.CSSProperties = {
                        left: `${widget.left * 100}%`,
                        top: `${widget.top * 100}%`,
                        width: `${widget.width * 100}%`,
                        height: `${widget.height * 100}%`,
                      };

                      const stateClass = [
                        styles.formWidget,
                        isActive ? styles.formWidgetActive : '',
                        isDirty || hasVal ? styles.formWidgetFilled : '',
                        field.readOnly ? styles.formWidgetReadOnly : '',
                      ].join(' ');

                      if (field.type === 'text') {
                        return (
                          <input
                            key={`${field.name}-${widgetIndex}`}
                            type="text"
                            className={[stateClass, styles.formWidgetInput].join(' ')}
                            style={{ ...boxStyle, fontSize: `${singleLineFont}px` }}
                            aria-label={field.label}
                            title={field.label}
                            value={typeof val === 'string' ? val : ''}
                            maxLength={field.maxLength}
                            readOnly={field.readOnly}
                            onFocus={() => setActiveField(field.name)}
                            onChange={(e) => updateValue(field.name, e.target.value)}
                          />
                        );
                      }

                      if (field.type === 'multiline') {
                        return (
                          <textarea
                            key={`${field.name}-${widgetIndex}`}
                            className={[stateClass, styles.formWidgetTextarea].join(' ')}
                            style={{ ...boxStyle, fontSize: `${multiFont}px` }}
                            aria-label={field.label}
                            title={field.label}
                            value={typeof val === 'string' ? val : ''}
                            maxLength={field.maxLength}
                            readOnly={field.readOnly}
                            onFocus={() => setActiveField(field.name)}
                            onChange={(e) => updateValue(field.name, e.target.value)}
                          />
                        );
                      }

                      if (field.type === 'checkbox') {
                        const checked = Boolean(val);
                        return (
                          <button
                            key={`${field.name}-${widgetIndex}`}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={field.label}
                            title={field.label}
                            disabled={field.readOnly}
                            className={[
                              stateClass,
                              styles.formWidgetCheck,
                              checked ? styles.formWidgetChecked : '',
                            ].join(' ')}
                            style={boxStyle}
                            onFocus={() => setActiveField(field.name)}
                            onClick={() => {
                              setActiveField(field.name);
                              if (!field.readOnly) updateValue(field.name, !checked);
                            }}
                          >
                            {checked && (
                              <svg viewBox="0 0 16 16" className={styles.formCheckIcon} aria-hidden>
                                <path d="M3 8.5l3.2 3.2L13 4.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        );
                      }

                      if (field.type === 'radio') {
                        const optVal = widget.optionValue ?? field.options?.[widgetIndex] ?? '';
                        const selected = val === optVal && optVal.length > 0;
                        return (
                          <button
                            key={`${field.name}-${widgetIndex}`}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            aria-label={`${field.label}: ${optVal}`}
                            title={`${field.label}: ${optVal}`}
                            disabled={field.readOnly}
                            className={[
                              stateClass,
                              styles.formWidgetRadio,
                              selected ? styles.formWidgetChecked : '',
                            ].join(' ')}
                            style={boxStyle}
                            onFocus={() => setActiveField(field.name)}
                            onClick={() => {
                              setActiveField(field.name);
                              if (!field.readOnly && optVal) updateValue(field.name, optVal);
                            }}
                          >
                            {selected && <span className={styles.formRadioDot} />}
                          </button>
                        );
                      }

                      if (field.type === 'dropdown') {
                        return (
                          <select
                            key={`${field.name}-${widgetIndex}`}
                            className={[stateClass, styles.formWidgetSelect].join(' ')}
                            style={{ ...boxStyle, fontSize: `${singleLineFont}px` }}
                            aria-label={field.label}
                            title={field.label}
                            value={typeof val === 'string' ? val : ''}
                            disabled={field.readOnly}
                            onFocus={() => setActiveField(field.name)}
                            onChange={(e) => updateValue(field.name, e.target.value)}
                          >
                            <option value="">—</option>
                            {(field.options ?? []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                            {typeof val === 'string' &&
                              val.length > 0 &&
                              !(field.options ?? []).includes(val) && (
                                <option value={val}>{val}</option>
                              )}
                          </select>
                        );
                      }

                      // optionList
                      const selectedList = Array.isArray(val) ? val : [];
                      return (
                        <select
                          key={`${field.name}-${widgetIndex}`}
                          multiple={Boolean(field.multiSelect)}
                          size={Math.max(2, Math.min(6, (field.options ?? []).length))}
                          className={[stateClass, styles.formWidgetList].join(' ')}
                          style={{ ...boxStyle, fontSize: `${multiFont}px` }}
                          aria-label={field.label}
                          title={field.label}
                          value={field.multiSelect ? selectedList : (selectedList[0] ?? '')}
                          disabled={field.readOnly}
                          onFocus={() => setActiveField(field.name)}
                          onChange={(e) => {
                            const picked = Array.from(e.target.selectedOptions).map((o) => o.value);
                            updateValue(field.name, picked);
                          }}
                        >
                          {(field.options ?? []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      );
                    })}
                  </div>
                )}

                {rendering && <div className={styles.figureLoading}>Rendering page…</div>}
              </div>
            </div>
          </>
        )}
      </ToolWorkspace>
    </>
  );
}
