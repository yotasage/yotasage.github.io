import type * as MonacoApi from 'monaco-editor';
import React, { useEffect, useImperativeHandle, useRef } from 'react';

import { MonacoNamespace } from '../../lib/notepad/monacoLoader';
import { DiffViewStyle, EditorSettings } from '../../lib/notepad/types';
import { ResolvedTheme } from '../../lib/ui/theme';
import styles from '../../styles/Notepad.module.css';

export interface MonacoDiffPaneHandle {
  goToChange: (direction: 'next' | 'prev') => void;
}

export interface MonacoDiffPaneProps {
  monaco: MonacoNamespace;
  originalModel: MonacoApi.editor.ITextModel;
  modifiedModel: MonacoApi.editor.ITextModel;
  theme: ResolvedTheme;
  settings: EditorSettings;
  diffStyle: DiffViewStyle;
  ignoreWhitespace: boolean;
}

function resolveMonacoTheme(theme: ResolvedTheme): string {
  if (theme === 'hc') return 'hc-black';
  if (theme === 'dark') return 'vs-dark';
  return 'vs';
}

const MonacoDiffPane = React.forwardRef<MonacoDiffPaneHandle, MonacoDiffPaneProps>(function MonacoDiffPane(
  { monaco, originalModel, modifiedModel, theme, settings, diffStyle, ignoreWhitespace },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<MonacoApi.editor.IStandaloneDiffEditor | null>(null);
  const currentChangeIdxRef = useRef<number>(-1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const diffEditor = monaco.editor.createDiffEditor(container, {
      theme: resolveMonacoTheme(theme),
      automaticLayout: true,
      renderSideBySide: diffStyle === 'side-by-side',
      ignoreTrimWhitespace: ignoreWhitespace,
      originalEditable: true,
      readOnly: false,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace",
      fontSize: settings.fontSize,
      lineHeight: Math.round(settings.fontSize * 1.55),
      wordWrap: settings.wordWrap ? 'on' : 'off',
      renderWhitespace: settings.showWhitespace ? 'all' : 'selection',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      useInlineViewWhenSpaceIsLimited: false,
    });

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    diffEditorRef.current = diffEditor;

    return () => {
      diffEditor.setModel(null);
      diffEditor.dispose();
      diffEditorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco]);

  useEffect(() => {
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) return;
    const current = diffEditor.getModel();
    if (!current || current.original !== originalModel || current.modified !== modifiedModel) {
      diffEditor.setModel({
        original: originalModel,
        modified: modifiedModel,
      });
      currentChangeIdxRef.current = -1;
    }
  }, [originalModel, modifiedModel]);

  useEffect(() => {
    monaco.editor.setTheme(resolveMonacoTheme(theme));
  }, [monaco, theme]);

  useEffect(() => {
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) return;
    diffEditor.updateOptions({
      renderSideBySide: diffStyle === 'side-by-side',
      ignoreTrimWhitespace: ignoreWhitespace,
      fontSize: settings.fontSize,
      lineHeight: Math.round(settings.fontSize * 1.55),
      wordWrap: settings.wordWrap ? 'on' : 'off',
      renderWhitespace: settings.showWhitespace ? 'all' : 'selection',
    });
  }, [diffStyle, ignoreWhitespace, settings]);

  useImperativeHandle(
    ref,
    () => ({
      goToChange: (direction: 'next' | 'prev') => {
        const diffEditor = diffEditorRef.current;
        if (!diffEditor) return;
        const changes = diffEditor.getLineChanges();
        if (!changes || changes.length === 0) return;

        let idx = currentChangeIdxRef.current;
        if (direction === 'next') {
          idx = (idx + 1) % changes.length;
        } else {
          idx = idx <= 0 ? changes.length - 1 : idx - 1;
        }
        currentChangeIdxRef.current = idx;
        const change = changes[idx];
        const targetLine = Math.max(1, change.modifiedStartLineNumber || change.originalStartLineNumber || 1);
        const modEditor = diffEditor.getModifiedEditor();
        modEditor.revealLineInCenter(targetLine, monaco.editor.ScrollType.Smooth);
        modEditor.setPosition({ lineNumber: targetLine, column: 1 });
        modEditor.focus();
      },
    }),
    [monaco],
  );

  return <div ref={containerRef} className={styles.monacoHost} data-testid="monaco-diff-editor" />;
});

export default MonacoDiffPane;
