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
import { useI18n } from '../../lib/ui/i18n';
import type { TranslationKey } from '../../lib/ui/translations';
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

const TYPE_LABEL_KEYS: Record<FormFieldInfo['type'], TranslationKey> = {
  text: 'pdf.ff.typeText',
  multiline: 'pdf.ff.typeMultiline',
  checkbox: 'pdf.ff.typeCheckbox',
  radio: 'pdf.ff.typeRadio',
  dropdown: 'pdf.ff.typeDropdown',
  optionList: 'pdf.ff.typeList',
};

function firstPageOfField(field: FormFieldInfo): number {
  if (field.widgets.length === 0) return -1;
  let minPage = field.widgets[0].pageIndex;
  for (let i = 1; i < field.widgets.length; i++) {
    if (field.widgets[i].pageIndex < minPage) minPage = field.widgets[i].pageIndex;
  }
  return minPage;
}

export function FormFiller() {
  const { t } = useI18n();
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
    setNotice(files.length > 1 ? t('pdf.ff.firstOnly') : null);
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
      {loading && !doc && !locked && <Progress fraction={0.45} label={t('pdf.ff.inspecting')} />}

      <ToolWorkspace
        tool={FILL_FORMS}
        accept="application/pdf,.pdf"
        multiple={false}
        selectLabel={t('pdf.ff.selectLabel')}
        dropLabel={t('pdf.ff.dropLabel')}
        addLabel={t('pdf.ff.addLabel')}
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
                {t('pdf.vec.prev')}
              </button>
              <input
                type="number"
                className={styles.pageNavInput}
                min={1}
                max={Math.max(1, pageCount)}
                aria-label={t('pdf.ff.pageNumAria')}
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
                {t('pdf.vec.next')}
              </button>
            </div>
            <span
              className={[
                styles.previewBadge,
                fieldsOnCurrentPageCount > 0 ? styles.previewBadgeInfo : styles.previewBadgeWarn,
              ].join(' ')}
            >
              {fieldsOnCurrentPageCount === 1
                ? t('pdf.ff.fieldsOnPageOne')
                : fieldsOnCurrentPageCount > 1
                  ? t('pdf.ff.fieldsOnPageMany', { count: fieldsOnCurrentPageCount })
                  : t('pdf.ff.noFieldsOnPage')}
            </span>
            {nextFieldPage !== null && (
              <button
                type="button"
                className={styles.buttonSmall}
                onClick={() => setPageIndex(nextFieldPage)}
                title={t('pdf.ff.jumpToPage', { n: nextFieldPage + 1 })}
              >
                {t('pdf.ff.nextFieldBtn', { n: nextFieldPage + 1 })}
              </button>
            )}
            <button type="button" className={styles.buttonSmall} onClick={clearDoc}>
              {t('pdf.ff.close')}
            </button>
          </>
        }
        sidebar={
          <>
            {doc && fields.length > 0 ? (
              <>
                <div className={styles.formSidebarHead}>
                  <div className={styles.compareToggle} role="tablist" aria-label={t('pdf.ff.filterAria')}>
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
                      {t('pdf.ff.allCount', { count: fields.length })}
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
                      {t('pdf.ff.pageCount', { n: pageIndex + 1, count: fieldsOnCurrentPageCount })}
                    </button>
                  </div>
                  <span className={styles.formSidebarMeta}>
                    {t('pdf.ff.filledMeta', { filled: filledFieldsCount, total: fields.length })}
                  </span>
                </div>

                <div className={styles.formFieldList}>
                  {groupedFields.length === 0 ? (
                    <p className={styles.infoNote}>
                      {t('pdf.ff.noFieldsOnPageN', { n: pageIndex + 1 })}
                      {nextFieldPage !== null && (
                        <>
                          {' '}
                          <button
                            type="button"
                            className={styles.formInlineLink}
                            onClick={() => setPageIndex(nextFieldPage)}
                          >
                            {t('pdf.ff.jumpToPage', { n: nextFieldPage + 1 })}
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
                            <span>{t('pdf.ff.pageN', { n: group.pageIndex + 1 })}</span>
                            <span>
                              {group.items.length === 1
                                ? t('pdf.ff.fieldCountOne')
                                : t('pdf.ff.fieldCountMany', { count: group.items.length })}
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
                                <span className={styles.formTypePill}>{t(TYPE_LABEL_KEYS[field.type])}</span>
                              </div>
                              {field.label !== field.name && (
                                <span className={styles.formFieldSubname} title={field.name}>
                                  {field.name}
                                </span>
                              )}
                              {field.readOnly && <span className={styles.formReadOnlyTag}>{t('pdf.ff.readOnly')}</span>}

                              {field.type === 'text' && (
                                <input
                                  type="text"
                                  className={fieldStyles.input}
                                  aria-label={field.label}
                                  value={typeof val === 'string' ? val : ''}
                                  maxLength={field.maxLength}
                                  readOnly={field.readOnly}
                                  disabled={field.readOnly}
                                  placeholder={t('pdf.ff.enterText')}
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
                                  placeholder={t('pdf.ff.enterText')}
                                  onFocus={() => focusField(field)}
                                  onChange={(e) => updateValue(field.name, e.target.value)}
                                />
                              )}

                              {field.type === 'checkbox' && (
                                <Checkbox
                                  label={Boolean(val) ? t('pdf.ff.checked') : t('pdf.ff.unchecked')}
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
                                      {t('pdf.ff.clear')}
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
                                  <option value="">{t('pdf.ff.selectOpt')}</option>
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
                    {modifiedCount > 0 ? t('pdf.ff.resetChangesCount', { count: modifiedCount }) : t('pdf.ff.resetChanges')}
                  </button>
                  <button
                    type="button"
                    className={styles.buttonSmall}
                    onClick={clearAllFields}
                  >
                    {t('pdf.ff.clearAll')}
                  </button>
                </div>

                <Checkbox
                  label={t('pdf.ff.flattenLabel')}
                  checked={flatten}
                  onChange={(checked) => {
                    setFlatten(checked);
                    setResult(null);
                  }}
                />

                <Field label={t('pdf.ff.fileName')}>
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
                  {busy ? t('pdf.ff.saving') : flatten ? t('pdf.ff.saveFlat') : t('pdf.ff.saveFilled')}
                </button>

                {result && (
                  <div className={styles.result}>
                    <h3>{result.flattened ? t('pdf.ff.resFlatTitle') : t('pdf.ff.resTitle')}</h3>
                    <p>
                      {result.flattened
                        ? result.filledCount === 1
                          ? t('pdf.ff.resUpdatedFlatOne', { size: formatBytes(result.bytes.length) })
                          : t('pdf.ff.resUpdatedFlatMany', { count: result.filledCount, size: formatBytes(result.bytes.length) })
                        : result.filledCount === 1
                          ? t('pdf.ff.resUpdatedOne', { size: formatBytes(result.bytes.length) })
                          : t('pdf.ff.resUpdatedMany', { count: result.filledCount, size: formatBytes(result.bytes.length) })}
                    </p>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => download(result.bytes, outputName)}
                    >
                      {t('pdf.ff.downloadNamed', { name: outputName })}
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
                {t('pdf.ff.noAcroSidebar')}
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
                {pageCount === 1 ? t('pdf.ff.pagesOne') : t('pdf.ff.pagesMany', { count: pageCount })} · {formatBytes(doc.bytes.length)}
              </span>
              <span
                className={[
                  styles.previewBadge,
                  fields.length > 0 ? styles.previewBadgeInfo : styles.previewBadgeWarn,
                ].join(' ')}
              >
                {fields.length === 1 ? t('pdf.ff.fillableOne') : t('pdf.ff.fillableMany', { count: fields.length })}
                {doc.inspection.unsupportedCount > 0
                  ? t('pdf.ff.unsupportedBadge', { count: doc.inspection.unsupportedCount })
                  : ''}
              </span>
            </div>

            {fields.length === 0 && (
              <div className={styles.formEmptyCard}>
                <h3>{t('pdf.ff.noAcroTitle')}</h3>
                <p>
                  {t('pdf.ff.noAcroBody')}
                  {doc.inspection.unsupportedCount > 0 &&
                    (doc.inspection.unsupportedCount === 1
                      ? t('pdf.ff.noAcroUnsupportedOne')
                      : t('pdf.ff.noAcroUnsupportedMany', { count: doc.inspection.unsupportedCount }))}
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

                {rendering && <div className={styles.figureLoading}>{t('pdf.canvas.renderingPage')}</div>}
              </div>
            </div>
          </>
        )}
      </ToolWorkspace>
    </>
  );
}
