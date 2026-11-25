// Main Python Playground workspace controller (/python/main).
// Coordinates SW registration, Web Locks single-tab ownership, Option 3B Storage Worker,
// W1/W4/W5/W7/W8/W9 security gates, PythonWorkerClient lifecycle, File Tree, multi-tab
// Monaco Editor with autosave, xterm.js Console + REPL, Plots and Display tabs, multi-file traceback jumps,
// responsive desktop/phone layout, and the Workbench | Examples | Packages header tabs (the workbench
// stays mounted while another tab shows, so the editor, terminal and a running program are kept).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { OFF_NETWORK_POLICY, parseNetworkPolicyFromSearch } from '../../lib/python/network';
import type { NetworkPolicy } from '../../lib/python/network';
import { baseName } from '../../lib/python/paths';
import type {
  CapabilityTier,
  PlotExportFormat,
  SecurityStatusInfo,
} from '../../lib/python/protocol';
import { detectBrowserCapabilities, registerPythonServiceWorker } from '../../lib/python/tiers';
import {
  PlotExportResult,
  PythonClientState,
  PythonWorkerClient,
  ReadyInfo,
  ReplCompletionsResult,
  ReplPushResult,
} from '../../lib/python/workerClient';
import { useI18n } from '../../lib/ui/i18n';
import { useDesignSystemPage, useTheme } from '../../lib/ui/theme';
import styles from '../../styles/Python.module.css';
import fileStyles from '../../styles/PythonFiles.module.css';
import ToolHeader, { WorkspaceTab } from '../UI/ToolHeader';
import ExamplesGallery, {
  PLAYGROUND_VIEW_ID_PREFIX,
  PlaygroundView,
  playgroundPanelId,
  playgroundTabId,
  useHeaderHeightVar,
  usePlaygroundView,
} from './ExamplesGallery';
import DisplayPanel from './DisplayPanel';
import { extractWorkspaceJumps, TracebackJump } from './fileHelpers';
import FileTree from './FileTree';
import NetworkBanner from './NetworkBanner';
import NetworkDialog from './NetworkDialog';
import { OutputTabBar, PhonePaneTabs, useOutputPanes } from './OutputTabs';
import PackagesPanel, { MissingPackagesNotice } from './PackagesPanel';
import { NetworkModeButton, tierTexts, W2StatusNote } from './PlaygroundNotes';
import PlotsGallery from './PlotsGallery';
import PythonEditor, { EditorErrorMarker, PythonEditorHandle } from './PythonEditor';
import PythonTerminal, { PythonTerminalHandle } from './PythonTerminal';
import {
  W1_ACK_KEY,
  W1FirstVisitDialog,
  W4OnLoadDialog,
  W7FailClosedDialog,
  W8ExternalLinkDialog,
} from './SecurityDialogs';
import { usePackages } from './usePackages';
import { usePlots } from './usePlots';
import { useWorkspace } from './useWorkspace';

export default function PythonPlayground() {
  useDesignSystemPage('#2563eb', '#60a5fa');
  const { theme, mounted: themeMounted } = useTheme();
  const { t } = useI18n();
  const resolvedTheme = themeMounted ? theme : 'light';

  const editorRef = useRef<PythonEditorHandle | null>(null);
  const consoleRef = useRef<PythonTerminalHandle | null>(null);
  const replRef = useRef<PythonTerminalHandle | null>(null);
  const clientRef = useRef<PythonWorkerClient | null>(null);
  const [client, setClient] = useState<PythonWorkerClient | null>(null);
  const displayShownRef = useRef(false);
  const [workspaceH, setWorkspaceH] = useState<number | null>(null);

  // Hydration-safe client state
  const [hydrated, setHydrated] = useState(false);
  const [policy, setPolicy] = useState<NetworkPolicy>(OFF_NETWORK_POLICY);
  const [w1Open, setW1Open] = useState(false);
  const [w4LoadApproved, setW4LoadApproved] = useState(false);
  const [w7Open, setW7Open] = useState(false);
  const [allowUnconfirmed, setAllowUnconfirmed] = useState(false);
  const [pendingExternalUrl, setPendingExternalUrl] = useState<string | null>(null);
  const [networkDialogOpen, setNetworkDialogOpen] = useState(false);
  const [networkDialogPkg, setNetworkDialogPkg] = useState(false);

  // Runtime state
  const [clientState, setClientState] = useState<PythonClientState>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  const [readyInfo, setReadyInfo] = useState<ReadyInfo | null>(null);
  const [securityStatus, setSecurityStatus] = useState<SecurityStatusInfo | null>(null);
  const [detectedTier, setDetectedTier] = useState<CapabilityTier>(1);
  const [awaitingStdin, setAwaitingStdin] = useState(false);
  const [crashReason, setCrashReason] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<string>('');
  const [tracebackJumps, setTracebackJumps] = useState<readonly TracebackJump[]>([]);

  // Panes & responsive state
  const [showFilesSidebar, setShowFilesSidebar] = useState(true);
  const [isNarrow, setIsNarrow] = useState(false);
  const [swSettled, setSwSettled] = useState(false);
  const [view, setView] = usePlaygroundView();
  useHeaderHeightVar();

  const panes = useOutputPanes(isNarrow);
  const { outputTab, setOutputTab, setMobilePane, outputTabRef, isPlotsVisible, showOutputPane, showDisplay } = panes;

  // Plots gallery state & guaranteed Blob URL lifecycle
  const plots = usePlots(panes.isPlotsVisibleRef);
  const addPlotRef = useRef(plots.addPlot);
  addPlotRef.current = plots.addPlot;

  useEffect(() => {
    if (isPlotsVisible && plots.unreadCount > 0) {
      plots.clearUnread();
    }
  }, [isPlotsVisible, plots.unreadCount, plots.clearUnread]);

  // 1. Parse URL policy, W1 acknowledgement, viewport width, and register coi-sw.js on client mount.
  useEffect(() => {
    const parsed = parseNetworkPolicyFromSearch(window.location.search);
    setPolicy(parsed);

    let needsW1 = true;
    try {
      needsW1 = window.localStorage.getItem(W1_ACK_KEY) !== '1';
    } catch {
      needsW1 = true;
    }
    setW1Open(needsW1);
    setW4LoadApproved(parsed.mode === 'off');

    const caps = detectBrowserCapabilities();
    setDetectedTier(caps.tier);

    const mq = window.matchMedia('(max-width: 899px)');
    const syncNarrow = () => setIsNarrow(mq.matches);
    syncNarrow();
    mq.addEventListener('change', syncNarrow);

    setHydrated(true);

    let cancelled = false;
    // Register coi-sw.js so COOP/COEP + CSP headers are in place; never boots Pyodide by itself.
    void registerPythonServiceWorker({ reloadIfNeeded: true }).then((res) => {
      if (cancelled) return;
      if (res.status === 'reloading') return;
      setDetectedTier(detectBrowserCapabilities().tier);
      setSwSettled(true);
    });

    return () => {
      cancelled = true;
      mq.removeEventListener('change', syncNarrow);
    };
  }, []);

  const canBootStorage =
    hydrated && swSettled && !w1Open && (policy.mode === 'off' || w4LoadApproved);

  // 2. Option 3B Storage Worker + Web Locks + Multi-Tab Workspace state
  const workspace = useWorkspace({
    swSettled,
    canBootStorage,
    editorRef,
  });

  const handleWorkerFsChangedRef = useRef(workspace.handleWorkerFsChanged);
  handleWorkerFsChangedRef.current = workspace.handleWorkerFsChanged;

  const canBootWorker =
    canBootStorage && workspace.lockStatus === 'acquired' && workspace.storageReady;

  // Packages tab (P6): PackageRestorer is attached before the worker's first start.
  const packages = usePackages({
    mode: policy.mode,
    running: clientState === 'running' || clientState === 'stopping',
    locked: workspace.lockStatus === 'blocked',
    visible: view === 'packages',
  });
  const { reportRun } = packages;
  const attachPackagesRef = useRef(packages.attach);
  attachPackagesRef.current = packages.attach;

  // 3. Instantiate and boot PythonWorkerClient strictly AFTER W1, W4, Web Lock & Storage boot!
  useEffect(() => {
    if (!canBootWorker) return;

    const client = new PythonWorkerClient({
      networkMode: policy.mode,
      storageClient: workspace.storageRef.current,
    });
    clientRef.current = client;
    setClient(client);
    const detachPackages = attachPackagesRef.current(client, workspace.storageRef.current);

    const unsub = client.subscribe({
      state: (next, detail) => {
        setClientState(next);
        setStatusDetail(detail ?? '');
        if (next !== 'running' && next !== 'stopping') {
          setAwaitingStdin(false);
        }
      },
      status: (_phase, message) => {
        setStatusDetail(message);
      },
      security: (status) => {
        setSecurityStatus(status);
        if (policy.mode === 'off' && !status.cspConfirmed) {
          setW7Open(true);
        }
      },
      stdout: (text) => {
        if (outputTabRef.current === 'repl' && client.state !== 'running' && client.state !== 'stopping') {
          replRef.current?.writeStdout(text);
        } else {
          consoleRef.current?.writeStdout(text);
        }
      },
      stderr: (text) => {
        if (outputTabRef.current === 'repl' && client.state !== 'running' && client.state !== 'stopping') {
          replRef.current?.writeStderr(text);
        } else {
          consoleRef.current?.writeStderr(text);
        }
      },
      stdinRequest: () => {
        setAwaitingStdin(true);
        setOutputTab('console');
        setMobilePane('output');
      },
      linkRequest: (url) => {
        setPendingExternalUrl(url);
      },
      fsChanged: (change) => {
        void handleWorkerFsChangedRef.current(change);
      },
      plot: (event) => {
        addPlotRef.current(event);
      },
      crash: (reason) => {
        setCrashReason(reason);
        setAwaitingStdin(false);
        consoleRef.current?.writeStderr(`\n[Worker stopped: ${reason}]\n`);
      },
    });

    void client
      .start()
      .then((info) => {
        setReadyInfo(info);
        setDetectedTier(info.tier);
        setCrashReason(null);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setCrashReason(msg);
      });

    return () => {
      unsub();
      detachPackages();
      client.dispose();
      clientRef.current = null;
      setClient(null);
    };
  }, [canBootWorker, policy.mode, workspace.storageRef]);

  const runTarget = useMemo(() => {
    if (workspace.activePath && workspace.activePath.toLowerCase().endsWith('.py')) {
      return workspace.activePath;
    }
    if (workspace.entries.some((e) => !e.isDir && e.path === 'main.py')) {
      return 'main.py';
    }
    const firstPy = workspace.entries.find((e) => !e.isDir && e.path.toLowerCase().endsWith('.py'));
    return firstPy?.path ?? 'main.py';
  }, [workspace.activePath, workspace.entries]);

  const handleAcknowledgeW1 = useCallback(() => {
    try {
      window.localStorage.setItem(W1_ACK_KEY, '1');
    } catch {
      // Private windows with blocked storage still proceed for this session.
    }
    setW1Open(false);
  }, []);

  const handleReloadOff = useCallback(() => {
    window.location.assign('/python/main');
  }, []);

  const handleReloadRepair = useCallback(() => {
    try {
      window.sessionStorage.removeItem('python:coi-reload-attempted');
    } catch {
      // Ignore storage error.
    }
    window.location.reload();
  }, []);

  const handleCloseNetworkDialog = useCallback(() => {
    setNetworkDialogOpen(false);
    setNetworkDialogPkg(false);
  }, []);

  const handleConfirmExternalLink = useCallback((url: string) => {
    setPendingExternalUrl(null);
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleRun = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    if (client.state === 'running' || client.state === 'stopping' || client.state === 'booting') {
      return;
    }
    if (client.isFailClosedBlocked && !allowUnconfirmed) {
      setW7Open(true);
      return;
    }

    // Synchronously flush all dirty Monaco tabs to IndexedDB & worker MEMFS before running.
    await workspace.flushDirtyTabs();
    workspace.clearRunCreatedBadges();
    editorRef.current?.clearAllErrorMarkers();
    setTracebackJumps([]);
    setLastRunSummary('');
    setCrashReason(null);
    reportRun(null);
    displayShownRef.current = false;
    setOutputTab('console');
    if (isNarrow) {
      setMobilePane('output');
    }

    try {
      const res = await client.run(undefined, {
        filename: runTarget,
        allowUnconfirmed,
      });
      setAwaitingStdin(false);
      reportRun(res);

      if (res.forceStopped) {
        setLastRunSummary(t('python.runFinishedForceStopped'));
        consoleRef.current?.writeSystem(t('python.runFinishedForceStopped'));
      } else if (res.interrupted) {
        setLastRunSummary(t('python.runFinishedInterrupted', { ms: Math.round(res.durationMs) }));
      } else if (res.ok) {
        setLastRunSummary(t('python.runFinishedOk', { ms: Math.round(res.durationMs) }));
      } else {
        setLastRunSummary(
          t('python.runFinishedError', { code: res.exitCode, ms: Math.round(res.durationMs) }),
        );
      }

      if (res.error) {
        const jumps = extractWorkspaceJumps(res.error);
        setTracebackJumps(jumps);
        if (jumps.length > 0) {
          const byPath = new Map<string, EditorErrorMarker[]>();
          for (const j of jumps) {
            const list = byPath.get(j.path) ?? [];
            list.push({ line: j.line, message: `${res.error.type}: ${res.error.message}` });
            byPath.set(j.path, list);
          }
          for (const [path, markers] of byPath) {
            editorRef.current?.setErrorMarkers(markers, path);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      consoleRef.current?.writeStderr(`${msg}\n`);
    }
  }, [allowUnconfirmed, isNarrow, reportRun, runTarget, t, workspace]);

  const handleStop = useCallback(() => {
    void clientRef.current?.stop();
  }, []);

  const handleForceStop = useCallback(() => {
    void clientRef.current?.forceStop().then(() => {
      setReadyInfo(clientRef.current?.readyInfo ?? null);
      setCrashReason(null);
    });
  }, []);

  const handleRestart = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    setCrashReason(null);
    setTracebackJumps([]);
    editorRef.current?.clearAllErrorMarkers();
    void client
      .restart()
      .then((info) => {
        setReadyInfo(info);
        setDetectedTier(info.tier);
      })
      .catch((err) => {
        setCrashReason(err instanceof Error ? err.message : String(err));
      });
  }, []);

  const handleSendStdin = useCallback((line: string) => {
    const ok = clientRef.current?.sendStdin(line) ?? false;
    if (ok) setAwaitingStdin(false);
  }, []);

  const handleSendStdinEof = useCallback(() => {
    const ok = clientRef.current?.sendStdinEof() ?? false;
    if (ok) setAwaitingStdin(false);
  }, []);

  const handleReplPush = useCallback(
    async (line: string): Promise<ReplPushResult> => {
      const client = clientRef.current;
      if (!client) throw new Error('Python worker is not ready');
      if (client.isFailClosedBlocked && !allowUnconfirmed) {
        setW7Open(true);
        throw new Error('Execution blocked until network block is confirmed.');
      }
      displayShownRef.current = false;
      return client.replPush(line, { allowUnconfirmed });
    },
    [allowUnconfirmed],
  );

  const handleReplComplete = useCallback(async (source: string): Promise<ReplCompletionsResult> => {
    const client = clientRef.current;
    if (!client) return { completions: [], start: 0 };
    return client.replComplete(source);
  }, []);

  const handleExportPlot = useCallback(
    async (plotId: string, format: PlotExportFormat): Promise<PlotExportResult> => {
      const client = clientRef.current;
      if (!client) {
        return { ok: false, plotId, format, error: t('python.plotsExportEvicted') };
      }
      return client.exportPlot(plotId, format);
    },
    [t],
  );

  const handleJumpToTraceback = useCallback(
    async (jump: TracebackJump) => {
      await workspace.openFile(jump.path);
      if (isNarrow) {
        setMobilePane('editor');
      }
      requestAnimationFrame(() => {
        editorRef.current?.jumpToLine(jump.line);
      });
    },
    [isNarrow, workspace],
  );

  const handleOpenFileFromTree = useCallback(
    (path: string) => {
      void workspace.openFile(path, { focus: !isNarrow }).then((ok) => {
        if (ok && isNarrow) {
          setMobilePane('editor');
          requestAnimationFrame(() => editorRef.current?.layout());
        }
      });
    },
    [isNarrow, workspace],
  );

  // A program opened a display: show the Display tab once per run, never again while it runs.
  const handleDisplayOpen = useCallback(() => {
    if (displayShownRef.current) return;
    displayShownRef.current = true;
    showDisplay();
  }, [showDisplay]);

  // Header tabs: re-measure Monaco and xterm when the workbench is shown again.
  const handleViewChange = useCallback(
    (next: PlaygroundView) => {
      setView(next);
      if (next !== 'workbench') return;
      requestAnimationFrame(() => {
        editorRef.current?.layout();
        consoleRef.current?.fit();
        replRef.current?.fit();
      });
    },
    [setView],
  );

  // Examples tab: copy the example (never run it), then show its entry file in the workbench.
  const handleLoadExampleFromGallery = useCallback(
    async (exampleId: string): Promise<boolean> => {
      const ok = await workspace.loadExample(exampleId);
      if (!ok) return false;
      if (isNarrow) setMobilePane('editor');
      handleViewChange('workbench');
      if (!isNarrow) requestAnimationFrame(() => editorRef.current?.focus());
      return true;
    },
    [handleViewChange, isNarrow, workspace],
  );

  const isLockedByOtherTab = workspace.lockStatus === 'blocked';
  const activeTier = readyInfo?.tier ?? detectedTier;
  const isRunning = clientState === 'running' || clientState === 'stopping';
  const isBlockedGate =
    policy.mode === 'off' &&
    securityStatus !== null &&
    !securityStatus.cspConfirmed &&
    !allowUnconfirmed;

  const canRun =
    canBootWorker &&
    !isLockedByOtherTab &&
    (clientState === 'ready' || (clientState === 'blocked' && allowUnconfirmed)) &&
    !isBlockedGate;

  const statusLabel = (() => {
    if (isLockedByOtherTab) return t('python.filesReadOnlyLocked');
    if (policy.mode !== 'off' && !w4LoadApproved) return t('python.statusWaitingApproval');
    switch (clientState) {
      case 'booting':
        return statusDetail || t('python.statusBooting');
      case 'ready':
        return readyInfo ? `${t('python.statusReady')} · Py ${readyInfo.pythonVersion}` : t('python.statusReady');
      case 'running':
        return t('python.statusRunning');
      case 'stopping':
        return t('python.statusStopping');
      case 'crashed':
        return t('python.statusCrashed');
      case 'blocked':
        return allowUnconfirmed ? t('python.statusReady') : t('python.statusBlocked');
      default:
        return t('python.statusIdle');
    }
  })();

  const { badge: tierBadge, desc: tierDesc } = tierTexts(t, activeTier);

  const workspaceTabs = useMemo<readonly WorkspaceTab<PlaygroundView>[]>(
    () => [
      { id: 'workbench', label: t('python.workspaceWorkbench') },
      { id: 'examples', label: t('python.workspaceExamples') },
      {
        id: 'packages',
        label: t('python.workspacePackages'),
        badge: packages.restoreProblems > 0 && view !== 'packages' ? '!' : undefined,
      },
    ],
    [t, packages.restoreProblems, view],
  );

  const showFilesPane = isNarrow ? panes.mobilePane === 'files' : showFilesSidebar;
  const showEditorPane = !isNarrow || panes.mobilePane === 'editor';

  return (
    <div className={styles.page} data-ds="v2">
      <ToolHeader
        title={t('python.title')}
        hardHomeLink
        workspaces={workspaceTabs}
        activeWorkspace={view}
        onWorkspaceChange={handleViewChange}
        workspaceIdPrefix={PLAYGROUND_VIEW_ID_PREFIX}
        allowWideView
        actions={<NetworkModeButton policy={policy} onClick={() => setNetworkDialogOpen(true)} />}
      />

      <NetworkBanner policy={policy} onReloadOff={handleReloadOff} />

      <main className={styles.main}>
        <W2StatusNote tier={activeTier} />

        {/* Trusted second-tab Web Locks notice (outside program output) */}
        {isLockedByOtherTab && (
          <div
            className={fileStyles.lockBanner}
            role="alert"
            data-testid="python-lock-banner"
          >
            <div className={fileStyles.lockBannerBody}>
              <div className={fileStyles.lockBannerTitle}>{t('python.lockBannerTitle')}</div>
              <div className={fileStyles.lockBannerDesc}>{t('python.lockBannerDesc')}</div>
            </div>
            <button
              type="button"
              className={fileStyles.lockBannerBtn}
              onClick={() => {
                void workspace.attemptLock();
              }}
              data-testid="python-lock-retry"
            >
              {t('python.lockBannerRetry')}
            </button>
          </div>
        )}

        {/* Workbench tab: kept mounted (hidden) while Examples shows */}
        <div
          role="tabpanel"
          id={playgroundPanelId('workbench')}
          aria-labelledby={playgroundTabId('workbench')}
          hidden={view !== 'workbench'}
          className={styles.workbenchPanel}
        >
          {/* Action toolbar */}
          <div className={styles.toolbar} role="toolbar" aria-label={t('python.title')}>
            <div className={styles.toolbarLeft}>
              {!isNarrow && (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  aria-pressed={showFilesSidebar}
                  onClick={() => {
                    setShowFilesSidebar((prev) => !prev);
                    requestAnimationFrame(() => {
                      editorRef.current?.layout();
                      consoleRef.current?.fit();
                      replRef.current?.fit();
                    });
                  }}
                  data-testid="python-toggle-files-btn"
                >
                  {showFilesSidebar ? t('python.toggleFilesHide') : t('python.toggleFilesShow')}
                </button>
              )}

              <button
                type="button"
                className={styles.runBtn}
                disabled={!canRun}
                onClick={() => {
                  void handleRun();
                }}
                title={t('python.runTitle', { file: runTarget })}
                data-testid="python-run-btn"
              >
                &#9654; {t('python.run')}{' '}
                <span className={fileStyles.runTargetHint}>{baseName(runTarget)}</span>
              </button>

              {isRunning && (
                <>
                  <button
                    type="button"
                    className={styles.stopBtn}
                    onClick={handleStop}
                    title={t('python.stopTitle')}
                    data-testid="python-stop-btn"
                  >
                    &#9632; {activeTier === 1 && clientState === 'running' ? t('python.stop') : t('python.forceStop')}
                  </button>
                  {activeTier === 1 && clientState === 'running' && (
                    <button
                      type="button"
                      className={styles.forceStopBtn}
                      onClick={handleForceStop}
                      title={t('python.forceStopTitle')}
                      data-testid="python-force-stop-btn"
                    >
                      {t('python.forceStop')}
                    </button>
                  )}
                </>
              )}

              {(clientState === 'crashed' || clientState === 'ready') && !isLockedByOtherTab && (
                <button
                  type="button"
                  className={clientState === 'crashed' ? styles.restartBtnHighlight : styles.secondaryBtn}
                  onClick={handleRestart}
                  title={t('python.restartTitle')}
                  data-testid="python-restart-btn"
                >
                  {t('python.restart')}
                </button>
              )}

              {isBlockedGate && (
                <button
                  type="button"
                  className={styles.dangerOutlineBtn}
                  onClick={() => setW7Open(true)}
                  data-testid="python-open-w7-btn"
                >
                  {t('python.w7Title')}
                </button>
              )}
            </div>

            <div className={styles.toolbarRight}>
              {lastRunSummary && (
                <span className={styles.runSummary} data-testid="python-run-summary">
                  {lastRunSummary}
                </span>
              )}
              <span
                className={[
                  styles.statusPill,
                  clientState === 'running' || clientState === 'stopping'
                    ? styles.statusPillRunning
                    : clientState === 'crashed' || isBlockedGate || isLockedByOtherTab
                      ? styles.statusPillBad
                      : clientState === 'ready'
                        ? styles.statusPillGood
                        : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid="python-status-pill"
              >
                {statusLabel}
              </span>
              <span className={styles.tierPill} title={tierDesc} data-testid="python-tier-pill">
                {tierBadge}
              </span>
            </div>
          </div>

          {/* Missing-package notice (trusted, outside program output; never installs by itself) */}
          <MissingPackagesNotice
            names={packages.missing}
            onOpen={(name) => {
              packages.setDraft(packages.installNameFor(name));
              packages.reportRun(null);
              handleViewChange('packages');
            }}
            onDismiss={() => packages.reportRun(null)}
          />

          {/* Crash notice bar (outside program output) */}
          {crashReason && clientState === 'crashed' && (
            <div className={styles.crashBar} role="alert" data-testid="python-crash-banner">
              <span>{t('python.crashBanner', { reason: crashReason })}</span>
              <button type="button" className={styles.primaryBtnSm} onClick={handleRestart}>
                {t('python.restart')}
              </button>
            </div>
          )}

          {/* Phone pane switcher: Editor | Console | Files | Plots | Display */}
          {isNarrow && (
            <PhonePaneTabs
              panes={panes}
              plotsUnread={plots.unreadCount}
              onPlotsSeen={plots.clearUnread}
              editorRef={editorRef}
              consoleRef={consoleRef}
              replRef={replRef}
            />
          )}

          {/* Main 3-column (desktop with Files) or 2-column / 1-column workspace */}
          <div
            className={[
              styles.workspace,
              !isNarrow && showFilesSidebar ? fileStyles.workspaceWithFiles : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={workspaceH && !isNarrow ? { height: workspaceH, maxHeight: 'none' } : undefined}
            data-python-workspace=""
          >
            {/* Files Sidebar / Phone Files Tab */}
            {showFilesPane && (
              <FileTree
                entries={workspace.entries}
                activePath={workspace.activePath}
                runCreatedPaths={workspace.runCreatedPaths}
                stats={workspace.stats}
                storageEstimate={workspace.storageEstimate}
                disabled={isLockedByOtherTab || !workspace.storageReady}
                running={isRunning}
                locked={isLockedByOtherTab}
                errorMessage={workspace.errorMessage}
                w5NoticeVisible={workspace.w5NoticeVisible}
                onDismissError={workspace.dismissError}
                onDismissW5={workspace.dismissW5}
                onOpenFile={handleOpenFileFromTree}
                onCreateFile={workspace.createFile}
                onCreateFolder={workspace.createFolder}
                onRename={workspace.renamePath}
                onMove={workspace.movePath}
                onDelete={workspace.deletePath}
                onDeleteMany={workspace.deletePaths}
                onResetWorkspace={() => workspace.resetWorkspace({ focus: !isNarrow })}
                onDownload={(path) => {
                  void workspace.downloadFile(path);
                }}
                onUploadFiles={workspace.uploadFiles}
                onImportZip={workspace.importZip}
                onExportZip={workspace.exportZip}
                onOpenExamples={() => handleViewChange('examples')}
              />
            )}

            {/* Middle: Multi-tab Monaco Editor */}
            <section
              className={styles.paneCard}
              style={{ display: showEditorPane ? 'flex' : 'none' }}
              aria-label={t('python.tabEditor')}
            >
              {swSettled ? (
                <PythonEditor
                  ref={editorRef}
                  tabs={workspace.tabs}
                  activePath={workspace.activePath}
                  theme={resolvedTheme}
                  readOnly={isLockedByOtherTab}
                  fileVersion={workspace.fileVersion}
                  readFileBytes={workspace.readFileBytes}
                  onSelectTab={workspace.selectTab}
                  onCloseTab={workspace.closeTab}
                  onRun={() => {
                    void handleRun();
                  }}
                  onContentChange={workspace.handleEditorContentChange}
                  onDownloadFile={(path) => {
                    void workspace.downloadFile(path);
                  }}
                />
              ) : (
                <div className={styles.editorWrap} data-testid="python-editor-wrap">
                  <div className={styles.panePlaceholder}>{t('python.loadingEditor')}</div>
                </div>
              )}
            </section>

            {/* Right: Program output container (strictly framed & labelled per security.md §4) */}
            <section
              className={[styles.paneCard, styles.programOutputFrame].join(' ')}
              style={{ display: showOutputPane ? 'flex' : 'none' }}
              aria-label={t('python.programOutput')}
              data-testid="python-program-output-frame"
            >
              <div className={styles.paneHeader}>
                <div className={styles.paneHeaderLeft}>
                  <span className={styles.programOutputLabel} data-testid="python-program-output-label">
                    {t('python.programOutput')}
                  </span>
                  <OutputTabBar
                    panes={panes}
                    isNarrow={isNarrow}
                    isRunning={isRunning}
                    plotsUnread={plots.unreadCount}
                    onPlotsSeen={plots.clearUnread}
                  />
                </div>
              </div>

              {/* Trusted traceback jump strip (pure React text nodes, zero HTML) */}
              {tracebackJumps.length > 0 && (
                <div className={styles.tracebackStrip} data-testid="python-traceback-strip">
                  <span className={styles.tracebackLabel}>{t('python.tracebackLabel')}</span>
                  {tracebackJumps.map((j) => (
                    <button
                      key={`${j.path}:${j.line}`}
                      type="button"
                      className={styles.tracebackChip}
                      onClick={() => {
                        void handleJumpToTraceback(j);
                      }}
                      data-testid={
                        j.path === 'main.py'
                          ? `python-tb-line-${j.line}`
                          : `python-tb-${j.path}-${j.line}`
                      }
                    >
                      {t('python.tracebackLine', { file: j.path, line: j.line })}
                    </button>
                  ))}
                </div>
              )}

              {swSettled ? (
                <>
                  <PythonTerminal
                    ref={consoleRef}
                    mode="console"
                    visible={showOutputPane && !isPlotsVisible && outputTab === 'console'}
                    theme={resolvedTheme}
                    awaitingStdin={awaitingStdin}
                    onStop={handleStop}
                    onSendStdin={handleSendStdin}
                    onSendStdinEof={handleSendStdinEof}
                    onExternalLink={(url) => setPendingExternalUrl(url)}
                  />

                  <PythonTerminal
                    ref={replRef}
                    mode="repl"
                    visible={showOutputPane && !isPlotsVisible && outputTab === 'repl'}
                    theme={resolvedTheme}
                    replDisabled={isRunning || !readyInfo || isBlockedGate || isLockedByOtherTab}
                    replBanner={
                      readyInfo
                        ? t('python.replReadyBanner', { version: readyInfo.pythonVersion })
                        : undefined
                    }
                    onReplPush={handleReplPush}
                    onReplComplete={handleReplComplete}
                    onExternalLink={(url) => setPendingExternalUrl(url)}
                  />

                  <PlotsGallery
                    visible={showOutputPane && isPlotsVisible}
                    plots={plots.plots}
                    selectedPlotId={plots.selectedPlotId}
                    exportDisabled={isRunning || !readyInfo || isLockedByOtherTab}
                    onSelectPlot={plots.selectPlot}
                    onDeletePlot={plots.deletePlot}
                    onClearAll={plots.clearAllPlots}
                    onExportPlot={handleExportPlot}
                  />
                </>
              ) : (
                <div className={styles.terminalHostWrap}>
                  <div className={styles.panePlaceholder}>{t('python.loadingTerminal')}</div>
                </div>
              )}

              <DisplayPanel
                source={client}
                visible={view === 'workbench' && showOutputPane && panes.isDisplayTab}
                compact={isNarrow}
                onOpen={handleDisplayOpen}
                onScreenshot={plots.addPlot}
                onResizeWorkspace={setWorkspaceH}
              />
            </section>
          </div>
        </div>

        <ExamplesGallery
          hidden={view !== 'examples'}
          disabledReason={
            isLockedByOtherTab
              ? t('python.examplesTabLocked')
              : !workspace.storageReady
                ? t('python.examplesTabNotReady')
                : null
          }
          onLoad={handleLoadExampleFromGallery}
        />

        <PackagesPanel
          hidden={view !== 'packages'}
          pkg={packages}
          mode={policy.mode}
          storageBlocked={workspace.storageBlocked}
          onSwitchToPackageIndex={() => {
            setNetworkDialogPkg(true);
            setNetworkDialogOpen(true);
          }}
        />
      </main>

      {/* Trusted security dialogs — always rendered outside program-output containers */}
      <W1FirstVisitDialog open={hydrated && w1Open} onAcknowledge={handleAcknowledgeW1} />

      <W4OnLoadDialog
        open={hydrated && !w1Open && policy.mode !== 'off' && !w4LoadApproved}
        policy={policy}
        onContinue={() => setW4LoadApproved(true)}
        onReloadOff={handleReloadOff}
      />

      <W7FailClosedDialog
        open={w7Open}
        reason={securityStatus?.reason}
        onReloadRepair={handleReloadRepair}
        onRunAnyway={() => {
          setAllowUnconfirmed(true);
          setW7Open(false);
        }}
        onDismiss={() => setW7Open(false)}
      />

      <W8ExternalLinkDialog
        url={pendingExternalUrl}
        onConfirm={handleConfirmExternalLink}
        onCancel={() => setPendingExternalUrl(null)}
      />

      <NetworkDialog
        open={networkDialogOpen}
        currentPolicy={policy}
        initialMode={networkDialogPkg ? 'pkg' : undefined}
        returnHash={networkDialogPkg ? '#packages' : ''}
        onClose={handleCloseNetworkDialog}
        onBeforeClear={async () => {
          plots.clearAllPlots();
          clientRef.current?.dispose();
          clientRef.current = null;
          await workspace.shutdownForClear();
        }}
      />
    </div>
  );
}
