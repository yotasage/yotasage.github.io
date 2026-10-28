// Low-level helpers for walking and editing the object graph of a pdf-lib document.
import { PDFArray, PDFContext, PDFDict, PDFHexString, PDFName, PDFNumber, PDFObject, PDFRef, PDFStream, PDFString } from '@cantoo/pdf-lib';

export const N = (name: string) => PDFName.of(name);

export function num(dict: PDFDict | undefined, key: string, fallback: number): number {
  const v = dict?.lookup(N(key));
  return v instanceof PDFNumber ? v.asNumber() : fallback;
}

// The stream's filters by name, [] when unfiltered, or null when the filter entry is malformed.
export function filterNames(dict: PDFDict): string[] | null {
  const filter = dict.lookup(N('Filter'));
  if (filter === undefined) return [];
  if (filter instanceof PDFName) return [filter.decodeText()];
  if (filter instanceof PDFArray) {
    const names = filter.asArray().map((f) => dict.context.lookup(f));
    return names.every((f) => f instanceof PDFName) ? names.map((f) => (f as PDFName).decodeText()) : null;
  }
  return null;
}

// A readable form of names, strings and numbers (PDF dates as "2024-05-01 13:45:00").
export function text(obj: PDFObject | undefined): string {
  if (obj instanceof PDFString || obj instanceof PDFHexString) {
    const s = obj.decodeText();
    const date = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(s);
    if (date) {
      const [, y, mo = '01', d = '01', h, mi, sec] = date;
      return `${y}-${mo}-${d}${h ? ` ${h}:${mi ?? '00'}:${sec ?? '00'}` : ''}`;
    }
    return s;
  }
  if (obj instanceof PDFName) return obj.decodeText();
  return obj === undefined ? '' : obj.toString();
}

export function nameOf(dict: PDFDict, key: string): string | undefined {
  const v = dict.lookup(N(key));
  return v instanceof PDFName ? v.decodeText() : undefined;
}

function trailerRoots(context: PDFContext): PDFObject[] {
  const { Root, Info, Encrypt, ID } = context.trailerInfo;
  return [Root, Info, Encrypt, ID].filter(Boolean);
}

// Calls `visit` once for every dictionary (including stream dictionaries) reachable from the trailer.
export function walkDicts(context: PDFContext, visit: (dict: PDFDict, stream: PDFStream | null) => void) {
  const seen = new Set<PDFRef>();
  const stack: PDFObject[] = trailerRoots(context);
  while (stack.length) {
    const obj = stack.pop();
    if (obj instanceof PDFRef) {
      if (seen.has(obj)) continue;
      seen.add(obj);
      const target = context.lookup(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFDict) {
      visit(obj, null);
      stack.push(...obj.values());
    } else if (obj instanceof PDFArray) {
      stack.push(...obj.asArray());
    } else if (obj instanceof PDFStream) {
      visit(obj.dict, obj);
      stack.push(...obj.dict.values());
    }
  }
}

function reachableRefs(context: PDFContext): Set<PDFRef> {
  const seen = new Set<PDFRef>();
  const stack: PDFObject[] = trailerRoots(context);
  while (stack.length) {
    const obj = stack.pop();
    if (obj instanceof PDFRef) {
      if (seen.has(obj)) continue;
      seen.add(obj);
      const target = context.lookup(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFDict) {
      stack.push(...obj.values());
    } else if (obj instanceof PDFArray) {
      stack.push(...obj.asArray());
    } else if (obj instanceof PDFStream) {
      stack.push(obj.dict);
    }
  }
  return seen;
}

// Objects that nothing refers to: leftovers of earlier revisions, replaced objects, old cross-reference and object
// streams. Cross-reference and object streams are not counted, as they are only containers.
export function unusedObjects(context: PDFContext): PDFRef[] {
  const seen = reachableRefs(context);
  return context.enumerateIndirectObjects()
    .filter(([ref, obj]) => {
      if (seen.has(ref)) return false;
      const type = obj instanceof PDFStream ? nameOf(obj.dict, 'Type') : undefined;
      return type !== 'XRef' && type !== 'ObjStm';
    })
    .map(([ref]) => ref);
}

// Deletes every object that cannot be reached from the trailer.
export function removeUnusedObjects(context: PDFContext) {
  const seen = reachableRefs(context);
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!seen.has(ref)) context.delete(ref);
  }
}
