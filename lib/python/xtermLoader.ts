// Lazy loader for self-hosted @xterm/xterm, @xterm/addon-fit, @xterm/addon-web-links,
// and /python/xterm.css (zero bytes loaded on any non-Python route).

import type { FitAddon as FitAddonClass } from '@xterm/addon-fit';
import type { WebLinksAddon as WebLinksAddonClass } from '@xterm/addon-web-links';
import type { ITheme, Terminal as TerminalClass } from '@xterm/xterm';

import type { ResolvedTheme } from '../ui/theme';

export interface XtermModules {
  readonly Terminal: typeof TerminalClass;
  readonly FitAddon: typeof FitAddonClass;
  readonly WebLinksAddon: typeof WebLinksAddonClass;
}

export const XTERM_THEMES: Record<ResolvedTheme, ITheme> = {
  light: {
    background: '#ffffff',
    foreground: '#0f172a',
    cursor: '#2563eb',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(37, 99, 235, 0.22)',
    black: '#0f172a',
    red: '#dc2626',
    green: '#059669',
    yellow: '#b45309',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#64748b',
    brightBlack: '#475569',
    brightRed: '#ef4444',
    brightGreen: '#10b981',
    brightYellow: '#d97706',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#0f172a',
  },
  dark: {
    background: '#131316',
    foreground: '#fafafa',
    cursor: '#60a5fa',
    cursorAccent: '#081221',
    selectionBackground: 'rgba(96, 165, 250, 0.30)',
    black: '#1c1c21',
    red: '#f87171',
    green: '#34d399',
    yellow: '#fbbf24',
    blue: '#60a5fa',
    magenta: '#c084fc',
    cyan: '#22d3ee',
    white: '#e4e4e7',
    brightBlack: '#71717a',
    brightRed: '#fca5a5',
    brightGreen: '#6ee7b7',
    brightYellow: '#fde047',
    brightBlue: '#93c5fd',
    brightMagenta: '#d8b4fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  },
  hc: {
    background: '#000000',
    foreground: '#ffffff',
    cursor: '#ffe600',
    cursorAccent: '#000000',
    selectionBackground: 'rgba(255, 230, 0, 0.40)',
    black: '#000000',
    red: '#ff6b6b',
    green: '#4ade80',
    yellow: '#ffe600',
    blue: '#60a5fa',
    magenta: '#f0abfc',
    cyan: '#22d3ee',
    white: '#ffffff',
    brightBlack: '#d4d4d4',
    brightRed: '#ff8a8a',
    brightGreen: '#86efac',
    brightYellow: '#fef08a',
    brightBlue: '#93c5fd',
    brightMagenta: '#f5d0fe',
    brightCyan: '#67e8f9',
    brightWhite: '#ffffff',
  },
};

let cssPromise: Promise<void> | null = null;
let modulesPromise: Promise<XtermModules> | null = null;

function ensureXtermCss(): Promise<void> {
  if (typeof document === 'undefined') {
    return Promise.resolve();
  }
  const existing = document.querySelector<HTMLLinkElement>('link[data-xterm-css="true"]');
  if (existing && existing.dataset.loaded === 'true') {
    return Promise.resolve();
  }
  if (cssPromise) return cssPromise;

  cssPromise = new Promise<void>((resolve) => {
    const link = existing ?? document.createElement('link');
    const finish = () => {
      link.dataset.loaded = 'true';
      resolve();
    };
    if (!existing) {
      link.rel = 'stylesheet';
      link.href = '/python/xterm.css';
      link.dataset.xtermCss = 'true';
      link.onload = finish;
      link.onerror = finish;
      document.head.appendChild(link);
    } else {
      link.addEventListener('load', finish, { once: true });
      link.addEventListener('error', finish, { once: true });
      // Fallback in case the stylesheet already finished loading before listener attachment.
      if (link.sheet) finish();
    }
  });

  return cssPromise;
}

export async function loadXterm(): Promise<XtermModules> {
  if (typeof window === 'undefined') {
    throw new Error('xterm.js can only be loaded in a browser environment.');
  }
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      ensureXtermCss(),
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-web-links'),
    ])
      .then(([, xtermMod, fitMod, webLinksMod]) => ({
        Terminal: xtermMod.Terminal,
        FitAddon: fitMod.FitAddon,
        WebLinksAddon: webLinksMod.WebLinksAddon,
      }))
      .catch((err) => {
        modulesPromise = null;
        throw err;
      });
  }
  return modulesPromise;
}
