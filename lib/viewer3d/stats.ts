// Size, counts, surface area and volume of a model, and helpers to walk its objects without the viewer's own
// additions (edge lines, section caps).
import { Box3, BufferGeometry, InstancedMesh, Line, Mesh, Object3D, Points, Vector3 } from 'three';

import { topology } from './topology';

// Objects the viewer adds to a model are marked, so they are left out of statistics, picking and exports.
export function markHelper<T extends Object3D>(object: T): T {
  object.userData.viewerHelper = true;
  object.raycast = () => {};
  return object;
}

export function isHelper(object: Object3D): boolean {
  return Boolean(object.userData.viewerHelper);
}

// The groups of the files of a model with several files, which the viewer can move apart (see Viewer.setOffsets).
export function isFileGroup(object: Object3D): boolean {
  return Boolean(object.userData.fileGroup);
}

// Runs `fn` with the files back where the files put them: the offsets only move them in the view.
export function withoutOffsets<T>(root: Object3D, fn: () => T): T {
  const moved = root.children.filter((o) => isFileGroup(o) && o.position.lengthSq() > 0);
  const offsets = moved.map((o) => o.position.clone());
  moved.forEach((o) => o.position.set(0, 0, 0));
  root.updateMatrixWorld(true);
  try {
    return fn();
  } finally {
    moved.forEach((o, i) => o.position.copy(offsets[i]));
    root.updateMatrixWorld(true);
  }
}

function isShown(object: Object3D, root: Object3D): boolean {
  for (let o = object; o && o !== root.parent; o = o.parent) if (!o.visible) return false;
  return true;
}

// The meshes, lines and points of a model, optionally only the ones that are shown.
export function modelObjects(root: Object3D, visibleOnly = false): (Mesh | Line | Points)[] {
  const out: (Mesh | Line | Points)[] = [];
  root.traverse((o) => {
    if (isHelper(o)) return;
    if (!(o instanceof Mesh || o instanceof Line || o instanceof Points)) return;
    if (visibleOnly && !isShown(o, root)) return;
    out.push(o);
  });
  return out;
}

const box = new Box3();

// The bounding box in world coordinates, of the shown objects only by default.
export function modelBox(root: Object3D, visibleOnly = true): Box3 {
  root.updateMatrixWorld(true);
  const result = new Box3();
  for (const o of modelObjects(root, visibleOnly)) {
    if (o instanceof InstancedMesh) {
      o.computeBoundingBox();
      box.copy(o.boundingBox);
    } else {
      const geometry = o.geometry as BufferGeometry;
      if (!geometry.attributes.position) continue;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      box.copy(geometry.boundingBox);
    }
    if (!box.isEmpty()) result.union(box.applyMatrix4(o.matrixWorld));
  }
  return result;
}

export interface ModelStats {
  meshes: number;
  triangles: number;
  vertices: number;
  points: number;
  lines: number;
  box: Box3;
  area: number;
  // Null when there are no triangles.
  volume: number | null;
  // Whether every mesh is closed; null when some meshes were too large to check.
  closed: boolean | null;
}

const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const ab = new Vector3();
const ac = new Vector3();

// Surface area and enclosed volume of a mesh in world coordinates. The volume is the sum of the signed volumes of the
// tetrahedra from the origin to every triangle, which is the volume enclosed by a closed mesh.
function measure(mesh: Mesh): { area: number; volume: number } {
  const geometry = mesh.geometry;
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const count = Math.floor((index ? index.count : pos.count) / 3);
  const vertex = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  let area = 0;
  let volume = 0;
  for (let t = 0; t < count; t += 1) {
    a.fromBufferAttribute(pos, vertex(t, 0)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, vertex(t, 1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, vertex(t, 2)).applyMatrix4(mesh.matrixWorld);
    area += ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2;
    volume += a.dot(ab.crossVectors(b, c)) / 6;
  }
  return { area, volume: Math.abs(volume) };
}

// The statistics of the model as the files have it, without the offsets of the view.
export function modelStats(root: Object3D): ModelStats {
  return withoutOffsets(root, () => computeStats(root));
}

function computeStats(root: Object3D): ModelStats {
  const stats: ModelStats = { meshes: 0, triangles: 0, vertices: 0, points: 0, lines: 0, box: modelBox(root, false), area: 0, volume: null, closed: true };
  for (const o of modelObjects(root)) {
    const geometry = o.geometry as BufferGeometry;
    const pos = geometry.attributes.position;
    if (!pos) continue;
    if (o instanceof Points) {
      stats.points += pos.count;
    } else if (o instanceof Line) {
      stats.lines += Math.floor(pos.count / (o.type === 'LineSegments' ? 2 : 1));
    } else if (o instanceof Mesh) {
      const copies = o instanceof InstancedMesh ? o.count : 1;
      const triangles = Math.floor((geometry.index ? geometry.index.count : pos.count) / 3);
      stats.meshes += copies;
      stats.triangles += triangles * copies;
      stats.vertices += pos.count * copies;
      if (!triangles) continue;
      const { area, volume } = measure(o);
      stats.area += area * copies;
      stats.volume = (stats.volume ?? 0) + volume * copies;
      const topo = topology(geometry);
      if (!topo) stats.closed = stats.closed === false ? false : null;
      else if (!topo.closed) stats.closed = false;
    }
  }
  if (stats.volume === null) stats.closed = null;
  return stats;
}
