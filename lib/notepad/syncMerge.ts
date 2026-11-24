import { createEqualTrackSizes, MAX_GRID_DIM } from './types';
import type {
  DiffViewStyle,
  EditorSettings,
  LayoutMode,
  NotepadDoc,
  NotepadWorkspaceState,
} from './types';

export type PaneViewMode = 'editor' | 'split' | 'preview';
export type PreviewKind = 'auto' | 'markdown' | 'html' | 'csv';

export interface PaneViewState {
  mode: PaneViewMode;
  kind: PreviewKind;
}

export interface WindowViewState {
  layout: LayoutMode;
  paneDocIds: string[];
  activePane: number;
  gridRows: number;
  gridCols: number;
  gridColSizes: number[];
  gridRowSizes: number[];
  diffLeftId: string;
  diffRightId: string;
  diffStyle: DiffViewStyle;
  diffIgnoreWhitespace: boolean;
  splitRatio: number;
  paneViews: Record<number, PaneViewState>;
}

export interface SharedWorkspaceData {
  docs: NotepadDoc[];
  settings: EditorSettings;
  savedAt: number;
}

export type SyncMessage =
  | {
      sender: string;
      kind: 'docs-patch';
      sentAt: number;
      updatedDocs: NotepadDoc[];
      deletedIds: string[];
      docOrder: string[];
      settings?: EditorSettings;
    }
  | {
      sender: string;
      kind: 'workspace-reset';
      sentAt: number;
      docs: NotepadDoc[];
      settings: EditorSettings;
    };

export interface MinimalTextEdit {
  startOffset: number;
  endOffset: number;
  insertText: string;
}

export const WINDOW_VIEW_STORAGE_KEY = 'yotasage.notepad.windowView.v1';

const MAX_SLOTS = MAX_GRID_DIM * MAX_GRID_DIM;
const VALID_LAYOUTS: readonly LayoutMode[] = ['single', 'split', 'grid', 'diff'];
const VALID_PANE_MODES: readonly PaneViewMode[] = ['editor', 'split', 'preview'];
const VALID_PREVIEW_KINDS: readonly PreviewKind[] = ['auto', 'markdown', 'html', 'csv'];

function sanitizeTrackSizes(raw: unknown, count: number, fallback: readonly number[]): number[] {
  if (!Array.isArray(raw) || raw.length !== count) {
    return fallback.length === count ? fallback.slice() : createEqualTrackSizes(count);
  }
  const nums = raw.map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0));
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum <= 0 || nums.some((n) => n < 5)) {
    return fallback.length === count ? fallback.slice() : createEqualTrackSizes(count);
  }
  return nums.map((n) => Number(((n / sum) * 100).toFixed(2)));
}

function sanitizePaneViews(raw: unknown): Record<number, PaneViewState> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<number, PaneViewState> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const idx = Number(k);
    if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_SLOTS) continue;
    if (!v || typeof v !== 'object') continue;
    const entry = v as Record<string, unknown>;
    const mode: PaneViewMode = VALID_PANE_MODES.includes(entry.mode as PaneViewMode)
      ? (entry.mode as PaneViewMode)
      : 'editor';
    const kind: PreviewKind = VALID_PREVIEW_KINDS.includes(entry.kind as PreviewKind)
      ? (entry.kind as PreviewKind)
      : 'auto';
    result[idx] = { mode, kind };
  }
  return result;
}

function makeFallbackDoc(now: number): NotepadDoc {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `doc-${crypto.randomUUID().slice(0, 8)}`
      : `doc-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name: 'new 1.txt',
    content: '',
    language: 'plaintext',
    eol: 'LF',
    encoding: 'utf-8',
    encodingConfidence: 'exact',
    direction: 'ltr',
    createdAt: now,
    updatedAt: now,
  };
}

export function extractWindowViewState(ws: NotepadWorkspaceState): WindowViewState {
  const fallbackId = ws.docs[0]?.id ?? '';
  const paneDocIds = Array.from(
    { length: MAX_SLOTS },
    (_, idx) => ws.paneDocIds[idx] ?? ws.docs[idx % Math.max(1, ws.docs.length)]?.id ?? fallbackId,
  );
  return {
    layout: ws.layout,
    paneDocIds,
    activePane: Math.max(0, Math.min(MAX_SLOTS - 1, Math.floor(ws.activePane))),
    gridRows: Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(ws.gridRows))),
    gridCols: Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(ws.gridCols))),
    gridColSizes: ws.gridColSizes.slice(),
    gridRowSizes: ws.gridRowSizes.slice(),
    diffLeftId: ws.diffLeftId,
    diffRightId: ws.diffRightId,
    diffStyle: ws.diffStyle,
    diffIgnoreWhitespace: ws.diffIgnoreWhitespace,
    splitRatio: 50,
    paneViews: {},
  };
}

export function composeWorkspaceState(
  shared: SharedWorkspaceData,
  view: WindowViewState,
): NotepadWorkspaceState {
  return {
    version: 1,
    docs: shared.docs,
    layout: view.layout,
    paneDocIds: view.paneDocIds,
    activePane: view.activePane,
    gridRows: view.gridRows,
    gridCols: view.gridCols,
    gridColSizes: view.gridColSizes,
    gridRowSizes: view.gridRowSizes,
    diffLeftId: view.diffLeftId,
    diffRightId: view.diffRightId,
    diffStyle: view.diffStyle,
    diffIgnoreWhitespace: view.diffIgnoreWhitespace,
    settings: shared.settings,
    savedAt: shared.savedAt,
  };
}

export function reconcileWindowViewState(
  view: WindowViewState,
  docs: readonly NotepadDoc[],
): WindowViewState {
  if (docs.length === 0) return view;
  const validIds = new Set(docs.map((d) => d.id));
  const fallbackId = docs[0].id;
  const secondId = docs[Math.min(1, docs.length - 1)].id;

  let panesChanged = view.paneDocIds.length !== MAX_SLOTS;
  const nextPaneDocIds = Array.from({ length: MAX_SLOTS }, (_, idx) => {
    const existing = view.paneDocIds[idx];
    if (typeof existing === 'string' && validIds.has(existing)) {
      return existing;
    }
    panesChanged = true;
    return existing !== undefined ? fallbackId : docs[idx % docs.length].id;
  });

  const nextDiffLeftId = validIds.has(view.diffLeftId) ? view.diffLeftId : fallbackId;
  const nextDiffRightId = validIds.has(view.diffRightId) ? view.diffRightId : secondId;

  if (!panesChanged && nextDiffLeftId === view.diffLeftId && nextDiffRightId === view.diffRightId) {
    return view;
  }

  return {
    ...view,
    paneDocIds: nextPaneDocIds,
    diffLeftId: nextDiffLeftId,
    diffRightId: nextDiffRightId,
  };
}

export function sanitizeWindowViewState(
  raw: unknown,
  docs: readonly NotepadDoc[],
  fallback: WindowViewState,
): WindowViewState {
  if (!raw || typeof raw !== 'object') {
    return reconcileWindowViewState(fallback, docs);
  }
  const obj = raw as Record<string, unknown>;
  const validIds = new Set(docs.map((d) => d.id));
  const fallbackId = docs[0]?.id ?? '';
  const secondId = docs[Math.min(1, Math.max(0, docs.length - 1))]?.id ?? fallbackId;

  const ensureValid = (candidate: unknown, fallbackCandidate: string, lastResort: string): string => {
    if (typeof candidate === 'string' && validIds.has(candidate)) return candidate;
    if (validIds.has(fallbackCandidate)) return fallbackCandidate;
    return lastResort;
  };

  const layout: LayoutMode = VALID_LAYOUTS.includes(obj.layout as LayoutMode)
    ? (obj.layout as LayoutMode)
    : fallback.layout;

  const gridRows =
    typeof obj.gridRows === 'number' && Number.isFinite(obj.gridRows)
      ? Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(obj.gridRows)))
      : fallback.gridRows;

  const gridCols =
    typeof obj.gridCols === 'number' && Number.isFinite(obj.gridCols)
      ? Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(obj.gridCols)))
      : fallback.gridCols;

  const rawPanes = Array.isArray(obj.paneDocIds) ? obj.paneDocIds : [];
  const paneDocIds = Array.from({ length: MAX_SLOTS }, (_, idx) => {
    const defaultForSlot = docs.length > 0 ? docs[idx % docs.length].id : fallbackId;
    return ensureValid(rawPanes[idx], fallback.paneDocIds[idx] ?? defaultForSlot, defaultForSlot);
  });

  const activePane =
    typeof obj.activePane === 'number' && Number.isFinite(obj.activePane)
      ? Math.max(0, Math.min(MAX_SLOTS - 1, Math.floor(obj.activePane)))
      : fallback.activePane;

  const diffStyle: DiffViewStyle =
    obj.diffStyle === 'inline' || obj.diffStyle === 'side-by-side' ? obj.diffStyle : fallback.diffStyle;

  const diffIgnoreWhitespace =
    typeof obj.diffIgnoreWhitespace === 'boolean' ? obj.diffIgnoreWhitespace : fallback.diffIgnoreWhitespace;

  const splitRatio =
    typeof obj.splitRatio === 'number' && Number.isFinite(obj.splitRatio)
      ? Math.min(80, Math.max(20, obj.splitRatio))
      : fallback.splitRatio;

  const paneViews =
    obj.paneViews !== undefined ? sanitizePaneViews(obj.paneViews) : { ...fallback.paneViews };

  return reconcileWindowViewState(
    {
      layout,
      paneDocIds,
      activePane,
      gridRows,
      gridCols,
      gridColSizes: sanitizeTrackSizes(obj.gridColSizes, gridCols, fallback.gridColSizes),
      gridRowSizes: sanitizeTrackSizes(obj.gridRowSizes, gridRows, fallback.gridRowSizes),
      diffLeftId: ensureValid(obj.diffLeftId, fallback.diffLeftId, fallbackId),
      diffRightId: ensureValid(obj.diffRightId, fallback.diffRightId, secondId),
      diffStyle,
      diffIgnoreWhitespace,
      splitRatio,
      paneViews,
    },
    docs,
  );
}

export function mergeRemotePatch(
  localDocs: readonly NotepadDoc[],
  patch: Extract<SyncMessage, { kind: 'docs-patch' }>,
  dirtyLocalDocIds: ReadonlySet<string>,
): NotepadDoc[] {
  const resultById = new Map<string, NotepadDoc>();
  for (const doc of localDocs) {
    resultById.set(doc.id, doc);
  }

  for (const deletedId of patch.deletedIds) {
    const local = resultById.get(deletedId);
    if (!local) continue;
    if (dirtyLocalDocIds.has(deletedId) && local.updatedAt > patch.sentAt) {
      continue;
    }
    resultById.delete(deletedId);
  }

  for (const remote of patch.updatedDocs) {
    if (!remote || typeof remote.id !== 'string') continue;
    const local = resultById.get(remote.id);
    if (!local) {
      resultById.set(remote.id, remote);
      continue;
    }
    if (!dirtyLocalDocIds.has(remote.id) || remote.updatedAt > local.updatedAt) {
      resultById.set(remote.id, remote);
    }
  }

  const ordered: NotepadDoc[] = [];
  const placed = new Set<string>();

  for (const id of patch.docOrder) {
    const doc = resultById.get(id);
    if (doc && !placed.has(id)) {
      ordered.push(doc);
      placed.add(id);
    }
  }

  for (const local of localDocs) {
    const doc = resultById.get(local.id);
    if (doc && !placed.has(local.id)) {
      ordered.push(doc);
      placed.add(local.id);
    }
  }

  for (const [id, doc] of resultById.entries()) {
    if (!placed.has(id)) {
      ordered.push(doc);
      placed.add(id);
    }
  }

  if (ordered.length === 0) {
    ordered.push(makeFallbackDoc(Date.now()));
  }

  return ordered;
}

export function loadWindowViewState(
  docs: readonly NotepadDoc[],
  fallback: WindowViewState,
): WindowViewState {
  if (typeof window === 'undefined') {
    return reconcileWindowViewState(fallback, docs);
  }
  try {
    const raw = window.sessionStorage.getItem(WINDOW_VIEW_STORAGE_KEY);
    if (!raw) return reconcileWindowViewState(fallback, docs);
    return sanitizeWindowViewState(JSON.parse(raw), docs, fallback);
  } catch {
    return reconcileWindowViewState(fallback, docs);
  }
}

export function saveWindowViewState(view: WindowViewState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(WINDOW_VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Ignore sessionStorage quota or privacy mode errors
  }
}

export function computeMinimalTextEdit(oldText: string, newText: string): MinimalTextEdit | null {
  if (oldText === newText) return null;

  const oldLen = oldText.length;
  const newLen = newText.length;
  const minLen = Math.min(oldLen, newLen);

  let prefix = 0;
  while (prefix < minLen && oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)) {
    prefix++;
  }
  if (prefix > 0) {
    const prevCode = oldText.charCodeAt(prefix - 1);
    if (prevCode >= 0xd800 && prevCode <= 0xdbff) {
      prefix--;
    }
  }

  let suffix = 0;
  const maxSuffix = minLen - prefix;
  while (
    suffix < maxSuffix &&
    oldText.charCodeAt(oldLen - 1 - suffix) === newText.charCodeAt(newLen - 1 - suffix)
  ) {
    suffix++;
  }
  if (suffix > 0) {
    const firstSuffixCode = oldText.charCodeAt(oldLen - suffix);
    if (firstSuffixCode >= 0xdc00 && firstSuffixCode <= 0xdfff) {
      suffix--;
    }
  }

  return {
    startOffset: prefix,
    endOffset: oldLen - suffix,
    insertText: newText.slice(prefix, newLen - suffix),
  };
}
