// Multi-tab self-hosted Monaco Editor component for /python/main (reusing lib/ui/monacoLoader.ts).
// Manages one Monaco ITextModel + viewState per open text tab, preserves cursor/undo across switches,
// disposes closed models cleanly, supports Ctrl+Enter/Cmd+Enter Run, traceback markers, and shows
// a binary placeholder with Download for non-text/large files (upgraded to rich viewers in P4b).

import type * as MonacoApi from 'monaco-editor';
import React, { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { baseName, formatByteSize } from '../../lib/python/paths';
import { useI18n } from '../../lib/ui/i18n';
import { loadMonaco, MonacoNamespace } from '../../lib/ui/monacoLoader';
import type { ResolvedTheme } from '../../lib/ui/theme';
import styles from '../../styles/Python.module.css';
import fileStyles from '../../styles/PythonFiles.module.css';
import { getMonacoLanguageForPath } from './fileHelpers';

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

export interface EditorTabItem {
  readonly path: string;
  readonly dirty: boolean;
  readonly isBinary: boolean;
  readonly size: number;
}

export interface EditorErrorMarker {
  readonly line: number;
  readonly column?: number;
  readonly message: string;
}

export interface PythonEditorHandle {
  openTextFile: (path: string, content: string) => void;
  setFileContent: (path: string, content: string) => void;
  getFileValue: (path: string) => string | null;
  getValue: () => string;
  setValue: (code: string) => void;
  renameModel: (fromPath: string, toPath: string) => void;
  disposeModel: (path: string) => void;
  disposeAllModels: () => void;
  focus: () => void;
  jumpToLine: (line: number, column?: number) => void;
  setErrorMarkers: (markers: readonly EditorErrorMarker[], path?: string | null) => void;
  clearAllErrorMarkers: () => void;
  layout: () => void;
}

export interface PythonEditorProps {
  tabs: readonly EditorTabItem[];
  activePath: string | null;
  theme: ResolvedTheme;
  readOnly?: boolean;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onRun: () => void;
  onContentChange?: (path: string, code: string) => void;
  onDownloadFile?: (path: string) => void;
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

function buildEditorOptions(mobile: boolean, readOnly: boolean): MonacoApi.editor.IEditorOptions {
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
      readOnly,
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
    readOnly,
    fontFamily: "'JetBrains Mono Variable', ui-monospace, 'Cascadia Mono', Consolas, monospace",
  };
}

function toModelUriString(path: string): string {
  const encoded = path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `file:///workspace/${encoded}`;
}

interface ManagedModel {
  readonly model: MonacoApi.editor.ITextModel;
  readonly sub: MonacoApi.IDisposable;
}

const PythonEditor = React.forwardRef<PythonEditorHandle, PythonEditorProps>(function PythonEditor(
  {
    tabs,
    activePath,
    theme,
    readOnly = false,
    onSelectTab,
    onCloseTab,
    onRun,
    onContentChange,
    onDownloadFile,
  },
  ref,
) {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const monacoRef = useRef<MonacoNamespace | null>(null);
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);

  const modelsRef = useRef<Map<string, ManagedModel>>(new Map());
  const viewStatesRef = useRef<Map<string, MonacoApi.editor.ICodeEditorViewState | null>>(new Map());
  const textCacheRef = useRef<Map<string, string>>(new Map());
  const suppressPathRef = useRef<string | null>(null);
  const activePathRef = useRef<string | null>(activePath);
  const shownModelPathRef = useRef<string | null>(null);

  const onRunRef = useRef(onRun);
  const onChangeRef = useRef(onContentChange);
  const themeRef = useRef(theme);
  const readOnlyRef = useRef(readOnly);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  onRunRef.current = onRun;
  onChangeRef.current = onContentChange;
  themeRef.current = theme;
  readOnlyRef.current = readOnly;
  activePathRef.current = activePath;

  const ensureModel = (
    monaco: MonacoNamespace,
    path: string,
    initialContent: string,
  ): MonacoApi.editor.ITextModel => {
    const existing = modelsRef.current.get(path);
    if (existing) {
      return existing.model;
    }

    const lang = getMonacoLanguageForPath(path);
    const uri = monaco.Uri.parse(toModelUriString(path));
    let model = monaco.editor.getModel(uri);
    if (!model) {
      model = monaco.editor.createModel(initialContent, lang, uri);
    } else {
      monaco.editor.setModelLanguage(model, lang);
      if (model.getValue() !== initialContent) {
        suppressPathRef.current = path;
        try {
          model.setValue(initialContent);
        } finally {
          suppressPathRef.current = null;
        }
      }
    }
    model.updateOptions({ tabSize: 4, insertSpaces: true });

    const sub = model.onDidChangeContent(() => {
      const val = model!.getValue();
      textCacheRef.current.set(path, val);
      if (suppressPathRef.current === path) return;
      onChangeRef.current?.(path, val);
    });

    modelsRef.current.set(path, { model, sub });
    textCacheRef.current.set(path, model.getValue());
    return model;
  };

  const activateModel = (path: string | null) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const prevPath = shownModelPathRef.current;
    if (prevPath && prevPath !== path && modelsRef.current.has(prevPath)) {
      viewStatesRef.current.set(prevPath, editor.saveViewState());
    }

    if (!path) {
      shownModelPathRef.current = null;
      return;
    }

    const managed = modelsRef.current.get(path);
    if (managed) {
      if (editor.getModel() !== managed.model) {
        editor.setModel(managed.model);
      }
      const savedView = viewStatesRef.current.get(path);
      if (savedView) {
        editor.restoreViewState(savedView);
      }
      shownModelPathRef.current = path;
      editor.layout();
    } else if (textCacheRef.current.has(path)) {
      const model = ensureModel(monaco, path, textCacheRef.current.get(path) ?? '');
      editor.setModel(model);
      const savedView = viewStatesRef.current.get(path);
      if (savedView) {
        editor.restoreViewState(savedView);
      }
      shownModelPathRef.current = path;
      editor.layout();
    }
  };

  useEffect(() => {
    let disposed = false;
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 768px), (pointer: coarse)')
        : null;

    const handleMediaChange = () => {
      editorRef.current?.updateOptions(
        buildEditorOptions(isNarrowOrTouchViewport(), readOnlyRef.current),
      );
    };

    loadMonaco()
      .then((monaco) => {
        if (disposed || !hostRef.current) return;
        monacoRef.current = monaco;
        monaco.editor.setTheme(resolveMonacoTheme(themeRef.current));

        const editor = monaco.editor.create(hostRef.current, {
          model: null,
          ...buildEditorOptions(isNarrowOrTouchViewport(), readOnlyRef.current),
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

        // Materialize any text files queued before Monaco finished loading.
        for (const [path, content] of textCacheRef.current.entries()) {
          ensureModel(monaco, path, content);
        }

        const target = activePathRef.current;
        if (target && modelsRef.current.has(target)) {
          const managed = modelsRef.current.get(target)!;
          editor.setModel(managed.model);
          shownModelPathRef.current = target;
        }

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
      editorRef.current?.dispose();
      editorRef.current = null;
      for (const managed of modelsRef.current.values()) {
        managed.sub.dispose();
        managed.model.dispose();
      }
      modelsRef.current.clear();
      viewStatesRef.current.clear();
      shownModelPathRef.current = null;
    };
  }, []);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (monaco) {
      monaco.editor.setTheme(resolveMonacoTheme(theme));
    }
  }, [theme]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.path === activePath) ?? null,
    [tabs, activePath],
  );

  useEffect(() => {
    if (!ready) return;
    if (activeTab && !activeTab.isBinary) {
      activateModel(activeTab.path);
    }
  }, [ready, activeTab?.path, activeTab?.isBinary]);

  useImperativeHandle(
    ref,
    () => ({
      openTextFile: (path: string, content: string) => {
        textCacheRef.current.set(path, content);
        const monaco = monacoRef.current;
        if (monaco) {
          const existing = modelsRef.current.get(path);
          if (!existing) {
            ensureModel(monaco, path, content);
          } else if (existing.model.getValue() !== content) {
            suppressPathRef.current = path;
            try {
              existing.model.setValue(content);
            } finally {
              suppressPathRef.current = null;
            }
          }
          if (activePathRef.current === path || !shownModelPathRef.current) {
            activateModel(path);
          }
        }
      },
      setFileContent: (path: string, content: string) => {
        textCacheRef.current.set(path, content);
        const managed = modelsRef.current.get(path);
        if (managed && managed.model.getValue() !== content) {
          suppressPathRef.current = path;
          try {
            managed.model.setValue(content);
          } finally {
            suppressPathRef.current = null;
          }
        }
      },
      getFileValue: (path: string) => {
        const managed = modelsRef.current.get(path);
        if (managed) return managed.model.getValue();
        return textCacheRef.current.get(path) ?? null;
      },
      getValue: () => {
        const path = activePathRef.current;
        if (path) {
          const managed = modelsRef.current.get(path);
          if (managed) return managed.model.getValue();
          if (textCacheRef.current.has(path)) return textCacheRef.current.get(path)!;
        }
        return editorRef.current?.getModel()?.getValue() ?? DEFAULT_PYTHON_CODE;
      },
      setValue: (code: string) => {
        const path = activePathRef.current ?? 'main.py';
        textCacheRef.current.set(path, code);
        const managed = modelsRef.current.get(path);
        if (managed && managed.model.getValue() !== code) {
          managed.model.setValue(code);
        }
      },
      renameModel: (fromPath: string, toPath: string) => {
        const prevText =
          modelsRef.current.get(fromPath)?.model.getValue() ?? textCacheRef.current.get(fromPath);
        const prevView = viewStatesRef.current.get(fromPath) ?? null;

        const oldManaged = modelsRef.current.get(fromPath);
        if (oldManaged) {
          if (editorRef.current?.getModel() === oldManaged.model) {
            editorRef.current.setModel(null);
          }
          oldManaged.sub.dispose();
          oldManaged.model.dispose();
          modelsRef.current.delete(fromPath);
        }
        textCacheRef.current.delete(fromPath);
        viewStatesRef.current.delete(fromPath);
        if (shownModelPathRef.current === fromPath) {
          shownModelPathRef.current = null;
        }

        if (prevText !== undefined) {
          textCacheRef.current.set(toPath, prevText);
          if (prevView) viewStatesRef.current.set(toPath, prevView);
          const monaco = monacoRef.current;
          if (monaco) {
            ensureModel(monaco, toPath, prevText);
            if (activePathRef.current === toPath) {
              activateModel(toPath);
            }
          }
        }
      },
      disposeModel: (path: string) => {
        const managed = modelsRef.current.get(path);
        if (managed) {
          if (editorRef.current?.getModel() === managed.model) {
            editorRef.current.setModel(null);
          }
          managed.sub.dispose();
          managed.model.dispose();
          modelsRef.current.delete(path);
        }
        textCacheRef.current.delete(path);
        viewStatesRef.current.delete(path);
        if (shownModelPathRef.current === path) {
          shownModelPathRef.current = null;
        }
      },
      disposeAllModels: () => {
        editorRef.current?.setModel(null);
        for (const managed of modelsRef.current.values()) {
          managed.sub.dispose();
          managed.model.dispose();
        }
        modelsRef.current.clear();
        textCacheRef.current.clear();
        viewStatesRef.current.clear();
        shownModelPathRef.current = null;
      },
      focus: () => {
        editorRef.current?.focus();
      },
      jumpToLine: (line: number, column = 1) => {
        const editor = editorRef.current;
        const model = editor?.getModel();
        if (!editor || !model) return;
        const maxLine = model.getLineCount();
        const clampedLine = Math.max(1, Math.min(line, maxLine));
        const maxCol = model.getLineMaxColumn(clampedLine);
        const clampedCol = Math.max(1, Math.min(column, maxCol));
        editor.revealLineInCenter(clampedLine);
        editor.setPosition({ lineNumber: clampedLine, column: clampedCol });
        editor.focus();
      },
      setErrorMarkers: (markers: readonly EditorErrorMarker[], path?: string | null) => {
        const monaco = monacoRef.current;
        if (!monaco) return;
        const targetPath = path ?? activePathRef.current;
        const model = targetPath
          ? modelsRef.current.get(targetPath)?.model ?? null
          : editorRef.current?.getModel() ?? null;
        if (!model) return;
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
      clearAllErrorMarkers: () => {
        const monaco = monacoRef.current;
        if (!monaco) return;
        for (const managed of modelsRef.current.values()) {
          monaco.editor.setModelMarkers(managed.model, 'python-runtime', []);
        }
      },
      layout: () => {
        editorRef.current?.layout();
      },
    }),
    [],
  );

  // Disambiguate tab labels when two open tabs share the same basename
  const basenameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tab of tabs) {
      const name = baseName(tab.path);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [tabs]);

  const showMonaco = Boolean(activeTab && !activeTab.isBinary);

  return (
    <>
      <div
        className={fileStyles.editorTabBar}
        role="tablist"
        aria-label={t('python.editorTabsAria')}
        data-testid="python-editor-tabs"
      >
        {tabs.map((tab) => {
          const isActive = tab.path === activePath;
          const shortName = baseName(tab.path);
          const label = (basenameCounts.get(shortName) ?? 0) > 1 ? tab.path : shortName;
          return (
            <div
              key={tab.path}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={[
                fileStyles.editorTab,
                isActive ? fileStyles.editorTabActive : '',
              ]
                .filter(Boolean)
                .join(' ')}
              title={tab.path}
              data-testid={`python-tab-${tab.path}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onSelectTab(tab.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTab(tab.path);
                }
              }}
            >
              <span className={fileStyles.editorTabLabel}>{label}</span>
              {tab.dirty && (
                <span
                  className={fileStyles.dirtyDot}
                  aria-label="Unsaved changes"
                  data-testid={`python-tab-dirty-${tab.path}`}
                />
              )}
              <button
                type="button"
                className={fileStyles.editorTabClose}
                aria-label={t('python.editorCloseTab', { file: tab.path })}
                data-testid={`python-tab-close-${tab.path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.path);
                }}
              >
                &times;
              </button>
            </div>
          );
        })}
        <span className={fileStyles.editorTabRightMeta}>Ctrl+Enter</span>
      </div>

      <div className={styles.editorWrap} data-testid="python-editor-wrap">
        {!ready && !loadError && showMonaco && (
          <div className={styles.panePlaceholder}>{t('python.loadingEditor')}</div>
        )}
        {loadError && showMonaco && (
          <div className={styles.paneError} role="alert">
            {t('python.editorLoadFailed', { reason: loadError })}
          </div>
        )}

        {!activeTab && (
          <div className={fileStyles.binaryPlaceholder} data-testid="python-editor-empty">
            <p className={fileStyles.binaryMeta}>{t('python.editorNoFile')}</p>
          </div>
        )}

        {activeTab && activeTab.isBinary && (
          <div className={fileStyles.binaryPlaceholder} data-testid="python-binary-placeholder">
            <div className={fileStyles.binaryFileName}>{activeTab.path}</div>
            <p className={fileStyles.binaryMeta}>
              {t('python.binaryFileNotice', { size: formatByteSize(activeTab.size) })}
            </p>
            {onDownloadFile && (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => onDownloadFile(activeTab.path)}
                data-testid="python-binary-download-btn"
              >
                {t('python.filesDownload')}
              </button>
            )}
          </div>
        )}

        <div
          ref={hostRef}
          className={styles.editorHost}
          style={{ display: showMonaco ? 'block' : 'none' }}
          data-testid="python-monaco-host"
        />
      </div>
    </>
  );
});

export default PythonEditor;
