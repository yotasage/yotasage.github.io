// Shape of a built-in Python Playground example (shown as a card in the Examples tab, the only place
// examples are loaded from). Loading an example only copies its files into the workspace; it never runs them.

/** Category of an example, in the order the Examples tab lists them. */
export const PYTHON_EXAMPLE_TAGS = ['basics', 'science', 'plots', 'display', 'files', 'async', 'network', 'packages'] as const;

export type PythonExampleTag = (typeof PYTHON_EXAMPLE_TAGS)[number];

export interface PythonExample {
  /** Stable id; also the workspace folder its files are written to. */
  readonly id: string;
  readonly tag: PythonExampleTag;
  /** i18n key of the card title (`lib/ui/i18n/python-examples.ts`). */
  readonly titleKey: string;
  /** i18n key of a one-sentence description. */
  readonly descriptionKey: string;
  /** Workspace path of the file opened (focused) after loading; Run runs the focused file. */
  readonly entry: string;
  /** Workspace path → file content. */
  readonly files: Readonly<Record<string, string>>;
}

/** i18n key of a tag's label. */
export function getPythonExampleTagKey(tag: PythonExampleTag): string {
  return `python.exampleTag.${tag}`;
}

/** Drops the first newline of a `String.raw` block so a file can start on the line after the backtick. */
export function pySource(raw: string): string {
  return raw.startsWith('\n') ? raw.slice(1) : raw;
}
