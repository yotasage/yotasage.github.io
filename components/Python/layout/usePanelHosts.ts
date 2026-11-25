// Panel hosts of the Python playground (docs/python/notes-L1.md §2 and §8). Each of the six panels is
// rendered once with createPortal into a host <div> made here once; slots (dock group bodies, the phone
// panes) only claim hosts, and the registry moves the host nodes into the slot that claims them. React
// listens on portal containers, so a moved host keeps its events; the panels inside keep their state
// (xterm, Monaco, the display renderer) and re-measure themselves with their own ResizeObservers.
import { useLayoutEffect, useState } from 'react';

import { PANEL_IDS } from '../../../lib/python/layout/model';
import type { PanelId } from '../../../lib/python/layout/model';

export type PanelHosts = Readonly<Record<PanelId, HTMLDivElement>>;

interface Claim {
  readonly panels: readonly PanelId[];
  readonly shown: PanelId | null;
}

type MoveBeforeParent = ParentNode & { moveBefore?: (node: Node, child: Node | null) => void };

/** Moves a host keeping its focus: moveBefore where it exists (no iframe reload), else appendChild + refocus. */
function moveHost(parent: HTMLElement, host: HTMLElement): void {
  const active = document.activeElement;
  const hadFocus = active instanceof HTMLElement && host.contains(active);
  const mb = (parent as MoveBeforeParent).moveBefore;
  if (typeof mb === 'function' && parent.isConnected && host.isConnected) {
    try {
      mb.call(parent, host, null);
      return;
    } catch {
      // Not allowed for this pair of nodes: fall back to appendChild.
    }
  }
  parent.appendChild(host);
  if (hadFocus && document.activeElement !== active) {
    try {
      (active as HTMLElement).focus({ preventScroll: true });
    } catch {
      // The element cannot take focus any more.
    }
  }
}

export class HostRegistry {
  hosts: PanelHosts | null = null;
  private park: HTMLDivElement | null = null;
  private claims = new Map<HTMLElement, Claim>();
  private scheduled = false;

  /** Makes the park (a hidden div in <body>) and the six hosts; places them at once. */
  init(hostClass: string): PanelHosts {
    if (this.hosts) return this.hosts;
    const park = document.createElement('div');
    park.setAttribute('data-python-panel-park', '');
    park.style.display = 'none';
    document.body.appendChild(park);
    const made = {} as Record<PanelId, HTMLDivElement>;
    for (const p of PANEL_IDS) {
      const host = document.createElement('div');
      host.className = hostClass;
      host.setAttribute('data-panel', p);
      park.appendChild(host);
      made[p] = host;
    }
    this.park = park;
    this.hosts = made;
    this.place();
    return made;
  }

  destroy(): void {
    this.park?.remove();
    if (this.hosts) for (const p of PANEL_IDS) this.hosts[p].remove();
    this.park = null;
    this.hosts = null;
  }

  /** A slot claims hosts and says which one it shows (the others are hidden in it). */
  claim(el: HTMLElement, panels: readonly PanelId[], shown: PanelId | null): void {
    this.claims.set(el, { panels, shown });
    this.schedule();
  }

  /** A slot goes away: its hosts go to the park at once, so they are never detached from the document. */
  release(el: HTMLElement): void {
    this.claims.delete(el);
    if (this.hosts && this.park) {
      for (const p of PANEL_IDS) {
        const host = this.hosts[p];
        if (host.parentNode === el) moveHost(this.park, host);
      }
    }
    this.schedule();
  }

  /** Places hosts after every slot of this commit has claimed (one microtask, before paint). */
  schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.place();
    });
  }

  place(): void {
    const hosts = this.hosts;
    const park = this.park;
    if (!hosts || !park) return;
    const owner = new Map<PanelId, HTMLElement>();
    for (const [el, c] of this.claims) {
      if (!el.isConnected) continue;
      for (const p of c.panels) owner.set(p, el);
    }
    const fullscreen = typeof document !== 'undefined' ? document.fullscreenElement : null;
    for (const p of PANEL_IDS) {
      const host = hosts[p];
      const target = owner.get(p) ?? park;
      if (host.parentNode !== target) moveHost(target, host);
      const claim = this.claims.get(target);
      // A panel in fullscreen (the Display) stays shown even if its tab changed meanwhile.
      const shown = (claim !== undefined && claim.shown === p) || (fullscreen !== null && host.contains(fullscreen));
      host.style.display = shown ? '' : 'none';
    }
  }
}

/** The registry and the six hosts (null until mounted: the page is prerendered without a document). */
export function usePanelHosts(hostClass: string): { registry: HostRegistry; hosts: PanelHosts | null } {
  const [registry] = useState(() => new HostRegistry());
  const [hosts, setHosts] = useState<PanelHosts | null>(null);
  useLayoutEffect(() => {
    setHosts(registry.init(hostClass));
    const onFullscreen = () => registry.schedule();
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      registry.destroy();
      setHosts(null);
    };
  }, [registry, hostClass]);
  return { registry, hosts };
}
