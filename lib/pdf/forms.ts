// Framework-free AcroForm inspection and filling engine built on @cantoo/pdf-lib.
import {
  PDFArray,
  PDFCheckBox,
  PDFContext,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFField,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  PDFRef,
  PDFStream,
  PDFString,
  PDFTextField,
  StandardFonts,
} from '@cantoo/pdf-lib';

import { N, removeUnusedObjects } from './objects';

export type FormFieldType = 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown' | 'optionList';

export type FormFieldValue = string | boolean | string[];

/** Normalized visual rectangle in 0..1 fractions of the visually rotated page, origin at visual top-left. */
export interface FormWidgetRect {
  pageIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Option value represented by this widget (populated for radio buttons). */
  optionValue?: string;
}

export interface FormFieldInfo {
  name: string;
  label: string;
  type: FormFieldType;
  readOnly: boolean;
  required: boolean;
  maxLength?: number;
  options?: string[];
  multiSelect?: boolean;
  value: FormFieldValue;
  widgets: FormWidgetRect[];
}

export interface FormInspection {
  pageCount: number;
  fields: FormFieldInfo[];
  unsupportedCount: number;
}

export interface FillFormOptions {
  /** Bake all filled fields into static page content and remove /AcroForm. Default false. */
  flatten?: boolean;
}

export interface FillFormResult {
  bytes: Uint8Array;
  filledCount: number;
  flattened: boolean;
}

interface PageVisualGeometry {
  crop: [number, number, number, number];
  rotation: number;
}

function normalizeRotation(angle: number): number {
  return ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
}

function normalizeBox(box: { x: number; y: number; width: number; height: number }): [number, number, number, number] {
  const x0 = Math.min(box.x, box.x + box.width);
  const y0 = Math.min(box.y, box.y + box.height);
  const x1 = Math.max(box.x, box.x + box.width);
  const y1 = Math.max(box.y, box.y + box.height);
  return [x0, y0, x1, y1];
}

function getPageVisualGeometry(page: PDFPage): PageVisualGeometry {
  const media = normalizeBox(page.getMediaBox());
  const rawCrop = normalizeBox(page.getCropBox());

  const vx0 = Math.max(media[0], rawCrop[0]);
  const vy0 = Math.max(media[1], rawCrop[1]);
  const vx1 = Math.min(media[2], rawCrop[2]);
  const vy1 = Math.min(media[3], rawCrop[3]);

  const crop: [number, number, number, number] = vx1 > vx0 && vy1 > vy0 ? [vx0, vy0, vx1, vy1] : media;
  const rotation = normalizeRotation(page.getRotation().angle);
  return { crop, rotation };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Maps a raw PDF user-space widget rectangle [px0, py0, px1, py1] into normalized visual viewport
 * coordinates { left, top, width, height } in 0..1 accounting for /CropBox and /Rotate (0, 90, 180, 270).
 */
function pdfRectToNormalizedVisual(
  rect: [number, number, number, number],
  crop: [number, number, number, number],
  rotation: number,
): { left: number; top: number; width: number; height: number } | null {
  const [vx0, vy0, vx1, vy1] = crop;
  const rawW = vx1 - vx0;
  const rawH = vy1 - vy0;
  if (rawW <= 0 || rawH <= 0) return null;

  const px0 = Math.min(rect[0], rect[2]);
  const py0 = Math.min(rect[1], rect[3]);
  const px1 = Math.max(rect[0], rect[2]);
  const py1 = Math.max(rect[1], rect[3]);
  if (px1 <= px0 || py1 <= py0) return null;

  let vLeft: number;
  let vRight: number;
  let vTop: number;
  let vBottom: number;

  if (rotation === 90) {
    vLeft = (py0 - vy0) / rawH;
    vRight = (py1 - vy0) / rawH;
    vTop = (px0 - vx0) / rawW;
    vBottom = (px1 - vx0) / rawW;
  } else if (rotation === 180) {
    vLeft = (vx1 - px1) / rawW;
    vRight = (vx1 - px0) / rawW;
    vTop = (py0 - vy0) / rawH;
    vBottom = (py1 - vy0) / rawH;
  } else if (rotation === 270) {
    vLeft = (vy1 - py1) / rawH;
    vRight = (vy1 - py0) / rawH;
    vTop = (vx1 - px1) / rawW;
    vBottom = (vx1 - px0) / rawW;
  } else {
    vLeft = (px0 - vx0) / rawW;
    vRight = (px1 - vx0) / rawW;
    vTop = (vy1 - py1) / rawH;
    vBottom = (vy1 - py0) / rawH;
  }

  const left = clamp01(Math.min(vLeft, vRight));
  const right = clamp01(Math.max(vLeft, vRight));
  const top = clamp01(Math.min(vTop, vBottom));
  const bottom = clamp01(Math.max(vTop, vBottom));
  const width = right - left;
  const height = bottom - top;
  if (width <= 1e-6 || height <= 1e-6) return null;

  return { left, top, width, height };
}

function readTooltipLabel(field: PDFField, fallbackName: string): string {
  const tu = field.acroField.dict.lookup(N('TU')) ?? field.acroField.getInheritableAttribute(N('TU'));
  if (tu instanceof PDFString || tu instanceof PDFHexString) {
    const decoded = tu.decodeText().trim();
    if (decoded.length > 0) return decoded;
  }
  return fallbackName;
}

function readWidgetOnValueFromAp(widgetDict: PDFDict): string | undefined {
  const ap = widgetDict.lookup(N('AP'));
  if (!(ap instanceof PDFDict)) return undefined;
  const apN = ap.lookup(N('N'));
  if (!(apN instanceof PDFDict)) return undefined;
  for (const key of apN.keys()) {
    const decoded = key.decodeText();
    if (decoded !== 'Off') return decoded;
  }
  return undefined;
}

function safeReadTextFieldValue(field: PDFTextField): string {
  try {
    return field.getText() ?? '';
  } catch {
    const v = field.acroField.V();
    if (v instanceof PDFString || v instanceof PDFHexString) {
      return v.decodeText();
    }
    return '';
  }
}

function safeReadCheckBoxValue(field: PDFCheckBox): boolean {
  try {
    return field.isChecked();
  } catch {
    return false;
  }
}

function getPageContentRefs(ctx: PDFContext, page: PDFPage): PDFRef[] {
  const raw = page.node.get(N('Contents'));
  if (!raw) return [];
  if (raw instanceof PDFRef) {
    const target = ctx.lookup(raw);
    if (target instanceof PDFArray) {
      return target.asArray().filter((x): x is PDFRef => x instanceof PDFRef);
    }
    if (target instanceof PDFStream) return [raw];
    return [];
  }
  if (raw instanceof PDFArray) {
    return raw.asArray().map((item) => (item instanceof PDFRef ? item : ctx.register(item)));
  }
  if (raw instanceof PDFStream) {
    return [ctx.register(raw)];
  }
  return [];
}

function wrapPageContentsInGraphicsState(ctx: PDFContext, pages: PDFPage[]) {
  for (const page of pages) {
    const refs = getPageContentRefs(ctx, page);
    if (refs.length > 0) {
      page.node.set(
        N('Contents'),
        ctx.obj([
          ctx.getPushGraphicsStateContentStream(),
          ...refs,
          ctx.getPopGraphicsStateContentStream(),
        ]),
      );
    }
  }
}

/**
 * Inspects all interactive AcroForm fields in a PDF and maps every visible widget onto its
 * page's normalized visual viewport rectangle (accounting for /CropBox and /Rotate).
 */
export async function inspectFormFields(bytes: Uint8Array, password?: string): Promise<FormInspection> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const pages = doc.getPages();
  const pageCount = pages.length;

  if (!doc.catalog.AcroForm()) {
    return { pageCount, fields: [], unsupportedCount: 0 };
  }

  const ctx = doc.context;
  const pageRefToIndex = new Map<string, number>();
  const annotRefToPageIndex = new Map<string, number>();
  const annotDictToPageIndex = new Map<PDFDict, number>();
  const pageGeoms: PageVisualGeometry[] = [];

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    pageRefToIndex.set(page.ref.toString(), i);
    pageGeoms.push(getPageVisualGeometry(page));

    const annots = page.node.Annots();
    if (!annots) continue;
    for (const item of annots.asArray()) {
      if (item instanceof PDFRef) {
        annotRefToPageIndex.set(item.toString(), i);
      }
      const looked = ctx.lookup(item);
      if (looked instanceof PDFDict) {
        annotDictToPageIndex.set(looked, i);
      }
    }
  }

  const form = doc.getForm();
  const pdfFields = form.getFields();
  const fields: FormFieldInfo[] = [];
  let unsupportedCount = 0;

  for (const field of pdfFields) {
    let type: FormFieldType;
    let value: FormFieldValue;
    let maxLength: number | undefined;
    let options: string[] | undefined;
    let multiSelect: boolean | undefined;
    let radioExportValues: string[] | undefined;

    if (field instanceof PDFTextField) {
      type = field.isMultiline() ? 'multiline' : 'text';
      value = safeReadTextFieldValue(field);
      maxLength = field.getMaxLength();
    } else if (field instanceof PDFCheckBox) {
      type = 'checkbox';
      value = safeReadCheckBoxValue(field);
    } else if (field instanceof PDFRadioGroup) {
      type = 'radio';
      options = field.getOptions();
      value = field.getSelected() ?? '';
      const rawExports = field.acroField.getExportValues();
      if (rawExports && rawExports.length > 0) {
        radioExportValues = rawExports.map((e) => e.decodeText());
      }
    } else if (field instanceof PDFDropdown) {
      type = 'dropdown';
      options = field.getOptions();
      value = field.getSelected()[0] ?? '';
    } else if (field instanceof PDFOptionList) {
      type = 'optionList';
      options = field.getOptions();
      multiSelect = field.isMultiselect();
      value = field.getSelected();
    } else {
      unsupportedCount += 1;
      continue;
    }

    const name = field.getName();
    const label = readTooltipLabel(field, name);
    const readOnly = field.isReadOnly();
    const required = field.isRequired();

    const acroWidgets = field.acroField.getWidgets();
    const widgets: FormWidgetRect[] = [];

    for (let wi = 0; wi < acroWidgets.length; wi++) {
      const widget = acroWidgets[wi];
      // Skip explicitly hidden (bit 2 = 2) widgets so invisible helper widgets don't clutter the page.
      if ((widget.getFlags() & 2) !== 0) continue;

      let pageIndex: number | undefined;
      const pRef = widget.P();
      if (pRef instanceof PDFRef) {
        pageIndex = pageRefToIndex.get(pRef.toString());
      }
      if (pageIndex === undefined) {
        pageIndex = annotDictToPageIndex.get(widget.dict);
      }
      if (pageIndex === undefined) {
        pageIndex = annotDictToPageIndex.get(field.acroField.dict) ?? annotRefToPageIndex.get(field.ref.toString());
      }
      if (pageIndex === undefined || pageIndex < 0 || pageIndex >= pageGeoms.length) continue;

      const rawRect = widget.getRectangle();
      const geom = pageGeoms[pageIndex];
      const norm = pdfRectToNormalizedVisual(
        [rawRect.x, rawRect.y, rawRect.x + rawRect.width, rawRect.y + rawRect.height],
        geom.crop,
        geom.rotation,
      );
      if (!norm) continue;

      let optionValue: string | undefined;
      if (type === 'radio') {
        const apOn = readWidgetOnValueFromAp(widget.dict) ?? widget.getOnValue()?.decodeText();
        if (radioExportValues && wi < radioExportValues.length) {
          optionValue = radioExportValues[wi];
        } else if (apOn && apOn !== 'Off') {
          optionValue = apOn;
        } else if (options && wi < options.length) {
          optionValue = options[wi];
        }
      }

      widgets.push({
        pageIndex,
        left: norm.left,
        top: norm.top,
        width: norm.width,
        height: norm.height,
        ...(optionValue !== undefined ? { optionValue } : {}),
      });
    }

    fields.push({
      name,
      label,
      type,
      readOnly,
      required,
      ...(maxLength !== undefined ? { maxLength } : {}),
      ...(options !== undefined ? { options } : {}),
      ...(multiSelect !== undefined ? { multiSelect } : {}),
      value,
      widgets,
    });
  }

  return { pageCount, fields, unsupportedCount };
}

/**
 * Writes form values back into interactive AcroForm fields, refreshes appearance streams,
 * and optionally flattens the form into static page content.
 */
export async function fillFormPdf(
  bytes: Uint8Array,
  values: Record<string, FormFieldValue>,
  options: FillFormOptions = {},
  password?: string,
): Promise<FillFormResult> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, password });
  const wasEncrypted = Boolean(
    doc.context.trailerInfo.Encrypt ||
      doc.context.security ||
      (doc.context as { isDecrypted?: boolean }).isDecrypted,
  );

  if (!doc.catalog.AcroForm()) {
    if (wasEncrypted) removeUnusedObjects(doc.context);
    const outBytes = await doc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    });
    return { bytes: outBytes, filledCount: 0, flattened: false };
  }

  const form = doc.getForm();
  let filledCount = 0;

  for (const field of form.getFields()) {
    const name = field.getName();
    if (!Object.prototype.hasOwnProperty.call(values, name)) continue;
    if (field.isReadOnly()) continue;

    const val = values[name];

    if (field instanceof PDFTextField) {
      let textVal = typeof val === 'string' ? val : Array.isArray(val) ? val.join(', ') : val ? 'Yes' : '';
      const maxLen = field.getMaxLength();
      if (maxLen !== undefined && maxLen >= 0 && textVal.length > maxLen) {
        textVal = textVal.slice(0, maxLen);
      }
      field.setText(textVal);
      filledCount += 1;
    } else if (field instanceof PDFCheckBox) {
      const checked =
        typeof val === 'boolean'
          ? val
          : typeof val === 'string'
            ? val !== '' && val.toLowerCase() !== 'false' && val !== 'Off'
            : Boolean(val);
      if (checked) {
        field.check();
      } else {
        field.uncheck();
      }
      filledCount += 1;
    } else if (field instanceof PDFRadioGroup) {
      const choice = typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? '') : '';
      if (!choice) {
        field.clear();
        filledCount += 1;
      } else if (field.getOptions().includes(choice)) {
        field.select(choice);
        filledCount += 1;
      }
    } else if (field instanceof PDFDropdown) {
      const choice = typeof val === 'string' ? val : Array.isArray(val) ? (val[0] ?? '') : '';
      if (!choice) {
        field.clear();
      } else {
        field.select(choice);
      }
      filledCount += 1;
    } else if (field instanceof PDFOptionList) {
      const rawList = Array.isArray(val)
        ? val.filter((item): item is string => typeof item === 'string')
        : typeof val === 'string' && val
          ? [val]
          : [];
      const validOptions = new Set(field.getOptions());
      const picked = rawList.filter((item) => validOptions.has(item));
      if (picked.length === 0) {
        field.clear();
      } else if (field.isMultiselect()) {
        field.select(picked);
      } else {
        field.select(picked[0]);
      }
      filledCount += 1;
    }
  }

  // Refresh appearances; gracefully fall back to embedded Helvetica if font/encoding issues occur.
  try {
    form.updateFieldAppearances();
  } catch {
    try {
      const fallbackFont = await doc.embedFont(StandardFonts.Helvetica);
      form.updateFieldAppearances(fallbackFont);
    } catch {
      // Preserve existing appearances if a field contains characters outside WinAnsi encoding.
    }
  }

  let flattened = false;
  if (options.flatten) {
    wrapPageContentsInGraphicsState(doc.context, doc.getPages());
    try {
      form.flatten({ updateFieldAppearances: false });
    } catch {
      try {
        form.flatten({ updateFieldAppearances: true });
      } catch {
        // Ignore individual malformed widget errors during flatten.
      }
    }
    doc.catalog.delete(N('AcroForm'));
    flattened = true;
  }

  if (wasEncrypted || flattened) {
    removeUnusedObjects(doc.context);
  }

  const outBytes = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
    updateFieldAppearances: false,
  });

  return { bytes: outBytes, filledCount, flattened };
}
