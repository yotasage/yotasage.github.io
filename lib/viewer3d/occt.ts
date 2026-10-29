// Reads STEP, IGES and BREP files with occt-import-js (Open CASCADE compiled to WebAssembly) in a Web Worker, so the
// page keeps responding while a large file is read. The library is LGPL-2.1: it is served unmodified from
// public/3d/occt (copied by scripts/copy-3d-assets.mjs) and loaded with importScripts, so it stays a separate file
// that anyone can replace with their own build.

export type CadFormat = 'step' | 'iges' | 'brep';

export type MeshQuality = 'draft' | 'normal' | 'fine';

// Deflection relative to the size of the model, and angular deflection in radians; see the tessellation parameters
// in the README of occt-import-js. Finer settings follow curved surfaces more closely and give more triangles.
const QUALITY: Record<MeshQuality, { linearDeflection: number; angularDeflection: number }> = {
  draft: { linearDeflection: 0.004, angularDeflection: 0.8 },
  normal: { linearDeflection: 0.001, angularDeflection: 0.5 },
  fine: { linearDeflection: 0.0002, angularDeflection: 0.2 },
};

export interface CadNode {
  name: string;
  meshes: number[];
  children: CadNode[];
}

export interface CadMesh {
  name: string;
  color: [number, number, number] | null;
  // Triangle ranges of the faces of the B-rep, with their own colour if the file gives one.
  faces: { first: number; last: number; color: [number, number, number] | null }[];
  position: Float32Array;
  normal: Float32Array | null;
  index: Uint32Array;
}

export interface CadResult {
  root: CadNode;
  meshes: CadMesh[];
}

// Runs in the worker. The results of occt-import-js are plain arrays; they are turned into typed arrays here and
// transferred, which is much faster than copying them to the page.
const WORKER_SOURCE = `
let loading = null;
self.onmessage = async (event) => {
  const { id, base, format, bytes, params } = event.data;
  try {
    if (!loading) {
      importScripts(base + 'occt-import-js.js');
      loading = occtimportjs({ locateFile: (name) => base + name });
    }
    const occt = await loading;
    self.postMessage({ id, stage: 'reading' });
    const result = occt.ReadFile(format, bytes, params);
    if (!result.success) {
      self.postMessage({ id, error: 'Open CASCADE could not read the file. It may be damaged, or not a ' + format.toUpperCase() + ' file.' });
      return;
    }
    const transfer = [];
    const meshes = result.meshes.map((m) => {
      const position = new Float32Array(m.attributes.position.array);
      const normal = m.attributes.normal ? new Float32Array(m.attributes.normal.array) : null;
      const index = new Uint32Array(m.index.array);
      transfer.push(position.buffer, index.buffer);
      if (normal) transfer.push(normal.buffer);
      const faces = m.brep_faces.map((f) => ({ first: f.first, last: f.last, color: f.color || null }));
      return { name: m.name, color: m.color || null, faces, position, normal, index };
    });
    self.postMessage({ id, result: { root: result.root, meshes } }, transfer);
  } catch (e) {
    self.postMessage({ id, error: String((e && e.message) || e), fatal: true });
  }
};
`;

let worker: Worker | null = null;
let workerUrl: string | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (r: CadResult) => void; reject: (e: Error) => void; onStage?: (stage: 'reading') => void }>();

function stopWorker(error?: Error) {
  worker?.terminate();
  worker = null;
  if (workerUrl) URL.revokeObjectURL(workerUrl);
  workerUrl = null;
  for (const p of pending.values()) p.reject(error ?? new Error('The CAD reader was stopped.'));
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
  worker = new Worker(workerUrl);
  worker.onmessage = (event) => {
    const { id, stage, result, error, fatal } = event.data;
    const job = pending.get(id);
    if (!job) return;
    if (stage) {
      job.onStage?.(stage);
      return;
    }
    pending.delete(id);
    if (result) job.resolve(result);
    else job.reject(new Error(error));
    // An exception inside the WebAssembly module (such as running out of memory) can leave it unusable.
    if (fatal) stopWorker();
  };
  worker.onerror = (event) => {
    event.preventDefault();
    stopWorker(new Error(event.message || 'The CAD reader could not be started.'));
  };
  return worker;
}

export function readCadFile(
  bytes: Uint8Array,
  format: CadFormat,
  quality: MeshQuality,
  onStage?: (stage: 'reading') => void,
): Promise<CadResult> {
  const id = (nextId += 1);
  const base = new URL('/3d/occt/', location.href).href;
  const params = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', ...QUALITY[quality] };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onStage });
    // A copy is transferred, so the caller keeps its bytes for reading the file again at another quality.
    const copy = bytes.slice();
    getWorker().postMessage({ id, base, format, bytes: copy, params }, [copy.buffer]);
  });
}

// Frees the memory of the WebAssembly module; it is loaded again when the next CAD file is opened.
export function disposeCadReader() {
  stopWorker();
}
