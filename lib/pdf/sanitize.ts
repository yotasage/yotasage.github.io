// Finds and removes metadata and hidden data that can identify the author or the history of a PDF.
import {
  decodePDFRawStream, PDFArray, PDFCheckBox, PDFDict, PDFDocument, PDFDropdown, PDFHexString, PDFObject, PDFOptionList, PDFRadioGroup, PDFRawStream,
  PDFStream, PDFTextField,
} from '@cantoo/pdf-lib';

import { jpegMetadata, stripJpegMetadata } from './jpeg';
import { filterNames, N, nameOf, removeUnusedObjects, text, unusedObjects, walkDicts } from './objects';

export type CleanOption =
  | 'info' | 'xmp' | 'id' | 'imageMeta' | 'annotationAuthors' | 'signatures' | 'thumbnails' | 'privateData' | 'javascript'
  | 'attachments' | 'comments' | 'formData';

export type CleanOptions = Record<CleanOption, boolean>;

export const CLEAN_OPTIONS: { id: CleanOption; label: string; help: string; changesContent?: boolean }[] = [
  { id: 'info', label: 'Document properties', help: 'Title, author, subject, keywords, creator application, producer, dates and custom fields.' },
  { id: 'xmp', label: 'XMP metadata', help: 'Embedded XML metadata of the document, pages, images and fonts, often with names, software and edit history.' },
  { id: 'id', label: 'Document ID', help: 'Replaced by a random ID, so copies cannot be linked to the original file.' },
  { id: 'imageMeta', label: 'Photo metadata', help: 'EXIF (camera, serial number, GPS position, dates), XMP, IPTC and comments inside JPEG images. The pixels are not changed.' },
  { id: 'annotationAuthors', label: 'Comment authors and dates', help: 'Names and timestamps on comments and markup. The comments themselves are kept.' },
  { id: 'signatures', label: 'Digital signatures', help: 'Signer name, certificate, reason and location. A signature is invalid after any change anyway; its visible stamp is kept.' },
  { id: 'thumbnails', label: 'Embedded page thumbnails', help: 'Small page previews stored in the file, which can show an older version of a page.' },
  { id: 'privateData', label: 'Application private data', help: 'Editing data stored by applications such as Illustrator (PieceInfo), web capture information and modification stamps.' },
  { id: 'javascript', label: 'JavaScript and automatic actions', help: 'Scripts, actions run on open, print or close, launching programs and sending form data to a server.' },
  { id: 'attachments', label: 'Attached files', help: 'Files embedded in the PDF, for example source spreadsheets.', changesContent: true },
  { id: 'comments', label: 'Comments and markup', help: 'Notes, highlights, drawings and stamps added as annotations. Links and form fields are kept.', changesContent: true },
  { id: 'formData', label: 'Form field values', help: 'Clears text typed into form fields, ticked boxes and selections.', changesContent: true },
];

const ALL = CLEAN_OPTIONS.map((o) => o.id);
const options = (ids: CleanOption[]): CleanOptions => Object.fromEntries(ALL.map((id) => [id, ids.includes(id)])) as CleanOptions;

export const PRESETS: { id: string; title: string; text: string; options: CleanOptions }[] = [
  {
    id: 'metadata',
    title: 'Metadata only',
    text: 'Document properties, XMP metadata and the document ID.',
    options: options(['info', 'xmp', 'id']),
  },
  {
    id: 'anonymize',
    title: 'Anonymize',
    text: 'Everything that can identify the author or the file\'s history, without changing the visible text, images or comments. Attached files are listed but kept.',
    options: options(['info', 'xmp', 'id', 'imageMeta', 'annotationAuthors', 'signatures', 'thumbnails', 'privateData', 'javascript']),
  },
  {
    id: 'maximum',
    title: 'Maximum',
    text: 'Anonymize, and also remove attachments, comments and form field values.',
    options: options(ALL),
  },
];

export type FindingId = CleanOption | 'history';

export interface Finding {
  id: FindingId;
  label: string;
  details: string[];
}

const LABELS: Record<FindingId, string> = {
  ...(Object.fromEntries(CLEAN_OPTIONS.map((o) => [o.id, o.label])) as Record<CleanOption, string>),
  history: 'Earlier revisions and unused objects',
};

const MARKUP = new Set([
  'Text', 'FreeText', 'Line', 'Square', 'Circle', 'Polygon', 'PolyLine', 'Highlight', 'Underline', 'Squiggly', 'StrikeOut',
  'Stamp', 'Caret', 'Ink', 'Popup', 'FileAttachment', 'Sound', 'Redact',
]);

// Actions that run code, start programs or send data.
const RISKY_ACTIONS = new Set(['JavaScript', 'Launch', 'SubmitForm', 'ImportData', 'Rendition', 'RichMediaExecute']);

function isRiskyAction(obj: PDFObject | undefined): boolean {
  return obj instanceof PDFDict && RISKY_ACTIONS.has(nameOf(obj, 'S') ?? '');
}

function lookup(dict: PDFDict, key: string): PDFObject | undefined {
  return dict.lookup(N(key));
}

function annotations(doc: PDFDocument): { page: number; annot: PDFDict }[] {
  const out: { page: number; annot: PDFDict }[] = [];
  doc.getPages().forEach((page, i) => {
    const annots = page.node.Annots();
    for (const a of annots?.asArray() ?? []) {
      const annot = doc.context.lookup(a);
      if (annot instanceof PDFDict) out.push({ page: i + 1, annot });
    }
  });
  return out;
}

interface FieldInfo {
  name: string;
  type: string;
  dict: PDFDict;
}

// Every terminal form field with its full name and (inherited) type.
function formFields(doc: PDFDocument): FieldInfo[] {
  const acro = doc.catalog.AcroForm();
  const out: FieldInfo[] = [];
  const visit = (obj: PDFObject, parentName: string, parentType: string, depth: number) => {
    const dict = doc.context.lookup(obj);
    if (!(dict instanceof PDFDict) || depth > 50) return;
    const partial = text(lookup(dict, 'T'));
    const name = partial ? (parentName ? `${parentName}.${partial}` : partial) : parentName;
    const type = nameOf(dict, 'FT') ?? parentType;
    const kids = lookup(dict, 'Kids');
    const fieldKids = kids instanceof PDFArray ? kids.asArray().filter((k) => {
      const kid = doc.context.lookup(k);
      return kid instanceof PDFDict && kid.has(N('T'));
    }) : [];
    if (fieldKids.length) fieldKids.forEach((k) => visit(k, name, type, depth + 1));
    else out.push({ name, type, dict });
  };
  const fields = acro && lookup(acro, 'Fields');
  if (fields instanceof PDFArray) fields.asArray().forEach((f) => visit(f, '', '', 0));
  return out;
}

function hasValue(v: PDFObject | undefined): boolean {
  if (v === undefined) return false;
  const s = text(v);
  return s !== '' && s !== 'Off';
}

// Readable key/value lines from an XMP packet.
function describeXmp(xml: string): string[] {
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(xml.replace(/^[^<]*/, ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const lines = new Set<string>();
  const containers = new Set(['rdf:Seq', 'rdf:Bag', 'rdf:Alt', 'rdf:li', 'rdf:RDF', 'rdf:Description', 'x:xmpmeta']);
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (el.tagName === 'rdf:Description') {
      for (const attr of Array.from(el.attributes)) {
        if (!attr.name.startsWith('xmlns') && !attr.name.startsWith('rdf:') && attr.value.trim()) lines.add(`${attr.name}: ${attr.value.trim()}`);
      }
    }
    if (el.children.length || !el.textContent?.trim()) continue;
    let owner: Element | null = el;
    while (owner && containers.has(owner.tagName)) owner = owner.parentElement;
    if (owner) lines.add(`${owner.tagName}: ${el.textContent.trim().slice(0, 200)}`);
  }
  return [...lines];
}

function countOf(items: string[]): string[] {
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i, (counts.get(i) ?? 0) + 1);
  return [...counts].map(([k, n]) => (n > 1 ? `${k} × ${n}` : k));
}

function countEof(bytes: Uint8Array): number {
  let n = 0;
  for (let i = 0; i + 4 < bytes.length; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x25 && bytes[i + 2] === 0x45 && bytes[i + 3] === 0x4f && bytes[i + 4] === 0x46) n++;
  }
  return n;
}

function inspectDoc(doc: PDFDocument, bytes: Uint8Array): Finding[] {
  const ctx = doc.context;
  const found: Record<FindingId, string[]> = Object.fromEntries([...ALL, 'history'].map((id) => [id, []])) as Record<FindingId, string[]>;

  const info = ctx.lookup(ctx.trailerInfo.Info);
  if (info instanceof PDFDict) {
    for (const [key, value] of info.entries()) {
      const v = text(ctx.lookup(value));
      if (v) found.info.push(`${key.decodeText()}: ${v}`);
    }
  }

  const ids = ctx.lookup(ctx.trailerInfo.ID);
  if (ids instanceof PDFArray && ids.size() > 0) {
    const first = ids.lookup(0);
    found.id.push(first instanceof PDFHexString ? first.asString() : text(first));
  }

  const metadata = new Set<PDFStream>();
  const images: string[] = [];
  const signatures: string[] = [];
  const attachments: string[] = [];
  let thumbs = 0;
  let pieceInfo: string[] = [];
  let lastModified = 0;
  let additionalActions = 0;
  const actions: string[] = [];
  let linearized = false;

  walkDicts(ctx, (dict, stream) => {
    const md = lookup(dict, 'Metadata');
    if (md instanceof PDFStream) metadata.add(md);
    if (dict.has(N('Linearized'))) linearized = true;
    if (dict.has(N('Thumb'))) thumbs++;
    if (dict.has(N('LastModified'))) lastModified++;
    if (dict.has(N('AA'))) additionalActions++;
    const pi = lookup(dict, 'PieceInfo');
    if (pi instanceof PDFDict) pieceInfo.push(...pi.keys().map((k) => k.decodeText()));
    if (dict.has(N('SpiderInfo'))) pieceInfo.push('Web capture');
    const s = nameOf(dict, 'S');
    if (s && RISKY_ACTIONS.has(s)) {
      const target = lookup(dict, 'F');
      const where = target instanceof PDFDict ? text(lookup(target, 'F')) : text(target);
      actions.push(s === 'JavaScript' ? 'JavaScript' : `${s}${where ? ` (${where})` : ''}`);
    }
    if (nameOf(dict, 'Type') === 'Sig' || (dict.has(N('ByteRange')) && dict.has(N('Contents')))) {
      const parts = ['Name', 'Reason', 'Location', 'ContactInfo', 'M'].map((k) => text(lookup(dict, k))).filter(Boolean);
      signatures.push(parts.length ? parts.join(', ') : 'Signature with certificate');
    }
    const ef = lookup(dict, 'EF');
    if (ef instanceof PDFDict) {
      const name = text(lookup(dict, 'UF')) || text(lookup(dict, 'F')) || 'unnamed file';
      const file = lookup(ef, 'F');
      attachments.push(file instanceof PDFRawStream ? `${name} (${file.contents.length} bytes)` : name);
    }
    if (stream instanceof PDFRawStream && nameOf(dict, 'Subtype') === 'Image') {
      const filters = filterNames(dict);
      if (filters?.length === 1 && filters[0] === 'DCTDecode') {
        const meta = jpegMetadata(stream.contents);
        if (meta) images.push(`Image ${text(lookup(dict, 'Width'))} × ${text(lookup(dict, 'Height'))}: ${[...meta.kinds, ...meta.fields].join('; ')}`);
      }
    }
  });

  for (const md of metadata) {
    if (!(md instanceof PDFRawStream)) continue;
    try {
      const xml = new TextDecoder().decode(decodePDFRawStream(md).decode());
      const lines = describeXmp(xml);
      found.xmp.push(...(lines.length ? lines : ['XMP packet']));
    } catch {
      found.xmp.push('XMP packet');
    }
  }
  found.xmp = [...new Set(found.xmp)];
  found.imageMeta = images;
  found.signatures = signatures;
  found.attachments = [...new Set(attachments)];
  if (thumbs) found.thumbnails.push(`${thumbs} page thumbnail${thumbs === 1 ? '' : 's'}`);
  pieceInfo = [...new Set(pieceInfo)];
  if (pieceInfo.length) found.privateData.push(`Private data from: ${pieceInfo.join(', ')}`);
  if (lastModified) found.privateData.push(`${lastModified} modification stamp${lastModified === 1 ? '' : 's'}`);
  found.javascript.push(...countOf(actions));
  const names = doc.catalog.lookup(N('Names'));
  if (names instanceof PDFDict && names.has(N('JavaScript'))) found.javascript.push('Document-level JavaScript');
  if (additionalActions) found.javascript.push(`${additionalActions} automatic action trigger${additionalActions === 1 ? '' : 's'} (on open, close, print, keystroke, …)`);

  const authors = new Set<string>();
  let dated = 0;
  const comments: string[] = [];
  for (const { annot } of annotations(doc)) {
    const subtype = nameOf(annot, 'Subtype') ?? 'Unknown';
    if (subtype === 'Widget' || subtype === 'Link') continue;
    // A popup is the note window of another annotation, not a comment of its own.
    if (MARKUP.has(subtype) && subtype !== 'Popup') comments.push(subtype);
    const author = text(lookup(annot, 'T'));
    if (author) authors.add(author);
    if (annot.has(N('M')) || annot.has(N('CreationDate'))) dated++;
  }
  if (authors.size) found.annotationAuthors.push(`Authors: ${[...authors].join(', ')}`);
  if (dated) found.annotationAuthors.push(`${dated} annotation${dated === 1 ? '' : 's'} with dates`);
  found.comments = countOf(comments);

  const filled = formFields(doc).filter((f) => f.type !== 'Sig' && hasValue(lookup(f.dict, 'V')));
  if (filled.length) found.formData.push(...filled.slice(0, 20).map((f) => `${f.name || 'field'}: ${text(lookup(f.dict, 'V')).slice(0, 80)}`));
  if (filled.length > 20) found.formData.push(`… and ${filled.length - 20} more`);
  const acro = doc.catalog.AcroForm();
  if (acro?.has(N('XFA'))) found.formData.push('XFA form data');

  const revisions = countEof(bytes) - 1 - (linearized ? 1 : 0);
  if (revisions > 0) found.history.push(`${revisions} earlier revision${revisions === 1 ? '' : 's'} (can contain deleted or changed content)`);
  const unused = unusedObjects(ctx).length;
  if (unused) found.history.push(`${unused} unused object${unused === 1 ? '' : 's'}`);

  return (Object.keys(LABELS) as FindingId[])
    .filter((id) => found[id].length)
    .map((id) => ({ id, label: LABELS[id], details: found[id] }));
}

export async function inspectPdf(bytes: Uint8Array): Promise<Finding[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return inspectDoc(doc, bytes);
}

function randomId(): PDFHexString {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return PDFHexString.of(Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''));
}

function clearFormValues(doc: PDFDocument) {
  for (const field of doc.getForm().getFields()) {
    try {
      if (field instanceof PDFTextField) field.setText(undefined);
      else if (field instanceof PDFCheckBox) field.uncheck();
      else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) field.clear();
    } catch {
      // Read-only or malformed fields stay as they are.
    }
  }
  doc.catalog.AcroForm()?.delete(N('XFA'));
  // Redrawn now, so that the old appearance streams are unused before they are removed.
  doc.getForm().updateFieldAppearances();
}

export async function cleanPdf(bytes: Uint8Array, opts: CleanOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const catalog = doc.catalog;
  const names = catalog.lookup(N('Names'));

  if (opts.formData) clearFormValues(doc);
  if (opts.info) ctx.trailerInfo.Info = undefined;
  if (opts.id) ctx.trailerInfo.ID = ctx.obj([randomId(), randomId()]);
  if (opts.attachments) {
    if (names instanceof PDFDict) names.delete(N('EmbeddedFiles'));
    catalog.delete(N('Collection'));
  }
  if (opts.javascript && names instanceof PDFDict) names.delete(N('JavaScript'));
  if (opts.signatures) {
    catalog.delete(N('Perms'));
    catalog.AcroForm()?.delete(N('SigFlags'));
  }

  // Annotations: drop whole comments or attachments, or only their authors and dates.
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    const removed = new Set<PDFDict>();
    const entries = annots.asArray().map((ref) => ({ ref, annot: ctx.lookup(ref) }));
    for (const { annot } of entries) {
      if (!(annot instanceof PDFDict)) continue;
      const subtype = nameOf(annot, 'Subtype');
      if ((opts.comments && MARKUP.has(subtype)) || (opts.attachments && subtype === 'FileAttachment')) removed.add(annot);
    }
    // The note windows of removed annotations go too.
    for (const { annot } of entries) {
      if (annot instanceof PDFDict && nameOf(annot, 'Subtype') === 'Popup' && removed.has(lookup(annot, 'Parent') as PDFDict)) removed.add(annot);
    }
    const kept = entries.filter(({ annot }) => !removed.has(annot as PDFDict));
    if (kept.length !== entries.length) page.node.set(N('Annots'), ctx.obj(kept.map((e) => e.ref)));
    if (opts.annotationAuthors) {
      for (const { annot } of kept) {
        if (!(annot instanceof PDFDict)) continue;
        const subtype = nameOf(annot, 'Subtype');
        // On widgets /T is the form field name, not an author.
        if (subtype !== 'Widget') annot.delete(N('T'));
        for (const key of ['M', 'CreationDate', 'NM']) annot.delete(N(key));
      }
    }
  }

  walkDicts(ctx, (dict, stream) => {
    if (opts.xmp) dict.delete(N('Metadata'));
    if (opts.thumbnails) dict.delete(N('Thumb'));
    if (opts.privateData) for (const key of ['PieceInfo', 'LastModified', 'SpiderInfo']) dict.delete(N(key));
    if (opts.attachments) dict.delete(N('AF'));
    if (opts.signatures && nameOf(dict, 'FT') === 'Sig') dict.delete(N('V'));
    if (opts.javascript) {
      dict.delete(N('AA'));
      for (const key of ['A', 'OpenAction', 'Next']) {
        const v = lookup(dict, key);
        if (isRiskyAction(v)) dict.delete(N(key));
        else if (key === 'Next' && v instanceof PDFArray) {
          dict.set(N('Next'), ctx.obj(v.asArray().filter((a) => !isRiskyAction(ctx.lookup(a)))));
        }
      }
    }
    if (opts.imageMeta && stream instanceof PDFRawStream && nameOf(dict, 'Subtype') === 'Image') {
      const filters = filterNames(dict);
      if (filters?.length === 1 && filters[0] === 'DCTDecode') {
        const stripped = stripJpegMetadata(stream.contents);
        if (stripped) stream.updateContents(stripped);
      }
    }
  });

  // Rewriting the file drops earlier revisions; unreachable objects would otherwise be written too.
  removeUnusedObjects(ctx);
  return doc.save({ useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false });
}
