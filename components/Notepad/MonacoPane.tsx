import type * as MonacoApi from 'monaco-editor';
import React, { useEffect, useImperativeHandle, useRef } from 'react';

import { MonacoNamespace } from '../../lib/notepad/monacoLoader';
import { findSelectionOccurrences } from '../../lib/notepad/search';
import { EditorSettings, NotepadDoc, TextMatch } from '../../lib/notepad/types';
import { ResolvedTheme } from '../../lib/ui/theme';
import styles from '../../styles/Notepad.module.css';

export interface SelectionSnapshot {
  paneIndex: number;
  docId: string;
  line: number;
  column: number;
  selectedText: string;
  selectedLength: number;
  selectionMatches: TextMatch[];
  activeMatchIndex: number;
}

export interface MonacoPaneHandle {
  focus: () => void;
  revealMatch: (match: TextMatch, select?: boolean) => void;
  applyFullTextEdit: (nextText: string) => void;
  applyTransformEdit: (
    transform: (input: string) => { output: string; error: string | null },
  ) => { applied: boolean; scope: 'selection' | 'document'; error: string | null };
  jumpSelectionMatch: (direction: 'next' | 'prev') => void;
}

export interface MonacoPaneProps {
  paneIndex: number;
  monaco: MonacoNamespace;
  model: MonacoApi.editor.ITextModel;
  doc: NotepadDoc;
  theme: ResolvedTheme;
  settings: EditorSettings;
  isActive: boolean;
  findMatchesList: readonly TextMatch[];
  activeFindMatchIndex: number;
  onFocusPane: (paneIndex: number) => void;
  onSelectionChange: (snapshot: SelectionSnapshot) => void;
  onOpenFindBar: () => void;
}

function resolveMonacoTheme(theme: ResolvedTheme): string {
  if (theme === 'hc') return 'hc-black';
  if (theme === 'dark') return 'vs-dark';
  return 'vs';
}

const NON_PRINTING_LABELS: Record<number, string> = {
  0x00: 'NUL',
  0x01: 'SOH',
  0x02: 'STX',
  0x03: 'ETX',
  0x04: 'EOT',
  0x05: 'ENQ',
  0x06: 'ACK',
  0x07: 'BEL',
  0x08: 'BS',
  0x0b: 'VT',
  0x0c: 'FF',
  0x0e: 'SO',
  0x0f: 'SI',
  0x1b: 'ESC',
  0x7f: 'DEL',
  0x00a0: 'NBSP',
  0x00ad: 'SHY',
  0x200b: 'ZWSP',
  0x200c: 'ZWNJ',
  0x200d: 'ZWJ',
  0x200e: 'LRM',
  0x200f: 'RLM',
  0x2028: 'LS',
  0x2029: 'PS',
  0x202a: 'LRE',
  0x202b: 'RLE',
  0x202c: 'PDF',
  0x202d: 'LRO',
  0x202e: 'RLO',
  0xfeff: 'BOM',
};

function labelForNonPrinting(code: number): string | null {
  if (NON_PRINTING_LABELS[code]) return NON_PRINTING_LABELS[code];
  if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
    return `0x${code.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return null;
}

const MonacoPane = React.forwardRef<MonacoPaneHandle, MonacoPaneProps>(function MonacoPane(
  {
    paneIndex,
    monaco,
    model,
    doc,
    theme,
    settings,
    isActive,
    findMatchesList,
    activeFindMatchIndex,
    onFocusPane,
    onSelectionChange,
    onOpenFindBar,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const selDecoRef = useRef<MonacoApi.editor.IEditorDecorationsCollection | null>(null);
  const findDecoRef = useRef<MonacoApi.editor.IEditorDecorationsCollection | null>(null);
  const symbolDecoRef = useRef<MonacoApi.editor.IEditorDecorationsCollection | null>(null);
  const selMatchesRef = useRef<TextMatch[]>([]);

  const callbacksRef = useRef({ onFocusPane, onSelectionChange, onOpenFindBar });
  callbacksRef.current = { onFocusPane, onSelectionChange, onOpenFindBar };
  const docIdRef = useRef(doc.id);
  docIdRef.current = doc.id;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSymbolDecorations = (editor: MonacoApi.editor.IStandaloneCodeEditor) => {
    const deco = symbolDecoRef.current;
    const currentModel = editor.getModel();
    if (!deco || !currentModel) return;

    const { wordWrap, symbols } = settingsRef.current;
    if (!symbols.showEol && !symbols.showNonPrinting && !(symbols.showWrapSymbol && wordWrap)) {
      deco.set([]);
      return;
    }

    const visibleRanges = editor.getVisibleRanges();
    const totalLines = currentModel.getLineCount();
    const ranges =
      visibleRanges.length > 0
        ? visibleRanges
        : [new monaco.Range(1, 1, Math.min(totalLines, 200), 1)];

    const eolClassName =
      currentModel.getEndOfLineSequence() === monaco.editor.EndOfLineSequence.CRLF
        ? 'notepad-eol-crlf'
        : 'notepad-eol-lf';
    const wrapCols = editor.getLayoutInfo().viewportColumn;
    const nextDecorations: MonacoApi.editor.IModelDeltaDecoration[] = [];

    for (const vr of ranges) {
      const startLine = Math.max(1, vr.startLineNumber - 10);
      const endLine = Math.min(totalLines, vr.endLineNumber + 10);
      for (let line = startLine; line <= endLine; line++) {
        const lineText = currentModel.getLineContent(line);
        const maxCol = lineText.length + 1;

        if (symbols.showWrapSymbol && wordWrap && wrapCols > 4 && lineText.length > wrapCols) {
          nextDecorations.push({
            range: new monaco.Range(line, Math.max(1, maxCol - 1), line, maxCol),
            options: {
              afterContentClassName: 'notepad-wrap-badge',
            },
          });
        }

        if (symbols.showEol && line < totalLines) {
          nextDecorations.push({
            range: new monaco.Range(line, maxCol, line, maxCol),
            options: {
              afterContentClassName: eolClassName,
            },
          });
        }

        if (symbols.showNonPrinting) {
          for (let i = 0; i < lineText.length; i++) {
            const label = labelForNonPrinting(lineText.charCodeAt(i));
            if (label) {
              nextDecorations.push({
                range: new monaco.Range(line, i + 1, line, i + 2),
                options: {
                  after: {
                    content: label,
                    inlineClassName: 'notepad-nonprint-badge',
                  },
                },
              });
            }
          }
        }
      }
    }

    deco.set(nextDecorations);
  };

  const updateSelectionHighlights = (editor: MonacoApi.editor.IStandaloneCodeEditor) => {
    const currentModel = editor.getModel();
    if (!currentModel) return;
    const selection = editor.getSelection();
    const position = editor.getPosition();
    if (!selection || !position) return;

    const selectedText = selection.isEmpty() ? '' : currentModel.getValueInRange(selection);
    const fullText = currentModel.getValue();
    const matches = selectedText ? findSelectionOccurrences(fullText, selectedText, true) : [];
    selMatchesRef.current = matches;

    const selStartOffset = currentModel.getOffsetAt(selection.getStartPosition());
    let activeIdx = -1;
    if (matches.length > 0) {
      activeIdx = matches.findIndex((m) => m.start === selStartOffset);
      if (activeIdx === -1) activeIdx = 0;
    }

    const decorations: MonacoApi.editor.IModelDeltaDecoration[] = matches.map((m, idx) => ({
      range: new monaco.Range(m.line, m.column, m.endLine, m.endColumn),
      options: {
        className: idx === activeIdx ? 'notepad-sel-match-current' : 'notepad-sel-match',
        overviewRuler: {
          color: idx === activeIdx ? '#059669' : '#34d399',
          darkColor: idx === activeIdx ? '#34d399' : '#10b981',
          position: monaco.editor.OverviewRulerLane.Center,
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }));

    if (selDecoRef.current) {
      selDecoRef.current.set(decorations);
    }

    callbacksRef.current.onSelectionChange({
      paneIndex,
      docId: docIdRef.current,
      line: position.lineNumber,
      column: position.column,
      selectedText,
      selectedLength: selectedText.length,
      selectionMatches: matches,
      activeMatchIndex: activeIdx,
    });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const editor = monaco.editor.create(container, {
      model,
      theme: resolveMonacoTheme(theme),
      automaticLayout: true,
      fontFamily: "'JetBrains Mono Variable', ui-monospace, 'Cascadia Mono', 'SF Mono', Consolas, monospace",
      fontSize: settings.fontSize,
      lineHeight: Math.round(settings.fontSize * 1.55),
      wordWrap: settings.wordWrap ? 'on' : 'off',
      renderWhitespace: settings.symbols.showWhitespaceAndTab ? 'all' : 'selection',
      renderControlCharacters: settings.symbols.showNonPrinting,
      unicodeHighlight: {
        invisibleCharacters: settings.symbols.showNonPrinting,
        ambiguousCharacters: false,
      },
      guides: {
        indentation: settings.symbols.showIndentGuide,
      },
      minimap: { enabled: settings.showMinimap },
      occurrencesHighlight: 'off',
      selectionHighlight: false,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      padding: { top: 8, bottom: 12 },
      renderLineHighlight: 'all',
      bracketPairColorization: { enabled: true },
      tabSize: 2,
    });

    editorRef.current = editor;
    selDecoRef.current = editor.createDecorationsCollection();
    findDecoRef.current = editor.createDecorationsCollection();
    symbolDecoRef.current = editor.createDecorationsCollection();

    const focusSub = editor.onDidFocusEditorWidget(() => {
      callbacksRef.current.onFocusPane(paneIndex);
      updateSelectionHighlights(editor);
    });

    const selSub = editor.onDidChangeCursorSelection(() => {
      updateSelectionHighlights(editor);
    });

    const contentSub = editor.onDidChangeModelContent(() => {
      updateSelectionHighlights(editor);
      updateSymbolDecorations(editor);
    });

    const scrollSub = editor.onDidScrollChange(() => {
      updateSymbolDecorations(editor);
    });

    const layoutSub = editor.onDidLayoutChange(() => {
      updateSymbolDecorations(editor);
    });

    editor.addAction({
      id: `notepad-next-equal-${paneIndex}`,
      label: 'Find Next Equal Selection',
      keybindings: [monaco.KeyCode.F3, monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
      run: () => {
        jumpSelection(editor, 'next');
      },
    });

    editor.addAction({
      id: `notepad-prev-equal-${paneIndex}`,
      label: 'Find Previous Equal Selection',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F3, monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
      run: () => {
        jumpSelection(editor, 'prev');
      },
    });

    editor.addAction({
      id: `notepad-open-find-replace-${paneIndex}`,
      label: 'Open Find & Replace Bar',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH],
      run: () => {
        callbacksRef.current.onOpenFindBar();
      },
    });

    updateSelectionHighlights(editor);
    updateSymbolDecorations(editor);

    return () => {
      focusSub.dispose();
      selSub.dispose();
      contentSub.dispose();
      scrollSub.dispose();
      layoutSub.dispose();
      selDecoRef.current?.clear();
      findDecoRef.current?.clear();
      symbolDecoRef.current?.clear();
      editor.setModel(null);
      editor.dispose();
      editorRef.current = null;
    };
    // Mount editor instance once per pane mount; model and options sync via effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monaco, paneIndex]);

  const jumpSelection = (editor: MonacoApi.editor.IStandaloneCodeEditor, direction: 'next' | 'prev') => {
    const matches = selMatchesRef.current;
    const currentModel = editor.getModel();
    const sel = editor.getSelection();
    if (!currentModel || !sel || matches.length < 2) return;

    const currentOffset = currentModel.getOffsetAt(sel.getStartPosition());
    let currentIdx = matches.findIndex((m) => m.start === currentOffset);
    if (currentIdx === -1) currentIdx = 0;

    const targetIdx =
      direction === 'next'
        ? (currentIdx + 1) % matches.length
        : (currentIdx - 1 + matches.length) % matches.length;
    const target = matches[targetIdx];
    const range = new monaco.Range(target.line, target.column, target.endLine, target.endColumn);
    editor.setSelection(range);
    editor.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
    editor.focus();
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getModel() !== model) {
      editor.setModel(model);
      updateSelectionHighlights(editor);
      updateSymbolDecorations(editor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => {
    monaco.editor.setTheme(resolveMonacoTheme(theme));
  }, [monaco, theme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({
      fontSize: settings.fontSize,
      lineHeight: Math.round(settings.fontSize * 1.55),
      wordWrap: settings.wordWrap ? 'on' : 'off',
      renderWhitespace: settings.symbols.showWhitespaceAndTab ? 'all' : 'selection',
      renderControlCharacters: settings.symbols.showNonPrinting,
      unicodeHighlight: {
        invisibleCharacters: settings.symbols.showNonPrinting,
        ambiguousCharacters: false,
      },
      guides: {
        indentation: settings.symbols.showIndentGuide,
      },
      minimap: { enabled: settings.showMinimap },
    });
    updateSymbolDecorations(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, doc.eol]);

  useEffect(() => {
    const deco = findDecoRef.current;
    if (!deco) return;
    if (!isActive || findMatchesList.length === 0) {
      deco.set([]);
      return;
    }
    const items: MonacoApi.editor.IModelDeltaDecoration[] = findMatchesList.slice(0, 2000).map((m, idx) => ({
      range: new monaco.Range(m.line, m.column, m.endLine, m.endColumn),
      options: {
        className: idx === activeFindMatchIndex ? 'notepad-find-match-current' : 'notepad-find-match',
        overviewRuler: {
          color: idx === activeFindMatchIndex ? '#d97706' : '#f59e0b',
          darkColor: idx === activeFindMatchIndex ? '#fbbf24' : '#d97706',
          position: monaco.editor.OverviewRulerLane.Right,
        },
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    }));
    deco.set(items);
  }, [monaco, isActive, findMatchesList, activeFindMatchIndex]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        editorRef.current?.focus();
      },
      revealMatch: (match: TextMatch, select = true) => {
        const editor = editorRef.current;
        if (!editor) return;
        const range = new monaco.Range(match.line, match.column, match.endLine, match.endColumn);
        if (select) {
          editor.setSelection(range);
        }
        editor.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth);
      },
      applyFullTextEdit: (nextText: string) => {
        const editor = editorRef.current;
        const currentModel = editor?.getModel();
        if (!editor || !currentModel) return;
        const fullRange = currentModel.getFullModelRange();
        editor.pushUndoStop();
        editor.executeEdits('notepad-replace', [{ range: fullRange, text: nextText, forceMoveMarkers: true }]);
        editor.pushUndoStop();
      },
      applyTransformEdit: (transform) => {
        const editor = editorRef.current;
        const currentModel = editor?.getModel();
        if (!editor || !currentModel) {
          return { applied: false, scope: 'document', error: 'Editor is not ready.' };
        }
        const sel = editor.getSelection();
        const hasSelection = Boolean(sel && !sel.isEmpty());
        const targetRange = hasSelection && sel ? sel : currentModel.getFullModelRange();
        const sourceText = currentModel.getValueInRange(targetRange);
        const res = transform(sourceText);
        if (res.error) {
          return { applied: false, scope: hasSelection ? 'selection' : 'document', error: res.error };
        }
        editor.pushUndoStop();
        editor.executeEdits('notepad-mime', [{ range: targetRange, text: res.output, forceMoveMarkers: true }]);
        editor.pushUndoStop();
        return { applied: true, scope: hasSelection ? 'selection' : 'document', error: null };
      },
      jumpSelectionMatch: (direction: 'next' | 'prev') => {
        const editor = editorRef.current;
        if (editor) jumpSelection(editor, direction);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monaco],
  );

  return (
    <div
      ref={containerRef}
      dir={doc.direction}
      data-direction={doc.direction}
      className={[styles.monacoHost, doc.direction === 'rtl' ? styles.monacoHostRtl : ''].filter(Boolean).join(' ')}
      data-testid={`monaco-pane-${paneIndex}`}
      data-doc-id={doc.id}
    />
  );
});

export default MonacoPane;
