// Self-hosted Monaco Editor component for main.py (reusing lib/ui/monacoLoader.ts).
// Supports Light/Dark/HC theme sync, Ctrl+Enter/Cmd+Enter Run shortcut, traceback markers,
// line jump, and S6's mobile-tuned viewport options.

import type * as MonacoApi from 'monaco-editor';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';

import { loadMonaco, MonacoNamespace } from '../../lib/ui/monacoLoader';
import { useI18n } from '../../lib/ui/i18n';
import type { ResolvedTheme } from '../../lib/ui/theme';
import styles from '../../styles/Python.module.css';

export const DEFAULT_PYTHON_CODE = `# Python 3.14 running locally in your browser (Pyodide)
import sys
import numpy as np

print(f"Python {sys.version.split()[0]} ready!")
values = np.linspace(0, 1, 5)
print("NumPy linspace:", values)

# Try interactive input() too:
# name = input("Your name: ")
# print(f"Hello, {name}!")
`;

export interface EditorErrorMarker {
  readonly line: number;
  readonly column?: number;
  readonly message: string;
}

export interface PythonEditorHandle {
  getValue: () => string;
  setValue: (code: string) => void;
  focus: () => void;
  jumpToLine: (line: number, column?: number) => void;
  setErrorMarkers: (markers: readonly EditorErrorMarker[]) => void;
  layout: () => void;
}

export interface PythonEditorProps {
  initialCode?: string;
  theme: ResolvedTheme;
  onRun: () => void;
  onChange?: (code: string) => void;
}

function resolveMonacoTheme(theme: ResolvedTheme): string {
  if (theme === 'hc') return 'hc-black';
  if (theme === 'dark') return 'vs-dark';
  return 'vs';
}

function isNarrowOrTouchViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

function buildEditorOptions(mobile: boolean): MonacoApi.editor.IEditorOptions {
  if (mobile) {
    return {
      fontSize: 16, // Prevents iOS Safari auto-zoom on focus (S6)
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: false,
      lineDecorationsWidth: 4,
      minimap: { enabled: false },
      overviewRulerLanes: 0,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      hover: { enabled: 'off' },
      automaticLayout: true,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, 'Cascadia Mono', Consolas, monospace",
    };
  }
  return {
    fontSize: 14,
    lineNumbers: 'on',
    lineNumbersMinChars: 4,
    glyphMargin: true,
    folding: true,
    lineDecorationsWidth: 8,
    minimap: { enabled: false },
    overviewRulerLanes: 2,
    wordWrap: 'off',
    scrollBeyondLastLine: false,
    hover: { enabled: 'on' },
    automaticLayout: true,
    fontFamily: "'JetBrains Mono Variable', ui-monospace, 'Cascadia Mono', Consolas, monospace",
  };
}

const MAIN_PY_URI = 'file:///workspace/main.py';

const PythonEditor = React.forwardRef<PythonEditorHandle, PythonEditorProps>(function PythonEditor(
  { initialCode = DEFAULT_PYTHON_CODE, theme, onRun, onChange },
  ref,
) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<MonacoNamespace | null>(null);
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<MonacoApi.editor.ITextModel | null>(null);
  const codeRef = useRef<string>(initialCode);
  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onChange);
  const themeRef = useRef(theme);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  onRunRef.current = onRun;
  onChangeRef.current = onChange;
  themeRef.current = theme;

  useEffect(() => {
    let disposed = false;
    let changeSub: MonacoApi.IDisposable | null = null;
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 768px), (pointer: coarse)')
        : null;

    const handleMediaChange = () => {
      editorRef.current?.updateOptions(buildEditorOptions(isNarrowOrTouchViewport()));
    };

    loadMonaco()
      .then((monaco) => {
        if (disposed || !hostRef.current) return;
        monacoRef.current = monaco;
        monaco.editor.setTheme(resolveMonacoTheme(themeRef.current));

        const uri = monaco.Uri.parse(MAIN_PY_URI);
        let model = monaco.editor.getModel(uri);
        if (!model) {
          model = monaco.editor.createModel(codeRef.current, 'python', uri);
        } else {
          monaco.editor.setModelLanguage(model, 'python');
          if (model.getValue() !== codeRef.current) {
            model.setValue(codeRef.current);
          }
        }
        model.updateOptions({ tabSize: 4, insertSpaces: true });
        modelRef.current = model;

        const editor = monaco.editor.create(hostRef.current, {
          model,
          ...buildEditorOptions(isNarrowOrTouchViewport()),
        });
        editorRef.current = editor;

        editor.addAction({
          id: 'yotasage.python.run',
          label: 'Run Python Script',
          keybindings: [
            monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
            monaco.KeyMod.WinCtrl | monaco.KeyCode.Enter,
          ],
          run: () => {
            onRunRef.current();
          },
        });

        changeSub = model.onDidChangeContent(() => {
          const val = model.getValue();
          codeRef.current = val;
          onChangeRef.current?.(val);
        });

        if (typeof document !== 'undefined' && document.fonts?.ready) {
          void document.fonts.ready.then(() => {
            if (!disposed) {
              monaco.editor.remeasureFonts();
              editor.layout();
            }
          });
        }

        mq?.addEventListener('change', handleMediaChange);
        setReady(true);
      })
      .catch((err) => {
        if (!disposed) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      disposed = true;
      mq?.removeEventListener('change', handleMediaChange);
      changeSub?.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
      // Dispose the model so a remount starts cleanly.
      modelRef.current?.dispose();
      modelRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco) {
      monaco.editor.setTheme(resolveMonacoTheme(theme));
    }
  }, [theme]);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => modelRef.current?.getValue() ?? codeRef.current,
      setValue: (code: string) => {
        codeRef.current = code;
        if (modelRef.current && modelRef.current.getValue() !== code) {
          modelRef.current.setValue(code);
        }
      },
      focus: () => {
        editorRef.current?.focus();
      },
      jumpToLine: (line: number, column = 1) => {
        const editor = editorRef.current;
        const model = modelRef.current;
        if (!editor || !model) return;
        const maxLine = model.getLineCount();
        const clampedLine = Math.max(1, Math.min(line, maxLine));
        const maxCol = model.getLineMaxColumn(clampedLine);
        const clampedCol = Math.max(1, Math.min(column, maxCol));
        editor.revealLineInCenter(clampedLine);
        editor.setPosition({ lineNumber: clampedLine, column: clampedCol });
        editor.focus();
      },
      setErrorMarkers: (markers: readonly EditorErrorMarker[]) => {
        const monaco = monacoRef.current;
        const model = modelRef.current;
        if (!monaco || !model) return;
        const maxLine = model.getLineCount();
        const monacoMarkers: MonacoApi.editor.IMarkerData[] = markers.map((m) => {
          const line = Math.max(1, Math.min(m.line, maxLine));
          const maxCol = model.getLineMaxColumn(line);
          const startCol = Math.max(1, Math.min(m.column ?? 1, maxCol));
          return {
            severity: monaco.MarkerSeverity.Error,
            message: m.message,
            startLineNumber: line,
            startColumn: startCol,
            endLineNumber: line,
            endColumn: maxCol,
          };
        });
        monaco.editor.setModelMarkers(model, 'python-runtime', monacoMarkers);
      },
      layout: () => {
        editorRef.current?.layout();
      },
    }),
    [],
  );

  return (
    <div className={styles.editorWrap} data-testid="python-editor-wrap">
      {!ready && !loadError && (
        <div className={styles.panePlaceholder}>{t('python.loadingEditor')}</div>
      )}
      {loadError && (
        <div className={styles.paneError} role="alert">
          {t('python.editorLoadFailed', { reason: loadError })}
        </div>
      )}
      <div
        ref={hostRef}
        className={styles.editorHost}
        data-testid="python-monaco-host"
      />
    </div>
  );
});

export default PythonEditor;
