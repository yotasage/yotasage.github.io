// The project file: the whole setup as JSON (setup.ts's plain form, every part written), with its format, version, the
// date it was saved and, for information, the link. Opening never throws: a newer version is refused with a message,
// a pasted link is read as version 0, unreadable parts give issues and defaults.

import { decodeLink, encodeLink } from './link';
import { fromPlain, toPlain } from './setup';
import type { Setup } from './setup';
import type { Issue } from './stackup';

export const PROJECT_FORMAT = 'yotasage-emsim';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.emsim.json';
export const PROJECT_MAX_BYTES = 4_000_000;

export function projectJson(x: Setup, date = new Date().toISOString().slice(0, 10)): string {
  const file = { format: PROJECT_FORMAT, version: PROJECT_VERSION, saved: date, link: encodeLink(x), setup: toPlain(x, false) };
  return `${JSON.stringify(file, null, 1)}\n`;
}

export interface Opened {
  setup: Setup | null; // null when refused
  issues: Issue[];
  version: number; // 0: a link
  message: string; // why it was refused ('' when read)
}

export function openProject(text: string): Opened {
  const t = String(text ?? '');
  if (t.length > PROJECT_MAX_BYTES) return { setup: null, issues: [], version: 0, message: 'The file is too large to be a project of this tool.' };
  const trimmed = t.trim();
  if (!trimmed) return { setup: null, issues: [], version: 0, message: 'The file is empty.' };
  if (trimmed[0] !== '{') {
    if (/(^|[?&])v=\d/.test(trimmed)) {
      const d = decodeLink(trimmed);
      return { setup: d.setup, issues: d.issues, version: 0, message: '' };
    }
    return { setup: null, issues: [], version: 0, message: 'This is neither a project file of this tool nor a link to it.' };
  }
  let j: any;
  try {
    j = JSON.parse(trimmed);
  } catch {
    return { setup: null, issues: [], version: 0, message: 'The file is not valid JSON.' };
  }
  if (!j || typeof j !== 'object' || j.format !== PROJECT_FORMAT) return { setup: null, issues: [], version: 0, message: 'This JSON file is not a project of this tool.' };
  const version = Number(j.version);
  if (!Number.isInteger(version) || version < 1) return { setup: null, issues: [], version: 0, message: 'The project’s version cannot be read.' };
  if (version > PROJECT_VERSION) return { setup: null, issues: [], version, message: `The project was saved by a newer version of this tool (file version ${version}); this page reads up to version ${PROJECT_VERSION}.` };
  const r = fromPlain(j.setup);
  return { setup: r.setup, issues: r.issues, version, message: '' };
}
