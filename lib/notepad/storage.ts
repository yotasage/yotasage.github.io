import {
  createEqualTrackSizes,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_SYMBOL_SETTINGS,
  DiffViewStyle,
  EncodingConfidence,
  EolMode,
  FileEncoding,
  LayoutMode,
  MAX_GRID_DIM,
  NotepadDoc,
  NotepadWorkspaceState,
  TextDirection,
} from './types';

const DB_NAME = 'yotasage-notepad-db';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const STATE_KEY = 'current';
const LS_FALLBACK_KEY = 'yotasage.notepad.workspace.v1';
export const SYNC_CHANNEL_NAME = 'yotasage-notepad-sync-v1';

const VALID_ENCODINGS: readonly FileEncoding[] = [
  'utf-8',
  'utf-8-bom',
  'utf-16le-bom',
  'utf-16be-bom',
  'windows-1252',
  'iso-8859-1',
];

function sanitizeTrackSizes(raw: unknown, count: number): number[] {
  if (!Array.isArray(raw) || raw.length !== count) {
    return createEqualTrackSizes(count);
  }
  const nums = raw.map((v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0));
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum <= 0 || nums.some((n) => n < 5)) {
    return createEqualTrackSizes(count);
  }
  return nums.map((n) => Number(((n / sum) * 100).toFixed(2)));
}

export function createDocId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `doc-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createStarterWorkspace(): NotepadWorkspaceState {
  const now = Date.now();
  const doc1: NotepadDoc = {
    id: 'doc-notes-1',
    name: 'scratchpad.txt',
    language: 'plaintext',
    eol: 'CRLF',
    encoding: 'utf-8',
    encodingConfidence: 'exact',
    direction: 'ltr',
    createdAt: now,
    updatedAt: now,
    content: [
      'Component checklist (try selecting "10k" or replacing \\r\\n with ", ")',
      'R1 = 10k 0603 1%',
      'R2 = 10k 0603 1%',
      'R3 = 4.7k 0603 1%',
      'C1 = 100nF 0603 X7R',
      'C2 = 100nF 0603 X7R',
      'U1 = STM32G431CBU6',
      '',
      'Quick tip: select any symbol, word, or full sentence to highlight every equal match.',
      'Press F3 / Shift+F3 (or Next / Prev equal) to jump straight to the next equal entry.',
    ].join('\r\n'),
  };

  const doc2: NotepadDoc = {
    id: 'doc-notes-2',
    name: 'scratchpad-rev2.txt',
    language: 'plaintext',
    eol: 'CRLF',
    encoding: 'utf-8',
    encodingConfidence: 'exact',
    direction: 'ltr',
    createdAt: now,
    updatedAt: now,
    content: [
      'Component checklist (try selecting "10k" or replacing \\r\\n with ", ")',
      'R1 = 10k 0603 0.1%',
      'R2 = 10k 0603 1%',
      'R3 = 4.7k 0603 1%',
      'R4 = 22R 0402 1%',
      'C1 = 100nF 0603 X7R',
      'C2 = 1uF 0603 X5R',
      'U1 = STM32G431CBU6',
      '',
      'Quick tip: select any symbol, word, or full sentence to highlight every equal match.',
      'Open Compare mode to inspect line-by-line differences side-by-side or inline.',
    ].join('\r\n'),
  };

  const doc3: NotepadDoc = {
    id: 'doc-measurements-csv',
    name: 'measurements.csv',
    language: 'csv',
    eol: 'LF',
    encoding: 'utf-8',
    encodingConfidence: 'exact',
    direction: 'ltr',
    createdAt: now,
    updatedAt: now,
    content: [
      'freq_mhz,s11_db,s21_db,vswr,status',
      '100.0,-24.8,-0.18,1.12,pass',
      '250.0,-21.3,-0.24,1.19,pass',
      '500.0,-18.9,-0.35,1.26,pass',
      '1000.0,-14.2,-0.61,1.48,pass',
    ].join('\n'),
  };

  const doc4: NotepadDoc = {
    id: 'doc-notes-tex',
    name: 'summary.tex',
    language: 'latex',
    eol: 'LF',
    encoding: 'utf-8',
    encodingConfidence: 'exact',
    direction: 'ltr',
    createdAt: now,
    updatedAt: now,
    content: [
      '% Quick LaTeX note',
      '\\section{Filter Attenuation}',
      'The transfer magnitude at cutoff $f_c = \\frac{1}{2\\pi R C}$ is $-3\\,\\mathrm{dB}$.',
      '\\begin{equation}',
      '  H(j\\omega) = \\frac{1}{1 + j\\omega R C}',
      '\\end{equation}',
    ].join('\n'),
  };

  const docIds = [doc1.id, doc2.id, doc3.id, doc4.id];
  const paneDocIds = Array.from({ length: MAX_GRID_DIM * MAX_GRID_DIM }, (_, idx) => docIds[idx % docIds.length]);

  return {
    version: 1,
    docs: [doc1, doc2, doc3, doc4],
    layout: 'single',
    paneDocIds,
    activePane: 0,
    gridRows: 2,
    gridCols: 2,
    gridColSizes: createEqualTrackSizes(2),
    gridRowSizes: createEqualTrackSizes(2),
    diffLeftId: doc1.id,
    diffRightId: doc2.id,
    diffStyle: 'side-by-side',
    diffIgnoreWhitespace: false,
    settings: {
      ...DEFAULT_EDITOR_SETTINGS,
      symbols: { ...DEFAULT_SYMBOL_SETTINGS },
    },
    savedAt: now,
  };
}

export function sanitizeWorkspaceState(raw: unknown): NotepadWorkspaceState | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.docs) || obj.docs.length === 0) return null;

  const now = Date.now();
  const docs: NotepadDoc[] = [];
  const seenIds = new Set<string>();

  for (const item of obj.docs) {
    if (!item || typeof item !== 'object') continue;
    const d = item as Record<string, unknown>;
    const id = typeof d.id === 'string' && d.id.trim() ? d.id.trim() : createDocId();
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 120) : 'untitled.txt';
    const content = typeof d.content === 'string' ? d.content : '';
    const language = typeof d.language === 'string' && d.language.trim() ? d.language : 'plaintext';
    const eol: EolMode = d.eol === 'CRLF' ? 'CRLF' : 'LF';
    const encoding: FileEncoding = VALID_ENCODINGS.includes(d.encoding as FileEncoding)
      ? (d.encoding as FileEncoding)
      : 'utf-8';
    const encodingConfidence: EncodingConfidence = d.encodingConfidence === 'likely' ? 'likely' : 'exact';
    const direction: TextDirection = d.direction === 'rtl' ? 'rtl' : 'ltr';
    const createdAt = typeof d.createdAt === 'number' && Number.isFinite(d.createdAt) ? d.createdAt : now;
    const updatedAt = typeof d.updatedAt === 'number' && Number.isFinite(d.updatedAt) ? d.updatedAt : now;
    const pinned = Boolean(d.pinned);

    docs.push({
      id,
      name,
      content,
      language,
      eol,
      encoding,
      encodingConfidence,
      direction,
      pinned,
      createdAt,
      updatedAt,
    });
  }

  if (docs.length === 0) return null;

  const fallbackId = docs[0].id;
  const secondId = docs[1]?.id ?? fallbackId;
  const ensureValid = (id: unknown, fallback: string): string =>
    typeof id === 'string' && seenIds.has(id) ? id : fallback;

  const maxSlots = MAX_GRID_DIM * MAX_GRID_DIM;
  const rawPanes = Array.isArray(obj.paneDocIds) ? obj.paneDocIds : [];
  const paneDocIds: string[] = Array.from({ length: maxSlots }, (_, idx) =>
    ensureValid(rawPanes[idx], docs[idx % docs.length].id),
  );

  const gridRows =
    typeof obj.gridRows === 'number' && Number.isFinite(obj.gridRows)
      ? Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(obj.gridRows)))
      : 2;
  const gridCols =
    typeof obj.gridCols === 'number' && Number.isFinite(obj.gridCols)
      ? Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(obj.gridCols)))
      : 2;

  const validLayouts: readonly LayoutMode[] = ['single', 'split', 'grid', 'diff'];
  const layout: LayoutMode = validLayouts.includes(obj.layout as LayoutMode)
    ? (obj.layout as LayoutMode)
    : 'single';

  const diffStyle: DiffViewStyle = obj.diffStyle === 'inline' ? 'inline' : 'side-by-side';
  const rawSettings = (obj.settings && typeof obj.settings === 'object' ? obj.settings : {}) as Record<
    string,
    unknown
  >;
  const rawSymbols = (
    rawSettings.symbols && typeof rawSettings.symbols === 'object' ? rawSettings.symbols : {}
  ) as Record<string, unknown>;

  const rawFont = typeof rawSettings.fontSize === 'number' ? rawSettings.fontSize : DEFAULT_EDITOR_SETTINGS.fontSize;
  const fontSize = Math.min(24, Math.max(11, Number.isFinite(rawFont) ? rawFont : DEFAULT_EDITOR_SETTINGS.fontSize));

  const legacyShowWs =
    typeof rawSettings.showWhitespace === 'boolean'
      ? rawSettings.showWhitespace
      : DEFAULT_EDITOR_SETTINGS.showWhitespace;
  const showWhitespaceAndTab =
    typeof rawSymbols.showWhitespaceAndTab === 'boolean' ? rawSymbols.showWhitespaceAndTab : legacyShowWs;

  return {
    version: 1,
    docs,
    layout,
    paneDocIds,
    activePane:
      typeof obj.activePane === 'number' && obj.activePane >= 0 && obj.activePane < maxSlots
        ? Math.floor(obj.activePane)
        : 0,
    gridRows,
    gridCols,
    gridColSizes: sanitizeTrackSizes(obj.gridColSizes, gridCols),
    gridRowSizes: sanitizeTrackSizes(obj.gridRowSizes, gridRows),
    diffLeftId: ensureValid(obj.diffLeftId, fallbackId),
    diffRightId: ensureValid(obj.diffRightId, secondId),
    diffStyle,
    diffIgnoreWhitespace: Boolean(obj.diffIgnoreWhitespace),
    settings: {
      wordWrap: typeof rawSettings.wordWrap === 'boolean' ? rawSettings.wordWrap : DEFAULT_EDITOR_SETTINGS.wordWrap,
      showWhitespace: showWhitespaceAndTab,
      showMinimap:
        typeof rawSettings.showMinimap === 'boolean'
          ? rawSettings.showMinimap
          : DEFAULT_EDITOR_SETTINGS.showMinimap,
      fontSize,
      symbols: {
        showWhitespaceAndTab,
        showEol:
          typeof rawSymbols.showEol === 'boolean' ? rawSymbols.showEol : DEFAULT_SYMBOL_SETTINGS.showEol,
        showNonPrinting:
          typeof rawSymbols.showNonPrinting === 'boolean'
            ? rawSymbols.showNonPrinting
            : DEFAULT_SYMBOL_SETTINGS.showNonPrinting,
        showIndentGuide:
          typeof rawSymbols.showIndentGuide === 'boolean'
            ? rawSymbols.showIndentGuide
            : DEFAULT_SYMBOL_SETTINGS.showIndentGuide,
        showWrapSymbol:
          typeof rawSymbols.showWrapSymbol === 'boolean'
            ? rawSymbols.showWrapSymbol
            : DEFAULT_SYMBOL_SETTINGS.showWrapSymbol,
      },
    },
    savedAt: typeof obj.savedAt === 'number' && Number.isFinite(obj.savedAt) ? obj.savedAt : now,
  };
}

export function exportWorkspaceJson(state: NotepadWorkspaceState): string {
  return JSON.stringify(
    {
      ...state,
      version: 1,
      savedAt: Date.now(),
    },
    null,
    2,
  );
}

export function parseWorkspaceJson(jsonText: string): { state: NotepadWorkspaceState | null; error: string | null } {
  try {
    const parsed: unknown = JSON.parse(jsonText);
    const sanitized = sanitizeWorkspaceState(parsed);
    if (!sanitized) {
      return { state: null, error: 'File does not contain a valid Notepad workspace.' };
    }
    return { state: sanitized, error: null };
  } catch (err) {
    return {
      state: null,
      error: err instanceof Error ? err.message : 'Could not parse workspace JSON.',
    };
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function loadWorkspaceSync(): NotepadWorkspaceState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_FALLBACK_KEY);
    if (!raw) return null;
    return sanitizeWorkspaceState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadWorkspace(): Promise<{
  state: NotepadWorkspaceState;
  engine: 'indexeddb' | 'localstorage' | 'memory';
}> {
  const db = await openDb();
  if (db) {
    try {
      const stored = await new Promise<unknown>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      });
      db.close();
      const valid = sanitizeWorkspaceState(stored);
      if (valid) return { state: valid, engine: 'indexeddb' };
    } catch {
      db.close();
    }
  }

  const lsState = loadWorkspaceSync();
  if (lsState) return { state: lsState, engine: 'localstorage' };

  const starter = createStarterWorkspace();
  return { state: starter, engine: typeof indexedDB !== 'undefined' ? 'indexeddb' : 'localstorage' };
}

export function saveWorkspaceSync(state: NotepadWorkspaceState): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(state);
    // Keep localStorage fallback under ~3.5 MB to avoid quota errors on huge files
    if (serialized.length < 3_500_000) {
      window.localStorage.setItem(LS_FALLBACK_KEY, serialized);
    }
  } catch {
    // Ignore localStorage quota failures; IndexedDB handles large payloads
  }
}

export async function saveWorkspace(
  state: NotepadWorkspaceState,
): Promise<'indexeddb' | 'localstorage' | 'memory'> {
  saveWorkspaceSync(state);

  const db = await openDb();
  if (!db) {
    return typeof window !== 'undefined' ? 'localstorage' : 'memory';
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(state, STATE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve('indexeddb');
      };
      tx.onerror = () => {
        db.close();
        resolve('localstorage');
      };
    } catch {
      db.close();
      resolve('localstorage');
    }
  });
}

export function estimateWorkspaceBytes(state: NotepadWorkspaceState): number {
  return new TextEncoder().encode(JSON.stringify(state)).length;
}
