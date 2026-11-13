// The lesson part of the Smith chart tool's link (step M6.2; examples-challenges.md §2, learning.md §7): locks, hidden
// panels and the teacher's text, read and written beside the circuit's own parameters by state.ts, and `keepLocks`,
// which the page's `commit` runs on every new circuit so no path (undo, Apply, drags, keys, Start over) changes a
// locked value. Also the challenge's parameter `ch=<kind>.<seed>` (challenge.ts makes the problem from it), read here
// so state.ts need not load the solver. Framework-free; reading never throws, every token left out says why.
//
//   lk  comma list of z0, f0, zl, parts, k<n>, v<n> (n the part from the load, 1-based as `u`)
//   hd  comma list of solve, suggest, reveal
//   tx  plain text, at most TEXT_MAX code points (URL-encoded as URLSearchParams reads it)
//   ch  <kind>.<seed>, kind two | stub | qw | e24 | read, seed a whole number 0 … 2³² − 1 in decimal

import type { Circuit } from './state';

/** A lock: Z0, f0, the load (R and X), the parts' list (no add, remove or move), a part's kind or its value (0-based). */
export type Lock = 'z0' | 'f0' | 'zl' | 'parts' | { kind: number } | { value: number };
/** A panel the lesson hides: the Solve panel (and its marks), the suggestions, a challenge's reveal. */
export type Panel = 'solve' | 'suggest' | 'reveal';
export const PANELS: readonly Panel[] = ['solve', 'suggest', 'reveal'];

export interface Lesson {
  locks: Lock[];
  hidden: Panel[];
  /** Plain text (the page sets textContent, line breaks kept), at most TEXT_MAX code points. */
  text: string;
}

/** The teacher's text is cut at this many code points. */
export const TEXT_MAX = 500;

const quote = (s: string): string => `“${s.length > 40 ? `${s.slice(0, 40)}…` : s}”`;

/** The link token of a lock. */
export function lockText(lock: Lock): string {
  if (typeof lock === 'string') return lock;
  return 'kind' in lock ? `k${lock.kind + 1}` : `v${lock.value + 1}`;
}

const sameLock = (a: Lock, b: Lock): boolean => lockText(a) === lockText(b);

const LOCK_TOKEN = /^(?:(z0|f0|zl|parts)|([kv])(\d{1,3}))$/;

/** Text with every lone surrogate replaced by U+FFFD, so encodeURIComponent cannot throw. */
function wellFormed(s: string): string {
  let out = '', from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0xd800 || c > 0xdfff) continue;
    if (c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; }
    }
    out += `${s.slice(from, i)}�`;
    from = i + 1;
  }
  return from ? out + s.slice(from) : s;
}

/** The text cut at `max` code points (no surrogate pair split); `cut` when it was longer. */
export function cutText(text: string, max = TEXT_MAX): { text: string; cut: boolean } {
  const t = wellFormed(text);
  if (t.length <= max) return { text: t, cut: false }; // UTF-16 units ≥ code points
  let units = 0, points = 0;
  while (units < t.length && points < max) {
    const c = t.charCodeAt(units);
    units += c >= 0xd800 && c <= 0xdbff ? 2 : 1;
    points++;
  }
  return units < t.length ? { text: t.slice(0, units), cut: true } : { text: t, cut: false };
}

/**
 * The lesson of a link's lk, hd and tx (as URLSearchParams decoded them; null when absent) for a circuit of `parts`
 * parts. Never throws: an unknown lock or panel, a k<n> or v<n> beyond the parts, or a repeat is left out with an issue;
 * text over TEXT_MAX code points is cut with an issue. null when the link has no lesson part (or only empty ones).
 */
export function readLesson(lk: string | null, hd: string | null, tx: string | null, parts: number, issues: string[]): Lesson | null {
  const locks: Lock[] = [], hidden: Panel[] = [];
  if (lk) {
    for (const raw of lk.split(',')) {
      const token = raw.trim().toLowerCase();
      if (!token) continue;
      const m = LOCK_TOKEN.exec(token);
      let lock: Lock | null = null, why = '';
      if (!m) why = 'not a lock (z0, f0, zl, parts, k<n> or v<n>)';
      else if (m[1]) lock = m[1] as Lock;
      else {
        const i = Number(m[3]) - 1;
        if (i < 0 || i >= parts) why = `there is no part ${i + 1}`;
        else lock = m[2] === 'k' ? { kind: i } : { value: i };
      }
      if (lock && locks.some((l) => sameLock(l, lock))) why = 'given twice';
      if (why) issues.push(`lk ${quote(raw)}: ${why}; left out`);
      else locks.push(lock);
    }
  }
  if (hd) {
    for (const raw of hd.split(',')) {
      const token = raw.trim().toLowerCase();
      if (!token) continue;
      if (!PANELS.includes(token as Panel)) issues.push(`hd ${quote(raw)}: not a panel (solve, suggest or reveal); left out`);
      else if (hidden.includes(token as Panel)) issues.push(`hd ${quote(raw)}: given twice; left out`);
      else hidden.push(token as Panel);
    }
  }
  let text = '';
  if (tx) {
    const c = cutText(tx);
    if (c.cut) issues.push(`tx: longer than ${TEXT_MAX} characters; cut at ${TEXT_MAX}`);
    text = c.text;
  }
  return locks.length || hidden.length || text ? { locks, hidden, text } : null;
}

/** The lesson's part of the link: "&lk=…&hd=…&tx=…", each only when not empty; '' for none. */
export function lessonParams(lesson: Lesson | null): string {
  if (!lesson) return '';
  let s = '';
  if (lesson.locks.length) s += `&lk=${lesson.locks.map(lockText).join(',')}`;
  if (lesson.hidden.length) s += `&hd=${lesson.hidden.join(',')}`;
  const text = cutText(lesson.text).text;
  if (text) s += `&tx=${encodeURIComponent(text)}`;
  return s;
}

/** Whether a lock of this kind is in the lesson. */
export const hasLock = (lesson: Lesson | null, lock: Lock): boolean => !!lesson && lesson.locks.some((l) => sameLock(l, lock));
/** Whether part i's value (and Zc) is locked. */
export const valueLocked = (lesson: Lesson | null, i: number): boolean => hasLock(lesson, { value: i });
/** Whether part i's kind is locked (it cannot be removed, moved or changed to another kind). */
export const kindLocked = (lesson: Lesson | null, i: number): boolean => hasLock(lesson, { kind: i }) || hasLock(lesson, 'parts');

/**
 * `next` with `base`'s locked parameters (base: the lesson's circuit). Z0, f0 and the load are restored when locked.
 * The parts: with `parts` locked, a different count or any different kind brings back base's parts (and its ask);
 * with k<n> or v<n> locked, so does a count that no longer reaches part n or a different kind there; v<n> then puts
 * base's value and Zc back into part n. Returns `next` itself when nothing had to change.
 */
export function keepLocks(lesson: Lesson | null, base: Circuit, next: Circuit): Circuit {
  if (!lesson || !lesson.locks.length) return next;
  let out = next;
  const set = (patch: Partial<Circuit>): void => { out = out === next ? { ...next, ...patch } : Object.assign(out, patch); };
  let partsBack = false;
  const values: number[] = [];
  for (const lock of lesson.locks) {
    if (lock === 'z0') { if (!Object.is(next.z0, base.z0)) set({ z0: base.z0 }); }
    else if (lock === 'f0') { if (!Object.is(next.f0, base.f0)) set({ f0: base.f0 }); }
    else if (lock === 'zl') { if (!Object.is(next.loadR, base.loadR) || !Object.is(next.loadX, base.loadX)) set({ loadR: base.loadR, loadX: base.loadX }); }
    else if (lock === 'parts') {
      if (next.parts.length !== base.parts.length) partsBack = true;
      else for (let i = 0; i < base.parts.length; i++) if (next.parts[i].kind !== base.parts[i].kind) { partsBack = true; break; }
    } else {
      const i = 'kind' in lock ? lock.kind : lock.value;
      if (i >= base.parts.length) continue; // a lock beyond the lesson's parts holds nothing
      if (i >= next.parts.length || next.parts[i].kind !== base.parts[i].kind) partsBack = true;
      else if ('value' in lock) values.push(i);
    }
  }
  if (partsBack) {
    set({ parts: base.parts.map((p) => ({ ...p })) });
    if (base.ask) set({ ask: base.ask }); else if (out.ask) { const { ask: _, ...rest } = out; out = rest; }
    return out;
  }
  for (const i of values) {
    const p = next.parts[i], q = base.parts[i];
    if (Object.is(p.value, q.value) && Object.is(p.zc, q.zc)) continue;
    const parts = (out === next ? next.parts : out.parts).slice();
    parts[i] = { ...q };
    set({ parts });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The challenge's parameter (challenge.ts makes the problem)

export type ChallengeKind = 'two' | 'stub' | 'qw' | 'e24' | 'read';
export const CHALLENGE_KINDS: readonly ChallengeKind[] = ['two', 'stub', 'qw', 'e24', 'read'];
/** The largest seed (2³² − 1). */
export const SEED_MAX = 4294967295;

/** The link text of a challenge: "two.48213". */
export const challengeText = (kind: ChallengeKind, seed: number): string => `${kind}.${seed >>> 0}`;

const CHALLENGE_TOKEN = /^([a-z0-9]+)\.(\d{1,10})$/;

/** The kind and seed of a `ch` text, or why it cannot be read. */
export function readChallenge(text: string): { kind: ChallengeKind; seed: number } | string {
  const m = CHALLENGE_TOKEN.exec(String(text ?? '').trim().toLowerCase());
  if (!m) return 'not a challenge (kind.seed, as two.48213)';
  if (!CHALLENGE_KINDS.includes(m[1] as ChallengeKind)) return `unknown kind ${quote(m[1])} (two, stub, qw, e24 or read)`;
  const seed = Number(m[2]);
  if (seed > SEED_MAX) return `the seed must be 0 to ${SEED_MAX}`;
  return { kind: m[1] as ChallengeKind, seed };
}
