// Framework-free sharing helpers: URL resolution, formatted snippets, privacy-first share channels,
// local QR encoding via lib/qr/, and printable Share Card canvas rendering.

import type { PageCitationMeta, ProjectCitationMeta } from './citation';
import { encode, type EcLevel, type QrSymbol } from './qr/encoder';
import { drawToCanvas, type ModuleShape, type RenderOptions, toSvg } from './qr/render';

export type ShareScope = 'page' | 'home';
export type ShareHostMode = 'public' | 'current';
export type ShareSnippetFormat = 'url' | 'markdown' | 'html' | 'latex' | 'message';
export type ShareEcLevel = Extract<EcLevel, 'M' | 'Q' | 'H'>;
export type ShareQrStyle = ModuleShape;
export type ShareLocale = 'en' | 'nb';

export interface ShareResolveInput {
  page: PageCitationMeta;
  project: ProjectCitationMeta;
  scope: ShareScope;
  hostMode: ShareHostMode;
  includePageState: boolean;
  currentUrl?: string;
}

export interface ShareTarget {
  url: string;
  displayUrl: string;
  title: string;
  shortTitle: string;
  description: string;
  slug: string;
  isHome: boolean;
  hasDifferentHost: boolean;
  currentHostLabel: string;
  publicHostLabel: string;
  hasPageState: boolean;
}

export interface ShareChannel {
  id: 'email' | 'bluesky' | 'reddit' | 'linkedin' | 'x' | 'hackernews';
  label: string;
  href: string;
  external: boolean;
}

export interface ShareQrResult {
  symbol: QrSymbol | null;
  svg: string | null;
  error: string | null;
}

export interface ShareCardLabels {
  tagline: string;
  scanHint: string;
  accentColor: string;
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '') || url;
}

function extractHostLabel(originOrUrl: string): string {
  try {
    return new URL(originOrUrl).host;
  } catch {
    return stripProtocol(originOrUrl);
  }
}

function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'page';
}

export function resolveShareTarget(input: ShareResolveInput): ShareTarget {
  const { page, project, scope, hostMode, includePageState, currentUrl } = input;
  const isHome = scope === 'home' || page.kind === 'project' || page.route === '/';

  const canonicalOrigin = project.origin.replace(/\/+$/, '');
  const publicHostLabel = extractHostLabel(canonicalOrigin);

  let parsedCurrent: URL | null = null;
  if (currentUrl) {
    try {
      parsedCurrent = new URL(currentUrl);
    } catch {
      parsedCurrent = null;
    }
  }

  const currentOrigin = parsedCurrent ? parsedCurrent.origin.replace(/\/+$/, '') : canonicalOrigin;
  const hasDifferentHost = Boolean(parsedCurrent && currentOrigin !== canonicalOrigin);
  const currentHostLabel = parsedCurrent ? parsedCurrent.host : publicHostLabel;
  const rawState = parsedCurrent ? `${parsedCurrent.search}${parsedCurrent.hash}` : '';
  const hasPageState = Boolean(rawState);

  const activeOrigin = hasDifferentHost && hostMode === 'current' ? currentOrigin : canonicalOrigin;
  const routePath = isHome ? '/' : page.route || '/';
  const baseUrl = routePath === '/' ? `${activeOrigin}/` : `${activeOrigin}${routePath}`;
  const url = !isHome && includePageState && hasPageState ? `${baseUrl}${rawState}` : baseUrl;

  const shortTitle = isHome ? project.title : page.title;
  const title = isHome ? project.title : `${page.title} — ${project.name}`;
  const description = isHome
    ? 'Free, ad-free, 100% client-side engineering, math, and document tools.'
    : page.description?.trim() || `${page.title} on ${project.name} — runs locally in your browser.`;

  const slug = isHome ? 'home' : slugify(page.route.replace(/^\/+|\/main$/g, '') || page.title);

  return {
    url,
    displayUrl: stripProtocol(url),
    title,
    shortTitle,
    description,
    slug,
    isHome,
    hasDifferentHost,
    currentHostLabel,
    publicHostLabel,
    hasPageState,
  };
}

function escapeMarkdownLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]');
}

function escapeMarkdownUrl(url: string): string {
  return url.replaceAll('(', '%28').replaceAll(')', '%29').replaceAll(' ', '%20');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeLatexText(value: string): string {
  return value
    .replaceAll('\\', '\\textbackslash{}')
    .replaceAll('&', '\\&')
    .replaceAll('%', '\\%')
    .replaceAll('$', '\\$')
    .replaceAll('#', '\\#')
    .replaceAll('_', '\\_')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('~', '\\textasciitilde{}')
    .replaceAll('^', '\\textasciicircum{}');
}

function escapeLatexUrl(url: string): string {
  return url.replaceAll('%', '\\%').replaceAll('#', '\\#');
}

export function formatShareSnippet(
  target: ShareTarget,
  format: ShareSnippetFormat,
  locale: ShareLocale = 'en',
): string {
  switch (format) {
    case 'url':
      return target.url;
    case 'markdown':
      return `[${escapeMarkdownLabel(target.title)}](${escapeMarkdownUrl(target.url)})`;
    case 'html':
      return `<a href="${escapeHtml(target.url)}">${escapeHtml(target.title)}</a>`;
    case 'latex':
      return `\\href{${escapeLatexUrl(target.url)}}{${escapeLatexText(target.title)}}`;
    case 'message': {
      const lead =
        locale === 'nb'
          ? `${target.title} — kjører 100 % lokalt i nettleseren uten reklame.`
          : `${target.title} — 100% client-side in your browser, no ads or uploads.`;
      return `${lead}\n${target.url}`;
    }
  }
}

export function buildShareChannels(target: ShareTarget, locale: ShareLocale = 'en'): readonly ShareChannel[] {
  const encodedUrl = encodeURIComponent(target.url);
  const encodedTitle = encodeURIComponent(target.title);
  const postText =
    locale === 'nb'
      ? `${target.title} — lokalt nettleserverktøy uten reklame`
      : `${target.title} — free client-side browser tool`;
  const encodedPost = encodeURIComponent(postText);
  const emailBody = encodeURIComponent(`${formatShareSnippet(target, 'message', locale)}\n`);

  return [
    {
      id: 'email',
      label: locale === 'nb' ? 'E-post' : 'Email',
      href: `mailto:?subject=${encodedTitle}&body=${emailBody}`,
      external: false,
    },
    {
      id: 'bluesky',
      label: 'Bluesky',
      href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${postText}\n${target.url}`)}`,
      external: true,
    },
    {
      id: 'reddit',
      label: 'Reddit',
      href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      external: true,
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      external: true,
    },
    {
      id: 'x',
      label: 'X',
      href: `https://x.com/intent/tweet?text=${encodedPost}&url=${encodedUrl}`,
      external: true,
    },
    {
      id: 'hackernews',
      label: 'Hacker News',
      href: `https://news.ycombinator.com/submitlink?u=${encodedUrl}&t=${encodedTitle}`,
      external: true,
    },
  ];
}

export function makeShareRenderOptions(style: ShareQrStyle): RenderOptions {
  return {
    quietZone: 4,
    foreground: '#0f172a',
    background: '#ffffff',
    transparent: false,
    shape: style,
    squareFunctionPatterns: true,
    logo: null,
  };
}

export function buildShareQr(url: string, ecLevel: ShareEcLevel, style: ShareQrStyle): ShareQrResult {
  const trimmed = url.trim();
  if (!trimmed) {
    return { symbol: null, svg: null, error: 'URL is empty.' };
  }
  try {
    const symbol = encode(trimmed, {
      symbology: 'qr2',
      version: 'auto',
      ecLevel,
      boostEc: false,
      mask: 'auto',
      mode: 'auto',
      allowKanji: false,
      charset: 'utf-8',
      eci: 'auto',
    });
    const svg = toSvg(symbol, makeShareRenderOptions(style), null);
    return { symbol, svg, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { symbol: null, svg: null, error: message };
  }
}

export function buildShareFilename(
  target: ShareTarget,
  kind: 'qr-svg' | 'qr-png' | 'share-card',
): string {
  const base = `yotasage-${target.slug}`;
  switch (kind) {
    case 'qr-svg':
      return `${base}-qr.svg`;
    case 'qr-png':
      return `${base}-qr.png`;
    case 'share-card':
      return `${base}-share-card.png`;
  }
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
        if (lines.length === maxLines) {
          return ellipsizeLine(ctx, lines, maxWidth);
        }
      }
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  if (lines.length > maxLines) {
    return ellipsizeLine(ctx, lines.slice(0, maxLines), maxWidth);
  }
  return lines;
}

function ellipsizeLine(ctx: CanvasRenderingContext2D, lines: string[], maxWidth: number): string[] {
  if (lines.length === 0) return lines;
  const out = lines.slice();
  let last = out[out.length - 1] ?? '';
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
    last = last.slice(0, -1).trimEnd();
  }
  out[out.length - 1] = `${last}…`;
  return out;
}

function truncateMiddle(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let head = Math.ceil(text.length * 0.58);
  let tail = Math.floor(text.length * 0.28);
  while (head > 8 && tail > 6) {
    const candidate = `${text.slice(0, head)}…${text.slice(-tail)}`;
    if (ctx.measureText(candidate).width <= maxWidth) return candidate;
    head -= 2;
    tail -= 1;
  }
  return `${text.slice(0, 12)}…`;
}

export function renderShareCardCanvas(
  canvas: HTMLCanvasElement,
  symbol: QrSymbol,
  target: ShareTarget,
  style: ShareQrStyle,
  labels: ShareCardLabels,
): void {
  const W = 1080;
  const H = 1340;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clean editorial paper background
  ctx.fillStyle = '#f5f7fb';
  ctx.fillRect(0, 0, W, H);

  // Outer card frame
  const pad = 48;
  const cardX = pad;
  const cardY = pad;
  const cardW = W - pad * 2;
  const cardH = H - pad * 2;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 32);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Subtle top accent bar clipped inside card
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 32);
  ctx.clip();
  ctx.fillStyle = labels.accentColor || '#2563eb';
  ctx.fillRect(cardX, cardY, cardW, 12);
  ctx.restore();

  // Brand kicker
  ctx.textAlign = 'center';
  ctx.fillStyle = labels.accentColor || '#2563eb';
  ctx.font = '600 26px "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('yotasage.github.io', W / 2, cardY + 86);

  // Page / tool title
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 48px "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const titleLines = wrapCanvasText(ctx, target.shortTitle, cardW - 120, 2);
  let cursorY = cardY + 150;
  for (const line of titleLines) {
    ctx.fillText(line, W / 2, cursorY);
    cursorY += 58;
  }

  // Scan hint subtitle
  ctx.fillStyle = '#475569';
  ctx.font = '500 25px "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(labels.scanHint, W / 2, cursorY + 14);

  // QR code rendered crisply onto an offscreen canvas, then centered inside a subtle bordered plate
  const plateSize = 680;
  const plateX = (W - plateSize) / 2;
  const plateY = cursorY + 56;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(plateX, plateY, plateSize, plateSize, 24);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  const qrOffscreen = document.createElement('canvas');
  const opts = makeShareRenderOptions(style);
  const totalMods = symbol.width + 2 * opts.quietZone;
  const innerSize = plateSize - 32;
  const scale = Math.max(4, Math.floor(innerSize / totalMods));
  drawToCanvas(qrOffscreen, symbol, opts, scale, true);

  const drawSize = Math.min(innerSize, qrOffscreen.width);
  const qrX = Math.round((W - drawSize) / 2);
  const qrY = Math.round(plateY + (plateSize - drawSize) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrOffscreen, qrX, qrY, drawSize, drawSize);
  ctx.imageSmoothingEnabled = true;

  // Monospace URL readout
  const urlY = plateY + plateSize + 68;
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 26px "JetBrains Mono Variable", ui-monospace, Consolas, monospace';
  const fittedUrl = truncateMiddle(ctx, target.displayUrl, cardW - 120);
  ctx.fillText(fittedUrl, W / 2, urlY);

  // Hairline divider
  const divY = cardY + cardH - 110;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.09)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cardX + 72, divY);
  ctx.lineTo(cardX + cardW - 72, divY);
  ctx.stroke();

  // Privacy tagline
  ctx.fillStyle = '#64748b';
  ctx.font = '500 23px "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(labels.tagline, W / 2, divY + 56);
}
