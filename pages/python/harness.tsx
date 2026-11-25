import { useEffect, useRef, useState } from 'react';

import PageHead from '../../components/PageHead';
import { clearAllPythonData } from '../../components/Python/clearData';
import { DISPLAY_EXAMPLES, PYTHON_EXAMPLES } from '../../lib/python/examples';
import {
  buildNetworkPolicyUrl,
  buildPageCsp,
  buildWorkerCsp,
  parseNetworkPolicyFromSearch,
  validateSelectedHost,
} from '../../lib/python/network';
import type { NetworkPolicy } from '../../lib/python/network';
import { getPythonStorageWorkerUrl, getPythonWorkerUrl } from '../../lib/python/origin';
import { MAX_FILE_BYTES, normalizeWorkspacePath } from '../../lib/python/paths';
import { MAX_PLOT_BYTES, validateWorkerMessage } from '../../lib/python/protocol';
import type { PlotExportFormat } from '../../lib/python/protocol';
import { PackageRestorer } from '../../lib/python/packageRestore';
import type { PackageRestorerOptions } from '../../lib/python/packageRestore';
import * as packages from '../../lib/python/packages';
import * as requirements from '../../lib/python/requirements';
import { PythonStorageClient } from '../../lib/python/storageClient';
import {
  detectBrowserCapabilities,
  detectCapabilityTier,
  registerPythonServiceWorker,
} from '../../lib/python/tiers';
import type { BrowserCapabilityInfo, SwRegistrationResult } from '../../lib/python/tiers';
import * as displayCommands from '../../lib/python/display/commands';
import { DisplayRenderer } from '../../lib/python/display/renderer';
import * as displayProtocol from '../../lib/python/displayProtocol';
import { PythonWorkerClient } from '../../lib/python/workerClient';
import type {
  PlotEvent,
  PlotExportResult,
  PythonWorkerClientOptions,
} from '../../lib/python/workerClient';
import { acquireWorkspaceLock } from '../../lib/python/workspaceLock';
import { exportWorkspaceZip, importZipBytes } from '../../lib/python/zip';

export interface PythonHarnessApi {
  readonly policy: NetworkPolicy;
  readonly capabilities: BrowserCapabilityInfo;
  readonly swResult: SwRegistrationResult | null;
  readonly MAX_FILE_BYTES: number;
  readonly MAX_PLOT_BYTES: number;
  readonly examples: typeof PYTHON_EXAMPLES;
  readonly parseNetworkPolicyFromSearch: typeof parseNetworkPolicyFromSearch;
  readonly buildNetworkPolicyUrl: typeof buildNetworkPolicyUrl;
  readonly validateSelectedHost: typeof validateSelectedHost;
  readonly buildPageCsp: typeof buildPageCsp;
  readonly buildWorkerCsp: typeof buildWorkerCsp;
  readonly detectBrowserCapabilities: typeof detectBrowserCapabilities;
  readonly detectCapabilityTier: typeof detectCapabilityTier;
  readonly registerPythonServiceWorker: typeof registerPythonServiceWorker;
  readonly validateWorkerMessage: typeof validateWorkerMessage;
  readonly normalizeWorkspacePath: typeof normalizeWorkspacePath;
  readonly importZipBytes: typeof importZipBytes;
  readonly exportWorkspaceZip: typeof exportWorkspaceZip;
  readonly acquireWorkspaceLock: typeof acquireWorkspaceLock;
  readonly clearAllPythonData: typeof clearAllPythonData;
  readonly createClient: (options?: PythonWorkerClientOptions) => PythonWorkerClient;
  readonly onPlot: (client: PythonWorkerClient, cb: (plot: PlotEvent) => void) => () => void;
  readonly exportPlot: (
    client: PythonWorkerClient,
    plotId: string,
    format: PlotExportFormat,
  ) => Promise<PlotExportResult>;
  readonly createStorageClient: (workspaceId?: string) => PythonStorageClient;
  readonly packages: typeof packages;
  readonly requirements: typeof requirements;
  readonly createRestorer: (options: PackageRestorerOptions) => PackageRestorer;
  readonly spawnRawWorker: () => Worker;
  readonly spawnRawStorageWorker: () => Worker;
  /** P7a: a renderer drawing the client's display onto the harness canvas (320x240 CSS px box). */
  readonly createDisplayRenderer: (client: PythonWorkerClient) => DisplayRenderer;
  readonly displayCanvas: () => HTMLCanvasElement | null;
  readonly displayProtocol: typeof displayProtocol;
  /** P7b: the batch decoder (malformed-batch checks) and the display examples (not listed until P8). */
  readonly displayCommands: typeof displayCommands;
  readonly displayExamples: typeof DISPLAY_EXAMPLES;
}

declare global {
  interface Window {
    __pythonHarness?: PythonHarnessApi;
  }
}

export default function PythonHarnessPage() {
  const [status, setStatus] = useState<string>('initializing');
  const [policyMode, setPolicyMode] = useState<string>('off');
  const [tierLabel, setTierLabel] = useState<string>('unknown');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const policy = parseNetworkPolicyFromSearch(window.location.search);
    setPolicyMode(policy.mode);

    const publish = (swResult: SwRegistrationResult | null) => {
      const capabilities = detectBrowserCapabilities();
      setTierLabel(
        `Tier ${capabilities.tier} (coi=${String(capabilities.crossOriginIsolated)}, sab=${String(capabilities.hasSab)})`,
      );
      window.__pythonHarness = {
        policy,
        capabilities,
        swResult,
        MAX_FILE_BYTES,
        MAX_PLOT_BYTES,
        examples: PYTHON_EXAMPLES,
        parseNetworkPolicyFromSearch,
        buildNetworkPolicyUrl,
        validateSelectedHost,
        buildPageCsp,
        buildWorkerCsp,
        detectBrowserCapabilities,
        detectCapabilityTier,
        registerPythonServiceWorker,
        validateWorkerMessage,
        normalizeWorkspacePath,
        importZipBytes,
        exportWorkspaceZip,
        acquireWorkspaceLock,
        clearAllPythonData,
        createClient: (options) =>
          new PythonWorkerClient({
            networkMode: policy.mode,
            ...options,
          }),
        onPlot: (client, cb) => client.onPlot(cb),
        exportPlot: (client, plotId, format) => client.exportPlot(plotId, format),
        createStorageClient: (workspaceId) => new PythonStorageClient(workspaceId),
        packages,
        requirements,
        createRestorer: (options) => new PackageRestorer(options),
        spawnRawWorker: () => new Worker(getPythonWorkerUrl(), { type: 'module' }),
        spawnRawStorageWorker: () => new Worker(getPythonStorageWorkerUrl(), { type: 'module' }),
        createDisplayRenderer: (client) => {
          const canvas = canvasRef.current;
          if (!canvas) throw new Error('harness display canvas is not mounted');
          return new DisplayRenderer(client, canvas);
        },
        displayCanvas: () => canvasRef.current,
        displayProtocol,
        displayCommands,
        displayExamples: DISPLAY_EXAMPLES,
      };
    };

    const params = new URLSearchParams(window.location.search);
    const skipAutoReload = params.get('noreload') === '1';
    const skipSwRegister = params.get('nosw') === '1';

    publish(null);
    if (skipSwRegister) {
      publish({ status: 'not-isolated', reason: 'SW registration skipped by ?nosw=1' });
      setStatus('sw:skipped');
      return () => {
        cancelled = true;
      };
    }
    registerPythonServiceWorker({ reloadIfNeeded: !skipAutoReload })
      .then((res) => {
        if (cancelled) return;
        publish(res);
        setStatus(`sw:${res.status}`);
      })
      .catch((err) => {
        if (cancelled) return;
        publish({ status: 'blocked', reason: String(err) });
        setStatus('sw:error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHead
        title="Python engine harness"
        description="Internal verification harness page for the browser Python runtime."
        path="/python/harness"
        noIndex
      />
      <main
        style={{
          fontFamily: 'monospace',
          padding: '24px',
          backgroundColor: '#18181b',
          color: '#f4f4f5',
          minHeight: '100vh',
        }}
      >
        <h1>Python Engine Harness</h1>
        <p data-testid="harness-status">Status: {status}</p>
        <p data-testid="harness-mode">Network mode: {policyMode}</p>
        <p data-testid="harness-tier">Capability: {tierLabel}</p>
        <canvas
          ref={canvasRef}
          data-testid="harness-display"
          width={1}
          height={1}
          style={{ width: 320, height: 240, imageRendering: 'pixelated', background: '#000' }}
        />
      </main>
    </>
  );
}
