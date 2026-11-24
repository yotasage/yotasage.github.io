import type { PreviewKind } from './syncMerge';

export type ConcretePreviewKind = 'markdown' | 'html' | 'csv';
export type PreviewTheme = 'light' | 'dark' | 'hc';

export interface SandboxedHtmlOptions {
  fileName: string;
  allowScripts: boolean;
  theme: PreviewTheme;
}

const MARKDOWN_EXTS = new Set(['md', 'markdown']);
const HTML_EXTS = new Set(['html', 'htm', 'svg']);
const CSV_EXTS = new Set(['csv', 'tsv', 'psv', 'dsv', 'ssv']);

const SVG_CONTENT_RE =
  /^(?:<!--[\s\S]*?-->\s*)*(?:<\?xml[\s\S]*?\?>\s*)*(?:<!doctype\s+svg[\s\S]*?>\s*)*<svg(?:[\s>]|$)/i;

const THEME_PALETTES: Record<PreviewTheme, { bg: string; fg: string; svgBg: string; scheme: string }> = {
  light: {
    bg: '#ffffff',
    fg: '#111827',
    svgBg: '#f8fafc',
    scheme: 'light',
  },
  dark: {
    bg: '#0f172a',
    fg: '#e2e8f0',
    svgBg: '#111827',
    scheme: 'dark',
  },
  hc: {
    bg: '#000000',
    fg: '#ffffff',
    svgBg: '#0a0a0a',
    scheme: 'dark',
  },
};

function getExtension(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase();
  const dot = trimmed.lastIndexOf('.');
  return dot >= 0 ? trimmed.slice(dot + 1) : '';
}

function isSvgContent(content?: string): boolean {
  if (!content) return false;
  return SVG_CONTENT_RE.test(content.trimStart());
}

export function detectPreviewKind(
  language: string,
  fileName: string,
  content?: string,
): ConcretePreviewKind | null {
  const lang = language.trim().toLowerCase();
  const ext = getExtension(fileName);

  if (lang === 'markdown' || MARKDOWN_EXTS.has(ext)) {
    return 'markdown';
  }

  if (lang === 'html' || HTML_EXTS.has(ext)) {
    return 'html';
  }

  if (lang === 'xml' && (ext === 'svg' || isSvgContent(content))) {
    return 'html';
  }

  if (lang === 'csv' || CSV_EXTS.has(ext)) {
    return 'csv';
  }

  return null;
}

export function resolvePreviewKind(
  requested: PreviewKind,
  language: string,
  fileName: string,
  content?: string,
): ConcretePreviewKind {
  if (requested !== 'auto') {
    return requested;
  }
  return detectPreviewKind(language, fileName, content) ?? 'markdown';
}

function buildCspValue(allowScripts: boolean): string {
  const base =
    "default-src 'none'; style-src 'unsafe-inline' data: blob:; img-src data: blob:; font-src data: blob:; media-src data: blob:;";
  return allowScripts ? `${base} script-src 'unsafe-inline';` : base;
}

export function buildSandboxedHtmlSrcDoc(
  content: string,
  options: SandboxedHtmlOptions,
): string {
  const csp = buildCspValue(options.allowScripts);
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  const palette = THEME_PALETTES[options.theme] ?? THEME_PALETTES.light;
  const ext = getExtension(options.fileName);

  if (ext === 'svg' || isSvgContent(content)) {
    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      cspMeta,
      '<style>',
      `  :root { color-scheme: ${palette.scheme}; }`,
      `  html, body { margin: 0; padding: 16px; min-height: 100vh; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: ${palette.svgBg}; color: ${palette.fg}; }`,
      '  svg { max-width: 100%; max-height: calc(100vh - 32px); height: auto; display: block; }',
      '</style>',
      '</head>',
      '<body>',
      content,
      '</body>',
      '</html>',
    ].join('\n');
  }

  const headOpenRe = /<head(?:\s[^>]*)?>/i;
  if (headOpenRe.test(content)) {
    return content.replace(headOpenRe, (match) => `${match}\n${cspMeta}`);
  }

  const htmlOpenRe = /<html(?:\s[^>]*)?>/i;
  if (htmlOpenRe.test(content)) {
    return content.replace(htmlOpenRe, (match) => `${match}\n<head>\n<meta charset="utf-8">\n${cspMeta}\n</head>`);
  }

  const doctypeRe = /^(\s*<!doctype\s+html[^>]*>)/i;
  if (doctypeRe.test(content)) {
    return content.replace(
      doctypeRe,
      (match) => `${match}\n<head>\n<meta charset="utf-8">\n${cspMeta}\n</head>`,
    );
  }

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    cspMeta,
    '<style>',
    `  :root { color-scheme: ${palette.scheme}; }`,
    `  body { margin: 16px; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.5; background: ${palette.bg}; color: ${palette.fg}; }`,
    '</style>',
    '</head>',
    '<body>',
    content,
    '</body>',
    '</html>',
  ].join('\n');
}
