// A small XML reader for EAGLE files: elements with their attributes, children and text, the five named entities and
// numeric character references decoded. EAGLE writes well-formed XML described by eagle.dtd; the declaration, the
// DOCTYPE, comments and processing instructions are skipped, CDATA is text.

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  // The element's own text (between its child elements too), entities decoded.
  text: string;
}

const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return NAMED[e] ?? m;
  });
}

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function element(name: string): XmlElement {
  return { name, attrs: {}, children: [], text: '' };
}

// The root element of a document. Unclosed elements end at the end of the text; a closing tag closes the innermost open
// element of its name.
export function parseXml(src: string): XmlElement {
  const doc = element('#document');
  const stack: XmlElement[] = [doc];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    const top = stack[stack.length - 1];
    if (lt < 0) {
      top.text += decodeEntities(src.slice(i));
      break;
    }
    if (lt > i) top.text += decodeEntities(src.slice(i, lt));
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt + 9);
      top.text += src.slice(lt + 9, end < 0 ? n : end);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt + 2);
      i = end < 0 ? n : end + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE, possibly with an internal subset in brackets.
      let j = lt + 2;
      let depth = 0;
      while (j < n) {
        const c = src.charCodeAt(j);
        if (c === 91) depth += 1;
        else if (c === 93) depth -= 1;
        else if (c === 62 && depth <= 0) break;
        j += 1;
      }
      i = j + 1;
      continue;
    }
    if (src.charCodeAt(lt + 1) === 47) {
      const end = src.indexOf('>', lt + 2);
      const name = src.slice(lt + 2, end < 0 ? n : end).trim();
      for (let k = stack.length - 1; k > 0; k -= 1) {
        if (stack[k].name === name) {
          stack.length = k;
          break;
        }
      }
      i = end < 0 ? n : end + 1;
      continue;
    }
    // A start tag: its end is the first '>' outside quotes.
    let j = lt + 1;
    let quote = 0;
    while (j < n) {
      const c = src.charCodeAt(j);
      if (quote) {
        if (c === quote) quote = 0;
      } else if (c === 34 || c === 39) quote = c;
      else if (c === 62) break;
      j += 1;
    }
    const selfClosing = src.charCodeAt(j - 1) === 47;
    const inner = src.slice(lt + 1, selfClosing ? j - 1 : j);
    let k = 0;
    while (k < inner.length && !/\s/.test(inner[k])) k += 1;
    const el = element(inner.slice(0, k));
    if (k < inner.length) {
      ATTR.lastIndex = k;
      for (let m = ATTR.exec(inner); m; m = ATTR.exec(inner)) el.attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
    }
    top.children.push(el);
    if (!selfClosing) stack.push(el);
    i = j + 1;
  }
  const root = doc.children[0];
  if (!root) throw new Error('The file has no XML element.');
  return root;
}

// The first child with this name.
export function child(el: XmlElement | undefined, name: string): XmlElement | undefined {
  return el?.children.find((c) => c.name === name);
}

// The children with this name.
export function children(el: XmlElement | undefined, name: string): XmlElement[] {
  return el ? el.children.filter((c) => c.name === name) : [];
}

// The bytes of an XML file as text, in the encoding its declaration names (UTF-8 if none, or if it is unknown).
export function decodeXml(bytes: Uint8Array): string {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const m = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(head);
  let label = m?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    label = 'utf-8';
    return new TextDecoder(label).decode(bytes);
  }
}
