// JLCPCB's stackup list (lib/emsim/jlcpcbStackups.json, about 50 kB gzipped) for the page: loaded with `await import`
// only when the picker opens or a link names a list stackup, so it is a chunk of its own and not in the first load;
// kept in module scope afterwards. `jlcResolve` is the setup's StackupResolver once the list is loaded.

import { jlcKey, jlcStackup } from '../../lib/emsim/jlcpcb';
import type { JlcData, JlcEntry } from '../../lib/emsim/jlcpcb';
import type { Stackup } from '../../lib/emsim/stackup';

let data: JlcData | null = null;
let byKey: Map<string, JlcEntry> | null = null;
let pending: Promise<JlcData> | null = null;
const built = new Map<string, Stackup>();

export const jlcLoaded = (): JlcData | null => data;

export function loadJlc(): Promise<JlcData> {
  if (data) return Promise.resolve(data);
  if (!pending) {
    pending = (async () => {
      const m = await import('../../lib/emsim/jlcpcbStackups.json');
      const d = ((m as { default?: unknown }).default ?? m) as unknown as JlcData;
      if (!d || !Array.isArray(d.stackups) || !d.materials) throw new Error('the list is not in the expected form');
      byKey = new Map(d.stackups.map((e) => [jlcKey(e), e]));
      data = d;
      return d;
    })().catch((e) => {
      pending = null; // a later open tries again
      throw e;
    });
  }
  return pending;
}

export const jlcEntry = (key: string): JlcEntry | null => byKey?.get(key) ?? null;

// The list stackup of a key as jlcStackup builds it (built once per key; callers never change it), null when the key
// is not in the list or the list is not loaded.
export function jlcResolve(key: string): Stackup | null {
  if (!data) return null;
  let s = built.get(key);
  if (!s) {
    const e = byKey!.get(key);
    if (!e) return null;
    s = jlcStackup(e, data);
    built.set(key, s);
  }
  return s;
}

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
