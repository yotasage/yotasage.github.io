// Structured append: one message split over up to 16 QR symbols, each with its place and the parity of the whole
// message. The symbols are gathered from every image and camera reading on the page and joined in order.

import { utf8OrNull } from './bytes';
import type { Detection } from './zxing';

export interface Sequence {
  id: string;
  size: number;
  /** One per place; null where that symbol has not been read yet. */
  parts: (Detection | null)[];
  complete: boolean;
  /** The joined content, when complete. */
  text?: string;
  bytes?: Uint8Array;
}

export function sequences(detections: Detection[]): Sequence[] {
  const groups = new Map<string, Sequence>();
  for (const d of detections) {
    if (!d.valid || !d.sequence) continue;
    const key = `${d.sequence.id}/${d.sequence.size}`;
    let g = groups.get(key);
    if (!g) {
      g = { id: d.sequence.id, size: d.sequence.size, parts: Array(d.sequence.size).fill(null), complete: false };
      groups.set(key, g);
    }
    if (d.sequence.index < g.size && !g.parts[d.sequence.index]) g.parts[d.sequence.index] = d;
  }
  for (const g of groups.values()) {
    g.complete = g.parts.every(Boolean);
    if (!g.complete) continue;
    const total = g.parts.reduce((n, d) => n + d.bytes.length, 0);
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const d of g.parts) { bytes.set(d.bytes, at); at += d.bytes.length; }
    g.bytes = bytes;
    // The message was split by bytes: joined, it is valid UTF-8 even where a part on its own was not. With ECI
    // or another character set, each part's own text is joined.
    const utf8 = g.parts.some((d) => d.hasECI) ? null : utf8OrNull(bytes);
    g.text = utf8 ?? g.parts.map((d) => d.text).join('');
  }
  return [...groups.values()];
}
