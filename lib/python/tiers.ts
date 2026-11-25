// Service Worker registration (with S1 blocked-SW & reload-once guards) and capability tier detection.

import { PYTHON_SCOPE_PATH, PYTHON_SW_PATH } from './origin';
import type { CapabilityTier } from './protocol';

export const COI_RELOAD_GUARD_KEY = 'python:coi-reload-attempted';

export interface TierCapabilities {
  readonly tier: CapabilityTier;
  readonly blockingInput: boolean;
  readonly softStop: boolean;
  readonly display: boolean;
  readonly asyncioSyncLoop: boolean;
}

export interface BrowserCapabilityInfo extends TierCapabilities {
  readonly crossOriginIsolated: boolean;
  readonly hasSab: boolean;
  readonly hasJspi: boolean;
  readonly swSupported: boolean;
  readonly swControlled: boolean;
  readonly secureContext: boolean;
}

export type SwRegistrationResult =
  | { readonly status: 'isolated'; readonly registration: ServiceWorkerRegistration }
  | { readonly status: 'reloading' }
  | {
      readonly status: 'unsupported' | 'blocked' | 'reload-failed' | 'not-isolated';
      readonly reason?: string;
    };

export function detectCapabilityTier(
  crossOriginIsolated: boolean,
  canRunSync: boolean,
): TierCapabilities {
  const hasSab = typeof SharedArrayBuffer === 'function';
  if (crossOriginIsolated && hasSab) {
    return {
      tier: 1,
      blockingInput: true,
      softStop: true,
      display: true,
      asyncioSyncLoop: true,
    };
  }
  if (canRunSync) {
    return {
      tier: 2,
      blockingInput: true,
      softStop: false,
      display: false,
      asyncioSyncLoop: false,
    };
  }
  return {
    tier: 3,
    blockingInput: false,
    softStop: false,
    display: false,
    asyncioSyncLoop: false,
  };
}

export function detectBrowserCapabilities(): BrowserCapabilityInfo {
  const secureContext = typeof window !== 'undefined' && window.isSecureContext === true;
  const crossOriginIsolated =
    typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const hasSab = typeof SharedArrayBuffer === 'function';
  const wasm =
    typeof WebAssembly !== 'undefined'
      ? (WebAssembly as unknown as Record<string, unknown>)
      : {};
  const hasJspi =
    typeof wasm.Suspending === 'function' && typeof wasm.promising === 'function';
  const swSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const swControlled = swSupported && Boolean(navigator.serviceWorker.controller);

  const tierCaps = detectCapabilityTier(crossOriginIsolated, hasJspi);
  return {
    ...tierCaps,
    crossOriginIsolated,
    hasSab,
    hasJspi,
    swSupported,
    swControlled,
    secureContext,
  };
}

function readReloadGuard(): boolean {
  try {
    return sessionStorage.getItem(COI_RELOAD_GUARD_KEY) === '1';
  } catch {
    return false;
  }
}

function writeReloadGuard(active: boolean): void {
  try {
    if (active) {
      sessionStorage.setItem(COI_RELOAD_GUARD_KEY, '1');
    } else {
      sessionStorage.removeItem(COI_RELOAD_GUARD_KEY);
    }
  } catch {
    // Storage may be unavailable in strict private windows.
  }
}

export interface RegisterSwOptions {
  readonly reloadIfNeeded?: boolean;
  readonly checkForUpdate?: boolean;
}

/**
 * Registers /python/coi-sw.js (scope /python/) with S1's verified guards:
 * - Guards missing navigator.serviceWorker
 * - Guards register() resolving to undefined (Playwright serviceWorkers:'block' & strict policies)
 * - Reloads at most once via sessionStorage python:coi-reload-attempted
 */
export async function registerPythonServiceWorker(
  options: RegisterSwOptions = {},
): Promise<SwRegistrationResult> {
  const { reloadIfNeeded = true, checkForUpdate = false } = options;

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return { status: 'unsupported', reason: 'Service workers are not supported in this browser' };
  }

  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker.register(PYTHON_SW_PATH, {
      scope: PYTHON_SCOPE_PATH,
    });
  } catch (err) {
    return { status: 'blocked', reason: String(err) };
  }

  // CRITICAL (S1): blocked-SW environments can resolve register() to undefined instead of rejecting.
  if (!reg) {
    return { status: 'blocked', reason: 'serviceWorker.register() returned undefined' };
  }

  if (checkForUpdate) {
    try {
      await reg.update();
    } catch {
      // Offline or transient update check failure is non-fatal.
    }
  }

  const sw = reg.installing || reg.waiting || reg.active;
  if (sw && sw.state !== 'activated') {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 4000);
      const onChange = () => {
        if (sw.state === 'activated' || sw.state === 'redundant') {
          clearTimeout(timer);
          sw.removeEventListener('statechange', onChange);
          resolve();
        }
      };
      sw.addEventListener('statechange', onChange);
    });
  }

  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 400);
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  if (typeof window !== 'undefined' && window.crossOriginIsolated === true) {
    writeReloadGuard(false);
    return { status: 'isolated', registration: reg };
  }

  if (!reloadIfNeeded) {
    return { status: 'not-isolated', reason: 'Reload skipped by caller' };
  }

  if (!readReloadGuard()) {
    writeReloadGuard(true);
    window.location.reload();
    return { status: 'reloading' };
  }

  return {
    status: 'reload-failed',
    reason: 'Page is still not crossOriginIsolated after single guarded reload',
  };
}
