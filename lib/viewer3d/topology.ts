// Finds which triangles of a mesh share an edge, by merging vertices at the same position. This gives the edges to
// draw (the edges between the faces of a CAD model, or the sharp edges and open borders of a mesh) and tells whether
// the mesh is closed, which its volume needs in order to mean something.
import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

export interface Topology {
  // Every edge has two (or more) triangles: the mesh has no holes, so it encloses a volume. Edges with more than two
  // triangles are where closed parts touch, which keeps the volume right.
  closed: boolean;
  // Pairs of points (in the coordinates of the geometry) along the edges worth drawing.
  edges: Float32Array;
}

// Larger meshes take too long and too much memory to analyse in the page.
export const MAX_TRIANGLES = 2_000_000;
// Without B-rep faces, an edge is drawn where the surface bends by more than this angle.
const SHARP_COS = Math.cos((30 * Math.PI) / 180);
// Positions are rounded to this many steps across the size of the mesh. 2^17 steps per axis keep the combined key
// below 2^53, so it is an exact JavaScript number.
const STEPS = 131072;

const cache = new WeakMap<BufferGeometry, Topology | null>();

// Null for meshes that are too large or have no triangles.
export function topology(geometry: BufferGeometry): Topology | null {
  if (!cache.has(geometry)) cache.set(geometry, compute(geometry));
  return cache.get(geometry);
}

// Gives vertices at the same position the same id, and keeps one original vertex for each id.
function mergeVertices(geometry: BufferGeometry): { merged: Uint32Array; representative: number[] } {
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) || 1;
  const scale = (STEPS - 1) / size;
  const merged = new Uint32Array(pos.count);
  const idOf = new Map<number, number>();
  const representative: number[] = [];
  const keyOf = (x: number, y: number, z: number) => x + y * STEPS + z * STEPS * STEPS;
  // A position close to the middle between two steps can round either way for two copies of the same vertex (on
  // the seam of a model centred on the origin, for instance), so the neighbouring step is searched too.
  const neighbour = (f: number, r: number) => (Math.abs(f - r) > 0.4 ? (f > r ? r + 1 : r - 1) : r);
  for (let i = 0; i < pos.count; i += 1) {
    const fx = (pos.getX(i) - min.x) * scale;
    const fy = (pos.getY(i) - min.y) * scale;
    const fz = (pos.getZ(i) - min.z) * scale;
    const rx = Math.round(fx);
    const ry = Math.round(fy);
    const rz = Math.round(fz);
    const key = keyOf(rx, ry, rz);
    let id = idOf.get(key);
    if (id === undefined) {
      const nx = neighbour(fx, rx);
      const ny = neighbour(fy, ry);
      const nz = neighbour(fz, rz);
      const axes = (nx !== rx ? 1 : 0) | (ny !== ry ? 2 : 0) | (nz !== rz ? 4 : 0);
      // Every combination of the axes that are near the middle.
      for (let m = axes; m > 0 && id === undefined; m = (m - 1) & axes) {
        id = idOf.get(keyOf(m & 1 ? nx : rx, m & 2 ? ny : ry, m & 4 ? nz : rz));
      }
    }
    if (id === undefined) {
      id = representative.length;
      idOf.set(key, id);
      representative.push(i);
    }
    merged[i] = id;
  }
  return { merged, representative };
}

// Normals for a mesh of separate triangles (such as STL, which stores one normal per triangle): smooth across edges
// where the surface bends by less than `creaseDegrees`, sharp where it bends more. Curved surfaces then look round
// and flat faces stay flat.
export function smoothNormals(geometry: BufferGeometry, creaseDegrees = 30) {
  const pos = geometry.attributes.position;
  const triangles = Math.floor(pos.count / 3);
  if (geometry.index || triangles === 0 || triangles > MAX_TRIANGLES) return;
  const { merged, representative } = mergeVertices(geometry);

  // Normal of every triangle, with a length of twice its area, so larger triangles count for more.
  const faceNormals = new Float32Array(triangles * 3);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let t = 0; t < triangles; t += 1) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    c.sub(b).cross(a.sub(b)).toArray(faceNormals, t * 3);
  }
  // The triangles around every merged vertex.
  const start = new Uint32Array(representative.length + 1);
  for (let i = 0; i < pos.count; i += 1) start[merged[i] + 1] += 1;
  for (let v = 0; v < representative.length; v += 1) start[v + 1] += start[v];
  const around = new Uint32Array(pos.count);
  const filled = start.slice(0, -1);
  for (let i = 0; i < pos.count; i += 1) around[filled[merged[i]]++] = Math.floor(i / 3);

  const creaseCos = Math.cos((creaseDegrees * Math.PI) / 180);
  const normals = new Float32Array(pos.count * 3);
  const own = new Vector3();
  const other = new Vector3();
  const sum = new Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.floor(i / 3);
    own.fromArray(faceNormals, t * 3).normalize();
    sum.set(0, 0, 0);
    const v = merged[i];
    for (let k = start[v]; k < start[v + 1]; k += 1) {
      other.fromArray(faceNormals, around[k] * 3);
      const length = other.length();
      if (length > 0 && other.dot(own) / length >= creaseCos) sum.add(other);
    }
    (sum.lengthSq() > 0 ? sum.normalize() : own).toArray(normals, i * 3);
  }
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
}

function compute(geometry: BufferGeometry): Topology | null {
  const pos = geometry.attributes.position;
  if (!pos) return null;
  const index = geometry.index;
  const triangles = Math.floor((index ? index.count : pos.count) / 3);
  if (triangles === 0 || triangles > MAX_TRIANGLES) return null;
  const faceIds: Uint32Array | undefined = geometry.userData.faceIds;
  const { merged, representative } = mergeVertices(geometry);
  const n = representative.length;
  const vertex = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);

  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const normalOf = (t: number, out: Vector3) => {
    a.fromBufferAttribute(pos, vertex(t, 0));
    b.fromBufferAttribute(pos, vertex(t, 1));
    c.fromBufferAttribute(pos, vertex(t, 2));
    return out.subVectors(c, b).cross(a.sub(b)).normalize();
  };
  const n1 = new Vector3();
  const n2 = new Vector3();
  const isFeature = (t1: number, t2: number) => {
    if (faceIds) return faceIds[t1] !== faceIds[t2];
    return normalOf(t1, n1).dot(normalOf(t2, n2)) < SHARP_COS;
  };

  // For every edge (key lo * n + hi), the first triangle that has it and how many do (1, 2, or 3 for three or more).
  const edgeOf = new Map<number, number>();
  const lines: number[] = [];
  const pushEdge = (lo: number, hi: number) => {
    const p = representative[lo];
    const q = representative[hi];
    lines.push(pos.getX(p), pos.getY(p), pos.getZ(p), pos.getX(q), pos.getY(q), pos.getZ(q));
  };
  let closed = true;
  const visit = (p: number, q: number, t: number) => {
    const lo = Math.min(p, q);
    const hi = Math.max(p, q);
    const key = lo * n + hi;
    const value = edgeOf.get(key);
    if (value === undefined) {
      edgeOf.set(key, t * 4 + 1);
      return;
    }
    const count = value % 4;
    const first = (value - count) / 4;
    if (count === 1 && isFeature(first, t)) pushEdge(lo, hi);
    edgeOf.set(key, first * 4 + Math.min(3, count + 1));
  };
  for (let t = 0; t < triangles; t += 1) {
    const v0 = merged[vertex(t, 0)];
    const v1 = merged[vertex(t, 1)];
    const v2 = merged[vertex(t, 2)];
    // Triangles without area have no edges of their own.
    if (v0 === v1 || v1 === v2 || v0 === v2) continue;
    visit(v0, v1, t);
    visit(v1, v2, t);
    visit(v2, v0, t);
  }
  // Edges of only one triangle are the borders of holes.
  for (const [key, value] of edgeOf) {
    if (value % 4 !== 1) continue;
    closed = false;
    const lo = Math.floor(key / n);
    pushEdge(lo, key - lo * n);
  }
  return { closed, edges: new Float32Array(lines) };
}
