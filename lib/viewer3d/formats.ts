// The file formats the 3D viewer reads, found from the file extension (or, for a few, from the first bytes).

export type FormatId =
  | 'step' | 'iges' | 'brep'
  | 'stl' | '3mf' | 'amf' | 'obj' | 'ply' | 'off' | 'vtk'
  | 'gltf' | 'fbx' | 'dae' | 'kmz' | '3ds' | 'usd' | 'wrl'
  | 'xyz' | 'pcd'
  | 'gcode' | 'vox';

export interface ModelFormat {
  id: FormatId;
  name: string;
  extensions: string[];
  // CAD files are read with Open CASCADE in a worker; the rest with the loaders of three.js.
  cad?: boolean;
  // Most CAD programs, 3D printers and scanners put Z up; glTF, FBX and most animation tools put Y up.
  zUp: boolean;
  // Units the reader converts the file to, if known.
  units?: string;
}

export const FORMATS: ModelFormat[] = [
  { id: 'step', name: 'STEP', extensions: ['step', 'stp', 'p21'], cad: true, zUp: true, units: 'mm' },
  { id: 'iges', name: 'IGES', extensions: ['iges', 'igs'], cad: true, zUp: true, units: 'mm' },
  { id: 'brep', name: 'BREP', extensions: ['brep', 'brp'], cad: true, zUp: true },
  { id: 'stl', name: 'STL', extensions: ['stl'], zUp: true },
  { id: '3mf', name: '3MF', extensions: ['3mf'], zUp: true },
  { id: 'amf', name: 'AMF', extensions: ['amf'], zUp: true },
  { id: 'obj', name: 'OBJ', extensions: ['obj'], zUp: false },
  { id: 'ply', name: 'PLY', extensions: ['ply'], zUp: true },
  { id: 'off', name: 'OFF', extensions: ['off'], zUp: false },
  { id: 'vtk', name: 'VTK', extensions: ['vtk', 'vtp'], zUp: false },
  { id: 'gltf', name: 'glTF', extensions: ['gltf', 'glb'], zUp: false },
  { id: 'fbx', name: 'FBX', extensions: ['fbx'], zUp: false },
  { id: 'dae', name: 'Collada', extensions: ['dae'], zUp: false },
  { id: 'kmz', name: 'KMZ', extensions: ['kmz'], zUp: false },
  { id: '3ds', name: '3DS', extensions: ['3ds'], zUp: true },
  { id: 'usd', name: 'USD', extensions: ['usdz', 'usda', 'usdc', 'usd'], zUp: false },
  { id: 'wrl', name: 'VRML', extensions: ['wrl', 'vrml'], zUp: false },
  { id: 'xyz', name: 'XYZ point cloud', extensions: ['xyz'], zUp: true },
  { id: 'pcd', name: 'PCD point cloud', extensions: ['pcd'], zUp: true },
  { id: 'gcode', name: 'G-code', extensions: ['gcode', 'gco'], zUp: true },
  { id: 'vox', name: 'MagicaVoxel', extensions: ['vox'], zUp: false },
];

// Shown on the start screen, grouped by use.
export const FORMAT_GROUPS: { title: string; formats: string; note?: string }[] = [
  { title: 'CAD', formats: 'STEP (.step, .stp), IGES (.iges, .igs), BREP', note: 'Read with Open CASCADE, in millimetres.' },
  { title: '3D printing and meshes', formats: 'STL, 3MF, AMF, OBJ, PLY, OFF, VTK (.vtk, .vtp)' },
  { title: 'Scenes and animation', formats: 'glTF (.gltf, .glb), FBX, Collada (.dae), KMZ, 3DS, USD (.usdz, .usda, .usdc), VRML (.wrl)' },
  { title: 'Point clouds and more', formats: 'XYZ, PCD, PLY, G-code, MagicaVoxel (.vox)' },
];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

const BY_EXTENSION = new Map(FORMATS.flatMap((f) => f.extensions.map((ext) => [ext, f] as const)));

export function formatById(id: FormatId): ModelFormat {
  return FORMATS.find((f) => f.id === id);
}

function startsWith(bytes: Uint8Array, text: string): boolean {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i += 1) if (bytes[i] !== text.charCodeAt(i)) return false;
  return true;
}

// Finds the format of a file from its extension, or from the start of its data when the extension is unknown.
export function detectFormat(name: string, head: Uint8Array): ModelFormat | null {
  const byExtension = BY_EXTENSION.get(extensionOf(name));
  if (byExtension) return byExtension;
  const text = new TextDecoder().decode(head.subarray(0, 256)).trimStart();
  if (text.startsWith('ISO-10303-21')) return formatById('step');
  if (startsWith(head, 'glTF')) return formatById('gltf');
  if (/^ply\r?\n/.test(text)) return formatById('ply');
  if (/^[CN]?OFF\b/.test(text)) return formatById('off');
  if (text.startsWith('# vtk DataFile')) return formatById('vtk');
  if (startsWith(head, 'VOX ')) return formatById('vox');
  if (text.startsWith('solid ') && /facet\s+normal/.test(text)) return formatById('stl');
  return null;
}

// Files that only accompany a model (materials, buffers, textures). They are matched by name when the model refers to
// them, and are not opened as models of their own.
export function isCompanion(name: string): boolean {
  return /^(mtl|bin|png|jpe?g|gif|webp|bmp|tga|tiff?|dds|ktx2?|basis|hdr|exr|avif)$/.test(extensionOf(name));
}
