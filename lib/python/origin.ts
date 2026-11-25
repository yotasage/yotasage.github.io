// Single place naming the Python runtime's origin and asset URLs.
// Keeps Option B (moving the runtime to a dedicated origin later) isolated to one module.

export const PYTHON_SCOPE_PATH = '/python/';
export const PYTHON_SW_PATH = '/python/coi-sw.js';
export const PYTHON_WORKER_PATH = '/python/python-worker.js';
export const PYTHON_STORAGE_WORKER_PATH = '/python/storage-worker.js';
export const PYTHON_WHEEL_WORKER_PATH = '/python/wheel-worker.js';
export const PYTHON_RT_BASE_PATH = '/python/rt/';
export const PYODIDE_INDEX_PATH = '/pyodide/';
export const PYODIDE_LOCK_PATH = '/pyodide/pyodide-lock.json';

/** Returns the runtime origin (current browser origin in Option A, empty string during SSR). */
export function getPythonRuntimeOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return '';
}

export function getPythonServiceWorkerUrl(): string {
  const origin = getPythonRuntimeOrigin();
  return origin ? `${origin}${PYTHON_SW_PATH}` : PYTHON_SW_PATH;
}

export function getPythonWorkerUrl(): string {
  const origin = getPythonRuntimeOrigin();
  return origin ? `${origin}${PYTHON_WORKER_PATH}` : PYTHON_WORKER_PATH;
}

export function getPythonStorageWorkerUrl(): string {
  const origin = getPythonRuntimeOrigin();
  return origin ? `${origin}${PYTHON_STORAGE_WORKER_PATH}` : PYTHON_STORAGE_WORKER_PATH;
}

export function getPythonWheelWorkerUrl(): string {
  const origin = getPythonRuntimeOrigin();
  return origin ? `${origin}${PYTHON_WHEEL_WORKER_PATH}` : PYTHON_WHEEL_WORKER_PATH;
}

export function getPyodideIndexUrl(): string {
  const origin = getPythonRuntimeOrigin();
  return origin ? `${origin}${PYODIDE_INDEX_PATH}` : PYODIDE_INDEX_PATH;
}

export function getPyodideLockFileUrl(): string {
  const origin = getPythonRuntimeOrigin();
  return origin ? `${origin}${PYODIDE_LOCK_PATH}` : PYODIDE_LOCK_PATH;
}

export function getPythonRuntimeBaseUrl(): string {
  const origin = getPythonRuntimeOrigin();
  return origin ? `${origin}${PYTHON_RT_BASE_PATH}` : PYTHON_RT_BASE_PATH;
}
