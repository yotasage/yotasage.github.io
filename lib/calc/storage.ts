// Safe client-side localStorage persistence for Smart Calculator.
// All data stays strictly on the user's device; SSR-safe with graceful fallbacks.
// Framework-free; zero external dependencies; no node:* imports.

import type { SmartCalcLayoutV1 } from './layouts';

export type CalcWorkflowTab = 'hybrid' | 'notebook' | 'quick';

export interface StoredHistoryItem {
  id: string;
  expr: string;
  resultText: string;
  resultLatex: string;
  baseSI?: string;
  isSymbolic?: boolean;
  assignedName?: string;
  timestamp: number;
}

export interface StoredVariable {
  name: string;
  expr: string;
}

const KEY_WORKFLOW = 'smartcalc.v1.workflow';
const KEY_HISTORY = 'smartcalc.v1.history';
const KEY_VARS = 'smartcalc.v1.vars';
const KEY_NOTEBOOK = 'smartcalc.v1.notebook';
const KEY_CUSTOM_LAYOUTS = 'smartcalc.v1.customLayouts';

const MAX_HISTORY = 150;

export const DEFAULT_NOTEBOOK_TEXT = `# RC Low-Pass Filter Scratchpad
R = 10 kOhm
C = 100 pF
tau = R * C
f_c = 1 / (2 * pi * tau)

# RF Wavelength at 2.4 GHz
f_rf = 2.4 GHz
lambda = c / f_rf in mm
quarter_wave = lambda / 4`;

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!hasStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private-browsing storage errors
  }
}

function removeKey(key: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

export function loadWorkflowTab(): CalcWorkflowTab {
  if (!hasStorage()) return 'hybrid';
  try {
    const raw = window.localStorage.getItem(KEY_WORKFLOW);
    if (raw === 'hybrid' || raw === 'notebook' || raw === 'quick') return raw;
  } catch {
    // ignore
  }
  return 'hybrid';
}

export function saveWorkflowTab(tab: CalcWorkflowTab): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(KEY_WORKFLOW, tab);
  } catch {
    // ignore
  }
}

export function loadHistory(): StoredHistoryItem[] {
  const list = readJson<unknown>(KEY_HISTORY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((item): item is StoredHistoryItem => {
      if (!item || typeof item !== 'object') return false;
      const o = item as Record<string, unknown>;
      return typeof o.id === 'string' && typeof o.expr === 'string' && typeof o.resultText === 'string';
    })
    .slice(-MAX_HISTORY);
}

export function saveHistory(items: readonly StoredHistoryItem[]): void {
  writeJson(KEY_HISTORY, items.slice(-MAX_HISTORY));
}

export function loadVariables(): StoredVariable[] {
  const list = readJson<unknown>(KEY_VARS, []);
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is StoredVariable => {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    return typeof o.name === 'string' && typeof o.expr === 'string';
  });
}

export function saveVariables(vars: readonly StoredVariable[]): void {
  writeJson(KEY_VARS, vars);
}

export function loadNotebookText(): string {
  if (!hasStorage()) return DEFAULT_NOTEBOOK_TEXT;
  try {
    const raw = window.localStorage.getItem(KEY_NOTEBOOK);
    return raw !== null ? raw : DEFAULT_NOTEBOOK_TEXT;
  } catch {
    return DEFAULT_NOTEBOOK_TEXT;
  }
}

export function saveNotebookText(text: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(KEY_NOTEBOOK, text);
  } catch {
    // ignore
  }
}

export function loadCustomLayouts(): SmartCalcLayoutV1[] {
  const list = readJson<unknown>(KEY_CUSTOM_LAYOUTS, []);
  if (!Array.isArray(list)) return [];
  return list.filter((item): item is SmartCalcLayoutV1 => {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    return o.schemaVersion === 1 && typeof o.id === 'string' && typeof o.equation === 'string' && Array.isArray(o.variables);
  });
}

export function saveCustomLayouts(layouts: readonly SmartCalcLayoutV1[]): void {
  writeJson(KEY_CUSTOM_LAYOUTS, layouts);
}

export function clearHistoryStorage(): void {
  removeKey(KEY_HISTORY);
}

export function clearVariablesStorage(): void {
  removeKey(KEY_VARS);
}

export function clearNotebookStorage(): void {
  removeKey(KEY_NOTEBOOK);
}

export function clearAllCalculatorStorage(): void {
  removeKey(KEY_HISTORY);
  removeKey(KEY_VARS);
  removeKey(KEY_NOTEBOOK);
}
