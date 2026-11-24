import type * as MonacoApi from 'monaco-editor';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HashAlgorithm } from '../../lib/notepad/cryptoHash';
import { applyEol, computeLineDiffStats, detectEol, guessLanguageFromFilename } from '../../lib/notepad/diffStats';
import {
  decodeBytesWithEncoding,
  encodeTextWithEncoding,
  getEncodingLabel,
} from '../../lib/notepad/encoding';
import {
  createNewNotepadDoc,
  downloadDocumentEncoded,
  downloadWorkspaceZip,
  readFilesToNotepadDocs,
  SEARCH_PRESETS,
  SearchPresetId,
} from '../../lib/notepad/fileActions';
import { detectPreviewKind } from '../../lib/notepad/htmlPreview';
import { toMonacoLanguageId } from '../../lib/notepad/languages';
import { MimeToolAction, runMimeTool } from '../../lib/notepad/mimeTools';
import { loadMonaco, MonacoNamespace } from '../../lib/notepad/monacoLoader';
import {
  countAcrossDocuments,
  findMatches,
  getTextStats,
  replaceAllMatches,
  replaceSingleMatch,
} from '../../lib/notepad/search';
import { estimateWorkspaceBytes } from '../../lib/notepad/storage';
import { computeMinimalTextEdit, PaneViewState } from '../../lib/notepad/syncMerge';
import {
  createEqualTrackSizes,
  DEFAULT_SEARCH_OPTIONS,
  DocumentMatchSummary,
  EolMode,
  FileEncoding,
  MAX_GRID_DIM,
  NotepadDoc,
  SearchOptions,
  SymbolSettings,
} from '../../lib/notepad/types';
import { useI18n } from '../../lib/ui/i18n';
import { useTheme } from '../../lib/ui/theme';
import styles from '../../styles/Notepad.module.css';
import DiffControlBar from './DiffControlBar';
import FindReplaceBar from './FindReplaceBar';
import HashDialog from './HashDialog';
import MonacoDiffPane, { MonacoDiffPaneHandle } from './MonacoDiffPane';
import type { MonacoPaneHandle, SelectionSnapshot } from './MonacoPane';
import ResizableGrid from './ResizableGrid';
import StatusBar from './StatusBar';
import StorageSyncDialog from './StorageSyncDialog';
import TabStrip from './TabStrip';
import Toolbar from './Toolbar';
import { useCsvActions } from './useCsvActions';
import { useWorkspaceSync } from './useWorkspaceSync';
import WorkspacePane from './WorkspacePane';

const DEFAULT_PANE_VIEW: PaneViewState = { mode: 'editor', kind: 'auto' };

export default function NotepadWorkspace() {
  const { t } = useI18n();
  const { theme } = useTheme();

  const rawBytesRef = useRef<Map<string, Uint8Array>>(new Map());
  const clearRawBytes = useCallback(() => {
    rawBytesRef.current.clear();
  }, []);

  const {
    workspace,
    viewState,
    setViewState,
    updateDocs,
    updateSettings,
    storageEngine,
    saveState,
    syncOpen,
    setSyncOpen,
    openSyncDialog,
    linkedHandle,
    supportsFsAccess,
    syncMessage,
    syncError,
    flushSaveNow,
    handleExportWorkspace,
    handleImportWorkspace,
    handleLinkLocalFile,
    handleSaveLinkedFile,
    handleLoadLinkedFile,
    handleResetStarter,
  } = useWorkspaceSync({ t, onResetRawBytes: clearRawBytes });

  const [monaco, setMonaco] = useState<MonacoNamespace | null>(null);
  const [monacoError, setMonacoError] = useState<string | null>(null);

  const [findOpen, setFindOpen] = useState(false);
  const [findFocusTrigger, setFindFocusTrigger] = useState(0);
  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [activeFindIdx, setActiveFindIdx] = useState(-1);
  const [allFilesCount, setAllFilesCount] = useState<{ summaries: DocumentMatchSummary[]; total: number } | null>(null);
  const [findFeedback, setFindFeedback] = useState<string | null>(null);

  const [selectionInfo, setSelectionInfo] = useState<SelectionSnapshot | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [draggingFiles, setDraggingFiles] = useState(false);

  const splitContainerRef = useRef<HTMLDivElement>(null);

  const [hashDialogOpen, setHashDialogOpen] = useState(false);
  const [hashDialogAlgo, setHashDialogAlgo] = useState<HashAlgorithm | 'ALL'>('SHA-256');

  const paneRefs = useRef<(MonacoPaneHandle | null)[]>(
    Array.from({ length: MAX_GRID_DIM * MAX_GRID_DIM }, () => null),
  );
  const diffRef = useRef<MonacoDiffPaneHandle | null>(null);

  const modelsRef = useRef<Map<string, { model: MonacoApi.editor.ITextModel; sub: MonacoApi.IDisposable }>>(new Map());
  const suppressingModelSyncRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  useEffect(() => {
    let alive = true;
    loadMonaco()
      .then((api) => {
        if (alive) setMonaco(api);
      })
      .catch((err: unknown) => {
        if (alive) setMonacoError(err instanceof Error ? err.message : 'Unknown Monaco load error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const getOrCreateModel = useCallback(
    (doc: NotepadDoc): MonacoApi.editor.ITextModel | null => {
      if (!monaco) return null;
      const existing = modelsRef.current.get(doc.id);
      if (existing && !existing.model.isDisposed()) {
        return existing.model;
      }

      const monacoLang = toMonacoLanguageId(doc.language);
      const uri = monaco.Uri.parse(`inmemory://scratchpad/${doc.id}`);
      let model = monaco.editor.getModel(uri);
      if (!model || model.isDisposed()) {
        model = monaco.editor.createModel(doc.content, monacoLang, uri);
      } else {
        model.setValue(doc.content);
        monaco.editor.setModelLanguage(model, monacoLang);
      }
      model.setEOL(
        doc.eol === 'CRLF'
          ? monaco.editor.EndOfLineSequence.CRLF
          : monaco.editor.EndOfLineSequence.LF,
      );

      const sub = model.onDidChangeContent(() => {
        if (suppressingModelSyncRef.current || !model || model.isDisposed()) return;
        const nextVal = model.getValue();
        const nextEol: EolMode =
          model.getEndOfLineSequence() === monaco.editor.EndOfLineSequence.CRLF ? 'CRLF' : 'LF';
        rawBytesRef.current.delete(doc.id);
        updateDocs((docs) => {
          const idx = docs.findIndex((d) => d.id === doc.id);
          if (idx === -1) return docs;
          if (docs[idx].content === nextVal && docs[idx].eol === nextEol) return docs;
          const nextDocs = docs.slice();
          nextDocs[idx] = { ...nextDocs[idx], content: nextVal, eol: nextEol, updatedAt: Date.now() };
          return nextDocs;
        });
      });

      modelsRef.current.set(doc.id, { model, sub });
      return model;
    },
    [monaco, updateDocs],
  );

  useEffect(() => {
    if (!monaco) return;
    for (const doc of workspace.docs) {
      const entry = modelsRef.current.get(doc.id);
      if (!entry || entry.model.isDisposed()) continue;
      const targetLang = toMonacoLanguageId(doc.language);
      if (entry.model.getLanguageId() !== targetLang) {
        monaco.editor.setModelLanguage(entry.model, targetLang);
      }
      const targetSeq =
        doc.eol === 'CRLF'
          ? monaco.editor.EndOfLineSequence.CRLF
          : monaco.editor.EndOfLineSequence.LF;
      if (entry.model.getEndOfLineSequence() !== targetSeq) {
        suppressingModelSyncRef.current = true;
        try {
          entry.model.setEOL(targetSeq);
        } finally {
          suppressingModelSyncRef.current = false;
        }
      }
      const edit = computeMinimalTextEdit(entry.model.getValue(), doc.content);
      if (edit) {
        const startPos = entry.model.getPositionAt(edit.startOffset);
        const endPos = entry.model.getPositionAt(edit.endOffset);
        const range = new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column,
        );
        suppressingModelSyncRef.current = true;
        try {
          entry.model.applyEdits([{ range, text: edit.insertText, forceMoveMarkers: false }]);
        } finally {
          suppressingModelSyncRef.current = false;
        }
      }
    }
  }, [monaco, workspace.docs]);

  useEffect(() => {
    const activeIds = new Set(workspace.docs.map((d) => d.id));
    for (const [id, entry] of modelsRef.current.entries()) {
      if (!activeIds.has(id)) {
        entry.sub.dispose();
        if (!entry.model.isDisposed()) entry.model.dispose();
        modelsRef.current.delete(id);
        rawBytesRef.current.delete(id);
      }
    }
  }, [workspace.docs]);

  useEffect(() => {
    return () => {
      for (const entry of modelsRef.current.values()) {
        entry.sub.dispose();
        if (!entry.model.isDisposed()) entry.model.dispose();
      }
      modelsRef.current.clear();
    };
  }, []);

  const docById = useMemo(() => {
    const map = new Map<string, NotepadDoc>();
    for (const d of workspace.docs) map.set(d.id, d);
    return map;
  }, [workspace.docs]);

  const maxVisiblePane =
    viewState.layout === 'single'
      ? 0
      : viewState.layout === 'split'
        ? 1
        : Math.max(0, viewState.gridRows * viewState.gridCols - 1);
  const activePaneIdx = Math.min(viewState.activePane, maxVisiblePane);
  const activeDocId = viewState.paneDocIds[activePaneIdx] ?? workspace.docs[0].id;
  const activeDoc = docById.get(activeDocId) ?? workspace.docs[0];
  const activePaneView = viewState.paneViews[activePaneIdx] ?? DEFAULT_PANE_VIEW;
  const detectedPreviewKind = useMemo(
    () => detectPreviewKind(activeDoc.language, activeDoc.name, activeDoc.content),
    [activeDoc.language, activeDoc.name, activeDoc.content],
  );

  const diffLeftDoc = docById.get(viewState.diffLeftId) ?? workspace.docs[0];
  const diffRightDoc =
    docById.get(viewState.diffRightId) ?? workspace.docs[Math.min(1, workspace.docs.length - 1)];

  const diffStats = useMemo(
    () =>
      viewState.layout === 'diff'
        ? computeLineDiffStats(diffLeftDoc.content, diffRightDoc.content, viewState.diffIgnoreWhitespace)
        : null,
    [viewState.layout, diffLeftDoc.content, diffRightDoc.content, viewState.diffIgnoreWhitespace],
  );

  const activeSearchResult = useMemo(() => {
    if (!findOpen || !findQuery) return { matches: [], error: null };
    return findMatches(activeDoc.content, findQuery, searchOptions);
  }, [findOpen, findQuery, activeDoc.content, searchOptions]);

  const activeTextStats = useMemo(() => getTextStats(activeDoc.content), [activeDoc.content]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setFindOpen(true);
        setFindFocusTrigger((n) => n + 1);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        flushSaveNow();
        showToast(t('notepad.status.saved'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushSaveNow, showToast, t]);

  const assignDocToPane = useCallback(
    (paneIndex: number, docId: string) => {
      setViewState((prev) => {
        const nextPanes = prev.paneDocIds.slice();
        const changed = nextPanes[paneIndex] !== docId;
        nextPanes[paneIndex] = docId;
        const curView = prev.paneViews[paneIndex];
        const nextPaneViews =
          changed && curView && curView.kind !== 'auto'
            ? { ...prev.paneViews, [paneIndex]: { ...curView, kind: 'auto' as const } }
            : prev.paneViews;
        return { ...prev, paneDocIds: nextPanes, activePane: paneIndex, paneViews: nextPaneViews };
      });
    },
    [setViewState],
  );

  const openNewDoc = useCallback(
    (initialContent = '', customName?: string) => {
      let createdId = '';
      updateDocs((docs) => {
        const doc = createNewNotepadDoc(docs, initialContent, customName);
        createdId = doc.id;
        return [...docs, doc];
      });
      if (!createdId) return;
      setViewState((prev) => {
        const targetPane = prev.layout === 'single' ? 0 : prev.activePane;
        const nextPanes = prev.paneDocIds.slice();
        nextPanes[targetPane] = createdId;
        const curView = prev.paneViews[targetPane];
        const nextPaneViews =
          curView && curView.kind !== 'auto'
            ? { ...prev.paneViews, [targetPane]: { ...curView, kind: 'auto' as const } }
            : prev.paneViews;
        return {
          ...prev,
          paneDocIds: nextPanes,
          activePane: targetPane,
          paneViews: nextPaneViews,
          layout: prev.layout === 'diff' ? 'single' : prev.layout,
        };
      });
      window.setTimeout(() => paneRefs.current[activePaneIdx]?.focus(), 30);
    },
    [activePaneIdx, setViewState, updateDocs],
  );

  const handlePasteAsNew = useCallback(async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        const text = await navigator.clipboard.readText();
        openNewDoc(text);
        return;
      }
    } catch {
      // Fall back to empty focused tab
    }
    openNewDoc('');
    showToast(t('notepad.clipboardDenied'));
  }, [openNewDoc, showToast, t]);

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const loaded = await readFilesToNotepadDocs(files, rawBytesRef.current);
      if (loaded.length === 0) return;
      updateDocs((docs) => [...docs, ...loaded]);
      setViewState((prev) => {
        const nextPanes = prev.paneDocIds.slice();
        nextPanes[prev.activePane] = loaded[0].id;
        if (loaded.length >= 2) nextPanes[1] = loaded[1].id;
        return {
          ...prev,
          paneDocIds: nextPanes,
          diffLeftId: loaded.length >= 2 ? loaded[0].id : prev.diffLeftId,
          diffRightId: loaded.length >= 2 ? loaded[1].id : prev.diffRightId,
        };
      });
    },
    [setViewState, updateDocs],
  );

  const handleCloseDoc = useCallback(
    (docId: string) => {
      updateDocs((docs) => {
        const target = docs.find((d) => d.id === docId);
        if (!target || target.pinned) return docs;
        const nextDocs = docs.filter((d) => d.id !== docId);
        return nextDocs.length > 0 ? nextDocs : [createNewNotepadDoc([], '', 'new 1.txt')];
      });
    },
    [updateDocs],
  );

  const handleDuplicateDoc = useCallback(
    (doc: NotepadDoc) => {
      const dot = doc.name.lastIndexOf('.');
      const copyName = dot > 0 ? `${doc.name.slice(0, dot)}-copy${doc.name.slice(dot)}` : `${doc.name}-copy`;
      openNewDoc(doc.content, copyName);
    },
    [openNewDoc],
  );

  const patchDocById = useCallback(
    (docId: string, patchFn: (doc: NotepadDoc) => NotepadDoc) => {
      updateDocs((docs) => docs.map((d) => (d.id === docId ? patchFn(d) : d)));
    },
    [updateDocs],
  );

  const handleRenameDoc = useCallback(
    (docId: string, cleanName: string) => {
      patchDocById(docId, (d) => ({
        ...d,
        name: cleanName,
        language: guessLanguageFromFilename(cleanName),
        updatedAt: Date.now(),
      }));
    },
    [patchDocById],
  );

  const handleTogglePin = useCallback(
    (docId: string) => {
      patchDocById(docId, (d) => ({ ...d, pinned: !d.pinned, updatedAt: Date.now() }));
    },
    [patchDocById],
  );

  const handleChangeLanguage = useCallback(
    (docId: string, lang: string) => {
      patchDocById(docId, (d) => ({ ...d, language: lang, updatedAt: Date.now() }));
    },
    [patchDocById],
  );

  const handleChangeEol = useCallback(
    (docId: string, eol: EolMode) => {
      patchDocById(docId, (d) => ({
        ...d,
        eol,
        content: applyEol(d.content, eol),
        updatedAt: Date.now(),
      }));
    },
    [patchDocById],
  );

  const handleToggleDirection = useCallback(() => {
    patchDocById(activeDoc.id, (d) => ({
      ...d,
      direction: d.direction === 'rtl' ? 'ltr' : 'rtl',
      updatedAt: Date.now(),
    }));
  }, [activeDoc.id, patchDocById]);

  const handleReinterpretEncoding = useCallback(
    (nextEncoding: FileEncoding) => {
      const doc = activeDoc;
      const raw =
        rawBytesRef.current.get(doc.id) ??
        encodeTextWithEncoding(applyEol(doc.content, doc.eol), doc.encoding).bytes;
      rawBytesRef.current.set(doc.id, raw);
      const redecoded = decodeBytesWithEncoding(raw, nextEncoding);
      patchDocById(doc.id, (d) => ({
        ...d,
        content: redecoded,
        eol: detectEol(redecoded),
        encoding: nextEncoding,
        encodingConfidence: 'exact',
        updatedAt: Date.now(),
      }));
      showToast(t('notepad.encoding.reinterpretedToast', { name: getEncodingLabel(nextEncoding) }));
    },
    [activeDoc, patchDocById, showToast, t],
  );

  const handleConvertEncoding = useCallback(
    (nextEncoding: FileEncoding) => {
      const doc = activeDoc;
      const normalized = applyEol(doc.content, doc.eol);
      const encoded = encodeTextWithEncoding(normalized, nextEncoding);
      rawBytesRef.current.set(doc.id, encoded.bytes);
      const finalText = encoded.lossyCount > 0 ? decodeBytesWithEncoding(encoded.bytes, nextEncoding) : doc.content;
      patchDocById(doc.id, (d) => ({
        ...d,
        content: finalText,
        encoding: nextEncoding,
        encodingConfidence: 'exact',
        updatedAt: Date.now(),
      }));
      if (encoded.lossyCount > 0) {
        showToast(
          t('notepad.encoding.convertedLossyToast', {
            name: getEncodingLabel(nextEncoding),
            count: encoded.lossyCount,
          }),
        );
      } else {
        showToast(t('notepad.encoding.convertedToast', { name: getEncodingLabel(nextEncoding) }));
      }
    },
    [activeDoc, patchDocById, showToast, t],
  );

  const handleRunMimeTool = useCallback(
    (action: MimeToolAction) => {
      const pane = paneRefs.current[activePaneIdx];
      if (!pane) {
        const res = runMimeTool(action, activeDoc.content);
        if (res.error) {
          showToast(res.error);
          return;
        }
        patchDocById(activeDoc.id, (d) => ({ ...d, content: res.output, updatedAt: Date.now() }));
        return;
      }
      const outcome = pane.applyTransformEdit((input) => runMimeTool(action, input));
      if (outcome.error) {
        showToast(outcome.error);
      } else {
        showToast(
          outcome.scope === 'selection'
            ? t('notepad.mime.appliedSelection')
            : t('notepad.mime.appliedDoc'),
        );
      }
    },
    [activeDoc.content, activeDoc.id, activePaneIdx, patchDocById, showToast, t],
  );

  const setPaneView = useCallback(
    (paneIdx: number, next: PaneViewState) => {
      setViewState((prev) => ({
        ...prev,
        paneViews: {
          ...prev.paneViews,
          [paneIdx]: next,
        },
      }));
    },
    [setViewState],
  );

  const { handleAlignCsv, handleShrinkCsv } = useCsvActions({
    activeDoc,
    activePaneIdx,
    paneDocIds: viewState.paneDocIds,
    docById,
    paneRefs,
    patchDocById,
    showToast,
  });

  const handleSelectGrid = useCallback(
    (rows: number, cols: number) => {
      const r = Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(rows)));
      const c = Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(cols)));
      setViewState((prev) => ({
        ...prev,
        layout: 'grid',
        gridRows: r,
        gridCols: c,
        gridRowSizes: prev.gridRows === r ? prev.gridRowSizes : createEqualTrackSizes(r),
        gridColSizes: prev.gridCols === c ? prev.gridColSizes : createEqualTrackSizes(c),
        activePane: Math.min(prev.activePane, r * c - 1),
      }));
    },
    [setViewState],
  );

  const handleResetGridSizes = useCallback(() => {
    setViewState((prev) => ({
      ...prev,
      gridRowSizes: createEqualTrackSizes(prev.gridRows),
      gridColSizes: createEqualTrackSizes(prev.gridCols),
    }));
  }, [setViewState]);

  const handleToggleSymbol = useCallback(
    (key: keyof SymbolSettings) => {
      updateSettings((prev) => {
        const nextSymbols = { ...prev.symbols, [key]: !prev.symbols[key] };
        return { ...prev, showWhitespace: nextSymbols.showWhitespaceAndTab, symbols: nextSymbols };
      });
    },
    [updateSettings],
  );

  const handleToggleAllSymbols = useCallback(() => {
    updateSettings((prev) => {
      const cur = prev.symbols;
      const nextVal = !(cur.showWhitespaceAndTab && cur.showEol && cur.showNonPrinting);
      return {
        ...prev,
        showWhitespace: nextVal,
        symbols: { ...cur, showWhitespaceAndTab: nextVal, showEol: nextVal, showNonPrinting: nextVal },
      };
    });
  }, [updateSettings]);

  const handleFindStep = useCallback(
    (direction: 'next' | 'prev') => {
      const list = activeSearchResult.matches;
      if (list.length === 0) return;
      const nextIdx =
        direction === 'next'
          ? (activeFindIdx + 1) % list.length
          : activeFindIdx <= 0
            ? list.length - 1
            : activeFindIdx - 1;
      setActiveFindIdx(nextIdx);
      paneRefs.current[activePaneIdx]?.revealMatch(list[nextIdx], true);
    },
    [activeSearchResult.matches, activeFindIdx, activePaneIdx],
  );

  const applyDocContentChange = useCallback(
    (docId: string, nextText: string) => {
      if (docId === activeDoc.id && paneRefs.current[activePaneIdx]) {
        paneRefs.current[activePaneIdx]?.applyFullTextEdit(nextText);
      } else {
        patchDocById(docId, (d) => ({ ...d, content: nextText, updatedAt: Date.now() }));
      }
    },
    [activeDoc.id, activePaneIdx, patchDocById],
  );

  const handleReplaceOne = useCallback(() => {
    const list = activeSearchResult.matches;
    if (list.length === 0) return;
    const idx = activeFindIdx >= 0 && activeFindIdx < list.length ? activeFindIdx : 0;
    const nextText = replaceSingleMatch(activeDoc.content, list[idx], findQuery, replaceText, searchOptions, activeDoc.eol);
    applyDocContentChange(activeDoc.id, nextText);
    setFindFeedback(t('notepad.find.replacedFeedback', { count: 1 }));
  }, [activeSearchResult.matches, activeFindIdx, activeDoc, findQuery, replaceText, searchOptions, applyDocContentChange, t]);

  const handleReplaceAll = useCallback(() => {
    const res = replaceAllMatches(activeDoc.content, findQuery, replaceText, searchOptions, activeDoc.eol);
    if (res.error || res.count === 0) return;
    applyDocContentChange(activeDoc.id, res.text);
    setActiveFindIdx(-1);
    setFindFeedback(t('notepad.find.replacedFeedback', { count: res.count }));
  }, [activeDoc, findQuery, replaceText, searchOptions, applyDocContentChange, t]);

  const handleReplaceAllOpenFiles = useCallback(() => {
    let totalReplaced = 0;
    updateDocs((docs) => {
      const nextDocs = docs.map((doc) => {
        const res = replaceAllMatches(doc.content, findQuery, replaceText, searchOptions, doc.eol);
        if (res.error || res.count === 0) return doc;
        totalReplaced += res.count;
        return { ...doc, content: res.text, updatedAt: Date.now() };
      });
      return totalReplaced > 0 ? nextDocs : docs;
    });
    setFindFeedback(t('notepad.find.replacedFeedback', { count: totalReplaced }));
  }, [findQuery, replaceText, searchOptions, t, updateDocs]);

  const handleCountActive = useCallback(() => {
    const res = findMatches(activeDoc.content, findQuery, searchOptions);
    if (res.error) return;
    setAllFilesCount(null);
    setFindFeedback(
      res.matches.length === 1
        ? t('notepad.find.oneMatch')
        : t('notepad.find.matches', { count: res.matches.length }),
    );
  }, [activeDoc.content, findQuery, searchOptions, t]);

  const handleCountAllFiles = useCallback(() => {
    const res = countAcrossDocuments(workspace.docs, findQuery, searchOptions);
    if (res.error) return;
    setAllFilesCount({ summaries: res.summaries, total: res.total });
  }, [workspace.docs, findQuery, searchOptions]);

  const handleApplyPreset = useCallback((preset: SearchPresetId) => {
    const cfg = SEARCH_PRESETS[preset];
    setAllFilesCount(null);
    setSearchOptions((prev) => ({ ...prev, mode: cfg.mode }));
    setFindQuery(cfg.findQuery);
    setReplaceText(cfg.replaceText);
    setFindFocusTrigger((n) => n + 1);
  }, []);

  const startSplitResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = splitContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const onMove = (ev: PointerEvent) => {
        const pct = ((ev.clientX - rect.left) / rect.width) * 100;
        const clamped = Math.min(80, Math.max(20, pct));
        setViewState((prev) => ({ ...prev, splitRatio: clamped }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [setViewState],
  );

  const renderPane = (paneIdx: number, showHeader: boolean) => {
    const docId = viewState.paneDocIds[paneIdx] ?? workspace.docs[paneIdx % workspace.docs.length].id;
    const doc = docById.get(docId) ?? workspace.docs[0];
    const model = getOrCreateModel(doc);
    const isPaneActive = activePaneIdx === paneIdx;
    const paneView = viewState.paneViews[paneIdx] ?? DEFAULT_PANE_VIEW;

    return (
      <WorkspacePane
        key={`pane-${paneIdx}`}
        paneIdx={paneIdx}
        showHeader={showHeader}
        docs={workspace.docs}
        doc={doc}
        monaco={monaco}
        monacoError={monacoError}
        model={model}
        theme={theme}
        settings={workspace.settings}
        isPaneActive={isPaneActive}
        paneView={paneView}
        findMatchesList={findOpen ? activeSearchResult.matches : []}
        activeFindMatchIndex={activeFindIdx}
        onAssignRef={(handle) => {
          paneRefs.current[paneIdx] = handle;
        }}
        onActivatePane={() => {
          if (viewState.activePane !== paneIdx) {
            setViewState((prev) => ({ ...prev, activePane: paneIdx }));
          }
        }}
        onAssignDoc={(nextDocId) => assignDocToPane(paneIdx, nextDocId)}
        onChangePaneView={(next) => setPaneView(paneIdx, next)}
        onAlignCsv={(opts) => handleAlignCsv(opts, paneIdx)}
        onShrinkCsv={(delim) => handleShrinkCsv(delim, paneIdx)}
        onSelectionChange={(snap) => {
          if (snap.paneIndex === activePaneIdx || viewState.layout === 'single') {
            setSelectionInfo(snap);
          }
        }}
        onOpenFindBar={() => {
          setFindOpen(true);
          setFindFocusTrigger((n) => n + 1);
        }}
      />
    );
  };

  const diffLeftModel = viewState.layout === 'diff' ? getOrCreateModel(diffLeftDoc) : null;
  const diffRightModel = viewState.layout === 'diff' ? getOrCreateModel(diffRightDoc) : null;

  return (
    <div
      className={[styles.workbench, draggingFiles ? styles.workbenchDragging : ''].filter(Boolean).join(' ')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDraggingFiles(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDraggingFiles(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDraggingFiles(false);
        if (e.dataTransfer.files?.length) void handleUploadFiles(e.dataTransfer.files);
      }}
    >
      <Toolbar
        layout={viewState.layout}
        gridRows={viewState.gridRows}
        gridCols={viewState.gridCols}
        findOpen={findOpen}
        settings={workspace.settings}
        activeLanguage={activeDoc.language}
        activeEncoding={activeDoc.encoding}
        activeDirection={activeDoc.direction}
        activePaneView={activePaneView}
        detectedPreviewKind={detectedPreviewKind}
        onNewDoc={() => openNewDoc('')}
        onPasteAsNew={() => void handlePasteAsNew()}
        onOpenFiles={(files) => void handleUploadFiles(files)}
        onDownloadActive={() => downloadDocumentEncoded(activeDoc)}
        onChangeLayout={(mode) =>
          setViewState((prev) => ({
            ...prev,
            layout: mode,
            activePane: mode === 'single' ? 0 : mode === 'split' ? Math.min(prev.activePane, 1) : prev.activePane,
          }))
        }
        onSelectGrid={handleSelectGrid}
        onResetGridSizes={handleResetGridSizes}
        onToggleFind={() => {
          setFindOpen((open) => {
            if (!open) setFindFocusTrigger((n) => n + 1);
            return !open;
          });
        }}
        onToggleSetting={(key) => updateSettings((prev) => ({ ...prev, [key]: !prev[key] }))}
        onToggleSymbol={handleToggleSymbol}
        onToggleAllSymbols={handleToggleAllSymbols}
        onToggleDirection={handleToggleDirection}
        onChangeLanguage={(lang) => handleChangeLanguage(activeDoc.id, lang)}
        onReinterpretEncoding={handleReinterpretEncoding}
        onConvertEncoding={handleConvertEncoding}
        onRunMimeTool={handleRunMimeTool}
        onOpenHashDialog={(algo) => {
          setHashDialogAlgo(algo);
          setHashDialogOpen(true);
        }}
        onChangeActivePaneView={(next) => setPaneView(activePaneIdx, next)}
        onAlignCsv={(opts) => handleAlignCsv(opts, activePaneIdx)}
        onShrinkCsv={(delim) => handleShrinkCsv(delim, activePaneIdx)}
        onOpenSync={openSyncDialog}
      />

      <TabStrip
        docs={workspace.docs}
        activeDocId={activeDoc.id}
        isDiffMode={viewState.layout === 'diff'}
        onSelectDoc={(docId) => {
          if (viewState.layout === 'diff') {
            setViewState((prev) => {
              const nextPanes = prev.paneDocIds.slice();
              nextPanes[0] = docId;
              return { ...prev, layout: 'single', paneDocIds: nextPanes, activePane: 0 };
            });
          } else {
            assignDocToPane(activePaneIdx, docId);
          }
        }}
        onRenameDoc={handleRenameDoc}
        onDuplicateDoc={handleDuplicateDoc}
        onTogglePin={handleTogglePin}
        onCloseDoc={handleCloseDoc}
        onNewDoc={() => openNewDoc('')}
      />

      {findOpen && viewState.layout !== 'diff' && (
        <FindReplaceBar
          query={findQuery}
          replacement={replaceText}
          options={searchOptions}
          matchCount={activeSearchResult.matches.length}
          activeMatchIndex={activeFindIdx}
          searchError={activeSearchResult.error}
          allFilesResult={allFilesCount}
          feedback={findFeedback}
          focusTrigger={findFocusTrigger}
          onQueryChange={(val) => {
            setFindQuery(val);
            setActiveFindIdx(-1);
            setFindFeedback(null);
            setAllFilesCount(null);
          }}
          onReplacementChange={setReplaceText}
          onOptionsChange={(patch) => {
            setSearchOptions((prev) => ({ ...prev, ...patch }));
            setActiveFindIdx(-1);
            setAllFilesCount(null);
          }}
          onFindStep={handleFindStep}
          onReplaceOne={handleReplaceOne}
          onReplaceAll={handleReplaceAll}
          onReplaceAllOpenFiles={handleReplaceAllOpenFiles}
          onCountActive={handleCountActive}
          onCountAllFiles={handleCountAllFiles}
          onJumpToDoc={(docId) => assignDocToPane(activePaneIdx, docId)}
          onApplyPreset={handleApplyPreset}
          onClose={() => setFindOpen(false)}
        />
      )}

      {viewState.layout === 'diff' && (
        <DiffControlBar
          docs={workspace.docs}
          leftDocId={diffLeftDoc.id}
          rightDocId={diffRightDoc.id}
          diffStyle={viewState.diffStyle}
          ignoreWhitespace={viewState.diffIgnoreWhitespace}
          stats={diffStats}
          onChangeLeft={(docId) => setViewState((prev) => ({ ...prev, diffLeftId: docId }))}
          onChangeRight={(docId) => setViewState((prev) => ({ ...prev, diffRightId: docId }))}
          onSwap={() =>
            setViewState((prev) => ({
              ...prev,
              diffLeftId: prev.diffRightId,
              diffRightId: prev.diffLeftId,
            }))
          }
          onChangeStyle={(style) => setViewState((prev) => ({ ...prev, diffStyle: style }))}
          onToggleIgnoreWhitespace={() =>
            setViewState((prev) => ({ ...prev, diffIgnoreWhitespace: !prev.diffIgnoreWhitespace }))
          }
          onStepChange={(dir) => diffRef.current?.goToChange(dir)}
        />
      )}

      <div className={styles.viewport}>
        {viewState.layout === 'single' && <div className={styles.layoutSingle}>{renderPane(0, false)}</div>}

        {viewState.layout === 'split' && (
          <div ref={splitContainerRef} className={styles.layoutSplit}>
            <div className={styles.splitSlot} style={{ flexBasis: `${viewState.splitRatio}%` }}>
              {renderPane(0, true)}
            </div>
            <div
              className={styles.splitHandle}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side-by-side panes"
              onPointerDown={startSplitResize}
            />
            <div className={styles.splitSlot} style={{ flexBasis: `${100 - viewState.splitRatio}%` }}>
              {renderPane(1, true)}
            </div>
          </div>
        )}

        {viewState.layout === 'grid' && (
          <ResizableGrid
            rows={viewState.gridRows}
            cols={viewState.gridCols}
            colSizes={viewState.gridColSizes}
            rowSizes={viewState.gridRowSizes}
            onChangeColSizes={(next) => setViewState((prev) => ({ ...prev, gridColSizes: next }))}
            onChangeRowSizes={(next) => setViewState((prev) => ({ ...prev, gridRowSizes: next }))}
            renderPane={(idx) => renderPane(idx, true)}
          />
        )}

        {viewState.layout === 'diff' && (
          <div className={styles.layoutSingle}>
            {monaco && diffLeftModel && diffRightModel ? (
              <MonacoDiffPane
                ref={diffRef}
                monaco={monaco}
                originalModel={diffLeftModel}
                modifiedModel={diffRightModel}
                theme={theme}
                settings={workspace.settings}
                diffStyle={viewState.diffStyle}
                ignoreWhitespace={viewState.diffIgnoreWhitespace}
              />
            ) : (
              <div className={styles.editorLoading}>
                {monacoError ? t('notepad.loadError', { error: monacoError }) : t('notepad.loadingEditor')}
              </div>
            )}
          </div>
        )}

        {draggingFiles && (
          <div className={styles.dropOverlay}>
            <span>{t('notepad.dropHint')}</span>
          </div>
        )}
      </div>

      <StatusBar
        saveState={saveState}
        activeDoc={activeDoc}
        textStats={activeTextStats}
        selectionInfo={selectionInfo}
        isDiffMode={viewState.layout === 'diff'}
        toast={toast}
        onJumpSelection={(dir) => paneRefs.current[activePaneIdx]?.jumpSelectionMatch(dir)}
        onUseSelectionInFind={(selectedText) => {
          setFindQuery(selectedText);
          setSearchOptions((prev) => ({ ...prev, mode: 'normal' }));
          setFindOpen(true);
          setFindFocusTrigger((n) => n + 1);
        }}
        onChangeEol={(eol) => handleChangeEol(activeDoc.id, eol)}
        onChangeLanguage={(lang) => handleChangeLanguage(activeDoc.id, lang)}
      />

      <HashDialog
        open={hashDialogOpen}
        initialAlgorithm={hashDialogAlgo}
        activeDoc={activeDoc}
        docs={workspace.docs}
        selectedText={selectionInfo?.selectedText ?? ''}
        onClose={() => setHashDialogOpen(false)}
      />

      <StorageSyncDialog
        open={syncOpen}
        fileCount={workspace.docs.length}
        bytesUsed={estimateWorkspaceBytes(workspace)}
        storageEngine={storageEngine}
        lastSavedAt={workspace.savedAt}
        linkedFileName={linkedHandle?.name ?? null}
        supportsFileSystemAccess={supportsFsAccess}
        statusMessage={syncMessage}
        statusError={syncError}
        onClose={() => setSyncOpen(false)}
        onExportJson={handleExportWorkspace}
        onImportJsonFile={(file) => void handleImportWorkspace(file)}
        onDownloadZip={() => downloadWorkspaceZip(workspace.docs)}
        onLinkLocalFile={() => void handleLinkLocalFile()}
        onSaveLinkedFile={() => void handleSaveLinkedFile()}
        onLoadLinkedFile={() => void handleLoadLinkedFile()}
        onResetStarter={handleResetStarter}
      />
    </div>
  );
}
