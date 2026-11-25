// Classifies an error that reached the worker's JavaScript from a Python call (imported by python-worker.js).
// A Stop (SIGINT) can land while Pyodide is still compiling or setting up the call, before the guarded section of
// yotasage_rt.run_script / repl_push starts. Pyodide then throws a PythonError whose traceback ends in
// KeyboardInterrupt (or a ConversionError caused by it); that is a clean interruption, not an internal RuntimeError.

const KI_LAST_LINE = /(^|\n)(builtins\.)?KeyboardInterrupt(: [^\n]*)?\s*$/;

export function isKeyboardInterrupt(err) {
  for (let e = err, i = 0; e && i < 5; e = e.cause, i += 1) {
    if (e.type === 'KeyboardInterrupt') return true;
    if (KI_LAST_LINE.test(typeof e === 'string' ? e : String((e && e.message) || ''))) return true;
  }
  return false;
}

/** The run/REPL result fields for a thrown error: { interrupted, error } with the same shape runner.py returns. */
export function classifyError(err) {
  if (isKeyboardInterrupt(err)) {
    return { interrupted: true, error: { type: 'KeyboardInterrupt', message: '', formatted: 'KeyboardInterrupt\n', frames: [] } };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { interrupted: false, error: { type: 'RuntimeError', message, formatted: `${message}\n`, frames: [] } };
}
