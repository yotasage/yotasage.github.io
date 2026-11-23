import type * as MonacoApi from 'monaco-editor';

export type MonacoNamespace = typeof MonacoApi;

interface AmdRequire {
  (deps: string[], callback: (monaco: MonacoNamespace) => void, errorCallback?: (err: unknown) => void): void;
  config: (cfg: { paths: Record<string, string> }) => void;
}

interface MonacoWindow extends Window {
  monaco?: MonacoNamespace;
  require?: AmdRequire;
  MonacoEnvironment?: {
    getWorkerUrl?: (moduleId: string, label: string) => string;
  };
}

let loadPromise: Promise<MonacoNamespace> | null = null;
let workerBlobUrl: string | null = null;
let customLanguagesRegistered = false;

function registerCustomLanguages(monaco: MonacoNamespace): void {
  if (customLanguagesRegistered) return;
  customLanguagesRegistered = true;

  const existingIds = new Set(monaco.languages.getLanguages().map((l) => l.id));

  // TeX / LaTeX syntax highlighter for quick review of .tex, .sty, .cls, .bib files
  if (!existingIds.has('latex')) {
    monaco.languages.register({
      id: 'latex',
      extensions: ['.tex', '.sty', '.cls', '.bib', '.dtx'],
      aliases: ['TeX / LaTeX', 'LaTeX', 'latex', 'tex'],
    });

    monaco.languages.setLanguageConfiguration('latex', {
      comments: { lineComment: '%' },
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')'],
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '$', close: '$' },
      ],
    });

    monaco.languages.setMonarchTokensProvider('latex', {
      tokenizer: {
        root: [
          [/(^|[^\\])%.*$/, 'comment'],
          [/\\(?:begin|end)\b/, 'keyword'],
          [/\\(?:documentclass|usepackage|section|subsection|subsubsection|chapter|title|author|date|maketitle|tableofcontents|label|ref|eqref|cite|bibliography|bibliographystyle|input|include|newcommand|renewcommand|def|caption|centering|includegraphics)\b/, 'keyword'],
          [/\\[a-zA-Z@]+\*?/, 'type'],
          [/\\[^a-zA-Z\s]/, 'string.escape'],
          [/\$\$/, { token: 'string', next: '@mathBlock' }],
          [/\$/, { token: 'string', next: '@mathInline' }],
          [/[{}]/, 'delimiter.curly'],
          [/[[\]]/, 'delimiter.square'],
          [/[&~]/, 'operator'],
          [/-?\d+(?:\.\d+)?(?:pt|em|ex|mm|cm|in|bp|pc|sp|px)?\b/, 'number'],
        ],
        mathInline: [
          [/\$/, { token: 'string', next: '@pop' }],
          [/\\[a-zA-Z]+/, 'variable'],
          [/[^$\\]+/, 'string'],
        ],
        mathBlock: [
          [/\$\$/, { token: 'string', next: '@pop' }],
          [/\\[a-zA-Z]+/, 'variable'],
          [/[^$\\]+/, 'string'],
        ],
      },
    });
  }

  // CSV / TSV highlighter for quick visual review of tabular data files
  if (!existingIds.has('csv')) {
    monaco.languages.register({
      id: 'csv',
      extensions: ['.csv', '.tsv'],
      aliases: ['CSV / TSV', 'CSV', 'csv', 'tsv'],
    });

    monaco.languages.setMonarchTokensProvider('csv', {
      tokenizer: {
        root: [
          [/^\s*#.*$/, 'comment'],
          [/"(?:[^"]|"")*"/, 'string'],
          [/[,;\t]/, 'delimiter'],
          [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?(?=\s*(?:[,;\t]|$))/, 'number'],
          [/\b(?:true|false|null|NaN)\b/i, 'keyword'],
          [/[^,;\t"\r\n]+/, 'identifier'],
        ],
      },
    });
  }
}

function getSelfHostedWorkerUrl(): string {
  if (workerBlobUrl) return workerBlobUrl;
  const baseUrl = `${window.location.origin}/monaco`;
  const script = [
    `self.MonacoEnvironment = { baseUrl: ${JSON.stringify(baseUrl)} };`,
    `importScripts(${JSON.stringify(`${baseUrl}/vs/base/worker/workerMain.js`)});`,
  ].join('\n');
  const blob = new Blob([script], { type: 'application/javascript' });
  workerBlobUrl = URL.createObjectURL(blob);
  return workerBlobUrl;
}

/**
 * Lazily loads the self-hosted Monaco Editor AMD bundle from `/monaco/vs/` (zero CDN requests).
 * Safe to call multiple times; shares one singleton promise across all panes.
 */
export function loadMonaco(): Promise<MonacoNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Monaco can only be loaded in a browser environment.'));
  }

  const win = window as unknown as MonacoWindow;
  if (win.monaco) {
    registerCustomLanguages(win.monaco);
    return Promise.resolve(win.monaco);
  }
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<MonacoNamespace>((resolve, reject) => {
    win.MonacoEnvironment = {
      getWorkerUrl: () => getSelfHostedWorkerUrl(),
    };

    const bootAmd = () => {
      const amdRequire = win.require;
      if (!amdRequire || typeof amdRequire.config !== 'function') {
        loadPromise = null;
        reject(new Error('Self-hosted Monaco AMD loader failed to initialize.'));
        return;
      }

      amdRequire.config({
        paths: { vs: '/monaco/vs' },
      });

      amdRequire(
        ['vs/editor/editor.main'],
        (monacoMod) => {
          const api = monacoMod ?? win.monaco;
          if (!api) {
            loadPromise = null;
            reject(new Error('Monaco editor module did not expose an API.'));
            return;
          }
          registerCustomLanguages(api);
          resolve(api);
        },
        (err) => {
          loadPromise = null;
          reject(err instanceof Error ? err : new Error('Failed to load Monaco editor modules.'));
        },
      );
    };

    if (win.require && typeof win.require.config === 'function') {
      bootAmd();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-monaco-loader="true"]');
    if (existing) {
      existing.addEventListener('load', bootAmd, { once: true });
      existing.addEventListener(
        'error',
        () => {
          loadPromise = null;
          reject(new Error('Failed to load /monaco/vs/loader.js.'));
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = '/monaco/vs/loader.js';
    script.async = true;
    script.dataset.monacoLoader = 'true';
    script.onload = bootAmd;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load /monaco/vs/loader.js.'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
