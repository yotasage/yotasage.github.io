// Pure in-memory handoff for chaining PDF tool outputs directly into the next tool via Next.js router navigation.
// Never touches localStorage, sessionStorage, IndexedDB, or the network.

export interface HandoffFile {
  name: string;
  bytes: Uint8Array;
}

let pending: HandoffFile[] | null = null;

export function setHandoff(files: HandoffFile[]): void {
  pending = files.length > 0 ? files : null;
}

export function consumeHandoff(): HandoffFile[] | null {
  const out = pending;
  pending = null;
  return out;
}

export function handoffToFiles(files: HandoffFile[]): File[] {
  return files.map((h) => new File([h.bytes as BlobPart], h.name, { type: 'application/pdf' }));
}
