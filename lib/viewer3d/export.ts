// Saves the shown parts of a model as STL, OBJ, PLY or GLB, with the exporters of three.js. Coordinates stay those of
// the file (millimetres for CAD files), so a STEP file can be turned into an STL for a 3D printer. Files that were
// moved apart in the view are saved where the files put them.
import { AnimationClip, Group, Matrix4, Mesh, Object3D } from 'three';

import { isFileGroup, isHelper, modelObjects } from './stats';

export type ExportFormat = 'stl' | 'obj' | 'ply' | 'glb';

export const EXPORT_FORMATS: { id: ExportFormat; label: string; mime: string; help: string }[] = [
  { id: 'stl', label: 'STL', mime: 'model/stl', help: 'Binary STL, for 3D printing. Shape only.' },
  { id: 'obj', label: 'OBJ', mime: 'model/obj', help: 'Shape, lines and points, without materials.' },
  { id: 'ply', label: 'PLY', mime: 'application/octet-stream', help: 'Binary PLY with vertex colours, if the model has them.' },
  { id: 'glb', label: 'GLB', mime: 'model/gltf-binary', help: 'glTF with parts, colours, textures and animations.' },
];

// A copy of the model to save. It shares the geometry and materials of the model, but has every file back at the
// position the file gives it, and leaves out the edge lines and section caps of the view.
async function exportCopy(root: Object3D): Promise<Object3D> {
  // Also gives skinned meshes a copy of their skeleton.
  const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
  const copy = clone(root);
  const helpers: Object3D[] = [];
  copy.traverse((o) => {
    if (isHelper(o)) helpers.push(o);
    else if (isFileGroup(o)) o.position.set(0, 0, 0);
  });
  helpers.forEach((h) => h.removeFromParent());
  copy.updateMatrixWorld(true);
  return copy;
}

// The shown meshes (and for OBJ and PLY, lines and points), placed where they are in the model. They share the
// geometry and materials of the model, so nothing is copied.
function flatten(root: Object3D, withPointsAndLines: boolean): Group {
  root.updateMatrixWorld(true);
  const toRoot = new Matrix4().copy(root.matrixWorld).invert();
  const group = new Group();
  for (const o of modelObjects(root, true)) {
    if (!(o instanceof Mesh) && !withPointsAndLines) continue;
    const copy = o.clone(false);
    copy.matrixAutoUpdate = false;
    copy.matrix.multiplyMatrices(toRoot, o.matrixWorld);
    group.add(copy);
  }
  group.updateMatrixWorld(true);
  return group;
}

export async function exportModel(model: Object3D, format: ExportFormat, animations: AnimationClip[]): Promise<Uint8Array> {
  const root = await exportCopy(model);
  switch (format) {
    case 'stl': {
      const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
      const view = new STLExporter().parse(flatten(root, false), { binary: true });
      return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    }
    case 'obj': {
      const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
      return new TextEncoder().encode(new OBJExporter().parse(flatten(root, true)));
    }
    case 'ply': {
      const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js');
      return new Promise((resolve, reject) => {
        new PLYExporter().parse(flatten(root, true), (result) => {
          if (result instanceof ArrayBuffer) resolve(new Uint8Array(result));
          else if (typeof result === 'string') resolve(new TextEncoder().encode(result));
          else reject(new Error('The model has no meshes or points to save as PLY.'));
        }, { binary: true });
      });
    }
    case 'glb': {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, animations });
      return new Uint8Array(result as ArrayBuffer);
    }
  }
}
