// Single-tab workspace ownership via Web Locks (`navigator.locks`) + cross-tab notice channel.
// Verified in S5 §5 across Edge, Firefox, and WebKit (< 11 ms acquire/reject/auto-release).

export const WORKSPACE_LOCK_PREFIX = 'python:workspace:';
export const WORKSPACE_BROADCAST_CHANNEL = 'python:workspace';

export interface WorkspaceLockHandle {
  readonly workspaceId: string;
  readonly lockName: string;
  readonly acquired: boolean;
  readonly supported: boolean;
  readonly release: () => void;
}

/**
 * Attempts to acquire an exclusive Web Lock for `python:workspace:<workspaceId>` without waiting.
 * - If another tab holds the lock, resolves immediately with `{ acquired: false, supported: true }`.
 * - If acquired, holds the lock until `release()` is called or the tab closes/crashes.
 * - If `navigator.locks` is unavailable, falls back safely to `{ acquired: true, supported: false }`.
 */
export function acquireWorkspaceLock(workspaceId = 'default'): Promise<WorkspaceLockHandle> {
  const safeId = workspaceId.trim() || 'default';
  const lockName = `${WORKSPACE_LOCK_PREFIX}${safeId}`;

  if (
    typeof navigator === 'undefined' ||
    !navigator.locks ||
    typeof navigator.locks.request !== 'function'
  ) {
    return Promise.resolve({
      workspaceId: safeId,
      lockName,
      acquired: true,
      supported: false,
      release: () => {},
    });
  }

  return new Promise<WorkspaceLockHandle>((resolve) => {
    let settled = false;
    const finish = (handle: WorkspaceLockHandle) => {
      if (!settled) {
        settled = true;
        resolve(handle);
      }
    };

    void navigator.locks
      .request(lockName, { ifAvailable: true }, (lock) => {
        if (!lock) {
          finish({
            workspaceId: safeId,
            lockName,
            acquired: false,
            supported: true,
            release: () => {},
          });
          return;
        }
        return new Promise<void>((releaseLock) => {
          let released = false;
          const release = () => {
            if (!released) {
              released = true;
              releaseLock();
              notifyWorkspaceLockReleased(safeId);
            }
          };
          finish({
            workspaceId: safeId,
            lockName,
            acquired: true,
            supported: true,
            release,
          });
        });
      })
      .catch(() => {
        finish({
          workspaceId: safeId,
          lockName,
          acquired: true,
          supported: false,
          release: () => {},
        });
      });
  });
}

/** Broadcasts that a tab released the workspace lock so waiting tabs can retry cleanly. */
export function notifyWorkspaceLockReleased(workspaceId = 'default'): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const ch = new BroadcastChannel(WORKSPACE_BROADCAST_CHANNEL);
    ch.postMessage({ type: 'lock-released', workspaceId });
    ch.close();
  } catch {
    // Ignore BroadcastChannel errors in restricted contexts.
  }
}

/** Subscribes to cross-tab lock-released notifications for a workspace. */
export function onWorkspaceLockReleased(
  workspaceId: string,
  callback: () => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  try {
    const ch = new BroadcastChannel(WORKSPACE_BROADCAST_CHANNEL);
    ch.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as { type?: unknown; workspaceId?: unknown } | null;
      if (msg && msg.type === 'lock-released' && msg.workspaceId === workspaceId) {
        callback();
      }
    };
    return () => {
      ch.onmessage = null;
      ch.close();
    };
  } catch {
    return () => {};
  }
}
