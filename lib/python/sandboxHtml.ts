// Hardened HTML sandbox srcDoc builder for the Python Playground FileViewer.
// Injects a strict zero-connect Content-Security-Policy <meta> tag as the very first child of
// the real <head> element using DOMParser (with an HTML-comment/attribute-aware fallback when
// DOMParser is unavailable), preventing bypasses via `<!-- <head> -->` or `<head data-x=">">`.

export const SANDBOX_HTML_CSP_CONTENT =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:;";

export const SANDBOX_HTML_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${SANDBOX_HTML_CSP_CONTENT}">`;

const RAW_TEXT_TAGS = new Set(['script', 'style', 'title', 'textarea', 'xmp']);

interface TagMatch {
  readonly name: string;
  readonly end: number;
}

/**
 * Scans HTML markup outside comments, quoted attribute values, and raw-text elements to find
 * the first real opening `<head>`, `<html>`, or leading `<!doctype>` tag end offset.
 */
function findRealTagEnd(html: string, target: 'head' | 'html' | '!doctype'): number {
  const len = html.length;
  let i = 0;

  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt === -1) return -1;

    // HTML comment: <!-- ... -->
    if (html.startsWith('<!--', lt)) {
      const endComment = html.indexOf('-->', lt + 4);
      if (endComment === -1) return -1;
      i = endComment + 3;
      continue;
    }

    // Declaration / doctype / CDATA: <! ... >
    if (html[lt + 1] === '!') {
      const endDecl = scanTagEnd(html, lt + 2);
      if (endDecl === -1) return -1;
      if (target === '!doctype') {
        const prefix = html.slice(lt, lt + 9).toLowerCase();
        if (prefix === '<!doctype') return endDecl + 1;
      }
      i = endDecl + 1;
      continue;
    }

    // Processing instruction or closing tag
    if (html[lt + 1] === '?' || html[lt + 1] === '/') {
      const endTag = scanTagEnd(html, lt + 2);
      if (endTag === -1) return -1;
      i = endTag + 1;
      continue;
    }

    // Opening tag name
    const match = readStartTag(html, lt);
    if (!match) {
      i = lt + 1;
      continue;
    }

    if (match.name === target) {
      return match.end;
    }

    // Skip raw-text element body (e.g. <title><head></title> or <script>"<head>"</script>)
    if (RAW_TEXT_TAGS.has(match.name)) {
      const closeRe = new RegExp(`</${match.name}\\s*>`, 'i');
      const rest = html.slice(match.end);
      const closeMatch = closeRe.exec(rest);
      if (!closeMatch) return -1;
      i = match.end + closeMatch.index + closeMatch[0].length;
      continue;
    }

    i = match.end;
  }

  return -1;
}

function scanTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

function readStartTag(html: string, lt: number): TagMatch | null {
  let j = lt + 1;
  while (j < html.length && /[A-Za-z0-9-]/.test(html[j])) j += 1;
  if (j === lt + 1) return null;
  const name = html.slice(lt + 1, j).toLowerCase();
  const next = html[j];
  if (next !== undefined && next !== '>' && next !== '/' && !/\s/.test(next)) return null;
  const endGt = scanTagEnd(html, j);
  if (endGt === -1) return null;
  return { name, end: endGt + 1 };
}

/** Comment- and attribute-aware fallback injector used when DOMParser is unavailable (e.g. SSR/Node). */
export function injectMetaCspFallback(rawHtml: string): string {
  const headEnd = findRealTagEnd(rawHtml, 'head');
  if (headEnd !== -1) {
    return `${rawHtml.slice(0, headEnd)}${SANDBOX_HTML_CSP_META}${rawHtml.slice(headEnd)}`;
  }
  const htmlEnd = findRealTagEnd(rawHtml, 'html');
  if (htmlEnd !== -1) {
    return `${rawHtml.slice(0, htmlEnd)}<head>${SANDBOX_HTML_CSP_META}</head>${rawHtml.slice(htmlEnd)}`;
  }
  const doctypeEnd = findRealTagEnd(rawHtml, '!doctype');
  if (doctypeEnd !== -1) {
    return `${rawHtml.slice(0, doctypeEnd)}<head>${SANDBOX_HTML_CSP_META}</head>${rawHtml.slice(doctypeEnd)}`;
  }
  return `<head>${SANDBOX_HTML_CSP_META}</head>\n${rawHtml}`;
}

/**
 * Builds the `srcDoc` for the sandboxed HTML file viewer.
 * When `allowScripts` is false, the iframe uses `sandbox=""` (scripts disabled by the browser).
 * When `allowScripts` is true, parses the HTML with DOMParser and prepends a strict zero-connect
 * CSP `<meta>` tag as the very first child of `document.head`.
 */
export function buildSandboxedHtmlSrcDoc(rawHtml: string, allowScripts: boolean): string {
  if (!allowScripts) return rawHtml;

  if (typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, 'text/html');
      const root = doc.documentElement;
      if (root) {
        let head = doc.head;
        if (!head) {
          head = doc.createElement('head');
          root.insertBefore(head, root.firstChild);
        }
        const meta = doc.createElement('meta');
        meta.setAttribute('http-equiv', 'Content-Security-Policy');
        meta.setAttribute('content', SANDBOX_HTML_CSP_CONTENT);
        head.insertBefore(meta, head.firstChild);
        const doctypeName = doc.doctype?.name || 'html';
        return `<!DOCTYPE ${doctypeName}>\n${root.outerHTML}`;
      }
    } catch {
      // Fall through to tokenizer-based injection if DOMParser throws
    }
  }

  return injectMetaCspFallback(rawHtml);
}
