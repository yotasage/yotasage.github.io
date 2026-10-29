// Turns the files the user opened into a three.js scene graph. Every format is read with a loader that is imported
// only when it is needed. Files that come with a model (OBJ materials, glTF buffers, textures) are matched by name;
// anything the model refers to that is not among the opened files is never fetched, so nothing leaves the device.
import {
  AnimationClip,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LoadingManager,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Points,
  PointsMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

import { detectFormat, isCompanion, ModelFormat } from './formats';
import { CadFormat, CadMesh, CadNode, CadResult, MeshQuality, readCadFile } from './occt';
import { parseOff } from './off';
import { smoothNormals } from './topology';

// Paths of the decoders in public/3d (see scripts/copy-3d-assets.mjs).
const ASSETS = '/3d/';

export const DEFAULT_COLOR = '#c5ccd6';

export interface LoadedModel {
  // The model. With several model files, one group per file (see fileGroups).
  root: Group;
  // With several model files: the group of each, which the viewer can move apart (see Viewer.setOffsets).
  fileGroups: { file: File; group: Group }[];
  animations: AnimationClip[];
  // The format of each model file, in order.
  formats: ModelFormat[];
  units: string | null;
  zUp: boolean;
  cad: boolean;
  warnings: string[];
  // Names of files the model refers to that were not opened. Textures can still be found missing after loading.
  missing: Set<string>;
  dispose(): void;
}

export interface LoadOptions {
  renderer: WebGLRenderer;
  quality: MeshQuality;
  onStatus: (text: string) => void;
  // Called when a texture or other file the model refers to has loaded (or failed) after the model was returned.
  onResource: () => void;
}

export class LoadError extends Error {}

export function standardMaterial(color: Color | string, vertexColors = false): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, vertexColors, metalness: 0.05, roughness: 0.6, side: DoubleSide });
}

// Maps the names a model refers to onto the files that were opened with it, and blocks everything else.
class Resources {
  private byName = new Map<string, File>();
  private urls = new Map<string, string>();
  missing = new Set<string>();

  constructor(files: File[]) {
    for (const f of files) this.byName.set(f.name.toLowerCase(), f);
  }

  file(name: string): File | undefined {
    return this.byName.get(name.toLowerCase());
  }

  resolve = (url: string): string => {
    if (/^(data|blob):/i.test(url)) return url;
    // The decoders and transcoders in public/3d.
    if (url.startsWith(ASSETS) || url.startsWith(new URL(ASSETS, location.href).href)) return url;
    let name = url.split(/[?#]/)[0];
    try {
      name = decodeURIComponent(name);
    } catch {
      // Keep the name as it is.
    }
    const fileName = name.split(/[\\/]/).pop();
    name = fileName.toLowerCase();
    const file = this.byName.get(name);
    if (!file) {
      this.missing.add(fileName || url);
      return 'data:,';
    }
    if (!this.urls.has(name)) this.urls.set(name, URL.createObjectURL(file));
    return this.urls.get(name);
  };

  dispose() {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

function geometryMesh(geometry: BufferGeometry): Mesh {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const vertexColors = Boolean(geometry.attributes.color);
  return new Mesh(geometry, standardMaterial(vertexColors ? '#ffffff' : DEFAULT_COLOR, vertexColors));
}

export function pointsMaterial(vertexColors: boolean): PointsMaterial {
  return new PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors, color: vertexColors ? '#ffffff' : DEFAULT_COLOR });
}

function geometryPoints(geometry: BufferGeometry): Points {
  return new Points(geometry, pointsMaterial(Boolean(geometry.attributes.color)));
}

// --- CAD files (Open CASCADE) ---

function cadColor(rgb: [number, number, number] | null): Color | null {
  return rgb ? new Color().setRGB(rgb[0], rgb[1], rgb[2], SRGBColorSpace) : null;
}

function cadMesh(m: CadMesh, material: (color: Color | null) => Material): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(m.position, 3));
  if (m.normal) geometry.setAttribute('normal', new BufferAttribute(m.normal, 3));
  geometry.setIndex(new BufferAttribute(m.index, 1));
  if (!m.normal) geometry.computeVertexNormals();
  // The B-rep face of every triangle, so that the edges between faces can be drawn.
  const faceIds = new Uint32Array(m.index.length / 3);
  m.faces.forEach((f, i) => faceIds.fill(i, f.first, f.last + 1));
  geometry.userData.faceIds = faceIds;

  const meshColor = cadColor(m.color);
  let mesh: Mesh;
  if (m.faces.some((f) => f.color)) {
    // Faces with their own colour: one group per run of faces with the same colour.
    const materials: Material[] = [];
    const indexOf = new Map<string, number>();
    let start = 0;
    let key: string | null = null;
    const flush = (end: number) => {
      if (key !== null && end > start) geometry.addGroup(start * 3, (end - start) * 3, indexOf.get(key));
    };
    for (const f of m.faces) {
      const color = cadColor(f.color) ?? meshColor;
      const k = color ? color.getHexString() : 'default';
      if (k !== key) {
        flush(f.first);
        if (!indexOf.has(k)) {
          indexOf.set(k, materials.length);
          materials.push(material(color));
        }
        key = k;
        start = f.first;
      }
    }
    flush(m.index.length / 3);
    mesh = new Mesh(geometry, materials);
  } else {
    mesh = new Mesh(geometry, material(meshColor));
  }
  mesh.name = m.name;
  return mesh;
}

function cadObject(result: CadResult): Object3D {
  // Parts with the same colour share a material.
  const materials = new Map<string, Material>();
  const material = (color: Color | null) => {
    const key = color ? color.getHexString() : 'default';
    if (!materials.has(key)) materials.set(key, standardMaterial(color ?? DEFAULT_COLOR));
    return materials.get(key);
  };
  const node = (n: CadNode): Group => {
    const group = new Group();
    group.name = n.name;
    for (const i of n.meshes) group.add(cadMesh(result.meshes[i], material));
    for (const child of n.children) group.add(node(child));
    return group;
  };
  return node(result.root);
}

// --- Everything else (three.js loaders) ---

interface Loaded {
  object: Object3D;
  animations?: AnimationClip[];
}

async function loadMesh(file: File, format: ModelFormat, manager: LoadingManager, resources: Resources, options: LoadOptions, warnings: string[]): Promise<Loaded> {
  switch (format.id) {
    case 'step':
    case 'iges':
    case 'brep': {
      options.onStatus('Loading the CAD reader (Open CASCADE)…');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await readCadFile(bytes, format.id as CadFormat, options.quality, () => options.onStatus(`Reading ${file.name}…`));
      return { object: cadObject(result) };
    }
    case 'stl': {
      const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
      const geometry = new STLLoader(manager).parse(await file.arrayBuffer());
      smoothNormals(geometry);
      return { object: geometryMesh(geometry) };
    }
    case 'ply': {
      const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
      const geometry = new PLYLoader(manager).parse(await file.arrayBuffer());
      return { object: geometry.index ? geometryMesh(geometry) : geometryPoints(geometry) };
    }
    case 'off':
      return { object: geometryMesh(parseOff(await file.text())) };
    case 'vtk': {
      // three.js deprecated its VTK loader and removes it in r194; this format goes when three.js is updated to that.
      const { VTKLoader } = await import('three/examples/jsm/loaders/VTKLoader.js');
      // The loader reads the first 250 bytes to tell the kinds of VTK file apart, so shorter files get trailing spaces.
      const data = new Uint8Array(Math.max(250, file.size)).fill(32);
      data.set(new Uint8Array(await file.arrayBuffer()));
      const geometry = new VTKLoader(manager).parse(data.buffer, '');
      return { object: geometry.index ? geometryMesh(geometry) : geometryPoints(geometry) };
    }
    case 'xyz': {
      const { XYZLoader } = await import('three/examples/jsm/loaders/XYZLoader.js');
      // The type declarations are out of date: parse returns the geometry.
      const geometry = (new XYZLoader(manager).parse as unknown as (text: string) => BufferGeometry)(await file.text());
      return { object: geometryPoints(geometry) };
    }
    case 'pcd': {
      const { PCDLoader } = await import('three/examples/jsm/loaders/PCDLoader.js');
      const points = new PCDLoader(manager).parse(await file.arrayBuffer());
      return { object: geometryPoints(points.geometry) };
    }
    case '3mf': {
      const { ThreeMFLoader } = await import('three/examples/jsm/loaders/3MFLoader.js');
      return { object: new ThreeMFLoader(manager).parse(await file.arrayBuffer()) };
    }
    case 'amf': {
      const { AMFLoader } = await import('three/examples/jsm/loaders/AMFLoader.js');
      return { object: new AMFLoader(manager).parse(await file.arrayBuffer()) };
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const loader = new OBJLoader(manager);
      const text = await file.text();
      const mtlName = /^\s*mtllib\s+(.+?)\s*$/m.exec(text)?.[1];
      const mtl = (mtlName && resources.file(mtlName.split(/[\\/]/).pop())) || null;
      if (mtl) {
        const { MTLLoader } = await import('three/examples/jsm/loaders/MTLLoader.js');
        const materials = new MTLLoader(manager).parse(await mtl.text(), '');
        materials.preload();
        loader.setMaterials(materials);
      } else if (mtlName) {
        warnings.push(`${file.name} takes its colours and textures from ${mtlName}. Open it together with the OBJ file to see them.`);
      }
      const object = loader.parse(text);
      if (!mtl) {
        // Without materials, OBJLoader gives every mesh a plain white material.
        object.traverse((o) => {
          if (o instanceof Mesh) o.material = standardMaterial(DEFAULT_COLOR, Boolean(o.geometry.attributes.color));
        });
      }
      return { object };
    }
    case 'gltf': {
      const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
        import('three/examples/jsm/loaders/KTX2Loader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      ]);
      const draco = new DRACOLoader(manager).setDecoderPath(`${ASSETS}draco/`);
      const ktx2 = new KTX2Loader(manager).setTranscoderPath(`${ASSETS}basis/`).detectSupport(options.renderer);
      const loader = new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
      try {
        const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
        return { object: gltf.scene, animations: gltf.animations };
      } finally {
        draco.dispose();
        ktx2.dispose();
      }
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const group = new FBXLoader(manager).parse(await file.arrayBuffer(), '');
      return { object: group, animations: group.animations };
    }
    case 'dae': {
      const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
      const collada = new ColladaLoader(manager).parse(await file.text(), '');
      if (!collada) throw new LoadError(`${file.name} is not a valid Collada file.`);
      return { object: collada.scene, animations: collada.scene.animations };
    }
    case 'kmz': {
      const { KMZLoader } = await import('three/examples/jsm/loaders/KMZLoader.js');
      const collada = new KMZLoader(manager).parse(await file.arrayBuffer());
      if (!collada) throw new LoadError(`${file.name} does not contain a Collada model.`);
      return { object: collada.scene, animations: collada.scene.animations };
    }
    case '3ds': {
      const { TDSLoader } = await import('three/examples/jsm/loaders/TDSLoader.js');
      return { object: new TDSLoader(manager).parse(await file.arrayBuffer(), '') };
    }
    case 'usd': {
      const { USDLoader } = await import('three/examples/jsm/loaders/USDLoader.js');
      const group = new USDLoader(manager).parse(await file.arrayBuffer(), '');
      return { object: group, animations: group.animations };
    }
    case 'wrl': {
      const { VRMLLoader } = await import('three/examples/jsm/loaders/VRMLLoader.js');
      const scene = new VRMLLoader(manager).parse(await file.text(), '');
      // The background and fog of the VRML world are left out; the viewer has its own.
      scene.background = null;
      scene.fog = null;
      const group = new Group();
      group.add(...scene.children);
      return { object: group };
    }
    case 'gcode': {
      const { GCodeLoader } = await import('three/examples/jsm/loaders/GCodeLoader.js');
      const object = new GCodeLoader(manager).parse(await file.text());
      // The loader turns the print so that Y is up; it keeps the coordinates of the printer (Z up) here.
      object.rotation.set(0, 0, 0);
      return { object };
    }
    case 'vox': {
      const { VOXLoader, buildMesh } = await import('three/examples/jsm/loaders/VOXLoader.js');
      const result = new VOXLoader(manager).parse(await file.arrayBuffer());
      if (!result) throw new LoadError(`${file.name} is not a valid MagicaVoxel file.`);
      if (result.scene) return { object: result.scene };
      const group = new Group();
      for (const chunk of result.chunks) group.add(buildMesh(chunk));
      return { object: group };
    }
    default:
      throw new LoadError(`${format.name} files cannot be read.`);
  }
}

export async function loadModel(files: File[], options: LoadOptions): Promise<LoadedModel> {
  const resources = new Resources(files);
  const manager = new LoadingManager();
  manager.setURLModifier(resources.resolve);
  manager.onLoad = options.onResource;
  manager.onError = options.onResource;

  const warnings: string[] = [];
  const models: { file: File; format: ModelFormat }[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (isCompanion(file.name)) continue;
    const format = detectFormat(file.name, new Uint8Array(await file.slice(0, 256).arrayBuffer()));
    if (format) models.push({ file, format });
    else skipped.push(file.name);
  }
  if (!models.length) {
    resources.dispose();
    const names = files.map((f) => f.name).join(', ');
    throw new LoadError(files.every((f) => isCompanion(f.name))
      ? `${names}: these files only go with a model. Open them together with the model file (such as .obj or .gltf).`
      : `${names}: the viewer cannot read ${files.length === 1 ? 'this file type' : 'these file types'}.`);
  }
  if (skipped.length) warnings.push(`Not opened, since the viewer cannot read ${skipped.length === 1 ? 'this file type' : 'these file types'}: ${skipped.join(', ')}.`);

  const root = new Group();
  const fileGroups: { file: File; group: Group }[] = [];
  const animations: AnimationClip[] = [];
  try {
    for (const { file, format } of models) {
      options.onStatus(`Reading ${file.name}…`);
      // Lets the status show before a large file blocks the page.
      await new Promise((resolve) => setTimeout(resolve, 0));
      let loaded: Loaded;
      try {
        loaded = await loadMesh(file, format, manager, resources, options, warnings);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        const missing = resources.missing.size ? ` Missing files it refers to: ${[...resources.missing].join(', ')}.` : '';
        throw new LoadError(e instanceof LoadError ? detail : `Could not read ${file.name} as a ${format.name} file: ${detail}${missing}`);
      }
      loaded.object.name = loaded.object.name || file.name;
      if (models.length > 1) {
        // Several models: each keeps its file name as the name of its part, and gets a group that can be moved.
        const group = new Group();
        group.name = file.name;
        group.userData.fileGroup = true;
        group.add(loaded.object);
        root.add(group);
        fileGroups.push({ file, group });
      } else {
        root.add(loaded.object);
      }
      animations.push(...(loaded.animations ?? []));
    }
  } catch (e) {
    resources.dispose();
    throw e;
  }
  root.name = models.length === 1 ? models[0].file.name : `${models.length} files`;

  root.traverse((o) => {
    if (o instanceof Mesh && !o.geometry.attributes.normal && o.geometry.attributes.position) o.geometry.computeVertexNormals();
  });

  const formats = models.map((m) => m.format);
  const units = formats.every((f) => f.units && f.units === formats[0].units) ? formats[0].units : null;
  return {
    root,
    fileGroups,
    animations,
    formats,
    units,
    zUp: formats[0].zUp,
    cad: formats.some((f) => f.cad),
    warnings,
    missing: resources.missing,
    dispose: () => resources.dispose(),
  };
}
