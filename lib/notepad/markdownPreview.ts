import katex from 'katex';

const CALLOUT_LABELS: Record<string, string> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
};

const DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)[;,]/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderKatex(expr: string, displayMode: boolean): string {
  const trimmed = expr.trim();
  if (trimmed.length === 0) return '';
  try {
    return katex.renderToString(trimmed, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    });
  } catch {
    return `<code class="md-math-error">${escapeHtml(trimmed)}</code>`;
  }
}

function sanitizeUrl(raw: string, allowDataImage: boolean): string | null {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleaned.length === 0) return null;

  if (
    cleaned.startsWith('#') ||
    cleaned.startsWith('/') ||
    cleaned.startsWith('./') ||
    cleaned.startsWith('../')
  ) {
    if (cleaned.startsWith('//')) return null;
    return cleaned;
  }

  const lower = cleaned.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    return cleaned;
  }

  if (allowDataImage && DATA_IMAGE_RE.test(cleaned)) {
    return cleaned;
  }

  // Check if there is a scheme before any '/', '?', or '#'
  const colonIdx = cleaned.indexOf(':');
  if (colonIdx !== -1) {
    const slashIdx = cleaned.search(/[/?#]/);
    if (slashIdx === -1 || colonIdx < slashIdx) {
      // Unknown or unsafe scheme (javascript:, vbscript:, data:text/html, file:, etc.)
      return null;
    }
  }

  return cleaned;
}

function slugifyHeading(raw: string, slugCounts: Map<string, number>): string {
  const plain = raw
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const base = plain || 'section';
  const count = slugCounts.get(base) ?? 0;
  slugCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

function stashPlaceholder(placeholders: string[], html: string): string {
  const index = placeholders.length;
  placeholders.push(html);
  return `\u0000P${index}\u0000`;
}

function restorePlaceholders(text: string, placeholders: readonly string[]): string {
  let result = text;
  for (let pass = 0; pass < 6; pass++) {
    if (!result.includes('\u0000P')) break;
    result = result.replace(/\u0000P(\d+)\u0000/g, (_m, idxStr: string) => {
      const idx = Number(idxStr);
      return idx >= 0 && idx < placeholders.length ? placeholders[idx] : '';
    });
  }
  return result;
}

function replaceInlineCode(text: string, placeholders: string[]): string {
  let out = '';
  let i = 0;
  const len = text.length;

  while (i < len) {
    if (text[i] === '`') {
      let ticks = 0;
      while (i + ticks < len && text[i + ticks] === '`') {
        ticks++;
      }
      const closeMarker = '`'.repeat(ticks);
      let searchPos = i + ticks;
      let closeIdx = -1;

      while (searchPos < len) {
        const candidate = text.indexOf(closeMarker, searchPos);
        if (candidate === -1) break;
        const beforeIsTick = candidate > 0 && text[candidate - 1] === '`';
        const afterIsTick =
          candidate + ticks < len && text[candidate + ticks] === '`';
        if (!beforeIsTick && !afterIsTick) {
          closeIdx = candidate;
          break;
        }
        searchPos = candidate + 1;
      }

      if (closeIdx !== -1) {
        let content = text.slice(i + ticks, closeIdx);
        if (
          content.length >= 2 &&
          content.startsWith(' ') &&
          content.endsWith(' ') &&
          content.trim().length > 0
        ) {
          content = content.slice(1, -1);
        }
        out += stashPlaceholder(placeholders, `<code>${escapeHtml(content)}</code>`);
        i = closeIdx + ticks;
        continue;
      }

      out += closeMarker;
      i += ticks;
      continue;
    }

    out += text[i];
    i++;
  }

  return out;
}

function replaceInlineMath(text: string, placeholders: string[]): string {
  let out = '';
  let i = 0;
  const len = text.length;

  while (i < len) {
    if (text[i] === '\\' && i + 1 < len && text[i + 1] === '$') {
      out += '\\$';
      i += 2;
      continue;
    }

    // Skip existing placeholders verbatim
    if (text[i] === '\u0000') {
      const endPlaceholder = text.indexOf('\u0000', i + 1);
      if (endPlaceholder !== -1) {
        out += text.slice(i, endPlaceholder + 1);
        i = endPlaceholder + 1;
        continue;
      }
    }

    if (text[i] === '$' && (i + 1 >= len || text[i + 1] !== '$')) {
      const nextChar = i + 1 < len ? text[i + 1] : '';
      if (nextChar.length > 0 && !/\s/.test(nextChar) && nextChar !== '\u0000') {
        let closeIdx = -1;
        let j = i + 1;

        while (j < len) {
          const ch = text[j];
          if (ch === '\u0000' || ch === '\n') {
            break;
          }
          if (ch === '\\' && j + 1 < len) {
            j += 2;
            continue;
          }
          if (ch === '$') {
            const prevChar = text[j - 1];
            const afterChar = j + 1 < len ? text[j + 1] : '';
            const validClose =
              !/\s/.test(prevChar) &&
              afterChar !== '$' &&
              !/\d/.test(afterChar);
            if (validClose) {
              closeIdx = j;
              break;
            }
            // Likely currency like "$10 and $20" or "$10-$20"
            break;
          }
          j++;
        }

        if (closeIdx !== -1) {
          const expr = text.slice(i + 1, closeIdx);
          if (expr.trim().length > 0) {
            out += stashPlaceholder(placeholders, renderKatex(expr, false));
            i = closeIdx + 1;
            continue;
          }
        }
      }
    }

    out += text[i];
    i++;
  }

  return out;
}

function parseLinkDestination(rawDest: string): { url: string; title: string } {
  const trimmed = rawDest.trim();
  if (trimmed.length === 0) return { url: '', title: '' };

  if (trimmed.startsWith('<')) {
    const closeAngle = trimmed.indexOf('>');
    if (closeAngle !== -1) {
      const url = trimmed.slice(1, closeAngle).trim();
      const rest = trimmed.slice(closeAngle + 1).trim();
      const titleMatch = /^["']([\s\S]*)["']$/.exec(rest);
      return { url, title: titleMatch ? titleMatch[1] : '' };
    }
  }

  const titleMatch = /^(\S+)\s+(?:"([^"]*)"|'([^']*)')$/.exec(trimmed);
  if (titleMatch) {
    return { url: titleMatch[1], title: titleMatch[2] ?? titleMatch[3] ?? '' };
  }

  return { url: trimmed, title: '' };
}

function replaceLinksAndImages(
  text: string,
  placeholders: string[],
  allowLinks: boolean,
): string {
  let out = '';
  let i = 0;
  const len = text.length;

  while (i < len) {
    if (text[i] === '\\' && i + 1 < len && (text[i + 1] === '[' || text[i + 1] === '!')) {
      out += text.slice(i, i + 2);
      i += 2;
      continue;
    }

    const isImage = text[i] === '!' && i + 1 < len && text[i + 1] === '[';
    const isLink = allowLinks && text[i] === '[';

    if (isImage || isLink) {
      const bracketStart = isImage ? i + 1 : i;
      let depth = 1;
      let j = bracketStart + 1;
      while (j < len && depth > 0) {
        if (text[j] === '\\' && j + 1 < len) {
          j += 2;
          continue;
        }
        if (text[j] === '[') depth++;
        else if (text[j] === ']') depth--;
        if (depth > 0) j++;
      }

      if (depth === 0 && j + 1 < len && text[j + 1] === '(') {
        const label = text.slice(bracketStart + 1, j);
        let pDepth = 1;
        let k = j + 2;
        while (k < len && pDepth > 0) {
          if (text[k] === '\\' && k + 1 < len) {
            k += 2;
            continue;
          }
          if (text[k] === '(') pDepth++;
          else if (text[k] === ')') pDepth--;
          if (pDepth > 0) k++;
        }

        if (pDepth === 0) {
          const destRaw = text.slice(j + 2, k);
          const { url, title } = parseLinkDestination(destRaw);

          if (isImage) {
            const safeSrc = sanitizeUrl(url, true);
            if (safeSrc) {
              const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
              out += stashPlaceholder(
                placeholders,
                `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(label)}" loading="lazy"${titleAttr} />`,
              );
            } else {
              out += stashPlaceholder(placeholders, escapeHtml(label));
            }
          } else {
            const safeHref = sanitizeUrl(url, false);
            const innerHtml = renderInlineInternal(label, placeholders, false);
            if (safeHref) {
              const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
              out += stashPlaceholder(
                placeholders,
                `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer"${titleAttr}>${innerHtml}</a>`,
              );
            } else {
              out += stashPlaceholder(placeholders, innerHtml);
            }
          }

          i = k + 1;
          continue;
        }
      }
    }

    out += text[i];
    i++;
  }

  return out;
}

function renderInlineInternal(
  text: string,
  placeholders: string[],
  allowLinks: boolean,
): string {
  let s = replaceInlineCode(text, placeholders);
  s = replaceInlineMath(s, placeholders);

  if (allowLinks) {
    // Autolinks: <https://...>, <http://...>, <mailto:...>
    s = s.replace(/<(https?:\/\/[^\s<>]+|mailto:[^\s<>]+)>/gi, (_match, rawUrl: string) => {
      const safe = sanitizeUrl(rawUrl, false);
      if (!safe) return escapeHtml(_match);
      const display = rawUrl.toLowerCase().startsWith('mailto:') ? rawUrl.slice(7) : rawUrl;
      return stashPlaceholder(
        placeholders,
        `<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(display)}</a>`,
      );
    });
  }

  s = replaceLinksAndImages(s, placeholders, allowLinks);

  // Escape all remaining raw HTML so no untrusted tags/attributes can survive
  s = escapeHtml(s);

  // Unescape backslash-escaped markdown punctuation (never HTML meta-chars)
  s = s.replace(/\\([\\`*_{}[\]()#+\-.!~$|])/g, '$1');

  // Bold + italic
  s = s.replace(/\*\*\*([^\s*](?:[^*]*[^\s*])?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(
    /(^|[^\w])___([^\s_](?:[^_]*[^\s_])?)___(?=$|[^\w])/g,
    '$1<strong><em>$2</em></strong>',
  );

  // Bold
  s = s.replace(/\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^\w])__([^\s_](?:[^_]*[^\s_])?)__(?=$|[^\w])/g, '$1<strong>$2</strong>');

  // Italic
  s = s.replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, '<em>$1</em>');
  s = s.replace(/(^|[^\w])_([^\s_](?:[^_]*[^\s_])?)_(?=$|[^\w])/g, '$1<em>$2</em>');

  // Strikethrough
  s = s.replace(/~~([^\s~](?:[^~]*[^\s~])?)~~/g, '<del>$1</del>');

  // Hard line breaks (two trailing spaces or trailing backslash before newline)
  s = s.replace(/(?: {2,}|\\)\n/g, '<br />\n');

  return restorePlaceholders(s, placeholders);
}

function renderInline(text: string): string {
  const placeholders: string[] = [];
  return renderInlineInternal(text, placeholders, true);
}

function splitTableCells(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
    trimmed = trimmed.slice(0, -1);
  }

  const cells: string[] = [];
  let current = '';
  let inCode = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '`') {
      inCode = !inCode;
      current += ch;
    } else if (!inCode && ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '|';
      i++;
    } else if (!inCode && ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

type TableAlign = 'left' | 'center' | 'right' | null;

function parseTableDelimiterRow(line: string): TableAlign[] | null {
  if (!line.includes('|') && !/^\s*:?-{3,}:?\s*$/.test(line)) return null;
  if (!line.includes('|')) return null;

  const cells = splitTableCells(line);
  if (cells.length === 0) return null;

  const alignments: TableAlign[] = [];
  for (const cell of cells) {
    if (!/^:?-{1,}:?$/.test(cell)) return null;
    const startsColon = cell.startsWith(':');
    const endsColon = cell.endsWith(':');
    if (startsColon && endsColon) alignments.push('center');
    else if (endsColon) alignments.push('right');
    else if (startsColon) alignments.push('left');
    else alignments.push(null);
  }
  return alignments;
}

const FENCE_START_RE = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/;
const ATX_HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+[ \t]*)?$/;
const HR_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const BLOCKQUOTE_RE = /^ {0,3}> ?(.*)$/;
const UL_ITEM_RE = /^( *)([-*+])[ \t]+(.*)$/;
const OL_ITEM_RE = /^( *)(\d{1,9})([.)])[ \t]+(.*)$/;
const TASK_PREFIX_RE = /^\[([ xX])\][ \t]+(.*)$/;
const SETEXT_H1_RE = /^ {0,3}=+ *$/;
const SETEXT_H2_RE = /^ {0,3}-+ *$/;

function isFenceStart(line: string): { char: string; len: number; lang: string } | null {
  const m = FENCE_START_RE.exec(line);
  if (!m) return null;
  const char = m[1][0];
  const info = m[2].trim();
  if (char === '`' && info.includes('`')) return null;
  const lang = info.length > 0 ? info.split(/\s+/)[0] : '';
  return { char, len: m[1].length, lang };
}

function isBlockInterrupt(lines: readonly string[], idx: number): boolean {
  const line = lines[idx];
  if (line.trim().length === 0) return true;
  if (isFenceStart(line)) return true;
  if (/^ {0,3}\$\$/.test(line)) return true;
  if (ATX_HEADING_RE.test(line)) return true;
  if (HR_RE.test(line)) return true;
  if (BLOCKQUOTE_RE.test(line)) return true;
  if (UL_ITEM_RE.test(line) || OL_ITEM_RE.test(line)) return true;
  if (
    idx + 1 < lines.length &&
    line.includes('|') &&
    parseTableDelimiterRow(lines[idx + 1]) !== null
  ) {
    return true;
  }
  return false;
}

function matchListLine(
  line: string,
): { type: 'ul' | 'ol'; indent: number; startNum: number; text: string } | null {
  const ul = UL_ITEM_RE.exec(line);
  if (ul) {
    return { type: 'ul', indent: ul[1].length, startNum: 1, text: ul[3] };
  }
  const ol = OL_ITEM_RE.exec(line);
  if (ol) {
    return { type: 'ol', indent: ol[1].length, startNum: Number(ol[2]), text: ol[4] };
  }
  return null;
}

function parseListBlock(
  lines: readonly string[],
  startIndex: number,
  baseIndent: number,
  listType: 'ul' | 'ol',
): { html: string; nextIndex: number } {
  const items: string[] = [];
  let i = startIndex;
  let firstStartNum = 1;
  let hasTaskItem = false;

  const firstMatch = matchListLine(lines[startIndex]);
  if (firstMatch && firstMatch.type === 'ol') {
    firstStartNum = firstMatch.startNum;
  }

  while (i < lines.length) {
    const match = matchListLine(lines[i]);
    if (!match || match.type !== listType || match.indent !== baseIndent) {
      break;
    }

    let itemText = match.text;
    let isTask = false;
    let isChecked = false;
    if (listType === 'ul') {
      const taskMatch = TASK_PREFIX_RE.exec(itemText);
      if (taskMatch) {
        isTask = true;
        hasTaskItem = true;
        isChecked = taskMatch[1].toLowerCase() === 'x';
        itemText = taskMatch[2];
      }
    }

    const textLines = [itemText];
    const nestedHtmlParts: string[] = [];
    i++;

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim().length === 0) {
        // Peek ahead: if next non-empty line is another item at baseIndent or deeper, skip blank
        let peek = i + 1;
        while (peek < lines.length && lines[peek].trim().length === 0) peek++;
        if (peek < lines.length) {
          const nextList = matchListLine(lines[peek]);
          if (nextList && nextList.indent >= baseIndent) {
            i = peek;
            if (nextList.indent === baseIndent) break;
            continue;
          }
        }
        break;
      }

      const nextList = matchListLine(line);
      if (nextList) {
        if (nextList.indent > baseIndent) {
          const nested = parseListBlock(lines, i, nextList.indent, nextList.type);
          nestedHtmlParts.push(nested.html);
          i = nested.nextIndex;
          continue;
        }
        break;
      }

      // Indented continuation line for current list item
      const leadingSpaces = line.length - line.trimStart().length;
      if (leadingSpaces > baseIndent) {
        textLines.push(line.trim());
        i++;
        continue;
      }

      break;
    }

    const renderedText = renderInline(textLines.join('\n'));
    const checkbox = isTask
      ? `<input type="checkbox" disabled${isChecked ? ' checked' : ''} /> `
      : '';
    const liClass = isTask ? ' class="md-task-item"' : '';
    const nested = nestedHtmlParts.length > 0 ? `\n${nestedHtmlParts.join('\n')}` : '';
    items.push(`<li${liClass}>${checkbox}${renderedText}${nested}</li>`);
  }

  if (listType === 'ol') {
    const startAttr = firstStartNum !== 1 ? ` start="${firstStartNum}"` : '';
    return { html: `<ol${startAttr}>\n${items.join('\n')}\n</ol>`, nextIndex: i };
  }

  const ulClass = hasTaskItem ? ' class="md-task-list"' : '';
  return { html: `<ul${ulClass}>\n${items.join('\n')}\n</ul>`, nextIndex: i };
}

function renderBlocks(lines: readonly string[], slugCounts: Map<string, number>): string {
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines
    if (line.trim().length === 0) {
      i++;
      continue;
    }

    // Fenced code block
    const fence = isFenceStart(line);
    if (fence) {
      const codeLines: string[] = [];
      const closeRe = new RegExp(`^ {0,3}${fence.char}{${fence.len},}\\s*$`);
      i++;
      while (i < lines.length && !closeRe.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const langHeader =
        fence.lang.length > 0
          ? `<div class="md-code-lang">${escapeHtml(fence.lang)}</div>`
          : '';
      out.push(
        `<div class="md-code-block">${langHeader}<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre></div>`,
      );
      continue;
    }

    // Block math $$ ... $$
    const singleLineMath = /^ {0,3}\$\$(.+?)\$\$\s*$/.exec(line);
    if (singleLineMath) {
      out.push(`<div class="md-math-block">${renderKatex(singleLineMath[1], true)}</div>`);
      i++;
      continue;
    }
    const openMath = /^ {0,3}\$\$(.*)$/.exec(line);
    if (openMath) {
      const mathLines: string[] = [];
      if (openMath[1].trim().length > 0) {
        mathLines.push(openMath[1]);
      }
      i++;
      while (i < lines.length) {
        const closeMath = /^(.*)\$\$\s*$/.exec(lines[i]);
        if (closeMath) {
          if (closeMath[1].trim().length > 0) {
            mathLines.push(closeMath[1]);
          }
          i++;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }
      out.push(`<div class="md-math-block">${renderKatex(mathLines.join('\n'), true)}</div>`);
      continue;
    }

    // ATX heading
    const atx = ATX_HEADING_RE.exec(line);
    if (atx) {
      const level = atx[1].length;
      const content = (atx[2] ?? '').trim();
      const slug = slugifyHeading(content, slugCounts);
      out.push(`<h${level} id="${escapeHtml(slug)}">${renderInline(content)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      out.push('<hr />');
      i++;
      continue;
    }

    // Blockquote & GitHub callouts
    if (BLOCKQUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const bq = BLOCKQUOTE_RE.exec(lines[i]);
        if (!bq) break;
        quoteLines.push(bq[1]);
        i++;
      }

      const calloutMatch =
        quoteLines.length > 0
          ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i.exec(quoteLines[0].trim())
          : null;

      if (calloutMatch) {
        const kind = calloutMatch[1].toLowerCase();
        const label = CALLOUT_LABELS[kind] ?? calloutMatch[1];
        const bodyLines = quoteLines.slice(1);
        if (calloutMatch[2].trim().length > 0) {
          bodyLines.unshift(calloutMatch[2].trim());
        }
        const bodyHtml = renderBlocks(bodyLines, slugCounts);
        out.push(
          `<div class="md-callout md-callout-${kind}"><div class="md-callout-title">${escapeHtml(label)}</div><div class="md-callout-body">${bodyHtml}</div></div>`,
        );
      } else {
        out.push(`<blockquote>${renderBlocks(quoteLines, slugCounts)}</blockquote>`);
      }
      continue;
    }

    // GFM pipe table
    if (i + 1 < lines.length && line.includes('|')) {
      const alignments = parseTableDelimiterRow(lines[i + 1]);
      if (alignments !== null) {
        const headerCells = splitTableCells(line);
        if (headerCells.length === alignments.length) {
          const colCount = alignments.length;
          const thHtml = headerCells
            .map((cell, c) => {
              const align = alignments[c];
              const style = align ? ` style="text-align:${align}"` : '';
              return `<th${style}>${renderInline(cell)}</th>`;
            })
            .join('');

          i += 2;
          const bodyRows: string[] = [];
          while (i < lines.length) {
            const rowLine = lines[i];
            if (rowLine.trim().length === 0 || !rowLine.includes('|')) break;
            if (isFenceStart(rowLine) || ATX_HEADING_RE.test(rowLine) || BLOCKQUOTE_RE.test(rowLine)) {
              break;
            }
            const rowCells = splitTableCells(rowLine);
            const tds: string[] = [];
            for (let c = 0; c < colCount; c++) {
              const align = alignments[c];
              const style = align ? ` style="text-align:${align}"` : '';
              const cellText = c < rowCells.length ? rowCells[c] : '';
              tds.push(`<td${style}>${renderInline(cellText)}</td>`);
            }
            bodyRows.push(`<tr>${tds.join('')}</tr>`);
            i++;
          }

          const tbody = bodyRows.length > 0 ? `<tbody>${bodyRows.join('')}</tbody>` : '';
          out.push(
            `<div class="md-table-wrap"><table><thead><tr>${thHtml}</tr></thead>${tbody}</table></div>`,
          );
          continue;
        }
      }
    }

    // Lists (unordered, ordered, nested, task lists)
    const listMatch = matchListLine(line);
    if (listMatch) {
      const parsed = parseListBlock(lines, i, listMatch.indent, listMatch.type);
      out.push(parsed.html);
      i = parsed.nextIndex;
      continue;
    }

    // Paragraph (or Setext heading)
    const paraLines: string[] = [line];
    i++;
    let setextLevel: 1 | 2 | null = null;

    while (i < lines.length) {
      const next = lines[i];
      if (SETEXT_H1_RE.test(next)) {
        setextLevel = 1;
        i++;
        break;
      }
      if (SETEXT_H2_RE.test(next)) {
        setextLevel = 2;
        i++;
        break;
      }
      if (isBlockInterrupt(lines, i)) {
        break;
      }
      paraLines.push(next);
      i++;
    }

    const joined = paraLines.join('\n').trim();
    if (setextLevel !== null) {
      const slug = slugifyHeading(joined, slugCounts);
      out.push(
        `<h${setextLevel} id="${escapeHtml(slug)}">${renderInline(joined)}</h${setextLevel}>`,
      );
    } else if (joined.length > 0) {
      out.push(`<p>${renderInline(joined)}</p>`);
    }
  }

  return out.join('\n');
}

export function renderMarkdownToHtml(markdown: string): string {
  const normalized = markdown.replace(/\u0000/g, '\uFFFD').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const slugCounts = new Map<string, number>();
  return renderBlocks(lines, slugCounts);
}
