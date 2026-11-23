import type * as MonacoApi from 'monaco-editor';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HashAlgorithm } from '../../lib/notepad/cryptoHash';
import { applyEol, computeLineDiffStats, detectEol, guessLanguageFromFilename } from '../../lib/notepad/diffStats';
import {
  decodeBytesWithEncoding,
  detectEncodingFromBytes,
  encodeTextWithEncoding,
  getEncodingLabel,
} from '../../lib/notepad/encoding';
import {
  downloadDocumentEncoded,
  downloadWorkspaceZip,
} from '../../lib/notepad/fileActions';
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
import {
  createDocId,
  estimateWorkspaceBytes,
} from '../../lib/notepad/storage';
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
import MonacoPane, { MonacoPaneHandle, SelectionSnapshot } from './MonacoPane';
import ResizableGrid from './ResizableGrid';
import StatusBar from './StatusBar';
import StorageSyncDialog from './StorageSyncDialog';
import TabStrip from './TabStrip';
import Toolbar from './Toolbar';
import { useWorkspaceSync } from './useWorkspaceSync';

function nextUntitledName(docs: readonly NotepadDoc[]): string {
  const used = new Set(docs.map((d) => d.name.toLowerCase()));
  for (let i = 1; i < 10_000; i++) {
    const candidate = `new ${i}.txt`;
    if (!used.has(candidate)) return candidate;
  }
  return `new ${Date.now()}.txt`;
}

export default function NotepadWorkspace() {
  const { t } = useI18n();
  const { theme } = useTheme();

  const rawBytesRef = useRef<Map<string, Uint8Array>>(new Map());
  const clearRawBytes = useCallback(() => {
    rawBytesRef.current.clear();
  }, []);

  const {
    workspace,
    setWorkspace,
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

  const [splitRatio, setSplitRatio] = useState(50);
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
        // Once the user edits content, invalidate stale uploaded raw byte cache
        rawBytesRef.current.delete(doc.id);
        setWorkspace((prev) => {
          const idx = prev.docs.findIndex((d) => d.id === doc.id);
          if (idx === -1) return prev;
          if (prev.docs[idx].content === nextVal && prev.docs[idx].eol === nextEol) return prev;
          const nextDocs = prev.docs.slice();
          nextDocs[idx] = { ...nextDocs[idx], content: nextVal, eol: nextEol, updatedAt: Date.now() };
          return { ...prev, docs: nextDocs };
        });
      });

      modelsRef.current.set(doc.id, { model, sub });
      return model;
    },
    [monaco],
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
      if (entry.model.getValue() !== doc.content) {
        suppressingModelSyncRef.current = true;
        entry.model.setValue(doc.content);
        suppressingModelSyncRef.current = false;
      }
      if (entry.model.getEndOfLineSequence() !== targetSeq) {
        suppressingModelSyncRef.current = true;
        entry.model.setEOL(targetSeq);
        suppressingModelSyncRef.current = false;
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
    workspace.layout === 'single'
      ? 0
      : workspace.layout === 'split'
        ? 1
        : Math.max(0, workspace.gridRows * workspace.gridCols - 1);
  const activePaneIdx = Math.min(workspace.activePane, maxVisiblePane);
  const activeDocId = workspace.paneDocIds[activePaneIdx] ?? workspace.docs[0].id;
  const activeDoc = docById.get(activeDocId) ?? workspace.docs[0];

  const diffLeftDoc = docById.get(workspace.diffLeftId) ?? workspace.docs[0];
  const diffRightDoc =
    docById.get(workspace.diffRightId) ?? workspace.docs[Math.min(1, workspace.docs.length - 1)];

  const diffStats = useMemo(
    () =>
      workspace.layout === 'diff'
        ? computeLineDiffStats(diffLeftDoc.content, diffRightDoc.content, workspace.diffIgnoreWhitespace)
        : null,
    [workspace.layout, diffLeftDoc.content, diffRightDoc.content, workspace.diffIgnoreWhitespace],
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

  const assignDocToPane = useCallback((paneIndex: number, docId: string) => {
    setWorkspace((prev) => {
      const nextPanes = prev.paneDocIds.slice();
      nextPanes[paneIndex] = docId;
      return { ...prev, paneDocIds: nextPanes, activePane: paneIndex };
    });
  }, []);

  const openNewDoc = useCallback(
    (initialContent = '', customName?: string) => {
      const now = Date.now();
      const id = createDocId();
      setWorkspace((prev) => {
        const name = customName?.trim() || nextUntitledName(prev.docs);
        const doc: NotepadDoc = {
          id,
          name,
          content: initialContent,
          language: guessLanguageFromFilename(name),
          eol: detectEol(initialContent),
          encoding: 'utf-8',
          encodingConfidence: 'exact',
          direction: 'ltr',
          createdAt: now,
          updatedAt: now,
        };
        const targetPane = prev.layout === 'single' ? 0 : prev.activePane;
        const nextPanes = prev.paneDocIds.slice();
        nextPanes[targetPane] = id;
        return {
          ...prev,
          docs: [...prev.docs, doc],
          paneDocIds: nextPanes,
          activePane: targetPane,
          layout: prev.layout === 'diff' ? 'single' : prev.layout,
        };
      });
      window.setTimeout(() => paneRefs.current[activePaneIdx]?.focus(), 30);
    },
    [activePaneIdx],
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

  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const now = Date.now();
    const loaded: NotepadDoc[] = [];
    for (const file of list) {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const detected = detectEncodingFromBytes(bytes);
      const text = decodeBytesWithEncoding(bytes, detected.encoding);
      const id = createDocId();
      rawBytesRef.current.set(id, bytes);
      loaded.push({
        id,
        name: file.name,
        content: text,
        language: guessLanguageFromFilename(file.name),
        eol: detectEol(text),
        encoding: detected.encoding,
        encodingConfidence: detected.confidence,
        direction: 'ltr',
        createdAt: now,
        updatedAt: now,
      });
    }
    setWorkspace((prev) => {
      const nextPanes = prev.paneDocIds.slice();
      nextPanes[prev.activePane] = loaded[0].id;
      if (loaded.length >= 2) nextPanes[1] = loaded[1].id;
      return {
        ...prev,
        docs: [...prev.docs, ...loaded],
        paneDocIds: nextPanes,
        diffLeftId: loaded.length >= 2 ? loaded[0].id : prev.diffLeftId,
        diffRightId: loaded.length >= 2 ? loaded[1].id : prev.diffRightId,
      };
    });
  }, []);

  const handleCloseDoc = useCallback((docId: string) => {
    setWorkspace((prev) => {
      const target = prev.docs.find((d) => d.id === docId);
      if (target?.pinned) return prev;
      let nextDocs = prev.docs.filter((d) => d.id !== docId);
      if (nextDocs.length === 0) {
        const now = Date.now();
        nextDocs = [
          {
            id: createDocId(),
            name: 'new 1.txt',
            content: '',
            language: 'plaintext',
            eol: 'LF',
            encoding: 'utf-8',
            encodingConfidence: 'exact',
            direction: 'ltr',
            createdAt: now,
            updatedAt: now,
          },
        ];
      }
      const fallbackId = nextDocs[0].id;
      const validIds = new Set(nextDocs.map((d) => d.id));
      const nextPanes = prev.paneDocIds.map((id) => (validIds.has(id) ? id : fallbackId));
      return {
        ...prev,
        docs: nextDocs,
        paneDocIds: nextPanes,
        diffLeftId: validIds.has(prev.diffLeftId) ? prev.diffLeftId : fallbackId,
        diffRightId: validIds.has(prev.diffRightId)
          ? prev.diffRightId
          : nextDocs[Math.min(1, nextDocs.length - 1)].id,
      };
    });
  }, []);

  const handleDuplicateDoc = useCallback(
    (doc: NotepadDoc) => {
      const dot = doc.name.lastIndexOf('.');
      const copyName = dot > 0 ? `${doc.name.slice(0, dot)}-copy${doc.name.slice(dot)}` : `${doc.name}-copy`;
      openNewDoc(doc.content, copyName);
    },
    [openNewDoc],
  );

  const handleRenameDoc = useCallback((docId: string, cleanName: string) => {
    setWorkspace((prev) => ({
      ...prev,
      docs: prev.docs.map((d) =>
        d.id === docId
          ? { ...d, name: cleanName, language: guessLanguageFromFilename(cleanName), updatedAt: Date.now() }
          : d,
      ),
    }));
  }, []);

  const handleTogglePin = useCallback((docId: string) => {
    setWorkspace((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.id === docId ? { ...d, pinned: !d.pinned } : d)),
    }));
  }, []);

  const handleChangeLanguage = useCallback((docId: string, lang: string) => {
    setWorkspace((prev) => ({
      ...prev,
      docs: prev.docs.map((d) => (d.id === docId ? { ...d, language: lang } : d)),
    }));
  }, []);

  const handleChangeEol = useCallback((docId: string, eol: EolMode) => {
    setWorkspace((prev) => ({
      ...prev,
      docs: prev.docs.map((d) =>
        d.id === docId ? { ...d, eol, content: applyEol(d.content, eol), updatedAt: Date.now() } : d,
      ),
    }));
  }, []);

  const handleToggleDirection = useCallback(() => {
    const targetId = activeDoc.id;
    setWorkspace((prev) => ({
      ...prev,
      docs: prev.docs.map((d) =>
        d.id === targetId ? { ...d, direction: d.direction === 'rtl' ? 'ltr' : 'rtl' } : d,
      ),
    }));
  }, [activeDoc.id]);

  const handleReinterpretEncoding = useCallback(
    (nextEncoding: FileEncoding) => {
      const doc = activeDoc;
      const raw =
        rawBytesRef.current.get(doc.id) ??
        encodeTextWithEncoding(applyEol(doc.content, doc.eol), doc.encoding).bytes;
      rawBytesRef.current.set(doc.id, raw);
      const redecoded = decodeBytesWithEncoding(raw, nextEncoding);
      setWorkspace((prev) => ({
        ...prev,
        docs: prev.docs.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                content: redecoded,
                eol: detectEol(redecoded),
                encoding: nextEncoding,
                encodingConfidence: 'exact',
                updatedAt: Date.now(),
              }
            : d,
        ),
      }));
      showToast(t('notepad.encoding.reinterpretedToast', { name: getEncodingLabel(nextEncoding) }));
    },
    [activeDoc, showToast, t],
  );

  const handleConvertEncoding = useCallback(
    (nextEncoding: FileEncoding) => {
      const doc = activeDoc;
      const normalized = applyEol(doc.content, doc.eol);
      const encoded = encodeTextWithEncoding(normalized, nextEncoding);
      rawBytesRef.current.set(doc.id, encoded.bytes);
      const finalText = encoded.lossyCount > 0 ? decodeBytesWithEncoding(encoded.bytes, nextEncoding) : doc.content;
      setWorkspace((prev) => ({
        ...prev,
        docs: prev.docs.map((d) =>
          d.id === doc.id
            ? {
                ...d,
                content: finalText,
                encoding: nextEncoding,
                encodingConfidence: 'exact',
                updatedAt: Date.now(),
              }
            : d,
        ),
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
    [activeDoc, showToast, t],
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
        setWorkspace((prev) => ({
          ...prev,
          docs: prev.docs.map((d) =>
            d.id === activeDoc.id ? { ...d, content: res.output, updatedAt: Date.now() } : d,
          ),
        }));
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
    [activeDoc.content, activeDoc.id, activePaneIdx, showToast, t],
  );

  const handleSelectGrid = useCallback((rows: number, cols: number) => {
    const r = Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(rows)));
    const c = Math.max(1, Math.min(MAX_GRID_DIM, Math.floor(cols)));
    setWorkspace((prev) => ({
      ...prev,
      layout: 'grid',
      gridRows: r,
      gridCols: c,
      gridRowSizes: prev.gridRows === r ? prev.gridRowSizes : createEqualTrackSizes(r),
      gridColSizes: prev.gridCols === c ? prev.gridColSizes : createEqualTrackSizes(c),
      activePane: Math.min(prev.activePane, r * c - 1),
    }));
  }, []);

  const handleResetGridSizes = useCallback(() => {
    setWorkspace((prev) => ({
      ...prev,
      gridRowSizes: createEqualTrackSizes(prev.gridRows),
      gridColSizes: createEqualTrackSizes(prev.gridCols),
    }));
  }, []);

  const handleToggleSymbol = useCallback((key: keyof SymbolSettings) => {
    setWorkspace((prev) => {
      const nextSymbols = { ...prev.settings.symbols, [key]: !prev.settings.symbols[key] };
      return {
        ...prev,
        settings: {
          ...prev.settings,
          showWhitespace: nextSymbols.showWhitespaceAndTab,
          symbols: nextSymbols,
        },
      };
    });
  }, []);

  const handleToggleAllSymbols = useCallback(() => {
    setWorkspace((prev) => {
      const cur = prev.settings.symbols;
      const allOn = cur.showWhitespaceAndTab && cur.showEol && cur.showNonPrinting;
      const nextVal = !allOn;
      const nextSymbols: SymbolSettings = {
        ...cur,
        showWhitespaceAndTab: nextVal,
        showEol: nextVal,
        showNonPrinting: nextVal,
      };
      return {
        ...prev,
        settings: {
          ...prev.settings,
          showWhitespace: nextVal,
          symbols: nextSymbols,
        },
      };
    });
  }, []);

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
        setWorkspace((prev) => ({
          ...prev,
          docs: prev.docs.map((d) =>
            d.id === docId ? { ...d, content: nextText, updatedAt: Date.now() } : d,
          ),
        }));
      }
    },
    [activeDoc.id, activePaneIdx],
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
    setWorkspace((prev) => {
      const nextDocs = prev.docs.map((doc) => {
        const res = replaceAllMatches(doc.content, findQuery, replaceText, searchOptions, doc.eol);
        if (res.error || res.count === 0) return doc;
        totalReplaced += res.count;
        return { ...doc, content: res.text, updatedAt: Date.now() };
      });
      return totalReplaced > 0 ? { ...prev, docs: nextDocs } : prev;
    });
    setFindFeedback(t('notepad.find.replacedFeedback', { count: totalReplaced }));
  }, [findQuery, replaceText, searchOptions, t]);

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

  const handleApplyPreset = useCallback(
    (preset: 'joinComma' | 'joinCommaSpace' | 'splitComma' | 'trimTrailing' | 'removeEmpty') => {
      setAllFilesCount(null);
      if (preset === 'joinComma') {
        setSearchOptions((prev) => ({ ...prev, mode: 'extended' }));
        setFindQuery('\\r\\n');
        setReplaceText(',');
      } else if (preset === 'joinCommaSpace') {
        setSearchOptions((prev) => ({ ...prev, mode: 'extended' }));
        setFindQuery('\\r\\n');
        setReplaceText(', ');
      } else if (preset === 'splitComma') {
        setSearchOptions((prev) => ({ ...prev, mode: 'extended' }));
        setFindQuery(',');
        setReplaceText('\\r\\n');
      } else if (preset === 'trimTrailing') {
        setSearchOptions((prev) => ({ ...prev, mode: 'regex' }));
        setFindQuery('[ \\t]+$');
        setReplaceText('');
      } else if (preset === 'removeEmpty') {
        setSearchOptions((prev) => ({ ...prev, mode: 'regex' }));
        setFindQuery('^\\s*\\r?\\n');
        setReplaceText('');
      }
      setFindFocusTrigger((n) => n + 1);
    },
    [],
  );

  const startSplitResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitRatio(Math.min(80, Math.max(20, pct)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const renderPane = (paneIdx: number, showHeader: boolean) => {
    const docId = workspace.paneDocIds[paneIdx] ?? workspace.docs[paneIdx % workspace.docs.length].id;
    const doc = docById.get(docId) ?? workspace.docs[0];
    const model = getOrCreateModel(doc);
    const isPaneActive = activePaneIdx === paneIdx;

    return (
      <div
        key={`pane-${paneIdx}`}
        className={[styles.editorPane, isPaneActive ? styles.editorPaneActive : ''].filter(Boolean).join(' ')}
        onMouseDown={() => {
          if (workspace.activePane !== paneIdx) {
            setWorkspace((prev) => ({ ...prev, activePane: paneIdx }));
          }
        }}
      >
        {showHeader && (
          <div className={styles.paneHeader}>
            <span className={styles.paneIndex}>{t('notepad.pane.label', { n: paneIdx + 1 })}</span>
            <select
              className={styles.paneSelect}
              value={doc.id}
              aria-label={t('notepad.pane.selectFile', { n: paneIdx + 1 })}
              onChange={(e) => assignDocToPane(paneIdx, e.target.value)}
            >
              {workspace.docs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {isPaneActive && <span className={styles.paneActiveLabel}>{t('notepad.pane.active')}</span>}
          </div>
        )}
        <div className={styles.paneBody}>
          {monaco && model ? (
            <MonacoPane
              ref={(handle) => {
                paneRefs.current[paneIdx] = handle;
              }}
              paneIndex={paneIdx}
              monaco={monaco}
              model={model}
              doc={doc}
              theme={theme}
              settings={workspace.settings}
              isActive={isPaneActive}
              findMatchesList={findOpen ? activeSearchResult.matches : []}
              activeFindMatchIndex={activeFindIdx}
              onFocusPane={(idx) =>
                setWorkspace((prev) => (prev.activePane === idx ? prev : { ...prev, activePane: idx }))
              }
              onSelectionChange={(snap) => {
                if (snap.paneIndex === activePaneIdx || workspace.layout === 'single') {
                  setSelectionInfo(snap);
                }
              }}
              onOpenFindBar={() => {
                setFindOpen(true);
                setFindFocusTrigger((n) => n + 1);
              }}
            />
          ) : (
            <div className={styles.editorLoading}>
              {monacoError ? t('notepad.loadError', { error: monacoError }) : t('notepad.loadingEditor')}
            </div>
          )}
        </div>
      </div>
    );
  };

  const diffLeftModel = workspace.layout === 'diff' ? getOrCreateModel(diffLeftDoc) : null;
  const diffRightModel = workspace.layout === 'diff' ? getOrCreateModel(diffRightDoc) : null;

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
        layout={workspace.layout}
        gridRows={workspace.gridRows}
        gridCols={workspace.gridCols}
        findOpen={findOpen}
        settings={workspace.settings}
        activeLanguage={activeDoc.language}
        activeEncoding={activeDoc.encoding}
        activeDirection={activeDoc.direction}
        onNewDoc={() => openNewDoc('')}
        onPasteAsNew={() => void handlePasteAsNew()}
        onOpenFiles={(files) => void handleUploadFiles(files)}
        onDownloadActive={() => downloadDocumentEncoded(activeDoc)}
        onChangeLayout={(mode) =>
          setWorkspace((prev) => ({
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
        onToggleSetting={(key) =>
          setWorkspace((prev) => ({
            ...prev,
            settings: { ...prev.settings, [key]: !prev.settings[key] },
          }))
        }
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
        onOpenSync={openSyncDialog}
      />

      <TabStrip
        docs={workspace.docs}
        activeDocId={activeDoc.id}
        isDiffMode={workspace.layout === 'diff'}
        onSelectDoc={(docId) => {
          if (workspace.layout === 'diff') {
            setWorkspace((prev) => {
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

      {findOpen && workspace.layout !== 'diff' && (
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

      {workspace.layout === 'diff' && (
        <DiffControlBar
          docs={workspace.docs}
          leftDocId={diffLeftDoc.id}
          rightDocId={diffRightDoc.id}
          diffStyle={workspace.diffStyle}
          ignoreWhitespace={workspace.diffIgnoreWhitespace}
          stats={diffStats}
          onChangeLeft={(docId) => setWorkspace((prev) => ({ ...prev, diffLeftId: docId }))}
          onChangeRight={(docId) => setWorkspace((prev) => ({ ...prev, diffRightId: docId }))}
          onSwap={() =>
            setWorkspace((prev) => ({
              ...prev,
              diffLeftId: prev.diffRightId,
              diffRightId: prev.diffLeftId,
            }))
          }
          onChangeStyle={(style) => setWorkspace((prev) => ({ ...prev, diffStyle: style }))}
          onToggleIgnoreWhitespace={() =>
            setWorkspace((prev) => ({ ...prev, diffIgnoreWhitespace: !prev.diffIgnoreWhitespace }))
          }
          onStepChange={(dir) => diffRef.current?.goToChange(dir)}
        />
      )}

      <div className={styles.viewport}>
        {workspace.layout === 'single' && <div className={styles.layoutSingle}>{renderPane(0, false)}</div>}

        {workspace.layout === 'split' && (
          <div ref={splitContainerRef} className={styles.layoutSplit}>
            <div className={styles.splitSlot} style={{ flexBasis: `${splitRatio}%` }}>
              {renderPane(0, true)}
            </div>
            <div
              className={styles.splitHandle}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side-by-side panes"
              onPointerDown={startSplitResize}
            />
            <div className={styles.splitSlot} style={{ flexBasis: `${100 - splitRatio}%` }}>
              {renderPane(1, true)}
            </div>
          </div>
        )}

        {workspace.layout === 'grid' && (
          <ResizableGrid
            rows={workspace.gridRows}
            cols={workspace.gridCols}
            colSizes={workspace.gridColSizes}
            rowSizes={workspace.gridRowSizes}
            onChangeColSizes={(next) => setWorkspace((prev) => ({ ...prev, gridColSizes: next }))}
            onChangeRowSizes={(next) => setWorkspace((prev) => ({ ...prev, gridRowSizes: next }))}
            renderPane={(idx) => renderPane(idx, true)}
          />
        )}

        {workspace.layout === 'diff' && (
          <div className={styles.layoutSingle}>
            {monaco && diffLeftModel && diffRightModel ? (
              <MonacoDiffPane
                ref={diffRef}
                monaco={monaco}
                originalModel={diffLeftModel}
                modifiedModel={diffRightModel}
                theme={theme}
                settings={workspace.settings}
                diffStyle={workspace.diffStyle}
                ignoreWhitespace={workspace.diffIgnoreWhitespace}
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
        isDiffMode={workspace.layout === 'diff'}
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
