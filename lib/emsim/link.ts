// The setup in the page's link (plan.md "Ground rules": the whole setup in the query string, replaced without
// reloading). Versioned; parts equal to the default setup are left out. Each part is setup.ts's plain form written as
// compact text that needs no escaping in a query string for the usual characters:
//   object (k:v,k:v) · array !(a,b) · true !t · false !f · null !n · number as JavaScript writes it (exact) ·
//   text bare when it is a name (L1, F.Cu, JLC061611-3313A) or quoted '…' with !! and !' inside.
// Reading never throws: unknown or bad parts give issues and defaults.

import { fromPlain, sameSetup, toPlain } from './setup';
import type { Plain, Setup, StackupResolver } from './setup';
import { issue } from './stackup';
import type { Issue } from './stackup';

export const LINK_VERSION = 1;
// The query parameters, in the order they are written.
export const PARAMS = ['v', 's', 't', 'via', 'src'] as const;

// --- The text form ---

const BARE = /^[A-Za-z_][A-Za-z0-9_.\-]*$/;

export function encodeValue(x: unknown): string {
  if (x === null || x === undefined) return '!n';
  if (x === true) return '!t';
  if (x === false) return '!f';
  if (typeof x === 'number') return Number.isFinite(x) ? String(x) : '!n';
  if (typeof x === 'string') return BARE.test(x) ? x : `'${x.replace(/!/g, '!!').replace(/'/g, "!'")}'`;
  if (Array.isArray(x)) return `!(${x.map(encodeValue).join(',')})`;
  if (typeof x === 'object') {
    const parts: string[] = [];
    for (const k of Object.keys(x)) {
      const v = (x as Record<string, unknown>)[k];
      if (v !== undefined) parts.push(`${encodeValue(k)}:${encodeValue(v)}`);
    }
    return `(${parts.join(',')})`;
  }
  return '!n';
}

class Syntax extends Error {}

export function decodeValue(text: string): unknown {
  let i = 0;
  const n = text.length;
  const fail = (what: string): never => { throw new Syntax(`${what} at character ${i + 1}`); };
  const value = (): unknown => {
    if (i >= n) fail('the text ends early');
    const c = text[i];
    if (c === '(') {
      i += 1;
      const o: Record<string, unknown> = {};
      if (text[i] === ')') { i += 1; return o; }
      for (;;) {
        const k = value();
        if (typeof k !== 'string') fail('a key is not text');
        if (text[i] !== ':') fail('":" is missing');
        i += 1;
        o[k as string] = value();
        if (text[i] === ',') { i += 1; continue; }
        if (text[i] === ')') { i += 1; return o; }
        fail('"," or ")" is missing');
      }
    }
    if (c === '!') {
      const d = text[i + 1];
      i += 2;
      if (d === 't') return true;
      if (d === 'f') return false;
      if (d === 'n') return null;
      if (d === '(') {
        const a: unknown[] = [];
        if (text[i] === ')') { i += 1; return a; }
        for (;;) {
          a.push(value());
          if (text[i] === ',') { i += 1; continue; }
          if (text[i] === ')') { i += 1; return a; }
          fail('"," or ")" is missing');
        }
      }
      return fail('"!" is followed by something unknown');
    }
    if (c === "'") {
      i += 1;
      let out = '';
      for (;;) {
        if (i >= n) fail('a quote does not end');
        const q = text[i];
        if (q === '!') {
          const e = text[i + 1];
          if (e !== '!' && e !== "'") fail('"!" in a quote is followed by something unknown');
          out += e;
          i += 2;
        } else if (q === "'") { i += 1; return out; }
        else { out += q; i += 1; }
      }
    }
    const start = i;
    while (i < n && !'(),:!\''.includes(text[i])) i += 1;
    const tok = text.slice(start, i);
    if (!tok) fail('a value is missing');
    if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(tok)) return Number(tok);
    if (BARE.test(tok)) return tok;
    return fail(`"${tok}" cannot be read`);
  };
  const v = value();
  if (i !== n) fail('there is more after the value');
  return v;
}

// Escapes a part for a query string, keeping the characters of the text form readable.
function escapePart(s: string): string {
  return encodeURIComponent(s).replace(/%2C/g, ',').replace(/%3A/g, ':');
}

// --- Encode and decode ---

// The query string (without "?"): "v=1" alone for the default setup. With `resolve`, an unedited JLCPCB list stackup
// is written as its key.
export function encodeLink(x: Setup, resolve?: StackupResolver): string {
  const p: Plain = toPlain(x, true, resolve);
  const parts = [`v=${LINK_VERSION}`];
  for (const k of PARAMS) {
    if (k === 'v') continue;
    const v = (p as Record<string, unknown>)[k];
    if (v !== undefined) parts.push(`${k}=${escapePart(encodeValue(v))}`);
  }
  return parts.join('&');
}

export interface Decoded {
  setup: Setup;
  issues: Issue[];
  linked: boolean; // the link held any part of a setup
  version: number;
}

// Reads a query string, a "?…" or a whole URL. Never throws. `resolve` reads JLCPCB list keys (setup.ts).
export function decodeLink(text: string, resolve?: StackupResolver): Decoded {
  const issues: Issue[] = [];
  let q = String(text ?? '');
  const hash = q.indexOf('#');
  if (hash >= 0) q = q.slice(0, hash);
  const qm = q.indexOf('?');
  if (qm >= 0) q = q.slice(qm + 1);
  const plain: Record<string, unknown> = {};
  let version = 0;
  let linked = false;
  for (const pair of q.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = eq < 0 ? pair : pair.slice(0, eq);
    let value: string;
    try {
      value = decodeURIComponent((eq < 0 ? '' : pair.slice(eq + 1)).replace(/\+/g, ' '));
    } catch {
      issues.push(issue('warn', 'link', key, `The link's "${key}" is not properly escaped; it is ignored.`));
      continue;
    }
    if (key === 'v') {
      version = Number(value);
      if (!Number.isInteger(version) || version < 1) { issues.push(issue('warn', 'link', 'v', `The link's version "${value}" cannot be read; it is read as version ${LINK_VERSION}.`)); version = LINK_VERSION; }
      continue;
    }
    if (!(PARAMS as readonly string[]).includes(key)) {
      issues.push(issue('note', 'link', key, `The link's "${key}" is not used by this tool; it is ignored.`));
      continue;
    }
    try {
      plain[key] = decodeValue(value);
      linked = true;
    } catch (e) {
      issues.push(issue('warn', 'link', key, `The link's "${key}" cannot be read (${e instanceof Error ? e.message : String(e)}); the default is used.`));
    }
  }
  if (linked && version === 0) version = LINK_VERSION;
  if (version > LINK_VERSION) issues.push(issue('warn', 'link', 'v', `The link was made by a newer version of this tool (${version}); it is read as version ${LINK_VERSION}, and parts it cannot read are defaults.`));
  const r = fromPlain(plain, resolve);
  return { setup: r.setup, issues: [...issues, ...r.issues], linked, version };
}

// Whether a setup survives its link unchanged (the harness's round trip, and a guard before a link is shared).
export function linkRoundTrips(x: Setup, resolve?: StackupResolver): boolean {
  const d = decodeLink(encodeLink(x, resolve), resolve);
  return d.issues.length === 0 && sameSetup(d.setup, x);
}
